import { expect, test, type Page } from "@playwright/test";

const BUSINESS_ID = "biz-booking-builder";

type MockOptions = {
  permissions?: string[];
};

function toJson(body: unknown) {
  return JSON.stringify(body);
}

async function mockBookingBuilderWorkspace(page: Page, options: MockOptions = {}) {
  const permissions =
    options.permissions ??
    ["dashboard.view", "services.read", "services.write", "settings.read", "settings.write"];

  const serviceCategories = [
    {
      id: "cat-1",
      name: "Detailing",
      key: "detailing",
      sortOrder: 0,
      active: true,
      serviceCount: 2,
    },
  ];

  const services = [
    {
      id: "svc-book",
      name: "Full Detail",
      price: 275,
      durationMinutes: 180,
      category: "detailing",
      categoryId: "cat-1",
      categoryLabel: "Detailing",
      sortOrder: 0,
      active: true,
      isAddon: false,
      taxable: true,
      notes: "Interior and exterior reset.",
      bookingEnabled: true,
      bookingFlowType: "inherit",
      bookingDescription: "Our most-requested reset for a complete refresh.",
      bookingDepositAmount: 50,
      bookingLeadTimeHours: 0,
      bookingWindowDays: 30,
      bookingServiceMode: "in_shop",
      bookingAvailableDays: [1, 2, 3, 4, 5],
      bookingAvailableStartTime: "09:00",
      bookingAvailableEndTime: "17:00",
      bookingBufferMinutes: 20,
      bookingCapacityPerSlot: 1,
      bookingFeatured: true,
      bookingHidePrice: false,
      bookingHideDuration: false,
    },
    {
      id: "svc-request",
      name: "Windshield Tint",
      price: 199,
      durationMinutes: 120,
      category: "detailing",
      categoryId: "cat-1",
      categoryLabel: "Detailing",
      sortOrder: 1,
      active: true,
      isAddon: false,
      taxable: true,
      notes: "Approval required before scheduling.",
      bookingEnabled: true,
      bookingFlowType: "request",
      bookingDescription: "Share your timing and the shop can confirm the next step.",
      bookingDepositAmount: 0,
      bookingLeadTimeHours: 0,
      bookingWindowDays: 30,
      bookingServiceMode: "in_shop",
      bookingAvailableDays: [1, 2, 3, 4, 5],
      bookingAvailableStartTime: "09:00",
      bookingAvailableEndTime: "17:00",
      bookingBufferMinutes: null,
      bookingCapacityPerSlot: 1,
      bookingFeatured: false,
      bookingHidePrice: false,
      bookingHideDuration: false,
    },
  ];

  let businessRecord = {
    id: BUSINESS_ID,
    name: "North Star Detail",
    type: "auto_detailing",
    bookingEnabled: true,
    bookingDefaultFlow: "self_book",
    bookingPageTitle: "Tell us what you need",
    bookingPageSubtitle: "Share a few details and the shop can follow up with the right next step.",
    bookingConfirmationMessage: "Your appointment is booked. You can review the confirmation details right away.",
    bookingTrustBulletPrimary: "Goes directly to the shop",
    bookingTrustBulletSecondary: "Quick confirmation",
    bookingTrustBulletTertiary: "Secure and simple",
    bookingNotesPrompt: "Add timing, questions, or anything the shop should know.",
    bookingBrandLogoUrl: "https://cdn.example.com/logo.png",
    bookingBrandPrimaryColorToken: "orange",
    bookingBrandAccentColorToken: "amber",
    bookingBrandBackgroundToneToken: "ivory",
    bookingBrandButtonStyleToken: "solid",
    bookingRequireEmail: false,
    bookingRequirePhone: true,
    bookingRequireVehicle: true,
    bookingAllowCustomerNotes: true,
    bookingShowPrices: true,
    bookingShowDurations: true,
    bookingAvailableDays: [1, 2, 3, 4, 5],
    bookingAvailableStartTime: "09:00",
    bookingAvailableEndTime: "17:00",
    bookingBlackoutDates: [],
    bookingSlotIntervalMinutes: 15,
    bookingBufferMinutes: 15,
    bookingCapacityPerSlot: 1,
    notificationAppointmentConfirmationEmailEnabled: true,
  };

  const businessPatchBodies: Array<Record<string, unknown>> = [];

  await page.addInitScript(({ businessId }) => {
    window.localStorage.setItem("authToken", "qa-token");
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
          token: "qa-token",
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
              role: "owner",
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
        accessState: "active_trial",
        status: "trialing",
        trialStartedAt: "2026-04-01T00:00:00.000Z",
        billingHasPaymentMethod: false,
        trialEndsAt: "2026-05-18T00:00:00.000Z",
        billingPaymentMethodAddedAt: null,
        billingSetupError: null,
        billingSetupFailedAt: null,
        billingLastStripeEventId: "evt_test",
        billingLastStripeEventType: "customer.subscription.updated",
        billingLastStripeEventAt: "2026-04-11T16:00:00.000Z",
        billingLastStripeSyncStatus: "synced",
        billingLastStripeSyncError: null,
        activationMilestone: {
          reached: true,
          type: "appointment_created",
          occurredAt: "2026-04-10T15:00:00.000Z",
          detail: "First appointment created",
        },
        billingPrompt: {
          stage: "soft_activation",
          visible: true,
          daysLeftInTrial: 30,
          dismissedUntil: null,
          cooldownDays: 5,
        },
        billingEnforced: true,
        checkoutConfigured: true,
        portalConfigured: true,
        stripeConnectConfigured: true,
        stripeConnectAccountId: "acct_test",
        stripeConnectDetailsSubmitted: true,
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
        stripeConnectOnboardedAt: "2026-04-04T15:00:00.000Z",
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

  await page.route("**/api/service-categories/capabilities", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ supportsManagement: true }),
    });
  });

  await page.route("**/api/service-categories**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ records: serviceCategories }),
    });
  });

  await page.route("**/api/service-addon-links**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ records: [] }),
    });
  });

  await page.route("**/api/locations**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ records: [] }),
    });
  });

  await page.route("**/api/services**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({ records: services }),
    });
  });

  await page.route(`**/api/businesses/${BUSINESS_ID}`, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      businessPatchBodies.push(body);
      businessRecord = {
        ...businessRecord,
        ...body,
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson(businessRecord),
    });
  });

  return {
    getLastBusinessPatch() {
      return businessPatchBodies.at(-1) ?? null;
    },
  };
}

