import { createHash } from "crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  activityLogs,
  appointmentServices,
  appointments,
  businesses,
  businessMemberships,
  clients,
  dashboardPreferences,
  expenses,
  integrationJobAttempts,
  integrationJobs,
  invoices,
  locations,
  notificationLogs,
  payments,
  quotes,
  services,
  staff,
  vehicles,
} from "../db/schema.js";
import type { AppointmentFinanceSummary } from "./appointmentFinance.js";
import { getAppointmentFinanceSummaryMap } from "./appointmentFinance.js";
import { isHomeDashboardEnabled } from "./env.js";
import { parseLeadRecord } from "./leads.js";
import { logger } from "./logger.js";
import type { MembershipRole, PermissionKey } from "./permissions.js";
import { calculateAppointmentFinanceTotals } from "./revenueTotals.js";
import { buildVehicleDisplayName } from "./vehicleFormatting.js";

type DbExecutor = typeof db;

const DEFAULT_TIMEZONE = "America/New_York";
const WEEK_START_DAY = 0;
const MAX_RECENT_ACTIVITY = 20;
const MAX_ACTION_QUEUE_ITEMS = 18;
const HOME_DASHBOARD_CACHE_TTL_MS = 30_000;
const ACTION_URGENCY_RANK: Record<HomeDashboardActionQueueItem["urgency"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const DASHBOARD_WIDGET_KEYS = [
  "summary_needs_action",
  "summary_today",
  "summary_cash",
  "summary_conversion",
  "today_schedule",
  "action_queue",
  "quick_actions",
  "pipeline",
  "revenue_collections",
  "recent_activity",
  "automations",
  "business_health",
  "goals",
] as const;

type MoneyLike = number | string | null | undefined;
export type HomeDashboardRange = "today" | "week" | "month";
export type HomeDashboardTimeOfDay = "morning" | "midday" | "evening";
export type HomeDashboardWidgetKey = (typeof DASHBOARD_WIDGET_KEYS)[number];

type DashboardModulePermissions = {
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

export type HomeDashboardSummaryCard<T> = T & { allowed: boolean };

export type HomeDashboardQuickAction = {
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
  permission: PermissionKey;
  requiresSelection?: boolean;
};

export type HomeDashboardActionQueueItem = {
  id: string;
  type:
    | "uncontacted_lead"
    | "quote_follow_up"
    | "deposit_due"
    | "overdue_invoice"
    | "completed_missing_invoice"
    | "review_request"
    | "customer_addon_request"
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
};

export type HomeDashboardTodayScheduleItem = {
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
};

export type HomeDashboardPipelineStage = {
  key: "new_leads" | "quoted" | "booked" | "completed" | "paid";
  label: string;
  count: number;
  value: number | null;
};

export type HomeDashboardRecentActivityEvent = {
  id: string;
  type:
    | "lead_created"
    | "lead_contacted"
    | "appointment_created"
    | "appointment_updated"
    | "appointment_cancelled"
    | "appointment_completed"
    | "quote_sent"
    | "quote_accepted"
    | "invoice_created"
    | "invoice_paid"
    | "invoice_overdue"
    | "payment_received"
    | "payment_failed"
    | "payment_refunded"
    | "automation_sent"
    | "automation_failed"
    | "team_member_invited"
    | "generic";
  label: string;
  detail: string | null;
  occurredAt: string;
  entityType: string | null;
  entityId: string | null;
  url: string | null;
};

export type HomeDashboardAutomationSummary = {
  allowed: boolean;
  remindersSentThisWeek: number;
  invoiceNudgesSentThisWeek: number | null;
  reviewRequestsSentThisWeek: number;
  reactivationMessagesSentThisWeek: number;
  deliverySuccessRate: number | null;
  failedAutomationCount: number;
};

export type HomeDashboardHealthFactor = {
  key:
    | "lead_response"
    | "overdue_invoices"
    | "missing_deposits"
    | "completed_missing_invoice"
    | "automation_failures"
    | "schedule_conflicts";
  label: string;
  score: number;
  weight: number;
  detail: string;
  issueCount: number;
};

export type HomeDashboardGoals = {
  allowed: boolean;
  monthlyRevenueGoal: number | null;
  currentRevenue: number;
  percentToGoal: number | null;
  projectedMonthEnd: number | null;
  monthlyJobsGoal: number | null;
  currentJobs: number;
};

export type HomeDashboardWeeklyOverviewDay = {
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
};

export type HomeDashboardMonthlyRevenueDay = {
  date: string;
  dayOfMonth: number;
  bookedRevenue: number;
  collectedRevenue: number;
  expenseAmount: number;
  netAmount: number;
  goalPaceRevenue: number | null;
  bookedUrl: string;
  collectedUrl: string;
  expenseUrl: string;
  netUrl: string;
};

export type HomeDashboardBookingsOverview = {
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
  addOnInsights: HomeDashboardAddOnInsights;
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
  funnel: HomeDashboardPipelineStage[];
};

export type HomeDashboardAddOnInsights = {
  appointmentCount: number;
  appointmentsWithAddOns: number;
  attachmentRate: number;
  addOnRevenue: number;
  addOnCount: number;
  averageAddOnRevenuePerBooking: number;
  topAddOns: Array<{
    id: string;
    name: string;
    count: number;
    revenue: number;
  }>;
};

export type HomeDashboardPreferences = {
  widgetOrder: HomeDashboardWidgetKey[];
  hiddenWidgets: HomeDashboardWidgetKey[];
  defaultRange: HomeDashboardRange | null;
  defaultTeamMemberId: string | null;
  dismissedQueueItems: Record<string, string>;
  snoozedQueueItems: Record<string, string>;
  lastSeenAt: string | null;
  updatedAt: string | null;
};

export type HomeDashboardSnapshot = {
  generatedAt: string;
  businessId: string;
  timezone: string;
  featureFlags: {
    homeDashboardV2: boolean;
  };
  context: {
    role: MembershipRole | null;
    timeOfDay: HomeDashboardTimeOfDay;
  };
  filters: {
    range: HomeDashboardRange;
    teamMemberId: string | null;
  };
  preferences: HomeDashboardPreferences;
  cache: {
    key: string;
    tags: string[];
    hit: boolean;
    staleAt: string;
  };
  degraded: boolean;
  widgetErrors: Partial<Record<HomeDashboardWidgetKey, { message: string; retryable: boolean }>>;
  modulePermissions: DashboardModulePermissions;
  summaryCards: {
    needsAction: HomeDashboardSummaryCard<{
      total: number;
      breakdown: Record<HomeDashboardActionQueueItem["type"], number>;
    }>;
    today: HomeDashboardSummaryCard<{
      jobs: number;
      dropoffs: number;
      pickups: number;
      inShop: number;
    }>;
    cash: HomeDashboardSummaryCard<{
      collectedToday: number;
      outstandingInvoiceAmount: number;
      overdueInvoiceAmount: number;
      depositsDueAmount: number;
    }>;
    conversion: HomeDashboardSummaryCard<{
      newLeads: number;
      quoted: number;
      booked: number;
      conversionRate: number | null;
    }>;
  };
  todaySchedule: {
    allowed: boolean;
    items: HomeDashboardTodayScheduleItem[];
  };
  actionQueue: {
    allowed: boolean;
    items: HomeDashboardActionQueueItem[];
  };
  quickActions: HomeDashboardQuickAction[];
  pipeline: {
    allowed: boolean;
    stages: HomeDashboardPipelineStage[];
  };
  weeklyOverview: {
    allowed: boolean;
    weekStart: string;
    weekEnd: string;
    selectedDate: string | null;
    days: HomeDashboardWeeklyOverviewDay[];
  };
  monthlyRevenueChart: {
    allowed: boolean;
    monthStart: string;
    monthEnd: string;
    totalBookedThisMonth: number;
    totalCollectedThisMonth: number;
    totalExpensesThisMonth: number;
    netThisMonth: number;
    outstandingInvoiceAmount: number;
    percentToGoal: number | null;
    goalAmount: number | null;
    days: HomeDashboardMonthlyRevenueDay[];
  };
  bookingsOverview: HomeDashboardBookingsOverview;
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
    items: HomeDashboardRecentActivityEvent[];
  };
  automations: HomeDashboardAutomationSummary;
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
    factors: HomeDashboardHealthFactor[];
    topIssues: Array<{
      label: string;
      detail: string;
      url: string | null;
    }>;
  };
  goals: HomeDashboardGoals;
  definitions: {
    weekStartsOn: "sunday";
    uncontactedLead: string;
    quoteFollowUp: string;
    depositDue: string;
    overdueInvoice: string;
    completedMissingInvoice: string;
    todayJobs: string;
    cashCollectedToday: string;
    bookedRevenueThisWeek: string;
    weeklyOverview: string;
    monthlyRevenueChart: string;
    bookingsOverview: string;
  };
};

type HomeDashboardParams = {
  businessId: string;
  userId?: string | null;
  membershipRole?: MembershipRole | null;
  permissions?: PermissionKey[] | null;
  range?: HomeDashboardRange;
  teamMemberId?: string | null;
  weekStartDate?: string | null;
  now?: Date;
  tx?: DbExecutor;
  skipCache?: boolean;
};

type HomeDashboardCacheEntry = {
  snapshot: HomeDashboardSnapshot;
  expiresAt: number;
  tags: string[];
};

const homeDashboardSnapshotCache = new Map<string, HomeDashboardCacheEntry>();
const homeDashboardTagIndex = new Map<string, Set<string>>();

type DashboardBusinessConfig = {
  id: string;
  name: string;
  timezone: string | null;
  automationUncontactedLeadHours: number | null;
  automationAbandonedQuoteHours: number | null;
  automationReviewRequestDelayHours: number | null;
  automationLapsedClientMonths: number | null;
  automationReviewRequestsEnabled: boolean | null;
  automationLapsedClientsEnabled: boolean | null;
  reviewRequestUrl: string | null;
  bookingRequestUrl: string | null;
  monthlyRevenueGoal: MoneyLike;
  monthlyJobsGoal: number | null;
  stripeConnectAccountId: string | null;
  stripeConnectChargesEnabled: boolean | null;
  stripeConnectPayoutsEnabled: boolean | null;
  automationAppointmentRemindersEnabled: boolean | null;
  staffCount: number | null;
};

type AppointmentDashboardRow = {
  id: string;
  title: string | null;
  status: string;
  jobPhase: string | null;
  startTime: Date;
  endTime: Date | null;
  jobStartTime: Date | null;
  expectedCompletionTime: Date | null;
  pickupReadyTime: Date | null;
  vehicleOnSite: boolean | null;
  subtotal: MoneyLike;
  taxRate: MoneyLike;
  taxAmount: MoneyLike;
  applyTax: boolean | null;
  adminFeeRate: MoneyLike;
  adminFeeAmount: MoneyLike;
  applyAdminFee: boolean | null;
  totalPrice: MoneyLike;
  depositAmount: MoneyLike;
  clientId: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  vehicleId: string | null;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  assignedStaffId: string | null;
  staffFirstName: string | null;
  staffLastName: string | null;
  locationId: string | null;
  locationName: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

type InvoiceSnapshotRow = {
  id: string;
  appointmentId: string | null;
  invoiceNumber: string | null;
  status: string | null;
  total: MoneyLike;
  dueDate: Date | null;
  createdAt: Date;
  paidAt: Date | null;
  totalPaid: MoneyLike;
  clientId: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
};

type LeadRow = {
  id: string;
  createdAt: Date;
  firstName: string | null;
  lastName: string | null;
  notes: string | null;
};

type ActionQueueContext = {
  permissions: DashboardModulePermissions;
  business: DashboardBusinessConfig;
  timezone: string;
  now: Date;
  role: MembershipRole | null;
  timeOfDay: HomeDashboardTimeOfDay;
  next48Hours: Date;
  uncontactedCutoff: Date;
  quoteFollowUpCutoff: Date;
  reviewCutoff: Date;
  lapsedCutoff: Date;
};

type HomeDashboardPreferenceRow = {
  widgetOrder: string;
  hiddenWidgets: string;
  defaultRange: string | null;
  defaultTeamMemberId: string | null;
  dismissedQueueItems: string;
  snoozedQueueItems: string;
  lastSeenAt: Date | null;
  updatedAt: Date | null;
};

function toMoneyNumber(value: MoneyLike): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

function toValidDate(value: Date | string | null | undefined) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function getDashboardAppointmentAmount(
  row: Pick<
    AppointmentDashboardRow,
    | "subtotal"
    | "taxRate"
    | "taxAmount"
    | "applyTax"
    | "adminFeeRate"
    | "adminFeeAmount"
    | "applyAdminFee"
    | "totalPrice"
  >
): number {
  const subtotal = Math.max(0, toMoneyNumber(row.subtotal));
  const storedTotal = Math.max(0, toMoneyNumber(row.totalPrice));
  const computed = calculateAppointmentFinanceTotals({
    subtotal,
    taxRate: toMoneyNumber(row.taxRate),
    applyTax: row.applyTax === true,
    adminFeeRate: toMoneyNumber(row.adminFeeRate),
    applyAdminFee: row.applyAdminFee === true,
  });
  const explicitAdminFeeAmount = Math.max(0, toMoneyNumber(row.adminFeeAmount));
  const explicitTaxAmount = Math.max(0, toMoneyNumber(row.taxAmount));

  const adminFeeAmount =
    row.applyAdminFee === true
      ? explicitAdminFeeAmount > 0
        ? explicitAdminFeeAmount
        : computed.adminFeeAmount
      : 0;
  const taxableSubtotal = subtotal + adminFeeAmount;
  const taxAmount =
    row.applyTax === true
      ? explicitTaxAmount > 0
        ? explicitTaxAmount
        : Number(((taxableSubtotal * Math.max(0, toMoneyNumber(row.taxRate))) / 100).toFixed(2))
      : 0;
  const computedTotal = Math.max(0, Number((taxableSubtotal + taxAmount).toFixed(2)));
  const hasStructuredAmountInputs =
    subtotal > 0 ||
    row.applyTax === true ||
    row.applyAdminFee === true ||
    explicitTaxAmount > 0 ||
    explicitAdminFeeAmount > 0 ||
    toMoneyNumber(row.taxRate) > 0 ||
    toMoneyNumber(row.adminFeeRate) > 0;

  if (hasStructuredAmountInputs && computedTotal > 0) {
    return computedTotal;
  }
  if (storedTotal > 0) {
    return Number(storedTotal.toFixed(2));
  }
  return computedTotal;
}

function safeParseMetadata(metadata: string | null | undefined): Record<string, unknown> {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getActivityLogEffectivePaidAt(metadata: string | null | undefined, fallback: Date) {
  const parsed = safeParseMetadata(metadata);
  const rawPaidAt = parsed.paidAt;
  if (typeof rawPaidAt === "string") {
    const parsedDate = new Date(rawPaidAt);
    if (!Number.isNaN(parsedDate.getTime())) return parsedDate;
  }
  return fallback;
}

function coerceValidDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const candidate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function isCarryoverPaymentRow(row: {
  notes?: string | null;
  idempotencyKey?: string | null;
  method?: string | null;
  referenceNumber?: string | null;
  appointmentId?: string | null;
}) {
  const notes = String(row.notes ?? "").trim().toLowerCase();
  if (notes === "carried over from appointment payment state." || notes.includes("appointment payment state")) {
    return true;
  }

  if (String(row.idempotencyKey ?? "").startsWith("appointment-payment-carryover:")) {
    return true;
  }

  return (
    row.method === "other" &&
    Boolean(row.appointmentId) &&
    Boolean(row.referenceNumber) &&
    row.referenceNumber === row.appointmentId
  );
}

function formatPersonName(firstName: string | null | undefined, lastName: string | null | undefined) {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim() || "Unknown";
}

function buildAppPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function getAppointmentPrimaryStart(row: Pick<AppointmentDashboardRow, "jobStartTime" | "startTime">) {
  return row.jobStartTime ?? row.startTime;
}

function getAppointmentPrimaryEnd(
  row: Pick<AppointmentDashboardRow, "pickupReadyTime" | "expectedCompletionTime" | "endTime" | "startTime">
) {
  return row.pickupReadyTime ?? row.expectedCompletionTime ?? row.endTime ?? row.startTime;
}

function overlapsWindow(start: Date, end: Date, windowStart: Date, windowEnd: Date) {
  return start <= windowEnd && end >= windowStart;
}

function getTimeZoneParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
    second: lookup("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timezone: string) {
  const parts = getTimeZoneParts(date, timezone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
}

function zonedDateTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const initial = new Date(utcGuess);
  const offset = getTimeZoneOffsetMs(initial, timezone);
  const candidate = new Date(utcGuess - offset);
  const secondOffset = getTimeZoneOffsetMs(candidate, timezone);
  if (secondOffset !== offset) {
    return new Date(utcGuess - secondOffset);
  }
  return candidate;
}

function startOfBusinessDay(date: Date, timezone: string) {
  const parts = getTimeZoneParts(date, timezone);
  return zonedDateTimeToUtc(timezone, parts.year, parts.month, parts.day, 0, 0, 0, 0);
}

function addBusinessDays(date: Date, timezone: string, days: number) {
  const parts = getTimeZoneParts(date, timezone);
  return zonedDateTimeToUtc(timezone, parts.year, parts.month, parts.day + days, 0, 0, 0, 0);
}

function endOfBusinessDay(date: Date, timezone: string) {
  return new Date(addBusinessDays(date, timezone, 1).getTime() - 1);
}

function getDayOfWeek(date: Date, timezone: string) {
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(text);
}

function startOfBusinessWeek(date: Date, timezone: string, weekStartsOn = WEEK_START_DAY) {
  const todayStart = startOfBusinessDay(date, timezone);
  const day = getDayOfWeek(todayStart, timezone);
  const diff = (day - weekStartsOn + 7) % 7;
  return addBusinessDays(todayStart, timezone, -diff);
}

function endOfBusinessWeek(date: Date, timezone: string, weekStartsOn = WEEK_START_DAY) {
  return new Date(addBusinessDays(startOfBusinessWeek(date, timezone, weekStartsOn), timezone, 7).getTime() - 1);
}

function startOfBusinessMonth(date: Date, timezone: string) {
  const parts = getTimeZoneParts(date, timezone);
  return zonedDateTimeToUtc(timezone, parts.year, parts.month, 1, 0, 0, 0, 0);
}

function endOfBusinessMonth(date: Date, timezone: string) {
  const parts = getTimeZoneParts(date, timezone);
  return new Date(zonedDateTimeToUtc(timezone, parts.year, parts.month + 1, 1, 0, 0, 0, 0).getTime() - 1);
}

function getBusinessDateKey(date: Date, timezone: string) {
  const parts = getTimeZoneParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function isSameBusinessDay(value: Date | null | undefined, reference: Date, timezone: string) {
  if (!value) return false;
  return getBusinessDateKey(value, timezone) === getBusinessDateKey(reference, timezone);
}

function getBusinessWeekDays(weekStart: Date, timezone: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addBusinessDays(weekStart, timezone, index);
    return {
      date,
      key: getBusinessDateKey(date, timezone),
      label: new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(date),
      shortLabel: new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date),
    };
  });
}

