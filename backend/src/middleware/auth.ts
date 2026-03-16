/**
 * Session-based auth. Requires express-session and session store to be configured.
 * Sets req.userId and optionally req.businessId (first business owned by user).
 */
import { Request, Response, NextFunction } from "express";
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

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = (req.session as { userId?: string } | undefined)?.userId;

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

/** Optional auth: set req.userId/businessId if session exists, but do not require. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = (req.session as { userId?: string } | undefined)?.userId;
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
