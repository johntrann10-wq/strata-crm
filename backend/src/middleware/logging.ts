import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";

function isPublicDocumentRoute(path: string): boolean {
  return (
    /^\/api\/portal\/[^/]+$/i.test(path) ||
    /^\/api\/businesses\/[^/]+\/public-booking-requests\/[^/]+(?:\/respond)?$/i.test(path) ||
    /^\/api\/(?:quotes|invoices|appointments)\/[^/]+\/(?:public-html|public-pay|public-respond|public-request-revision|public-request-change)$/i.test(
      path
    )
  );
}

function isProtectedCrudRoute(path: string): boolean {
  return /^\/api\/(?:clients|vehicles|appointments|quotes|invoices|payments)(?:\/|$)/i.test(path);
}

function logLaunchSignals(req: Request, res: Response, requestId: string | undefined): void {
  const path = req.path;
  const status = res.statusCode;
  const baseContext = {
    requestId,
    method: req.method,
    path,
    status,
    userId: (req as Request & { userId?: string }).userId,
    businessId: (req as Request & { businessId?: string }).businessId,
  };

  if (isPublicDocumentRoute(path) && status >= 400 && status <= 404) {
    logger.warn("Launch monitor: public document client error", baseContext);
    return;
  }

  if (isProtectedCrudRoute(path) && (status === 401 || status === 403)) {
    logger.warn("Launch monitor: protected CRUD denied", baseContext);
  }
}

export function requestId(req: Request, _res: Response, next: NextFunction): void {
  (req as Request & { requestId: string }).requestId = req.headers["x-request-id"] as string ?? randomUUID();
  next();
}

export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = (req as Request & { requestId?: string }).requestId;

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("request", {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
      userId: (req as Request & { userId?: string }).userId,
      businessId: (req as Request & { businessId?: string }).businessId,
    });
    logLaunchSignals(req, res, requestId);
  });
  next();
}
