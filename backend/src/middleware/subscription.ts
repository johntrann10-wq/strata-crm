/**
 * Require an active or trialing subscription for the current business.
 * Run after optionalAuth. If no businessId, allow (onboarding). If business exists and subscription invalid, 402.
 */
import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { businesses } from "../db/schema.js";
import { SubscriptionRequiredError } from "../lib/errors.js";
import { isStripeConfigured } from "../lib/env.js";
import { logger } from "../lib/logger.js";

function isSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

function isBillingEnforced(): boolean {
  return process.env.BILLING_ENFORCED === "true" && isStripeConfigured();
}

function isAllowedSubscriptionStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

export async function requireSubscription(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (!isBillingEnforced()) {
    next();
    return;
  }

  if (!req.businessId) {
    next();
    return;
  }

  try {
    const [business] = await db
      .select({
        subscriptionStatus: businesses.subscriptionStatus,
      })
      .from(businesses)
      .where(eq(businesses.id, req.businessId))
      .limit(1);

    if (!business) {
      next();
      return;
    }

    if (isAllowedSubscriptionStatus(business.subscriptionStatus)) {
      next();
      return;
    }

    next(new SubscriptionRequiredError("An active subscription is required to use this workspace."));
  } catch (error) {
    if (!isSchemaDriftError(error)) {
      next(error);
      return;
    }

    logger.warn("Subscription enforcement skipped because billing columns are unavailable", {
      businessId: req.businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    next();
  }
}
