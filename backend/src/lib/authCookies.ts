import type { Request, Response } from "express";

export const AUTH_COOKIE_NAME = "strata_auth";
const DEFAULT_MAX_AGE_DAYS = 7;

type CookieOptions = {
  maxAgeDays?: number;
  secure?: boolean;
  domain?: string | null;
};

function isSecureRequest(req?: Request): boolean {
  if (!req) return process.env.NODE_ENV === "production";
  if (req.secure) return true;
  const forwarded = req.get("x-forwarded-proto")?.toLowerCase();
  if (forwarded === "https") return true;
  return process.env.NODE_ENV === "production";
}

function buildCookieAttributes(options: CookieOptions): string[] {
  const attrs = ["Path=/", "HttpOnly", "SameSite=Lax"];
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
  const cookie = buildAuthCookie(token, { secure: isSecureRequest(req), domain });
  res.setHeader("Set-Cookie", cookie);
}

export function clearAuthCookie(res: Response, req?: Request) {
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || null;
  const cookie = buildClearedAuthCookie({ secure: isSecureRequest(req), domain });
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

