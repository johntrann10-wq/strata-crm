import express, { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "../db/index.js";
import { appointments, clients, vehicles, staff, locations, quotes, services, appointmentServices, businesses, invoices, activityLogs } from "../db/schema.js";
import { eq, and, or, desc, asc, gte, lte, ilike, sql } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { logger } from "../lib/logger.js";
import { countOverlappingAppointments, hasAppointmentOverlap } from "../lib/appointmentOverlap.js";
import { ConflictError } from "../lib/errors.js";
import { calculateAppointmentFinanceTotals, recalculateAppointmentTotal } from "../lib/revenueTotals.js";
import { createActivityLog, createRequestActivityLog } from "../lib/activity.js";
import { sendAppointmentChangeRequestAlert, sendAppointmentConfirmation } from "../lib/email.js";
import { isEmailConfigured } from "../lib/env.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { buildVehicleDisplayName } from "../lib/vehicleFormatting.js";
import { getBusinessTypeDefaults } from "../lib/businessTypeDefaults.js";
import { buildPublicAppUrl, buildPublicDocumentUrl, createPublicDocumentToken, verifyPublicDocumentToken } from "../lib/publicDocumentAccess.js";
import { createAppointmentDepositCheckoutSession, retrieveCheckoutSession, retrieveConnectAccount } from "../lib/stripe.js";
import { renderAppointmentHtml } from "../lib/appointmentTemplate.js";
import { scheduleGoogleCalendarAppointmentSync } from "../lib/googleCalendar.js";
import { enqueueTwilioTemplateSms } from "../lib/twilio.js";

export const appointmentsRouter = Router({ mergeParams: true });

const CALENDAR_BLOCK_PREFIX = "[[calendar-block:";

export function canDeleteAppointmentWithInvoiceStatuses(
  statuses: Array<string | null | undefined>
): boolean {
  return statuses.every((status) => status == null || status === "void");
}

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

async function getAppointmentCollectedAmount(appointmentId: string, businessIdValue: string): Promise<number> {
  const paymentRows = await db
    .select({
      action: activityLogs.action,
      metadata: activityLogs.metadata,
    })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, businessIdValue),
        eq(activityLogs.entityType, "appointment"),
        eq(activityLogs.entityId, appointmentId),
        or(
          eq(activityLogs.action, "appointment.deposit_paid"),
          eq(activityLogs.action, "appointment.deposit_payment_reversed")
        )
      )
    )
    .orderBy(asc(activityLogs.createdAt));

  let total = 0;
  for (const row of paymentRows) {
    let amount = 0;
    try {
      const parsed = row.metadata ? (JSON.parse(row.metadata) as { amount?: number | string | null }) : null;
      amount = Number(parsed?.amount ?? 0);
    } catch {
      amount = 0;
    }
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (row.action === "appointment.deposit_paid") total += amount;
    if (row.action === "appointment.deposit_payment_reversed") total -= amount;
  }

  return Math.max(0, Number(total.toFixed(2)));
}

async function confirmAppointmentDepositCheckout(params: {
  appointmentId: string;
  businessId: string;
  sessionId: string;
  connectedAccountId?: string | null;
}): Promise<boolean> {
  const sessionId = params.sessionId.trim();
  if (!sessionId || !params.connectedAccountId?.trim()) return false;

  const session = await retrieveCheckoutSession({
    sessionId,
    connectedAccountId: params.connectedAccountId,
  });
  if (!session) return false;

  if (session.payment_status !== "paid") {
    logger.info("Stripe appointment deposit return did not confirm a paid session", {
      sessionId,
      appointmentId: params.appointmentId,
      businessId: params.businessId,
      status: session.status,
      paymentStatus: session.payment_status,
    });
    return false;
  }

  const purpose = session.metadata?.purpose;
  const businessId = session.metadata?.businessId;
  const appointmentId = session.metadata?.appointmentId;
  if (
    purpose !== "appointment_deposit" ||
    businessId !== params.businessId ||
    appointmentId !== params.appointmentId
  ) {
    logger.warn("Stripe appointment deposit return metadata mismatch", {
      sessionId,
      expectedBusinessId: params.businessId,
      expectedAppointmentId: params.appointmentId,
      purpose,
      businessId,
      appointmentId,
    });
    return false;
  }

  const [updated] = await db
    .update(appointments)
    .set({
      depositPaid: true,
      updatedAt: new Date(),
    })
    .where(and(eq(appointments.id, params.appointmentId), eq(appointments.businessId, params.businessId)))
    .returning({
      id: appointments.id,
      depositPaid: appointments.depositPaid,
    });

  if (!updated?.depositPaid) {
    logger.warn("Stripe appointment deposit return could not persist deposit state", {
      sessionId,
      appointmentId: params.appointmentId,
      businessId: params.businessId,
    });
    return false;
  }

  logger.info("Stripe appointment deposit confirmed from return session", {
    sessionId,
    appointmentId: params.appointmentId,
    businessId: params.businessId,
  });
  return true;
}

const confirmStripeDepositSessionSchema = z.object({
  sessionId: z.string().trim().min(1, "sessionId is required"),
});

function isCalendarBlockInternalNotes(value: string | null | undefined): boolean {
  return String(value ?? "").trim().startsWith(CALENDAR_BLOCK_PREFIX);
}

async function getCalendarBlockCapacityPerSlot(bid: string): Promise<number> {
  const [business] = await db
    .select({ calendarBlockCapacityPerSlot: businesses.calendarBlockCapacityPerSlot })
    .from(businesses)
    .where(eq(businesses.id, bid))
    .limit(1);
  const capacity = Number(business?.calendarBlockCapacityPerSlot ?? 1);
  if (!Number.isFinite(capacity) || capacity < 1) return 1;
  return Math.min(capacity, 12);
}

async function getAppointmentCapacityPerSlot(bid: string): Promise<number> {
  return getCalendarBlockCapacityPerSlot(bid);
}

async function countOverlappingCalendarBlocks(params: {
  businessId: string;
  startTime: Date;
  endTime: Date | null;
  assignedStaffId?: string | null;
  excludeAppointmentId?: string | null;
}): Promise<number> {
  const end = params.endTime && params.endTime.getTime() > params.startTime.getTime()
    ? params.endTime
    : new Date(params.startTime.getTime() + 60 * 60 * 1000);

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appointments)
    .where(
      sql`${appointments.businessId} = ${params.businessId}
        AND ${appointments.status} NOT IN ('cancelled', 'no-show')
        AND ${appointments.internalNotes} LIKE ${`${CALENDAR_BLOCK_PREFIX}%`}
        AND (${appointments.startTime} < ${end})
        AND (COALESCE(${appointments.endTime}, ${appointments.startTime} + interval '1 hour') > ${params.startTime})
        ${
          params.excludeAppointmentId
            ? sql`AND ${appointments.id} != ${params.excludeAppointmentId}`
            : sql``
        }
        ${
          params.assignedStaffId
            ? sql`AND ${appointments.assignedStaffId} = ${params.assignedStaffId}`
            : sql`AND ${appointments.assignedStaffId} IS NULL`
        }`
    );

  return Number(result[0]?.count ?? 0);
}

function isLocationSchemaDriftError(error: unknown): boolean {
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
  finance: {
    subtotal: string;
    taxRate: string;
    taxAmount: string;
    applyTax: boolean;
    adminFeeRate: string;
    adminFeeAmount: string;
    applyAdminFee: boolean;
    totalPrice: string;
  }
) {
  const appointmentColumns = await getAppointmentColumns();
  if (!appointmentColumns.has("total_price")) return;
  const updates: Record<string, unknown> = {
    totalPrice: finance.totalPrice,
  };
  if (appointmentColumns.has("subtotal")) updates.subtotal = finance.subtotal;
  if (appointmentColumns.has("tax_rate")) updates.taxRate = finance.taxRate;
  if (appointmentColumns.has("tax_amount")) updates.taxAmount = finance.taxAmount;
  if (appointmentColumns.has("apply_tax")) updates.applyTax = finance.applyTax;
  if (appointmentColumns.has("admin_fee_rate")) updates.adminFeeRate = finance.adminFeeRate;
  if (appointmentColumns.has("admin_fee_amount")) updates.adminFeeAmount = finance.adminFeeAmount;
  if (appointmentColumns.has("apply_admin_fee")) updates.applyAdminFee = finance.applyAdminFee;
  if (appointmentColumns.has("updated_at")) {
    updates.updatedAt = new Date();
  }
  await tx
    .update(appointments)
    .set(updates as Partial<typeof appointments.$inferInsert>)
    .where(eq(appointments.id, appointmentId));
}

const createAppointmentReturning = {
  id: appointments.id,
  businessId: appointments.businessId,
  clientId: appointments.clientId,
  vehicleId: appointments.vehicleId,
  startTime: appointments.startTime,
  endTime: appointments.endTime,
  jobStartTime: appointments.jobStartTime,
  expectedCompletionTime: appointments.expectedCompletionTime,
  pickupReadyTime: appointments.pickupReadyTime,
  vehicleOnSite: appointments.vehicleOnSite,
  jobPhase: appointments.jobPhase,
  subtotal: appointments.subtotal,
  taxRate: appointments.taxRate,
  taxAmount: appointments.taxAmount,
  applyTax: appointments.applyTax,
  adminFeeRate: appointments.adminFeeRate,
  adminFeeAmount: appointments.adminFeeAmount,
  applyAdminFee: appointments.applyAdminFee,
  totalPrice: appointments.totalPrice,
};

