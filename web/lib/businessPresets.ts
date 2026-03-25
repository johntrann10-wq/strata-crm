export type BusinessPresetSummary = {
  group: string;
  count: number;
  names: string[];
};

export const BUSINESS_PRESET_LABELS: Record<string, string> = {
  auto_detailing: "Auto detailing starter preset",
  mobile_detailing: "Mobile detailing starter preset",
  wrap_ppf: "Wrap & PPF starter preset",
  window_tinting: "Window tinting starter preset",
  performance: "Performance starter preset",
  mechanic: "Mechanic starter preset",
  tire: "Tire shop preset",
  tire_shop: "Tire shop starter preset",
  muffler_shop: "Muffler shop starter preset",
  detail: "Auto detailing starter preset",
  mechanical: "Mechanic starter preset",
  body: "Wrap & PPF starter preset",
  other: "Automotive starter preset",
};

export function formatBusinessPresetLabel(group: string | null | undefined) {
  if (!group) return BUSINESS_PRESET_LABELS.other;
  return BUSINESS_PRESET_LABELS[group] ?? BUSINESS_PRESET_LABELS.other;
}
