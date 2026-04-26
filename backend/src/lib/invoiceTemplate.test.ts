import { describe, expect, it } from "vitest";
import { renderInvoiceHtml } from "./invoiceTemplate.js";

function renderTemplate(overrides: Partial<Parameters<typeof renderInvoiceHtml>[0]> = {}) {
  return renderInvoiceHtml({
    invoiceNumber: "INV-1001",
    status: "sent",
    dueDate: "2026-05-01T12:00:00.000Z",
    subtotal: 250,
    taxRate: 0,
    taxAmount: 0,
    discountAmount: 0,
    total: 250,
    totalPaid: 0,
    notes: null,
    createdAt: "2026-04-25T12:00:00.000Z",
    business: {
      name: "Coastline Detail Co.",
      email: "team@example.com",
      phone: "555-555-5555",
      address: "123 Test St",
      timezone: "America/New_York",
    },
    client: {
      firstName: "Jake",
      lastName: "Wheelihan",
      email: "jake@example.com",
      phone: "555-111-2222",
      address: "1 Customer Way",
    },
    lineItems: [{ description: "Full detail", quantity: 1, unitPrice: 250, total: 250 }],
    payments: [],
    publicPaymentUrl: null,
    portalUrl: null,
    ...overrides,
  });
}

describe("invoice template payment CTA", () => {
  it("does not show a pay button when no connected Stripe payment URL is available", () => {
    const html = renderTemplate({ publicPaymentUrl: null });

    expect(html).not.toContain("Pay invoice");
    expect(html).not.toContain("Secure online checkout is available");
  });

  it("shows a neutral Pay invoice button when the public invoice page has a payment URL", () => {
    const html = renderTemplate({ publicPaymentUrl: "https://example.com/pay" });

    expect(html).toContain('href="https://example.com/pay"');
    expect(html).toContain("Pay invoice");
    expect(html).not.toContain("Pay $250.00 with Stripe");
  });
});
