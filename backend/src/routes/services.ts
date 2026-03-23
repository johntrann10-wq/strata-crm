import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { services, appointmentServices } from "../db/schema.js";
import { eq, and, asc, desc, count } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const servicesRouter = Router({ mergeParams: true });

const CATEGORY_VALUES = [
  "detail",
  "tint",
  "ppf",
  "mechanical",
  "tire",
  "body",
  "other",
] as const;

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function parseFilter(req: Request): Record<string, unknown> | undefined {
  try {
    return req.query.filter ? (JSON.parse(String(req.query.filter)) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  price: z.coerce.number().min(0),
  /** null first so null is not coerced to 0 by z.coerce. */
  durationMinutes: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
  category: z.enum(CATEGORY_VALUES),
  notes: z.string().nullable().optional(),
  taxable: z.boolean().optional(),
  isAddon: z.boolean().optional(),
  active: z.boolean().optional(),
  business: z.object({ _link: z.string().uuid() }).optional(),
});

/** PATCH accepts only persisted columns (no Gadget `business` link — tenant is implicit). */
const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    price: z.coerce.number().min(0).optional(),
    durationMinutes: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
    category: z.enum(CATEGORY_VALUES).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
    taxable: z.boolean().optional(),
    isAddon: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict();

servicesRouter.get("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const filter = parseFilter(req);
  const conditions = [eq(services.businessId, bid)];

  const activeEquals = (filter as { active?: { equals?: boolean } } | undefined)?.active?.equals;
  if (typeof activeEquals === "boolean") {
    conditions.push(eq(services.active, activeEquals));
  }

  const first = req.query.first != null ? Math.min(Number(req.query.first), 200) : 100;

  const list = await db
    .select()
    .from(services)
    .where(and(...conditions))
    .orderBy(asc(services.category), asc(services.name), desc(services.createdAt))
    .limit(first);

  res.json({ records: list });
});

servicesRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(services)
    .where(eq(services.id, req.params.id))
    .limit(1);
  if (!row || row.businessId !== req.businessId) throw new NotFoundError("Service not found.");
  res.json(row);
});

servicesRouter.post("/", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const body = parsed.data;
  if (body.business?._link && body.business._link !== bid) {
    throw new BadRequestError("Business mismatch.");
  }

  const [created] = await db
    .insert(services)
    .values({
      businessId: bid,
      name: body.name,
      price: String(body.price),
      durationMinutes: body.durationMinutes ?? null,
      category: body.category,
      notes: body.notes ?? null,
      taxable: body.taxable ?? true,
      isAddon: body.isAddon ?? false,
      active: body.active ?? true,
    })
    .returning();
  res.status(201).json(created);
});

servicesRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, req.params.id), eq(services.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Service not found.");

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    res.json(existing);
    return;
  }

  const [updated] = await db
    .update(services)
    .set({
      ...(body.name != null ? { name: body.name } : {}),
      ...(body.price != null ? { price: String(body.price) } : {}),
      ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
      ...(body.category != null ? { category: body.category } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.taxable !== undefined ? { taxable: body.taxable } : {}),
      ...(body.isAddon !== undefined ? { isAddon: body.isAddon } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(services.id, req.params.id))
    .returning();
  res.json(updated);
});

servicesRouter.delete("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [existing] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, req.params.id), eq(services.businessId, bid)))
    .limit(1);
  if (!existing) throw new NotFoundError("Service not found.");

  const [usage] = await db
    .select({ c: count() })
    .from(appointmentServices)
    .where(eq(appointmentServices.serviceId, req.params.id));
  if (Number(usage?.c ?? 0) > 0) {
    throw new BadRequestError("This service is linked to past appointments. Deactivate it instead of deleting.");
  }

  await db.delete(services).where(eq(services.id, req.params.id));
  res.status(204).end();
});
