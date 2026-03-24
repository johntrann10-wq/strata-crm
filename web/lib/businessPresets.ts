export type BusinessPresetSummary = {
  group: string;
  count: number;
  names: string[];
};

export const BUSINESS_PRESET_LABELS: Record<string, string> = {
  detail: "Detailing / appearance preset",
  mechanical: "Mechanical repair preset",
  tire: "Tire shop preset",
  body: "Wrap / body preset",
  other: "General automotive preset",
};

export function formatBusinessPresetLabel(group: string | null | undefined) {
  if (!group) return BUSINESS_PRESET_LABELS.other;
  return BUSINESS_PRESET_LABELS[group] ?? BUSINESS_PRESET_LABELS.other;
}
