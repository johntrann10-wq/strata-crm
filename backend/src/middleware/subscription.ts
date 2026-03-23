/**
 * Require an active or trialing subscription for the current business.
 * Run after optionalAuth. If no businessId, allow (onboarding). If business exists and subscription invalid, 402.
 */
import { Request, Response, NextFunction } from "express";

/**
 * Subscription middleware is currently a no-op so the app is fully usable
 * without billing. Even if older code still wires requireSubscription into
 * routes, this implementation will never block requests.
 */
export async function requireSubscription(
  _req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  next();
}
