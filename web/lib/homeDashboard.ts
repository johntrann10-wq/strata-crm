export type HomeDashboardRange = "today" | "week" | "month";

export type HomeDashboardSnapshot = {
  generatedAt: string;
  businessId: string;
  timezone: string;
  featureFlags: {
    homeDashboardV2: boolean;
  };
  context: {
    role: string | null;
    timeOfDay: "morning" | "midday" | "evening";
  };
  filters: {
    range: HomeDashboardRange;
    teamMemberId: string | null;
  };
  preferences: {
    widgetOrder: Array<
      | "summary_needs_action"
      | "summary_today"
      | "summary_cash"
      | "summary_conversion"
      | "today_schedule"
      | "action_queue"
      | "quick_actions"
      | "pipeline"
      | "revenue_collections"
      | "recent_activity"
      | "automations"
      | "business_health"
      | "goals"
    >;
    hiddenWidgets: string[];
    defaultRange: HomeDashboardRange | null;
    defaultTeamMemberId: string | null;
    dismissedQueueItems: Record<string, string>;
    snoozedQueueItems: Record<string, string>;
    lastSeenAt: string | null;
    updatedAt: string | null;
  };
  cache: {
    key: string;
    tags: string[];
    hit: boolean;
    staleAt: string;
  };
  degraded: boolean;
  widgetErrors: Partial<
    Record<
      | "summary_needs_action"
      | "summary_today"
      | "summary_cash"
      | "summary_conversion"
      | "today_schedule"
      | "action_queue"
      | "quick_actions"
      | "pipeline"
      | "revenue_collections"
      | "recent_activity"
      | "automations"
      | "business_health"
      | "goals",
      { message: string; retryable: boolean }
    >
  >;
  modulePermissions: {
    today: boolean;
    cash: boolean;
    conversion: boolean;
    todaySchedule: boolean;
    actionQueue: boolean;
    pipeline: boolean;
    revenueCollections: boolean;
    recentActivity: boolean;
    automations: boolean;
    businessHealth: boolean;
    goals: boolean;
    teamVisibility: boolean;
    clientVisibility: boolean;
    vehicleVisibility: boolean;
    quoteVisibility: boolean;
    invoiceVisibility: boolean;
    paymentVisibility: boolean;
    settingsVisibility: boolean;
  };
  summaryCards: {
    needsAction: {
      allowed: boolean;
      total: number;
      breakdown: Record<string, number>;
    };
    today: {
      allowed: boolean;
      jobs: number;
      dropoffs: number;
      pickups: number;
      inShop: number;
    };
    cash: {
      allowed: boolean;
      collectedToday: number;
      outstandingInvoiceAmount: number;
      overdueInvoiceAmount: number;
      depositsDueAmount: number;
    };
    conversion: {
      allowed: boolean;
      newLeads: number;
      quoted: number;
      booked: number;
      conversionRate: number | null;
    };
  };
  todaySchedule: {
    allowed: boolean;
    items: Array<{
      id: string;
      appointmentId: string;
      title: string;
      status: string;
      phase: string;
      startTime: string;
      endTime: string | null;
      overlapKind: "starts_today" | "continues_today" | "ends_today" | "same_day";
      client: {
        id: string | null;
        name: string;
        url: string | null;
      };
      vehicle: {
        id: string | null;
        label: string;
        url: string | null;
      };
      assignedTeam: Array<{
        id: string | null;
        name: string;
      }>;
      servicesSummary: {
        label: string;
        count: number;
        names: string[];
      };
      financeBadges: Array<{
        key: "deposit_due" | "deposit_collected" | "paid_in_full" | "balance_due";
        label: string;
        tone: "warning" | "success" | "muted";
      }>;
      urls: {
        appointment: string;
        schedule: string;
        client: string | null;
        vehicle: string | null;
      };
      inlineActions: Array<{
        key: "open" | "collect_payment" | "send_reminder" | "view_client" | "view_vehicle";
        label: string;
        url: string;
      }>;
    }>;
  };
  actionQueue: {
    allowed: boolean;
    items: Array<{
      id: string;
      type:
        | "uncontacted_lead"
        | "quote_follow_up"
        | "deposit_due"
        | "overdue_invoice"
        | "completed_missing_invoice"
        | "review_request"
        | "reactivation"
        | "system_issue";
      label: string;
      reason: string;
      urgency: "critical" | "high" | "medium" | "low";
      amountAtRisk: number | null;
      ctaLabel: string;
      ctaUrl: string;
      supportsSnooze: boolean;
      supportsDismiss: boolean;
      occurredAt: string | null;
      priority: number;
      priorityReasons: string[];
    }>;
  };
  quickActions: Array<{
    key:
      | "new_appointment"
      | "new_quote"
      | "new_invoice"
      | "add_client"
      | "add_vehicle"
      | "collect_payment"
      | "send_reminder";
    label: string;
    description: string;
    url: string;
    permission: string;
    requiresSelection?: boolean;
  }>;
  pipeline: {
    allowed: boolean;
    stages: Array<{
      key: "new_leads" | "quoted" | "booked" | "completed" | "paid";
      label: string;
      count: number;
      value: number | null;
    }>;
  };
  weeklyOverview: {
    allowed: boolean;
    weekStart: string;
    weekEnd: string;
    selectedDate: string | null;
    days: Array<{
      date: string;
      label: string;
      shortLabel: string;
      appointmentCount: number;
      bookedValue: number;
      statusCounts: {
        upcoming: number;
        inProgress: number;
        completed: number;
        cancelled: number;
      };
      capacityUsage: number | null;
      calendarUrl: string;
      previewItems: Array<{
        id: string;
        title: string;
        clientName: string;
        vehicleLabel: string;
        startTime: string;
        url: string;
      }>;
    }>;
  };
  monthlyRevenueChart: {
    allowed: boolean;
    monthStart: string;
    monthEnd: string;
    totalBookedThisMonth: number;
    totalCollectedThisMonth: number;
    outstandingInvoiceAmount: number;
    percentToGoal: number | null;
    goalAmount: number | null;
    days: Array<{
      date: string;
      dayOfMonth: number;
      bookedRevenue: number;
      collectedRevenue: number;
      goalPaceRevenue: number | null;
      bookedUrl: string;
      collectedUrl: string;
    }>;
  };
  bookingsOverview: {
    allowed: boolean;
    bookingsToday: number;
    bookingsThisWeek: number;
    bookingsThisMonth: number;
    quotesSent: number;
    quotesAccepted: number;
    quoteToBookConversionRate: number | null;
    averageTicketValue: number | null;
    depositsCollectedAmount: number;
    depositsDueAmount: number;
    depositsDueCount: number;
    links: {
      bookingsThisWeek: string;
      bookingsThisMonth: string;
      quotesSent: string;
      quotesAccepted: string;
      quoteToBookConversionRate: string;
      averageTicketValue: string;
      depositsCollected: string;
      depositsDue: string;
    };
    funnel: Array<{
      key: "new_leads" | "quoted" | "booked" | "completed" | "paid";
      label: string;
      count: number;
      value: number | null;
    }>;
  };
  revenueCollections: {
    allowed: boolean;
    bookedRevenueThisWeek: number;
    collectedThisWeek: number;
    collectedToday: number;
    outstandingInvoiceAmount: number;
    overdueInvoiceAmount: number;
    depositsDueAmount: number;
    depositsDueCount: number;
  };
  recentActivity: {
    allowed: boolean;
    items: Array<{
      id: string;
      type: string;
      label: string;
      detail: string | null;
      occurredAt: string;
      entityType: string | null;
      entityId: string | null;
      url: string | null;
    }>;
  };
  automations: {
    allowed: boolean;
    remindersSentThisWeek: number;
    invoiceNudgesSentThisWeek: number | null;
    reviewRequestsSentThisWeek: number;
    reactivationMessagesSentThisWeek: number;
    deliverySuccessRate: number | null;
    failedAutomationCount: number;
  };
  valueMoments: Array<{
    id: string;
    label: string;
    detail: string;
    url: string | null;
  }>;
  nudges: Array<{
    id: string;
    label: string;
    detail: string;
    url: string;
    tone: "info" | "warning";
  }>;
  sinceLastChecked: {
    allowed: boolean;
    since: string | null;
    newLeads: number;
    newBookings: number;
    paymentsReceived: number;
    newIssues: number;
    resolvedIssues: number;
  };
  businessHealth: {
    allowed: boolean;
    score: number | null;
    factors: Array<{
      key: string;
      label: string;
      score: number;
      weight: number;
      detail: string;
      issueCount: number;
    }>;
    topIssues: Array<{
      label: string;
      detail: string;
      url: string | null;
    }>;
  };
  goals: {
    allowed: boolean;
    monthlyRevenueGoal: number | null;
    currentRevenue: number;
    percentToGoal: number | null;
    projectedMonthEnd: number | null;
    monthlyJobsGoal: number | null;
    currentJobs: number;
  };
  definitions: Record<string, string>;
};

export type HomeDashboardWidgetKey = HomeDashboardSnapshot["preferences"]["widgetOrder"][number];

export function formatDashboardCurrency(amount: number | null | undefined) {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDashboardCompactCurrency(amount: number | null | undefined) {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  }).format(Number.isFinite(value) ? value : 0);
}
