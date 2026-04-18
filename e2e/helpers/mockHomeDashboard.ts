import type { BrowserContext, Page } from "@playwright/test";

type RouteTarget = BrowserContext | Page;
export type MockRole = "owner" | "manager" | "technician";
type DashboardRange = "today" | "week" | "month";

export function permissionsForRole(role: MockRole) {
  if (role === "technician") {
    return ["dashboard.view", "customers.read", "vehicles.read", "appointments.read", "jobs.read", "quotes.read", "invoices.read"];
  }
  if (role === "manager") {
    return [
      "dashboard.view",
      "customers.read",
      "customers.write",
      "vehicles.read",
      "vehicles.write",
      "appointments.read",
      "appointments.write",
      "quotes.read",
      "quotes.write",
      "invoices.read",
      "invoices.write",
      "payments.read",
      "payments.write",
      "team.read",
      "team.write",
      "settings.read",
    ];
  }
  return [
    "dashboard.view",
    "customers.read",
    "customers.write",
    "vehicles.read",
    "vehicles.write",
    "appointments.read",
    "appointments.write",
    "quotes.read",
    "quotes.write",
    "invoices.read",
    "invoices.write",
    "payments.read",
    "payments.write",
    "team.read",
    "team.write",
    "settings.read",
    "settings.write",
  ];
}

function buildWeekDays() {
  return [
    { date: "2026-04-06", label: "Monday", shortLabel: "Mon", appointmentCount: 1, bookedValue: 320, statusCounts: { upcoming: 1, inProgress: 0, completed: 0, cancelled: 0 }, capacityUsage: 25, calendarUrl: "/calendar?view=day&date=2026-04-06", previewItems: [] },
    { date: "2026-04-07", label: "Tuesday", shortLabel: "Tue", appointmentCount: 2, bookedValue: 540, statusCounts: { upcoming: 2, inProgress: 0, completed: 0, cancelled: 0 }, capacityUsage: 50, calendarUrl: "/calendar?view=day&date=2026-04-07", previewItems: [] },
    { date: "2026-04-08", label: "Wednesday", shortLabel: "Wed", appointmentCount: 1, bookedValue: 280, statusCounts: { upcoming: 0, inProgress: 1, completed: 0, cancelled: 0 }, capacityUsage: 25, calendarUrl: "/calendar?view=day&date=2026-04-08", previewItems: [] },
    { date: "2026-04-09", label: "Thursday", shortLabel: "Thu", appointmentCount: 0, bookedValue: 0, statusCounts: { upcoming: 0, inProgress: 0, completed: 0, cancelled: 0 }, capacityUsage: 0, calendarUrl: "/calendar?view=day&date=2026-04-09", previewItems: [] },
    { date: "2026-04-10", label: "Friday", shortLabel: "Fri", appointmentCount: 2, bookedValue: 760, statusCounts: { upcoming: 1, inProgress: 0, completed: 1, cancelled: 0 }, capacityUsage: 50, calendarUrl: "/calendar?view=day&date=2026-04-10", previewItems: [] },
    { date: "2026-04-11", label: "Saturday", shortLabel: "Sat", appointmentCount: 1, bookedValue: 440, statusCounts: { upcoming: 1, inProgress: 0, completed: 0, cancelled: 0 }, capacityUsage: 25, calendarUrl: "/calendar?view=day&date=2026-04-11", previewItems: [] },
    { date: "2026-04-12", label: "Sunday", shortLabel: "Sun", appointmentCount: 0, bookedValue: 0, statusCounts: { upcoming: 0, inProgress: 0, completed: 0, cancelled: 0 }, capacityUsage: 0, calendarUrl: "/calendar?view=day&date=2026-04-12", previewItems: [] },
  ];
}

function buildMonthDays(role: MockRole) {
  return Array.from({ length: 30 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const bookedRevenue = [0, 220, 480, 0, 650, 0, 520, 310, 740, 560, 0, 880, 420, 0, 360, 690, 0, 510, 750, 0, 430, 260, 0, 980, 610, 0, 320, 540, 0, 480][index] ?? 0;
    const collectedRevenue = role === "technician" ? 0 : [0, 0, 250, 0, 300, 0, 420, 0, 500, 0, 0, 610, 0, 0, 290, 0, 0, 440, 0, 0, 380, 0, 0, 730, 0, 0, 260, 0, 0, 420][index] ?? 0;
    const expenseAmount = role === "technician" ? 0 : [0, 120, 0, 90, 180, 0, 210, 0, 160, 140, 0, 220, 0, 85, 110, 0, 0, 145, 0, 130, 0, 95, 0, 240, 0, 105, 0, 155, 0, 130][index] ?? 0;
    return {
      date: `2026-04-${day}`,
      dayOfMonth: index + 1,
      bookedRevenue,
      collectedRevenue,
      expenseAmount,
      netAmount: collectedRevenue - expenseAmount,
      goalPaceRevenue: role === "owner" ? (15000 / 30) * (index + 1) : null,
      bookedUrl: `/calendar?view=day&date=2026-04-${day}`,
      collectedUrl: `/finances?focusDate=2026-04-${day}`,
      expenseUrl: `/finances?focusDate=2026-04-${day}`,
      netUrl: `/finances?focusDate=2026-04-${day}`,
    };
  });
}

