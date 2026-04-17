import { expect, test } from "@playwright/test";

test("public booking page applies branded share metadata without duplicate OG tags", async ({ page, baseURL }) => {
  await page.route("**/api/businesses/biz-share/public-booking-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        businessId: "biz-share",
        businessName: "Coastline Detail Co.",
        businessType: "auto_detailing",
        timezone: "America/Los_Angeles",
        title: "Book online in minutes",
        subtitle: "Choose a service, share your vehicle, and request the right time without the back-and-forth.",
        confirmationMessage: null,
        trustPoints: ["Goes directly to the shop", "Quick follow-up", "Secure and simple"],
        notesPrompt: "Add anything the shop should know.",
        branding: {
          logoUrl: "https://cdn.example.com/coastline-logo.png",
          primaryColorToken: "orange",
          accentColorToken: "amber",
          backgroundToneToken: "ivory",
          buttonStyleToken: "solid",
        },
        defaultFlow: "request",
        requestSettings: {
          requireExactTime: false,
          allowTimeWindows: true,
          allowFlexibility: true,
          allowAlternateSlots: true,
          alternateSlotLimit: 3,
          alternateOfferExpiryHours: 48,
          confirmationCopy: null,
          ownerResponsePageCopy: null,
          alternateAcceptanceCopy: null,
          chooseAnotherDayCopy: null,
        },
        requireEmail: false,
        requirePhone: true,
        requireVehicle: true,
        allowCustomerNotes: true,
        showPrices: true,
        showDurations: true,
        urgencyEnabled: false,
        urgencyText: null,
        availabilityDefaults: {
          dayIndexes: [1, 2, 3, 4, 5],
          openTime: "09:00",
          closeTime: "18:00",
        },
        locations: [],
        services: [
          {
            id: "svc-1",
            name: "Full detail",
            categoryId: "cat-1",
            categoryLabel: "Detailing",
            description: "Interior and exterior detail.",
            price: 275,
            durationMinutes: 180,
            effectiveFlow: "request",
            depositAmount: 0,
            leadTimeHours: 0,
            bookingWindowDays: 30,
            bufferMinutes: 0,
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
            addons: [],
          },
        ],
      }),
    });
  });

  await page.route("**/api/businesses/biz-share/public-booking-share-metadata", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        businessId: "biz-share",
        businessName: "Coastline Detail Co.",
        title: "Book online in minutes | Coastline Detail Co.",
        description: "Choose a service, share your vehicle, and request the right time without the back-and-forth.",
        canonicalPath: "/book/biz-share",
        imagePath: "/api/businesses/biz-share/public-brand-image",
        imageAlt: "Coastline Detail Co. logo for online booking",
      }),
    });
  });

  await page.goto("/book/biz-share?service=svc-1&utm_source=test");
  await expect(page.getByText("Book online in minutes")).toBeVisible();

  await expect(page).toHaveTitle("Book online in minutes | Coastline Detail Co.");

  const ogUrl = page.locator('meta[property="og:url"]');
  const ogImage = page.locator('meta[property="og:image"]');
  const canonical = page.locator('link[rel="canonical"]');

  await expect(ogUrl).toHaveCount(1);
  await expect(ogImage).toHaveCount(1);
  await expect(canonical).toHaveCount(1);

  const expectedUrl = `${baseURL}/book/biz-share?service=svc-1`;
  await expect(ogUrl).toHaveAttribute("content", expectedUrl);
  await expect(canonical).toHaveAttribute("href", expectedUrl);
  await expect(ogImage).toHaveAttribute("content", `${baseURL}/api/businesses/biz-share/public-brand-image`);
});

test("public lead page applies branded share metadata with a clean canonical URL", async ({ page, baseURL }) => {
  await page.route("**/api/businesses/biz-lead/public-lead-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        businessId: "biz-lead",
        businessName: "Northline Auto Spa",
        businessType: "auto_detailing",
        timezone: "America/Los_Angeles",
        leadCaptureEnabled: true,
      }),
    });
  });

  await page.route("**/api/businesses/biz-lead/public-lead-share-metadata", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        businessId: "biz-lead",
        businessName: "Northline Auto Spa",
        title: "Request service | Northline Auto Spa",
        description: "Share a few details so Northline Auto Spa can review the request and follow up with the right next step.",
        canonicalPath: "/lead/biz-lead",
        imagePath: null,
        imageAlt: "Northline Auto Spa logo for service requests",
      }),
    });
  });

  await page.goto("/lead/biz-lead?utm_campaign=spring");
  await expect(page.getByRole("heading", { name: "Tell us what you need" })).toBeVisible();

  await expect(page).toHaveTitle("Request service | Northline Auto Spa");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `${baseURL}/lead/biz-lead`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${baseURL}/lead/biz-lead`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    `${baseURL}/social-preview.png?v=20260416c`
  );
});
