import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { payments, invoices, clients, businesses } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireTenant } from "../middleware/tenant.js";
import { withIdempotency } from "../lib/idempotency.js";
import { logger } from "../lib/logger.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { enqueueQuickBooksPaymentSync } from "../lib/quickbooks.js";
import {
  getActiveInvoicePaymentTotal,
  isPaymentSchemaDriftError,
  recordInvoicePayment,
  syncAppointmentAfterPaymentReversal,
} from "../lib/invoicePayments.js";
import { enqueueTwilioTemplateSms } from "../lib/twilio.js";

export const paymentsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const optionalIsoDateSchema = z.preprocess((value) => {
  if (value == null) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? Symbol.for("invalid-date") : value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? Symbol.for("invalid-date") : parsed;
  }
  return value;
}, z.union([z.date(), z.undefined()]));

const createSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["cash", "card", "check", "venmo", "cashapp", "zelle", "other"]),
  idempotencyKey: z.string().optional(),
  notes: z.string().optional(),
  referenceNumber: z.string().optional(),
  paidAt: optionalIsoDateSchema,
});

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

paymentsRouter.get("/", requireAuth, requireTenant, requirePermission("payments.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const list = await listPaymentsForBusiness(bid);
  res.json({ records: list });
});

paymentsRouter.get("/:id", requireAuth, requireTenant, requirePermission("payments.read"), async (req: Request, res: Response) => {
  const row = await getPaymentById(req.params.id, businessId(req));
  if (!row) throw new NotFoundError("Payment not found.");
  res.json(row);
});

paymentsRouter.post("/", requireAuth, requireTenant, requirePermission("payments.write"), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);
  const data = parsed.data;

  const doCreate = async () => {
    return await db.transaction(async (tx) => {
      const payment = await recordInvoicePayment(
        {
          businessId: bid,
          invoiceId: data.invoiceId,
          amount: data.amount,
          method: data.method,
          paidAt: data.paidAt ?? new Date(),
          idempotencyKey: data.idempotencyKey ?? null,
          notes: data.notes ?? null,
          referenceNumber: data.referenceNumber ?? null,
        },
        tx
      );
      logger.info("Payment created", { paymentId: payment.id, invoiceId: data.invoiceId, businessId: bid });
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
  void enqueueQuickBooksPaymentSync({
    businessId: bid,
    paymentId: payment.id,
    userId: req.userId ?? null,
  }).catch((error) => {
    logger.warn("QuickBooks payment sync enqueue failed after payment record", {
      businessId: bid,
      paymentId: payment.id,
      error,
    });
  });
  void (async () => {
    try {
      const [context] = await db
        .select({
          invoiceNumber: invoices.invoiceNumber,
          businessName: businesses.name,
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientPhone: clients.phone,
        })
        .from(invoices)
        .leftJoin(clients, eq(invoices.clientId, clients.id))
        .leftJoin(businesses, eq(invoices.businessId, businesses.id))
        .where(and(eq(invoices.id, data.invoiceId), eq(invoices.businessId, bid)))
        .limit(1);
      if (!context) return;
      await enqueueTwilioTemplateSms({
        businessId: bid,
        userId: req.userId ?? null,
        templateSlug: "payment_receipt",
        to: context.clientPhone,
        vars: {
          clientName:
            `${context.clientFirstName ?? ""} ${context.clientLastName ?? ""}`.trim() || "Customer",
          businessName: context.businessName ?? "Your shop",
          amount: `$${Number(payment.amount ?? 0).toFixed(2)}`,
          invoiceNumber: context.invoiceNumber ?? "Invoice",
          paidAt: new Date(payment.paidAt ?? new Date()).toLocaleString("en-US"),
          method: payment.method,
        },
        entityType: "payment",
        entityId: payment.id,
      });
    } catch (error) {
      logger.warn("Payment receipt SMS enqueue failed", {
        businessId: bid,
        paymentId: payment.id,
        error,
      });
    }
  })();
  res.status(201).json(payment);
});

paymentsRouter.post("/:id/reverse", requireAuth, requireTenant, requirePermission("payments.write"), async (req: Request, res: Response) => {
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
      .where(and(eq(payments.id, req.params.id), eq(payments.businessId, bid)))
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
    const paidNow = await getActiveInvoicePaymentTotal(inv.id);
    const invTotal = Number(inv.total ?? 0);
    const newStatus = paidNow <= 0 ? "sent" : paidNow >= invTotal ? "paid" : "partial";
    await db
      .update(invoices)
      .set({ status: newStatus, paidAt: paidNow >= invTotal ? inv.paidAt : null, updatedAt: new Date() })
      .where(and(eq(invoices.id, inv.id), eq(invoices.businessId, bid)));
    await syncAppointmentAfterPaymentReversal(inv.id, newStatus);
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
