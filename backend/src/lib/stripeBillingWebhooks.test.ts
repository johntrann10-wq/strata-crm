import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { deriveStripeBillingWebhookAction } from "./stripeBillingWebhooks.js";

describe("stripe billing webhook fixtures", () => {
  it("maps subscription lifecycle fixtures into local snapshot updates", () => {
    const event = {
      id: "evt_subscription_updated",
      type: "customer.subscription.updated",
      created: 1_775_267_200,
      livemode: false,
      data: {
        object: {
          id: "sub_123",
          object: "subscription",
          customer: "cus_123",
          status: "paused",
          trial_start: 1_775_008_000,
          trial_end: 1_777_600_000,
          default_payment_method: null,
          items: {
            data: [
              {
                current_period_end: 1_777_600_000,
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;

    const action = deriveStripeBillingWebhookAction(event);
    expect(action.kind).toBe("subscription_snapshot");
    if (action.kind !== "subscription_snapshot") return;
    expect(action.subscriptionId).toBe("sub_123");
    expect(action.customerId).toBe("cus_123");
    expect(action.status).toBe("paused");
    expect(action.hasPaymentMethod).toBe(false);
    expect(action.trialEnd?.toISOString()).toBe(new Date(1_777_600_000 * 1000).toISOString());
  });

  it("maps trial ending fixtures into reminder work", () => {
    const event = {
      id: "evt_trial_will_end",
      type: "customer.subscription.trial_will_end",
      created: 1_775_267_200,
      livemode: false,
      data: {
        object: {
          id: "sub_trial",
          object: "subscription",
          customer: "cus_trial",
          status: "trialing",
          trial_end: 1_775_526_400,
          default_payment_method: null,
          items: { data: [] },
        },
      },
    } as unknown as Stripe.Event;

    const action = deriveStripeBillingWebhookAction(event);
    expect(action.kind).toBe("trial_will_end");
    if (action.kind !== "trial_will_end") return;
    expect(action.subscriptionId).toBe("sub_trial");
    expect(action.customerId).toBe("cus_trial");
    expect(action.status).toBe("trialing");
  });

  it("maps invoice payment failure fixtures into retry guidance work", () => {
    const event = {
      id: "evt_invoice_failed",
      type: "invoice.payment_failed",
      created: 1_775_267_200,
      livemode: false,
      data: {
        object: {
          id: "in_123",
          object: "invoice",
          customer: "cus_123",
          subscription: "sub_123",
          status: "open",
          amount_due: 2900,
          amount_paid: 0,
          attempt_count: 2,
        },
      },
    } as unknown as Stripe.Event;

    const action = deriveStripeBillingWebhookAction(event);
    expect(action.kind).toBe("invoice_lifecycle");
    if (action.kind !== "invoice_lifecycle") return;
    expect(action.eventType).toBe("invoice.payment_failed");
    expect(action.invoiceId).toBe("in_123");
    expect(action.subscriptionId).toBe("sub_123");
    expect(action.amountDue).toBe(29);
    expect(action.attemptCount).toBe(2);
  });

  it("maps resumed and deleted subscription fixtures into lifecycle actions", () => {
    const resumedEvent = {
      id: "evt_subscription_resumed",
      type: "customer.subscription.resumed",
      created: 1_775_267_200,
      livemode: false,
      data: {
        object: {
          id: "sub_resume",
          object: "subscription",
          customer: "cus_resume",
          status: "active",
          trial_start: 1_775_008_000,
          trial_end: 1_777_600_000,
          default_payment_method: "pm_123",
          items: {
            data: [
              {
                current_period_end: 1_777_600_000,
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;

    const resumedAction = deriveStripeBillingWebhookAction(resumedEvent);
    expect(resumedAction.kind).toBe("subscription_snapshot");
    if (resumedAction.kind !== "subscription_snapshot") return;
    expect(resumedAction.status).toBe("active");
    expect(resumedAction.hasPaymentMethod).toBe(true);

    const deletedEvent = {
      id: "evt_subscription_deleted",
      type: "customer.subscription.deleted",
      created: 1_775_267_200,
      livemode: false,
      data: {
        object: {
          id: "sub_deleted",
          object: "subscription",
          customer: "cus_deleted",
          status: "canceled",
          default_payment_method: null,
          items: { data: [] },
        },
      },
    } as unknown as Stripe.Event;

    const deletedAction = deriveStripeBillingWebhookAction(deletedEvent);
    expect(deletedAction.kind).toBe("subscription_deleted");
    if (deletedAction.kind !== "subscription_deleted") return;
    expect(deletedAction.subscriptionId).toBe("sub_deleted");
    expect(deletedAction.customerId).toBe("cus_deleted");
    expect(deletedAction.hasPaymentMethod).toBe(false);
  });
});
