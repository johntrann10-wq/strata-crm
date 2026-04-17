import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { mockMarketingApp, signIn } from "./helpers/marketingSeed";

const outputDir = path.join(process.cwd(), "public", "marketing", "strata-ui");
const inlineBookingLogo =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMjAiIGhlaWdodD0iMTIwIiB2aWV3Qm94PSIwIDAgMzIwIDEyMCI+PHJlY3Qgd2lkdGg9IjMyMCIgaGVpZ2h0PSIxMjAiIHJ4PSIyNCIgZmlsbD0iIzBmMTcyYSIvPjxjaXJjbGUgY3g9IjU2IiBjeT0iNjAiIHI9IjI4IiBmaWxsPSIjZjk3MzE2Ii8+PHRleHQgeD0iMTAwIiB5PSI3MiIgZm9udC1zaXplPSIzNCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjZmZmZmZmIj5Ob3J0aCBTdGFyPC90ZXh0Pjwvc3ZnPg==";

async function freezeDate(page: import("@playwright/test").Page, isoTimestamp: string) {
  await page.addInitScript((timestamp) => {
    const fixed = new Date(timestamp);
    const OriginalDate = Date;
    class MockDate extends OriginalDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          return new OriginalDate(fixed);
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixed.getTime();
      }
    }
    // @ts-expect-error - override Date in browser context for deterministic screenshots
    window.Date = MockDate;
  }, isoTimestamp);
}

async function ensureOutputDir() {
  await mkdir(outputDir, { recursive: true });
}

async function captureScreenshot(
  page: import("@playwright/test").Page,
  name: string,
  clipHeight: number
) {
  await ensureOutputDir();
  const rawPath = path.join(outputDir, `${name}-raw.png`);
  const cropPath = path.join(outputDir, `${name}.png`);
  const viewport = page.viewportSize();

  if (!viewport) {
    throw new Error("Viewport size is not set.");
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: rawPath });

  const height = Math.min(clipHeight, viewport.height);
  await page.screenshot({
    path: cropPath,
    clip: { x: 0, y: 0, width: viewport.width, height },
  });
}

