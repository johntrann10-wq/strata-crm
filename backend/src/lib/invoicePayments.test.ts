import { describe, expect, it } from "vitest";
import { buildLegacyPaymentInsertValues } from "./invoicePayments.js";

describe("invoice payment legacy insert fallback", () => {
  it("drops newer payment columns when the legacy schema does not have them", () => {
    const values = buildLegacyPaymentInsertValues(
      new Set(["business_id", "invoice_id", "amount", "method", "paid_at", "idempotency_key"]),
      {
        businessId: "business-1",
        invoiceId: "invoice-1",
        amount: 20,
        method: "other",
        idempotencyKey: "carryover-key",
        notes: "Carried over from appointment payment state.",
        referenceNumber: "appointment-1",
        stripeCheckoutSessionId: "cs_test_123",
        stripePaymentIntentId: "pi_test_123",
        stripeChargeId: "ch_test_123",
      },
      "20",
      new Date("2026-04-12T02:00:00.000Z")
    );

    expect(values).toMatchObject({
      businessId: "business-1",
      invoiceId: "invoice-1",
      amount: "20",
      method: "other",
      idempotencyKey: "carryover-key",
    });
    expect(values).not.toHaveProperty("notes");
    expect(values).not.toHaveProperty("referenceNumber");
    expect(values).not.toHaveProperty("stripeCheckoutSessionId");
    expect(values).not.toHaveProperty("stripePaymentIntentId");
    expect(values).not.toHaveProperty("stripeChargeId");
  });
});
