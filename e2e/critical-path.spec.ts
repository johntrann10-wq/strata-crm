/**
 * E2E critical path: sign-in → app shell → (booking → invoice → payment flow requires full app + API).
 * Run with: yarn test:e2e (ensure yarn dev and yarn dev:backend are running).
 */
import { test, expect } from "@playwright/test";

test.describe("Critical path", () => {
  test("health and sign-in page load", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Strata/i);
  });

  test("sign-in page has form", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("unauthenticated redirect to sign-in from app", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/sign-in/);
  });
});
