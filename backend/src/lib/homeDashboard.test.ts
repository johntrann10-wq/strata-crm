import { describe, expect, it } from "vitest";
import {
  applyActionQueuePriority,
  buildQuickActions,
  calculateHomeDashboardHealth,
  getDashboardModulePermissions,
  getDashboardTimeOfDay,
  getHomeDashboardCacheKey,
  getHomeDashboardCacheTags,
  getRoleDefaultWidgetOrder,
  mergeWidgetPreferences,
} from "./homeDashboard.js";

describe("home dashboard domain logic", () => {
  it("builds stable cache keys within the same business day and permission set", () => {
    const one = getHomeDashboardCacheKey({
      businessId: "biz-1",
      userId: "user-1",
      permissions: ["dashboard.view", "appointments.read"],
      timezone: "America/Los_Angeles",
      now: new Date("2026-04-10T16:00:00.000Z"),
    });
    const two = getHomeDashboardCacheKey({
      businessId: "biz-1",
      userId: "user-1",
      permissions: ["appointments.read", "dashboard.view"],
      timezone: "America/Los_Angeles",
      now: new Date("2026-04-10T23:59:00.000Z"),
    });

    expect(one).toBe(two);
  });

  it("changes cache key when the business day changes", () => {
    const one = getHomeDashboardCacheKey({
      businessId: "biz-1",
      userId: "user-1",
      permissions: ["dashboard.view"],
      timezone: "America/Los_Angeles",
      now: new Date("2026-04-10T06:59:00.000Z"),
    });
    const two = getHomeDashboardCacheKey({
      businessId: "biz-1",
      userId: "user-1",
      permissions: ["dashboard.view"],
      timezone: "America/Los_Angeles",
      now: new Date("2026-04-10T07:01:00.000Z"),
    });

    expect(one).not.toBe(two);
  });

  it("changes cache key when the dashboard range or team filter changes", () => {
    const base = {
      businessId: "biz-1",
      userId: "user-1",
      permissions: ["dashboard.view"],
      timezone: "America/Los_Angeles",
      now: new Date("2026-04-10T16:00:00.000Z"),
    };

    const today = getHomeDashboardCacheKey({ ...base, range: "today", teamMemberId: null });
    const week = getHomeDashboardCacheKey({ ...base, range: "week", teamMemberId: null });
    const team = getHomeDashboardCacheKey({ ...base, range: "today", teamMemberId: "staff-1" });

    expect(today).not.toBe(week);
    expect(today).not.toBe(team);
  });

  it("returns business and user cache tags for easy invalidation", () => {
    expect(getHomeDashboardCacheTags({ businessId: "biz-1", userId: "user-1" })).toEqual([
      "business:biz-1",
      "dashboard:biz-1",
      "dashboard:biz-1:user-1",
    ]);
  });

  it("derives time-of-day windows from the business timezone", () => {
    expect(getDashboardTimeOfDay(new Date("2026-04-10T15:00:00.000Z"), "America/Los_Angeles")).toBe("morning");
    expect(getDashboardTimeOfDay(new Date("2026-04-10T20:00:00.000Z"), "America/Los_Angeles")).toBe("midday");
    expect(getDashboardTimeOfDay(new Date("2026-04-11T03:00:00.000Z"), "America/Los_Angeles")).toBe("evening");
  });

  it("merges role defaults with saved widget preferences", () => {
    const merged = mergeWidgetPreferences("technician", "morning", {
      widgetOrder: ["quick_actions", "today_schedule", "action_queue"],
      hiddenWidgets: ["pipeline"],
      defaultRange: "today",
      defaultTeamMemberId: null,
      dismissedQueueItems: {},
      snoozedQueueItems: {},
      lastSeenAt: null,
      updatedAt: null,
    });

    expect(merged.widgetOrder[0]).toBe("quick_actions");
    expect(merged.hiddenWidgets).toContain("pipeline");
    expect(merged.hiddenWidgets).toContain("automations");
  });

  it("applies role-specific widget defaults before user preferences", () => {
    const ownerOrder = getRoleDefaultWidgetOrder("owner", "midday");
    const technicianOrder = getRoleDefaultWidgetOrder("technician", "midday");

    expect(ownerOrder[0]).toBe("summary_needs_action");
    expect(technicianOrder[0]).toBe("summary_today");
    expect(technicianOrder).not.toContain("business_health");
  });

  it("prioritizes deterministic queue items with urgency, money, and timing", () => {
    const prioritized = applyActionQueuePriority({
      now: new Date("2026-04-10T16:00:00.000Z"),
      role: "owner",
      timeOfDay: "morning",
      items: [
        {
          id: "deposit:1",
          type: "deposit_due",
          label: "Collect deposit",
          reason: "Deposit missing",
          urgency: "high",
          amountAtRisk: 300,
          ctaLabel: "Open",
          ctaUrl: "/appointments/1",
          supportsSnooze: true,
          supportsDismiss: true,
          occurredAt: "2026-04-10T18:00:00.000Z",
          priority: 0,
          priorityReasons: [],
        },
        {
          id: "invoice:1",
          type: "overdue_invoice",
          label: "Collect invoice",
          reason: "Invoice overdue",
          urgency: "critical",
          amountAtRisk: 1200,
          ctaLabel: "Open",
          ctaUrl: "/invoices/1",
          supportsSnooze: true,
          supportsDismiss: true,
          occurredAt: "2026-04-08T16:00:00.000Z",
          priority: 0,
          priorityReasons: [],
        },
      ],
    });

    expect(prioritized[0]?.id).toBe("invoice:1");
    expect(prioritized[0]?.priority).toBeGreaterThan(prioritized[1]?.priority ?? 0);
    expect(prioritized[0]?.priorityReasons.length).toBeGreaterThan(1);
  });

  it("boosts role-relevant work ahead of lower-value queue items for technicians", () => {
    const prioritized = applyActionQueuePriority({
      now: new Date("2026-04-10T16:00:00.000Z"),
      role: "technician",
      timeOfDay: "midday",
      items: [
        {
          id: "system:1",
          type: "system_issue",
          label: "Webhook failed",
          reason: "Automation delivery failed",
          urgency: "high",
          amountAtRisk: null,
          ctaLabel: "Open",
          ctaUrl: "/settings",
          supportsSnooze: true,
          supportsDismiss: true,
          occurredAt: "2026-04-10T15:30:00.000Z",
          priority: 0,
          priorityReasons: [],
        },
        {
          id: "deposit:1",
          type: "deposit_due",
          label: "Collect deposit",
          reason: "Tomorrow morning appointment is missing a deposit",
          urgency: "high",
          amountAtRisk: 250,
          ctaLabel: "Open",
          ctaUrl: "/appointments/1",
          supportsSnooze: true,
          supportsDismiss: true,
          occurredAt: "2026-04-10T17:00:00.000Z",
          priority: 0,
          priorityReasons: [],
        },
      ],
    });

    expect(prioritized[0]?.id).toBe("deposit:1");
    expect(prioritized[0]?.priorityReasons).toEqual(expect.arrayContaining(["appointment imminent", "money at risk"]));
  });

  it("returns only the quick actions that the current permission set can actually execute", () => {
    const ownerRawPermissions = [
      "dashboard.view",
      "appointments.read",
      "appointments.write",
      "customers.read",
      "customers.write",
      "vehicles.read",
      "vehicles.write",
      "quotes.read",
      "quotes.write",
      "invoices.read",
      "invoices.write",
      "payments.read",
      "payments.write",
    ];
    const technicianRawPermissions = [
      "dashboard.view",
      "appointments.read",
      "customers.read",
      "vehicles.read",
      "quotes.read",
      "invoices.read",
    ];
    const ownerPermissions = getDashboardModulePermissions([...ownerRawPermissions]);
    const technicianPermissions = getDashboardModulePermissions([...technicianRawPermissions]);

    expect(buildQuickActions(ownerPermissions, [...ownerRawPermissions]).map((action) => action.key)).toEqual([
      "new_appointment",
      "new_quote",
      "new_invoice",
      "add_client",
      "add_vehicle",
      "collect_payment",
      "send_reminder",
    ]);
    expect(buildQuickActions(technicianPermissions, [...technicianRawPermissions]).map((action) => action.key)).toEqual([]);
  });

  it("computes transparent health scores from only the permitted factors", () => {
    const health = calculateHomeDashboardHealth({
      overdueLeadCount: 2,
      overdueInvoiceCount: 1,
      missingDepositCount: 3,
      completedMissingInvoiceCount: 1,
      failedAutomationCount: 2,
      scheduleConflictCount: 1,
      permissions: {
        today: true,
        cash: true,
        conversion: true,
        todaySchedule: true,
        actionQueue: true,
        pipeline: true,
        revenueCollections: true,
        recentActivity: true,
        automations: true,
        businessHealth: true,
        goals: true,
        teamVisibility: true,
        clientVisibility: true,
        vehicleVisibility: true,
        quoteVisibility: true,
        invoiceVisibility: true,
        paymentVisibility: true,
        settingsVisibility: true,
      },
    });

    expect(health.score).toBeLessThan(100);
    expect(health.factors.map((factor) => factor.key)).toEqual([
      "lead_response",
      "overdue_invoices",
      "missing_deposits",
      "completed_missing_invoice",
      "automation_failures",
      "schedule_conflicts",
    ]);
    expect(health.topIssues.length).toBeGreaterThan(0);
  });

  it("omits finance-only factors when the user lacks finance permissions", () => {
    const health = calculateHomeDashboardHealth({
      overdueLeadCount: 2,
      overdueInvoiceCount: 5,
      missingDepositCount: 0,
      completedMissingInvoiceCount: 4,
      failedAutomationCount: 0,
      scheduleConflictCount: 1,
      permissions: {
        today: true,
        cash: false,
        conversion: true,
        todaySchedule: true,
        actionQueue: true,
        pipeline: true,
        revenueCollections: false,
        recentActivity: true,
        automations: false,
        businessHealth: true,
        goals: false,
        teamVisibility: false,
        clientVisibility: true,
        vehicleVisibility: false,
        quoteVisibility: false,
        invoiceVisibility: false,
        paymentVisibility: false,
        settingsVisibility: false,
      },
    });

    expect(health.factors.some((factor) => factor.key === "overdue_invoices")).toBe(false);
    expect(health.factors.some((factor) => factor.key === "completed_missing_invoice")).toBe(false);
  });
});
