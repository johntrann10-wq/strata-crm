/**
 * Minimal critical-path smoke coverage for the app.
 *
 * Run with:
 * - `yarn dev` (frontend)
 * - `cd backend && yarn dev` (API)
 * - `yarn test:e2e`
 */
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

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

    // Sign-up doesn't navigate by itself; continue to onboarding directly.
    await page.waitForFunction(() => window.localStorage.getItem("authToken"), null, { timeout: 20000 });
    const tokenAfterSignUp = await page.evaluate(() => window.localStorage.getItem("authToken"));
    expect(tokenAfterSignUp).toBeTruthy();
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/onboarding/);

    // 2) Onboarding (UI)
    await expect(page.getByRole("button", { name: /tire shop/i })).toBeVisible();
    await page.getByRole("button", { name: /tire shop/i }).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.locator("#staffCount")).toBeVisible();
    await page.locator("#staffCount").fill("1");
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.locator("#name")).toBeVisible();
    await page.locator("#name").fill("E2E Smoke Shop");
    await page.getByRole("button", { name: /launch my shop/i }).click();
    await expect(page).toHaveURL(/signed-in/);
    await expect(page.getByText(/Smart Insights/i)).toBeVisible();

    // Read token from localStorage (auth is bearer token based).
    const token = await page.evaluate(() => window.localStorage.getItem("authToken"));
    expect(token).toBeTruthy();

    // 3) Create client (API setup), then verify via UI
    const clientEmail = `client-${Date.now()}@example.com`;
    const clientRes = await request
      .post(`${apiBase}/api/clients`)
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "E2E", lastName: "Client", email: clientEmail });
    expect(clientRes.status()).toBe(201);
    const clientId = (await clientRes.json()).id as string;

    // 4) Create appointment (API setup), then verify via UI
    const vehicleRes = await request
      .post(`${apiBase}/api/vehicles`)
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId, make: "Honda", model: "Civic", year: 2020 });
    expect(vehicleRes.status()).toBe(201);
    const vehicleId = (await vehicleRes.json()).id as string;

    const start = new Date();
    start.setDate(start.getDate() + 2);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const appointmentTitle = `E2E Appointment ${Date.now()}`;
    const appointmentRes = await request
      .post(`${apiBase}/api/appointments`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId,
        vehicleId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        title: appointmentTitle,
      });
    expect(appointmentRes.status()).toBe(201);
    const appointmentId = (await appointmentRes.json()).id as string;
    expect(appointmentId).toBeTruthy();

    await page.goto("/clients");
    await expect(page.getByText(/E2E Client/i)).toBeVisible();

    await page.goto("/appointments");
    await expect(page.getByText(appointmentTitle)).toBeVisible();

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

    await expect(page).toHaveURL(/signed-in/);
    await expect(page.getByText(/Smart Insights/i)).toBeVisible();
  });

  test("unauthenticated redirect to sign-in from app shell", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/sign-in/);
  });
});
