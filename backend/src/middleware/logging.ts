import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";

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
  });
  next();
}