type CreatedAppointmentRecord = {
  id: string;
  businessId: string;
  clientId: string | null;
  vehicleId: string | null;
  startTime: Date;
  endTime: Date | null;
  jobStartTime: Date | null;
  expectedCompletionTime: Date | null;
  pickupReadyTime: Date | null;
  vehicleOnSite: boolean | null;
  jobPhase: string;
  subtotal: string | null;
  taxRate: string | null;
  taxAmount: string | null;
  applyTax: boolean | null;
  adminFeeRate: string | null;
  adminFeeAmount: string | null;
  applyAdminFee: boolean | null;
  totalPrice: string | null;
};

const appointmentStatusSchema = z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no-show"]);
const appointmentJobPhaseSchema = z.enum([
  "scheduled",
  "active_work",
  "waiting",
  "curing",
  "hold",
  "pickup_ready",
]);
const createSchema = z.object({
  clientId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  jobStartTime: z.string().datetime().optional(),
  expectedCompletionTime: z.string().datetime().optional(),
  pickupReadyTime: z.string().datetime().optional(),
  vehicleOnSite: z.boolean().optional(),
  jobPhase: appointmentJobPhaseSchema.optional(),
  title: z.string().optional(),
  assignedStaffId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  depositAmount: z.coerce.number().min(0).optional(),
  depositPaid: z.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  applyTax: z.boolean().optional(),
  adminFeeRate: z.coerce.number().min(0).max(100).optional(),
  applyAdminFee: z.boolean().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  /** When set, links quote → appointment and marks quote accepted (client/vehicle must match quote). */
  quoteId: z.string().uuid().optional(),
  /** Catalog services to attach (prices from service catalog). */
  serviceIds: z.array(z.string().uuid()).optional(),
  serviceSelections: z
    .array(
      z.object({
        serviceId: z.string().uuid(),
        unitPrice: z.coerce.number().min(0).optional(),
      })
    )
    .optional(),
});
const updateSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    vehicleId: z.string().uuid().optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    jobStartTime: z.string().datetime().nullable().optional(),
    expectedCompletionTime: z.string().datetime().nullable().optional(),
    pickupReadyTime: z.string().datetime().nullable().optional(),
    vehicleOnSite: z.boolean().optional(),
    jobPhase: appointmentJobPhaseSchema.optional(),
    title: z.string().nullable().optional(),
    assignedStaffId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    depositAmount: z.coerce.number().min(0).optional(),
    depositPaid: z.boolean().optional(),
    totalPrice: z.coerce.number().min(0).optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    applyTax: z.boolean().optional(),
    adminFeeRate: z.coerce.number().min(0).max(100).optional(),
    applyAdminFee: z.boolean().optional(),
    notes: z.string().optional(),
    internalNotes: z.string().optional(),
  })
  .strict();
const sendConfirmationSchema = z.object({
  message: z.string().max(2000).optional(),
  recipientEmail: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().email().optional()
  ),
  recipientName: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(120).optional()
  ),
});

const publicChangeRequestSchema = z.object({
  preferredTiming: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(200).optional()
  ),
  message: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(1000).optional()
  ),
});

const depositPaymentMethodSchema = z.enum([
  "cash",
  "card",
  "check",
  "venmo",
  "cashapp",
  "zelle",
  "other",
]);

const recordDepositPaymentSchema = z.object({
  amount: z.number().positive(),
  method: depositPaymentMethodSchema,
  notes: z.string().trim().max(1000).optional(),
  referenceNumber: z.string().trim().max(120).optional(),
  paidAt: z.union([z.string(), z.date()]).optional(),
});
function parseIsoDate(s: string | undefined): Date | undefined {
  if (!s?.trim()) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function assertAppointmentLifecycle({
  workStart,
  workEnd,
  jobStart,
  expectedCompletion,
  pickupReady,
}: {
  workStart: Date;
  workEnd: Date | null;
  jobStart: Date;
  expectedCompletion: Date | null;
  pickupReady: Date | null;
}) {
  if (workEnd && workEnd.getTime() <= workStart.getTime()) {
    throw new BadRequestError("Appointment end time must be after the start time.");
  }
  if (jobStart.getTime() > workStart.getTime()) {
    throw new BadRequestError("Job start cannot be after the scheduled labor start time.");
  }
  if (expectedCompletion && expectedCompletion.getTime() < jobStart.getTime()) {
    throw new BadRequestError("Expected completion must be after the job start.");
  }
  if (pickupReady && pickupReady.getTime() < jobStart.getTime()) {
    throw new BadRequestError("Pickup-ready time must be after the job start.");
  }
}

function intersectsRange(params: {
  rangeStart?: Date;
  rangeEnd?: Date;
  itemStart: Date;
  itemEnd: Date;
}): boolean {
  if (params.rangeStart && params.itemEnd.getTime() < params.rangeStart.getTime()) return false;
  if (params.rangeEnd && params.itemStart.getTime() > params.rangeEnd.getTime()) return false;
  return true;
}

type AppointmentDeliveryStatus = "emailed" | "disabled" | "missing_email" | "smtp_disabled" | "email_failed";

function extractMobileServiceAddress(notes: string | null | undefined): string | null {
  const text = notes?.trim();
  if (!text) return null;
  const match = text.match(/Mobile service address:\s*(.+)/i);
  return match?.[1]?.trim() || null;
}

function formatAppointmentDateTime(value: Date | string | null | undefined, timezone: string | null | undefined): string {
  if (!value) return "Scheduled appointment";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Scheduled appointment";

  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone?.trim() || undefined,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(date);
  }
}

async function buildAppointmentConfirmationPayload(
  appointmentId: string,
  bid: string,
  overrides?: { recipientEmail?: string | null; recipientName?: string | null; message?: string | null }
) {
  let appointmentRow:
    | {
        id: string;
        startTime: Date;
        notes: string | null;
        clientFirstName: string | null;
        clientLastName: string | null;
        clientEmail: string | null;
        clientPhone: string | null;
        businessName: string | null;
        businessTimezone: string | null;
        businessType: string | null;
        notificationAppointmentConfirmationEmailEnabled: boolean | null;
        vehicleYear: number | null;
        vehicleMake: string | null;
        vehicleModel: string | null;
        locationName: string | null;
        locationAddress: string | null;
        locationTimezone: string | null;
        depositAmount: string | null;
        depositPaid: boolean | null;
      }
    | undefined;
  try {
    [appointmentRow] = await db
      .select({
        id: appointments.id,
        startTime: appointments.startTime,
        notes: appointments.notes,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientEmail: clients.email,
        clientPhone: clients.phone,
        businessName: businesses.name,
        businessTimezone: businesses.timezone,
        businessType: businesses.type,
        notificationAppointmentConfirmationEmailEnabled:
          businesses.notificationAppointmentConfirmationEmailEnabled,
        vehicleYear: vehicles.year,
        vehicleMake: vehicles.make,
        vehicleModel: vehicles.model,
        locationName: locations.name,
        locationAddress: locations.address,
        locationTimezone: locations.timezone,
        depositAmount: appointments.depositAmount,
        depositPaid: appointments.depositPaid,
      })
      .from(appointments)
      .leftJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.businessId, bid)))
      .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, bid)))
      .leftJoin(businesses, eq(appointments.businessId, businesses.id))
      .leftJoin(locations, and(eq(appointments.locationId, locations.id), eq(locations.businessId, bid)))
      .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, bid)))
      .limit(1);
  } catch (error) {
    if (!isLocationSchemaDriftError(error)) throw error;
    logger.warn("Appointment confirmation falling back without location/business timezone columns", {
      appointmentId,
      businessId: bid,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      [appointmentRow] = await db
        .select({
          id: appointments.id,
          startTime: appointments.startTime,
          notes: appointments.notes,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientEmail: clients.email,
          clientPhone: clients.phone,
          businessName: businesses.name,
          businessTimezone: sql<string | null>`null`,
          businessType: businesses.type,
          notificationAppointmentConfirmationEmailEnabled: sql<boolean | null>`true`,
          vehicleYear: vehicles.year,
          vehicleMake: vehicles.make,
          vehicleModel: vehicles.model,
          locationName: locations.name,
          locationAddress: locations.address,
          locationTimezone: sql<string | null>`null`,
          depositAmount: appointments.depositAmount,
          depositPaid: appointments.depositPaid,
        })
        .from(appointments)
        .leftJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.businessId, bid)))
        .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, bid)))
        .leftJoin(businesses, eq(appointments.businessId, businesses.id))
        .leftJoin(locations, and(eq(appointments.locationId, locations.id), eq(locations.businessId, bid)))
        .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, bid)))
        .limit(1);
    } catch (fallbackError) {
      if (!isLocationSchemaDriftError(fallbackError)) throw fallbackError;
      logger.warn("Appointment confirmation falling back without locations join", {
        appointmentId,
        businessId: bid,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      [appointmentRow] = await db
        .select({
          id: appointments.id,
          startTime: appointments.startTime,
          notes: appointments.notes,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientEmail: clients.email,
          clientPhone: clients.phone,
          businessName: businesses.name,
          businessTimezone: sql<string | null>`null`,
          businessType: businesses.type,
          notificationAppointmentConfirmationEmailEnabled: sql<boolean | null>`true`,
          vehicleYear: vehicles.year,
          vehicleMake: vehicles.make,
          vehicleModel: vehicles.model,
          locationName: sql<string | null>`null`,
          locationAddress: sql<string | null>`null`,
          locationTimezone: sql<string | null>`null`,
          depositAmount: appointments.depositAmount,
          depositPaid: appointments.depositPaid,
        })
        .from(appointments)
        .leftJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.businessId, bid)))
        .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, bid)))
        .leftJoin(businesses, eq(appointments.businessId, businesses.id))
        .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, bid)))
        .limit(1);
    }
  }

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

  const publicToken = createPublicDocumentToken({
    kind: "appointment",
    entityId: appointmentRow.id,
    businessId: bid,
  });
  const publicAppointmentUrl = buildPublicDocumentUrl(
    `/api/appointments/${appointmentRow.id}/public-html?token=${encodeURIComponent(publicToken)}`
  );
  const depositAmount = Number(appointmentRow.depositAmount ?? 0);
  const hasDepositDue = Number.isFinite(depositAmount) && depositAmount > 0 && !appointmentRow.depositPaid;

  return {
    appointmentId: appointmentRow.id,
    recipient: overrides?.recipientEmail?.trim() || appointmentRow.clientEmail?.trim() || null,
    recipientPhone: appointmentRow.clientPhone?.trim() || null,
    clientName:
      overrides?.recipientName?.trim() ||
      `${appointmentRow.clientFirstName ?? ""} ${appointmentRow.clientLastName ?? ""}`.trim() ||
      "Customer",
    businessName: appointmentRow.businessName ?? "Your shop",
    dateTime: formatAppointmentDateTime(
      appointmentRow.startTime,
      appointmentRow.locationTimezone ??
        appointmentRow.businessTimezone ??
        getBusinessTypeDefaults(appointmentRow.businessType).timezone
    ),
    vehicle:
      buildVehicleDisplayName({
        year: appointmentRow.vehicleYear,
        make: appointmentRow.vehicleMake,
        model: appointmentRow.vehicleModel,
      }) || null,
    address: (() => {
      const mobileAddress = extractMobileServiceAddress(appointmentRow.notes);
      if (mobileAddress) return mobileAddress;
      const locationAddress = [appointmentRow.locationName, appointmentRow.locationAddress].filter(Boolean).join(" - ");
      return locationAddress || null;
    })(),
    serviceSummary:
      serviceRows.length > 0 ? `Services: ${serviceRows.map((service) => service.name).join(", ")}` : null,
    confirmationUrl: publicAppointmentUrl,
    portalUrl: buildPublicAppUrl(`/portal/${encodeURIComponent(publicToken)}`),
    confirmationActionLabel: hasDepositDue ? "View appointment and pay deposit" : "View appointment",
    paymentStatus: hasDepositDue
      ? `A deposit of $${depositAmount.toFixed(2)} is still due for this appointment.`
      : appointmentRow.depositPaid
        ? "Deposit already collected."
        : "No deposit is required for this appointment.",
    message: overrides?.message?.trim() || null,
    business: {
      notificationAppointmentConfirmationEmailEnabled:
        appointmentRow.notificationAppointmentConfirmationEmailEnabled ?? true,
    },
  };
}

