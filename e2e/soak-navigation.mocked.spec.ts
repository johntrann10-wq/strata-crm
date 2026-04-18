import { expect, test } from "@playwright/test";
import { mockHomeDashboard } from "./helpers/mockHomeDashboard";
import { mockClientVehicleApp, signIn } from "./helpers/clientVehicleFlow";
import { clearClientDiagnostics, expectNoClientDiagnostics } from "./helpers/reliability";

test.describe("Navigation soak (mocked)", () => {
  test("repeatedly navigates core workspaces without client-side reliability events", async ({ page }) => {
    test.setTimeout(120000);

    await mockClientVehicleApp(page);
    await mockHomeDashboard(page);
    await signIn(page);
    await page.goto("/signed-in");
    await expect(page.locator("main")).toBeVisible();
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
