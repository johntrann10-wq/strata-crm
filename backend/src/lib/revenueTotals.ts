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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbLike = any;

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
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

  await executor
    .update(appointments)
    .set({
      totalPrice: money(total),
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, appointmentId));
}
