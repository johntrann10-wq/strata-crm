import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { vehicles, clients } from "../db/schema.js";
import { eq, and, desc, asc, isNull, or, ilike, sql } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { logger } from "../lib/logger.js";

export const vehiclesRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const createSchema = z.object({
  clientId: z.string().uuid(),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  color: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  licensePlate: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  vin: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  mileage: z.coerce.number().int().min(0).nullable().optional(),
  notes: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});

const patchSchema = z
  .object({
    make: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    year: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
    color: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
    licensePlate: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
    vin: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
    mileage: z.coerce.number().int().min(0).nullable().optional(),
    notes: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  })
  .strict();

vehiclesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  let clientId: string | undefined;
  if (typeof req.query.filter === "string" && req.query.filter.trim()) {
    try {
      const filter = JSON.parse(req.query.filter) as { clientId?: { equals?: string } };
      clientId = filter?.clientId?.equals;
    } catch {
      /* ignore invalid filter */
    }
  }
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const first = req.query.first != null ? Math.min(Math.max(Number(req.query.first), 1), 100) : 50;

  let orderBy = desc(vehicles.createdAt);
  if (typeof req.query.sort === "string" && req.query.sort.trim()) {
    try {
      const s = JSON.parse(req.query.sort) as { createdAt?: string };
      if (s?.createdAt === "Ascending") orderBy = asc(vehicles.createdAt);
    } catch {
      /* ignore */
    }
  }

  const tenant = and(eq(vehicles.businessId, bid), isNull(vehicles.deletedAt))!;
  const scoped = clientId ? and(tenant, eq(vehicles.clientId, clientId))! : tenant;

  const term = `%${search}%`;
  const whereClause =
    search.length >= 2
      ? and(
          scoped,
          or(
            ilike(vehicles.make, term),
            ilike(vehicles.model, term),
            ilike(vehicles.color, term),
            ilike(vehicles.licensePlate, term),
            ilike(vehicles.vin, term),
            sql`cast(${vehicles.year} as text) ilike ${term}`,
            ilike(clients.firstName, term),
            ilike(clients.lastName, term)
          )
        )!
      : scoped;

  const rows = await db
    .select({
      id: vehicles.id,
      businessId: vehicles.businessId,
      clientId: vehicles.clientId,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      color: vehicles.color,
      licensePlate: vehicles.licensePlate,
      vin: vehicles.vin,
      mileage: vehicles.mileage,
      notes: vehicles.notes,
      deletedAt: vehicles.deletedAt,
      createdAt: vehicles.createdAt,
      updatedAt: vehicles.updatedAt,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientPhone: clients.phone,
    })
    .from(vehicles)
    .innerJoin(clients, eq(vehicles.clientId, clients.id))
    .where(and(whereClause, eq(clients.businessId, bid)))
    .orderBy(orderBy)
    .limit(first);

  const records = rows.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    clientId: r.clientId,
    make: r.make,
    model: r.model,
    year: r.year,
    color: r.color,
    licensePlate: r.licensePlate,
    vin: r.vin,
    mileage: r.mileage,
    notes: r.notes,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    client: {
      id: r.clientId,
      firstName: r.clientFirstName ?? "",
      lastName: r.clientLastName ?? "",
      phone: r.clientPhone ?? null,
    },
  }));

  res.json({ records });
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
  const bid = businessId(req);
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, parsed.data.clientId), eq(clients.businessId, bid), isNull(clients.deletedAt)))
    .limit(1);
  if (!client) throw new BadRequestError("Client not found or access denied.");
  const [created] = await db
    .insert(vehicles)
    .values({
      businessId: bid,
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
  logger.info("Vehicle created", { vehicleId: created.id, businessId: bid, clientId: created.clientId });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "vehicle.created",
    entityType: "vehicle",
    entityId: created.id,
    metadata: {
      clientId: created.clientId,
      make: created.make,
      model: created.model,
      year: created.year,
    },
  });
  res.status(201).json(created);
});

vehiclesRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(vehicles).where(and(eq(vehicles.id, req.params.id), eq(vehicles.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Vehicle not found.");
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const [updated] = await db
    .update(vehicles)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(vehicles.id, req.params.id))
    .returning();
  logger.info("Vehicle updated", { vehicleId: updated.id, businessId: bid, clientId: updated.clientId });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "vehicle.updated",
    entityType: "vehicle",
    entityId: updated.id,
    metadata: {
      clientId: updated.clientId,
      make: updated.make,
      model: updated.model,
      year: updated.year,
    },
  });
  res.json(updated);
});
