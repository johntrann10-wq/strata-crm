/**
 * Idempotency for payments and other critical operations.
 * Store idempotency keys in DB and reject duplicates.
 */
import { db } from "../db/index.js";
import { idempotencyKeys } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { ConflictError } from "./errors.js";
import { logger } from "./logger.js";

function isIdempotencyConflictError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: unknown; message?: unknown; constraint?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown; constraint?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const constraint = String(cause.constraint ?? "").toLowerCase();
  const message = String(cause.message ?? "").toLowerCase();
  return code === "23505" && (constraint.includes("idempotency") || message.includes("idempotency"));
}

export async function withIdempotency<T>(
  key: string,
  scope: { businessId: string; operation: string },
  fn: () => Promise<T>
): Promise<T> {
  try {
    await db.insert(idempotencyKeys).values({
      idempotencyKey: key,
      businessId: scope.businessId,
      operation: scope.operation,
    });
  } catch (error) {
    if (!isIdempotencyConflictError(error)) throw error;
    logger.warn("Duplicate idempotency key rejected", {
      key,
      businessId: scope.businessId,
      operation: scope.operation,
    });
    throw new ConflictError(
      "Duplicate request; this operation is already being processed or has already been applied."
    );
  }

  try {
    return await fn();
  } catch (error) {
    try {
      await db
        .delete(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.idempotencyKey, key),
            eq(idempotencyKeys.businessId, scope.businessId),
            eq(idempotencyKeys.operation, scope.operation)
          )
        );
    } catch (cleanupError) {
      logger.error("Failed to clean up idempotency key after operation failure", {
        key,
        businessId: scope.businessId,
        operation: scope.operation,
        error: cleanupError,
      });
    }
    throw error;
  }
}
