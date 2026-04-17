import { expect, test, type Page } from "@playwright/test";

const BUSINESS_ID = "biz-requests";

type OwnerRequestPolicy = {
  requireExactTime: boolean;
  allowTimeWindows: boolean;
  allowFlexibility: boolean;
  reviewMessage: string | null;
  allowAlternateSlots: boolean;
  alternateSlotLimit: number;
  alternateOfferExpiryHours: number | null;
};

type OwnerBookingRequestRecord = {
  id: string;
  businessId: string;
  clientId: string | null;
  vehicleId: string | null;
  serviceId: string | null;
  locationId: string | null;
  appointmentId: string | null;
  status:
    | "submitted_request"
    | "under_review"
    | "approved_requested_slot"
    | "awaiting_customer_selection"
    | "confirmed"
    | "declined"
    | "customer_requested_new_time"
    | "expired";
  ownerReviewStatus: "pending" | "approved_requested_slot" | "proposed_alternates" | "requested_new_time" | "declined";
  customerResponseStatus:
    | "pending"
    | "accepted_requested_slot"
    | "accepted_alternate_slot"
    | "requested_new_time"
    | "declined"
    | "expired";
  serviceMode: "in_shop" | "mobile";
  addonServiceIds: string[];
  serviceSummary: string;
  requestedDate: string | null;
  requestedTimeStart: string | null;
  requestedTimeEnd: string | null;
  requestedTimeLabel: string | null;
  requestedTimingSummary: string | null;
  customerTimezone: string;
  flexibility: "exact_time_only" | "same_day_flexible" | "any_nearby_slot";
  ownerResponseMessage: string | null;
  customerResponseMessage: string | null;
  alternateSlotOptions: Array<{
    id: string;
    startTime: string;
    endTime: string | null;
    label: string;
    expiresAt: string | null;
  }>;
  requestPolicy: OwnerRequestPolicy;
  customer: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  };
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
    summary: string | null;
  };
  serviceAddress: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  serviceZip: string | null;
  notes: string | null;
  marketingOptIn: boolean;
  source: string | null;
  campaign: string | null;
  submittedAt: string;
  underReviewAt: string | null;
  ownerRespondedAt: string | null;
  approvedRequestedSlotAt: string | null;
  customerRespondedAt: string | null;
  confirmedAt: string | null;
  declinedAt: string | null;
  expiredAt: string | null;
  expiresAt: string | null;
  publicResponseUrl: string;
  confirmationUrl: string | null;
  portalUrl: string | null;
};

type MockOptions = {
  permissions?: string[];
};

function toJson(body: unknown) {
  return JSON.stringify(body);
}

async function mockAuthenticatedRequestWorkspace(page: Page, options: MockOptions = {}) {
  const permissions = options.permissions ?? ["dashboard.view", "appointments.read", "appointments.write"];

  await page.addInitScript(({ businessId }) => {
    window.localStorage.setItem("authToken", "request-qa-token");
    window.localStorage.setItem("currentBusinessId", businessId);
  }, { businessId: BUSINESS_ID });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        data: {
          id: "user-1",
          email: "owner@example.com",
          firstName: "Owner",
          lastName: "QA",
          token: "request-qa-token",
        },
      }),
    });
  });

  await page.route("**/api/auth/context", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        data: {
          businesses: [
            {
              id: BUSINESS_ID,
              name: "North Star Detail",
              type: "auto_detailing",
              role: permissions.includes("appointments.write") ? "owner" : "technician",
              status: "active",
              isDefault: true,
              permissions,
            },
          ],
          currentBusinessId: BUSINESS_ID,
        },
      }),
    });
  });

  await page.route("**/api/users/user-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        id: "user-1",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "QA",
      }),
    });
  });

  await page.route("**/api/billing/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        status: "active",
        accessState: "active_paid",
        billingEnforced: true,
        billingPrompt: { stage: "none", visible: false, daysLeftInTrial: null, dismissedUntil: null, cooldownDays: 5 },
        activationMilestone: { reached: false, type: null, occurredAt: null, detail: null },
        checkoutConfigured: true,
        portalConfigured: true,
        stripeConnectConfigured: true,
        stripeConnectReady: true,
      }),
    });
  });

  await page.route("**/api/billing/prompt-event", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ ok: true }),
    });
  });
}

