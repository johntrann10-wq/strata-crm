import { expect, test } from "@playwright/test";

async function mockBookingDrafts(page: import("@playwright/test").Page, options?: { resumeToken?: string }) {
  const resumeToken = options?.resumeToken ?? "draft-token";
  let updateCount = 0;
  let abandonCount = 0;
  let lastDraftBody: Record<string, unknown> | null = null;

  await page.route("**/api/businesses/*/public-booking-drafts/*/abandon", async (route) => {
    abandonCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, accepted: true }),
    });
  });

  await page.route("**/api/businesses/*/public-booking-drafts/*", async (route) => {
    if (route.request().method().toUpperCase() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        draft: {
          draftId: "draft-1",
          resumeToken,
          status:
            lastDraftBody?.email || lastDraftBody?.phone
              ? lastDraftBody?.vehicleMake || lastDraftBody?.vehicleModel || lastDraftBody?.bookingDate
                ? "qualified_booking_intent"
                : "identified_lead"
              : "anonymous_draft",
          savedAt: "2026-04-20T18:15:00.000Z",
          currentStep: Number(lastDraftBody?.currentStep ?? 0),
          serviceCategoryFilter: String(lastDraftBody?.serviceCategoryFilter ?? "all"),
          expandedServiceId: String(lastDraftBody?.expandedServiceId ?? ""),
          form: {
            serviceId: String(lastDraftBody?.serviceId ?? ""),
            addonServiceIds: Array.isArray(lastDraftBody?.addonServiceIds) ? lastDraftBody?.addonServiceIds : [],
            serviceMode: String(lastDraftBody?.serviceMode ?? "in_shop"),
            locationId: String(lastDraftBody?.locationId ?? ""),
            bookingDate: String(lastDraftBody?.bookingDate ?? ""),
            startTime: String(lastDraftBody?.startTime ?? ""),
            firstName: String(lastDraftBody?.firstName ?? ""),
            lastName: String(lastDraftBody?.lastName ?? ""),
            email: String(lastDraftBody?.email ?? ""),
            phone: String(lastDraftBody?.phone ?? ""),
            vehicleYear: lastDraftBody?.vehicleYear ? String(lastDraftBody?.vehicleYear) : "",
            vehicleMake: String(lastDraftBody?.vehicleMake ?? ""),
            vehicleModel: String(lastDraftBody?.vehicleModel ?? ""),
            vehicleColor: String(lastDraftBody?.vehicleColor ?? ""),
            serviceAddress: String(lastDraftBody?.serviceAddress ?? ""),
            serviceCity: String(lastDraftBody?.serviceCity ?? ""),
            serviceState: String(lastDraftBody?.serviceState ?? ""),
            serviceZip: String(lastDraftBody?.serviceZip ?? ""),
            notes: String(lastDraftBody?.notes ?? ""),
            marketingOptIn: lastDraftBody?.marketingOptIn !== false,
            website: "",
          },
        },
      }),
    });
  });

  await page.route("**/api/businesses/*/public-booking-drafts", async (route) => {
    if (route.request().method().toUpperCase() !== "POST") {
      await route.fallback();
      return;
    }
    updateCount += 1;
    lastDraftBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: updateCount === 1 ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        accepted: true,
        created: updateCount === 1,
        unchanged: false,
        draft: {
          draftId: "draft-1",
          resumeToken,
          status:
            lastDraftBody?.email || lastDraftBody?.phone
              ? lastDraftBody?.vehicleMake || lastDraftBody?.vehicleModel || lastDraftBody?.bookingDate
                ? "qualified_booking_intent"
                : "identified_lead"
              : "anonymous_draft",
          savedAt: "2026-04-20T18:15:00.000Z",
          currentStep: Number(lastDraftBody?.currentStep ?? 0),
          serviceCategoryFilter: String(lastDraftBody?.serviceCategoryFilter ?? "all"),
          expandedServiceId: String(lastDraftBody?.expandedServiceId ?? ""),
          form: {
            serviceId: String(lastDraftBody?.serviceId ?? ""),
            addonServiceIds: Array.isArray(lastDraftBody?.addonServiceIds) ? lastDraftBody?.addonServiceIds : [],
            serviceMode: String(lastDraftBody?.serviceMode ?? "in_shop"),
            locationId: String(lastDraftBody?.locationId ?? ""),
            bookingDate: String(lastDraftBody?.bookingDate ?? ""),
            startTime: String(lastDraftBody?.startTime ?? ""),
            firstName: String(lastDraftBody?.firstName ?? ""),
            lastName: String(lastDraftBody?.lastName ?? ""),
            email: String(lastDraftBody?.email ?? ""),
            phone: String(lastDraftBody?.phone ?? ""),
            vehicleYear: lastDraftBody?.vehicleYear ? String(lastDraftBody?.vehicleYear) : "",
            vehicleMake: String(lastDraftBody?.vehicleMake ?? ""),
            vehicleModel: String(lastDraftBody?.vehicleModel ?? ""),
            vehicleColor: String(lastDraftBody?.vehicleColor ?? ""),
            serviceAddress: String(lastDraftBody?.serviceAddress ?? ""),
            serviceCity: String(lastDraftBody?.serviceCity ?? ""),
            serviceState: String(lastDraftBody?.serviceState ?? ""),
            serviceZip: String(lastDraftBody?.serviceZip ?? ""),
            notes: String(lastDraftBody?.notes ?? ""),
            marketingOptIn: lastDraftBody?.marketingOptIn !== false,
            website: "",
          },
        },
      }),
    });
  });

  return {
    getLastDraftBody: () => lastDraftBody,
    getUpdateCount: () => updateCount,
    getAbandonCount: () => abandonCount,
    resumeToken,
  };
}

