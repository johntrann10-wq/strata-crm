const FALLBACK_OPEN_MINUTES = 9 * 60;
const FALLBACK_CLOSE_MINUTES = 17 * 60;
const DEFAULT_SLOT_INCREMENT_MINUTES = 15;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type BookingDefaultFlow = "request" | "self_book";
export type BookingFlowType = "inherit" | "request" | "self_book";
export type BookingServiceMode = "in_shop" | "mobile" | "both";

export type ParsedOperatingHours = {
  dayIndexes: Set<number>;
  openMinutes: number;
  closeMinutes: number;
};

export type BookingDailyHoursEntry = {
  dayIndex: number;
  enabled: boolean;
  openTime: string | null;
  closeTime: string | null;
};

const DAY_INDEX_BY_LABEL: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function parseTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function expandDayToken(token: string): number[] {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return [];

  if (normalized.includes("-")) {
    const [leftRaw, rightRaw] = normalized.split("-", 2);
    const left = DAY_INDEX_BY_LABEL[leftRaw.trim()];
    const right = DAY_INDEX_BY_LABEL[rightRaw.trim()];
    if (left == null || right == null) return [];
    if (left <= right) {
      return Array.from({ length: right - left + 1 }, (_, index) => left + index);
    }
    return [...Array.from({ length: 7 - left }, (_, index) => left + index), ...Array.from({ length: right + 1 }, (_, index) => index)];
  }

  const single = DAY_INDEX_BY_LABEL[normalized];
  return single == null ? [] : [single];
}

export function parseOperatingHours(value: string | null | undefined): ParsedOperatingHours {
  const raw = String(value ?? "").trim();
  const fallback = {
    dayIndexes: new Set([1, 2, 3, 4, 5]),
    openMinutes: FALLBACK_OPEN_MINUTES,
    closeMinutes: FALLBACK_CLOSE_MINUTES,
  };

  if (!raw) return fallback;
  const match = /(.+?)\s+([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/i.exec(raw);
  if (!match) return fallback;

  const dayPart = match[1] ?? "";
  const openMinutes = parseTimeToMinutes(`${match[2]}:${match[3]}`) ?? FALLBACK_OPEN_MINUTES;
  const closeMinutes = parseTimeToMinutes(`${match[4]}:${match[5]}`) ?? FALLBACK_CLOSE_MINUTES;
  const dayIndexes = new Set<number>();
  for (const token of dayPart.split(",")) {
    for (const dayIndex of expandDayToken(token)) {
      dayIndexes.add(dayIndex);
    }
  }

  if (dayIndexes.size === 0) return fallback;
  if (closeMinutes <= openMinutes) return fallback;
  return {
    dayIndexes,
    openMinutes,
    closeMinutes,
  };
}

export function normalizeBookingDefaultFlow(value: string | null | undefined): BookingDefaultFlow {
  return value === "self_book" ? "self_book" : "request";
}

export function normalizeBookingFlowType(value: string | null | undefined): BookingFlowType {
  if (value === "self_book" || value === "request" || value === "inherit") return value;
  return "inherit";
}

export function normalizeBookingServiceMode(value: string | null | undefined): BookingServiceMode {
  if (value === "mobile" || value === "both" || value === "in_shop") return value;
  return "in_shop";
}

export function resolveCustomerBookingMode(params: {
  serviceMode: string | null | undefined;
  requestedMode: string | null | undefined;
}): "in_shop" | "mobile" {
  const serviceMode = normalizeBookingServiceMode(params.serviceMode);
  if (serviceMode === "mobile") return "mobile";
  if (serviceMode === "both") return params.requestedMode === "mobile" ? "mobile" : "in_shop";
  return "in_shop";
}

export function resolveBookingFlow(params: {
  businessDefaultFlow: string | null | undefined;
  serviceFlowType: string | null | undefined;
}): BookingDefaultFlow {
  const serviceFlowType = normalizeBookingFlowType(params.serviceFlowType);
  if (serviceFlowType === "self_book") return "self_book";
  if (serviceFlowType === "request") return "request";
  return normalizeBookingDefaultFlow(params.businessDefaultFlow);
}

export function toBookingDurationMinutes(value: number | null | undefined): number {
  return clampInteger(value ?? 60, 15, 24 * 60);
}

export function toBookingWindowDays(value: number | null | undefined): number {
  return clampInteger(value ?? 30, 1, 180);
}

export function toBookingLeadTimeHours(value: number | null | undefined): number {
  return clampInteger(value ?? 0, 0, 24 * 14);
}

export function toBookingBufferMinutes(value: number | null | undefined): number {
  return clampInteger(value ?? 0, 0, 240);
}

export function normalizeBookingDayIndexes(value: Array<number> | null | undefined): Set<number> | null {
  if (!Array.isArray(value)) return null;
  const next = new Set<number>();
  for (const item of value) {
    if (!Number.isInteger(item) || item < 0 || item > 6) continue;
    next.add(item);
  }
  return next.size > 0 ? next : null;
}

export function normalizeBookingDailyHours(value: unknown): BookingDailyHoursEntry[] {
  if (!Array.isArray(value)) return [];
  const byDay = new Map<number, BookingDailyHoursEntry>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as {
      dayIndex?: unknown;
      enabled?: unknown;
      openTime?: unknown;
      closeTime?: unknown;
    };
    const dayIndex = Number(candidate.dayIndex);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) continue;
    const openTime =
      typeof candidate.openTime === "string" && parseTimeToMinutes(candidate.openTime) != null
        ? candidate.openTime
        : null;
    const closeTime =
      typeof candidate.closeTime === "string" && parseTimeToMinutes(candidate.closeTime) != null
        ? candidate.closeTime
        : null;
    const openMinutes = openTime ? parseTimeToMinutes(openTime) : null;
    const closeMinutes = closeTime ? parseTimeToMinutes(closeTime) : null;
    const hasValidWindow = openMinutes != null && closeMinutes != null && closeMinutes > openMinutes;
    byDay.set(dayIndex, {
      dayIndex,
      enabled: candidate.enabled === false ? false : hasValidWindow,
      openTime: hasValidWindow ? openTime : null,
      closeTime: hasValidWindow ? closeTime : null,
    });
  }
  return Array.from(byDay.values()).sort((left, right) => left.dayIndex - right.dayIndex);
}

