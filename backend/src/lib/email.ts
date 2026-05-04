/**
 * Email sending with customizable templates.
 * Uses SMTP from env when configured; templates in DB (business or system) or built-in defaults.
 * All template vars are HTML-escaped to prevent XSS.
 */
import nodemailer from "nodemailer";
import { db } from "../db/index.js";
import { businesses, emailTemplates, notificationLogs } from "../db/schema.js";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { escapeHtml } from "./escape.js";
import { getBuiltinTemplate } from "./emailTemplates.js";
import { getConfiguredEmailReplyTo, getConfiguredEmailSender, isEmailConfigured, isResendConfigured, isSmtpConfigured } from "./env.js";
import {
  buildPublicBookingBrandLogoUrl,
  parseBookingBrandLogoTransform,
  resolveBookingBrandLogoPlateStyles,
} from "./bookingBranding.js";

let transporter: nodemailer.Transporter | null = null;
let fallbackTransporter: nodemailer.Transporter | null = null;
const PRIMARY_SEND_TIMEOUT_MS = 2_500;
const FALLBACK_SEND_TIMEOUT_MS = 1_500;
const CUSTOMER_FACING_TEMPLATE_SLUGS = new Set([
  "appointment_confirmation",
  "appointment_reminder",
  "booking_request_received",
  "booking_request_customer_update",
  "customer_portal_link",
  "invoice_sent",
  "lapsed_client_reengagement",
  "lead_auto_response",
  "payment_receipt",
  "quote_follow_up",
  "quote_sent",
  "review_request",
]);

function isEmailSchemaDriftError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || message.includes("does not exist");
}

function resolveSmtpSecure(): boolean {
  const configured = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (configured === "true" || configured === "1" || configured === "yes") return true;
  if (configured === "false" || configured === "0" || configured === "no") return false;
  return Number(process.env.SMTP_PORT ?? 0) === 465;
}

function getTransporter(): nodemailer.Transporter | null {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport(buildTransportOptions(Number(process.env.SMTP_PORT!), resolveSmtpSecure()));
  }
  return transporter;
}

function buildTransportOptions(port: number, secure: boolean) {
  return {
    host: process.env.SMTP_HOST!,
    port,
    secure,
    family: 4,
    connectionTimeout: 4_000,
    greetingTimeout: 4_000,
    socketTimeout: 5_000,
    tls: {
      servername: process.env.SMTP_HOST!,
    },
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  };
}

function isGmailSmtpHost(): boolean {
  const host = process.env.SMTP_HOST?.trim().toLowerCase();
  return host === "smtp.gmail.com";
}

function shouldRetryWithGmailStartTls(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("socket closed") ||
    message.includes("greeting never received")
  );
}

function getFallbackTransporter(): nodemailer.Transporter {
  if (!fallbackTransporter) {
    fallbackTransporter = nodemailer.createTransport(buildTransportOptions(587, false));
  }
  return fallbackTransporter;
}

function getFromAddress(): string {
  const configured = getConfiguredEmailSender();
  if (configured) return configured;
  throw new Error("SMTP sender address is not configured");
}

function getReplyToAddress(): string | undefined {
  return getConfiguredEmailReplyTo() ?? undefined;
}

function extractMailboxAddress(mailbox: string): string {
  const trimmed = mailbox.trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  if (bracketMatch?.[1]?.trim()) return bracketMatch[1].trim();
  return trimmed;
}

function extractMailboxDisplayName(mailbox: string): string {
  const trimmed = mailbox.trim();
  const bracketMatch = trimmed.match(/^(.*?)\s*<[^>]+>$/);
  if (!bracketMatch?.[1]) return "";
  return bracketMatch[1].trim().replace(/^"|"$/g, "");
}

function normalizeMailboxDisplayName(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMailbox(displayName: string, address: string): string {
  const normalizedName = normalizeMailboxDisplayName(displayName);
  const normalizedAddress = extractMailboxAddress(address);
  if (!normalizedName) return normalizedAddress;
  const escapedName = normalizedName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escapedName}" <${normalizedAddress}>`;
}

