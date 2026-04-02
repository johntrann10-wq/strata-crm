import { expect, test } from "@playwright/test";

test.describe("Mobile auth flow", () => {
  test("sign-in form is fast to use on mobile and handles success cleanly", async ({ page }) => {
    await page.route("**/api/auth/sign-in", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "user_mobile",
            email: "owner@example.com",
            firstName: "Mobile",
            lastName: "Owner",
            token: "mobile-token",
          },
        }),
      });
    });
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "user_mobile",
            email: "owner@example.com",
            firstName: "Mobile",
            lastName: "Owner",
            token: "mobile-token",
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
            currentBusinessId: "biz_mobile",
            businesses: [
              {
                id: "biz_mobile",
                name: "Mobile Smoke Shop",
                type: "auto_detailing",
                role: "owner",
                status: "active",
                isDefault: true,
                permissions: ["settings.write", "clients.write"],
              },
            ],
          },
        }),
      });
    });
    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/auth/sign-in") || url.includes("/api/auth/me") || url.includes("/api/auth/context")) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ records: [] }),
      });
    });

    await page.goto("/sign-in");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();

    await page.locator("#email").fill("owner@example.com");
    await page.locator("#password").fill("TestPassword123!");
    await page.getByRole("button", { name: /sign in with email/i }).click();

    await page.waitForURL(/\/(signed-in|onboarding)/);
    const pathname = new URL(page.url()).pathname;

    if (pathname.includes("/onboarding")) {
      await expect(
        page.getByRole("heading", {
          name: /choose your shop type|launch your workspace/i,
        }).first()
      ).toBeVisible();
      return;
    }

    await expect(page).toHaveURL(/\/signed-in/);
    await expect(page.getByRole("heading", { name: /something went wrong/i })).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
  });
});
