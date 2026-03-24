import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { appointments, clients, vehicles, staff, locations, quotes, services, appointmentServices } from "../db/schema.js";
import { eq, and, or, desc, asc, gte, lte, ilike } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { logger } from "../lib/logger.js";
import { hasAppointmentOverlap } from "../lib/appointmentOverlap.js";
import { ConflictError } from "../lib/errors.js";
import { recalculateAppointmentTotal } from "../lib/revenueTotals.js";
import { createRequestActivityLog } from "../lib/activity.js";

export const appointmentsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const appointmentStatusSchema = z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no-show"]);
const createSchema = z.object({
  clientId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  title: z.string().optional(),
  assignedStaffId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  /** When set, links quote → appointment and marks quote accepted (client/vehicle must match quote). */
  quoteId: z.string().uuid().optional(),
  /** Catalog services to attach (prices from service catalog). */
  serviceIds: z.array(z.string().uuid()).optional(),
});
const updateSchema = createSchema.partial();
function parseIsoDate(s: string | undefined): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

appointmentsRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Math.max(Number(req.query.first), 1), 500) : 50;

  let sortAsc = false;
  if (typeof req.query.sort === "string" && req.query.sort.trim()) {
    try {
      const s = JSON.parse(req.query.sort) as { startTime?: string };
      sortAsc = s?.startTime === "Ascending";
    } catch {
      /* ignore */
    }
  }

  const startGte = parseIsoDate(typeof req.query.startGte === "string" ? req.query.startGte : undefined);
  const startLte = parseIsoDate(typeof req.query.startLte === "string" ? req.query.startLte : undefined);

  const clientIdRaw = typeof req.query.clientId === "string" ? req.query.clientId.trim() : "";
  const clientIdFilter = z.string().uuid().safeParse(clientIdRaw).success ? clientIdRaw : undefined;
  const vehicleIdRaw = typeof req.query.vehicleId === "string" ? req.query.vehicleId.trim() : "";
  const vehicleIdFilter = z.string().uuid().safeParse(vehicleIdRaw).success ? vehicleIdRaw : undefined;
  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const statusParsed = appointmentStatusSchema.safeParse(statusRaw);
  const statusFilter = statusParsed.success ? statusParsed.data : undefined;

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const conditions = [eq(appointments.businessId, bid)];
  if (clientIdFilter) conditions.push(eq(appointments.clientId, clientIdFilter));
  if (vehicleIdFilter) conditions.push(eq(appointments.vehicleId, vehicleIdFilter));
  if (statusFilter) conditions.push(eq(appointments.status, statusFilter));
  if (startGte) conditions.push(gte(appointments.startTime, startGte));
  if (startLte) conditions.push(lte(appointments.startTime, startLte));

  const term = `%${search}%`;
  const whereClause =
    search.length >= 2
      ? and(
          ...conditions,
          or(
            ilike(appointments.title, term),
            ilike(clients.firstName, term),
            ilike(clients.lastName, term),
            ilike(vehicles.make, term),
            ilike(vehicles.model, term),
            ilike(staff.firstName, term),
            ilike(staff.lastName, term)
          )
        )!
      : and(...conditions)!;

  const list = await db
    .select({
      id: appointments.id,
      businessId: appointments.businessId,
      clientId: appointments.clientId,
      vehicleId: appointments.vehicleId,
      assignedStaffId: appointments.assignedStaffId,
      locationId: appointments.locationId,
      title: appointments.title,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      totalPrice: appointments.totalPrice,
      depositAmount: appointments.depositAmount,
      depositPaid: appointments.depositPaid,
      notes: appointments.notes,
      internalNotes: appointments.internalNotes,
      cancelledAt: appointments.cancelledAt,
      completedAt: appointments.completedAt,
      createdAt: appointments.createdAt,
      updatedAt: appointments.updatedAt,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      locationName: locations.name,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
    .leftJoin(staff, eq(appointments.assignedStaffId, staff.id))
    .leftJoin(locations, eq(appointments.locationId, locations.id))
    .where(whereClause)
    .orderBy(sortAsc ? asc(appointments.startTime) : desc(appointments.startTime))
    .limit(first);

  const records = list.map((row) => ({
    id: row.id,
    businessId: row.businessId,
    clientId: row.clientId,
    vehicleId: row.vehicleId,
    assignedStaffId: row.assignedStaffId,
    locationId: row.locationId,
    title: row.title,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    totalPrice: row.totalPrice,
    depositAmount: row.depositAmount,
    depositPaid: row.depositPaid,
    notes: row.notes,
    internalNotes: row.internalNotes,
    cancelledAt: row.cancelledAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    client: row.clientFirstName != null ? { firstName: row.clientFirstName, lastName: row.clientLastName } : null,
    vehicle:
      row.vehicleMake != null
        ? { year: row.vehicleYear ?? null, make: row.vehicleMake, model: row.vehicleModel }
        : null,
    assignedStaff: row.staffFirstName != null ? { firstName: row.staffFirstName, lastName: row.staffLastName } : null,
    location: row.locationName != null ? { name: row.locationName } : null,
  }));
  res.json({ records });
});

appointmentsRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);

  const [row] = await db
    .select({
      id: appointments.id,
      businessId: appointments.businessId,
      clientId: appointments.clientId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientPhone: clients.phone,
      clientEmail: clients.email,
      vehicleId: appointments.vehicleId,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      vehicleColor: vehicles.color,
      vehicleLicensePlate: vehicles.licensePlate,
      assignedStaffId: appointments.assignedStaffId,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      title: appointments.title,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      totalPrice: appointments.totalPrice,
      depositAmount: appointments.depositAmount,
      depositPaid: appointments.depositPaid,
      notes: appointments.notes,
      internalNotes: appointments.internalNotes,
      cancelledAt: appointments.cancelledAt,
      completedAt: appointments.completedAt,
      createdAt: appointments.createdAt,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .leftJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.businessId, bid)))
    .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, bid)))
    .leftJoin(staff, and(eq(appointments.assignedStaffId, staff.id), eq(staff.businessId, bid)))
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);

  if (!row) throw new NotFoundError("Appointment not found.");

  res.json({
    // Keep flat columns for existing clients
    id: row.id,
    businessId: row.businessId,
    clientId: row.clientId,
    vehicleId: row.vehicleId,
    assignedStaffId: row.assignedStaffId,
    title: row.title,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    totalPrice: row.totalPrice,
    depositAmount: row.depositAmount,
    depositPaid: row.depositPaid,
    notes: row.notes,
    internalNotes: row.internalNotes,
    cancelledAt: row.cancelledAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Add nested objects expected by the frontend
    client:
      row.clientFirstName != null
        ? {
            id: row.clientId,
            firstName: row.clientFirstName,
            lastName: row.clientLastName,
            phone: row.clientPhone ?? null,
            email: row.clientEmail ?? null,
          }
        : null,
    vehicle:
      row.vehicleMake != null
        ? {
            id: row.vehicleId,
            year: row.vehicleYear ?? null,
            make: row.vehicleMake,
            model: row.vehicleModel,
            color: row.vehicleColor ?? null,
            licensePlate: row.vehicleLicensePlate ?? null,
          }
        : null,
    assignedStaff:
      row.assignedStaffId != null
        ? {
            id: row.assignedStaffId,
            firstName: row.staffFirstName,
            lastName: row.staffLastName,
          }
        : null,
    business: { id: row.businessId },
  });
});

appointmentsRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);

  // Tenancy: client and vehicle must belong to this business; vehicle must belong to client
  const [client] = await db.select().from(clients).where(and(eq(clients.id, parsed.data.clientId), eq(clients.businessId, bid))).limit(1);
  if (!client) throw new BadRequestError("Client not found or access denied.");
  const [vehicle] = await db.select().from(vehicles).where(and(eq(vehicles.id, parsed.data.vehicleId), eq(vehicles.businessId, bid), eq(vehicles.clientId, parsed.data.clientId))).limit(1);
  if (!vehicle) throw new BadRequestError("Vehicle not found, or does not belong to this client or business.");

  if (parsed.data.quoteId) {
    const [q] = await db.select().from(quotes).where(and(eq(quotes.id, parsed.data.quoteId), eq(quotes.businessId, bid))).limit(1);
    if (!q) throw new BadRequestError("Quote not found.");
    if (q.clientId !== parsed.data.clientId) throw new BadRequestError("Appointment client must match the quote.");
    if (!q.vehicleId || q.vehicleId !== parsed.data.vehicleId) {
      throw new BadRequestError("Appointment vehicle must match the quote (add a vehicle to the quote first).");
    }
  }

  if (parsed.data.assignedStaffId) {
    const [staffRow] = await db.select().from(staff).where(and(eq(staff.id, parsed.data.assignedStaffId), eq(staff.businessId, bid))).limit(1);
    if (!staffRow) throw new BadRequestError("Staff not found or access denied.");
  }
  if (parsed.data.locationId) {
    const [loc] = await db.select().from(locations).where(and(eq(locations.id, parsed.data.locationId), eq(locations.businessId, bid))).limit(1);
    if (!loc) throw new BadRequestError("Location not found or access denied.");
  }

  const startTime = new Date(parsed.data.startTime);
  const endTime = parsed.data.endTime ? new Date(parsed.data.endTime) : null;
  const overlap = await hasAppointmentOverlap({
    businessId: bid,
    startTime,
    endTime,
    assignedStaffId: parsed.data.assignedStaffId ?? null,
    excludeAppointmentId: null,
  });
  if (overlap) {
    throw new ConflictError(
      parsed.data.assignedStaffId
        ? "This staff member already has an appointment in this time slot."
        : "Another appointment in this business overlaps with this time slot."
    );
  }

  let totalPriceInit = "0";
  if (parsed.data.quoteId) {
    const [q] = await db.select({ total: quotes.total }).from(quotes).where(eq(quotes.id, parsed.data.quoteId)).limit(1);
    if (q?.total != null) totalPriceInit = String(q.total);
  }

  const created = await db.transaction(async (tx) => {
    const [apt] = await tx
      .insert(appointments)
      .values({
        businessId: bid,
        clientId: parsed.data.clientId,
        vehicleId: parsed.data.vehicleId,
        startTime,
        endTime,
        title: parsed.data.title ?? null,
        assignedStaffId: parsed.data.assignedStaffId ?? null,
        locationId: parsed.data.locationId ?? null,
        totalPrice: totalPriceInit,
      })
      .returning();
    if (!apt) throw new BadRequestError("Failed to create appointment.");

    if (parsed.data.quoteId) {
      await tx
        .update(quotes)
        .set({ appointmentId: apt.id, status: "accepted", updatedAt: new Date() })
        .where(eq(quotes.id, parsed.data.quoteId));
    }

    if (parsed.data.serviceIds && parsed.data.serviceIds.length > 0) {
      for (const sid of parsed.data.serviceIds) {
        const [svc] = await tx.select().from(services).where(and(eq(services.id, sid), eq(services.businessId, bid))).limit(1);
        if (!svc) continue;
        await tx.insert(appointmentServices).values({
          appointmentId: apt.id,
          serviceId: sid,
          quantity: 1,
          unitPrice: svc.price ?? null,
        });
      }
      await recalculateAppointmentTotal(tx, apt.id);
    }

    return apt;
  });

  logger.info("Appointment created", { appointmentId: created.id, businessId: bid });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "appointment.created",
    entityType: "appointment",
    entityId: created.id,
    metadata: {
      title: created.title ?? null,
      clientId: created.clientId,
      vehicleId: created.vehicleId,
    },
  });
  res.status(201).json(created);
});

appointmentsRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(appointments).where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Appointment not found.");
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const startTime = parsed.data.startTime != null ? new Date(parsed.data.startTime) : (existing.startTime as Date);
  const endTime = parsed.data.endTime != null ? new Date(parsed.data.endTime) : (existing.endTime as Date | null);
  const assignedStaffId = parsed.data.assignedStaffId ?? existing.assignedStaffId;

  if (parsed.data.startTime != null || parsed.data.endTime != null || parsed.data.assignedStaffId != null) {
    const overlap = await hasAppointmentOverlap({
      businessId: bid,
      startTime,
      endTime,
      assignedStaffId,
      excludeAppointmentId: req.params.id,
    });
    if (overlap) {
      throw new ConflictError(
        assignedStaffId
          ? "This staff member already has an appointment in this time slot."
          : "Another appointment in this business overlaps with this time slot."
      );
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.startTime != null) updates.startTime = new Date(parsed.data.startTime);
  if (parsed.data.endTime != null) updates.endTime = new Date(parsed.data.endTime);
  if (parsed.data.title != null) updates.title = parsed.data.title;
  if (parsed.data.assignedStaffId != null) updates.assignedStaffId = parsed.data.assignedStaffId;
  if (parsed.data.locationId != null) updates.locationId = parsed.data.locationId;
  const [updated] = await db.update(appointments).set(updates as Record<string, unknown>).where(eq(appointments.id, req.params.id)).returning();
  if (updated) {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "appointment.updated",
      entityType: "appointment",
      entityId: updated.id,
      metadata: {
        title: updated.title ?? null,
        status: updated.status,
      },
    });
  }
  res.json(updated);
});

appointmentsRouter.post("/:id/updateStatus", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const statusParsed = appointmentStatusSchema.safeParse(req.body?.status ?? "scheduled");
  if (!statusParsed.success) throw new BadRequestError("Invalid status.");
  const status = statusParsed.data;
  const bid = businessId(req);
  const [existing] = await db.select().from(appointments).where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Appointment not found.");
  const updates: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "cancelled") updates.cancelledAt = new Date();
  if (status === "completed") updates.completedAt = new Date();
  const [updated] = await db.update(appointments).set(updates as Record<string, unknown>).where(eq(appointments.id, req.params.id)).returning();
  if (updated) {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "appointment.status_changed",
      entityType: "appointment",
      entityId: updated.id,
      metadata: {
        status,
      },
    });
  }
  res.json(updated);
});

appointmentsRouter.post("/:id/complete", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(appointments).where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Appointment not found.");
  const [updated] = await db
    .update(appointments)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(appointments.id, req.params.id))
    .returning();
  if (updated) {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "appointment.completed",
      entityType: "appointment",
      entityId: updated.id,
      metadata: {
        completedAt: updated.completedAt,
      },
    });
  }
  res.json(updated);
});

appointmentsRouter.post("/:id/cancel", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(appointments).where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Appointment not found.");
  const [updated] = await db
    .update(appointments)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(appointments.id, req.params.id))
    .returning();
  if (updated) {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "appointment.cancelled",
      entityType: "appointment",
      entityId: updated.id,
      metadata: {
        cancelledAt: updated.cancelledAt,
      },
    });
  }
  res.json(updated);
});
