import { expect, test } from "@playwright/test";

async function mockAuthenticatedSettings(context: import("@playwright/test").BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem("authToken", "integration-test-token");
    window.localStorage.setItem("currentBusinessId", "biz-1");
  });

  await context.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "user-1",
          email: "owner@example.com",
          firstName: "Owner",
          lastName: "Test",
          token: "integration-test-token",
        },
      }),
    });
  });

  await context.route("**/api/auth/context", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          businesses: [
            {
              id: "biz-1",
              name: "QA Detail Shop",
              type: "auto_detailing",
              role: "owner",
              status: "active",
              isDefault: true,
              permissions: ["settings.read", "settings.write"],
            },
          ],
          currentBusinessId: "biz-1",
        },
      }),
    });
  });

  await context.route("**/api/businesses/biz-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "biz-1",
        name: "QA Detail Shop",
        type: "auto_detailing",
        onboardingComplete: true,
        integrationWebhookEnabled: false,
        integrationWebhookUrl: null,
        integrationWebhookSecret: null,
        integrationWebhookEvents: [],
      }),
    });
  });

  await context.route("**/api/users/user-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "user-1",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "Test",
        googleProfileId: null,
      }),
    });
  });

  await context.route("**/api/locations**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ records: [] }),
    });
  });

  await context.route("**/api/staff**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ records: [] }),
    });
  });

  await context.route("**/api/actions/getBusinessPreset", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ group: "detailing", count: 0, names: [] }),
    });
  });

  await context.route("**/api/actions/getAutomationSummary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        appointmentReminders: { sentLast30Days: 0, lastSentAt: null, failedLast30Days: 0, lastFailedAt: null },
        reviewRequests: { sentLast30Days: 0, lastSentAt: null, failedLast30Days: 0, lastFailedAt: null },
        lapsedClients: { sentLast30Days: 0, lastSentAt: null, failedLast30Days: 0, lastFailedAt: null },
      }),
    });
  });

  await context.route("**/api/integrations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        registry: [
          {
            provider: "quickbooks_online",
            label: "QuickBooks Online",
            ownerType: "business",
            description: "Sync customers, invoices, and recorded payments from Strata into QuickBooks Online.",
            permissions: { read: "settings.read", write: "settings.write" },
            featureFlagEnabled: true,
          },
          {
            provider: "twilio_sms",
            label: "Twilio SMS",
            ownerType: "business",
            description: "Deliver transactional text messages with callback-driven delivery tracking.",
            permissions: { read: "settings.read", write: "settings.write" },
            featureFlagEnabled: true,
          },
        ],
        connections: [
          {
            id: "conn-1",
            provider: "quickbooks_online",
            ownerType: "business",
            ownerKey: "business:biz-1",
            userId: null,
            status: "connected",
            displayName: "QBO Sandbox",
            externalAccountId: "realm-1",
            externalAccountName: "QA Detail Shop Books",
            scopes: ["com.intuit.quickbooks.accounting"],
            featureEnabled: true,
            lastSyncedAt: "2026-04-04T17:00:00.000Z",
            lastSuccessfulAt: "2026-04-04T17:00:00.000Z",
            lastError: null,
            actionRequired: null,
            connectedAt: "2026-04-04T16:00:00.000Z",
            disconnectedAt: null,
            configSummary: {
              hasEncryptedAccessToken: true,
              hasEncryptedRefreshToken: true,
              hasConfig: true,
              selectedCalendarId: null,
              webhookUrl: null,
              twilioMessagingServiceSid: null,
            },
          },
        ],
      }),
    });
  });

  await context.route("**/api/integrations/failures", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        records: [
          {
            id: "job-1",
            provider: "quickbooks_online",
            jobType: "invoice.push",
            status: "failed",
            attemptCount: 2,
            maxAttempts: 5,
            lastError: "QuickBooks token refresh failed.",
            deadLetteredAt: null,
            nextRunAt: "2026-04-04T18:00:00.000Z",
            updatedAt: "2026-04-04T17:05:00.000Z",
            displayName: "QBO Sandbox",
          },
        ],
      }),
    });
  });

  await context.route("**/api/billing/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "active",
        trialEndsAt: null,
        currentPeriodEnd: null,
        billingEnforced: true,
        checkoutConfigured: true,
        portalConfigured: true,
        stripeConnectConfigured: true,
        stripeConnectAccountId: "acct_123",
        stripeConnectDetailsSubmitted: true,
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
        stripeConnectOnboardedAt: "2026-04-04T15:00:00.000Z",
        stripeConnectReady: true,
      }),
    });
  });

  await context.route("**/api/integrations/jobs/job-1/retry", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ record: { id: "job-1" } }),
    });
  });
}

test("shows integration infrastructure and failure visibility in settings", async ({ page, context }) => {
  await mockAuthenticatedSettings(context);

  await page.goto("/settings");
  await page.getByRole("tab", { name: /integrations/i }).click();

  await expect(page.getByText(/integration infrastructure/i)).toBeVisible();
  await expect(page.getByText("QuickBooks Online", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Twilio SMS", { exact: true })).toBeVisible();
  await expect(page.getByText("Failure visibility", { exact: true })).toBeVisible();
  await expect(page.getByText(/quickbooks token refresh failed/i)).toBeVisible();

  await page.getByRole("button", { name: /^retry$/i }).click();
  await expect(page.getByText(/moved back into the retry queue/i)).toBeVisible();
});