async function sendAppointmentConfirmationForRecord(
  appointmentId: string,
  bid: string,
  overrides?: { recipientEmail?: string | null; recipientName?: string | null; message?: string | null }
): Promise<{ deliveryStatus: AppointmentDeliveryStatus; deliveryError: string | null; recipient: string | null }> {
  let payload:
    | Awaited<ReturnType<typeof buildAppointmentConfirmationPayload>>
    | null = null;
  try {
    payload = await buildAppointmentConfirmationPayload(appointmentId, bid, overrides);
  } catch (error) {
    const deliveryError = error instanceof Error ? error.message : String(error);
    logger.warn("Appointment confirmation context build failed", {
      appointmentId,
      businessId: bid,
      error: deliveryError,
    });
    return {
      deliveryStatus: "email_failed",
      deliveryError,
      recipient: overrides?.recipientEmail?.trim() || null,
    };
  }
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
  if (!payload.business.notificationAppointmentConfirmationEmailEnabled) {
    void enqueueTwilioTemplateSms({
      businessId: bid,
      templateSlug: "appointment_confirmation",
      to: payload.recipientPhone,
      vars: {
        clientName: payload.clientName,
        businessName: payload.businessName,
        dateTime: payload.dateTime,
        vehicle: payload.vehicle ?? "-",
        address: payload.address ?? "-",
        serviceSummary: payload.serviceSummary ?? "-",
        confirmationUrl: payload.confirmationUrl ?? "",
        confirmationActionLabel: payload.confirmationActionLabel ?? "View appointment",
        paymentStatus: payload.paymentStatus ?? "-",
        message: payload.message ?? "",
      },
      entityType: "appointment",
      entityId: appointmentId,
    }).catch((error) => {
      logger.warn("Appointment confirmation SMS enqueue failed", {
        appointmentId,
        businessId: bid,
        error,
      });
    });
    return {
      deliveryStatus: "disabled",
      deliveryError: "Appointment confirmation emails are disabled in Settings.",
      recipient: payload.recipient,
    };
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
      portalUrl: payload.portalUrl,
      confirmationActionLabel: payload.confirmationActionLabel,
      paymentStatus: payload.paymentStatus,
      message: payload.message,
    });
    void enqueueTwilioTemplateSms({
      businessId: bid,
      templateSlug: "appointment_confirmation",
      to: payload.recipientPhone,
      vars: {
        clientName: payload.clientName,
        businessName: payload.businessName,
        dateTime: payload.dateTime,
        vehicle: payload.vehicle ?? "-",
        address: payload.address ?? "-",
        serviceSummary: payload.serviceSummary ?? "-",
        confirmationUrl: payload.confirmationUrl ?? "",
        confirmationActionLabel: payload.confirmationActionLabel ?? "View appointment",
        paymentStatus: payload.paymentStatus ?? "-",
        message: payload.message ?? "",
      },
      entityType: "appointment",
      entityId: appointmentId,
    }).catch((error) => {
      logger.warn("Appointment confirmation SMS enqueue failed", {
        appointmentId,
        businessId: bid,
        error,
      });
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
  if (startGte) {
    conditions.push(
      sql`COALESCE(${appointments.pickupReadyTime}, ${appointments.expectedCompletionTime}, ${appointments.endTime}, ${appointments.startTime}) >= ${startGte}`
    );
  }
  if (startLte) {
    conditions.push(sql`COALESCE(${appointments.jobStartTime}, ${appointments.startTime}) <= ${startLte}`);
  }

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
      jobStartTime: appointments.jobStartTime,
      expectedCompletionTime: appointments.expectedCompletionTime,
      pickupReadyTime: appointments.pickupReadyTime,
      vehicleOnSite: appointments.vehicleOnSite,
      jobPhase: appointments.jobPhase,
      status: appointments.status,
      subtotal: appointments.subtotal,
      taxRate: appointments.taxRate,
      taxAmount: appointments.taxAmount,
      applyTax: appointments.applyTax,
      adminFeeRate: appointments.adminFeeRate,
      adminFeeAmount: appointments.adminFeeAmount,
      applyAdminFee: appointments.applyAdminFee,
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
    jobStartTime: row.jobStartTime,
    expectedCompletionTime: row.expectedCompletionTime,
    pickupReadyTime: row.pickupReadyTime,
    vehicleOnSite: row.vehicleOnSite,
    jobPhase: row.jobPhase,
    status: row.status,
    subtotal: row.subtotal,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    applyTax: row.applyTax,
    adminFeeRate: row.adminFeeRate,
    adminFeeAmount: row.adminFeeAmount,
    applyAdminFee: row.applyAdminFee,
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
      jobStartTime: appointments.jobStartTime,
      expectedCompletionTime: appointments.expectedCompletionTime,
      pickupReadyTime: appointments.pickupReadyTime,
      vehicleOnSite: appointments.vehicleOnSite,
      jobPhase: appointments.jobPhase,
      status: appointments.status,
      subtotal: appointments.subtotal,
      taxRate: appointments.taxRate,
      taxAmount: appointments.taxAmount,
      applyTax: appointments.applyTax,
      adminFeeRate: appointments.adminFeeRate,
      adminFeeAmount: appointments.adminFeeAmount,
      applyAdminFee: appointments.applyAdminFee,
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
    jobStartTime: row.jobStartTime,
    expectedCompletionTime: row.expectedCompletionTime,
    pickupReadyTime: row.pickupReadyTime,
    vehicleOnSite: row.vehicleOnSite,
    jobPhase: row.jobPhase,
    status: row.status,
    subtotal: row.subtotal,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    applyTax: row.applyTax,
    adminFeeRate: row.adminFeeRate,
    adminFeeAmount: row.adminFeeAmount,
    applyAdminFee: row.applyAdminFee,
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

  const [businessFinanceDefaults] = await db
    .select({
      defaultTaxRate: businesses.defaultTaxRate,
      defaultAdminFee: businesses.defaultAdminFee,
      defaultAdminFeeEnabled: businesses.defaultAdminFeeEnabled,
    })
    .from(businesses)
    .where(eq(businesses.id, bid))
    .limit(1);

  let effectiveClientId = parsed.data.clientId ?? null;
  let effectiveVehicleId = parsed.data.vehicleId ?? null;

  if (parsed.data.quoteId) {
    const [q] = await db
      .select({
        id: quotes.id,
        clientId: quotes.clientId,
        vehicleId: quotes.vehicleId,
        total: quotes.total,
      })
      .from(quotes)
      .where(and(eq(quotes.id, parsed.data.quoteId), eq(quotes.businessId, bid)))
      .limit(1);
    if (!q) throw new BadRequestError("Quote not found.");
    effectiveClientId ??= q.clientId;
    effectiveVehicleId ??= q.vehicleId;
    if (q.clientId !== effectiveClientId) throw new BadRequestError("Appointment client must match the quote.");
    if (!q.vehicleId || q.vehicleId !== effectiveVehicleId) {
      throw new BadRequestError("Appointment vehicle must match the quote (add a vehicle to the quote first).");
    }
  }

  if (effectiveClientId) {
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, effectiveClientId), eq(clients.businessId, bid)))
      .limit(1);
    if (!client) throw new BadRequestError("Client not found or access denied.");
  }

  if (effectiveVehicleId) {
    const [vehicle] = await db
      .select({ id: vehicles.id, clientId: vehicles.clientId })
      .from(vehicles)
      .where(and(eq(vehicles.id, effectiveVehicleId), eq(vehicles.businessId, bid)))
      .limit(1);
    if (!vehicle) throw new BadRequestError("Vehicle not found or access denied.");
    if (effectiveClientId && vehicle.clientId !== effectiveClientId) {
      throw new BadRequestError("Vehicle does not belong to the selected client.");
    }
    effectiveClientId ??= vehicle.clientId;
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
  const jobStartTime = parsed.data.jobStartTime ? new Date(parsed.data.jobStartTime) : startTime;
  const expectedCompletionTime = parsed.data.expectedCompletionTime
    ? new Date(parsed.data.expectedCompletionTime)
    : endTime;
  const pickupReadyTime = parsed.data.pickupReadyTime ? new Date(parsed.data.pickupReadyTime) : null;
  const vehicleOnSite =
    parsed.data.vehicleOnSite ??
    !!(
      expectedCompletionTime &&
      expectedCompletionTime.toDateString() !== startTime.toDateString()
    );
  const isCalendarBlock = isCalendarBlockInternalNotes(parsed.data.internalNotes);

  assertAppointmentLifecycle({
    workStart: startTime,
    workEnd: endTime,
    jobStart: jobStartTime,
    expectedCompletion: expectedCompletionTime,
    pickupReady: pickupReadyTime,
  });

  if (!isCalendarBlock) {
    const appointmentCapacity = await getAppointmentCapacityPerSlot(bid);
    if (appointmentCapacity <= 1) {
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
    } else {
      const overlappingAppointments = await countOverlappingAppointments({
        businessId: bid,
        startTime,
        endTime,
        assignedStaffId: parsed.data.assignedStaffId ?? null,
        excludeAppointmentId: null,
      });
      if (overlappingAppointments >= appointmentCapacity) {
        throw new ConflictError(
          parsed.data.assignedStaffId
            ? `This staff member already has ${appointmentCapacity} appointment${appointmentCapacity === 1 ? "" : "s"} in this time slot.`
            : `This time slot already has ${appointmentCapacity} appointment${appointmentCapacity === 1 ? "" : "s"} scheduled.`
        );
      }
    }
  } else {
    const blockCapacity = await getCalendarBlockCapacityPerSlot(bid);
    const overlappingBlocks = await countOverlappingCalendarBlocks({
      businessId: bid,
      startTime,
      endTime,
      assignedStaffId: parsed.data.assignedStaffId ?? null,
      excludeAppointmentId: null,
    });
    if (overlappingBlocks >= blockCapacity) {
      throw new ConflictError(
        parsed.data.assignedStaffId
          ? `This staff member already has ${blockCapacity} block${blockCapacity === 1 ? "" : "s"} in this time slot.`
          : `This time slot already has ${blockCapacity} block${blockCapacity === 1 ? "" : "s"} scheduled.`
      );
    }
  }

  let totalPriceInit = "0";
  if (parsed.data.quoteId) {
    const [q] = await db.select({ total: quotes.total }).from(quotes).where(eq(quotes.id, parsed.data.quoteId)).limit(1);
    if (q?.total != null) totalPriceInit = String(q.total);
  }
  const baseFinance = calculateAppointmentFinanceTotals({
    subtotal: Number(totalPriceInit ?? 0),
    taxRate:
      parsed.data.taxRate ??
      Number(businessFinanceDefaults?.defaultTaxRate ?? 0),
    applyTax:
      parsed.data.applyTax ??
      Number(businessFinanceDefaults?.defaultTaxRate ?? 0) > 0,
    adminFeeRate:
      parsed.data.adminFeeRate ??
      Number(businessFinanceDefaults?.defaultAdminFee ?? 0),
    applyAdminFee:
      parsed.data.applyAdminFee ??
      (Boolean(businessFinanceDefaults?.defaultAdminFeeEnabled) &&
        Number(businessFinanceDefaults?.defaultAdminFee ?? 0) > 0),
  });

  const createdAt = new Date();
  const appointmentId = randomUUID();
  const created = await db.transaction(async (tx) => {
    let selectedServicesTotal = 0;
    let attachedAnyService = false;
    let apt: CreatedAppointmentRecord | undefined;
    try {
      [apt] = await tx
        .insert(appointments)
        .values({
          id: appointmentId,
          businessId: bid,
          clientId: effectiveClientId ?? null,
          vehicleId: effectiveVehicleId ?? null,
          startTime,
          endTime,
          jobStartTime,
          expectedCompletionTime,
          pickupReadyTime,
          vehicleOnSite,
          jobPhase: parsed.data.jobPhase ?? "scheduled",
          title: parsed.data.title ?? null,
          assignedStaffId: parsed.data.assignedStaffId ?? null,
          locationId: parsed.data.locationId ?? null,
          depositAmount: parsed.data.depositAmount != null ? String(parsed.data.depositAmount) : "0",
          depositPaid: parsed.data.depositPaid ?? false,
          subtotal: String(baseFinance.subtotal),
          taxRate: String(baseFinance.taxRate),
          taxAmount: String(baseFinance.taxAmount),
          applyTax: baseFinance.applyTax,
          adminFeeRate: String(baseFinance.adminFeeRate),
          adminFeeAmount: String(baseFinance.adminFeeAmount),
          applyAdminFee: baseFinance.applyAdminFee,
          notes: parsed.data.notes?.trim() ? parsed.data.notes.trim() : null,
          internalNotes: parsed.data.internalNotes?.trim() ? parsed.data.internalNotes.trim() : null,
          totalPrice: String(baseFinance.totalPrice),
          createdAt,
          updatedAt: createdAt,
        })
        .returning(createAppointmentReturning);
    } catch (error) {
      if (!isAppointmentSchemaDriftError(error)) throw error;
      const columns = await getAppointmentColumns();
      const fallbackValues: Record<string, unknown> = {
        id: appointmentId,
        businessId: bid,
        clientId: effectiveClientId,
        vehicleId: effectiveVehicleId,
        startTime,
      };
      if (columns.has("end_time")) fallbackValues.endTime = endTime;
      if (columns.has("job_start_time")) fallbackValues.jobStartTime = jobStartTime;
      if (columns.has("expected_completion_time")) fallbackValues.expectedCompletionTime = expectedCompletionTime;
      if (columns.has("pickup_ready_time")) fallbackValues.pickupReadyTime = pickupReadyTime;
      if (columns.has("vehicle_on_site")) fallbackValues.vehicleOnSite = vehicleOnSite;
      if (columns.has("job_phase")) fallbackValues.jobPhase = parsed.data.jobPhase ?? "scheduled";
      if (columns.has("title")) fallbackValues.title = parsed.data.title ?? null;
      if (columns.has("assigned_staff_id")) fallbackValues.assignedStaffId = parsed.data.assignedStaffId ?? null;
      if (columns.has("location_id")) fallbackValues.locationId = parsed.data.locationId ?? null;
      if (columns.has("deposit_amount")) fallbackValues.depositAmount = parsed.data.depositAmount != null ? String(parsed.data.depositAmount) : "0";
      if (columns.has("deposit_paid")) fallbackValues.depositPaid = parsed.data.depositPaid ?? false;
      if (columns.has("subtotal")) fallbackValues.subtotal = String(baseFinance.subtotal);
      if (columns.has("tax_rate")) fallbackValues.taxRate = String(baseFinance.taxRate);
      if (columns.has("tax_amount")) fallbackValues.taxAmount = String(baseFinance.taxAmount);
      if (columns.has("apply_tax")) fallbackValues.applyTax = baseFinance.applyTax;
      if (columns.has("admin_fee_rate")) fallbackValues.adminFeeRate = String(baseFinance.adminFeeRate);
      if (columns.has("admin_fee_amount")) fallbackValues.adminFeeAmount = String(baseFinance.adminFeeAmount);
      if (columns.has("apply_admin_fee")) fallbackValues.applyAdminFee = baseFinance.applyAdminFee;
      if (columns.has("notes")) fallbackValues.notes = parsed.data.notes?.trim() ? parsed.data.notes.trim() : null;
      if (columns.has("internal_notes")) fallbackValues.internalNotes = parsed.data.internalNotes?.trim() ? parsed.data.internalNotes.trim() : null;
      if (columns.has("total_price")) fallbackValues.totalPrice = String(baseFinance.totalPrice);
      if (columns.has("status")) fallbackValues.status = "scheduled";
      if (columns.has("created_at")) fallbackValues.createdAt = createdAt;
      if (columns.has("updated_at")) fallbackValues.updatedAt = createdAt;
      [apt] = await tx
        .insert(appointments)
        .values(fallbackValues as typeof appointments.$inferInsert)
        .returning(createAppointmentReturning);
    }
    if (!apt) throw new BadRequestError("Failed to create appointment.");

    if (parsed.data.quoteId) {
      await tx
        .update(quotes)
        .set({ appointmentId: apt.id, status: "accepted", updatedAt: new Date() })
        .where(eq(quotes.id, parsed.data.quoteId));
    }

    const requestedServiceSelections: Array<{ serviceId: string; unitPrice?: number }> =
      parsed.data.serviceSelections && parsed.data.serviceSelections.length > 0
        ? parsed.data.serviceSelections
        : (parsed.data.serviceIds ?? []).map((serviceId) => ({ serviceId }));

    if (requestedServiceSelections.length > 0) {
      for (const selection of requestedServiceSelections) {
        const svc = await getServiceForBusinessSafe(tx, selection.serviceId, bid);
        if (!svc) continue;
        const effectiveUnitPrice =
          selection.unitPrice != null && Number.isFinite(selection.unitPrice)
            ? selection.unitPrice
            : Number(svc.price ?? 0);
        selectedServicesTotal += effectiveUnitPrice;
        const attached = await attachServiceToAppointment(tx, {
          appointmentId: apt.id,
          serviceId: selection.serviceId,
          unitPrice: effectiveUnitPrice.toFixed(2),
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
          const fallbackFinance = calculateAppointmentFinanceTotals({
            subtotal: selectedServicesTotal,
            taxRate: baseFinance.taxRate,
            applyTax: baseFinance.applyTax,
            adminFeeRate: baseFinance.adminFeeRate,
            applyAdminFee: baseFinance.applyAdminFee,
          });
          await updateAppointmentTotalIfSupported(tx, apt.id, {
            subtotal: fallbackFinance.subtotal.toFixed(2),
            taxRate: fallbackFinance.taxRate.toFixed(2),
            taxAmount: fallbackFinance.taxAmount.toFixed(2),
            applyTax: fallbackFinance.applyTax,
            adminFeeRate: fallbackFinance.adminFeeRate.toFixed(2),
            adminFeeAmount: fallbackFinance.adminFeeAmount.toFixed(2),
            applyAdminFee: fallbackFinance.applyAdminFee,
            totalPrice: fallbackFinance.totalPrice.toFixed(2),
          });
        }
      } else {
        const fallbackFinance = calculateAppointmentFinanceTotals({
          subtotal: selectedServicesTotal,
          taxRate: baseFinance.taxRate,
          applyTax: baseFinance.applyTax,
          adminFeeRate: baseFinance.adminFeeRate,
          applyAdminFee: baseFinance.applyAdminFee,
        });
        await updateAppointmentTotalIfSupported(tx, apt.id, {
          subtotal: fallbackFinance.subtotal.toFixed(2),
          taxRate: fallbackFinance.taxRate.toFixed(2),
          taxAmount: fallbackFinance.taxAmount.toFixed(2),
          applyTax: fallbackFinance.applyTax,
          adminFeeRate: fallbackFinance.adminFeeRate.toFixed(2),
          adminFeeAmount: fallbackFinance.adminFeeAmount.toFixed(2),
          applyAdminFee: fallbackFinance.applyAdminFee,
          totalPrice: fallbackFinance.totalPrice.toFixed(2),
        });
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
        title: parsed.data.title ?? null,
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
    const deliveryError = error instanceof Error ? error.message : String(error);
    logger.warn("Appointment created but confirmation pipeline failed", {
      appointmentId: created.id,
      businessId: bid,
      error: deliveryError,
    });
    confirmationResult = {
      deliveryStatus: "email_failed",
      deliveryError,
      recipient: null,
    };
  }
  try {
    await createRequestActivityLog(req, {
      businessId: bid,
      action:
        confirmationResult.deliveryStatus === "emailed"
          ? "appointment.confirmation_sent"
          : confirmationResult.deliveryStatus === "disabled"
            ? "appointment.confirmation_skipped"
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
  try {
    await scheduleGoogleCalendarAppointmentSync({
      businessId: bid,
      appointmentId: created.id,
      createdByUserId: req.userId ?? null,
    });
  } catch (error) {
    logger.warn("Google Calendar appointment sync enqueue failed after create", {
      appointmentId: created.id,
      businessId: bid,
      error,
    });
  }
  res.status(201).json({ ...created, ...confirmationResult });
}));

appointmentsRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select({
      id: appointments.id,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      jobStartTime: appointments.jobStartTime,
      expectedCompletionTime: appointments.expectedCompletionTime,
      pickupReadyTime: appointments.pickupReadyTime,
      vehicleOnSite: appointments.vehicleOnSite,
      assignedStaffId: appointments.assignedStaffId,
      clientId: appointments.clientId,
      vehicleId: appointments.vehicleId,
      subtotal: appointments.subtotal,
      taxRate: appointments.taxRate,
      taxAmount: appointments.taxAmount,
      applyTax: appointments.applyTax,
      adminFeeRate: appointments.adminFeeRate,
      adminFeeAmount: appointments.adminFeeAmount,
      applyAdminFee: appointments.applyAdminFee,
      totalPrice: appointments.totalPrice,
      internalNotes: appointments.internalNotes,
    })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
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

  let nextClientId = (existing.clientId as string | null) ?? null;
  let nextVehicleId = (existing.vehicleId as string | null) ?? null;

  if (parsed.data.clientId != null) {
    const [clientRow] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, parsed.data.clientId), eq(clients.businessId, bid)))
      .limit(1);
    if (!clientRow) throw new BadRequestError("Client not found or access denied.");
    nextClientId = clientRow.id;
  }

  if (parsed.data.vehicleId != null) {
    const [vehicleRow] = await db
      .select({ id: vehicles.id, clientId: vehicles.clientId })
      .from(vehicles)
      .where(and(eq(vehicles.id, parsed.data.vehicleId), eq(vehicles.businessId, bid)))
      .limit(1);
    if (!vehicleRow) throw new BadRequestError("Vehicle not found or access denied.");
    nextVehicleId = vehicleRow.id;
    nextClientId = parsed.data.clientId ?? vehicleRow.clientId;
  } else if (parsed.data.clientId != null && existing.vehicleId) {
    const [currentVehicle] = await db
      .select({ clientId: vehicles.clientId })
      .from(vehicles)
      .where(and(eq(vehicles.id, existing.vehicleId), eq(vehicles.businessId, bid)))
      .limit(1);
    if (currentVehicle && currentVehicle.clientId !== nextClientId) {
      throw new BadRequestError("Select a vehicle that belongs to the chosen client.");
    }
  }

  const startTime = parsed.data.startTime != null ? new Date(parsed.data.startTime) : (existing.startTime as Date);
  const endTime = parsed.data.endTime != null ? new Date(parsed.data.endTime) : (existing.endTime as Date | null);
  const jobStartTime =
    parsed.data.jobStartTime !== undefined
      ? (parsed.data.jobStartTime ? new Date(parsed.data.jobStartTime) : startTime)
      : ((existing.jobStartTime as Date | null) ?? startTime);
  const expectedCompletionTime =
    parsed.data.expectedCompletionTime !== undefined
      ? (parsed.data.expectedCompletionTime ? new Date(parsed.data.expectedCompletionTime) : null)
      : ((existing.expectedCompletionTime as Date | null) ?? endTime);
  const pickupReadyTime =
    parsed.data.pickupReadyTime !== undefined
      ? (parsed.data.pickupReadyTime ? new Date(parsed.data.pickupReadyTime) : null)
      : (existing.pickupReadyTime as Date | null);
  const vehicleOnSite =
    parsed.data.vehicleOnSite ??
    existing.vehicleOnSite ??
    !!(
      expectedCompletionTime &&
      expectedCompletionTime.toDateString() !== startTime.toDateString()
    );
  const assignedStaffId = parsed.data.assignedStaffId ?? existing.assignedStaffId;
  const isCalendarBlock =
    isCalendarBlockInternalNotes(parsed.data.internalNotes) ||
    (parsed.data.internalNotes === undefined &&
      isCalendarBlockInternalNotes((existing.internalNotes as string | null) ?? null));

  assertAppointmentLifecycle({
    workStart: startTime,
    workEnd: endTime,
    jobStart: jobStartTime,
    expectedCompletion: expectedCompletionTime,
    pickupReady: pickupReadyTime,
  });

  if (!isCalendarBlock && (parsed.data.startTime != null || parsed.data.endTime != null || parsed.data.assignedStaffId != null)) {
    const appointmentCapacity = await getAppointmentCapacityPerSlot(bid);
    if (appointmentCapacity <= 1) {
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
    } else {
      const overlappingAppointments = await countOverlappingAppointments({
        businessId: bid,
        startTime,
        endTime,
        assignedStaffId,
        excludeAppointmentId: req.params.id,
      });
      if (overlappingAppointments >= appointmentCapacity) {
        throw new ConflictError(
          assignedStaffId
            ? `This staff member already has ${appointmentCapacity} appointment${appointmentCapacity === 1 ? "" : "s"} in this time slot.`
            : `This time slot already has ${appointmentCapacity} appointment${appointmentCapacity === 1 ? "" : "s"} scheduled.`
        );
      }
    }
  } else if (isCalendarBlock && (parsed.data.startTime != null || parsed.data.endTime != null || parsed.data.assignedStaffId != null)) {
    const blockCapacity = await getCalendarBlockCapacityPerSlot(bid);
    const overlappingBlocks = await countOverlappingCalendarBlocks({
      businessId: bid,
      startTime,
      endTime,
      assignedStaffId,
      excludeAppointmentId: req.params.id,
    });
    if (overlappingBlocks >= blockCapacity) {
      throw new ConflictError(
        assignedStaffId
          ? `This staff member already has ${blockCapacity} block${blockCapacity === 1 ? "" : "s"} in this time slot.`
          : `This time slot already has ${blockCapacity} block${blockCapacity === 1 ? "" : "s"} scheduled.`
      );
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.startTime != null) updates.startTime = new Date(parsed.data.startTime);
  if (parsed.data.endTime != null) updates.endTime = new Date(parsed.data.endTime);
  if (parsed.data.jobStartTime !== undefined) updates.jobStartTime = jobStartTime;
  if (parsed.data.expectedCompletionTime !== undefined) updates.expectedCompletionTime = expectedCompletionTime;
  if (parsed.data.pickupReadyTime !== undefined) updates.pickupReadyTime = pickupReadyTime;
  if (parsed.data.vehicleOnSite !== undefined) updates.vehicleOnSite = vehicleOnSite;
  if (parsed.data.jobPhase != null) updates.jobPhase = parsed.data.jobPhase;
  if (parsed.data.title != null) updates.title = parsed.data.title;
  if (parsed.data.assignedStaffId != null) updates.assignedStaffId = parsed.data.assignedStaffId;
  if (parsed.data.locationId != null) updates.locationId = parsed.data.locationId;
  if (parsed.data.clientId != null || parsed.data.vehicleId != null) {
    updates.clientId = nextClientId;
    updates.vehicleId = nextVehicleId;
  }
  if (parsed.data.totalPrice !== undefined) updates.totalPrice = String(parsed.data.totalPrice);
  if (parsed.data.depositAmount != null) updates.depositAmount = String(parsed.data.depositAmount);
  if (parsed.data.depositPaid !== undefined) updates.depositPaid = parsed.data.depositPaid;
  if (parsed.data.taxRate !== undefined) updates.taxRate = String(parsed.data.taxRate ?? 0);
  if (parsed.data.applyTax !== undefined) updates.applyTax = parsed.data.applyTax;
  if (parsed.data.adminFeeRate !== undefined) updates.adminFeeRate = String(parsed.data.adminFeeRate ?? 0);
  if (parsed.data.applyAdminFee !== undefined) updates.applyAdminFee = parsed.data.applyAdminFee;
  if (parsed.data.notes != null) updates.notes = parsed.data.notes.trim() || null;
  if (parsed.data.internalNotes != null) updates.internalNotes = parsed.data.internalNotes.trim() || null;
  const [updated] = await db.update(appointments).set(updates as Record<string, unknown>).where(eq(appointments.id, req.params.id)).returning();
  if (
    updated &&
    (parsed.data.taxRate !== undefined ||
      parsed.data.applyTax !== undefined ||
      parsed.data.adminFeeRate !== undefined ||
      parsed.data.applyAdminFee !== undefined)
  ) {
    await recalculateAppointmentTotal(db, updated.id);
  }
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
    try {
      await scheduleGoogleCalendarAppointmentSync({
        businessId: bid,
        appointmentId: updated.id,
        createdByUserId: req.userId ?? null,
      });
    } catch (error) {
      logger.warn("Google Calendar appointment sync enqueue failed after update", {
        appointmentId: updated.id,
        businessId: bid,
        error,
      });
    }
  }
  res.json(updated);
});

