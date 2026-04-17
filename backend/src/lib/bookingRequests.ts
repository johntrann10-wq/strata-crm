export const bookingRequestStatuses = [
  "submitted_request",
  "under_review",
  "approved_requested_slot",
  "awaiting_customer_selection",
  "confirmed",
  "declined",
  "customer_requested_new_time",
  "expired",
] as const;

export const bookingRequestFlexibilityValues = [
  "exact_time_only",
  "same_day_flexible",
  "any_nearby_slot",
] as const;

export const bookingRequestOwnerReviewStatuses = [
  "pending",
  "approved_requested_slot",
  "proposed_alternates",
  "requested_new_time",
  "declined",
] as const;

export const bookingRequestCustomerResponseStatuses = [
  "pending",
  "accepted_requested_slot",
  "accepted_alternate_slot",
  "requested_new_time",
  "declined",
  "expired",
] as const;

export const bookingRequestAlternateSlotStatuses = [
  "proposed",
  "accepted",
  "rejected",
  "expired",
] as const;

export type BookingRequestStatus = (typeof bookingRequestStatuses)[number];
export type BookingRequestFlexibility = (typeof bookingRequestFlexibilityValues)[number];
export type BookingRequestOwnerReviewStatus = (typeof bookingRequestOwnerReviewStatuses)[number];
export type BookingRequestCustomerResponseStatus = (typeof bookingRequestCustomerResponseStatuses)[number];
export type BookingRequestAlternateSlotStatus = (typeof bookingRequestAlternateSlotStatuses)[number];

export type BookingRequestAlternateSlot = {
  id: string;
  startTime: string;
  endTime: string | null;
  label: string;
  expiresAt: string | null;
  status: BookingRequestAlternateSlotStatus;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isAlternateSlotStatus(value: string): value is BookingRequestAlternateSlotStatus {
  return (bookingRequestAlternateSlotStatuses as readonly string[]).includes(value);
}

export function normalizeBookingRequestFlexibility(value: string | null | undefined): BookingRequestFlexibility {
  const normalized = cleanText(value);
  return (bookingRequestFlexibilityValues as readonly string[]).includes(normalized)
    ? (normalized as BookingRequestFlexibility)
    : "same_day_flexible";
}

export function normalizeBookingRequestStatus(value: string | null | undefined): BookingRequestStatus {
  const normalized = cleanText(value);
  return (bookingRequestStatuses as readonly string[]).includes(normalized)
    ? (normalized as BookingRequestStatus)
    : "submitted_request";
}

export function normalizeBookingRequestOwnerReviewStatus(
  value: string | null | undefined
): BookingRequestOwnerReviewStatus {
  const normalized = cleanText(value);
  return (bookingRequestOwnerReviewStatuses as readonly string[]).includes(normalized)
    ? (normalized as BookingRequestOwnerReviewStatus)
    : "pending";
}

export function normalizeBookingRequestCustomerResponseStatus(
  value: string | null | undefined
): BookingRequestCustomerResponseStatus {
  const normalized = cleanText(value);
  return (bookingRequestCustomerResponseStatuses as readonly string[]).includes(normalized)
    ? (normalized as BookingRequestCustomerResponseStatus)
    : "pending";
}

export function parseBookingRequestAlternateSlotOptions(
  raw: string | null | undefined
): BookingRequestAlternateSlot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!isRecord(item)) return null;
        const id = cleanText(item.id);
        const startTime = cleanText(item.startTime);
        const label = cleanText(item.label);
        if (!id || !startTime || !label) return null;
        const endTime = cleanText(item.endTime) || null;
        const expiresAt = cleanText(item.expiresAt) || null;
        const status = cleanText(item.status);
        return {
          id,
          startTime,
          endTime,
          label,
          expiresAt,
          status: isAlternateSlotStatus(status) ? status : "proposed",
        } satisfies BookingRequestAlternateSlot;
      })
      .filter((item): item is BookingRequestAlternateSlot => Boolean(item));
  } catch {
    return [];
  }
}

export function serializeBookingRequestAlternateSlotOptions(options: BookingRequestAlternateSlot[]): string {
  return JSON.stringify(
    options.map((option) => ({
      id: option.id,
      startTime: option.startTime,
      endTime: option.endTime,
      label: option.label,
      expiresAt: option.expiresAt,
      status: option.status,
    }))
  );
}

export function expireBookingRequestAlternateSlotOptions(
  options: BookingRequestAlternateSlot[],
  now: Date = new Date()
): BookingRequestAlternateSlot[] {
  const nowMs = now.getTime();
  return options.map((option) => {
    if (option.status !== "proposed" || !option.expiresAt) return option;
    const expiresAtMs = Date.parse(option.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs > nowMs) return option;
    return {
      ...option,
      status: "expired",
    };
  });
}

export function hasLiveAlternateSlotOptions(
  options: BookingRequestAlternateSlot[],
  now: Date = new Date()
): boolean {
  return expireBookingRequestAlternateSlotOptions(options, now).some((option) => option.status === "proposed");
}
