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

/** Validate required env vars at startup so production fails fast. */
export function validateEnv(): void {
  // Core / runtime requirements
  requireEnv("DATABASE_URL");
  requireEnv("JWT_SECRET");
  requireEnv("SESSION_SECRET");
  requireEnv("FRONTEND_URL");

  // SMTP (email sending)
  requireEnv("SMTP_HOST");
  requireEnv("SMTP_PORT");
  requireEnv("SMTP_USER");
  requireEnv("SMTP_PASS");

  // Billing (Stripe)
  requireEnv("STRIPE_SECRET_KEY");
  requireEnv("STRIPE_WEBHOOK_SECRET");
  requireEnv("STRIPE_PRICE_ID");

  // Automations (cron)
  requireEnv("CRON_SECRET");

  // Server runtime
  requireEnv("PORT");
  requireEnv("LOG_LEVEL");

  // Google OAuth: must not break startup when disabled.
  // If both GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are present, require API_BASE too.
  if (isGoogleOAuthEnabled()) {
    requireEnv("GOOGLE_CLIENT_ID");
    requireEnv("GOOGLE_CLIENT_SECRET");
    requireEnv("API_BASE");
  }
}

