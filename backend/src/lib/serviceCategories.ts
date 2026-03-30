import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { serviceCategories } from "../db/schema.js";

export const LEGACY_SERVICE_CATEGORIES = [
  { key: "detail", name: "Detail", sortOrder: 0 },
  { key: "tint", name: "Tint", sortOrder: 1 },
  { key: "ppf", name: "PPF", sortOrder: 2 },
  { key: "mechanical", name: "Mechanical", sortOrder: 3 },
  { key: "tire", name: "Tire", sortOrder: 4 },
  { key: "body", name: "Body", sortOrder: 5 },
  { key: "other", name: "Other", sortOrder: 6 },
] as const;

export type LegacyServiceCategory = (typeof LEGACY_SERVICE_CATEGORIES)[number]["key"];

export const LEGACY_SERVICE_CATEGORY_LABELS = Object.fromEntries(
  LEGACY_SERVICE_CATEGORIES.map((category) => [category.key, category.name])
) as Record<LegacyServiceCategory, string>;

export function isLegacyServiceCategory(value: string | null | undefined): value is LegacyServiceCategory {
  return typeof value === "string" && LEGACY_SERVICE_CATEGORIES.some((category) => category.key === value);
}

export function formatLegacyServiceCategory(value: string | null | undefined): string {
  if (!value) return "Other";
  return isLegacyServiceCategory(value) ? LEGACY_SERVICE_CATEGORY_LABELS[value] : value;
}

export async function ensureBusinessServiceCategories(
  businessId: string,
  requested: Array<{ key?: string | null; name: string; sortOrder?: number | null }>
): Promise<Map<string, string>> {
  if (requested.length === 0) return new Map();

  const normalized = requested
    .map((item, index) => ({
      key: item.key?.trim() || null,
      name: item.name.trim(),
      sortOrder: item.sortOrder ?? index,
    }))
    .filter((item) => item.name.length > 0);

  if (normalized.length === 0) return new Map();

  const keys = normalized.map((item) => item.key).filter((value): value is string => Boolean(value));
  const names = normalized.map((item) => item.name);

  const existing = await db
    .select({
      id: serviceCategories.id,
      key: serviceCategories.key,
      name: serviceCategories.name,
    })
    .from(serviceCategories)
    .where(
      and(
        eq(serviceCategories.businessId, businessId),
        keys.length > 0
          ? or(inArray(serviceCategories.name, names), inArray(serviceCategories.key, keys))
          : inArray(serviceCategories.name, names)
      )
    );

  const byIdentity = new Map<string, string>();
  for (const row of existing) {
    byIdentity.set(`name:${row.name.toLowerCase()}`, row.id);
    if (row.key) byIdentity.set(`key:${row.key}`, row.id);
  }

  const missing = normalized.filter(
    (item) => !byIdentity.has(`name:${item.name.toLowerCase()}`) && !(item.key && byIdentity.has(`key:${item.key}`))
  );

  if (missing.length > 0) {
    const created = await db
      .insert(serviceCategories)
      .values(
        missing.map((item) => ({
          businessId,
          name: item.name,
          key: item.key,
          sortOrder: item.sortOrder,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      )
      .returning({
        id: serviceCategories.id,
        key: serviceCategories.key,
        name: serviceCategories.name,
      });

    for (const row of created) {
      byIdentity.set(`name:${row.name.toLowerCase()}`, row.id);
      if (row.key) byIdentity.set(`key:${row.key}`, row.id);
    }
  }

  const resolved = new Map<string, string>();
  for (const item of normalized) {
    const id = (item.key ? byIdentity.get(`key:${item.key}`) : undefined) ?? byIdentity.get(`name:${item.name.toLowerCase()}`);
    if (id) {
      if (item.key) resolved.set(item.key, id);
      resolved.set(item.name.toLowerCase(), id);
    }
  }
  return resolved;
}

export async function ensureDefaultServiceCategories(businessId: string): Promise<void> {
  await ensureBusinessServiceCategories(
    businessId,
    LEGACY_SERVICE_CATEGORIES.map((category) => ({
      key: category.key,
      name: category.name,
      sortOrder: category.sortOrder,
    }))
  );
}

export async function listServiceCategoriesForBusiness(businessId: string) {
  return db
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.businessId, businessId))
    .orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name));
}
