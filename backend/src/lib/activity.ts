import type { Request } from "express";
import { db } from "../db/index.js";
import { activityLogs } from "../db/schema.js";
import { logger } from "./logger.js";

type ActivityInput = {
  businessId: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
};

function isActivitySchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

export async function createActivityLog(input: ActivityInput) {
  try {
    await db.insert(activityLogs).values({
      businessId: input.businessId,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      userId: input.userId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
  } catch (error) {
    if (!isActivitySchemaDriftError(error)) throw error;
    logger.warn("Activity log schema unavailable; skipping activity persistence", {
      businessId: input.businessId,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createRequestActivityLog(
  req: Request,
  input: Omit<ActivityInput, "userId">
) {
  const userId = (req as Request & { user?: { id?: string | null } }).user?.id ?? null;
  await createActivityLog({
    ...input,
    userId,
  });
}
