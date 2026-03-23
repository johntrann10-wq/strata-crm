import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { locations, appointments } from "../db/schema.js";
import { eq, and, asc, sql } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const locationsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

locationsRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const list = await db
    .select()
    .from(locations)
    .where(eq(locations.businessId, businessId(req)))
    .orderBy(asc(locations.name));
  res.json({ records: list });
});

locationsRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [row] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, req.params.id), eq(locations.businessId, bid)))
    .limit(1);
  if (!row) throw new NotFoundError("Location not found.");
  res.json(row);
});

locationsRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");
  const bid = businessId(req);
  const [created] = await db
    .insert(locations)
    .values({
      businessId: bid,
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      timezone: parsed.data.timezone ?? null,
      active: parsed.data.active ?? true,
    })
    .returning();
  if (!created) throw new BadRequestError("Failed to create location.");
  res.status(201).json(created);
});

locationsRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, req.params.id), eq(locations.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Location not found.");
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid input");
  const data = parsed.data;
  const [updated] = await db
    .update(locations)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(locations.id, req.params.id), eq(locations.businessId, bid)))
    .returning();
  res.json(updated);
});

locationsRouter.delete("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const id = req.params.id;
  const [existing] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Location not found.");

  const [usage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appointments)
    .where(and(eq(appointments.businessId, bid), eq(appointments.locationId, id)));
  if ((usage?.count ?? 0) > 0) {
    throw new ConflictError("This location is assigned to appointments. Reassign or remove those appointments first.");
  }

  await db.delete(locations).where(and(eq(locations.id, id), eq(locations.businessId, bid)));
  res.json(existing);
});
