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

paymentsRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const list = await db.select().from(payments).where(eq(payments.businessId, bid));
  res.json({ records: list });
});

paymentsRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, req.params.id), eq(payments.businessId, businessId(req))))
    .limit(1);
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
      const [sumRow] = await tx
        .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(and(eq(payments.invoiceId, data.invoiceId), sql`${payments.reversedAt} is null`));
      const paidSoFar = Number(sumRow?.total ?? 0);
      const newTotal = paidSoFar + data.amount;
      if (newTotal > invoiceTotal) {
        throw new BadRequestError(`Payment total would exceed invoice total (${invoiceTotal}). Already paid: ${paidSoFar}.`);
      }

      const amount = String(data.amount);
      const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
      const [payment] = await tx
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
  const [existing] = await db.select().from(payments).where(and(eq(payments.id, req.params.id), eq(payments.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Payment not found.");
  if (existing.reversedAt) {
    res.json(existing);
    return;
  }
  const [updated] = await db
    .update(payments)
    .set({ reversedAt: new Date(), updatedAt: new Date() })
    .where(eq(payments.id, req.params.id))
    .returning();
  if (!updated) throw new NotFoundError("Payment not found.");
  // Recompute invoice status after reversal
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, updated.invoiceId)).limit(1);
  if (inv && inv.status !== "void") {
    const [sumRow] = await db
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(and(eq(payments.invoiceId, inv.id), sql`${payments.reversedAt} is null`));
    const paidNow = Number(sumRow?.total ?? 0);
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
