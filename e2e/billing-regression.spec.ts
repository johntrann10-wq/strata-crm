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
      await page.getByRole("button", { name: /^create quote$/i }).first().click();

      await page.waitForURL(/\/quotes\/(?!new(?:[/?]|$))[^/?]+/);
      quoteId = /^\/quotes\/([^/?]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(quoteId).not.toBe("");
      await expect(page.getByText(/exterior detail package/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /^send quote$/i }).first()).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/quotes/${quoteId}`));
      await expect(page.getByText(/exterior detail package/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /^send quote$/i }).first()).toBeVisible();

      const sendResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/quotes/${quoteId}/send`) && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^send quote$/i }).first().click();
      await sendResponsePromise;

      await expect(page.getByRole("button", { name: /^resend quote$/i }).first()).toBeVisible();
      await page.reload();
      await expect(page.getByRole("button", { name: /^resend quote$/i }).first()).toBeVisible();
      expect(state.quotes.find((quote) => quote.id === quoteId)?.status).toBe("sent");
    });

    await test.step("Create invoice, send it, record payment, and survive reloads", async () => {
      await page.goto("/invoices/new?clientId=client-1");
      await expect(page.getByRole("heading", { name: /new invoice/i })).toBeVisible();

      await page.locator('input[placeholder="Description"]').first().fill("Detailing invoice");
      await page.locator('input[type="number"]').nth(1).fill("249");
      await page.getByRole("button", { name: /^create & send$/i }).click();

      await page.waitForURL(/\/invoices\/(?!new(?:[/?]|$))[^/?]+/);
      invoiceId = /^\/invoices\/([^/?]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(invoiceId).not.toBe("");
      const invoiceTotal = state.invoices.find((invoice) => invoice.id === invoiceId)?.total ?? 249;
      await expect(page.getByText(/detailing invoice/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /^record payment$/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^resend invoice$/i }).first()).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/invoices/${invoiceId}`));
      await expect(page.getByText(/detailing invoice/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /^record payment$/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^resend invoice$/i }).first()).toBeVisible();

      const paymentResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/payments") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^record payment$/i }).first().click();
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
