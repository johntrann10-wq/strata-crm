import type { NextFunction, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { createHash } from "crypto";
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
  id?: string;
  windowMs: number;
  max: number;
  key?: (parts: RateLimitKeyParts) => string;
  message?: string;
  store?: "memory" | "database";
  prefix?: string;
};

export function coerceRateLimitResetAtMs(value: unknown, fallbackMs: number): number {
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : fallbackMs;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : fallbackMs;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallbackMs;
  }
  return fallbackMs;
}

function normalizeIp(req: Request): string {
  const rawIp = req.ip || req.socket.remoteAddress || "unknown";
  return rawIp.replace(/^::ffff:/, "").trim() || "unknown";
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

function sanitizeRateLimitId(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return normalized || null;
}

function readRateLimitNumberEnv(key: string): number | null {
  const raw = process.env[key]?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function resolveRateLimitStore(options?: RateLimiterOptions): "memory" | "database" {
  const id = sanitizeRateLimitId(options?.id);
  const configured =
    (id ? process.env[`RATE_LIMIT_${id}_STORE`]?.trim().toLowerCase() : undefined) ??
    options?.store ??
    process.env.RATE_LIMIT_STORE?.trim().toLowerCase();
  if (configured === "memory") return "memory";
  if (configured === "database") return "database";
  return process.env.NODE_ENV === "production" ? "database" : "memory";
}

function resolveRateLimiterOptions(options: RateLimiterOptions): RateLimiterOptions {
  const id = sanitizeRateLimitId(options.id);
  const envMax = id ? readRateLimitNumberEnv(`RATE_LIMIT_${id}_MAX`) : null;
  const envWindowMs = id ? readRateLimitNumberEnv(`RATE_LIMIT_${id}_WINDOW_MS`) : null;
  return {
    ...options,
    max: envMax ?? options.max,
    windowMs: envWindowMs ?? options.windowMs,
  };
}

function buildRateLimitKey(options: RateLimiterOptions, parts: RateLimitKeyParts): string {
  const baseKey =
    options.key?.(parts) ?? `${parts.method}:${parts.path}:${parts.ip}`;
  const prefix = options.prefix?.trim() || "rate";
  return `${prefix}:${baseKey}`;
}

function hashForLogging(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function buildRateLimitResponse(options: RateLimiterOptions, retryAfterSeconds: number) {
  return {
    code: "RATE_LIMITED",
    message: options.message ?? "Too many requests. Please try again shortly.",
    retryAfterSeconds,
  };
}

function setRateLimitHeaders(res: Response, params: { limit: number; remaining: number; resetAt: number; retryAfterSeconds?: number }) {
  res.setHeader("X-RateLimit-Limit", String(params.limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, params.remaining)));
  res.setHeader("X-RateLimit-Reset", String(Math.max(0, Math.ceil(params.resetAt / 1000))));
  if (params.retryAfterSeconds != null) {
    res.setHeader("Retry-After", String(Math.max(1, params.retryAfterSeconds)));
  }
}

function logRateLimitEvent(req: Request, options: RateLimiterOptions, key: string, retryAfterSeconds: number) {
  logger.warn("Rate limit exceeded", {
    limiterId: options.id ?? options.prefix ?? "rate",
    method: req.method,
    path: req.path,
    retryAfterSeconds,
    keyHash: hashForLogging(key),
    ipHash: hashForLogging(normalizeIp(req)),
    userId: req.userId ?? undefined,
    businessId: req.businessId ?? undefined,
  });
}

async function consumeDatabaseRateLimit(params: {
  key: string;
  windowMs: number;
}): Promise<{ count: number; resetAtMs: number }> {
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
  const row = (result as { rows?: Array<{ count?: number | string; reset_at?: unknown }> }).rows?.[0];
  const fallbackMs = resetAt.getTime();
  return {
    count: Number(row?.count ?? 1),
    resetAtMs: coerceRateLimitResetAtMs(row?.reset_at, fallbackMs),
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
  const resolvedOptions = resolveRateLimiterOptions(options);
  const entries = new Map<string, RateLimitEntry>();

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const ip = normalizeIp(req);
    const key = buildRateLimitKey(resolvedOptions, {
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
      entries.set(key, { count: 1, resetAt: now + resolvedOptions.windowMs });
      setRateLimitHeaders(res, {
        limit: resolvedOptions.max,
        remaining: resolvedOptions.max - 1,
        resetAt: now + resolvedOptions.windowMs,
      });
      next();
      return;
    }

    if (existing.count >= resolvedOptions.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      setRateLimitHeaders(res, {
        limit: resolvedOptions.max,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfterSeconds,
      });
      logRateLimitEvent(req, resolvedOptions, key, retryAfterSeconds);
      res.status(429).json(buildRateLimitResponse(resolvedOptions, retryAfterSeconds));
      return;
    }

    existing.count += 1;
    setRateLimitHeaders(res, {
      limit: resolvedOptions.max,
      remaining: resolvedOptions.max - existing.count,
      resetAt: existing.resetAt,
    });
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
  const resolvedOptions = resolveRateLimiterOptions(options);
  const store = resolveRateLimitStore(resolvedOptions);
  const memoryLimiter = createInMemoryRateLimiter(resolvedOptions);

  async function middleware(req: Request, res: Response, next: NextFunction) {
    if (store === "memory") {
      memoryLimiter.middleware(req, res, next);
      return;
    }

    const ip = normalizeIp(req);
    const key = buildRateLimitKey(resolvedOptions, {
      ip,
      path: req.path,
      method: req.method,
      body: req.body,
      userId: req.userId,
      businessId: req.businessId,
    });

    try {
      const { count, resetAtMs } = await consumeDatabaseRateLimit({
        key,
        windowMs: resolvedOptions.windowMs,
      });
      if (count > resolvedOptions.max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000));
        setRateLimitHeaders(res, {
          limit: resolvedOptions.max,
          remaining: 0,
          resetAt: resetAtMs,
          retryAfterSeconds,
        });
        logRateLimitEvent(req, resolvedOptions, key, retryAfterSeconds);
        res.status(429).json(buildRateLimitResponse(resolvedOptions, retryAfterSeconds));
        return;
      }
      setRateLimitHeaders(res, {
        limit: resolvedOptions.max,
        remaining: resolvedOptions.max - count,
        resetAt: resetAtMs,
      });
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
