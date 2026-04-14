import { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { resolveTenantContext } from "../lib/tenantContext.js";
import type { MembershipRole, PermissionKey } from "../lib/permissions.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { getAuthTokenFromCookieHeader } from "../lib/authCookies.js";
import { isAuthTokenVersionMismatch, loadAuthTokenVersion } from "../lib/authTokenVersion.js";
export interface SessionUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      businessId?: string;
      membershipRole?: MembershipRole;
      permissions?: PermissionKey[];
      user?: SessionUser;
    }
  }
}
function getUserIdFromRequest(req: Request): { userId: string; tokenVersion?: number } | null {
  // Protected API auth is JWT-only. Invalid or missing bearer tokens
  // should fail closed instead of falling back to a different session source.
  const authHeader = req.headers.authorization ?? "";
  const bearerPrefix = "Bearer ";
  let rawToken = authHeader.startsWith(bearerPrefix) ? authHeader.slice(bearerPrefix.length).trim() : "";
  if (!rawToken) {
    rawToken = getAuthTokenFromCookieHeader(req.headers.cookie) ?? "";
  }
  if (!rawToken) return null;
  const payload = verifyAccessToken(rawToken);
  if (!payload?.userId) return null;
  return { userId: payload.userId, tokenVersion: payload.ver };
}
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const auth = getUserIdFromRequest(req);
  if (!auth?.userId) {
    logger.warn("Unauthorized request", {
      path: req.path,
      requestId: (req as Request & { requestId?: string }).requestId,
    });
    next(new UnauthorizedError("You must be signed in."));
    return;
  }
  const currentVersion = await loadAuthTokenVersion(auth.userId);
  if (isAuthTokenVersionMismatch(auth.tokenVersion, currentVersion)) {
    logger.warn("Rejected token with mismatched version", {
      userId: auth.userId,
      requestId: (req as Request & { requestId?: string }).requestId,
    });
    next(new UnauthorizedError("You must be signed in."));
    return;
  }
  req.userId = auth.userId;
  const preferredBusinessId = typeof req.headers["x-business-id"] === "string" ? req.headers["x-business-id"] : null;
  const tenantContext = await resolveTenantContext(auth.userId, preferredBusinessId);
  if (tenantContext) {
    req.businessId = tenantContext.businessId;
    req.membershipRole = tenantContext.role;
    req.permissions = tenantContext.permissions;
  }
  next();
}
/** Optional auth: set req.userId/businessId if a bearer token exists, but do not require. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const auth = getUserIdFromRequest(req);
  if (!auth?.userId) {
    next();
    return;
  }
  const currentVersion = await loadAuthTokenVersion(auth.userId);
  if (isAuthTokenVersionMismatch(auth.tokenVersion, currentVersion)) {
    next();
    return;
  }
  req.userId = auth.userId;
  const preferredBusinessId = typeof req.headers["x-business-id"] === "string" ? req.headers["x-business-id"] : null;
  const tenantContext = await resolveTenantContext(auth.userId, preferredBusinessId);
  if (tenantContext) {
    req.businessId = tenantContext.businessId;
    req.membershipRole = tenantContext.role;
    req.permissions = tenantContext.permissions;
  }
  next();
}
