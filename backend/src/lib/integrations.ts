import crypto from "crypto";
import { db } from "../db/index.js";
import { businesses } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

type WebhookPayload = {
  event: string;
  deliveredAt: string;
  businessId: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  metadata: Record<string, unknown> | null;
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

export async function deliverBusinessWebhookEvent(input: {
  businessId: string;
  event: string;
  entityType?: string | null;
  entityId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const [business] = await db
    .select({
      integrationWebhookEnabled: businesses.integrationWebhookEnabled,
      integrationWebhookUrl: businesses.integrationWebhookUrl,
      integrationWebhookSecret: businesses.integrationWebhookSecret,
      integrationWebhookEvents: businesses.integrationWebhookEvents,
    })
    .from(businesses)
    .where(eq(businesses.id, input.businessId))
    .limit(1);

  if (!business?.integrationWebhookEnabled || !business.integrationWebhookUrl) {
    return;
  }

  const configuredEvents = normalizeConfiguredEvents(business.integrationWebhookEvents);
  if (configuredEvents.length > 0 && !configuredEvents.includes(input.event)) {
    return;
  }

  const payload: WebhookPayload = {
    event: input.event,
    deliveredAt: new Date().toISOString(),
    businessId: input.businessId,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    userId: input.userId ?? null,
    metadata: input.metadata ?? null,
  };

  const body = JSON.stringify(payload);
  const signature = business.integrationWebhookSecret
    ? crypto.createHmac("sha256", business.integrationWebhookSecret).update(body).digest("hex")
    : "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);

  try {
    const response = await fetch(business.integrationWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-strata-event": input.event,
        "x-strata-delivered-at": payload.deliveredAt,
        ...(signature ? { "x-strata-signature": signature } : {}),
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      logger.warn("Business webhook delivery failed", {
        businessId: input.businessId,
        event: input.event,
        status: response.status,
        detail: detail.slice(0, 300),
      });
    }
  } catch (error) {
    logger.warn("Business webhook delivery errored", {
      businessId: input.businessId,
      event: input.event,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}
