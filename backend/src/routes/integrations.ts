import { Router, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { integrationConnections } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { INTEGRATION_REGISTRY } from "../lib/integrationRegistry.js";
import { listIntegrationFeatureFlags } from "../lib/integrationFeatureFlags.js";
import { listIntegrationFailures, retryIntegrationJobForBusiness } from "../lib/integrationJobs.js";
import { decryptIntegrationJson } from "../lib/integrationVault.js";

export const integrationsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

integrationsRouter.get("/", requireAuth, requireTenant, requirePermission("settings.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  const featureFlags = listIntegrationFeatureFlags();
  const rows = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.businessId, bid));

  const connections = rows.map((row) => {
    let config: Record<string, unknown> | null = null;
    try {
      config = decryptIntegrationJson<Record<string, unknown>>(row.encryptedConfig);
    } catch {
      config = null;
    }
    return {
      id: row.id,
      provider: row.provider,
      ownerType: row.ownerType,
      ownerKey: row.ownerKey,
      userId: row.userId,
      status: row.status,
      displayName: row.displayName,
      externalAccountId: row.externalAccountId,
      externalAccountName: row.externalAccountName,
      scopes: JSON.parse(row.scopes ?? "[]") as string[],
      featureEnabled: row.featureEnabled,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastSuccessfulAt: row.lastSuccessfulAt?.toISOString() ?? null,
      lastError: row.lastError,
      actionRequired: row.actionRequired,
      connectedAt: row.connectedAt?.toISOString() ?? null,
      disconnectedAt: row.disconnectedAt?.toISOString() ?? null,
      configSummary: {
        hasEncryptedAccessToken: !!row.encryptedAccessToken,
        hasEncryptedRefreshToken: !!row.encryptedRefreshToken,
        hasConfig: !!row.encryptedConfig,
        selectedCalendarId: typeof config?.selectedCalendarId === "string" ? config.selectedCalendarId : null,
        webhookUrl: typeof config?.webhookUrl === "string" ? config.webhookUrl : null,
        twilioMessagingServiceSid:
          typeof config?.messagingServiceSid === "string" ? config.messagingServiceSid : null,
      },
    };
  });

  res.json({
    registry: INTEGRATION_REGISTRY.map((entry) => ({
      ...entry,
      featureFlagEnabled: featureFlags[entry.provider],
    })),
    connections,
  });
});

integrationsRouter.get(
  "/failures",
  requireAuth,
  requireTenant,
  requirePermission("settings.read"),
  async (req: Request, res: Response) => {
    const bid = businessId(req);
    const records = await listIntegrationFailures(bid);
    res.json({ records });
  }
);

integrationsRouter.post(
  "/jobs/:id/retry",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    const bid = businessId(req);
    const retried = await retryIntegrationJobForBusiness(bid, req.params.id);
    if (!retried) throw new NotFoundError("Integration job not found.");
    res.json({ record: retried });
  }
);
