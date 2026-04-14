import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { getStripeWebhookPayload } from "./billing.js";

describe("stripe webhook payload redaction", () => {
  it("stores a minimal summary without sensitive customer fields", () => {
    const event = {
      id: "evt_test",
      type: "invoice.payment_succeeded",
      created: 1700000000,
      livemode: false,
      data: {
        object: {
          object: "invoice",
          id: "in_123",
          customer: "cus_123",
          status: "paid",
          customer_email: "owner@example.com",
          lines: { data: [{ id: "li_1" }] },
        },
      },
    } as unknown as Stripe.Event;

    const payload = getStripeWebhookPayload(event);
    const parsed = JSON.parse(payload) as Record<string, any>;

    expect(parsed).toMatchObject({
      id: "evt_test",
      type: "invoice.payment_succeeded",
      created: 1700000000,
      livemode: false,
    });
    expect(parsed.data).toMatchObject({
      object: "invoice",
      id: "in_123",
      status: "paid",
      customer: "cus_123",
    });
    expect(payload).not.toContain("customer_email");
    expect(payload).not.toContain("owner@example.com");
    expect(payload).not.toContain("lines");
  });
});
