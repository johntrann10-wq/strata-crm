import { expect, test } from "@playwright/test";

type InfrastructureOverride = {
  vaultConfigured?: boolean;
  cronSecretConfigured?: boolean;
  providerConfiguration?: {
    quickbooks_online?: boolean;
    twilio_sms?: boolean;
    google_calendar?: boolean;
    outbound_webhooks?: boolean;
  };
};

async function mockAuthenticatedSettings(
  context: import("@playwright/test").BrowserContext,
  options?: {
    infrastructure?: InfrastructureOverride;
  }
) {
  let quickBooksConnected = true;
  let quickBooksLastError: string | null = null;
  let quickBooksLastSuccessfulAt = "2026-04-04T17:00:00.000Z";
  let twilioConnected = false;
  let twilioAccountSid = "";
  let twilioMessagingServiceSid = "";
  let twilioEnabledTemplateSlugs = [
    "appointment_confirmation",
    "appointment_reminder",
    "review_request",
    "lapsed_client_reengagement",
  ];
  let googleCalendarConnected = false;
  let googleSelectedCalendarId = "primary";
  let googleSelectedCalendarSummary = "Owner Schedule";
  let webhookEnabled = false;
  let webhookUrl = "";
  let webhookSecret = "";
  let webhookEvents = ["invoice.sent", "payment.recorded"];
  const infrastructure = {
    vaultConfigured: options?.infrastructure?.vaultConfigured ?? true,
    cronSecretConfigured: options?.infrastructure?.cronSecretConfigured ?? true,
    providerConfiguration: {
      quickbooks_online: options?.infrastructure?.providerConfiguration?.quickbooks_online ?? true,
      twilio_sms: options?.infrastructure?.providerConfiguration?.twilio_sms ?? true,
      google_calendar: options?.infrastructure?.providerConfiguration?.google_calendar ?? true,
      outbound_webhooks: options?.infrastructure?.providerConfiguration?.outbound_webhooks ?? true,
    },
  };

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
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON() as {
        integrationWebhookEnabled?: boolean;
        integrationWebhookUrl?: string | null;
        integrationWebhookSecret?: string | null;
        integrationWebhookEvents?: string[];
      };
      webhookEnabled = payload.integrationWebhookEnabled ?? webhookEnabled;
      webhookUrl = payload.integrationWebhookUrl ?? "";
      webhookSecret = payload.integrationWebhookSecret ?? "";
      webhookEvents = payload.integrationWebhookEvents ?? webhookEvents;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "biz-1",
        name: "QA Detail Shop",
        type: "auto_detailing",
        onboardingComplete: true,
        integrationWebhookEnabled: webhookEnabled,
        integrationWebhookUrl: webhookUrl || null,
        integrationWebhookSecret: webhookSecret || null,
        integrationWebhookEvents: webhookEvents,
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

  await context.route("**/api/actions/getAutomationFeed", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        records: [
          {
            id: "auto-feed-1",
            kind: "sent",
            automationType: "appointment_reminder",
            channel: "email",
            recipient: "client@example.com",
            entityType: "appointment",
            entityId: "appointment-1",
            createdAt: "2026-04-04T19:15:00.000Z",
            message: "Appointment reminder sent.",
          },
          {
            id: "auto-feed-2",
            kind: "failed",
            automationType: "review_request",
            channel: "sms",
            recipient: "+15555550123",
            entityType: "appointment",
            entityId: "appointment-2",
            createdAt: "2026-04-04T18:40:00.000Z",
            message: "Twilio callback reported delivery failure.",
          },
        ],
      }),
    });
  });

  await context.route("**/api/actions/getWorkerHealth", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        automations: {
          sentLast24Hours: 3,
          lastActivityAt: "2026-04-04T19:15:00.000Z",
          failedLast24Hours: 1,
          lastFailureAt: "2026-04-04T18:40:00.000Z",
        },
        integrations: {
          lastAttemptAt: "2026-04-04T19:05:00.000Z",
          pendingJobs: 2,
          processingJobs: 1,
          failedJobs: 1,
          deadLetterJobs: 0,
        },
      }),
    });
  });

  await context.route("**/api/integrations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        infrastructure: {
          vaultConfigured: infrastructure.vaultConfigured,
          cronSecretConfigured: infrastructure.cronSecretConfigured,
          providerConfiguration: infrastructure.providerConfiguration,
        },
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
          {
            provider: "google_calendar",
            label: "Google Calendar",
            ownerType: "user",
            description: "One-way appointment sync from Strata into a selected Google Calendar.",
            permissions: { read: "settings.read", write: "settings.write" },
            featureFlagEnabled: true,
          },
          {
            provider: "outbound_webhooks",
            label: "Signed webhooks",
            ownerType: "business",
            description: "Versioned outbound events for Zapier, Make, n8n, and custom endpoints.",
            permissions: { read: "settings.read", write: "settings.write" },
            featureFlagEnabled: true,
          },
        ],
        connections: [
          ...(quickBooksConnected
            ? [
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
                  lastSyncedAt: quickBooksLastSuccessfulAt,
                  lastSuccessfulAt: quickBooksLastSuccessfulAt,
                  lastError: quickBooksLastError,
                  actionRequired: null,
                  connectedAt: "2026-04-04T16:00:00.000Z",
                  disconnectedAt: null,
                  configSummary: {
                    hasEncryptedAccessToken: true,
                    hasEncryptedRefreshToken: true,
                    hasConfig: true,
                    selectedCalendarId: null,
                    selectedCalendarSummary: null,
                    webhookUrl: null,
                    twilioMessagingServiceSid: null,
                  },
                },
              ]
            : []),
          ...(googleCalendarConnected
            ? [
                {
                  id: "conn-google-1",
                  provider: "google_calendar",
                  ownerType: "user",
                  ownerKey: "user:user-1",
                  userId: "user-1",
                  status: "connected",
                  displayName: "Google Calendar",
                  externalAccountId: null,
                  externalAccountName: null,
                  scopes: [
                    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
                    "https://www.googleapis.com/auth/calendar.events.owned",
                  ],
                  featureEnabled: true,
                  lastSyncedAt: "2026-04-04T18:45:00.000Z",
                  lastSuccessfulAt: "2026-04-04T18:45:00.000Z",
                  lastError: null,
                  actionRequired: null,
                  connectedAt: "2026-04-04T18:15:00.000Z",
                  disconnectedAt: null,
                  configSummary: {
                    hasEncryptedAccessToken: true,
                    hasEncryptedRefreshToken: true,
                    hasConfig: true,
                    selectedCalendarId: googleSelectedCalendarId,
                    selectedCalendarSummary: googleSelectedCalendarSummary,
                    webhookUrl: null,
                    twilioMessagingServiceSid: null,
                    twilioAccountSid: null,
                    twilioEnabledTemplateSlugs: [],
                  },
                },
              ]
            : []),
          ...(twilioConnected
            ? [
                {
                  id: "conn-2",
                  provider: "twilio_sms",
                  ownerType: "business",
                  ownerKey: "business:biz-1",
                  userId: null,
                  status: "connected",
                  displayName: "Twilio Messaging Service",
                  externalAccountId: twilioAccountSid,
                  externalAccountName: "Twilio Messaging Service",
                  scopes: [],
                  featureEnabled: true,
                  lastSyncedAt: null,
                  lastSuccessfulAt: "2026-04-04T18:30:00.000Z",
                  lastError: null,
                  actionRequired: null,
                  connectedAt: "2026-04-04T18:00:00.000Z",
                  disconnectedAt: null,
                  configSummary: {
                    hasEncryptedAccessToken: true,
                    hasEncryptedRefreshToken: false,
                    hasConfig: true,
                    selectedCalendarId: null,
                    selectedCalendarSummary: null,
                    webhookUrl: null,
                    twilioMessagingServiceSid,
                    twilioAccountSid,
                    twilioEnabledTemplateSlugs,
                  },
                },
              ]
            : []),
          ...(webhookEnabled && webhookUrl
            ? [
                {
                  id: "conn-webhook-1",
                  provider: "outbound_webhooks",
                  ownerType: "business",
                  ownerKey: "business:biz-1",
                  userId: null,
                  status: "connected",
                  displayName: "Signed webhooks",
                  externalAccountId: "hooks.example.com",
                  externalAccountName: "hooks.example.com",
                  scopes: [],
                  featureEnabled: true,
                  lastSyncedAt: "2026-04-04T18:45:00.000Z",
                  lastSuccessfulAt: "2026-04-04T18:45:00.000Z",
                  lastError: null,
                  actionRequired: null,
                  connectedAt: "2026-04-04T18:15:00.000Z",
                  disconnectedAt: null,
                  configSummary: {
                    hasEncryptedAccessToken: false,
                    hasEncryptedRefreshToken: false,
                    hasConfig: true,
                    selectedCalendarId: null,
                    selectedCalendarSummary: null,
                    webhookUrl,
                    twilioMessagingServiceSid: null,
                    twilioAccountSid: null,
                    twilioEnabledTemplateSlugs: [],
                  },
                },
              ]
            : []),
        ],
      }),
    });
  });

  await context.route("**/api/integrations/outbound-webhooks/recent-events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        records: [
          {
            id: "activity-1",
            action: "invoice.sent",
            entityType: "invoice",
            entityId: "invoice-1",
            createdAt: "2026-04-04T18:10:00.000Z",
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

  await context.route("**/api/integrations/quickbooks/start", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "/settings?tab=integrations&quickbooks=connected",
      }),
    });
  });

  await context.route("**/api/integrations/google-calendar/start", async (route) => {
    googleCalendarConnected = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "/settings?tab=integrations&googleCalendar=connected",
      }),
    });
  });

  await context.route("**/api/integrations/google-calendar/calendars", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        calendars: [
          { id: "primary", summary: "Owner Schedule", primary: true, accessRole: "owner", timeZone: "America/Los_Angeles" },
          { id: "team", summary: "Team Calendar", primary: false, accessRole: "writer", timeZone: "America/Los_Angeles" },
        ],
      }),
    });
  });

  await context.route("**/api/integrations/google-calendar/select-calendar", async (route) => {
    const payload = route.request().postDataJSON() as { calendarId?: string };
    googleSelectedCalendarId = payload.calendarId ?? "primary";
    googleSelectedCalendarSummary = googleSelectedCalendarId === "team" ? "Team Calendar" : "Owner Schedule";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record: { id: "conn-google-1", status: "connected" },
      }),
    });
  });

  await context.route("**/api/integrations/google-calendar/resync", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        queuedJobs: 4,
        appointments: 4,
      }),
    });
  });

  await context.route("**/api/integrations/google-calendar/disconnect", async (route) => {
    googleCalendarConnected = false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record: { id: "conn-google-1", status: "disconnected" },
      }),
    });
  });

  await context.route("**/api/integrations/quickbooks/resync", async (route) => {
    quickBooksLastSuccessfulAt = "2026-04-04T18:00:00.000Z";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        queuedJobs: 7,
        clients: 3,
        invoices: 2,
        payments: 2,
      }),
    });
  });

  await context.route("**/api/integrations/quickbooks/disconnect", async (route) => {
    quickBooksConnected = false;
    quickBooksLastError = null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record: { id: "conn-1", status: "disconnected" },
      }),
    });
  });

  await context.route("**/api/integrations/twilio/connect", async (route) => {
    const payload = route.request().postDataJSON() as {
      accountSid?: string;
      messagingServiceSid?: string;
      enabledTemplateSlugs?: string[];
    };
    twilioConnected = true;
    twilioAccountSid = payload.accountSid ?? "account-sid-test";
    twilioMessagingServiceSid = payload.messagingServiceSid ?? "messaging-service-test";
    twilioEnabledTemplateSlugs = payload.enabledTemplateSlugs ?? twilioEnabledTemplateSlugs;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record: { id: "conn-2", status: "connected" },
      }),
    });
  });

  await context.route("**/api/integrations/twilio/disconnect", async (route) => {
    twilioConnected = false;
    twilioAccountSid = "";
    twilioMessagingServiceSid = "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record: { id: "conn-2", status: "disconnected" },
      }),
    });
  });

  await context.route("**/api/integrations/outbound-webhooks/test", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record: { id: "job-webhook-test-1", status: "pending" },
      }),
    });
  });

  await context.route("**/api/integrations/outbound-webhooks/replay", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        record: { id: "job-webhook-replay-1", status: "pending" },
      }),
    });
  });
}