function parseBusinessDateInput(value: string | null | undefined, timezone: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return zonedDateTimeToUtc(timezone, year, month, day, 0, 0, 0, 0);
}

function getAppointmentOverviewStatus(status: string | null | undefined) {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
      return "completed";
    case "in_progress":
      return "inProgress";
    case "cancelled":
    case "no-show":
      return "cancelled";
    default:
      return "upcoming";
  }
}

function isCalendarRevenueEligibleStatus(status: string | null | undefined) {
  const normalized = (status ?? "").toLowerCase();
  return normalized !== "cancelled" && normalized !== "no-show";
}

export function getDashboardModulePermissions(permissions: PermissionKey[] = []): DashboardModulePermissions {
  const has = (permission: PermissionKey) => permissions.includes(permission);
  return {
    today: has("appointments.read"),
    // Treat cash widgets as true finance visibility, not generic invoice lookup access.
    cash: has("payments.read"),
    conversion: has("customers.read") || has("quotes.read"),
    todaySchedule: has("appointments.read"),
    actionQueue: true,
    pipeline: has("customers.read") || has("quotes.read") || has("appointments.read") || has("invoices.read"),
    revenueCollections: has("payments.read"),
    recentActivity: true,
    automations: has("settings.read"),
    businessHealth: true,
    goals: has("payments.read"),
    teamVisibility: has("team.read"),
    clientVisibility: has("customers.read"),
    vehicleVisibility: has("vehicles.read"),
    quoteVisibility: has("quotes.read"),
    invoiceVisibility: has("invoices.read"),
    paymentVisibility: has("payments.read"),
    settingsVisibility: has("settings.read"),
  };
}

export function getDashboardTimeOfDay(now: Date, timezone: string): HomeDashboardTimeOfDay {
  const hour = getTimeZoneParts(now, timezone).hour;
  if (hour < 11) return "morning";
  if (hour < 17) return "midday";
  return "evening";
}

export function getRoleDefaultWidgetOrder(
  role: MembershipRole | null | undefined,
  timeOfDay: HomeDashboardTimeOfDay
): HomeDashboardWidgetKey[] {
  const ownerBase: HomeDashboardWidgetKey[] = [
    "summary_needs_action",
    "summary_today",
    "summary_cash",
    "summary_conversion",
    "today_schedule",
    "action_queue",
    "quick_actions",
    "pipeline",
    "revenue_collections",
    "recent_activity",
    "automations",
    "business_health",
    "goals",
  ];
  const managerBase: HomeDashboardWidgetKey[] = [
    "summary_needs_action",
    "summary_today",
    "summary_cash",
    "today_schedule",
    "action_queue",
    "quick_actions",
    "revenue_collections",
    "recent_activity",
    "pipeline",
    "business_health",
    "automations",
    "goals",
  ];
  const technicianBase: HomeDashboardWidgetKey[] = [
    "summary_today",
    "summary_needs_action",
    "today_schedule",
    "quick_actions",
    "action_queue",
    "summary_cash",
    "recent_activity",
    "pipeline",
  ];
  const base =
    role === "technician"
      ? technicianBase
      : role === "manager" || role === "service_advisor"
        ? managerBase
        : ownerBase;
  if (timeOfDay === "morning") {
    return [
      ...base.filter((key) => key === "today_schedule" || key === "action_queue"),
      ...base.filter((key) => key !== "today_schedule" && key !== "action_queue"),
    ];
  }
  if (timeOfDay === "evening") {
    return [
      ...base.filter((key) => key === "revenue_collections" || key === "goals" || key === "automations"),
      ...base.filter((key) => key !== "revenue_collections" && key !== "goals" && key !== "automations"),
    ];
  }
  return base;
}

function getRoleDefaultHiddenWidgets(role: MembershipRole | null | undefined): HomeDashboardWidgetKey[] {
  if (role === "technician") {
    return ["summary_conversion", "automations", "business_health", "goals"];
  }
  if (role === "manager" || role === "service_advisor") {
    return ["summary_conversion"];
  }
  return [];
}

export function mergeWidgetPreferences(
  role: MembershipRole | null | undefined,
  timeOfDay: HomeDashboardTimeOfDay,
  preferences: HomeDashboardPreferences
) {
  const defaultOrder = getRoleDefaultWidgetOrder(role, timeOfDay);
  const hiddenSet = new Set<HomeDashboardWidgetKey>([
    ...getRoleDefaultHiddenWidgets(role),
    ...preferences.hiddenWidgets,
  ]);
  const ordered = [
    ...preferences.widgetOrder.filter((key) => defaultOrder.includes(key)),
    ...defaultOrder.filter((key) => !preferences.widgetOrder.includes(key)),
  ];
  return {
    widgetOrder: ordered,
    hiddenWidgets: Array.from(hiddenSet),
  };
}

function getRoleRelevanceScore(
  type: HomeDashboardActionQueueItem["type"],
  role: MembershipRole | null | undefined
) {
  if (role === "technician") {
    if (type === "deposit_due" || type === "overdue_invoice" || type === "reactivation") return 0;
    if (type === "completed_missing_invoice") return 1;
    return 2;
  }
  if (role === "manager" || role === "service_advisor") {
    if (type === "deposit_due" || type === "completed_missing_invoice" || type === "quote_follow_up" || type === "customer_addon_request") return 3;
    if (type === "overdue_invoice" || type === "uncontacted_lead") return 2;
    return 1;
  }
  return 3;
}

function getTimeOfDayScore(
  type: HomeDashboardActionQueueItem["type"],
  timeOfDay: HomeDashboardTimeOfDay
) {
  if (timeOfDay === "morning") {
    if (type === "deposit_due" || type === "uncontacted_lead") return 2;
    if (type === "quote_follow_up") return 1;
  }
  if (timeOfDay === "midday") {
    if (type === "completed_missing_invoice" || type === "deposit_due" || type === "customer_addon_request") return 2;
    if (type === "overdue_invoice") return 1;
  }
  if (timeOfDay === "evening") {
    if (type === "completed_missing_invoice" || type === "review_request" || type === "overdue_invoice") return 2;
    if (type === "deposit_due") return 1;
  }
  return 0;
}

export function applyActionQueuePriority(params: {
  items: HomeDashboardActionQueueItem[];
  now: Date;
  role: MembershipRole | null | undefined;
  timeOfDay: HomeDashboardTimeOfDay;
}): HomeDashboardActionQueueItem[] {
  return params.items
    .map((item) => {
      const reasons: string[] = [];
      let priority = { critical: 1000, high: 700, medium: 400, low: 150 }[item.urgency];
      reasons.push(`${item.urgency} urgency`);
      const roleScore = getRoleRelevanceScore(item.type, params.role);
      priority += roleScore * 40;
      if (roleScore > 0) reasons.push("role relevant");
      const timeScore = getTimeOfDayScore(item.type, params.timeOfDay);
      priority += timeScore * 35;
      if (timeScore > 0) reasons.push(`${params.timeOfDay} focus`);
      const moneyRisk = Math.max(0, item.amountAtRisk ?? 0);
      if (moneyRisk > 0) {
        priority += Math.min(250, Math.round(moneyRisk / 100));
        reasons.push("money at risk");
      }
      if (item.occurredAt) {
        const eventTime = new Date(item.occurredAt).getTime();
        const hoursDelta = Math.max(0, (params.now.getTime() - eventTime) / (1000 * 60 * 60));
        if (item.type === "deposit_due") {
          priority += Math.max(0, Math.round((72 - Math.min(hoursDelta, 72)) * 3));
          reasons.push("appointment imminent");
        } else {
          priority += Math.min(180, Math.round(hoursDelta * 4));
          reasons.push("aging");
        }
      }
      return {
        ...item,
        priority,
        priorityReasons: reasons,
      };
    })
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      const urgencyDelta = ACTION_URGENCY_RANK[left.urgency] - ACTION_URGENCY_RANK[right.urgency];
      if (urgencyDelta !== 0) return urgencyDelta;
      const leftTime = left.occurredAt ? new Date(left.occurredAt).getTime() : 0;
      const rightTime = right.occurredAt ? new Date(right.occurredAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, MAX_ACTION_QUEUE_ITEMS);
}

function filterQueueItemsByPreferences(
  items: HomeDashboardActionQueueItem[],
  preferences: HomeDashboardPreferences,
  now: Date
) {
  return items.filter((item) => {
    if (preferences.dismissedQueueItems[item.id]) return false;
    const snoozedUntil = preferences.snoozedQueueItems[item.id];
    if (!snoozedUntil) return true;
    const until = new Date(snoozedUntil);
    return Number.isNaN(until.getTime()) || until <= now;
  });
}

export function getHomeDashboardCacheKey(input: {
  businessId: string;
  userId?: string | null;
  permissions?: PermissionKey[] | null;
  timezone: string;
  range?: HomeDashboardRange;
  teamMemberId?: string | null;
  weekStartDate?: string | null;
  preferencesVersion?: string | null;
  now: Date;
}) {
  const dayKey = getBusinessDateKey(input.now, input.timezone);
  const permissionsKey = (input.permissions ?? []).slice().sort().join(",");
  const rangeKey = input.range ?? "today";
  const teamKey = input.teamMemberId ?? "all";
  const weekKey = input.weekStartDate ?? "current";
  const prefsKey = input.preferencesVersion ?? "no-prefs";
  const hash = createHash("sha1")
    .update(`${input.businessId}:${input.userId ?? "anonymous"}:${permissionsKey}:${dayKey}:${rangeKey}:${teamKey}:${weekKey}:${prefsKey}`)
    .digest("hex")
    .slice(0, 16);
  return `home-dashboard:${input.businessId}:${hash}`;
}

export function getHomeDashboardCacheTags(input: { businessId: string; userId?: string | null }) {
  return [
    `business:${input.businessId}`,
    `dashboard:${input.businessId}`,
    input.userId ? `dashboard:${input.businessId}:${input.userId}` : `dashboard:${input.businessId}:anonymous`,
  ];
}

function getSanitizedWidgetError(message: string) {
  if (/timeout|timed out/i.test(message)) {
    return "This widget is taking longer than expected right now.";
  }
  return "This widget is temporarily unavailable.";
}

function trackHomeDashboardCacheEntry(key: string, entry: HomeDashboardCacheEntry) {
  homeDashboardSnapshotCache.set(key, entry);
  for (const tag of entry.tags) {
    const existing = homeDashboardTagIndex.get(tag) ?? new Set<string>();
    existing.add(key);
    homeDashboardTagIndex.set(tag, existing);
  }
}

function removeHomeDashboardCacheEntry(key: string) {
  const existing = homeDashboardSnapshotCache.get(key);
  if (!existing) return;
  homeDashboardSnapshotCache.delete(key);
  for (const tag of existing.tags) {
    const keys = homeDashboardTagIndex.get(tag);
    if (!keys) continue;
    keys.delete(key);
    if (keys.size === 0) homeDashboardTagIndex.delete(tag);
  }
}

function readHomeDashboardCache(key: string, now: Date) {
  const existing = homeDashboardSnapshotCache.get(key);
  if (!existing) return null;
  if (existing.expiresAt <= now.getTime()) {
    removeHomeDashboardCacheEntry(key);
    return null;
  }
  return existing.snapshot;
}

export function invalidateHomeDashboardCache(input: { businessId: string; userId?: string | null; reason?: string }) {
  const tags = getHomeDashboardCacheTags({ businessId: input.businessId, userId: input.userId ?? null });
  const keysToDelete = new Set<string>();
  for (const tag of tags) {
    const keys = homeDashboardTagIndex.get(tag);
    if (!keys) continue;
    for (const key of keys) keysToDelete.add(key);
  }
  for (const key of keysToDelete) {
    removeHomeDashboardCacheEntry(key);
  }
  logger.info("Home dashboard cache invalidated", {
    businessId: input.businessId,
    userId: input.userId ?? undefined,
    reason: input.reason ?? "unspecified",
    entriesRemoved: keysToDelete.size,
  });
}

async function withDashboardTiming<T>(
  label: string,
  timings: Record<string, number>,
  run: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    timings[label] = Date.now() - startedAt;
  }
}

function scoreHealthFactor(input: {
  key: HomeDashboardHealthFactor["key"];
  label: string;
  issueCount: number;
  weight: number;
  detail: string;
  severityPenalty: number;
}): HomeDashboardHealthFactor {
  const score = Math.max(0, 100 - input.issueCount * input.severityPenalty);
  return {
    key: input.key,
    label: input.label,
    issueCount: input.issueCount,
    weight: input.weight,
    score,
    detail: input.detail,
  };
}

export function calculateHomeDashboardHealth(input: {
  overdueLeadCount?: number;
  overdueInvoiceCount?: number;
  missingDepositCount?: number;
  completedMissingInvoiceCount?: number;
  failedAutomationCount?: number;
  scheduleConflictCount?: number;
  permissions: DashboardModulePermissions;
}) {
  const factors: HomeDashboardHealthFactor[] = [];
  if (input.permissions.conversion) {
    factors.push(
      scoreHealthFactor({
        key: "lead_response",
        label: "Lead response",
        issueCount: input.overdueLeadCount ?? 0,
        weight: 20,
        detail:
          (input.overdueLeadCount ?? 0) > 0
            ? `${input.overdueLeadCount} lead${(input.overdueLeadCount ?? 0) === 1 ? "" : "s"} outside response SLA`
            : "No leads outside response SLA",
        severityPenalty: 18,
      })
    );
  }
  if (input.permissions.cash) {
    factors.push(
      scoreHealthFactor({
        key: "overdue_invoices",
        label: "Overdue invoices",
        issueCount: input.overdueInvoiceCount ?? 0,
        weight: 20,
        detail:
          (input.overdueInvoiceCount ?? 0) > 0
            ? `${input.overdueInvoiceCount} overdue invoice${(input.overdueInvoiceCount ?? 0) === 1 ? "" : "s"}`
            : "No overdue invoices",
        severityPenalty: 14,
      })
    );
  }
  if (input.permissions.todaySchedule) {
    factors.push(
      scoreHealthFactor({
        key: "missing_deposits",
        label: "Missing deposits",
        issueCount: input.missingDepositCount ?? 0,
        weight: 15,
        detail:
          (input.missingDepositCount ?? 0) > 0
            ? `${input.missingDepositCount} upcoming job${(input.missingDepositCount ?? 0) === 1 ? "" : "s"} missing a required deposit`
            : "Deposits are covered for upcoming jobs",
        severityPenalty: 12,
      })
    );
  }
  if (input.permissions.invoiceVisibility && input.permissions.todaySchedule) {
    factors.push(
      scoreHealthFactor({
        key: "completed_missing_invoice",
        label: "Completed jobs awaiting invoice",
        issueCount: input.completedMissingInvoiceCount ?? 0,
        weight: 15,
        detail:
          (input.completedMissingInvoiceCount ?? 0) > 0
            ? `${input.completedMissingInvoiceCount} completed job${(input.completedMissingInvoiceCount ?? 0) === 1 ? "" : "s"} missing an invoice`
            : "Completed jobs are invoiced",
        severityPenalty: 14,
      })
    );
  }
  if (input.permissions.automations) {
    factors.push(
      scoreHealthFactor({
        key: "automation_failures",
        label: "Automation delivery",
        issueCount: input.failedAutomationCount ?? 0,
        weight: 15,
        detail:
          (input.failedAutomationCount ?? 0) > 0
            ? `${input.failedAutomationCount} failed automation/integration event${(input.failedAutomationCount ?? 0) === 1 ? "" : "s"}`
            : "No recent automation failures",
        severityPenalty: 10,
      })
    );
  }
  if (input.permissions.todaySchedule) {
    factors.push(
      scoreHealthFactor({
        key: "schedule_conflicts",
        label: "Schedule conflicts",
        issueCount: input.scheduleConflictCount ?? 0,
        weight: 15,
        detail:
          (input.scheduleConflictCount ?? 0) > 0
            ? `${input.scheduleConflictCount} staff scheduling conflict${(input.scheduleConflictCount ?? 0) === 1 ? "" : "s"} today`
            : "No staff conflicts on today's board",
        severityPenalty: 20,
      })
    );
  }

  if (factors.length === 0) {
    return { score: null, factors: [], topIssues: [] as Array<{ label: string; detail: string; url: string | null }> };
  }

  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score = Math.round(
    factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0) / totalWeight
  );
  const topIssues = factors
    .filter((factor) => factor.issueCount > 0)
    .sort((left, right) => left.score - right.score)
    .slice(0, 3)
    .map((factor) => ({
      label: factor.label,
      detail: factor.detail,
      url:
        factor.key === "lead_response"
          ? "/leads"
          : factor.key === "overdue_invoices"
            ? "/finances"
            : factor.key === "missing_deposits"
              ? "/calendar"
              : factor.key === "completed_missing_invoice"
                ? "/jobs"
                : factor.key === "automation_failures"
                  ? "/settings"
                  : "/calendar",
    }));

  return { score, factors, topIssues };
}

export function buildQuickActions(
  permissions: DashboardModulePermissions,
  rawPermissions: PermissionKey[] = []
): HomeDashboardQuickAction[] {
  const has = (permission: PermissionKey) => rawPermissions.includes(permission);
  const actions: HomeDashboardQuickAction[] = [];
  if (permissions.todaySchedule && has("appointments.write")) {
    actions.push({
      key: "new_appointment",
      label: "New appointment",
      description: "Book work from the calendar or schedule board.",
      url: "/appointments/new",
      permission: "appointments.write",
    });
  }
  if (permissions.quoteVisibility && has("quotes.write")) {
    actions.push({
      key: "new_quote",
      label: "New quote",
      description: "Start a quote for a client and vehicle.",
      url: "/quotes/new",
      permission: "quotes.write",
    });
  }
  if (permissions.invoiceVisibility && has("invoices.write")) {
    actions.push({
      key: "new_invoice",
      label: "New invoice",
      description: "Create an invoice for recent or walk-in work.",
      url: "/invoices/new",
      permission: "invoices.write",
    });
  }
  if (permissions.clientVisibility && has("customers.write")) {
    actions.push({
      key: "add_client",
      label: "Add client",
      description: "Create a new client record.",
      url: "/clients/new",
      permission: "customers.write",
    });
  }
  if (permissions.vehicleVisibility && has("vehicles.write")) {
    actions.push({
      key: "add_vehicle",
      label: "Add vehicle",
      description: "Add a vehicle to an existing client.",
      url: "/vehicles/new",
      permission: "vehicles.write",
    });
  }
  if (permissions.paymentVisibility && has("payments.write")) {
    actions.push({
      key: "collect_payment",
      label: "Collect payment",
      description: "Jump to invoices and outstanding balances.",
      url: "/finances",
      permission: "payments.write",
    });
  }
  if (permissions.todaySchedule && has("appointments.write")) {
    actions.push({
      key: "send_reminder",
      label: "Send reminder",
      description: "Open the schedule and send a customer reminder from the appointment.",
      url: "/calendar",
      permission: "appointments.write",
      requiresSelection: true,
    });
  }
  return actions;
}

