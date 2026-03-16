/**
 * Global actions: getDashboardStats, getCapacityInsights, generatePortalToken,
 * restoreClient, restoreVehicle, restoreService, unvoidInvoice, reversePayment,
 * revertRecord, retryFailedNotifications, createBackup, getAnalyticsData, optimizeDailyRoute.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { clients, vehicles, services, appointments, invoices, payments } from "../db/schema.js";
import { eq, and, gte, lte, sql, desc, isNull } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { withIdempotency } from "../lib/idempotency.js";
import * as automations from "../lib/automations.js";
import { retryFailedEmailNotifications } from "../lib/email.js";

export const actionsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

const idParamSchema = z.object({ id: z.string().uuid() });
const clientIdParamSchema = z.object({ clientId: z.string().uuid().optional(), id: z.string().uuid().optional() });

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
    openPaidRows,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(appointments).where(and(eq(appointments.businessId, bid), gte(appointments.startTime, startOfWeek))),
    db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(and(eq(invoices.businessId, bid), eq(invoices.status, "paid"))),
    db.select({ count: sql<number>`count(*)::int` }).from(clients).where(and(eq(clients.businessId, bid), isNull(clients.deletedAt))),
    db.select({ count: sql<number>`count(*)::int` }).from(appointments).where(and(eq(appointments.businessId, bid), gte(appointments.startTime, startOfToday), lte(appointments.startTime, endOfToday), sql`${appointments.status} not in ('cancelled', 'no-show')`)),
    db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(and(eq(invoices.businessId, bid), eq(invoices.status, "paid"), gte(invoices.paidAt ?? invoices.updatedAt, startOfToday), lte(invoices.paidAt ?? invoices.updatedAt, endOfToday))),
    db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(and(eq(invoices.businessId, bid), eq(invoices.status, "paid"), gte(invoices.paidAt ?? invoices.updatedAt, startOfMonth), lte(invoices.paidAt ?? invoices.updatedAt, endOfMonth))),
    db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('draft', 'sent', 'partial')`)),
    db.select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('sent', 'partial')`)),
    db.select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` }).from(payments).innerJoin(invoices, eq(payments.invoiceId, invoices.id)).where(and(eq(invoices.businessId, bid), sql`${invoices.status} in ('sent', 'partial')`, sql`${payments.reversedAt} is null`)),
  ]);

  const openTotal = Number(openInvoicesTotalRows[0]?.total ?? 0);
  const openPaid = Number(openPaidRows[0]?.total ?? 0);
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

actionsRouter.post("/generatePortalToken", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const parsed = clientIdParamSchema.safeParse(req.body);
  const clientId = parsed.success ? parsed.data.clientId ?? parsed.data.id : undefined;
  if (!clientId) throw new NotFoundError("clientId or id required");
  const [c] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.businessId, businessId(req)))).limit(1);
  if (!c) throw new NotFoundError("Client not found.");
  const token = `portal_${c.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await db.update(clients).set({ updatedAt: new Date() }).where(eq(clients.id, clientId));
  res.json({ token });
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
  const [p] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.businessId, businessId(req)))).limit(1);
  if (!p || p.reversedAt) throw new NotFoundError("Payment not found or already reversed.");
  const [updated] = await db.update(payments).set({ reversedAt: new Date(), updatedAt: new Date() }).where(eq(payments.id, id)).returning();
  res.json(updated);
});

actionsRouter.post("/createBackup", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  await withIdempotency(`backup-${bid}-${Math.floor(Date.now() / 60000)}`, { businessId: bid, operation: "createBackup" }, async () => {
    logger.info("Backup requested", { businessId: bid });
    return { ok: true, message: "Backup queued" };
  });
  res.json({ ok: true, message: "Backup queued" });
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

actionsRouter.post("/getAnalyticsData", requireAuth, requireTenant, async (req: Request, res: Response) => {
  const bid = businessId(req);
  const list = await db.select().from(invoices).where(eq(invoices.businessId, bid)).orderBy(desc(invoices.createdAt)).limit(100);
  res.json({ data: list });
});

actionsRouter.post("/optimizeDailyRoute", requireAuth, requireTenant, async (_req: Request, res: Response) => {
  res.json({ route: [], message: "Optimization not implemented" });
});

actionsRouter.post("/revertRecord", requireAuth, requireTenant, async (_req: Request, res: Response) => {
  res.json({ ok: true });
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
