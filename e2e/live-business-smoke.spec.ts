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
  await page.waitForURL(/\/(signed-in|subscribe)/);
}

async function assertWorkspaceReady(page: Page) {
  if (/\/subscribe(?:[/?#]|$)/.test(page.url())) {
    const billingStatus = await page.evaluate(async () => {
      const token = window.localStorage.getItem("authToken");
      if (!token) return { error: "missing_token" };
      try {
        const response = await fetch("https://strata-crm-production.up.railway.app/api/billing/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => ({}));
        return {
          httpStatus: response.status,
          ...body,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    throw new Error(
      `Smoke account is gated at /subscribe. Billing status: ${JSON.stringify(billingStatus)}`
    );
  }

  await expect(page).toHaveURL(/\/signed-in/);
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await expect(page.locator("#email")).toBeVisible();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await page.waitForURL(/\/(signed-in|onboarding|subscribe)/);
  await page.waitForLoadState("networkidle");
  await completeOnboardingIfNeeded(page);
  await assertWorkspaceReady(page);
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

async function openSelectAndChoose(page: Page, label: RegExp | string, option: RegExp | string) {
  const labelLocator = page.getByText(label, { exact: false }).first();
  const field = labelLocator.locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]");
  await field.getByRole("combobox").click();
  await page.getByRole("option", { name: option }).click();
}

async function fillVehicleSelector(page: Page) {
  const yearCombobox = page.getByRole("combobox").first();
  if (await yearCombobox.isVisible().catch(() => false)) {
    await openSelectAndChoose(page, /^year$/i, "2022");
    await openSelectAndChoose(page, /^make\s*\*?$/i, /toyota/i);
    await openSelectAndChoose(page, /^model\s*\*?$/i, /camry/i);
    const trimInput = page.getByPlaceholder(/enter trim if known/i);
    if (await trimInput.isVisible().catch(() => false)) {
      await trimInput.fill("SE");
    }
    return;
  }

  const manualToggle = page.getByRole("button", { name: /manual fallback|use catalog/i });
  if (await manualToggle.isVisible().catch(() => false)) {
    await manualToggle.click();
  }

  await expect(page.locator("#vehicle-year")).toBeVisible();
  await page.locator("#vehicle-year").fill("2022");
  await page.locator("#vehicle-make").fill("Toyota");
  await page.locator("#vehicle-model").fill("Camry");
  const trimInput = page.locator("#vehicle-trim");
  if (await trimInput.isVisible().catch(() => false)) {
    await trimInput.fill("SE");
  }
}

async function clickFirstService(page: Page, serviceName: string) {
  const serviceNameText = page.getByText(serviceName, { exact: true }).first();
  const searchInput = page.getByPlaceholder(/search services, notes, or category/i);
  if (!(await serviceNameText.isVisible().catch(() => false)) && (await searchInput.isVisible().catch(() => false))) {
    await searchInput.fill(serviceName);
  }

  await expect(serviceNameText).toBeVisible();

  const clickableServiceCard = serviceNameText.locator(
    "xpath=ancestor::*[contains(@class,'cursor-pointer') or self::button][1]"
  );
  if (await clickableServiceCard.count()) {
    await clickableServiceCard.first().click();
  } else {
    await serviceNameText.click();
  }

  await expect(page.getByText(/^Services selected$/i)).toBeVisible();
}

async function fillRequiredMobileAddress(page: Page) {
  const addressField = page.locator("#mobileAddress");
  if (await addressField.isVisible().catch(() => false)) {
    await addressField.fill("123 Smoke Test Ave, Los Angeles, CA 90001");
  }
}

async function clickQuoteSendButton(page: Page) {
  const communicationCard = page
    .locator('[class*="card"]')
    .filter({ has: page.getByRole("heading", { name: /client communication/i }) })
    .first();
  const communicationButton = communicationCard.getByRole("button", { name: /^send quote$|^resend quote$/i });
  if (await communicationButton.isVisible().catch(() => false)) {
    await communicationButton.click();
    return;
  }
  await page.getByRole("button", { name: /^mark as sent$/i }).first().click();
}

async function clickInvoiceSendButton(page: Page) {
  const communicationCard = page
    .locator('[class*="card"]')
    .filter({ has: page.getByRole("heading", { name: /client communication/i }) })
    .first();
  const communicationButton = communicationCard.getByRole("button", { name: /^send invoice$|^resend invoice$/i });
  if (await communicationButton.isVisible().catch(() => false)) {
    await communicationButton.click();
    return;
  }
  await page.getByRole("button", { name: /^mark as sent$/i }).first().click();
}

async function ensureActiveService(page: Page): Promise<{ ok: true; name: string } | { ok: false }> {
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
        return { ok: true, created: false, id: existing.id, name: existing.name ?? "Smoke Test Service" };
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
        name: createBody?.name ?? "Smoke Test Service",
        body: createBody,
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  });

  console.log("ensureActiveService", result);
  if (!result?.ok) {
    if (result?.status === 503 || /failed to fetch/i.test(String(result?.reason ?? ""))) {
      return { ok: false };
    }
    throw new Error(`Unable to seed service for smoke: ${JSON.stringify(result)}`);
  }
  await page.reload();
  return { ok: true, name: result.name ?? "Smoke Test Service" };
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
    const buildAppointmentSlot = (attempt: number) => {
      const slot = new Date();
      slot.setDate(slot.getDate() + 3 + attempt);
      slot.setHours(10 + ((Math.floor(stamp / 1000) + attempt) % 6), ((Math.floor(stamp / 1000) + attempt) % 4) * 15, 0, 0);
      return {
        date: slot.toISOString().slice(0, 10),
        time: slot.toTimeString().slice(0, 5),
      };
    };
    let appointmentSlot = buildAppointmentSlot(0);
    const clientFirst = "Smoke";
    const clientLast = `Flow${String(stamp).slice(-6)}`;
    const clientEmail = `smoke+${stamp}@example.com`;
    const clientPhone = "555-010-1234";
    const leadFirst = "Lead";
    const leadLast = `Flow${String(stamp).slice(-5)}`;
    const leadEmail = `lead+${stamp}@example.com`;
    let clientId = "";
    let leadClientId = "";
    let vehicleId = "";
    let appointmentId = "";
    let quoteId = "";
    let invoiceId = "";
    let serviceName = "";

    page.on("response", async (response) => {
      if (!response.url().includes("/api/")) return;
      if (response.status() < 400) return;
      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "<unreadable>";
      }
      console.log("API failure", response.status(), response.url(), body);
    });
    page.on("pageerror", (error) => {
      console.log("page error", error.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log("browser console", msg.type(), msg.text());
      }
    });

    await signIn(page);

    await test.step("Create lead and convert it into a client record", async () => {
      await page.goto("/leads");
      await expect(page.locator("main").getByRole("heading", { name: /^leads$/i })).toBeVisible();
      await page.locator("#leadFirstName").fill(leadFirst);
      await page.locator("#leadLastName").fill(leadLast);
      await page.locator("#leadEmail").fill(leadEmail);
      await page.locator("#serviceInterest").fill("Window tint quote");
      await page.locator("#nextStep").fill("Send pricing");
      await page.getByRole("button", { name: /^save lead$/i }).click();
      await waitForPathname(page, /^\/clients$/);
      leadClientId = new URL(page.url()).searchParams.get("created") ?? "";
      expect(leadClientId).not.toBe("");
      await expect(page.locator("main")).toContainText(new RegExp(`${leadFirst}\\s+${leadLast}`, "i"));
      await page.goto(`/clients/${leadClientId}`);
      await expect(page.locator("main")).toContainText(new RegExp(`${leadFirst}\\s+${leadLast}`, "i"));

      await page.goto("/leads");
      const leadCard = page
        .getByText(new RegExp(`${leadFirst}\\s+${leadLast}`, "i"))
        .first()
        .locator("xpath=ancestor::*[.//button[contains(., 'Convert to client')]][1]");
      await expect(leadCard).toBeVisible();
      await leadCard.getByRole("button", { name: /convert to client/i }).first().click();
      await waitForPathname(page, new RegExp(`^/clients/${leadClientId}$`));
      await expect(page.locator("main")).toContainText(new RegExp(`${leadFirst}\\s+${leadLast}`, "i"));
      await page.goBack();
      await expect(page).toHaveURL(/\/leads/);
      await expect(page.locator("main").getByRole("heading", { name: /^leads$/i })).toBeVisible();
    });

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
      await fillVehicleSelector(page);
      const createResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/vehicles") &&
        response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /save and book appointment/i }).click();
      const createResponse = await createResponsePromise;
      const vehiclePayload = await createResponse.json().catch(() => ({}));
      notes.push(`vehicle create: http_${createResponse.status()} id_${vehiclePayload?.id ?? "missing"}`);
      console.log("vehicle create response", createResponse.status(), vehiclePayload, page.url());
      await waitForPathname(page, /^\/appointments\/new$/);
      const url = new URL(page.url());
      vehicleId = url.searchParams.get("vehicleId") ?? "";
      expect(vehicleId).not.toBe("");
      url.searchParams.set("date", appointmentSlot.date);
      url.searchParams.set("time", appointmentSlot.time);
      await page.goto(url.pathname + url.search);
    });

    let appointmentDeliveryStatus: string | null = null;
    await test.step("Create appointment", async () => {
      await expect(page.getByRole("heading", { name: /new appointment/i })).toBeVisible();
      const serviceResult = await ensureActiveService(page);
      await expect(page.getByRole("heading", { name: /new appointment/i })).toBeVisible();
      if (serviceResult.ok) {
        serviceName = serviceResult.name;
        await clickFirstService(page, serviceName);
      }
      await fillRequiredMobileAddress(page);
      let createResponse;
      let payload: any = {};
      let created = false;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        appointmentSlot = buildAppointmentSlot(attempt);
        await page.locator("#startTime").fill(appointmentSlot.time);
        const createResponsePromise = page.waitForResponse((response) =>
          response.url().includes("/api/appointments") &&
          response.request().method() === "POST"
        );
        await page.getByRole("button", { name: /save appointment/i }).click();
        createResponse = await createResponsePromise;
        payload = await createResponse.json().catch(() => ({}));
        if (createResponse.ok) {
          created = true;
          break;
        }
        if (createResponse.status() !== 409) {
          throw new Error(`Appointment create failed (${createResponse.status()}): ${JSON.stringify(payload)}`);
        }
        notes.push(`appointment retry due to overlap at ${appointmentSlot.date} ${appointmentSlot.time}`);
      }
      if (!created || !createResponse) {
        throw new Error("Unable to create appointment without overlap after retries.");
      }
      appointmentDeliveryStatus = payload?.deliveryStatus ?? null;
      await waitForPathname(page, /^\/appointments\/[^/]+$/);
      appointmentId = /^\/appointments\/([^/]+)$/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(appointmentId).not.toBe("");
      notes.push(`appointment delivery: ${appointmentDeliveryStatus ?? "unknown"}`);
      notes.push(`starter services ready: ${serviceResult.ok ? "yes" : "degraded"}`);
    });

    await test.step("Calendar shows created appointment context", async () => {
      await page.goto("/calendar");
      await expect(page).toHaveURL(/\/calendar/);
      await expect(page.locator("main")).toContainText(/scheduling/i);
      await expect(page.locator("main")).toContainText(/week summary|day summary|month overview/i);
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

      const sendResponsePromise = page
        .waitForResponse((response) =>
          response.url().includes(`/api/quotes/${quoteId}/send`) &&
          response.request().method() === "POST"
        , { timeout: 20000 })
        .catch(() => null);
      await clickQuoteSendButton(page);
      const sendResponse = await sendResponsePromise;
      const sendPayload = sendResponse ? await sendResponse.json().catch(() => ({})) : {};
      quoteDeliveryStatus = sendPayload?.deliveryStatus ?? null;

      if (!sendResponse) {
        await expect(page.getByRole("button", { name: /^resend quote$/i }).first()).toBeVisible({ timeout: 20000 });
        const emailedBadge = page.getByText(/^emailed$/i).last();
        if (await emailedBadge.isVisible().catch(() => false)) {
          quoteDeliveryStatus = "emailed";
        }
      }

      notes.push(`quote delivery: ${quoteDeliveryStatus ?? (sendResponse ? `http_${sendResponse.status()}` : "ui_verified")}`);
      if ((sendResponse && !sendResponse.ok) || quoteDeliveryStatus !== "emailed") {
        failures.push(`Quote send did not email successfully (${quoteDeliveryStatus ?? sendResponse?.status() ?? "no_response"}).`);
      }
    });

    let invoiceDeliveryStatus: string | null = null;
    await test.step("Create invoice, attempt send, and print", async () => {
      await page.goto(`/invoices/new?clientId=${encodeURIComponent(clientId)}`);
      await expect(page.getByRole("heading", { name: /new invoice/i })).toBeVisible();
      await page.locator('input[placeholder="Description"]').first().fill("Detailing invoice");
      await page.locator('input[type="number"]').nth(1).fill("249");
      await page.getByRole("button", { name: /^create invoice$/i }).first().click();
      await waitForPathname(page, /^\/invoices\/[^/]+$/);
      invoiceId = /^\/invoices\/([^/]+)$/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(invoiceId).not.toBe("");

      const sendResponsePromise = page
        .waitForResponse((response) =>
          response.url().includes(`/api/invoices/${invoiceId}/sendToClient`) &&
          response.request().method() === "POST"
        , { timeout: 20000 })
        .catch(() => null);
      await clickInvoiceSendButton(page);
      const sendResponse = await sendResponsePromise;
      const sendPayload = sendResponse ? await sendResponse.json().catch(() => ({})) : {};
      invoiceDeliveryStatus = sendPayload?.deliveryStatus ?? null;

      if (!sendResponse) {
        await expect(page.getByRole("button", { name: /^resend invoice$/i }).first()).toBeVisible({ timeout: 20000 });
        const emailedBadge = page.getByText(/^emailed$/i).last();
        if (await emailedBadge.isVisible().catch(() => false)) {
          invoiceDeliveryStatus = "emailed";
        }
      }

      notes.push(`invoice delivery: ${invoiceDeliveryStatus ?? (sendResponse ? `http_${sendResponse.status()}` : "ui_verified")}`);
      if ((sendResponse && !sendResponse.ok) || invoiceDeliveryStatus !== "emailed") {
        failures.push(`Invoice send did not email successfully (${invoiceDeliveryStatus ?? sendResponse?.status() ?? "no_response"}).`);
      }

      await page.getByRole("button", { name: /^print$/i }).first().click();
      await page.waitForTimeout(1500);
      const printErrorToast = page.getByText(/could not print invoice/i).last();
      if (await printErrorToast.isVisible().catch(() => false)) {
        failures.push("Invoice print surfaced an error to the user.");
      }
    });

    await test.step("Sign out", async () => {
      await page.getByRole("button", { name: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).click();
      await page.getByRole("menuitem", { name: /sign out/i }).click();
      await expect(page).toHaveURL(/\/sign-in/);
    });

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
