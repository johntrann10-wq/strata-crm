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
    billingScenario?:
      | "default"
      | "trial_soft_prompt"
      | "trial_needs_payment_method"
      | "paused_trial";
    membershipRole?: "owner" | "admin" | "manager" | "technician";
    permissions?: string[];
  }
) {
  const membershipRole = options?.membershipRole ?? "owner";
  const membershipPermissions =
    options?.permissions ??
    (membershipRole === "owner" || membershipRole === "admin"
      ? ["dashboard.view", "settings.read", "settings.write"]
      : ["dashboard.view", "settings.read"]);
  let quickBooksConnected = true;
  let quickBooksLastError: string | null = null;
  let quickBooksLastSuccessfulAt = "2026-04-04T17:00:00.000Z";
  let twilioConnected = false;
  let twilioAccountSid = "";
  let twilioMessagingServiceSid = "";
  let twilioEnabledTemplateSlugs = [
    "lead_auto_response",
    "missed_call_text_back",
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
  let billingState =
    options?.billingScenario === "trial_soft_prompt"
      ? {
          status: "trialing",
          accessState: "active_trial",
          trialStartedAt: "2026-03-19T00:00:00.000Z",
          trialEndsAt: "2026-05-18T00:00:00.000Z",
          currentPeriodEnd: "2026-05-18T00:00:00.000Z",
          billingHasPaymentMethod: false,
          billingPaymentMethodAddedAt: null,
          billingSetupError: null,
          billingSetupFailedAt: null,
          billingLastStripeEventId: "evt_trial_soft_prompt",
          billingLastStripeEventType: "customer.subscription.updated",
          billingLastStripeEventAt: "2026-04-11T16:00:00.000Z",
          billingLastStripeSyncStatus: "synced",
          billingLastStripeSyncError: null,
          activationMilestone: {
            reached: true,
            type: "appointment_created",
            occurredAt: "2026-04-10T15:00:00.000Z",
            detail: "First appointment created",
          },
          billingPrompt: {
            stage: "soft_activation",
            visible: true,
            daysLeftInTrial: 37,
            dismissedUntil: null,
            cooldownDays: 5,
          },
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
        }
      : options?.billingScenario === "trial_needs_payment_method"
      ? {
          status: "trialing",
          accessState: "active_trial",
          trialStartedAt: "2026-03-19T00:00:00.000Z",
          trialEndsAt: "2026-04-18T00:00:00.000Z",
          currentPeriodEnd: "2026-04-18T00:00:00.000Z",
          billingHasPaymentMethod: false,
          billingPaymentMethodAddedAt: null,
          billingSetupError: null,
          billingSetupFailedAt: null,
          billingLastStripeEventId: "evt_trial_will_end",
          billingLastStripeEventType: "customer.subscription.trial_will_end",
          billingLastStripeEventAt: "2026-04-11T16:00:00.000Z",
          billingLastStripeSyncStatus: "synced",
          billingLastStripeSyncError: null,
          activationMilestone: {
            reached: true,
            type: "appointment_created",
            occurredAt: "2026-04-04T15:00:00.000Z",
            detail: "First appointment created",
          },
          billingPrompt: {
            stage: "trial_7_days",
            visible: true,
            daysLeftInTrial: 7,
            dismissedUntil: null,
            cooldownDays: 5,
          },
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
        }
      : options?.billingScenario === "paused_trial"
      ? {
          status: "paused",
          accessState: "paused_missing_payment_method",
          trialStartedAt: "2026-03-01T00:00:00.000Z",
          trialEndsAt: "2026-03-31T00:00:00.000Z",
          currentPeriodEnd: "2026-03-31T00:00:00.000Z",
          billingHasPaymentMethod: false,
          billingPaymentMethodAddedAt: null,
          billingSetupError: null,
          billingSetupFailedAt: null,
          billingLastStripeEventId: "evt_subscription_paused",
          billingLastStripeEventType: "customer.subscription.paused",
          billingLastStripeEventAt: "2026-03-31T00:00:00.000Z",
          billingLastStripeSyncStatus: "failed",
          billingLastStripeSyncError: "Trial paused because no payment method was saved before the trial ended.",
          activationMilestone: {
            reached: true,
            type: "appointment_created",
            occurredAt: "2026-04-04T15:00:00.000Z",
            detail: "First appointment created",
          },
          billingPrompt: {
            stage: "paused",
            visible: true,
            daysLeftInTrial: 0,
            dismissedUntil: null,
            cooldownDays: 5,
          },
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
        }
      : {
          status: "active",
          accessState: "active_paid",
          trialStartedAt: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
          billingHasPaymentMethod: true,
          billingPaymentMethodAddedAt: "2026-04-01T12:00:00.000Z",
          billingSetupError: null,
          billingSetupFailedAt: null,
          billingLastStripeEventId: "evt_invoice_payment_succeeded",
          billingLastStripeEventType: "invoice.payment_succeeded",
          billingLastStripeEventAt: "2026-04-11T16:00:00.000Z",
          billingLastStripeSyncStatus: "synced",
          billingLastStripeSyncError: null,
          activationMilestone: { reached: false, type: null, occurredAt: null, detail: null },
          billingPrompt: {
            stage: "none",
            visible: false,
            daysLeftInTrial: null,
            dismissedUntil: null,
            cooldownDays: 5,
          },
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
        };
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
              role: membershipRole,
              status: "active",
              isDefault: true,
              permissions: membershipPermissions,
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
        leadCaptureEnabled: true,
        leadAutoResponseEnabled: true,
        leadAutoResponseEmailEnabled: true,
        leadAutoResponseSmsEnabled: false,
        missedCallTextBackEnabled: true,
        automationUncontactedLeadsEnabled: true,
        automationUncontactedLeadHours: 2,
        automationAppointmentRemindersEnabled: true,
        automationAppointmentReminderHours: 24,
        automationSendWindowStartHour: 8,
        automationSendWindowEndHour: 18,
        automationAbandonedQuotesEnabled: true,
        automationAbandonedQuoteHours: 48,
        automationReviewRequestsEnabled: true,
        automationReviewRequestDelayHours: 24,
        reviewRequestUrl: "https://example.com/review",
        automationLapsedClientsEnabled: true,
        automationLapsedClientMonths: 6,
        bookingRequestUrl: "https://example.com/book",
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

  await context.route("**/api/actions/getHomeDashboard", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Mock dashboard unavailable for billing banner test",
      }),
    });
  });

  await context.route("**/api/actions/getAutomationSummary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uncontactedLeads: {
          sentLast30Days: 2,
          lastSentAt: "2026-04-04T19:45:00.000Z",
          skippedLast30Days: 1,
          lastSkippedAt: "2026-04-04T16:00:00.000Z",
          failedLast30Days: 0,
          lastFailedAt: null,
        },
        appointmentReminders: {
          sentLast30Days: 0,
          lastSentAt: null,
          skippedLast30Days: 2,
          lastSkippedAt: "2026-04-04T17:20:00.000Z",
          failedLast30Days: 0,
          lastFailedAt: null,
        },
        abandonedQuotes: {
          sentLast30Days: 1,
          lastSentAt: "2026-04-04T18:05:00.000Z",
          skippedLast30Days: 0,
          lastSkippedAt: null,
          failedLast30Days: 0,
          lastFailedAt: null,
        },
        reviewRequests: {
          sentLast30Days: 0,
          lastSentAt: null,
          skippedLast30Days: 1,
          lastSkippedAt: "2026-04-04T15:10:00.000Z",
          failedLast30Days: 0,
          lastFailedAt: null,
        },
        lapsedClients: {
          sentLast30Days: 0,
          lastSentAt: null,
          skippedLast30Days: 4,
          lastSkippedAt: "2026-04-04T17:20:00.000Z",
          failedLast30Days: 0,
          lastFailedAt: null,
        },
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
            id: "auto-feed-0",
            kind: "sent",
            automationType: "uncontacted_lead",
            channel: "email",
            recipient: "owner@example.com",
            entityType: "client",
            entityId: "client-1",
            createdAt: "2026-04-04T19:30:00.000Z",
            message: "Uncontacted lead follow-up alert sent.",
          },
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
            kind: "sent",
            automationType: "abandoned_quote",
            channel: "email",
            recipient: "lead@example.com",
            entityType: "quote",
            entityId: "quote-2",
            createdAt: "2026-04-04T18:50:00.000Z",
            message: "Abandoned quote follow-up sent.",
          },
          {
            id: "auto-feed-3",
            kind: "failed",
            automationType: "review_request",
            channel: "sms",
            recipient: "+15555550123",
            entityType: "appointment",
            entityId: "appointment-2",
            createdAt: "2026-04-04T18:40:00.000Z",
            message: "Twilio callback reported delivery failure.",
          },
          {
            id: "auto-feed-4",
            kind: "skipped",
            automationType: "lapsed_client",
            channel: "email",
            recipient: null,
            entityType: "business",
            entityId: "biz-1",
            createdAt: "2026-04-04T17:20:00.000Z",
            message: "Lapsed client outreach skipped: Outside Send Window.",
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
          sentLast24Hours: 4,
          skippedLast24Hours: 2,
          lastActivityAt: "2026-04-04T19:15:00.000Z",
          lastSkippedAt: "2026-04-04T17:20:00.000Z",
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

  await context.route(/.*\/api\/billing\/(status|refresh-state)$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(billingState),
    });
  });

  await context.route("**/api/billing/portal", async (route) => {
    const payload = (route.request().postDataJSON() ?? {}) as {
      entryPoint?: "settings" | "trial_banner" | "paused_recovery";
    };
    if (
      options?.billingScenario === "trial_needs_payment_method" ||
      options?.billingScenario === "trial_soft_prompt"
    ) {
      billingState = {
        ...billingState,
        status: "trialing",
        accessState: "active_trial",
        billingHasPaymentMethod: true,
        billingPaymentMethodAddedAt: "2026-04-11T16:00:00.000Z",
        billingPrompt: {
          stage: "none",
          visible: false,
          daysLeftInTrial: billingState.billingPrompt.daysLeftInTrial,
          dismissedUntil: null,
          cooldownDays: 5,
        },
      };
    } else if (options?.billingScenario === "paused_trial") {
      billingState = {
        ...billingState,
        status: "active",
        accessState: "active_paid",
        billingHasPaymentMethod: true,
        billingPaymentMethodAddedAt: "2026-04-11T16:00:00.000Z",
        billingLastStripeEventId: "evt_subscription_resumed",
        billingLastStripeEventType: "customer.subscription.resumed",
        billingLastStripeEventAt: "2026-04-11T16:05:00.000Z",
        billingLastStripeSyncStatus: "synced",
        billingLastStripeSyncError: null,
        billingPrompt: {
          stage: "none",
          visible: false,
          daysLeftInTrial: null,
          dismissedUntil: null,
          cooldownDays: 5,
        },
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url:
          payload.entryPoint === "paused_recovery"
            ? "/subscribe?billingPortal=return"
            : payload.entryPoint === "trial_banner"
              ? "/signed-in?billingPortal=return"
              : "/settings?tab=billing&billingPortal=return",
      }),
    });
  });

  await context.route("**/api/billing/prompt-event", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
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
  await expect(page.getByText(/4 sent/i)).toBeVisible();
  await expect(page.getByText(/2 skipped \/ 24h/i)).toBeVisible();
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
  await expect(page.getByRole("button", { name: /refresh activity/i })).toBeVisible();
  await expect(page.getByText(/skipped in the last 30 days: 4/i)).toBeVisible();
  await expect(page.getByText("Quote follow-up", { exact: true })).toBeVisible();
  await expect(page.getByText(/automation send window/i)).toBeVisible();
  await expect(page.getByText(/^Start hour$/i)).toBeVisible();
  await expect(page.getByText(/^End hour$/i)).toBeVisible();
  await expect(page.getByRole("paragraph").filter({ hasText: /missed-call text back/i })).toBeVisible();
  await expect(page.getByText(/\/api\/integrations\/twilio\/voice\/<connectionId>/i)).toBeVisible();
  await expect(page.getByText(/appointment reminder sent\./i)).toBeVisible();
  await expect(page.getByText(/abandoned quote follow-up sent\./i)).toBeVisible();
  await expect(page.getByText(/client@example\.com/i)).toBeVisible();
  await expect(page.getByText(/twilio callback reported delivery failure\./i)).toBeVisible();
  await expect(page.getByText(/lapsed client outreach skipped: outside send window\./i)).toBeVisible();
  await expect(page.getByText(/^SMS$/i)).toBeVisible();

  await page.getByRole("button", { name: /issues only/i }).click();
  await expect(page.getByText(/appointment reminder sent\./i)).not.toBeVisible();
  await expect(page.getByText(/abandoned quote follow-up sent\./i)).not.toBeVisible();
  await expect(page.getByText(/twilio callback reported delivery failure\./i)).toBeVisible();
  await expect(page.getByText(/lapsed client outreach skipped: outside send window\./i)).toBeVisible();

  await page.getByRole("button", { name: /refresh activity/i }).click();
  await expect(page.getByText(/twilio callback reported delivery failure\./i)).toBeVisible();

  await page.getByLabel(/channel/i).click();
  await page.getByRole("option", { name: /^SMS$/i }).click();
  await expect(page.getByText(/twilio callback reported delivery failure\./i)).toBeVisible();
  await expect(page.getByText(/lapsed client outreach skipped: outside send window\./i)).not.toBeVisible();

  await page.getByLabel(/channel/i).click();
  await page.getByRole("option", { name: /all channels/i }).click();
  await page.getByRole("button", { name: /all activity/i }).click();
  await page.getByRole("combobox", { name: /^automation$/i }).click();
  await page.getByRole("option", { name: /abandoned quote follow-up/i }).click();
  await expect(page.getByText(/abandoned quote follow-up sent\./i)).toBeVisible();
});

