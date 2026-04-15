import { describe, expect, it } from "vitest";
import { renderAppointmentHtml } from "./appointmentTemplate.js";

function renderTemplate(overrides: Partial<Parameters<typeof renderAppointmentHtml>[0]> = {}) {
  return renderAppointmentHtml({
    appointmentTitle: "5-Year Ceramic Coating",
    appointmentDateTime: "May 6th, 2026 at 9:00 AM",
    status: "scheduled",
    notes: null,
    business: {
      name: "Strata",
      email: "team@strata.test",
      phone: "555-555-5555",
      address: "123 Test St",
    },
    client: {
      firstName: "Jacob",
      lastName: "Wheelihan",
      email: "jacob@example.com",
      phone: "555-111-2222",
    },
    vehicle: {
      year: 2022,
      make: "Tesla",
      model: "Model Y",
    },
    serviceSummary: "5-Year Ceramic Coating",
    totalPrice: 715.85,
    depositAmount: 0,
    collectedAmount: 0,
    balanceDue: 715.85,
    paidInFull: false,
    depositSatisfied: false,
    publicPaymentUrl: "https://example.com/pay",
    publicRequestChangeUrl: null,
    portalUrl: null,
    changeRequestState: null,
    stripePaymentState: null,
    ...overrides,
  });
}

describe("appointment template finance messaging", () => {
  it("shows no-deposit appointments as no deposit required without a Stripe CTA", () => {
    const html = renderTemplate();

    expect(html).toContain("No deposit required");
    expect(html).not.toContain("Deposit collected");
    expect(html).not.toContain("Pay $0.00 with Stripe");
    expect(html).not.toContain("Secure checkout powered by Stripe.");
  });

  it("shows paid-in-full no-deposit appointments without deposit language", () => {
    const html = renderTemplate({
      collectedAmount: 715.85,
      balanceDue: 0,
      paidInFull: true,
      depositSatisfied: false,
    });

    expect(html).toContain("Paid in full");
    expect(html).not.toContain("Deposit collected");
    expect(html).not.toContain("Pay $0.00 with Stripe");
  });

  it("shows deposit-required appointments as collected only when the deposit is satisfied", () => {
    const html = renderTemplate({
      depositAmount: 200,
      collectedAmount: 200,
      balanceDue: 515.85,
      depositSatisfied: true,
    });

    expect(html).toContain("Deposit collected");
    expect(html).toContain("$515.85");
    expect(html).not.toContain("Pay $200.00 with Stripe");
  });

  it("shows a customer-friendly change-request error state instead of raw API messaging", () => {
    const html = renderTemplate({
      publicRequestChangeUrl: "https://example.com/change",
      changeRequestState: "error",
    });

    expect(html).toContain("Add a preferred time or a quick note before sending your request.");
    expect(html).toContain('id="change-request-form"');
    expect(html).toContain('id="change-request-inline-error"');
  });
});