export function resolveFromAddressForTemplate(
  configuredFrom: string,
  templateSlug: string,
  vars: TemplateVars = {}
): string {
  if (!CUSTOMER_FACING_TEMPLATE_SLUGS.has(templateSlug)) return configuredFrom;
  const businessDisplayName = normalizeMailboxDisplayName(vars.businessName);
  const fallbackDisplayName = normalizeMailboxDisplayName(extractMailboxDisplayName(configuredFrom)) || "Strata CRM";
  return formatMailbox(businessDisplayName || fallbackDisplayName, configuredFrom);
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2: $1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function sendMailWithTimeout(
  transport: nodemailer.Transporter,
  payload: nodemailer.SendMailOptions,
  timeoutMs: number
): Promise<void> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const sendPromise = transport.sendMail(payload);
  sendPromise.catch(() => {
    // The timeout path may win the race first. Consume late send failures so they
    // cannot surface as unhandled rejections after the route has already moved on.
  });
  try {
    await Promise.race([
      sendPromise,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          try {
            transport.close();
          } catch {
            // ignore transport close failures during bounded send timeout
          }
          reject(new Error(`SMTP send timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export type TemplateVars = Record<string, string | number | undefined>;

export type ResolvedTemplateMessage = {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  vars: TemplateVars;
};

const defaultBusinessLogoVars: TemplateVars = {
  businessLogoUrl: undefined,
  businessLogoDisplay: "none",
  businessLogoFrameWidth: "128px",
  businessLogoFrameHeight: "72px",
  businessLogoFrameRadius: "22px",
  businessLogoImageMaxWidth: "112px",
  businessLogoImageMaxHeight: "56px",
  businessLogoImageWidthAttr: 112,
  businessLogoBackground: "rgba(255,255,255,0.98)",
  businessLogoBorder: "rgba(226,232,240,0.95)",
  businessLogoShadow: "0 18px 36px rgba(15,23,42,0.08)",
  businessLogoFilter: "none",
};

function buildBusinessLogoTransformCss(params: {
  fitMode: "contain" | "cover" | "wordmark";
}) {
  const isWordmark = params.fitMode === "wordmark";
  const frameWidth = isWordmark ? 188 : 128;
  const frameHeight = 72;
  const imageMaxWidth = isWordmark ? 168 : 112;
  const imageMaxHeight = 56;
  return {
    width: `${frameWidth}px`,
    height: `${frameHeight}px`,
    radius: "22px",
    imageMaxWidth: `${imageMaxWidth}px`,
    imageMaxHeight: `${imageMaxHeight}px`,
    imageWidthAttr: imageMaxWidth,
  };
}

async function getBusinessContactVars(businessId: string | null | undefined): Promise<TemplateVars> {
  if (!businessId) return { ...defaultBusinessLogoVars };
  let business:
    | {
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        bookingBrandLogoUrl: string | null;
        bookingBrandLogoTransform: string | null;
      }
    | undefined;

  try {
    [business] = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        email: businesses.email,
        phone: businesses.phone,
        address: businesses.address,
        city: businesses.city,
        state: businesses.state,
        zip: businesses.zip,
        bookingBrandLogoUrl: businesses.bookingBrandLogoUrl,
        bookingBrandLogoTransform: businesses.bookingBrandLogoTransform,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
  } catch (error) {
    if (!isEmailSchemaDriftError(error)) throw error;
    logger.warn("Email branding query missing booking logo transform column; falling back without transform", {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      const [fallbackBusiness] = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          email: businesses.email,
          phone: businesses.phone,
          address: businesses.address,
          city: businesses.city,
          state: businesses.state,
          zip: businesses.zip,
          bookingBrandLogoUrl: businesses.bookingBrandLogoUrl,
        })
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1);
      business = fallbackBusiness
        ? {
            ...fallbackBusiness,
            bookingBrandLogoTransform: null,
          }
        : undefined;
    } catch (fallbackError) {
      if (!isEmailSchemaDriftError(fallbackError)) throw fallbackError;
      logger.warn("Email branding query missing booking logo columns; falling back to contact details only", {
        businessId,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });

      const [contactOnlyBusiness] = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          email: businesses.email,
          phone: businesses.phone,
          address: businesses.address,
          city: businesses.city,
          state: businesses.state,
          zip: businesses.zip,
        })
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1);
      business = contactOnlyBusiness
        ? {
            ...contactOnlyBusiness,
            bookingBrandLogoUrl: null,
            bookingBrandLogoTransform: null,
          }
        : undefined;
    }
  }

  const businessAddress = [business?.address, business?.city, business?.state, business?.zip].filter(Boolean).join(", ");
  const transform = parseBookingBrandLogoTransform(business?.bookingBrandLogoTransform);
  const plate = resolveBookingBrandLogoPlateStyles(transform.backgroundPlate);
  const logoFrame = buildBusinessLogoTransformCss(transform);
  const businessLogoUrl = business?.bookingBrandLogoUrl?.trim() && business?.id
    ? buildPublicBookingBrandLogoUrl(business.id)
    : undefined;

  return {
    ...defaultBusinessLogoVars,
    businessName: business?.name?.trim() || undefined,
    businessEmail: business?.email?.trim() || undefined,
    businessPhone: business?.phone?.trim() || undefined,
    businessAddress: businessAddress.trim() || undefined,
    businessLogoUrl,
    businessLogoDisplay: businessLogoUrl ? "block" : "none",
    businessLogoFrameWidth: logoFrame.width,
    businessLogoFrameHeight: logoFrame.height,
    businessLogoFrameRadius: logoFrame.radius,
    businessLogoImageMaxWidth: logoFrame.imageMaxWidth,
    businessLogoImageMaxHeight: logoFrame.imageMaxHeight,
    businessLogoImageWidthAttr: logoFrame.imageWidthAttr,
    businessLogoBackground: plate.background,
    businessLogoBorder: plate.border,
    businessLogoShadow: plate.shadow,
    businessLogoFilter: plate.imageFilter,
  };
}

function replaceVars(template: string, vars: TemplateVars, escapeForHtml: boolean): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    const raw = String(value ?? "");
    const replacement = escapeForHtml ? escapeHtml(raw) : raw;
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), replacement);
  }
  return out;
}

export async function resolveTemplateMessage(options: {
  templateSlug: string;
  businessId?: string | null;
  vars?: TemplateVars;
  subject?: string;
}): Promise<ResolvedTemplateMessage> {
  const template = await getTemplate(options.templateSlug, options.businessId ?? null);
  const contactVars = await getBusinessContactVars(options.businessId ?? null);
  const vars = {
    ...contactVars,
    ...(options.vars ?? {}),
  };
  const subject = options.subject ?? (template ? replaceVars(template.subject, vars, false) : "Notification");
  const bodyHtml = template ? replaceVars(template.bodyHtml, vars, true) : "<p>No template found.</p>";
  const bodyText = template?.bodyText
    ? replaceVars(template.bodyText, vars, false)
    : htmlToPlainText(bodyHtml);
  return {
    subject,
    bodyHtml,
    bodyText,
    vars,
  };
}

export async function getTemplate(
  slug: string,
  businessId: string | null
): Promise<{ subject: string; bodyHtml: string; bodyText: string | null } | null> {
  try {
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
  } catch (error) {
    if (!isEmailSchemaDriftError(error)) throw error;
    logger.warn("Email templates schema unavailable; using built-in template fallback", {
      slug,
      businessId: businessId ?? undefined,
    });
  }
  const builtin = getBuiltinTemplate(slug);
  if (builtin) return { subject: builtin.subject, bodyHtml: builtin.bodyHtml, bodyText: null };
  return null;
}

/** Internal: send only, no logging. Used for retries so we update the existing log row. */
export async function sendTemplatedEmailInternal(
  options: { to: string; subject?: string; templateSlug: string; businessId?: string | null; vars?: TemplateVars }
): Promise<void> {
  const message = await resolveTemplateMessage(options);
  const recipient = options.to.trim();
  if (!recipient) {
    throw new Error("Recipient email address is required");
  }
  const payload = {
    from: resolveFromAddressForTemplate(getFromAddress(), options.templateSlug, message.vars),
    replyTo: getReplyToAddress(),
    to: recipient,
    subject: message.subject,
    html: message.bodyHtml,
    text: message.bodyText,
  };
  if (isResendConfigured()) {
    await sendViaResend(payload);
    return;
  }
  const t = getTransporter();
  if (!t) {
    throw new Error("Transactional email is not configured");
  }
  try {
    await sendMailWithTimeout(t, payload, PRIMARY_SEND_TIMEOUT_MS);
  } catch (error) {
    if (
      isGmailSmtpHost() &&
      Number(process.env.SMTP_PORT ?? 0) === 465 &&
      resolveSmtpSecure() &&
      shouldRetryWithGmailStartTls(error)
    ) {
      logger.warn("Primary Gmail SMTP transport failed; retrying with STARTTLS fallback", {
        host: process.env.SMTP_HOST,
        error: error instanceof Error ? error.message : String(error),
      });
      transporter = null;
      await sendMailWithTimeout(getFallbackTransporter(), payload, FALLBACK_SEND_TIMEOUT_MS);
      return;
    }
    throw error;
  }
}

async function sendViaResend(payload: {
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Resend is not configured");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: payload.from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: payload.replyTo,
    }),
  });
  if (response.ok) return;
  const bodyText = await response.text().catch(() => "");
  let detail = bodyText;
  try {
    const parsed = JSON.parse(bodyText) as { message?: string; error?: { message?: string } };
    detail = parsed.error?.message ?? parsed.message ?? bodyText;
  } catch {
    // keep raw body text
  }
  throw new Error(`Resend request failed (${response.status}): ${detail || response.statusText}`);
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
  const message = await resolveTemplateMessage(options);

  const logToDb = async (errorMessage: string | null) => {
    if (!options.businessId) return;
    try {
      await db.insert(notificationLogs).values({
        businessId: options.businessId,
        channel: "email",
        recipient: options.to,
        subject: message.subject,
        error: errorMessage,
        metadata: JSON.stringify({ templateSlug: options.templateSlug, vars: options.vars ?? {} }),
      });
    } catch (error) {
      if (!isEmailSchemaDriftError(error)) throw error;
      logger.warn("Notification log schema unavailable; skipping email log persistence", {
        templateSlug: options.templateSlug,
        businessId: options.businessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  try {
    await sendTemplatedEmailInternal(options);
    await logToDb(null);
    logger.info("Email sent", {
      to: options.to,
      templateSlug: options.templateSlug,
      businessId: options.businessId ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logToDb(message);
    logger.warn("Email send failed", {
      to: options.to,
      templateSlug: options.templateSlug,
      businessId: options.businessId ?? undefined,
      error: message,
    });
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

export function resolveAppointmentConfirmationActionLabel(options: {
  confirmationActionLabel?: string | null;
  confirmationUrl?: string | null;
}): string {
  const explicitLabel = optionalValue(options.confirmationActionLabel);
  if (explicitLabel) return explicitLabel;
  return optionalValue(options.confirmationUrl) ? "View appointment" : "";
}

export function resolveInvoiceEmailPrimaryAction(options: {
  invoiceUrl?: string | null;
}): { label: string; url: string; detailsCopy: string } {
  return {
    label: optionalValue(options.invoiceUrl) ? "View invoice" : "",
    url: optionalValue(options.invoiceUrl),
    detailsCopy: "Open the invoice to review the completed work, payment status, and your service record.",
  };
}

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
  portalUrl?: string | null;
  confirmationActionLabel?: string | null;
  paymentStatus?: string | null;
  message?: string | null;
}): Promise<void> {
  const confirmationUrl = optionalValue(options.confirmationUrl);
  const portalUrl = optionalValue(options.portalUrl);
  const confirmationActionLabel = resolveAppointmentConfirmationActionLabel({
    confirmationActionLabel: options.confirmationActionLabel,
    confirmationUrl,
  });
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
      confirmationUrl,
      portalUrl,
      confirmationActionLabel,
      paymentStatus: fallback(options.paymentStatus),
      message: optionalValue(options.message),
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

export async function sendAppointmentChangeRequestAlert(options: {
  to: string;
  businessId?: string | null;
  businessName: string;
  clientName: string;
  dateTime: string;
  vehicle?: string | null;
  preferredTiming?: string | null;
  message?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  appointmentUrl?: string | null;
}): Promise<void> {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "appointment_change_request_alert",
    businessId: options.businessId,
    vars: {
      businessName: options.businessName,
      clientName: options.clientName,
      dateTime: options.dateTime,
      vehicle: fallback(options.vehicle),
      preferredTiming: fallback(options.preferredTiming),
      message: fallback(options.message),
      clientEmail: fallback(options.clientEmail),
      clientPhone: fallback(options.clientPhone),
      appointmentUrl: fallback(options.appointmentUrl),
    },
  });
}

export async function sendLeadAutoResponse(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  serviceInterest?: string | null;
  responseWindow: string;
}): Promise<void> {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "lead_auto_response",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      serviceInterest: fallback(options.serviceInterest),
      responseWindow: options.responseWindow,
    },
  });
}

export async function sendLeadFollowUpAlert(options: {
  to: string;
  businessId?: string | null;
  ownerName: string;
  businessName: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  vehicle?: string | null;
  serviceInterest?: string | null;
  summary?: string | null;
}): Promise<void> {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "lead_follow_up_alert",
    businessId: options.businessId,
    vars: {
      ownerName: options.ownerName,
      businessName: options.businessName,
      clientName: options.clientName,
      clientEmail: fallback(options.clientEmail),
      clientPhone: fallback(options.clientPhone),
      vehicle: fallback(options.vehicle),
      serviceInterest: fallback(options.serviceInterest),
      summary: fallback(options.summary),
    },
  });
}

export async function sendBookingRequestOwnerAlert(options: {
  to: string;
  businessId?: string | null;
  ownerName: string;
  businessName: string;
  clientName: string;
  requestedTiming?: string | null;
  serviceSummary?: string | null;
  vehicle?: string | null;
  flexibility?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  customerMessage?: string | null;
  requestUrl?: string | null;
}) {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "booking_request_owner_alert",
    businessId: options.businessId,
    vars: {
      ownerName: options.ownerName,
      businessName: options.businessName,
      clientName: options.clientName,
      requestedTiming: fallback(options.requestedTiming),
      serviceSummary: fallback(options.serviceSummary),
      vehicle: fallback(options.vehicle),
      flexibility: fallback(options.flexibility),
      clientEmail: fallback(options.clientEmail),
      clientPhone: fallback(options.clientPhone),
      customerMessage: fallback(options.customerMessage),
      requestUrl: optionalValue(options.requestUrl),
    },
  });
}

export async function sendBookingRequestReceived(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  requestedTiming?: string | null;
  serviceSummary?: string | null;
  vehicle?: string | null;
  message?: string | null;
  nextSteps: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}) {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "booking_request_received",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      requestedTiming: fallback(options.requestedTiming),
      serviceSummary: fallback(options.serviceSummary),
      vehicle: fallback(options.vehicle),
      message: fallback(options.message),
      nextSteps: fallback(options.nextSteps),
      ctaLabel: fallback(options.ctaLabel ?? "View request"),
      ctaUrl: optionalValue(options.ctaUrl),
    },
  });
}

export async function sendBookingRequestCustomerUpdate(options: {
  to: string;
  businessId?: string | null;
  businessName: string;
  clientName: string;
  subjectLine: string;
  eyebrow: string;
  title: string;
  intro: string;
  requestedTiming?: string | null;
  serviceSummary?: string | null;
  vehicle?: string | null;
  ownerMessage?: string | null;
  alternateOptions?: string | null;
  expiresAt?: string | null;
  nextSteps?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}) {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "booking_request_customer_update",
    businessId: options.businessId,
    vars: {
      subjectLine: options.subjectLine,
      businessName: options.businessName,
      eyebrow: options.eyebrow,
      title: options.title,
      intro: options.intro,
      clientName: options.clientName,
      requestedTiming: fallback(options.requestedTiming),
      serviceSummary: fallback(options.serviceSummary),
      vehicle: fallback(options.vehicle),
      ownerMessage: optionalValue(options.ownerMessage),
      alternateOptions: optionalValue(options.alternateOptions),
      expiresAt: fallback(options.expiresAt),
      nextSteps: fallback(options.nextSteps),
      ctaLabel: fallback(options.ctaLabel),
      ctaUrl: optionalValue(options.ctaUrl),
    },
  });
}

export async function sendBookingRequestOwnerUpdate(options: {
  to: string;
  businessId?: string | null;
  subjectLine: string;
  businessName: string;
  ownerName: string;
  eyebrow: string;
  title: string;
  intro: string;
  clientName: string;
  confirmedTiming?: string | null;
  requestedTiming?: string | null;
  serviceSummary?: string | null;
  vehicle?: string | null;
  customerMessage?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}) {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "booking_request_owner_update",
    businessId: options.businessId,
    vars: {
      subjectLine: options.subjectLine,
      businessName: options.businessName,
      ownerName: options.ownerName,
      eyebrow: options.eyebrow,
      title: options.title,
      intro: options.intro,
      clientName: options.clientName,
      confirmedTiming: fallback(options.confirmedTiming),
      requestedTiming: fallback(options.requestedTiming),
      serviceSummary: fallback(options.serviceSummary),
      vehicle: fallback(options.vehicle),
      customerMessage: fallback(options.customerMessage),
      ctaLabel: fallback(options.ctaLabel),
      ctaUrl: optionalValue(options.ctaUrl),
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
  portalUrl?: string | null;
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
      portalUrl: optionalValue(options.portalUrl),
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
  portalUrl?: string | null;
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
      portalUrl: optionalValue(options.portalUrl),
      message: optionalValue(options.message),
    },
  });
}

export async function sendQuoteRevisionRequestAlert(options: {
  to: string;
  businessId?: string | null;
  businessName: string;
  clientName: string;
  vehicle?: string | null;
  amount: string;
  requestDetails: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  quoteUrl?: string | null;
}) {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "quote_revision_request_alert",
    businessId: options.businessId,
    vars: {
      businessName: options.businessName,
      clientName: options.clientName,
      vehicle: fallback(options.vehicle),
      amount: options.amount,
      requestDetails: options.requestDetails,
      clientEmail: fallback(options.clientEmail),
      clientPhone: fallback(options.clientPhone),
      quoteUrl: fallback(options.quoteUrl),
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
  invoiceStatus?: string | null;
  invoiceUrl?: string | null;
  invoicePayUrl?: string | null;
  portalUrl?: string | null;
  message?: string | null;
}) {
  const primaryAction = resolveInvoiceEmailPrimaryAction({ invoiceUrl: options.invoiceUrl });
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
      invoicePayUrl: optionalValue(options.invoicePayUrl),
      invoicePrimaryUrl: primaryAction.url,
      invoicePrimaryLabel: primaryAction.label,
      invoiceDetailsCopy: primaryAction.detailsCopy,
      portalUrl: optionalValue(options.portalUrl),
      message: optionalValue(options.message),
    },
  });
}

export async function sendBillingTrialReminder(options: {
  to: string;
  businessId?: string | null;
  businessName: string;
  trialState: string;
  trialDetail: string;
  billingUrl: string;
}) {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "billing_trial_reminder",
    businessId: options.businessId,
    vars: {
      businessName: options.businessName,
      trialState: options.trialState,
      trialDetail: options.trialDetail,
      billingUrl: options.billingUrl,
    },
  });
}

export async function sendCustomerPortalEmail(options: {
  to: string;
  businessId?: string | null;
  clientName: string;
  businessName: string;
  portalUrl: string;
  message?: string | null;
}) {
  await sendTemplatedEmail({
    to: options.to,
    templateSlug: "customer_portal_link",
    businessId: options.businessId,
    vars: {
      clientName: options.clientName,
      businessName: options.businessName,
      portalUrl: options.portalUrl,
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
  if (!isEmailConfigured()) {
    logger.debug("Transactional email disabled: skip notification retries", { businessId });
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
