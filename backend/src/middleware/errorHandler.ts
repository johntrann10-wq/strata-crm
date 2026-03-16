import { Request, Response, NextFunction } from "express";
import { AppError, toApiError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (_req as Request & { requestId?: string }).requestId;
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const body = toApiError(err);

  logger.error(err instanceof Error ? err.message : "Unhandled error", {
    requestId,
    statusCode,
    error: err instanceof Error ? err.message : String(err),
  });
  if (err instanceof Error && statusCode === 500) {
    logger.error(err.stack ?? err.message, { requestId });
  }

  res.status(statusCode).json({ message: body.message, code: body.code });
}
