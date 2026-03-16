import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { businesses } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { UnauthorizedError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
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
      user?: SessionUser;
    }
  }
}
function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}
function getUserIdFromRequest(req: Request): string | null {
  // Prefer JWT in Authorization header
  const auth = req.headers.authorization ?? "";
  const [, rawToken] = auth.split(" ");
  if (rawToken) {
    try {
      const payload = jwt.verify(rawToken, requireJwtSecret()) as { userId?: string };
      if (payload.userId) return payload.userId;
    } catch {
      // ignore and fall back to session
    }
  }
  // Fallback to legacy session-based auth (if still used anywhere)
  const sessionUserId = (req.session as { userId?: string } | undefined)?.userId;
  return sessionUserId ?? null;
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
  const [business] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.ownerId, userId))
    .limit(1);
  if (business) req.businessId = business.id;
  next();
}
/** Optional auth: set req.userId/businessId if token/session exists, but do not require. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    next();
    return;
  }
  req.userId = userId;
  const [business] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.ownerId, userId))
    .limit(1);
  if (business) req.businessId = business.id;
  next();
}
