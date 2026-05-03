/**
 * Global actions: getDashboardStats, getCapacityInsights, restoreClient,
 * restoreVehicle, restoreService, unvoidInvoice, reversePayment, retryFailedNotifications.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  clients,
  vehicles,
  services,
  appointments,
  invoices,
  payments,
  expenses,
  activityLogs,
  notificationLogs,
  integrationJobs,
  integrationJobAttempts,
} from "../db/schema.js";
import { eq, and, gte, lte, sql, desc, isNull } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { withIdempotency } from "../lib/idempotency.js";
import * as automations from "../lib/automations.js";
import { retryFailedEmailNotifications } from "../lib/email.js";
import { claimDueIntegrationJobs } from "../lib/integrationJobs.js";
import {
  applyBusinessPreset,
  getAppliedBusinessPresetSummary,
  getPresetSummaryForBusinessType,
} from "../lib/businessPresets.js";
import { businesses } from "../db/schema.js";
import { runQuickBooksIntegrationJob } from "../lib/quickbooks.js";
import { runGoogleCalendarIntegrationJob } from "../lib/googleCalendar.js";
import { runTwilioIntegrationJob } from "../lib/twilio.js";
import { runOutboundWebhookIntegrationJob } from "../lib/integrations.js";
import { parseLeadRecord } from "../lib/leads.js";
import { getAppointmentFinanceSummaryMap } from "../lib/appointmentFinance.js";
import { getHomeDashboardSnapshot, updateHomeDashboardPreferences } from "../lib/homeDashboard.js";
import { calculateAppointmentFinanceTotals } from "../lib/revenueTotals.js";
import { sendDelayedBillingReminderEmails } from "../lib/billingPrompts.js";

export const actionsRouter = Router({ mergeParams: true });

export function toNullableIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "object" && "toISOString" in value && typeof value.toISOString === "function") {
    try {
      const iso = value.toISOString();
      return typeof iso === "string" && iso.trim() ? iso : null;
    } catch {
      return null;
    }
  }
  return null;
}

const homeDashboardSchema = z.object({
  range: z.enum(["today", "week", "month"]).optional(),
  teamMemberId: z.string().uuid().nullable().optional(),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const homeDashboardPreferencesSchema = z.object({
  widgetOrder: z.array(z.enum([
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
  ])).optional(),
  hiddenWidgets: z.array(z.enum([
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
  ])).optional(),
  defaultRange: z.enum(["today", "week", "month"]).nullable().optional(),
  defaultTeamMemberId: z.string().uuid().nullable().optional(),
  dismissQueueItemId: z.string().min(1).nullable().optional(),
  clearDismissQueueItemId: z.string().min(1).nullable().optional(),
  snoozeQueueItemId: z.string().min(1).nullable().optional(),
  snoozeUntil: z.string().datetime().nullable().optional(),
  clearSnoozeQueueItemId: z.string().min(1).nullable().optional(),
  markSeenAt: z.string().datetime().nullable().optional(),
});

type GrowthLeadRecord = {
  id: string;
  createdAt: Date;
  notes: string | null;
};

type GrowthInvoiceRecord = {
  clientId: string | null;
  total: number | string | null;
  paidAt: Date | null;
};

type FinanceInvoiceSnapshot = {
  id: string;
  invoiceNumber: string | null;
  status: string | null;
  total: number | string | null;
  dueDate: Date | null;
  createdAt: Date;
  totalPaid: number | string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
};

type FinancePaymentSnapshot = {
  id: string;
  amount: number | string | null;
  method: string | null;
  paidAt: Date | null;
  invoiceNumber: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
};

export function calculateGrowthMetrics(
  leads: GrowthLeadRecord[],
  paidInvoices: GrowthInvoiceRecord[],
  options: {
    now?: Date;
    periodDays?: number | null;
  } = {}
) {
  const now = options.now ?? new Date();
  const periodDays = typeof options.periodDays === "number" && Number.isFinite(options.periodDays)
    ? Math.max(7, Math.min(Math.round(options.periodDays), 3650))
    : null;
  const cutoff = periodDays ? new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000) : null;

  const allLeadRows = leads.map((lead) => ({
    id: lead.id,
    createdAt: lead.createdAt,
    parsed: parseLeadRecord(lead.notes),
  }));
  const leadRows = cutoff ? allLeadRows.filter((row) => row.createdAt >= cutoff) : allLeadRows;
  const totalLeads = leadRows.filter((row) => row.parsed.source).length;
  const convertedLeadCount = leadRows.filter((row) => row.parsed.status === "converted").length;
  const bookedLeadCount = leadRows.filter((row) => row.parsed.status === "booked" || row.parsed.status === "converted").length;

  const responseHours = leadRows
    .map((row) => {
      if (!row.parsed.firstContactedAt) return null;
      const contactedAt = new Date(row.parsed.firstContactedAt);
      if (Number.isNaN(contactedAt.getTime()) || Number.isNaN(row.createdAt.getTime())) return null;
      return Math.max(0, (contactedAt.getTime() - row.createdAt.getTime()) / (1000 * 60 * 60));
    })
    .filter((value): value is number => value !== null);

  const paidInvoicesInWindow = cutoff
    ? paidInvoices.filter((invoice) => invoice.paidAt && invoice.paidAt >= cutoff)
    : paidInvoices;
  const paidInvoicesWithClient = paidInvoicesInWindow.filter((invoice) => !!invoice.clientId);
  const invoiceCountByClient = new Map<string, number>();
  const revenueByClient = new Map<string, number>();
  let repeatCustomerCount = 0;
  for (const invoice of paidInvoicesWithClient) {
    const clientId = invoice.clientId as string;
    const nextCount = (invoiceCountByClient.get(clientId) ?? 0) + 1;
    invoiceCountByClient.set(clientId, nextCount);
    const total = Number(invoice.total ?? 0);
    revenueByClient.set(
      clientId,
      (revenueByClient.get(clientId) ?? 0) + (Number.isFinite(total) ? total : 0)
    );
  }
  for (const count of invoiceCountByClient.values()) {
    if (count > 1) repeatCustomerCount += 1;
  }
  let returningRevenue = 0;
  let newCustomerRevenue = 0;
  for (const [clientId, totalRevenue] of revenueByClient.entries()) {
    if ((invoiceCountByClient.get(clientId) ?? 0) > 1) {
      returningRevenue += totalRevenue;
    } else {
      newCustomerRevenue += totalRevenue;
    }
  }

  const leadById = new Map(allLeadRows.map((row) => [row.id, row]));
  const sourceStats = new Map<
    string,
    {
      leadCount: number;
      convertedCount: number;
      bookedCount: number;
      responseHours: number[];
      revenue: number;
    }
  >();

  for (const row of leadRows) {
    const source = row.parsed.source || "other";
    const current = sourceStats.get(source) ?? {
      leadCount: 0,
      convertedCount: 0,
      bookedCount: 0,
      responseHours: [],
      revenue: 0,
    };
    current.leadCount += 1;
    if (row.parsed.status === "converted") current.convertedCount += 1;
    if (row.parsed.status === "booked" || row.parsed.status === "converted") current.bookedCount += 1;
    if (row.parsed.firstContactedAt) {
      const contactedAt = new Date(row.parsed.firstContactedAt);
      if (!Number.isNaN(contactedAt.getTime()) && !Number.isNaN(row.createdAt.getTime())) {
        current.responseHours.push(Math.max(0, (contactedAt.getTime() - row.createdAt.getTime()) / (1000 * 60 * 60)));
      }
    }
    sourceStats.set(source, current);
  }

  for (const invoice of paidInvoicesWithClient) {
    const lead = leadById.get(invoice.clientId as string);
    const source = lead?.parsed.source || "other";
    const current = sourceStats.get(source) ?? {
      leadCount: 0,
      convertedCount: 0,
      bookedCount: 0,
      responseHours: [],
      revenue: 0,
    };
    const total = Number(invoice.total ?? 0);
    current.revenue += Number.isFinite(total) ? total : 0;
    sourceStats.set(source, current);
  }

  const attributedRevenue = Array.from(sourceStats.values()).reduce((sum, entry) => sum + entry.revenue, 0);
  const totalPaidRevenue = paidInvoicesWithClient.reduce((sum, invoice) => {
    const total = Number(invoice.total ?? 0);
    return sum + (Number.isFinite(total) ? total : 0);
  }, 0);
  const unattributedRevenue = Math.max(0, totalPaidRevenue - attributedRevenue);

  const weekBuckets = Array.from({ length: 4 }, (_, index) => {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() - end.getDay() - (3 - index) * 7 + 6);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(end.getDate() - 6);
    return {
      key: start.toISOString(),
      label: `${start.toLocaleString("en-US", { month: "short" })} ${start.getDate()}`,
      start,
      end,
      leadCount: 0,
      convertedCount: 0,
      bookedCount: 0,
      responseHours: [] as number[],
    };
  });

  for (const row of leadRows) {
    const bucket = weekBuckets.find((entry) => row.createdAt >= entry.start && row.createdAt <= entry.end);
    if (!bucket) continue;
    bucket.leadCount += 1;
    if (row.parsed.status === "converted") bucket.convertedCount += 1;
    if (row.parsed.status === "booked" || row.parsed.status === "converted") bucket.bookedCount += 1;
    if (row.parsed.firstContactedAt) {
      const contactedAt = new Date(row.parsed.firstContactedAt);
      if (!Number.isNaN(contactedAt.getTime()) && !Number.isNaN(row.createdAt.getTime())) {
        bucket.responseHours.push(Math.max(0, (contactedAt.getTime() - row.createdAt.getTime()) / (1000 * 60 * 60)));
      }
    }
  }

  return {
    periodDays,
    totalLeads,
    convertedLeadCount,
    bookedLeadCount,
    closeRate: totalLeads > 0 ? Math.round((convertedLeadCount / totalLeads) * 100) : 0,
    bookingRate: totalLeads > 0 ? Math.round((bookedLeadCount / totalLeads) * 100) : 0,
    averageFirstResponseHours: responseHours.length
      ? responseHours.reduce((sum, value) => sum + value, 0) / responseHours.length
      : null,
    totalPayingCustomers: invoiceCountByClient.size,
    repeatCustomerCount,
    repeatCustomerRate: invoiceCountByClient.size > 0 ? Math.round((repeatCustomerCount / invoiceCountByClient.size) * 100) : 0,
    attributedRevenue,
    unattributedRevenue,
    returningRevenue,
    newCustomerRevenue,
    recentWeeks: weekBuckets.map((bucket) => ({
      label: bucket.label,
      leadCount: bucket.leadCount,
      convertedCount: bucket.convertedCount,
      bookedCount: bucket.bookedCount,
      closeRate: bucket.leadCount > 0 ? Math.round((bucket.convertedCount / bucket.leadCount) * 100) : 0,
      bookingRate: bucket.leadCount > 0 ? Math.round((bucket.bookedCount / bucket.leadCount) * 100) : 0,
      averageFirstResponseHours: bucket.responseHours.length
        ? bucket.responseHours.reduce((sum, value) => sum + value, 0) / bucket.responseHours.length
        : null,
    })),
    revenueBySource: Array.from(sourceStats.entries())
      .map(([source, stats]) => ({
        source,
        leadCount: stats.leadCount,
        convertedCount: stats.convertedCount,
        bookedCount: stats.bookedCount,
        closeRate: stats.leadCount > 0 ? Math.round((stats.convertedCount / stats.leadCount) * 100) : 0,
        bookingRate: stats.leadCount > 0 ? Math.round((stats.bookedCount / stats.leadCount) * 100) : 0,
        averageFirstResponseHours: stats.responseHours.length
          ? stats.responseHours.reduce((sum, value) => sum + value, 0) / stats.responseHours.length
          : null,
        revenue: stats.revenue,
        shareOfRevenue: attributedRevenue > 0 ? Math.round((stats.revenue / attributedRevenue) * 100) : 0,
      }))
      .sort((left, right) => right.revenue - left.revenue || right.leadCount - left.leadCount)
      .slice(0, 6),
  };
}

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function toMoneyNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const normalized = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(normalized) ? normalized : 0;
}

function getDisplayedStandaloneAppointmentAmount(row: {
  subtotal?: number | string | null;
  taxRate?: number | string | null;
  taxAmount?: number | string | null;
  applyTax?: boolean | null;
  adminFeeRate?: number | string | null;
  adminFeeAmount?: number | string | null;
  applyAdminFee?: boolean | null;
  totalPrice?: number | string | null;
}): number {
  const subtotal = Math.max(0, toMoneyNumber(row.subtotal));
  const storedTotal = Math.max(0, toMoneyNumber(row.totalPrice));
  if (subtotal <= 0) return storedTotal;

  const computed = calculateAppointmentFinanceTotals({
    subtotal,
    taxRate: toMoneyNumber(row.taxRate),
    applyTax: Boolean(row.applyTax),
    adminFeeRate: toMoneyNumber(row.adminFeeRate),
    applyAdminFee: Boolean(row.applyAdminFee),
  });

  const adminFeeAmount =
    row.applyAdminFee === true
      ? row.adminFeeAmount != null
        ? Math.max(0, toMoneyNumber(row.adminFeeAmount))
        : computed.adminFeeAmount
      : 0;
  const taxableSubtotal = subtotal + adminFeeAmount;
  const taxAmount =
    row.applyTax === true
      ? row.taxAmount != null
        ? Math.max(0, toMoneyNumber(row.taxAmount))
        : taxableSubtotal * (toMoneyNumber(row.taxRate) / 100)
      : 0;

  return Math.max(0, Number((subtotal + adminFeeAmount + taxAmount).toFixed(2)));
}

async function listStandaloneAppointmentsForFinance(
  bid: string,
  extraWhere?: ReturnType<typeof and>
) {
  return db
    .select({
      id: appointments.id,
      subtotal: appointments.subtotal,
      taxRate: appointments.taxRate,
      taxAmount: appointments.taxAmount,
      applyTax: appointments.applyTax,
      adminFeeRate: appointments.adminFeeRate,
      adminFeeAmount: appointments.adminFeeAmount,
      applyAdminFee: appointments.applyAdminFee,
      totalPrice: appointments.totalPrice,
      depositAmount: appointments.depositAmount,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, bid),
        sql`${appointments.status} not in ('cancelled', 'no-show')`,
        sql`not exists (
          select 1
          from ${invoices}
          where ${invoices.businessId} = ${bid}
            and ${invoices.appointmentId} = ${appointments.id}
            and ${invoices.status} != 'void'
        )`,
        extraWhere
      )
    );
}

export function getCronExecutionGate(providedSecret: string | undefined) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    return {
      ok: false as const,
      statusCode: 503,
      message: "CRON_SECRET is not configured.",
    };
  }

  if (providedSecret !== configuredSecret) {
    return {
      ok: false as const,
      statusCode: 401,
      message: "Unauthorized",
    };
  }

  return {
    ok: true as const,
  };
}

const idParamSchema = z.object({ id: z.string().uuid() });
function isPaymentSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cause = "cause" in error ? (error as { cause?: unknown }).cause : error;
  if (!cause || typeof cause !== "object") return false;
  const code = "code" in cause ? String((cause as { code?: unknown }).code ?? "") : "";
  const message = "message" in cause ? String((cause as { message?: unknown }).message ?? "") : "";
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes('relation "payments" does not exist') ||
    message.includes('column "reversed_at" does not exist')
  );
}

async function getOpenInvoicePaidTotal(bid: string) {
  try {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('sent', 'partial')`, sql`${payments.reversedAt} is null`));
    return Number(row?.total ?? 0);
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected in dashboard metrics; falling back to legacy payment totals", { businessId: bid, error });
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('sent', 'partial')`));
    return Number(row?.total ?? 0);
  }
}

async function getCollectedInvoiceRevenueTotal(
  bid: string,
  start: Date,
  end: Date
) {
  try {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .innerJoin(appointments, eq(invoices.appointmentId, appointments.id))
      .where(
        and(
          eq(invoices.businessId, bid),
          sql`${invoices.status} != 'void'`,
          sql`${appointments.status} not in ('cancelled', 'no-show')`,
          isNull(payments.reversedAt),
          sql`${appointments.startTime} <= ${end}`,
          sql`coalesce(${appointments.endTime}, ${appointments.startTime}) >= ${start}`
        )
      );
    return Number(row?.total ?? 0);
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected in finance metrics; falling back to legacy invoice paid totals", {
      businessId: bid,
      error,
    });
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
      .from(invoices)
      .innerJoin(appointments, eq(invoices.appointmentId, appointments.id))
      .where(
        and(
          eq(invoices.businessId, bid),
          eq(invoices.status, "paid"),
          sql`${invoices.status} != 'void'`,
          sql`${appointments.status} not in ('cancelled', 'no-show')`,
          sql`${appointments.startTime} <= ${end}`,
          sql`coalesce(${appointments.endTime}, ${appointments.startTime}) >= ${start}`
        )
      );
    return Number(row?.total ?? 0);
  }
}

async function getStandaloneAppointmentRevenueTotal(
  bid: string,
  start: Date,
  end: Date
) {
  const standaloneAppointments = await listStandaloneAppointmentsForFinance(
    bid,
    and(
      sql`${appointments.startTime} <= ${end}`,
      sql`coalesce(${appointments.endTime}, ${appointments.startTime}) >= ${start}`
    )
  );
  const financeByAppointment = await getAppointmentFinanceSummaryMap(
    bid,
    standaloneAppointments.map((appointment) => ({
      id: appointment.id,
      totalPrice: getDisplayedStandaloneAppointmentAmount(appointment),
      depositAmount: appointment.depositAmount,
      paidAt: null,
    }))
  );
  return standaloneAppointments.reduce((sum, appointment) => {
    const collectedAmount = financeByAppointment.get(appointment.id)?.collectedAmount ?? 0;
    return sum + collectedAmount;
  }, 0);
}

async function getStandaloneAppointmentAwaitingCollectionTotal(bid: string) {
  const standaloneAppointments = await listStandaloneAppointmentsForFinance(bid);
  const financeByAppointment = await getAppointmentFinanceSummaryMap(
    bid,
    standaloneAppointments.map((appointment) => ({
      id: appointment.id,
      totalPrice: getDisplayedStandaloneAppointmentAmount(appointment),
      depositAmount: appointment.depositAmount,
      paidAt: null,
    }))
  );
  return standaloneAppointments.reduce((sum, appointment) => {
    const balanceDue =
      financeByAppointment.get(appointment.id)?.balanceDue ?? Math.max(0, getDisplayedStandaloneAppointmentAmount(appointment));
    return sum + balanceDue;
  }, 0);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatFinanceMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function getFinanceClientName(firstName: string | null, lastName: string | null) {
  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return fullName || "Walk-in";
}

function getInvoiceMoneyTotal(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getInvoiceBalanceDue(total: number | string | null | undefined, totalPaid: number | string | null | undefined) {
  return Math.max(0, getInvoiceMoneyTotal(total) - getInvoiceMoneyTotal(totalPaid));
}

export function normalizeFinanceInvoiceStatus(
  invoice: Pick<FinanceInvoiceSnapshot, "status" | "dueDate" | "total" | "totalPaid">,
  referenceDate: Date = new Date()
) {
  const totalAmount = getInvoiceMoneyTotal(invoice.total);
  const totalPaid = getInvoiceMoneyTotal(invoice.totalPaid);
  const balanceDue = Math.max(0, totalAmount - totalPaid);
  if (balanceDue <= 0.009 || invoice.status === "paid") return "paid" as const;
  if (invoice.status === "draft") return "draft" as const;
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
  if (dueDate) {
    const today = startOfDay(referenceDate);
    if (dueDate < today) return "overdue" as const;
  }
  if (totalPaid > 0.009 || invoice.status === "partial") return "partial" as const;
  return "sent" as const;
}

export function calculateFinanceCollectionRate(collectedAmount: number, grossRevenue: number) {
  if (!Number.isFinite(collectedAmount) || !Number.isFinite(grossRevenue) || grossRevenue <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Math.min(collectedAmount, grossRevenue) / grossRevenue) * 100)));
}

function buildFinanceMonthBuckets(now: Date, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1, 0, 0, 0, 0);
    return {
      key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
      label: formatFinanceMonthLabel(monthDate),
      start: startOfMonth(monthDate),
      end: endOfMonth(monthDate),
    };
  });
}

async function getInvoiceCollectedRevenueByPaidAt(
  bid: string,
  start: Date,
  end: Date
) {
  try {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(
        and(
          eq(invoices.businessId, bid),
          sql`${invoices.status} != 'void'`,
          isNull(payments.reversedAt),
          gte(payments.paidAt, start),
          lte(payments.paidAt, end)
        )
      );
    return Number(row?.total ?? 0);
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected in finance dashboard collected totals; falling back to paid invoice totals", {
      businessId: bid,
      error,
    });
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.businessId, bid),
          eq(invoices.status, "paid"),
          sql`${invoices.status} != 'void'`,
          gte(sql`coalesce(${invoices.paidAt}, ${invoices.updatedAt})`, start),
          lte(sql`coalesce(${invoices.paidAt}, ${invoices.updatedAt})`, end)
        )
      );
    return Number(row?.total ?? 0);
  }
}

async function getStandaloneAppointmentCollectedRevenueByUpdatedAt(
  bid: string,
  start: Date,
  end: Date
) {
  const standaloneAppointments = await listStandaloneAppointmentsForFinance(
    bid,
    and(gte(appointments.updatedAt, start), lte(appointments.updatedAt, end))
  );
  const financeByAppointment = await getAppointmentFinanceSummaryMap(
    bid,
    standaloneAppointments.map((appointment) => ({
      id: appointment.id,
      totalPrice: getDisplayedStandaloneAppointmentAmount(appointment),
      depositAmount: appointment.depositAmount,
      paidAt: null,
    }))
  );
  return standaloneAppointments.reduce((sum, appointment) => {
    const collectedAmount = financeByAppointment.get(appointment.id)?.collectedAmount ?? 0;
    return sum + collectedAmount;
  }, 0);
}

async function getIssuedInvoiceRevenueByCreatedAt(
  bid: string,
  start: Date,
  end: Date
) {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, bid),
        sql`${invoices.status} != 'void'`,
        sql`${invoices.status} != 'draft'`,
        gte(invoices.createdAt, start),
        lte(invoices.createdAt, end)
      )
    );
  return Number(row?.total ?? 0);
}

async function getExpenseTotalForRange(bid: string, start: Date, end: Date) {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(eq(expenses.businessId, bid), gte(expenses.expenseDate, start), lte(expenses.expenseDate, end)));
  return Number(row?.total ?? 0);
}

async function listFinanceInvoiceSnapshots(bid: string): Promise<FinanceInvoiceSnapshot[]> {
  const paymentTotals = db
    .select({
      invoiceId: payments.invoiceId,
      totalPaid: sql<string>`coalesce(sum(case when ${payments.reversedAt} is null then ${payments.amount} else 0 end), 0)`.as("total_paid"),
    })
    .from(payments)
    .groupBy(payments.invoiceId)
    .as("payment_totals");

  const paymentTotalsLegacy = db
    .select({
      invoiceId: payments.invoiceId,
      totalPaid: sql<string>`coalesce(sum(${payments.amount}), 0)`.as("total_paid"),
    })
    .from(payments)
    .groupBy(payments.invoiceId)
    .as("payment_totals_legacy");

  try {
    return await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        total: invoices.total,
        dueDate: invoices.dueDate,
        createdAt: invoices.createdAt,
        totalPaid: sql<string>`coalesce(${paymentTotals.totalPaid}, 0)`,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
      })
      .from(invoices)
      .leftJoin(clients, and(eq(invoices.clientId, clients.id), eq(clients.businessId, bid)))
      .leftJoin(paymentTotals, eq(paymentTotals.invoiceId, invoices.id))
      .where(and(eq(invoices.businessId, bid), sql`${invoices.status} != 'void'`))
      .orderBy(desc(invoices.createdAt));
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected in finance dashboard invoice snapshots; falling back to legacy invoice metrics", {
      businessId: bid,
      error,
    });
    return await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        total: invoices.total,
        dueDate: invoices.dueDate,
        createdAt: invoices.createdAt,
        totalPaid: sql<string>`coalesce(${paymentTotalsLegacy.totalPaid}, 0)`,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
      })
      .from(invoices)
      .leftJoin(clients, and(eq(invoices.clientId, clients.id), eq(clients.businessId, bid)))
      .leftJoin(paymentTotalsLegacy, eq(paymentTotalsLegacy.invoiceId, invoices.id))
      .where(and(eq(invoices.businessId, bid), sql`${invoices.status} != 'void'`))
      .orderBy(desc(invoices.createdAt));
  }
}

async function listRecentFinancePayments(bid: string, limit: number): Promise<FinancePaymentSnapshot[]> {
  try {
    return await db
      .select({
        id: payments.id,
        amount: payments.amount,
        method: payments.method,
        paidAt: payments.paidAt,
        invoiceNumber: invoices.invoiceNumber,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
      })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .leftJoin(clients, and(eq(invoices.clientId, clients.id), eq(clients.businessId, bid)))
      .where(and(eq(invoices.businessId, bid), sql`${invoices.status} != 'void'`, isNull(payments.reversedAt)))
      .orderBy(desc(payments.paidAt), desc(payments.createdAt))
      .limit(limit);
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected in finance dashboard recent payments; falling back to legacy payment selection", {
      businessId: bid,
      error,
    });
    return await db
      .select({
        id: payments.id,
        amount: payments.amount,
        method: payments.method,
        paidAt: payments.paidAt,
        invoiceNumber: invoices.invoiceNumber,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
      })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .leftJoin(clients, and(eq(invoices.clientId, clients.id), eq(clients.businessId, bid)))
      .where(and(eq(invoices.businessId, bid), sql`${invoices.status} != 'void'`))
      .orderBy(desc(payments.paidAt), desc(payments.createdAt))
      .limit(limit);
  }
}

actionsRouter.post("/getDashboardStats", requireAuth, requireTenant, requirePermission("dashboard.view"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const startOfTime = new Date("1970-01-01T00:00:00.000Z");
  const endOfTime = new Date("9999-12-31T23:59:59.999Z");

  const [
    apptCountWeek,
    collectedRevenueTotal,
    clientCount,
    todayAppts,
    todayCollectedInvoiceRevenue,
    monthCollectedInvoiceRevenue,
    standaloneTodayRevenue,
    standaloneMonthRevenue,
    standaloneRevenueTotal,
    openInvoicesRows,
    openInvoicesTotalRows,
    standaloneAwaitingCollection,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(appointments).where(and(eq(appointments.businessId, bid), gte(appointments.startTime, startOfWeek))),
    getCollectedInvoiceRevenueTotal(bid, startOfTime, endOfTime),
    db.select({ count: sql<number>`count(*)::int` }).from(clients).where(and(eq(clients.businessId, bid), isNull(clients.deletedAt))),
    db.select({ count: sql<number>`count(*)::int` }).from(appointments).where(and(eq(appointments.businessId, bid), gte(appointments.startTime, startOfToday), lte(appointments.startTime, endOfToday), sql`${appointments.status} not in ('cancelled', 'no-show')`)),
    getCollectedInvoiceRevenueTotal(bid, startOfToday, endOfToday),
    getCollectedInvoiceRevenueTotal(bid, startOfMonth, endOfMonth),
    getStandaloneAppointmentRevenueTotal(bid, startOfToday, endOfToday),
    getStandaloneAppointmentRevenueTotal(bid, startOfMonth, endOfMonth),
    getStandaloneAppointmentRevenueTotal(bid, startOfTime, endOfTime),
    db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('draft', 'sent', 'partial')`)),
    db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('sent', 'partial')`)),
    getStandaloneAppointmentAwaitingCollectionTotal(bid),
  ]);
  const openPaid = await getOpenInvoicePaidTotal(bid);

  const openTotal = Number(openInvoicesTotalRows[0]?.total ?? 0);
  const outstandingBalance = Math.max(0, openTotal - openPaid) + standaloneAwaitingCollection;

  res.json({
    appointmentsThisWeek: apptCountWeek[0]?.count ?? 0,
    revenueTotal: collectedRevenueTotal + standaloneRevenueTotal,
    totalClients: clientCount[0]?.count ?? 0,
    todayRevenue: todayCollectedInvoiceRevenue + standaloneTodayRevenue,
    revenueThisMonth: monthCollectedInvoiceRevenue + standaloneMonthRevenue,
    openInvoicesCount: openInvoicesRows[0]?.count ?? 0,
    outstandingBalance,
    todayAppointmentsCount: todayAppts[0]?.count ?? 0,
    todayBookedHours: 0,
    totalAvailableHours: 8,
    repeatCustomerRate: 0,
    weeklyRevenue: [],
  });
});

actionsRouter.post("/getHomeDashboard", requireAuth, requireTenant, requirePermission("dashboard.view"), async (req: Request, res: Response) => {
  const parsed = homeDashboardSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid dashboard filters" });
  }
  const snapshot = await getHomeDashboardSnapshot({
    businessId: businessId(req),
    userId: req.userId ?? null,
    membershipRole: req.membershipRole ?? null,
    permissions: req.permissions ?? [],
    range: parsed.data.range,
    teamMemberId: parsed.data.teamMemberId ?? null,
    weekStartDate: parsed.data.weekStartDate ?? null,
  });
  return res.json(snapshot);
});

actionsRouter.post("/updateHomeDashboardPreferences", requireAuth, requireTenant, requirePermission("dashboard.view"), async (req: Request, res: Response) => {
  const parsed = homeDashboardPreferencesSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid dashboard preferences" });
  }
  if (!req.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const preferences = await updateHomeDashboardPreferences({
    businessId: businessId(req),
    userId: req.userId,
    widgetOrder: parsed.data.widgetOrder,
    hiddenWidgets: parsed.data.hiddenWidgets,
    defaultRange: parsed.data.defaultRange,
    defaultTeamMemberId: parsed.data.defaultTeamMemberId,
    dismissQueueItemId: parsed.data.dismissQueueItemId ?? null,
    clearDismissQueueItemId: parsed.data.clearDismissQueueItemId ?? null,
    snoozeQueueItemId: parsed.data.snoozeQueueItemId ?? null,
    snoozeUntil: parsed.data.snoozeUntil ? new Date(parsed.data.snoozeUntil) : null,
    clearSnoozeQueueItemId: parsed.data.clearSnoozeQueueItemId ?? null,
    markSeenAt: parsed.data.markSeenAt ? new Date(parsed.data.markSeenAt) : null,
  });
  return res.json({ preferences });
});

actionsRouter.post("/getCapacityInsights", requireAuth, requireTenant, requirePermission("dashboard.view"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  const list = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.businessId, bid), gte(appointments.startTime, startOfWeek), lte(appointments.startTime, endOfWeek)))
    .orderBy(desc(appointments.startTime))
    .limit(100);
  res.json({ appointments: list, capacity: [] });
});

// Used by the frontend Invoices page to render month KPIs.
actionsRouter.post("/getInvoiceMetrics", requireAuth, requireTenant, requirePermission("invoices.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [openTotals, revenueMonthRows, invoicesCreatedRows] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('draft', 'sent', 'partial')`)),
    db
      .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.businessId, bid),
          eq(invoices.status, "paid"),
          gte(invoices.paidAt ?? invoices.updatedAt, startOfMonth),
          lte(invoices.paidAt ?? invoices.updatedAt, endOfMonth)
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(and(eq(invoices.businessId, bid), gte(invoices.createdAt, startOfMonth), lte(invoices.createdAt, endOfMonth))),
  ]);
  const openPaid = await getOpenInvoicePaidTotal(bid);

  const openTotal = Number(openTotals[0]?.total ?? 0);
  const outstandingBalance = Math.max(0, openTotal - openPaid);

  const revenueThisMonth = Number(revenueMonthRows[0]?.total ?? 0);
  const invoicesThisMonth = invoicesCreatedRows[0]?.count ?? 0;

  res.json({
    revenueThisMonth,
    outstandingBalance,
    invoicesThisMonth,
  });
});

actionsRouter.post("/getFinanceMetrics", requireAuth, requireTenant, requirePermission("payments.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const params = z
    .object({
      rangeStart: z.coerce.date().optional(),
      rangeEnd: z.coerce.date().optional(),
    })
    .parse(req.body ?? {});
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const defaultStartOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const defaultEndOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const rangeStart = params.rangeStart ?? defaultStartOfMonth;
  const rangeEnd = params.rangeEnd ?? defaultEndOfMonth;

  const [
    todayCollectedInvoiceRevenue,
    rangeCollectedInvoiceRevenue,
    standaloneTodayRevenue,
    standaloneRangeRevenue,
    openTotals,
    standaloneAwaitingCollection,
    expenseMonthRows,
    expenseTodayRows,
    expenseCountRows,
  ] = await Promise.all([
    getCollectedInvoiceRevenueTotal(bid, startOfToday, endOfToday),
    getCollectedInvoiceRevenueTotal(bid, rangeStart, rangeEnd),
    getStandaloneAppointmentRevenueTotal(bid, startOfToday, endOfToday),
    getStandaloneAppointmentRevenueTotal(bid, rangeStart, rangeEnd),
    db
      .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('draft', 'sent', 'partial')`)),
    getStandaloneAppointmentAwaitingCollectionTotal(bid),
    db
      .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(eq(expenses.businessId, bid), gte(expenses.expenseDate, rangeStart), lte(expenses.expenseDate, rangeEnd))),
    db
      .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(eq(expenses.businessId, bid), gte(expenses.expenseDate, startOfToday), lte(expenses.expenseDate, endOfToday))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(eq(expenses.businessId, bid), gte(expenses.expenseDate, rangeStart), lte(expenses.expenseDate, rangeEnd))),
  ]);

  const openPaid = await getOpenInvoicePaidTotal(bid);
  const openTotal = Number(openTotals[0]?.total ?? 0);
  const outstandingBalance = Math.max(0, openTotal - openPaid) + standaloneAwaitingCollection;
  const todayRevenue = todayCollectedInvoiceRevenue + standaloneTodayRevenue;
  const revenueThisMonth = rangeCollectedInvoiceRevenue + standaloneRangeRevenue;
  const expensesThisMonth = Number(expenseMonthRows[0]?.total ?? 0);

  res.json({
    todayRevenue,
    revenueThisMonth,
    outstandingBalance,
    expensesToday: Number(expenseTodayRows[0]?.total ?? 0),
    expensesThisMonth,
    netThisMonth: revenueThisMonth - expensesThisMonth,
    expenseCountThisMonth: expenseCountRows[0]?.count ?? 0,
  });
});

actionsRouter.post("/getFinanceDashboard", requireAuth, requireTenant, requirePermission("payments.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const params = z
    .object({
      paymentLimit: z.coerce.number().int().min(1).max(20).optional(),
      invoiceLimit: z.coerce.number().int().min(20).max(250).optional(),
      monthCount: z.coerce.number().int().min(3).max(12).optional(),
    })
    .parse(req.body ?? {});

  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthBuckets = buildFinanceMonthBuckets(now, params.monthCount ?? 6);

  const [
    invoiceSnapshots,
    recentPayments,
    monthIssuedRevenue,
    monthCollectedInvoiceRevenue,
    monthStandaloneCollectedRevenue,
    monthExpenses,
    standaloneAwaitingCollection,
    trendRows,
  ] = await Promise.all([
    listFinanceInvoiceSnapshots(bid),
    listRecentFinancePayments(bid, params.paymentLimit ?? 8),
    getIssuedInvoiceRevenueByCreatedAt(bid, monthStart, monthEnd),
    getInvoiceCollectedRevenueByPaidAt(bid, monthStart, monthEnd),
    getStandaloneAppointmentCollectedRevenueByUpdatedAt(bid, monthStart, monthEnd),
    getExpenseTotalForRange(bid, monthStart, monthEnd),
    getStandaloneAppointmentAwaitingCollectionTotal(bid),
    Promise.all(
      monthBuckets.map(async (bucket) => ({
        key: bucket.key,
        label: bucket.label,
        invoiced: await getIssuedInvoiceRevenueByCreatedAt(bid, bucket.start, bucket.end),
        collected:
          (await getInvoiceCollectedRevenueByPaidAt(bid, bucket.start, bucket.end)) +
          (await getStandaloneAppointmentCollectedRevenueByUpdatedAt(bid, bucket.start, bucket.end)),
        expenses: await getExpenseTotalForRange(bid, bucket.start, bucket.end),
      }))
    ),
  ]);

  const normalizedInvoices = invoiceSnapshots.map((invoice) => {
    const totalAmount = getInvoiceMoneyTotal(invoice.total);
    const amountPaid = getInvoiceMoneyTotal(invoice.totalPaid);
    const balanceDue = getInvoiceBalanceDue(invoice.total, invoice.totalPaid);
    const normalizedStatus = normalizeFinanceInvoiceStatus(invoice, now);
    return {
      id: invoice.id,
      clientName: getFinanceClientName(invoice.clientFirstName, invoice.clientLastName),
      invoiceNumber: invoice.invoiceNumber ?? "Draft",
      totalAmount,
      amountPaid,
      balanceDue,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
      status: normalizedStatus,
      createdAt: invoice.createdAt.toISOString(),
      isCurrentMonth: invoice.createdAt >= monthStart && invoice.createdAt <= monthEnd,
    };
  });

  const issuedCurrentMonthInvoices = normalizedInvoices.filter(
    (invoice) => invoice.isCurrentMonth && invoice.status !== "draft"
  );
  const grossRevenue = monthIssuedRevenue;
  const moneyCollected = monthCollectedInvoiceRevenue + monthStandaloneCollectedRevenue;
  const collectedAgainstCurrentMonthIssued = issuedCurrentMonthInvoices.reduce(
    (sum, invoice) => sum + Math.min(invoice.amountPaid, invoice.totalAmount),
    0
  );
  const invoiceAwaitingPayment = normalizedInvoices
    .filter((invoice) => invoice.status === "sent" || invoice.status === "partial" || invoice.status === "overdue")
    .reduce((sum, invoice) => sum + invoice.balanceDue, 0);
  const overdueInvoices = normalizedInvoices.filter((invoice) => invoice.status === "overdue");
  const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + invoice.balanceDue, 0);
  const awaitingPayment = invoiceAwaitingPayment + standaloneAwaitingCollection;

  const statusBuckets = (["draft", "sent", "partial", "paid", "overdue"] as const).map((status) => {
    const matching = normalizedInvoices.filter((invoice) => invoice.status === status);
    return {
      status,
      count: matching.length,
      totalAmount: matching.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    };
  });

  const invoicePriority = {
    overdue: 0,
    partial: 1,
    sent: 2,
    draft: 3,
    paid: 4,
  } as const;

  const invoiceRows = [...normalizedInvoices]
    .sort((left, right) => {
      const priorityDiff = invoicePriority[left.status] - invoicePriority[right.status];
      if (priorityDiff !== 0) return priorityDiff;
      if (left.dueDate && right.dueDate) return new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime();
      if (left.dueDate) return -1;
      if (right.dueDate) return 1;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })
    .slice(0, params.invoiceLimit ?? 150);

  res.json({
    kpis: {
      grossRevenue,
      moneyCollected,
      awaitingPayment,
      overdueInvoices: overdueAmount,
      overdueInvoiceCount: overdueInvoices.length,
      expenses: monthExpenses,
      netProfit: moneyCollected - monthExpenses,
      projectedNetProfit: grossRevenue - monthExpenses,
      collectionRate: calculateFinanceCollectionRate(collectedAgainstCurrentMonthIssued, grossRevenue),
    },
    statusBuckets,
    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      clientName: getFinanceClientName(payment.clientFirstName, payment.clientLastName),
      invoiceNumber: payment.invoiceNumber ?? "Invoice",
      amount: getInvoiceMoneyTotal(payment.amount),
      method: payment.method ?? "other",
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    })),
    invoiceRows,
    trend: trendRows,
    generatedAt: now.toISOString(),
    referenceDate: todayStart.toISOString(),
  });
});

actionsRouter.post("/getGrowthMetrics", requireAuth, requireTenant, requirePermission("dashboard.view"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const params = z
    .object({
      periodDays: z.coerce.number().int().min(7).max(3650).nullable().optional(),
    })
    .parse(req.body ?? {});
  const [leadRows, paidInvoiceRows] = await Promise.all([
    db
      .select({
        id: clients.id,
        createdAt: clients.createdAt,
        notes: clients.notes,
      })
      .from(clients)
      .where(and(eq(clients.businessId, bid), isNull(clients.deletedAt))),
    db
      .select({
        clientId: invoices.clientId,
        total: invoices.total,
        paidAt: sql<Date | null>`coalesce(${invoices.paidAt}, ${invoices.updatedAt})`.as("paid_at"),
      })
      .from(invoices)
      .where(and(eq(invoices.businessId, bid), eq(invoices.status, "paid"), sql`${invoices.clientId} is not null`)),
  ]);

  res.json(calculateGrowthMetrics(leadRows, paidInvoiceRows, { periodDays: params.periodDays ?? null }));
});

actionsRouter.post("/getAutomationSummary", requireAuth, requireTenant, requirePermission("settings.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const recentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const activityRows = await db
    .select({
      action: sql<string>`${activityLogs.action}`.as("action"),
      total: sql<number>`count(*)::int`.as("total"),
      lastSentAt: sql<Date | null>`max(${activityLogs.createdAt})`.as("last_sent_at"),
    })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, bid),
        gte(activityLogs.createdAt, recentCutoff),
        sql`${activityLogs.action} in (
          'automation.uncontacted_lead.sent',
          'automation.uncontacted_lead.skipped',
          'automation.appointment_reminder.sent',
          'automation.appointment_reminder.skipped',
          'automation.abandoned_quote.sent',
          'automation.abandoned_quote.skipped',
          'automation.review_request.sent',
          'automation.review_request.skipped',
          'automation.lapsed_client.sent'
          ,
          'automation.lapsed_client.skipped'
        )`
      )
    )
    .groupBy(activityLogs.action);

  const notificationRows = await db
    .select({
      templateSlug: sql<string>`coalesce(${notificationLogs.metadata}::json->>'templateSlug', '')`.as("template_slug"),
      failedLast30Days: sql<number>`count(*)::int`.as("failed_last_30_days"),
      lastFailedAt: sql<Date | null>`max(${notificationLogs.sentAt})`.as("last_failed_at"),
    })
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.businessId, bid),
        gte(notificationLogs.sentAt, recentCutoff),
        sql`${notificationLogs.error} is not null`,
        sql`coalesce(${notificationLogs.metadata}::json->>'templateSlug', '') in (
          'lead_follow_up_alert',
          'appointment_reminder',
          'quote_follow_up',
          'review_request',
          'lapsed_client_reengagement'
        )`
      )
    )
    .groupBy(sql`coalesce(${notificationLogs.metadata}::json->>'templateSlug', '')`);

  const summaryMap = new Map(activityRows.map((row) => [row.action, row]));
  const notificationMap = new Map(notificationRows.map((row) => [row.templateSlug, row]));
  const summarize = (action: string, templateSlug: string) => {
    const row = summaryMap.get(action);
    const skippedRow = summaryMap.get(action.replace(".sent", ".skipped"));
    const notificationRow = notificationMap.get(templateSlug);
    return {
      sentLast30Days: row?.total ?? 0,
      lastSentAt: toNullableIsoString(row?.lastSentAt),
      skippedLast30Days: skippedRow?.total ?? 0,
      lastSkippedAt: toNullableIsoString(skippedRow?.lastSentAt),
      failedLast30Days: notificationRow?.failedLast30Days ?? 0,
      lastFailedAt: toNullableIsoString(notificationRow?.lastFailedAt),
    };
  };

  res.json({
    uncontactedLeads: summarize("automation.uncontacted_lead.sent", "lead_follow_up_alert"),
    appointmentReminders: summarize("automation.appointment_reminder.sent", "appointment_reminder"),
    abandonedQuotes: summarize("automation.abandoned_quote.sent", "quote_follow_up"),
    reviewRequests: summarize("automation.review_request.sent", "review_request"),
    lapsedClients: summarize("automation.lapsed_client.sent", "lapsed_client_reengagement"),
  });
});

actionsRouter.post("/getAutomationFeed", requireAuth, requireTenant, requirePermission("settings.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const limit = Math.min(Math.max(Number(req.body?.limit ?? 20), 1), 50);

  const [activityRows, failureRows] = await Promise.all([
    db
      .select({
        id: activityLogs.id,
        action: activityLogs.action,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        metadata: activityLogs.metadata,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(
        and(
        eq(activityLogs.businessId, bid),
        sql`${activityLogs.action} in (
          'automation.uncontacted_lead.sent',
          'automation.uncontacted_lead.skipped',
          'automation.appointment_reminder.sent',
          'automation.appointment_reminder.skipped',
          'automation.abandoned_quote.sent',
          'automation.abandoned_quote.skipped',
          'automation.review_request.sent',
          'automation.review_request.skipped',
          'automation.lapsed_client.sent'
          ,
          'automation.lapsed_client.skipped'
        )`
      )
    )
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit),
    db
      .select({
        id: notificationLogs.id,
        channel: notificationLogs.channel,
        recipient: notificationLogs.recipient,
        error: notificationLogs.error,
        metadata: notificationLogs.metadata,
        sentAt: notificationLogs.sentAt,
      })
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.businessId, bid),
          sql`${notificationLogs.error} is not null`,
          sql`coalesce(${notificationLogs.metadata}::json->>'templateSlug', '') in (
            'lead_follow_up_alert',
            'appointment_reminder',
            'quote_follow_up',
            'review_request',
            'lapsed_client_reengagement'
          )`
        )
      )
      .orderBy(desc(notificationLogs.sentAt))
      .limit(limit),
  ]);

  const sentFeed = activityRows.map((row) => {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
    } catch {
      metadata = {};
    }

    const automationType =
      row.action === "automation.appointment_reminder.sent"
        ? "appointment_reminder"
        : row.action === "automation.appointment_reminder.skipped"
          ? "appointment_reminder"
          : row.action === "automation.abandoned_quote.sent"
            ? "abandoned_quote"
            : row.action === "automation.abandoned_quote.skipped"
              ? "abandoned_quote"
          : row.action === "automation.uncontacted_lead.sent"
            ? "uncontacted_lead"
            : row.action === "automation.uncontacted_lead.skipped"
              ? "uncontacted_lead"
          : row.action === "automation.review_request.sent"
          ? "review_request"
          : row.action === "automation.review_request.skipped"
            ? "review_request"
            : "lapsed_client";

    const skipReason =
      typeof metadata.reason === "string"
        ? metadata.reason
            .replace(/_/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase())
        : "Conditions were not met";

    return {
      id: row.id,
      kind: row.action.endsWith(".skipped") ? ("skipped" as const) : ("sent" as const),
      automationType,
      channel: "email" as const,
      recipient: typeof metadata.sentTo === "string" ? metadata.sentTo : null,
      entityType: row.entityType ?? null,
      entityId: row.entityId ?? null,
      createdAt: row.createdAt.toISOString(),
      message:
        row.action.endsWith(".skipped")
          ? automationType === "appointment_reminder"
            ? `Appointment reminder skipped: ${skipReason}.`
            : automationType === "abandoned_quote"
              ? `Abandoned quote follow-up skipped: ${skipReason}.`
            : automationType === "uncontacted_lead"
              ? `Uncontacted lead follow-up skipped: ${skipReason}.`
            : automationType === "review_request"
              ? `Review request skipped: ${skipReason}.`
              : `Lapsed client outreach skipped: ${skipReason}.`
          : automationType === "appointment_reminder"
            ? "Appointment reminder sent."
            : automationType === "abandoned_quote"
              ? "Abandoned quote follow-up sent."
            : automationType === "uncontacted_lead"
              ? "Uncontacted lead follow-up alert sent."
            : automationType === "review_request"
              ? "Review request sent."
              : "Lapsed client outreach sent.",
    };
  });

  const failedFeed = failureRows.map((row) => {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
    } catch {
      metadata = {};
    }

    const templateSlug = typeof metadata.templateSlug === "string" ? metadata.templateSlug : "";
    const automationType =
      templateSlug === "lead_follow_up_alert"
        ? "uncontacted_lead"
        : templateSlug === "appointment_reminder"
        ? "appointment_reminder"
        : templateSlug === "quote_follow_up"
          ? "abandoned_quote"
        : templateSlug === "review_request"
          ? "review_request"
          : "lapsed_client";

    return {
      id: row.id,
      kind: "failed" as const,
      automationType,
      channel: row.channel === "sms" ? ("sms" as const) : ("email" as const),
      recipient: row.recipient ?? null,
      entityType: typeof metadata.entityType === "string" ? metadata.entityType : null,
      entityId: typeof metadata.entityId === "string" ? metadata.entityId : null,
      createdAt: row.sentAt.toISOString(),
      message: row.error ?? "Automation delivery failed.",
    };
  });

  const records = [...sentFeed, ...failedFeed]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit);

  res.json({ records });
});

actionsRouter.post("/getWorkerHealth", requireAuth, requireTenant, requirePermission("settings.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [automationActivityRows, automationFailureRows, integrationQueueRows, integrationAttemptRows] = await Promise.all([
    db
      .select({
        totalSent: sql<number>`count(*) filter (where ${activityLogs.action} in (
          'automation.uncontacted_lead.sent',
          'automation.appointment_reminder.sent',
          'automation.abandoned_quote.sent',
          'automation.review_request.sent',
          'automation.lapsed_client.sent'
        ))::int`.as("total_sent"),
        totalSkipped: sql<number>`count(*) filter (where ${activityLogs.action} in (
          'automation.uncontacted_lead.skipped',
          'automation.appointment_reminder.skipped',
          'automation.abandoned_quote.skipped',
          'automation.review_request.skipped',
          'automation.lapsed_client.skipped'
        ))::int`.as("total_skipped"),
        lastActivityAt: sql<Date | null>`max(${activityLogs.createdAt})`.as("last_activity_at"),
        lastSkippedAt: sql<Date | null>`max(${activityLogs.createdAt}) filter (where ${activityLogs.action} in (
          'automation.uncontacted_lead.skipped',
          'automation.appointment_reminder.skipped',
          'automation.abandoned_quote.skipped',
          'automation.review_request.skipped',
          'automation.lapsed_client.skipped'
        ))`.as("last_skipped_at"),
      })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.businessId, bid),
          gte(activityLogs.createdAt, recentCutoff),
        sql`${activityLogs.action} in (
          'automation.uncontacted_lead.sent',
          'automation.uncontacted_lead.skipped',
          'automation.appointment_reminder.sent',
          'automation.appointment_reminder.skipped',
          'automation.abandoned_quote.sent',
          'automation.abandoned_quote.skipped',
          'automation.review_request.sent',
            'automation.review_request.skipped',
            'automation.lapsed_client.sent'
            ,
            'automation.lapsed_client.skipped'
          )`
        )
      ),
    db
      .select({
        total: sql<number>`count(*)::int`.as("total"),
        lastFailureAt: sql<Date | null>`max(${notificationLogs.sentAt})`.as("last_failure_at"),
      })
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.businessId, bid),
          gte(notificationLogs.sentAt, recentCutoff),
          sql`${notificationLogs.error} is not null`,
        sql`coalesce(${notificationLogs.metadata}::json->>'templateSlug', '') in (
          'lead_follow_up_alert',
          'appointment_reminder',
          'quote_follow_up',
          'review_request',
          'lapsed_client_reengagement'
          )`
        )
      ),
    db
      .select({
        pendingJobs: sql<number>`count(*) filter (where ${integrationJobs.status} = 'pending')::int`.as("pending_jobs"),
        processingJobs: sql<number>`count(*) filter (where ${integrationJobs.status} = 'processing')::int`.as("processing_jobs"),
        failedJobs: sql<number>`count(*) filter (where ${integrationJobs.status} = 'failed')::int`.as("failed_jobs"),
        deadLetterJobs: sql<number>`count(*) filter (where ${integrationJobs.status} = 'dead_letter')::int`.as("dead_letter_jobs"),
      })
      .from(integrationJobs)
      .where(eq(integrationJobs.businessId, bid)),
    db
      .select({
        lastAttemptAt: sql<Date | null>`max(${integrationJobAttempts.finishedAt})`.as("last_attempt_at"),
      })
      .from(integrationJobAttempts)
      .where(eq(integrationJobAttempts.businessId, bid)),
  ]);

  res.json({
    automations: {
      sentLast24Hours: automationActivityRows[0]?.totalSent ?? 0,
      skippedLast24Hours: automationActivityRows[0]?.totalSkipped ?? 0,
      lastActivityAt: toNullableIsoString(automationActivityRows[0]?.lastActivityAt),
      lastSkippedAt: toNullableIsoString(automationActivityRows[0]?.lastSkippedAt),
      failedLast24Hours: automationFailureRows[0]?.total ?? 0,
      lastFailureAt: toNullableIsoString(automationFailureRows[0]?.lastFailureAt),
    },
    integrations: {
      lastAttemptAt: toNullableIsoString(integrationAttemptRows[0]?.lastAttemptAt),
      pendingJobs: integrationQueueRows[0]?.pendingJobs ?? 0,
      processingJobs: integrationQueueRows[0]?.processingJobs ?? 0,
      failedJobs: integrationQueueRows[0]?.failedJobs ?? 0,
      deadLetterJobs: integrationQueueRows[0]?.deadLetterJobs ?? 0,
    },
  });
});

actionsRouter.post("/restoreClient", requireAuth, requireTenant, requirePermission("customers.write"), async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.body);
  const id = parsed.success ? parsed.data.id : undefined;
  if (!id) throw new NotFoundError("id required");
  const [updated] = await db
    .update(clients)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(clients.id, id), eq(clients.businessId, businessId(req))))
    .returning();
  if (!updated) throw new NotFoundError("Client not found.");
  res.json(updated);
});

actionsRouter.post("/restoreVehicle", requireAuth, requireTenant, requirePermission("vehicles.write"), async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.body);
  const id = parsed.success ? parsed.data.id : undefined;
  if (!id) throw new NotFoundError("id required");
  const [updated] = await db
    .update(vehicles)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(vehicles.id, id), eq(vehicles.businessId, businessId(req))))
    .returning();
  if (!updated) throw new NotFoundError("Vehicle not found.");
  res.json(updated);
});

actionsRouter.post("/restoreService", requireAuth, requireTenant, requirePermission("services.write"), async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.body);
  const id = parsed.success ? parsed.data.id : undefined;
  if (!id) throw new NotFoundError("id required");
  const [updated] = await db
    .update(services)
    .set({ active: true, updatedAt: new Date() })
    .where(and(eq(services.id, id), eq(services.businessId, businessId(req))))
    .returning();
  if (!updated) throw new NotFoundError("Service not found.");
  res.json(updated);
});

actionsRouter.post("/unvoidInvoice", requireAuth, requireTenant, requirePermission("invoices.write"), async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.body);
  const id = parsed.success ? parsed.data.id : undefined;
  if (!id) throw new NotFoundError("id required");
  const [updated] = await db
    .update(invoices)
    .set({ status: "draft", updatedAt: new Date() })
    .where(and(eq(invoices.id, id), eq(invoices.businessId, businessId(req))))
    .returning();
  if (!updated) throw new NotFoundError("Invoice not found.");
  res.json(updated);
});

actionsRouter.post("/reversePayment", requireAuth, requireTenant, requirePermission("payments.write"), async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.body);
  const id = parsed.success ? parsed.data.id : undefined;
  if (!id) throw new NotFoundError("id required");
  const bid = businessId(req);
  try {
    const [p] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.businessId, bid))).limit(1);
    if (!p || p.reversedAt) throw new NotFoundError("Payment not found or already reversed.");
    const [updated] = await db
      .update(payments)
      .set({ reversedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(payments.id, id), eq(payments.businessId, bid)))
      .returning();
    res.json(updated);
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on reversePayment action; returning safe fallback", { paymentId: id, businessId: bid, error });
    res.json({ ok: false, message: "Payment reversal is unavailable until production payments schema is migrated." });
  }
});

actionsRouter.post("/retryFailedNotifications", requireAuth, requireTenant, requirePermission("settings.write"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const result = await withIdempotency(
    `retry-notifications-${bid}-${Math.floor(Date.now() / 10000)}`,
    { businessId: bid, operation: "retryFailedNotifications" },
    async () => retryFailedEmailNotifications(bid)
  );
  res.json({ ok: true, retried: result.retried, succeeded: result.succeeded });
});

actionsRouter.post("/getBusinessPreset", requireAuth, requireTenant, requirePermission("settings.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [business] = await db.select({ type: businesses.type }).from(businesses).where(eq(businesses.id, bid)).limit(1);
  const summary = getPresetSummaryForBusinessType(business?.type ?? null);
  res.json(summary);
});

actionsRouter.post("/applyBusinessPreset", requireAuth, requireTenant, requirePermission("settings.write"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  try {
    const result = await applyBusinessPreset(bid);
    if (result.fullyApplied) {
      res.json({ ok: true, ...result });
      return;
    }
    res.json({
      ok: false,
      ...result,
      message: `Starter services were only partially applied (${result.appliedCount}/${result.expectedCount}).`,
    });
  } catch (error) {
    logger.warn("Business preset apply failed; returning safe fallback", { businessId: bid, error });
    try {
      const summary = await getAppliedBusinessPresetSummary(bid);
      if (summary.fullyApplied) {
        res.json({
          ok: true,
          created: 0,
          skipped: summary.expectedCount,
          group: summary.group,
          degraded: true,
          message: "Starter services are already applied.",
        });
        return;
      }
      if (summary.appliedCount > 0) {
        res.json({
          ok: true,
          created: 0,
          skipped: Math.max(summary.expectedCount - summary.appliedCount, 0),
          group: summary.group,
          degraded: true,
          message: `Starter services were partially applied (${summary.appliedCount}/${summary.expectedCount}).`,
        });
        return;
      }
    } catch (summaryError) {
      logger.warn("Business preset fallback summary failed", {
        businessId: bid,
        error: summaryError,
      });
    }
    res.json({ ok: false, message: "Starter services could not be fully applied until production services schema is migrated." });
  }
});

/** Cron endpoint: run business-type-aware automations (reminders, lapsed clients, review requests). */
actionsRouter.post("/runAutomations", async (req: Request, res: Response) => {
  const gate = getCronExecutionGate(
    typeof req.headers["x-cron-secret"] === "string" ? req.headers["x-cron-secret"] : undefined
  );
  if (!gate.ok) {
    res.status(gate.statusCode).json({ message: gate.message });
    return;
  }
  try {
    const [uncontactedLeads, reminders, abandonedQuotes, lapsed, reviews, billingReminders] = await Promise.all([
      automations.runUncontactedLeadReminders(),
      automations.runAppointmentReminders(),
      automations.runAbandonedQuoteFollowUps(),
      automations.runLapsedClientDetection(),
      automations.runReviewRequests(),
      sendDelayedBillingReminderEmails({}),
    ]);
    res.json({
      ok: true,
      uncontactedLeadAlertsSent: uncontactedLeads.sent,
      remindersSent: reminders.sent,
      abandonedQuoteFollowUpsSent: abandonedQuotes.sent,
      lapsedDetected: lapsed.detected,
      reviewRequestsSent: reviews.sent,
      billingReminderEmailsSent: billingReminders.sent,
    });
  } catch (err) {
    logger.error(err instanceof Error ? err.message : "runAutomations failed", { error: err });
    res.status(500).json({ message: "Automations run failed" });
  }
});

