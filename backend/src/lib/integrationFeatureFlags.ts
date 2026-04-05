export type IntegrationProvider =
  | "quickbooks_online"
  | "twilio_sms"
  | "google_calendar"
  | "outbound_webhooks";

const PROVIDER_ENV_FLAGS: Record<IntegrationProvider, string> = {
  quickbooks_online: "FEATURE_INTEGRATION_QUICKBOOKS_ONLINE",
  twilio_sms: "FEATURE_INTEGRATION_TWILIO_SMS",
  google_calendar: "FEATURE_INTEGRATION_GOOGLE_CALENDAR",
  outbound_webhooks: "FEATURE_INTEGRATION_OUTBOUND_WEBHOOKS",
};

function parseFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isIntegrationFeatureEnabled(provider: IntegrationProvider): boolean {
  return parseFlag(process.env[PROVIDER_ENV_FLAGS[provider]]);
}

export function listIntegrationFeatureFlags(): Record<IntegrationProvider, boolean> {
  return {
    quickbooks_online: isIntegrationFeatureEnabled("quickbooks_online"),
    twilio_sms: isIntegrationFeatureEnabled("twilio_sms"),
    google_calendar: isIntegrationFeatureEnabled("google_calendar"),
    outbound_webhooks: isIntegrationFeatureEnabled("outbound_webhooks"),
  };
}

