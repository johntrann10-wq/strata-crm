import { test, expect } from "@playwright/test";

const email = process.env.PLAYWRIGHT_SMOKE_EMAIL ?? "";
const password = process.env.PLAYWRIGHT_SMOKE_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

test.describe("Live auth smoke", () => {
  async function completeOnboardingIfNeeded(page: import("@playwright/test").Page) {
    const onboardingHeading = page.getByRole("heading", { name: /choose your shop type/i });
    if (!(await onboardingHeading.isVisible().catch(() => false))) return;

    await page.getByRole("button", { name: /tire shop/i }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.locator("#name")).toBeVisible();
    await page.locator("#name").fill("Live Smoke Tire Shop");
    await page.getByRole("button", { name: /launch|finish setup/i }).click();
    await page.waitForTimeout(3000);
    // eslint-disable-next-line no-console
    console.log("post-onboarding url:", page.url());
    // eslint-disable-next-line no-console
    console.log(
      "post-onboarding auth:",
      await page.evaluate(() => ({
        token: window.localStorage.getItem("authToken"),
        businessId: window.localStorage.getItem("currentBusinessId"),
      }))
    );
    await page.waitForURL(/\/signed-in/);
  }

  test.beforeAll(() => {
    if (!email || !password) {
      test.skip(true, "PLAYWRIGHT_SMOKE_EMAIL and PLAYWRIGHT_SMOKE_PASSWORD are required.");
    }
  });

  test("sign in, navigate core screens, reload, and sign out", async ({ page }) => {
    test.setTimeout(120000);
    page.on("response", async (response) => {
      if (!response.url().includes("/api/")) return;
      if (response.status() < 400) return;
      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "<unreadable>";
      }
      // eslint-disable-next-line no-console
      console.log("API failure", response.status(), response.url(), body);
    });

    await page.goto("/sign-in");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();

    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in with email/i }).click();

    await page.waitForURL(/\/(signed-in|onboarding)/);
    await page.waitForLoadState("networkidle");
    await completeOnboardingIfNeeded(page);

    await expect(page).toHaveURL(/\/signed-in/);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

    await page.goto("/clients");
    await page.waitForLoadState("networkidle");
    await completeOnboardingIfNeeded(page);
    await expect(page).toHaveURL(/\/clients/);
    await expect(page.getByRole("heading", { name: /clients/i })).toBeVisible();

    await page.goto("/vehicles");
    await expect(page).toHaveURL(/\/vehicles/);
    await expect(page.getByRole("heading", { name: /vehicles/i })).toBeVisible();

    await page.goto("/appointments");
    await expect(page).toHaveURL(/\/appointments/);
    await expect(page.getByRole("heading", { name: /schedule/i })).toBeVisible();

    await page.goto("/calendar");
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.getByRole("heading", { name: /calendar/i })).toBeVisible();

    await page.goto("/invoices");
    await expect(page).toHaveURL(/\/invoices/);
    await expect(page.getByRole("heading", { name: /invoices/i })).toBeVisible();

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();

    await page.getByRole("button", { name: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.locator("#email")).toBeVisible();
  });
});