appointmentsRouter.post("/:id/recordDepositPayment", requireAuth, requireTenant, wrapAsync(async (req: Request, res: Response) => {
  const bid = businessId(req);
  const parsed = recordDepositPaymentSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const [existing] = await db
    .select({
      id: appointments.id,
      clientId: appointments.clientId,
      depositAmount: appointments.depositAmount,
      depositPaid: appointments.depositPaid,
      totalPrice: appointments.totalPrice,
      internalNotes: appointments.internalNotes,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Appointment not found.");

  const columns = await getAppointmentColumns();
  if (!columns.has("deposit_paid")) {
    throw new BadRequestError("Payment tracking is unavailable until the latest database update is applied.");
  }

  const depositAmount = Number(existing.depositAmount ?? 0);
  const totalPrice = Number(existing.totalPrice ?? 0);
  const isInternalCalendarBlock = isCalendarBlockInternalNotes(existing.internalNotes);
  const isInternalAppointment = isInternalCalendarBlock || !existing.clientId;
  const collectedAmount = await getAppointmentCollectedAmount(existing.id, bid);
  const remainingBalance =
    Number.isFinite(totalPrice) && totalPrice > 0 ? Math.max(0, Number((totalPrice - collectedAmount).toFixed(2))) : 0;
  const effectiveRequiredAmount =
    Number.isFinite(totalPrice) && totalPrice > 0
      ? collectedAmount <= 0 && Number.isFinite(depositAmount) && depositAmount > 0
        ? Math.min(totalPrice, depositAmount)
        : remainingBalance
      : Number.isFinite(depositAmount) && depositAmount > 0
        ? depositAmount
        : 0;
  if (!Number.isFinite(effectiveRequiredAmount) || effectiveRequiredAmount <= 0) {
    throw new BadRequestError("This appointment does not have a payment amount to record.");
  }

  if (parsed.data.amount !== effectiveRequiredAmount) {
    const expectedLabel =
      Number.isFinite(depositAmount) && depositAmount > 0
        ? "required deposit amount"
        : isInternalAppointment
          ? "appointment total"
          : "remaining appointment amount";
    throw new BadRequestError(`Payment must match the ${expectedLabel} (${effectiveRequiredAmount.toFixed(2)}).`);
  }

  if (remainingBalance <= 0 && collectedAmount > 0) {
    res.json(existing);
    return;
  }

  const updates: Record<string, unknown> = {
    depositPaid: true,
  };
  if (columns.has("updated_at")) updates.updatedAt = new Date();

  let updated;
  try {
    [updated] = await db
      .update(appointments)
      .set(updates as Partial<typeof appointments.$inferInsert>)
      .where(eq(appointments.id, req.params.id))
      .returning();
  } catch (error) {
    if (!isAppointmentSchemaDriftError(error)) throw error;
    throw new BadRequestError("Payment tracking is unavailable until the latest database update is applied.");
  }

  await createRequestActivityLog(req, {
    businessId: bid,
    action: "appointment.deposit_paid",
    entityType: "appointment",
    entityId: existing.id,
    metadata: {
      amount: parsed.data.amount,
      method: parsed.data.method,
      notes: parsed.data.notes ?? null,
      referenceNumber: parsed.data.referenceNumber ?? null,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt).toISOString() : new Date().toISOString(),
      source: "manual",
      paymentType:
        Number.isFinite(totalPrice) && totalPrice > 0 && collectedAmount + parsed.data.amount >= totalPrice - 0.009
          ? "full"
          : Number.isFinite(depositAmount) && depositAmount > 0 && collectedAmount <= 0
            ? "deposit"
            : "partial",
    },
  });

  res.json(updated ?? { ...existing, depositPaid: true });
}));

appointmentsRouter.post("/:id/create-deposit-payment-session", requireAuth, requireTenant, wrapAsync(async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [appointment] = await db
    .select({
      id: appointments.id,
      title: appointments.title,
      clientId: appointments.clientId,
      depositAmount: appointments.depositAmount,
      depositPaid: appointments.depositPaid,
    })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
  if (!appointment) throw new NotFoundError("Appointment not found.");

  const depositAmount = Number(appointment.depositAmount ?? 0);
  if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
    throw new BadRequestError("This appointment does not have a deposit to collect.");
  }
  if (appointment.depositPaid) {
    throw new BadRequestError("This appointment deposit has already been collected.");
  }

  const [business] = await db
    .select({ stripeConnectAccountId: businesses.stripeConnectAccountId })
    .from(businesses)
    .where(eq(businesses.id, bid))
    .limit(1);
  if (!business?.stripeConnectAccountId) {
    throw new BadRequestError("Connect Stripe before collecting deposits.");
  }
  const account = await retrieveConnectAccount({ accountId: business.stripeConnectAccountId });
  if (!account?.ready) {
    throw new BadRequestError("This business is still finishing Stripe setup.");
  }

  const [client] = appointment.clientId
    ? await db
        .select({
          firstName: clients.firstName,
          lastName: clients.lastName,
          email: clients.email,
        })
        .from(clients)
        .where(and(eq(clients.id, appointment.clientId), eq(clients.businessId, bid)))
        .limit(1)
    : [];
  const clientName = [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim() || null;
  const base = process.env.FRONTEND_URL!;
  const returnTo = `${base}/appointments/${encodeURIComponent(appointment.id)}`;
  const result = await createAppointmentDepositCheckoutSession({
    businessId: bid,
    appointmentId: appointment.id,
    appointmentTitle: appointment.title ?? "Appointment deposit",
    amountCents: Math.round(depositAmount * 100),
    connectedAccountId: business.stripeConnectAccountId,
    customerEmail: client?.email ?? null,
    customerName: clientName,
    successUrl: `${returnTo}?stripePayment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${returnTo}?stripePayment=cancelled`,
  });
  if (!result?.url) throw new BadRequestError("Could not create Stripe Checkout session.");
  res.json(result);
}));

