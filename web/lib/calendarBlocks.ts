export type CalendarBlockMode = "time" | "full-day";

export type CalendarBlockMetadata = {
  mode: CalendarBlockMode;
  preset?: string | null;
};

const CALENDAR_BLOCK_PREFIX = "[[calendar-block:";

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
    .map((part) => part.trim())
    .filter(Boolean);

  if (payload.length < 1 || payload.length > 2) return null;

  const [mode, preset] = payload;
  if (mode !== "time" && mode !== "full-day") return null;

  return {
    mode: mode as CalendarBlockMode,
    preset: preset || null,
  };
}

export function buildCalendarBlockInternalNotes(
  metadata: CalendarBlockMetadata,
  note?: string | null
): string {
  const marker = `${CALENDAR_BLOCK_PREFIX}${metadata.mode}]]`;
  const trimmedNote = String(note ?? "").trim();
  return trimmedNote ? `${marker}\n\n${trimmedNote}` : marker;
}

export function getCalendarBlockNote(
  internalNotes: string | null | undefined
): string | null {
  const [, ...rest] = String(internalNotes ?? "").split(/\r?\n/);
  const note = rest.join("\n").trim();
  return note.length > 0 ? note : null;
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
  return getCalendarBlockNote(appointment.internalNotes)?.split(/\r?\n/, 1)[0]?.trim() || fallback;
}
