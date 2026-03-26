import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "../db/index.js";
import { appointments, clients, vehicles, staff, locations, quotes, services, appointmentServices, businesses } from "../db/schema.js";
import { eq, and, or, desc, asc, gte, lte, ilike, sql } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { logger } from "../lib/logger.js";
import { hasAppointmentOverlap } from "../lib/appointmentOverlap.js";
import { ConflictError } from "../lib/errors.js";
import { recalculateAppointmentTotal } from "../lib/revenueTotals.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { sendAppointmentConfirmation } from "../lib/email.js";
import { isEmailConfigured } from "../lib/env.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { buildVehicleDisplayName } from "../lib/vehicleFormatting.js";

export const appointmentsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function isLocationSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

function isAppointmentSchemaDriftError(error: unknown): boolean {
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

let cachedAppointmentColumns: Set<string> | null = null;
let cachedAppointmentServiceColumns: Set<string> | null = null;
let cachedServiceColumns: Set<string> | null = null;

async function getAppointmentColumns(): Promise<Set<string>> {
  if (cachedAppointmentColumns) return cachedAppointmentColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments'
  `);
  const resultWithRows = result as unknown as { rows?: Array<{ column_name?: string }> };
  const rows = Array.isArray(resultWithRows.rows) ? resultWithRows.rows : [];
  cachedAppointmentColumns = new Set(
    rows
      .map((row) => row?.column_name)
      .filter((value): value is string => typeof value === "string")
  );
  return cachedAppointmentColumns;
}

async function getAppointmentServiceColumns(): Promise<Set<string>> {
  if (cachedAppointmentServiceColumns) return cachedAppointmentServiceColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointment_services'
  `);
  const resultWithRows = result as unknown as { rows?: Array<{ column_name?: string }> };
  const rows = Array.isArray(resultWithRows.rows) ? resultWithRows.rows : [];
  cachedAppointmentServiceColumns = new Set(
    rows
      .map((row) => row?.column_name)
      .filter((value): value is string => typeof value === "string")
  );
  return cachedAppointmentServiceColumns;
}

