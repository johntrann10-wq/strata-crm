import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { appointmentServices, appointments } from "../db/schema.js";
import { and, eq, desc } from "drizzle-orm";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { recalculateAppointmentTotal } from "../lib/revenueTotals.js";

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

appointmentServicesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const filter = parseFilter(req) as { appointmentId?: { equals?: string } } | undefined;

  const appointmentId = filter?.appointmentId?.equals;
  const conditions = [eq(appointments.businessId, bid)];
  if (appointmentId) conditions.push(eq(appointmentServices.appointmentId, appointmentId));

  const first = req.query.first != null ? Math.min(Number(req.query.first), 100) : 50;

  const rows = await db
    .select()
    .from(appointmentServices)
    .innerJoin(appointments, eq(appointmentServices.appointmentId, appointments.id))
    .where(and(...conditions))
    .orderBy(desc(appointmentServices.createdAt))
    .limit(first);

  // Ensure stable contract for `resource(...).findMany()`
  res.json({ records: rows });
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
  await db.transaction(async (tx) => {
    await tx.delete(appointmentServices).where(eq(appointmentServices.id, req.params.id));
    await recalculateAppointmentTotal(tx, apptId);
  });
  res.status(204).send();
});

