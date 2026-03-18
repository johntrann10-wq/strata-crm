import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { quotes, clients, vehicles, quoteLineItems } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const quotesRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

quotesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Number(req.query.first), 100) : 50;
  const list = await db.select().from(quotes).where(eq(quotes.businessId, bid)).orderBy(desc(quotes.createdAt)).limit(first);
  res.json({ records: list });
});

quotesRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, businessId(req))))
    .limit(1);
  if (!row) throw new NotFoundError("Quote not found.");

  const bid = businessId(req);

  const [clientRow] = await db
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      email: clients.email,
      phone: clients.phone,
    })
    .from(clients)
    .where(and(eq(clients.id, row.clientId), eq(clients.businessId, bid)))
    .limit(1);

  const [vehicleRow] = await db
    .select({
      id: vehicles.id,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      color: vehicles.color,
      licensePlate: vehicles.licensePlate,
    })
    .from(vehicles)
    .where(and(eq(vehicles.id, row.vehicleId), eq(vehicles.businessId, bid)))
    .limit(1);

  const lineItemsRows = await db
    .select()
    .from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, row.id))
    .orderBy(desc(quoteLineItems.createdAt));

  res.json({
    ...row,
    client: clientRow ?? null,
    vehicle: vehicleRow ?? null,
    lineItems: {
      edges: lineItemsRows.map((li) => ({ node: li })),
    },
  });
});

quotesRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const body = req.body as { clientId: string; vehicleId?: string; total?: number };
  const bid = businessId(req);
  if (!body.clientId) throw new ForbiddenError("clientId required");
  const [created] = await db
    .insert(quotes)
    .values({
      businessId: bid,
      clientId: body.clientId,
      vehicleId: body.vehicleId ?? null,
      total: body.total != null ? String(body.total) : "0",
    })
    .returning();
  res.status(201).json(created);
});

quotesRouter.post("/:id/send", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [updated] = await db
    .update(quotes)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, businessId(req))))
    .returning();
  if (!updated) throw new NotFoundError("Quote not found.");
  res.json(updated);
});

quotesRouter.post("/:id/sendFollowUp", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [updated] = await db
    .update(quotes)
    .set({ followUpSentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(quotes.id, req.params.id), eq(quotes.businessId, businessId(req))))
    .returning();
  if (!updated) throw new NotFoundError("Quote not found.");
  res.json(updated);
});