appointmentsRouter.post("/:id/confirm-stripe-deposit-session", requireAuth, requireTenant, wrapAsync(async (req: Request, res: Response) => {
  const parsed = confirmStripeDepositSessionSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const bid = businessId(req);
  const [appointment] = await db
    .select({
      id: appointments.id,
      depositPaid: appointments.depositPaid,
    })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
  if (!appointment) throw new NotFoundError("Appointment not found.");

  if (appointment.depositPaid) {
    res.json({ confirmed: true, depositPaid: true });
    return;
  }

  const [business] = await db
    .select({ stripeConnectAccountId: businesses.stripeConnectAccountId })
    .from(businesses)
    .where(eq(businesses.id, bid))
    .limit(1);

  const confirmed = await confirmAppointmentDepositCheckout({
    appointmentId: appointment.id,
    businessId: bid,
    sessionId: parsed.data.sessionId,
    connectedAccountId: business?.stripeConnectAccountId ?? null,
  });

  res.json({ confirmed, depositPaid: confirmed });
}));

appointmentsRouter.post("/:id/reverseDepositPayment", requireAuth, requireTenant, wrapAsync(async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select({
      id: appointments.id,
      depositAmount: appointments.depositAmount,
      depositPaid: appointments.depositPaid,
      totalPrice: appointments.totalPrice,
    })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Appointment not found.");

  const columns = await getAppointmentColumns();
  if (!columns.has("deposit_paid")) {
    throw new BadRequestError("Payment tracking is unavailable until the latest database update is applied.");
  }

  const depositAmount = Number(existing.depositAmount ?? 0);
  const totalPrice = Number(existing.totalPrice ?? 0);
  const collectedAmount = await getAppointmentCollectedAmount(existing.id, bid);

  if (!existing.depositPaid || collectedAmount <= 0) {
    res.json(existing);
    return;
  }

  const updates: Record<string, unknown> = {
    depositPaid: false,
  };
  if (columns.has("updated_at")) updates.updatedAt = new Date();

  let updated;
  try {
    [updated] = await db
      .update(appointments)
      .set(updates as Partial<typeof appointments.$inferInsert>)
      .where(eq(appointments.id, req.params.id))
      .returning();
  } catch (error) {
    if (!isAppointmentSchemaDriftError(error)) throw error;
    throw new BadRequestError("Payment tracking is unavailable until the latest database update is applied.");
  }

  await createRequestActivityLog(req, {
    businessId: bid,
    action: "appointment.deposit_payment_reversed",
    entityType: "appointment",
    entityId: existing.id,
    metadata: {
      amount: collectedAmount,
      source: "manual",
      paymentType:
        Number.isFinite(totalPrice) && totalPrice > 0 && collectedAmount >= totalPrice - 0.009
          ? "full"
          : Number.isFinite(depositAmount) && depositAmount > 0 && collectedAmount <= depositAmount + 0.009
            ? "deposit"
            : "partial",
    },
  });

  res.json(updated ?? { ...existing, depositPaid: false });
}));

