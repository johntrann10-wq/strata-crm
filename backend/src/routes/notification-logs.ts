import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { notificationLogs } from "../db/schema.js";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireTenant } from "../middleware/tenant.js";
import { sanitizeStringValue, sanitizeValue } from "../lib/logger.js";

export const notificationLogsRouter = Router();

type NotificationLogListRow = {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  sentAt: Date;
  providerStatus: string | null;
  providerStatusAt: Date | null;
  deliveredAt: Date | null;
  providerErrorCode: string | null;
  error: string | null;
  retryCount: number;
  lastRetryAt: Date | null;
};

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

export function serializeNotificationLogRecord(row: NotificationLogListRow) {
  const recipient = sanitizeValue("recipient", row.recipient);
  return {
    id: row.id,
    channel: row.channel,
    recipient: typeof recipient === "string" ? recipient : null,
    subject: row.subject ? sanitizeStringValue(row.subject) : null,
    sentAt: row.sentAt,
    status: row.error ? "failed" : "sent",
    providerStatus: row.providerStatus ? sanitizeStringValue(row.providerStatus) : null,
    providerStatusAt: row.providerStatusAt,
    deliveredAt: row.deliveredAt,
    providerErrorCode: row.providerErrorCode ? sanitizeStringValue(row.providerErrorCode) : null,
    error: row.error ? sanitizeStringValue(row.error) : null,
    retryCount: row.retryCount,
    lastRetryAt: row.lastRetryAt,
  };
}

notificationLogsRouter.get("/", requireAuth, requireTenant, requirePermission("settings.read"), async (req: Request, res: Response) => {
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
    .select({
      id: notificationLogs.id,
      channel: notificationLogs.channel,
      recipient: notificationLogs.recipient,
      subject: notificationLogs.subject,
      sentAt: notificationLogs.sentAt,
      providerStatus: notificationLogs.providerStatus,
      providerStatusAt: notificationLogs.providerStatusAt,
      deliveredAt: notificationLogs.deliveredAt,
      providerErrorCode: notificationLogs.providerErrorCode,
      error: notificationLogs.error,
      retryCount: notificationLogs.retryCount,
      lastRetryAt: notificationLogs.lastRetryAt,
    })
    .from(notificationLogs)
    .where(and(...conditions))
    .orderBy(desc(notificationLogs.sentAt))
    .limit(first);
  const records = list.map(serializeNotificationLogRecord);
  res.json({ records });
});