async function mockSelfBooking(page: import("@playwright/test").Page) {
  await page.route("**/api/businesses/biz-book/public-booking-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        businessId: "biz-book",
        businessName: "North Star Detail",
        businessType: "auto_detailing",
        timezone: "America/Los_Angeles",
        title: "Tell us what you need",
        subtitle: "Choose the service you need, share your vehicle details, and lock in the next step without the back-and-forth.",
        confirmationMessage: null,
        trustPoints: ["Goes directly to the shop", "Quick follow-up", "Secure and simple"],
        notesPrompt: "Add timing, questions, or anything the shop should know.",
        branding: {
          logoUrl: "https://cdn.example.com/north-star-detail-logo.png",
          primaryColorToken: "sky",
          accentColorToken: "blue",
          backgroundToneToken: "mist",
          buttonStyleToken: "outline",
        },
        defaultFlow: "self_book",
        requireEmail: false,
        requirePhone: true,
        requireVehicle: true,
        allowCustomerNotes: true,
        showPrices: true,
        showDurations: true,
        locations: [{ id: "loc-1", name: "Main Shop", address: "Irvine, CA" }],
        services: [
          {
            id: "svc-1",
            name: "Full Detail",
            categoryId: "cat-1",
            categoryLabel: "Detailing",
            description: "Interior and exterior detail.",
            price: 275,
            durationMinutes: 180,
            effectiveFlow: "self_book",
            depositAmount: 50,
            leadTimeHours: 0,
            bookingWindowDays: 30,
            bufferMinutes: 20,
            serviceMode: "in_shop",
            featured: true,
            showPrice: true,
            showDuration: true,
            addons: [
              {
                id: "addon-1",
                name: "Engine bay",
                price: 35,
                durationMinutes: 30,
                depositAmount: 10,
                bufferMinutes: 0,
                description: "Add-on cleaning.",
                featured: false,
                showPrice: true,
                showDuration: true,
              },
            ],
          },
        ],
      }),
    });
  });

  await page.route("**/api/businesses/biz-book/public-booking-availability**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        effectiveFlow: "self_book",
        timezone: "America/Los_Angeles",
        date: "2026-04-20",
        slots: [
          { startTime: "2026-04-20T17:00:00.000Z", label: "10:00 AM" },
          { startTime: "2026-04-20T19:00:00.000Z", label: "12:00 PM" },
        ],
        durationMinutes: 210,
        subtotal: 310,
        depositAmount: 60,
      }),
    });
  });
}

