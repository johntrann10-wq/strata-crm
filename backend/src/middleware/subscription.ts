/**
 * Require an active or trialing subscription for the current business.
 * Run after optionalAuth. If no businessId, allow (onboarding). If business exists and subscription invalid, 402.
 */
import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { businesses } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { SubscriptionRequiredError } from "../lib/errors.js";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function requireSubscription(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.businessId) {
    next();
    return;
  }
  const [b] = await db
    .select({
      subscriptionStatus: businesses.subscriptionStatus,
      trialEndsAt: businesses.trialEndsAt,
      currentPeriodEnd: businesses.currentPeriodEnd,
    })
    .from(businesses)
    .where(eq(businesses.id, req.businessId))
    .limit(1);
  if (!b) {
    next();
    return;
  }
  const status = b.subscriptionStatus ?? null;
  if (status && ACTIVE_STATUSES.has(status)) {
    next();
    return;
  }
  if (status === "trialing" && b.trialEndsAt) {
    if (new Date(b.trialEndsAt) > new Date()) {
      next();
      return;
    }
  }
  next(new SubscriptionRequiredError("Please subscribe to continue using Strata."));
}
