import type { IntegrationProvider } from "./integrationFeatureFlags.js";

export type IntegrationRegistryEntry = {
  provider: IntegrationProvider;
  label: string;
  ownerType: "business" | "user";
  description: string;
  permissions: {
    read: "settings.read";
    write: "settings.write";
  };
};

export const INTEGRATION_REGISTRY: IntegrationRegistryEntry[] = [
  {
    provider: "quickbooks_online",
    label: "QuickBooks Online",
    ownerType: "business",
    description: "Sync customers, invoices, and recorded payments from Strata into QuickBooks Online.",
    permissions: { read: "settings.read", write: "settings.write" },
  },
  {
    provider: "twilio_sms",
    label: "Twilio SMS",
    ownerType: "business",
    description: "Deliver transactional text messages with callback-driven delivery tracking.",
    permissions: { read: "settings.read", write: "settings.write" },
  },
  {
    provider: "google_calendar",
    label: "Google Calendar",
    ownerType: "user",
    description: "One-way appointment sync from Strata into a selected Google Calendar.",
    permissions: { read: "settings.read", write: "settings.write" },
  },
  {
    provider: "outbound_webhooks",
    label: "Signed webhooks",
    ownerType: "business",
    description: "Versioned outbound events for Zapier, Make, n8n, and custom endpoints.",
    permissions: { read: "settings.read", write: "settings.write" },
  },
];

export function getIntegrationRegistryEntry(provider: IntegrationProvider) {
  return INTEGRATION_REGISTRY.find((entry) => entry.provider === provider) ?? null;
}

