import { describe, expect, it } from "vitest";
import { resolveAppointmentServiceUnitPrice } from "./appointment-services.js";

describe("appointment service route logic", () => {
  it("uses the explicit appointment service price when present", () => {
    expect(resolveAppointmentServiceUnitPrice("125", "200")).toBe("125.00");
    expect(resolveAppointmentServiceUnitPrice(0, "200")).toBe("0.00");
  });

  it("falls back to the catalog service price for legacy null appointment service prices", () => {
    expect(resolveAppointmentServiceUnitPrice(null, "85")).toBe("85.00");
    expect(resolveAppointmentServiceUnitPrice(undefined, 45.5)).toBe("45.50");
  });

  it("returns null when neither appointment nor catalog price is usable", () => {
    expect(resolveAppointmentServiceUnitPrice(null, null)).toBeNull();
    expect(resolveAppointmentServiceUnitPrice("", "")).toBeNull();
  });
});
