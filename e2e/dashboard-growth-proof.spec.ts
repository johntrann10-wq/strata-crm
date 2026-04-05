import { expect, test } from "@playwright/test";

async function mockDashboard(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("authToken", "dashboard-test-token");
    window.localStorage.setItem("currentBusinessId", "biz-1");
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "user-1",
          email: "owner@example.com",
          firstName: "Owner",
          lastName: "Test",
          token: "dashboard-test-token",
        },
      }),
    });
  });

  await page.route("**/api/auth/context", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          businesses: [
            {
              id: "biz-1",
              name: "QA Detail Shop",
              type: "auto_detailing",
              role: "owner",
              status: "active",
              isDefault: true,
              permissions: [
                "dashboard.view",
                "appointments.read",
                "jobs.read",
                "quotes.read",
                "invoices.read",
                "clients.read",
                "staff.read",
                "activity_logs.read",
              ],
            },
          ],
          currentBusinessId: "biz-1",
        },
      }),
    });
  });

  await page.route("**/api/businesses**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "biz-1",
          name: "QA Detail Shop",
          type: "auto_detailing",
          operatingHours: "Mon-Fri",
          appointmentBufferMinutes: 15,
          defaultTaxRate: 8.25,
        },
      ]),
    });
  });

  await page.route("**/api/users/user-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "user-1",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "Test",
        googleProfileId: null,
      }),
    });
  });

  await page.route("**/api/billing/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "active",
        active: true,
        subscriptionStatus: "active",
        planName: "Pro",
        billingRequired: false,
      }),
    });
  });

  for (const pattern of [
    "**/api/appointments**",
    "**/api/invoices**",
    "**/api/quotes**",
    "**/api/jobs**",
    "**/api/staff**",
    "**/api/clients**",
    "**/api/vehicles**",
    "**/api/services**",
    "**/api/locations**",
    "**/api/activity-logs**",
  ]) {
    await page.route(pattern, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
  }

  await page.route("**/api/actions/getBusinessPreset", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ group: "detailing", count: 0, names: [] }),
    });
  });

  await page.route("**/api/actions/getGrowthMetrics", async (route) => {
    const requestBody = route.request().postDataJSON() as { periodDays?: number | null } | null;
    const periodDays = requestBody?.periodDays ?? null;
    const revenue = periodDays === 90 ? 1800 : periodDays === 30 ? 950 : 2600;
    const share = periodDays === 90 ? 67 : periodDays === 30 ? 58 : 61;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        periodDays,
        totalLeads: periodDays === 90 ? 18 : periodDays === 30 ? 9 : 42,
        convertedLeadCount: periodDays === 90 ? 8 : periodDays === 30 ? 4 : 17,
        bookedLeadCount: periodDays === 90 ? 10 : periodDays === 30 ? 5 : 24,
        closeRate: periodDays === 90 ? 44 : periodDays === 30 ? 44 : 40,
        bookingRate: periodDays === 90 ? 56 : periodDays === 30 ? 56 : 57,
        averageFirstResponseHours: periodDays === 90 ? 3.4 : periodDays === 30 ? 1.8 : 2.7,
        totalPayingCustomers: periodDays === 90 ? 12 : periodDays === 30 ? 7 : 25,
        repeatCustomerCount: periodDays === 90 ? 4 : periodDays === 30 ? 2 : 10,
        repeatCustomerRate: periodDays === 90 ? 33 : periodDays === 30 ? 29 : 40,
        attributedRevenue: revenue,
        unattributedRevenue: periodDays === 30 ? 120 : 200,
        returningRevenue: periodDays === 90 ? 700 : periodDays === 30 ? 320 : 1100,
        newCustomerRevenue: periodDays === 90 ? 1100 : periodDays === 30 ? 630 : 1500,
        recentWeeks: [
          {
            label: "Mar 10",
            leadCount: 4,
            convertedCount: 2,
            bookedCount: 2,
            closeRate: 50,
            bookingRate: 50,
            averageFirstResponseHours: 2.1,
          },
          {
            label: "Mar 17",
            leadCount: 3,
            convertedCount: 1,
            bookedCount: 2,
            closeRate: 33,
            bookingRate: 67,
            averageFirstResponseHours: 1.7,
          },
          {
            label: "Mar 24",
            leadCount: 5,
            convertedCount: 2,
            bookedCount: 3,
            closeRate: 40,
            bookingRate: 60,
            averageFirstResponseHours: 2.2,
          },
          {
            label: "Mar 31",
            leadCount: 6,
            convertedCount: 3,
            bookedCount: 3,
            closeRate: 50,
            bookingRate: 50,
            averageFirstResponseHours: 1.9,
          },
        ],
        revenueBySource: [
          {
            source: "google",
            leadCount: 6,
            convertedCount: 3,
            bookedCount: 4,
            closeRate: 50,
            bookingRate: 67,
            averageFirstResponseHours: 1.4,
            revenue,
            shareOfRevenue: share,
          },
          {
            source: "instagram",
            leadCount: 3,
            convertedCount: 1,
            bookedCount: 1,
            closeRate: 33,
            bookingRate: 33,
            averageFirstResponseHours: 2.6,
            revenue: periodDays === 90 ? 500 : periodDays === 30 ? 420 : 900,
            shareOfRevenue: periodDays === 90 ? 19 : periodDays === 30 ? 26 : 21,
          },
          {
            source: "referral",
            leadCount: 2,
            convertedCount: 1,
            bookedCount: 1,
            closeRate: 50,
            bookingRate: 50,
            averageFirstResponseHours: 1.1,
            revenue: periodDays === 90 ? 400 : periodDays === 30 ? 280 : 650,
            shareOfRevenue: periodDays === 90 ? 15 : periodDays === 30 ? 16 : 18,
          },
        ],
      }),
    });
  });
}

test("growth proof switches revenue-by-source windows", async ({ page }) => {
  await mockDashboard(page);

  await page.goto("/signed-in");

  await expect(page.getByText("Growth Proof", { exact: true })).toBeVisible();
  await expect(page.getByText("Source scorecard", { exact: true })).toBeVisible();
  const attributedRevenueCard = page.getByRole("link", { name: /Attributed Revenue/i });
  const growthSection = page.locator("section").filter({ has: page.getByText("Growth Proof", { exact: true }) }).first();
  await expect(attributedRevenueCard).toBeVisible();
  await expect(growthSection.getByText("Last 30 days", { exact: true }).first()).toBeVisible();
  await expect(attributedRevenueCard).toContainText("$950.00");
  await expect(page.getByText("58% share")).toBeVisible();
  await expect(page.getByText("Top revenue source", { exact: true })).toBeVisible();
  await expect(page.getByText("Google", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Fast follow-up", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Needs tightening", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "90D" }).click();
  await expect(growthSection.getByText("Last 90 days", { exact: true }).first()).toBeVisible();
  await expect(attributedRevenueCard).toContainText("$1,800.00");
  await expect(page.getByText("67% share")).toBeVisible();

  await page.getByRole("button", { name: "All time" }).click();
  await expect(growthSection.locator('span[data-slot="badge"]').filter({ hasText: "All time" }).first()).toBeVisible();
  await expect(attributedRevenueCard).toContainText("$2,600.00");
});
