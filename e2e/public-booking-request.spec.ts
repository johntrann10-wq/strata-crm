import { expect, test } from "@playwright/test";

test("customers can accept an alternate booking request slot without restarting", async ({ page }) => {
  let respondedBody: Record<string, unknown> | null = null;

  await page.route("**/api/businesses/biz-request/public-booking-requests/req-123?token=*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record: {
          id: "req-123",
          businessId: "biz-request",
          businessName: "North Star Tint",
          status: "awaiting_customer_selection",
          ownerReviewStatus: "proposed_alternates",
          customerResponseStatus: "pending",
          serviceSummary: "Windshield tint",
          requestedDate: "2026-04-16",
          requestedTimeStart: null,
          requestedTimeEnd: null,
          requestedTimeLabel: "After 3 PM",
          requestedTimingSummary: "Thu, Apr 16 - After 3 PM",
          customerTimezone: "America/Los_Angeles",
          flexibility: "same_day_flexible",
          ownerResponseMessage: "We can do either of these instead.",
          alternateSlotOptions: [
            {
              id: "alt-1",
              startTime: "2026-04-17T17:00:00.000Z",
              endTime: "2026-04-17T19:00:00.000Z",
              label: "Friday at 10:00 AM",
              expiresAt: "2026-04-18T01:00:00.000Z",
            },
          ],
          vehicle: {
            year: 2021,
            make: "Ford",
            model: "Bronco",
            color: "Blue",
            summary: "2021 Ford Bronco",
          },
          serviceAddress: null,
          serviceCity: null,
          serviceState: null,
          serviceZip: null,
          notes: "Keep the current strip at the top.",
          serviceMode: "in_shop",
          submittedAt: "2026-04-15T20:00:00.000Z",
          expiresAt: "2026-04-18T01:00:00.000Z",
          canRespond: true,
        },
        confirmationUrl: null,
        portalUrl: null,
        scheduledFor: null,
      }),
    });
  });

  await page.route("**/api/businesses/biz-request/public-booking-requests/req-123/respond?token=*", async (route) => {
    respondedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        record: {
          id: "req-123",
          businessId: "biz-request",
          businessName: "North Star Tint",
          status: "confirmed",
          ownerReviewStatus: "proposed_alternates",
          customerResponseStatus: "accepted_alternate_slot",
          serviceSummary: "Windshield tint",
          requestedDate: "2026-04-16",
          requestedTimeStart: null,
          requestedTimeEnd: null,
          requestedTimeLabel: "After 3 PM",
          requestedTimingSummary: "Thu, Apr 16 - After 3 PM",
          customerTimezone: "America/Los_Angeles",
          flexibility: "same_day_flexible",
          ownerResponseMessage: "We can do either of these instead.",
          alternateSlotOptions: [],
          vehicle: {
            year: 2021,
            make: "Ford",
            model: "Bronco",
            color: "Blue",
            summary: "2021 Ford Bronco",
          },
          serviceAddress: null,
          serviceCity: null,
          serviceState: null,
          serviceZip: null,
          notes: "Keep the current strip at the top.",
          serviceMode: "in_shop",
          submittedAt: "2026-04-15T20:00:00.000Z",
          expiresAt: null,
          canRespond: false,
        },
        appointmentId: "apt-123",
        confirmationUrl: "https://stratacrm.app/api/appointments/apt-123/public-html?token=test",
        portalUrl: "https://stratacrm.app/portal/test-token",
        scheduledFor: "Apr 17, 2026, 10:00 AM",
      }),
    });
  });

  await page.goto("/booking-request/biz-request/req-123?token=secure-token");

  await expect(page.getByText("Respond to your requested time")).toBeVisible();
  await expect(page.getByText("Windshield tint").first()).toBeVisible();
  await expect(page.getByText("2021 Ford Bronco").first()).toBeVisible();
  await expect(page.getByText("Thu, Apr 16 - After 3 PM").first()).toBeVisible();
  await expect(page.getByText("Friday at 10:00 AM")).toBeVisible();

  await page.getByRole("button", { name: "Accept this time" }).click();

  await expect(page.getByText("Your booking is confirmed")).toBeVisible();
  await expect(page.getByText("Apr 17, 2026, 10:00 AM").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Open confirmation/i })).toBeVisible();

  expect(respondedBody).toMatchObject({
    action: "accept_alternate",
    alternateSlotId: "alt-1",
  });
});

