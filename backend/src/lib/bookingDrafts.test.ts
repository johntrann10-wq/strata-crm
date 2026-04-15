import { describe, expect, it } from "vitest";
import {
  buildBookingDraftComparableSignature,
  deriveBookingDraftStatus,
  hasMeaningfulBookingDraftIntent,
} from "./bookingDrafts.js";

describe("booking draft helpers", () => {
  it("requires a selected service and another meaningful signal before creating a server draft", () => {
    expect(hasMeaningfulBookingDraftIntent({ serviceId: "svc-1" })).toBe(false);
    expect(
      hasMeaningfulBookingDraftIntent({
        serviceId: "svc-1",
        vehicleMake: "BMW",
      })
    ).toBe(true);
    expect(
      hasMeaningfulBookingDraftIntent({
        serviceId: "svc-1",
        email: "jamie@example.com",
      })
    ).toBe(true);
  });

  it("derives lifecycle statuses from the available draft context", () => {
    expect(
      deriveBookingDraftStatus({
        serviceId: "svc-1",
        vehicleMake: "BMW",
      })
    ).toBe("anonymous_draft");

    expect(
      deriveBookingDraftStatus({
        serviceId: "svc-1",
        phone: "(555) 111-2222",
      })
    ).toBe("identified_lead");

    expect(
      deriveBookingDraftStatus({
        serviceId: "svc-1",
        email: "jamie@example.com",
        vehicleMake: "BMW",
        vehicleModel: "X5",
      })
    ).toBe("qualified_booking_intent");
  });

  it("builds stable signatures for equivalent draft payloads", () => {
    const left = buildBookingDraftComparableSignature({
      serviceId: " svc-1 ",
      email: "Jamie@Example.com ",
      addonServiceIds: ["addon-2", "addon-1", "addon-1"],
      currentStep: 2.8,
      marketingOptIn: undefined,
    });
    const right = buildBookingDraftComparableSignature({
      serviceId: "svc-1",
      email: "jamie@example.com",
      addonServiceIds: ["addon-1", "addon-2"],
      currentStep: 2,
      marketingOptIn: true,
    });

    expect(left).toBe(right);
  });
});
