import type { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "../lib/errors.js";
import type { PermissionKey } from "../lib/permissions.js";
import { roleHasPermission } from "../lib/permissions.js";

export function requirePermission(permission: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.membershipRole) {
      throw new ForbiddenError("No tenant role is associated with this request.");
    }
    const hasPermission = req.permissions ? req.permissions.includes(permission) : roleHasPermission(req.membershipRole, permission);
    if (!hasPermission) {
      throw new ForbiddenError("You do not have permission to perform this action.");
    }
    next();
  };
}
