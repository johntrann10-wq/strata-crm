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
  currency: string;
  appointmentBufferMinutes: number;
  calendarBlockCapacityPerSlot: number;
  timezone: string;
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
  currency: "USD",
  appointmentBufferMinutes: 15,
  calendarBlockCapacityPerSlot: 1,
  timezone: "America/New_York",
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
    appointmentBufferMinutes:
      source?.appointmentBufferMinutes ?? DEFAULT_BUSINESS_SETTINGS_FORM.appointmentBufferMinutes,
    calendarBlockCapacityPerSlot:
      source?.calendarBlockCapacityPerSlot ?? DEFAULT_BUSINESS_SETTINGS_FORM.calendarBlockCapacityPerSlot,
    currency: source?.currency ?? DEFAULT_BUSINESS_SETTINGS_FORM.currency,
    timezone: source?.timezone ?? DEFAULT_BUSINESS_SETTINGS_FORM.timezone,
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
