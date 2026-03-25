/**
 * Email sending with customizable templates.
 * Uses SMTP from env when configured; templates in DB (business or system) or built-in defaults.
 * All template vars are HTML-escaped to prevent XSS.
 */
import nodemailer from "nodemailer";
import { db } from "../db/index.js";
import { emailTemplates, notificationLogs } from "../db/schema.js";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { escapeHtml } from "./escape.js";
import { getBuiltinTemplate } from "./emailTemplates.js";
import { isSmtpConfigured } from "./env.js";

let transporter: nodemailer.Transporter | null = null;

function resolveSmtpSecure(): boolean {
  const configured = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (configured === "true" || configured === "1" || configured === "yes") return true;
  if (configured === "false" || configured === "0" || configured === "no") return false;
  return Number(process.env.SMTP_PORT ?? 0) === 465;
}

function getTransporter(): nodemailer.Transporter | null {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    const secure = resolveSmtpSecure();
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: Number(process.env.SMTP_PORT!),
      secure,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });
  }
  return transporter;
}

export type TemplateVars = Record<string, string | number | undefined>;

function replaceVars(template: string, vars: TemplateVars, escapeForHtml: boolean): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    const raw = String(value ?? "");
    const replacement = escapeForHtml ? escapeHtml(raw) : raw;
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), replacement);
  }
  return out;
}

export async function getTemplate(
  slug: string,
  businessId: string | null
): Promise<{ subject: string; bodyHtml: string; bodyText: string | null } | null> {
  if (businessId) {
    const [t] = await db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.slug, slug), eq(emailTemplates.businessId, businessId)))
      .limit(1);
    if (t) return { subject: t.subject, bodyHtml: t.bodyHtml, bodyText: t.bodyText };
  }
  const [sys] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.slug, slug), isNull(emailTemplates.businessId)))
    .limit(1);
  if (sys) return { subject: sys.subject, bodyHtml: sys.bodyHtml, bodyText: sys.bodyText };
  const builtin = getBuiltinTemplate(slug);
  if (builtin) return { subject: builtin.subject, bodyHtml: builtin.bodyHtml, bodyText: null };
  return null;
}

/** Internal: send only, no logging. Used for retries so we update the existing log row. */
export async function sendTemplatedEmailInternal(
  options: { to: string; subject?: string; templateSlug: string; businessId?: string | null; vars?: TemplateVars }
): Promise<void> {
  const template = await getTemplate(options.templateSlug, options.businessId ?? null);
  const vars = options.vars ?? {};
  const subject = options.subject ?? (template ? replaceVars(template.subject, vars, false) : "Notification");
  const bodyHtml = template ? replaceVars(template.bodyHtml, vars, true) : "<p>No template found.</p>";
  const bodyText = template?.bodyText ? replaceVars(template.bodyText, vars, false) : undefined;
  const t = getTransporter();
  if (!t) {
    throw new Error("SMTP is not configured");
  }
  await t.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: options.to,
    subject,
    html: bodyHtml,
    text: bodyText,
  });
}

export async function sendTemplatedEmail(
  options: {
    to: string;
    subject?: string;
    templateSlug: string;
    businessId?: string | null;
    vars?: TemplateVars;
  }
): Promise<void> {
  const template = await getTemplate(options.templateSlug, options.businessId ?? null);
  const vars = options.vars ?? {};
  const subject = options.subject ?? (template ? replaceVars(template.subject, vars, false) : "Notification");

  const logToDb = async (errorMessage: string | null) => {
    if (!options.businessId) return;
    await db.insert(notificationLogs).values({
      businessId: options.businessId,
      channel: "email",
      recipient: options.to,
      subject,
      error: errorMessage,
      metadata: JSON.stringify({ templateSlug: options.templateSlug, vars: options.vars ?? {} }),
    });
  };

  try {
    await sendTemplatedEmailInternal(options);
    await logToDb(null);
    logger.info("Email sent", { to: options.to, templateSlug: options.templateSlug });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logToDb(message);
    logger.warn("Email send failed", { to: options.to, templateSlug: options.templateSlug, error: message });
    throw err;
  }
}

