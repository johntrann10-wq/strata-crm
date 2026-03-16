/**
 * Typed API errors. Never expose stack or internal details in production responses.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(message, 400, "BAD_REQUEST");
    this.name = "BadRequestError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class SubscriptionRequiredError extends AppError {
  constructor(message = "Active subscription required") {
    super(message, 402, "SUBSCRIPTION_REQUIRED");
    this.name = "SubscriptionRequiredError";
  }
}

/** Safe shape for API error responses */
export function toApiError(err: unknown): { message: string; code?: string } {
  if (err instanceof AppError) {
    return { message: err.message, code: err.code };
  }
  if (err instanceof Error) {
    return { message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message };
  }
  return { message: "Internal server error" };
}