async function getServiceColumns(): Promise<Set<string>> {
  if (cachedServiceColumns) return cachedServiceColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'services'
  `);
  const resultWithRows = result as unknown as { rows?: Array<{ column_name?: string }> };
  const rows = Array.isArray(resultWithRows.rows) ? resultWithRows.rows : [];
  cachedServiceColumns = new Set(
    rows
      .map((row) => row?.column_name)
      .filter((value): value is string => typeof value === "string")
  );
  return cachedServiceColumns;
}

async function getServiceForBusinessSafe(
  tx: any,
  serviceId: string,
  bid: string
): Promise<{ id: string; name: string; price: string | null } | null> {
  try {
    const [service] = await tx
      .select({
        id: services.id,
        name: services.name,
        price: services.price,
      })
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.businessId, bid)))
      .limit(1);
    return service ?? null;
  } catch (error) {
    if (!isServiceSchemaDriftError(error)) throw error;
    const columns = await getServiceColumns();
    if (!columns.has("id") || !columns.has("business_id") || !columns.has("name")) {
      logger.warn("Appointment service lookup unavailable on legacy schema", {
        businessId: bid,
        serviceId,
        error,
      });
      return null;
    }
    const [service] = await tx
      .select({
        id: services.id,
        name: services.name,
        price: services.price,
      })
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.businessId, bid)))
      .limit(1);
    return service ?? null;
  }
}

async function attachServiceToAppointment(
  tx: any,
  {
    appointmentId,
    serviceId,
    unitPrice,
  }: {
    appointmentId: string;
    serviceId: string;
    unitPrice: string | null;
  }
): Promise<boolean> {
  const now = new Date();
  try {
    await tx.insert(appointmentServices).values({
      appointmentId,
      serviceId,
      quantity: 1,
      unitPrice,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  } catch (error) {
    if (!isAppointmentSchemaDriftError(error)) throw error;
    const columns = await getAppointmentServiceColumns();
    if (!columns.has("appointment_id") || !columns.has("service_id")) {
      logger.warn("Skipping appointment service link on legacy schema", {
        appointmentId,
        serviceId,
      });
      return false;
    }
    const fallbackValues: Partial<typeof appointmentServices.$inferInsert> = {};
    if (columns.has("id")) fallbackValues.id = randomUUID();
    if (columns.has("appointment_id")) fallbackValues.appointmentId = appointmentId;
    if (columns.has("service_id")) fallbackValues.serviceId = serviceId;
    if (columns.has("quantity")) fallbackValues.quantity = 1;
    if (columns.has("unit_price")) fallbackValues.unitPrice = unitPrice;
    if (columns.has("created_at")) fallbackValues.createdAt = now;
    if (columns.has("updated_at")) fallbackValues.updatedAt = now;
    await tx.insert(appointmentServices).values(fallbackValues as typeof appointmentServices.$inferInsert);
    return true;
  }
}

async function locationExistsForBusiness(locationId: string, bid: string): Promise<boolean> {
  try {
    const [loc] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.businessId, bid)))
      .limit(1);
    return !!loc;
  } catch (error) {
    if (!isLocationSchemaDriftError(error)) throw error;
    const [loc] = await db
      .select({
        id: locations.id,
        businessId: locations.businessId,
        name: locations.name,
        address: locations.address,
        active: locations.active,
        createdAt: locations.createdAt,
        updatedAt: locations.updatedAt,
      })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.businessId, bid)))
      .limit(1);
    return !!loc;
  }
}

async function updateAppointmentTotalIfSupported(
  tx: any,
  appointmentId: string,
  totalPrice: string
) {
  const appointmentColumns = await getAppointmentColumns();
  if (!appointmentColumns.has("total_price")) return;
  const updates: Record<string, unknown> = {
    totalPrice,
  };
  if (appointmentColumns.has("updated_at")) {
    updates.updatedAt = new Date();
  }
  await tx
    .update(appointments)
    .set(updates as Partial<typeof appointments.$inferInsert>)
    .where(eq(appointments.id, appointmentId));
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
  depositAmount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  /** When set, links quote → appointment and marks quote accepted (client/vehicle must match quote). */
  quoteId: z.string().uuid().optional(),
  /** Catalog services to attach (prices from service catalog). */
  serviceIds: z.array(z.string().uuid()).optional(),
});
const updateSchema = z
  .object({
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    title: z.string().nullable().optional(),
    assignedStaffId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    depositAmount: z.coerce.number().min(0).optional(),
    notes: z.string().optional(),
    internalNotes: z.string().optional(),
  })
  .strict();
function parseIsoDate(s: string | undefined): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

type AppointmentDeliveryStatus = "emailed" | "missing_email" | "smtp_disabled" | "email_failed";

async function buildAppointmentConfirmationPayload(appointmentId: string, bid: string) {
  const [appointmentRow] = await db
    .select({
      id: appointments.id,
      startTime: appointments.startTime,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientEmail: clients.email,
      businessName: businesses.name,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      locationAddress: locations.address,
    })
    .from(appointments)
    .leftJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.businessId, bid)))
    .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, bid)))
    .leftJoin(businesses, eq(appointments.businessId, businesses.id))
    .leftJoin(locations, and(eq(appointments.locationId, locations.id), eq(locations.businessId, bid)))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, bid)))
    .limit(1);

  if (!appointmentRow) return null;

  let serviceRows: Array<{ name: string | null }> = [];
  try {
    serviceRows = await db
      .select({ name: services.name })
      .from(appointmentServices)
      .innerJoin(services, eq(appointmentServices.serviceId, services.id))
      .where(eq(appointmentServices.appointmentId, appointmentId))
      .orderBy(asc(services.name));
  } catch (error) {
    if (!isAppointmentSchemaDriftError(error)) throw error;
    logger.warn("Appointment confirmation service summary unavailable on legacy schema", {
      appointmentId,
      businessId: bid,
      error,
    });
  }

  return {
    appointmentId: appointmentRow.id,
    recipient: appointmentRow.clientEmail?.trim() || null,
    clientName:
      `${appointmentRow.clientFirstName ?? ""} ${appointmentRow.clientLastName ?? ""}`.trim() || "Customer",
    businessName: appointmentRow.businessName ?? "Your shop",
    dateTime: appointmentRow.startTime
      ? new Date(appointmentRow.startTime).toLocaleString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "Scheduled appointment",
    vehicle:
      buildVehicleDisplayName({
        year: appointmentRow.vehicleYear,
        make: appointmentRow.vehicleMake,
        model: appointmentRow.vehicleModel,
      }) || null,
    address: appointmentRow.locationAddress ?? null,
    serviceSummary:
      serviceRows.length > 0 ? `Services: ${serviceRows.map((service) => service.name).join(", ")}` : null,
    confirmationUrl: `${process.env.FRONTEND_URL?.trim() ?? ""}/appointments/${appointmentRow.id}`,
  };
}

async function sendAppointmentConfirmationForRecord(
  appointmentId: string,
  bid: string
): Promise<{ deliveryStatus: AppointmentDeliveryStatus; deliveryError: string | null; recipient: string | null }> {
  const payload = await buildAppointmentConfirmationPayload(appointmentId, bid);
  if (!payload) {
    return {
      deliveryStatus: "email_failed",
      deliveryError: "Appointment confirmation context could not be loaded.",
      recipient: null,
    };
  }
  if (!payload.recipient) {
    logger.warn("Appointment confirmation skipped: client email missing", { appointmentId, businessId: bid });
    return { deliveryStatus: "missing_email", deliveryError: "Client does not have an email address.", recipient: null };
  }
  if (!isEmailConfigured()) {
    logger.error("Appointment confirmation blocked: SMTP is not configured", { appointmentId, businessId: bid });
    return {
      deliveryStatus: "smtp_disabled",
      deliveryError: "Transactional email is not configured.",
      recipient: payload.recipient,
    };
  }
  try {
    await sendAppointmentConfirmation({
      to: payload.recipient,
      businessId: bid,
      clientName: payload.clientName,
      businessName: payload.businessName,
      dateTime: payload.dateTime,
      vehicle: payload.vehicle,
      address: payload.address,
      serviceSummary: payload.serviceSummary,
      confirmationUrl: payload.confirmationUrl,
    });
    return { deliveryStatus: "emailed", deliveryError: null, recipient: payload.recipient };
  } catch (error) {
    const deliveryError = error instanceof Error ? error.message : String(error);
    logger.error("Appointment confirmation email failed", { appointmentId, businessId: bid, error: deliveryError });
    return { deliveryStatus: "email_failed", deliveryError, recipient: payload.recipient };
  }
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
  const locationIdRaw = typeof req.query.locationId === "string" ? req.query.locationId.trim() : "";
  const locationIdFilter = z.string().uuid().safeParse(locationIdRaw).success ? locationIdRaw : undefined;
  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const statusParsed = appointmentStatusSchema.safeParse(statusRaw);
  const statusFilter = statusParsed.success ? statusParsed.data : undefined;

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const conditions = [eq(appointments.businessId, bid)];
  if (clientIdFilter) conditions.push(eq(appointments.clientId, clientIdFilter));
  if (vehicleIdFilter) conditions.push(eq(appointments.vehicleId, vehicleIdFilter));
  if (locationIdFilter) conditions.push(eq(appointments.locationId, locationIdFilter));
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
        ? {
            year: row.vehicleYear ?? null,
            make: row.vehicleMake,
            model: row.vehicleModel,
            trim: null,
            displayName: buildVehicleDisplayName({
              year: row.vehicleYear,
              make: row.vehicleMake,
              model: row.vehicleModel,
            }),
          }
        : null,
    assignedStaff:
      row.assignedStaffId != null
        ? { id: row.assignedStaffId, firstName: row.staffFirstName, lastName: row.staffLastName }
        : null,
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
            trim: null,
            displayName: buildVehicleDisplayName({
              year: row.vehicleYear,
              make: row.vehicleMake,
              model: row.vehicleModel,
            }),
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

appointmentsRouter.post("/", requireAuth, requireTenant, wrapAsync(async (req: Request, res: Response) => {
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
    const hasLocation = await locationExistsForBusiness(parsed.data.locationId, bid);
    if (!hasLocation) throw new BadRequestError("Location not found or access denied.");
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

  const createdAt = new Date();
  const appointmentId = randomUUID();
  const created = await db.transaction(async (tx) => {
    let selectedServicesTotal = 0;
    let attachedAnyService = false;
    let apt: typeof appointments.$inferSelect | undefined;
    try {
      [apt] = await tx
        .insert(appointments)
        .values({
          id: appointmentId,
          businessId: bid,
          clientId: parsed.data.clientId,
          vehicleId: parsed.data.vehicleId,
          startTime,
          endTime,
          title: parsed.data.title ?? null,
          assignedStaffId: parsed.data.assignedStaffId ?? null,
          locationId: parsed.data.locationId ?? null,
          depositAmount: parsed.data.depositAmount != null ? String(parsed.data.depositAmount) : "0",
          notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
          internalNotes: parsed.data.internalNotes?.trim() ? parsed.data.internalNotes.trim() : null,
          totalPrice: totalPriceInit,
          createdAt,
          updatedAt: createdAt,
        })
        .returning();
    } catch (error) {
      if (!isAppointmentSchemaDriftError(error)) throw error;
      const columns = await getAppointmentColumns();
      const fallbackValues: Record<string, unknown> = {
        id: appointmentId,
        businessId: bid,
        clientId: parsed.data.clientId,
        vehicleId: parsed.data.vehicleId,
        startTime,
      };
      if (columns.has("end_time")) fallbackValues.endTime = endTime;
      if (columns.has("title")) fallbackValues.title = parsed.data.title ?? null;
      if (columns.has("assigned_staff_id")) fallbackValues.assignedStaffId = parsed.data.assignedStaffId ?? null;
      if (columns.has("location_id")) fallbackValues.locationId = parsed.data.locationId ?? null;
      if (columns.has("deposit_amount")) fallbackValues.depositAmount = parsed.data.depositAmount != null ? String(parsed.data.depositAmount) : "0";
      if (columns.has("notes")) fallbackValues.notes = parsed.data.notes?.trim() ? parsed.data.notes.trim() : null;
      if (columns.has("internal_notes")) fallbackValues.internalNotes = parsed.data.internalNotes?.trim() ? parsed.data.internalNotes.trim() : null;
      if (columns.has("total_price")) fallbackValues.totalPrice = totalPriceInit;
      if (columns.has("status")) fallbackValues.status = "scheduled";
      if (columns.has("created_at")) fallbackValues.createdAt = createdAt;
      if (columns.has("updated_at")) fallbackValues.updatedAt = createdAt;
      [apt] = await tx
        .insert(appointments)
        .values(fallbackValues as typeof appointments.$inferInsert)
        .returning();
    }
    if (!apt) throw new BadRequestError("Failed to create appointment.");

    if (parsed.data.quoteId) {
      await tx
        .update(quotes)
        .set({ appointmentId: apt.id, status: "accepted", updatedAt: new Date() })
        .where(eq(quotes.id, parsed.data.quoteId));
    }

    if (parsed.data.serviceIds && parsed.data.serviceIds.length > 0) {
      for (const sid of parsed.data.serviceIds) {
        const svc = await getServiceForBusinessSafe(tx, sid, bid);
        if (!svc) continue;
        selectedServicesTotal += Number(svc.price ?? 0);
        const attached = await attachServiceToAppointment(tx, {
          appointmentId: apt.id,
          serviceId: sid,
          unitPrice: svc.price ?? null,
        });
        attachedAnyService ||= attached;
      }
      if (attachedAnyService) {
        try {
          await recalculateAppointmentTotal(tx, apt.id);
        } catch (error) {
          if (!isAppointmentSchemaDriftError(error)) throw error;
          logger.warn("Appointment total recalculation falling back on legacy schema", {
            appointmentId: apt.id,
            businessId: bid,
            error,
          });
          await updateAppointmentTotalIfSupported(tx, apt.id, selectedServicesTotal.toFixed(2));
        }
      } else {
        await updateAppointmentTotalIfSupported(tx, apt.id, selectedServicesTotal.toFixed(2));
      }
    }

    return apt;
  });

  logger.info("Appointment created", { appointmentId: created.id, businessId: bid });
  try {
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
  } catch (error) {
    logger.warn("Appointment created but activity log write failed", { appointmentId: created.id, businessId: bid, error });
  }
  let confirmationResult: { deliveryStatus: AppointmentDeliveryStatus; deliveryError: string | null; recipient: string | null } = {
    deliveryStatus: "email_failed",
    deliveryError: "Appointment confirmation was skipped after a post-create failure.",
    recipient: null,
  };
  try {
    confirmationResult = await sendAppointmentConfirmationForRecord(created.id, bid);
  } catch (error) {
    logger.warn("Appointment created but confirmation pipeline failed", { appointmentId: created.id, businessId: bid, error });
  }
  try {
    await createRequestActivityLog(req, {
      businessId: bid,
      action:
        confirmationResult.deliveryStatus === "emailed"
          ? "appointment.confirmation_sent"
          : "appointment.confirmation_failed",
      entityType: "appointment",
      entityId: created.id,
      metadata: {
        recipient: confirmationResult.recipient,
        deliveryStatus: confirmationResult.deliveryStatus,
        deliveryError: confirmationResult.deliveryError,
      },
    });
  } catch (error) {
    logger.warn("Appointment confirmation activity log failed", { appointmentId: created.id, businessId: bid, error });
  }
  res.status(201).json({ ...created, ...confirmationResult });
}));

appointmentsRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(appointments).where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Appointment not found.");
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  if (parsed.data.assignedStaffId != null) {
    const [staffRow] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.id, parsed.data.assignedStaffId), eq(staff.businessId, bid)))
      .limit(1);
    if (!staffRow) throw new BadRequestError("Staff not found or access denied.");
  }

  if (parsed.data.locationId != null) {
    const hasLocation = await locationExistsForBusiness(parsed.data.locationId, bid);
    if (!hasLocation) throw new BadRequestError("Location not found or access denied.");
  }

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
  if (parsed.data.depositAmount != null) updates.depositAmount = String(parsed.data.depositAmount);
  if (parsed.data.notes != null) updates.notes = parsed.data.notes.trim() || null;
  if (parsed.data.internalNotes != null) updates.internalNotes = parsed.data.internalNotes.trim() || null;
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

appointmentsRouter.post("/:id/sendConfirmation", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Appointment not found.");

  const confirmationResult = await sendAppointmentConfirmationForRecord(existing.id, bid);
  await createRequestActivityLog(req, {
    businessId: bid,
    action:
      confirmationResult.deliveryStatus === "emailed"
        ? "appointment.confirmation_sent"
        : "appointment.confirmation_failed",
    entityType: "appointment",
    entityId: existing.id,
    metadata: {
      recipient: confirmationResult.recipient,
      deliveryStatus: confirmationResult.deliveryStatus,
      deliveryError: confirmationResult.deliveryError,
    },
  });

  res.json({
    ok: confirmationResult.deliveryStatus === "emailed",
    ...confirmationResult,
  });
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
  if (!updated) {
    res.json(updated);
    return;
  }

  if (status === "confirmed") {
    const confirmationResult = await sendAppointmentConfirmationForRecord(updated.id, bid);
    await createRequestActivityLog(req, {
      businessId: bid,
      action:
        confirmationResult.deliveryStatus === "emailed"
          ? "appointment.confirmation_sent"
          : "appointment.confirmation_failed",
      entityType: "appointment",
      entityId: updated.id,
      metadata: {
        recipient: confirmationResult.recipient,
        deliveryStatus: confirmationResult.deliveryStatus,
        deliveryError: confirmationResult.deliveryError,
      },
    });
    res.json({ ...updated, ...confirmationResult });
    return;
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
