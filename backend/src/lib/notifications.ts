import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { appointmentSources, notificationPushDevices, notifications } from "../db/schema.js";
import { isApnsConfigured, sendApnsAlert } from "./apns.js";
import { logger } from "./logger.js";

export type NotificationBucket = "leads" | "calendar" | "finance" | "other";
export type NotificationScope = "leads" | "calendar" | "finance" | "general";

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

function normalizeNotificationBucket(value: string | null | undefined): NotificationBucket | null {
  if (value === "leads" || value === "calendar" || value === "finance" || value === "other") return value;
  return null;
}

function parseEnabledPushBuckets(value: string | null | undefined): Set<NotificationBucket> {
  if (!value?.trim()) return new Set(["leads", "calendar", "finance"]);
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Set(["leads", "calendar", "finance"]);
    const buckets = parsed
      .map((item) => normalizeNotificationBucket(typeof item === "string" ? item : null))
      .filter((item): item is NotificationBucket => Boolean(item) && item !== "other");
    return buckets.length > 0 ? new Set(buckets) : new Set(["leads", "calendar", "finance"]);
  } catch {
    return new Set(["leads", "calendar", "finance"]);
  }
}

export function parseNotificationMetadata(metadata: string | null | undefined): Record<string, unknown> {
  if (!metadata?.trim()) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function getNotificationScope(input: {
  type?: string | null;
  entityType?: string | null;
  metadata?: Record<string, unknown> | null;
  bucket?: string | null;
}): NotificationScope {
  const metadata = input.metadata ?? {};
  const bucket =
    normalizeNotificationBucket(input.bucket) ??
    normalizeNotificationBucket(
      typeof metadata.notificationBucket === "string"
        ? metadata.notificationBucket
        : typeof metadata.bucket === "string"
          ? metadata.bucket
          : null
    );

  if (bucket === "leads") return "leads";
  if (bucket === "calendar") return "calendar";
  if (bucket === "finance") return "finance";
  if (bucket === "other") return "general";

  if (
    input.entityType === "booking_request" ||
    input.entityType === "client" ||
    input.type === "new_lead" ||
    input.type?.startsWith("lead_") ||
    input.type?.startsWith("booking_request")
  ) {
    return "leads";
  }

  if (input.entityType === "appointment" || input.type?.startsWith("appointment_")) {
    return "calendar";
  }

  if (
    input.entityType === "invoice" ||
    input.entityType === "payment" ||
    input.type === "payment_received"
  ) {
    return "finance";
  }

  return "general";
}

function resolveNotificationBucket(input: NotificationInput): NotificationBucket {
  const scope = getNotificationScope({
    type: input.type,
    entityType: input.entityType,
    metadata: input.metadata ?? null,
    bucket: input.bucket ?? null,
  });
  return scope === "general" ? "other" : scope;
}

function normalizeNotificationMetadata(input: NotificationInput): Record<string, unknown> {
  return {
    ...(input.metadata ?? {}),
    notificationBucket: resolveNotificationBucket(input),
    dedupeKey: input.dedupeKey?.trim() || null,
  };
}

function buildNotificationDedupeLockKey(input: NotificationInput, dedupeKey: string): string {
  return [
    input.businessId,
    input.userId ?? "*",
    input.type,
    input.entityType ?? "*",
    input.entityId ?? "*",
    dedupeKey,
  ].join(":");
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
      CREATE TABLE IF NOT EXISTS notification_push_devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform text NOT NULL DEFAULT 'ios',
        device_token text NOT NULL,
        app_bundle_id text NOT NULL DEFAULT 'app.stratacrm.mobile',
        enabled boolean NOT NULL DEFAULT true,
        enabled_buckets text NOT NULL DEFAULT '["leads","calendar","finance"]',
        authorization_status text,
        last_registered_at timestamptz,
        last_delivered_at timestamptz,
        last_failed_at timestamptz,
        failure_count integer NOT NULL DEFAULT 0,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS notification_push_devices_business_user_token_unique
      ON notification_push_devices (business_id, user_id, device_token)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notification_push_devices_business_id_idx
      ON notification_push_devices (business_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notification_push_devices_user_id_idx
      ON notification_push_devices (user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS notification_push_devices_enabled_idx
      ON notification_push_devices (enabled)
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

  const insertValues = {
    businessId: input.businessId,
    userId: input.userId ?? null,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    isRead: false,
    metadata: JSON.stringify(metadata),
  };

  if (!dedupeKey) {
    const now = new Date();
    const [created] = await db
      .insert(notifications)
      .values({
        ...insertValues,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: notifications.id,
        createdAt: notifications.createdAt,
      });
    if (created) {
      queueNativePushDelivery(input, created.id);
    }
    return created ?? null;
  }

  const result = await db.transaction(async (tx) => {
    const lockKey = buildNotificationDedupeLockKey(input, dedupeKey);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.businessId}), hashtext(${lockKey}))`
    );

    const [existing] = await tx
      .select({ id: notifications.id, createdAt: notifications.createdAt })
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

    if (existing) return { notification: existing, created: false };

    const now = new Date();
    const [created] = await tx
      .insert(notifications)
      .values({
        ...insertValues,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: notifications.id,
        createdAt: notifications.createdAt,
      });

    return { notification: created ?? null, created: Boolean(created) };
  });

  if (result.notification && result.created) {
    queueNativePushDelivery(input, result.notification.id);
  }

  return result.notification;
}

function queueNativePushDelivery(input: NotificationInput, notificationId: string): void {
  if (!isApnsConfigured()) return;
  void deliverNativePushNotification(input, notificationId).catch((error) => {
    logger.warn("Native push delivery skipped after APNs failure", {
      businessId: input.businessId,
      type: input.type,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function deliverNativePushNotification(input: NotificationInput, notificationId: string): Promise<void> {
  const bucket = resolveNotificationBucket(input);
  if (bucket === "other") return;

  const deviceFilters = [
    eq(notificationPushDevices.businessId, input.businessId),
    eq(notificationPushDevices.enabled, true),
  ];
  if (input.userId) {
    deviceFilters.push(eq(notificationPushDevices.userId, input.userId));
  }

  const deviceRows = await db
    .select({
      id: notificationPushDevices.id,
      deviceToken: notificationPushDevices.deviceToken,
      enabledBuckets: notificationPushDevices.enabledBuckets,
      appBundleId: notificationPushDevices.appBundleId,
    })
    .from(notificationPushDevices)
    .where(and(...deviceFilters));

  const metadata = normalizeNotificationMetadata(input);
  const data = {
    notificationId,
    notificationType: input.type,
    notificationBucket: bucket,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    path: typeof metadata.path === "string" ? metadata.path : null,
  };

  for (const device of deviceRows) {
    if (!parseEnabledPushBuckets(device.enabledBuckets).has(bucket)) continue;

    try {
      const response = await sendApnsAlert(device.deviceToken, {
        title: input.title,
        body: input.message,
        topic: device.appBundleId,
        data,
      });
      const now = new Date();
      if (response.statusCode >= 200 && response.statusCode < 300) {
        await db
          .update(notificationPushDevices)
          .set({
            lastDeliveredAt: now,
            lastError: null,
            updatedAt: now,
          })
          .where(eq(notificationPushDevices.id, device.id));
        continue;
      }

      const shouldDisable =
        (response.statusCode === 400 && response.body.includes("BadDeviceToken")) ||
        response.statusCode === 410;
      await db
        .update(notificationPushDevices)
        .set({
          enabled: shouldDisable ? false : true,
          failureCount: sql`${notificationPushDevices.failureCount} + 1`,
          lastFailedAt: now,
          lastError: response.body || `APNs status ${response.statusCode}`,
          updatedAt: now,
        })
        .where(eq(notificationPushDevices.id, device.id));
    } catch (error) {
      const now = new Date();
      await db
        .update(notificationPushDevices)
        .set({
          failureCount: sql`${notificationPushDevices.failureCount} + 1`,
          lastFailedAt: now,
          lastError: error instanceof Error ? error.message : String(error),
          updatedAt: now,
        })
        .where(eq(notificationPushDevices.id, device.id));
    }
  }
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
