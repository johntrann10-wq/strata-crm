import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { activityLogs } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const activityLogsRouter = Router();

function businessId(req: Request): string {
  if (!req.businessId) throw new Error("No business.");
  return req.businessId;
}

activityLogsRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = Math.min(Number(req.query.first) || 20, 50);
  const entityType = typeof req.query.entityType === "string" ? req.query.entityType.trim() : "";
  const entityId = typeof req.query.entityId === "string" ? req.query.entityId.trim() : "";
  const conditions = [eq(activityLogs.businessId, bid)];
  if (entityType) conditions.push(eq(activityLogs.entityType, entityType));
  if (entityId) conditions.push(eq(activityLogs.entityId, entityId));
  const list = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      userId: activityLogs.userId,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(and(...conditions))
    .orderBy(desc(activityLogs.createdAt))
    .limit(first);
  const records = list.map((row) => ({
    id: row.id,
    type: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    description: row.metadata ?? "",
    metadata: row.metadata,
    createdAt: row.createdAt,
  }));
  res.json({ records });
});
