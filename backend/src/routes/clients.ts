import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { clients, vehicles } from "../db/schema.js";
import { eq, and, desc, isNull } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const clientsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  notes: z.string().optional(),
});
const updateSchema = createSchema.partial();

clientsRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Number(req.query.first), 100) : 50;
  const includeDeleted = req.query.includeDeleted === "true";
  const list = await db
    .select()
    .from(clients)
    .where(includeDeleted ? eq(clients.businessId, bid) : and(eq(clients.businessId, bid), isNull(clients.deletedAt)))
    .orderBy(desc(clients.createdAt))
    .limit(first);
  res.json({ records: list });
});

clientsRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, req.params.id), eq(clients.businessId, businessId(req))))
    .limit(1);
  if (!row) throw new NotFoundError("Client not found.");
  res.json(row);
});

clientsRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const [created] = await db
    .insert(clients)
    .values({
      businessId: businessId(req),
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      state: parsed.data.state ?? null,
      zip: parsed.data.zip ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning();
  res.status(201).json(created);
});

clientsRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(clients).where(and(eq(clients.id, req.params.id), eq(clients.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Client not found.");
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const [updated] = await db
    .update(clients)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(clients.id, req.params.id))
    .returning();
  res.json(updated);
});

/** Soft-delete client and cascade to vehicles (set deletedAt on all client vehicles). */
clientsRouter.delete("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(clients).where(and(eq(clients.id, req.params.id), eq(clients.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Client not found.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(clients).set({ deletedAt: now, updatedAt: now }).where(eq(clients.id, req.params.id));
    await tx.update(vehicles).set({ deletedAt: now, updatedAt: now }).where(eq(vehicles.clientId, req.params.id));
  });
  const [updated] = await db.select().from(clients).where(eq(clients.id, req.params.id)).limit(1);
  res.json(updated ?? existing);
});
