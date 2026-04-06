/**
 * Business-owned automations: appointment reminders, lapsed client outreach, and review requests.
 * These are safe-by-default and can be toggled per business from Settings.
 */

import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { activityLogs, appointments, businesses, clients, quotes, users, vehicles } from "../db/schema.js";
import { createActivityLog } from "./activity.js";
import {
  sendAppointmentReminder,
  sendLeadFollowUpAlert,
  sendLapsedClientReengagement,
  sendQuoteFollowUpEmail,
  sendReviewRequest,
} from "./email.js";
import { logger } from "./logger.js";
import { buildPublicAppUrl, buildPublicDocumentUrl, createPublicDocumentToken } from "./publicDocumentAccess.js";
import { buildVehicleDisplayName } from "./vehicleFormatting.js";
import { enqueueTwilioTemplateSms } from "./twilio.js";
import { parseLeadRecord } from "./leads.js";

const REMINDER_TYPES = new Set([
  "auto_detailing",
  "mobile_detailing",
  "wrap_ppf",
  "window_tinting",
  "performance",
  "mechanic",
  "tire_shop",
  "muffler_shop",
]);

const LAPSED_TYPES = new Set(REMINDER_TYPES);
const REVIEW_REQUEST_TYPES = new Set(REMINDER_TYPES);
const QUOTE_FOLLOW_UP_TYPES = new Set(REMINDER_TYPES);

const DEFAULT_TIMEZONE = "America/New_York";

function getBusinessTimezone(business: { timezone?: string | null }): string {
  return business.timezone ?? DEFAULT_TIMEZONE;
}

function formatBusinessDateTime(value: Date | null | undefined, timezone: string): string {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value);
}

function formatBusinessDate(value: Date | null | undefined, timezone: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(value);
}

function getBusinessHourInTimezone(value: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  }).format(value);
  const hour = Number.parseInt(formatted, 10);
  return Number.isNaN(hour) ? 0 : hour;
}