test("shows integration infrastructure and failure visibility in settings", async ({ page, context }) => {
  await mockAuthenticatedSettings(context);

  await page.goto("/settings");
  await page.getByRole("tab", { name: /integrations/i }).click();

  await expect(page.getByText(/integration infrastructure/i)).toBeVisible();
  await expect(page.getByText(/^Vault$/i)).toBeVisible();
  await expect(page.getByText(/^Cron secret$/i)).toBeVisible();
  await expect(page.getByText(/quickbooks online: ready/i)).toBeVisible();
  await expect(page.getByText(/3 sent \/ 24h/i)).toBeVisible();
  await expect(page.getByText(/2 pending/i)).toBeVisible();
  await expect(page.getByText("QuickBooks Online", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Twilio SMS", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Failure visibility", { exact: true })).toBeVisible();
  await expect(page.getByText(/quickbooks token refresh failed/i)).toBeVisible();

  await page.getByRole("button", { name: /^retry$/i }).click();
  await expect(page.getByText(/moved back into the retry queue/i)).toBeVisible();

  await page.getByRole("button", { name: /reconnect quickbooks/i }).click();
  await expect(page.getByText(/quickbooks is connected/i).first()).toBeVisible();

  await page.getByRole("button", { name: /queue full resync/i }).first().click();
  await expect(page.getByText(/queued 7 quickbooks sync jobs/i)).toBeVisible();

  await page.getByRole("button", { name: /^disconnect$/i }).first().click();
  await expect(page.getByText(/quickbooks disconnected/i)).toBeVisible();
  await expect(page.getByText(/not connected/i).first()).toBeVisible();

  await page.getByRole("button", { name: /connect google calendar/i }).click();
  await expect(page.getByText(/google calendar is connected/i).first()).toBeVisible();
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: /team calendar/i }).click();
  await expect(page.getByText(/google calendar selection saved/i).first()).toBeVisible();
  await page.getByRole("button", { name: /queue full resync/i }).nth(1).click();
  await expect(page.getByText(/queued 4 google calendar sync jobs/i).first()).toBeVisible();
  await page.getByRole("button", { name: /^disconnect$/i }).nth(1).click();
  await expect(page.getByText(/google calendar disconnected/i).first()).toBeVisible();

  await page.getByPlaceholder("AC...").fill("account-sid-test");
  await page.getByPlaceholder("MG...").fill("messaging-service-test");
  await page.getByPlaceholder(/auth token/i).fill("super-secret");
  await page.getByRole("button", { name: /connect twilio sms/i }).click();
  await expect(page.getByText(/twilio sms connected/i)).toBeVisible();
  await expect(page.getByText(/stored service/i)).toContainText("messaging-service-test");

  await page.getByRole("button", { name: /^disconnect$/i }).last().click();
  await expect(page.getByText(/twilio sms disconnected/i)).toBeVisible();

  await page.locator("label[for='webhook-enabled']").click();
  await page.getByPlaceholder("https://example.com/strata/webhooks").fill("https://hooks.example.com/strata");
  await page.getByPlaceholder(/optional hmac secret/i).fill("super-secret-webhook");
  await page.getByRole("button", { name: /save integrations/i }).click();
  await expect(page.getByText(/integration settings saved/i)).toBeVisible();
  await expect(page.getByText(/hooks\.example\.com/i).first()).toBeVisible();

  await page.getByRole("button", { name: /send test event/i }).click();
  await expect(page.getByText(/queued a signed webhook test event/i)).toBeVisible();

  await page.getByRole("button", { name: /^replay$/i }).click();
  await expect(page.getByText(/queued a replay for that webhook event/i)).toBeVisible();
});

