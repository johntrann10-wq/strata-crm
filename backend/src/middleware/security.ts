import type { NextFunction, Request, Response } from "express";

type RateLimitKeyParts = {
  ip: string;
  path: string;
  method: string;
  body: unknown;
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
};

function normalizeIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.ip || req.socket.remoteAddress || "unknown";
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
  const buildKey =
    options.key ??
    ((parts: RateLimitKeyParts) => `${parts.method}:${parts.path}:${parts.ip}`);

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const ip = normalizeIp(req);
    const key = buildKey({
      ip,
      path: req.path,
      method: req.method,
      body: req.body,
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
