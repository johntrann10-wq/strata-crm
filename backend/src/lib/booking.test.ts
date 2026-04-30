import { describe, expect, it } from "vitest";
import {
  buildSlotsForDate,
  isUsHolidayDateKey,
  normalizeBookingDefaultFlow,
  normalizeBookingDayIndexes,
  normalizeBookingFlowType,
  normalizeBookingServiceMode,
  parseTimeToMinutes,
  parseOperatingHours,
  resolveCustomerBookingMode,
  resolveBookingFlow,
  toBookingBufferMinutes,
} from "./booking.js";

describe("booking helpers", () => {
  it("parses simple operating hours strings", () => {
    const parsed = parseOperatingHours("Mon-Sat 08:00-18:00");
    expect([...parsed.dayIndexes]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parsed.openMinutes).toBe(480);
    expect(parsed.closeMinutes).toBe(1080);
  });

  it("falls back safely when hours are missing", () => {
    const parsed = parseOperatingHours(null);
    expect(parsed.dayIndexes.has(1)).toBe(true);
    expect(parsed.openMinutes).toBe(540);
    expect(parsed.closeMinutes).toBe(1020);
  });

  it("resolves service booking flow over the business default", () => {
    expect(resolveBookingFlow({ businessDefaultFlow: "request", serviceFlowType: "self_book" })).toBe("self_book");
    expect(resolveBookingFlow({ businessDefaultFlow: "self_book", serviceFlowType: "request" })).toBe("request");
    expect(resolveBookingFlow({ businessDefaultFlow: "self_book", serviceFlowType: "inherit" })).toBe("self_book");
  });

  it("normalizes unknown flow values to safe defaults", () => {
    expect(normalizeBookingDefaultFlow("weird")).toBe("request");
    expect(normalizeBookingFlowType("weird")).toBe("inherit");
  });

  it("normalizes service modes and resolves the customer-facing mode safely", () => {
    expect(normalizeBookingServiceMode("weird")).toBe("in_shop");
    expect(resolveCustomerBookingMode({ serviceMode: "mobile", requestedMode: "in_shop" })).toBe("mobile");
    expect(resolveCustomerBookingMode({ serviceMode: "both", requestedMode: "mobile" })).toBe("mobile");
    expect(resolveCustomerBookingMode({ serviceMode: "both", requestedMode: "weird" })).toBe("in_shop");
  });

  it("builds slots only inside the working window and lead time", () => {
    const date = new Date(2026, 3, 20, 0, 0, 0, 0);
    const now = new Date(2026, 3, 20, 10, 0, 0, 0);
    const slots = buildSlotsForDate({
      date,
      operatingHours: "Mon-Fri 08:00-17:00",
      durationMinutes: 60,
      leadTimeHours: 2,
      now,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]!.getTime()).toBeGreaterThanOrEqual(now.getTime() + 2 * 60 * 60 * 1000);
  });

  it("supports booking-specific day and time overrides", () => {
    const monday = new Date(2026, 3, 20, 0, 0, 0, 0);
    const saturday = new Date(2026, 3, 25, 0, 0, 0, 0);
    const allowedDays = normalizeBookingDayIndexes([1, 2, 3, 4, 5]);
    const mondaySlots = buildSlotsForDate({
      date: monday,
      operatingHours: "Sun-Sat 08:00-18:00",
      durationMinutes: 60,
      availableDayIndexes: allowedDays,
      openTime: "10:00",
      closeTime: "14:00",
      incrementMinutes: 30,
      now: new Date(2026, 3, 19, 8, 0, 0, 0),
    });
    const saturdaySlots = buildSlotsForDate({
      date: saturday,
      operatingHours: "Sun-Sat 08:00-18:00",
      durationMinutes: 60,
      availableDayIndexes: allowedDays,
      openTime: "10:00",
      closeTime: "14:00",
      incrementMinutes: 30,
      now: new Date(2026, 3, 19, 8, 0, 0, 0),
    });

    expect(mondaySlots[0]?.getHours()).toBe(10);
    expect(mondaySlots.at(-1)?.getHours()).toBe(13);
    expect(saturdaySlots).toHaveLength(0);
  });

  it("builds slots in the requested business timezone instead of the server timezone", () => {
    const slots = buildSlotsForDate({
      date: new Date("2026-04-20T07:00:00.000Z"),
      operatingHours: "Mon-Fri 09:00-19:00",
      durationMinutes: 60,
      timezone: "America/Los_Angeles",
      now: new Date("2026-04-19T12:00:00.000Z"),
    });

    expect(slots[0]?.toISOString()).toBe("2026-04-20T16:00:00.000Z");
  });

  it("parses valid time strings and rejects invalid ones", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(parseTimeToMinutes("25:00")).toBeNull();
  });

  it("clamps booking buffer minutes to a safe range", () => {
    expect(toBookingBufferMinutes(-10)).toBe(0);
    expect(toBookingBufferMinutes(25)).toBe(25);
    expect(toBookingBufferMinutes(999)).toBe(240);
  });

  it("recognizes U.S. holidays and observed closure dates", () => {
    expect(isUsHolidayDateKey("2026-07-04")).toBe(true);
    expect(isUsHolidayDateKey("2026-07-03")).toBe(true);
    expect(isUsHolidayDateKey("2021-12-31")).toBe(true);
    expect(isUsHolidayDateKey("2026-11-26")).toBe(true);
    expect(isUsHolidayDateKey("2026-11-27")).toBe(false);
  });
});
