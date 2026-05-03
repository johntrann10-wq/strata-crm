export interface BusinessSettingsFormData {
  name: string;
  type: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  defaultTaxRate: number;
  defaultAdminFee: number;
  defaultAdminFeeEnabled: boolean;
  defaultAppointmentStartTime: string;
  currency: string;
  appointmentBufferMinutes: number;
  calendarBlockCapacityPerSlot: number;
  timezone: string;
  bookingAvailableDays: number[];
  bookingAvailableStartTime: string;
  bookingAvailableEndTime: string;
  bookingDailyHours: BookingDailyHoursEntry[];
  bookingBlackoutDatesText: string;
  bookingClosedOnUsHolidays: boolean;
}

export type BookingDailyHoursEntry = {
  dayIndex: number;
  enabled: boolean;
  openTime: string;
  closeTime: string;
};

const DEFAULT_BOOKING_DAY_INDEXES = [1, 2, 3, 4, 5];
const DEFAULT_BOOKING_OPEN_TIME = "09:00";
const DEFAULT_BOOKING_CLOSE_TIME = "19:00";

function normalizeBookingDailyHours(
  value: unknown,
  fallbackDays = DEFAULT_BOOKING_DAY_INDEXES,
  fallbackOpen = DEFAULT_BOOKING_OPEN_TIME,
  fallbackClose = DEFAULT_BOOKING_CLOSE_TIME
): BookingDailyHoursEntry[] {
  const source = Array.isArray(value) ? value : [];
  const byDay = new Map<number, BookingDailyHoursEntry>();
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const entry = item as { dayIndex?: unknown; enabled?: unknown; openTime?: unknown; closeTime?: unknown };
    const dayIndex = Number(entry.dayIndex);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) continue;
    const openTime = typeof entry.openTime === "string" && entry.openTime ? entry.openTime : fallbackOpen;
    const closeTime = typeof entry.closeTime === "string" && entry.closeTime ? entry.closeTime : fallbackClose;
    byDay.set(dayIndex, {
      dayIndex,
      enabled: entry.enabled === false ? false : true,
      openTime,
      closeTime,
    });
  }
  for (const dayIndex of [1, 2, 3, 4, 5, 6, 0]) {
    if (!byDay.has(dayIndex)) {
      byDay.set(dayIndex, {
        dayIndex,
        enabled: fallbackDays.includes(dayIndex),
        openTime: fallbackOpen,
        closeTime: fallbackClose,
      });
    }
  }
  return [1, 2, 3, 4, 5, 6, 0].map((dayIndex) => byDay.get(dayIndex)!);
}

export const DEFAULT_BUSINESS_SETTINGS_FORM: BusinessSettingsFormData = {
  name: "",
  type: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  defaultTaxRate: 0,
  defaultAdminFee: 0,
  defaultAdminFeeEnabled: false,
  defaultAppointmentStartTime: "09:00",
  currency: "USD",
  appointmentBufferMinutes: 15,
  calendarBlockCapacityPerSlot: 1,
  timezone: "America/New_York",
  bookingAvailableDays: DEFAULT_BOOKING_DAY_INDEXES,
  bookingAvailableStartTime: DEFAULT_BOOKING_OPEN_TIME,
  bookingAvailableEndTime: DEFAULT_BOOKING_CLOSE_TIME,
  bookingDailyHours: normalizeBookingDailyHours([]),
  bookingBlackoutDatesText: "",
  bookingClosedOnUsHolidays: false,
};

type BusinessSettingsSource = Partial<BusinessSettingsFormData> | null | undefined;

