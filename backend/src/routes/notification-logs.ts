import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { notificationLogs } from "../db/schema.js";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const notificationLogsRouter = Router();

function businessId(req: Request): string {
  if (!req.businessId) throw new Error("No business.");
  return req.businessId;
}

function parseStatusFilter(filter: unknown): "all" | "failed" {
  if (!filter || typeof filter !== "object" || !Array.isArray((filter as { AND?: unknown[] }).AND)) return "all";
  const andArr = (filter as { AND: unknown[] }).AND;
  for (const item of andArr) {
    if (item && typeof item === "object" && "status" in item) {
      const s = (item as { status?: { equals?: string } }).status?.equals;
      if (s === "failed") return "failed";
    }
  }
  return "all";
}

notificationLogsRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  let filter: unknown;
  try {
    filter = req.query.filter ? JSON.parse(String(req.query.filter)) : undefined;
  } catch {
    filter = undefined;
  }
  const statusOnly = parseStatusFilter(filter);
  const first = Math.min(Number(req.query.first) || 20, 100);
  const conditions = [eq(notificationLogs.businessId, bid)];
  if (statusOnly === "failed") conditions.push(isNotNull(notificationLogs.error));
  const list = await db
    .select()
    .from(notificationLogs)
    .where(and(...conditions))
    .orderBy(desc(notificationLogs.sentAt))
    .limit(first);
  const records = list.map((row) => ({
    ...row,
    status: row.error ? "failed" : "sent",
  }));
  res.json({ records });
});