export function parseBookingDailyHours(raw: string | null | undefined): BookingDailyHoursEntry[] {
  if (!raw) return [];
  try {
    return normalizeBookingDailyHours(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function getTimeZoneParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
    second: lookup("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timezone: string) {
  const parts = getTimeZoneParts(date, timezone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
}

export function zonedDateTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const initial = new Date(utcGuess);
  const offset = getTimeZoneOffsetMs(initial, timezone);
  const candidate = new Date(utcGuess - offset);
  const secondOffset = getTimeZoneOffsetMs(candidate, timezone);
  if (secondOffset !== offset) {
    return new Date(utcGuess - secondOffset);
  }
  return candidate;
}

export function startOfDayInTimeZone(date: Date, timezone: string) {
  const parts = getTimeZoneParts(date, timezone);
  return zonedDateTimeToUtc(timezone, parts.year, parts.month, parts.day, 0, 0, 0, 0);
}

export function addDaysInTimeZone(date: Date, timezone: string, days: number) {
  const parts = getTimeZoneParts(date, timezone);
  return zonedDateTimeToUtc(timezone, parts.year, parts.month, parts.day + days, 0, 0, 0, 0);
}

export function getDayOfWeekInTimeZone(date: Date, timezone: string) {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
  return DAY_LABELS.indexOf(text as (typeof DAY_LABELS)[number]);
}

export function formatDateKeyInTimeZone(date: Date, timezone: string) {
  const parts = getTimeZoneParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseDateKeyInTimeZone(value: string, timezone: string): Date {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const parsed = zonedDateTimeToUtc(timezone, year, month, day, 0, 0, 0, 0);
  const parts = getTimeZoneParts(parsed, timezone);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day
  ) {
    throw new Error("Invalid date key.");
  }
  return parsed;
}

export function buildSlotsForDate(params: {
  date: Date;
  operatingHours: string | null | undefined;
  durationMinutes: number;
  leadTimeHours?: number | null;
  incrementMinutes?: number | null;
  availableDayIndexes?: Set<number> | null;
  openTime?: string | null;
  closeTime?: string | null;
  dailyHours?: BookingDailyHoursEntry[] | null;
  timezone?: string | null;
  now?: Date;
}): Date[] {
  const parsedHours = parseOperatingHours(params.operatingHours);
  const timezone = params.timezone?.trim() || null;
  const date = timezone ? startOfDayInTimeZone(params.date, timezone) : new Date(params.date);
  if (!timezone) {
    date.setHours(0, 0, 0, 0);
  }
  const dayOfWeek = timezone ? getDayOfWeekInTimeZone(date, timezone) : date.getDay();
  const dailyHours = normalizeBookingDailyHours(params.dailyHours);
  const dayHours = dailyHours.find((entry) => entry.dayIndex === dayOfWeek) ?? null;
  const dayIndexes = params.availableDayIndexes?.size
    ? params.availableDayIndexes
    : dailyHours.length > 0
      ? new Set(dailyHours.filter((entry) => entry.enabled).map((entry) => entry.dayIndex))
      : parsedHours.dayIndexes;
  if (!dayIndexes.has(dayOfWeek)) return [];
  if (dayHours && !dayHours.enabled) return [];
  const openMinutes =
    parseTimeToMinutes(params.openTime ?? "") ??
    parseTimeToMinutes(dayHours?.openTime ?? "") ??
    parsedHours.openMinutes;
  const closeMinutes =
    parseTimeToMinutes(params.closeTime ?? "") ??
    parseTimeToMinutes(dayHours?.closeTime ?? "") ??
    parsedHours.closeMinutes;
  if (closeMinutes <= openMinutes) return [];

  const durationMinutes = toBookingDurationMinutes(params.durationMinutes);
  const incrementMinutes = clampInteger(params.incrementMinutes ?? DEFAULT_SLOT_INCREMENT_MINUTES, 15, 120);
  const leadTimeHours = toBookingLeadTimeHours(params.leadTimeHours);
  const now = params.now ? new Date(params.now) : new Date();
  const earliestStart = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);
  const zonedDateParts = timezone ? getTimeZoneParts(date, timezone) : null;

  const slots: Date[] = [];
  const lastPossibleStart = closeMinutes - durationMinutes;
  for (let minutes = openMinutes; minutes <= lastPossibleStart; minutes += incrementMinutes) {
    const slot = timezone && zonedDateParts
      ? zonedDateTimeToUtc(
          timezone,
          zonedDateParts.year,
          zonedDateParts.month,
          zonedDateParts.day,
          Math.floor(minutes / 60),
          minutes % 60,
          0,
          0
        )
      : new Date(date);
    if (!timezone) {
      slot.setMinutes(minutes, 0, 0);
    }
    if (slot.getTime() < earliestStart.getTime()) continue;
    slots.push(slot);
  }
  return slots;
}
