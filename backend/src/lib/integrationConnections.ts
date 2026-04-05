import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { integrationConnections } from "../db/schema.js";
import type { IntegrationProvider } from "./integrationFeatureFlags.js";
import {
  decryptIntegrationJson,
  decryptIntegrationSecret,
  encryptIntegrationJson,
  encryptIntegrationSecret,
} from "./integrationVault.js";

export type IntegrationConnectionRecord = typeof integrationConnections.$inferSelect;

export async function getBusinessIntegrationConnection(
  businessId: string,
  provider: IntegrationProvider
) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.businessId, businessId),
        eq(integrationConnections.provider, provider),
        eq(integrationConnections.ownerKey, `business:${businessId}`)
      )
    )
    .limit(1);
  return connection ?? null;
}

export async function getUserIntegrationConnection(
  businessId: string,
  userId: string,
  provider: IntegrationProvider
) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.businessId, businessId),
        eq(integrationConnections.userId, userId),
        eq(integrationConnections.provider, provider),
        eq(integrationConnections.ownerKey, `user:${userId}`)
      )
    )
    .limit(1);
  return connection ?? null;
}

export async function upsertBusinessIntegrationConnection(input: {
  businessId: string;
  provider: IntegrationProvider;
  status: "pending" | "connected" | "action_required" | "error" | "disconnected";
  displayName?: string | null;
  externalAccountId?: string | null;
  externalAccountName?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  config?: Record<string, unknown> | null;
  scopes?: string[];
  lastError?: string | null;
  actionRequired?: string | null;
  featureEnabled?: boolean;
  connectedAt?: Date | null;
  disconnectedAt?: Date | null;
}) {
  const ownerKey = `business:${input.businessId}`;
  const payload = {
    provider: input.provider,
    ownerType: "business" as const,
    ownerKey,
    status: input.status,
    displayName: input.displayName ?? null,
    externalAccountId: input.externalAccountId ?? null,
    externalAccountName: input.externalAccountName ?? null,
    encryptedAccessToken: input.accessToken === undefined ? undefined : encryptIntegrationSecret(input.accessToken),
    encryptedRefreshToken: input.refreshToken === undefined ? undefined : encryptIntegrationSecret(input.refreshToken),
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    encryptedConfig: input.config === undefined ? undefined : encryptIntegrationJson(input.config),
    scopes: JSON.stringify(input.scopes ?? []),
    lastError: input.lastError ?? null,
    actionRequired: input.actionRequired ?? null,
    featureEnabled: input.featureEnabled ?? true,
    connectedAt: input.connectedAt ?? null,
    disconnectedAt: input.disconnectedAt ?? null,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: integrationConnections.id })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.businessId, input.businessId),
        eq(integrationConnections.provider, input.provider),
        eq(integrationConnections.ownerKey, ownerKey)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(integrationConnections)
      .set(payload)
      .where(eq(integrationConnections.id, existing.id))
      .returning();
    return updated ?? null;
  }

  const [created] = await db
    .insert(integrationConnections)
    .values({
      businessId: input.businessId,
      ...payload,
    })
    .returning();
  return created ?? null;
}

export async function disconnectBusinessIntegrationConnection(businessId: string, provider: IntegrationProvider) {
  const connection = await getBusinessIntegrationConnection(businessId, provider);
  if (!connection) return null;
  const [updated] = await db
    .update(integrationConnections)
    .set({
      status: "disconnected",
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      actionRequired: null,
      lastError: null,
      disconnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, connection.id))
    .returning();
  return updated ?? null;
}

export function readConnectionAccessToken(connection: Pick<IntegrationConnectionRecord, "encryptedAccessToken">) {
  return decryptIntegrationSecret(connection.encryptedAccessToken);
}

export function readConnectionRefreshToken(connection: Pick<IntegrationConnectionRecord, "encryptedRefreshToken">) {
  return decryptIntegrationSecret(connection.encryptedRefreshToken);
}

export function readConnectionConfig<T>(connection: Pick<IntegrationConnectionRecord, "encryptedConfig">): T | null {
  return decryptIntegrationJson<T>(connection.encryptedConfig);
}