/** Build vars for weekly summary from DB (completed appointments, revenue, open/overdue invoices, staff utilization). */
export async function getWeeklySummaryVars(businessId: string): Promise<TemplateVars> {
  const { businesses, appointments, invoices, staff } = await import("../db/schema.js");
  const { eq, and, gte, lte, sql, isNull } = await import("drizzle-orm");
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const [b] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const businessName = b?.name ?? "Your business";

  const [completedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appointments)
    .where(and(eq(appointments.businessId, businessId), eq(appointments.status, "completed"), gte(appointments.completedAt, weekStart), lte(appointments.completedAt, weekEnd)));
  const completedCount = completedRow?.count ?? 0;

  const [revenueRow] = await db
    .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
    .from(invoices)
    .where(and(eq(invoices.businessId, businessId), eq(invoices.status, "paid"), gte(invoices.paidAt ?? invoices.updatedAt, weekStart), lte(invoices.paidAt ?? invoices.updatedAt, weekEnd)));
  const revenueTotal = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(revenueRow?.total ?? 0));

  const [openRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(and(eq(invoices.businessId, businessId), sql`${invoices.status} in ('draft', 'sent', 'partial')`));
  const openInvoicesCount = openRow?.count ?? 0;

  const [overdueRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(and(eq(invoices.businessId, businessId), sql`${invoices.status} in ('sent', 'partial')`, sql`${invoices.dueDate} < now()`));
  const overdueCount = overdueRow?.count ?? 0;

  const [staffCount] = await db.select({ count: sql<number>`count(*)::int` }).from(staff).where(and(eq(staff.businessId, businessId), isNull(staff.deletedAt)));
  const staffTotal = staffCount?.count ?? 1;
  const staffUtilization = staffTotal > 0 ? `${Math.round((completedCount / Math.max(staffTotal, 1)) * 100)}%` : "—";

  return {
    businessName,
    weekStart: weekStart.toLocaleDateString("en-US"),
    weekEnd: weekEnd.toLocaleDateString("en-US"),
    completedCount: String(completedCount),
    revenueTotal,
    openInvoicesCount: String(openInvoicesCount),
    overdueCount: String(overdueCount),
    staffUtilization,
  };
}

export async function sendWeeklySummary(businessId: string, businessEmail: string, businessName?: string): Promise<void> {
  const vars = await getWeeklySummaryVars(businessId);
  if (businessName) vars.businessName = businessName;
  await sendTemplatedEmail({
    to: businessEmail,
    templateSlug: "weekly_summary",
    businessId,
    vars,
  });
}

const fallback = (v: string | number | undefined | null) =>
  v !== undefined && v !== null && String(v).trim() !== "" ? String(v) : "-";

const optionalValue = (v: string | number | undefined | null) =>
  v !== undefined && v !== null && String(v).trim() !== "" ? String(v) : "";

/** Send appointment confirmation. Vars: clientName, businessName, dateTime, vehicle?, address?, serviceSummary?, confirmationUrl? */
export async function sendAppointmentConfirmation(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  dateTime: string;
  vehicle?: string | null;
  address?: string | null;
  serviceSummary?: string | null;
  confirmationUrl?: string | null;
}): Promise<void> {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "appointment_confirmation",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      dateTime: options.dateTime,
      vehicle: fallback(options.vehicle),
      address: fallback(options.address),
      serviceSummary: fallback(options.serviceSummary),
      confirmationUrl: optionalValue(options.confirmationUrl),
    },
  });
}

/** Send appointment reminder. Vars: clientName, businessName, dateTime, vehicle?, serviceSummary? */
export async function sendAppointmentReminder(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  dateTime: string;
  vehicle?: string | null;
  serviceSummary?: string | null;
}): Promise<void> {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "appointment_reminder",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      dateTime: options.dateTime,
      vehicle: fallback(options.vehicle),
      serviceSummary: fallback(options.serviceSummary),
    },
  });
}

/** Send payment receipt. Vars: clientName, businessName, amount, invoiceNumber, paidAt, method */
export async function sendPaymentReceipt(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  amount: string;
  invoiceNumber: string;
  paidAt: string;
  method: string;
}): Promise<void> {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "payment_receipt",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      amount: options.amount,
      invoiceNumber: options.invoiceNumber,
      paidAt: options.paidAt,
      method: options.method,
    },
  });
}

