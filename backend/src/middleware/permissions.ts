import type { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "../lib/errors.js";
import type { PermissionKey } from "../lib/permissions.js";
import { logger } from "../lib/logger.js";

export function requirePermission(permission: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.membershipRole || !req.businessId) {
      throw new ForbiddenError("No tenant role is associated with this request.");
    }
    if (!Array.isArray(req.permissions)) {
      logger.error("Permission resolution missing for tenant-scoped request", {
        businessId: req.businessId,
        userId: req.userId ?? undefined,
        permission,
        path: req.path,
      });
      throw new ForbiddenError("You do not have permission to perform this action.");
    }
    if (!req.permissions.includes(permission)) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }
    next();
  };
}
