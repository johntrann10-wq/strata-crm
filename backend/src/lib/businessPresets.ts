import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { businesses, services } from "../db/schema.js";
import { getBusinessTypeGroup } from "../types/index.js";

type PresetService = {
  name: string;
  category: "detail" | "tint" | "ppf" | "mechanical" | "tire" | "body" | "other";
  price: number;
  durationMinutes: number | null;
  notes?: string;
  taxable?: boolean;
  isAddon?: boolean;
};

const PRESETS: Record<string, PresetService[]> = {
  detail: [
    { name: "Exterior Detail", category: "detail", price: 149, durationMinutes: 180 },
    { name: "Interior Detail", category: "detail", price: 179, durationMinutes: 210 },
    { name: "Full Detail", category: "detail", price: 299, durationMinutes: 360 },
    { name: "Paint Correction", category: "detail", price: 499, durationMinutes: 480 },
    { name: "Engine Bay Detail", category: "detail", price: 49, durationMinutes: 45, isAddon: true },
    { name: "Headlight Restoration", category: "detail", price: 89, durationMinutes: 60, isAddon: true },
  ],
  mechanical: [
    { name: "Diagnostic Inspection", category: "mechanical", price: 129, durationMinutes: 90 },
    { name: "Oil Change Service", category: "mechanical", price: 79, durationMinutes: 45 },
    { name: "Brake Service", category: "mechanical", price: 349, durationMinutes: 180 },
    { name: "Battery Replacement", category: "mechanical", price: 189, durationMinutes: 45 },
    { name: "Multi-Point Inspection", category: "mechanical", price: 59, durationMinutes: 45, isAddon: true },
  ],
  tire: [
    { name: "Mount & Balance", category: "tire", price: 129, durationMinutes: 60 },
    { name: "Four Tire Install", category: "tire", price: 199, durationMinutes: 90 },
    { name: "Wheel Alignment", category: "tire", price: 139, durationMinutes: 75 },
    { name: "TPMS Service", category: "tire", price: 49, durationMinutes: 30, isAddon: true },
    { name: "Road Hazard Repair", category: "tire", price: 39, durationMinutes: 30, isAddon: true },
  ],
  body: [
    { name: "Full Vehicle Wrap", category: "body", price: 2800, durationMinutes: 1440 },
    { name: "Partial Wrap", category: "body", price: 950, durationMinutes: 480 },
    { name: "Chrome Delete", category: "body", price: 499, durationMinutes: 240 },
    { name: "Decal Install", category: "body", price: 149, durationMinutes: 90, isAddon: true },
  ],
  other: [
    { name: "Vehicle Service Package", category: "other", price: 199, durationMinutes: 120 },
    { name: "Inspection", category: "other", price: 79, durationMinutes: 60 },
    { name: "Add-On Service", category: "other", price: 49, durationMinutes: 30, isAddon: true },
  ],
};

export function getPresetSummaryForBusinessType(type: string | null | undefined) {
  const group = getBusinessTypeGroup(type ?? "");
  const preset = PRESETS[group] ?? PRESETS.other;
  return {
    group,
    count: preset.length,
    names: preset.slice(0, 4).map((item) => item.name),
  };
}

export async function applyBusinessPreset(businessId: string) {
  const [business] = await db
    .select({ id: businesses.id, type: businesses.type })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!business) throw new Error("Business not found.");

  const group = getBusinessTypeGroup(business.type);
  const preset = PRESETS[group] ?? PRESETS.other;
  const names = preset.map((item) => item.name);
  const existing = await db
    .select({ name: services.name, category: services.category })
    .from(services)
    .where(and(eq(services.businessId, businessId), inArray(services.name, names)));
  const existingKeys = new Set(existing.map((item) => `${item.name}::${item.category}`));

  const toInsert = preset.filter((item) => !existingKeys.has(`${item.name}::${item.category}`));
  if (toInsert.length === 0) {
    return { created: 0, skipped: preset.length, group };
  }

  await db.insert(services).values(
    toInsert.map((item) => ({
      businessId,
      name: item.name,
      category: item.category,
      price: String(item.price),
      durationMinutes: item.durationMinutes,
      notes: item.notes ?? null,
      taxable: item.taxable ?? true,
      isAddon: item.isAddon ?? false,
      active: true,
    }))
  );

  return { created: toInsert.length, skipped: preset.length - toInsert.length, group };
}
