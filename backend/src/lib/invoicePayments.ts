import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { invoices, payments, appointments } from "../db/schema.js";
import { getAppointmentFinanceMirrorUpdates, getAppointmentFinanceSummaryMap } from "./appointmentFinance.js";
import { BadRequestError, ConflictError, NotFoundError } from "./errors.js";
import { logger } from "./logger.js";

type DbExecutor = any;

type ActiveInvoicePaymentSummary = {
  total: number;
  totalCents: number;
  lastPaidAt: Date | null;
};

type RecordInvoicePaymentInput = {
  businessId: string;
  invoiceId: string;
  amount: number;
  method: "cash" | "card" | "check" | "venmo" | "cashapp" | "zelle" | "other";
  paidAt?: Date;
  idempotencyKey?: string | null;
  notes?: string | null;
  referenceNumber?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
};

let cachedPaymentColumns: Set<string> | null = null;

function toMoneyCents(amount: number): number {
  if (!Number.isFinite(amount)) return Number.NaN;
  return Math.round(amount * 100);
}

function normalizeOptionalDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function isPaymentSchemaDriftError(error: unknown): boolean {
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
    message.includes('column "reference_number" does not exist') ||
    message.includes('column "stripe_checkout_session_id" does not exist') ||
    message.includes('column "stripe_payment_intent_id" does not exist') ||
    message.includes('column "stripe_charge_id" does not exist')
  );
}

