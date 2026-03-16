/**
 * Business-type-aware automations: reminders, lapsed client detection, review requests.
 * Only run for relevant business types; respect timezone and marketing opt-in.
 */

import { db } from "../db/index.js";
import { businesses, appointments, clients } from "../db/schema.js";
import { eq, and, sql, gt, isNull } from "drizzle-orm";
import { logger } from "./logger.js";

/** Business types that get appointment reminders (scheduled/confirmed appointments) */
const REMINDER_TYPES = new Set([
  "auto_detailing",
  "mobile_detailing",
  "ppf_ceramic",
  "tint_shop",
  "mechanic",
  "tire_shop",
  "car_wash",
  "wrap_shop",
  "dealership_service",
  "body_shop",
  "other_auto_service",
]);

/** Business types that get lapsed client detection and outreach */
const LAPSED_TYPES = new Set([
  "auto_detailing",
  "mobile_detailing",
  "ppf_ceramic",
  "tint_shop",
  "mechanic",
  "wrap_shop",
  "dealership_service",
  "body_shop",
  "other_auto_service",
]);

/** Business types that get post-visit review requests */
const REVIEW_REQUEST_TYPES = new Set([
  "auto_detailing",
  "mobile_detailing",
  "ppf_ceramic",
  "tint_shop",
  "car_wash",
  "wrap_shop",
  "dealership_service",
  "body_shop",
  "other_auto_service",
]);

function getBusinessTimezone(business: { timezone?: string | null }): string {
  return business.timezone ?? "America/New_York";
}

/**
 * Run appointment reminders for businesses that have this feature.
 * Only for active appointment types (scheduled, confirmed); respects business timezone.
 * In production this would be called by a cron at e.g. 8am in each timezone.
 */
export async function runAppointmentReminders(options?: { businessId?: string }): Promise<{ sent: number }> {
  const where = options?.businessId
    ? eq(businesses.id, options.businessId)
    : sql`1=1`;
  const list = await db
    .select({ id: businesses.id, type: businesses.type, timezone: businesses.timezone })
    .from(businesses)
    .where(where);

  let sent = 0;
  for (const b of list) {
    if (!REMINDER_TYPES.has(b.type)) continue;
    const tz = getBusinessTimezone(b);
    // TODO: filter appointments by status (scheduled, confirmed) and send time in tz
    logger.info("Appointment reminders run (stub)", { businessId: b.id, timezone: tz });
    sent += 0;
  }
  return { sent };
}

/**
 * Run lapsed client detection for relevant business types.
 * Respects marketing opt-in when sending outreach (clients.marketingOptIn).
 */
export async function runLapsedClientDetection(options?: { businessId?: string }): Promise<{ detected: number }> {
  const where = options?.businessId
    ? eq(businesses.id, options.businessId)
    : sql`1=1`;
  const list = await db
    .select({ id: businesses.id, type: businesses.type, timezone: businesses.timezone })
    .from(businesses)
    .where(where);

  let detected = 0;
  for (const b of list) {
    if (!LAPSED_TYPES.has(b.type)) continue;
    const tz = getBusinessTimezone(b);
    // TODO: compute last visit per client, expected interval, flag lapsed; only include clients with marketingOptIn for outreach
    logger.info("Lapsed client detection run (stub)", { businessId: b.id, timezone: tz });
    detected += 0;
  }
  return { detected };
}

/**
 * Run post-visit review requests for completed appointments.
 * Only for business types that use reviews; respects timezone and marketing opt-in.
 */
export async function runReviewRequests(options?: { businessId?: string }): Promise<{ sent: number }> {
  const where = options?.businessId
    ? eq(businesses.id, options.businessId)
    : sql`1=1`;
  const list = await db
    .select({ id: businesses.id, type: businesses.type, timezone: businesses.timezone })
    .from(businesses)
    .where(where);

  let sent = 0;
  for (const b of list) {
    if (!REVIEW_REQUEST_TYPES.has(b.type)) continue;
    const tz = getBusinessTimezone(b);
    // TODO: find completed appointments without reviewRequestSent, and clients with marketingOptIn; send review request
    logger.info("Review requests run (stub)", { businessId: b.id, timezone: tz });
    sent += 0;
  }
  return { sent };
}
