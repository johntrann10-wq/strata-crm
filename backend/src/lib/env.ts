function requireEnv(name: string): string {
  const value = process.env[name];
  if (value == null || String(value).trim() === "") {
    throw new Error(`${name} is required`);
  }
  return String(value);
}

function isGoogleOAuthEnabled(): boolean {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return !!(id && secret);
}

/** Safe defaults so local dev and tests can start without a full production .env. */
function applyNonProductionDefaults(): void {
  if (process.env.NODE_ENV === "production") return;

  process.env.JWT_SECRET ??= "dev-jwt-secret-not-for-production";
  process.env.SESSION_SECRET ??= "dev-session-secret-not-for-production";
  process.env.FRONTEND_URL ??= "http://localhost:5173";
  process.env.PORT ??= "3001";
  process.env.LOG_LEVEL ??= "info";
  process.env.API_BASE ??= "http://localhost:3001";

  process.env.SMTP_HOST ??= "localhost";
  process.env.SMTP_PORT ??= "465";
  process.env.SMTP_USER ??= "dev@localhost";
  process.env.SMTP_PASS ??= "dev";
  process.env.SMTP_FROM ??= "dev@localhost";

  process.env.STRIPE_SECRET_KEY ??= "sk_test_dev_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_dev_placeholder";
  process.env.STRIPE_PRICE_ID ??= "price_dev_placeholder";
  process.env.CRON_SECRET ??= "cron_dev_placeholder";
}

function validateProductionEnv(): void {
  requireEnv("DATABASE_URL");
  requireEnv("JWT_SECRET");
  requireEnv("SESSION_SECRET");
  requireEnv("FRONTEND_URL");

  requireEnv("SMTP_HOST");
  requireEnv("SMTP_PORT");
  requireEnv("SMTP_USER");
  requireEnv("SMTP_PASS");

  requireEnv("STRIPE_SECRET_KEY");
  requireEnv("STRIPE_WEBHOOK_SECRET");
  requireEnv("STRIPE_PRICE_ID");

  requireEnv("CRON_SECRET");

  requireEnv("PORT");
  requireEnv("LOG_LEVEL");

  if (isGoogleOAuthEnabled()) {
    requireEnv("GOOGLE_CLIENT_ID");
    requireEnv("GOOGLE_CLIENT_SECRET");
    requireEnv("API_BASE");
  }
}

/** Validate env at startup: production requires real secrets; dev/test uses safe defaults. */
export function validateEnv(): void {
  applyNonProductionDefaults();
  if (process.env.NODE_ENV === "production") {
    validateProductionEnv();
  } else {
    requireEnv("DATABASE_URL");
  }
}
