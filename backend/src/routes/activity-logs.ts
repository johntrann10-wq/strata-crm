import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { activityLogs, appointments, clients } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { sanitizeStringValue, sanitizeValue } from "../lib/logger.js";
import { roleHasPermission, type PermissionKey } from "../lib/permissions.js";
import { wrapAsync } from "../lib/asyncHandler.js";

export const activityLogsRouter = Router();

type ActivityLogListRow = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  metadata: string | null;
  createdAt: Date;
};

function businessId(req: Request): string {
  if (!req.businessId) throw new Error("No business.");
  return req.businessId;
}

function sanitizeMetadataString(metadata: string | null): string | null {
  if (!metadata) return null;

  try {
    const parsed = JSON.parse(metadata) as unknown;
    const sanitized = sanitizeValue("metadata", parsed);
    if (sanitized == null) return null;
    return typeof sanitized === "string" ? sanitized : JSON.stringify(sanitized);
  } catch {
    return sanitizeStringValue(metadata);
  }
}

export function serializeActivityLogRecord(row: ActivityLogListRow) {
  const metadata = sanitizeMetadataString(row.metadata);
  return {
    id: row.id,
    type: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    description: metadata ?? "",
    metadata,
    createdAt: row.createdAt,
  };
}

const MEDIA_URL_MAX_LENGTH = 900_000;
const MEDIA_DATA_URL_MAX_BYTES = 650 * 1024;
const MEDIA_DATA_URL_PREFIX = /^data:image\/(?:png|jpe?g|webp);base64,/i;

function estimateDataUrlBytes(value: string): number {
  const parts = value.split(",", 2);
  if (parts.length !== 2) return Number.POSITIVE_INFINITY;
  const base64 = parts[1].replace(/\s+/g, "");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function getMediaReferenceError(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return "Media URL is required.";

  if (trimmed.startsWith("data:")) {
    if (!MEDIA_DATA_URL_PREFIX.test(trimmed)) {
      return "Uploaded media must be a PNG, JPG, or WebP image.";
    }
    if (estimateDataUrlBytes(trimmed) > MEDIA_DATA_URL_MAX_BYTES) {
      return "Uploaded photo is too large. Keep it under 650 KB after compression.";
    }
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return null;
    }
  } catch {
    // Fall through to validation error below.
  }

  return "Media URL must be an https link or an uploaded image.";
}

const createActivitySchema = z
  .object({
    entityType: z.enum(["appointment", "job", "client"]),
    entityId: z.string().uuid(),
    kind: z.enum(["note", "media", "checklist_add", "checklist_toggle"]),
    body: z.string().trim().max(4000).optional(),
    label: z.string().trim().max(160).optional(),
    url: z.string().trim().max(MEDIA_URL_MAX_LENGTH).optional(),
    itemId: z.string().uuid().optional(),
    completed: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "note" && !value.body) {
      ctx.addIssue({ code: "custom", message: "Note body is required." });
    }
    if (value.kind === "media") {
      const mediaReferenceError = getMediaReferenceError(value.url);
      if (mediaReferenceError) ctx.addIssue({ code: "custom", message: mediaReferenceError });
      if (!value.label) ctx.addIssue({ code: "custom", message: "Media label is required." });
    }
    if (value.kind === "checklist_add") {
      if (!value.label) ctx.addIssue({ code: "custom", message: "Checklist label is required." });
      if (!value.itemId) ctx.addIssue({ code: "custom", message: "Checklist item id is required." });
    }
    if (value.kind === "checklist_toggle") {
      if (!value.label) ctx.addIssue({ code: "custom", message: "Checklist label is required." });
      if (!value.itemId) ctx.addIssue({ code: "custom", message: "Checklist item id is required." });
      if (typeof value.completed !== "boolean") {
        ctx.addIssue({ code: "custom", message: "Checklist completion state is required." });
      }
    }
    if (value.entityType === "client" && value.kind !== "note" && value.kind !== "media") {
      ctx.addIssue({ code: "custom", message: "Client activity only supports notes and media." });
    }
  });

async function assertEntityExists(req: Request, entityType: "appointment" | "job" | "client", entityId: string) {
  const bid = businessId(req);
  const [record] =
    entityType === "client"
      ? await db
          .select({ id: clients.id })
          .from(clients)
          .where(and(eq(clients.id, entityId), eq(clients.businessId, bid)))
          .limit(1)
      : await db
          .select({ id: appointments.id })
          .from(appointments)
          .where(and(eq(appointments.id, entityId), eq(appointments.businessId, bid)))
          .limit(1);
  if (!record) {
    throw new NotFoundError(
      entityType === "job" ? "Job not found." : entityType === "client" ? "Client not found." : "Appointment not found."
    );
  }
}

function assertRequestPermission(req: Request, permission: PermissionKey) {
  if (!req.membershipRole) {
    throw new ForbiddenError("No tenant role is associated with this request.");
  }
  const hasPermission = req.permissions
    ? req.permissions.includes(permission)
    : roleHasPermission(req.membershipRole, permission);
  if (!hasPermission) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }
}

activityLogsRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("dashboard.view"),
  wrapAsync(async (req: Request, res: Response) => {
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
    const records = list.map(serializeActivityLogRecord);
    res.json({ records });
  })
);

activityLogsRouter.post(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");

    if (parsed.data.entityType === "job") {
      assertRequestPermission(req, "jobs.write");
    } else if (parsed.data.entityType === "client") {
      assertRequestPermission(req, "customers.write");
    } else {
      assertRequestPermission(req, "appointments.write");
    }

    await assertEntityExists(req, parsed.data.entityType, parsed.data.entityId);

    const metadata =
      parsed.data.kind === "note"
        ? { body: parsed.data.body ?? "" }
        : parsed.data.kind === "media"
          ? { label: parsed.data.label ?? "", url: parsed.data.url ?? "" }
          : {
              itemId: parsed.data.itemId ?? "",
              label: parsed.data.label ?? "",
              completed: parsed.data.kind === "checklist_add" ? false : parsed.data.completed ?? false,
            };

    const action =
      parsed.data.kind === "note"
        ? `${parsed.data.entityType}.note_added`
        : parsed.data.kind === "media"
          ? `${parsed.data.entityType}.media_added`
          : parsed.data.kind === "checklist_add"
            ? `${parsed.data.entityType}.checklist_item_added`
            : parsed.data.completed
              ? `${parsed.data.entityType}.checklist_item_completed`
              : `${parsed.data.entityType}.checklist_item_reopened`;

    await createRequestActivityLog(req, {
      businessId: businessId(req),
      action,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      metadata,
    });

    res.status(201).json({ ok: true });
  })
);