appointmentsRouter.post("/:id/public-request-change", express.urlencoded({ extended: false }), wrapAsync(async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  const access = verifyPublicDocumentToken(token, { kind: "appointment", entityId: req.params.id });
  if (!access) throw new ForbiddenError("Appointment access link is invalid or expired.");

  const parsed = publicChangeRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const preferredTiming = parsed.data.preferredTiming?.trim() ?? null;
  const message = parsed.data.message?.trim() ?? null;
  if (!preferredTiming && !message) {
    throw new BadRequestError("Share a preferred time or a quick note so the shop knows what to change.");
  }

  const [appointment] = await db
    .select({
      id: appointments.id,
      title: appointments.title,
      startTime: appointments.startTime,
      status: appointments.status,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientEmail: clients.email,
      clientPhone: clients.phone,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      businessName: businesses.name,
      businessEmail: businesses.email,
      businessPhone: businesses.phone,
      businessTimezone: businesses.timezone,
      locationTimezone: locations.timezone,
      businessType: businesses.type,
    })
    .from(appointments)
    .leftJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.businessId, access.businessId)))
    .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, access.businessId)))
    .leftJoin(businesses, eq(appointments.businessId, businesses.id))
    .leftJoin(locations, and(eq(appointments.locationId, locations.id), eq(locations.businessId, access.businessId)))
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, access.businessId)))
    .limit(1);
  if (!appointment) throw new NotFoundError("Appointment not found.");

  const appointmentDateTime = formatAppointmentDateTime(
    appointment.startTime,
    appointment.locationTimezone ??
      appointment.businessTimezone ??
      getBusinessTypeDefaults(appointment.businessType).timezone
  );
  const clientName =
    [appointment.clientFirstName, appointment.clientLastName].filter(Boolean).join(" ").trim() || "Customer";
  const vehicleLabel =
    buildVehicleDisplayName({
      year: appointment.vehicleYear,
      make: appointment.vehicleMake,
      model: appointment.vehicleModel,
    }) || "Vehicle details on file";

  try {
    await createActivityLog({
      businessId: access.businessId,
      action: "appointment.public_change_requested",
      entityType: "appointment",
      entityId: appointment.id,
      metadata: {
        source: "public_appointment",
        preferredTiming,
        message,
        clientName,
        clientEmail: appointment.clientEmail ?? null,
        clientPhone: appointment.clientPhone ?? null,
      },
    });
  } catch (error) {
    logger.warn("Public appointment change request recorded but activity log write failed", {
      appointmentId: appointment.id,
      businessId: access.businessId,
      error,
    });
  }

  let changeRequestState: "sent" | "recorded" = "recorded";
  if (isEmailConfigured() && appointment.businessEmail?.trim()) {
    try {
      await sendAppointmentChangeRequestAlert({
        to: appointment.businessEmail.trim(),
        businessId: access.businessId,
        businessName: appointment.businessName ?? "Your business",
        clientName,
        dateTime: appointmentDateTime,
        vehicle: vehicleLabel,
        preferredTiming,
        message,
        clientEmail: appointment.clientEmail ?? null,
        clientPhone: appointment.clientPhone ?? null,
        appointmentUrl: buildPublicAppUrl(`/appointments/${encodeURIComponent(appointment.id)}`),
      });
      changeRequestState = "sent";
    } catch (error) {
      logger.warn("Public appointment change request email failed", {
        appointmentId: appointment.id,
        businessId: access.businessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const redirectUrl = buildPublicDocumentUrl(
    `/api/appointments/${encodeURIComponent(appointment.id)}/public-html?token=${encodeURIComponent(token)}&changeRequest=${encodeURIComponent(changeRequestState)}`
  );
  res.redirect(303, redirectUrl);
}));

appointmentsRouter.get("/:id/public-html", wrapAsync(async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  const access = verifyPublicDocumentToken(token, { kind: "appointment", entityId: req.params.id });
  if (!access) throw new ForbiddenError("Appointment access link is invalid or expired.");

  const [appointment] = await db
    .select({
      id: appointments.id,
      title: appointments.title,
      status: appointments.status,
      startTime: appointments.startTime,
      notes: appointments.notes,
      totalPrice: appointments.totalPrice,
      depositAmount: appointments.depositAmount,
      depositPaid: appointments.depositPaid,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientEmail: clients.email,
      clientPhone: clients.phone,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      businessName: businesses.name,
      businessEmail: businesses.email,
      businessPhone: businesses.phone,
      businessAddress: businesses.address,
      businessCity: businesses.city,
      businessState: businesses.state,
      businessZip: businesses.zip,
      businessTimezone: businesses.timezone,
      businessType: businesses.type,
      stripeConnectAccountId: businesses.stripeConnectAccountId,
      locationTimezone: locations.timezone,
    })
    .from(appointments)
    .leftJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.businessId, access.businessId)))
    .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, access.businessId)))
    .leftJoin(businesses, eq(appointments.businessId, businesses.id))
    .leftJoin(locations, and(eq(appointments.locationId, locations.id), eq(locations.businessId, access.businessId)))
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, access.businessId)))
    .limit(1);
  if (!appointment) throw new NotFoundError("Appointment not found.");

  let depositPaid = !!appointment.depositPaid;
  const stripePaymentQuery = typeof req.query.stripePayment === "string" ? req.query.stripePayment : null;
  const checkoutSessionId = typeof req.query.session_id === "string" ? req.query.session_id.trim() : "";
  if (
    stripePaymentQuery === "success" &&
    !depositPaid &&
    checkoutSessionId &&
    appointment.stripeConnectAccountId
  ) {
    try {
      depositPaid = await confirmAppointmentDepositCheckout({
        appointmentId: appointment.id,
        businessId: access.businessId,
        sessionId: checkoutSessionId,
        connectedAccountId: appointment.stripeConnectAccountId,
      });
    } catch (error) {
      logger.error("Failed to confirm Stripe appointment deposit from public return", {
        appointmentId: appointment.id,
        businessId: access.businessId,
        sessionId: checkoutSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const serviceRows = await db
    .select({ name: services.name })
    .from(appointmentServices)
    .innerJoin(services, eq(appointmentServices.serviceId, services.id))
    .where(eq(appointmentServices.appointmentId, appointment.id))
    .orderBy(asc(services.name));

  let publicPaymentUrl: string | null = null;
  const depositAmount = Number(appointment.depositAmount ?? 0);
  if (
    Number.isFinite(depositAmount) &&
    depositAmount > 0 &&
    !depositPaid
  ) {
    publicPaymentUrl = buildPublicDocumentUrl(
      `/api/appointments/${appointment.id}/public-pay?token=${encodeURIComponent(token)}`
    );
  }

  const html = renderAppointmentHtml({
    appointmentTitle: appointment.title ?? "Appointment details",
    appointmentDateTime: formatAppointmentDateTime(
      appointment.startTime,
      appointment.locationTimezone ??
        appointment.businessTimezone ??
        getBusinessTypeDefaults(appointment.businessType).timezone
    ),
    status: appointment.status,
    notes: appointment.notes,
    business: {
      name: appointment.businessName,
      email: appointment.businessEmail,
      phone: appointment.businessPhone,
      address: [
        appointment.businessAddress,
        appointment.businessCity,
        appointment.businessState,
        appointment.businessZip,
      ]
        .filter(Boolean)
        .join(", "),
    },
    client: {
      firstName: appointment.clientFirstName,
      lastName: appointment.clientLastName,
      email: appointment.clientEmail,
      phone: appointment.clientPhone,
    },
    vehicle: {
      year: appointment.vehicleYear,
      make: appointment.vehicleMake,
      model: appointment.vehicleModel,
    },
    serviceSummary:
      serviceRows.length > 0 ? serviceRows.map((service) => service.name).join(", ") : "Appointment confirmed",
    totalPrice: appointment.totalPrice,
    depositAmount: appointment.depositAmount,
    depositPaid,
    publicPaymentUrl,
    portalUrl: buildPublicAppUrl(`/portal/${encodeURIComponent(token)}`),
    publicRequestChangeUrl: buildPublicDocumentUrl(
      `/api/appointments/${appointment.id}/public-request-change?token=${encodeURIComponent(token)}`
    ),
    changeRequestState:
      typeof req.query.changeRequest === "string" &&
      ["sent", "recorded"].includes(req.query.changeRequest)
        ? (req.query.changeRequest as "sent" | "recorded")
        : null,
    stripePaymentState:
      stripePaymentQuery === "success" && depositPaid
        ? "success"
        : stripePaymentQuery === "cancelled"
          ? "cancelled"
          : null,
  });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(html);
}));

appointmentsRouter.get("/:id/public-pay", wrapAsync(async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  const access = verifyPublicDocumentToken(token, { kind: "appointment", entityId: req.params.id });
  if (!access) throw new ForbiddenError("Appointment access link is invalid or expired.");

  const [appointment] = await db
    .select({
      id: appointments.id,
      title: appointments.title,
      clientId: appointments.clientId,
      depositAmount: appointments.depositAmount,
      depositPaid: appointments.depositPaid,
    })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, access.businessId)))
    .limit(1);
  if (!appointment) throw new NotFoundError("Appointment not found.");

  const depositAmount = Number(appointment.depositAmount ?? 0);
  if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
    throw new BadRequestError("This appointment does not have a deposit to collect.");
  }
  if (appointment.depositPaid) {
    throw new BadRequestError("This appointment deposit has already been collected.");
  }

  const [business] = await db
    .select({ stripeConnectAccountId: businesses.stripeConnectAccountId })
    .from(businesses)
    .where(eq(businesses.id, access.businessId))
    .limit(1);
  if (!business?.stripeConnectAccountId) {
    throw new BadRequestError("This business has not connected Stripe yet.");
  }
  const account = await retrieveConnectAccount({ accountId: business.stripeConnectAccountId });
  if (!account?.ready) {
    throw new BadRequestError("This business is still finishing Stripe setup.");
  }

  const [client] = appointment.clientId
    ? await db
        .select({
          firstName: clients.firstName,
          lastName: clients.lastName,
          email: clients.email,
        })
        .from(clients)
        .where(and(eq(clients.id, appointment.clientId), eq(clients.businessId, access.businessId)))
        .limit(1)
    : [];
  const clientName = [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim() || null;
  const returnTo = buildPublicDocumentUrl(
    `/api/appointments/${encodeURIComponent(appointment.id)}/public-html?token=${encodeURIComponent(token)}`
  );
  const result = await createAppointmentDepositCheckoutSession({
    businessId: access.businessId,
    appointmentId: appointment.id,
    appointmentTitle: appointment.title ?? "Appointment deposit",
    amountCents: Math.round(depositAmount * 100),
    connectedAccountId: business.stripeConnectAccountId,
    customerEmail: client?.email ?? null,
    customerName: clientName,
    successUrl: `${returnTo}&stripePayment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${returnTo}&stripePayment=cancelled`,
  });
  if (!result?.url) {
    throw new BadRequestError("Could not create Stripe Checkout session.");
  }
  res.redirect(303, result.url);
}));

