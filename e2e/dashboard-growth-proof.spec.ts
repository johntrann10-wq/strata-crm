import { expect, test, type Page } from "@playwright/test";
import { mockHomeDashboard, permissionsForRole } from "./helpers/mockHomeDashboard";

const BUSINESS_ID = "biz-1";

async function mockDashboardWorkspace(page: Page) {
  await page.addInitScript(({ businessId }) => {
    window.localStorage.setItem("authToken", "dashboard-test-token");
    window.localStorage.setItem("currentBusinessId", businessId);
  }, { businessId: BUSINESS_ID });

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
              id: BUSINESS_ID,
              name: "QA Detail Shop",
              type: "auto_detailing",
              role: "owner",
              status: "active",
              isDefault: true,
              permissions: permissionsForRole("owner"),
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
      body: JSON.stringify({
        id: "user-1",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "Test",
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

  await page.route("**/api/businesses/biz-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: BUSINESS_ID,
        name: "QA Detail Shop",
        type: "auto_detailing",
        operatingHours: "Mon-Fri",
        appointmentBufferMinutes: 15,
        defaultTaxRate: 8.25,
      }),
    });
  });

  await page.route("**/api/staff**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        records: [
          {
            id: "staff-1",
            userId: "user-1",
            firstName: "Owner",
            lastName: "Test",
          },
        ],
      }),
    });
  });

  await page.route("**/api/locations**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ records: [] }),
    });
  });

  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ records: [] }),
    });
  });

  await page.route("**/api/notifications/unread-count", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total: 0, leads: 0, calendar: 0 }),
    });
  });

  await mockHomeDashboard(page, { role: "owner" });
}

test("dashboard range controls keep the v2 control tower visible across windows", async ({ page }) => {
  await mockDashboardWorkspace(page);

  await page.goto("/signed-in");

  const main = page.getByRole("main");

  await expect(main.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(main.getByText("Weekly Appointment Overview", { exact: true })).toBeVisible();
  await expect(main.getByText("Monthly Revenue", { exact: true })).toBeVisible();
  await expect(main.getByText("Bookings today", { exact: true })).toBeVisible();
  await expect(main.getByText("Revenue this month", { exact: true })).toBeVisible();

  const thisWeekButton = page.getByRole("button", { name: "This week" });
  const thisMonthButton = page.getByRole("button", { name: "This month" });

  await thisWeekButton.click();
  await expect(page).toHaveURL(/range=week/);
  await expect(thisWeekButton).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByText("Weekly Appointment Overview", { exact: true })).toBeVisible();

  await thisMonthButton.click();
  await expect(page).toHaveURL(/range=month/);
  await expect(thisMonthButton).toHaveAttribute("aria-pressed", "true");
  await expect(main.getByText("Monthly Revenue", { exact: true })).toBeVisible();
});
