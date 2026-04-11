import { describe, expect, it } from "vitest";
import { calculateAppointmentFinanceSummary } from "./appointmentFinance.js";

describe("appointment finance summary", () => {
  it("keeps fresh appointments unpaid when no payment exists", () => {
    const summary = calculateAppointmentFinanceSummary({
      id: "apt-1",
      totalPrice: 715.85,
      depositAmount: 0,
      directCollectedAmount: 0,
      invoiceCollectedAmount: 0,
      invoiceCarryoverAmount: 0,
      paidAt: null,
    });

    expect(summary.collectedAmount).toBe(0);
    expect(summary.balanceDue).toBe(715.85);
    expect(summary.hasAnyPayment).toBe(false);
    expect(summary.paidInFull).toBe(false);
    expect(summary.depositSatisfied).toBe(false);
  });

  it("counts direct appointment payment before an invoice exists", () => {
    const summary = calculateAppointmentFinanceSummary({
      id: "apt-2",
      totalPrice: 800,
      depositAmount: 200,
      directCollectedAmount: 200,
      invoiceCollectedAmount: 0,
      invoiceCarryoverAmount: 0,
      paidAt: null,
    });

    expect(summary.collectedAmount).toBe(200);
    expect(summary.balanceDue).toBe(600);
    expect(summary.hasAnyPayment).toBe(true);
    expect(summary.depositSatisfied).toBe(true);
    expect(summary.paidInFull).toBe(false);
  });

  it("avoids double counting when invoice carryover mirrors direct payment", () => {
    const summary = calculateAppointmentFinanceSummary({
      id: "apt-3",
      totalPrice: 1000,
      depositAmount: 200,
      directCollectedAmount: 200,
      invoiceCollectedAmount: 650,
      invoiceCarryoverAmount: 200,
      paidAt: null,
    });

    expect(summary.collectedAmount).toBe(650);
    expect(summary.balanceDue).toBe(350);
    expect(summary.hasAnyPayment).toBe(true);
    expect(summary.depositSatisfied).toBe(true);
    expect(summary.paidInFull).toBe(false);
  });
});
