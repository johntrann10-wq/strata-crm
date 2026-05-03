import { describe, expect, it } from "vitest";
import type { PermissionKey } from "./permissions.js";
import {
  applyActionQueuePriority,
  buildActionQueue,
  buildAddOnInsights,
  buildBookingsOverview,
  buildMonthlyRevenueChart,
  buildPipelineStages,
  buildWeeklyAppointmentOverview,
  buildQuickActions,
  calculateUpcomingDepositCoverage,
  calculateBookedRevenueTotals,
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
    const base: {
      businessId: string;
      userId: string;
      permissions: PermissionKey[];
      timezone: string;
      now: Date;
    } = {
      businessId: "biz-1",
      userId: "user-1",
      permissions: ["dashboard.view"],
      timezone: "America/Los_Angeles",
      now: new Date("2026-04-10T16:00:00.000Z"),
    };

    const today = getHomeDashboardCacheKey({ ...base, range: "today", teamMemberId: null });
    const week = getHomeDashboardCacheKey({ ...base, range: "week", teamMemberId: null });
    const team = getHomeDashboardCacheKey({ ...base, range: "today", teamMemberId: "staff-1" });
    const selectedWeek = getHomeDashboardCacheKey({
      ...base,
      range: "today",
      teamMemberId: null,
      weekStartDate: "2026-04-13",
    });

    expect(today).not.toBe(week);
    expect(today).not.toBe(team);
    expect(today).not.toBe(selectedWeek);
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
    const ownerRawPermissions: PermissionKey[] = [
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
    const technicianRawPermissions: PermissionKey[] = [
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

  it("builds a weekly appointment overview grouped by business day", () => {
    const days = buildWeeklyAppointmentOverview({
      weekStart: new Date("2026-04-06T07:00:00.000Z"),
      timezone: "America/Los_Angeles",
      staffCount: 4,
      rows: [
        {
          id: "appt-1",
          title: "Coating",
          status: "scheduled",
          jobPhase: null,
          startTime: new Date("2026-04-07T16:00:00.000Z"),
          endTime: new Date("2026-04-07T18:00:00.000Z"),
          jobStartTime: null,
          expectedCompletionTime: null,
          pickupReadyTime: null,
          vehicleOnSite: false,
          subtotal: "700",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "800",
          depositAmount: "200",
          clientId: null,
          clientFirstName: null,
          clientLastName: null,
          vehicleId: null,
          vehicleYear: null,
          vehicleMake: null,
          vehicleModel: null,
          assignedStaffId: "staff-1",
          staffFirstName: null,
          staffLastName: null,
          locationId: null,
          locationName: null,
          createdAt: new Date("2026-04-05T16:00:00.000Z"),
          completedAt: null,
        },
        {
          id: "appt-2",
          title: "Wash",
          status: "completed",
          jobPhase: null,
          startTime: new Date("2026-04-07T20:00:00.000Z"),
          endTime: new Date("2026-04-07T21:00:00.000Z"),
          jobStartTime: null,
          expectedCompletionTime: null,
          pickupReadyTime: null,
          vehicleOnSite: false,
          subtotal: "200",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "200",
          depositAmount: null,
          clientId: null,
          clientFirstName: null,
          clientLastName: null,
          vehicleId: null,
          vehicleYear: null,
          vehicleMake: null,
          vehicleModel: null,
          assignedStaffId: "staff-2",
          staffFirstName: null,
          staffLastName: null,
          locationId: null,
          locationName: null,
          createdAt: new Date("2026-04-05T18:00:00.000Z"),
          completedAt: new Date("2026-04-07T22:00:00.000Z"),
        },
        {
          id: "appt-3",
          title: "Cancelled detail",
          status: "cancelled",
          jobPhase: null,
          startTime: new Date("2026-04-07T21:00:00.000Z"),
          endTime: new Date("2026-04-07T22:00:00.000Z"),
          jobStartTime: null,
          expectedCompletionTime: null,
          pickupReadyTime: null,
          vehicleOnSite: false,
          subtotal: "999",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "999",
          depositAmount: null,
          clientId: null,
          clientFirstName: null,
          clientLastName: null,
          vehicleId: null,
          vehicleYear: null,
          vehicleMake: null,
          vehicleModel: null,
          assignedStaffId: null,
          staffFirstName: null,
          staffLastName: null,
          locationId: null,
          locationName: null,
          createdAt: new Date("2026-04-05T19:00:00.000Z"),
          completedAt: null,
        },
      ],
    });

    expect(days).toHaveLength(7);
    expect(days[0]?.shortLabel).toBe("Mon");
    expect(days[1]).toMatchObject({
      appointmentCount: 3,
      bookedValue: 900,
      statusCounts: {
        upcoming: 1,
        inProgress: 0,
        completed: 1,
        cancelled: 1,
      },
      capacityUsage: 50,
    });
    expect(days[1]?.previewItems[0]).toMatchObject({
      id: "appt-1",
      title: "Coating",
      url: "/appointments/appt-1",
    });
  });

  it("builds monthly revenue bars from booked, collected, and expense activity", () => {
    const days = buildMonthlyRevenueChart({
      monthStart: new Date("2026-04-01T07:00:00.000Z"),
      monthEnd: new Date("2026-04-30T06:59:59.999Z"),
      timezone: "America/Los_Angeles",
      monthlyRevenueGoal: 10000,
      bookedAppointments: [
        {
          bookedAt: new Date("2026-04-02T16:00:00.000Z"),
          subtotal: "500",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "500",
        },
      ],
      standaloneInvoices: [{ bookedAt: new Date("2026-04-03T16:00:00.000Z"), total: "300" }],
      collectedPayments: [
        { paidAt: new Date("2026-04-04T16:00:00.000Z"), amount: 250 },
        { paidAt: new Date("2026-04-04T18:00:00.000Z"), amount: 75 },
        { paidAt: new Date("2026-04-04T19:00:00.000Z"), amount: -25 },
      ],
      expenseRows: [{ expenseDate: new Date("2026-04-05T16:00:00.000Z"), amount: "125" }],
    });

    expect(days[1]).toMatchObject({
      dayOfMonth: 2,
      bookedRevenue: 500,
      collectedRevenue: 0,
      expenseAmount: 0,
      netAmount: 0,
      bookedUrl: "/calendar?view=day&date=2026-04-02",
      collectedUrl: "/finances?focusDate=2026-04-02",
      expenseUrl: "/finances?focusDate=2026-04-02",
    });
    expect(days[2]).toMatchObject({ dayOfMonth: 3, bookedRevenue: 300 });
    expect(days[3]).toMatchObject({ dayOfMonth: 4, collectedRevenue: 300 });
    expect(days[4]).toMatchObject({ dayOfMonth: 5, expenseAmount: 125, netAmount: -125 });
  });

  it("ignores invalid monthly revenue dates instead of degrading the chart", () => {
    const days = buildMonthlyRevenueChart({
      monthStart: new Date("2026-04-01T07:00:00.000Z"),
      monthEnd: new Date("2026-04-30T06:59:59.999Z"),
      timezone: "America/Los_Angeles",
      monthlyRevenueGoal: null,
      bookedAppointments: [
        {
          bookedAt: "not-a-date",
          subtotal: "500",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "500",
        },
      ],
      standaloneInvoices: [{ bookedAt: "also-not-a-date", total: "300" }],
      collectedPayments: [{ paidAt: "still-not-a-date", amount: 250 }],
      expenseRows: [{ expenseDate: "bad-expense-date", amount: "125" }],
    });

    expect(days.length).toBeGreaterThan(0);
    expect(days.every((day) => day.bookedRevenue === 0 && day.collectedRevenue === 0 && day.expenseAmount === 0)).toBe(true);
  });

  it("prefers computed appointment finance totals over stale dashboard totalPrice values", () => {
    const days = buildWeeklyAppointmentOverview({
      weekStart: new Date("2026-04-06T07:00:00.000Z"),
      timezone: "America/Los_Angeles",
      staffCount: 2,
      rows: [
        {
          id: "appt-computed",
          title: "Computed finance job",
          status: "scheduled",
          jobPhase: null,
          startTime: new Date("2026-04-07T16:00:00.000Z"),
          endTime: new Date("2026-04-07T18:00:00.000Z"),
          jobStartTime: null,
          expectedCompletionTime: null,
          pickupReadyTime: null,
          vehicleOnSite: false,
          subtotal: "100",
          taxRate: "10",
          taxAmount: "11",
          applyTax: true,
          adminFeeRate: "10",
          adminFeeAmount: "10",
          applyAdminFee: true,
          totalPrice: "999",
          depositAmount: null,
          clientId: null,
          clientFirstName: null,
          clientLastName: null,
          vehicleId: null,
          vehicleYear: null,
          vehicleMake: null,
          vehicleModel: null,
          assignedStaffId: "staff-1",
          staffFirstName: null,
          staffLastName: null,
          locationId: null,
          locationName: null,
          createdAt: new Date("2026-04-05T16:00:00.000Z"),
          completedAt: null,
        },
      ],
    });

    expect(days[1]?.bookedValue).toBe(121);
  });

  it("calculates deposit coverage from upcoming deposit-backed appointments only", () => {
    const amount = calculateUpcomingDepositCoverage({
      rows: [
        { id: "covered", depositAmount: "250" },
        { id: "due", depositAmount: "300" },
        { id: "no-deposit", depositAmount: "0" },
      ],
      financeByAppointmentId: new Map([
        [
          "covered",
          {
            collectedAmount: 250,
            balanceDue: 500,
            paidInFull: false,
            depositSatisfied: true,
            hasAnyPayment: true,
            directCollectedAmount: 250,
            invoiceCollectedAmount: 0,
            invoiceCarryoverAmount: 0,
          },
        ],
        [
          "due",
          {
            collectedAmount: 0,
            balanceDue: 900,
            paidInFull: false,
            depositSatisfied: false,
            hasAnyPayment: false,
            directCollectedAmount: 0,
            invoiceCollectedAmount: 0,
            invoiceCarryoverAmount: 0,
          },
        ],
      ]),
    });

    expect(amount).toBe(250);
  });

  it("calculates booked weekly revenue from booked dates instead of the visible schedule slice", () => {
    const totals = calculateBookedRevenueTotals({
      weekStart: new Date("2026-04-06T07:00:00.000Z"),
      weekEnd: new Date("2026-04-13T06:59:59.999Z"),
      bookedAppointments: [
        {
          bookedAt: new Date("2026-04-07T16:00:00.000Z"),
          subtotal: "500",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "500",
        },
        {
          bookedAt: new Date("2026-04-11T18:00:00.000Z"),
          subtotal: "350",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "350",
        },
        {
          bookedAt: new Date("2026-04-14T18:00:00.000Z"),
          subtotal: "900",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "900",
        },
      ],
      standaloneInvoices: [
        { bookedAt: new Date("2026-04-10T12:00:00.000Z"), total: "200" },
        { bookedAt: new Date("2026-04-14T12:00:00.000Z"), total: "400" },
      ],
    });

    expect(totals).toEqual({
      bookedRevenueThisWeek: 1050,
      bookedRevenueThisMonth: 2350,
    });
  });

  it("builds the bookings overview from appointments, quotes, pipeline, and deposit pressure", () => {
    const overview = buildBookingsOverview({
      todayStart: new Date("2026-04-10T07:00:00.000Z"),
      todayEnd: new Date("2026-04-11T06:59:59.999Z"),
      weekStart: new Date("2026-04-06T07:00:00.000Z"),
      weekEnd: new Date("2026-04-13T06:59:59.999Z"),
      monthStart: new Date("2026-04-01T07:00:00.000Z"),
      timezone: "America/Los_Angeles",
      monthAppointments: [
        {
          id: "1",
          status: "scheduled",
          subtotal: "500",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "500",
          createdAt: new Date("2026-04-10T16:00:00.000Z"),
          completedAt: null,
        },
        {
          id: "2",
          status: "completed",
          subtotal: "250",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "250",
          createdAt: new Date("2026-04-08T16:00:00.000Z"),
          completedAt: new Date("2026-04-09T16:00:00.000Z"),
        },
      ],
      quoteRows: [
        { status: "sent", sentAt: new Date("2026-04-09T16:00:00.000Z"), total: "400" },
        { status: "accepted", sentAt: new Date("2026-04-08T16:00:00.000Z"), total: "600" },
      ],
      pipelineStages: [
        { key: "quoted", label: "Quoted", count: 4, value: 1000 },
        { key: "booked", label: "Booked", count: 2, value: 750 },
      ],
      depositsCollectedAmount: 300,
      depositsDueAmount: 150,
      depositsDueCount: 1,
      addOnInsights: buildAddOnInsights({
        appointmentCount: 2,
        rows: [
          { appointmentId: "1", serviceId: "addon-1", serviceName: "Engine Bay", quantity: 1, unitPrice: "45" },
        ],
      }),
    });

    expect(overview).toMatchObject({
      bookingsToday: 1,
      bookingsThisWeek: 2,
      bookingsThisMonth: 2,
      quotesSent: 2,
      quotesAccepted: 1,
      quoteToBookConversionRate: 50,
      averageTicketValue: 375,
      depositsCollectedAmount: 300,
      depositsDueAmount: 150,
      depositsDueCount: 1,
      addOnInsights: {
        appointmentCount: 2,
        appointmentsWithAddOns: 1,
        attachmentRate: 50,
        addOnRevenue: 45,
        addOnCount: 1,
        averageAddOnRevenuePerBooking: 22.5,
        customerRequestCount: 0,
        customerRequestValue: 0,
        customerApprovedCount: 0,
        customerDeclinedCount: 0,
        customerRequestApprovalRate: null,
        pendingCustomerRequestCount: 0,
        pendingCustomerRequestValue: 0,
        topAddOns: [{ id: "addon-1", name: "Engine Bay", count: 1, revenue: 45 }],
        topAddOnDrivers: [],
      },
      links: {
        bookingsThisWeek: "/calendar?view=week&date=2026-04-06",
        bookingsThisMonth: "/calendar?view=month&date=2026-04-01",
        quotesSent: "/quotes?tab=followup",
        quotesAccepted: "/quotes?tab=accepted",
        quoteToBookConversionRate: "/quotes?tab=accepted",
        averageTicketValue: "/calendar?view=month&date=2026-04-01",
        depositsCollected: "/finances",
        depositsDue: "/calendar?view=week&date=2026-04-06",
      },
    });
  });

  it("summarizes add-on attachment and top add-ons for dashboard booking insight", () => {
    const insights = buildAddOnInsights({
      appointmentCount: 4,
      rows: [
        { appointmentId: "apt-1", serviceId: "addon-1", serviceName: "Engine Bay", quantity: 1, unitPrice: "45" },
        { appointmentId: "apt-1", serviceId: "addon-2", serviceName: "Pet Hair", quantity: 1, unitPrice: "60" },
        { appointmentId: "apt-2", serviceId: "addon-1", serviceName: "Engine Bay", quantity: 2, unitPrice: "45" },
      ],
    });

    expect(insights).toEqual({
      appointmentCount: 4,
      appointmentsWithAddOns: 2,
      attachmentRate: 50,
      addOnRevenue: 195,
      addOnCount: 4,
      averageAddOnRevenuePerBooking: 48.75,
      customerRequestCount: 0,
      customerRequestValue: 0,
      customerApprovedCount: 0,
      customerDeclinedCount: 0,
      customerRequestApprovalRate: null,
      pendingCustomerRequestCount: 0,
      pendingCustomerRequestValue: 0,
      topAddOns: [
        { id: "addon-1", name: "Engine Bay", count: 3, revenue: 135 },
        { id: "addon-2", name: "Pet Hair", count: 1, revenue: 60 },
      ],
      topAddOnDrivers: [],
    });
  });

  it("summarizes which base services drive booked add-on lift", () => {
    const insights = buildAddOnInsights({
      appointmentCount: 3,
      rows: [
        { appointmentId: "apt-1", serviceId: "addon-1", serviceName: "Engine Bay", quantity: 1, unitPrice: "45" },
        { appointmentId: "apt-1", serviceId: "addon-2", serviceName: "Pet Hair", quantity: 1, unitPrice: "60" },
        { appointmentId: "apt-2", serviceId: "addon-1", serviceName: "Engine Bay", quantity: 2, unitPrice: "45" },
        { appointmentId: "apt-3", serviceId: "addon-3", serviceName: "Unlinked Extra", quantity: 1, unitPrice: "20" },
      ],
      baseServiceRows: [
        { appointmentId: "apt-1", serviceId: "base-1", serviceName: "Full Detail" },
        { appointmentId: "apt-2", serviceId: "base-1", serviceName: "Full Detail" },
        { appointmentId: "apt-3", serviceId: "base-2", serviceName: "Maintenance Wash" },
      ],
      addonLinkRows: [
        { parentServiceId: "base-1", addonServiceId: "addon-1" },
        { parentServiceId: "base-1", addonServiceId: "addon-2" },
      ],
    });

    expect(insights.topAddOnDrivers).toEqual([
      {
        id: "base-1",
        name: "Full Detail",
        count: 4,
        revenue: 195,
        topAddOns: [
          { id: "addon-1", name: "Engine Bay", count: 3, revenue: 135 },
          { id: "addon-2", name: "Pet Hair", count: 1, revenue: 60 },
        ],
      },
    ]);
  });

  it("summarizes customer add-on request demand for dashboard booking insight", () => {
    const insights = buildAddOnInsights({
      appointmentCount: 2,
      rows: [],
      requestActivityRows: [
        {
          action: "appointment.public_addon_requested",
          appointmentId: "apt-1",
          metadata: JSON.stringify({ addonServiceId: "addon-1", addonPrice: 125 }),
        },
        {
          action: "appointment.public_addon_requested",
          appointmentId: "apt-1",
          metadata: JSON.stringify({ addonServiceId: "addon-1", addonPrice: 125 }),
        },
        {
          action: "appointment.public_addon_requested",
          appointmentId: "apt-2",
          metadata: JSON.stringify({ addonServiceId: "addon-2", addonPrice: 75 }),
        },
        {
          action: "appointment.public_addon_approved",
          appointmentId: "apt-1",
          metadata: JSON.stringify({ addonServiceId: "addon-1" }),
        },
        {
          action: "appointment.public_addon_declined",
          appointmentId: "apt-2",
          metadata: JSON.stringify({ addonServiceId: "addon-2" }),
        },
      ],
      pendingRequestRows: [
        {
          id: "activity-3",
          appointmentId: "apt-3",
          metadata: JSON.stringify({ addonServiceId: "addon-3", addonPrice: 50 }),
        },
      ],
    });

    expect(insights).toMatchObject({
      customerRequestCount: 2,
      customerRequestValue: 200,
      customerApprovedCount: 1,
      customerDeclinedCount: 1,
      customerRequestApprovalRate: 50,
      pendingCustomerRequestCount: 1,
      pendingCustomerRequestValue: 50,
    });
  });

  it("prefers computed finance totals for booked and completed pipeline values", () => {
    const stages = buildPipelineStages({
      leadRows: [],
      quoteRows: [],
      appointmentRows: [
        {
          status: "scheduled",
          completedAt: null,
          subtotal: "100",
          taxRate: "10",
          taxAmount: "11",
          applyTax: true,
          adminFeeRate: "10",
          adminFeeAmount: "10",
          applyAdminFee: true,
          totalPrice: "999",
        },
        {
          status: "completed",
          completedAt: new Date("2026-04-10T18:00:00.000Z"),
          subtotal: "200",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "10",
          adminFeeAmount: "20",
          applyAdminFee: true,
          totalPrice: "888",
        },
      ],
      invoiceRows: [],
    });

    expect(stages.find((stage) => stage.key === "booked")?.value).toBe(121);
    expect(stages.find((stage) => stage.key === "completed")?.value).toBe(220);
  });

  it("prefers computed finance totals for dashboard average ticket value", () => {
    const overview = buildBookingsOverview({
      todayStart: new Date("2026-04-10T07:00:00.000Z"),
      todayEnd: new Date("2026-04-11T06:59:59.999Z"),
      weekStart: new Date("2026-04-06T07:00:00.000Z"),
      weekEnd: new Date("2026-04-13T06:59:59.999Z"),
      monthStart: new Date("2026-04-01T07:00:00.000Z"),
      timezone: "America/Los_Angeles",
      monthAppointments: [
        {
          id: "1",
          status: "scheduled",
          subtotal: "100",
          taxRate: "10",
          taxAmount: "11",
          applyTax: true,
          adminFeeRate: "10",
          adminFeeAmount: "10",
          applyAdminFee: true,
          totalPrice: "999",
          createdAt: new Date("2026-04-10T16:00:00.000Z"),
          completedAt: null,
        },
        {
          id: "2",
          status: "completed",
          subtotal: "200",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "10",
          adminFeeAmount: "20",
          applyAdminFee: true,
          totalPrice: "888",
          createdAt: new Date("2026-04-08T16:00:00.000Z"),
          completedAt: new Date("2026-04-09T16:00:00.000Z"),
        },
      ],
      quoteRows: [],
      pipelineStages: [],
      depositsCollectedAmount: 0,
      depositsDueAmount: 0,
      depositsDueCount: 0,
      addOnInsights: buildAddOnInsights({ appointmentCount: 2, rows: [] }),
    });

    expect(overview.averageTicketValue).toBe(170.5);
  });

  it("excludes internal completed jobs from the missing invoice queue", () => {
    const items = buildActionQueue({
      context: {
        now: new Date("2026-04-10T18:00:00.000Z"),
        business: {
          id: "biz-1",
          name: "Strata Test",
          timezone: "America/Los_Angeles",
          automationUncontactedLeadHours: 1,
          automationAbandonedQuoteHours: 24,
          automationReviewRequestDelayHours: 24,
          automationLapsedClientMonths: 6,
          stripeConnectAccountId: null,
          stripeConnectChargesEnabled: false,
          stripeConnectPayoutsEnabled: false,
          automationAppointmentRemindersEnabled: false,
          automationReviewRequestsEnabled: false,
          automationLapsedClientsEnabled: false,
          reviewRequestUrl: null,
          bookingRequestUrl: null,
          staffCount: 1,
          monthlyRevenueGoal: null,
          monthlyJobsGoal: null,
        },
        timezone: "America/Los_Angeles",
        role: "owner",
        timeOfDay: "midday",
        next48Hours: new Date("2026-04-12T18:00:00.000Z"),
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
        uncontactedCutoff: new Date("2026-04-10T17:45:00.000Z"),
        quoteFollowUpCutoff: new Date("2026-04-09T18:00:00.000Z"),
        reviewCutoff: new Date("2026-04-09T18:00:00.000Z"),
        lapsedCutoff: new Date("2025-10-10T18:00:00.000Z"),
      },
      leadRows: [],
      quoteRows: [],
      upcomingDepositRows: [],
      upcomingDepositFinance: new Map(),
      overdueInvoices: [],
      completedMissingInvoiceRows: [
        {
          id: "internal-job",
          title: "Internal cleanup",
          completedAt: new Date("2026-04-10T15:00:00.000Z"),
          subtotal: "1500",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "0",
          adminFeeAmount: "0",
          applyAdminFee: false,
          totalPrice: "1940",
          clientId: null,
          clientFirstName: null,
          clientLastName: null,
        },
        {
          id: "customer-job",
          title: "Detail",
          completedAt: new Date("2026-04-10T16:00:00.000Z"),
          subtotal: "400",
          taxRate: "0",
          taxAmount: "0",
          applyTax: false,
          adminFeeRate: "10",
          adminFeeAmount: "40",
          applyAdminFee: true,
          totalPrice: "450",
          clientId: "client-1",
          clientFirstName: "Alex",
          clientLastName: "Driver",
        },
      ],
      reviewRequestReadyRows: [],
      customerAddonRequestRows: [],
      reactivationRows: [],
      systemIssueCounts: { notificationFailures: 0, integrationFailures: 0 },
    });

    expect(items.filter((item) => item.type === "completed_missing_invoice")).toHaveLength(1);
    expect(items.find((item) => item.type === "completed_missing_invoice")?.id).toBe("completed:customer-job");
    expect(items.find((item) => item.type === "completed_missing_invoice")?.amountAtRisk).toBe(440);
  });

  it("surfaces customer add-on requests as actionable queue items", () => {
    const items = buildActionQueue({
      context: {
        now: new Date("2026-04-10T18:00:00.000Z"),
        business: {
          id: "biz-1",
          name: "Strata Test",
          timezone: "America/Los_Angeles",
          automationUncontactedLeadHours: 1,
          automationAbandonedQuoteHours: 24,
          automationReviewRequestDelayHours: 24,
          automationLapsedClientMonths: 6,
          stripeConnectAccountId: null,
          stripeConnectChargesEnabled: false,
          stripeConnectPayoutsEnabled: false,
          automationAppointmentRemindersEnabled: false,
          automationReviewRequestsEnabled: false,
          automationLapsedClientsEnabled: false,
          reviewRequestUrl: null,
          bookingRequestUrl: null,
          staffCount: 1,
          monthlyRevenueGoal: null,
          monthlyJobsGoal: null,
        },
        timezone: "America/Los_Angeles",
        role: "owner",
        timeOfDay: "midday",
        next48Hours: new Date("2026-04-12T18:00:00.000Z"),
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
        uncontactedCutoff: new Date("2026-04-10T17:45:00.000Z"),
        quoteFollowUpCutoff: new Date("2026-04-09T18:00:00.000Z"),
        reviewCutoff: new Date("2026-04-09T18:00:00.000Z"),
        lapsedCutoff: new Date("2025-10-10T18:00:00.000Z"),
      },
      leadRows: [],
      quoteRows: [],
      upcomingDepositRows: [],
      upcomingDepositFinance: new Map(),
      overdueInvoices: [],
      completedMissingInvoiceRows: [],
      reviewRequestReadyRows: [],
      customerAddonRequestRows: [
        {
          id: "activity-1",
          appointmentId: "appointment-1",
          metadata: JSON.stringify({
            addonServiceId: "service-addon-1",
            addonName: "Interior ceramic protection",
            addonPrice: 225,
          }),
          createdAt: new Date("2026-04-10T17:30:00.000Z"),
          appointmentTitle: "Full correction",
          clientFirstName: "Alex",
          clientLastName: "Driver",
        },
        {
          id: "activity-duplicate",
          appointmentId: "appointment-1",
          metadata: JSON.stringify({
            addonServiceId: "service-addon-1",
            addonName: "Interior ceramic protection",
            addonPrice: 225,
          }),
          createdAt: new Date("2026-04-10T17:29:00.000Z"),
          appointmentTitle: "Full correction",
          clientFirstName: "Alex",
          clientLastName: "Driver",
        },
      ],
      reactivationRows: [],
      systemIssueCounts: { notificationFailures: 0, integrationFailures: 0 },
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "addon-request:activity-1",
      type: "customer_addon_request",
      label: "Review add-on request: Interior ceramic protection",
      reason: "Alex Driver asked to add this to Full correction.",
      amountAtRisk: 225,
      ctaUrl: "/appointments/appointment-1",
    });
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
