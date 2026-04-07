import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { appointmentServices, appointments, invoices, serviceCategories, services } from "../db/schema.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { formatLegacyServiceCategory } from "../lib/serviceCategories.js";
import { warnOnce } from "../lib/warnOnce.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { recalculateAppointmentTotal } from "../lib/revenueTotals.js";
import { createRequestActivityLog } from "../lib/activity.js";

export const appointmentServicesRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function parseFilter(req: Request): unknown {
  try {
    return req.query.filter ? JSON.parse(String(req.query.filter)) : undefined;
  } catch {
    return undefined;
  }
}

function isServiceSchemaDriftError(error: unknown): boolean {
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

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = ${tableName}
  `);
  const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
  return new Set(rows.map((row) => row.column_name).filter((value): value is string => Boolean(value)));
}

appointmentServicesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const filter = parseFilter(req) as { appointmentId?: { equals?: string } } | undefined;

  const appointmentId = filter?.appointmentId?.equals;
  const conditions = [eq(appointments.businessId, bid)];
  if (appointmentId) conditions.push(eq(appointmentServices.appointmentId, appointmentId));

  const first = req.query.first != null ? Math.min(Number(req.query.first), 100) : 50;
  const serviceColumns = await getTableColumns("services");
  const categoryColumns = await getTableColumns("service_categories");
  const hasLegacyCategory = serviceColumns.has("category");
  const hasCategoryId = serviceColumns.has("category_id");
  const hasServiceCategoriesTable = categoryColumns.size > 0;

  let rows: Array<{
    id: string;
    appointmentId: string;
    serviceId: string | null;
    quantity: number | null;
    unitPrice: string | null;
    createdAt: Date;
    updatedAt: Date;
    serviceName: string | null;
    serviceCategory: string | null;
    serviceCategoryLabel?: string | null;
    serviceDurationMinutes: number | null;
  }>;

  try {
    rows = await db
      .select({
        id: appointmentServices.id,
        appointmentId: appointmentServices.appointmentId,
        serviceId: appointmentServices.serviceId,
        quantity: appointmentServices.quantity,
        unitPrice: appointmentServices.unitPrice,
        createdAt: appointmentServices.createdAt,
        updatedAt: appointmentServices.updatedAt,
        serviceName: services.name,
        serviceCategory: hasLegacyCategory ? services.category : sql<string | null>`null`,
        serviceCategoryLabel: hasCategoryId && hasServiceCategoriesTable ? serviceCategories.name : sql<string | null>`null`,
        serviceDurationMinutes: services.durationMinutes,
      })
      .from(appointmentServices)
      .innerJoin(appointments, eq(appointmentServices.appointmentId, appointments.id))
      .leftJoin(services, eq(appointmentServices.serviceId, services.id))
      .leftJoin(serviceCategories, hasCategoryId && hasServiceCategoriesTable ? eq(services.categoryId, serviceCategories.id) : sql`false`)
      .where(and(...conditions))
      .orderBy(desc(appointmentServices.createdAt))
      .limit(first);
  } catch (error) {
    if (!isServiceSchemaDriftError(error)) throw error;
    warnOnce("appointment-services:list:fallback", "appointment services list falling back without full service category schema", {
      businessId: bid,
      error: error instanceof Error ? error.message : String(error),
    });
    rows = await db
      .select({
        id: appointmentServices.id,
        appointmentId: appointmentServices.appointmentId,
        serviceId: appointmentServices.serviceId,
        quantity: appointmentServices.quantity,
        unitPrice: appointmentServices.unitPrice,
        createdAt: appointmentServices.createdAt,
        updatedAt: appointmentServices.updatedAt,
        serviceName: services.name,
        serviceCategory: hasLegacyCategory ? services.category : sql<string | null>`null`,
        serviceDurationMinutes: services.durationMinutes,
      })
      .from(appointmentServices)
      .innerJoin(appointments, eq(appointmentServices.appointmentId, appointments.id))
      .leftJoin(services, eq(appointmentServices.serviceId, services.id))
      .where(and(...conditions))
      .orderBy(desc(appointmentServices.createdAt))
      .limit(first);
  }

  res.json({
    records: rows.map((row) => ({
      id: row.id,
      appointmentId: row.appointmentId,
      serviceId: row.serviceId,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      service: row.serviceName
        ? {
            id: row.serviceId,
            name: row.serviceName,
            category: row.serviceCategoryLabel ?? formatLegacyServiceCategory(row.serviceCategory),
            durationMinutes: row.serviceDurationMinutes,
          }
        : null,
    })),
  });
});

appointmentServicesRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select()
    .from(appointmentServices)
    .innerJoin(appointments, eq(appointmentServices.appointmentId, appointments.id))
    .where(and(eq(appointmentServices.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);

  if (!existing) throw new NotFoundError("Appointment service not found.");
  res.json(existing);
});

const createSchema = z.object({
  appointmentId: z.string().uuid(),
  serviceId: z.string().uuid(),
  quantity: z.number().int().positive().optional(),
  unitPrice: z.number().min(0).optional(),
});

appointmentServicesRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const { appointmentId, serviceId } = parsed.data;
  const appointment = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, bid)))
    .limit(1);

  if (!appointment[0]) throw new NotFoundError("Appointment not found.");

  const quantity = parsed.data.quantity ?? 1;
  const unitPrice = parsed.data.unitPrice != null ? String(parsed.data.unitPrice) : null;

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(appointmentServices)
      .values({
        appointmentId,
        serviceId,
        quantity,
        unitPrice,
      })
      .returning();
    if (!row) throw new BadRequestError("Failed to create appointment service.");
    await recalculateAppointmentTotal(tx, appointmentId);
    return row;
  });

  await createRequestActivityLog(req, {
    businessId: bid,
    action: "job.service_added",
    entityType: "job",
    entityId: appointmentId,
    metadata: {
      appointmentServiceId: created.id,
      serviceId,
      quantity: created.quantity,
    },
  });

  res.status(201).json(created);
});

const updateSchema = z.object({
  serviceId: z.string().uuid().optional(),
  quantity: z.number().int().positive().optional(),
  unitPrice: z.number().min(0).optional().nullable(),
});

appointmentServicesRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const [existing] = await db.select().from(appointmentServices).where(eq(appointmentServices.id, req.params.id)).limit(1);
  if (!existing) throw new NotFoundError("Appointment service not found.");

  const appointment = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, existing.appointmentId), eq(appointments.businessId, bid)))
    .limit(1);
  if (!appointment[0]) throw new ForbiddenError("Access denied.");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.serviceId != null) updates.serviceId = parsed.data.serviceId;
  if (parsed.data.quantity != null) updates.quantity = parsed.data.quantity;
  if (parsed.data.unitPrice !== undefined) {
    updates.unitPrice = parsed.data.unitPrice === null ? null : String(parsed.data.unitPrice);
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(appointmentServices).set(updates as Record<string, unknown>).where(eq(appointmentServices.id, req.params.id)).returning();
    if (!row) throw new NotFoundError("Appointment service not found.");
    await recalculateAppointmentTotal(tx, existing.appointmentId);
    return row;
  });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "job.service_updated",
    entityType: "job",
    entityId: existing.appointmentId,
    metadata: {
      appointmentServiceId: updated.id,
      serviceId: updated.serviceId,
      quantity: updated.quantity,
    },
  });
  res.json(updated);
});

appointmentServicesRouter.delete("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(appointmentServices).where(eq(appointmentServices.id, req.params.id)).limit(1);
  if (!existing) throw new NotFoundError("Appointment service not found.");

  const appointment = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, existing.appointmentId), eq(appointments.businessId, bid)))
    .limit(1);
  if (!appointment[0]) throw new ForbiddenError("Access denied.");

  const apptId = existing.appointmentId;
  const cleanupResult = await db.transaction(async (tx) => {
    await tx.delete(appointmentServices).where(eq(appointmentServices.id, req.params.id));
    await recalculateAppointmentTotal(tx, apptId);
    const [remainingServices] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(appointmentServices)
      .where(eq(appointmentServices.appointmentId, apptId));

    if ((remainingServices?.count ?? 0) > 0) {
      return { autoCancelled: false };
    }

    const [appointmentRow] = await tx
      .select({
        status: appointments.status,
      })
      .from(appointments)
      .where(eq(appointments.id, apptId))
      .limit(1);

    if (!appointmentRow || appointmentRow.status !== "completed") {
      return { autoCancelled: false };
    }

    const [linkedInvoice] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.businessId, bid),
          eq(invoices.appointmentId, apptId),
          sql`${invoices.status} != 'void'`
        )
      )
      .limit(1);

    if (linkedInvoice) {
      return { autoCancelled: false };
    }

    const now = new Date();
    await tx
      .update(appointments)
      .set({
        status: "cancelled",
        completedAt: null,
        cancelledAt: now,
        updatedAt: now,
      })
      .where(eq(appointments.id, apptId));

    return { autoCancelled: true };
  });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "job.service_removed",
    entityType: "job",
    entityId: apptId,
    metadata: {
      appointmentServiceId: existing.id,
      serviceId: existing.serviceId,
      appointmentAutoCancelled: cleanupResult.autoCancelled,
    },
  });
  if (cleanupResult.autoCancelled) {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "appointment.cancelled",
      entityType: "appointment",
      entityId: apptId,
      metadata: {
        reason: "last_service_removed_after_completion",
      },
    });
  }
  res.status(204).send();
});

appointmentServicesRouter.post("/:id/complete", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(appointmentServices).where(eq(appointmentServices.id, req.params.id)).limit(1);
  if (!existing) throw new NotFoundError("Appointment service not found.");

  const [appointment] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, existing.appointmentId), eq(appointments.businessId, bid)))
    .limit(1);
  if (!appointment) throw new ForbiddenError("Access denied.");

  await createRequestActivityLog(req, {
    businessId: bid,
    action: "job.service_completed",
    entityType: "job",
    entityId: existing.appointmentId,
    metadata: {
      appointmentServiceId: existing.id,
      serviceId: existing.serviceId,
      quantity: existing.quantity,
    },
  });
  res.json({ ok: true });
});

appointmentServicesRouter.post("/:id/reopen", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(appointmentServices).where(eq(appointmentServices.id, req.params.id)).limit(1);
  if (!existing) throw new NotFoundError("Appointment service not found.");

  const [appointment] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, existing.appointmentId), eq(appointments.businessId, bid)))
    .limit(1);
  if (!appointment) throw new ForbiddenError("Access denied.");

  await createRequestActivityLog(req, {
    businessId: bid,
    action: "job.service_reopened",
    entityType: "job",
    entityId: existing.appointmentId,
    metadata: {
      appointmentServiceId: existing.id,
      serviceId: existing.serviceId,
      quantity: existing.quantity,
    },
  });
  res.json({ ok: true });
});