test("public booking flow supports self-booking end to end", async ({ page }) => {
  await mockSelfBooking(page);
  const draftMock = await mockBookingDrafts(page);

  let postedPayload: Record<string, unknown> | null = null;
  await page.route("**/api/businesses/biz-book/public-bookings", async (route) => {
    postedPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        accepted: true,
        mode: "self_book",
        appointmentId: "apt-123",
        message: "Your appointment is booked. You can review the confirmation details right away.",
        confirmationUrl: "https://stratacrm.app/api/appointments/apt-123/public-html?token=test",
        portalUrl: "https://stratacrm.app/portal/test",
        scheduledFor: "Apr 20, 2026, 10:00 AM",
      }),
    });
  });

  await page.goto("/book/biz-book?utm_source=instagram&utm_campaign=spring-detail");

  await expect(page.getByText("Tell us what you need").first()).toBeVisible();
  await expect(page.locator('[data-booking-primary="sky"][data-booking-accent="blue"][data-booking-background="mist"][data-booking-button-style="outline"]')).toBeVisible();
  await expect(page.locator(".bp-logo-img")).toBeVisible();
  await page.locator(".svc-card").filter({ hasText: "Full Detail" }).click();
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "What will we be working on?" })).toBeVisible();

  await page.getByLabel("Vehicle make *").fill("BMW");
  await page.getByLabel("Vehicle model *").fill("X5");
  await expect.poll(() => draftMock.getUpdateCount()).toBeGreaterThan(0);
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Where and when works best?" })).toBeVisible();
  await page.getByLabel("Preferred date").fill("2026-04-20");
  await page.locator(".tc").filter({ hasText: "10:00 AM" }).click();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "How should the shop reach you?" })).toBeVisible();
  await page.getByLabel("First name").fill("Jamie");
  await page.getByLabel("Last name").fill("Rivera");
  await page.getByLabel("Email address").fill("jamie@example.com");
  await page.getByLabel("Best phone number *").fill("(555) 111-2222");
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByLabel("Additional details")).toBeVisible();
  await expect(page.locator("div").filter({ hasText: "Deposit" }).getByText("$50.00").first()).toBeVisible();
  await page.getByRole("button", { name: /engine bay/i }).click();
  await page.getByLabel("Additional details").fill("Please focus on the interior.");
  await page.getByRole("button", { name: "Book now" }).click();

  await expect(page.getByText("You're booked!")).toBeVisible();
  expect(postedPayload).toMatchObject({
    draftResumeToken: draftMock.resumeToken,
    serviceId: "svc-1",
    addonServiceIds: ["addon-1"],
    startTime: "2026-04-20T17:00:00.000Z",
    firstName: "Jamie",
    lastName: "Rivera",
    email: "jamie@example.com",
    phone: "(555) 111-2222",
    vehicleMake: "BMW",
    vehicleModel: "X5",
    source: "instagram",
    campaign: "spring-detail",
  });
});

test("public booking supports request-only services on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.route("**/api/businesses/biz-request/public-booking-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        businessId: "biz-request",
        businessName: "North Star Tint",
        businessType: "window_tinting",
        timezone: "America/Los_Angeles",
        title: "Tell us what you need",
        subtitle: "Share the service details and the shop can confirm the best next step.",
        confirmationMessage: null,
        trustPoints: ["Goes directly to the shop", "Quick follow-up", "Secure and simple"],
        notesPrompt: "Add timing, questions, or anything the shop should know.",
        branding: {
          logoUrl: null,
          primaryColorToken: "emerald",
          accentColorToken: "mint",
          backgroundToneToken: "sand",
          buttonStyleToken: "soft",
        },
        defaultFlow: "request",
        requireEmail: false,
        requirePhone: false,
        requireVehicle: true,
        allowCustomerNotes: true,
        showPrices: true,
        showDurations: true,
        locations: [],
        services: [
          {
            id: "svc-request",
            name: "Windshield tint",
            categoryId: null,
            categoryLabel: "Tint",
            description: "Request approval before scheduling.",
            price: 199,
            durationMinutes: 120,
            effectiveFlow: "request",
            depositAmount: 0,
            leadTimeHours: 0,
            bookingWindowDays: 30,
            bufferMinutes: 0,
            serviceMode: "in_shop",
            featured: false,
            showPrice: true,
            showDuration: true,
            addons: [],
          },
        ],
      }),
    });
  });

  await page.route("**/api/businesses/biz-request/public-bookings", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        accepted: true,
        mode: "request",
        leadId: "lead-123",
        message: "Your request is with the shop. They can follow up with the next step soon.",
      }),
    });
  });

  await page.goto("/book/biz-request");

  await expect(page.getByText("Tell us what you need").first()).toBeVisible();
  await page.locator(".svc-card").filter({ hasText: "Windshield tint" }).click();
  await page.getByLabel("Vehicle make *").fill("Tesla");
  await page.getByLabel("Vehicle model *").fill("Model Y");
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Where and when works best?" })).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel("First name").fill("Taylor");
  await page.getByLabel("Last name").fill("Morgan");
  await page.getByLabel("Email address").fill("taylor@example.com");
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByLabel("Additional details")).toBeVisible();
  await page.getByRole("button", { name: /send request/i }).click();

  await expect(page.getByText("Request sent!")).toBeVisible();
});

