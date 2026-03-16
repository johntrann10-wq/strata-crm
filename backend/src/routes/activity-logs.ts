import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { activityLogs } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
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
  const list = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(eq(activityLogs.businessId, bid))
    .orderBy(desc(activityLogs.createdAt))
    .limit(first);
  const records = list.map((row) => ({
    id: row.id,
    type: row.action,
    description: row.metadata ?? "",
    createdAt: row.createdAt,
  }));
  res.json({ records });
});
