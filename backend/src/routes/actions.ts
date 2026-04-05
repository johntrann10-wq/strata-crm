/**
 * Global actions: getDashboardStats, getCapacityInsights, restoreClient,
 * restoreVehicle, restoreService, unvoidInvoice, reversePayment, retryFailedNotifications.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { clients, vehicles, services, appointments, invoices, payments, expenses, activityLogs, notificationLogs } from "../db/schema.js";
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

export const actionsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
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

actionsRouter.post("/getDashboardStats", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [
    apptCountWeek,
    invTotalPaid,
    clientCount,
    todayAppts,
    todayRevenueRows,
    monthRevenueRows,
    openInvoicesRows,
    openInvoicesTotalRows,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(appointments).where(and(eq(appointments.businessId, bid), gte(appointments.startTime, startOfWeek))),
    db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(and(eq(invoices.businessId, bid), eq(invoices.status, "paid"))),
    db.select({ count: sql<number>`count(*)::int` }).from(clients).where(and(eq(clients.businessId, bid), isNull(clients.deletedAt))),
    db.select({ count: sql<number>`count(*)::int` }).from(appointments).where(and(eq(appointments.businessId, bid), gte(appointments.startTime, startOfToday), lte(appointments.startTime, endOfToday), sql`${appointments.status} not in ('cancelled', 'no-show')`)),
    db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(and(eq(invoices.businessId, bid), eq(invoices.status, "paid"), gte(invoices.paidAt ?? invoices.updatedAt, startOfToday), lte(invoices.paidAt ?? invoices.updatedAt, endOfToday))),
    db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(and(eq(invoices.businessId, bid), eq(invoices.status, "paid"), gte(invoices.paidAt ?? invoices.updatedAt, startOfMonth), lte(invoices.paidAt ?? invoices.updatedAt, endOfMonth))),
    db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('draft', 'sent', 'partial')`)),
    db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('sent', 'partial')`)),
  ]);
  const openPaid = await getOpenInvoicePaidTotal(bid);

  const openTotal = Number(openInvoicesTotalRows[0]?.total ?? 0);
  const outstandingBalance = Math.max(0, openTotal - openPaid);

  res.json({
    appointmentsThisWeek: apptCountWeek[0]?.count ?? 0,
    revenueTotal: Number(invTotalPaid[0]?.total ?? 0),
    totalClients: clientCount[0]?.count ?? 0,
    todayRevenue: Number(todayRevenueRows[0]?.total ?? 0),
    revenueThisMonth: Number(monthRevenueRows[0]?.total ?? 0),
    openInvoicesCount: openInvoicesRows[0]?.count ?? 0,
    outstandingBalance,
    todayAppointmentsCount: todayAppts[0]?.count ?? 0,
    todayBookedHours: 0,
    totalAvailableHours: 8,
    repeatCustomerRate: 0,
    weeklyRevenue: [],
  });
});

actionsRouter.post("/getCapacityInsights", requireAuth, requireTenant, async (req: Request, res: Response) => {
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
actionsRouter.post("/getInvoiceMetrics", requireAuth, requireTenant, async (req: Request, res: Response) => {
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
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [todayRevenueRows, revenueMonthRows, openTotals, expenseMonthRows, expenseTodayRows, expenseCountRows] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.businessId, bid), eq(invoices.status, "paid"), gte(invoices.paidAt ?? invoices.updatedAt, startOfToday), lte(invoices.paidAt ?? invoices.updatedAt, endOfToday))),
    db
      .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.businessId, bid), eq(invoices.status, "paid"), gte(invoices.paidAt ?? invoices.updatedAt, startOfMonth), lte(invoices.paidAt ?? invoices.updatedAt, endOfMonth))),
    db
      .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('draft', 'sent', 'partial')`)),
    db
      .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(eq(expenses.businessId, bid), gte(expenses.expenseDate, startOfMonth), lte(expenses.expenseDate, endOfMonth))),
    db
      .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(eq(expenses.businessId, bid), gte(expenses.expenseDate, startOfToday), lte(expenses.expenseDate, endOfToday))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(eq(expenses.businessId, bid), gte(expenses.expenseDate, startOfMonth), lte(expenses.expenseDate, endOfMonth))),
  ]);

  const openPaid = await getOpenInvoicePaidTotal(bid);
  const openTotal = Number(openTotals[0]?.total ?? 0);
  const outstandingBalance = Math.max(0, openTotal - openPaid);
  const revenueThisMonth = Number(revenueMonthRows[0]?.total ?? 0);
  const expensesThisMonth = Number(expenseMonthRows[0]?.total ?? 0);

  res.json({
    todayRevenue: Number(todayRevenueRows[0]?.total ?? 0),
    revenueThisMonth,
    outstandingBalance,
    expensesToday: Number(expenseTodayRows[0]?.total ?? 0),
    expensesThisMonth,
    netThisMonth: revenueThisMonth - expensesThisMonth,
    expenseCountThisMonth: expenseCountRows[0]?.count ?? 0,
  });
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
          'automation.appointment_reminder.sent',
          'automation.review_request.sent',
          'automation.lapsed_client.sent'
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
        sql`${notificationLogs.channel} = 'email'`,
        sql`${notificationLogs.error} is not null`,
        sql`coalesce(${notificationLogs.metadata}::json->>'templateSlug', '') in (
          'appointment_reminder',
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
    const notificationRow = notificationMap.get(templateSlug);
    return {
      sentLast30Days: row?.total ?? 0,
      lastSentAt: row?.lastSentAt?.toISOString() ?? null,
      failedLast30Days: notificationRow?.failedLast30Days ?? 0,
      lastFailedAt: notificationRow?.lastFailedAt?.toISOString() ?? null,
    };
  };

  res.json({
    appointmentReminders: summarize("automation.appointment_reminder.sent", "appointment_reminder"),
    reviewRequests: summarize("automation.review_request.sent", "review_request"),
    lapsedClients: summarize("automation.lapsed_client.sent", "lapsed_client_reengagement"),
  });
});

actionsRouter.post("/restoreClient", requireAuth, requireTenant, async (req: Request, res: Response) => {
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

actionsRouter.post("/restoreVehicle", requireAuth, requireTenant, async (req: Request, res: Response) => {
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

actionsRouter.post("/restoreService", requireAuth, requireTenant, async (req: Request, res: Response) => {
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

actionsRouter.post("/unvoidInvoice", requireAuth, requireTenant, async (req: Request, res: Response) => {
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

actionsRouter.post("/reversePayment", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.body);
  const id = parsed.success ? parsed.data.id : undefined;
  if (!id) throw new NotFoundError("id required");
  const bid = businessId(req);
  try {
    const [p] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.businessId, bid))).limit(1);
    if (!p || p.reversedAt) throw new NotFoundError("Payment not found or already reversed.");
    const [updated] = await db.update(payments).set({ reversedAt: new Date(), updatedAt: new Date() }).where(eq(payments.id, id)).returning();
    res.json(updated);
  } catch (error) {
    if (!isPaymentSchemaDriftError(error)) throw error;
    logger.warn("Payments schema drift detected on reversePayment action; returning safe fallback", { paymentId: id, businessId: bid, error });
    res.json({ ok: false, message: "Payment reversal is unavailable until production payments schema is migrated." });
  }
});

actionsRouter.post("/retryFailedNotifications", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const result = await withIdempotency(
    `retry-notifications-${bid}-${Math.floor(Date.now() / 10000)}`,
    { businessId: bid, operation: "retryFailedNotifications" },
    async () => retryFailedEmailNotifications(bid)
  );
  res.json({ ok: true, retried: result.retried, succeeded: result.succeeded });
});

actionsRouter.post("/getBusinessPreset", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const [business] = await db.select({ type: businesses.type }).from(businesses).where(eq(businesses.id, bid)).limit(1);
  const summary = getPresetSummaryForBusinessType(business?.type ?? null);
  res.json(summary);
});

actionsRouter.post("/applyBusinessPreset", requireAuth, requireTenant, async (req: Request, res: Response) => {
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

/** Cron endpoint: run business-type-aware automations (reminders, lapsed clients, review requests). Optional CRON_SECRET. */
actionsRouter.post("/runAutomations", async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;
  if (secret != null && secret !== "" && req.headers["x-cron-secret"] !== secret) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const [reminders, lapsed, reviews] = await Promise.all([
      automations.runAppointmentReminders(),
      automations.runLapsedClientDetection(),
      automations.runReviewRequests(),
    ]);
    res.json({
      ok: true,
      remindersSent: reminders.sent,
      lapsedDetected: lapsed.detected,
      reviewRequestsSent: reviews.sent,
    });
  } catch (err) {
    logger.error(err instanceof Error ? err.message : "runAutomations failed", { error: err });
    res.status(500).json({ message: "Automations run failed" });
  }
});

actionsRouter.post("/runIntegrationJobs", async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;
  if (secret != null && secret !== "" && req.headers["x-cron-secret"] !== secret) {
    res.status(401).json({ message: "Unauthorized" });
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