test("service query param carries service and category context into the booking flow", async ({ page }) => {
  await mockSelfBooking(page);
  await page.goto("/book/biz-book?service=svc-1&category=cat-1&source=services-page&step=service");
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "What service do you need?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Detailing" })).toBeVisible();
  await expect(page.locator("form").getByText("Full Detail").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Full Detail" })).toBeVisible();
  await expect(page.getByText(/instant|book instantly/i).first()).toBeVisible();
  await expect(page.getByText("$50.00 deposit").first()).toBeVisible();
  await expect(page.getByText("$275.00").first()).toBeVisible();
  await expect(page.getByText("3h").first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Full Detail" })).toBeVisible();
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "What service do you need?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Detailing" })).toBeVisible();
});

test("booking drafts autosave once intent is meaningful and resume on return", async ({ page }) => {
  await mockSelfBooking(page);
  const draftMock = await mockBookingDrafts(page, { resumeToken: "resume-booking-1" });

  await page.goto("/book/biz-book");
  await page.locator(".svc-card").filter({ hasText: "Full Detail" }).click();
  await page.getByLabel("Vehicle make *").fill("BMW");
  await page.getByLabel("Vehicle model *").fill("X5");

  await expect.poll(() => draftMock.getUpdateCount()).toBe(1);
  expect(draftMock.getLastDraftBody()).toMatchObject({
    serviceId: "svc-1",
    vehicleMake: "BMW",
    vehicleModel: "X5",
  });
  await expect(page.getByText(/saving|saved/i)).toBeVisible();

  await page.reload();
  await expect.poll(() => draftMock.getAbandonCount()).toBeGreaterThan(0);
  await expect(page.getByLabel("Vehicle make *")).toHaveValue("BMW");
  await expect(page.getByLabel("Vehicle model *")).toHaveValue("X5");
  await expect(page.getByText(/saving|saved/i)).toBeVisible();
});

test("invalid public booking states fail with a clean unavailable message", async ({ page }) => {
  await page.route("**/api/businesses/biz-off/public-booking-config", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Online booking is not available for this business.",
      }),
    });
  });

  await page.goto("/book/biz-off");

  await expect(page.getByText("This booking page is unavailable right now.")).toBeVisible();
  await expect(page.getByText("Online booking is not available for this business.")).toBeVisible();
});

