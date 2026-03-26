import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { services, appointmentServices } from "../db/schema.js";
import { eq, and, asc, desc, count, sql } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { warnOnce } from "../lib/warnOnce.js";
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

function isServiceSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

type ServiceRecord = {
  id: string;
  businessId: string;
  name: string;
  notes: string | null;
  price: string | null;
  durationMinutes: number | null;
  category: (typeof CATEGORY_VALUES)[number] | null;
  taxable: boolean | null;
  isAddon: boolean | null;
  active: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

const legacyServiceSelection = {
  id: services.id,
  businessId: services.businessId,
  name: services.name,
  price: services.price,
  createdAt: services.createdAt,
  updatedAt: services.updatedAt,
};

const fullServiceSelection = {
  ...legacyServiceSelection,
  notes: services.notes,
  durationMinutes: services.durationMinutes,
  category: services.category,
  taxable: services.taxable,
  isAddon: services.isAddon,
  active: services.active,
};

let cachedServiceColumns: Set<string> | null = null;

async function getServiceColumns(): Promise<Set<string>> {
  if (cachedServiceColumns) return cachedServiceColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'services'
  `);
  const rows = Array.isArray((result as { rows?: unknown[] }).rows)
    ? ((result as { rows: Array<{ column_name?: string }> }).rows)
    : ((result as Array<{ column_name?: string }>) ?? []);
  cachedServiceColumns = new Set(
    rows
      .map((row) => row?.column_name)
      .filter((value): value is string => typeof value === "string")
  );
  return cachedServiceColumns;
}

function withMissingServiceFields<T extends Omit<ServiceRecord, "notes" | "durationMinutes" | "category" | "taxable" | "isAddon" | "active">>(
  row: T
): ServiceRecord {
  return {
    ...row,
    notes: null,
    durationMinutes: null,
    category: "other",
    taxable: true,
    isAddon: false,
    active: true,
  };
}

async function listServicesForBusiness(bid: string, activeFilter?: boolean, first = 100): Promise<ServiceRecord[]> {
  const conditions = [eq(services.businessId, bid)];
  if (typeof activeFilter === "boolean") {
    conditions.push(eq(services.active, activeFilter));
  }

  try {
    return await db
      .select(fullServiceSelection)
      .from(services)
      .where(and(...conditions))
      .orderBy(asc(services.category), asc(services.name), desc(services.createdAt))
      .limit(first);
  } catch (error) {
    if (!isServiceSchemaDriftError(error)) throw error;
    warnOnce("services:list:full-schema", "services list falling back without full schema", {
      businessId: bid,
      error: error instanceof Error ? error.message : String(error),
    });
    const rows = await db
      .select(legacyServiceSelection)
      .from(services)
      .where(eq(services.businessId, bid))
      .orderBy(asc(services.name), desc(services.createdAt))
      .limit(first);
    return rows.map((row) => withMissingServiceFields(row));
  }
}

async function getServiceForBusiness(id: string, bid: string): Promise<ServiceRecord | null> {
  try {
    const [row] = await db
      .select(fullServiceSelection)
      .from(services)
      .where(and(eq(services.id, id), eq(services.businessId, bid)))
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (!isServiceSchemaDriftError(error)) throw error;
    warnOnce("services:lookup:full-schema", "service lookup falling back without full schema", {
      businessId: bid,
      serviceId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    const [row] = await db
      .select(legacyServiceSelection)
      .from(services)
      .where(and(eq(services.id, id), eq(services.businessId, bid)))
      .limit(1);
    return row ? withMissingServiceFields(row) : null;
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

  const activeEquals = (filter as { active?: { equals?: boolean } } | undefined)?.active?.equals;
  const first = req.query.first != null ? Math.min(Number(req.query.first), 200) : 100;
  const list = await listServicesForBusiness(bid, activeEquals, first);
  res.json({ records: list });
});

servicesRouter.get("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const row = await getServiceForBusiness(req.params.id, businessId(req));
  if (!row) throw new NotFoundError("Service not found.");
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

  let createdId: string | null = null;
  try {
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
      .returning({ id: services.id });
    createdId = created?.id ?? null;
  } catch (error) {
    if (!isServiceSchemaDriftError(error)) throw error;
    warnOnce("services:create:full-schema", "service create falling back without full schema", {
      businessId: bid,
      error: error instanceof Error ? error.message : String(error),
    });
    const columns = await getServiceColumns();
    const fallbackValues: Partial<typeof services.$inferInsert> = {
      businessId: bid,
      name: body.name,
      price: String(body.price),
    };
    if (columns.has("duration_minutes")) fallbackValues.durationMinutes = body.durationMinutes ?? null;
    if (columns.has("category")) fallbackValues.category = body.category ?? "other";
    if (columns.has("notes")) fallbackValues.notes = body.notes ?? null;
    if (columns.has("taxable")) fallbackValues.taxable = body.taxable ?? true;
    if (columns.has("is_addon")) fallbackValues.isAddon = body.isAddon ?? false;
    if (columns.has("active")) fallbackValues.active = body.active ?? true;
    const [created] = await db
      .insert(services)
      .values(fallbackValues)
      .returning({ id: services.id });
    createdId = created?.id ?? null;
  }
  if (!createdId) throw new BadRequestError("Unable to create service.");
  let created: ServiceRecord | null = null;
  try {
    created = await getServiceForBusiness(createdId, bid);
  } catch (error) {
    warnOnce("services:create:lookup", "service create returning fallback record after lookup failure", {
      businessId: bid,
      serviceId: createdId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  if (!created) {
    const now = new Date();
    created = {
      id: createdId,
      businessId: bid,
      name: body.name,
      notes: body.notes ?? null,
      price: String(body.price),
      durationMinutes: body.durationMinutes ?? null,
      category: body.category ?? "other",
      taxable: body.taxable ?? true,
      isAddon: body.isAddon ?? false,
      active: body.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
  }
  res.status(201).json(created);
});

servicesRouter.patch("/:id", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const existing = await getServiceForBusiness(req.params.id, bid);
  if (!existing) throw new NotFoundError("Service not found.");

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    res.json(existing);
    return;
  }

  try {
    await db
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
      .where(eq(services.id, req.params.id));
  } catch (error) {
    if (!isServiceSchemaDriftError(error)) throw error;
    warnOnce("services:update:full-schema", "service update falling back without full schema", {
      businessId: bid,
      serviceId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    await db
      .update(services)
      .set({
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.price != null ? { price: String(body.price) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(services.id, req.params.id));
  }
  const updated = await getServiceForBusiness(req.params.id, bid);
  if (!updated) throw new NotFoundError("Service not found after update.");
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
