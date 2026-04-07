import { describe, it, expect } from "vitest";
import { z } from "zod";
import { calculateFinanceCollectionRate, calculateGrowthMetrics, getCronExecutionGate, normalizeFinanceInvoiceStatus } from "./actions.js";

describe("actions route logic", () => {
  const idParamSchema = z.object({ id: z.string().uuid() });
  const clientIdParamSchema = z.object({ clientId: z.string().uuid().optional(), id: z.string().uuid().optional() });

  it("idParamSchema requires valid uuid id", () => {
    expect(idParamSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
    expect(idParamSchema.safeParse({ id: "invalid" }).success).toBe(false);
    expect(idParamSchema.safeParse({}).success).toBe(false);
  });

  it("clientIdParamSchema accepts clientId or id", () => {
    const withClientId = clientIdParamSchema.safeParse({ clientId: "550e8400-e29b-41d4-a716-446655440000" });
    expect(withClientId.success).toBe(true);
    if (withClientId.success) {
      expect(withClientId.data.clientId ?? withClientId.data.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
    const withId = clientIdParamSchema.safeParse({ id: "660e8400-e29b-41d4-a716-446655440001" });
    expect(withId.success).toBe(true);
    if (withId.success) {
      expect(withId.data.clientId ?? withId.data.id).toBe("660e8400-e29b-41d4-a716-446655440001");
    }
  });

  it("multi-tenant: id must be uuid so we never accept arbitrary string from another tenant", () => {
    const bad = idParamSchema.safeParse({ id: "'; DROP TABLE businesses;--" });
    expect(bad.success).toBe(false);
  });

  it("blocks cron execution when CRON_SECRET is missing", () => {
    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    expect(getCronExecutionGate(undefined)).toEqual({
      ok: false,
      statusCode: 503,
      message: "CRON_SECRET is not configured.",
    });

    if (previous === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previous;
    }
  });

  it("rejects cron execution when the provided secret does not match", () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "expected-secret";

    expect(getCronExecutionGate("wrong-secret")).toEqual({
      ok: false,
      statusCode: 401,
      message: "Unauthorized",
    });

    if (previous === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previous;
    }
  });

  it("allows cron execution when the provided secret matches", () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "expected-secret";

    expect(getCronExecutionGate("expected-secret")).toEqual({
      ok: true,
    });

    if (previous === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previous;
    }
  });

  it("calculates growth metrics from lead and paid invoice records", () => {
    const metrics = calculateGrowthMetrics(
      [
        {
          id: "client-1",
          createdAt: new Date("2026-04-01T10:00:00.000Z"),
          notes: [
            "Lead status: converted",
            "Lead source: instagram",
            "Service interest: Coating",
            "Next step: Booked",
            "Lead summary: Wants ceramic",
            "Lead vehicle: Model Y",
            "First contacted at: 2026-04-01T11:00:00.000Z",
          ].join("\n"),
        },
        {
          id: "client-2",
          createdAt: new Date("2026-04-02T10:00:00.000Z"),
          notes: [
            "Lead status: new",
            "Lead source: google",
            "Service interest: Tint",
            "Next step: Follow up",
            "Lead summary: Waiting on quote",
            "Lead vehicle: Civic",
            "First contacted at: ",
          ].join("\n"),
        },
        {
          id: "client-3",
          createdAt: new Date("2026-04-03T09:00:00.000Z"),
          notes: [
            "Lead status: booked",
            "Lead source: instagram",
            "Service interest: Detail",
            "Next step: Appointment set",
            "Lead summary: Saturday opening",
            "Lead vehicle: F-150",
            "First contacted at: 2026-04-03T10:30:00.000Z",
          ].join("\n"),
        },
      ],
      [
        { clientId: "client-1", total: 500, paidAt: new Date("2026-04-04T10:00:00.000Z") },
        { clientId: "client-1", total: 250, paidAt: new Date("2026-04-05T10:00:00.000Z") },
        { clientId: "client-3", total: 300, paidAt: new Date("2026-04-05T11:00:00.000Z") },
      ],
      { now: new Date("2026-04-05T12:00:00.000Z") }
    );

    expect(metrics.periodDays).toBeNull();
    expect(metrics.totalLeads).toBe(3);
    expect(metrics.convertedLeadCount).toBe(1);
    expect(metrics.bookedLeadCount).toBe(2);
    expect(metrics.closeRate).toBe(33);
    expect(metrics.bookingRate).toBe(67);
    expect(metrics.totalPayingCustomers).toBe(2);
    expect(metrics.repeatCustomerCount).toBe(1);
    expect(metrics.repeatCustomerRate).toBe(50);
    expect(metrics.attributedRevenue).toBe(1050);
    expect(metrics.unattributedRevenue).toBe(0);
    expect(metrics.returningRevenue).toBe(750);
    expect(metrics.newCustomerRevenue).toBe(300);
    expect(metrics.averageFirstResponseHours).toBeCloseTo(1.25, 5);
    expect(metrics.recentWeeks).toHaveLength(4);
    const activeWeek = metrics.recentWeeks.find((week) => week.leadCount === 3);
    expect(activeWeek).toMatchObject({
      leadCount: 3,
      convertedCount: 1,
      bookedCount: 2,
      closeRate: 33,
      bookingRate: 67,
    });
    expect(activeWeek?.averageFirstResponseHours).toBeCloseTo(1.25, 5);
    expect(metrics.revenueBySource[0]).toMatchObject({
      source: "instagram",
      leadCount: 2,
      convertedCount: 1,
      bookedCount: 2,
      closeRate: 50,
      bookingRate: 100,
      revenue: 1050,
      shareOfRevenue: 100,
    });
  });

  it("scopes growth metrics to the requested period", () => {
    const metrics = calculateGrowthMetrics(
      [
        {
          id: "client-1",
          createdAt: new Date("2026-03-01T10:00:00.000Z"),
          notes: [
            "Lead status: converted",
            "Lead source: google",
            "Service interest: Coating",
            "Next step: Booked",
            "Lead summary: Wants ceramic",
            "Lead vehicle: Model Y",
            "First contacted at: 2026-03-01T11:00:00.000Z",
          ].join("\n"),
        },
        {
          id: "client-2",
          createdAt: new Date("2026-04-03T09:00:00.000Z"),
          notes: [
            "Lead status: booked",
            "Lead source: instagram",
            "Service interest: Detail",
            "Next step: Appointment set",
            "Lead summary: Saturday opening",
            "Lead vehicle: F-150",
            "First contacted at: 2026-04-03T10:30:00.000Z",
          ].join("\n"),
        },
      ],
      [
        { clientId: "client-1", total: 500, paidAt: new Date("2026-03-05T10:00:00.000Z") },
        { clientId: "client-2", total: 300, paidAt: new Date("2026-04-05T11:00:00.000Z") },
      ],
      { now: new Date("2026-04-05T12:00:00.000Z"), periodDays: 30 }
    );

    expect(metrics.periodDays).toBe(30);
    expect(metrics.totalLeads).toBe(1);
    expect(metrics.bookedLeadCount).toBe(1);
    expect(metrics.convertedLeadCount).toBe(0);
    expect(metrics.attributedRevenue).toBe(300);
    expect(metrics.returningRevenue).toBe(0);
    expect(metrics.newCustomerRevenue).toBe(300);
    expect(metrics.revenueBySource[0]).toMatchObject({
      source: "instagram",
      revenue: 300,
      shareOfRevenue: 100,
    });
  });

  it("normalizes overdue and partial finance invoice statuses from real balances", () => {
    expect(
      normalizeFinanceInvoiceStatus(
        {
          status: "sent",
          dueDate: new Date("2026-04-01T00:00:00.000Z"),
          total: 500,
          totalPaid: 0,
        },
        new Date("2026-04-06T12:00:00.000Z")
      )
    ).toBe("overdue");

    expect(
      normalizeFinanceInvoiceStatus(
        {
          status: "sent",
          dueDate: new Date("2026-04-10T00:00:00.000Z"),
          total: 500,
          totalPaid: 150,
        },
        new Date("2026-04-06T12:00:00.000Z")
      )
    ).toBe("partial");
  });

  it("caps finance collection rate between zero and one hundred percent", () => {
    expect(calculateFinanceCollectionRate(500, 1000)).toBe(50);
    expect(calculateFinanceCollectionRate(1500, 1000)).toBe(100);
    expect(calculateFinanceCollectionRate(0, 0)).toBe(0);
  });
});
