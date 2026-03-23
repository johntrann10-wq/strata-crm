/**
 * Universal service catalog — one shape for every auto business.
 * Categories are fixed vocabulary only; pricing, duration, add-ons, and notes are always shop-configurable.
 */

export const SERVICE_CATEGORY_VALUES = [
  "detail",
  "tint",
  "ppf",
  "mechanical",
  "tire",
  "body",
  "other",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORY_VALUES)[number];

/** Display labels for UI (no business rules — labels only). */
export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  detail: "Detail",
  tint: "Tint",
  ppf: "PPF",
  mechanical: "Mechanical",
  tire: "Tire",
  body: "Body",
  other: "Other",
};

export function formatServiceCategory(category: string | null | undefined): string {
  if (!category) return SERVICE_CATEGORY_LABELS.other;
  const c = category as ServiceCategory;
  return SERVICE_CATEGORY_LABELS[c] ?? category;
}
