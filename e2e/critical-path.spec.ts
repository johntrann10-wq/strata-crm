/**
 * Minimal critical-path smoke coverage for the app.
 *
 * Run with:
 * - `npm run dev` (frontend)
 * - `npm --prefix backend run dev:with-db` (API)
 * - `npm run test:e2e`
 */
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function completeOnboardingIfNeeded(page: import("@playwright/test").Page) {
  await page.waitForURL(/\/(onboarding|signed-in)/, { timeout: 20000 });
  if (/\/signed-in/.test(page.url())) return;

  await page.waitForFunction(() => {
    const bodyText = document.body?.innerText ?? "";
    return /choose your shop type/i.test(bodyText) || /launch your workspace/i.test(bodyText) || !!document.querySelector("#name");
  }, null, { timeout: 20000 });

  const shopTypeHeading = page.getByRole("heading", { name: /choose your shop type/i });
  if (await shopTypeHeading.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /tire shop/i }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
  }

  await expect(page.locator("#name")).toBeVisible();
  await page.locator("#name").fill("E2E Smoke Shop");
  await page.getByRole("button", { name: /launch my workspace|launch|finish setup/i }).click();
  await page.waitForURL(/\/signed-in/, { timeout: 20000 });
}

test.describe("Critical path (smoke)", () => {
  test("sign up → onboarding → dashboard → create client/appointment → logout → sign in", async ({ page, request }) => {
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
    await page.getByRole("button", { name: /sign up with email/i }).click();

    // 2) Onboarding (UI)
    await completeOnboardingIfNeeded(page);
    await expect.poll(() => page.evaluate(() => !!window.localStorage.getItem("currentBusinessId"))).toBe(true);

    // Read token from localStorage (auth is bearer token based).
    const authContext = await page.evaluate(() => ({
      authToken: window.localStorage.getItem("authToken"),
      currentBusinessId: window.localStorage.getItem("currentBusinessId"),
    }));
    expect(authContext.authToken).toBeTruthy();
    expect(authContext.currentBusinessId).toBeTruthy();
    const authHeaders = {
      Authorization: `Bearer ${authContext.authToken}`,
      "x-business-id": authContext.currentBusinessId ?? "",
    };

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

    await page.goto(`/clients/${clientId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1, name: /E2E Client/i })).toBeVisible();

    await page.goto(`/appointments/${appointmentId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(appointmentTitle).first()).toBeVisible();

    // 5) Logout (UI)
    await page.getByRole("button", { name: /@example\.com$/i }).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/sign-in/);

    // 6) Sign in again (UI)
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in with email/i }).click();

    await completeOnboardingIfNeeded(page);
    await expect(page).toHaveURL(/signed-in/);
    await expect.poll(() => page.evaluate(() => !!window.localStorage.getItem("currentBusinessId"))).toBe(true);
  });

  test("unauthenticated redirect to sign-in from app shell", async ({ page }) => {
    await page.goto("/signed-in");
    await expect(page).toHaveURL(/sign-in/);
  });
});