export function buildMockDashboardSnapshot(options?: {
  role?: MockRole;
  range?: DashboardRange;
  teamMemberId?: string | null;
}) {
  const role = options?.role ?? "owner";
  const range = options?.range ?? "today";
  const teamMemberId = options?.teamMemberId ?? null;
  const modulePermissions = {
    today: true,
    cash: role !== "technician",
    conversion: role !== "technician",
    todaySchedule: true,
    actionQueue: true,
    pipeline: role !== "technician",
    revenueCollections: role !== "technician",
    recentActivity: true,
    automations: role === "owner",
    businessHealth: role !== "technician",
    goals: role === "owner",
    teamVisibility: role !== "technician",
    clientVisibility: true,
    vehicleVisibility: true,
    quoteVisibility: true,
    invoiceVisibility: true,
    paymentVisibility: role !== "technician",
    settingsVisibility: role !== "technician",
  };

  return {
    generatedAt: "2026-04-10T16:00:00.000Z",
    businessId: "biz-1",
    timezone: "America/Los_Angeles",
    featureFlags: { homeDashboardV2: true },
    context: { role, timeOfDay: "morning" },
    filters: { range, teamMemberId },
    preferences: {
      widgetOrder: ["summary_needs_action", "summary_today", "today_schedule", "action_queue", "quick_actions", "recent_activity"],
      hiddenWidgets: [],
      defaultRange: "today",
      defaultTeamMemberId: null,
      dismissedQueueItems: {},
      snoozedQueueItems: {},
      lastSeenAt: "2026-04-10T12:00:00.000Z",
      updatedAt: "2026-04-10T12:00:00.000Z",
    },
    cache: {
      key: `dashboard:${role}:${range}:${teamMemberId ?? "all"}`,
      tags: ["business:biz-1", "dashboard:biz-1", "dashboard:biz-1:user-1"],
      hit: false,
      staleAt: "2026-04-10T16:01:00.000Z",
    },
    degraded: false,
    widgetErrors: {},
    modulePermissions,
    summaryCards: {
      needsAction: {
        allowed: true,
        total: 1,
        breakdown: {
          uncontacted_lead: 0,
          quote_follow_up: 0,
          deposit_due: 1,
          overdue_invoice: 0,
          completed_missing_invoice: 0,
          review_request: 0,
          reactivation: 0,
          system_issue: 0,
        },
      },
      today: { allowed: true, jobs: 3, dropoffs: 1, pickups: 1, inShop: 1 },
      cash: {
        allowed: modulePermissions.cash,
        collectedToday: modulePermissions.cash ? 980 : 0,
        outstandingInvoiceAmount: modulePermissions.cash ? 920 : 0,
        overdueInvoiceAmount: 0,
        depositsDueAmount: modulePermissions.cash ? 200 : 0,
      },
      conversion: { allowed: modulePermissions.conversion, newLeads: 3, quoted: 2, booked: 2, conversionRate: 67 },
    },
    todaySchedule: {
      allowed: true,
      items: [
        {
          id: "sched-1",
          appointmentId: "appt-1",
          title: "5-Year Ceramic Coating",
          status: "confirmed",
          phase: "scheduled",
          startTime: "2026-04-10T16:00:00.000Z",
          endTime: "2026-04-10T19:00:00.000Z",
          overlapKind: "same_day",
          client: { id: "client-1", name: "Jacob Wheelihan", url: "/clients/client-1" },
          vehicle: { id: "vehicle-1", label: "2022 Tesla Model Y", url: "/vehicles/vehicle-1" },
          assignedTeam: [{ id: "staff-1", name: "Alex Detailer" }],
          servicesSummary: { label: "Ceramic coating · 1 service", count: 1, names: ["5-Year Ceramic Coating"] },
          financeBadges: [{ key: "deposit_due", label: "Deposit due", tone: "warning" }],
          urls: { appointment: "/appointments/appt-1", schedule: "/appointments", client: "/clients/client-1", vehicle: "/vehicles/vehicle-1" },
          inlineActions: [{ key: "open", label: "Open appointment", url: "/appointments/appt-1" }],
        },
      ],
    },
    actionQueue: {
      allowed: true,
      items: [
        {
          id: "deposit:1",
          type: "deposit_due",
          label: "Collect Jacob's deposit",
          reason: "Tomorrow's ceramic coating still needs a required deposit.",
          urgency: "high",
          amountAtRisk: 200,
          ctaLabel: "Open appointment",
          ctaUrl: "/appointments/appt-1",
          supportsSnooze: true,
          supportsDismiss: true,
          occurredAt: "2026-04-10T12:00:00.000Z",
          priority: 900,
          priorityReasons: ["appointment_imminence", "money_at_risk"],
        },
      ],
    },
    quickActions:
      role === "technician"
        ? []
        : [
            { key: "new_appointment", label: "New appointment", description: "Book the next job without leaving the dashboard.", url: "/appointments/new", permission: "appointments.write" },
            { key: "new_quote", label: "New quote", description: "Send pricing while the lead is still warm.", url: "/quotes/new", permission: "quotes.write" },
          ],
    pipeline: {
      allowed: modulePermissions.pipeline,
      stages: role === "technician" ? [] : [{ key: "new_leads", label: "New leads", count: 2, value: null }, { key: "booked", label: "Booked", count: 5, value: 3100 }],
    },
    weeklyOverview: {
      allowed: true,
      weekStart: "2026-04-06T07:00:00.000Z",
      weekEnd: "2026-04-13T06:59:59.999Z",
      selectedDate: "2026-04-10",
      days: buildWeekDays(),
    },
    monthlyRevenueChart: {
      allowed: role !== "technician",
      monthStart: "2026-04-01T07:00:00.000Z",
      monthEnd: "2026-05-01T06:59:59.999Z",
      totalBookedThisMonth: role === "technician" ? 0 : 11840,
      totalCollectedThisMonth: role === "technician" ? 0 : 9320,
      totalExpensesThisMonth: role === "technician" ? 0 : 2410,
      netThisMonth: role === "technician" ? 0 : 6910,
      outstandingInvoiceAmount: role === "technician" ? 0 : 920,
      percentToGoal: role === "owner" ? 78 : null,
      goalAmount: role === "owner" ? 15000 : null,
      days: buildMonthDays(role),
    },
    bookingsOverview: {
      allowed: role !== "technician",
      bookingsToday: 3,
      bookingsThisWeek: 11,
      bookingsThisMonth: 28,
      quotesSent: 8,
      quotesAccepted: 5,
      quoteToBookConversionRate: 62,
      averageTicketValue: 610,
      depositsCollectedAmount: 1480,
      depositsDueAmount: role === "technician" ? 0 : 200,
      depositsDueCount: role === "technician" ? 0 : 1,
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
      funnel: role === "technician" ? [] : [{ key: "new_leads", label: "New leads", count: 2, value: null }, { key: "booked", label: "Booked", count: 5, value: 3100 }],
    },
    revenueCollections: {
      allowed: modulePermissions.revenueCollections,
      bookedRevenueThisWeek: modulePermissions.revenueCollections ? 4230 : 0,
      collectedThisWeek: modulePermissions.revenueCollections ? 2180 : 0,
      collectedToday: modulePermissions.revenueCollections ? 980 : 0,
      outstandingInvoiceAmount: modulePermissions.revenueCollections ? 920 : 0,
      overdueInvoiceAmount: 0,
      depositsDueAmount: modulePermissions.revenueCollections ? 200 : 0,
      depositsDueCount: modulePermissions.revenueCollections ? 1 : 0,
    },
    recentActivity: {
      allowed: true,
      items: [
        {
          id: "activity-1",
          type: "appointment_created",
          label: "New ceramic coating booked",
          detail: "Jacob Wheelihan · 2022 Tesla Model Y",
          occurredAt: "2026-04-10T15:30:00.000Z",
          entityType: "appointment",
          entityId: "appt-1",
          url: "/appointments/appt-1",
        },
      ],
    },
    automations: {
      allowed: modulePermissions.automations,
      remindersSentThisWeek: modulePermissions.automations ? 12 : 0,
      invoiceNudgesSentThisWeek: modulePermissions.automations ? 4 : null,
      reviewRequestsSentThisWeek: modulePermissions.automations ? 6 : 0,
      reactivationMessagesSentThisWeek: modulePermissions.automations ? 2 : 0,
      deliverySuccessRate: modulePermissions.automations ? 96 : null,
      failedAutomationCount: 0,
    },
    valueMoments: [
      {
        id: "value-1",
        label: "Strata sent 12 reminders this week",
        detail: "Appointment reminders are still taking work off the phones.",
        url: "/settings?tab=automations",
      },
    ],
    nudges: [],
    sinceLastChecked: {
      allowed: true,
      since: "2026-04-10T12:00:00.000Z",
      newLeads: 2,
      newBookings: 1,
      paymentsReceived: 1,
      newIssues: 0,
      resolvedIssues: 1,
    },
    businessHealth: {
      allowed: modulePermissions.businessHealth,
      score: modulePermissions.businessHealth ? 89 : null,
      factors: modulePermissions.businessHealth
        ? [{ key: "lead_response", label: "Lead response", score: 91, weight: 0.2, detail: "Response times are healthy.", issueCount: 0 }]
        : [],
      topIssues: modulePermissions.businessHealth ? [{ label: "Keep deposit collection tight", detail: "Upcoming work still has one deposit due.", url: "/appointments" }] : [],
    },
    goals: {
      allowed: modulePermissions.goals,
      monthlyRevenueGoal: modulePermissions.goals ? 15000 : null,
      currentRevenue: modulePermissions.goals ? 11700 : 0,
      percentToGoal: modulePermissions.goals ? 78 : null,
      projectedMonthEnd: modulePermissions.goals ? 16200 : null,
      monthlyJobsGoal: modulePermissions.goals ? 24 : null,
      currentJobs: modulePermissions.goals ? 19 : 0,
    },
    definitions: {
      uncontactedLead: "Lead created more than 15 minutes ago with no first response.",
      quoteFollowUp: "Sent quote older than 24 hours without acceptance or decline.",
      depositDue: "Appointment in the next 48 hours with required deposit unpaid.",
      overdueInvoice: "Unpaid invoice past due date.",
      completedMissingInvoice: "Completed appointment without a linked invoice.",
      todayJobs: "Appointments that start today or overlap today.",
      cashCollectedToday: "Successful payments created today.",
      bookedRevenueThisWeek: "Value of newly booked appointments and standalone invoices this week.",
    },
  };
}

