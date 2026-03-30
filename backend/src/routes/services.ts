import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { appointmentServices, serviceCategories, services } from "../db/schema.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { warnOnce } from "../lib/warnOnce.js";
import { wrapAsync } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import {
  ensureBusinessServiceCategories,
  formatLegacyServiceCategory,
  isLegacyServiceCategory,
  LEGACY_SERVICE_CATEGORIES,
  type LegacyServiceCategory,
} from "../lib/serviceCategories.js";

export const servicesRouter = Router({ mergeParams: true });

const LEGACY_CATEGORY_PREFIX = "[[strata:service-category=";

type ServiceRow = {
  id: string;
  businessId: string;
  name: string;
  notes: string | null;
  price: string | null;
  durationMinutes: number | null;
  category: string | null;
  categoryId: string | null;
  categoryLabel: string | null;
  categorySortOrder: number | null;
  sortOrder: number | null;
  taxable: boolean | null;
  isAddon: boolean | null;
  active: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

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

function encodeLegacyServiceNotes(notes: string | null | undefined, category: string | null | undefined): string | null {
  const trimmedNotes = typeof notes === "string" ? notes.trim() : "";
  if (!isLegacyServiceCategory(category)) {
    return trimmedNotes || null;
  }
  const marker = `${LEGACY_CATEGORY_PREFIX}${category}]]`;
  if (trimmedNotes.startsWith(marker)) {
    return trimmedNotes;
  }
  return trimmedNotes ? `${marker}\n${trimmedNotes}` : marker;
}

function decodeLegacyServiceFields(notes: string | null | undefined): { notes: string | null; category: LegacyServiceCategory | null } {
  if (typeof notes !== "string" || notes.length === 0) {
    return { notes: null, category: null };
  }
  const normalized = notes.replace(/\r\n/g, "\n");
  const match = normalized.match(/^\[\[strata:service-category=([a-z_]+)\]\](?:\n)?/);
  if (!match) return { notes, category: null };
  const category = isLegacyServiceCategory(match[1]) ? match[1] : null;
  const cleaned = normalized.slice(match[0].length).trim();
  return { notes: cleaned || null, category };
}

async function getServiceColumns(): Promise<Set<string>> {
  const result = await db.execute(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'services'
  ` as any);
  const rows = (result as { rows?: Array<{ column_name?: string }> }).rows ?? [];
  return new Set(rows.map((row) => row.column_name).filter((value): value is string => Boolean(value)));
}

function buildLegacyServiceSelectColumns(columns: Set<string>): string {
  const selectColumns = [
    `s."id" as "id"`,
    `s."business_id" as "businessId"`,
    `s."name" as "name"`,
    columns.has("notes") ? `s."notes" as "notes"` : `null::text as "notes"`,
    `s."price" as "price"`,
    columns.has("duration_minutes")
      ? `s."duration_minutes" as "durationMinutes"`
      : `null::integer as "durationMinutes"`,
    columns.has("category") ? `s."category" as "category"` : `null::text as "category"`,
    `null::uuid as "categoryId"`,
    `null::text as "categoryName"`,
    `null::integer as "categorySortOrder"`,
    columns.has("sort_order") ? `s."sort_order" as "sortOrder"` : `0::integer as "sortOrder"`,
    columns.has("taxable") ? `s."taxable" as "taxable"` : `true as "taxable"`,
    columns.has("is_addon") ? `s."is_addon" as "isAddon"` : `false as "isAddon"`,
    columns.has("active") ? `s."active" as "active"` : `true as "active"`,
    columns.has("created_at") ? `s."created_at" as "createdAt"` : `now() as "createdAt"`,
    columns.has("updated_at") ? `s."updated_at" as "updatedAt"` : `now() as "updatedAt"`,
  ];

  return selectColumns.join(", ");
}

async function listLegacyCompatibleServices(
  bid: string,
  columns: Set<string>,
  activeFilter?: boolean,
  first = 100
): Promise<ServiceRow[]> {
  const selectColumns = buildLegacyServiceSelectColumns(columns);
  const values: unknown[] = [bid];
  const conditions = [`s."business_id" = $1`];

  if (typeof activeFilter === "boolean" && columns.has("active")) {
    values.push(activeFilter);
    conditions.push(`s."active" = $${values.length}`);
  }

  values.push(first);

  const result = await db.execute({
    text: `
      select ${selectColumns}
      from "services" s
      where ${conditions.join(" and ")}
      order by s."name" asc, ${columns.has("created_at") ? `s."created_at"` : `s."id"`} desc
      limit $${values.length}
    `,
    values,
  } as any);

  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  return rows.map((row) => normalizeServiceRecord(row as any));
}

async function getLegacyCompatibleService(id: string, bid: string, columns: Set<string>): Promise<ServiceRow | null> {
  const selectColumns = buildLegacyServiceSelectColumns(columns);
  const result = await db.execute({
    text: `
      select ${selectColumns}
      from "services" s
      where s."id" = $1 and s."business_id" = $2
      limit 1
    `,
    values: [id, bid],
  } as any);

  const rows = (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
  const row = rows[0];
  return row ? normalizeServiceRecord(row as any) : null;
}

type ServicePayload = z.infer<typeof createSchema>;

async function resolveCategoryAssignment(
  bid: string,
  payload: { category?: string | null; categoryId?: string | null }
): Promise<{ categoryId: string | null; legacyCategory: LegacyServiceCategory }> {
  if (payload.categoryId) {
    const [category] = await db
      .select({ id: serviceCategories.id, key: serviceCategories.key })
      .from(serviceCategories)
      .where(and(eq(serviceCategories.id, payload.categoryId), eq(serviceCategories.businessId, bid)))
      .limit(1);
    if (!category) throw new BadRequestError("Service category not found.");
    return {
      categoryId: category.id,
      legacyCategory: category.key && isLegacyServiceCategory(category.key) ? category.key : "other",
    };
  }

  if (payload.category && isLegacyServiceCategory(payload.category)) {
    const mapping = await ensureBusinessServiceCategories(bid, [
      {
        key: payload.category,
        name: formatLegacyServiceCategory(payload.category),
        sortOrder: LEGACY_SERVICE_CATEGORIES.findIndex((category) => category.key === payload.category),
      },
    ]);
    return {
      categoryId: mapping.get(payload.category) ?? null,
      legacyCategory: payload.category,
    };
  }

  return { categoryId: null, legacyCategory: "other" };
}

async function insertLegacyServiceRecord(
  bid: string,
  serviceId: string,
  body: ServicePayload,
  resolvedCategory: { categoryId: string | null; legacyCategory: LegacyServiceCategory }
): Promise<string | null> {
  const columns = await getServiceColumns();
  const insertColumns = ["id", "business_id", "name", "price"];
  const insertValues: unknown[] = [serviceId, bid, body.name, String(body.price)];
  const now = new Date();

  if (columns.has("duration_minutes")) {
    insertColumns.push("duration_minutes");
    insertValues.push(body.durationMinutes ?? null);
  }
  if (columns.has("category")) {
    insertColumns.push("category");
    insertValues.push(resolvedCategory.legacyCategory);
  }
  if (columns.has("category_id")) {
    insertColumns.push("category_id");
    insertValues.push(resolvedCategory.categoryId);
  }
  if (columns.has("sort_order")) {
    insertColumns.push("sort_order");
    insertValues.push(body.sortOrder ?? 0);
  }
  if (columns.has("notes")) {
    insertColumns.push("notes");
    insertValues.push(encodeLegacyServiceNotes(body.notes ?? null, resolvedCategory.legacyCategory));
  }
  if (columns.has("taxable")) {
    insertColumns.push("taxable");
    insertValues.push(body.taxable ?? true);
  }
  if (columns.has("is_addon")) {
    insertColumns.push("is_addon");
    insertValues.push(body.isAddon ?? false);
  }
  if (columns.has("active")) {
    insertColumns.push("active");
    insertValues.push(body.active ?? true);
  }
  if (columns.has("created_at")) {
    insertColumns.push("created_at");
    insertValues.push(now);
  }
  if (columns.has("updated_at")) {
    insertColumns.push("updated_at");
    insertValues.push(now);
  }

  const query = `
    insert into "services" (${insertColumns.map((column) => `"${column}"`).join(", ")})
    values (${insertValues.map((_value, index) => `$${index + 1}`).join(", ")})
    returning "id"
  `;
  const result = await db.execute({ text: query, values: insertValues } as any);
  const rows = (result as { rows?: Array<{ id?: string }> }).rows ?? [];
  return rows[0]?.id ?? null;
}

function normalizeServiceRecord(row: {
  id: string;
  businessId: string;
  name: string;
  notes: string | null;
  price: string | null;
  durationMinutes: number | null;
  category: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categorySortOrder?: number | null;
  sortOrder?: number | null;
  taxable?: boolean | null;
  isAddon?: boolean | null;
  active?: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}): ServiceRow {
  const decoded = decodeLegacyServiceFields(row.notes);
  const legacyCategory = isLegacyServiceCategory(row.category) ? row.category : decoded.category ?? "other";
  const categoryKey =
    row.categoryName && !isLegacyServiceCategory(row.category) && !decoded.category ? row.categoryName : legacyCategory;

  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    notes: decoded.notes,
    price: row.price,
    durationMinutes: row.durationMinutes ?? null,
    category: categoryKey,
    categoryId: row.categoryId ?? null,
    categoryLabel: row.categoryName ?? formatLegacyServiceCategory(legacyCategory),
    categorySortOrder: row.categorySortOrder ?? null,
    sortOrder: row.sortOrder ?? 0,
    taxable: row.taxable ?? true,
    isAddon: row.isAddon ?? false,
    active: row.active ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listServicesForBusiness(bid: string, activeFilter?: boolean, first = 100): Promise<ServiceRow[]> {
  const serviceColumns = await getServiceColumns();
  const hasLegacyCategory = serviceColumns.has("category");
  const hasCategoryId = serviceColumns.has("category_id");
  const hasSortOrder = serviceColumns.has("sort_order");
  const hasTaxable = serviceColumns.has("taxable");
  const hasIsAddon = serviceColumns.has("is_addon");
  const hasActive = serviceColumns.has("active");
  const conditions = [eq(services.businessId, bid)];
  if (typeof activeFilter === "boolean" && hasActive) conditions.push(eq(services.active, activeFilter));

  try {
    const rows = await db
      .select({
        id: services.id,
        businessId: services.businessId,
        name: services.name,
        notes: services.notes,
        price: services.price,
        durationMinutes: services.durationMinutes,
        category: hasLegacyCategory ? services.category : sql<string | null>`null`,
        categoryId: hasCategoryId ? services.categoryId : sql<string | null>`null`,
        categoryName: hasCategoryId ? serviceCategories.name : sql<string | null>`null`,
        categorySortOrder: hasCategoryId ? serviceCategories.sortOrder : sql<number | null>`null`,
        sortOrder: hasSortOrder ? services.sortOrder : sql<number | null>`0`,
        taxable: hasTaxable ? services.taxable : sql<boolean | null>`true`,
        isAddon: hasIsAddon ? services.isAddon : sql<boolean | null>`false`,
        active: hasActive ? services.active : sql<boolean | null>`true`,
        createdAt: services.createdAt,
        updatedAt: services.updatedAt,
      })
      .from(services)
      .leftJoin(serviceCategories, hasCategoryId ? eq(services.categoryId, serviceCategories.id) : sql`false`)
      .where(and(...conditions))
      .orderBy(
        hasCategoryId ? asc(serviceCategories.sortOrder) : sql`1`,
        hasSortOrder ? asc(services.sortOrder) : sql`1`,
        asc(services.name),
        desc(services.createdAt)
      )
      .limit(first);
    return rows.map((row) => normalizeServiceRecord(row));
  } catch (error) {
    if (!isServiceSchemaDriftError(error)) throw error;
    warnOnce("services:list:fallback", "services list falling back without category schema", {
      businessId: bid,
      error: error instanceof Error ? error.message : String(error),
    });
    return listLegacyCompatibleServices(bid, serviceColumns, activeFilter, first);
  }
}

async function getServiceForBusiness(id: string, bid: string): Promise<ServiceRow | null> {
  const serviceColumns = await getServiceColumns();
  const hasLegacyCategory = serviceColumns.has("category");
  const hasCategoryId = serviceColumns.has("category_id");
  const hasSortOrder = serviceColumns.has("sort_order");
  const hasTaxable = serviceColumns.has("taxable");
  const hasIsAddon = serviceColumns.has("is_addon");
  const hasActive = serviceColumns.has("active");

  try {
    const [row] = await db
      .select({
        id: services.id,
        businessId: services.businessId,
        name: services.name,
        notes: services.notes,
        price: services.price,
        durationMinutes: services.durationMinutes,
        category: hasLegacyCategory ? services.category : sql<string | null>`null`,
        categoryId: hasCategoryId ? services.categoryId : sql<string | null>`null`,
        categoryName: hasCategoryId ? serviceCategories.name : sql<string | null>`null`,
        categorySortOrder: hasCategoryId ? serviceCategories.sortOrder : sql<number | null>`null`,
        sortOrder: hasSortOrder ? services.sortOrder : sql<number | null>`0`,
        taxable: hasTaxable ? services.taxable : sql<boolean | null>`true`,
        isAddon: hasIsAddon ? services.isAddon : sql<boolean | null>`false`,
        active: hasActive ? services.active : sql<boolean | null>`true`,
        createdAt: services.createdAt,
        updatedAt: services.updatedAt,
      })
      .from(services)
      .leftJoin(serviceCategories, hasCategoryId ? eq(services.categoryId, serviceCategories.id) : sql`false`)
      .where(and(eq(services.id, id), eq(services.businessId, bid)))
      .limit(1);
    return row ? normalizeServiceRecord(row) : null;
  } catch (error) {
    if (!isServiceSchemaDriftError(error)) throw error;
    return getLegacyCompatibleService(id, bid, serviceColumns);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  price: z.coerce.number().min(0),
  durationMinutes: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
  category: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
  taxable: z.boolean().optional(),
  isAddon: z.boolean().optional(),
  active: z.boolean().optional(),
  business: z.object({ _link: z.string().uuid() }).optional(),
});

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    price: z.coerce.number().min(0).optional(),
    durationMinutes: z.union([z.null(), z.coerce.number().int().min(0)]).optional(),
    category: z.string().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
    taxable: z.boolean().optional(),
    isAddon: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict();

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

servicesRouter.get(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const filter = parseFilter(req);
    const activeEquals = (filter as { active?: { equals?: boolean } } | undefined)?.active?.equals;
    const first = req.query.first != null ? Math.min(Number(req.query.first), 200) : 100;
    const list = await listServicesForBusiness(bid, activeEquals, first);
    res.json({ records: list });
  })
);

servicesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const row = await getServiceForBusiness(req.params.id, businessId(req));
    if (!row) throw new NotFoundError("Service not found.");
    res.json(row);
  })
);

servicesRouter.post(
  "/",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");
    const body = parsed.data;
    if (body.business?._link && body.business._link !== bid) {
      throw new BadRequestError("Business mismatch.");
    }

    const resolvedCategory = await resolveCategoryAssignment(bid, body);
    const createdAt = new Date();
    const serviceId = randomUUID();
    let createdId: string | null = null;

    try {
      const [created] = await db
        .insert(services)
        .values({
          id: serviceId,
          businessId: bid,
          name: body.name,
          price: String(body.price),
          durationMinutes: body.durationMinutes ?? null,
          category: resolvedCategory.legacyCategory,
          categoryId: resolvedCategory.categoryId,
          sortOrder: body.sortOrder ?? 0,
          notes: encodeLegacyServiceNotes(body.notes ?? null, resolvedCategory.legacyCategory),
          taxable: body.taxable ?? true,
          isAddon: body.isAddon ?? false,
          active: body.active ?? true,
          createdAt,
          updatedAt: createdAt,
        })
        .returning({ id: services.id });
      createdId = created?.id ?? null;
    } catch (error) {
      warnOnce("services:create:fallback", "service create falling back without full category schema", {
        businessId: bid,
        error: error instanceof Error ? error.message : String(error),
      });
      createdId = await insertLegacyServiceRecord(bid, serviceId, body, resolvedCategory);
    }

    if (!createdId) throw new BadRequestError("Unable to create service.");
    const created = await getServiceForBusiness(createdId, bid);
    if (!created) throw new NotFoundError("Service not found after create.");
    res.status(201).json(created);
  })
);

servicesRouter.patch(
  "/:id",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
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

    const resolvedCategory =
      body.category !== undefined || body.categoryId !== undefined
        ? await resolveCategoryAssignment(bid, {
            category: body.category ?? existing.category,
            categoryId: body.categoryId ?? existing.categoryId,
          })
        : {
            categoryId: existing.categoryId,
            legacyCategory: isLegacyServiceCategory(existing.category) ? existing.category : "other",
          };

    try {
      await db
        .update(services)
        .set({
          ...(body.name != null ? { name: body.name } : {}),
          ...(body.price != null ? { price: String(body.price) } : {}),
          ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
          ...(body.category !== undefined || body.categoryId !== undefined
            ? { category: resolvedCategory.legacyCategory, categoryId: resolvedCategory.categoryId }
            : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          ...(body.notes !== undefined || body.category !== undefined || body.categoryId !== undefined
            ? {
                notes: encodeLegacyServiceNotes(
                  body.notes !== undefined ? body.notes : existing.notes,
                  resolvedCategory.legacyCategory
                ),
              }
            : {}),
          ...(body.taxable !== undefined ? { taxable: body.taxable } : {}),
          ...(body.isAddon !== undefined ? { isAddon: body.isAddon } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
          updatedAt: new Date(),
        })
        .where(eq(services.id, req.params.id));
    } catch (error) {
      if (!isServiceSchemaDriftError(error)) throw error;
      await db
        .update(services)
        .set({
          ...(body.name != null ? { name: body.name } : {}),
          ...(body.price != null ? { price: String(body.price) } : {}),
          ...(body.notes !== undefined || body.category !== undefined || body.categoryId !== undefined
            ? {
                notes: encodeLegacyServiceNotes(
                  body.notes !== undefined ? body.notes : existing.notes,
                  resolvedCategory.legacyCategory
                ),
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(services.id, req.params.id));
    }

    const updated = await getServiceForBusiness(req.params.id, bid);
    if (!updated) throw new NotFoundError("Service not found after update.");
    res.json(updated);
  })
);

servicesRouter.post(
  "/reorder",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
    const bid = businessId(req);
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.message ?? "Invalid input");

    const existing = await db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.businessId, bid), inArray(services.id, parsed.data.orderedIds)));
    if (existing.length !== parsed.data.orderedIds.length) {
      throw new BadRequestError("Service reorder includes records outside this business.");
    }

    await Promise.all(
      parsed.data.orderedIds.map((id, index) =>
        db
          .update(services)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(and(eq(services.id, id), eq(services.businessId, bid)))
      )
    );

    res.json({ ok: true });
  })
);

servicesRouter.delete(
  "/:id",
  requireAuth,
  requireTenant,
  wrapAsync(async (req: Request, res: Response) => {
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
  })
);
