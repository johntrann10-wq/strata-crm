import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { appointmentSources, notifications } from "../db/schema.js";
import { logger } from "./logger.js";

export type NotificationBucket = "leads" | "calendar" | "other";

type NotificationInput = {
  businessId: string;
  userId?: string | null;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  bucket?: NotificationBucket;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string | null;
};

type AppointmentSourceInput = {
  appointmentId: string;
  businessId: string;
  sourceType: "lead" | "booking_request";
  leadClientId?: string | null;
  bookingRequestId?: string | null;
  metadata?: Record<string, unknown> | null;
};

let ensureInfrastructurePromise: Promise<void> | null = null;

function normalizeNotificationBucket(value: string | null | undefined): NotificationBucket {
  if (value === "leads" || value === "calendar" || value === "other") return value;
  return "other";
}

function normalizeNotificationMetadata(input: NotificationInput): Record<string, unknown> {
  return {
    ...(input.metadata ?? {}),
    notificationBucket: normalizeNotificationBucket(input.bucket),
    dedupeKey: input.dedupeKey?.trim() || null,
  };
}

export async function ensureNotificationInfrastructure(): Promise<void> {
  if (ensureInfrastructurePromise) return ensureInfrastructurePromise;

  ensureInfrastructurePromise = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        type text NOT NULL,
        title text NOT NULL,
        message text NOT NULL,
        entity_type text DEFAULT NULL,
        entity_id uuid DEFAULT NULL,
        is_read boolean NOT NULL DEFAULT false,
        metadata text NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notifications_business_id_idx
      ON notifications (business_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notifications_user_id_idx
      ON notifications (user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notifications_is_read_idx
      ON notifications (is_read)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notifications_created_at_desc_idx
      ON notifications (created_at DESC)
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS appointment_sources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        source_type text NOT NULL,
        lead_client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
        booking_request_id uuid REFERENCES booking_requests(id) ON DELETE SET NULL,
        metadata text NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS appointment_sources_appointment_unique
      ON appointment_sources (appointment_id)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS appointment_sources_booking_request_unique
      ON appointment_sources (booking_request_id)
      WHERE booking_request_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS appointment_sources_business_id_idx
      ON appointment_sources (business_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS appointment_sources_lead_client_id_idx
      ON appointment_sources (lead_client_id)
    `);
  })().catch((error) => {
    ensureInfrastructurePromise = null;
    throw error;
  });

  return ensureInfrastructurePromise;
}

export async function createNotification(input: NotificationInput) {
  await ensureNotificationInfrastructure();

  const metadata = normalizeNotificationMetadata(input);
  const dedupeKey = typeof metadata.dedupeKey === "string" ? metadata.dedupeKey.trim() : "";
  const visibilityFilter = input.userId ? eq(notifications.userId, input.userId) : isNull(notifications.userId);
  const entityTypeFilter = input.entityType ? eq(notifications.entityType, input.entityType) : isNull(notifications.entityType);
  const entityIdFilter = input.entityId ? eq(notifications.entityId, input.entityId) : isNull(notifications.entityId);

  if (dedupeKey) {
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.businessId, input.businessId),
          visibilityFilter,
          eq(notifications.type, input.type),
          entityTypeFilter,
          entityIdFilter,
          sql`coalesce(${notifications.metadata}::json->>'dedupeKey', '') = ${dedupeKey}`
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(1);

    if (existing) return existing;
  }

  const now = new Date();
  const [created] = await db
    .insert(notifications)
    .values({
      businessId: input.businessId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      isRead: false,
      metadata: JSON.stringify(metadata),
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: notifications.id,
      createdAt: notifications.createdAt,
    });

  return created ?? null;
}

export async function safeCreateNotification(
  input: NotificationInput,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    await createNotification(input);
  } catch (error) {
    logger.warn("Notification creation skipped after write failure", {
      businessId: input.businessId,
      type: input.type,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function upsertAppointmentSourceLink(input: AppointmentSourceInput): Promise<void> {
  await ensureNotificationInfrastructure();

  const now = new Date();
  await db
    .insert(appointmentSources)
    .values({
      appointmentId: input.appointmentId,
      businessId: input.businessId,
      sourceType: input.sourceType,
      leadClientId: input.leadClientId ?? null,
      bookingRequestId: input.bookingRequestId ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appointmentSources.appointmentId,
      set: {
        businessId: input.businessId,
        sourceType: input.sourceType,
        leadClientId: input.leadClientId ?? null,
        bookingRequestId: input.bookingRequestId ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
        updatedAt: now,
      },
    });
}

export async function getVisibleUnreadNotificationCounts(params: {
  businessId: string;
  userId?: string | null;
}): Promise<{ total: number; leads: number; calendar: number }> {
  await ensureNotificationInfrastructure();

  const visibilityFilter = params.userId
    ? or(isNull(notifications.userId), eq(notifications.userId, params.userId))
    : isNull(notifications.userId);

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      leads: sql<number>`count(*) filter (where coalesce(${notifications.metadata}::json->>'notificationBucket', 'other') = 'leads')::int`,
      calendar: sql<number>`count(*) filter (where coalesce(${notifications.metadata}::json->>'notificationBucket', 'other') = 'calendar')::int`,
    })
    .from(notifications)
    .where(and(eq(notifications.businessId, params.businessId), visibilityFilter, eq(notifications.isRead, false)));

  return {
    total: Number(counts?.total ?? 0),
    leads: Number(counts?.leads ?? 0),
    calendar: Number(counts?.calendar ?? 0),
  };
}