function buildSinceLastChecked(params: {
  lastSeenAt: string | null;
  leadRows: LeadRow[];
  monthAppointments: Array<Pick<AppointmentDashboardRow, "id" | "createdAt">>;
  recentActivityItems: HomeDashboardRecentActivityEvent[];
  currentIssues: HomeDashboardActionQueueItem[];
}) {
  if (!params.lastSeenAt) {
    return {
      allowed: false,
      since: null,
      newLeads: 0,
      newBookings: 0,
      paymentsReceived: 0,
      newIssues: 0,
      resolvedIssues: 0,
    };
  }
  const since = new Date(params.lastSeenAt);
  if (Number.isNaN(since.getTime())) {
    return {
      allowed: false,
      since: null,
      newLeads: 0,
      newBookings: 0,
      paymentsReceived: 0,
      newIssues: 0,
      resolvedIssues: 0,
    };
  }
  const newLeads = params.leadRows.filter((row) => row.createdAt > since).length;
  const newBookings = params.monthAppointments.filter((row) => row.createdAt > since).length;
  const paymentsReceived = params.recentActivityItems.filter(
    (item) => item.type === "payment_received" && new Date(item.occurredAt) > since
  ).length;
  const newIssues = params.currentIssues.filter((item) => item.occurredAt && new Date(item.occurredAt) > since).length;
  const resolvedIssues = params.recentActivityItems.filter((item) => {
    if (new Date(item.occurredAt) <= since) return false;
    return item.type === "payment_received" || item.type === "quote_accepted" || item.type === "invoice_created";
  }).length;
  return {
    allowed: true,
    since: since.toISOString(),
    newLeads,
    newBookings,
    paymentsReceived,
    newIssues,
    resolvedIssues,
  };
}

function buildValueMoments(params: {
  actionQueueItems: HomeDashboardActionQueueItem[];
  automations: Awaited<ReturnType<typeof loadAutomationStats>>;
  goals: { percentToGoal: number | null };
  revenueCollections: HomeDashboardSnapshot["revenueCollections"];
}) {
  const messages: Array<{ id: string; label: string; detail: string; url: string | null }> = [];
  if (params.automations.remindersSentThisWeek > 0) {
    messages.push({
      id: "reminders-sent",
      label: `Strata sent ${params.automations.remindersSentThisWeek} reminders this week`,
      detail: "Reminder automation is actively moving the schedule forward.",
      url: "/settings?tab=automations",
    });
  }
  if (params.revenueCollections.overdueInvoiceAmount > 0) {
    messages.push({
      id: "overdue-balance",
      label: `${formatMoneyPlain(params.revenueCollections.overdueInvoiceAmount)} overdue balance still needs attention`,
      detail: "Outstanding collections are still sitting in the billing queue.",
      url: "/invoices?tab=overdue",
    });
  }
  const leadQueue = params.actionQueueItems.filter((item) => item.type === "uncontacted_lead").length;
  if (leadQueue > 0) {
    messages.push({
      id: "lead-follow-up",
      label: `${leadQueue} lead${leadQueue === 1 ? "" : "s"} are waiting for follow-up`,
      detail: "Follow-up speed is one of the easiest conversion wins on the board.",
      url: "/leads",
    });
  }
  if (params.goals.percentToGoal != null) {
    messages.push({
      id: "goal-progress",
      label: `You're ${Math.round(params.goals.percentToGoal)}% to monthly goal`,
      detail: "Booked revenue this month is pacing against the configured business target.",
      url: "/settings?tab=business",
    });
  }
  return messages.slice(0, 4);
}

function formatMoneyPlain(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function calculateBookedRevenueTotals(params: {
  weekStart: Date;
  weekEnd: Date;
  bookedAppointments: Array<{
    bookedAt: Date;
    subtotal: MoneyLike;
    taxRate: MoneyLike;
    taxAmount: MoneyLike;
    applyTax: boolean | null;
    adminFeeRate: MoneyLike;
    adminFeeAmount: MoneyLike;
    applyAdminFee: boolean | null;
    totalPrice: MoneyLike;
  }>;
  standaloneInvoices: Array<{ bookedAt: Date; total: MoneyLike }>;
}) {
  const bookedRevenueThisWeek =
    params.bookedAppointments
      .filter((row) => row.bookedAt >= params.weekStart && row.bookedAt <= params.weekEnd)
      .reduce((sum, row) => sum + getDashboardAppointmentAmount(row), 0) +
    params.standaloneInvoices
      .filter((row) => row.bookedAt >= params.weekStart && row.bookedAt <= params.weekEnd)
      .reduce((sum, row) => sum + toMoneyNumber(row.total), 0);

  const bookedRevenueThisMonth =
    params.bookedAppointments.reduce((sum, row) => sum + getDashboardAppointmentAmount(row), 0) +
    params.standaloneInvoices.reduce((sum, row) => sum + toMoneyNumber(row.total), 0);

  return {
    bookedRevenueThisWeek: Number(bookedRevenueThisWeek.toFixed(2)),
    bookedRevenueThisMonth: Number(bookedRevenueThisMonth.toFixed(2)),
  };
}

function buildContextualNudges(params: {
  business: DashboardBusinessConfig;
  permissions: DashboardModulePermissions;
  invoiceRows: InvoiceSnapshotRow[];
  completedMissingInvoiceCount: number;
  depositsDueCount: number;
  upcomingAppointmentsCount: number;
  goals: HomeDashboardGoals;
}) {
  const nudges: Array<{ id: string; label: string; detail: string; url: string; tone: "info" | "warning" }> = [];
  if (
    params.permissions.settingsVisibility &&
    (!params.business.stripeConnectAccountId || params.business.stripeConnectChargesEnabled !== true)
  ) {
    nudges.push({
      id: "connect-stripe",
      label: "Connect Stripe to collect payments faster",
      detail: "Deposits and invoice collections are easier to close when card payments are live.",
      url: "/settings?tab=billing",
      tone: "warning",
    });
  }
  if (params.permissions.invoiceVisibility && params.invoiceRows.length === 0 && params.completedMissingInvoiceCount > 0) {
    nudges.push({
      id: "create-first-invoice",
      label: "Create the first invoice from completed work",
      detail: "Completed jobs are on the board without an invoice yet.",
      url: "/jobs?tab=completed",
      tone: "warning",
    });
  }
  if (
    params.permissions.settingsVisibility &&
    params.business.automationAppointmentRemindersEnabled !== true &&
    params.upcomingAppointmentsCount > 0
  ) {
    nudges.push({
      id: "enable-reminders",
      label: "Enable appointment reminders",
      detail: "Upcoming work is booked, but reminder automation is still off.",
      url: "/settings?tab=automations",
      tone: "info",
    });
  }
  if (params.permissions.settingsVisibility && params.goals.monthlyRevenueGoal == null && params.goals.monthlyJobsGoal == null) {
    nudges.push({
      id: "set-goal",
      label: "Set a monthly goal",
      detail: "The dashboard can pace revenue and jobs once a target exists.",
      url: "/settings?tab=business",
      tone: "info",
    });
  }
  if (params.permissions.teamVisibility && Number(params.business.staffCount ?? 0) <= 1 && params.upcomingAppointmentsCount >= 8) {
    nudges.push({
      id: "add-team-member",
      label: "Add another team member",
      detail: "The schedule volume suggests you may be carrying this workload alone.",
      url: "/settings?tab=team",
      tone: "info",
    });
  }
  return nudges.slice(0, 3);
}

function computeScheduleConflictCount(rows: AppointmentDashboardRow[]) {
  const activeRows = rows
    .filter((row) => row.assignedStaffId)
    .sort((left, right) => getAppointmentPrimaryStart(left).getTime() - getAppointmentPrimaryStart(right).getTime());
  let conflicts = 0;
  for (let index = 0; index < activeRows.length; index += 1) {
    const current = activeRows[index]!;
    const currentStart = getAppointmentPrimaryStart(current);
    const currentEnd = getAppointmentPrimaryEnd(current);
    for (let inner = index + 1; inner < activeRows.length; inner += 1) {
      const candidate = activeRows[inner]!;
      if (candidate.assignedStaffId !== current.assignedStaffId) continue;
      const candidateStart = getAppointmentPrimaryStart(candidate);
      if (candidateStart > currentEnd) break;
      const candidateEnd = getAppointmentPrimaryEnd(candidate);
      if (overlapsWindow(currentStart, currentEnd, candidateStart, candidateEnd)) {
        conflicts += 1;
      }
    }
  }
  return conflicts;
}

function buildTodayScheduleItems(params: {
  rows: AppointmentDashboardRow[];
  financeMap: Map<string, AppointmentFinanceSummary>;
  serviceNamesByAppointmentId: Map<string, string[]>;
  timezone: string;
  permissions: DashboardModulePermissions;
  referenceDay: Date;
}): HomeDashboardTodayScheduleItem[] {
  if (!params.permissions.todaySchedule) return [];
  return params.rows
    .map((row) => {
      const servicesList = params.serviceNamesByAppointmentId.get(row.id) ?? [];
      const finance = params.financeMap.get(row.id);
      const depositAmount = toMoneyNumber(row.depositAmount);
      const balanceDue = finance?.balanceDue ?? Math.max(0, getDashboardAppointmentAmount(row));
      const badges: HomeDashboardTodayScheduleItem["financeBadges"] = [];
      if (depositAmount > 0 && finance?.depositSatisfied !== true) {
        badges.push({ key: "deposit_due", label: "Deposit due", tone: "warning" });
      } else if (depositAmount > 0 && finance?.depositSatisfied === true) {
        badges.push({ key: "deposit_collected", label: "Deposit collected", tone: "success" });
      }
      if (finance?.paidInFull === true) {
        badges.push({ key: "paid_in_full", label: "Paid in full", tone: "success" });
      } else if (balanceDue > 0.009) {
        badges.push({ key: "balance_due", label: "Balance due", tone: "muted" });
      }
      const primaryStart = getAppointmentPrimaryStart(row);
      const primaryEnd = getAppointmentPrimaryEnd(row);
      let overlapKind: HomeDashboardTodayScheduleItem["overlapKind"] = "same_day";
      if (isSameBusinessDay(primaryStart, params.referenceDay, params.timezone)) {
        overlapKind = isSameBusinessDay(primaryEnd, params.referenceDay, params.timezone)
          ? "same_day"
          : "starts_today";
      } else if (isSameBusinessDay(primaryEnd, params.referenceDay, params.timezone)) {
        overlapKind = "ends_today";
      } else {
        overlapKind = "continues_today";
      }
      const appointmentUrl = buildAppPath(`/appointments/${row.id}`);
      const clientUrl = row.clientId ? buildAppPath(`/clients/${row.clientId}`) : null;
      const vehicleUrl = row.vehicleId ? buildAppPath(`/vehicles/${row.vehicleId}`) : null;
      const inlineActions: HomeDashboardTodayScheduleItem["inlineActions"] = [
        { key: "open", label: "Open", url: appointmentUrl },
      ];
      if (params.permissions.paymentVisibility && balanceDue > 0.009) {
        inlineActions.push({ key: "collect_payment", label: "Collect payment", url: appointmentUrl });
      }
      if (params.permissions.todaySchedule) {
        inlineActions.push({ key: "send_reminder", label: "Send reminder", url: appointmentUrl });
      }
      if (clientUrl && params.permissions.clientVisibility) {
        inlineActions.push({ key: "view_client", label: "View client", url: clientUrl });
      }
      if (vehicleUrl && params.permissions.vehicleVisibility) {
        inlineActions.push({ key: "view_vehicle", label: "View vehicle", url: vehicleUrl });
      }
      return {
        id: row.id,
        appointmentId: row.id,
        title: row.title?.trim() || servicesList[0] || "Appointment",
        status: row.status,
        phase: row.jobPhase ?? "scheduled",
        startTime: row.startTime.toISOString(),
        endTime: row.endTime?.toISOString() ?? null,
        overlapKind,
        client: {
          id: row.clientId,
          name: formatPersonName(row.clientFirstName, row.clientLastName),
          url: clientUrl,
        },
        vehicle: {
          id: row.vehicleId,
          label: buildVehicleDisplayName({
            year: row.vehicleYear,
            make: row.vehicleMake,
            model: row.vehicleModel,
          }),
          url: vehicleUrl,
        },
        assignedTeam: row.assignedStaffId
          ? [{ id: row.assignedStaffId, name: formatPersonName(row.staffFirstName, row.staffLastName) }]
          : [],
        servicesSummary: {
          label:
            servicesList.length > 1
              ? `${servicesList[0]} +${servicesList.length - 1}`
              : servicesList[0] ?? (row.title?.trim() || "No services listed"),
          count: servicesList.length,
          names: servicesList,
        },
        financeBadges: badges,
        urls: {
          appointment: appointmentUrl,
          schedule: "/calendar",
          client: clientUrl,
          vehicle: vehicleUrl,
        },
        inlineActions,
      };
    })
    .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
}

function normalizeInvoiceStatus(invoice: InvoiceSnapshotRow, referenceDate: Date) {
  const total = toMoneyNumber(invoice.total);
  const totalPaid = toMoneyNumber(invoice.totalPaid);
  const balance = Math.max(0, total - totalPaid);
  if (balance <= 0.009 || invoice.status === "paid") return "paid";
  if (invoice.status === "draft") return "draft";
  if (invoice.dueDate && invoice.dueDate < referenceDate) return "overdue";
  if (invoice.status === "partial" || totalPaid > 0.009) return "partial";
  return "sent";
}

export function buildPipelineStages(params: {
  leadRows: LeadRow[];
  quoteRows: Array<{ status: string; total: MoneyLike }>;
  appointmentRows: Array<
    Pick<
      AppointmentDashboardRow,
      | "status"
      | "completedAt"
      | "subtotal"
      | "taxRate"
      | "taxAmount"
      | "applyTax"
      | "adminFeeRate"
      | "adminFeeAmount"
      | "applyAdminFee"
      | "totalPrice"
    >
  >;
  invoiceRows: InvoiceSnapshotRow[];
}) {
  const parsedLeads = params.leadRows.map((row) => ({ row, lead: parseLeadRecord(row.notes) }));
  const newLeadCount = parsedLeads.filter(({ lead }) => lead.isLead && lead.status === "new").length;
  const quotedRows = params.quoteRows.filter((row) => row.status === "sent");
  const bookedRows = params.appointmentRows.filter((row) => ["scheduled", "confirmed", "in_progress"].includes(row.status));
  const completedRows = params.appointmentRows.filter((row) => row.status === "completed");
  const paidRows = params.invoiceRows.filter((row) => normalizeInvoiceStatus(row, new Date()) === "paid");

  return [
    { key: "new_leads", label: "New leads", count: newLeadCount, value: null },
    {
      key: "quoted",
      label: "Quoted",
      count: quotedRows.length,
      value: quotedRows.reduce((sum, row) => sum + toMoneyNumber(row.total), 0),
    },
    {
      key: "booked",
      label: "Booked",
      count: bookedRows.length,
      value: bookedRows.reduce((sum, row) => sum + getDashboardAppointmentAmount(row), 0),
    },
    {
      key: "completed",
      label: "Completed",
      count: completedRows.length,
      value: completedRows.reduce((sum, row) => sum + getDashboardAppointmentAmount(row), 0),
    },
    {
      key: "paid",
      label: "Paid",
      count: paidRows.length,
      value: paidRows.reduce((sum, row) => sum + toMoneyNumber(row.totalPaid || row.total), 0),
    },
  ] as HomeDashboardPipelineStage[];
}

export function buildWeeklyAppointmentOverview(params: {
  rows: AppointmentDashboardRow[];
  weekStart: Date;
  timezone: string;
  staffCount: number | null | undefined;
}) {
  const weekDays = getBusinessWeekDays(params.weekStart, params.timezone);
  const buckets = new Map(
    weekDays.map((day) => [
      day.key,
      {
        date: day.key,
        label: day.label,
        shortLabel: day.shortLabel,
        appointmentCount: 0,
        bookedValue: 0,
        statusCounts: {
          upcoming: 0,
          inProgress: 0,
          completed: 0,
          cancelled: 0,
        },
        assignedStaffIds: new Set<string>(),
        previewItems: [] as HomeDashboardWeeklyOverviewDay["previewItems"],
      },
    ])
  );

  for (const row of params.rows) {
    const primaryStart = getAppointmentPrimaryStart(row);
    const bucket = buckets.get(getBusinessDateKey(primaryStart, params.timezone));
    if (!bucket) continue;
    bucket.appointmentCount += 1;
    if (isCalendarRevenueEligibleStatus(row.status)) {
      bucket.bookedValue += getDashboardAppointmentAmount(row);
    }
    bucket.statusCounts[getAppointmentOverviewStatus(row.status)] += 1;
    if (row.assignedStaffId) bucket.assignedStaffIds.add(row.assignedStaffId);
    if (bucket.previewItems.length < 4) {
      bucket.previewItems.push({
        id: row.id,
        title: row.title?.trim() || "Appointment",
        clientName: formatPersonName(row.clientFirstName, row.clientLastName),
        vehicleLabel: buildVehicleDisplayName({
          year: row.vehicleYear,
          make: row.vehicleMake,
          model: row.vehicleModel,
        }),
        startTime: row.startTime.toISOString(),
        url: buildAppPath(`/appointments/${row.id}`),
      });
    }
  }

  return weekDays.map((day) => {
    const bucket = buckets.get(day.key)!;
    const capacityUsage =
      params.staffCount && params.staffCount > 0
        ? Math.max(0, Math.min(100, Math.round((bucket.assignedStaffIds.size / params.staffCount) * 100)))
        : null;
    return {
      date: bucket.date,
      label: bucket.label,
      shortLabel: bucket.shortLabel,
      appointmentCount: bucket.appointmentCount,
      bookedValue: Number(bucket.bookedValue.toFixed(2)),
      statusCounts: bucket.statusCounts,
      capacityUsage,
      calendarUrl: `/calendar?view=day&date=${encodeURIComponent(bucket.date)}`,
      previewItems: bucket.previewItems,
    } satisfies HomeDashboardWeeklyOverviewDay;
  });
}

export function buildMonthlyRevenueChart(params: {
  monthStart: Date;
  monthEnd: Date;
  timezone: string;
  bookedAppointments: Array<{
    bookedAt: Date | string | null;
    subtotal: MoneyLike;
    taxRate: MoneyLike;
    taxAmount: MoneyLike;
    applyTax: boolean | null;
    adminFeeRate: MoneyLike;
    adminFeeAmount: MoneyLike;
    applyAdminFee: boolean | null;
    totalPrice: MoneyLike;
  }>;
  standaloneInvoices: Array<{ bookedAt: Date | string | null; total: MoneyLike }>;
  collectedPayments: Array<{ paidAt: Date | string | null; amount: number }>;
  expenseRows: Array<{ expenseDate: Date | string | null; amount: MoneyLike }>;
  monthlyRevenueGoal: number | null;
}) {
  const monthStartParts = getTimeZoneParts(params.monthStart, params.timezone);
  const totalDays = getTimeZoneParts(params.monthEnd, params.timezone).day;
  const goalPacePerDay =
    params.monthlyRevenueGoal && params.monthlyRevenueGoal > 0 ? params.monthlyRevenueGoal / Math.max(totalDays, 1) : null;

  const days = Array.from({ length: totalDays }, (_, index) => {
    const date = zonedDateTimeToUtc(params.timezone, monthStartParts.year, monthStartParts.month, index + 1, 0, 0, 0, 0);
    return {
      date: getBusinessDateKey(date, params.timezone),
      dayOfMonth: index + 1,
      bookedRevenue: 0,
      collectedRevenue: 0,
      expenseAmount: 0,
      netAmount: 0,
      goalPaceRevenue: goalPacePerDay != null ? Number((((index + 1) * goalPacePerDay)).toFixed(2)) : null,
      bookedUrl: buildAppPath(`/calendar?view=day&date=${encodeURIComponent(getBusinessDateKey(date, params.timezone))}`),
      collectedUrl: buildAppPath(`/finances?focusDate=${encodeURIComponent(getBusinessDateKey(date, params.timezone))}`),
      expenseUrl: buildAppPath(`/finances?focusDate=${encodeURIComponent(getBusinessDateKey(date, params.timezone))}`),
      netUrl: buildAppPath(`/finances?focusDate=${encodeURIComponent(getBusinessDateKey(date, params.timezone))}`),
    };
  });

  const indexByDate = new Map(days.map((day, index) => [day.date, index]));
  const addBooked = (dateLike: Date | string | null | undefined, amount: MoneyLike) => {
    const date = toValidDate(dateLike);
    if (!date) return;
    const index = indexByDate.get(getBusinessDateKey(date, params.timezone));
    if (index == null) return;
    days[index]!.bookedRevenue += toMoneyNumber(amount);
  };
  const addCollected = (dateLike: Date | string | null | undefined, amount: number) => {
    const date = toValidDate(dateLike);
    if (!date) return;
    const index = indexByDate.get(getBusinessDateKey(date, params.timezone));
    if (index == null) return;
    days[index]!.collectedRevenue += amount;
  };
  const addExpense = (dateLike: Date | string | null | undefined, amount: MoneyLike) => {
    const date = toValidDate(dateLike);
    if (!date) return;
    const index = indexByDate.get(getBusinessDateKey(date, params.timezone));
    if (index == null) return;
    days[index]!.expenseAmount += toMoneyNumber(amount);
  };

  for (const row of params.bookedAppointments) addBooked(row.bookedAt, getDashboardAppointmentAmount(row));
  for (const row of params.standaloneInvoices) addBooked(row.bookedAt, row.total);
  for (const row of params.collectedPayments) addCollected(row.paidAt, row.amount);
  for (const row of params.expenseRows) addExpense(row.expenseDate, row.amount);

  return days.map((day) => {
    const bookedRevenue = Number(day.bookedRevenue.toFixed(2));
    const collectedRevenue = Number(day.collectedRevenue.toFixed(2));
    const expenseAmount = Number(day.expenseAmount.toFixed(2));
    return {
      ...day,
      bookedRevenue,
      collectedRevenue,
      expenseAmount,
      netAmount: Number((collectedRevenue - expenseAmount).toFixed(2)),
    };
  }) as HomeDashboardMonthlyRevenueDay[];
}

export function calculateUpcomingDepositCoverage(params: {
  rows: Array<{ id: string; depositAmount: MoneyLike }>;
  financeByAppointmentId: Map<string, AppointmentFinanceSummary>;
}) {
  return Number(
    params.rows
      .reduce((sum, row) => {
        const depositAmount = Math.max(0, toMoneyNumber(row.depositAmount));
        if (depositAmount <= 0) return sum;
        const finance = params.financeByAppointmentId.get(row.id);
        if (!finance || finance.depositSatisfied !== true) return sum;
        return sum + depositAmount;
      }, 0)
      .toFixed(2)
  );
}

export function buildBookingsOverview(params: {
  todayStart: Date;
  todayEnd: Date;
  weekStart: Date;
  weekEnd: Date;
  monthStart: Date;
  timezone: string;
  monthAppointments: Array<
    Pick<
      AppointmentDashboardRow,
      | "id"
      | "status"
      | "createdAt"
      | "completedAt"
      | "subtotal"
      | "taxRate"
      | "taxAmount"
      | "applyTax"
      | "adminFeeRate"
      | "adminFeeAmount"
      | "applyAdminFee"
      | "totalPrice"
    >
  >;
  quoteRows: Array<{ status: string; sentAt: Date | null; total: MoneyLike }>;
  pipelineStages: HomeDashboardPipelineStage[];
  depositsCollectedAmount: number;
  depositsDueAmount: number;
  depositsDueCount: number;
  addOnInsights: HomeDashboardAddOnInsights;
}) {
  const bookingsToday = params.monthAppointments.filter((row) => row.createdAt >= params.todayStart && row.createdAt <= params.todayEnd).length;
  const bookingsThisWeek = params.monthAppointments.filter((row) => row.createdAt >= params.weekStart && row.createdAt <= params.weekEnd).length;
  const bookingsThisMonth = params.monthAppointments.length;
  const quotesSent = params.quoteRows.filter((row) => row.status === "sent" || row.sentAt != null).length;
  const quotesAccepted = params.quoteRows.filter((row) => row.status === "accepted").length;
  const quotedStage = params.pipelineStages.find((stage) => stage.key === "quoted")?.count ?? quotesSent;
  const bookedStage = params.pipelineStages.find((stage) => stage.key === "booked")?.count ?? bookingsThisMonth;
  const quoteToBookConversionRate = quotedStage > 0 ? Math.round((bookedStage / Math.max(quotedStage, 1)) * 100) : null;
  const averageTicketValue =
    bookingsThisMonth > 0
      ? Number(
          (
            params.monthAppointments.reduce((sum, row) => sum + getDashboardAppointmentAmount(row), 0) /
            Math.max(bookingsThisMonth, 1)
          ).toFixed(2)
        )
      : null;
  const weekDateKey = getBusinessDateKey(params.weekStart, params.timezone);
  const monthDateKey = getBusinessDateKey(params.monthStart, params.timezone);

  return {
    allowed: true,
    bookingsToday,
    bookingsThisWeek,
    bookingsThisMonth,
    quotesSent,
    quotesAccepted,
    quoteToBookConversionRate,
    averageTicketValue,
    depositsCollectedAmount: Number(params.depositsCollectedAmount.toFixed(2)),
    depositsDueAmount: Number(params.depositsDueAmount.toFixed(2)),
    depositsDueCount: params.depositsDueCount,
    addOnInsights: params.addOnInsights,
    links: {
      bookingsThisWeek: buildAppPath(`/calendar?view=week&date=${encodeURIComponent(weekDateKey)}`),
      bookingsThisMonth: buildAppPath(`/calendar?view=month&date=${encodeURIComponent(monthDateKey)}`),
      quotesSent: buildAppPath("/quotes?tab=followup"),
      quotesAccepted: buildAppPath("/quotes?tab=accepted"),
      quoteToBookConversionRate: buildAppPath("/quotes?tab=accepted"),
      averageTicketValue: buildAppPath(`/calendar?view=month&date=${encodeURIComponent(monthDateKey)}`),
      depositsCollected: buildAppPath("/finances"),
      depositsDue: buildAppPath(`/calendar?view=week&date=${encodeURIComponent(weekDateKey)}`),
    },
    funnel: params.pipelineStages,
  } satisfies HomeDashboardBookingsOverview;
}

function buildRecentActivityEvents(params: {
  rows: Array<{
    id: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    metadata: string | null;
    createdAt: Date;
  }>;
  inviteRows: Array<{
    membershipId: string;
    userId: string;
    invitedAt: Date | null;
    joinedAt: Date | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  }>;
  permissions: DashboardModulePermissions;
}) {
  const events: HomeDashboardRecentActivityEvent[] = [];
  const allowEntity = (entityType: string | null, action: string) => {
    if (entityType === "client") return params.permissions.clientVisibility || action.startsWith("automation.");
    if (entityType === "vehicle") return params.permissions.vehicleVisibility;
    if (entityType === "appointment" || entityType === "job") return params.permissions.todaySchedule;
    if (entityType === "quote") return params.permissions.quoteVisibility;
    if (entityType === "invoice" || entityType === "payment") return params.permissions.invoiceVisibility || params.permissions.paymentVisibility;
    return params.permissions.recentActivity;
  };

  for (const row of params.rows) {
    if (!allowEntity(row.entityType, row.action)) continue;
    const metadata = safeParseMetadata(row.metadata);
    const mapping = mapActivityAction(row.action, row.entityType, row.entityId, metadata);
    if (!mapping) continue;
    events.push({
      id: row.id,
      type: mapping.type,
      label: mapping.label,
      detail: mapping.detail,
      occurredAt: row.createdAt.toISOString(),
      entityType: row.entityType,
      entityId: row.entityId,
      url: mapping.url,
    });
  }

  if (params.permissions.teamVisibility) {
    for (const row of params.inviteRows) {
      if (!row.invitedAt) continue;
      events.push({
        id: `invite:${row.membershipId}`,
        type: "team_member_invited",
        label: "Team member invited",
        detail: `${formatPersonName(row.firstName, row.lastName)}${row.email ? ` (${row.email})` : ""}`,
        occurredAt: row.invitedAt.toISOString(),
        entityType: "staff",
        entityId: row.userId,
        url: "/settings/team",
      });
    }
  }

  return events
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, MAX_RECENT_ACTIVITY);
}

