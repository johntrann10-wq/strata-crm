import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const skipLocalWindowsDashboard = process.platform === "win32" && !process.env.PLAYWRIGHT_API_BASE;

async function finishOnboarding(page: import("@playwright/test").Page) {
  await expect(page.getByRole("button", { name: /tire shop/i })).toBeVisible();
  await page.getByRole("button", { name: /tire shop/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.locator("#name")).toBeVisible();
  await page.locator("#name").fill(`Dashboard Smoke ${Date.now()}`);
  await page.getByRole("button", { name: /launch|finish setup/i }).click();
  await page.waitForURL(/\/(signed-in|subscribe)/);

  const skipBilling = page.getByRole("button", { name: /i&apos;ll subscribe later|i'll subscribe later/i });
  if (await skipBilling.isVisible().catch(() => false)) {
    await skipBilling.click();
  }

  await expect(page).toHaveURL(/\/signed-in/);
}

test.describe("Dashboard home", () => {
  test("shows the control tower layout and preserves range state in the URL", async ({ page }) => {
    test.skip(
      skipLocalWindowsDashboard,
      "The local dashboard smoke uses the embedded backend, which is unreliable on native Windows. Run in WSL/CI or set PLAYWRIGHT_API_BASE."
    );

    const email = `dashboard-smoke-${Date.now()}@example.com`;
    const password = "TestPassword123!";

    await page.goto("/sign-up");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign up with email/i }).click();
    await page.waitForFunction(() => window.localStorage.getItem("authToken"), null, { timeout: 20000 });
    await page.goto("/onboarding");
    await finishOnboarding(page);

    await expect(page.getByRole("heading", { name: /^dashboard$/i })).toBeVisible();
    await expect(page.getByText("Needs Action")).toBeVisible();
    await expect(page.getByText("Today Schedule")).toBeVisible();
    await expect(page.getByText("Action Queue")).toBeVisible();
    await expect(page.getByText("Quick Actions")).toBeVisible();
    await expect(page.getByText("Revenue + Collections")).toBeVisible();

    await page.getByRole("button", { name: /this week/i }).click();
    await expect(page).toHaveURL(/range=week/);

    await page.getByRole("button", { name: /this month/i }).click();
    await expect(page).toHaveURL(/range=month/);
  });
});