test("shows a soft trial prompt after activation and clears billing urgency after adding a payment method", async ({
  page,
  context,
}) => {
  await mockAuthenticatedSettings(context, {
    billingScenario: "trial_soft_prompt",
  });

  await page.goto("/signed-in");

  await expect(page.getByText("Your trial is active", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/first appointment created\. add payment method to keep access after trial\./i)).toBeVisible();

  await page.goto("/settings?tab=billing");

  await expect(page.getByRole("button", { name: /add payment method/i }).last()).toBeVisible();

  await page.getByRole("button", { name: /add payment method/i }).last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /add payment method/i }).click();

  await expect(
    page.getByText(/payment method saved\. your trial stays active and billing reminders have been cleared\./i).first()
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /manage billing/i })).toBeVisible();
  await expect(page.getByText(/first appointment created\. add payment method to keep access after trial\./i)).not.toBeVisible();
});

test("shows trial_will_end reminder copy and blocks billing controls for non-admin team members", async ({
  page,
  context,
}) => {
  await mockAuthenticatedSettings(context, {
    billingScenario: "trial_needs_payment_method",
    membershipRole: "technician",
    permissions: ["dashboard.view", "settings.read"],
  });

  await page.goto("/signed-in");

  await expect(page.getByText("Your trial is active", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/7 days left\. add payment method to keep access after trial\./i)).toBeVisible();
  await expect(page.getByText(/owners and admins manage billing\./i)).toBeVisible();

  await page.goto("/settings?tab=billing");
  await expect(page.getByText(/ask an owner or admin to update billing for this workspace\./i)).toBeVisible();
  await expect(page.getByRole("button", { name: /add payment method|manage billing/i }).last()).toBeDisabled();
});

test("resumes a paused trial after billing portal recovery", async ({ page, context }) => {
  await mockAuthenticatedSettings(context, {
    billingScenario: "paused_trial",
  });

  await page.goto("/subscribe");

  await expect(page.getByText(/trial ended without a saved payment method\. add one to resume full access immediately\./i)).toBeVisible();
  await page.getByRole("button", { name: /resume subscription/i }).click();

  await expect(page).toHaveURL(/\/signed-in/);
});

test.describe("trial billing mobile surfaces", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps the trial banner and paused recovery usable on mobile", async ({ page, context }) => {
    await mockAuthenticatedSettings(context, {
      billingScenario: "trial_needs_payment_method",
    });

    await page.goto("/signed-in");
    await expect(page.getByText("Your trial is active", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /add payment method/i }).first()).toBeVisible();

    await mockAuthenticatedSettings(context, {
      billingScenario: "paused_trial",
    });
    await page.goto("/subscribe");
    await expect(page.getByText(/trial ended without a saved payment method/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /resume subscription/i })).toBeVisible();
  });
});
