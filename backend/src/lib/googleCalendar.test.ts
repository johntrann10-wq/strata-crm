import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyIntegrationStateToken } from "./jwt.js";
import {
  buildGoogleCalendarAuthorizeUrl,
  createGoogleCalendarIntegrationStateToken,
  exchangeGoogleCalendarAuthorizationCode,
  getGoogleCalendarFrontendReturnPath,
  getGoogleCalendarScopes,
  isGoogleCalendarConfigured,
} from "./googleCalendar.js";

describe("google calendar helpers", () => {
  const originalEnv = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    API_BASE: process.env.API_BASE,
    JWT_SECRET: process.env.JWT_SECRET,
  };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.API_BASE = "https://api.strata.test";
    process.env.JWT_SECRET = "google-calendar-test-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET;
    process.env.API_BASE = originalEnv.API_BASE;
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
  });

  it("builds the Google Calendar authorize URL with least-privilege scopes", () => {
    const url = new URL(buildGoogleCalendarAuthorizeUrl("state-token"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.strata.test/api/integrations/google-calendar/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toBe(getGoogleCalendarScopes().join(" "));
    expect(url.searchParams.get("state")).toBe("state-token");
  });

  it("creates a signed integration state token for Google Calendar callbacks", () => {
    const token = createGoogleCalendarIntegrationStateToken({
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

  it("exchanges a Google authorization code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: "google-access-token",
          refresh_token: "google-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: getGoogleCalendarScopes().join(" "),
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await exchangeGoogleCalendarAuthorizationCode("auth-code-123");

    expect(token.access_token).toBe("google-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("grant_type=authorization_code");
    expect(String(init.body)).toContain("code=auth-code-123");
  });

  it("reports Google Calendar env readiness and frontend return paths", () => {
    expect(isGoogleCalendarConfigured()).toBe(true);
    expect(getGoogleCalendarFrontendReturnPath("connected")).toBe("/settings?tab=integrations&googleCalendar=connected");
    expect(getGoogleCalendarFrontendReturnPath("error", "Needs attention")).toContain(
      "googleCalendarMessage=Needs+attention"
    );
  });
});
