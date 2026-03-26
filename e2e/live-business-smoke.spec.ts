import { test, expect, type Page } from "@playwright/test";

const email = process.env.PLAYWRIGHT_SMOKE_EMAIL ?? "";
const password = process.env.PLAYWRIGHT_SMOKE_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

async function completeOnboardingIfNeeded(page: Page) {
  const onboardingHeading = page.getByRole("heading", { name: /choose your shop type/i });
  if (!(await onboardingHeading.isVisible().catch(() => false))) return;

  await page.getByRole("button", { name: /tire shop/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.locator("#name")).toBeVisible();
  await page.locator("#name").fill(`Live Smoke ${Date.now()}`);
  await page.getByRole("button", { name: /launch|finish setup/i }).click();
  await page.waitForURL(/\/signed-in/);
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await expect(page.locator("#email")).toBeVisible();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(signed-in|onboarding)/);
  await page.waitForLoadState("networkidle");
  await completeOnboardingIfNeeded(page);
  await expect(page).toHaveURL(/\/signed-in/);
}

async function waitForPathname(page: Page, matcher: RegExp) {
  await page.waitForFunction(
    ({ source, flags }) => {
      const pattern = new RegExp(source, flags);
      return pattern.test(window.location.pathname);
    },
    { source: matcher.source, flags: matcher.flags }
  );
}

async function clickFirstService(page: Page) {
  const recommendedPackage = page
    .locator("main")
    .getByRole("button")
    .filter({ hasText: /services/i })
    .first();

  if (await recommendedPackage.isVisible().catch(() => false)) {
    await recommendedPackage.click();
    return;
  }

  const serviceCheckbox = page.locator("main").getByRole("checkbox").first();
  await expect(serviceCheckbox).toBeVisible();
  await serviceCheckbox.click();
}

