import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mockVerifyIntegrationStateToken = vi.hoisted(() => vi.fn());
const mockConnectGoogleCalendarUser = vi.hoisted(() => vi.fn());
const mockGetGoogleCalendarFrontendReturnPath = vi.hoisted(() => vi.fn());
const mockHandleTwilioStatusCallback = vi.hoisted(() => vi.fn());
const mockHandleTwilioVoiceWebhook = vi.hoisted(() => vi.fn());

vi.mock("../db/index.js", () => ({
  db: {},
}));

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req: Request, _res: Response, next: () => void) => next(),
}));

vi.mock("../middleware/tenant.js", () => ({
  requireTenant: (_req: Request, _res: Response, next: () => void) => next(),
}));

vi.mock("../middleware/permissions.js", () => ({
  requirePermission: () => (_req: Request, _res: Response, next: () => void) => next(),
}));

vi.mock("../lib/integrationRegistry.js", () => ({
  INTEGRATION_REGISTRY: [],
}));

vi.mock("../lib/integrationFeatureFlags.js", () => ({
  isIntegrationFeatureEnabled: vi.fn(() => true),
  listIntegrationFeatureFlags: vi.fn(() => ({})),
}));

vi.mock("../lib/integrationJobs.js", () => ({
  listIntegrationFailures: vi.fn(),
  retryIntegrationJobForBusiness: vi.fn(),
}));

vi.mock("../lib/integrationVault.js", () => ({
  decryptIntegrationJson: vi.fn(),
  isIntegrationVaultConfigured: vi.fn(() => true),
}));

vi.mock("../lib/jwt.js", () => ({
  verifyIntegrationStateToken: mockVerifyIntegrationStateToken,
}));

vi.mock("../lib/quickbooks.js", () => ({
  buildQuickBooksAuthorizeUrl: vi.fn(),
  connectQuickBooksBusiness: vi.fn(),
  createQuickBooksIntegrationStateToken: vi.fn(),
  disconnectQuickBooksBusiness: vi.fn(),
  enqueueQuickBooksFullResync: vi.fn(),
  getQuickBooksFrontendReturnPath: vi.fn((status: string) => `/settings?tab=integrations&quickbooks=${status}`),
  isQuickBooksConfigured: vi.fn(() => true),
}));

vi.mock("../lib/googleCalendar.js", () => ({
  buildGoogleCalendarAuthorizeUrl: vi.fn(),
  connectGoogleCalendarUser: mockConnectGoogleCalendarUser,
  createGoogleCalendarIntegrationStateToken: vi.fn(),
  disconnectGoogleCalendarUser: vi.fn(),
  enqueueGoogleCalendarFullResync: vi.fn(),
  getGoogleCalendarFrontendReturnPath: mockGetGoogleCalendarFrontendReturnPath,
  isGoogleCalendarConfigured: vi.fn(() => true),
  listGoogleCalendarsForUser: vi.fn(),
  selectGoogleCalendarForUser: vi.fn(),
}));

vi.mock("../lib/twilio.js", () => ({
  connectTwilioBusiness: vi.fn(),
  disconnectTwilioBusiness: vi.fn(),
  handleTwilioVoiceWebhook: mockHandleTwilioVoiceWebhook,
  handleTwilioStatusCallback: mockHandleTwilioStatusCallback,
  isTwilioConfigured: vi.fn(() => true),
}));

vi.mock("../lib/integrations.js", () => ({
  ensureOutboundWebhookConnectionForBusiness: vi.fn(),
  listRecentReplayableWebhookEvents: vi.fn(),
  queueOutboundWebhookTest: vi.fn(),
  replayOutboundWebhookActivity: vi.fn(),
}));

vi.mock("../lib/integrationAudit.js", () => ({
  createIntegrationAuditLog: vi.fn(),
}));

vi.mock("../lib/env.js", () => ({
  isCronSecretConfigured: vi.fn(() => true),
}));