function mapActivityAction(
  action: string,
  entityType: string | null,
  entityId: string | null,
  metadata: Record<string, unknown>
): Pick<HomeDashboardRecentActivityEvent, "type" | "label" | "detail" | "url"> | null {
  const appointmentUrl = entityId ? buildAppPath(`/appointments/${entityId}`) : null;
  const invoiceUrl = entityId ? buildAppPath(`/invoices/${entityId}`) : null;
  const quoteUrl = entityId ? buildAppPath(`/quotes/${entityId}`) : null;
  const clientUrl = entityId ? buildAppPath(`/clients/${entityId}`) : null;
  switch (action) {
    case "lead.created":
      return { type: "lead_created", label: "Lead created", detail: null, url: clientUrl };
    case "lead.contacted":
    case "automation.uncontacted_lead.sent":
      return { type: "lead_contacted", label: "Lead contacted", detail: null, url: clientUrl };
    case "appointment.created":
      return { type: "appointment_created", label: "Appointment created", detail: null, url: appointmentUrl };
    case "appointment.updated":
      return { type: "appointment_updated", label: "Appointment updated", detail: null, url: appointmentUrl };
    case "appointment.cancelled":
      return { type: "appointment_cancelled", label: "Appointment cancelled", detail: null, url: appointmentUrl };
    case "appointment.completed":
      return { type: "appointment_completed", label: "Appointment completed", detail: null, url: appointmentUrl };
    case "appointment.public_addon_requested":
      return {
        type: "appointment_updated",
        label: "Customer requested add-on",
        detail: typeof metadata.addonName === "string" && metadata.addonName.trim() ? metadata.addonName.trim() : null,
        url: appointmentUrl,
      };
    case "quote.sent":
      return { type: "quote_sent", label: "Quote sent", detail: null, url: quoteUrl };
    case "quote.accepted":
      return { type: "quote_accepted", label: "Quote accepted", detail: null, url: quoteUrl };
    case "invoice.created":
      return { type: "invoice_created", label: "Invoice created", detail: null, url: invoiceUrl };
    case "invoice.sent":
      return { type: "invoice_created", label: "Invoice sent", detail: null, url: invoiceUrl };
    case "payment.recorded":
      return {
        type: "payment_received",
        label: "Payment received",
        detail:
          metadata.amount != null ? `$${toMoneyNumber(metadata.amount as MoneyLike).toFixed(2)}` : null,
        url: invoiceUrl,
      };
    case "payment.reversed":
      return {
        type: "payment_refunded",
        label: "Payment reversed",
        detail:
          metadata.amount != null ? `$${toMoneyNumber(metadata.amount as MoneyLike).toFixed(2)}` : null,
        url: invoiceUrl,
      };
    case "automation.appointment_reminder.sent":
      return { type: "automation_sent", label: "Appointment reminder sent", detail: null, url: appointmentUrl };
    case "automation.review_request.sent":
      return { type: "automation_sent", label: "Review request sent", detail: null, url: appointmentUrl };
    case "automation.lapsed_client.sent":
      return { type: "automation_sent", label: "Reactivation message sent", detail: null, url: clientUrl };
    case "automation.abandoned_quote.sent":
      return { type: "automation_sent", label: "Quote follow-up sent", detail: null, url: quoteUrl };
    default:
      if (action.includes("failed")) {
        return { type: "automation_failed", label: action.replace(/\./g, " "), detail: null, url: null };
      }
      return entityType
        ? {
            type: "generic",
            label: action.replace(/\./g, " "),
            detail: null,
            url:
              entityType === "appointment"
                ? appointmentUrl
                : entityType === "invoice"
                  ? invoiceUrl
                  : entityType === "quote"
                    ? quoteUrl
                    : entityType === "client"
                      ? clientUrl
                      : null,
          }
        : null;
  }
}

async function loadBusinessConfig(
  businessId: string,
  tx: DbExecutor
): Promise<DashboardBusinessConfig> {
  async function selectConfig() {
    const [row] = await tx
      .select({
        id: businesses.id,
        name: businesses.name,
        timezone: businesses.timezone,
        automationUncontactedLeadHours: businesses.automationUncontactedLeadHours,
        automationAbandonedQuoteHours: businesses.automationAbandonedQuoteHours,
        automationReviewRequestDelayHours: businesses.automationReviewRequestDelayHours,
        automationLapsedClientMonths: businesses.automationLapsedClientMonths,
        automationReviewRequestsEnabled: businesses.automationReviewRequestsEnabled,
        automationLapsedClientsEnabled: businesses.automationLapsedClientsEnabled,
        reviewRequestUrl: businesses.reviewRequestUrl,
        bookingRequestUrl: businesses.bookingRequestUrl,
        monthlyRevenueGoal: businesses.monthlyRevenueGoal,
        monthlyJobsGoal: businesses.monthlyJobsGoal,
        stripeConnectAccountId: businesses.stripeConnectAccountId,
        stripeConnectChargesEnabled: businesses.stripeConnectChargesEnabled,
        stripeConnectPayoutsEnabled: businesses.stripeConnectPayoutsEnabled,
        automationAppointmentRemindersEnabled: businesses.automationAppointmentRemindersEnabled,
        staffCount: businesses.staffCount,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    return row ?? null;
  }

  try {
    const row = await selectConfig();
    if (!row) throw new Error("Business not found.");
    return row;
  } catch (error) {
    const message = String((error as { message?: unknown })?.message ?? "");
    if (!message.toLowerCase().includes("does not exist")) throw error;
    await tx.execute(sql`
      ALTER TABLE businesses
        ADD COLUMN IF NOT EXISTS monthly_revenue_goal decimal(12, 2) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS monthly_jobs_goal integer DEFAULT NULL
    `);
    const repaired = await selectConfig();
    if (!repaired) throw error;
    return repaired;
  }
}

function safeParseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function safeParseStringMap(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
}

function normalizeWidgetKeys(values: string[]): HomeDashboardWidgetKey[] {
  const valid = new Set<HomeDashboardWidgetKey>(DASHBOARD_WIDGET_KEYS);
  return values.filter((value): value is HomeDashboardWidgetKey => valid.has(value as HomeDashboardWidgetKey));
}

function normalizeRangePreference(value: string | null | undefined): HomeDashboardRange | null {
  if (value === "today" || value === "week" || value === "month") return value;
  return null;
}

let dashboardPreferencesSchemaReady: Promise<void> | null = null;

function isIgnorableDashboardPreferencesSchemaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    detail?: unknown;
    constraint?: unknown;
    cause?: unknown;
  };
  const source =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as {
          code?: unknown;
          message?: unknown;
          detail?: unknown;
          constraint?: unknown;
        })
      : candidate;
  const code = String(source.code ?? "");
  const message = String(source.message ?? "").toLowerCase();
  const detail = String(source.detail ?? "").toLowerCase();
  const constraint = String(source.constraint ?? "").toLowerCase();

  return (
    code === "42P07" ||
    code === "42710" ||
    message.includes("relation \"dashboard_preferences\" already exists") ||
    (code === "23505" &&
      constraint === "pg_type_typname_nsp_index" &&
      detail.includes("dashboard_preferences"))
  );
}

async function ensureDashboardPreferencesSchema(tx: DbExecutor) {
  if (!dashboardPreferencesSchemaReady) {
    dashboardPreferencesSchemaReady = (async () => {
      try {
        await tx.execute(sql`
          CREATE TABLE IF NOT EXISTS dashboard_preferences (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            widget_order text NOT NULL DEFAULT '[]',
            hidden_widgets text NOT NULL DEFAULT '[]',
            default_range text DEFAULT NULL,
            default_team_member_id uuid DEFAULT NULL,
            dismissed_queue_items text NOT NULL DEFAULT '{}',
            snoozed_queue_items text NOT NULL DEFAULT '{}',
            last_seen_at timestamptz DEFAULT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
        await tx.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS dashboard_preferences_business_user_unique
            ON dashboard_preferences (business_id, user_id)
        `);
      } catch (error) {
        if (!isIgnorableDashboardPreferencesSchemaError(error)) throw error;
      }
    })();
  }

  try {
    await dashboardPreferencesSchemaReady;
  } catch (error) {
    dashboardPreferencesSchemaReady = null;
    throw error;
  }
}

async function loadDashboardPreferences(
  businessId: string,
  userId: string | null | undefined,
  tx: DbExecutor
): Promise<HomeDashboardPreferences> {
  if (!userId) {
    return {
      widgetOrder: [],
      hiddenWidgets: [],
      defaultRange: null,
      defaultTeamMemberId: null,
      dismissedQueueItems: {},
      snoozedQueueItems: {},
      lastSeenAt: null,
      updatedAt: null,
    };
  }

  await ensureDashboardPreferencesSchema(tx);
  const [row] = await tx
    .select({
      widgetOrder: dashboardPreferences.widgetOrder,
      hiddenWidgets: dashboardPreferences.hiddenWidgets,
      defaultRange: dashboardPreferences.defaultRange,
      defaultTeamMemberId: dashboardPreferences.defaultTeamMemberId,
      dismissedQueueItems: dashboardPreferences.dismissedQueueItems,
      snoozedQueueItems: dashboardPreferences.snoozedQueueItems,
      lastSeenAt: dashboardPreferences.lastSeenAt,
      updatedAt: dashboardPreferences.updatedAt,
    })
    .from(dashboardPreferences)
    .where(and(eq(dashboardPreferences.businessId, businessId), eq(dashboardPreferences.userId, userId)))
    .limit(1);

  const preferenceRow = row as HomeDashboardPreferenceRow | undefined;
  return {
    widgetOrder: normalizeWidgetKeys(safeParseStringArray(preferenceRow?.widgetOrder)),
    hiddenWidgets: normalizeWidgetKeys(safeParseStringArray(preferenceRow?.hiddenWidgets)),
    defaultRange: normalizeRangePreference(preferenceRow?.defaultRange),
    defaultTeamMemberId: preferenceRow?.defaultTeamMemberId ?? null,
    dismissedQueueItems: safeParseStringMap(preferenceRow?.dismissedQueueItems),
    snoozedQueueItems: safeParseStringMap(preferenceRow?.snoozedQueueItems),
    lastSeenAt: preferenceRow?.lastSeenAt?.toISOString() ?? null,
    updatedAt: preferenceRow?.updatedAt?.toISOString() ?? null,
  };
}

