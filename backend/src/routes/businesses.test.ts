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
        bookingRequestRequireExactTime: false,
        bookingRequestAllowTimeWindows: true,
        bookingRequestAllowFlexibility: true,
        bookingRequestAllowAlternateSlots: true,
        bookingRequestAlternateSlotLimit: 3,
        bookingRequestAlternateOfferExpiryHours: 48,
        bookingRequestConfirmationCopy: null,
        bookingRequestOwnerResponsePageCopy: null,
        bookingRequestAlternateAcceptanceCopy: null,
        bookingRequestChooseAnotherDayCopy: null,
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
        bookingAvailableDays: "[1,2,3,4,5]",
        bookingAvailableStartTime: "08:00",
        bookingAvailableEndTime: "17:00",
        operatingHours: "Mon-Fri 08:00-17:00",
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
          requestPolicy: {
            requireExactTime: false,
            allowTimeWindows: true,
            allowFlexibility: true,
            reviewMessage: null,
            allowAlternateSlots: true,
            alternateSlotLimit: 3,
            alternateOfferExpiryHours: 48,
          },
          availableDayIndexes: null,
          openTime: null,
          closeTime: null,
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
        logoUrl: "http://localhost:5173/api/businesses/biz_123/public-booking-brand-logo",
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

  it("preserves uploaded booking logo images in the public config payload", async () => {
    const { buildPublicBookingConfigResponse } = await import("./businesses.js");
    const uploadedLogo = "data:image/webp;base64,UklGRlIAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSAIAAAAA";
    const payload = buildPublicBookingConfigResponse({
      business: {
        id: "biz_456",
        name: "Northline Auto Spa",
        type: "auto_detailing",
        timezone: "America/Los_Angeles",
        bookingDefaultFlow: "request",
        bookingPageTitle: "Request service",
        bookingPageSubtitle: "Tell us about the vehicle and we'll follow up fast.",
        bookingConfirmationMessage: "We'll be in touch shortly.",
        bookingRequestRequireExactTime: false,
        bookingRequestAllowTimeWindows: true,
        bookingRequestAllowFlexibility: true,
        bookingRequestAllowAlternateSlots: true,
        bookingRequestAlternateSlotLimit: 3,
        bookingRequestAlternateOfferExpiryHours: 48,
        bookingRequestConfirmationCopy: null,
        bookingRequestOwnerResponsePageCopy: null,
        bookingRequestAlternateAcceptanceCopy: null,
        bookingRequestChooseAnotherDayCopy: null,
        bookingTrustBulletPrimary: "Fast follow-up",
        bookingTrustBulletSecondary: "Real shop team",
        bookingTrustBulletTertiary: "Secure request",
        bookingNotesPrompt: "Anything else we should know?",
        bookingBrandLogoUrl: uploadedLogo,
        bookingBrandPrimaryColorToken: "orange",
        bookingBrandAccentColorToken: "amber",
        bookingBrandBackgroundToneToken: "ivory",
        bookingBrandButtonStyleToken: "solid",
        bookingRequireEmail: false,
        bookingRequirePhone: false,
        bookingRequireVehicle: true,
        bookingAllowCustomerNotes: true,
        bookingShowPrices: true,
        bookingShowDurations: true,
        bookingUrgencyEnabled: false,
        bookingUrgencyText: null,
        bookingAvailableDays: "[1,2,3,4,5]",
        bookingAvailableStartTime: "09:00",
        bookingAvailableEndTime: "19:00",
        operatingHours: "Mon-Fri 09:00-19:00",
      },
      locations: [],
      services: [],
    });

    expect(payload.branding.logoUrl).toBe("http://localhost:5173/api/businesses/biz_456/public-booking-brand-logo");
  });

  it("builds branded booking share metadata without leaking internal fields", async () => {
    const { buildPublicBookingShareMetadataResponse } = await import("./businesses.js");
    const payload = buildPublicBookingShareMetadataResponse({
      id: "biz_123",
      name: "Coastline Detail Co.",
      bookingPageTitle: "Book online in minutes",
      bookingPageSubtitle: "Choose a service, share your vehicle, and request the right time without the back-and-forth.",
      bookingBrandLogoUrl: "https://cdn.example.com/logo.png",
    });

    expect(payload).toEqual({
      businessId: "biz_123",
      businessName: "Coastline Detail Co.",
      title: "Book online in minutes | Coastline Detail Co.",
      description: "Choose a service, share your vehicle, and request the right time without the back-and-forth.",
      canonicalPath: "/book/biz_123",
      imagePath: "/api/businesses/biz_123/public-brand-image",
      imageAlt: "Coastline Detail Co. logo for online booking",
    });
  });

  it("builds branded lead share metadata with a clean fallback title", async () => {
    const { buildPublicLeadShareMetadataResponse } = await import("./businesses.js");
    const payload = buildPublicLeadShareMetadataResponse({
      id: "biz_999",
      name: "Northline Auto Spa",
      bookingBrandLogoUrl: null,
    });

    expect(payload).toEqual({
      businessId: "biz_999",
      businessName: "Northline Auto Spa",
      title: "Request service | Northline Auto Spa",
      description: "Share a few details so Northline Auto Spa can review the request and follow up with the right next step.",
      canonicalPath: "/lead/biz_999",
      imagePath: null,
      imageAlt: "Northline Auto Spa logo for service requests",
    });
  });

  it("decodes uploaded booking brand images for public sharing", async () => {
    const { resolvePublicBookingBrandImageAsset } = await import("./businesses.js");
    const asset = resolvePublicBookingBrandImageAsset("data:image/webp;base64,UklGRlIAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSAIAAAAA");

    expect(asset).not.toBeNull();
    expect(asset).toMatchObject({
      kind: "inline",
      contentType: "image/webp",
    });
  });

  it("keeps remote booking brand images shareable through a stable public URL", async () => {
    const { resolvePublicBookingBrandImageAsset } = await import("./businesses.js");
    const asset = resolvePublicBookingBrandImageAsset("https://cdn.example.com/logo.png");

    expect(asset).toEqual({
      kind: "redirect",
      url: "https://cdn.example.com/logo.png",
    });
  });

  it("treats booking as publicly available when bookable services exist", async () => {
    const { hasBookablePublicServices } = await import("./businesses.js");

    expect(
      hasBookablePublicServices([
        { active: true, isAddon: false, bookingEnabled: true },
        { active: true, isAddon: true, bookingEnabled: true },
      ])
    ).toBe(true);

    expect(
      hasBookablePublicServices([
        { active: true, isAddon: false, bookingEnabled: false },
        { active: true, isAddon: true, bookingEnabled: true },
      ])
    ).toBe(false);
  });

  it("serializes owner booking requests with requested timing and secure response links", async () => {
    const { serializeOwnerBookingRequest } = await import("./businesses.js");
    const request = {
      id: "req_123",
      businessId: "biz_123",
      draftId: "draft_123",
      clientId: "client_123",
      vehicleId: "vehicle_123",
      serviceId: "service_123",
      locationId: "location_123",
      appointmentId: null,
      status: "submitted_request",
      ownerReviewStatus: "pending",
      customerResponseStatus: "pending",
      serviceMode: "mobile",
      addonServiceIds: "[\"addon_1\"]",
      serviceSummary: "Gold detail",
      requestedDate: "2026-04-16",
      requestedTimeStart: new Date("2026-04-16T16:00:00.000Z"),
      requestedTimeEnd: new Date("2026-04-16T18:00:00.000Z"),
      requestedTimeLabel: null,
      customerTimezone: "America/Los_Angeles",
      flexibility: "exact_time_only",
      ownerResponseMessage: null,
      customerResponseMessage: null,
      alternateSlotOptions:
        '[{"id":"alt_1","startTime":"2026-04-17T17:00:00.000Z","endTime":"2026-04-17T19:00:00.000Z","label":"Friday at 10:00 AM","status":"proposed","expiresAt":"2026-04-18T00:00:00.000Z"}]',
      clientFirstName: "Avery",
      clientLastName: "Lane",
      clientEmail: "avery@example.com",
      clientPhone: "555-111-2222",
      vehicleYear: 2023,
      vehicleMake: "Tesla",
      vehicleModel: "Model 3",
      vehicleColor: "Black",
      serviceAddress: "123 Main St",
      serviceCity: "Costa Mesa",
      serviceState: "CA",
      serviceZip: "92627",
      notes: "Need pickup after work.",
      marketingOptIn: true,
      source: "booking_page",
      campaign: "spring-detail",
      publicTokenVersion: 3,
      submittedAt: new Date("2026-04-15T20:00:00.000Z"),
      underReviewAt: null,
      ownerRespondedAt: null,
      approvedRequestedSlotAt: null,
      customerRespondedAt: null,
      confirmedAt: null,
      declinedAt: null,
      expiredAt: null,
      expiresAt: new Date("2026-04-18T00:00:00.000Z"),
      createdAt: new Date("2026-04-15T20:00:00.000Z"),
      updatedAt: new Date("2026-04-15T20:00:00.000Z"),
    } as Parameters<typeof serializeOwnerBookingRequest>[0];

    const serialized = await serializeOwnerBookingRequest(request, {
      id: "biz_123",
      name: "Coastline Detail Co.",
      timezone: "America/Los_Angeles",
      bookingRequestRequireExactTime: false,
      bookingRequestAllowTimeWindows: true,
      bookingRequestAllowFlexibility: true,
      bookingRequestAllowAlternateSlots: true,
      bookingRequestAlternateSlotLimit: 3,
      bookingRequestAlternateOfferExpiryHours: 48,
    }, {
      requestPolicy: {
        requireExactTime: true,
        allowTimeWindows: false,
        allowFlexibility: false,
        reviewMessage: "We review every tint request first.",
        allowAlternateSlots: false,
        alternateSlotLimit: 1,
        alternateOfferExpiryHours: 24,
      },
    });

    expect(serialized.requestedTimingSummary).toContain("Apr");
    expect(serialized.customer).toMatchObject({
      firstName: "Avery",
      lastName: "Lane",
      email: "avery@example.com",
    });
    expect(serialized.alternateSlotOptions).toHaveLength(1);
    expect(serialized.requestPolicy).toMatchObject({
      requireExactTime: true,
      allowAlternateSlots: false,
      alternateSlotLimit: 1,
    });
    expect(serialized.publicResponseUrl).toContain("/booking-request/biz_123/req_123");
    expect(serialized.publicResponseUrl).toContain("token=");
  });

  it("serializes public booking requests without leaking customer contact details", async () => {
    const { serializePublicBookingRequest } = await import("./businesses.js");
    const request = {
      id: "req_456",
      businessId: "biz_456",
      draftId: null,
      clientId: "client_456",
      vehicleId: "vehicle_456",
      serviceId: "service_456",
      locationId: null,
      appointmentId: null,
      status: "awaiting_customer_selection",
      ownerReviewStatus: "proposed_alternates",
      customerResponseStatus: "pending",
      serviceMode: "in_shop",
      addonServiceIds: "[]",
      serviceSummary: "Ceramic refresh",
      requestedDate: "2026-04-16",
      requestedTimeStart: null,
      requestedTimeEnd: null,
      requestedTimeLabel: "After 3 PM",
      customerTimezone: "America/Los_Angeles",
      flexibility: "any_nearby_slot",
      ownerResponseMessage: "We can do later this week.",
      customerResponseMessage: null,
      alternateSlotOptions:
        '[{"id":"alt_live","startTime":"2026-04-17T22:00:00.000Z","endTime":"2026-04-17T23:30:00.000Z","label":"Friday at 3:00 PM","status":"proposed","expiresAt":"2026-04-18T00:00:00.000Z"},{"id":"alt_old","startTime":"2026-04-19T18:00:00.000Z","endTime":"2026-04-19T19:30:00.000Z","label":"Sunday at 11:00 AM","status":"accepted","expiresAt":"2026-04-18T00:00:00.000Z"}]',
      clientFirstName: "Jordan",
      clientLastName: "Reed",
      clientEmail: "jordan@example.com",
      clientPhone: "555-333-4444",
      vehicleYear: 2021,
      vehicleMake: "Ford",
      vehicleModel: "Bronco",
      vehicleColor: "Blue",
      serviceAddress: null,
      serviceCity: null,
      serviceState: null,
      serviceZip: null,
      notes: "Prefers afternoon.",
      marketingOptIn: false,
      source: "booking_page",
      campaign: null,
      publicTokenVersion: 1,
      submittedAt: new Date("2026-04-15T20:00:00.000Z"),
      underReviewAt: new Date("2026-04-15T21:00:00.000Z"),
      ownerRespondedAt: new Date("2026-04-15T21:15:00.000Z"),
      approvedRequestedSlotAt: null,
      customerRespondedAt: null,
      confirmedAt: null,
      declinedAt: null,
      expiredAt: null,
      expiresAt: new Date("2026-04-18T00:00:00.000Z"),
      createdAt: new Date("2026-04-15T20:00:00.000Z"),
      updatedAt: new Date("2026-04-15T21:15:00.000Z"),
    } as Parameters<typeof serializePublicBookingRequest>[0];

    const serialized = serializePublicBookingRequest(request, {
      id: "biz_456",
      name: "Northline Auto Spa",
      timezone: "America/Los_Angeles",
      bookingRequestRequireExactTime: false,
      bookingRequestAllowTimeWindows: true,
      bookingRequestAllowFlexibility: true,
      bookingRequestAllowAlternateSlots: true,
      bookingRequestAlternateSlotLimit: 3,
      bookingRequestAlternateOfferExpiryHours: 48,
      bookingRequestOwnerResponsePageCopy: null,
      bookingRequestAlternateAcceptanceCopy: null,
      bookingRequestChooseAnotherDayCopy: null,
    });

    expect(serialized.requestedTimeLabel).toBe("After 3 PM");
    expect(serialized.canRespond).toBe(true);
    expect(serialized.alternateSlotOptions).toEqual([
      expect.objectContaining({
        id: "alt_live",
        label: "Friday at 3:00 PM",
      }),
    ]);
    expect(serialized.vehicle).toMatchObject({
      year: 2021,
      make: "Ford",
      model: "Bronco",
      summary: "2021 Ford Bronco",
    });
    expect(serialized).not.toHaveProperty("customer");
    expect(serialized).not.toHaveProperty("clientEmail");
    expect(serialized.ownerResponseMessage).toBe("We can do later this week.");
  });
});