test("disables provider setup actions when backend integration config is incomplete", async ({ page, context }) => {
  await mockAuthenticatedSettings(context, {
    infrastructure: {
      vaultConfigured: false,
      providerConfiguration: {
        quickbooks_online: false,
        twilio_sms: false,
        google_calendar: false,
        outbound_webhooks: false,
      },
    },
  });

  await page.goto("/settings");
  await page.getByRole("tab", { name: /integrations/i }).click();

  await expect(page.getByText(/integration connections stay read-only until/i)).toBeVisible();
  await expect(page.getByText(/quickbooks setup is unavailable/i)).toBeVisible();
  await expect(page.getByText(/google calendar setup is unavailable/i)).toBeVisible();
  await expect(page.getByText(/twilio sms setup is unavailable/i)).toBeVisible();
  await expect(page.getByText(/signed webhook testing and replay need encrypted integration storage/i)).toBeVisible();

  await expect(page.getByRole("button", { name: /connect quickbooks/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /connect google calendar/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /connect twilio sms/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /send test event/i })).toBeDisabled();
});

test("shows recent automation activity across email and sms channels", async ({ page, context }) => {
  await mockAuthenticatedSettings(context);

  await page.goto("/settings?tab=automations");

  await expect(page.getByText("Recent automation activity", { exact: true })).toBeVisible();
  await expect(page.getByText(/appointment reminder sent\./i)).toBeVisible();
  await expect(page.getByText(/client@example\.com/i)).toBeVisible();
  await expect(page.getByText(/twilio callback reported delivery failure\./i)).toBeVisible();
  await expect(page.getByText(/^SMS$/i)).toBeVisible();
});
