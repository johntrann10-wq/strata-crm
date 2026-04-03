export type CalendarBlockMode = "time" | "full-day";

export type CalendarBlockPreset =
  | "vacation"
  | "unavailable"
  | "personal"
  | "shop-closed";

export type CalendarBlockMetadata = {
  mode: CalendarBlockMode;
  preset: CalendarBlockPreset;
};

const CALENDAR_BLOCK_PREFIX = "[[calendar-block:";

const BLOCK_LABELS: Record<CalendarBlockPreset, string> = {
  vacation: "Vacation",
  unavailable: "Unavailable",
  personal: "Personal block",
  "shop-closed": "Shop closed",
};

export function parseCalendarBlock(
  internalNotes: string | null | undefined
): CalendarBlockMetadata | null {
  const firstLine = String(internalNotes ?? "").split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine?.startsWith(CALENDAR_BLOCK_PREFIX) || !firstLine.endsWith("]]")) {
    return null;
  }

  const payload = firstLine
    .slice(CALENDAR_BLOCK_PREFIX.length, -2)
    .split(":")
    .map((part) => part.trim());

  if (payload.length !== 2) return null;

  const [mode, preset] = payload;
  if (
    (mode !== "time" && mode !== "full-day") ||
    !["vacation", "unavailable", "personal", "shop-closed"].includes(preset)
  ) {
    return null;
  }

  return {
    mode: mode as CalendarBlockMode,
    preset: preset as CalendarBlockPreset,
  };
}

export function buildCalendarBlockInternalNotes(
  metadata: CalendarBlockMetadata,
  note?: string | null
): string {
  const marker = `${CALENDAR_BLOCK_PREFIX}${metadata.mode}:${metadata.preset}]]`;
  const trimmedNote = String(note ?? "").trim();
  return trimmedNote ? `${marker}\n\n${trimmedNote}` : marker;
}

export function isCalendarBlockAppointment(appointment: {
  internalNotes?: string | null;
}): boolean {
  return parseCalendarBlock(appointment.internalNotes) != null;
}

export function isFullDayCalendarBlock(appointment: {
  internalNotes?: string | null;
}): boolean {
  return parseCalendarBlock(appointment.internalNotes)?.mode === "full-day";
}

export function getCalendarBlockLabel(
  appointment: {
    title?: string | null;
    internalNotes?: string | null;
  },
  fallback = "Blocked time"
): string {
  if (appointment.title?.trim()) return appointment.title.trim();
  const parsed = parseCalendarBlock(appointment.internalNotes);
  return parsed ? BLOCK_LABELS[parsed.preset] : fallback;
}