export async function sendQuoteEmail(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  amount: string;
  vehicle?: string | null;
  quoteUrl?: string | null;
  message?: string | null;
}) {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "quote_sent",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      amount: options.amount,
      vehicle: fallback(options.vehicle),
      quoteUrl: optionalValue(options.quoteUrl),
      message: optionalValue(options.message),
    },
  });
}

export async function sendQuoteFollowUpEmail(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  amount: string;
  vehicle?: string | null;
  quoteUrl?: string | null;
  message?: string | null;
}) {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "quote_follow_up",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      amount: options.amount,
      vehicle: fallback(options.vehicle),
      quoteUrl: optionalValue(options.quoteUrl),
      message: optionalValue(options.message),
    },
  });
}

export async function sendInvoiceEmail(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  amount: string;
  invoiceNumber: string;
  invoiceUrl?: string | null;
  message?: string | null;
}) {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "invoice_sent",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      amount: options.amount,
      invoiceNumber: options.invoiceNumber,
      invoiceUrl: optionalValue(options.invoiceUrl),
      message: optionalValue(options.message),
    },
  });
}

/** Send review request. Vars: clientName, businessName, reviewUrl?, serviceSummary? */
export async function sendReviewRequest(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  reviewUrl?: string | null;
  serviceSummary?: string | null;
}): Promise<void> {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "review_request",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      reviewUrl: fallback(options.reviewUrl),
      serviceSummary: fallback(options.serviceSummary),
    },
  });
}

/** Send lapsed client re-engagement. Vars: clientName, businessName, lastVisit?, bookUrl?, serviceSummary? */
export async function sendLapsedClientReengagement(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  lastVisit?: string | null;
  bookUrl?: string | null;
  serviceSummary?: string | null;
}): Promise<void> {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "lapsed_client_reengagement",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      lastVisit: fallback(options.lastVisit),
      bookUrl: fallback(options.bookUrl),
      serviceSummary: fallback(options.serviceSummary),
    },
  });
}

const MAX_RETRIES = 5;

/** Retry failed email notifications for a business. Updates log rows with retry count and last retry time. */
export async function retryFailedEmailNotifications(businessId: string): Promise<{ retried: number; succeeded: number }> {
  if (!isSmtpConfigured()) {
    logger.debug("SMTP disabled: skip notification retries", { businessId });
    return { retried: 0, succeeded: 0 };
  }
  const failed = await db
    .select()
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.businessId, businessId),
        isNotNull(notificationLogs.error),
        sql`${notificationLogs.channel} = 'email'`,
        sql`coalesce(${notificationLogs.retryCount}, 0) < ${MAX_RETRIES}`
      )
    );

  let succeeded = 0;
  for (const row of failed) {
    let meta: { templateSlug?: string; vars?: TemplateVars } = {};
    try {
      meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : {};
    } catch {
      logger.warn("Retry skipped: invalid metadata", { logId: row.id });
      continue;
    }
    const { templateSlug, vars } = meta;
    if (!templateSlug || !row.recipient) {
      logger.warn("Retry skipped: missing templateSlug or recipient", { logId: row.id });
      continue;
    }
    const now = new Date();
    const nextRetryCount = (row.retryCount ?? 0) + 1;
    try {
      await sendTemplatedEmailInternal({
        to: row.recipient,
        templateSlug,
        businessId,
        vars: vars ?? {},
      });
      await db
        .update(notificationLogs)
        .set({ error: null, retryCount: nextRetryCount, lastRetryAt: now })
        .where(eq(notificationLogs.id, row.id));
      succeeded++;
      logger.info("Notification retry succeeded", { logId: row.id, businessId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(notificationLogs)
        .set({ error: message, retryCount: nextRetryCount, lastRetryAt: now })
        .where(eq(notificationLogs.id, row.id));
      logger.warn("Notification retry failed", { logId: row.id, businessId, error: message });
    }
  }
  return { retried: failed.length, succeeded };
}