async function ensureActiveService(page: Page): Promise<boolean> {
  const result = await page.evaluate(async () => {
    try {
      const token = window.localStorage.getItem("authToken");
      const businessId = window.localStorage.getItem("currentBusinessId");
      if (!token || !businessId) {
        return { ok: false, reason: "missing auth context" };
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const base = "https://strata-crm-production.up.railway.app/api";
      const filter = encodeURIComponent(
        JSON.stringify({
          businessId: { equals: businessId },
          active: { equals: true },
        })
      );

      const listResp = await fetch(`${base}/services?filter=${filter}&first=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listBody = await listResp.json().catch(() => ({}));
      const existing = Array.isArray(listBody?.records) ? listBody.records[0] : null;
      if (existing?.id) {
        return { ok: true, created: false, id: existing.id };
      }

      const createResp = await fetch(`${base}/services`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Smoke Test Service",
          price: 149,
          durationMinutes: 120,
          active: true,
        }),
      });
      const createBody = await createResp.json().catch(() => ({}));
      return {
        ok: createResp.ok,
        created: true,
        status: createResp.status,
        id: createBody?.id ?? null,
        body: createBody,
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // eslint-disable-next-line no-console
  console.log("ensureActiveService", result);
  if (!result?.ok) {
    if (result?.status === 503 || /failed to fetch/i.test(String(result?.reason ?? ""))) {
      return false;
    }
    throw new Error(`Unable to seed service for smoke: ${JSON.stringify(result)}`);
  }
  await page.reload();
  return true;
}

test.describe("Live business workflow smoke", () => {
  test.beforeAll(() => {
    if (!email || !password) {
      test.skip(true, "PLAYWRIGHT_SMOKE_EMAIL and PLAYWRIGHT_SMOKE_PASSWORD are required.");
    }
  });

  test("create core records and exercise quote/invoice delivery flows", async ({ page, context }) => {
    test.setTimeout(300000);

    const failures: string[] = [];
    const notes: string[] = [];
    const stamp = Date.now();
    const clientFirst = "Smoke";
    const clientLast = `Flow${String(stamp).slice(-6)}`;
    const clientEmail = `smoke+${stamp}@example.com`;
    const clientPhone = "555-010-1234";
    let clientId = "";
    let vehicleId = "";
    let appointmentId = "";
    let quoteId = "";
    let invoiceId = "";
    let servicesAvailable = false;

    page.on("response", async (response) => {
      if (!response.url().includes("/api/")) return;
      if (response.status() < 400) return;
      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "<unreadable>";
      }
      // eslint-disable-next-line no-console
      console.log("API failure", response.status(), response.url(), body);
    });
    page.on("pageerror", (error) => {
      // eslint-disable-next-line no-console
      console.log("page error", error.message);
    });

    await signIn(page);

    await test.step("Create client", async () => {
      await page.goto("/clients/new");
      await expect(page.locator("#firstName")).toBeVisible();
      await page.locator("#firstName").fill(clientFirst);
      await page.locator("#lastName").fill(clientLast);
      await page.locator("#email").fill(clientEmail);
      await page.locator("#phone").fill(clientPhone);
      await page.getByRole("button", { name: /save and add vehicle/i }).click();
      await waitForPathname(page, /^\/clients\/[^/]+\/vehicles\/new$/);
      clientId = /^\/clients\/([^/]+)\/vehicles\/new$/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(clientId).not.toBe("");
    });

    await test.step("Create vehicle", async () => {
      await expect(page.locator("#make")).toBeVisible();
      await page.locator("#year").fill("2022");
      await page.locator("#make").fill("Toyota");
      await page.locator("#vehicleModel").fill("Camry");
      const createResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/vehicles") &&
        response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /save and book appointment/i }).click();
      const createResponse = await createResponsePromise;
      const vehiclePayload = await createResponse.json().catch(() => ({}));
      notes.push(`vehicle create: http_${createResponse.status()} id_${vehiclePayload?.id ?? "missing"}`);
      // eslint-disable-next-line no-console
      console.log("vehicle create response", createResponse.status(), vehiclePayload, page.url());
      await waitForPathname(page, /^\/appointments\/new$/);
      const url = new URL(page.url());
      vehicleId = url.searchParams.get("vehicleId") ?? "";
      expect(vehicleId).not.toBe("");
    });

    let appointmentDeliveryStatus: string | null = null;
    await test.step("Create appointment", async () => {
      await expect(page.getByRole("heading", { name: /new appointment/i })).toBeVisible();
      servicesAvailable = await ensureActiveService(page);
      await expect(page.getByRole("heading", { name: /new appointment/i })).toBeVisible();
      if (servicesAvailable) {
        await clickFirstService(page);
      }
      const createResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/appointments") &&
        response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /save appointment/i }).click();
      const createResponse = await createResponsePromise;
      const payload = await createResponse.json();
      appointmentDeliveryStatus = payload?.deliveryStatus ?? null;
      await waitForPathname(page, /^\/appointments\/[^/]+$/);
      appointmentId = /^\/appointments\/([^/]+)$/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(appointmentId).not.toBe("");
      notes.push(`appointment delivery: ${appointmentDeliveryStatus ?? "unknown"}`);
      notes.push(`services available: ${servicesAvailable}`);
    });

    await test.step("Calendar shows created appointment context", async () => {
      await page.goto("/calendar");
      await expect(page).toHaveURL(/\/calendar/);
      await expect(page.locator("main")).toContainText(/selected day/i);
      await expect(page.locator("main")).toContainText(/appointments/i);
    });

    let quoteDeliveryStatus: string | null = null;
    await test.step("Create quote and attempt send", async () => {
      await page.goto(`/quotes/new?clientId=${encodeURIComponent(clientId)}&vehicleId=${encodeURIComponent(vehicleId)}`);
      await expect(page.getByRole("heading", { name: /new quote/i })).toBeVisible();
      await page.locator('input[placeholder="Description"]').first().fill("Exterior detail package");
      await page.locator('input[placeholder="0.00"]').first().fill("199");
      await page.getByRole("button", { name: /^create quote$/i }).first().click();
      await waitForPathname(page, /^\/quotes\/[^/]+$/);
      quoteId = /^\/quotes\/([^/]+)$/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(quoteId).not.toBe("");

      const sendResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/quotes/${quoteId}/send`) &&
        response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^send quote$/i }).click();
      const sendResponse = await sendResponsePromise;
      const sendPayload = await sendResponse.json().catch(() => ({}));
      quoteDeliveryStatus = sendPayload?.deliveryStatus ?? null;
      notes.push(`quote delivery: ${quoteDeliveryStatus ?? `http_${sendResponse.status()}`}`);
      if (!sendResponse.ok || quoteDeliveryStatus !== "emailed") {
        failures.push(`Quote send did not email successfully (${quoteDeliveryStatus ?? sendResponse.status()}).`);
      }
    });

    let invoiceDeliveryStatus: string | null = null;
    await test.step("Create invoice, attempt send, and print", async () => {
      await page.goto(`/invoices/new?clientId=${encodeURIComponent(clientId)}`);
      await expect(page.getByRole("heading", { name: /new invoice/i })).toBeVisible();
      await page.locator('input[placeholder="Description"]').first().fill("Detailing invoice");
      await page.locator('input[type="number"]').nth(2).fill("249");
      await page.getByRole("button", { name: /^create invoice$/i }).first().click();
      await waitForPathname(page, /^\/invoices\/[^/]+$/);
      invoiceId = /^\/invoices\/([^/]+)$/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(invoiceId).not.toBe("");

      const sendResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/invoices/${invoiceId}/sendToClient`) &&
        response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^send invoice$/i }).click();
      const sendResponse = await sendResponsePromise;
      const sendPayload = await sendResponse.json().catch(() => ({}));
      invoiceDeliveryStatus = sendPayload?.deliveryStatus ?? null;
      notes.push(`invoice delivery: ${invoiceDeliveryStatus ?? `http_${sendResponse.status()}`}`);
      if (!sendResponse.ok || invoiceDeliveryStatus !== "emailed") {
        failures.push(`Invoice send did not email successfully (${invoiceDeliveryStatus ?? sendResponse.status()}).`);
      }

      const popupPromise = context.waitForEvent("page");
      await page.getByRole("button", { name: /^print$/i }).first().click();
      const popup = await popupPromise;
      await popup.waitForLoadState("domcontentloaded");
      await popup.waitForTimeout(500);
      const popupText = (await popup.locator("body").textContent()) ?? "";
      if (!/invoice/i.test(popupText) && !popupText.includes(clientLast)) {
        failures.push("Invoice print did not open a recognizable printable document.");
      }
      await popup.close().catch(() => undefined);
    });

    await test.step("Sign out", async () => {
      await page.getByRole("button", { name: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).click();
      await page.getByRole("menuitem", { name: /sign out/i }).click();
      await expect(page).toHaveURL(/\/sign-in/);
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          clientId,
          vehicleId,
          appointmentId,
          quoteId,
          invoiceId,
          notes,
          failures,
        },
        null,
        2
      )
    );

    expect(failures, failures.join("\n")).toEqual([]);
  });
});
