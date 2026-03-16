import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { invoiceLineItems, invoices } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const invoiceLineItemsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const createSchema = z.object({
  invoiceId: z.string().uuid(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

const updateSchema = z.object({
  description: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().min(0).optional(),
});

invoiceLineItemsRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);
  const { invoiceId, description, quantity, unitPrice } = parsed.data;
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, bid))).limit(1);
  if (!inv) throw new NotFoundError("Invoice not found.");
  if (inv.status === "void") throw new BadRequestError("Cannot add line items to a void invoice.");
  const total = quantity * unitPrice;
  const [created] = await db
    .insert(invoiceLineItems)
    .values({
      invoiceId,
      description,
      quantity: String(quantity),
      unitPrice: String(unitPrice),
      total: String(total),
    })
    .returning();
  if (!created) throw new BadRequestError("Failed to create line item.");
  res.status(201).json(created);
});

invoiceLineItemsRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const bid = businessId(req);
  const [existing] = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.id, req.params.id)).limit(1);
  if (!existing) throw new NotFoundError("Line item not found.");
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, existing.invoiceId), eq(invoices.businessId, bid))).limit(1);
  if (!inv) throw new ForbiddenError("Access denied.");
  if (inv.status === "void") throw new BadRequestError("Cannot edit line items on a void invoice.");
  const updates: { description?: string; quantity?: string; unitPrice?: string; total?: string } = {};
  if (parsed.data.description != null) updates.description = parsed.data.description;
  if (parsed.data.quantity != null) updates.quantity = String(parsed.data.quantity);
  if (parsed.data.unitPrice != null) updates.unitPrice = String(parsed.data.unitPrice);
  if (updates.quantity != null || updates.unitPrice != null) {
    const qty = Number(updates.quantity ?? existing.quantity);
    const up = Number(updates.unitPrice ?? existing.unitPrice);
    updates.total = String(qty * up);
  }
  const [updated] = await db.update(invoiceLineItems).set(updates).where(eq(invoiceLineItems.id, req.params.id)).returning();
  res.json(updated);
});

invoiceLineItemsRouter.delete("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.id, req.params.id)).limit(1);
  if (!existing) throw new NotFoundError("Line item not found.");
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, existing.invoiceId), eq(invoices.businessId, bid))).limit(1);
  if (!inv) throw new ForbiddenError("Access denied.");
  if (inv.status === "void") throw new BadRequestError("Cannot delete line items from a void invoice.");
  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.id, req.params.id));
  res.status(204).send();
});
