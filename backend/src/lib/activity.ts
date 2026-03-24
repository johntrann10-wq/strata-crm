import type { Request } from "express";
import { db } from "../db/index.js";
import { activityLogs } from "../db/schema.js";

type ActivityInput = {
  businessId: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
};

export async function createActivityLog(input: ActivityInput) {
  await db.insert(activityLogs).values({
    businessId: input.businessId,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    userId: input.userId ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
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
