/**
 * Business-owned automations: appointment reminders, lapsed client outreach, and review requests.
 * These are safe-by-default and can be toggled per business from Settings.
 */

import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { activityLogs, appointments, businesses, clients, vehicles } from "../db/schema.js";
import { createActivityLog } from "./activity.js";
import {
  sendAppointmentReminder,
  sendLapsedClientReengagement,
  sendReviewRequest,
} from "./email.js";
import { logger } from "./logger.js";
import { buildVehicleDisplayName } from "./vehicleFormatting.js";

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
      leadHours: businesses.automationAppointmentReminderHours,
    })
    .from(businesses)
    .where(where);

  let sent = 0;
  for (const business of list) {
    if (!REMINDER_TYPES.has(business.type) || !business.enabled) continue;

    const timezone = getBusinessTimezone(business);
    const leadHours = Math.max(1, Math.min(Number(business.leadHours ?? 24), 336));
    const now = new Date();
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
          lte(appointments.startTime, windowEnd),
          sql`${clients.email} is not null`
        )
      )
      .orderBy(asc(appointments.startTime));

    for (const row of rows) {
      if (!row.clientEmail) continue;
      if (await hasAutomationActivity("automation.appointment_reminder.sent", "appointment", row.id)) {
        continue;
      }

      try {
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
        await createActivityLog({
          businessId: business.id,
          action: "automation.appointment_reminder.sent",
          entityType: "appointment",
          entityId: row.id,
          metadata: {
            clientId: row.clientId,
            leadHours,
            sentTo: row.clientEmail,
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
      months: businesses.automationLapsedClientMonths,
    })
    .from(businesses)
    .where(where);

  let detected = 0;
  for (const business of list) {
    if (!LAPSED_TYPES.has(business.type) || !business.enabled) continue;

    const timezone = getBusinessTimezone(business);
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
        lastVisit: lastVisits.lastVisit,
      })
      .from(clients)
      .leftJoin(lastVisits, eq(lastVisits.clientId, clients.id))
      .where(
        and(
          eq(clients.businessId, business.id),
          eq(clients.marketingOptIn, true),
          sql`${clients.email} is not null`,
          or(sql`${lastVisits.lastVisit} is null`, lte(lastVisits.lastVisit, cutoff))
        )
      )
      .orderBy(desc(lastVisits.lastVisit), asc(clients.lastName), asc(clients.firstName))
      .limit(options?.force ? 100 : 50);

    for (const row of rows) {
      if (!row.email) continue;
      if (await hasAutomationActivity("automation.lapsed_client.sent", "client", row.id, recentCutoff)) {
        continue;
      }

      try {
        await sendLapsedClientReengagement({
          to: row.email,
          businessId: business.id,
          clientName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Customer",
          businessName: business.name,
          lastVisit: formatBusinessDate(row.lastVisit, timezone),
          bookUrl: null,
          serviceSummary: null,
        });
        await createActivityLog({
          businessId: business.id,
          action: "automation.lapsed_client.sent",
          entityType: "client",
          entityId: row.id,
          metadata: {
            sentTo: row.email,
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
      delayHours: businesses.automationReviewRequestDelayHours,
      reviewRequestUrl: businesses.reviewRequestUrl,
    })
    .from(businesses)
    .where(where);

  let sent = 0;
  for (const business of list) {
    if (!REVIEW_REQUEST_TYPES.has(business.type) || !business.enabled) continue;
    const reviewRequestUrl = business.reviewRequestUrl?.trim();
    if (!reviewRequestUrl) {
      logger.warn("Review request automation skipped because review link is missing", {
        businessId: business.id,
      });
      continue;
    }

    const delayHours = Math.max(1, Math.min(Number(business.delayHours ?? 24), 336));
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
      })
      .from(appointments)
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .where(
        and(
          eq(appointments.businessId, business.id),
          eq(appointments.status, "completed"),
          lte(appointments.completedAt, cutoff),
          eq(clients.marketingOptIn, true),
          sql`${clients.email} is not null`
        )
      )
      .orderBy(desc(appointments.completedAt))
      .limit(options?.force ? 100 : 50);

    for (const row of rows) {
      if (!row.clientEmail) continue;
      if (await hasAutomationActivity("automation.review_request.sent", "appointment", row.id)) {
        continue;
      }

      try {
        await sendReviewRequest({
          to: row.clientEmail,
          businessId: business.id,
          clientName:
            `${row.clientFirstName ?? ""} ${row.clientLastName ?? ""}`.trim() || "Customer",
          businessName: business.name,
          reviewUrl: reviewRequestUrl,
          serviceSummary: row.title ?? null,
        });
        await createActivityLog({
          businessId: business.id,
          action: "automation.review_request.sent",
          entityType: "appointment",
          entityId: row.id,
          metadata: {
            clientId: row.clientId,
            delayHours,
            sentTo: row.clientEmail,
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