appointmentsRouter.post("/:id/sendConfirmation", requireAuth, requireTenant, wrapAsync(async (req: Request, res: Response) => {
  const parsed = sendConfirmationSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);
  const [existing] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Appointment not found.");

  const confirmationResult = await sendAppointmentConfirmationForRecord(existing.id, bid, {
    recipientEmail: parsed.data.recipientEmail ?? null,
    recipientName: parsed.data.recipientName ?? null,
    message: parsed.data.message ?? null,
  });
  try {
    await createRequestActivityLog(req, {
      businessId: bid,
      action:
        confirmationResult.deliveryStatus === "emailed"
          ? "appointment.confirmation_sent"
          : confirmationResult.deliveryStatus === "disabled"
            ? "appointment.confirmation_skipped"
          : "appointment.confirmation_failed",
      entityType: "appointment",
      entityId: existing.id,
      metadata: {
        recipient: confirmationResult.recipient,
        recipientName: parsed.data.recipientName ?? null,
        message: parsed.data.message ?? null,
        deliveryStatus: confirmationResult.deliveryStatus,
        deliveryError: confirmationResult.deliveryError,
      },
    });
  } catch (error) {
    logger.warn("Appointment confirmation activity log failed", {
      appointmentId: existing.id,
      businessId: bid,
      error,
    });
  }

  const statusCode =
    confirmationResult.deliveryStatus === "emailed"
      ? 200
      : confirmationResult.deliveryStatus === "missing_email"
        ? 400
        : confirmationResult.deliveryStatus === "disabled"
          ? 200
        : confirmationResult.deliveryStatus === "smtp_disabled"
          ? 503
          : 502;

  res.status(statusCode).json({
    ok:
      confirmationResult.deliveryStatus === "emailed" ||
      confirmationResult.deliveryStatus === "disabled",
    ...confirmationResult,
  });
}));

