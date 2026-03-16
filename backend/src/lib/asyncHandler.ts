import { Request, Response, NextFunction } from "express";

/** Wraps async route handlers so thrown errors are passed to the error handler via next(err). */
export function wrapAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