test("hybrid services support mobile booking mode and submit address details cleanly", async ({ page }) => {
  const draftMock = await mockBookingDrafts(page, { resumeToken: "hybrid-draft-token" });
  let availabilityRequestUrl = "";
  let postedPayload: Record<string, unknown> | null = null;

  await page.route("**/api/businesses/biz-hybrid/public-booking-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        businessId: "biz-hybrid",
        businessName: "North Star Coatings",
        businessType: "auto_detailing",
        timezone: "America/Los_Angeles",
        title: "Tell us what you need",
        subtitle: "Choose the service you need, share your vehicle details, and lock in the next step without the back-and-forth.",
        confirmationMessage: null,
        trustPoints: ["Goes directly to the shop", "Quick follow-up", "Secure and simple"],
        notesPrompt: "Add timing, questions, or anything the shop should know.",
        branding: {
          logoUrl: "https://cdn.example.com/north-star-coatings-logo.png",
          primaryColorToken: "rose",
          accentColorToken: "violet",
          backgroundToneToken: "slate",
          buttonStyleToken: "solid",
        },
        defaultFlow: "self_book",
        requireEmail: false,
        requirePhone: true,
        requireVehicle: true,
        allowCustomerNotes: true,
        showPrices: true,
        showDurations: true,
        locations: [{ id: "loc-1", name: "Main Shop", address: "Irvine, CA" }],
        services: [
          {
            id: "svc-hybrid",
            name: "Ceramic maintenance",
            categoryId: "cat-1",
            categoryLabel: "Coatings",
            description: "Refresh gloss and protection without the long turnaround.",
            price: 225,
            durationMinutes: 150,
            effectiveFlow: "self_book",
            depositAmount: 25,
            leadTimeHours: 12,
            bookingWindowDays: 21,
            bufferMinutes: 30,
            serviceMode: "both",
            featured: true,
            showPrice: true,
            showDuration: true,
            addons: [
              {
                id: "addon-2",
                name: "Wheel coating top-up",
                price: 45,
                durationMinutes: 30,
                depositAmount: 0,
                bufferMinutes: 10,
                description: "A clean upsell when the vehicle already needs coating maintenance.",
                featured: true,
                showPrice: true,
                showDuration: true,
              },
            ],
          },
        ],
      }),
    });
  });

  await page.route("**/api/businesses/biz-hybrid/public-booking-availability**", async (route) => {
    availabilityRequestUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        effectiveFlow: "self_book",
        serviceMode: "mobile",
        timezone: "America/Los_Angeles",
        date: "2026-04-21",
        slots: [{ startTime: "2026-04-21T18:00:00.000Z", label: "11:00 AM" }],
        durationMinutes: 180,
        subtotal: 270,
        depositAmount: 25,
      }),
    });
  });

  await page.route("**/api/businesses/biz-hybrid/public-bookings", async (route) => {
    postedPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        accepted: true,
        mode: "self_book",
        appointmentId: "apt-mobile",
        message: "Your appointment is booked. You can review the confirmation details right away.",
        confirmationUrl: "https://stratacrm.app/api/appointments/apt-mobile/public-html?token=test",
        portalUrl: "https://stratacrm.app/portal/test-mobile",
        scheduledFor: "Apr 21, 2026, 11:00 AM",
      }),
    });
  });

  await page.goto("/book/biz-hybrid?service=svc-hybrid");

  await expect(page.getByText("Ceramic maintenance").first()).toBeVisible();
  await expect(page.getByText("12h notice").first()).toBeVisible();
  await expect(page.getByText("30m buffer").first()).toBeVisible();
  await page.getByLabel("Vehicle make *").fill("Rivian");
  await page.getByLabel("Vehicle model *").fill("R1S");
  await expect.poll(() => draftMock.getUpdateCount()).toBeGreaterThan(0);
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("button", { name: /in-shop visit/i })).toBeVisible();
  await page.getByRole("button", { name: /mobile \/ on-site/i }).click();
  await page.getByLabel("Service address").fill("123 Main St");
  await page.getByLabel("City").fill("Irvine");
  await page.getByLabel("State").fill("CA");
  await page.getByLabel("ZIP").fill("92618");
  await page.getByLabel("Preferred date").fill("2026-04-21");
  await page.locator(".tc").filter({ hasText: "11:00 AM" }).click();
  await page.getByRole("button", { name: /continue/i }).click();

  await page.getByLabel("First name").fill("Jordan");
  await page.getByLabel("Last name").fill("Lane");
  await page.getByLabel("Email address").fill("jordan@example.com");
  await page.getByLabel("Best phone number *").fill("(555) 333-1212");
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("button", { name: /wheel coating top-up/i })).toBeVisible();
  await expect(page.getByText(/r1s/i)).toBeVisible();
  await page.getByRole("button", { name: /wheel coating top-up/i }).click();
  await page.getByRole("button", { name: "Book now" }).click();

  expect(availabilityRequestUrl).toContain("serviceMode=mobile");
  expect(postedPayload).toMatchObject({
    draftResumeToken: "hybrid-draft-token",
    serviceId: "svc-hybrid",
    addonServiceIds: ["addon-2"],
    serviceMode: "mobile",
    serviceAddress: "123 Main St",
    serviceCity: "Irvine",
    serviceState: "CA",
    serviceZip: "92618",
    vehicleMake: "Rivian",
    vehicleModel: "R1S",
  });
  await expect(page.getByText("You're booked!")).toBeVisible();
  await expect.poll(() => draftMock.getUpdateCount()).toBeGreaterThan(0);
});
