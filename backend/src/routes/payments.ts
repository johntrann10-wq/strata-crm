import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { payments, invoices } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { withIdempotency } from "../lib/idempotency.js";
import { logger } from "../lib/logger.js";
import { createRequestActivityLog } from "../lib/activity.js";

export const paymentsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const createSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["cash", "card", "check", "venmo", "cashapp", "zelle", "other"]),
  idempotencyKey: z.string().optional(),
  notes: z.string().optional(),
  referenceNumber: z.string().optional(),
  paidAt: z.union([z.string(), z.date()]).optional(),
});

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

function normalizeLegacyPayment<T extends object>(row: T): T & { notes: string | null; referenceNumber: string | null; reversedAt: Date | null } {
  return {
    ...row,
    notes: "notes" in row ? ((row as { notes?: string | null }).notes ?? null) : null,
    referenceNumber: "referenceNumber" in row ? ((row as { referenceNumber?: string | null }).referenceNumber ?? null) : null,
    reversedAt: "reversedAt" in row ? ((row as { reversedAt?: Date | null }).reversedAt ?? null) : null,
  };
}

async function listPaymentsForBusiness(bid: string) {
  try {
    const rows = await db.select().from(payments).where(eq(payments.businessId, bid));
    return rows.map(normalizeLegacyPayment);
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on list; falling back to legacy selection", { businessId: bid, error });
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
      .where(eq(payments.businessId, bid));
    return rows.map(normalizeLegacyPayment);
  }
}

async function getPaymentById(id: string, bid: string) {
  try {
    const [row] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.businessId, bid))).limit(1);
    return row ? normalizeLegacyPayment(row) : null;
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on get; falling back to legacy selection", { paymentId: id, businessId: bid, error });
    const [row] = await db
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
      .where(and(eq(payments.id, id), eq(payments.businessId, bid)))
      .limit(1);
    return row ? normalizeLegacyPayment(row) : null;
  }
}

async function getActivePaymentTotal(invoiceId: string, tx: any = db) {
  try {
    const [sumRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(and(eq(payments.invoiceId, invoiceId), sql`${payments.reversedAt} is null`));
    return Number(sumRow?.total ?? 0);
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on total aggregation; falling back to legacy sum", { invoiceId, error });
    const [sumRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    return Number(sumRow?.total ?? 0);
  }
}

paymentsRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const list = await listPaymentsForBusiness(bid);
  res.json({ records: list });
});

paymentsRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const row = await getPaymentById(req.params.id, businessId(req));
  if (!row) throw new NotFoundError("Payment not found.");
  res.json(row);
});

paymentsRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);
  const data = parsed.data;

  const doCreate = async () => {
    return await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, data.invoiceId), eq(invoices.businessId, bid))).limit(1);
      if (!inv) throw new NotFoundError("Invoice not found.");
      if (inv.status === "void") throw new BadRequestError("Cannot add payment to a void invoice.");

      const invoiceTotal = Number(inv.total ?? 0);
      const paidSoFar = await getActivePaymentTotal(data.invoiceId, tx);
      const newTotal = paidSoFar + data.amount;
      if (newTotal > invoiceTotal) {
        throw new BadRequestError(`Payment total would exceed invoice total (${invoiceTotal}). Already paid: ${paidSoFar}.`);
      }

      const amount = String(data.amount);
      const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
      let payment;
      try {
        [payment] = await tx
          .insert(payments)
          .values({
            businessId: bid,
            invoiceId: data.invoiceId,
            amount,
            method: data.method,
            paidAt,
            idempotencyKey: data.idempotencyKey ?? null,
            notes: data.notes ?? null,
            referenceNumber: data.referenceNumber ?? null,
          })
          .returning();
      } catch (error) {
        if (!isPaymentSchemaDriftError(error)) throw error;
        logger.warn("Payments schema drift detected on create; falling back to legacy insert", { invoiceId: data.invoiceId, businessId: bid, error });
        [payment] = await tx
          .insert(payments)
          .values({
            businessId: bid,
            invoiceId: data.invoiceId,
            amount,
            method: data.method,
            paidAt,
            idempotencyKey: data.idempotencyKey ?? null,
          })
          .returning();
      }
      if (!payment) throw new BadRequestError("Failed to create payment.");

      const newStatus = newTotal >= invoiceTotal ? "paid" : "partial";
      await tx.update(invoices).set({ status: newStatus, paidAt: newTotal >= invoiceTotal ? new Date() : inv.paidAt, updatedAt: new Date() }).where(eq(invoices.id, data.invoiceId));

      logger.info("Payment created", { paymentId: payment.id, invoiceId: inv.id, businessId: bid });
      return payment;
    });
  };

  const key = data.idempotencyKey ?? `payment-${data.invoiceId}-${Date.now()}`;
  const payment = await withIdempotency(key, { businessId: bid, operation: "payment.create" }, doCreate);
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "payment.recorded",
    entityType: "invoice",
    entityId: data.invoiceId,
    metadata: {
      paymentId: payment.id,
      amount: payment.amount,
      method: payment.method,
    },
  });
  res.status(201).json(payment);
});

paymentsRouter.post("/:id/reverse", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const existing = await getPaymentById(req.params.id, bid);
  if (!existing) throw new NotFoundError("Payment not found.");
  if (existing.reversedAt) {
    res.json(existing);
    return;
  }
  let updated;
  try {
    [updated] = await db
      .update(payments)
      .set({ reversedAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, req.params.id))
      .returning();
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on reverse; skipping reverse for legacy schema", { paymentId: req.params.id, businessId: bid, error });
    res.json(existing);
    return;
  }
  if (!updated) throw new NotFoundError("Payment not found.");
  // Recompute invoice status after reversal
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, updated.invoiceId)).limit(1);
  if (inv && inv.status !== "void") {
    const paidNow = await getActivePaymentTotal(inv.id);
    const invTotal = Number(inv.total ?? 0);
    const newStatus = paidNow <= 0 ? "sent" : paidNow >= invTotal ? "paid" : "partial";
    await db.update(invoices).set({ status: newStatus, paidAt: paidNow >= invTotal ? inv.paidAt : null, updatedAt: new Date() }).where(eq(invoices.id, inv.id));
  }
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "payment.reversed",
    entityType: "invoice",
    entityId: updated.invoiceId,
    metadata: {
      paymentId: updated.id,
      amount: updated.amount,
    },
  });
  res.json(updated);
});