export async function mockHomeDashboard(target: RouteTarget, options?: { role?: MockRole }) {
  const preferences = {
    widgetOrder: ["summary_needs_action", "summary_today", "today_schedule", "action_queue", "quick_actions", "recent_activity"],
    hiddenWidgets: [],
    defaultRange: "today",
    defaultTeamMemberId: null,
    dismissedQueueItems: {} as Record<string, string>,
    snoozedQueueItems: {} as Record<string, string>,
    lastSeenAt: "2026-04-10T12:00:00.000Z",
    updatedAt: "2026-04-10T12:00:00.000Z",
  };

  await target.route("**/api/actions/getHomeDashboard", async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as {
      range?: DashboardRange;
      teamMemberId?: string | null;
    };
    const snapshot = buildMockDashboardSnapshot({
      role: options?.role ?? "owner",
      range: body.range ?? "today",
      teamMemberId: body.teamMemberId ?? null,
    });
    snapshot.preferences = { ...preferences };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot),
    });
  });

  await target.route("**/api/actions/updateHomeDashboardPreferences", async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as {
      markSeenAt?: string | null;
      widgetOrder?: string[];
      hiddenWidgets?: string[];
      dismissQueueItemId?: string | null;
      snoozeQueueItemId?: string | null;
      snoozeUntil?: string | null;
    };
    if (body.markSeenAt) preferences.lastSeenAt = body.markSeenAt;
    if (body.widgetOrder) preferences.widgetOrder = body.widgetOrder;
    if (body.hiddenWidgets) preferences.hiddenWidgets = body.hiddenWidgets;
    if (body.dismissQueueItemId) preferences.dismissedQueueItems[body.dismissQueueItemId] = new Date().toISOString();
    if (body.snoozeQueueItemId && body.snoozeUntil) preferences.snoozedQueueItems[body.snoozeQueueItemId] = body.snoozeUntil;
    preferences.updatedAt = new Date().toISOString();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ preferences }),
    });
  });

  await target.route("**/api/actions/getFinanceDashboard", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kpis: {
          grossRevenue: 11840,
          expenses: 2410,
          projectedNetProfit: 6910,
          awaitingPayment: 920,
        },
        statusBuckets: [],
        recentPayments: [],
        invoiceRows: [],
        trend: [],
        generatedAt: "2026-04-10T16:00:00.000Z",
        referenceDate: "2026-04-10",
      }),
    });
  });
}
