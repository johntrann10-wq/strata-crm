import { describe, expect, it } from "vitest";
import {
  determineBillingPromptStage,
  getBillingPromptCooldownDays,
  getDaysLeftInTrial,
  pickBillingActivationMilestone,
} from "./billingPrompts.js";

describe("billing prompt helpers", () => {
  it("uses the earliest activation milestone that proves product value", () => {
    const milestone = pickBillingActivationMilestone([
      {
        type: "quote_created",
        occurredAt: new Date("2026-04-10T12:00:00.000Z"),
        detail: "First quote created",
      },
      {
        type: "clients_3_added",
        occurredAt: new Date("2026-04-08T12:00:00.000Z"),
        detail: "First three clients added",
      },
    ]);

    expect(milestone.reached).toBe(true);
    expect(milestone.type).toBe("clients_3_added");
    expect(milestone.detail).toBe("First three clients added");
  });

  it("shows a soft prompt after activation before the late-trial windows begin", () => {
    expect(
      determineBillingPromptStage({
        accessState: "active_trial",
        trialEndsAt: new Date("2026-05-15T00:00:00.000Z"),
        activationMilestoneReached: true,
        now: new Date("2026-04-11T00:00:00.000Z"),
      })
    ).toBe("soft_activation");
  });

  it("escalates to 7, 3, and 1 day prompts as trial end approaches", () => {
    expect(
      determineBillingPromptStage({
        accessState: "active_trial",
        trialEndsAt: new Date("2026-04-18T00:00:00.000Z"),
        activationMilestoneReached: false,
        now: new Date("2026-04-11T00:00:00.000Z"),
      })
    ).toBe("trial_7_days");
    expect(
      determineBillingPromptStage({
        accessState: "active_trial",
        trialEndsAt: new Date("2026-04-14T00:00:00.000Z"),
        activationMilestoneReached: false,
        now: new Date("2026-04-11T00:00:00.000Z"),
      })
    ).toBe("trial_3_days");
    expect(
      determineBillingPromptStage({
        accessState: "active_trial",
        trialEndsAt: new Date("2026-04-12T00:00:00.000Z"),
        activationMilestoneReached: false,
        now: new Date("2026-04-11T00:00:00.000Z"),
      })
    ).toBe("trial_1_day");
  });

  it("suppresses trial prompts once a payment method is already on file", () => {
    expect(
      determineBillingPromptStage({
        accessState: "active_trial",
        trialEndsAt: new Date("2026-04-12T00:00:00.000Z"),
        activationMilestoneReached: true,
        hasPaymentMethod: true,
        now: new Date("2026-04-11T00:00:00.000Z"),
      })
    ).toBe("none");
  });

  it("treats paused and canceled workspaces as blocking paused prompts", () => {
    expect(
      determineBillingPromptStage({
        accessState: "paused_missing_payment_method",
        trialEndsAt: null,
        activationMilestoneReached: true,
      })
    ).toBe("paused");
    expect(
      determineBillingPromptStage({
        accessState: "canceled",
        trialEndsAt: null,
        activationMilestoneReached: true,
      })
    ).toBe("paused");
  });

  it("returns sane trial-day math and cooldown defaults", () => {
    expect(
      getDaysLeftInTrial(new Date("2026-04-20T00:00:00.000Z"), new Date("2026-04-11T12:00:00.000Z"))
    ).toBe(9);
    expect(getBillingPromptCooldownDays()).toBeGreaterThanOrEqual(1);
  });
});
