import type { Request, Response } from "express";

export const AUTH_COOKIE_NAME = "strata_auth";
const DEFAULT_MAX_AGE_DAYS = 7;

type CookieOptions = {
  maxAgeDays?: number;
  secure?: boolean;
  domain?: string | null;
  sameSite?: "Lax" | "Strict" | "None";
};

function isSecureRequest(req?: Request): boolean {
  if (!req) return process.env.NODE_ENV === "production";
  if (req.secure) return true;
  const forwarded = req.get("x-forwarded-proto")?.toLowerCase();
  if (forwarded === "https") return true;
  return process.env.NODE_ENV === "production";
}

function buildCookieAttributes(options: CookieOptions): string[] {
  const sameSite = options.sameSite ?? "Lax";
  const attrs = ["Path=/", "HttpOnly", `SameSite=${sameSite}`];
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const maxAgeSeconds = Math.max(0, Math.floor(maxAgeDays * 24 * 60 * 60));
  if (maxAgeSeconds > 0) {
    attrs.push(`Max-Age=${maxAgeSeconds}`);
  }
  if (options.domain) {
    attrs.push(`Domain=${options.domain}`);
  }
  if (options.secure) {
    attrs.push("Secure");
  }
  return attrs;
}

function resolveSameSite(req?: Request): "Lax" | "Strict" | "None" {
  const configured = process.env.AUTH_COOKIE_SAMESITE?.trim().toLowerCase();
  if (configured === "none") return "None";
  if (configured === "strict") return "Strict";
  if (configured === "lax") return "Lax";
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (!req) return frontendUrl ? "None" : "Lax";
  const origin = req.get("origin");
  const referer = req.get("referer");
  const host = req.get("host");
  if (!host) return frontendUrl ? "None" : "Lax";
  try {
    const frontendHost = frontendUrl ? new URL(frontendUrl).host : null;
    if (frontendHost && frontendHost !== host) return "None";
    if (!origin && referer) {
      const refererHost = new URL(referer).host;
      return refererHost && refererHost !== host ? "None" : "Lax";
    }
    if (!origin) return "Lax";
    const originHost = new URL(origin).host;
    return originHost && originHost !== host ? "None" : "Lax";
  } catch {
    return "Lax";
  }
}

export function buildAuthCookie(value: string, options: CookieOptions = {}): string {
  const attrs = buildCookieAttributes(options);
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}; ${attrs.join("; ")}`;
}

export function buildClearedAuthCookie(options: CookieOptions = {}): string {
  const attrs = buildCookieAttributes({ ...options, maxAgeDays: 0 });
  return `${AUTH_COOKIE_NAME}=; ${attrs.join("; ")}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function setAuthCookie(res: Response, token: string, req?: Request) {
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || null;
  let secure = isSecureRequest(req);
  let sameSite = resolveSameSite(req);
  if (sameSite === "None" && !secure) {
    sameSite = "Lax";
  } else if (sameSite === "None") {
    secure = true;
  }
  const cookie = buildAuthCookie(token, { secure, domain, sameSite });
  res.setHeader("Set-Cookie", cookie);
}

export function clearAuthCookie(res: Response, req?: Request) {
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || null;
  let secure = isSecureRequest(req);
  let sameSite = resolveSameSite(req);
  if (sameSite === "None" && !secure) {
    sameSite = "Lax";
  } else if (sameSite === "None") {
    secure = true;
  }
  const cookie = buildClearedAuthCookie({ secure, domain, sameSite });
  res.setHeader("Set-Cookie", cookie);
}

export function getAuthTokenFromCookieHeader(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!match) return null;
  const [, value] = match.split("=");
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
