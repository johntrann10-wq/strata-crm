import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { clients, vehicles } from "../db/schema.js";
import { eq, and, desc, asc, isNull, or, ilike, sql } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { createRequestActivityLog } from "../lib/activity.js";
import { logger } from "../lib/logger.js";

export const clientsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.preprocess(emptyToUndefined, z.string().email().optional()),
  phone: z.preprocess(emptyToUndefined, z.string().optional()),
  address: z.preprocess(emptyToUndefined, z.string().optional()),
  city: z.preprocess(emptyToUndefined, z.string().optional()),
  state: z.preprocess(emptyToUndefined, z.string().optional()),
  zip: z.preprocess(emptyToUndefined, z.string().optional()),
  notes: z.preprocess(emptyToUndefined, z.string().optional()),
  internalNotes: z.preprocess(emptyToUndefined, z.string().optional()),
  marketingOptIn: z.boolean().optional(),
});
/** Nullable optional fields clear the column when PATCH sends null (after empty-string → null normalization). */
const updateSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    email: z.union([z.string().email(), z.null()]).optional(),
    phone: z.union([z.string(), z.null()]).optional(),
    address: z.union([z.string(), z.null()]).optional(),
    city: z.union([z.string(), z.null()]).optional(),
    state: z.union([z.string(), z.null()]).optional(),
    zip: z.union([z.string(), z.null()]).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
    internalNotes: z.union([z.string(), z.null()]).optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict();

/** Empty strings clear optional text fields on PATCH. */
function normalizeClientPatchBody(body: unknown): unknown {
  if (body == null || typeof body !== "object") return body;
  const o = { ...(body as Record<string, unknown>) };
  for (const k of ["email", "phone", "address", "city", "state", "zip", "notes", "internalNotes"]) {
    if (o[k] === "") o[k] = null;
  }
  return o;
}

clientsRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const first = req.query.first != null ? Math.min(Math.max(Number(req.query.first), 1), 100) : 50;
  const includeDeleted = req.query.includeDeleted === "true";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  let orderBy = desc(clients.createdAt);
  if (typeof req.query.sort === "string" && req.query.sort.trim()) {
    try {
      const s = JSON.parse(req.query.sort) as { createdAt?: string };
      if (s?.createdAt === "Ascending") orderBy = asc(clients.createdAt);
    } catch {
      /* ignore */
    }
  }

  const tenantFilter = includeDeleted ? eq(clients.businessId, bid) : and(eq(clients.businessId, bid), isNull(clients.deletedAt));

  const whereClause =
    search.length > 0
      ? and(
          tenantFilter,
          or(
            ilike(clients.firstName, `%${search}%`),
            ilike(clients.lastName, `%${search}%`),
            ilike(clients.email, `%${search}%`),
            ilike(clients.phone, `%${search}%`),
            sql`(${clients.firstName} || ' ' || ${clients.lastName}) ilike ${`%${search}%`}`
          )
        )
      : tenantFilter;

  const list = await db.select().from(clients).where(whereClause!).orderBy(orderBy).limit(first);
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
  const bid = businessId(req);
  const [created] = await db
    .insert(clients)
    .values({
      businessId: bid,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      state: parsed.data.state ?? null,
      zip: parsed.data.zip ?? null,
      notes: parsed.data.notes ?? null,
      internalNotes: parsed.data.internalNotes ?? null,
      marketingOptIn: parsed.data.marketingOptIn ?? true,
    })
    .returning();
  logger.info("Client created", { clientId: created.id, businessId: bid });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "client.created",
    entityType: "client",
    entityId: created.id,
    metadata: {
      firstName: created.firstName,
      lastName: created.lastName,
      email: created.email,
      phone: created.phone,
    },
  });
  res.status(201).json(created);
});

clientsRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db.select().from(clients).where(and(eq(clients.id, req.params.id), eq(clients.businessId, bid))).limit(1);
  if (!existing) throw new NotFoundError("Client not found.");
  const parsed = updateSchema.safeParse(normalizeClientPatchBody(req.body));
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const patch = { ...parsed.data };
  const [updated] = await db
    .update(clients)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(clients.id, req.params.id))
    .returning();
  logger.info("Client updated", { clientId: updated.id, businessId: bid });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "client.updated",
    entityType: "client",
    entityId: updated.id,
    metadata: {
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
    },
  });
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
  logger.info("Client archived", { clientId: req.params.id, businessId: bid });
  await createRequestActivityLog(req, {
    businessId: bid,
    action: "client.archived",
    entityType: "client",
    entityId: req.params.id,
    metadata: {
      firstName: existing.firstName,
      lastName: existing.lastName,
      deletedAt: now.toISOString(),
    },
  });
  res.json(updated ?? existing);
});
