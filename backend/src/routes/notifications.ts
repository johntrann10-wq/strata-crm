import { Router, Request, Response } from "express";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import {
  ensureNotificationInfrastructure,
  getNotificationScope,
  parseNotificationMetadata,
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

type NotificationAccessRow = Pick<NotificationListRow, "type" | "entityType" | "metadata">;

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

function getResolvedPermissions(req: Request): Set<string> {
  if (!req.membershipRole || !Array.isArray(req.permissions)) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
  return new Set(req.permissions);
}

function canAccessNotification(permissions: Set<string>, row: NotificationAccessRow): boolean {
  const scope = getNotificationScope({
    type: row.type,
    entityType: row.entityType,
    metadata: parseNotificationMetadata(row.metadata),
  });
  switch (scope) {
    case "leads":
      return permissions.has("customers.read");
    case "calendar":
      return permissions.has("appointments.read");
    case "finance":
      return permissions.has("payments.read") || permissions.has("invoices.read");
    default:
      return permissions.has("dashboard.view");
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

async function listVisibleNotifications(params: {
  businessId: string;
  visibilityFilter: ReturnType<typeof notificationVisibilityFilter>;
  permissions: Set<string>;
  first: number;
}): Promise<NotificationListRow[]> {
  const pageSize = Math.min(Math.max(params.first * 4, 24), 100);
  const visible: NotificationListRow[] = [];
  let offset = 0;

  while (visible.length < params.first) {
    const rows = await db
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
      .where(and(eq(notifications.businessId, params.businessId), params.visibilityFilter))
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset(offset);

    if (rows.length === 0) break;
    visible.push(...rows.filter((row) => canAccessNotification(params.permissions, row)));
    if (rows.length < pageSize) break;
    offset += rows.length;
  }

  return visible.slice(0, params.first);
}

notificationsRouter.get(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    await ensureNotificationInfrastructure();
    const first = Math.min(Math.max(Number(req.query.first) || 12, 1), 50);
    const permissions = getResolvedPermissions(req);
    const list = await listVisibleNotifications({
      businessId: businessId(req),
      visibilityFilter: notificationVisibilityFilter(req),
      permissions,
      first,
    });

    res.json({
      records: list.map(serializeNotificationRecord),
    });
  })
);

notificationsRouter.get(
  "/unread-count",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    await ensureNotificationInfrastructure();
    const permissions = getResolvedPermissions(req);
    const unreadRows = await db
      .select({
        type: notifications.type,
        entityType: notifications.entityType,
        metadata: notifications.metadata,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.businessId, businessId(req)),
          notificationVisibilityFilter(req),
          eq(notifications.isRead, false)
        )
      );

    const counts = { total: 0, leads: 0, calendar: 0 };
    for (const row of unreadRows) {
      if (!canAccessNotification(permissions, row)) continue;
      counts.total += 1;
      const scope = getNotificationScope({
        type: row.type,
        entityType: row.entityType,
        metadata: parseNotificationMetadata(row.metadata),
      });
      if (scope === "leads") counts.leads += 1;
      if (scope === "calendar") counts.calendar += 1;
    }
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
    const permissions = getResolvedPermissions(req);

    const [existing] = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        entityType: notifications.entityType,
        metadata: notifications.metadata,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.id, req.params.id),
          eq(notifications.businessId, businessId(req)),
          notificationVisibilityFilter(req)
        )
      )
      .limit(1);

    if (!existing || !canAccessNotification(permissions, existing)) {
      throw new NotFoundError("Notification not found.");
    }

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
    const permissions = getResolvedPermissions(req);
    const unreadRows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        entityType: notifications.entityType,
        metadata: notifications.metadata,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.businessId, businessId(req)),
          notificationVisibilityFilter(req),
          eq(notifications.isRead, false)
        )
      );

    const authorizedIds = unreadRows
      .filter((row) => canAccessNotification(permissions, row))
      .map((row) => row.id);

    if (authorizedIds.length === 0) {
      res.json({ ok: true });
      return;
    }

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
          inArray(notifications.id, authorizedIds)
        )
      );

    res.json({ ok: true });
  })
);
