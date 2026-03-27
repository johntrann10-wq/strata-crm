import { expect, test } from "@playwright/test";
import { clearClientDiagnostics, expectNoClientDiagnostics } from "./helpers/reliability";

const email = process.env.PLAYWRIGHT_SMOKE_EMAIL ?? "";
const password = process.env.PLAYWRIGHT_SMOKE_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await expect(page.locator("#email")).toBeVisible();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(signed-in|onboarding)/);
  await page.waitForLoadState("networkidle");
}

test.describe("Navigation soak", () => {
  test.beforeAll(() => {
    if (!email || !password) {
      test.skip(true, "PLAYWRIGHT_SMOKE_EMAIL and PLAYWRIGHT_SMOKE_PASSWORD are required.");
    }
  });

  test("repeatedly navigates core workspaces without client-side reliability events", async ({ page }) => {
    test.setTimeout(180000);

    await signIn(page);
    await clearClientDiagnostics(page);

    const routes = [
      "/signed-in",
      "/leads",
      "/clients",
      "/appointments",
      "/calendar",
      "/quotes",
      "/invoices",
      "/settings",
    ];

    for (let loop = 0; loop < 2; loop += 1) {
      for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("main")).toBeVisible();
      }
    }

    await expectNoClientDiagnostics(page);
  });
});
