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
  requireEnv("JWT_SECRET");
  requireEnv("FRONTEND_URL");
  requireEnv("PORT");
  ensureLogLevel();

  if (isGoogleOAuthEnabled()) {
    requireEnv("GOOGLE_CLIENT_ID");
    requireEnv("GOOGLE_CLIENT_SECRET");
    requireEnv("API_BASE");
  }
}

function validateNonProductionEnv(): void {
  applyNonProductionDefaults();
  requireEnv("DATABASE_URL");
  ensureLogLevel();
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
