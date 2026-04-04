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
    currency: source?.currency ?? DEFAULT_BUSINESS_SETTINGS_FORM.currency,
    timezone: source?.timezone ?? DEFAULT_BUSINESS_SETTINGS_FORM.timezone,
  };

  return {
    formData: next,
    appointmentBufferInput: String(next.appointmentBufferMinutes),
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
