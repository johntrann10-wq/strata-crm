import { describe, expect, it } from "vitest";
import { isWithinAutomationWindow } from "./automations.js";

describe("automation send window helpers", () => {
  it("allows sends inside a standard daytime window", () => {
    expect(
      isWithinAutomationWindow(new Date("2026-04-04T17:00:00.000Z"), "America/Los_Angeles", 8, 18)
    ).toBe(true);
  });

  it("blocks sends outside a standard daytime window", () => {
    expect(
      isWithinAutomationWindow(new Date("2026-04-05T03:00:00.000Z"), "America/Los_Angeles", 8, 18)
    ).toBe(false);
  });

  it("supports overnight send windows", () => {
    expect(
      isWithinAutomationWindow(new Date("2026-04-05T07:00:00.000Z"), "America/Los_Angeles", 20, 6)
    ).toBe(true);
    expect(
      isWithinAutomationWindow(new Date("2026-04-05T20:00:00.000Z"), "America/Los_Angeles", 20, 6)
    ).toBe(false);
  });

  it("treats identical start and end hours as closed", () => {
    expect(
      isWithinAutomationWindow(new Date("2026-04-04T17:00:00.000Z"), "America/Los_Angeles", 8, 8)
    ).toBe(false);
  });
});
