import { Router, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { integrationConnections } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { INTEGRATION_REGISTRY } from "../lib/integrationRegistry.js";
import { isIntegrationFeatureEnabled, listIntegrationFeatureFlags } from "../lib/integrationFeatureFlags.js";
import { listIntegrationFailures, retryIntegrationJobForBusiness } from "../lib/integrationJobs.js";
import { decryptIntegrationJson } from "../lib/integrationVault.js";
import { verifyIntegrationStateToken } from "../lib/jwt.js";
import {
  buildQuickBooksAuthorizeUrl,
  connectQuickBooksBusiness,
  createQuickBooksIntegrationStateToken,
  disconnectQuickBooksBusiness,
  enqueueQuickBooksFullResync,
  getQuickBooksFrontendReturnPath,
  isQuickBooksConfigured,
  type QuickBooksIntegrationState,
} from "../lib/quickbooks.js";

export const integrationsRouter = Router({ mergeParams: true });

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function requireBusinessIntegrationAdmin(req: Request) {
  if (req.membershipRole !== "owner" && req.membershipRole !== "admin") {
    throw new ForbiddenError("Only owners and admins can manage business integrations.");
  }
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

integrationsRouter.post(
  "/quickbooks/start",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    requireBusinessIntegrationAdmin(req);
    const bid = businessId(req);
    if (!isIntegrationFeatureEnabled("quickbooks_online")) {
      throw new ForbiddenError("QuickBooks Online is not enabled in this environment.");
    }
    if (!isQuickBooksConfigured()) {
      throw new ForbiddenError("QuickBooks Online is not configured on this server.");
    }
    if (!req.userId) {
      throw new ForbiddenError("User context is required.");
    }

    const state = createQuickBooksIntegrationStateToken({
      businessId: bid,
      userId: req.userId,
      returnPath: getQuickBooksFrontendReturnPath("connected"),
    });

    res.json({
      url: buildQuickBooksAuthorizeUrl(state),
    });
  }
);

integrationsRouter.get("/quickbooks/callback", async (req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL?.trim() ?? "";
  const baseRedirect = frontendUrl ? `${frontendUrl}${getQuickBooksFrontendReturnPath("error")}` : getQuickBooksFrontendReturnPath("error");
  const appendMessage = (path: string, message: string) => {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}quickbooksMessage=${encodeURIComponent(message)}`;
  };

  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const realmId = typeof req.query.realmId === "string" ? req.query.realmId : "";
  const errorMessage =
    typeof req.query.error_description === "string"
      ? req.query.error_description
      : typeof req.query.error === "string"
        ? req.query.error
        : "";

  if (errorMessage) {
    res.redirect(303, appendMessage(baseRedirect, errorMessage));
    return;
  }

  const payload = verifyIntegrationStateToken<QuickBooksIntegrationState>(state);
  if (!payload?.businessId || !payload?.userId || !code || !realmId) {
    res.redirect(303, appendMessage(baseRedirect, "QuickBooks authorization could not be verified."));
    return;
  }

  try {
    await connectQuickBooksBusiness({
      businessId: payload.businessId,
      userId: payload.userId,
      code,
      realmId,
    });
    const successPath = frontendUrl
      ? `${frontendUrl}${getQuickBooksFrontendReturnPath("connected")}`
      : getQuickBooksFrontendReturnPath("connected");
    res.redirect(303, successPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "QuickBooks connection failed.";
    res.redirect(303, appendMessage(baseRedirect, message));
  }
});

integrationsRouter.post(
  "/quickbooks/disconnect",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    requireBusinessIntegrationAdmin(req);
    const bid = businessId(req);
    const userId = req.userId;
    if (!userId) throw new ForbiddenError("User context is required.");
    const record = await disconnectQuickBooksBusiness(bid, userId);
    if (!record) throw new NotFoundError("QuickBooks connection not found.");
    res.json({ record });
  }
);

integrationsRouter.post(
  "/quickbooks/resync",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    requireBusinessIntegrationAdmin(req);
    const bid = businessId(req);
    const userId = req.userId;
    if (!userId) throw new ForbiddenError("User context is required.");
    const summary = await enqueueQuickBooksFullResync({ businessId: bid, userId });
    res.json(summary);
  }
);