function createRequestRecord(overrides?: Partial<OwnerBookingRequestRecord>): OwnerBookingRequestRecord {
  return {
    id: "req-owner",
    businessId: BUSINESS_ID,
    clientId: "client-1",
    vehicleId: "vehicle-1",
    serviceId: "service-1",
    locationId: null,
    appointmentId: null,
    status: "submitted_request",
    ownerReviewStatus: "pending",
    customerResponseStatus: "pending",
    serviceMode: "in_shop",
    addonServiceIds: [],
    serviceSummary: "Windshield tint",
    requestedDate: "2026-04-21",
    requestedTimeStart: "2026-04-21T17:00:00.000Z",
    requestedTimeEnd: "2026-04-21T19:00:00.000Z",
    requestedTimeLabel: null,
    requestedTimingSummary: "Tue, Apr 21 - 10:00 AM - 12:00 PM",
    customerTimezone: "America/Los_Angeles",
    flexibility: "exact_time_only",
    ownerResponseMessage: null,
    customerResponseMessage: null,
    alternateSlotOptions: [],
    requestPolicy: {
      requireExactTime: true,
      allowTimeWindows: false,
      allowFlexibility: false,
      reviewMessage: "We review every tint booking request before confirming it.",
      allowAlternateSlots: true,
      alternateSlotLimit: 3,
      alternateOfferExpiryHours: 48,
    },
    customer: {
      firstName: "Avery",
      lastName: "Lane",
      email: "avery@example.com",
      phone: "(555) 111-2222",
    },
    vehicle: {
      year: 2023,
      make: "Tesla",
      model: "Model 3",
      color: "Black",
      summary: "2023 Tesla Model 3",
    },
    serviceAddress: null,
    serviceCity: null,
    serviceState: null,
    serviceZip: null,
    notes: "Please keep the current top strip.",
    marketingOptIn: true,
    source: "booking_page",
    campaign: "spring-tint",
    submittedAt: "2026-04-20T18:15:00.000Z",
    underReviewAt: null,
    ownerRespondedAt: null,
    approvedRequestedSlotAt: null,
    customerRespondedAt: null,
    confirmedAt: null,
    declinedAt: null,
    expiredAt: null,
    expiresAt: null,
    publicResponseUrl: "https://stratacrm.app/booking-request/biz-requests/req-owner?token=test",
    confirmationUrl: null,
    portalUrl: null,
    ...overrides,
  };
}

