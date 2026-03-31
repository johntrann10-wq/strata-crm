import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { resolveTenantContext } from "../lib/tenantContext.js";
import type { MembershipRole } from "../lib/permissions.js";
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
      user?: SessionUser;
    }
  }
}
function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim() !== "") return secret;
  throw new Error("JWT_SECRET is required");
}
function getUserIdFromRequest(req: Request): string | null {
  // Protected API auth is JWT-only. Invalid or missing bearer tokens
  // should fail closed instead of falling back to a different session source.
  const authHeader = req.headers.authorization ?? "";
  const bearerPrefix = "Bearer ";
  if (!authHeader.startsWith(bearerPrefix)) return null;
  const rawToken = authHeader.slice(bearerPrefix.length).trim();
  if (!rawToken) return null;
  try {
    const payload = jwt.verify(rawToken, requireJwtSecret()) as { userId?: string };
    return payload.userId ?? null;
  } catch {
    return null;
  }
}
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    logger.warn("Unauthorized request", {
      path: req.path,
      requestId: (req as Request & { requestId?: string }).requestId,
    });
    next(new UnauthorizedError("You must be signed in."));
    return;
  }
  req.userId = userId;
  const preferredBusinessId = typeof req.headers["x-business-id"] === "string" ? req.headers["x-business-id"] : null;
  const tenantContext = await resolveTenantContext(userId, preferredBusinessId);
  if (tenantContext) {
    req.businessId = tenantContext.businessId;
    req.membershipRole = tenantContext.role;
  }
  next();
}
/** Optional auth: set req.userId/businessId if a bearer token exists, but do not require. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    next();
    return;
  }
  req.userId = userId;
  const preferredBusinessId = typeof req.headers["x-business-id"] === "string" ? req.headers["x-business-id"] : null;
  const tenantContext = await resolveTenantContext(userId, preferredBusinessId);
  if (tenantContext) {
    req.businessId = tenantContext.businessId;
    req.membershipRole = tenantContext.role;
  }
  next();
}
