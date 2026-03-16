/**
 * Idempotency for payments and other critical operations.
 * Store idempotency keys in DB and reject duplicates.
 */
import { db } from "../db/index.js";
import { idempotencyKeys } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { ConflictError } from "./errors.js";
import { logger } from "./logger.js";

export async function withIdempotency<T>(
  key: string,
  scope: { businessId: string; operation: string },
  fn: () => Promise<T>
): Promise<T> {
  const existing = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.idempotencyKey, key),
        eq(idempotencyKeys.businessId, scope.businessId),
        eq(idempotencyKeys.operation, scope.operation)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    logger.warn("Duplicate idempotency key rejected", {
      key,
      businessId: scope.businessId,
      operation: scope.operation,
    });
    throw new ConflictError("Duplicate request; operation already applied.");
  }

  const result = await fn();

  await db.insert(idempotencyKeys).values({
    idempotencyKey: key,
    businessId: scope.businessId,
    operation: scope.operation,
  });

  return result;
}