async function getPaymentColumns(): Promise<Set<string>> {
  if (cachedPaymentColumns) return cachedPaymentColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
  `);
  const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
  cachedPaymentColumns = new Set(
    rows.map((row) => row?.column_name).filter((value): value is string => typeof value === "string")
  );
  return cachedPaymentColumns;
}

export function buildLegacyPaymentInsertValues(
  paymentColumns: Set<string>,
  input: RecordInvoicePaymentInput,
  amount: string,
  paidAt: Date
): Record<string, unknown> {
  const legacyValues: Record<string, unknown> = {
    businessId: input.businessId,
    invoiceId: input.invoiceId,
    amount,
    method: input.method,
    paidAt,
  };
  if (paymentColumns.has("idempotency_key")) legacyValues.idempotencyKey = input.idempotencyKey ?? null;
  if (paymentColumns.has("notes")) legacyValues.notes = input.notes ?? null;
  if (paymentColumns.has("reference_number")) legacyValues.referenceNumber = input.referenceNumber ?? null;
  if (paymentColumns.has("stripe_checkout_session_id")) {
    legacyValues.stripeCheckoutSessionId = input.stripeCheckoutSessionId ?? null;
  }
  if (paymentColumns.has("stripe_payment_intent_id")) {
    legacyValues.stripePaymentIntentId = input.stripePaymentIntentId ?? null;
  }
  if (paymentColumns.has("stripe_charge_id")) {
    legacyValues.stripeChargeId = input.stripeChargeId ?? null;
  }
  return legacyValues;
}

export async function getActiveInvoicePaymentSummary(
  invoiceId: string,
  tx: DbExecutor = db
): Promise<ActiveInvoicePaymentSummary> {
  try {
    const [sumRow] = await tx
      .select({
        total: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        lastPaidAt: sql<Date | null>`max(${payments.paidAt})`,
      })
      .from(payments)
      .where(and(eq(payments.invoiceId, invoiceId), sql`${payments.reversedAt} is null`));
    const total = Number(sumRow?.total ?? 0);
    return {
      total,
      totalCents: toMoneyCents(total),
      lastPaidAt: normalizeOptionalDate(sumRow?.lastPaidAt ?? null),
    };
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on payment aggregation; falling back to legacy sum", {
      invoiceId,
      error,
    });
    const [sumRow] = await tx
      .select({
        total: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        lastPaidAt: sql<Date | null>`max(${payments.paidAt})`,
      })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    const total = Number(sumRow?.total ?? 0);
    return {
      total,
      totalCents: toMoneyCents(total),
      lastPaidAt: normalizeOptionalDate(sumRow?.lastPaidAt ?? null),
    };
  }
}

export async function getActiveInvoicePaymentTotal(invoiceId: string, tx: DbExecutor = db) {
  const summary = await getActiveInvoicePaymentSummary(invoiceId, tx);
  return summary.total;
}

async function findRecentMatchingActivePayment(
  input: RecordInvoicePaymentInput,
  amount: string,
  paidAt: Date,
  tx: DbExecutor
) {
  if (input.idempotencyKey) return null;

  const notes = input.notes?.trim() || null;
  const referenceNumber = input.referenceNumber?.trim() || null;
  const duplicateWindowStart = new Date(Math.max(0, paidAt.getTime() - 30_000));

  try {
    const [existing] = await tx
      .select({
        id: payments.id,
      })
      .from(payments)
      .where(
        and(
          eq(payments.businessId, input.businessId),
          eq(payments.invoiceId, input.invoiceId),
          eq(payments.amount, amount),
          eq(payments.method, input.method),
          gte(payments.paidAt, duplicateWindowStart),
          sql`${payments.reversedAt} is null`,
          notes ? eq(payments.notes, notes) : isNull(payments.notes),
          referenceNumber ? eq(payments.referenceNumber, referenceNumber) : isNull(payments.referenceNumber)
        )
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);
    return existing ?? null;
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Skipping duplicate payment guard because payments schema is missing required fields", {
      invoiceId: input.invoiceId,
      businessId: input.businessId,
      error,
    });
    return null;
  }
}

/**
 * Sync appointment payment state after invoice payment changes.
 * `depositPaid` remains a compatibility field only and should mirror whether the
 * required deposit has actually been satisfied according to the computed finance summary.
 */
async function syncAppointmentPaymentState(
  invoiceId: string,
  newInvoiceStatus: string,
  paidAt: Date | null,
  tx: DbExecutor
): Promise<void> {
  try {
    // Find invoice with its linked appointment.
    const [inv] = await tx
      .select({
        appointmentId: invoices.appointmentId,
        businessId: invoices.businessId,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!inv?.appointmentId) return;

    const [appointment] = await tx
      .select({
        id: appointments.id,
        totalPrice: appointments.totalPrice,
        depositAmount: appointments.depositAmount,
      })
      .from(appointments)
      .where(eq(appointments.id, inv.appointmentId))
      .limit(1);

    if (!appointment) return;

    const finance = (
      await getAppointmentFinanceSummaryMap(
        inv.businessId,
        [
          {
            id: appointment.id,
            totalPrice: appointment.totalPrice,
            depositAmount: appointment.depositAmount,
            paidAt: null,
          },
        ],
        tx
      )
    ).get(appointment.id);

    const appointmentUpdates = getAppointmentFinanceMirrorUpdates({
      depositAmount: appointment.depositAmount,
      finance,
      paidAtWhenPaid: paidAt ?? new Date(),
      includeUpdatedAt: true,
    });

    await tx
      .update(appointments)
      .set(appointmentUpdates)
      .where(eq(appointments.id, inv.appointmentId));
  } catch (err) {
    // Non-fatal: payment is already recorded on the invoice.
    logger.warn("Failed to sync appointment payment state after invoice payment", {
      invoiceId,
      newInvoiceStatus,
      error: err,
    });
  }
}

export async function recordInvoicePayment(
  input: RecordInvoicePaymentInput,
  tx: DbExecutor = db
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new BadRequestError("Payment amount must be greater than zero.");
  }

  const paidAt = input.paidAt ?? new Date();
  if (Number.isNaN(paidAt.getTime())) {
    throw new BadRequestError("Payment date is invalid.");
  }

  const amountCents = toMoneyCents(input.amount);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new BadRequestError("Payment amount is invalid.");
  }

  const normalizedAmount = (amountCents / 100).toFixed(2);
  const normalizedNotes = input.notes?.trim() || null;
  const normalizedReferenceNumber = input.referenceNumber?.trim() || null;
  const normalizedIdempotencyKey = input.idempotencyKey?.trim() || null;

  await tx.execute(sql`
    select 1
    from ${invoices}
    where ${invoices.id} = ${input.invoiceId}
      and ${invoices.businessId} = ${input.businessId}
    for update
  `);

  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.businessId, input.businessId)))
    .limit(1);
  if (!invoice) throw new NotFoundError("Invoice not found.");
  if (invoice.status === "void") throw new BadRequestError("Cannot add payment to a void invoice.");

  const invoiceTotal = Number(invoice.total ?? 0);
  const invoiceTotalCents = toMoneyCents(invoiceTotal);
  if (!Number.isFinite(invoiceTotalCents) || invoiceTotalCents < 0) {
    throw new BadRequestError("Invoice total is invalid and cannot accept payments.");
  }

  const existingDuplicate = await findRecentMatchingActivePayment(
    {
      ...input,
      idempotencyKey: normalizedIdempotencyKey,
      notes: normalizedNotes,
      referenceNumber: normalizedReferenceNumber,
    },
    normalizedAmount,
    paidAt,
    tx
  );
  if (existingDuplicate) {
    throw new ConflictError(
      "A matching payment was just recorded for this invoice. Refresh the invoice before trying again."
    );
  }

  const paidSummary = await getActiveInvoicePaymentSummary(input.invoiceId, tx);
  if (!Number.isFinite(paidSummary.totalCents) || paidSummary.totalCents < 0) {
    throw new BadRequestError("Existing invoice payment totals are invalid.");
  }

  const newTotalCents = paidSummary.totalCents + amountCents;
  if (newTotalCents > invoiceTotalCents) {
    throw new BadRequestError(
      `Payment total would exceed invoice total (${invoiceTotal.toFixed(2)}). Already paid: ${paidSummary.total.toFixed(2)}.`
    );
  }

  let payment;
  try {
    [payment] = await tx
      .insert(payments)
      .values({
        businessId: input.businessId,
        invoiceId: input.invoiceId,
        amount: normalizedAmount,
        method: input.method,
        paidAt,
        idempotencyKey: normalizedIdempotencyKey,
        notes: normalizedNotes,
        referenceNumber: normalizedReferenceNumber,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? null,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        stripeChargeId: input.stripeChargeId ?? null,
      })
      .returning();
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on create; falling back to legacy insert", {
      invoiceId: input.invoiceId,
      businessId: input.businessId,
      error,
    });
    const paymentColumns = await getPaymentColumns();
    const legacyValues = buildLegacyPaymentInsertValues(
      paymentColumns,
      {
        ...input,
        idempotencyKey: normalizedIdempotencyKey,
        notes: normalizedNotes,
        referenceNumber: normalizedReferenceNumber,
      },
      normalizedAmount,
      paidAt
    );
    [payment] = await tx
      .insert(payments)
      .values(legacyValues)
      .returning();
  }

  if (!payment) throw new BadRequestError("Failed to create payment.");

  const newStatus = newTotalCents >= invoiceTotalCents ? "paid" : "partial";
  const newPaidAt = newStatus === "paid" ? paidAt : invoice.paidAt;

  await tx
    .update(invoices)
    .set({
      status: newStatus,
      paidAt: newPaidAt,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, input.invoiceId));

  // Sync payment state back to the linked appointment so the appointment
  // inspector immediately reflects the invoice payment status.
  await syncAppointmentPaymentState(input.invoiceId, newStatus, newPaidAt ?? null, tx);

  return payment;
}

/**
 * Re-sync appointment payment state after a payment reversal.
 * Call this after reversing a payment and recomputing the invoice status.
 */
export async function syncAppointmentAfterPaymentReversal(
  invoiceId: string,
  newInvoiceStatus: string,
  paidAt: Date | null,
  tx: DbExecutor = db
): Promise<void> {
  await syncAppointmentPaymentState(invoiceId, newInvoiceStatus, paidAt, tx);
}
