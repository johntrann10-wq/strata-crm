import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { quotes } from "../db/schema.js";
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
  res.json(row);
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
