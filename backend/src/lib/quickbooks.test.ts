import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyIntegrationStateToken } from "./jwt.js";
import {
  buildQuickBooksAuthorizeUrl,
  createQuickBooksIntegrationStateToken,
  exchangeQuickBooksAuthorizationCode,
  getQuickBooksFrontendReturnPath,
  getQuickBooksScope,
  isQuickBooksConfigured,
} from "./quickbooks.js";

describe("quickbooks helpers", () => {
  const originalEnv = {
    QUICKBOOKS_CLIENT_ID: process.env.QUICKBOOKS_CLIENT_ID,
    QUICKBOOKS_CLIENT_SECRET: process.env.QUICKBOOKS_CLIENT_SECRET,
    API_BASE: process.env.API_BASE,
    JWT_SECRET: process.env.JWT_SECRET,
  };

  beforeEach(() => {
    process.env.QUICKBOOKS_CLIENT_ID = "qbo-client-id";
    process.env.QUICKBOOKS_CLIENT_SECRET = "qbo-client-secret";
    process.env.API_BASE = "https://api.strata.test";
    process.env.JWT_SECRET = "quickbooks-test-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.QUICKBOOKS_CLIENT_ID = originalEnv.QUICKBOOKS_CLIENT_ID;
    process.env.QUICKBOOKS_CLIENT_SECRET = originalEnv.QUICKBOOKS_CLIENT_SECRET;
    process.env.API_BASE = originalEnv.API_BASE;
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
  });

  it("builds the QuickBooks authorize URL with least-privilege accounting scope", () => {
    const url = new URL(buildQuickBooksAuthorizeUrl("state-token"));
    expect(url.origin + url.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(url.searchParams.get("client_id")).toBe("qbo-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(getQuickBooksScope());
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.strata.test/api/integrations/quickbooks/callback");
    expect(url.searchParams.get("state")).toBe("state-token");
  });

  it("creates a signed integration state token for QuickBooks callbacks", () => {
    const token = createQuickBooksIntegrationStateToken({
      businessId: "biz-1",
      userId: "user-1",
      returnPath: "/settings?tab=integrations",
    });
    const payload = verifyIntegrationStateToken<{
      businessId: string;
      userId: string;
      returnPath: string;
    }>(token);

    expect(payload).toMatchObject({
      businessId: "biz-1",
      userId: "user-1",
      returnPath: "/settings?tab=integrations",
    });
  });

  it("exchanges a QuickBooks authorization code with basic auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          token_type: "bearer",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await exchangeQuickBooksAuthorizationCode("auth-code-123");

    expect(token.access_token).toBe("access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
    expect(init.method).toBe("POST");
    expect(String(init.headers && (init.headers as Record<string, string>).Authorization)).toContain("Basic ");
    expect(String(init.body)).toContain("grant_type=authorization_code");
    expect(String(init.body)).toContain("code=auth-code-123");
  });

  it("reports QuickBooks env readiness and frontend return paths", () => {
    expect(isQuickBooksConfigured()).toBe(true);
    expect(getQuickBooksFrontendReturnPath("connected")).toBe("/settings?tab=integrations&quickbooks=connected");
    expect(getQuickBooksFrontendReturnPath("error", "Needs attention")).toContain("quickbooksMessage=Needs+attention");
  });
});