test("owners can clearly review requested timing and approve the requested slot", async ({ page }) => {
  await mockAuthenticatedRequestWorkspace(page);

  let currentRecord = createRequestRecord();
  let approveBody: Record<string, unknown> | null = null;

  await page.route("**/api/businesses/biz-requests/booking-requests/req-owner/availability-hints**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        date: "2026-04-21",
        timezone: "America/Los_Angeles",
        durationMinutes: 120,
        slots: [
          {
            startTime: "2026-04-21T17:00:00.000Z",
            endTime: "2026-04-21T19:00:00.000Z",
            label: "Tuesday at 10:00 AM",
          },
        ],
      }),
    });
  });

  await page.route("**/api/businesses/biz-requests/booking-requests/req-owner/approve", async (route) => {
    approveBody = route.request().postDataJSON() as Record<string, unknown>;
    currentRecord = {
      ...currentRecord,
      appointmentId: "apt-123",
      status: "confirmed",
      ownerReviewStatus: "approved_requested_slot",
      customerResponseStatus: "accepted_requested_slot",
      ownerResponseMessage: String(approveBody?.message ?? ""),
      ownerRespondedAt: "2026-04-20T18:30:00.000Z",
      approvedRequestedSlotAt: "2026-04-20T18:30:00.000Z",
      customerRespondedAt: "2026-04-20T18:30:00.000Z",
      confirmedAt: "2026-04-20T18:30:00.000Z",
      confirmationUrl: "https://stratacrm.app/api/appointments/apt-123/public-html?token=test",
      portalUrl: "https://stratacrm.app/portal/test",
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        ok: true,
        record: currentRecord,
        appointmentId: "apt-123",
        confirmationUrl: currentRecord.confirmationUrl,
        portalUrl: currentRecord.portalUrl,
        scheduledFor: "Apr 21, 2026, 10:00 AM",
      }),
    });
  });

  await page.route("**/api/businesses/biz-requests/booking-requests/req-owner", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ record: currentRecord }),
    });
  });

  await page.route("**/api/businesses/biz-requests/booking-requests", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ records: [currentRecord] }),
    });
  });

  await page.goto("/appointments/requests");

  await expect(page.getByText("Requested date and time")).toBeVisible();
  await expect(page.getByText("Tue, Apr 21 - 10:00 AM - 12:00 PM").first()).toBeVisible();
  await expect(page.getByText("2023 Tesla Model 3").first()).toBeVisible();

  await page.getByRole("button", { name: "Approve requested slot" }).click();
  await expect(page.getByText("Approve the requested slot")).toBeVisible();
  await expect(page.getByText("Tue, Apr 21 - 10:00 AM - 12:00 PM").last()).toBeVisible();
  await page.getByLabel("Optional message to customer").fill("We can lock this in right away.");
  await page.getByRole("button", { name: "Approve and create appointment" }).click();

  await expect(page.getByRole("link", { name: "Open appointment" })).toBeVisible();
  await expect(page.getByText("Approved Requested Slot")).toBeVisible();
  expect(approveBody).toMatchObject({
    message: "We can lock this in right away.",
  });
});

test("owners can propose alternate times and the UI respects the service alternate-slot limit", async ({ page }) => {
  await mockAuthenticatedRequestWorkspace(page);

  let currentRecord = createRequestRecord({
    id: "req-limited",
    requestedTimingSummary: "Tue, Apr 21 - Morning",
    requestedTimeStart: null,
    requestedTimeEnd: null,
    requestedTimeLabel: "Morning",
    requestPolicy: {
      requireExactTime: false,
      allowTimeWindows: true,
      allowFlexibility: true,
      reviewMessage: null,
      allowAlternateSlots: true,
      alternateSlotLimit: 1,
      alternateOfferExpiryHours: 24,
    },
  });
  let proposedBody: Record<string, unknown> | null = null;

  await page.route("**/api/businesses/biz-requests/booking-requests/req-limited/availability-hints**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        date: "2026-04-21",
        timezone: "America/Los_Angeles",
        durationMinutes: 120,
        slots: [
          {
            startTime: "2026-04-22T17:00:00.000Z",
            endTime: "2026-04-22T19:00:00.000Z",
            label: "Wednesday at 10:00 AM",
          },
          {
            startTime: "2026-04-22T20:00:00.000Z",
            endTime: "2026-04-22T22:00:00.000Z",
            label: "Wednesday at 1:00 PM",
          },
        ],
      }),
    });
  });

  await page.route("**/api/businesses/biz-requests/booking-requests/req-limited/propose-alternates", async (route) => {
    proposedBody = route.request().postDataJSON() as Record<string, unknown>;
    currentRecord = {
      ...currentRecord,
      status: "awaiting_customer_selection",
      ownerReviewStatus: "proposed_alternates",
      ownerResponseMessage: String(proposedBody?.message ?? ""),
      ownerRespondedAt: "2026-04-20T18:45:00.000Z",
      expiresAt: "2026-04-21T18:45:00.000Z",
      alternateSlotOptions: [
        {
          id: "alt-1",
          startTime: "2026-04-22T17:00:00.000Z",
          endTime: "2026-04-22T19:00:00.000Z",
          label: "Wednesday at 10:00 AM",
          expiresAt: "2026-04-21T18:45:00.000Z",
        },
      ],
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        ok: true,
        record: currentRecord,
      }),
    });
  });

  await page.route("**/api/businesses/biz-requests/booking-requests/req-limited", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ record: currentRecord }),
    });
  });

  await page.route("**/api/businesses/biz-requests/booking-requests", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ records: [currentRecord] }),
    });
  });

  await page.goto("/appointments/requests?request=req-limited");

  await expect(page.getByText("Up to 1").first()).toBeVisible();
  await page.getByRole("button", { name: "Propose alternate times" }).click();
  await expect(page.getByText("Choose up to 1 real slot")).toBeVisible();
  await page.getByRole("button", { name: /Wednesday at 10:00 AM/ }).click();
  await expect(page.getByRole("button", { name: /Wednesday at 1:00 PM/ })).toBeDisabled();
  await page.getByLabel("Optional customer message").fill("This is the cleanest open slot we have.");
  await page.getByRole("button", { name: "Send alternate times" }).click();

  await expect(page.getByText("Current alternate options")).toBeVisible();
  expect((proposedBody?.options as Array<unknown>) ?? []).toHaveLength(1);
});

