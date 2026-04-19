import { Router, Request, Response } from "express";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import {
  ensureNotificationInfrastructure,
  getVisibleUnreadNotificationCounts,
} from "../lib/notifications.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const notificationsRouter = Router();

type NotificationListRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  metadata: string;
  createdAt: Date;
  updatedAt: Date;
};

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function notificationVisibilityFilter(req: Request) {
  if (req.userId) {
    return or(isNull(notifications.userId), eq(notifications.userId, req.userId));
  }
  return isNull(notifications.userId);
}

function parseNotificationMetadata(metadata: string | null | undefined): Record<string, unknown> {
  if (!metadata?.trim()) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function serializeNotificationRecord(row: NotificationListRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    entityType: row.entityType,
    entityId: row.entityId,
    isRead: row.isRead,
    metadata: parseNotificationMetadata(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

notificationsRouter.get(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    await ensureNotificationInfrastructure();
    const first = Math.min(Math.max(Number(req.query.first) || 12, 1), 50);
    const list = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        message: notifications.message,
        entityType: notifications.entityType,
        entityId: notifications.entityId,
        isRead: notifications.isRead,
        metadata: notifications.metadata,
        createdAt: notifications.createdAt,
        updatedAt: notifications.updatedAt,
      })
      .from(notifications)
      .where(and(eq(notifications.businessId, businessId(req)), notificationVisibilityFilter(req)))
      .orderBy(desc(notifications.createdAt))
      .limit(first);

    res.json({ records: list.map(serializeNotificationRecord) });
  })
);

notificationsRouter.get(
  "/unread-count",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const counts = await getVisibleUnreadNotificationCounts({
      businessId: businessId(req),
      userId: req.userId ?? null,
    });
    res.json(counts);
  })
);

notificationsRouter.post(
  "/:id/read",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    if (!req.params.id?.trim()) throw new BadRequestError("Notification id is required.");
    await ensureNotificationInfrastructure();

    const [updated] = await db
      .update(notifications)
      .set({
        isRead: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notifications.id, req.params.id),
          eq(notifications.businessId, businessId(req)),
          notificationVisibilityFilter(req)
        )
      )
      .returning({ id: notifications.id });

    if (!updated) throw new NotFoundError("Notification not found.");

    res.json({ ok: true, id: updated.id });
  })
);

notificationsRouter.post(
  "/read-all",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    await ensureNotificationInfrastructure();
    const now = new Date();
    await db
      .update(notifications)
      .set({
        isRead: true,
        updatedAt: now,
      })
      .where(
        and(
          eq(notifications.businessId, businessId(req)),
          notificationVisibilityFilter(req),
          eq(notifications.isRead, false)
        )
      );

    res.json({ ok: true });
  })
);
