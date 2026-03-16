import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { vehicles } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const vehiclesRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const createSchema = z.object({
  clientId: z.string().uuid(),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().optional(),
  color: z.string().optional(),
  licensePlate: z.string().optional(),
  vin: z.string().optional(),
  mileage: z.number().optional(),
  notes: z.string().optional(),
});

vehiclesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const filter = req.query.filter ? JSON.parse(String(req.query.filter)) as { clientId?: { equals?: string } } : undefined;
  const clientId = filter?.clientId?.equals;
  const first = req.query.first != null ? Math.min(Number(req.query.first), 100) : 50;
  const where = clientId ? and(eq(vehicles.businessId, bid), eq(vehicles.clientId, clientId)) : eq(vehicles.businessId, bid);
  const list = await db.select().from(vehicles).where(where).orderBy(desc(vehicles.createdAt)).limit(first);
  res.json({ records: list });
});

vehiclesRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, req.params.id), eq(vehicles.businessId, businessId(req))))
    .limit(1);
  if (!row) throw new NotFoundError("Vehicle not found.");
  res.json(row);
});

vehiclesRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const [created] = await db
    .insert(vehicles)
    .values({
      businessId: businessId(req),
      clientId: parsed.data.clientId,
      make: parsed.data.make,
      model: parsed.data.model,
      year: parsed.data.year ?? null,
      color: parsed.data.color ?? null,
      licensePlate: parsed.data.licensePlate ?? null,
      vin: parsed.data.vin ?? null,
      mileage: parsed.data.mileage ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning();
  res.status(201).json(created);
});

vehiclesRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(vehicles).where(and(eq(vehicles.id, req.params.id), eq(vehicles.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Vehicle not found.");
  const body = req.body as Record<string, unknown>;
  const allowed = ["make", "model", "year", "color", "licensePlate", "vin", "mileage", "notes"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
  const [updated] = await db.update(vehicles).set(updates as Record<string, unknown>).where(eq(vehicles.id, req.params.id)).returning();
  res.json(updated);
});
