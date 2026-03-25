export type BusinessTypeDefaults = {
  defaultStaffCount: number;
  operatingHours: string;
  appointmentBufferMinutes: number;
  defaultTaxRate: number;
  currency: string;
  timezone: string;
};

const DEFAULTS: Record<string, BusinessTypeDefaults> = {
  auto_detailing: {
    defaultStaffCount: 1,
    operatingHours: "Mon-Sat 08:00-18:00",
    appointmentBufferMinutes: 15,
    defaultTaxRate: 0,
    currency: "USD",
    timezone: "America/Los_Angeles",
  },
  mobile_detailing: {
    defaultStaffCount: 1,
    operatingHours: "Mon-Sat 08:00-17:00",
    appointmentBufferMinutes: 20,
    defaultTaxRate: 0,
    currency: "USD",
    timezone: "America/Los_Angeles",
  },
  wrap_ppf: {
    defaultStaffCount: 2,
    operatingHours: "Mon-Fri 09:00-18:00",
    appointmentBufferMinutes: 30,
    defaultTaxRate: 0,
    currency: "USD",
    timezone: "America/Los_Angeles",
  },
  window_tinting: {
    defaultStaffCount: 2,
    operatingHours: "Mon-Sat 09:00-18:00",
    appointmentBufferMinutes: 20,
    defaultTaxRate: 0,
    currency: "USD",
    timezone: "America/Los_Angeles",
  },
  performance: {
    defaultStaffCount: 2,
    operatingHours: "Mon-Fri 09:00-18:00",
    appointmentBufferMinutes: 30,
    defaultTaxRate: 0,
    currency: "USD",
    timezone: "America/Los_Angeles",
  },
  mechanic: {
    defaultStaffCount: 2,
    operatingHours: "Mon-Fri 08:00-17:00",
    appointmentBufferMinutes: 15,
    defaultTaxRate: 0,
    currency: "USD",
    timezone: "America/Los_Angeles",
  },
  tire_shop: {
    defaultStaffCount: 2,
    operatingHours: "Mon-Sat 08:00-17:00",
    appointmentBufferMinutes: 10,
    defaultTaxRate: 0,
    currency: "USD",
    timezone: "America/Los_Angeles",
  },
  muffler_shop: {
    defaultStaffCount: 2,
    operatingHours: "Mon-Fri 09:00-17:00",
    appointmentBufferMinutes: 20,
    defaultTaxRate: 0,
    currency: "USD",
    timezone: "America/Los_Angeles",
  },
};

export function getBusinessTypeDefaults(type: string | null | undefined): BusinessTypeDefaults {
  return DEFAULTS[type ?? ""] ?? DEFAULTS.mechanic;
}
