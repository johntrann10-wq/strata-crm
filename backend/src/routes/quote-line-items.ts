import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { quoteLineItems, quotes } from "../db/schema.js";
import { and, eq, desc } from "drizzle-orm";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { recalculateQuoteTotals } from "../lib/revenueTotals.js";

export const quoteLineItemsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function parseFilter(req: Request): unknown {
  try {
    return req.query.filter ? JSON.parse(String(req.query.filter)) : undefined;
  } catch {
    return undefined;
  }
}

quoteLineItemsRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const filter = parseFilter(req) as { quoteId?: { equals?: string } } | undefined;
  const quoteId = filter?.quoteId?.equals;

  const conditions = [eq(quotes.businessId, bid)];
  if (quoteId) conditions.push(eq(quoteLineItems.quoteId, quoteId));

  const first = req.query.first != null ? Math.min(Number(req.query.first), 100) : 50;

  const rows = await db
    .select()
    .from(quoteLineItems)
    .innerJoin(quotes, eq(quoteLineItems.quoteId, quotes.id))
    .where(and(...conditions))
    .orderBy(desc(quoteLineItems.createdAt))
    .limit(first);

  res.json({ records: rows });
});

quoteLineItemsRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select()
    .from(quoteLineItems)
    .innerJoin(quotes, eq(quoteLineItems.quoteId, quotes.id))
    .where(and(eq(quoteLineItems.id, req.params.id), eq(quotes.businessId, bid)))
    .limit(1);

  if (!existing) throw new NotFoundError("Quote line item not found.");
  res.json(existing);
});

const createSchema = z.object({
  quoteId: z.string().uuid().optional(),
  quote: z.object({ _link: z.string().uuid() }).optional(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
});

quoteLineItemsRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const quoteId = parsed.data.quoteId ?? parsed.data.quote?._link;
  if (!quoteId) throw new BadRequestError("quoteId or quote._link is required.");

  const { description, quantity, unitPrice } = parsed.data;
  const [quote] = await db.select({ id: quotes.id, status: quotes.status }).from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.businessId, bid))).limit(1);
  if (!quote) throw new NotFoundError("Quote not found.");

  const total = quantity * unitPrice;

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(quoteLineItems)
      .values({
        quoteId,
        description,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        total: String(total),
      })
      .returning();
    if (!row) throw new BadRequestError("Failed to create line item.");
    await recalculateQuoteTotals(tx, quoteId);
    return row;
  });

  res.status(201).json(created);
});

const updateSchema = z.object({
  description: z.string().min(1).optional(),
  quantity: z.coerce.number().positive().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
});

quoteLineItemsRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

  const [existing] = await db.select().from(quoteLineItems).where(eq(quoteLineItems.id, req.params.id)).limit(1);
  if (!existing) throw new NotFoundError("Quote line item not found.");

  const [quote] = await db.select({ id: quotes.id, status: quotes.status }).from(quotes).where(and(eq(quotes.id, existing.quoteId), eq(quotes.businessId, bid))).limit(1);
  if (!quote) throw new ForbiddenError("Access denied.");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.description != null) updates.description = parsed.data.description;

  if (parsed.data.quantity != null || parsed.data.unitPrice != null) {
    const qty = parsed.data.quantity ?? Number(existing.quantity);
    const up = parsed.data.unitPrice ?? Number(existing.unitPrice);
    updates.quantity = String(qty);
    updates.unitPrice = String(up);
    updates.total = String(qty * up);
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(quoteLineItems).set(updates as Record<string, unknown>).where(eq(quoteLineItems.id, req.params.id)).returning();
    if (!row) throw new NotFoundError("Quote line item not found.");
    await recalculateQuoteTotals(tx, existing.quoteId);
    return row;
  });
  res.json(updated);
});

quoteLineItemsRouter.delete("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(quoteLineItems).where(eq(quoteLineItems.id, req.params.id)).limit(1);
  if (!existing) throw new NotFoundError("Quote line item not found.");

  const [quote] = await db.select({ id: quotes.id }).from(quotes).where(and(eq(quotes.id, existing.quoteId), eq(quotes.businessId, bid))).limit(1);
  if (!quote) throw new ForbiddenError("Access denied.");

  const qid = existing.quoteId;
  await db.transaction(async (tx) => {
    await tx.delete(quoteLineItems).where(eq(quoteLineItems.id, req.params.id));
    await recalculateQuoteTotals(tx, qid);
  });
  res.status(204).send();
});