const {
  handleGoogleCalendarCallbackRoute,
  handleTwilioStatusCallbackRoute,
  handleTwilioVoiceWebhookRoute,
} = await import("./integrations.js");

function createResponseMock() {
  const res = {
    type: vi.fn(),
    send: vi.fn(),
    redirect: vi.fn(),
  } as unknown as Response & {
    type: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    redirect: ReturnType<typeof vi.fn>;
  };

  res.type.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.redirect.mockReturnValue(res);
  return res;
}

describe("integration route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FRONTEND_URL = "https://app.strata.test";
    mockGetGoogleCalendarFrontendReturnPath.mockImplementation(
      (status: string) => `/settings?tab=integrations&googleCalendar=${status}`
    );
  });

  it("forwards Twilio status callbacks and responds with plain text", async () => {
    const req = {
      params: { connectionId: "conn-123" },
      body: { MessageSid: "SM123", SmsStatus: "delivered", ErrorCode: 30008, Empty: undefined },
      header: vi.fn((name: string) => (name === "x-twilio-signature" ? "signed" : undefined)),
    } as unknown as Request;
    const res = createResponseMock();

    await handleTwilioStatusCallbackRoute(req, res);

    expect(mockHandleTwilioStatusCallback).toHaveBeenCalledWith({
      connectionId: "conn-123",
      signature: "signed",
      params: {
        MessageSid: "SM123",
        SmsStatus: "delivered",
        ErrorCode: "30008",
        Empty: "",
      },
    });
    expect(res.type).toHaveBeenCalledWith("text/plain");
    expect(res.send).toHaveBeenCalledWith("ok");
  });

  it("forwards Twilio voice callbacks and responds with empty TwiML", async () => {
    const req = {
      params: { connectionId: "conn-voice-1" },
      body: { CallSid: "CA123", From: "+15555550123", DialCallStatus: "no-answer" },
      header: vi.fn((name: string) => (name === "x-twilio-signature" ? "voice-signed" : undefined)),
    } as unknown as Request;
    const res = createResponseMock();

    await handleTwilioVoiceWebhookRoute(req, res);

    expect(mockHandleTwilioVoiceWebhook).toHaveBeenCalledWith({
      connectionId: "conn-voice-1",
      signature: "voice-signed",
      params: {
        CallSid: "CA123",
        From: "+15555550123",
        DialCallStatus: "no-answer",
      },
    });
    expect(res.type).toHaveBeenCalledWith("text/xml");
    expect(res.send).toHaveBeenCalledWith('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });

  it("redirects Google Calendar callbacks to an error path when authorization cannot be verified", async () => {
    mockVerifyIntegrationStateToken.mockReturnValue(null);
    const req = {
      query: {
        state: "bad-state",
        code: "oauth-code",
      },
    } as unknown as Request;
    const res = createResponseMock();

    await handleGoogleCalendarCallbackRoute(req, res);

    expect(mockConnectGoogleCalendarUser).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      303,
      "https://app.strata.test/settings?tab=integrations&googleCalendar=error&googleCalendarMessage=Google%20Calendar%20authorization%20could%20not%20be%20verified."
    );
  });

  it("connects Google Calendar and redirects to the connected integrations view", async () => {
    mockVerifyIntegrationStateToken.mockReturnValue({
      businessId: "biz-123",
      userId: "user-456",
    });
    mockConnectGoogleCalendarUser.mockResolvedValue(undefined);
    const req = {
      query: {
        state: "good-state",
        code: "oauth-code",
      },
    } as unknown as Request;
    const res = createResponseMock();

    await handleGoogleCalendarCallbackRoute(req, res);

    expect(mockConnectGoogleCalendarUser).toHaveBeenCalledWith({
      businessId: "biz-123",
      userId: "user-456",
      code: "oauth-code",
    });
    expect(res.redirect).toHaveBeenCalledWith(
      303,
      "https://app.strata.test/settings?tab=integrations&googleCalendar=connected"
    );
  });
});
