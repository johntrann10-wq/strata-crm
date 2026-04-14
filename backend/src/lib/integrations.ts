import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { activityLogs, businesses, integrationConnections } from "../db/schema.js";
import {
  getBusinessIntegrationConnection,
  readConnectionConfig,
  upsertBusinessIntegrationConnection,
  type IntegrationConnectionRecord,
} from "./integrationConnections.js";
import { enqueueIntegrationJob, markIntegrationJobFailed, markIntegrationJobSucceeded, type IntegrationJobRecord } from "./integrationJobs.js";
import { isIntegrationFeatureEnabled } from "./integrationFeatureFlags.js";
import { isIntegrationVaultConfigured, maybeDecryptIntegrationSecret } from "./integrationVault.js";
import { BadRequestError, NotFoundError } from "./errors.js";
import { logger } from "./logger.js";

const OUTBOUND_WEBHOOK_PROVIDER = "outbound_webhooks";
const OUTBOUND_WEBHOOK_PAYLOAD_VERSION = "2026-04-04";
const OUTBOUND_WEBHOOK_TIMEOUT_MS = 5_000;

type WebhookConnectionConfig = {
  webhookUrl: string | null;
  webhookSecret: string | null;
  webhookEvents: string[];
  payloadVersion: string;
};

type WebhookEventInput = {
  activityLogId: string | null;
  businessId: string;
  event: string;
  occurredAt: Date;
  entityType?: string | null;
  entityId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type WebhookPayload = {
  version: string;
  mode: "live" | "test" | "replay";
  source: "strata";
  event: {
    id: string;
    type: string;
    occurredAt: string;
  };
  business: {
    id: string;
  };
  actor: {
    userId: string | null;
  };
  entity: {
    type: string | null;
    id: string | null;
  };
  data: Record<string, unknown> | null;
};

type WebhookJobPayload = {
  mode: "live" | "test" | "replay";
  activityLogId: string | null;
  envelope: WebhookPayload;
};

function normalizeConfiguredEvents(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function normalizeWebhookEventList(events: string[] | null | undefined): string[] {
  return Array.from(new Set((events ?? []).map((value) => value.trim()).filter(Boolean))).sort();
}

function buildWebhookConfig(input: {
  webhookUrl: string | null;
  webhookSecret: string | null;
  webhookEvents: string[] | null | undefined;
}): WebhookConnectionConfig {
  return {
    webhookUrl: input.webhookUrl?.trim() || null,
    webhookSecret: input.webhookSecret?.trim() || null,
    webhookEvents: normalizeWebhookEventList(input.webhookEvents),
    payloadVersion: OUTBOUND_WEBHOOK_PAYLOAD_VERSION,
  };
}

function buildWebhookPayload(input: WebhookEventInput, mode: WebhookPayload["mode"]): WebhookPayload {
  return {
    version: OUTBOUND_WEBHOOK_PAYLOAD_VERSION,
    mode,
    source: "strata",
    event: {
      id: input.activityLogId ?? `synthetic:${input.businessId}:${input.event}:${input.occurredAt.getTime()}`,
      type: input.event,
      occurredAt: input.occurredAt.toISOString(),
    },
    business: {
      id: input.businessId,
    },
    actor: {
      userId: input.userId ?? null,
    },
    entity: {
      type: input.entityType ?? null,
      id: input.entityId ?? null,
    },
    data: input.metadata ?? null,
  };
}

export function buildOutboundWebhookSignature(body: string, secret: string | null | undefined) {
  if (!secret) return "";
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function buildOutboundWebhookRequest(input: {
  config: WebhookConnectionConfig;
  payload: WebhookPayload;
}) {
  if (!input.config.webhookUrl) {
    throw new BadRequestError("Webhook endpoint URL is not configured.");
  }
  const body = JSON.stringify(input.payload);
  const deliveredAt = new Date().toISOString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Strata-Webhook/1.0",
    "x-strata-event": input.payload.event.type,
    "x-strata-event-id": input.payload.event.id,
    "x-strata-event-timestamp": input.payload.event.occurredAt,
    "x-strata-payload-version": input.payload.version,
    "x-strata-delivery-mode": input.payload.mode,
    "x-strata-delivered-at": deliveredAt,
  };
  const signature = buildOutboundWebhookSignature(body, input.config.webhookSecret);
  if (signature) headers["x-strata-signature"] = signature;
  return {
    url: input.config.webhookUrl,
    body,
    headers,
    deliveredAt,
  };
}

async function updateOutboundWebhookConnectionState(input: {
  connectionId: string;
  status: "connected" | "error";
  lastError: string | null;
}) {
  await db
    .update(integrationConnections)
    .set({
      status: input.status,
      lastSyncedAt: new Date(),
      lastSuccessfulAt: input.status === "connected" ? new Date() : undefined,
      lastError: input.lastError,
      actionRequired: input.status === "error" ? "Check your endpoint availability, filters, and signing secret." : null,
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, input.connectionId));
}

export async function syncOutboundWebhookConnectionForBusiness(input: {
  businessId: string;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  webhookSecret: string | null;
  webhookEvents: string[] | null | undefined;
}) {
  if (!isIntegrationVaultConfigured()) {
    logger.warn("Skipping signed webhook connection sync because the integration vault is not configured", {
      businessId: input.businessId,
    });
    return null;
  }
  let webhookSecret = input.webhookSecret ?? null;
  try {
    webhookSecret = maybeDecryptIntegrationSecret(webhookSecret);
  } catch (error) {
    logger.warn("Failed to decrypt webhook signing secret; skipping secret sync", {
      businessId: input.businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    webhookSecret = null;
  }
  webhookSecret = webhookSecret?.trim() || null;
  const config = buildWebhookConfig(input);
  config.webhookSecret = webhookSecret;
  const connected = !!input.webhookEnabled && !!config.webhookUrl;
  return upsertBusinessIntegrationConnection({
    businessId: input.businessId,
    provider: OUTBOUND_WEBHOOK_PROVIDER,
    status: connected ? "connected" : "disconnected",
    displayName: "Signed webhooks",
    externalAccountId: config.webhookUrl ? new URL(config.webhookUrl).host : null,
    externalAccountName: config.webhookUrl ? new URL(config.webhookUrl).host : null,
    config,
    scopes: [],
    lastError: null,
    actionRequired: connected ? null : "Enable outbound webhooks with a valid endpoint URL to deliver events.",
    featureEnabled: isIntegrationFeatureEnabled(OUTBOUND_WEBHOOK_PROVIDER),
    connectedAt: connected ? new Date() : null,
    disconnectedAt: connected ? null : new Date(),
  });
}

export async function ensureOutboundWebhookConnectionForBusiness(businessId: string) {
  const existing = await getBusinessIntegrationConnection(businessId, OUTBOUND_WEBHOOK_PROVIDER);
  if (existing) return existing;
  if (!isIntegrationVaultConfigured()) {
    return null;
  }

  const [business] = await db
    .select({
      integrationWebhookEnabled: businesses.integrationWebhookEnabled,
      integrationWebhookUrl: businesses.integrationWebhookUrl,
      integrationWebhookSecret: businesses.integrationWebhookSecret,
      integrationWebhookEvents: businesses.integrationWebhookEvents,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) return null;

  return syncOutboundWebhookConnectionForBusiness({
    businessId,
    webhookEnabled: business.integrationWebhookEnabled ?? false,
    webhookUrl: business.integrationWebhookUrl ?? null,
    webhookSecret: business.integrationWebhookSecret ?? null,
    webhookEvents: normalizeConfiguredEvents(business.integrationWebhookEvents),
  });
}

function getWebhookConfig(connection: IntegrationConnectionRecord) {
  const config = readConnectionConfig<WebhookConnectionConfig>(connection);
  if (!config?.webhookUrl) {
    throw new BadRequestError("Webhook endpoint URL is not configured.");
  }
  return {
    ...config,
    webhookEvents: normalizeWebhookEventList(config.webhookEvents),
    payloadVersion: config.payloadVersion || OUTBOUND_WEBHOOK_PAYLOAD_VERSION,
  };
}

function webhookAllowsEvent(config: WebhookConnectionConfig, eventName: string) {
  return config.webhookEvents.length === 0 || config.webhookEvents.includes(eventName);
}

async function getActiveOutboundWebhookConnection(businessId: string) {
  const connection =
    (await ensureOutboundWebhookConnectionForBusiness(businessId)) ??
    (await getBusinessIntegrationConnection(businessId, OUTBOUND_WEBHOOK_PROVIDER));

  if (!connection) return null;
  if (!connection.featureEnabled) return null;
  if (connection.status !== "connected") return null;
  return connection;
}

async function enqueueOutboundWebhookJob(input: {
  businessId: string;
  connectionId: string;
  mode: WebhookPayload["mode"];
  envelope: WebhookPayload;
  activityLogId: string | null;
  createdByUserId?: string | null;
}) {
  const idempotencyKey =
    input.mode === "live" && input.activityLogId
      ? `activity:${input.activityLogId}`
      : `${input.mode}:${input.envelope.event.id}:${Date.now()}`;

  return enqueueIntegrationJob({
    businessId: input.businessId,
    provider: OUTBOUND_WEBHOOK_PROVIDER,
    jobType: input.mode === "live" ? "event.deliver" : input.mode === "test" ? "event.test" : "event.replay",
    idempotencyKey,
    payload: {
      mode: input.mode,
      activityLogId: input.activityLogId,
      envelope: input.envelope,
    },
    connectionId: input.connectionId,
    createdByUserId: input.createdByUserId ?? null,
  });
}

export async function enqueueBusinessWebhookEvent(input: WebhookEventInput) {
  const connection = await getActiveOutboundWebhookConnection(input.businessId);
  if (!connection) return null;
  const config = getWebhookConfig(connection);
  if (!webhookAllowsEvent(config, input.event)) return null;

  const envelope = buildWebhookPayload(input, "live");
  return enqueueOutboundWebhookJob({
    businessId: input.businessId,
    connectionId: connection.id,
    mode: "live",
    envelope,
    activityLogId: input.activityLogId,
    createdByUserId: input.userId ?? null,
  });
}

export async function queueOutboundWebhookTest(input: {
  businessId: string;
  userId: string;
}) {
  const connection = await getActiveOutboundWebhookConnection(input.businessId);
  if (!connection) {
    throw new BadRequestError("Signed webhooks are not connected for this business yet.");
  }
  const envelope = buildWebhookPayload(
    {
      activityLogId: null,
      businessId: input.businessId,
      event: "integration.webhook.test",
      occurredAt: new Date(),
      userId: input.userId,
      metadata: {
        message: "This is a signed Strata webhook test event.",
      },
    },
    "test"
  );
  const job = await enqueueOutboundWebhookJob({
    businessId: input.businessId,
    connectionId: connection.id,
    mode: "test",
    envelope,
    activityLogId: null,
    createdByUserId: input.userId,
  });
  return job;
}

export async function replayOutboundWebhookActivity(input: {
  businessId: string;
  userId: string;
  activityLogId: string;
}) {
  const connection = await getActiveOutboundWebhookConnection(input.businessId);
  if (!connection) {
    throw new BadRequestError("Signed webhooks are not connected for this business yet.");
  }

  const [activity] = await db
    .select()
    .from(activityLogs)
    .where(and(eq(activityLogs.businessId, input.businessId), eq(activityLogs.id, input.activityLogId)))
    .limit(1);

  if (!activity) {
    throw new NotFoundError("Activity event not found.");
  }

  let metadata: Record<string, unknown> | null = null;
  if (activity.metadata) {
    try {
      metadata = JSON.parse(activity.metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }

  const envelope = buildWebhookPayload(
    {
      activityLogId: activity.id,
      businessId: activity.businessId,
      event: activity.action,
      occurredAt: activity.createdAt,
      entityType: activity.entityType ?? null,
      entityId: activity.entityId ?? null,
      userId: activity.userId ?? null,
      metadata,
    },
    "replay"
  );

  const job = await enqueueOutboundWebhookJob({
    businessId: input.businessId,
    connectionId: connection.id,
    mode: "replay",
    envelope,
    activityLogId: activity.id,
    createdByUserId: input.userId,
  });
  return job;
}

export async function listRecentReplayableWebhookEvents(businessId: string, limit = 10) {
  const rows = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(eq(activityLogs.businessId, businessId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function runOutboundWebhookIntegrationJob(job: IntegrationJobRecord) {
  const connection =
    (job.connectionId
      ? await db
          .select()
          .from(integrationConnections)
          .where(eq(integrationConnections.id, job.connectionId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : await getBusinessIntegrationConnection(job.businessId, OUTBOUND_WEBHOOK_PROVIDER)) ?? null;

  if (!connection) {
    await markIntegrationJobFailed(job, new Error("Signed webhook connection no longer exists."));
    return;
  }

  try {
    const payload = JSON.parse(job.payload) as WebhookJobPayload;
    const config = getWebhookConfig(connection);
    const request = buildOutboundWebhookRequest({
      config,
      payload: payload.envelope,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OUTBOUND_WEBHOOK_TIMEOUT_MS);

    let responseStatus = 0;
    let responseBody = "";
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
      responseStatus = response.status;
      responseBody = await response.text().catch(() => "");
      if (!response.ok) {
        throw new Error(`Webhook endpoint returned ${response.status}: ${responseBody || response.statusText}`);
      }
    } finally {
      clearTimeout(timeout);
    }

    await updateOutboundWebhookConnectionState({
      connectionId: connection.id,
      status: "connected",
      lastError: null,
    });

    await markIntegrationJobSucceeded(
      job.id,
      {
        url: request.url,
        mode: payload.mode,
        event: payload.envelope.event.type,
        eventId: payload.envelope.event.id,
        body: payload.envelope,
      },
      {
        status: responseStatus,
        bodyPreview: responseBody.slice(0, 500),
      }
    );
  } catch (error) {
    await updateOutboundWebhookConnectionState({
      connectionId: connection.id,
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
    await markIntegrationJobFailed(
      job,
      error,
      {
        connectionId: connection.id,
        provider: OUTBOUND_WEBHOOK_PROVIDER,
      },
      undefined
    );
    logger.warn("Signed webhook delivery failed", {
      businessId: job.businessId,
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
