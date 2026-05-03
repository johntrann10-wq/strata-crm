import { describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(() => {
      const error = new Error("email_templates does not exist") as Error & { code?: string };
      error.code = "42P01";
      throw error;
    }),
  },
}));

vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { resolveAppointmentConfirmationActionLabel, resolveFromAddressForTemplate, resolveInvoiceEmailPrimaryAction } from "./email.js";

describe("resolveFromAddressForTemplate", () => {
  it("brands customer-facing emails with the business display name", () => {
    expect(
      resolveFromAddressForTemplate("Strata CRM <notifications@stratacrm.app>", "booking_request_received", {
        businessName: "North Star Detailing",
      })
    ).toBe("\"North Star Detailing\" <notifications@stratacrm.app>");
  });

  it("keeps internal templates on the configured platform sender", () => {
    expect(
      resolveFromAddressForTemplate("Strata CRM <notifications@stratacrm.app>", "team_invite", {
        businessName: "North Star Detailing",
      })
    ).toBe("Strata CRM <notifications@stratacrm.app>");
  });

  it("falls back to the configured sender identity when the business name is missing", () => {
    expect(
      resolveFromAddressForTemplate("Strata CRM <notifications@stratacrm.app>", "invoice_sent", {})
    ).toBe("\"Strata CRM\" <notifications@stratacrm.app>");
  });
});

describe("resolveAppointmentConfirmationActionLabel", () => {
  it("falls back to a real CTA label when the confirmation URL exists", () => {
    expect(
      resolveAppointmentConfirmationActionLabel({
        confirmationActionLabel: null,
        confirmationUrl: "https://stratacrm.app/api/appointments/apt-123/public-html?token=test",
      })
    ).toBe("View appointment");
  });

  it("preserves an explicit CTA label when one is provided", () => {
    expect(
      resolveAppointmentConfirmationActionLabel({
        confirmationActionLabel: "View appointment and pay deposit",
        confirmationUrl: "https://stratacrm.app/api/appointments/apt-123/public-html?token=test",
      })
    ).toBe("View appointment and pay deposit");
  });

  it("keeps the CTA blank when there is no confirmation link", () => {
    expect(
      resolveAppointmentConfirmationActionLabel({
        confirmationActionLabel: "",
        confirmationUrl: null,
      })
    ).toBe("");
  });
});

describe("resolveInvoiceEmailPrimaryAction", () => {
  it("keeps invoice emails focused on viewing the invoice even when online payment exists elsewhere", () => {
    expect(
      resolveInvoiceEmailPrimaryAction({
        invoiceUrl: "https://stratacrm.app/api/invoices/inv-123/public-html?token=test",
      })
    ).toEqual({
      label: "View invoice",
      url: "https://stratacrm.app/api/invoices/inv-123/public-html?token=test",
      detailsCopy: "Open the invoice to review the completed work, payment status, and your service record.",
    });
  });

  it("does not manufacture a payment CTA when no invoice URL is available", () => {
    expect(resolveInvoiceEmailPrimaryAction({ invoiceUrl: null })).toEqual({
      label: "",
      url: "",
      detailsCopy: "Open the invoice to review the completed work, payment status, and your service record.",
    });
  });
});
