import { logger } from "./logger.js";
import { listIntegrationFeatureFlags } from "./integrationFeatureFlags.js";
import { isIntegrationVaultConfigured } from "./integrationVault.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value == null || String(value).trim() === "") {
    throw new Error(`${name} is required`);
  }
  return String(value).trim();
}

function parseHttpUrl(name: string, value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute http(s) URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
  return parsed;
}

function requireHttpUrlEnv(name: string): string {
  const value = requireEnv(name);
  parseHttpUrl(name, value);
  return value;
}

function ensureOriginOnlyUrl(name: string, value: string): string {
  const parsed = parseHttpUrl(name, value);
  const hasPath = parsed.pathname && parsed.pathname !== "/";
  if (hasPath || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an origin only (scheme + host + optional port, no path, query, or hash)`);
  }
  return parsed.origin;
}

function requireOriginOnlyUrlEnv(name: string): string {
  const value = requireEnv(name);
  ensureOriginOnlyUrl(name, value);
  return value;
}

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return [
    "change-me",
    "change_me",
    "replace-with",
    "replace_me",
    "placeholder",
    "dummy",
    "example",
    "your-",
    "not-for-production",
    "local-dev",
    "test-secret",
  ].some((needle) => normalized.includes(needle));
}

function validateSecretShape(name: string, value: string): void {
  const trimmed = value.trim();
  if (isPlaceholderSecret(trimmed)) {
    throw new Error(`${name} must not use a placeholder value in production`);
  }
  if ((name === "JWT_SECRET" || name === "CRON_SECRET" || name === "INTEGRATION_VAULT_SECRET") && trimmed.length < 16) {
    throw new Error(`${name} must be at least 16 characters in production`);
  }
  if (name === "STRIPE_SECRET_KEY" && !/^sk_(live|test)_[A-Za-z0-9]+$/.test(trimmed)) {
    throw new Error("STRIPE_SECRET_KEY must look like a Stripe secret key");
  }
  if (name === "STRIPE_WEBHOOK_SECRET" && !/^whsec_[A-Za-z0-9]+$/.test(trimmed)) {
    throw new Error("STRIPE_WEBHOOK_SECRET must look like a Stripe webhook secret");
  }
}

function validateVaultKeyId(name: string, value: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value.trim())) {
    throw new Error(`${name} must use only letters, numbers, underscores, or hyphens`);
  }
}

function validateOptionalSecretEnv(name: string): void {
  const value = process.env[name]?.trim();
  if (!value) return;
  validateSecretShape(name, value);
}

function warnIfPartialEmailConfig(): void {
  const smtpFields = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"] as const;
  const populatedSmtpFields = smtpFields.filter((name) => process.env[name]?.trim());
  if (populatedSmtpFields.length > 0 && populatedSmtpFields.length < smtpFields.length) {
    logger.warn("SMTP env is partially configured; email delivery stays disabled until all SMTP settings are present", {
      configuredFields: populatedSmtpFields,
    });
  }

  const hasResendApiKey = !!process.env.RESEND_API_KEY?.trim();
  const hasResendFrom = !!(process.env.RESEND_FROM?.trim() || process.env.SMTP_FROM?.trim());
  if (hasResendApiKey !== hasResendFrom) {
    logger.warn("Resend env is partially configured; email delivery stays disabled until both RESEND_API_KEY and sender address are set");
  }
}

function validateOptionalServiceEnv(): void {
  validateOptionalSecretEnv("CRON_SECRET");
  validateOptionalSecretEnv("INTEGRATION_VAULT_SECRET");
  validateOptionalSecretEnv("INTEGRATION_VAULT_PREVIOUS_SECRET");
  const vaultKeyId = process.env.INTEGRATION_VAULT_KEY_ID?.trim();
  const previousVaultKeyId = process.env.INTEGRATION_VAULT_PREVIOUS_KEY_ID?.trim();
  if (vaultKeyId) validateVaultKeyId("INTEGRATION_VAULT_KEY_ID", vaultKeyId);
  if (previousVaultKeyId) validateVaultKeyId("INTEGRATION_VAULT_PREVIOUS_KEY_ID", previousVaultKeyId);
  if (vaultKeyId && previousVaultKeyId && vaultKeyId === previousVaultKeyId) {
    throw new Error("INTEGRATION_VAULT_KEY_ID and INTEGRATION_VAULT_PREVIOUS_KEY_ID must differ");
  }
  if (process.env.INTEGRATION_VAULT_PREVIOUS_SECRET?.trim() && !process.env.INTEGRATION_VAULT_SECRET?.trim()) {
    throw new Error("INTEGRATION_VAULT_SECRET must be set when INTEGRATION_VAULT_PREVIOUS_SECRET is configured");
  }

  if (process.env.STRIPE_SECRET_KEY?.trim() || process.env.STRIPE_WEBHOOK_SECRET?.trim() || process.env.STRIPE_PRICE_ID?.trim()) {
    requireEnv("STRIPE_SECRET_KEY");
    requireEnv("STRIPE_WEBHOOK_SECRET");
    requireEnv("STRIPE_PRICE_ID");
    validateSecretShape("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY!);
    validateSecretShape("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET!);
    if (isPlaceholderSecret(process.env.STRIPE_PRICE_ID!)) {
      throw new Error("STRIPE_PRICE_ID must not use a placeholder value in production");
    }
  }

  if (process.env.RESEND_API_KEY?.trim() || process.env.RESEND_FROM?.trim()) {
    requireEnv("RESEND_API_KEY");
    requireEnv("RESEND_FROM");
    validateSecretShape("RESEND_API_KEY", process.env.RESEND_API_KEY!);
  }

  if (isGoogleOAuthEnabled()) {
    validateSecretShape("GOOGLE_CLIENT_SECRET", requireEnv("GOOGLE_CLIENT_SECRET"));
    requireHttpUrlEnv("API_BASE");
  }

  warnIfPartialEmailConfig();
}

function isGoogleOAuthEnabled(): boolean {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return !!(id && secret);
}

/** True when SMTP env is set enough to send mail (host, port, user, pass). */
export function isSmtpConfigured(): boolean {
  const host = process.env.SMTP_HOST?.trim();
  const port = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return !!(host && port && user && pass);
}

/** True when Resend env is set enough to send mail over HTTPS. */
export function isResendConfigured(): boolean {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() || process.env.SMTP_FROM?.trim();
  return !!(apiKey && from);
}

export function isEmailConfigured(): boolean {
  return isResendConfigured() || isSmtpConfigured();
}

export function getConfiguredSmtpSender(): string | null {
  const from = process.env.SMTP_FROM?.trim();
  if (from) return from;
  const user = process.env.SMTP_USER?.trim();
  if (user) return user;
  return null;
}

export function getConfiguredEmailSender(): string | null {
  const resendFrom = process.env.RESEND_FROM?.trim();
  if (resendFrom) return resendFrom;
  return getConfiguredSmtpSender();
}

export function getConfiguredEmailReplyTo(): string | null {
  const explicit =
    process.env.EMAIL_REPLY_TO?.trim() ||
    process.env.RESEND_REPLY_TO?.trim() ||
    process.env.SMTP_REPLY_TO?.trim();
  if (explicit) return explicit;
  return getConfiguredEmailSender();
}

/** True when Stripe secret key looks like a real key (sk_…). */
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return !!(key && key.startsWith("sk_"));
}

/** Safe defaults for local dev and tests (not applied in production). */
function applyNonProductionDefaults(): void {
  if (process.env.NODE_ENV === "production") return;

  process.env.JWT_SECRET ??= "dev-jwt-secret-not-for-production";
  process.env.FRONTEND_URL ??= "http://localhost:5173";
  process.env.PORT ??= "3001";
  process.env.LOG_LEVEL ??= "info";
  process.env.API_BASE ??= "http://localhost:3001";
}

function ensureLogLevel(): void {
  if (!process.env.LOG_LEVEL?.trim()) {
    process.env.LOG_LEVEL = "info";
  }
}

function logOptionalServices(): void {
  if (!isStripeConfigured()) {
    logger.info("Stripe disabled");
  }
  if (!isEmailConfigured()) {
    logger.info("Transactional email disabled");
  } else {
    if (isResendConfigured()) {
      logger.info("Resend enabled", {
        sender: getConfiguredEmailSender(),
      });
    }
    if (isSmtpConfigured()) {
      logger.info("SMTP enabled", {
        host: process.env.SMTP_HOST?.trim() ?? null,
        port: process.env.SMTP_PORT?.trim() ?? null,
        sender: getConfiguredSmtpSender(),
      });
    }
  }
  const cron = process.env.CRON_SECRET?.trim();
  if (!cron) {
    logger.warn("CRON_SECRET not set: cron worker endpoints stay disabled until x-cron-secret can be enforced");
  }
  const integrationFlags = listIntegrationFeatureFlags();
  logger.info("Integration feature flags", integrationFlags);
  if (Object.values(integrationFlags).some(Boolean) && !isIntegrationVaultConfigured()) {
    logger.warn("Integration vault secret is missing; encrypted provider connections will remain unavailable");
  }
}

function validateProductionEnv(): void {
  requireEnv("DATABASE_URL");
  validateSecretShape("JWT_SECRET", requireEnv("JWT_SECRET"));
  requireOriginOnlyUrlEnv("FRONTEND_URL");
  requireEnv("PORT");
  ensureLogLevel();
  validateOptionalServiceEnv();
}

function validateNonProductionEnv(): void {
  applyNonProductionDefaults();
  requireEnv("DATABASE_URL");
  if (process.env.FRONTEND_URL?.trim()) {
    requireOriginOnlyUrlEnv("FRONTEND_URL");
  }
  if (process.env.API_BASE?.trim()) {
    requireHttpUrlEnv("API_BASE");
  }
  ensureLogLevel();
  warnIfPartialEmailConfig();
}

/** Validate env at startup: production requires core secrets only; optional services stay off until configured. */
export function validateEnv(): void {
  if (process.env.NODE_ENV === "production") {
    validateProductionEnv();
  } else {
    validateNonProductionEnv();
  }
  logOptionalServices();
}

export function isCronSecretConfigured(): boolean {
  return !!process.env.CRON_SECRET?.trim();
}

export function isHomeDashboardEnabled(): boolean {
  const raw = process.env.STRATA_HOME_DASHBOARD_V2?.trim().toLowerCase();
  if (!raw) return true;
  return raw !== "false" && raw !== "0" && raw !== "off";
}