test("owners can ask for another day when alternates are disabled, and read-only roles cannot act", async ({ page, browser }) => {
  const currentRecord = createRequestRecord({
    id: "req-no-alternates",
    requestPolicy: {
      requireExactTime: false,
      allowTimeWindows: true,
      allowFlexibility: true,
      reviewMessage: null,
      allowAlternateSlots: false,
      alternateSlotLimit: 1,
      alternateOfferExpiryHours: 24,
    },
  });
  let askBody: Record<string, unknown> | null = null;
  await mockAuthenticatedRequestWorkspace(page);

  await page.route("**/api/businesses/biz-requests/booking-requests/req-no-alternates/request-new-time", async (route) => {
    askBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        ok: true,
        record: {
          ...currentRecord,
          status: "awaiting_customer_selection",
          ownerReviewStatus: "requested_new_time",
          ownerResponseMessage: String(askBody?.message ?? ""),
          ownerRespondedAt: "2026-04-20T18:50:00.000Z",
          expiresAt: "2026-04-23T18:50:00.000Z",
        },
      }),
    });
  });
  await page.route("**/api/businesses/biz-requests/booking-requests/req-no-alternates/availability-hints**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        date: "2026-04-21",
        timezone: "America/Los_Angeles",
        durationMinutes: 120,
        slots: [],
      }),
    });
  });
  await page.route("**/api/businesses/biz-requests/booking-requests/req-no-alternates", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ record: currentRecord }),
    });
  });
  await page.route("**/api/businesses/biz-requests/booking-requests", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ records: [currentRecord] }),
    });
  });

  await page.goto("/appointments/requests?request=req-no-alternates");

  await expect(page.getByRole("button", { name: "Propose alternate times" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask for another day" })).toBeVisible();
  await page.getByRole("button", { name: "Ask for another day" }).click();
  await page.getByLabel("Message to customer").fill("Please send another day that works for you.");
  await page.getByRole("button", { name: "Send secure follow-up" }).click();
  expect(askBody).toMatchObject({
    message: "Please send another day that works for you.",
  });

  const readOnlyPage = await browser.newPage();
  await mockAuthenticatedRequestWorkspace(readOnlyPage, { permissions: ["dashboard.view", "appointments.read"] });
  await readOnlyPage.route("**/api/businesses/biz-requests/booking-requests/req-no-alternates/availability-hints**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        date: "2026-04-21",
        timezone: "America/Los_Angeles",
        durationMinutes: 120,
        slots: [],
      }),
    });
  });
  await readOnlyPage.route("**/api/businesses/biz-requests/booking-requests/req-no-alternates", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ record: currentRecord }),
    });
  });
  await readOnlyPage.route("**/api/businesses/biz-requests/booking-requests", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ records: [currentRecord] }),
    });
  });

  await readOnlyPage.goto("/appointments/requests?request=req-no-alternates");
  await expect(readOnlyPage.getByText("Tue, Apr 21 - 10:00 AM - 12:00 PM").first()).toBeVisible();
  await expect(readOnlyPage.getByRole("button", { name: "Approve requested slot" })).toHaveCount(0);
  await expect(readOnlyPage.getByRole("button", { name: "Ask for another day" })).toHaveCount(0);
  await readOnlyPage.close();
});
