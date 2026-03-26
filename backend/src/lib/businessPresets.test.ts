import { describe, expect, it } from "vitest";
import { getPresetSummaryForBusinessType } from "./businessPresets.js";
import { getBusinessTypeDefaults } from "./businessTypeDefaults.js";

const EXPECTED_CATEGORY_SNAPSHOTS = [
  {
    value: "auto_detailing",
    starterCount: 26,
    defaultStaffCount: 1,
    operatingHours: "Mon-Sat 08:00-18:00",
    appointmentBufferMinutes: 15,
    defaultTaxRate: 0,
  },
  {
    value: "mobile_detailing",
    starterCount: 25,
    defaultStaffCount: 1,
    operatingHours: "Mon-Sat 08:00-17:00",
    appointmentBufferMinutes: 20,
    defaultTaxRate: 0,
  },
  {
    value: "wrap_ppf",
    starterCount: 26,
    defaultStaffCount: 2,
    operatingHours: "Mon-Fri 09:00-18:00",
    appointmentBufferMinutes: 30,
    defaultTaxRate: 0,
  },
  {
    value: "window_tinting",
    starterCount: 26,
    defaultStaffCount: 2,
    operatingHours: "Mon-Sat 09:00-18:00",
    appointmentBufferMinutes: 20,
    defaultTaxRate: 0,
  },
  {
    value: "performance",
    starterCount: 26,
    defaultStaffCount: 2,
    operatingHours: "Mon-Fri 09:00-18:00",
    appointmentBufferMinutes: 30,
    defaultTaxRate: 0,
  },
  {
    value: "mechanic",
    starterCount: 26,
    defaultStaffCount: 2,
    operatingHours: "Mon-Fri 08:00-17:00",
    appointmentBufferMinutes: 15,
    defaultTaxRate: 0,
  },
  {
    value: "tire_shop",
    starterCount: 25,
    defaultStaffCount: 2,
    operatingHours: "Mon-Sat 08:00-17:00",
    appointmentBufferMinutes: 10,
    defaultTaxRate: 0,
  },
  {
    value: "muffler_shop",
    starterCount: 25,
    defaultStaffCount: 2,
    operatingHours: "Mon-Fri 09:00-17:00",
    appointmentBufferMinutes: 20,
    defaultTaxRate: 0,
  },
] as const;

describe("business preset smoke coverage", () => {
  it("returns a real starter-service catalog for every supported shop category", () => {
    const supportedTypes = EXPECTED_CATEGORY_SNAPSHOTS.map((item) => item.value);
    expect(new Set(supportedTypes).size).toBe(EXPECTED_CATEGORY_SNAPSHOTS.length);

    for (const snapshot of EXPECTED_CATEGORY_SNAPSHOTS) {
      const summary = getPresetSummaryForBusinessType(snapshot.value);

      expect(summary.group).toBe(snapshot.value);
      expect(summary.count).toBe(snapshot.starterCount);
      expect(summary.names.length).toBeGreaterThan(0);
      expect(summary.names.every((name) => name.trim().length > 0)).toBe(true);
    }
  });

  it("returns operational defaults for every supported category", () => {
    for (const snapshot of EXPECTED_CATEGORY_SNAPSHOTS) {
      const defaults = getBusinessTypeDefaults(snapshot.value);

      expect(defaults.defaultStaffCount).toBe(snapshot.defaultStaffCount);
      expect(defaults.operatingHours).toBe(snapshot.operatingHours);
      expect(defaults.appointmentBufferMinutes).toBe(snapshot.appointmentBufferMinutes);
      expect(defaults.defaultTaxRate).toBe(snapshot.defaultTaxRate);
      expect(defaults.currency).toBe("USD");
      expect(defaults.timezone).toBe("America/Los_Angeles");
    }
  });
});
