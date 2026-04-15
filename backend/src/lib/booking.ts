const FALLBACK_OPEN_MINUTES = 9 * 60;
const FALLBACK_CLOSE_MINUTES = 17 * 60;
const DEFAULT_SLOT_INCREMENT_MINUTES = 15;

export type BookingDefaultFlow = "request" | "self_book";
export type BookingFlowType = "inherit" | "request" | "self_book";
export type BookingServiceMode = "in_shop" | "mobile" | "both";

export type ParsedOperatingHours = {
  dayIndexes: Set<number>;
  openMinutes: number;
  closeMinutes: number;
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

export function buildSlotsForDate(params: {
  date: Date;
  operatingHours: string | null | undefined;
  durationMinutes: number;
  leadTimeHours?: number | null;
  incrementMinutes?: number | null;
  availableDayIndexes?: Set<number> | null;
  openTime?: string | null;
  closeTime?: string | null;
  now?: Date;
}): Date[] {
  const parsedHours = parseOperatingHours(params.operatingHours);
  const hours = {
    dayIndexes: params.availableDayIndexes?.size ? params.availableDayIndexes : parsedHours.dayIndexes,
    openMinutes: parseTimeToMinutes(params.openTime ?? "") ?? parsedHours.openMinutes,
    closeMinutes: parseTimeToMinutes(params.closeTime ?? "") ?? parsedHours.closeMinutes,
  };
  const date = new Date(params.date);
  date.setHours(0, 0, 0, 0);
  if (!hours.dayIndexes.has(date.getDay())) return [];

  const durationMinutes = toBookingDurationMinutes(params.durationMinutes);
  const incrementMinutes = clampInteger(params.incrementMinutes ?? DEFAULT_SLOT_INCREMENT_MINUTES, 15, 120);
  const leadTimeHours = toBookingLeadTimeHours(params.leadTimeHours);
  const now = params.now ? new Date(params.now) : new Date();
  const earliestStart = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);

  const slots: Date[] = [];
  const lastPossibleStart = hours.closeMinutes - durationMinutes;
  for (let minutes = hours.openMinutes; minutes <= lastPossibleStart; minutes += incrementMinutes) {
    const slot = new Date(date);
    slot.setMinutes(minutes, 0, 0);
    if (slot.getTime() < earliestStart.getTime()) continue;
    slots.push(slot);
  }
  return slots;
}
