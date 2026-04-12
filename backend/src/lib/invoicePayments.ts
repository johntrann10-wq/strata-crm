import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { invoices, payments, appointments } from "../db/schema.js";
import { getAppointmentFinanceMirrorUpdates, getAppointmentFinanceSummaryMap } from "./appointmentFinance.js";
import { BadRequestError, NotFoundError } from "./errors.js";
import { logger } from "./logger.js";

type DbExecutor = any;

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

export async function getActiveInvoicePaymentTotal(invoiceId: string, tx: DbExecutor = db) {
  try {
    const [sumRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(and(eq(payments.invoiceId, invoiceId), sql`${payments.reversedAt} is null`));
    return Number(sumRow?.total ?? 0);
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on total aggregation; falling back to legacy sum", {
      invoiceId,
      error,
    });
    const [sumRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    return Number(sumRow?.total ?? 0);
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
  // Find invoice with its linked appointment
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

  try {
    await tx
      .update(appointments)
      .set(appointmentUpdates)
      .where(eq(appointments.id, inv.appointmentId));
  } catch (err) {
    // Non-fatal: log and continue. Payment is already recorded on the invoice.
    logger.warn("Failed to sync appointment payment state after invoice payment", {
      invoiceId,
      appointmentId: inv.appointmentId,
      newInvoiceStatus,
      error: err,
    });
  }
}

export async function recordInvoicePayment(
  input: RecordInvoicePaymentInput,
  tx: DbExecutor = db
) {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, input.invoiceId), eq(invoices.businessId, input.businessId)))
    .limit(1);
  if (!invoice) throw new NotFoundError("Invoice not found.");
  if (invoice.status === "void") throw new BadRequestError("Cannot add payment to a void invoice.");

  const invoiceTotal = Number(invoice.total ?? 0);
  const paidSoFar = await getActiveInvoicePaymentTotal(input.invoiceId, tx);
  const newTotal = paidSoFar + input.amount;
  if (newTotal > invoiceTotal) {
    throw new BadRequestError(
      `Payment total would exceed invoice total (${invoiceTotal}). Already paid: ${paidSoFar}.`
    );
  }

  const amount = String(input.amount);
  const paidAt = input.paidAt ?? new Date();
  let payment;
  try {
    [payment] = await tx
      .insert(payments)
      .values({
        businessId: input.businessId,
        invoiceId: input.invoiceId,
        amount,
        method: input.method,
        paidAt,
        idempotencyKey: input.idempotencyKey ?? null,
        notes: input.notes ?? null,
        referenceNumber: input.referenceNumber ?? null,
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
    const legacyValues = buildLegacyPaymentInsertValues(paymentColumns, input, amount, paidAt);
    [payment] = await tx
      .insert(payments)
      .values(legacyValues)
      .returning();
  }

  if (!payment) throw new BadRequestError("Failed to create payment.");

  const newStatus = newTotal >= invoiceTotal ? "paid" : "partial";
  const newPaidAt = newTotal >= invoiceTotal ? paidAt : invoice.paidAt;

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
  tx: DbExecutor = db
): Promise<void> {
  await syncAppointmentPaymentState(invoiceId, newInvoiceStatus, null, tx);
}