export function businessSettingsFormFromSource(source: BusinessSettingsSource) {
  const next = {
    ...DEFAULT_BUSINESS_SETTINGS_FORM,
    ...source,
    defaultTaxRate: source?.defaultTaxRate ?? DEFAULT_BUSINESS_SETTINGS_FORM.defaultTaxRate,
    defaultAdminFee: source?.defaultAdminFee ?? DEFAULT_BUSINESS_SETTINGS_FORM.defaultAdminFee,
    defaultAdminFeeEnabled:
      source?.defaultAdminFeeEnabled ?? DEFAULT_BUSINESS_SETTINGS_FORM.defaultAdminFeeEnabled,
    defaultAppointmentStartTime:
      source?.defaultAppointmentStartTime ?? DEFAULT_BUSINESS_SETTINGS_FORM.defaultAppointmentStartTime,
    appointmentBufferMinutes:
      source?.appointmentBufferMinutes ?? DEFAULT_BUSINESS_SETTINGS_FORM.appointmentBufferMinutes,
    calendarBlockCapacityPerSlot:
      source?.calendarBlockCapacityPerSlot ?? DEFAULT_BUSINESS_SETTINGS_FORM.calendarBlockCapacityPerSlot,
    currency: source?.currency ?? DEFAULT_BUSINESS_SETTINGS_FORM.currency,
    timezone: source?.timezone ?? DEFAULT_BUSINESS_SETTINGS_FORM.timezone,
    bookingAvailableDays:
      Array.isArray(source?.bookingAvailableDays) && source.bookingAvailableDays.length > 0
        ? [...new Set(source.bookingAvailableDays)]
        : DEFAULT_BUSINESS_SETTINGS_FORM.bookingAvailableDays,
    bookingAvailableStartTime:
      source?.bookingAvailableStartTime ?? DEFAULT_BUSINESS_SETTINGS_FORM.bookingAvailableStartTime,
    bookingAvailableEndTime:
      source?.bookingAvailableEndTime ?? DEFAULT_BUSINESS_SETTINGS_FORM.bookingAvailableEndTime,
    bookingDailyHours: normalizeBookingDailyHours(
      (source as { bookingDailyHours?: unknown })?.bookingDailyHours,
      Array.isArray(source?.bookingAvailableDays) && source.bookingAvailableDays.length > 0
        ? [...new Set(source.bookingAvailableDays)]
        : DEFAULT_BUSINESS_SETTINGS_FORM.bookingAvailableDays,
      source?.bookingAvailableStartTime ?? DEFAULT_BUSINESS_SETTINGS_FORM.bookingAvailableStartTime,
      source?.bookingAvailableEndTime ?? DEFAULT_BUSINESS_SETTINGS_FORM.bookingAvailableEndTime
    ),
    bookingBlackoutDatesText: Array.isArray((source as { bookingBlackoutDates?: string[] | null })?.bookingBlackoutDates)
      ? ((source as { bookingBlackoutDates?: string[] | null }).bookingBlackoutDates ?? []).join("\n")
      : "",
    bookingClosedOnUsHolidays: Boolean((source as { bookingClosedOnUsHolidays?: boolean | null })?.bookingClosedOnUsHolidays),
  };

  return {
    formData: next,
    defaultTaxRateInput: formatDecimalInput(next.defaultTaxRate),
    defaultAdminFeeInput: formatDecimalInput(next.defaultAdminFee),
    appointmentBufferInput: String(next.appointmentBufferMinutes),
    calendarBlockCapacityInput: String(next.calendarBlockCapacityPerSlot),
  };
}

function formatDecimalInput(value: number | string | null | undefined) {
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(numericValue)) return "0";
  return numericValue === 0 ? "0" : String(numericValue);
}

export function parseDecimalDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function normalizeDecimalInput(value: string) {
  const parsed = parseDecimalDraft(value);
  const numericValue = parsed ?? 0;
  return {
    inputValue: formatDecimalInput(numericValue),
    numericValue,
  };
}

export function parseAppointmentBufferDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function normalizeAppointmentBuffer(value: string) {
  const parsed = parseAppointmentBufferDraft(value);
  const numericValue = parsed ?? 0;
  return {
    inputValue: String(numericValue),
    numericValue,
  };
}