async function mockBookingMarketingPage(page: import("@playwright/test").Page) {
  let lastDraftBody: Record<string, unknown> | null = null;

  await page.route("**/api/businesses/biz-booking-marketing/public-booking-share-metadata**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        businessId: "biz-booking-marketing",
        businessName: "North Star Detail",
        title: "Book with North Star Detail",
        description:
          "Choose a service, share your vehicle, and confirm the next step without the back-and-forth.",
        canonicalPath: "/book/biz-booking-marketing",
        imagePath: "/api/businesses/biz-booking-marketing/public-brand-image",
        imageAlt: "North Star Detail logo for online booking",
      }),
    });
  });

  await page.route("**/api/businesses/biz-booking-marketing/public-booking-drafts/*/abandon", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, accepted: true }),
    });
  });

  await page.route("**/api/businesses/biz-booking-marketing/public-booking-drafts/*", async (route) => {
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
          draftId: "draft-booking-marketing",
          resumeToken: "booking-marketing-resume",
          status: "anonymous_draft",
          savedAt: "2026-04-20T18:15:00.000Z",
          currentStep: Number(lastDraftBody?.currentStep ?? 0),
          serviceCategoryFilter: String(lastDraftBody?.serviceCategoryFilter ?? "all"),
          expandedServiceId: String(lastDraftBody?.expandedServiceId ?? ""),
          form: {
            serviceId: String(lastDraftBody?.serviceId ?? ""),
            addonServiceIds: [],
            serviceMode: String(lastDraftBody?.serviceMode ?? "in_shop"),
            locationId: String(lastDraftBody?.locationId ?? ""),
            bookingDate: String(lastDraftBody?.bookingDate ?? ""),
            startTime: String(lastDraftBody?.startTime ?? ""),
            requestedTimeEnd: "",
            requestedTimeLabel: "",
            flexibility: "same_day_flexible",
            customerTimezone: "",
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            vehicleYear: "",
            vehicleMake: "",
            vehicleModel: "",
            vehicleColor: "",
            serviceAddress: "",
            serviceCity: "",
            serviceState: "",
            serviceZip: "",
            notes: "",
            marketingOptIn: true,
            website: "",
          },
        },
      }),
    });
  });

  await page.route("**/api/businesses/biz-booking-marketing/public-booking-drafts", async (route) => {
    if (route.request().method().toUpperCase() !== "POST") {
      await route.fallback();
      return;
    }

    lastDraftBody = route.request().postDataJSON() as Record<string, unknown>;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        accepted: true,
        created: true,
        unchanged: false,
        draft: {
          draftId: "draft-booking-marketing",
          resumeToken: "booking-marketing-resume",
          status: "anonymous_draft",
          savedAt: "2026-04-20T18:15:00.000Z",
          currentStep: Number(lastDraftBody?.currentStep ?? 0),
          serviceCategoryFilter: String(lastDraftBody?.serviceCategoryFilter ?? "all"),
          expandedServiceId: String(lastDraftBody?.expandedServiceId ?? ""),
          form: {
            serviceId: String(lastDraftBody?.serviceId ?? ""),
            addonServiceIds: [],
            serviceMode: String(lastDraftBody?.serviceMode ?? "in_shop"),
            locationId: String(lastDraftBody?.locationId ?? ""),
            bookingDate: String(lastDraftBody?.bookingDate ?? ""),
            startTime: String(lastDraftBody?.startTime ?? ""),
            requestedTimeEnd: "",
            requestedTimeLabel: "",
            flexibility: "same_day_flexible",
            customerTimezone: "",
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            vehicleYear: "",
            vehicleMake: "",
            vehicleModel: "",
            vehicleColor: "",
            serviceAddress: "",
            serviceCity: "",
            serviceState: "",
            serviceZip: "",
            notes: "",
            marketingOptIn: true,
            website: "",
          },
        },
      }),
    });
  });

  await page.route("**/api/businesses/biz-booking-marketing/public-booking-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        businessId: "biz-booking-marketing",
        businessName: "North Star Detail",
        businessType: "auto_detailing",
        timezone: "America/Los_Angeles",
        title: "Book with North Star Detail",
        subtitle: "Choose the service you need, share your vehicle details, and confirm the next step without the back-and-forth.",
        confirmationMessage: null,
        trustPoints: ["Branded to your shop", "Secure intake", "Fast follow-up"],
        notesPrompt: "Add timing, access notes, or anything the shop should know before the appointment.",
        branding: {
          logoUrl: inlineBookingLogo,
          primaryColorToken: "amber",
          accentColorToken: "orange",
          backgroundToneToken: "mist",
          buttonStyleToken: "solid",
        },
        defaultFlow: "mixed",
        requireEmail: false,
        requirePhone: true,
        requireVehicle: true,
        allowCustomerNotes: true,
        showPrices: true,
        showDurations: true,
        locations: [{ id: "loc-1", name: "Costa Mesa Studio", address: "Costa Mesa, CA" }],
        services: [
          {
            id: "svc-signature",
            name: "Signature Detail",
            categoryId: "cat-popular",
            categoryLabel: "Most popular",
            description: "Interior reset, exterior wash, decontamination, and a glossy finish for everyday drivers.",
            price: 249,
            durationMinutes: 180,
            effectiveFlow: "self_book",
            depositAmount: 60,
            leadTimeHours: 0,
            bookingWindowDays: 30,
            bufferMinutes: 20,
            serviceMode: "in_shop",
            featured: true,
            showPrice: true,
            showDuration: true,
            addons: [],
          },
          {
            id: "svc-maintenance",
            name: "Maintenance Wash",
            categoryId: "cat-popular",
            categoryLabel: "Most popular",
            description: "A quick touch-up wash for returning clients who want the car cleaned up between major services.",
            price: 89,
            durationMinutes: 60,
            effectiveFlow: "self_book",
            depositAmount: 20,
            leadTimeHours: 0,
            bookingWindowDays: 30,
            bufferMinutes: 10,
            serviceMode: "in_shop",
            featured: false,
            showPrice: true,
            showDuration: true,
            addons: [],
          },
          {
            id: "svc-coating",
            name: "Ceramic Coating Consultation",
            categoryId: "cat-protection",
            categoryLabel: "Protection",
            description: "Request-first consultation for coating prep, expectations, and the right package for the vehicle.",
            price: 0,
            durationMinutes: 45,
            effectiveFlow: "request",
            depositAmount: 0,
            leadTimeHours: 24,
            bookingWindowDays: 45,
            bufferMinutes: 15,
            serviceMode: "in_shop",
            featured: false,
            showPrice: true,
            showDuration: true,
            addons: [],
          },
          {
            id: "svc-interior",
            name: "Interior Reset",
            categoryId: "cat-interior",
            categoryLabel: "Interior",
            description: "Deep vacuum, plastics refresh, glass cleanup, and seat treatment for daily-driver interiors.",
            price: 159,
            durationMinutes: 120,
            effectiveFlow: "self_book",
            depositAmount: 35,
            leadTimeHours: 0,
            bookingWindowDays: 30,
            bufferMinutes: 15,
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
}

test.describe("Marketing screenshots", () => {
  test("weekly-calendar-desktop", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await freezeDate(page, "2026-04-08T10:00:00-07:00");
    await page.goto("/appointments");
    await expect(page.getByRole("heading", { name: "Schedule" }).first()).toBeVisible();
    await captureScreenshot(page, "weekly-calendar-desktop", 960);
  });

  test("calendar-mobile", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await freezeDate(page, "2026-04-08T10:00:00-07:00");
    await page.goto("/calendar?view=month&date=2026-04-08");
    await expect(page.getByRole("heading", { name: /April 2026/i }).first()).toBeVisible();
    await captureScreenshot(page, "mobile-calendar", 760);
  });

  test("booking-mobile", async ({ page }) => {
    await mockBookingMarketingPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/book/biz-booking-marketing");
    await expect(page.getByText("Book with North Star Detail")).toBeVisible();
    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: "What service do you need?" })
    ).toBeVisible();
    await captureScreenshot(page, "mobile-booking-page", 780);
  });

  test("booking-desktop", async ({ page }) => {
    await mockBookingMarketingPage(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/book/biz-booking-marketing");
    await expect(page.getByText("Book with North Star Detail")).toBeVisible();
    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: "What service do you need?" })
    ).toBeVisible();
    await captureScreenshot(page, "desktop-booking-page", 940);
  });

  test("appointment-details-mobile", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/appointments/appt-ceramic-1");
    await expect(page.getByText("Ceramic Coating").first()).toBeVisible();
    await captureScreenshot(page, "appointment-details-mobile", 780);
  });

  test("invoice-quote-desktop", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/invoices/inv-2041");
    await expect(page.getByText("INV-2041")).toBeVisible();
    await captureScreenshot(page, "invoice-quote-desktop", 960);
  });

  test("payment-invoice-mobile", async ({ page }) => {
    await mockMarketingApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/coastline-demo");
    await expect(page.getByText("Customer hub").first()).toBeVisible();
    await captureScreenshot(page, "payment-invoice-mobile", 780);
  });

  test("customer-crm-desktop", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/clients");
    await expect(page.getByRole("link", { name: "Elena Torres" }).first()).toBeVisible();
    await captureScreenshot(page, "customer-crm-desktop", 960);
  });

  test("customer-detail-mobile", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/clients/client-elena");
    await expect(page.getByText("Elena Torres").first()).toBeVisible();
    await captureScreenshot(page, "customer-detail-mobile", 780);
  });

  test("team-access-desktop", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto("/settings");
    const teamTab = page.getByRole("tab", { name: "Team" });
    await expect(teamTab).toBeVisible();
    await teamTab.click();
    await expect(page.getByText("Team & Roles", { exact: true })).toBeVisible();
    await captureScreenshot(page, "team-access-desktop", 960);
  });

  test("team-access-mobile", async ({ page }) => {
    await mockMarketingApp(page);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings");
    const teamTab = page.getByRole("tab", { name: "Team" });
    await expect(teamTab).toBeVisible();
    await teamTab.click();
    await expect(page.getByText("Team & Roles", { exact: true })).toBeVisible();
    await captureScreenshot(page, "team-access-mobile", 780);
  });
});
