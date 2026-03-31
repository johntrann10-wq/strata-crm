import { randomUUID } from "crypto";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { invoices, businesses, invoiceLineItems, clients, payments, appointments, vehicles, quotes, activityLogs } from "../db/schema.js";
import { eq, and, or, desc, asc, isNull, sql, ilike } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { logger } from "../lib/logger.js";
import { renderInvoiceHtml, type InvoiceTemplateData } from "../lib/invoiceTemplate.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { isEmailConfigured } from "../lib/env.js";
import { sendInvoiceEmail } from "../lib/email.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { buildVehicleDisplayName } from "../lib/vehicleFormatting.js";
import { buildPublicDocumentUrl, createPublicDocumentToken, verifyPublicDocumentToken } from "../lib/publicDocumentAccess.js";

export const invoicesRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const createSchema = z.object({
  clientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  /** Optional: validated against clientId (does not auto-copy lines — UI sends lineItems). */
  quoteId: z.string().uuid().optional(),
  status: z.enum(["draft", "sent"]).optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().min(0),
      })
    )
    .min(1),
  discountAmount: z.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  dueDate: z.union([z.string(), z.null()]).optional(),
});
const sendInvoiceSchema = z.object({
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

const INVOICE_STATUSES = ["draft", "sent", "paid", "partial", "void"] as const;

function isPaymentSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cause = "cause" in error ? (error as { cause?: unknown }).cause : error;
  if (!cause || typeof cause !== "object") return false;
  const code = "code" in cause ? String((cause as { code?: unknown }).code ?? "") : "";
  const message = "message" in cause ? String((cause as { message?: unknown }).message ?? "") : "";
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes('relation "payments" does not exist') ||
    message.includes('column "reversed_at" does not exist') ||
    message.includes('column "notes" does not exist') ||
    message.includes('column "reference_number" does not exist')
  );
}

function isInvoiceSchemaDriftError(error: unknown): boolean {
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

function isInvoiceNumberConflictError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown; constraint?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  const constraint = String((cause as { constraint?: unknown }).constraint ?? "").toLowerCase();
  return (
    code === "23505" &&
    (constraint.includes("invoice_number") ||
      message.includes("invoice_number") ||
      message.includes("invoices_invoice_number_unique"))
  );
}

function nextInvoiceNumberCandidate(current: string, fallbackSeed: number) {
  const match = /^INV-(\d+)$/.exec(current);
  if (match) {
    return `INV-${Number(match[1]) + 1}`;
  }
  return `INV-${fallbackSeed}`;
}

const createInvoiceReturning = {
  id: invoices.id,
  businessId: invoices.businessId,
  clientId: invoices.clientId,
  appointmentId: invoices.appointmentId,
  invoiceNumber: invoices.invoiceNumber,
  status: invoices.status,
  subtotal: invoices.subtotal,
  taxRate: invoices.taxRate,
  taxAmount: invoices.taxAmount,
  discountAmount: invoices.discountAmount,
  total: invoices.total,
  dueDate: invoices.dueDate,
  paidAt: invoices.paidAt,
  notes: invoices.notes,
  createdAt: invoices.createdAt,
  updatedAt: invoices.updatedAt,
};

let cachedInvoiceColumns: Set<string> | null = null;
let cachedBusinessColumns: Set<string> | null = null;
let cachedInvoiceLineItemColumns: Set<string> | null = null;

const MODERN_INVOICE_CREATE_COLUMNS = [
  "business_id",
  "client_id",
  "appointment_id",
  "invoice_number",
  "status",
  "subtotal",
  "tax_rate",
  "tax_amount",
  "discount_amount",
  "total",
  "due_date",
  "notes",
  "created_at",
  "updated_at",
] as const;

const MODERN_INVOICE_LINE_ITEM_COLUMNS = [
  "invoice_id",
  "description",
  "quantity",
  "unit_price",
  "total",
  "created_at",
  "updated_at",
] as const;

function hasRequiredColumns(columns: Set<string>, required: readonly string[]) {
  return required.every((column) => columns.has(column));
}

async function getInvoiceColumns(): Promise<Set<string>> {
  if (cachedInvoiceColumns) return cachedInvoiceColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices'
  `);
  const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
  cachedInvoiceColumns = new Set(
    rows.map((row) => row?.column_name).filter((value): value is string => typeof value === "string")
  );
  return cachedInvoiceColumns;
}

async function getBusinessColumns(): Promise<Set<string>> {
  if (cachedBusinessColumns) return cachedBusinessColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses'
  `);
  const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
  cachedBusinessColumns = new Set(
    rows.map((row) => row?.column_name).filter((value): value is string => typeof value === "string")
  );
  return cachedBusinessColumns;
}

async function getNextInvoiceNumberWithFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: any,
  bid: string
) {
  try {
    const [row] = await executor
      .select({ id: businesses.id, nextInvoiceNumber: businesses.nextInvoiceNumber })
      .from(businesses)
      .where(eq(businesses.id, bid))
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (!isInvoiceSchemaDriftError(error)) throw error;
    const [row] = await executor
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.id, bid))
      .limit(1);
    if (!row) return null;
    return { id: row.id, nextInvoiceNumber: null };
  }
}

async function getHighestExistingInvoiceNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: any,
  bid: string
): Promise<number | null> {
  const invoiceColumns = await getInvoiceColumns();
  if (!invoiceColumns.has("invoice_number")) return null;
  const result = await executor.execute(sql`
    select max((regexp_match(invoice_number, '^INV-(\d+)$'))[1]::int) as max_invoice_number
    from invoices
    where business_id = ${bid}
  `);
  const rows = (result as { rows?: Array<{ max_invoice_number?: number | string | null }> }).rows ?? [];
  const value = rows[0]?.max_invoice_number;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getInvoiceLineItemColumns(): Promise<Set<string>> {
  if (cachedInvoiceLineItemColumns) return cachedInvoiceLineItemColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'invoice_line_items'
  `);
  const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
  cachedInvoiceLineItemColumns = new Set(
    rows.map((row) => row?.column_name).filter((value): value is string => typeof value === "string")
  );
  return cachedInvoiceLineItemColumns;
}

async function insertLegacyInvoiceLineItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: any,
  data: {
    invoiceId: string;
    description: string;
    quantity: string;
    unitPrice: string;
    total: string;
  }
) {
  const columns = await getInvoiceLineItemColumns();
  const now = new Date();
  const insertData: Record<string, unknown> = {};
  if (columns.has("invoice_id")) insertData.invoiceId = data.invoiceId;
  if (columns.has("description")) insertData.description = data.description;
  if (columns.has("quantity")) insertData.quantity = data.quantity;
  if (columns.has("unit_price")) insertData.unitPrice = data.unitPrice;
  if (columns.has("total")) insertData.total = data.total;
  if (columns.has("created_at")) insertData.createdAt = now;
  if (columns.has("updated_at")) insertData.updatedAt = now;
  if (Object.keys(insertData).length === 0) {
    throw new BadRequestError("Invoice line item schema is unavailable.");
  }
  await executor.insert(invoiceLineItems).values(insertData);
}

async function insertLegacyInvoice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: any,
  bid: string,
  invoiceId: string,
  data: {
    clientId: string;
    appointmentId: string | null;
    invoiceNumber: string;
    status: string;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
    notes: string | null;
    dueDate: Date | null;
  }
) {
  const columns = await getInvoiceColumns();
  const now = new Date();
  const insertData: Record<string, unknown> = {
    id: invoiceId,
    businessId: bid,
    clientId: data.clientId,
  };

  if (columns.has("invoice_number")) insertData.invoiceNumber = data.invoiceNumber;
  if (columns.has("status")) insertData.status = data.status;
  if (columns.has("subtotal")) insertData.subtotal = String(data.subtotal);
  if (columns.has("tax_rate")) insertData.taxRate = String(data.taxRate);
  if (columns.has("tax_amount")) insertData.taxAmount = String(data.taxAmount);
  if (columns.has("discount_amount")) insertData.discountAmount = String(data.discountAmount);
  if (columns.has("total")) insertData.total = String(data.total);
  if (data.appointmentId && columns.has("appointment_id")) insertData.appointmentId = data.appointmentId;
  if (data.notes != null && columns.has("notes")) insertData.notes = data.notes;
  if (data.dueDate != null && columns.has("due_date")) insertData.dueDate = data.dueDate;
  if (columns.has("created_at")) insertData.createdAt = now;
  if (columns.has("updated_at")) insertData.updatedAt = now;

  await executor.insert(invoices).values(insertData);

  return {
    id: invoiceId,
    businessId: bid,
    clientId: data.clientId,
    appointmentId: columns.has("appointment_id") ? data.appointmentId : null,
    invoiceNumber: data.invoiceNumber,
    status: data.status,
    subtotal: columns.has("subtotal") ? String(data.subtotal) : String(data.total),
    taxRate: columns.has("tax_rate") ? String(data.taxRate) : "0",
    taxAmount: columns.has("tax_amount") ? String(data.taxAmount) : "0",
    discountAmount: columns.has("discount_amount") ? String(data.discountAmount) : "0",
    total: columns.has("total") ? String(data.total) : String(data.subtotal),
    dueDate: columns.has("due_date") ? data.dueDate : null,
    paidAt: null,
    notes: columns.has("notes") ? data.notes : null,
    createdAt: now,
    updatedAt: now,
  };
}

async function markInvoiceSentWithFallback(invoiceId: string) {
  try {
    const [updated] = await db
      .update(invoices)
      .set({ status: "sent", updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId))
      .returning({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
      });
    return updated ?? null;
  } catch (error) {
    if (!isInvoiceSchemaDriftError(error)) throw error;
    logger.warn("Invoice schema drift detected while finalizing send; falling back to legacy invoice update", {
      invoiceId,
      error,
    });
    const invoiceColumns = await getInvoiceColumns();
    const updates: Record<string, unknown> = {};
    if (invoiceColumns.has("status")) updates.status = "sent";
    if (invoiceColumns.has("updated_at")) updates.updatedAt = new Date();
    if (Object.keys(updates).length > 0) {
      await db
        .update(invoices)
        .set(updates as Partial<typeof invoices.$inferInsert>)
        .where(eq(invoices.id, invoiceId));
    }
    const [refetched] = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (!refetched) return null;
    return {
      id: refetched.id,
      invoiceNumber: refetched.invoiceNumber ?? null,
      status: invoiceColumns.has("status") ? "sent" : null,
    };
  }
}

async function listInvoicePayments(invoiceId: string) {
  try {
    return await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on invoice payment list; falling back to legacy selection", { invoiceId, error });
    const rows = await db
      .select({
        id: payments.id,
        businessId: payments.businessId,
        invoiceId: payments.invoiceId,
        amount: payments.amount,
        method: payments.method,
        paidAt: payments.paidAt,
        idempotencyKey: payments.idempotencyKey,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
      })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    return rows.map((row) => ({ ...row, reversedAt: null, notes: null, referenceNumber: null }));
  }
}

async function listActiveInvoicePayments(invoiceId: string) {
  try {
    return await db.select().from(payments).where(and(eq(payments.invoiceId, invoiceId), isNull(payments.reversedAt)));
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on active invoice payment list; falling back to legacy selection", { invoiceId, error });
    return await listInvoicePayments(invoiceId);
  }
}

async function listInvoicesWithPaymentMetrics(whereClause: ReturnType<typeof and>, orderByClause: ReturnType<typeof desc>, first: number, bid: string) {
  const paymentTotals = db
    .select({
      invoiceId: payments.invoiceId,
      totalPaid: sql<string>`coalesce(sum(case when ${payments.reversedAt} is null then ${payments.amount} else 0 end), 0)`,
      lastPaidAt: sql<Date | null>`max(case when ${payments.reversedAt} is null then ${payments.paidAt} else null end)`,
    })
    .from(payments)
    .groupBy(payments.invoiceId)
    .as("payment_totals");

  const paymentTotalsLegacy = db
    .select({
      invoiceId: payments.invoiceId,
      totalPaid: sql<string>`coalesce(sum(${payments.amount}), 0)`,
      lastPaidAt: sql<Date | null>`max(${payments.paidAt})`,
    })
    .from(payments)
    .groupBy(payments.invoiceId)
    .as("payment_totals_legacy");

  const invoiceActivity = db
    .select({
      entityId: activityLogs.entityId,
      lastSentAt: sql<Date | null>`max(case when ${activityLogs.action} = 'invoice.sent' then ${activityLogs.createdAt} else null end)`,
    })
    .from(activityLogs)
    .where(and(eq(activityLogs.businessId, bid), eq(activityLogs.entityType, "invoice")))
    .groupBy(activityLogs.entityId)
    .as("invoice_activity");

  try {
    return await db
      .select({
        id: invoices.id,
        businessId: invoices.businessId,
        clientId: invoices.clientId,
        appointmentId: invoices.appointmentId,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        subtotal: invoices.subtotal,
        taxRate: invoices.taxRate,
        taxAmount: invoices.taxAmount,
        discountAmount: invoices.discountAmount,
        total: invoices.total,
        dueDate: invoices.dueDate,
        paidAt: invoices.paidAt,
        notes: invoices.notes,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        aptStart: appointments.startTime,
        vehicleYear: vehicles.year,
        vehicleMake: vehicles.make,
        vehicleModel: vehicles.model,
        totalPaid: sql<string>`coalesce(${paymentTotals.totalPaid}, 0)`,
        lastPaidAt: paymentTotals.lastPaidAt,
        lastSentAt: invoiceActivity.lastSentAt,
      })
      .from(invoices)
      .leftJoin(clients, and(eq(invoices.clientId, clients.id), eq(clients.businessId, bid)))
      .leftJoin(appointments, eq(invoices.appointmentId, appointments.id))
      .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, bid)))
      .leftJoin(paymentTotals, eq(paymentTotals.invoiceId, invoices.id))
      .leftJoin(invoiceActivity, eq(invoiceActivity.entityId, invoices.id))
      .where(whereClause)
      .groupBy(
        invoices.id,
        invoices.businessId,
        invoices.clientId,
        invoices.appointmentId,
        invoices.invoiceNumber,
        invoices.status,
        invoices.subtotal,
        invoices.taxRate,
        invoices.taxAmount,
        invoices.discountAmount,
        invoices.total,
        invoices.dueDate,
        invoices.paidAt,
        invoices.notes,
        invoices.createdAt,
        invoices.updatedAt,
        clients.firstName,
        clients.lastName,
        appointments.startTime,
        vehicles.year,
        vehicles.make,
        vehicles.model,
        paymentTotals.totalPaid,
        paymentTotals.lastPaidAt,
        invoiceActivity.lastSentAt
      )
      .orderBy(orderByClause)
      .limit(first);
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on invoice list; falling back to legacy invoice metrics", { businessId: bid, error });
    return await db
      .select({
        id: invoices.id,
        businessId: invoices.businessId,
        clientId: invoices.clientId,
        appointmentId: invoices.appointmentId,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        subtotal: invoices.subtotal,
        taxRate: invoices.taxRate,
        taxAmount: invoices.taxAmount,
        discountAmount: invoices.discountAmount,
        total: invoices.total,
        dueDate: invoices.dueDate,
        paidAt: invoices.paidAt,
        notes: invoices.notes,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        aptStart: appointments.startTime,
        vehicleYear: vehicles.year,
        vehicleMake: vehicles.make,
        vehicleModel: vehicles.model,
        totalPaid: sql<string>`coalesce(${paymentTotalsLegacy.totalPaid}, 0)`,
        lastPaidAt: paymentTotalsLegacy.lastPaidAt,
        lastSentAt: invoiceActivity.lastSentAt,
      })
      .from(invoices)
      .leftJoin(clients, and(eq(invoices.clientId, clients.id), eq(clients.businessId, bid)))
      .leftJoin(appointments, eq(invoices.appointmentId, appointments.id))
      .leftJoin(vehicles, and(eq(appointments.vehicleId, vehicles.id), eq(vehicles.businessId, bid)))
      .leftJoin(paymentTotalsLegacy, eq(paymentTotalsLegacy.invoiceId, invoices.id))
      .leftJoin(invoiceActivity, eq(invoiceActivity.entityId, invoices.id))
      .where(whereClause)
      .groupBy(
        invoices.id,
        invoices.businessId,
        invoices.clientId,
        invoices.appointmentId,
        invoices.invoiceNumber,
        invoices.status,
        invoices.subtotal,
        invoices.taxRate,
        invoices.taxAmount,
        invoices.discountAmount,
        invoices.total,
        invoices.dueDate,
        invoices.paidAt,
        invoices.notes,
        invoices.createdAt,
        invoices.updatedAt,
        clients.firstName,
        clients.lastName,
        appointments.startTime,
        vehicles.year,
        vehicles.make,
        vehicles.model,
        paymentTotalsLegacy.totalPaid,
        paymentTotalsLegacy.lastPaidAt,
        invoiceActivity.lastSentAt
      )
      .orderBy(orderByClause)
      .limit(first);
  }
}

invoicesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Math.max(Number(req.query.first), 1), 100) : 50;
  let parsedFilter:
    | {
        clientId?: { equals?: string };
        appointmentId?: { equals?: string };
        vehicleId?: { equals?: string };
      }
    | undefined;
  if (typeof req.query.filter === "string" && req.query.filter.trim()) {
    try {
      parsedFilter = JSON.parse(req.query.filter) as typeof parsedFilter;
    } catch {
      parsedFilter = undefined;
    }
  }
  const clientIdRaw = typeof req.query.clientId === "string" ? req.query.clientId.trim() : "";
  const filterClientIdRaw =
    typeof parsedFilter?.clientId?.equals === "string" ? parsedFilter.clientId.equals.trim() : "";
  const clientIdCandidate = clientIdRaw || filterClientIdRaw;
  const clientIdFilter = z.string().uuid().safeParse(clientIdCandidate).success ? clientIdCandidate : undefined;
  const appointmentIdRaw = typeof req.query.appointmentId === "string" ? req.query.appointmentId.trim() : "";
  const filterAppointmentIdRaw =
    typeof parsedFilter?.appointmentId?.equals === "string" ? parsedFilter.appointmentId.equals.trim() : "";
  const appointmentIdCandidate = appointmentIdRaw || filterAppointmentIdRaw;
  const appointmentIdFilter = z.string().uuid().safeParse(appointmentIdCandidate).success
    ? appointmentIdCandidate
    : undefined;
  const vehicleIdRaw = typeof req.query.vehicleId === "string" ? req.query.vehicleId.trim() : "";
  const filterVehicleIdRaw =
    typeof parsedFilter?.vehicleId?.equals === "string" ? parsedFilter.vehicleId.equals.trim() : "";
  const vehicleIdCandidate = vehicleIdRaw || filterVehicleIdRaw;
  const vehicleIdFilter = z.string().uuid().safeParse(vehicleIdCandidate).success ? vehicleIdCandidate : undefined;
  const unpaid = req.query.unpaid === "1" || req.query.unpaid === "true";
  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const statusFilter =
    !unpaid && statusRaw && statusRaw !== "all" && (INVOICE_STATUSES as readonly string[]).includes(statusRaw)
      ? statusRaw
      : undefined;

  let orderBy = desc(invoices.createdAt);
  if (typeof req.query.sort === "string" && req.query.sort.trim()) {
    try {
      const s = JSON.parse(req.query.sort) as { createdAt?: string };
      if (s?.createdAt === "Ascending") orderBy = asc(invoices.createdAt);
    } catch {
      /* ignore invalid sort */
    }
  }

  const conditions = [eq(invoices.businessId, bid)];
  if (clientIdFilter) conditions.push(eq(invoices.clientId, clientIdFilter));
  if (appointmentIdFilter) conditions.push(eq(invoices.appointmentId, appointmentIdFilter));
  if (vehicleIdFilter) conditions.push(eq(appointments.vehicleId, vehicleIdFilter));
  if (unpaid) {
    conditions.push(sql`${invoices.status} in ('sent', 'partial')`);
  } else if (statusFilter) {
    conditions.push(eq(invoices.status, statusFilter as (typeof INVOICE_STATUSES)[number]));
  }

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const term = `%${search}%`;
  const whereClause =
    search.length >= 2
      ? and(
          ...conditions,
          or(
            ilike(invoices.invoiceNumber, term),
            ilike(clients.firstName, term),
            ilike(clients.lastName, term),
            ilike(vehicles.make, term),
            ilike(vehicles.model, term),
            sql`cast(${invoices.id} as text) ilike ${term}`
          )
        )!
      : and(...conditions)!;

  const rows = await listInvoicesWithPaymentMetrics(whereClause, orderBy, first, bid);

  const records = rows.map((r) => {
    const totalAmount = Number(r.total ?? 0);
    const paidAmount = Number(r.totalPaid ?? 0);
    return {
      id: r.id,
      businessId: r.businessId,
      clientId: r.clientId,
      appointmentId: r.appointmentId,
      invoiceNumber: r.invoiceNumber,
      status: r.status,
      subtotal: r.subtotal,
      taxRate: r.taxRate,
      taxAmount: r.taxAmount,
      discountAmount: r.discountAmount,
      total: r.total,
      totalPaid: r.totalPaid,
      remainingBalance: String(Math.max(0, totalAmount - paidAmount).toFixed(2)),
      dueDate: r.dueDate,
      paidAt: r.paidAt,
      lastPaidAt: r.lastPaidAt,
      lastSentAt: r.lastSentAt,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      client:
        r.clientFirstName != null
          ? { id: r.clientId, firstName: r.clientFirstName, lastName: r.clientLastName ?? "" }
          : null,
      appointment:
        r.appointmentId != null
          ? { id: r.appointmentId, startTime: r.aptStart ?? null }
          : null,
      vehicle:
        r.vehicleMake != null
          ? {
            year: r.vehicleYear ?? null,
            make: r.vehicleMake,
            model: r.vehicleModel ?? "",
            displayName: buildVehicleDisplayName({
              year: r.vehicleYear,
              make: r.vehicleMake,
              model: r.vehicleModel,
            }),
          }
        : null,
    };
  });

  res.json({ records });
});

invoicesRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.businessId, bid)))
    .limit(1);
  if (!row) throw new NotFoundError("Invoice not found.");
  const lineItemsRows = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, row.id));
  const paymentsList = await listInvoicePayments(row.id);
  const [clientRow] = await db.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.id, row.clientId)).limit(1);
  let appointmentData:
    | {
        id: string;
        startTime: Date | null;
        vehicle?: {
          year: number | null;
          make: string;
          model: string;
          trim: string | null;
          displayName: string;
        };
      }
    | null = null;
  let quoteData: { id: string; status: string; total: string | null } | null = null;
  if (row.appointmentId) {
    const [apt] = await db.select({ id: appointments.id, startTime: appointments.startTime, vehicleId: appointments.vehicleId }).from(appointments).where(eq(appointments.id, row.appointmentId)).limit(1);
    if (apt?.vehicleId) {
      const [v] = await db
        .select({
          year: vehicles.year,
          make: vehicles.make,
          model: vehicles.model,
        })
        .from(vehicles)
        .where(eq(vehicles.id, apt.vehicleId))
        .limit(1);
      appointmentData = {
        id: apt.id,
        startTime: apt.startTime,
        vehicle: v
          ? {
              year: v.year,
              make: v.make ?? "",
              model: v.model ?? "",
              trim: null,
              displayName: buildVehicleDisplayName({
                year: v.year,
                make: v.make,
                model: v.model,
              }),
            }
          : undefined,
      };
    } else {
      appointmentData = apt ? { id: apt.id, startTime: apt.startTime } : null;
    }
    const [quote] = await db
      .select({ id: quotes.id, status: quotes.status, total: quotes.total })
      .from(quotes)
      .where(and(eq(quotes.appointmentId, row.appointmentId), eq(quotes.businessId, bid)))
      .orderBy(desc(quotes.updatedAt), desc(quotes.createdAt))
      .limit(1);
    quoteData = quote ?? null;
  }
  res.json({
    ...row,
    lineItems: lineItemsRows,
    payments: paymentsList,
    client: clientRow ?? null,
    appointment: appointmentData,
    quote: quoteData,
    business: { id: row.businessId },
  });
});

invoicesRouter.get("/:id/html", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.businessId, bid)))
    .limit(1);
  if (!row) throw new NotFoundError("Invoice not found.");
  const [businessRow] = await db
    .select({ name: businesses.name, email: businesses.email, phone: businesses.phone, address: businesses.address, city: businesses.city, state: businesses.state, zip: businesses.zip, timezone: businesses.timezone })
    .from(businesses)
    .where(eq(businesses.id, bid))
    .limit(1);
  const [clientRow] = await db
    .select({ firstName: clients.firstName, lastName: clients.lastName, email: clients.email, phone: clients.phone, address: clients.address })
    .from(clients)
    .where(eq(clients.id, row.clientId))
    .limit(1);
  const lineItemsRows = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, row.id));
  const paymentsList = await listActiveInvoicePayments(row.id);
  const totalPaid = paymentsList.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const templateData: InvoiceTemplateData = {
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    dueDate: row.dueDate,
    subtotal: row.subtotal,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    discountAmount: row.discountAmount,
    total: row.total,
    totalPaid: String(totalPaid),
    notes: row.notes,
    createdAt: row.createdAt,
    business: {
      name: businessRow?.name,
      email: businessRow?.email,
      phone: businessRow?.phone,
      address: [businessRow?.address, businessRow?.city, businessRow?.state, businessRow?.zip].filter(Boolean).join(", "),
      city: businessRow?.city,
      state: businessRow?.state,
      zip: businessRow?.zip,
      timezone: businessRow?.timezone,
    },
    client: {
      firstName: clientRow?.firstName,
      lastName: clientRow?.lastName,
      email: clientRow?.email,
      phone: clientRow?.phone,
      address: clientRow?.address,
    },
    lineItems: lineItemsRows.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, total: li.total })),
    payments: paymentsList.map((p) => ({ amount: p.amount, method: p.method, paidAt: p.paidAt })),
  };
  const html = renderInvoiceHtml(templateData);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(html);
});

invoicesRouter.get("/:id/public-html", async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  const access = verifyPublicDocumentToken(token, { kind: "invoice", entityId: req.params.id });
  if (!access) throw new ForbiddenError("Invoice access link is invalid or expired.");

  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.businessId, access.businessId)))
    .limit(1);
  if (!row) throw new NotFoundError("Invoice not found.");
  const [businessRow] = await db
    .select({ name: businesses.name, email: businesses.email, phone: businesses.phone, address: businesses.address, city: businesses.city, state: businesses.state, zip: businesses.zip, timezone: businesses.timezone })
    .from(businesses)
    .where(eq(businesses.id, access.businessId))
    .limit(1);
  const [clientRow] = await db
    .select({ firstName: clients.firstName, lastName: clients.lastName, email: clients.email, phone: clients.phone, address: clients.address })
    .from(clients)
    .where(eq(clients.id, row.clientId))
    .limit(1);
  const lineItemsRows = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, row.id));
  const paymentsList = await listActiveInvoicePayments(row.id);
  const totalPaid = paymentsList.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const templateData: InvoiceTemplateData = {
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    dueDate: row.dueDate,
    subtotal: row.subtotal,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    discountAmount: row.discountAmount,
    total: row.total,
    totalPaid: String(totalPaid),
    notes: row.notes,
    createdAt: row.createdAt,
    business: {
      name: businessRow?.name,
      email: businessRow?.email,
      phone: businessRow?.phone,
      address: [businessRow?.address, businessRow?.city, businessRow?.state, businessRow?.zip].filter(Boolean).join(", "),
      city: businessRow?.city,
      state: businessRow?.state,
      zip: businessRow?.zip,
      timezone: businessRow?.timezone,
    },
    client: {
      firstName: clientRow?.firstName,
      lastName: clientRow?.lastName,
      email: clientRow?.email,
      phone: clientRow?.phone,
      address: clientRow?.address,
    },
    lineItems: lineItemsRows.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, total: li.total })),
    payments: paymentsList.map((p) => ({ amount: p.amount, method: p.method, paidAt: p.paidAt })),
  };
  const html = renderInvoiceHtml(templateData);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(html);
});

invoicesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const data = parsed.data;
  const bid = businessId(req);
  let appointment:
    | {
        id: string;
        clientId: string;
        vehicleId: string | null;
      }
    | undefined;
  let quote:
    | {
        id: string;
        clientId: string;
        vehicleId: string | null;
        appointmentId: string | null;
      }
    | undefined;

  // Tenancy: client must belong to this business
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, parsed.data.clientId), eq(clients.businessId, bid)))
    .limit(1);
  if (!client) throw new BadRequestError("Client not found or access denied.");

  if (parsed.data.appointmentId) {
    const [apt] = await db
      .select({
        id: appointments.id,
        clientId: appointments.clientId,
        vehicleId: appointments.vehicleId,
      })
      .from(appointments)
      .where(and(eq(appointments.id, parsed.data.appointmentId), eq(appointments.businessId, bid)))
      .limit(1);
    if (!apt) throw new BadRequestError("Appointment not found.");
    if (apt.clientId !== parsed.data.clientId) throw new BadRequestError("Invoice client must match the appointment client.");
    appointment = {
      id: apt.id,
      clientId: apt.clientId,
      vehicleId: apt.vehicleId,
    };
  }

  if (parsed.data.quoteId) {
    const [q] = await db
      .select({
        id: quotes.id,
        clientId: quotes.clientId,
        vehicleId: quotes.vehicleId,
        appointmentId: quotes.appointmentId,
      })
      .from(quotes)
      .where(and(eq(quotes.id, parsed.data.quoteId), eq(quotes.businessId, bid)))
      .limit(1);
    if (!q) throw new BadRequestError("Quote not found.");
    if (q.clientId !== parsed.data.clientId) throw new BadRequestError("Invoice client must match the quote client.");
    quote = {
      id: q.id,
      clientId: q.clientId,
      vehicleId: q.vehicleId,
      appointmentId: q.appointmentId,
    };
  }

  if (appointment && quote) {
    if (quote.appointmentId && quote.appointmentId !== appointment.id) {
      throw new BadRequestError("Invoice quote must match the linked appointment.");
    }
    if (quote.vehicleId && appointment.vehicleId && quote.vehicleId !== appointment.vehicleId) {
      throw new BadRequestError("Invoice quote vehicle must match the linked appointment vehicle.");
    }
  }

  const lineItems = parsed.data.lineItems;
  const initialStatus = parsed.data.status ?? "draft";
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const discountAmount = parsed.data.discountAmount ?? 0;
  const taxRate = parsed.data.taxRate ?? 0;
  const taxAmount = (subtotal * taxRate) / 100;
  const total = Math.max(0, subtotal + taxAmount - discountAmount);
  const items = lineItems.map((li) => {
    const lineTotal = li.quantity * li.unitPrice;
    return { description: li.description, quantity: String(li.quantity), unitPrice: String(li.unitPrice), total: String(lineTotal) };
  });

  // Transaction: atomic create; nextInvoiceNumber read/update in same tx to reduce race window
  const dueDate =
    parsed.data.dueDate != null && parsed.data.dueDate !== ""
      ? new Date(parsed.data.dueDate)
      : null;

  async function createInvoiceWithExecutor(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      executor: any
    ) {
    const b = await getNextInvoiceNumberWithFallback(executor, bid);
    if (!b) throw new NotFoundError("Business not found.");
    const nextNum = b.nextInvoiceNumber ?? null;
    const invoiceId = randomUUID();
    const highestExistingInvoiceNumber = await getHighestExistingInvoiceNumber(executor, bid);
    const initialNumericInvoiceNumber = Math.max(nextNum ?? 1, (highestExistingInvoiceNumber ?? 0) + 1);
    const initialInvoiceNumber = `INV-${initialNumericInvoiceNumber}`;
    const dueDate =
      data.dueDate != null && data.dueDate !== ""
        ? new Date(data.dueDate)
        : null;
      let created:
      | {
          id: string;
          businessId: string;
          clientId: string;
          appointmentId: string | null;
          invoiceNumber: string;
          status: string;
          subtotal: string;
          taxRate: string;
          taxAmount: string;
          discountAmount: string;
          total: string;
          dueDate: Date | null;
          paidAt: null;
          notes: string | null;
          createdAt: Date;
          updatedAt: Date;
        }
        | null = null;
      const now = new Date();
      const invoiceColumns = await getInvoiceColumns();
      const canUseModernInvoiceInsert = hasRequiredColumns(invoiceColumns, MODERN_INVOICE_CREATE_COLUMNS);
      let invoiceNumber = initialInvoiceNumber;
      for (let attempt = 0; attempt < 25 && !created; attempt += 1) {
        try {
          if (canUseModernInvoiceInsert) {
            await executor
              .insert(invoices)
              .values({
                id: invoiceId,
                businessId: bid,
                clientId: data.clientId,
                appointmentId: data.appointmentId ?? null,
                invoiceNumber,
                status: initialStatus,
                subtotal: String(subtotal),
                taxRate: String(taxRate),
                taxAmount: String(taxAmount),
                discountAmount: String(discountAmount),
                total: String(total),
                notes: data.notes ?? null,
                dueDate,
                createdAt: now,
                updatedAt: now,
              })
              .returning({ id: invoices.id });
            created = {
              id: invoiceId,
              businessId: bid,
              clientId: data.clientId,
              appointmentId: data.appointmentId ?? null,
              invoiceNumber,
              status: initialStatus,
              subtotal: String(subtotal),
              taxRate: String(taxRate),
              taxAmount: String(taxAmount),
              discountAmount: String(discountAmount),
              total: String(total),
              dueDate,
              paidAt: null,
              notes: data.notes ?? null,
              createdAt: now,
              updatedAt: now,
            };
          } else {
            try {
              created = await insertLegacyInvoice(executor, bid, invoiceId, {
                clientId: data.clientId,
                appointmentId: data.appointmentId ?? null,
                invoiceNumber,
                status: initialStatus,
                subtotal,
                taxRate,
                taxAmount,
                discountAmount,
                total,
                notes: data.notes ?? null,
                dueDate,
              });
            } catch (error) {
              if (isInvoiceNumberConflictError(error)) {
                invoiceNumber = nextInvoiceNumberCandidate(invoiceNumber, Date.now() + attempt);
                continue;
              }
              throw error;
            }
          }
        } catch (error) {
          if (isInvoiceNumberConflictError(error)) {
            invoiceNumber = nextInvoiceNumberCandidate(invoiceNumber, Date.now() + attempt);
            continue;
          }
          if (!isInvoiceSchemaDriftError(error)) throw error;
          try {
            created = await insertLegacyInvoice(executor, bid, invoiceId, {
              clientId: data.clientId,
              appointmentId: data.appointmentId ?? null,
              invoiceNumber,
              status: initialStatus,
              subtotal,
              taxRate,
              taxAmount,
              discountAmount,
              total,
              notes: data.notes ?? null,
              dueDate,
            });
          } catch (fallbackError) {
            if (isInvoiceNumberConflictError(fallbackError)) {
              invoiceNumber = nextInvoiceNumberCandidate(invoiceNumber, Date.now() + attempt);
              continue;
            }
            throw fallbackError;
          }
        }
      }
      if (!created) throw new BadRequestError("Failed to create invoice.");
      try {
        const createdNumberMatch = /^INV-(\d+)$/.exec(created.invoiceNumber);
        const nextCounterValue =
          createdNumberMatch != null ? Number(createdNumberMatch[1]) + 1 : initialNumericInvoiceNumber + 1;
        await executor
          .update(businesses)
          .set({ nextInvoiceNumber: nextCounterValue, updatedAt: new Date() })
          .where(eq(businesses.id, bid));
      } catch (error) {
        if (!isInvoiceSchemaDriftError(error)) throw error;
        const businessColumns = await getBusinessColumns();
        if (businessColumns.has("next_invoice_number")) {
          const createdNumberMatch = /^INV-(\d+)$/.exec(created.invoiceNumber);
          const nextCounterValue =
            createdNumberMatch != null ? Number(createdNumberMatch[1]) + 1 : initialNumericInvoiceNumber + 1;
          const updates: Record<string, unknown> = { nextInvoiceNumber: nextCounterValue };
          if (businessColumns.has("updated_at")) updates.updatedAt = new Date();
          await executor.update(businesses).set(updates).where(eq(businesses.id, bid));
        } else {
        logger.warn("Business schema drift detected while incrementing invoice number; skipping counter update", {
          businessId: bid,
        });
      }
    }
      for (const it of items) {
        const invoiceLineItemColumns = await getInvoiceLineItemColumns();
        const canUseModernLineItemInsert = hasRequiredColumns(invoiceLineItemColumns, MODERN_INVOICE_LINE_ITEM_COLUMNS);
        if (canUseModernLineItemInsert) {
          try {
            await executor.insert(invoiceLineItems).values({
              invoiceId: created.id,
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              total: it.total,
            });
          } catch (error) {
            if (!isInvoiceSchemaDriftError(error)) throw error;
            await insertLegacyInvoiceLineItem(executor, {
              invoiceId: created.id,
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              total: it.total,
            });
          }
        } else {
          await insertLegacyInvoiceLineItem(executor, {
            invoiceId: created.id,
            description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
        });
      }
    }
    return created;
  }

  let inv;
  try {
    inv = await db.transaction((tx) => createInvoiceWithExecutor(tx));
  } catch (error) {
    logger.warn("Invoice create transaction failed; retrying with direct fallback", {
      businessId: bid,
      clientId: data.clientId,
      error,
    });
    inv = await createInvoiceWithExecutor(db);
  }

  logger.info("Invoice created", { invoiceId: inv.id, businessId: bid });
  try {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "invoice.created",
      entityType: "invoice",
      entityId: inv.id,
      metadata: {
        clientId: inv.clientId,
        appointmentId: inv.appointmentId,
        total: inv.total,
        status: inv.status,
      },
    });
  } catch (error) {
    logger.warn("Invoice created but activity log write failed", { invoiceId: inv.id, businessId: bid, error });
  }
  res.status(201).json(inv);
  })
);

invoicesRouter.post("/:id/void", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(invoices).where(and(eq(invoices.id, req.params.id), eq(invoices.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Invoice not found.");
  if (existing.status === "void") throw new BadRequestError("Invoice is already void.");
  const [updated] = await db.update(invoices).set({ status: "void", updatedAt: new Date() }).where(eq(invoices.id, req.params.id)).returning();
  if (updated) {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "invoice.voided",
      entityType: "invoice",
      entityId: updated.id,
      metadata: {
        invoiceNumber: updated.invoiceNumber ?? null,
      },
    });
  }
  res.json(updated);
});

invoicesRouter.post("/:id/sendToClient", requireAuth, requireTenant, wrapAsync(async (req: Request, res: Response) => {
  const parsed = sendInvoiceSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);
  const [existing] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      total: invoices.total,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientEmail: clients.email,
      businessName: businesses.name,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(businesses, eq(invoices.businessId, businesses.id))
    .where(and(eq(invoices.id, req.params.id), eq(invoices.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Invoice not found.");
  const recipientEmail = parsed.data.recipientEmail?.trim() || existing.clientEmail?.trim() || null;
  const recipientName =
    parsed.data.recipientName?.trim() ||
    `${existing.clientFirstName ?? ""} ${existing.clientLastName ?? ""}`.trim() ||
    "Customer";
  if (!recipientEmail) {
    logger.warn("Invoice send blocked: client email missing", { invoiceId: existing.id, businessId: bid });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "invoice.send_failed",
      entityType: "invoice",
      entityId: existing.id,
      metadata: {
        invoiceNumber: existing.invoiceNumber ?? null,
        recipient: null,
        recipientName,
        message: parsed.data.message ?? null,
        deliveryStatus: "missing_email",
        deliveryError: "Client does not have an email address.",
      },
    });
    res.status(400).json({
      message: "Client does not have an email address.",
      code: "EMAIL_MISSING_RECIPIENT",
      deliveryStatus: "missing_email",
      deliveryError: "Client does not have an email address.",
    });
    return;
  }
  if (!isEmailConfigured()) {
    logger.error("Invoice send blocked: SMTP is not configured", { invoiceId: existing.id, businessId: bid });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "invoice.send_failed",
      entityType: "invoice",
      entityId: existing.id,
      metadata: {
        invoiceNumber: existing.invoiceNumber ?? null,
        recipient: recipientEmail,
        recipientName,
        message: parsed.data.message ?? null,
        deliveryStatus: "smtp_disabled",
        deliveryError: "Transactional email is not configured.",
      },
    });
    res.status(503).json({
      ok: false,
      message: "Transactional email is not configured. Set RESEND_* or SMTP_* environment variables.",
      code: "EMAIL_NOT_CONFIGURED",
      deliveryStatus: "smtp_disabled",
      deliveryError: "Transactional email is not configured.",
    });
    return;
  }

  let deliveryError: string | null = null;
  try {
    const publicToken = createPublicDocumentToken({
      kind: "invoice",
      entityId: existing.id,
      businessId: bid,
    });
    await sendInvoiceEmail({
      to: recipientEmail,
      businessId: bid,
      clientName: recipientName,
      businessName: existing.businessName ?? "Your shop",
      amount: Number(existing.total ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" }),
      invoiceNumber: existing.invoiceNumber ?? "Invoice",
      invoiceUrl: buildPublicDocumentUrl(`/api/invoices/${existing.id}/public-html?token=${encodeURIComponent(publicToken)}`),
      message: parsed.data.message ?? null,
    });
  } catch (error) {
    deliveryError = error instanceof Error ? error.message : String(error);
    logger.error("Invoice email send failed", { invoiceId: existing.id, businessId: bid, error: deliveryError });
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "invoice.send_failed",
      entityType: "invoice",
      entityId: existing.id,
      metadata: {
        invoiceNumber: existing.invoiceNumber ?? null,
        recipient: recipientEmail,
        recipientName,
        message: parsed.data.message ?? null,
        deliveryStatus: "email_failed",
        deliveryError,
      },
    });
    res.status(502).json({
      ok: false,
      message: `Invoice email failed to send: ${deliveryError}`,
      code: "EMAIL_SEND_FAILED",
      deliveryStatus: "email_failed",
      deliveryError,
    });
    return;
  }

  let updated:
    | {
        id: string;
        invoiceNumber: string | null;
        status: string | null;
      }
    | null = null;
  try {
    updated = await markInvoiceSentWithFallback(req.params.id);
  } catch (error) {
    logger.error("Invoice emailed but post-send status update failed", {
      invoiceId: existing.id,
      businessId: bid,
      error,
    });
  }
  if (!updated) {
    updated = {
      id: existing.id,
      invoiceNumber: existing.invoiceNumber ?? null,
      status: "sent",
    };
  }
  try {
    await createRequestActivityLog(req, {
      businessId: bid,
      action: "invoice.sent",
      entityType: "invoice",
      entityId: updated.id,
      metadata: {
        invoiceNumber: updated.invoiceNumber ?? null,
        recipient: recipientEmail,
        recipientName,
        message: parsed.data.message ?? null,
        deliveryStatus: "emailed",
        deliveryError: null,
      },
    });
  } catch (error) {
    logger.warn("Invoice emailed but activity log write failed", {
      invoiceId: updated.id,
      businessId: bid,
      error,
    });
  }
  res.json({ ...updated, deliveryStatus: "emailed", deliveryError: null, recipient: recipientEmail, recipientName });
}));