export type UpdateHomeDashboardPreferencesInput = {
  businessId: string;
  userId: string;
  widgetOrder?: HomeDashboardWidgetKey[];
  hiddenWidgets?: HomeDashboardWidgetKey[];
  defaultRange?: HomeDashboardRange | null;
  defaultTeamMemberId?: string | null;
  dismissQueueItemId?: string | null;
  clearDismissQueueItemId?: string | null;
  snoozeQueueItemId?: string | null;
  snoozeUntil?: Date | null;
  clearSnoozeQueueItemId?: string | null;
  markSeenAt?: Date | null;
  tx?: DbExecutor;
};

export async function updateHomeDashboardPreferences(input: UpdateHomeDashboardPreferencesInput) {
  const tx = input.tx ?? db;
  await ensureDashboardPreferencesSchema(tx);
  const current = await loadDashboardPreferences(input.businessId, input.userId, tx);

  const dismissedQueueItems = { ...current.dismissedQueueItems };
  if (input.dismissQueueItemId) dismissedQueueItems[input.dismissQueueItemId] = new Date().toISOString();
  if (input.clearDismissQueueItemId) delete dismissedQueueItems[input.clearDismissQueueItemId];

  const snoozedQueueItems = { ...current.snoozedQueueItems };
  if (input.snoozeQueueItemId && input.snoozeUntil) snoozedQueueItems[input.snoozeQueueItemId] = input.snoozeUntil.toISOString();
  if (input.clearSnoozeQueueItemId) delete snoozedQueueItems[input.clearSnoozeQueueItemId];

  const widgetOrder = input.widgetOrder ?? current.widgetOrder;
  const hiddenWidgets = input.hiddenWidgets ?? current.hiddenWidgets;
  const defaultRange = input.defaultRange === undefined ? current.defaultRange : input.defaultRange;
  const defaultTeamMemberId =
    input.defaultTeamMemberId === undefined ? current.defaultTeamMemberId : input.defaultTeamMemberId;
  const lastSeenAt = input.markSeenAt === undefined ? current.lastSeenAt : input.markSeenAt?.toISOString() ?? null;

    await tx
      .insert(dashboardPreferences)
    .values({
      businessId: input.businessId,
      userId: input.userId,
      widgetOrder: JSON.stringify(widgetOrder),
      hiddenWidgets: JSON.stringify(hiddenWidgets),
      defaultRange,
      defaultTeamMemberId,
      dismissedQueueItems: JSON.stringify(dismissedQueueItems),
      snoozedQueueItems: JSON.stringify(snoozedQueueItems),
      lastSeenAt: lastSeenAt ? new Date(lastSeenAt) : null,
    })
    .onConflictDoUpdate({
      target: [dashboardPreferences.businessId, dashboardPreferences.userId],
      set: {
        widgetOrder: JSON.stringify(widgetOrder),
        hiddenWidgets: JSON.stringify(hiddenWidgets),
        defaultRange,
        defaultTeamMemberId,
        dismissedQueueItems: JSON.stringify(dismissedQueueItems),
        snoozedQueueItems: JSON.stringify(snoozedQueueItems),
        lastSeenAt: lastSeenAt ? new Date(lastSeenAt) : null,
        updatedAt: new Date(),
      },
      });

    invalidateHomeDashboardCache({
      businessId: input.businessId,
      userId: input.userId,
      reason: "preferences.updated",
    });
    return loadDashboardPreferences(input.businessId, input.userId, tx);
  }