export function isWithinAutomationWindow(
  value: Date,
  timezone: string,
  startHourInput: number | null | undefined,
  endHourInput: number | null | undefined
): boolean {
  const startHour = Math.max(0, Math.min(Number(startHourInput ?? 8), 23));
  const endHour = Math.max(0, Math.min(Number(endHourInput ?? 18), 23));
  if (startHour === endHour) return false;
  const hour = getBusinessHourInTimezone(value, timezone);
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

async function hasAutomationActivity(action: string, entityType: string, entityId: string, since?: Date) {
  const conditions = [
    eq(activityLogs.action, action),
    eq(activityLogs.entityType, entityType),
    eq(activityLogs.entityId, entityId),
  ];
  if (since) conditions.push(gte(activityLogs.createdAt, since));
  const [existing] = await db
    .select({ id: activityLogs.id })
    .from(activityLogs)
    .where(and(...conditions))
    .limit(1);
  return !!existing;
}

async function recordAutomationSkip(input: {
  businessId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  dedupeSince?: Date;
}) {
  if (await hasAutomationActivity(input.action, input.entityType, input.entityId, input.dedupeSince)) {
    return;
  }
  await createActivityLog({
    businessId: input.businessId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata,
  });
}

export async function runAppointmentReminders(options?: {
  businessId?: string;
  force?: boolean;
}): Promise<{ sent: number }> {
  const where = options?.businessId ? eq(businesses.id, options.businessId) : sql`1=1`;
  const list = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      type: businesses.type,
      timezone: businesses.timezone,
      enabled: businesses.automationAppointmentRemindersEnabled,
      emailEnabled: businesses.notificationAppointmentReminderEmailEnabled,
      leadHours: businesses.automationAppointmentReminderHours,
      sendWindowStartHour: businesses.automationSendWindowStartHour,
      sendWindowEndHour: businesses.automationSendWindowEndHour,
    })
    .from(businesses)
    .where(where);

  let sent = 0;
  for (const business of list) {
    if (!REMINDER_TYPES.has(business.type) || !business.enabled) continue;

    const timezone = getBusinessTimezone(business);
    const now = new Date();
    if (
      !options?.force &&
      !isWithinAutomationWindow(now, timezone, business.sendWindowStartHour, business.sendWindowEndHour)
    ) {
      await recordAutomationSkip({
        businessId: business.id,
        action: "automation.appointment_reminder.skipped",
        entityType: "business",
        entityId: business.id,
        metadata: {
          reason: "outside_send_window",
          sendWindowStartHour: business.sendWindowStartHour ?? 8,
          sendWindowEndHour: business.sendWindowEndHour ?? 18,
        },
        dedupeSince: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      });
      continue;
    }
    const leadHours = Math.max(1, Math.min(Number(business.leadHours ?? 24), 336));
    const windowStart = options?.force
      ? now
      : new Date(now.getTime() + Math.max(leadHours - 1, 0) * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

    const rows = await db
      .select({
        id: appointments.id,
        clientId: appointments.clientId,
        title: appointments.title,
        startTime: appointments.startTime,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientEmail: clients.email,
        clientPhone: clients.phone,
        vehicleYear: vehicles.year,
        vehicleMake: vehicles.make,
        vehicleModel: vehicles.model,
      })
      .from(appointments)
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(vehicles, eq(appointments.vehicleId, vehicles.id))
      .where(
        and(
          eq(appointments.businessId, business.id),
          sql`${appointments.status} in ('scheduled', 'confirmed')`,
          gte(appointments.startTime, windowStart),
          lte(appointments.startTime, windowEnd)
        )
      )
      .orderBy(asc(appointments.startTime));

    for (const row of rows) {
      const channelsSent: string[] = [];
      if (!row.clientEmail && !row.clientPhone) continue;
      if (await hasAutomationActivity("automation.appointment_reminder.sent", "appointment", row.id)) {
        continue;
      }

      try {
        if (business.emailEnabled && row.clientEmail) {
          await sendAppointmentReminder({
            to: row.clientEmail,
            businessId: business.id,
            clientName:
              `${row.clientFirstName ?? ""} ${row.clientLastName ?? ""}`.trim() || "Customer",
            businessName: business.name,
            dateTime: formatBusinessDateTime(row.startTime, timezone),
            vehicle: buildVehicleDisplayName({
              year: row.vehicleYear,
              make: row.vehicleMake,
              model: row.vehicleModel,
            }),
            serviceSummary: row.title ?? null,
          });
          channelsSent.push("email");
        }
        void enqueueTwilioTemplateSms({
          businessId: business.id,
          templateSlug: "appointment_reminder",
          to: row.clientPhone,
          vars: {
            clientName:
              `${row.clientFirstName ?? ""} ${row.clientLastName ?? ""}`.trim() || "Customer",
            businessName: business.name,
            dateTime: formatBusinessDateTime(row.startTime, timezone),
            vehicle:
              buildVehicleDisplayName({
                year: row.vehicleYear,
                make: row.vehicleMake,
                model: row.vehicleModel,
              }) ?? "-",
            serviceSummary: row.title ?? "-",
          },
          entityType: "appointment",
          entityId: row.id,
        }).catch((error) => {
          logger.warn("Appointment reminder SMS enqueue failed", {
            businessId: business.id,
            appointmentId: row.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
        if (row.clientPhone) channelsSent.push("sms");
        if (channelsSent.length === 0) {
          await recordAutomationSkip({
            businessId: business.id,
            action: "automation.appointment_reminder.skipped",
            entityType: "appointment",
            entityId: row.id,
            metadata: { reason: "all_channels_disabled_or_missing" },
          });
          continue;
        }
        await createActivityLog({
          businessId: business.id,
          action: "automation.appointment_reminder.sent",
          entityType: "appointment",
          entityId: row.id,
          metadata: {
            clientId: row.clientId,
            leadHours,
            sentTo: row.clientEmail,
            phone: row.clientPhone,
            channels: channelsSent,
          },
        });
        sent += 1;
      } catch (error) {
        logger.warn("Appointment reminder automation failed", {
          businessId: business.id,
          appointmentId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { sent };
}

export async function runLapsedClientDetection(options?: {
  businessId?: string;
  force?: boolean;
}): Promise<{ detected: number }> {
  const where = options?.businessId ? eq(businesses.id, options.businessId) : sql`1=1`;
  const list = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      type: businesses.type,
      timezone: businesses.timezone,
      enabled: businesses.automationLapsedClientsEnabled,
      emailEnabled: businesses.notificationLapsedClientEmailEnabled,
      months: businesses.automationLapsedClientMonths,
      bookingRequestUrl: businesses.bookingRequestUrl,
      sendWindowStartHour: businesses.automationSendWindowStartHour,
      sendWindowEndHour: businesses.automationSendWindowEndHour,
    })
    .from(businesses)
    .where(where);

  let detected = 0;
  for (const business of list) {
    if (!LAPSED_TYPES.has(business.type) || !business.enabled) continue;
    const now = new Date();
    const bookingRequestUrl = business.bookingRequestUrl?.trim();
    if (!bookingRequestUrl) {
      logger.warn("Lapsed client automation skipped because booking link is missing", {
        businessId: business.id,
      });
      await recordAutomationSkip({
        businessId: business.id,
        action: "automation.lapsed_client.skipped",
        entityType: "business",
        entityId: business.id,
        metadata: { reason: "missing_booking_link" },
        dedupeSince: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      });
      continue;
    }

    const timezone = getBusinessTimezone(business);
    if (
      !options?.force &&
      !isWithinAutomationWindow(now, timezone, business.sendWindowStartHour, business.sendWindowEndHour)
    ) {
      await recordAutomationSkip({
        businessId: business.id,
        action: "automation.lapsed_client.skipped",
        entityType: "business",
        entityId: business.id,
        metadata: {
          reason: "outside_send_window",
          sendWindowStartHour: business.sendWindowStartHour ?? 8,
          sendWindowEndHour: business.sendWindowEndHour ?? 18,
        },
        dedupeSince: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      });
      continue;
    }
    const months = Math.max(1, Math.min(Number(business.months ?? 6), 36));
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const recentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const lastVisits = db
      .select({
        clientId: appointments.clientId,
        lastVisit: sql<Date | null>`max(coalesce(${appointments.completedAt}, ${appointments.startTime}))`.as(
          "last_visit"
        ),
      })
      .from(appointments)
      .where(eq(appointments.businessId, business.id))
      .groupBy(appointments.clientId)
      .as("last_visits");

    const rows = await db
      .select({
        id: clients.id,
        firstName: clients.firstName,
        lastName: clients.lastName,
        email: clients.email,
        phone: clients.phone,
        lastVisit: lastVisits.lastVisit,
      })
      .from(clients)
      .leftJoin(lastVisits, eq(lastVisits.clientId, clients.id))
      .where(
        and(
          eq(clients.businessId, business.id),
          eq(clients.marketingOptIn, true),
          or(sql`${lastVisits.lastVisit} is null`, lte(lastVisits.lastVisit, cutoff))
        )
      )
      .orderBy(desc(lastVisits.lastVisit), asc(clients.lastName), asc(clients.firstName))
      .limit(options?.force ? 100 : 50);

    for (const row of rows) {
      const channelsSent: string[] = [];
      if (!row.email && !row.phone) continue;
      if (await hasAutomationActivity("automation.lapsed_client.sent", "client", row.id, recentCutoff)) {
        continue;
      }

      try {
        if (business.emailEnabled && row.email) {
          await sendLapsedClientReengagement({
            to: row.email,
            businessId: business.id,
            clientName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Customer",
            businessName: business.name,
            lastVisit: formatBusinessDate(row.lastVisit, timezone),
            bookUrl: bookingRequestUrl,
            serviceSummary: null,
          });
          channelsSent.push("email");
        }
        void enqueueTwilioTemplateSms({
          businessId: business.id,
          templateSlug: "lapsed_client_reengagement",
          to: row.phone,
          vars: {
            clientName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Customer",
            businessName: business.name,
            lastVisit: formatBusinessDate(row.lastVisit, timezone) ?? "-",
            bookUrl: bookingRequestUrl,
            serviceSummary: "-",
          },
          entityType: "client",
          entityId: row.id,
        }).catch((error) => {
          logger.warn("Lapsed client SMS enqueue failed", {
            businessId: business.id,
            clientId: row.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
        if (row.phone) channelsSent.push("sms");
        if (channelsSent.length === 0) {
          await recordAutomationSkip({
            businessId: business.id,
            action: "automation.lapsed_client.skipped",
            entityType: "client",
            entityId: row.id,
            metadata: { reason: "all_channels_disabled_or_missing" },
            dedupeSince: recentCutoff,
          });
          continue;
        }
        await createActivityLog({
          businessId: business.id,
          action: "automation.lapsed_client.sent",
          entityType: "client",
          entityId: row.id,
          metadata: {
            sentTo: row.email,
            phone: row.phone,
            channels: channelsSent,
            months,
            lastVisit: row.lastVisit?.toISOString() ?? null,
          },
        });
        detected += 1;
      } catch (error) {
        logger.warn("Lapsed client automation failed", {
          businessId: business.id,
          clientId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { detected };
}

export async function runReviewRequests(options?: {
  businessId?: string;
  force?: boolean;
}): Promise<{ sent: number }> {
  const where = options?.businessId ? eq(businesses.id, options.businessId) : sql`1=1`;
  const list = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      type: businesses.type,
      timezone: businesses.timezone,
      enabled: businesses.automationReviewRequestsEnabled,
      emailEnabled: businesses.notificationReviewRequestEmailEnabled,
      delayHours: businesses.automationReviewRequestDelayHours,
      reviewRequestUrl: businesses.reviewRequestUrl,
      sendWindowStartHour: businesses.automationSendWindowStartHour,
      sendWindowEndHour: businesses.automationSendWindowEndHour,
    })
    .from(businesses)
    .where(where);

  let sent = 0;
  for (const business of list) {
    if (!REVIEW_REQUEST_TYPES.has(business.type) || !business.enabled) continue;
    const now = new Date();
    const reviewRequestUrl = business.reviewRequestUrl?.trim();
    if (!reviewRequestUrl) {
      logger.warn("Review request automation skipped because review link is missing", {
        businessId: business.id,
      });
      await recordAutomationSkip({
        businessId: business.id,
        action: "automation.review_request.skipped",
        entityType: "business",
        entityId: business.id,
        metadata: { reason: "missing_review_link" },
        dedupeSince: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      });
      continue;
    }

    const delayHours = Math.max(1, Math.min(Number(business.delayHours ?? 24), 336));
    const timezone = getBusinessTimezone(business);
    if (
      !options?.force &&
      !isWithinAutomationWindow(now, timezone, business.sendWindowStartHour, business.sendWindowEndHour)
    ) {
      await recordAutomationSkip({
        businessId: business.id,
        action: "automation.review_request.skipped",
        entityType: "business",
        entityId: business.id,
        metadata: {
          reason: "outside_send_window",
          sendWindowStartHour: business.sendWindowStartHour ?? 8,
          sendWindowEndHour: business.sendWindowEndHour ?? 18,
        },
        dedupeSince: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      });
      continue;
    }
    const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000);

    const rows = await db
      .select({
        id: appointments.id,
        title: appointments.title,
        completedAt: appointments.completedAt,
        clientId: appointments.clientId,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientEmail: clients.email,
        clientPhone: clients.phone,
      })
      .from(appointments)
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .where(
        and(
          eq(appointments.businessId, business.id),
          eq(appointments.status, "completed"),
          lte(appointments.completedAt, cutoff),
          eq(clients.marketingOptIn, true)
        )
      )
      .orderBy(desc(appointments.completedAt))
      .limit(options?.force ? 100 : 50);

    for (const row of rows) {
      const channelsSent: string[] = [];
      if (!row.clientEmail && !row.clientPhone) continue;
      if (await hasAutomationActivity("automation.review_request.sent", "appointment", row.id)) {
        continue;
      }

      try {
        if (business.emailEnabled && row.clientEmail) {
          await sendReviewRequest({
            to: row.clientEmail,
            businessId: business.id,
            clientName:
              `${row.clientFirstName ?? ""} ${row.clientLastName ?? ""}`.trim() || "Customer",
            businessName: business.name,
            reviewUrl: reviewRequestUrl,
            serviceSummary: row.title ?? null,
          });
          channelsSent.push("email");
        }
        void enqueueTwilioTemplateSms({
          businessId: business.id,
          templateSlug: "review_request",
          to: row.clientPhone,
          vars: {
            clientName:
              `${row.clientFirstName ?? ""} ${row.clientLastName ?? ""}`.trim() || "Customer",
            businessName: business.name,
            reviewUrl: reviewRequestUrl,
            serviceSummary: row.title ?? "-",
          },
          entityType: "appointment",
          entityId: row.id,
        }).catch((error) => {
          logger.warn("Review request SMS enqueue failed", {
            businessId: business.id,
            appointmentId: row.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
        if (row.clientPhone) channelsSent.push("sms");
        if (channelsSent.length === 0) {
          await recordAutomationSkip({
            businessId: business.id,
            action: "automation.review_request.skipped",
            entityType: "appointment",
            entityId: row.id,
            metadata: { reason: "all_channels_disabled_or_missing" },
          });
          continue;
        }
        await createActivityLog({
          businessId: business.id,
          action: "automation.review_request.sent",
          entityType: "appointment",
          entityId: row.id,
          metadata: {
            clientId: row.clientId,
            delayHours,
            sentTo: row.clientEmail,
            phone: row.clientPhone,
            channels: channelsSent,
          },
        });
        sent += 1;
      } catch (error) {
        logger.warn("Review request automation failed", {
          businessId: business.id,
          appointmentId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { sent };
}

export async function runAbandonedQuoteFollowUps(options?: {
  businessId?: string;
  force?: boolean;
}): Promise<{ sent: number }> {
  const where = options?.businessId ? eq(businesses.id, options.businessId) : sql`1=1`;
  const list = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      type: businesses.type,
      timezone: businesses.timezone,
      enabled: businesses.automationAbandonedQuotesEnabled,
      emailEnabled: businesses.notificationAbandonedQuoteEmailEnabled,
      delayHours: businesses.automationAbandonedQuoteHours,
      sendWindowStartHour: businesses.automationSendWindowStartHour,
      sendWindowEndHour: businesses.automationSendWindowEndHour,
    })
    .from(businesses)
    .where(where);

  let sent = 0;
  for (const business of list) {
    if (!QUOTE_FOLLOW_UP_TYPES.has(business.type) || !business.enabled) continue;

    const now = new Date();
    const timezone = getBusinessTimezone(business);
    if (
      !options?.force &&
      !isWithinAutomationWindow(now, timezone, business.sendWindowStartHour, business.sendWindowEndHour)
    ) {
      await recordAutomationSkip({
        businessId: business.id,
        action: "automation.abandoned_quote.skipped",
        entityType: "business",
        entityId: business.id,
        metadata: {
          reason: "outside_send_window",
          sendWindowStartHour: business.sendWindowStartHour ?? 8,
          sendWindowEndHour: business.sendWindowEndHour ?? 18,
        },
        dedupeSince: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      });
      continue;
    }

    const delayHours = Math.max(1, Math.min(Number(business.delayHours ?? 48), 336));
    const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000);

    const rows = await db
      .select({
        id: quotes.id,
        clientId: quotes.clientId,
        sentAt: quotes.sentAt,
        total: quotes.total,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientEmail: clients.email,
        vehicleYear: vehicles.year,
        vehicleMake: vehicles.make,
        vehicleModel: vehicles.model,
      })
      .from(quotes)
      .leftJoin(clients, eq(quotes.clientId, clients.id))
      .leftJoin(vehicles, eq(quotes.vehicleId, vehicles.id))
      .where(
        and(
          eq(quotes.businessId, business.id),
          eq(quotes.status, "sent"),
          isNull(quotes.followUpSentAt),
          lte(quotes.sentAt, cutoff),
          sql`${clients.email} is not null`
        )
      )
      .orderBy(asc(quotes.sentAt))
      .limit(options?.force ? 100 : 50);

    for (const row of rows) {
      if (!business.emailEnabled) {
        await recordAutomationSkip({
          businessId: business.id,
          action: "automation.abandoned_quote.skipped",
          entityType: "quote",
          entityId: row.id,
          metadata: { reason: "email_disabled" },
          dedupeSince: cutoff,
        });
        continue;
      }
      if (!row.clientEmail) {
        await recordAutomationSkip({
          businessId: business.id,
          action: "automation.abandoned_quote.skipped",
          entityType: "quote",
          entityId: row.id,
          metadata: { reason: "missing_email" },
          dedupeSince: cutoff,
        });
        continue;
      }
      if (await hasAutomationActivity("automation.abandoned_quote.sent", "quote", row.id)) {
        continue;
      }

      try {
        const publicToken = createPublicDocumentToken({
          kind: "quote",
          entityId: row.id,
          businessId: business.id,
        });
        await sendQuoteFollowUpEmail({
          to: row.clientEmail,
          businessId: business.id,
          clientName: `${row.clientFirstName ?? ""} ${row.clientLastName ?? ""}`.trim() || "Customer",
          businessName: business.name,
          amount: Number(row.total ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" }),
          vehicle: buildVehicleDisplayName({
            year: row.vehicleYear,
            make: row.vehicleMake,
            model: row.vehicleModel,
          }),
          quoteUrl: buildPublicDocumentUrl(`/api/quotes/${row.id}/public-html?token=${encodeURIComponent(publicToken)}`),
          portalUrl: buildPublicAppUrl(`/portal/${encodeURIComponent(publicToken)}`),
          message: null,
        });
        const followUpSentAt = new Date();
        await db
          .update(quotes)
          .set({ followUpSentAt, updatedAt: followUpSentAt })
          .where(and(eq(quotes.id, row.id), eq(quotes.businessId, business.id)));
        await createActivityLog({
          businessId: business.id,
          action: "automation.abandoned_quote.sent",
          entityType: "quote",
          entityId: row.id,
          metadata: {
            clientId: row.clientId,
            sentTo: row.clientEmail,
            delayHours,
            followUpSentAt: followUpSentAt.toISOString(),
            sentAt: row.sentAt?.toISOString() ?? null,
          },
        });
        sent += 1;
      } catch (error) {
        logger.warn("Abandoned quote automation failed", {
          businessId: business.id,
          quoteId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { sent };
}

export async function runUncontactedLeadReminders(options?: {
  businessId?: string;
  force?: boolean;
}): Promise<{ sent: number }> {
  const where = options?.businessId ? eq(businesses.id, options.businessId) : sql`1=1`;
  const list = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      timezone: businesses.timezone,
      enabled: businesses.automationUncontactedLeadsEnabled,
      reminderHours: businesses.automationUncontactedLeadHours,
      sendWindowStartHour: businesses.automationSendWindowStartHour,
      sendWindowEndHour: businesses.automationSendWindowEndHour,
      ownerEmail: users.email,
      ownerFirstName: users.firstName,
      businessEmail: businesses.email,
    })
    .from(businesses)
    .leftJoin(users, eq(users.id, businesses.ownerId))
    .where(where);

  let sent = 0;
  for (const business of list) {
    if (!business.enabled) continue;
    const now = new Date();
    const timezone = getBusinessTimezone(business);
    if (
      !options?.force &&
      !isWithinAutomationWindow(now, timezone, business.sendWindowStartHour, business.sendWindowEndHour)
    ) {
      await recordAutomationSkip({
        businessId: business.id,
        action: "automation.uncontacted_lead.skipped",
        entityType: "business",
        entityId: business.id,
        metadata: {
          reason: "outside_send_window",
          sendWindowStartHour: business.sendWindowStartHour ?? 8,
          sendWindowEndHour: business.sendWindowEndHour ?? 18,
        },
        dedupeSince: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      });
      continue;
    }

    const recipient = business.businessEmail?.trim() || business.ownerEmail?.trim() || "";
    if (!recipient) {
      await recordAutomationSkip({
        businessId: business.id,
        action: "automation.uncontacted_lead.skipped",
        entityType: "business",
        entityId: business.id,
        metadata: { reason: "missing_follow_up_recipient" },
        dedupeSince: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      });
      continue;
    }

    const reminderHours = Math.max(1, Math.min(Number(business.reminderHours ?? 2), 168));
    const cutoff = new Date(Date.now() - reminderHours * 60 * 60 * 1000);
    const rows = await db
      .select({
        id: clients.id,
        createdAt: clients.createdAt,
        firstName: clients.firstName,
        lastName: clients.lastName,
        email: clients.email,
        phone: clients.phone,
        notes: clients.notes,
      })
      .from(clients)
      .where(and(eq(clients.businessId, business.id), lte(clients.createdAt, cutoff)))
      .orderBy(asc(clients.createdAt))
      .limit(options?.force ? 100 : 25);

    for (const row of rows) {
      const lead = parseLeadRecord(row.notes);
      if (!lead.isLead || lead.status !== "new") continue;
      if (await hasAutomationActivity("automation.uncontacted_lead.sent", "client", row.id, cutoff)) {
        continue;
      }

      try {
        await sendLeadFollowUpAlert({
          to: recipient,
          businessId: business.id,
          businessName: business.name,
          ownerName: business.ownerFirstName?.trim() || "Team",
          clientName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "New lead",
          clientEmail: row.email,
          clientPhone: row.phone,
          vehicle: lead.vehicle || null,
          serviceInterest: lead.serviceInterest || null,
          summary: lead.summary || null,
        });
        await createActivityLog({
          businessId: business.id,
          action: "automation.uncontacted_lead.sent",
          entityType: "client",
          entityId: row.id,
          metadata: {
            sentTo: recipient,
            reminderHours,
            leadCreatedAt: row.createdAt.toISOString(),
          },
        });
        sent += 1;
      } catch (error) {
        logger.warn("Uncontacted lead reminder automation failed", {
          businessId: business.id,
          clientId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { sent };
}
