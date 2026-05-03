/**
 * Minimal critical-path smoke coverage for the app.
 *
 * Run with:
 * - `yarn dev` (frontend)
 * - `cd backend && yarn dev` (API)
 * - `yarn test:e2e`
 */
import { test, expect, type APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const skipLocalWindowsCriticalPath = process.platform === "win32" && !process.env.PLAYWRIGHT_API_BASE;

async function expectWorkspaceReady(page: import("@playwright/test").Page) {
  await page.waitForURL(/\/signed-in/);
  await expect(page).toHaveURL(/\/signed-in/);
  await expect(page.getByRole("heading", { name: /^dashboard$/i }).first()).toBeVisible();
}

async function getAuthenticatedApiContext(
  page: import("@playwright/test").Page
): Promise<{ request: APIRequestContext; headers: Record<string, string> }> {
  const session = await page.evaluate(() => ({
    currentBusinessId: window.localStorage.getItem("currentBusinessId"),
    authToken:
      window.sessionStorage.getItem("strataSessionAuthToken") ??
      window.localStorage.getItem("strataPersistentAuthToken") ??
      window.localStorage.getItem("authToken"),
  }));
  const currentBusinessId = session.currentBusinessId;
  expect(currentBusinessId).toBeTruthy();
  expect(session.authToken).toBeTruthy();
  return {
    request: page.context().request,
    headers: {
      ...(currentBusinessId ? { "x-business-id": currentBusinessId } : {}),
      ...(session.authToken ? { Authorization: `Bearer ${session.authToken}` } : {}),
    },
  };
}

test.describe("Critical path (smoke)", () => {
  test("sign up → onboarding → dashboard → create client/appointment → logout → sign in", async ({ page }) => {
    test.skip(
      skipLocalWindowsCriticalPath,
      "Full-stack critical path uses embedded Postgres, which is unreliable on native Windows. Run this smoke in WSL/CI or set PLAYWRIGHT_API_BASE to an external backend."
    );
    test.setTimeout(60000);
    const apiBase = process.env.PLAYWRIGHT_API_BASE ?? process.env.API_BASE ?? "http://localhost:3001";

    const email = `e2e-smoke-${Date.now()}@example.com`;
    const password = "TestPassword123!";

    // 1) Sign up (UI)
    await page.goto("/sign-up");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("#confirmPassword").fill(password);
    await page.getByRole("button", { name: /start free trial/i }).last().click();

    // Sign-up now lands inside the onboarding experience, so wait for the first step
    // instead of a particular localStorage timing side effect.
    await expect(page.getByRole("button", { name: /tire shop/i })).toBeVisible({ timeout: 20000 });

    // 2) Onboarding (UI)
    await page.getByRole("button", { name: /tire shop/i }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.locator("#name")).toBeVisible();
    await page.locator("#name").fill("E2E Smoke Shop");
    await page.getByRole("button", { name: /launch my workspace|launch/i }).click();
    await expectWorkspaceReady(page);

    const { request, headers: authHeaders } = await getAuthenticatedApiContext(page);

    // 3) Create client (API setup), then verify via UI
    const clientEmail = `client-${Date.now()}@example.com`;
    const clientRes = await request.post(`${apiBase}/api/clients`, {
      headers: authHeaders,
      data: { firstName: "E2E", lastName: "Client", email: clientEmail },
    });
    expect(clientRes.status()).toBe(201);
    const clientId = (await clientRes.json()).id as string;

    // 4) Create appointment (API setup), then verify via UI
    const vehicleRes = await request.post(`${apiBase}/api/vehicles`, {
      headers: authHeaders,
      data: { clientId, make: "Honda", model: "Civic", year: 2020 },
    });
    expect(vehicleRes.status()).toBe(201);
    const vehicleId = (await vehicleRes.json()).id as string;

    const start = new Date();
    start.setDate(start.getDate() + 2);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const appointmentTitle = `E2E Appointment ${Date.now()}`;
    const appointmentRes = await request.post(`${apiBase}/api/appointments`, {
      headers: authHeaders,
      data: {
        clientId,
        vehicleId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        title: appointmentTitle,
      },
    });
    expect(appointmentRes.status()).toBe(201);
    const appointmentId = (await appointmentRes.json()).id as string;
    expect(appointmentId).toBeTruthy();

    await page.goto("/clients");
    await expect(page.getByRole("link", { name: /E2E Client/i }).first()).toBeVisible();

    await page.goto("/appointments");
    await expect(page.getByText(appointmentTitle).first()).toBeVisible();

    // 5) Logout (UI)
    await page.getByRole("button", { name: /^[a-z]$/i }).last().click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/sign-in/);

    // 6) Sign in again (UI)
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in with email/i }).click();
    await expectWorkspaceReady(page);
  });

  test("unauthenticated redirect to sign-in from app shell", async ({ page }) => {
    await page.goto("/signed-in");
    await expect(page).toHaveURL(/sign-in/);
  });
});
