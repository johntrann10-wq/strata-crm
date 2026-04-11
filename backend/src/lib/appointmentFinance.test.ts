import { describe, expect, it } from "vitest";
import { calculateAppointmentFinanceSummary, getAppointmentFinanceMirrorUpdates } from "./appointmentFinance.js";

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

  it("treats paidAt on a no-deposit appointment as paid in full without inventing a deposit", () => {
    const summary = calculateAppointmentFinanceSummary({
      id: "apt-paid-no-deposit",
      totalPrice: 715.85,
      depositAmount: 0,
      directCollectedAmount: 0,
      invoiceCollectedAmount: 0,
      invoiceCarryoverAmount: 0,
      paidAt: "2026-04-10T18:00:00.000Z",
    });

    expect(summary.collectedAmount).toBe(715.85);
    expect(summary.balanceDue).toBe(0);
    expect(summary.hasAnyPayment).toBe(true);
    expect(summary.paidInFull).toBe(true);
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

  it("counts invoice payments on a no-deposit appointment without inventing deposit satisfaction", () => {
    const summary = calculateAppointmentFinanceSummary({
      id: "apt-invoice-no-deposit",
      totalPrice: 695,
      depositAmount: 0,
      directCollectedAmount: 0,
      invoiceCollectedAmount: 595,
      invoiceCarryoverAmount: 0,
      paidAt: null,
    });

    expect(summary.collectedAmount).toBe(595);
    expect(summary.balanceDue).toBe(100);
    expect(summary.hasAnyPayment).toBe(true);
    expect(summary.paidInFull).toBe(false);
    expect(summary.depositSatisfied).toBe(false);
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

  it("requires the real deposit amount before marking a deposit as satisfied", () => {
    const beforeBoundary = calculateAppointmentFinanceSummary({
      id: "apt-deposit-boundary-before",
      totalPrice: 1000,
      depositAmount: 200,
      directCollectedAmount: 199.99,
      invoiceCollectedAmount: 0,
      invoiceCarryoverAmount: 0,
      paidAt: null,
    });

    const exactDeposit = calculateAppointmentFinanceSummary({
      id: "apt-deposit-boundary-at",
      totalPrice: 1000,
      depositAmount: 200,
      directCollectedAmount: 200,
      invoiceCollectedAmount: 0,
      invoiceCarryoverAmount: 0,
      paidAt: null,
    });

    expect(beforeBoundary.depositSatisfied).toBe(false);
    expect(beforeBoundary.balanceDue).toBe(800.01);
    expect(exactDeposit.depositSatisfied).toBe(true);
    expect(exactDeposit.balanceDue).toBe(800);
  });

  it("builds compatibility mirror updates without touching deposit state for no-deposit jobs", () => {
    const finance = calculateAppointmentFinanceSummary({
      id: "apt-mirror-no-deposit",
      totalPrice: 715.85,
      depositAmount: 0,
      directCollectedAmount: 0,
      invoiceCollectedAmount: 715.85,
      invoiceCarryoverAmount: 0,
      paidAt: null,
    });

    const updates = getAppointmentFinanceMirrorUpdates({
      depositAmount: 0,
      finance,
      paidAtWhenPaid: new Date("2026-04-10T18:00:00.000Z"),
      includeUpdatedAt: true,
    });

    expect(updates.paidAt).toEqual(new Date("2026-04-10T18:00:00.000Z"));
    expect("depositPaid" in updates).toBe(false);
    expect(updates.updatedAt).toBeInstanceOf(Date);
  });

  it("builds compatibility mirror updates for satisfied deposit-required jobs", () => {
    const finance = calculateAppointmentFinanceSummary({
      id: "apt-mirror-deposit",
      totalPrice: 1000,
      depositAmount: 200,
      directCollectedAmount: 200,
      invoiceCollectedAmount: 0,
      invoiceCarryoverAmount: 0,
      paidAt: null,
    });

    const updates = getAppointmentFinanceMirrorUpdates({
      depositAmount: 200,
      finance,
      paidAtWhenPaid: null,
      includeUpdatedAt: false,
    });

    expect(updates.paidAt).toBeNull();
    expect(updates.depositPaid).toBe(true);
    expect("updatedAt" in updates).toBe(false);
  });

  it("can skip paidAt when only create-time deposit mirroring is needed", () => {
    const updates = getAppointmentFinanceMirrorUpdates({
      depositAmount: 200,
      finance: {
        depositSatisfied: true,
        paidInFull: false,
      },
      includePaidAt: false,
      includeUpdatedAt: false,
    });

    expect(updates.depositPaid).toBe(true);
    expect("paidAt" in updates).toBe(false);
  });
});
