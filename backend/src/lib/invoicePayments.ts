import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { invoices, payments } from "../db/schema.js";
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
      })
      .returning();
  }

  if (!payment) throw new BadRequestError("Failed to create payment.");

  const newStatus = newTotal >= invoiceTotal ? "paid" : "partial";
  await tx
    .update(invoices)
    .set({
      status: newStatus,
      paidAt: newTotal >= invoiceTotal ? new Date() : invoice.paidAt,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, input.invoiceId));

  return payment;
}
