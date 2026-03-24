import { Router, Request, Response } from "express";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  appointmentServices,
  appointments,
  clients,
  invoiceLineItems,
  invoices,
  locations,
  quotes,
  services,
  staff,
  vehicles,
} from "../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireTenant } from "../middleware/tenant.js";
import { createRequestActivityLog } from "../lib/activity.js";

export const jobsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const statusSchema = z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no-show"]);
const updateJobSchema = z
  .object({
    title: z.string().min(1).optional(),
    status: statusSchema.optional(),
    notes: z.string().nullable().optional(),
    internalNotes: z.string().nullable().optional(),
    assignedStaffId: z.string().uuid().nullable().optional(),
    locationId: z.string().uuid().nullable().optional(),
  })
  .strict();

jobsRouter.get("/", requireAuth, requireTenant, requirePermission("jobs.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Math.max(Number(req.query.first), 1), 200) : 100;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status.trim() : "";
  const clientIdRaw = typeof req.query.clientId === "string" ? req.query.clientId.trim() : "";
  const clientIdFilter = z.string().uuid().safeParse(clientIdRaw).success ? clientIdRaw : undefined;
  const vehicleIdRaw = typeof req.query.vehicleId === "string" ? req.query.vehicleId.trim() : "";
  const vehicleIdFilter = z.string().uuid().safeParse(vehicleIdRaw).success ? vehicleIdRaw : undefined;

  const conditions = [eq(appointments.businessId, bid)];
  if (clientIdFilter) conditions.push(eq(appointments.clientId, clientIdFilter));
  if (vehicleIdFilter) conditions.push(eq(appointments.vehicleId, vehicleIdFilter));
  if (status) conditions.push(eq(appointments.status, status as any));
  if (search.length >= 2) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(appointments.title, term),
        ilike(clients.firstName, term),
        ilike(clients.lastName, term),
        ilike(vehicles.make, term),
        ilike(vehicles.model, term),
        ilike(staff.firstName, term),
        ilike(staff.lastName, term),
        ilike(locations.name, term),
        sql`cast(${appointments.id} as text) ilike ${term}`
      )!
    );
  }

  const rows = await db
    .select({
      id: appointments.id,
      status: appointments.status,
      title: appointments.title,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      totalPrice: appointments.totalPrice,
      notes: appointments.notes,
      internalNotes: appointments.internalNotes,
      completedAt: appointments.completedAt,
      clientId: clients.id,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      vehicleId: vehicles.id,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      assignedStaffId: staff.id,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      locationId: locations.id,
      locationName: locations.name,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
    .leftJoin(staff, eq(appointments.assignedStaffId, staff.id))
    .leftJoin(locations, eq(appointments.locationId, locations.id))
    .where(and(...conditions))
    .orderBy(desc(appointments.startTime), asc(appointments.createdAt))
    .limit(first);

  res.json({
    records: rows.map((row) => ({
      id: row.id,
      appointmentId: row.id,
      jobNumber: `WO-${row.id.slice(0, 8).toUpperCase()}`,
      status: row.status,
      title: row.title,
      scheduledStart: row.startTime,
      scheduledEnd: row.endTime,
      totalPrice: row.totalPrice,
      notes: row.notes,
      internalNotes: row.internalNotes,
      completedAt: row.completedAt,
      client: row.clientId
        ? { id: row.clientId, firstName: row.clientFirstName, lastName: row.clientLastName }
        : null,
      vehicle: row.vehicleId
        ? { id: row.vehicleId, year: row.vehicleYear, make: row.vehicleMake, model: row.vehicleModel }
        : null,
      assignedStaff: row.assignedStaffId
        ? { id: row.assignedStaffId, firstName: row.staffFirstName, lastName: row.staffLastName }
        : null,
      location: row.locationId ? { id: row.locationId, name: row.locationName } : null,
    })),
  });
});

