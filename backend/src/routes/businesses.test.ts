import { describe, expect, it } from "vitest";

describe("business route serialization", () => {
  it("never returns the outbound webhook signing secret in API payloads", async () => {
    const { serializeBusiness } = await import("./businesses.js");
    const record = {
      id: "biz_123",
      ownerId: "user_123",
      name: "Coastline Detail Co.",
      type: "auto_detailing",
      integrationWebhookSecret: "super-secret-value",
      integrationWebhookEvents: "[\"lead.created\"]",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    } as Parameters<typeof serializeBusiness>[0];
    const serialized = serializeBusiness(record);

    expect(serialized).not.toHaveProperty("integrationWebhookSecret");
    expect(serialized.integrationWebhookEvents).toEqual(["lead.created"]);
  });

  it("builds a narrow public booking config payload without internal business fields", async () => {
    const { buildPublicBookingConfigResponse } = await import("./businesses.js");
    const payload = buildPublicBookingConfigResponse({
      business: {
        id: "biz_123",
        name: "Coastline Detail Co.",
        type: "auto_detailing",
        timezone: "America/Los_Angeles",
        bookingDefaultFlow: "self_book",
        bookingPageTitle: "Tell us what you need",
        bookingPageSubtitle: "Share a few details and the shop can follow up with the right next step.",
        bookingConfirmationMessage: "You're booked.",
        bookingTrustBulletPrimary: "Goes directly to the shop",
        bookingTrustBulletSecondary: "Quick confirmation",
        bookingTrustBulletTertiary: "Secure and simple",
        bookingNotesPrompt: "Add timing, questions, or anything the shop should know.",
        bookingBrandLogoUrl: "https://cdn.example.com/logo.png",
        bookingBrandPrimaryColorToken: "sky",
        bookingBrandAccentColorToken: "blue",
        bookingBrandBackgroundToneToken: "mist",
        bookingBrandButtonStyleToken: "outline",
        bookingRequireEmail: false,
        bookingRequirePhone: true,
        bookingRequireVehicle: true,
        bookingAllowCustomerNotes: true,
        bookingShowPrices: true,
        bookingShowDurations: true,
        bookingUrgencyEnabled: true,
        bookingUrgencyText: "Only 3 spots left this week",
      },
      locations: [{ id: "loc_123", name: "Main Shop", address: "123 Main St" }],
      services: [
        {
          id: "svc_123",
          name: "Full Detail",
          categoryId: "cat_123",
          categoryLabel: "Detailing",
          description: "Interior and exterior refresh.",
          price: 275,
          durationMinutes: 180,
          effectiveFlow: "self_book",
          depositAmount: 50,
          leadTimeHours: 12,
          bookingWindowDays: 30,
          bufferMinutes: 20,
          serviceMode: "in_shop",
          featured: true,
          showPrice: true,
          showDuration: true,
          addons: [
            {
              id: "addon_123",
              name: "Engine bay",
              price: 35,
              durationMinutes: 30,
              depositAmount: 0,
              bufferMinutes: 0,
              description: "Optional add-on",
              featured: false,
              showPrice: true,
              showDuration: true,
            },
          ],
        },
      ],
    });

    expect(payload).toMatchObject({
      businessId: "biz_123",
      businessName: "Coastline Detail Co.",
      defaultFlow: "self_book",
      urgencyEnabled: true,
      urgencyText: "Only 3 spots left this week",
      branding: {
        logoUrl: "https://cdn.example.com/logo.png",
        primaryColorToken: "sky",
        accentColorToken: "blue",
        backgroundToneToken: "mist",
        buttonStyleToken: "outline",
      },
      locations: [{ id: "loc_123", name: "Main Shop", address: "123 Main St" }],
      services: [
        {
          id: "svc_123",
          name: "Full Detail",
          depositAmount: 50,
          leadTimeHours: 12,
          bookingWindowDays: 30,
          bufferMinutes: 20,
        },
      ],
    });
    expect(payload).not.toHaveProperty("ownerId");
    expect(payload).not.toHaveProperty("integrationWebhookSecret");
    expect(payload.services[0]).not.toHaveProperty("notes");
    expect(payload.services[0]).not.toHaveProperty("internalNotes");
    expect(payload.services[0].addons[0]).not.toHaveProperty("notes");
  });
});