test("customers can send a new preferred booking time from the secure request page", async ({ page }) => {
  let respondedBody: Record<string, unknown> | null = null;

  await page.route("**/api/businesses/biz-request/public-booking-requests/req-456?token=*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record: {
          id: "req-456",
          businessId: "biz-request",
          businessName: "North Star Detail",
          status: "customer_requested_new_time",
          ownerReviewStatus: "requested_new_time",
          customerResponseStatus: "pending",
          serviceSummary: "Ceramic maintenance",
          requestedDate: "2026-04-21",
          requestedTimeStart: null,
          requestedTimeEnd: null,
          requestedTimeLabel: "Morning",
          requestedTimingSummary: "Tue, Apr 21 - Morning",
          customerTimezone: "America/Los_Angeles",
          flexibility: "same_day_flexible",
          ownerResponseMessage: "Please choose another day or time and we will review it right away.",
          alternateSlotOptions: [],
          vehicle: {
            year: 2024,
            make: "Tesla",
            model: "Model Y",
            color: "White",
            summary: "2024 Tesla Model Y",
          },
          serviceAddress: "123 Main St",
          serviceCity: "Irvine",
          serviceState: "CA",
          serviceZip: "92618",
          notes: "Please keep it mobile if possible.",
          serviceMode: "mobile",
          submittedAt: "2026-04-20T18:00:00.000Z",
          expiresAt: null,
          canRespond: true,
        },
        confirmationUrl: null,
        portalUrl: null,
        scheduledFor: null,
      }),
    });
  });

  await page.route("**/api/businesses/biz-request/public-booking-requests/req-456/respond?token=*", async (route) => {
    respondedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        record: {
          id: "req-456",
          businessId: "biz-request",
          businessName: "North Star Detail",
          status: "customer_requested_new_time",
          ownerReviewStatus: "pending",
          customerResponseStatus: "requested_new_time",
          serviceSummary: "Ceramic maintenance",
          requestedDate: "2026-04-21",
          requestedTimeStart: null,
          requestedTimeEnd: null,
          requestedTimeLabel: "Evening",
          requestedTimingSummary: "Tue, Apr 21 - Evening",
          customerTimezone: "America/Los_Angeles",
          flexibility: "any_nearby_slot",
          ownerResponseMessage: "Please choose another day or time and we will review it right away.",
          alternateSlotOptions: [],
          vehicle: {
            year: 2024,
            make: "Tesla",
            model: "Model Y",
            color: "White",
            summary: "2024 Tesla Model Y",
          },
          serviceAddress: "123 Main St",
          serviceCity: "Irvine",
          serviceState: "CA",
          serviceZip: "92618",
          notes: "Please keep it mobile if possible.",
          serviceMode: "mobile",
          submittedAt: "2026-04-20T18:00:00.000Z",
          expiresAt: null,
          canRespond: true,
        },
        confirmationUrl: null,
        portalUrl: null,
        scheduledFor: null,
      }),
    });
  });

  await page.goto("/booking-request/biz-request/req-456?token=secure-token");

  await expect(page.getByText("Need another day or time?")).toBeVisible();
  await expect(page.getByText("2024 Tesla Model Y").first()).toBeVisible();
  await expect(page.getByText("123 Main St, Irvine, CA, 92618")).toBeVisible();

  await page.getByRole("button", { name: "Time window" }).click();
  await page.getByRole("button", { name: "Evening" }).click();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Any nearby slot" }).evaluate((element: HTMLElement) => element.click());
  await page.getByLabel("Optional message to the shop").fill("After work would be best.");
  await page.getByRole("button", { name: /Send new requested time/i }).click();

  await expect(page.getByText("Tue, Apr 21 - Evening").first()).toBeVisible();
  expect(respondedBody?.action).toBe("request_new_time");
  expect(respondedBody?.requestedDate).toBe("2026-04-21");
  expect(respondedBody?.requestedTimeLabel).toBe("Evening");
  expect(respondedBody?.flexibility).toBe("any_nearby_slot");
  expect(respondedBody?.requestedTimeStart).toBe("");
  expect(respondedBody?.customerTimezone).toEqual(expect.any(String));
});