async function loadTodayAppointments(
  businessId: string,
  windowStart: Date,
  windowEnd: Date,
  teamMemberId: string | null | undefined,
  tx: DbExecutor
): Promise<AppointmentDashboardRow[]> {
  return tx
    .select({
      id: appointments.id,
      title: appointments.title,
      status: appointments.status,
      jobPhase: appointments.jobPhase,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      jobStartTime: appointments.jobStartTime,
      expectedCompletionTime: appointments.expectedCompletionTime,
      pickupReadyTime: appointments.pickupReadyTime,
      vehicleOnSite: appointments.vehicleOnSite,
      subtotal: appointments.subtotal,
      taxRate: appointments.taxRate,
      taxAmount: appointments.taxAmount,
      applyTax: appointments.applyTax,
      adminFeeRate: appointments.adminFeeRate,
      adminFeeAmount: appointments.adminFeeAmount,
      applyAdminFee: appointments.applyAdminFee,
      totalPrice: appointments.totalPrice,
      depositAmount: appointments.depositAmount,
      clientId: clients.id,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      vehicleId: vehicles.id,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      assignedStaffId: staff.id,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      locationId: locations.id,
      locationName: locations.name,
      createdAt: appointments.createdAt,
      completedAt: appointments.completedAt,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
    .leftJoin(staff, eq(appointments.assignedStaffId, staff.id))
    .leftJoin(locations, eq(appointments.locationId, locations.id))
    .where(
      and(
        eq(appointments.businessId, businessId),
        sql`${appointments.status} not in ('cancelled', 'no-show')`,
        sql`coalesce(${appointments.jobStartTime}, ${appointments.startTime}) <= ${windowEnd}`,
        sql`coalesce(${appointments.pickupReadyTime}, ${appointments.expectedCompletionTime}, ${appointments.endTime}, ${appointments.startTime}) >= ${windowStart}`,
        teamMemberId ? eq(appointments.assignedStaffId, teamMemberId) : undefined
      )
    )
    .orderBy(asc(appointments.startTime));
}

async function loadWeeklyOverviewAppointments(
  businessId: string,
  windowStart: Date,
  windowEnd: Date,
  teamMemberId: string | null | undefined,
  tx: DbExecutor
): Promise<AppointmentDashboardRow[]> {
  return tx
    .select({
      id: appointments.id,
      title: appointments.title,
      status: appointments.status,
      jobPhase: appointments.jobPhase,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      jobStartTime: appointments.jobStartTime,
      expectedCompletionTime: appointments.expectedCompletionTime,
      pickupReadyTime: appointments.pickupReadyTime,
      vehicleOnSite: appointments.vehicleOnSite,
      subtotal: appointments.subtotal,
      taxRate: appointments.taxRate,
      taxAmount: appointments.taxAmount,
      applyTax: appointments.applyTax,
      adminFeeRate: appointments.adminFeeRate,
      adminFeeAmount: appointments.adminFeeAmount,
      applyAdminFee: appointments.applyAdminFee,
      totalPrice: appointments.totalPrice,
      depositAmount: appointments.depositAmount,
      clientId: clients.id,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      vehicleId: vehicles.id,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      assignedStaffId: staff.id,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      locationId: locations.id,
      locationName: locations.name,
      createdAt: appointments.createdAt,
      completedAt: appointments.completedAt,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
    .leftJoin(staff, eq(appointments.assignedStaffId, staff.id))
    .leftJoin(locations, eq(appointments.locationId, locations.id))
    .where(
      and(
        eq(appointments.businessId, businessId),
        sql`coalesce(${appointments.jobStartTime}, ${appointments.startTime}) <= ${windowEnd}`,
        sql`coalesce(${appointments.pickupReadyTime}, ${appointments.expectedCompletionTime}, ${appointments.endTime}, ${appointments.startTime}) >= ${windowStart}`,
        teamMemberId ? eq(appointments.assignedStaffId, teamMemberId) : undefined
      )
    )
    .orderBy(asc(appointments.startTime));
}

async function loadAppointmentServiceNames(
  appointmentIds: string[],
  tx: DbExecutor
): Promise<Map<string, string[]>> {
  const namesById = new Map<string, string[]>();
  if (appointmentIds.length === 0) return namesById;
  const rows = await tx
    .select({
      appointmentId: appointmentServices.appointmentId,
      serviceName: services.name,
    })
    .from(appointmentServices)
    .innerJoin(services, eq(appointmentServices.serviceId, services.id))
    .where(inArray(appointmentServices.appointmentId, appointmentIds))
    .orderBy(asc(services.name));
  for (const row of rows) {
    const current = namesById.get(row.appointmentId) ?? [];
    current.push(row.serviceName);
    namesById.set(row.appointmentId, current);
  }
  return namesById;
}

async function loadInvoiceSnapshots(businessId: string, tx: DbExecutor): Promise<InvoiceSnapshotRow[]> {
  const paymentTotals = tx
    .select({
      invoiceId: payments.invoiceId,
      totalPaid: sql<string>`coalesce(sum(case when ${payments.reversedAt} is null then ${payments.amount} else 0 end), 0)`.as("total_paid"),
    })
    .from(payments)
    .groupBy(payments.invoiceId)
    .as("home_dashboard_payment_totals");

  return tx
    .select({
      id: invoices.id,
      appointmentId: invoices.appointmentId,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      total: invoices.total,
      dueDate: invoices.dueDate,
      createdAt: invoices.createdAt,
      paidAt: invoices.paidAt,
      totalPaid: sql<string>`coalesce(${paymentTotals.totalPaid}, 0)`,
      clientId: clients.id,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .leftJoin(paymentTotals, eq(paymentTotals.invoiceId, invoices.id))
    .where(and(eq(invoices.businessId, businessId), sql`${invoices.status} != 'void'`))
    .orderBy(desc(invoices.createdAt));
}

async function loadLeadRows(businessId: string, tx: DbExecutor): Promise<LeadRow[]> {
  return tx
    .select({
      id: clients.id,
      createdAt: clients.createdAt,
      firstName: clients.firstName,
      lastName: clients.lastName,
      notes: clients.notes,
    })
    .from(clients)
    .where(and(eq(clients.businessId, businessId), sql`${clients.notes} is not null`))
    .orderBy(desc(clients.createdAt));
}

async function loadQuoteRows(
  businessId: string,
  tx: DbExecutor
): Promise<Array<{ id: string; clientId: string | null; status: string; total: MoneyLike; sentAt: Date | null; followUpSentAt: Date | null; clientFirstName: string | null; clientLastName: string | null }>> {
  return tx
    .select({
      id: quotes.id,
      clientId: quotes.clientId,
      status: quotes.status,
      total: quotes.total,
      sentAt: quotes.sentAt,
      followUpSentAt: quotes.followUpSentAt,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
    })
    .from(quotes)
    .leftJoin(clients, eq(quotes.clientId, clients.id))
    .where(eq(quotes.businessId, businessId))
    .orderBy(desc(quotes.createdAt));
}

async function loadUpcomingDepositCandidates(
  businessId: string,
  now: Date,
  next48Hours: Date,
  teamMemberId: string | null | undefined,
  tx: DbExecutor
) {
  return tx
    .select({
      id: appointments.id,
      title: appointments.title,
      startTime: appointments.startTime,
      totalPrice: appointments.totalPrice,
      depositAmount: appointments.depositAmount,
      assignedStaffId: appointments.assignedStaffId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .where(
      and(
        eq(appointments.businessId, businessId),
        sql`${appointments.status} in ('scheduled', 'confirmed', 'in_progress')`,
        gte(appointments.startTime, now),
        lte(appointments.startTime, next48Hours),
        teamMemberId ? eq(appointments.assignedStaffId, teamMemberId) : undefined
      )
    )
    .orderBy(asc(appointments.startTime));
}

async function loadCompletedAppointmentsMissingInvoice(
  businessId: string,
  teamMemberId: string | null | undefined,
  tx: DbExecutor
) {
  return tx
    .select({
      id: appointments.id,
      title: appointments.title,
      completedAt: appointments.completedAt,
      subtotal: appointments.subtotal,
      taxRate: appointments.taxRate,
      taxAmount: appointments.taxAmount,
      applyTax: appointments.applyTax,
      adminFeeRate: appointments.adminFeeRate,
      adminFeeAmount: appointments.adminFeeAmount,
      applyAdminFee: appointments.applyAdminFee,
      totalPrice: appointments.totalPrice,
      clientId: appointments.clientId,
      assignedStaffId: appointments.assignedStaffId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .where(
      and(
        eq(appointments.businessId, businessId),
        eq(appointments.status, "completed"),
        sql`${appointments.clientId} is not null`,
        teamMemberId ? eq(appointments.assignedStaffId, teamMemberId) : undefined,
        sql`not exists (
          select 1
          from ${invoices}
          where ${invoices.businessId} = ${businessId}
            and ${invoices.appointmentId} = ${appointments.id}
            and ${invoices.status} != 'void'
        )`
      )
    )
    .orderBy(desc(appointments.completedAt))
    .limit(25);
}

async function loadMonthAppointmentsForPipeline(
  businessId: string,
  monthStart: Date,
  monthEnd: Date,
  tx: DbExecutor
): Promise<
  Array<
    Pick<
      AppointmentDashboardRow,
      | "id"
      | "status"
      | "subtotal"
      | "taxRate"
      | "taxAmount"
      | "applyTax"
      | "adminFeeRate"
      | "adminFeeAmount"
      | "applyAdminFee"
      | "totalPrice"
      | "createdAt"
      | "completedAt"
    >
  >
> {
  return tx
    .select({
      id: appointments.id,
      status: appointments.status,
      subtotal: appointments.subtotal,
      taxRate: appointments.taxRate,
      taxAmount: appointments.taxAmount,
      applyTax: appointments.applyTax,
      adminFeeRate: appointments.adminFeeRate,
      adminFeeAmount: appointments.adminFeeAmount,
      applyAdminFee: appointments.applyAdminFee,
      totalPrice: appointments.totalPrice,
      createdAt: appointments.createdAt,
      completedAt: appointments.completedAt,
    })
    .from(appointments)
    .where(and(eq(appointments.businessId, businessId), gte(appointments.createdAt, monthStart), lte(appointments.createdAt, monthEnd)))
    .orderBy(desc(appointments.createdAt));
}

async function loadMonthAppointmentsForRevenue(
  businessId: string,
  monthStart: Date,
  monthEnd: Date,
  tx: DbExecutor
): Promise<
  Array<{
    id: string;
    bookedAt: Date;
    subtotal: MoneyLike;
    taxRate: MoneyLike;
    taxAmount: MoneyLike;
    applyTax: boolean | null;
    adminFeeRate: MoneyLike;
    adminFeeAmount: MoneyLike;
    applyAdminFee: boolean | null;
    totalPrice: MoneyLike;
    depositAmount: MoneyLike;
  }>
> {
  const bookedAt = sql<Date>`coalesce(${appointments.jobStartTime}, ${appointments.startTime})`;
  return tx
    .select({
      id: appointments.id,
      bookedAt: bookedAt.as("booked_at"),
      subtotal: appointments.subtotal,
      taxRate: appointments.taxRate,
      taxAmount: appointments.taxAmount,
      applyTax: appointments.applyTax,
      adminFeeRate: appointments.adminFeeRate,
      adminFeeAmount: appointments.adminFeeAmount,
      applyAdminFee: appointments.applyAdminFee,
      totalPrice: appointments.totalPrice,
      depositAmount: appointments.depositAmount,
    })
    .from(appointments)
    .where(and(eq(appointments.businessId, businessId), gte(bookedAt, monthStart), lte(bookedAt, monthEnd)))
    .orderBy(asc(bookedAt));
}

export function buildAddOnInsights(params: {
  appointmentCount: number;
  rows: Array<{
    appointmentId: string;
    serviceId: string;
    serviceName: string;
    quantity: MoneyLike;
    unitPrice: MoneyLike;
  }>;
}): HomeDashboardAddOnInsights {
  const appointmentIds = new Set<string>();
  const topAddOnMap = new Map<string, { id: string; name: string; count: number; revenue: number }>();
  let addOnRevenue = 0;
  let addOnCount = 0;

  for (const row of params.rows) {
    appointmentIds.add(row.appointmentId);
    const quantity = Math.max(1, toMoneyNumber(row.quantity));
    const unitPrice = toMoneyNumber(row.unitPrice);
    const revenue = Number((quantity * unitPrice).toFixed(2));
    addOnRevenue += revenue;
    addOnCount += quantity;

    const current = topAddOnMap.get(row.serviceId) ?? {
      id: row.serviceId,
      name: row.serviceName,
      count: 0,
      revenue: 0,
    };
    current.count += quantity;
    current.revenue = Number((current.revenue + revenue).toFixed(2));
    topAddOnMap.set(row.serviceId, current);
  }

  const appointmentsWithAddOns = appointmentIds.size;
  const appointmentCount = Math.max(0, params.appointmentCount);
  const attachmentRate = appointmentCount > 0 ? Math.round((appointmentsWithAddOns / appointmentCount) * 100) : 0;

  return {
    appointmentCount,
    appointmentsWithAddOns,
    attachmentRate,
    addOnRevenue: Number(addOnRevenue.toFixed(2)),
    addOnCount,
    averageAddOnRevenuePerBooking:
      appointmentCount > 0 ? Number((addOnRevenue / Math.max(appointmentCount, 1)).toFixed(2)) : 0,
    topAddOns: Array.from(topAddOnMap.values())
      .sort((left, right) => right.revenue - left.revenue || right.count - left.count || left.name.localeCompare(right.name))
      .slice(0, 4),
  };
}

async function loadMonthAddOnInsights(
  businessId: string,
  monthStart: Date,
  monthEnd: Date,
  appointmentCount: number,
  tx: DbExecutor
): Promise<HomeDashboardAddOnInsights> {
  const rows = await tx
    .select({
      appointmentId: appointments.id,
      serviceId: services.id,
      serviceName: services.name,
      quantity: appointmentServices.quantity,
      unitPrice: sql<MoneyLike>`coalesce(${appointmentServices.unitPrice}, ${services.price}, 0)`.as("unit_price"),
    })
    .from(appointmentServices)
    .innerJoin(appointments, eq(appointmentServices.appointmentId, appointments.id))
    .innerJoin(services, eq(appointmentServices.serviceId, services.id))
    .where(
      and(
        eq(appointments.businessId, businessId),
        eq(services.businessId, businessId),
        eq(services.isAddon, true),
        gte(appointments.createdAt, monthStart),
        lte(appointments.createdAt, monthEnd),
        sql`${appointments.status} not in ('cancelled', 'no-show')`
      )
    );

  return buildAddOnInsights({ appointmentCount, rows });
}

async function loadReviewRequestReadyRows(
  business: DashboardBusinessConfig,
  cutoff: Date,
  tx: DbExecutor
) {
  if (!business.automationReviewRequestsEnabled || !business.reviewRequestUrl?.trim()) return [];
  return tx
    .select({
      id: appointments.id,
      title: appointments.title,
      completedAt: appointments.completedAt,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientId: clients.id,
    })
    .from(appointments)
    .leftJoin(clients, eq(appointments.clientId, clients.id))
    .where(
      and(
        eq(appointments.businessId, business.id),
        eq(appointments.status, "completed"),
        lte(appointments.completedAt, cutoff),
        eq(clients.marketingOptIn, true),
        sql`not exists (
          select 1 from ${activityLogs}
          where ${activityLogs.businessId} = ${business.id}
            and ${activityLogs.entityType} = 'appointment'
            and ${activityLogs.entityId} = ${appointments.id}
            and ${activityLogs.action} = 'automation.review_request.sent'
        )`
      )
    )
    .orderBy(desc(appointments.completedAt))
    .limit(25);
}

async function loadReactivationRows(
  business: DashboardBusinessConfig,
  cutoff: Date,
  tx: DbExecutor
) {
  const lastVisits = tx
    .select({
      clientId: appointments.clientId,
      lastVisit: sql<Date | null>`max(coalesce(${appointments.completedAt}, ${appointments.startTime}))`.as("last_visit"),
    })
    .from(appointments)
    .where(eq(appointments.businessId, business.id))
    .groupBy(appointments.clientId)
    .as("home_dashboard_last_visits");

  return tx
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      lastVisit: lastVisits.lastVisit,
    })
    .from(clients)
    .leftJoin(lastVisits, eq(lastVisits.clientId, clients.id))
    .where(
      and(
        eq(clients.businessId, business.id),
        eq(clients.marketingOptIn, true),
        sql`${lastVisits.lastVisit} is not null`,
        lte(lastVisits.lastVisit, cutoff),
        sql`not exists (
          select 1 from ${activityLogs}
          where ${activityLogs.businessId} = ${business.id}
            and ${activityLogs.entityType} = 'client'
            and ${activityLogs.entityId} = ${clients.id}
            and ${activityLogs.action} = 'automation.lapsed_client.sent'
            and ${activityLogs.createdAt} >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
        )`
      )
    )
    .orderBy(desc(lastVisits.lastVisit), asc(clients.lastName), asc(clients.firstName))
    .limit(25);
}

async function loadRecentActivityRows(
  businessId: string,
  tx: DbExecutor
) {
  return tx
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(eq(activityLogs.businessId, businessId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(40);
}

async function loadOpenCustomerAddonRequestRows(businessId: string, tx: DbExecutor) {
  return tx
    .select({
      id: activityLogs.id,
      appointmentId: activityLogs.entityId,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
      appointmentTitle: appointments.title,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
    })
    .from(activityLogs)
    .innerJoin(
      appointments,
      and(eq(activityLogs.entityId, appointments.id), eq(appointments.businessId, businessId))
    )
    .leftJoin(clients, and(eq(appointments.clientId, clients.id), eq(clients.businessId, businessId)))
    .where(
      and(
        eq(activityLogs.businessId, businessId),
        eq(activityLogs.entityType, "appointment"),
        eq(activityLogs.action, "appointment.public_addon_requested"),
        sql`not exists (
          select 1
          from ${appointmentServices}
          where ${appointmentServices.appointmentId} = ${activityLogs.entityId}
            and ${appointmentServices.serviceId}::text = coalesce(${activityLogs.metadata}::json->>'addonServiceId', '')
        )`
      )
    )
    .orderBy(desc(activityLogs.createdAt))
    .limit(12);
}

async function loadInviteActivityRows(businessId: string, tx: DbExecutor) {
  return tx
    .select({
      membershipId: businessMemberships.id,
      userId: businessMemberships.userId,
      invitedAt: businessMemberships.invitedAt,
      joinedAt: businessMemberships.joinedAt,
      email: sql<string | null>`${staff.email}`.as("email"),
      firstName: sql<string | null>`${staff.firstName}`.as("first_name"),
      lastName: sql<string | null>`${staff.lastName}`.as("last_name"),
    })
    .from(businessMemberships)
    .leftJoin(
      staff,
      and(eq(staff.businessId, businessMemberships.businessId), eq(staff.userId, businessMemberships.userId))
    )
    .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.status, "invited")))
    .orderBy(desc(businessMemberships.invitedAt))
    .limit(20);
}

async function loadAutomationStats(
  businessId: string,
  weekStart: Date,
  weekEnd: Date,
  tx: DbExecutor
) {
  const activityRows = await tx
    .select({
      action: activityLogs.action,
      count: sql<number>`count(*)::int`,
    })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, businessId),
        gte(activityLogs.createdAt, weekStart),
        lte(activityLogs.createdAt, weekEnd),
        sql`${activityLogs.action} in (
          'automation.appointment_reminder.sent',
          'automation.review_request.sent',
          'automation.lapsed_client.sent',
          'automation.uncontacted_lead.sent',
          'automation.abandoned_quote.sent'
        )`
      )
    )
    .groupBy(activityLogs.action);

  const notificationRows = await tx
    .select({
      total: sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) filter (where ${notificationLogs.error} is null and (${notificationLogs.deliveredAt} is not null or ${notificationLogs.providerErrorCode} is null))::int`,
      failed: sql<number>`count(*) filter (where ${notificationLogs.error} is not null or ${notificationLogs.providerErrorCode} is not null)::int`,
    })
    .from(notificationLogs)
    .where(
      and(eq(notificationLogs.businessId, businessId), gte(notificationLogs.sentAt, weekStart), lte(notificationLogs.sentAt, weekEnd))
    );

  const [integrationFailureRow] = await tx
    .select({
      failed: sql<number>`count(*)::int`,
    })
    .from(integrationJobAttempts)
    .where(
      and(
        eq(integrationJobAttempts.businessId, businessId),
        eq(integrationJobAttempts.status, "failed"),
        gte(integrationJobAttempts.createdAt, weekStart),
        lte(integrationJobAttempts.createdAt, weekEnd)
      )
    );

  const counts = new Map(activityRows.map((row) => [row.action, row.count]));
  const notification = notificationRows[0] ?? { total: 0, delivered: 0, failed: 0 };

  return {
    remindersSentThisWeek: counts.get("automation.appointment_reminder.sent") ?? 0,
    invoiceNudgesSentThisWeek: null,
    reviewRequestsSentThisWeek: counts.get("automation.review_request.sent") ?? 0,
    reactivationMessagesSentThisWeek: counts.get("automation.lapsed_client.sent") ?? 0,
    deliverySuccessRate:
      notification.total > 0 ? Math.round((notification.delivered / Math.max(notification.total, 1)) * 100) : null,
    failedAutomationCount: (notification.failed ?? 0) + (integrationFailureRow?.failed ?? 0),
  };
}

async function loadSystemIssueCounts(
  businessId: string,
  weekStart: Date,
  weekEnd: Date,
  tx: DbExecutor
) {
  const [notificationFailureRow] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.businessId, businessId),
        gte(notificationLogs.sentAt, weekStart),
        lte(notificationLogs.sentAt, weekEnd),
        or(sql`${notificationLogs.error} is not null`, sql`${notificationLogs.providerErrorCode} is not null`)
      )
    );

  const [integrationFailureRow] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(integrationJobs)
    .where(
      and(
        eq(integrationJobs.businessId, businessId),
        inArray(integrationJobs.status, ["failed", "dead_letter"]),
        gte(integrationJobs.updatedAt, weekStart),
        lte(integrationJobs.updatedAt, weekEnd)
      )
    );

  return {
    notificationFailures: notificationFailureRow?.count ?? 0,
    integrationFailures: integrationFailureRow?.count ?? 0,
  };
}

async function sumInvoicePaymentsInRange(
  businessId: string,
  start: Date,
  end: Date,
  tx: DbExecutor
) {
  const rows = await tx
    .select({
      amount: payments.amount,
      notes: payments.notes,
      idempotencyKey: payments.idempotencyKey,
      method: payments.method,
      referenceNumber: payments.referenceNumber,
      appointmentId: invoices.appointmentId,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.businessId, businessId),
        isNull(payments.reversedAt),
        gte(payments.paidAt, start),
        lte(payments.paidAt, end),
        sql`${invoices.status} != 'void'`
      )
    );
  return rows.reduce((sum, row) => {
    if (isCarryoverPaymentRow(row)) return sum;
    return sum + toMoneyNumber(row.amount);
  }, 0);
}

async function sumDirectAppointmentPaymentsInRange(
  businessId: string,
  start: Date,
  end: Date,
  tx: DbExecutor
) {
  const rows = await tx
    .select({
      createdAt: activityLogs.createdAt,
      action: activityLogs.action,
      metadata: activityLogs.metadata,
    })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, businessId),
        eq(activityLogs.entityType, "appointment"),
        sql`${activityLogs.action} in ('appointment.deposit_paid', 'appointment.deposit_payment_reversed')`
      )
    );

  return rows.reduce((sum, row) => {
    const paidAt = getActivityLogEffectivePaidAt(row.metadata, row.createdAt);
    if (paidAt < start || paidAt > end) return sum;
    const metadata = safeParseMetadata(row.metadata);
    const amount = toMoneyNumber(metadata.amount as MoneyLike);
    if (amount <= 0) return sum;
    return row.action === "appointment.deposit_payment_reversed" ? sum - amount : sum + amount;
  }, 0);
}

async function loadInvoicePaymentRowsInRange(
  businessId: string,
  start: Date,
  end: Date,
  tx: DbExecutor
) {
  const rows = await tx
    .select({
      paidAt: payments.paidAt,
      amount: payments.amount,
      notes: payments.notes,
      idempotencyKey: payments.idempotencyKey,
      method: payments.method,
      referenceNumber: payments.referenceNumber,
      appointmentId: invoices.appointmentId,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.businessId, businessId),
        isNull(payments.reversedAt),
        gte(payments.paidAt, start),
        lte(payments.paidAt, end),
        sql`${invoices.status} != 'void'`
      )
    )
    .orderBy(asc(payments.paidAt));

  return rows
    .filter((row) => !isCarryoverPaymentRow(row))
    .map((row) => ({
      paidAt: row.paidAt,
      amount: row.amount,
    }));
}

async function loadDirectAppointmentPaymentRowsInRange(
  businessId: string,
  start: Date,
  end: Date,
  tx: DbExecutor
) {
  const rows = await tx
    .select({
      createdAt: activityLogs.createdAt,
      action: activityLogs.action,
      metadata: activityLogs.metadata,
    })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, businessId),
        eq(activityLogs.entityType, "appointment"),
        sql`${activityLogs.action} in ('appointment.deposit_paid', 'appointment.deposit_payment_reversed')`
      )
    )
    .orderBy(asc(activityLogs.createdAt));

  return rows
    .map((row) => {
      const paidAt = getActivityLogEffectivePaidAt(row.metadata, row.createdAt);
      const metadata = safeParseMetadata(row.metadata);
      const amount = toMoneyNumber(metadata.amount as MoneyLike);
      return {
        paidAt,
        amount: row.action === "appointment.deposit_payment_reversed" ? -amount : amount,
      };
    })
    .filter((row) => row.paidAt >= start && row.paidAt <= end);
}

async function loadExpenseRowsInRange(
  businessId: string,
  start: Date,
  end: Date,
  tx: DbExecutor
) {
  return tx
    .select({
      expenseDate: expenses.expenseDate,
      amount: expenses.amount,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.businessId, businessId),
        gte(expenses.expenseDate, start),
        lte(expenses.expenseDate, end)
      )
    )
    .orderBy(asc(expenses.expenseDate));
}

export function buildActionQueue(params: {
  context: ActionQueueContext;
  leadRows: LeadRow[];
  quoteRows: Array<{ id: string; clientId: string | null; status: string; total: MoneyLike; sentAt: Date | null; followUpSentAt: Date | null; clientFirstName: string | null; clientLastName: string | null }>;
  upcomingDepositRows: Array<{ id: string; title: string | null; startTime: Date; totalPrice: MoneyLike; depositAmount: MoneyLike; clientFirstName: string | null; clientLastName: string | null }>;
  upcomingDepositFinance: Map<string, AppointmentFinanceSummary>;
  overdueInvoices: InvoiceSnapshotRow[];
  completedMissingInvoiceRows: Array<
    Pick<
      AppointmentDashboardRow,
      | "id"
      | "title"
      | "completedAt"
      | "clientId"
      | "clientFirstName"
      | "clientLastName"
      | "subtotal"
      | "taxRate"
      | "taxAmount"
      | "applyTax"
      | "adminFeeRate"
      | "adminFeeAmount"
      | "applyAdminFee"
      | "totalPrice"
    >
  >;
  reviewRequestReadyRows: Array<{ id: string; title: string | null; completedAt: Date | null; clientFirstName: string | null; clientLastName: string | null; clientId: string | null }>;
  customerAddonRequestRows: Awaited<ReturnType<typeof loadOpenCustomerAddonRequestRows>>;
  reactivationRows: Array<{ id: string; firstName: string | null; lastName: string | null; lastVisit: Date | null }>;
  systemIssueCounts: { notificationFailures: number; integrationFailures: number };
}) {
  const items: HomeDashboardActionQueueItem[] = [];

  if (params.context.permissions.clientVisibility) {
    for (const row of params.leadRows) {
      const lead = parseLeadRecord(row.notes);
      if (!lead.isLead || lead.status !== "new" || lead.firstContactedAt) continue;
      if (row.createdAt > params.context.uncontactedCutoff) continue;
      items.push({
        id: `lead:${row.id}`,
        type: "uncontacted_lead",
        label: `Contact ${formatPersonName(row.firstName, row.lastName)}`,
        reason: `New lead is outside the configured response SLA.`,
        urgency: "high",
        amountAtRisk: null,
        ctaLabel: "Open lead",
        ctaUrl: `/leads?clientId=${encodeURIComponent(row.id)}`,
        supportsSnooze: true,
        supportsDismiss: true,
        occurredAt: row.createdAt.toISOString(),
        priority: 0,
        priorityReasons: [],
      });
    }
  }

  if (params.context.permissions.quoteVisibility) {
    for (const row of params.quoteRows) {
      if (row.status !== "sent" || row.followUpSentAt || !row.sentAt || row.sentAt > params.context.quoteFollowUpCutoff) continue;
      items.push({
        id: `quote:${row.id}`,
        type: "quote_follow_up",
        label: `Follow up quote for ${formatPersonName(row.clientFirstName, row.clientLastName)}`,
        reason: "Sent quote has not received a follow-up yet.",
        urgency: "high",
        amountAtRisk: toMoneyNumber(row.total),
        ctaLabel: "Open quote",
        ctaUrl: `/quotes/${row.id}`,
        supportsSnooze: true,
        supportsDismiss: true,
        occurredAt: row.sentAt.toISOString(),
        priority: 0,
        priorityReasons: [],
      });
    }
  }

  if (params.context.permissions.todaySchedule) {
    for (const row of params.upcomingDepositRows) {
      const depositAmount = toMoneyNumber(row.depositAmount);
      const finance = params.upcomingDepositFinance.get(row.id);
      if (depositAmount <= 0 || finance?.depositSatisfied === true) continue;
      items.push({
        id: `deposit:${row.id}`,
        type: "deposit_due",
        label: `Collect deposit for ${formatPersonName(row.clientFirstName, row.clientLastName)}`,
        reason: "Upcoming appointment requires a deposit and none is recorded yet.",
        urgency: "high",
        amountAtRisk: depositAmount,
        ctaLabel: "Open appointment",
        ctaUrl: `/appointments/${row.id}`,
        supportsSnooze: true,
        supportsDismiss: true,
        occurredAt: row.startTime.toISOString(),
        priority: 0,
        priorityReasons: [],
      });
    }
  }

  if (params.context.permissions.cash) {
    for (const row of params.overdueInvoices) {
      const balance = Math.max(0, toMoneyNumber(row.total) - toMoneyNumber(row.totalPaid));
      if (balance <= 0.009) continue;
      items.push({
        id: `invoice:${row.id}`,
        type: "overdue_invoice",
        label: `Collect invoice ${row.invoiceNumber ?? row.id.slice(0, 8)}`,
        reason: "Invoice is overdue and still has an open balance.",
        urgency: "critical",
        amountAtRisk: balance,
        ctaLabel: "Open invoice",
        ctaUrl: `/invoices/${row.id}`,
        supportsSnooze: true,
        supportsDismiss: true,
        occurredAt: row.dueDate?.toISOString() ?? row.createdAt.toISOString(),
        priority: 0,
        priorityReasons: [],
      });
    }
  }

  if (params.context.permissions.invoiceVisibility && params.context.permissions.todaySchedule) {
    for (const row of params.completedMissingInvoiceRows) {
      if (!row.clientId) continue;
      items.push({
        id: `completed:${row.id}`,
        type: "completed_missing_invoice",
        label: `Invoice completed job for ${formatPersonName(row.clientFirstName, row.clientLastName)}`,
        reason: "Completed work still needs an invoice.",
        urgency: "high",
        amountAtRisk: getDashboardAppointmentAmount(row),
        ctaLabel: "Open appointment",
        ctaUrl: `/appointments/${row.id}`,
        supportsSnooze: true,
        supportsDismiss: true,
        occurredAt: row.completedAt?.toISOString() ?? null,
        priority: 0,
        priorityReasons: [],
      });
    }
  }

  if (params.context.permissions.todaySchedule) {
    for (const row of params.reviewRequestReadyRows) {
      items.push({
        id: `review:${row.id}`,
        type: "review_request",
        label: `Send review request to ${formatPersonName(row.clientFirstName, row.clientLastName)}`,
        reason: "Completed job is past the review-request delay and has not been contacted yet.",
        urgency: "medium",
        amountAtRisk: null,
        ctaLabel: "Open appointment",
        ctaUrl: `/appointments/${row.id}`,
        supportsSnooze: true,
        supportsDismiss: true,
        occurredAt: row.completedAt?.toISOString() ?? null,
        priority: 0,
        priorityReasons: [],
      });
    }
  }

  if (params.context.permissions.todaySchedule) {
    const seenAddonRequestKeys = new Set<string>();
    for (const row of params.customerAddonRequestRows) {
      if (!row.appointmentId) continue;
      let addonName = "Requested add-on";
      let addonPrice: number | null = null;
      let addonServiceId = "";
      try {
        const metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
        if (typeof metadata.addonName === "string" && metadata.addonName.trim()) {
          addonName = metadata.addonName.trim();
        }
        if (typeof metadata.addonServiceId === "string" && metadata.addonServiceId.trim()) {
          addonServiceId = metadata.addonServiceId.trim();
        }
        const parsedPrice = Number(metadata.addonPrice);
        addonPrice = Number.isFinite(parsedPrice) ? parsedPrice : null;
      } catch {
        addonName = "Requested add-on";
      }
      const requestKey = `${row.appointmentId}:${addonServiceId || row.id}`;
      if (seenAddonRequestKeys.has(requestKey)) continue;
      seenAddonRequestKeys.add(requestKey);
      items.push({
        id: `addon-request:${row.id}`,
        type: "customer_addon_request",
        label: `Review add-on request: ${addonName}`,
        reason: `${formatPersonName(row.clientFirstName, row.clientLastName)} asked to add this to ${row.appointmentTitle ?? "an appointment"}.`,
        urgency: "medium",
        amountAtRisk: addonPrice,
        ctaLabel: "Open appointment",
        ctaUrl: `/appointments/${row.appointmentId}`,
        supportsSnooze: true,
        supportsDismiss: true,
        occurredAt: row.createdAt.toISOString(),
        priority: 0,
        priorityReasons: [],
      });
    }
  }

  if (params.context.permissions.clientVisibility) {
    for (const row of params.reactivationRows) {
      items.push({
        id: `reactivation:${row.id}`,
        type: "reactivation",
        label: `Reach back out to ${formatPersonName(row.firstName, row.lastName)}`,
        reason: "Client is outside the lapsed-client window and is eligible for reactivation.",
        urgency: "low",
        amountAtRisk: null,
        ctaLabel: "Open client",
        ctaUrl: `/clients/${row.id}`,
        supportsSnooze: true,
        supportsDismiss: true,
        occurredAt: row.lastVisit?.toISOString() ?? null,
        priority: 0,
        priorityReasons: [],
      });
    }
  }

  if (params.context.permissions.settingsVisibility) {
    const failureCount = params.systemIssueCounts.notificationFailures + params.systemIssueCounts.integrationFailures;
    if (failureCount > 0) {
      items.push({
        id: "system:failures",
        type: "system_issue",
        label: "Resolve automation and integration failures",
        reason: `${failureCount} failed notification or integration job${failureCount === 1 ? "" : "s"} this week.`,
        urgency: "critical",
        amountAtRisk: null,
        ctaLabel: "Open settings",
        ctaUrl: "/settings",
        supportsSnooze: false,
        supportsDismiss: true,
        occurredAt: null,
        priority: 0,
        priorityReasons: [],
      });
    }
  }

  return items;
}

export async function getHomeDashboardSnapshot(params: HomeDashboardParams): Promise<HomeDashboardSnapshot> {
  const tx = params.tx ?? db;
  const now = params.now ?? new Date();
  const startedAt = Date.now();
  const permissionsList = params.permissions ?? [];
  const modulePermissions = getDashboardModulePermissions(permissionsList);
  const timings: Record<string, number> = {};
  const dashboardTags = getHomeDashboardCacheTags({ businessId: params.businessId, userId: params.userId ?? null });
  const featureEnabled = isHomeDashboardEnabled();
  const business = await withDashboardTiming("businessConfig", timings, () => loadBusinessConfig(params.businessId, tx));
  const preferences = await withDashboardTiming("preferences", timings, () =>
    loadDashboardPreferences(params.businessId, params.userId ?? null, tx)
  );
  const selectedRange = params.range ?? preferences.defaultRange ?? "today";
  const selectedTeamMemberId = params.teamMemberId ?? preferences.defaultTeamMemberId ?? null;
  const timezone = business.timezone ?? DEFAULT_TIMEZONE;
  const timeOfDay = getDashboardTimeOfDay(now, timezone);
  const effectiveLayout = mergeWidgetPreferences(params.membershipRole ?? null, timeOfDay, preferences);
  const requestedWeekDate = parseBusinessDateInput(params.weekStartDate ?? null, timezone);
  const selectedWeekStart = startOfBusinessWeek(requestedWeekDate ?? now, timezone);
  const selectedWeekEnd = endOfBusinessWeek(selectedWeekStart, timezone);
  const selectedBusinessDateKey = getBusinessDateKey(
    requestedWeekDate && requestedWeekDate >= selectedWeekStart && requestedWeekDate <= selectedWeekEnd
      ? requestedWeekDate
      : now >= selectedWeekStart && now <= selectedWeekEnd
        ? now
        : selectedWeekStart,
    timezone
  );
  const cacheKey = getHomeDashboardCacheKey({
    businessId: params.businessId,
    userId: params.userId ?? null,
    permissions: permissionsList,
    timezone,
    range: selectedRange,
    teamMemberId: selectedTeamMemberId,
    weekStartDate: getBusinessDateKey(selectedWeekStart, timezone),
    preferencesVersion: preferences.updatedAt,
    now,
  });
  if (!params.skipCache) {
    const cachedSnapshot = readHomeDashboardCache(cacheKey, now);
    if (cachedSnapshot) {
      logger.info("Home dashboard cache hit", {
        businessId: params.businessId,
        userId: params.userId ?? undefined,
        cacheKey,
      });
      return {
        ...cachedSnapshot,
        featureFlags: {
          ...cachedSnapshot.featureFlags,
          homeDashboardV2: featureEnabled,
        },
        cache: {
          ...cachedSnapshot.cache,
          hit: true,
        },
      };
    }
  }
  logger.info("Home dashboard cache miss", {
    businessId: params.businessId,
    userId: params.userId ?? undefined,
    cacheKey,
  });
  const todayStart = startOfBusinessDay(now, timezone);
  const todayEnd = endOfBusinessDay(now, timezone);
  const weekStart = startOfBusinessWeek(now, timezone);
  const weekEnd = endOfBusinessWeek(now, timezone);
  const monthStart = startOfBusinessMonth(now, timezone);
  const monthEnd = endOfBusinessMonth(now, timezone);
  const scheduleWindowStart = selectedRange === "month" ? monthStart : selectedRange === "week" ? weekStart : todayStart;
  const scheduleWindowEnd = selectedRange === "month" ? monthEnd : selectedRange === "week" ? weekEnd : todayEnd;
  const next48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const uncontactedLeadHours = Math.max(0.25, Math.min(Number(business.automationUncontactedLeadHours ?? 2), 168));
  const quoteFollowUpHours = Math.max(1, Math.min(Number(business.automationAbandonedQuoteHours ?? 48), 336));
  const reviewRequestHours = Math.max(1, Math.min(Number(business.automationReviewRequestDelayHours ?? 24), 336));
  const lapsedClientMonths = Math.max(1, Math.min(Number(business.automationLapsedClientMonths ?? 6), 36));
  const uncontactedCutoff = new Date(now.getTime() - uncontactedLeadHours * 60 * 60 * 1000);
  const quoteFollowUpCutoff = new Date(now.getTime() - quoteFollowUpHours * 60 * 60 * 1000);
  const reviewCutoff = new Date(now.getTime() - reviewRequestHours * 60 * 60 * 1000);
  const lapsedCutoff = new Date(now);
  lapsedCutoff.setMonth(lapsedCutoff.getMonth() - lapsedClientMonths);
  const widgetErrors: HomeDashboardSnapshot["widgetErrors"] = {};
  const markWidgetError = (widget: HomeDashboardWidgetKey, sourceMessage: string) => {
    widgetErrors[widget] = {
      message: getSanitizedWidgetError(sourceMessage),
      retryable: true,
    };
  };
  const loadOrFallback = async <T>(
    timingLabel: string,
    fallback: T,
    widgets: HomeDashboardWidgetKey[],
    run: () => Promise<T>
  ): Promise<T> => {
    try {
      return await withDashboardTiming(timingLabel, timings, run);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Home dashboard widget degraded", {
        businessId: params.businessId,
        userId: params.userId ?? undefined,
        widget: widgets.join(","),
        timingLabel,
        error: message,
      });
      for (const widget of widgets) markWidgetError(widget, message);
      return fallback;
    }
  };
  const buildOrFallback = <T>(timingLabel: string, fallback: T, widgets: HomeDashboardWidgetKey[], run: () => T): T => {
    const started = Date.now();
    try {
      return run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Home dashboard derived widget degraded", {
        businessId: params.businessId,
        userId: params.userId ?? undefined,
        widget: widgets.join(","),
        timingLabel,
        error: message,
      });
      for (const widget of widgets) markWidgetError(widget, message);
      return fallback;
    } finally {
      timings[timingLabel] = Date.now() - started;
    }
  };

  const [
    todayAppointments,
    weekOverviewAppointments,
    invoiceRows,
    leadRows,
    quoteRows,
    monthAppointments,
    monthRevenueAppointments,
    completedMissingInvoiceRows,
    recentActivityRows,
    inviteRows,
    automationStats,
    systemIssueCounts,
    upcomingDepositRows,
    reviewRequestReadyRows,
    customerAddonRequestRows,
    reactivationRows,
  ] = await Promise.all([
    loadOrFallback(
      "todayAppointments",
      [] as AppointmentDashboardRow[],
      ["summary_today", "today_schedule", "action_queue", "business_health"],
      () => loadTodayAppointments(params.businessId, scheduleWindowStart, scheduleWindowEnd, selectedTeamMemberId, tx)
    ),
    loadOrFallback(
      "weekOverviewAppointments",
      [] as AppointmentDashboardRow[],
      ["today_schedule"],
      () => loadWeeklyOverviewAppointments(params.businessId, selectedWeekStart, selectedWeekEnd, selectedTeamMemberId, tx)
    ),
    loadOrFallback(
      "invoiceSnapshots",
      [] as InvoiceSnapshotRow[],
      ["summary_cash", "action_queue", "pipeline", "revenue_collections", "business_health", "goals"],
      () => loadInvoiceSnapshots(params.businessId, tx)
    ),
    loadOrFallback(
      "leadRows",
      [] as LeadRow[],
      ["summary_conversion", "action_queue", "pipeline", "business_health"],
      () => loadLeadRows(params.businessId, tx)
    ),
    loadOrFallback(
      "quoteRows",
      [] as Awaited<ReturnType<typeof loadQuoteRows>>,
      ["summary_conversion", "action_queue", "pipeline"],
      () => loadQuoteRows(params.businessId, tx)
    ),
    loadOrFallback(
      "monthAppointments",
      [] as AppointmentDashboardRow[],
      ["pipeline", "goals"],
      () => loadMonthAppointmentsForPipeline(params.businessId, monthStart, monthEnd, tx)
    ),
    loadOrFallback(
      "monthRevenueAppointments",
      [] as Awaited<ReturnType<typeof loadMonthAppointmentsForRevenue>>,
      ["revenue_collections", "goals", "summary_cash"],
      () => loadMonthAppointmentsForRevenue(params.businessId, monthStart, monthEnd, tx)
    ),
    loadOrFallback(
      "completedMissingInvoiceRows",
      [] as Awaited<ReturnType<typeof loadCompletedAppointmentsMissingInvoice>>,
      ["action_queue", "business_health"],
      () => loadCompletedAppointmentsMissingInvoice(params.businessId, selectedTeamMemberId, tx)
    ),
    loadOrFallback(
      "recentActivityRows",
      [] as Awaited<ReturnType<typeof loadRecentActivityRows>>,
      ["recent_activity"],
      () => loadRecentActivityRows(params.businessId, tx)
    ),
    loadOrFallback(
      "inviteRows",
      [] as Awaited<ReturnType<typeof loadInviteActivityRows>>,
      ["recent_activity"],
      () => loadInviteActivityRows(params.businessId, tx)
    ),
    loadOrFallback(
      "automationStats",
      {
        remindersSentThisWeek: 0,
        invoiceNudgesSentThisWeek: null,
        reviewRequestsSentThisWeek: 0,
        reactivationMessagesSentThisWeek: 0,
        deliverySuccessRate: null,
        failedAutomationCount: 0,
      } as Awaited<ReturnType<typeof loadAutomationStats>>,
      ["automations", "business_health"],
      () => loadAutomationStats(params.businessId, weekStart, weekEnd, tx)
    ),
    loadOrFallback(
      "systemIssueCounts",
      { notificationFailures: 0, integrationFailures: 0 },
      ["action_queue", "automations", "business_health"],
      () => loadSystemIssueCounts(params.businessId, weekStart, weekEnd, tx)
    ),
    loadOrFallback(
      "upcomingDepositRows",
      [] as Awaited<ReturnType<typeof loadUpcomingDepositCandidates>>,
      ["summary_cash", "action_queue", "revenue_collections", "business_health"],
      () => loadUpcomingDepositCandidates(params.businessId, now, next48Hours, selectedTeamMemberId, tx)
    ),
    loadOrFallback(
      "reviewRequestReadyRows",
      [] as AppointmentDashboardRow[],
      ["action_queue", "automations"],
      () => loadReviewRequestReadyRows(business, reviewCutoff, tx)
    ),
    loadOrFallback(
      "customerAddonRequestRows",
      [] as Awaited<ReturnType<typeof loadOpenCustomerAddonRequestRows>>,
      ["action_queue"],
      () => loadOpenCustomerAddonRequestRows(params.businessId, tx)
    ),
    loadOrFallback(
      "reactivationRows",
      [] as Awaited<ReturnType<typeof loadReactivationRows>>,
      ["action_queue", "automations"],
      () => loadReactivationRows(business, lapsedCutoff, tx)
    ),
  ]);

  const emptyAddOnInsights = buildAddOnInsights({ appointmentCount: monthAppointments.length, rows: [] });
  const addOnInsights = await loadOrFallback(
    "monthAddOnInsights",
    emptyAddOnInsights,
    ["summary_conversion", "pipeline", "revenue_collections"],
    () => loadMonthAddOnInsights(params.businessId, monthStart, monthEnd, monthAppointments.length, tx)
  );

  const appointmentIds = todayAppointments.map((row) => row.id);
  const serviceNamesByAppointmentId = await loadOrFallback(
    "appointmentServiceNames",
    new Map<string, string[]>(),
    ["today_schedule"],
    () => loadAppointmentServiceNames(appointmentIds, tx)
  );
  const todayFinanceMap = await loadOrFallback(
    "todayFinance",
    new Map<string, AppointmentFinanceSummary>(),
    ["today_schedule", "summary_cash"],
    () =>
      getAppointmentFinanceSummaryMap(
        params.businessId,
        todayAppointments.map((row) => ({
          id: row.id,
          totalPrice: row.totalPrice,
          depositAmount: row.depositAmount,
          paidAt: null,
        })),
        tx
      )
  );
  const upcomingDepositFinance = await loadOrFallback(
    "upcomingDepositFinance",
    new Map<string, AppointmentFinanceSummary>(),
    ["summary_cash", "action_queue", "revenue_collections", "business_health"],
    () =>
      getAppointmentFinanceSummaryMap(
        params.businessId,
        upcomingDepositRows.map((row) => ({
          id: row.id,
          totalPrice: row.totalPrice,
          depositAmount: row.depositAmount,
          paidAt: null,
        })),
        tx
      )
  );

  const todayScheduleItems = buildOrFallback("todayScheduleItems", [] as HomeDashboardTodayScheduleItem[], ["today_schedule"], () =>
    buildTodayScheduleItems({
      rows: todayAppointments,
      financeMap: todayFinanceMap,
      serviceNamesByAppointmentId,
      timezone,
      permissions: modulePermissions,
      referenceDay: now,
    })
  );

  const monthStandaloneInvoices = invoiceRows.filter(
    (row) => !row.appointmentId && row.createdAt >= monthStart && row.createdAt <= monthEnd
  );
  const overdueInvoices = invoiceRows.filter((row) => normalizeInvoiceStatus(row, todayStart) === "overdue");
  const outstandingInvoiceAmount = invoiceRows.reduce((sum, row) => {
    const balance = Math.max(0, toMoneyNumber(row.total) - toMoneyNumber(row.totalPaid));
    return sum + balance;
  }, 0);
  const monthRevenueFinanceMap = await loadOrFallback(
    "monthRevenueFinanceMap",
    new Map<string, AppointmentFinanceSummary>(),
    ["summary_cash", "revenue_collections", "goals"],
    () =>
      getAppointmentFinanceSummaryMap(
        params.businessId,
        monthRevenueAppointments.map((row) => ({
          id: row.id,
          totalPrice: getDashboardAppointmentAmount(row),
          depositAmount: row.depositAmount,
          paidAt: null,
        })),
        tx
      )
  );
  const outstandingAppointmentRevenueAmount = monthRevenueAppointments.reduce((sum, row) => {
    const finance = monthRevenueFinanceMap.get(row.id);
    return sum + Math.max(0, finance?.balanceDue ?? 0);
  }, 0);
  const outstandingOpenRevenueAmount = outstandingAppointmentRevenueAmount + monthStandaloneInvoices.reduce((sum, row) => {
    const balance = Math.max(0, toMoneyNumber(row.total) - toMoneyNumber(row.totalPaid));
    return sum + balance;
  }, 0);
  const overdueInvoiceAmount = overdueInvoices.reduce((sum, row) => {
    const balance = Math.max(0, toMoneyNumber(row.total) - toMoneyNumber(row.totalPaid));
    return sum + balance;
  }, 0);

  const depositsDueRows = upcomingDepositRows.filter((row) => {
    const depositAmount = toMoneyNumber(row.depositAmount);
    const finance = upcomingDepositFinance.get(row.id);
    return depositAmount > 0 && finance?.depositSatisfied !== true;
  });
  const depositsDueAmount = depositsDueRows.reduce((sum, row) => sum + toMoneyNumber(row.depositAmount), 0);
  const depositsCoveredAmount = calculateUpcomingDepositCoverage({
    rows: upcomingDepositRows,
    financeByAppointmentId: upcomingDepositFinance,
  });

  const [
    invoiceCollectedToday,
    directCollectedToday,
    invoiceCollectedThisWeek,
    directCollectedThisWeek,
    invoiceCollectedThisMonth,
    directCollectedThisMonth,
    invoicePaymentRowsThisMonth,
    directPaymentRowsThisMonth,
    expenseRowsThisMonth,
  ] = await Promise.all([
    loadOrFallback("invoiceCollectedToday", 0, ["summary_cash", "revenue_collections", "goals"], () =>
      sumInvoicePaymentsInRange(params.businessId, todayStart, todayEnd, tx)
    ),
    loadOrFallback("directCollectedToday", 0, ["summary_cash", "revenue_collections", "goals"], () =>
      sumDirectAppointmentPaymentsInRange(params.businessId, todayStart, todayEnd, tx)
    ),
    loadOrFallback("invoiceCollectedThisWeek", 0, ["summary_cash", "revenue_collections", "goals"], () =>
      sumInvoicePaymentsInRange(params.businessId, weekStart, weekEnd, tx)
    ),
    loadOrFallback("directCollectedThisWeek", 0, ["summary_cash", "revenue_collections", "goals"], () =>
      sumDirectAppointmentPaymentsInRange(params.businessId, weekStart, weekEnd, tx)
    ),
    loadOrFallback("invoiceCollectedThisMonth", 0, ["summary_cash", "revenue_collections", "goals"], () =>
      sumInvoicePaymentsInRange(params.businessId, monthStart, monthEnd, tx)
    ),
    loadOrFallback("directCollectedThisMonth", 0, ["summary_cash", "revenue_collections", "goals"], () =>
      sumDirectAppointmentPaymentsInRange(params.businessId, monthStart, monthEnd, tx)
    ),
    loadOrFallback(
      "invoicePaymentRowsThisMonth",
      [] as Awaited<ReturnType<typeof loadInvoicePaymentRowsInRange>>,
      ["revenue_collections"],
      () => loadInvoicePaymentRowsInRange(params.businessId, monthStart, monthEnd, tx)
    ),
    loadOrFallback(
      "directPaymentRowsThisMonth",
      [] as Awaited<ReturnType<typeof loadDirectAppointmentPaymentRowsInRange>>,
      ["revenue_collections"],
      () => loadDirectAppointmentPaymentRowsInRange(params.businessId, monthStart, monthEnd, tx)
    ),
    loadOrFallback(
      "expenseRowsThisMonth",
      [] as Awaited<ReturnType<typeof loadExpenseRowsInRange>>,
      ["revenue_collections"],
      () => loadExpenseRowsInRange(params.businessId, monthStart, monthEnd, tx)
    ),
  ]);
  const collectedToday = invoiceCollectedToday + directCollectedToday;
  const collectedThisWeek = invoiceCollectedThisWeek + directCollectedThisWeek;
  const collectedRevenueThisMonth = invoiceCollectedThisMonth + directCollectedThisMonth;
  const totalExpensesThisMonth = expenseRowsThisMonth.reduce((sum, row) => sum + toMoneyNumber(row.amount), 0);
  const netRevenueThisMonth = collectedRevenueThisMonth - totalExpensesThisMonth;

  const parsedLeads = leadRows.map((row) => ({ row, lead: parseLeadRecord(row.notes) }));
  const activeLeadRows = parsedLeads.filter(({ lead }) => lead.isLead);
  const overdueLeadCount = activeLeadRows.filter(
    ({ row, lead }) => lead.status === "new" && !lead.firstContactedAt && row.createdAt <= uncontactedCutoff
  ).length;

  const actionQueueItems = buildActionQueue({
    context: {
      permissions: modulePermissions,
      business,
      timezone,
      now,
      role: params.membershipRole ?? null,
      timeOfDay,
      next48Hours,
      uncontactedCutoff,
      quoteFollowUpCutoff,
      reviewCutoff,
      lapsedCutoff,
    },
    leadRows,
    quoteRows,
    upcomingDepositRows,
    upcomingDepositFinance,
    overdueInvoices,
    completedMissingInvoiceRows,
    reviewRequestReadyRows,
    customerAddonRequestRows,
    reactivationRows,
    systemIssueCounts,
  });
  const prioritizedQueueItems = applyActionQueuePriority({
    items: actionQueueItems,
    now,
    role: params.membershipRole ?? null,
    timeOfDay,
  });
  const visibleActionQueueItems = filterQueueItemsByPreferences(prioritizedQueueItems, preferences, now);

  const pipelineStages = buildOrFallback("pipelineStages", [] as HomeDashboardPipelineStage[], ["pipeline"], () =>
    buildPipelineStages({
      leadRows,
      quoteRows,
      appointmentRows: monthAppointments,
      invoiceRows,
    })
  );

  const weeklyOverviewDays = buildOrFallback(
    "weeklyOverviewDays",
    [] as HomeDashboardWeeklyOverviewDay[],
    ["today_schedule"],
    () =>
      buildWeeklyAppointmentOverview({
        rows: weekOverviewAppointments,
        weekStart: selectedWeekStart,
        timezone,
        staffCount: business.staffCount,
      })
  );

  const { bookedRevenueThisWeek, bookedRevenueThisMonth } = calculateBookedRevenueTotals({
    weekStart,
    weekEnd,
    bookedAppointments: monthRevenueAppointments,
    standaloneInvoices: monthStandaloneInvoices.map((row) => ({ bookedAt: row.createdAt, total: row.total })),
  });
  const monthlyRevenueDays = buildOrFallback(
    "monthlyRevenueDays",
    [] as HomeDashboardMonthlyRevenueDay[],
    ["revenue_collections", "goals"],
    () =>
      buildMonthlyRevenueChart({
        monthStart,
        monthEnd,
        timezone,
        bookedAppointments: monthRevenueAppointments,
        standaloneInvoices: monthStandaloneInvoices.map((row) => ({ bookedAt: row.createdAt, total: row.total })),
        collectedPayments: [
          ...invoicePaymentRowsThisMonth.map((row) => ({ paidAt: row.paidAt, amount: toMoneyNumber(row.amount) })),
          ...directPaymentRowsThisMonth,
        ],
        expenseRows: expenseRowsThisMonth,
        monthlyRevenueGoal: toMoneyNumber(business.monthlyRevenueGoal),
      })
  );

  const recentActivityItems = buildOrFallback(
    "recentActivityItems",
    [] as HomeDashboardRecentActivityEvent[],
    ["recent_activity"],
    () =>
      buildRecentActivityEvents({
        rows: recentActivityRows,
        inviteRows,
        permissions: modulePermissions,
      })
  );

  const scheduleConflictCount = computeScheduleConflictCount(todayAppointments);
  const businessHealth = buildOrFallback(
    "businessHealth",
    { score: null, factors: [], topIssues: [] },
    ["business_health"],
    () =>
      calculateHomeDashboardHealth({
        overdueLeadCount,
        overdueInvoiceCount: overdueInvoices.length,
        missingDepositCount: depositsDueRows.length,
        completedMissingInvoiceCount: completedMissingInvoiceRows.length,
        failedAutomationCount: automationStats.failedAutomationCount,
        scheduleConflictCount,
        permissions: modulePermissions,
      })
  );

  const monthlyRevenueGoal = toMoneyNumber(business.monthlyRevenueGoal);
  const daysInMonth = getTimeZoneParts(monthEnd, timezone).day;
  const dayOfMonth = getTimeZoneParts(now, timezone).day;
  const projectedMonthEnd =
    bookedRevenueThisMonth > 0 && dayOfMonth > 0
      ? Number(((bookedRevenueThisMonth / dayOfMonth) * daysInMonth).toFixed(2))
      : null;

  const goals: HomeDashboardGoals = {
    allowed: modulePermissions.goals,
    monthlyRevenueGoal: modulePermissions.goals && monthlyRevenueGoal > 0 ? Number(monthlyRevenueGoal.toFixed(2)) : null,
    currentRevenue: modulePermissions.goals ? bookedRevenueThisMonth : 0,
    percentToGoal:
      modulePermissions.goals && monthlyRevenueGoal > 0
        ? Math.min(100, Math.round((bookedRevenueThisMonth / monthlyRevenueGoal) * 100))
        : null,
    projectedMonthEnd: modulePermissions.goals ? projectedMonthEnd : null,
    monthlyJobsGoal: modulePermissions.goals ? business.monthlyJobsGoal ?? null : null,
    currentJobs: modulePermissions.goals ? monthAppointments.length : 0,
  };

  const revenueCollections: HomeDashboardSnapshot["revenueCollections"] = {
    allowed: modulePermissions.revenueCollections,
    bookedRevenueThisWeek: modulePermissions.revenueCollections ? bookedRevenueThisWeek : 0,
    collectedThisWeek: modulePermissions.revenueCollections ? Number(collectedThisWeek.toFixed(2)) : 0,
    collectedToday: modulePermissions.revenueCollections ? Number(collectedToday.toFixed(2)) : 0,
    outstandingInvoiceAmount: modulePermissions.revenueCollections ? Number(outstandingOpenRevenueAmount.toFixed(2)) : 0,
    overdueInvoiceAmount: modulePermissions.revenueCollections ? Number(overdueInvoiceAmount.toFixed(2)) : 0,
    depositsDueAmount: modulePermissions.revenueCollections ? Number(depositsDueAmount.toFixed(2)) : 0,
    depositsDueCount: modulePermissions.revenueCollections ? depositsDueRows.length : 0,
  };

  const bookingsOverview = buildOrFallback(
    "bookingsOverview",
    {
      allowed: false,
      bookingsToday: 0,
      bookingsThisWeek: 0,
      bookingsThisMonth: 0,
      quotesSent: 0,
      quotesAccepted: 0,
      quoteToBookConversionRate: null,
      averageTicketValue: null,
      depositsCollectedAmount: 0,
      depositsDueAmount: 0,
      depositsDueCount: 0,
      addOnInsights: buildAddOnInsights({ appointmentCount: 0, rows: [] }),
      links: {
        bookingsThisWeek: "/calendar",
        bookingsThisMonth: "/calendar",
        quotesSent: "/quotes",
        quotesAccepted: "/quotes",
        quoteToBookConversionRate: "/quotes",
        averageTicketValue: "/calendar",
        depositsCollected: "/finances",
        depositsDue: "/calendar",
      },
      funnel: [],
    } as HomeDashboardBookingsOverview,
    ["summary_today", "summary_conversion", "summary_cash", "pipeline", "revenue_collections"],
    () =>
      ({
        ...buildBookingsOverview({
          todayStart,
          todayEnd,
          weekStart,
          weekEnd,
          monthStart,
          timezone,
          monthAppointments,
          quoteRows,
          pipelineStages,
          depositsCollectedAmount: depositsCoveredAmount,
          depositsDueAmount,
          depositsDueCount: depositsDueRows.length,
          addOnInsights,
        }),
        allowed: modulePermissions.today || modulePermissions.pipeline || modulePermissions.revenueCollections || modulePermissions.conversion,
      }) as HomeDashboardBookingsOverview
  );

  const sinceLastChecked = buildOrFallback(
    "sinceLastChecked",
    {
      allowed: false,
      since: null,
      newLeads: 0,
      newBookings: 0,
      paymentsReceived: 0,
      newIssues: 0,
      resolvedIssues: 0,
    },
    ["recent_activity"],
    () =>
      buildSinceLastChecked({
        lastSeenAt: preferences.lastSeenAt,
        leadRows,
        monthAppointments,
        recentActivityItems,
        currentIssues: visibleActionQueueItems,
      })
  );

  const valueMoments = buildOrFallback(
    "valueMoments",
    [] as HomeDashboardSnapshot["valueMoments"],
    ["summary_cash", "automations", "goals"],
    () =>
      buildValueMoments({
        actionQueueItems: visibleActionQueueItems,
        automations: automationStats,
        goals,
        revenueCollections,
      })
  );

  const nudges = buildOrFallback(
    "nudges",
    [] as HomeDashboardSnapshot["nudges"],
    ["quick_actions", "goals", "automations"],
    () =>
      buildContextualNudges({
        business,
        permissions: modulePermissions,
        invoiceRows,
        completedMissingInvoiceCount: completedMissingInvoiceRows.length,
        depositsDueCount: depositsDueRows.length,
        upcomingAppointmentsCount: todayAppointments.length,
        goals,
      })
  );

  const breakdown = visibleActionQueueItems.reduce<Record<HomeDashboardActionQueueItem["type"], number>>(
    (accumulator, item) => {
      accumulator[item.type] = (accumulator[item.type] ?? 0) + 1;
      return accumulator;
    },
    {
      uncontacted_lead: 0,
      quote_follow_up: 0,
      deposit_due: 0,
      overdue_invoice: 0,
      completed_missing_invoice: 0,
      review_request: 0,
      customer_addon_request: 0,
      reactivation: 0,
      system_issue: 0,
    }
  );

  const staleAt = new Date(now.getTime() + HOME_DASHBOARD_CACHE_TTL_MS).toISOString();
  const snapshot: HomeDashboardSnapshot = {
    generatedAt: now.toISOString(),
    businessId: params.businessId,
    timezone,
    featureFlags: {
      homeDashboardV2: featureEnabled,
    },
    context: {
      role: params.membershipRole ?? null,
      timeOfDay,
    },
    filters: {
      range: selectedRange,
      teamMemberId: selectedTeamMemberId,
    },
    preferences: {
      ...preferences,
      widgetOrder: effectiveLayout.widgetOrder,
      hiddenWidgets: effectiveLayout.hiddenWidgets,
    },
    cache: {
      key: cacheKey,
      tags: dashboardTags,
      hit: false,
      staleAt,
    },
    degraded: Object.keys(widgetErrors).length > 0,
    widgetErrors,
    modulePermissions,
    summaryCards: {
      needsAction: {
        allowed: true,
        total: visibleActionQueueItems.length,
        breakdown,
      },
      today: {
        allowed: modulePermissions.today,
        jobs: modulePermissions.today ? todayAppointments.length : 0,
        dropoffs: modulePermissions.today
          ? todayAppointments.filter((row) => {
              const primaryStart = getAppointmentPrimaryStart(row);
              return primaryStart >= scheduleWindowStart && primaryStart <= scheduleWindowEnd;
            }).length
          : 0,
        pickups: modulePermissions.today
          ? todayAppointments.filter((row) => {
              const primaryEnd = getAppointmentPrimaryEnd(row);
              return primaryEnd >= scheduleWindowStart && primaryEnd <= scheduleWindowEnd;
            }).length
          : 0,
        inShop: modulePermissions.today
          ? todayAppointments.filter((row) => row.vehicleOnSite === true && row.status !== "completed").length
          : 0,
      },
      cash: {
        allowed: modulePermissions.cash,
        collectedToday: modulePermissions.cash ? Number(collectedToday.toFixed(2)) : 0,
        outstandingInvoiceAmount: modulePermissions.cash ? Number(outstandingOpenRevenueAmount.toFixed(2)) : 0,
        overdueInvoiceAmount: modulePermissions.cash ? Number(overdueInvoiceAmount.toFixed(2)) : 0,
        depositsDueAmount: modulePermissions.cash ? Number(depositsDueAmount.toFixed(2)) : 0,
      },
      conversion: {
        allowed: modulePermissions.conversion,
        newLeads: modulePermissions.conversion
          ? activeLeadRows.filter(({ lead }) => lead.status === "new").length
          : 0,
        quoted: modulePermissions.conversion ? quoteRows.filter((row) => row.status === "sent").length : 0,
        booked: modulePermissions.conversion
          ? activeLeadRows.filter(({ lead }) => lead.status === "booked" || lead.status === "converted").length
          : 0,
        conversionRate:
          modulePermissions.conversion && activeLeadRows.length > 0
            ? Math.round(
                (activeLeadRows.filter(({ lead }) => lead.status === "booked" || lead.status === "converted").length /
                  activeLeadRows.length) *
                  100
              )
            : null,
      },
    },
    todaySchedule: {
      allowed: modulePermissions.todaySchedule,
      items: modulePermissions.todaySchedule ? todayScheduleItems : [],
    },
    actionQueue: {
      allowed: modulePermissions.actionQueue,
      items: visibleActionQueueItems,
    },
    quickActions: buildQuickActions(modulePermissions, params.permissions ?? []),
    pipeline: {
      allowed: modulePermissions.pipeline,
      stages: modulePermissions.pipeline ? pipelineStages : [],
    },
    weeklyOverview: {
      allowed: modulePermissions.todaySchedule,
      weekStart: selectedWeekStart.toISOString(),
      weekEnd: selectedWeekEnd.toISOString(),
      selectedDate: selectedBusinessDateKey,
      days: modulePermissions.todaySchedule ? weeklyOverviewDays : [],
    },
    monthlyRevenueChart: {
      allowed: modulePermissions.revenueCollections || modulePermissions.goals || modulePermissions.cash,
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString(),
      totalBookedThisMonth:
        modulePermissions.revenueCollections || modulePermissions.goals || modulePermissions.cash
          ? bookedRevenueThisMonth
          : 0,
      totalCollectedThisMonth:
        modulePermissions.revenueCollections || modulePermissions.goals || modulePermissions.cash
          ? Number(collectedRevenueThisMonth.toFixed(2))
          : 0,
      totalExpensesThisMonth:
        modulePermissions.revenueCollections || modulePermissions.goals || modulePermissions.cash
          ? Number(totalExpensesThisMonth.toFixed(2))
          : 0,
      netThisMonth:
        modulePermissions.revenueCollections || modulePermissions.goals || modulePermissions.cash
          ? Number(netRevenueThisMonth.toFixed(2))
          : 0,
      outstandingInvoiceAmount:
        modulePermissions.revenueCollections || modulePermissions.goals || modulePermissions.cash
          ? Number(outstandingOpenRevenueAmount.toFixed(2))
          : 0,
      percentToGoal: modulePermissions.goals ? goals.percentToGoal : null,
      goalAmount: modulePermissions.goals ? goals.monthlyRevenueGoal : null,
      days:
        modulePermissions.revenueCollections || modulePermissions.goals || modulePermissions.cash
          ? monthlyRevenueDays
          : [],
    },
    bookingsOverview: {
      ...bookingsOverview,
      allowed:
        bookingsOverview.allowed &&
        (modulePermissions.today || modulePermissions.pipeline || modulePermissions.revenueCollections || modulePermissions.conversion),
      funnel: modulePermissions.pipeline ? bookingsOverview.funnel : [],
    },
    revenueCollections,
    recentActivity: {
      allowed: modulePermissions.recentActivity,
      items: modulePermissions.recentActivity ? recentActivityItems : [],
    },
    automations: {
      allowed: modulePermissions.automations,
      remindersSentThisWeek: modulePermissions.automations ? automationStats.remindersSentThisWeek : 0,
      invoiceNudgesSentThisWeek: modulePermissions.automations ? automationStats.invoiceNudgesSentThisWeek : null,
      reviewRequestsSentThisWeek: modulePermissions.automations ? automationStats.reviewRequestsSentThisWeek : 0,
      reactivationMessagesSentThisWeek: modulePermissions.automations ? automationStats.reactivationMessagesSentThisWeek : 0,
      deliverySuccessRate: modulePermissions.automations ? automationStats.deliverySuccessRate : null,
      failedAutomationCount: modulePermissions.automations ? automationStats.failedAutomationCount : 0,
    },
    valueMoments,
    nudges,
    sinceLastChecked,
    businessHealth: {
      allowed: modulePermissions.businessHealth,
      score: modulePermissions.businessHealth ? businessHealth.score : null,
      factors: modulePermissions.businessHealth ? businessHealth.factors : [],
      topIssues: modulePermissions.businessHealth ? businessHealth.topIssues : [],
    },
    goals,
    definitions: {
      weekStartsOn: "sunday",
      uncontactedLead: `Lead record with status "new", no first-contact timestamp, and created more than ${uncontactedLeadHours} hour(s) ago.`,
      quoteFollowUp: `Sent quote without a follow-up timestamp after the business abandoned-quote delay (${quoteFollowUpHours} hour(s)).`,
      depositDue: "Appointment starting in the next 48 hours with a required deposit that is not yet satisfied.",
      overdueInvoice: "Invoice with a positive remaining balance and due date before the current business day.",
      completedMissingInvoice: "Completed appointment with no linked non-void invoice.",
      todayJobs: "Appointments whose effective job span overlaps the current business day.",
      cashCollectedToday: "Successful invoice payments today plus direct appointment payments logged today, net of reversals.",
      bookedRevenueThisWeek:
        "Appointment value scheduled within the current business week plus standalone invoice value created this week, excluding void invoices to avoid double-counting linked work.",
      weeklyOverview:
        "Weekly appointment overview buckets appointments by their operational start day within the selected Sunday-through-Saturday business week and summarizes status, booked value, assigned-capacity usage, and next jobs for each day.",
      monthlyRevenueChart:
        "Monthly revenue chart groups booked revenue by the appointment's operational start day (or standalone invoice creation day) and collected revenue by payment day within the current business month.",
      bookingsOverview:
        "Bookings overview combines booking counts, quotes, ticket value, and deposit pressure from real appointments, quotes, and finance records.",
    },
  };
  if (!params.skipCache) {
    trackHomeDashboardCacheEntry(cacheKey, {
      snapshot,
      expiresAt: now.getTime() + HOME_DASHBOARD_CACHE_TTL_MS,
      tags: dashboardTags,
    });
  }
  logger.info("Home dashboard snapshot generated", {
    businessId: params.businessId,
    userId: params.userId ?? undefined,
    cacheKey,
    degraded: snapshot.degraded,
    widgetErrorCount: Object.keys(widgetErrors).length,
    generatedInMs: Date.now() - startedAt,
    timings,
  });
  return snapshot;
}