test("booking builder preview updates and saves business-level settings", async ({ page }) => {
  const workspace = await mockBookingBuilderWorkspace(page);

  await page.goto("/app/booking");

  await expect(page.getByText("Flow editor")).toBeVisible();
  await expect(page.getByText("Live preview", { exact: true })).toBeVisible();

  await page.getByPlaceholder("Tell us what you need").fill("Book your gloss reset");
  await page.locator('input[value="Goes directly to the shop"]').fill("Straight to the team");
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Sky" }).click();
  await page.getByRole("combobox").nth(3).click();
  await page.getByRole("option", { name: "Outline" }).click();
  await page.getByRole("tab", { name: /Content/i }).click();
  await page.locator('input[value="Add timing, questions, or anything the shop should know."]').fill("Add timing or service details the shop should know.");

  await expect(page.getByText("Book your gloss reset")).toBeVisible();
  await expect(page.getByTitle("Booking builder preview")).toBeVisible();

  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Booking builder updated.")).toBeVisible();

  expect(workspace.getLastBusinessPatch()).toMatchObject({
    bookingPageTitle: "Book your gloss reset",
    bookingTrustBulletPrimary: "Straight to the team",
    bookingNotesPrompt: "Add timing or service details the shop should know.",
    bookingBrandPrimaryColorToken: "sky",
    bookingBrandButtonStyleToken: "outline",
    bookingRequestUrl: expect.stringContaining(`/book/${BUSINESS_ID}`),
  });
});

test("booking builder stays permission-gated without settings.write", async ({ page }) => {
  await mockBookingBuilderWorkspace(page, {
    permissions: ["dashboard.view", "services.read", "services.write", "settings.read"],
  });

  await page.goto("/app/booking");

  await expect(page.getByText("Flow editor")).toBeVisible();
  await expect(page.getByPlaceholder("Tell us what you need")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
});
