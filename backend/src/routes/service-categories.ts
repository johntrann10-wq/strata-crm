import { randomUUID } from "crypto";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { serviceCategories, services } from "../db/schema.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { formatLegacyServiceCategory, isLegacyServiceCategory, LEGACY_SERVICE_CATEGORIES } from "../lib/serviceCategories.js";
import { warnOnce } from "../lib/warnOnce.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
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

function isServiceCategorySchemaDriftError(error: unknown): boolean {
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

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = ${tableName}
  `);
  const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
  return new Set(rows.map((row) => row.column_name).filter((value): value is string => Boolean(value)));
}

async function supportsManagedServiceCategories(): Promise<boolean> {
  const [categoryColumns, serviceColumns] = await Promise.all([
    getTableColumns("service_categories"),
    getTableColumns("services"),
  ]);

  return (
    categoryColumns.has("id") &&
    categoryColumns.has("business_id") &&
    categoryColumns.has("name") &&
    categoryColumns.has("sort_order") &&
    serviceColumns.has("category_id")
  );
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
  "/capabilities",
  requireAuth,
  requireTenant,
  requirePermission("services.read"),
  wrapAsync(async (_req: Request, res: Response) => {
    res.json({ supportsManagement: await supportsManagedServiceCategories() });
  })
);

serviceCategoriesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("services.read"),
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const filter = parseFilter(req) as { active?: { equals?: boolean } } | undefined;
    const conditions = [eq(serviceCategories.businessId, bid)];
    if (typeof filter?.active?.equals === "boolean") {
      conditions.push(eq(serviceCategories.active, filter.active.equals));
    }

    try {
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
      return;
    } catch (error) {
      if (!isServiceCategorySchemaDriftError(error)) throw error;
      warnOnce("service-categories:list:fallback", "service categories list falling back without full schema", {
        businessId: bid,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const serviceColumns = await getTableColumns("services");
    if (!serviceColumns.has("category")) {
      res.json({ records: [] });
      return;
    }

    const legacyRows = await db
      .select({
        category: services.category,
        serviceCount: count(services.id),
      })
      .from(services)
      .where(eq(services.businessId, bid))
      .groupBy(services.category)
      .orderBy(asc(services.category));

    const now = new Date();
    const records = legacyRows.map((row, index) => {
      const key = isLegacyServiceCategory(row.category) ? row.category : null;
      return {
        id: `legacy:${row.category ?? "other"}`,
        businessId: bid,
        name: formatLegacyServiceCategory(row.category),
        key,
        sortOrder: key ? LEGACY_SERVICE_CATEGORIES.findIndex((category) => category.key === key) : 1000 + index,
        active: true,
        createdAt: now,
        updatedAt: now,
        serviceCount: Number(row.serviceCount ?? 0),
      };
    });

    res.json({ records });
  })
);

serviceCategoriesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  requirePermission("services.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    if (!(await supportsManagedServiceCategories())) {
      throw new BadRequestError("Service category management is not available until the latest database update is applied.");
    }

    const normalizedName = parsed.data.name;
    let created;
    try {
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

      [created] = await db
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
    } catch (error) {
      if (isServiceCategorySchemaDriftError(error)) {
        throw new BadRequestError("Service category management is not available until the latest database update is applied.");
      }
      throw error;
    }

    res.status(201).json(created);
  })
);

serviceCategoriesRouter.patch(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("services.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    if (!(await supportsManagedServiceCategories())) {
      throw new BadRequestError("Service category management is not available until the latest database update is applied.");
    }

    try {
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
    } catch (error) {
      if (isServiceCategorySchemaDriftError(error)) {
        throw new BadRequestError("Service category management is not available until the latest database update is applied.");
      }
      throw error;
    }
  })
);

serviceCategoriesRouter.post(
  "/reorder",
  requireAuth,
  requireTenant,
  requirePermission("services.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    if (!(await supportsManagedServiceCategories())) {
      throw new BadRequestError("Service category management is not available until the latest database update is applied.");
    }

    try {
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
    } catch (error) {
      if (isServiceCategorySchemaDriftError(error)) {
        throw new BadRequestError("Service category management is not available until the latest database update is applied.");
      }
      throw error;
    }
  })
);

serviceCategoriesRouter.delete(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission("services.write"),
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = deleteSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    if (!(await supportsManagedServiceCategories())) {
      throw new BadRequestError("Service category management is not available until the latest database update is applied.");
    }

    try {
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
    } catch (error) {
      if (isServiceCategorySchemaDriftError(error)) {
        throw new BadRequestError("Service category management is not available until the latest database update is applied.");
      }
      throw error;
    }
  })
);
