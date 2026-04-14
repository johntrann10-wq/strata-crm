import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { activityLogs, appointments } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { createRequestActivityLog } from "../lib/activity.js";

export const activityLogsRouter = Router();

function businessId(req: Request): string {
  if (!req.businessId) throw new Error("No business.");
  return req.businessId;
}

const createActivitySchema = z
  .object({
    entityType: z.enum(["appointment", "job"]),
    entityId: z.string().uuid(),
    kind: z.enum(["note", "media", "checklist_add", "checklist_toggle"]),
    body: z.string().trim().max(4000).optional(),
    label: z.string().trim().max(160).optional(),
    url: z.string().trim().url().max(2000).optional(),
    itemId: z.string().uuid().optional(),
    completed: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "note" && !value.body) {
      ctx.addIssue({ code: "custom", message: "Note body is required." });
    }
    if (value.kind === "media") {
      if (!value.url) ctx.addIssue({ code: "custom", message: "Media URL is required." });
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
  });

async function assertEntityExists(req: Request, entityType: "appointment" | "job", entityId: string) {
  const bid = businessId(req);
  const [record] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, entityId), eq(appointments.businessId, bid)))
    .limit(1);
  if (!record) throw new NotFoundError(entityType === "job" ? "Job not found." : "Appointment not found.");
}

activityLogsRouter.get("/", requireAuth, requireTenant, requirePermission("dashboard.view"), async (req: Request, res: Response) => {
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

activityLogsRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = createActivitySchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");

  if (parsed.data.entityType === "job") {
    requirePermission("jobs.write")(req, res, () => undefined);
  } else {
    requirePermission("appointments.write")(req, res, () => undefined);
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
});
