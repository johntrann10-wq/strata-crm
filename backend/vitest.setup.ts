// Run before test files; ensures app and db can load when DATABASE_URL is unset (e.g. in CI).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://localhost:5432/strata_test";
}

// Backend env validation: ensure required env vars exist during tests.
// These are safe placeholders because integration tests stub/skip external calls.
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.API_BASE ??= "http://localhost:3001";

process.env.SMTP_HOST ??= "smtp.gmail.com";
process.env.SMTP_PORT ??= "465";
process.env.SMTP_USER ??= "test@example.com";
process.env.SMTP_PASS ??= "test-app-password";
process.env.SMTP_FROM ??= process.env.SMTP_USER;

process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_dummy";
process.env.STRIPE_PRICE_ID ??= "price_dummy";

process.env.CRON_SECRET ??= "cron_test_dummy";
process.env.PORT ??= "3001";
process.env.LOG_LEVEL ??= "info";

process.env.GOOGLE_CLIENT_ID ??= "google-client-id-dummy";
process.env.GOOGLE_CLIENT_SECRET ??= "google-client-secret-dummy";