jobsRouter.get("/:id", requireAuth, requireTenant, requirePermission("jobs.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);

  const [job] = await db
    .select({
      id: appointments.id,
      businessId: appointments.businessId,
      status: appointments.status,
      title: appointments.title,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      totalPrice: appointments.totalPrice,
      notes: appointments.notes,
      internalNotes: appointments.internalNotes,
      completedAt: appointments.completedAt,
      cancelledAt: appointments.cancelledAt,
      clientId: clients.id,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientPhone: clients.phone,
      clientEmail: clients.email,
      vehicleId: vehicles.id,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      vehicleColor: vehicles.color,
      vehicleLicensePlate: vehicles.licensePlate,
      assignedStaffId: staff.id,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      locationId: locations.id,
      locationName: locations.name,
      locationAddress: locations.address,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
    .leftJoin(staff, eq(appointments.assignedStaffId, staff.id))
    .leftJoin(locations, eq(appointments.locationId, locations.id))
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);

  if (!job) throw new NotFoundError("Job not found.");

  const jobServices = await db
    .select({
      id: appointmentServices.id,
      quantity: appointmentServices.quantity,
      unitPrice: appointmentServices.unitPrice,
      serviceId: services.id,
      serviceName: services.name,
      category: services.category,
      durationMinutes: services.durationMinutes,
    })
    .from(appointmentServices)
    .leftJoin(services, eq(appointmentServices.serviceId, services.id))
    .where(eq(appointmentServices.appointmentId, job.id));

  const [invoice] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      total: invoices.total,
    })
    .from(invoices)
    .where(and(eq(invoices.appointmentId, job.id), eq(invoices.businessId, bid)))
    .limit(1);

  const [quote] = await db
    .select({
      id: quotes.id,
      status: quotes.status,
      total: quotes.total,
    })
    .from(quotes)
    .where(and(eq(quotes.appointmentId, job.id), eq(quotes.businessId, bid)))
    .limit(1);

  const relatedInvoiceLines = invoice
    ? await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoice.id))
    : [];

  res.json({
    id: job.id,
    appointmentId: job.id,
    jobNumber: `WO-${job.id.slice(0, 8).toUpperCase()}`,
    status: job.status,
    title: job.title,
    scheduledStart: job.startTime,
    scheduledEnd: job.endTime,
    totalPrice: job.totalPrice,
    notes: job.notes,
    internalNotes: job.internalNotes,
    completedAt: job.completedAt,
    cancelledAt: job.cancelledAt,
    client: job.clientId
      ? {
          id: job.clientId,
          firstName: job.clientFirstName,
          lastName: job.clientLastName,
          phone: job.clientPhone,
          email: job.clientEmail,
        }
      : null,
    vehicle: job.vehicleId
      ? {
          id: job.vehicleId,
          year: job.vehicleYear,
          make: job.vehicleMake,
          model: job.vehicleModel,
          color: job.vehicleColor,
          licensePlate: job.vehicleLicensePlate,
        }
      : null,
    assignedStaff: job.assignedStaffId
      ? { id: job.assignedStaffId, firstName: job.staffFirstName, lastName: job.staffLastName }
      : null,
    location: job.locationId ? { id: job.locationId, name: job.locationName, address: job.locationAddress } : null,
    services: jobServices.map((service) => ({
      id: service.id,
      serviceId: service.serviceId,
      name: service.serviceName,
      category: service.category,
      quantity: service.quantity,
      unitPrice: service.unitPrice,
      durationMinutes: service.durationMinutes,
    })),
    invoice: invoice ? { ...invoice, lineItems: relatedInvoiceLines } : null,
    quote: quote ?? null,
  });
});

jobsRouter.patch("/:id", requireAuth, requireTenant, requirePermission("jobs.write"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const parsed = updateJobSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");

  const [existing] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Job not found.");

  const nextStatus = parsed.data.status ?? existing.status;
  const [updated] = await db
    .update(appointments)
    .set({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.internalNotes !== undefined ? { internalNotes: parsed.data.internalNotes } : {}),
      ...(parsed.data.assignedStaffId !== undefined ? { assignedStaffId: parsed.data.assignedStaffId } : {}),
      ...(parsed.data.locationId !== undefined ? { locationId: parsed.data.locationId } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(nextStatus === "completed" && existing.completedAt == null ? { completedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, req.params.id))
    .returning();

  await createRequestActivityLog(req, {
    businessId: bid,
    action: "job.updated",
    entityType: "job",
    entityId: req.params.id,
    metadata: {
      status: updated?.status ?? nextStatus,
      title: updated?.title ?? existing.title ?? null,
    },
  });

  res.json(updated);
});
