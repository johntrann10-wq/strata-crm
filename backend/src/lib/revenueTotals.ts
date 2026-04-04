import { eq, and, isNull, sql } from "drizzle-orm";
import {
  appointments,
  appointmentServices,
  invoiceLineItems,
  invoices,
  payments,
  quoteLineItems,
  quotes,
  services,
} from "../db/schema.js";
import { BadRequestError } from "./errors.js";

/** Drizzle `db` or transaction client — same query surface. */
type DbLike = any;

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function calculateAppointmentFinanceTotals(input: {
  subtotal: number;
  taxRate?: number;
  applyTax?: boolean;
  adminFeeRate?: number;
  applyAdminFee?: boolean;
}) {
  const subtotal = Number.isFinite(input.subtotal) ? Math.max(input.subtotal, 0) : 0;
  const taxRate = Number.isFinite(input.taxRate ?? 0) ? Math.max(Number(input.taxRate ?? 0), 0) : 0;
  const adminFeeRate =
    Number.isFinite(input.adminFeeRate ?? 0) ? Math.max(Number(input.adminFeeRate ?? 0), 0) : 0;
  const applyTax = Boolean(input.applyTax) && taxRate > 0;
  const applyAdminFee = Boolean(input.applyAdminFee) && adminFeeRate > 0;
  const adminFeeAmount = applyAdminFee ? subtotal * (adminFeeRate / 100) : 0;
  const taxableSubtotal = subtotal + adminFeeAmount;
  const taxAmount = applyTax ? taxableSubtotal * (taxRate / 100) : 0;
  const totalPrice = taxableSubtotal + taxAmount;

  return {
    subtotal,
    taxRate,
    applyTax,
    adminFeeRate,
    applyAdminFee,
    adminFeeAmount,
    taxAmount,
    totalPrice,
  };
}

function isSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42p01" || code === "42703" || message.includes("does not exist");
}

/** Recompute quote subtotal / tax / total from line items + stored tax rate (%). */
export async function recalculateQuoteTotals(executor: DbLike, quoteId: string): Promise<void> {
  let q:
    | {
        id: string;
        taxRate: string | null;
      }
    | undefined;
  try {
    [q] = await executor
      .select({ id: quotes.id, taxRate: quotes.taxRate })
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
  } catch (error) {
    if (!isSchemaDriftError(error)) throw error;
    [q] = await executor
      .select({ id: quotes.id, taxRate: quotes.taxRate })
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
  }
  if (!q) return;
  const lines = await executor.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId));
  const subtotal = lines.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const taxRate = Number(q.taxRate ?? 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const total = subtotal + taxAmount;
  await executor
    .update(quotes)
    .set({
      subtotal: money(subtotal),
      taxAmount: money(taxAmount),
      total: money(total),
      updatedAt: new Date(),
    })
    .where(eq(quotes.id, quoteId));
}

/** Recompute invoice subtotal / tax / total from line items + stored tax rate (%) and discount. */
export async function recalculateInvoiceTotals(executor: DbLike, invoiceId: string): Promise<void> {
  const [inv] = await executor
    .select({
      id: invoices.id,
      status: invoices.status,
      discountAmount: invoices.discountAmount,
      taxRate: invoices.taxRate,
      paidAt: invoices.paidAt,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!inv) return;
  if (inv.status === "void") return;

  const lines = await executor.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
  const subtotal = lines.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const discountAmount = Number(inv.discountAmount ?? 0);
  const taxRate = Number(inv.taxRate ?? 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const total = Math.max(0, subtotal + taxAmount - discountAmount);

  const [sumRow] = await executor
    .select({ paid: sql<string>`coalesce(sum(${payments.amount}::numeric), 0)` })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), isNull(payments.reversedAt)));
  const paidSoFar = Number(sumRow?.paid ?? 0);
  if (paidSoFar > total + 0.009) {
    throw new BadRequestError(
      `Invoice line totals would make the balance (${total.toFixed(2)}) less than payments already recorded (${paidSoFar.toFixed(2)}).`
    );
  }

  let status = inv.status;
  let paidAt = inv.paidAt;
  if (inv.status !== "void" && inv.status !== "draft") {
    if (paidSoFar <= 0) {
      status = "sent";
      paidAt = null;
    } else if (paidSoFar >= total - 0.009) {
      status = "paid";
      paidAt = paidAt ?? new Date();
    } else {
      status = "partial";
    }
  }

  await executor
    .update(invoices)
    .set({
      subtotal: money(subtotal),
      taxAmount: money(taxAmount),
      total: money(total),
      status,
      paidAt,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));
}

/** Sum appointment line amounts (quantity × unit price, defaulting unit price from catalog). */
export async function recalculateAppointmentTotal(executor: DbLike, appointmentId: string): Promise<void> {
  let appointment:
    | {
        id: string;
        taxRate: string | null;
        applyTax: boolean | null;
        adminFeeRate: string | null;
        applyAdminFee: boolean | null;
      }
    | undefined;
  try {
    [appointment] = await executor
      .select({
        id: appointments.id,
        taxRate: appointments.taxRate,
        applyTax: appointments.applyTax,
        adminFeeRate: appointments.adminFeeRate,
        applyAdminFee: appointments.applyAdminFee,
      })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
  } catch (error) {
    if (!isSchemaDriftError(error)) throw error;
    [appointment] = await executor
      .select({
        id: appointments.id,
        taxRate: sql<string>`'0'`,
        applyTax: sql<boolean>`false`,
        adminFeeRate: sql<string>`'0'`,
        applyAdminFee: sql<boolean>`false`,
      })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
  }
  if (!appointment) return;

  const rows = await executor
    .select({
      qty: appointmentServices.quantity,
      unitPrice: appointmentServices.unitPrice,
      catalogPrice: services.price,
    })
    .from(appointmentServices)
    .innerJoin(services, eq(appointmentServices.serviceId, services.id))
    .where(eq(appointmentServices.appointmentId, appointmentId));

  const total = rows.reduce((sum, row) => {
    const up = row.unitPrice != null && row.unitPrice !== "" ? Number(row.unitPrice) : Number(row.catalogPrice ?? 0);
    const q = row.qty ?? 1;
    return sum + q * up;
  }, 0);
  const finance = calculateAppointmentFinanceTotals({
    subtotal: total,
    taxRate: Number(appointment.taxRate ?? 0),
    applyTax: appointment.applyTax ?? false,
    adminFeeRate: Number(appointment.adminFeeRate ?? 0),
    applyAdminFee: appointment.applyAdminFee ?? false,
  });

  try {
    await executor
      .update(appointments)
      .set({
        subtotal: money(finance.subtotal),
        adminFeeAmount: money(finance.adminFeeAmount),
        taxAmount: money(finance.taxAmount),
        totalPrice: money(finance.totalPrice),
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, appointmentId));
  } catch (error) {
    if (!isSchemaDriftError(error)) throw error;
    await executor
      .update(appointments)
      .set({
        totalPrice: money(finance.totalPrice),
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, appointmentId));
  }
}