actionsRouter.post("/runIntegrationJobs", async (req: Request, res: Response) => {
  const gate = getCronExecutionGate(
    typeof req.headers["x-cron-secret"] === "string" ? req.headers["x-cron-secret"] : undefined
  );
  if (!gate.ok) {
    res.status(gate.statusCode).json({ message: gate.message });
    return;
  }

  const workerId = `actions:${process.pid}`;
  const limit = Math.min(Math.max(Number(req.body?.limit ?? 20), 1), 100);

  try {
    const jobs = await claimDueIntegrationJobs(limit, workerId);
    const summary = {
      claimed: jobs.length,
      succeeded: 0,
      failed: 0,
      providers: {} as Record<string, number>,
    };

    for (const job of jobs) {
      summary.providers[job.provider] = (summary.providers[job.provider] ?? 0) + 1;
      try {
        if (job.provider === "quickbooks_online") {
          await runQuickBooksIntegrationJob(job);
        } else if (job.provider === "google_calendar") {
          await runGoogleCalendarIntegrationJob(job);
        } else if (job.provider === "twilio_sms") {
          await runTwilioIntegrationJob(job);
        } else if (job.provider === "outbound_webhooks") {
          await runOutboundWebhookIntegrationJob(job);
        } else {
          throw new Error(`Integration worker not implemented for provider ${job.provider}.`);
        }
        summary.succeeded += 1;
      } catch (error) {
        summary.failed += 1;
        logger.warn("Integration worker job failed", {
          provider: job.provider,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    res.json({ ok: true, ...summary });
  } catch (error) {
    logger.error(error instanceof Error ? error.message : "runIntegrationJobs failed", { error });
    res.status(500).json({ message: "Integration jobs run failed" });
  }
});
