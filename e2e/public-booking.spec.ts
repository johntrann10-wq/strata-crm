import { expect, test } from "@playwright/test";

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

  await expect(page.getByRole("heading", { name: /tell us what you need/i })).toBeVisible();
  await page.getByRole("button", { name: "Book now" }).click();
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Add vehicle details" })).toBeVisible();

  await page.getByLabel("Vehicle make *").fill("BMW");
  await page.getByLabel("Vehicle model *").fill("X5");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Choose a date and time" })).toBeVisible();
  await page.getByLabel("Preferred date").fill("2026-04-20");
  await page.getByRole("button", { name: "10:00 AM" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "How should the shop reach you?" })).toBeVisible();
  await page.getByLabel("First name").fill("Jamie");
  await page.getByLabel("Last name").fill("Rivera");
  await page.getByLabel("Email address").fill("jamie@example.com");
  await page.getByLabel("Best phone number *").fill("(555) 111-2222");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Review and confirm" })).toBeVisible();
  await expect(page.locator("div").filter({ hasText: "Deposit" }).getByText("$50.00").first()).toBeVisible();
  await page.getByRole("button", { name: /engine bay/i }).click();
  await page.getByLabel("Additional details").fill("Please focus on the interior.");
  await page.getByRole("button", { name: "Book appointment" }).click();

  await expect(page.getByText("Appointment booked")).toBeVisible();
  expect(postedPayload).toMatchObject({
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

  await expect(page.getByRole("heading", { name: /tell us what you need/i })).toBeVisible();
  await page.getByRole("button", { name: "Request service" }).click();
  await page.getByLabel("Vehicle make *").fill("Tesla");
  await page.getByLabel("Vehicle model *").fill("Model Y");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Choose your timing" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("First name").fill("Taylor");
  await page.getByLabel("Last name").fill("Morgan");
  await page.getByLabel("Email address").fill("taylor@example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page.getByText("Request sent")).toBeVisible();
});

test("service query param carries service and category context into the booking flow", async ({ page }) => {
  await mockSelfBooking(page);
  await page.goto("/book/biz-book?service=svc-1&category=cat-1&step=service");
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Choose your service" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Detailing" })).toBeVisible();
  await expect(page.locator("form").getByText("Full Detail").first()).toBeVisible();
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

  await expect(page.locator('[data-slot="card"]').filter({ hasText: "Ceramic maintenance" }).getByText("Ceramic maintenance", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Vehicle make *").fill("Rivian");
  await page.getByLabel("Vehicle model *").fill("R1S");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("button", { name: /in-shop visit/i })).toBeVisible();
  await page.getByRole("button", { name: /mobile \/ on-site/i }).click();
  await page.getByLabel("Service address").fill("123 Main St");
  await page.getByLabel("City").fill("Irvine");
  await page.getByLabel("State").fill("CA");
  await page.getByLabel("ZIP").fill("92618");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "Choose a date and time" })).toBeVisible();
  await page.getByLabel("Preferred date").fill("2026-04-21");
  await page.getByRole("button", { name: "11:00 AM" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await page.getByLabel("First name").fill("Jordan");
  await page.getByLabel("Last name").fill("Lane");
  await page.getByLabel("Email address").fill("jordan@example.com");
  await page.getByLabel("Best phone number *").fill("(555) 333-1212");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { name: /frequently added/i })).toBeVisible();
  await expect(page.getByText(/r1s/i)).toBeVisible();
  await page.getByRole("button", { name: /wheel coating top-up/i }).click();
  await page.getByRole("button", { name: "Book appointment" }).click();

  expect(availabilityRequestUrl).toContain("serviceMode=mobile");
  expect(postedPayload).toMatchObject({
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
  await expect(page.getByText("Appointment booked")).toBeVisible();
});
