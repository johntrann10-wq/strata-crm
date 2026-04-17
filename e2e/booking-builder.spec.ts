import { expect, test, type Page } from "@playwright/test";

const BUSINESS_ID = "biz-booking-builder";
const uploadedLogoSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120">
  <rect width="320" height="120" rx="24" fill="#0f172a"/>
  <circle cx="56" cy="60" r="28" fill="#f97316"/>
  <text x="100" y="72" font-size="34" font-family="Arial, sans-serif" font-weight="700" fill="#ffffff">North Star</text>
</svg>`;

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
    bookingBrandLogoTransform: {
      version: 1,
      fitMode: "contain",
      backgroundPlate: "auto",
      rotationDeg: 0,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    },
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
    bookingUrgencyText: "Only 3 spots left this week",
    notificationAppointmentConfirmationEmailEnabled: true,
  };

  const businessPatchBodies: Array<Record<string, unknown>> = [];
  const publicBookingConfigRequestUrls: string[] = [];

  const buildPublicBookingConfig = () => ({
    businessId: BUSINESS_ID,
    businessName: businessRecord.name,
    businessType: businessRecord.type,
    timezone: "America/Los_Angeles",
    title: businessRecord.bookingPageTitle,
    subtitle: businessRecord.bookingPageSubtitle,
    urgencyText: businessRecord.bookingUrgencyText,
    confirmationMessage: businessRecord.bookingConfirmationMessage,
    branding: {
      logoUrl: businessRecord.bookingBrandLogoUrl,
      logoTransform: businessRecord.bookingBrandLogoTransform,
      primaryColorToken: businessRecord.bookingBrandPrimaryColorToken,
      accentColorToken: businessRecord.bookingBrandAccentColorToken,
      backgroundToneToken: businessRecord.bookingBrandBackgroundToneToken,
      buttonStyleToken: businessRecord.bookingBrandButtonStyleToken,
    },
    trustPoints: [
      businessRecord.bookingTrustBulletPrimary,
      businessRecord.bookingTrustBulletSecondary,
      businessRecord.bookingTrustBulletTertiary,
    ].filter(Boolean),
    notesPrompt: businessRecord.bookingNotesPrompt,
    defaultFlow: businessRecord.bookingDefaultFlow,
    requestSettings: {
      requireExactTime: false,
      allowTimeWindows: true,
      allowFlexibility: true,
      allowAlternateSlots: true,
      alternateSlotLimit: 3,
      alternateOfferExpiryHours: 48,
      confirmationCopy: businessRecord.bookingRequestConfirmationCopy ?? null,
      ownerResponsePageCopy: businessRecord.bookingRequestOwnerResponsePageCopy ?? null,
      alternateAcceptanceCopy: businessRecord.bookingRequestAlternateAcceptanceCopy ?? null,
      chooseAnotherDayCopy: businessRecord.bookingRequestChooseAnotherDayCopy ?? null,
    },
    requireEmail: businessRecord.bookingRequireEmail,
    requirePhone: businessRecord.bookingRequirePhone,
    requireVehicle: businessRecord.bookingRequireVehicle,
    allowCustomerNotes: businessRecord.bookingAllowCustomerNotes,
    showPrices: businessRecord.bookingShowPrices,
    showDurations: businessRecord.bookingShowDurations,
    urgencyEnabled: Boolean(businessRecord.bookingUrgencyText),
    availabilityDefaults: {
      dayIndexes: businessRecord.bookingAvailableDays,
      openTime: businessRecord.bookingAvailableStartTime,
      closeTime: businessRecord.bookingAvailableEndTime,
    },
    locations: [],
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      categoryId: service.categoryId,
      categoryLabel: service.categoryLabel,
      description: service.bookingDescription,
      price: service.price,
      durationMinutes: service.durationMinutes,
      effectiveFlow:
        service.bookingFlowType === "self_book"
          ? "self_book"
          : service.bookingFlowType === "request"
            ? "request"
            : businessRecord.bookingDefaultFlow,
      depositAmount: service.bookingDepositAmount,
      leadTimeHours: service.bookingLeadTimeHours,
      bookingWindowDays: service.bookingWindowDays,
      bufferMinutes: service.bookingBufferMinutes ?? 0,
      serviceMode: service.bookingServiceMode,
      featured: service.bookingFeatured,
      showPrice: service.bookingHidePrice !== true,
      showDuration: service.bookingHideDuration !== true,
      requestPolicy: {
        requireExactTime: false,
        allowTimeWindows: true,
        allowFlexibility: true,
        reviewMessage: null,
        allowAlternateSlots: true,
        alternateSlotLimit: 3,
        alternateOfferExpiryHours: 48,
      },
      availableDayIndexes: service.bookingAvailableDays,
      openTime: service.bookingAvailableStartTime,
      closeTime: service.bookingAvailableEndTime,
      addons: [],
    })),
  });

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

  await page.route(`**/api/businesses/${BUSINESS_ID}/public-booking-config**`, async (route) => {
    publicBookingConfigRequestUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson(buildPublicBookingConfig()),
    });
  });

  await page.route(`**/api/businesses/${BUSINESS_ID}/public-booking-share-metadata**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        businessId: BUSINESS_ID,
        businessName: businessRecord.name,
        title: `${businessRecord.bookingPageTitle} | ${businessRecord.name}`,
        description: businessRecord.bookingPageSubtitle,
        canonicalPath: `/book/${BUSINESS_ID}`,
        imagePath: "/api/businesses/biz-booking-builder/public-booking-preview.svg",
        imageAlt: `${businessRecord.name} booking page preview`,
      }),
    });
  });

  await page.route(`**/api/businesses/${BUSINESS_ID}/public-booking-availability**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: toJson({
        effectiveFlow: "self_book",
        timezone: "America/Los_Angeles",
        date: "2026-04-22",
        slots: [{ startTime: "2026-04-22T17:00:00.000Z", label: "10:00 AM" }],
        durationMinutes: 180,
        subtotal: 275,
        depositAmount: 50,
      }),
    });
  });

  return {
    getLastBusinessPatch() {
      return businessPatchBodies.at(-1) ?? null;
    },
    getPublicBookingConfigRequestUrls() {
      return [...publicBookingConfigRequestUrls];
    },
    getBusinessRecord() {
      return { ...businessRecord };
    },
  };
}

test("booking builder preview updates and saves business-level settings", async ({ page }) => {
  const workspace = await mockBookingBuilderWorkspace(page);

  await page.goto("/app/booking");

  await expect(page.getByText("Flow editor")).toBeVisible();
  await expect(page.getByText("Live preview", { exact: true })).toBeVisible();

  await page.getByPlaceholder("Spark Studio").fill("Book your gloss reset");
  await page.locator('input[value="Goes directly to the shop"]').fill("Straight to the team");
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Sky" }).click();
  await page.getByRole("combobox").nth(3).click();
  await page.getByRole("option", { name: "Outline" }).click();
  await page.getByRole("tab", { name: /Experience/i }).click();
  await page.locator('input[value="Add timing, questions, or anything the shop should know."]').fill("Add timing or service details the shop should know.");
  await page.getByPlaceholder("Only 3 spots left this week").fill("Only 2 opening spots this week");
  await page.getByRole("tab", { name: /^Request$/i }).click();
  await page.locator('label[for="request-flexibility"]').click();
  await page
    .getByText("Request confirmation copy")
    .locator("..")
    .locator("textarea")
    .fill("We received your requested time and will confirm it or send alternate options.");
  await page.getByRole("button", { name: "Request review" }).click();

  await expect(page.getByText("Book your gloss reset")).toBeVisible();
  await expect(page.getByTitle("Booking builder preview")).toBeVisible();
  expect(
    workspace
      .getPublicBookingConfigRequestUrls()
      .some((requestUrl) => new URL(requestUrl).searchParams.get("builderPreview") === "1")
  ).toBe(true);

  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Booking builder updated.")).toBeVisible();

  expect(workspace.getLastBusinessPatch()).toMatchObject({
    bookingPageTitle: "Book your gloss reset",
    bookingTrustBulletPrimary: "Straight to the team",
    bookingNotesPrompt: "Add timing or service details the shop should know.",
    bookingUrgencyText: "Only 2 opening spots this week",
    bookingBrandPrimaryColorToken: "sky",
    bookingBrandButtonStyleToken: "outline",
    bookingRequestAllowFlexibility: false,
    bookingRequestConfirmationCopy:
      "We received your requested time and will confirm it or send alternate options.",
    bookingRequestUrl: expect.stringContaining(`/book/${BUSINESS_ID}`),
  });
});

test("booking builder can disable the booking page and save the off state", async ({ page }) => {
  const workspace = await mockBookingBuilderWorkspace(page);

  await page.goto("/app/booking");

  const statusWidget = page.getByText("Status", { exact: true }).locator("../..");
  const statusPanel = page.getByText("Status", { exact: true }).locator("..");
  await expect(page.getByText("Live preview", { exact: true })).toBeVisible();
  await expect(statusPanel.getByText("Live", { exact: true })).toBeVisible();

  await statusWidget.locator("label").click();
  await expect(statusPanel.getByText("Disabled", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Booking builder updated.")).toBeVisible();

  expect(workspace.getLastBusinessPatch()).toMatchObject({
    bookingEnabled: false,
  });
  expect(workspace.getBusinessRecord()).toMatchObject({
    bookingEnabled: false,
  });
});

test("booking builder stays permission-gated without settings.write", async ({ page }) => {
  await mockBookingBuilderWorkspace(page, {
    permissions: ["dashboard.view", "services.read", "services.write", "settings.read"],
  });

  await page.goto("/app/booking");

  await expect(page.getByText("Flow editor")).toBeVisible();
  await expect(page.getByPlaceholder("Spark Studio")).toBeDisabled();
  await expect(page.getByRole("button", { name: /replace image/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /adjust crop/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("booking builder uploads, crops, rotates, saves, and previews logos without leaking settings access", async ({ page }) => {
  const workspace = await mockBookingBuilderWorkspace(page);

  await page.goto("/app/booking");

  await page.locator('input[type="file"]').setInputFiles({
    name: "north-star-logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(uploadedLogoSvg),
  });

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Logo crop and framing")).toBeVisible();

  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Wide wordmark" }).click();
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Dark plate" }).click();

  await dialog.locator('input[aria-label="Logo zoom"]').evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "1.75");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await dialog.locator('input[aria-label="Logo rotation"]').evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "12.5");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const editorFrame = dialog.locator('[data-booking-logo-frame="editor"]');
  const frameBox = await editorFrame.boundingBox();
  if (!frameBox) throw new Error("Expected logo editor frame to render.");
  await page.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + frameBox.width / 2 + 48, frameBox.y + frameBox.height / 2 - 22, { steps: 8 });
  await page.mouse.up();

  await expect(dialog.locator('[data-logo-preview="share"] [data-booking-logo-image="share"]')).toBeVisible();
  await dialog.getByRole("button", { name: "Save logo framing" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.locator('[data-booking-logo-image="builder_thumb"]')).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Booking builder updated.")).toBeVisible();

  const lastPatch = workspace.getLastBusinessPatch();
  expect(lastPatch).toMatchObject({
    bookingBrandLogoUrl: expect.stringContaining("data:image/svg+xml;base64,"),
    bookingBrandLogoTransform: expect.objectContaining({
      fitMode: "wordmark",
      backgroundPlate: "dark",
      rotationDeg: 12.5,
      zoom: 1.75,
    }),
  });
  expect(Number((lastPatch?.bookingBrandLogoTransform as { offsetX?: number } | undefined)?.offsetX ?? 0)).not.toBe(0);

  const preview = page.frameLocator('iframe[title="Booking builder preview"]');
  await expect(preview.locator('[data-booking-logo-image="hero"]')).toBeVisible();
  await expect(preview.locator('[data-booking-logo-fallback="hero"]')).toHaveCount(0);
  expect(workspace.getBusinessRecord().bookingBrandLogoUrl).toContain("data:image/svg+xml;base64,");
});
