import { expect, test } from "@playwright/test";
import { readClientDiagnostics } from "./helpers/reliability";

test.describe("Reliability diagnostics", () => {
  async function mockAuthenticatedShell(context: import("@playwright/test").BrowserContext) {
    await context.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "user-1",
            email: "owner@example.com",
            firstName: "Owner",
            lastName: "Test",
            token: "qa-token",
          },
        }),
      });
    });

    await context.route("**/api/auth/context", async (route) => {
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
                permissions: ["*"],
              },
            ],
            currentBusinessId: "biz-1",
          },
        }),
      });
    });

    await context.route("**/api/users/user-1", async (route) => {
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

    await context.route("**/api/businesses/biz-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "biz-1",
          name: "QA Detail Shop",
          type: "auto_detailing",
          onboardingComplete: true,
        }),
      });
    });

    await context.route("**/api/billing/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "active",
          trialEndsAt: null,
          currentPeriodEnd: null,
          billingEnforced: true,
          checkoutConfigured: true,
          portalConfigured: true,
        }),
      });
    });

    await context.route("**/api/locations**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ records: [] }),
      });
    });

    await context.route("**/api/auth/sign-out", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
  }

  test("records network failures honestly on sign in", async ({ page }) => {
    await page.route("**/api/auth/sign-in", async (route) => {
      await route.abort("failed");
    });

    await page.goto("/sign-in");
    await page.locator("#email").fill("owner@example.com");
    await page.locator("#password").fill("TestPassword123!");
    await page.getByRole("button", { name: /sign in with email/i }).click();

    await expect(page.getByText(/cannot reach the api/i)).toBeVisible();

    const diagnostics = await readClientDiagnostics(page);
    expect(diagnostics.reliabilityDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "api.network",
          path: "/auth/sign-in",
          method: "POST",
        }),
      ])
    );
  });

  test("records malformed JSON instead of failing silently", async ({ page }) => {
    await page.route("**/api/auth/sign-in", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"data":',
      });
    });

    await page.goto("/sign-in");
    await page.locator("#email").fill("owner@example.com");
    await page.locator("#password").fill("TestPassword123!");
    await page.getByRole("button", { name: /sign in with email/i }).click();

    await expect(page.getByText(/invalid json from server/i)).toBeVisible();

    const diagnostics = await readClientDiagnostics(page);
    expect(diagnostics.reliabilityDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "api.parse",
          path: "/auth/sign-in",
          method: "POST",
        }),
      ])
    );
  });

  test("clears stale auth and returns to sign in when session is invalid", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("authToken", "stale-token");
      window.localStorage.setItem("currentBusinessId", "stale-business");
    });

    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Session expired" }),
      });
    });
    await page.route("**/api/auth/context", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Session expired" }),
      });
    });

    await page.goto("/signed-in");
    await expect(page).toHaveURL(/\/sign-in/);

    const diagnostics = await readClientDiagnostics(page);
    expect(diagnostics.reliabilityDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "auth.invalid",
          path: "/auth/me",
          method: "GET",
          status: 401,
        }),
      ])
    );
  });

  test("propagates sign-out across tabs so protected screens do not drift", async ({ context }) => {
    await mockAuthenticatedShell(context);

    const setup = await context.newPage();
    await setup.goto("/sign-in");
    await setup.evaluate(() => {
      window.localStorage.setItem("authToken", "qa-token");
      window.localStorage.setItem("currentBusinessId", "biz-1");
    });
    await setup.close();

    const primary = await context.newPage();
    const secondary = await context.newPage();

    await primary.goto("/profile");
    await secondary.goto("/profile");

    await expect(primary.getByRole("heading", { level: 1, name: /^profile$/i })).toBeVisible();
    await expect(secondary.getByRole("heading", { level: 1, name: /^profile$/i })).toBeVisible();

    await primary.locator("header").getByRole("button", { name: /owner/i }).click();
    await primary.getByRole("menuitem", { name: /sign out/i }).click();

    await expect(primary).toHaveURL(/\/sign-in/);
    await expect(secondary).toHaveURL(/\/sign-in/);

    await expect
      .poll(async () =>
        secondary.evaluate(() => ({
          token: window.localStorage.getItem("authToken"),
          businessId: window.localStorage.getItem("currentBusinessId"),
        }))
      )
      .toEqual({ token: null, businessId: null });
  });
});
