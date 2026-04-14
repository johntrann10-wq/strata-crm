import type { NextFunction, Request, Response } from "express";

/** Strip trailing slashes so origins match reliably (no wildcards). */
export function normalizeOrigin(raw: string | undefined): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  return s.replace(/\/+$/, "");
}

function hostnameOf(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isTrustedFrontendOrigin(origin: string, allowedOrigins: Set<string>): boolean {
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;

  const hostname = hostnameOf(origin);
  if (!hostname) return false;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }

  if (hostname === "stratacrm.app" || hostname === "www.stratacrm.app") {
    return true;
  }

  if (hostname.endsWith(".vercel.app")) {
    return true;
  }

  return false;
}

/**
 * Exact origins allowed for CORS (Vercel → Railway, local dev, optional extras).
 * - Always includes `FRONTEND_URL` (canonical URL for OAuth/Stripe redirects).
 * - Optional comma-separated `FRONTEND_ALLOWED_ORIGINS` for extra exact origins
 *   (e.g. `http://localhost:5173` when calling a deployed API from local Vite,
 *   or additional Vercel preview URLs — each must match `Origin` exactly).
 * - In non-production, also includes `FRONTEND_DEV_URL` or `http://localhost:5173`.
 *
 * If the browser shows CORS errors, set `FRONTEND_URL` (and `FRONTEND_ALLOWED_ORIGINS` as needed)
 * on Railway to the exact origin(s) the SPA uses (scheme + host + port, no path).
 */
export function buildCorsAllowedOrigins(): Set<string> {
  const set = new Set<string>();
  const add = (raw: string | undefined) => {
    const n = normalizeOrigin(raw);
    if (n) set.add(n);
  };

  add(process.env.FRONTEND_URL);
  const extra = process.env.FRONTEND_ALLOWED_ORIGINS?.trim();
  if (extra) {
    for (const part of extra.split(",")) add(part);
  }
  if (process.env.NODE_ENV !== "production") {
    add(process.env.FRONTEND_DEV_URL ?? "http://localhost:5173");
  }
  return set;
}

/**
 * Echoes the request `Origin` when it is in the allowlist (never `*`).
 * Handles OPTIONS preflight; includes tenant and auth headers used by the SPA.
 */
export function corsMiddleware(allowedOrigins: Set<string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestOrigin = normalizeOrigin(req.headers.origin as string | undefined);
    const isAllowed = Boolean(requestOrigin && isTrustedFrontendOrigin(requestOrigin, allowedOrigins));

    if (isAllowed && requestOrigin) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, x-business-id, x-cron-secret"
      );
      res.setHeader("Access-Control-Max-Age", "86400");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}
