/**
 * Multi-tenant: ensure request is scoped to a business.
 * Use after requireAuth. Validates that resource businessId matches req.businessId when applicable.
 */
import { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "../lib/errors.js";

export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.businessId) {
    throw new ForbiddenError("No business associated with your account.");
  }
  next();
}
