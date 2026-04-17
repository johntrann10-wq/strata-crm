import { describe, expect, it } from "vitest";
import {
  expireBookingRequestAlternateSlotOptions,
  hasLiveAlternateSlotOptions,
  normalizeBookingRequestCustomerResponseStatus,
  normalizeBookingRequestFlexibility,
  normalizeBookingRequestOwnerReviewStatus,
  normalizeBookingRequestStatus,
  parseBookingRequestAlternateSlotOptions,
  serializeBookingRequestAlternateSlotOptions,
} from "./bookingRequests.js";

describe("bookingRequests helpers", () => {
  it("normalizes unknown lifecycle values to safe defaults", () => {
    expect(normalizeBookingRequestStatus("not-real")).toBe("submitted_request");
    expect(normalizeBookingRequestFlexibility("wrong")).toBe("same_day_flexible");
    expect(normalizeBookingRequestOwnerReviewStatus("wrong")).toBe("pending");
    expect(normalizeBookingRequestCustomerResponseStatus("wrong")).toBe("pending");
  });

  it("round-trips alternate slot options safely", () => {
    const serialized = serializeBookingRequestAlternateSlotOptions([
      {
        id: "slot-1",
        startTime: "2026-04-18T17:00:00.000Z",
        endTime: "2026-04-18T19:00:00.000Z",
        label: "Fri, Apr 18 - 10:00 AM",
        expiresAt: "2026-04-19T17:00:00.000Z",
        status: "proposed",
      },
    ]);

    expect(parseBookingRequestAlternateSlotOptions(serialized)).toEqual([
      {
        id: "slot-1",
        startTime: "2026-04-18T17:00:00.000Z",
        endTime: "2026-04-18T19:00:00.000Z",
        label: "Fri, Apr 18 - 10:00 AM",
        expiresAt: "2026-04-19T17:00:00.000Z",
        status: "proposed",
      },
    ]);
  });

  it("marks expired alternate slots and reports when no live options remain", () => {
    const expired = expireBookingRequestAlternateSlotOptions(
      [
        {
          id: "slot-1",
          startTime: "2026-04-18T17:00:00.000Z",
          endTime: "2026-04-18T19:00:00.000Z",
          label: "Fri, Apr 18 - 10:00 AM",
          expiresAt: "2026-04-18T18:00:00.000Z",
          status: "proposed",
        },
      ],
      new Date("2026-04-18T18:30:00.000Z")
    );

    expect(expired[0]?.status).toBe("expired");
    expect(hasLiveAlternateSlotOptions(expired, new Date("2026-04-18T18:30:00.000Z"))).toBe(false);
  });
});
