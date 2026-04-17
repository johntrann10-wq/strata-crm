export const DEFAULT_BOOKING_REQUEST_REQUIRE_EXACT_TIME = false;
export const DEFAULT_BOOKING_REQUEST_ALLOW_TIME_WINDOWS = true;
export const DEFAULT_BOOKING_REQUEST_ALLOW_FLEXIBILITY = true;
export const DEFAULT_BOOKING_REQUEST_ALLOW_ALTERNATE_SLOTS = true;
export const DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT = 3;
export const MAX_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT = 3;
export const DEFAULT_BOOKING_REQUEST_ALTERNATE_OFFER_EXPIRY_HOURS = 48;

function clampInteger(value: number | null | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

export function normalizeBookingRequestRequireExactTime(value: boolean | null | undefined): boolean {
  return value === true;
}

export function normalizeBookingRequestAllowTimeWindows(value: boolean | null | undefined): boolean {
  return value ?? DEFAULT_BOOKING_REQUEST_ALLOW_TIME_WINDOWS;
}

export function normalizeBookingRequestAllowFlexibility(value: boolean | null | undefined): boolean {
  return value ?? DEFAULT_BOOKING_REQUEST_ALLOW_FLEXIBILITY;
}

export function normalizeBookingRequestAllowAlternateSlots(value: boolean | null | undefined): boolean {
  return value ?? DEFAULT_BOOKING_REQUEST_ALLOW_ALTERNATE_SLOTS;
}

export function normalizeBookingRequestAlternateSlotLimit(value: number | null | undefined): number {
  return clampInteger(
    value,
    1,
    MAX_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT,
    DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT
  );
}

export function normalizeBookingRequestAlternateOfferExpiryHours(value: number | null | undefined): number | null {
  if (value == null) return null;
  return clampInteger(value, 1, 168, DEFAULT_BOOKING_REQUEST_ALTERNATE_OFFER_EXPIRY_HOURS);
}
