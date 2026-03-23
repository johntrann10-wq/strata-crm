import { logger } from "./logger.js";

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
  process.env.SESSION_SECRET ??= "dev-session-secret-not-for-production";
}

function ensureSessionSecret(): void {
  if (!process.env.SESSION_SECRET?.trim()) {
    const jwt = process.env.JWT_SECRET?.trim();
    if (jwt) {
      process.env.SESSION_SECRET = jwt;
      logger.info("SESSION_SECRET not set; using JWT_SECRET for session signing");
    } else {
      process.env.SESSION_SECRET = "dev-session-secret-not-for-production";
    }
  }
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
  if (!isSmtpConfigured()) {
    logger.info("SMTP disabled");
  }
  const cron = process.env.CRON_SECRET?.trim();
  if (!cron) {
    logger.info("CRON_SECRET not set: POST /api/actions/runAutomations does not require x-cron-secret");
  }
}

function validateProductionEnv(): void {
  requireEnv("DATABASE_URL");
  requireEnv("JWT_SECRET");
  requireEnv("FRONTEND_URL");
  requireEnv("PORT");
  ensureLogLevel();
  ensureSessionSecret();

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
  ensureSessionSecret();
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
