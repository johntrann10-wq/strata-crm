import { expect, test } from "@playwright/test";
import { readClientDiagnostics } from "./helpers/reliability";

test.describe("Reliability diagnostics", () => {
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
});
