import express, { Router, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { integrationConnections } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { INTEGRATION_REGISTRY } from "../lib/integrationRegistry.js";
import { isIntegrationFeatureEnabled, listIntegrationFeatureFlags } from "../lib/integrationFeatureFlags.js";
import { listIntegrationFailures, retryIntegrationJobForBusiness } from "../lib/integrationJobs.js";
import { decryptIntegrationJson, isIntegrationVaultConfigured } from "../lib/integrationVault.js";
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
import {
  buildGoogleCalendarAuthorizeUrl,
  connectGoogleCalendarUser,
  createGoogleCalendarIntegrationStateToken,
  disconnectGoogleCalendarUser,
  enqueueGoogleCalendarFullResync,
  getGoogleCalendarFrontendReturnPath,
  isGoogleCalendarConfigured,
  listGoogleCalendarsForUser,
  selectGoogleCalendarForUser,
  type GoogleCalendarIntegrationState,
} from "../lib/googleCalendar.js";
import {
  connectTwilioBusiness,
  disconnectTwilioBusiness,
  handleTwilioStatusCallback,
  isTwilioConfigured,
} from "../lib/twilio.js";
import {
  ensureOutboundWebhookConnectionForBusiness,
  listRecentReplayableWebhookEvents,
  queueOutboundWebhookTest,
  replayOutboundWebhookActivity,
} from "../lib/integrations.js";
import { createIntegrationAuditLog } from "../lib/integrationAudit.js";
import { isCronSecretConfigured } from "../lib/env.js";

export const integrationsRouter = Router({ mergeParams: true });

const connectTwilioSchema = z.object({
  accountSid: z.string().trim().min(1, "Twilio Account SID is required."),
  authToken: z.string().trim().optional(),
  messagingServiceSid: z.string().trim().min(1, "Twilio Messaging Service SID is required."),
  enabledTemplateSlugs: z.array(z.string().trim()).optional(),
});
const replayWebhookSchema = z.object({
  activityLogId: z.string().uuid(),
});

function businessId(req: Request): string {
  if (!req.businessId) throw new ForbiddenError("No business.");
  return req.businessId;
}

function requireBusinessIntegrationAdmin(req: Request) {
  if (req.membershipRole !== "owner" && req.membershipRole !== "admin") {
    throw new ForbiddenError("Only owners and admins can manage business integrations.");
  }
}

export async function handleTwilioStatusCallbackRoute(req: Request, res: Response) {
  const params = Object.fromEntries(
    Object.entries((req.body ?? {}) as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")])
  );
  await handleTwilioStatusCallback({
    connectionId: req.params.connectionId,
    signature: req.header("x-twilio-signature"),
    params,
  });
  res.type("text/plain").send("ok");
}

export async function handleGoogleCalendarCallbackRoute(req: Request, res: Response) {
  const frontendUrl = process.env.FRONTEND_URL?.trim() ?? "";
  const baseRedirect = frontendUrl
    ? `${frontendUrl}${getGoogleCalendarFrontendReturnPath("error")}`
    : getGoogleCalendarFrontendReturnPath("error");
  const appendMessage = (path: string, message: string) => {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}googleCalendarMessage=${encodeURIComponent(message)}`;
  };

  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
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

  const payload = verifyIntegrationStateToken<GoogleCalendarIntegrationState>(state);
  if (!payload?.businessId || !payload?.userId || !code) {
    res.redirect(303, appendMessage(baseRedirect, "Google Calendar authorization could not be verified."));
    return;
  }

  try {
    await connectGoogleCalendarUser({
      businessId: payload.businessId,
      userId: payload.userId,
      code,
    });
    const successPath = frontendUrl
      ? `${frontendUrl}${getGoogleCalendarFrontendReturnPath("connected")}`
      : getGoogleCalendarFrontendReturnPath("connected");
    res.redirect(303, successPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar connection failed.";
    res.redirect(303, appendMessage(baseRedirect, message));
  }
}

integrationsRouter.get("/", requireAuth, requireTenant, requirePermission("settings.read"), async (req: Request, res: Response) => {
  const bid = businessId(req);
  await ensureOutboundWebhookConnectionForBusiness(bid);
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
        selectedCalendarSummary:
          typeof config?.selectedCalendarSummary === "string" ? config.selectedCalendarSummary : null,
        webhookUrl: typeof config?.webhookUrl === "string" ? config.webhookUrl : null,
        twilioMessagingServiceSid:
          typeof config?.messagingServiceSid === "string" ? config.messagingServiceSid : null,
        twilioAccountSid: typeof config?.accountSid === "string" ? config.accountSid : null,
        twilioEnabledTemplateSlugs: Array.isArray(config?.enabledTemplateSlugs)
          ? (config?.enabledTemplateSlugs as string[])
          : [],
      },
    };
  });

  res.json({
    infrastructure: {
      vaultConfigured: isIntegrationVaultConfigured(),
      cronSecretConfigured: isCronSecretConfigured(),
      providerConfiguration: {
        quickbooks_online: isQuickBooksConfigured(),
        twilio_sms: isTwilioConfigured(),
        google_calendar: isGoogleCalendarConfigured(),
        outbound_webhooks: isIntegrationVaultConfigured(),
      },
    },
    registry: INTEGRATION_REGISTRY.map((entry) => ({
      ...entry,
      featureFlagEnabled: featureFlags[entry.provider],
    })),
    connections,
  });
});

integrationsRouter.get(
  "/outbound-webhooks/recent-events",
  requireAuth,
  requireTenant,
  requirePermission("settings.read"),
  async (req: Request, res: Response) => {
    const bid = businessId(req);
    const records = await listRecentReplayableWebhookEvents(bid);
    res.json({ records });
  }
);

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
  "/google-calendar/start",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    const bid = businessId(req);
    if (!isIntegrationFeatureEnabled("google_calendar")) {
      throw new ForbiddenError("Google Calendar is not enabled in this environment.");
    }
    if (!isGoogleCalendarConfigured()) {
      throw new ForbiddenError("Google Calendar is not configured on this server.");
    }
    if (!req.userId) {
      throw new ForbiddenError("User context is required.");
    }

    const state = createGoogleCalendarIntegrationStateToken({
      businessId: bid,
      userId: req.userId,
      returnPath: getGoogleCalendarFrontendReturnPath("connected"),
    });

    res.json({
      url: buildGoogleCalendarAuthorizeUrl(state),
    });
  }
);

integrationsRouter.get("/google-calendar/callback", async (req: Request, res: Response) => {
  await handleGoogleCalendarCallbackRoute(req, res);
});

integrationsRouter.get(
  "/google-calendar/calendars",
  requireAuth,
  requireTenant,
  requirePermission("settings.read"),
  async (req: Request, res: Response) => {
    const bid = businessId(req);
    if (!req.userId) throw new ForbiddenError("User context is required.");
    const result = await listGoogleCalendarsForUser(bid, req.userId);
    res.json({ calendars: result.calendars });
  }
);

integrationsRouter.post(
  "/google-calendar/select-calendar",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    const bid = businessId(req);
    if (!req.userId) throw new ForbiddenError("User context is required.");
    const calendarId = String(req.body?.calendarId ?? "").trim();
    if (!calendarId) throw new BadRequestError("calendarId is required.");
    const record = await selectGoogleCalendarForUser({
      businessId: bid,
      userId: req.userId,
      calendarId,
    });
    res.json({ record });
  }
);

integrationsRouter.post(
  "/google-calendar/disconnect",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    const bid = businessId(req);
    if (!req.userId) throw new ForbiddenError("User context is required.");
    const record = await disconnectGoogleCalendarUser(bid, req.userId);
    if (!record) throw new NotFoundError("Google Calendar connection not found.");
    res.json({ record });
  }
);

integrationsRouter.post(
  "/google-calendar/resync",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    const bid = businessId(req);
    if (!req.userId) throw new ForbiddenError("User context is required.");
    const summary = await enqueueGoogleCalendarFullResync({ businessId: bid, userId: req.userId });
    res.json(summary);
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
  "/outbound-webhooks/test",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    requireBusinessIntegrationAdmin(req);
    const bid = businessId(req);
    const userId = req.userId;
    if (!userId) throw new ForbiddenError("User context is required.");
    const job = await queueOutboundWebhookTest({
      businessId: bid,
      userId,
    });
    await createIntegrationAuditLog({
      businessId: bid,
      provider: "outbound_webhooks",
      action: "outbound_webhooks.test_queued",
      userId,
      metadata: {
        integrationJobId: (job as { id?: string } | null)?.id ?? null,
      },
    });
    res.json({ record: job });
  }
);

integrationsRouter.post(
  "/outbound-webhooks/replay",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    requireBusinessIntegrationAdmin(req);
    const bid = businessId(req);
    const userId = req.userId;
    if (!userId) throw new ForbiddenError("User context is required.");
    const parsed = replayWebhookSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new BadRequestError(parsed.error.message);
    const job = await replayOutboundWebhookActivity({
      businessId: bid,
      userId,
      activityLogId: parsed.data.activityLogId,
    });
    await createIntegrationAuditLog({
      businessId: bid,
      provider: "outbound_webhooks",
      action: "outbound_webhooks.replay_queued",
      userId,
      metadata: {
        activityLogId: parsed.data.activityLogId,
        integrationJobId: (job as { id?: string } | null)?.id ?? null,
      },
    });
    res.json({ record: job });
  }
);

integrationsRouter.post(
  "/twilio/connect",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    requireBusinessIntegrationAdmin(req);
    const bid = businessId(req);
    if (!isIntegrationFeatureEnabled("twilio_sms")) {
      throw new ForbiddenError("Twilio SMS is not enabled in this environment.");
    }
    if (!req.userId) throw new ForbiddenError("User context is required.");
    const parsed = connectTwilioSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new BadRequestError(parsed.error.message);

    const record = await connectTwilioBusiness({
      businessId: bid,
      userId: req.userId,
      accountSid: parsed.data.accountSid,
      authToken: parsed.data.authToken ?? null,
      messagingServiceSid: parsed.data.messagingServiceSid,
      enabledTemplateSlugs: parsed.data.enabledTemplateSlugs,
    });

    res.json({ record });
  }
);

integrationsRouter.post(
  "/twilio/disconnect",
  requireAuth,
  requireTenant,
  requirePermission("settings.write"),
  async (req: Request, res: Response) => {
    requireBusinessIntegrationAdmin(req);
    const bid = businessId(req);
    const userId = req.userId;
    if (!userId) throw new ForbiddenError("User context is required.");
    const record = await disconnectTwilioBusiness(bid, userId);
    if (!record) throw new NotFoundError("Twilio connection not found.");
    res.json({ record });
  }
);

integrationsRouter.post(
  "/twilio/status/:connectionId",
  express.urlencoded({ extended: false }),
  handleTwilioStatusCallbackRoute
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
