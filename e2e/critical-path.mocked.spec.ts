import { expect, test } from "@playwright/test";
import { mockHomeDashboard, permissionsForRole } from "./helpers/mockHomeDashboard";

test.describe.configure({ mode: "serial" });

test.describe("Critical path (mocked)", () => {
  test("sign up, complete onboarding, reach the dashboard, sign out, and sign back in without a backend", async ({ page }) => {
    const user = {
      id: "user-1",
      email: `mocked-smoke-${Date.now()}@example.com`,
      firstName: "Mocked",
      lastName: "Owner",
      token: "mock-token",
    };
    let signedIn = false;
    let business:
      | {
          id: string;
          name: string;
          type: string;
          onboardingComplete: boolean;
        }
      | null = null;

    await mockHomeDashboard(page);

    await page.route("**/api/auth/sign-up", async (route) => {
      signedIn = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            ...user,
            googleProfileId: null,
            hasPassword: true,
          },
        }),
      });
    });

    await page.route("**/api/auth/sign-in", async (route) => {
      signedIn = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            ...user,
            googleProfileId: null,
            hasPassword: true,
          },
        }),
      });
    });

    await page.route("**/api/auth/sign-out", async (route) => {
      signedIn = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.route("**/api/auth/me", async (route) => {
      if (!signedIn) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ message: "Not signed in" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            ...user,
            googleProfileId: null,
            hasPassword: true,
          },
        }),
      });
    });

    await page.route("**/api/auth/context", async (route) => {
      if (!signedIn) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ message: "Not signed in" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            businesses: business
              ? [
                  {
                    id: business.id,
                    name: business.name,
                    type: business.type,
                    role: "owner",
                    status: "active",
                    isDefault: true,
                    permissions: permissionsForRole("owner"),
                  },
                ]
              : [],
            currentBusinessId: business?.id ?? null,
          },
        }),
      });
    });

    await page.route("**/api/users/user-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          googleProfileId: null,
        }),
      });
    });

    await page.route(/.*\/api\/billing\/(status|refresh-state)$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "trialing",
          accessState: "active_trial",
          trialStartedAt: "2026-04-01T12:00:00.000Z",
          trialEndsAt: "2026-05-01T12:00:00.000Z",
          currentPeriodEnd: null,
          billingHasPaymentMethod: false,
          billingPaymentMethodAddedAt: null,
          billingSetupError: null,
          billingSetupFailedAt: null,
          activationMilestone: { reached: false, type: null, occurredAt: null, detail: null },
          billingPrompt: {
            stage: "none",
            visible: false,
            daysLeftInTrial: 14,
            dismissedUntil: null,
            cooldownDays: 5,
          },
          billingEnforced: true,
          checkoutConfigured: true,
          portalConfigured: true,
        }),
      });
    });

    await page.route("**/api/staff**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ records: [] }),
      });
    });

    await page.route("**/api/locations**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ records: [] }),
      });
    });

    await page.route("**/api/businesses**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;

      if (request.method() === "GET" && path.endsWith("/api/businesses")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ records: business ? [business] : [] }),
        });
        return;
      }

      if (request.method() === "POST" && path.endsWith("/api/businesses")) {
        const payload = (request.postDataJSON() ?? {}) as { name?: string; type?: string };
        business = {
          id: "biz-1",
          name: payload.name ?? "Mocked Detail Lab",
          type: payload.type ?? "tire_shop",
          onboardingComplete: false,
        };
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(business),
        });
        return;
      }

      if (request.method() === "POST" && /\/api\/businesses\/[^/]+\/completeOnboarding$/.test(path)) {
        if (!business) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ message: "Business not found" }),
          });
          return;
        }
        business = { ...business, onboardingComplete: true };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ onboardingComplete: true }),
        });
        return;
      }

      if (request.method() === "GET" && /\/api\/businesses\/[^/]+$/.test(path)) {
        if (!business) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ message: "Business not found" }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(business),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unhandled business mock route" }),
      });
    });

    await page.goto("/sign-up");
    await page.locator("#firstName").fill(user.firstName);
    await page.locator("#lastName").fill(user.lastName);
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill("TestPassword123!");
    await page.locator("#confirmPassword").fill("TestPassword123!");
    await page.getByRole("button", { name: /start free trial$/i }).click();

    await page.waitForURL(/\/onboarding/);
    await expect
      .poll(() => page.evaluate(() => window.sessionStorage.getItem("strataSessionAuthToken")))
      .toBeTruthy();

    await page.getByRole("button", { name: /tire shop/i }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await page.locator("#name").fill("Mocked Detail Lab");
    await page.getByRole("button", { name: /launch my workspace|launch/i }).click();

    await page.waitForURL(/\/signed-in/);
    await expect(page.getByRole("heading", { name: /^dashboard$/i }).first()).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("currentBusinessId")))
      .toBe("biz-1");

    await page.locator("header").getByRole("button", { name: /mocked/i }).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await page.waitForURL(/\/sign-in/);

    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill("TestPassword123!");
    await page.getByRole("button", { name: /sign in with email/i }).click();

    await page.waitForURL(/\/signed-in/);
    await expect(page.getByRole("heading", { name: /^dashboard$/i }).first()).toBeVisible();
  });
});
