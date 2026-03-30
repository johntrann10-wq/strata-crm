import { randomUUID } from "crypto";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { serviceCategories, services } from "../db/schema.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { formatLegacyServiceCategory, isLegacyServiceCategory, LEGACY_SERVICE_CATEGORIES } from "../lib/serviceCategories.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

export const serviceCategoriesRouter = Router({ mergeParams: true });

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
  name: z.string().trim().min(1),
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    active: z.boolean().optional(),
  })
  .strict();

const deleteSchema = z
  .object({
    moveToCategoryId: z.string().uuid().nullable().optional(),
    moveToUncategorized: z.boolean().optional(),
  })
  .strict();

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

serviceCategoriesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const filter = parseFilter(req) as { active?: { equals?: boolean } } | undefined;
    const conditions = [eq(serviceCategories.businessId, bid)];
    if (typeof filter?.active?.equals === "boolean") {
      conditions.push(eq(serviceCategories.active, filter.active.equals));
    }

    const rows = await db
      .select({
        id: serviceCategories.id,
        businessId: serviceCategories.businessId,
        name: serviceCategories.name,
        key: serviceCategories.key,
        sortOrder: serviceCategories.sortOrder,
        active: serviceCategories.active,
        createdAt: serviceCategories.createdAt,
        updatedAt: serviceCategories.updatedAt,
        serviceCount: count(services.id),
      })
      .from(serviceCategories)
      .leftJoin(services, eq(services.categoryId, serviceCategories.id))
      .where(and(...conditions))
      .groupBy(
        serviceCategories.id,
        serviceCategories.businessId,
        serviceCategories.name,
        serviceCategories.key,
        serviceCategories.sortOrder,
        serviceCategories.active,
        serviceCategories.createdAt,
        serviceCategories.updatedAt
      )
      .orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name));

    res.json({ records: rows.map((row) => ({ ...row, serviceCount: Number(row.serviceCount ?? 0) })) });
  })
);

serviceCategoriesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

    const normalizedName = parsed.data.name;
    const existing = await db
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(and(eq(serviceCategories.businessId, bid), eq(serviceCategories.name, normalizedName)))
      .limit(1);
    if (existing[0]) throw new BadRequestError("A category with that name already exists.");

    const [last] = await db
      .select({ sortOrder: serviceCategories.sortOrder })
      .from(serviceCategories)
      .where(eq(serviceCategories.businessId, bid))
      .orderBy(desc(serviceCategories.sortOrder))
      .limit(1);
    const sortOrder = last ? Number(last.sortOrder ?? 0) + 1 : 0;

    const [created] = await db
      .insert(serviceCategories)
      .values({
        id: randomUUID(),
        businessId: bid,
        name: normalizedName,
        key: isLegacyServiceCategory(normalizedName.toLowerCase()) ? normalizedName.toLowerCase() : null,
        sortOrder,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json(created);
  })
);

serviceCategoriesRouter.patch(
  "/:id",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

    const [existing] = await db
      .select()
      .from(serviceCategories)
      .where(and(eq(serviceCategories.id, req.params.id), eq(serviceCategories.businessId, bid)))
      .limit(1);
    if (!existing) throw new NotFoundError("Service category not found.");

    if (parsed.data.name && parsed.data.name !== existing.name) {
      const [duplicate] = await db
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(and(eq(serviceCategories.businessId, bid), eq(serviceCategories.name, parsed.data.name)))
        .limit(1);
      if (duplicate && duplicate.id !== existing.id) {
        throw new BadRequestError("A category with that name already exists.");
      }
    }

    const nextName = parsed.data.name ?? existing.name;
    const nextKey = isLegacyServiceCategory(nextName.toLowerCase()) ? nextName.toLowerCase() : existing.key ?? null;

    const [updated] = await db
      .update(serviceCategories)
      .set({
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        key: nextKey,
        updatedAt: new Date(),
      })
      .where(eq(serviceCategories.id, existing.id))
      .returning();

    res.json(updated);
  })
);

serviceCategoriesRouter.post(
  "/reorder",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

    const existing = await db
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(and(eq(serviceCategories.businessId, bid), inArray(serviceCategories.id, parsed.data.orderedIds)));

    if (existing.length !== parsed.data.orderedIds.length) {
      throw new BadRequestError("Category reorder includes records outside this business.");
    }

    await Promise.all(
      parsed.data.orderedIds.map((id, index) =>
        db
          .update(serviceCategories)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(and(eq(serviceCategories.id, id), eq(serviceCategories.businessId, bid)))
      )
    );

    res.json({ ok: true });
  })
);

serviceCategoriesRouter.delete(
  "/:id",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = deleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

    const [existing] = await db
      .select()
      .from(serviceCategories)
      .where(and(eq(serviceCategories.id, req.params.id), eq(serviceCategories.businessId, bid)))
      .limit(1);
    if (!existing) throw new NotFoundError("Service category not found.");

    const [usage] = await db
      .select({ c: count() })
      .from(services)
      .where(and(eq(services.businessId, bid), eq(services.categoryId, existing.id)));
    const serviceCount = Number(usage?.c ?? 0);

    if (serviceCount > 0) {
      if (parsed.data.moveToCategoryId) {
        if (parsed.data.moveToCategoryId === existing.id) {
          throw new BadRequestError("Choose a different category.");
        }
        const [target] = await db
          .select({ id: serviceCategories.id, key: serviceCategories.key })
          .from(serviceCategories)
          .where(and(eq(serviceCategories.id, parsed.data.moveToCategoryId), eq(serviceCategories.businessId, bid)))
          .limit(1);
        if (!target) throw new BadRequestError("Target category not found.");
        await db
          .update(services)
          .set({
            categoryId: target.id,
            category: target.key && isLegacyServiceCategory(target.key) ? target.key : "other",
            updatedAt: new Date(),
          })
          .where(and(eq(services.businessId, bid), eq(services.categoryId, existing.id)));
      } else if (parsed.data.moveToUncategorized) {
        await db
          .update(services)
          .set({
            categoryId: null,
            category: "other",
            updatedAt: new Date(),
          })
          .where(and(eq(services.businessId, bid), eq(services.categoryId, existing.id)));
      } else {
        throw new BadRequestError("Move linked services before deleting this category.");
      }
    }

    await db.delete(serviceCategories).where(eq(serviceCategories.id, existing.id));
    res.status(204).end();
  })
);
