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
      await expect(page.getByText(/last sent/i).first()).toBeVisible();
      await expect(page.getByText(/^emailed$/i).first()).toBeVisible();
      await page.reload();
      await expect(page.getByRole("button", { name: /^resend quote$/i }).first()).toBeVisible();
      await expect(page.getByText(/last sent/i).first()).toBeVisible();
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
      await expect(page.getByText(/^emailed$/i).first()).toBeVisible();

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
      await expect(page.getByText(/^emailed$/i).first()).toBeVisible();

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
      await page.locator("#payment-date").fill("");
      await page.getByRole("button", { name: /^record payment$/i }).last().click();
      await expect(page.getByText(/enter a valid payment date/i)).toBeVisible();
      expect(state.payments).toHaveLength(0);
      await page.locator("#payment-date").fill("2026-04-11");
      await page.locator("#payment-amount").fill(String(invoiceTotal));
      await page.getByRole("button", { name: /^record payment$/i }).last().click();
      await paymentResponsePromise;

      await expect(page.getByText(/payment recorded successfully/i)).toBeVisible();
      await expect(page.getByText(formatCurrency(invoiceTotal)).last()).toBeVisible();

      await page.reload();
      await expect(page.getByText(/payment history/i)).toBeVisible();
      await expect(page.getByText(formatCurrency(invoiceTotal)).last()).toBeVisible();
      expect(state.invoices.find((invoice) => invoice.id === invoiceId)?.status).toBe("paid");

      const reversePaymentResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/payments/") &&
        response.url().includes("/reverse") &&
        response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^reverse$/i }).first().click();
      await page.getByRole("button", { name: /^reverse payment$/i }).last().click();
      await reversePaymentResponsePromise;

      await expect(page.getByText(/payment reversed/i)).toBeVisible();
      await expect(page.getByText(/reversed/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^record payment$/i }).first()).toBeVisible();
      await expect(page.getByText(/payment reversed/i).last()).toBeVisible();

      await page.reload();
      await expect(page.getByText(/reversed/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^record payment$/i }).first()).toBeVisible();
      await expect(page.getByText(/payment reversed/i).last()).toBeVisible();
      expect(state.invoices.find((invoice) => invoice.id === invoiceId)?.status).toMatch(/^(draft|sent)$/);

      const voidInvoiceResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/invoices/${invoiceId}/void`) && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^void$/i }).first().click();
      await page.getByRole("button", { name: /^void$/i }).last().click();
      await voidInvoiceResponsePromise;

      await expect(page.getByText(/invoice voided/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /^record payment$/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^void$/i })).toHaveCount(0);
      await expect(page.getByText(/invoice voided/i).last()).toBeVisible();

      await page.reload();
      await expect(page.getByRole("button", { name: /^record payment$/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^void$/i })).toHaveCount(0);
      await expect(page.getByText(/invoice voided/i).last()).toBeVisible();
      expect(state.invoices.find((invoice) => invoice.id === invoiceId)?.status).toBe("void");
    });
  });

  test("appointment deposit flows persist cleanly across reloads", async ({ page }) => {
    test.setTimeout(120000);

    const state = await mockBillingFlowApp(page);
    await signIn(page);
    await page.goto("/appointments/appointment-seeded-1");
    await expect(page.getByText(/paint correction follow-up/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^collect deposit$/i }).first()).toBeVisible();

    await test.step("Invalid deposit date fails honestly without writing money", async () => {
      await page.getByRole("button", { name: /^collect deposit$/i }).first().click();
      await expect(page.getByRole("heading", { name: /^collect deposit$/i })).toBeVisible();
      await page.getByLabel(/^paid on$/i).fill("");
      await page.getByRole("button", { name: /^collect deposit$/i }).last().click();
      await expect(page.getByText(/enter a valid payment date/i)).toBeVisible();
      expect(state.activityLogs).toHaveLength(0);
    });

    await test.step("Recording and reversing a deposit survives reloads", async () => {
      const recordResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/recordDepositPayment") && response.request().method() === "POST"
      );
      await page.getByLabel(/^paid on$/i).fill("2026-04-11");
      await page.getByLabel(/^amount$/i).fill("120");
      await page.getByRole("button", { name: /^collect deposit$/i }).last().click();
      await recordResponsePromise;

      await expect(page.getByText(/payment recorded/i)).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^reverse deposit(?: collection)?$/i }).first()
      ).toBeVisible();
      expect(state.activityLogs.filter((entry) => entry.action === "appointment.deposit_paid")).toHaveLength(1);

      await page.reload();
      await expect(
        page.getByRole("button", { name: /^reverse deposit(?: collection)?$/i }).first()
      ).toBeVisible();

      const reverseResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/reverseDepositPayment") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^reverse deposit(?: collection)?$/i }).first().click();
      await page.getByRole("button", { name: /^reverse deposit$/i }).last().click();
      await reverseResponsePromise;

      await expect(page.getByText(/deposit reversed/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /^collect deposit$/i }).first()).toBeVisible();
      expect(state.activityLogs.filter((entry) => entry.action === "appointment.deposit_payment_reversed")).toHaveLength(1);

      await page.reload();
      await expect(page.getByRole("button", { name: /^collect deposit$/i }).first()).toBeVisible();
    });
  });

  test("appointment full direct payment stays accurate across reloads", async ({ page }) => {
    test.setTimeout(120000);

    const state = await mockBillingFlowApp(page);
    await signIn(page);
    await page.goto("/appointments/appointment-seeded-1");
    await expect(page.getByRole("button", { name: /^collect deposit$/i }).first()).toBeVisible();

    await test.step("Collect deposit first", async () => {
      const depositResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/recordDepositPayment") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^collect deposit$/i }).first().click();
      await page.getByLabel(/^paid on$/i).fill("2026-04-11");
      await page.getByLabel(/^amount$/i).fill("120");
      await page.getByRole("button", { name: /^collect deposit$/i }).last().click();
      await depositResponsePromise;
      await expect(page.getByRole("button", { name: /^collect payment$/i }).first()).toBeVisible();
    });

    await test.step("Collect remaining balance and persist full-payment state", async () => {
      const paymentResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/recordDepositPayment") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^collect payment$/i }).first().click();
      await expect(page.getByRole("heading", { name: /^collect payment$/i })).toBeVisible();
      await page.getByLabel(/^paid on$/i).fill("2026-04-11");
      await page.getByLabel(/^amount$/i).fill("360");
      await page.getByRole("button", { name: /^collect payment$/i }).last().click();
      await paymentResponsePromise;

      await expect(page.getByText(/appointment paid in full/i)).toBeVisible();
      await expect(page.getByText(/^paid in full$/i).first()).toBeVisible();
      expect(state.activityLogs.filter((entry) => entry.action === "appointment.deposit_paid")).toHaveLength(2);

      await page.reload();
      await expect(page.getByText(/^paid in full$/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^reverse payment$/i }).first()).toBeVisible();
    });

    await test.step("Reversing full direct payment resets to deposit-due state", async () => {
      const reverseResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/reverseDepositPayment") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^reverse payment$/i }).first().click();
      await page.getByRole("button", { name: /^reverse deposit$/i }).last().click();
      await reverseResponsePromise;

      await expect(page.getByText(/payment reversed/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /^collect deposit$/i }).first()).toBeVisible();
      expect(state.activityLogs.filter((entry) => entry.action === "appointment.deposit_payment_reversed")).toHaveLength(1);

      await page.reload();
      await expect(page.getByRole("button", { name: /^collect deposit$/i }).first()).toBeVisible();
      await expect(page.getByText(/waiting on collection/i).first()).toBeVisible();
    });
  });

  test("appointment-linked invoices stay connected across reloads", async ({ page }) => {
    test.setTimeout(120000);

    const state = await mockBillingFlowApp(page);
    await signIn(page);
    await page.goto("/appointments/appointment-seeded-1");
    await expect(page.getByText(/paint correction follow-up/i)).toBeVisible();

    let invoiceId = "";
    let invoiceNumber = "";
    let invoiceTotal = 0;

    await test.step("Create an invoice from the appointment detail page", async () => {
      await page.getByRole("link", { name: /^create invoice$/i }).first().click();
      await page.waitForURL(/\/invoices\/new\?/);
      await expect(page.getByText(/creating invoice linked to appointment/i).first()).toBeVisible();

      await page.locator('input[placeholder="Description"]').first().fill("Paint correction final invoice");
      await page.locator('input[type="number"]').nth(1).fill("480");

      const createInvoiceResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/invoices") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^create & send$/i }).click();
      await createInvoiceResponsePromise;

      await page.waitForURL(/\/invoices\/(?!new(?:[/?]|$))[^/?]+/);
      invoiceId = /^\/invoices\/([^/?]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
      expect(invoiceId).not.toBe("");
      invoiceNumber = state.invoices.find((invoice) => invoice.id === invoiceId)?.invoiceNumber ?? "";
      invoiceTotal = state.invoices.find((invoice) => invoice.id === invoiceId)?.total ?? 0;
      expect(invoiceNumber).not.toBe("");
      expect(invoiceTotal).toBeGreaterThan(0);
      expect(state.appointments.find((appointment) => appointment.id === "appointment-seeded-1")?.invoicedAt).not.toBeNull();
    });

    await test.step("Invoice detail keeps its related appointment visible after reload", async () => {
      await expect(page.locator('a[href="/appointments/appointment-seeded-1"]').first()).toBeVisible();
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/invoices/${invoiceId}`));
      await expect(page.locator('a[href="/appointments/appointment-seeded-1"]').first()).toBeVisible();
    });

    await test.step("Recording invoice payment updates appointment invoice status too", async () => {
      await page.goto("/appointments/appointment-seeded-1");
      await expect(page.getByRole("link", { name: /^record payment$/i }).first()).toBeVisible();
      await page.goto(`/invoices/${invoiceId}`);

      const paymentResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/payments") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^collect payment$/i }).first().click();
      await expect(page.getByRole("heading", { name: /^record payment$/i })).toBeVisible();
      await page.locator("#payment-date").fill("2026-04-11");
      await page.locator("#payment-amount").fill(String(invoiceTotal));
      await page.getByRole("button", { name: /^record payment$/i }).last().click();
      await paymentResponsePromise;

      await expect(page.getByText(/payment recorded successfully/i)).toBeVisible();
      await expect(state.invoices.find((invoice) => invoice.id === invoiceId)?.status).toBe("paid");

      await page.goto("/appointments/appointment-seeded-1");
      await expect(page.getByRole("link", { name: /^view invoice$/i }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /^create invoice$/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /^record payment$/i })).toHaveCount(0);
      await expect(page.getByText(invoiceNumber).first()).toBeVisible();
      await expect(page.getByText(/^paid$/i).first()).toBeVisible();

      await page.reload();
      await expect(page.getByRole("link", { name: /^view invoice$/i }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /^record payment$/i })).toHaveCount(0);
      await expect(page.getByText(invoiceNumber).first()).toBeVisible();
      await expect(page.getByText(/^paid$/i).first()).toBeVisible();
      await expect(page.locator(`a[href="/invoices/${invoiceId}"]`).first()).toBeVisible();
    });

    await test.step("Reversing the invoice payment resets appointment invoice status after reload", async () => {
      await page.goto(`/invoices/${invoiceId}`);
      const reversePaymentResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/payments/") &&
        response.url().includes("/reverse") &&
        response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^reverse$/i }).first().click();
      await page.getByRole("button", { name: /^reverse payment$/i }).last().click();
      await reversePaymentResponsePromise;

      await expect(page.getByText(/payment reversed/i)).toBeVisible();
      await expect(state.invoices.find((invoice) => invoice.id === invoiceId)?.status).toBe("sent");

      await page.goto("/appointments/appointment-seeded-1");
      await expect(page.getByRole("link", { name: /^record payment$/i }).first()).toBeVisible();
      await expect(page.getByText(invoiceNumber).first()).toBeVisible();
      await expect(page.getByText(/^sent$/i).first()).toBeVisible();

      await page.reload();
      await expect(page.getByRole("link", { name: /^record payment$/i }).first()).toBeVisible();
      await expect(page.getByText(invoiceNumber).first()).toBeVisible();
      await expect(page.getByText(/^sent$/i).first()).toBeVisible();
    });

    await test.step("Voiding the invoice removes payable actions from the appointment page too", async () => {
      await page.goto(`/invoices/${invoiceId}`);
      const voidInvoiceResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/invoices/${invoiceId}/void`) && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: /^void$/i }).first().click();
      await page.getByRole("button", { name: /^void$/i }).last().click();
      await voidInvoiceResponsePromise;

      await expect(page.getByText(/invoice voided/i)).toBeVisible();
      await expect(state.invoices.find((invoice) => invoice.id === invoiceId)?.status).toBe("void");

      await page.goto("/appointments/appointment-seeded-1");
      await expect(page.getByRole("link", { name: /^view invoice$/i }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /^record payment$/i })).toHaveCount(0);
      await expect(page.getByText(/^void$/i).first()).toBeVisible();

      await page.reload();
      await expect(page.getByRole("link", { name: /^record payment$/i })).toHaveCount(0);
      await expect(page.getByText(/^void$/i).first()).toBeVisible();
    });
  });
});
