import { describe, expect, it } from "vitest";
import {
  getBillingAccessStateForSubscriptionStatus,
  hasFullBillingAccess,
  isRestrictedBillingAccess,
} from "./billingAccess.js";

describe("billing access state helpers", () => {
  it("maps Stripe trialing and active states to full-access modes", () => {
    expect(getBillingAccessStateForSubscriptionStatus("trialing")).toBe("active_trial");
    expect(getBillingAccessStateForSubscriptionStatus("active")).toBe("active_paid");
    expect(getBillingAccessStateForSubscriptionStatus("past_due")).toBe("active_paid");
  });

  it("maps paused subscriptions to missing-payment-method access", () => {
    expect(getBillingAccessStateForSubscriptionStatus("paused")).toBe("paused_missing_payment_method");
  });

  it("treats pending setup and setup failures as full access", () => {
    expect(hasFullBillingAccess("pending_setup")).toBe(true);
    expect(hasFullBillingAccess("pending_setup_failure")).toBe(true);
    expect(isRestrictedBillingAccess("paused_missing_payment_method")).toBe(true);
    expect(isRestrictedBillingAccess("canceled")).toBe(true);
  });

  it("never treats paused or canceled subscriptions as full access", () => {
    expect(hasFullBillingAccess("paused_missing_payment_method")).toBe(false);
    expect(hasFullBillingAccess("canceled")).toBe(false);
    expect(isRestrictedBillingAccess("active_trial")).toBe(false);
    expect(isRestrictedBillingAccess("active_paid")).toBe(false);
  });
});
