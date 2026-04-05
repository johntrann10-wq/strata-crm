import { expect, test } from "@playwright/test";
import { mockBillingFlowApp, signIn } from "./helpers/billingFlow";

const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

test.describe.configure({ mode: "serial" });

test.describe("Billing regression", () => {
  test("quote and invoice flows stay safe across reloads", async ({ page }) => {
    test.setTimeout(120000);

    const state = await mockBillingFlowApp(page);
    await signIn(page);
    await page.goto("/signed-in");
    await expect(page).toHaveURL(/\/signed-in/);

    let quoteId = "";
    let invoiceId = "";

    await test.step("Create quote and keep detail view stable after reload", async () => {
      await page.goto("/quotes/new?clientId=client-1&vehicleId=veh-1");
      await expect(page.getByRole("heading", { name: /new quote/i })).toBeVisible();

      await page.locator('input[placeholder="Description"]').first().fill("Exterior detail package");
      await page.locator('input[placeholder="0.00"]').first().fill("199");
      await page
        .getByRole("button", { name: /^create quote$/i })
        .last()
        .evaluate((button) => {
          (button as HTMLButtonElement).click();
        });

      await page.waitForURL(/\/quotes\/(?!new(?:[/?]|$))[^/?]+/);
      quoteId = /^\/quotes\/([^/?]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(quoteId).not.toBe("");
      await expect(page.getByText(/exterior detail package/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^(send quote|mark as sent)$/i }).first()).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/quotes/${quoteId}`));
      await expect(page.getByText(/exterior detail package/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^(send quote|mark as sent)$/i }).first()).toBeVisible();

      const quotePrintResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/quotes/${quoteId}/html`) && response.request().method() === "GET"
      );
      await page.getByRole("button", { name: /^print$/i }).first().click();
      const quotePrintResponse = await quotePrintResponsePromise;
      expect(quotePrintResponse.ok()).toBe(true);
      await expect(page.getByText(/could not open printable estimate/i)).toHaveCount(0);

      const sendResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/quotes/${quoteId}/send`) && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^(send quote|mark as sent)$/i }).first().click();
      await sendResponsePromise;

      await expect(page.getByRole("button", { name: /^resend quote$/i }).first()).toBeVisible();
      await page.reload();
      await expect(page.getByRole("button", { name: /^resend quote$/i }).first()).toBeVisible();
      expect(state.quotes.find((quote) => quote.id === quoteId)?.status).toBe("sent");
    });

    await test.step("Accepted quotes hand off into appointment booking", async () => {
      const acceptResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/quotes/${quoteId}`) && ["POST", "PATCH", "PUT"].includes(response.request().method())
      );
      await page.getByRole("button", { name: /^mark as accepted$/i }).click();
      const acceptResponse = await acceptResponsePromise;
      expect(acceptResponse.ok()).toBe(true);
      await expect(page.getByText(/quote marked as accepted/i)).toBeVisible();
      await expect(page.getByText(/quote accepted/i).first()).toBeVisible();

      await page.getByRole("link", { name: /book appointment/i }).first().click();
      await page.waitForURL(/\/appointments\/new\?/);
      await expect(page.getByText(/new appointment/i).first()).toBeVisible();
      await expect(page.getByText(/exterior detail package/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^save appointment$/i })).toBeVisible();

      const appointmentCreateResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/appointments") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^save appointment$/i }).click();
      const appointmentCreateResponse = await appointmentCreateResponsePromise;
      expect(appointmentCreateResponse.ok()).toBe(true);

      await page.waitForURL(/\/appointments\/[^/?]+/);
      await expect(page.getByText(/appointment created/i)).toBeVisible();
      await expect(page.getByText(/exterior detail package/i).first()).toBeVisible();

      await page.goto(`/quotes/${quoteId}`);
      await expect(page.getByRole("button", { name: /^already scheduled$/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /open scheduled job/i })).toBeVisible();
    });

    await test.step("Create invoice, send it, record payment, and survive reloads", async () => {
      await page.goto("/invoices/new?clientId=client-1");
      await expect(page.getByRole("heading", { name: /new invoice/i })).toBeVisible();

      await page.locator('input[placeholder="Description"]').first().fill("Detailing invoice");
      await page.locator('input[type="number"]').nth(1).fill("249");
      const invoiceCreateResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/invoices") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^create & send$/i }).click();
      await invoiceCreateResponsePromise;

      await page.waitForURL(/\/invoices\/(?!new(?:[/?]|$))[^/?]+/);
      await page.waitForLoadState("networkidle");
      invoiceId = /^\/invoices\/([^/?]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(invoiceId).not.toBe("");
      const createdInvoice = state.invoices.find((invoice) => invoice.id === invoiceId);
      const invoiceTotal = createdInvoice?.total ?? 249;
      await expect
        .poll(async () => (await page.textContent("body")) ?? "", {
          message: "invoice detail should render after create and send",
          timeout: 10000,
        })
        .toContain("Payment History");
      await expect(page.getByRole("button", { name: /^collect payment$/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^resend invoice$/i }).first()).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/invoices/${invoiceId}`));
      await page.waitForLoadState("networkidle");
      await expect
        .poll(async () => (await page.textContent("body")) ?? "", {
          message: "invoice detail should stay visible after reload",
          timeout: 10000,
        })
        .toContain("Payment History");
      await expect(page.getByRole("button", { name: /^collect payment$/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^resend invoice$/i }).first()).toBeVisible();

      const invoicePrintResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/invoices/${invoiceId}/html`) && response.request().method() === "GET"
      );
      await page.getByRole("button", { name: /^print$/i }).first().click();
      const invoicePrintResponse = await invoicePrintResponsePromise;
      expect(invoicePrintResponse.ok()).toBe(true);
      await expect(page.getByText(/could not print invoice/i)).toHaveCount(0);

      const paymentResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/payments") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^collect payment$/i }).first().click();
      await expect(page.getByRole("heading", { name: /^record payment$/i })).toBeVisible();
      await page.locator("#payment-amount").fill(String(invoiceTotal));
      await page.getByRole("button", { name: /^record payment$/i }).last().click();
      await paymentResponsePromise;

      await expect(page.getByText(/payment recorded successfully/i)).toBeVisible();
      await expect(page.getByText(formatCurrency(invoiceTotal)).last()).toBeVisible();

      await page.reload();
      await expect(page.getByText(/payment history/i)).toBeVisible();
      await expect(page.getByText(formatCurrency(invoiceTotal)).last()).toBeVisible();
      expect(state.invoices.find((invoice) => invoice.id === invoiceId)?.status).toBe("paid");
    });
  });
});
