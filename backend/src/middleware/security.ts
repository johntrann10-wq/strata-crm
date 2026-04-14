import type { NextFunction, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { logger } from "../lib/logger.js";
import { warnOnce } from "../lib/warnOnce.js";

type RateLimitKeyParts = {
  ip: string;
  path: string;
  method: string;
  body: unknown;
  userId?: string | undefined;
  businessId?: string | undefined;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimiterOptions = {
  windowMs: number;
  max: number;
  key?: (parts: RateLimitKeyParts) => string;
  message?: string;
  store?: "memory" | "database";
  prefix?: string;
};

function normalizeIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function isRateLimitSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("rate_limits");
}

function resolveRateLimitStore(options?: RateLimiterOptions): "memory" | "database" {
  const configured = options?.store ?? process.env.RATE_LIMIT_STORE?.trim().toLowerCase();
  if (configured === "memory") return "memory";
  if (configured === "database") return "database";
  return process.env.NODE_ENV === "production" ? "database" : "memory";
}

function buildRateLimitKey(options: RateLimiterOptions, parts: RateLimitKeyParts): string {
  const baseKey =
    options.key?.(parts) ?? `${parts.method}:${parts.path}:${parts.ip}`;
  const prefix = options.prefix?.trim() || "rate";
  return `${prefix}:${baseKey}`;
}

async function consumeDatabaseRateLimit(params: {
  key: string;
  windowMs: number;
}): Promise<{ count: number; resetAt: Date }> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + params.windowMs);
  const result = await db.execute(sql`
    INSERT INTO rate_limits ("key", "count", "reset_at", "created_at", "updated_at")
    VALUES (${params.key}, 1, ${resetAt}, ${now}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
      "reset_at" = CASE WHEN rate_limits.reset_at <= now() THEN ${resetAt} ELSE rate_limits.reset_at END,
      "updated_at" = ${now}
    RETURNING "count", "reset_at";
  `);
  const row = (result as { rows?: Array<{ count?: number | string; reset_at?: Date }> }).rows?.[0];
  return {
    count: Number(row?.count ?? 1),
    resetAt: row?.reset_at ?? resetAt,
  };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");

  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
}

export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}

export function createInMemoryRateLimiter(options: RateLimiterOptions) {
  const entries = new Map<string, RateLimitEntry>();

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const ip = normalizeIp(req);
    const key = buildRateLimitKey(options, {
      ip,
      path: req.path,
      method: req.method,
      body: req.body,
      userId: req.userId,
      businessId: req.businessId,
    });

    for (const [entryKey, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(entryKey);
    }

    const existing = entries.get(key);
    if (!existing || existing.resetAt <= now) {
      entries.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        message: options.message ?? "Too many requests. Please try again shortly.",
      });
      return;
    }

    existing.count += 1;
    next();
  }

  return {
    middleware,
    reset() {
      entries.clear();
    },
  };
}

export function createRateLimiter(options: RateLimiterOptions) {
  const store = resolveRateLimitStore(options);
  const memoryLimiter = createInMemoryRateLimiter(options);

  async function middleware(req: Request, res: Response, next: NextFunction) {
    if (store === "memory") {
      memoryLimiter.middleware(req, res, next);
      return;
    }

    const ip = normalizeIp(req);
    const key = buildRateLimitKey(options, {
      ip,
      path: req.path,
      method: req.method,
      body: req.body,
      userId: req.userId,
      businessId: req.businessId,
    });

    try {
      const { count, resetAt } = await consumeDatabaseRateLimit({
        key,
        windowMs: options.windowMs,
      });
      if (count > options.max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.status(429).json({
          message: options.message ?? "Too many requests. Please try again shortly.",
        });
        return;
      }
      next();
    } catch (error) {
      if (isRateLimitSchemaError(error)) {
        warnOnce(
          "rate-limit:schema",
          "rate_limits table unavailable; falling back to in-memory limiter",
          { error: error instanceof Error ? error.message : String(error) }
        );
        memoryLimiter.middleware(req, res, next);
        return;
      }
      logger.error("Rate limiter failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error as Error);
    }
  }

  return {
    middleware,
    reset: () => memoryLimiter.reset(),
  };
}