appointmentsRouter.post("/:id/updateStatus", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const statusParsed = appointmentStatusSchema.safeParse(req.body?.status ?? "scheduled");
  if (!statusParsed.success) throw new BadRequestError("Invalid status.");
  const status = statusParsed.data;
  const bid = businessId(req);
  const [existing] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
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
    try {
      await createRequestActivityLog(req, {
        businessId: bid,
        action:
          confirmationResult.deliveryStatus === "emailed"
            ? "appointment.confirmation_sent"
            : confirmationResult.deliveryStatus === "disabled"
              ? "appointment.confirmation_skipped"
            : "appointment.confirmation_failed",
        entityType: "appointment",
        entityId: updated.id,
        metadata: {
          recipient: confirmationResult.recipient,
          deliveryStatus: confirmationResult.deliveryStatus,
          deliveryError: confirmationResult.deliveryError,
        },
      });
    } catch (error) {
      logger.warn("Appointment confirmation activity log failed", {
        appointmentId: updated.id,
        businessId: bid,
        error,
      });
    }
    try {
      await scheduleGoogleCalendarAppointmentSync({
        businessId: bid,
        appointmentId: updated.id,
        createdByUserId: req.userId ?? null,
      });
    } catch (error) {
      logger.warn("Google Calendar appointment sync enqueue failed after confirmed status", {
        appointmentId: updated.id,
        businessId: bid,
        error,
      });
    }
    res.json({ ...updated, ...confirmationResult });
    return;
  }

  try {
    await scheduleGoogleCalendarAppointmentSync({
      businessId: bid,
      appointmentId: updated.id,
      createdByUserId: req.userId ?? null,
    });
  } catch (error) {
    logger.warn("Google Calendar appointment sync enqueue failed after status update", {
      appointmentId: updated.id,
      businessId: bid,
      status,
      error,
    });
  }

  res.json(updated);
});

async function deleteAppointmentRecord(req: Request, res: Response) {
  const bid = businessId(req);
  const [existing] = await db
    .select({
      id: appointments.id,
      clientId: appointments.clientId,
      internalNotes: appointments.internalNotes,
    })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Appointment not found.");

  const isInternalAppointment = isCalendarBlockInternalNotes(existing.internalNotes) || !existing.clientId;

  const linkedInvoices = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, bid),
        eq(invoices.appointmentId, existing.id)
      )
    );
  if (!canDeleteAppointmentWithInvoiceStatuses(linkedInvoices.map((invoice) => invoice.status))) {
    throw new BadRequestError("This appointment already has an active invoice and cannot be deleted.");
  }

  const [linkedQuote] = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(and(eq(quotes.businessId, bid), eq(quotes.appointmentId, existing.id)))
    .limit(1);
  if (linkedQuote) {
    throw new BadRequestError("This appointment is linked to a quote and cannot be deleted.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({ appointmentId: null, updatedAt: new Date() })
      .where(
        and(
          eq(invoices.businessId, bid),
          eq(invoices.appointmentId, existing.id),
          eq(invoices.status, "void")
        )
      );
    await tx.delete(appointmentServices).where(eq(appointmentServices.appointmentId, existing.id));
    await tx.delete(appointments).where(eq(appointments.id, existing.id));
  });

  await createRequestActivityLog(req, {
    businessId: bid,
    action: "appointment.deleted",
    entityType: "appointment",
    entityId: existing.id,
    metadata: {
      internal: isInternalAppointment,
    },
  });

  res.status(204).send();
}

appointmentsRouter.delete("/:id", requireAuth, requireTenant, deleteAppointmentRecord);
appointmentsRouter.post("/:id/delete", requireAuth, requireTenant, deleteAppointmentRecord);

appointmentsRouter.post("/:id/complete", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
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
    try {
      await scheduleGoogleCalendarAppointmentSync({
        businessId: bid,
        appointmentId: updated.id,
        createdByUserId: req.userId ?? null,
      });
    } catch (error) {
      logger.warn("Google Calendar appointment sync enqueue failed after complete", {
        appointmentId: updated.id,
        businessId: bid,
        error,
      });
    }
  }
  res.json(updated);
});

appointmentsRouter.post("/:id/cancel", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, bid)))
    .limit(1);
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
    try {
      await scheduleGoogleCalendarAppointmentSync({
        businessId: bid,
        appointmentId: updated.id,
        createdByUserId: req.userId ?? null,
      });
    } catch (error) {
      logger.warn("Google Calendar appointment sync enqueue failed after cancel", {
        appointmentId: updated.id,
        businessId: bid,
        error,
      });
    }
  }
  res.json(updated);
});
