# Strata Security Audit
Date: 2026-04-13

Scope
Backend API, frontend auth handling, Stripe billing, onboarding, appointments, customers/vehicles, quotes/invoices/payments, public/customer portals, integrations/webhooks, environment/config, and deployment/workflows. Audit is code-based; no runtime testing performed.

Positive Baseline Observations
- Stripe webhook signature verification is implemented and enforced. (backend/src/routes/billing.ts)
- Twilio webhook signature validation is implemented. (backend/src/lib/twilio.ts)
- Integration secrets (OAuth tokens/config) are encrypted with AES-256-GCM when the vault is configured. (backend/src/lib/integrationVault.ts)
- Public document HTML templates escape user-provided content to prevent XSS. (backend/src/lib/invoiceTemplate.ts, backend/src/lib/quoteTemplate.ts, backend/src/lib/appointmentTemplate.ts)
- Request logging avoids request bodies and sanitizes common secret keys. (backend/src/middleware/logging.ts, backend/src/lib/logger.ts)

Findings

1. [High] Role/permission enforcement is missing on core CRUD routes
Files: backend/src/routes/appointments.ts, backend/src/routes/clients.ts, backend/src/routes/vehicles.ts, backend/src/routes/quotes.ts, backend/src/routes/invoices.ts, backend/src/routes/payments.ts, backend/src/routes/services.ts, backend/src/routes/locations.ts, backend/src/routes/appointment-services.ts, backend/src/routes/quote-line-items.ts, backend/src/routes/invoice-line-items.ts, backend/src/routes/activity-logs.ts (GET), backend/src/routes/notification-logs.ts
Risk: Any authenticated team member can read/write most business data regardless of their role or permission overrides, including billing-sensitive data and PII.
Likely exploit/failure mode: A staff role intended to be read-only (or limited) can still create/update/delete appointments, invoices, quotes, client records, and payment records via direct API access.
Safest remediation: Add `requirePermission(...)` checks to the affected routes for both read and write actions, aligned to existing permission keys (customers.*, vehicles.*, appointments.*, quotes.*, invoices.*, payments.*, services.*, settings.*).
Remediation risk: Medium. Some current staff roles may rely on broader access. Roll out behind a feature flag and test with each role.

2. [Medium] Auth tokens accepted via URL query + localStorage storage
Files: backend/src/routes/auth.ts (Google OAuth callback redirects with token in query), web/root.tsx (OAuthTokenFromQuery persists token), web/lib/auth.ts (localStorage auth)
Risk: Tokens in URLs can leak through browser history, logs, or third-party tools, and allow session fixation (login CSRF) if a user clicks a crafted link containing another user’s token.
Likely exploit/failure mode: Attacker sends a URL with their token; user clicks and is silently logged into the attacker’s account. Tokens in query params may appear in logs/analytics or be shared via referrers.
Safest remediation: Replace token-in-URL with short-lived one-time code exchange or backend-set httpOnly session cookie; remove `?token=` flow. If keeping tokens, at least set strict referrer policy at frontend and use a one-time code.
Remediation risk: Medium-high. Requires coordinated frontend/backend change and careful rollout.

3. [Medium] Rate limiting is in-memory and relies on untrusted `x-forwarded-for`
Files: backend/src/middleware/security.ts, backend/src/routes/auth.ts, backend/src/routes/businesses.ts
Risk: Limits are per-process and bypassable in horizontally scaled environments; IP spoofing is possible if `x-forwarded-for` is not trusted. Credential stuffing and public lead spam are easier.
Likely exploit/failure mode: Attackers can rotate IP headers or hit multiple instances to bypass limits; high-volume abuse of auth or public lead endpoints.
Safest remediation: Use a shared store (Redis) for rate limits, and rely on trusted proxy settings (`app.set("trust proxy", ...)`) instead of raw header parsing. Add limits for other sensitive endpoints (password reset, portal session creation).
Remediation risk: Low-medium. Requires infra and config changes but minimal behavior change.

4. [Medium] Outbound webhook secret stored in plaintext and exposed in business payloads
Files: backend/src/db/schema.ts (integration_webhook_secret), backend/src/routes/businesses.ts (serializeBusiness), backend/src/lib/integrations.ts
Risk: Webhook signing secret is stored in clear text and returned to API consumers with settings read access. It can be used to forge webhooks or leak through logs/screens.
Likely exploit/failure mode: Any user with settings read access can retrieve the secret and spoof signed webhook payloads externally.
Safest remediation: Store webhook secrets encrypted (integration vault), never return raw secrets after creation (mask and rotate), and restrict access to owner/admin only.
Remediation risk: Medium. Requires data migration and UI changes (rotation flow).

5. [Medium] Stripe webhook payloads stored unredacted
Files: backend/src/routes/billing.ts (getStripeWebhookPayload), backend/src/db/schema.ts (stripe_webhook_events.payload)
Risk: Full Stripe event objects can contain customer details and payment metadata. Persisting entire payloads increases PII exposure and retention burden.
Likely exploit/failure mode: Database access or log export reveals customer emails, addresses, or payment metadata.
Safest remediation: Store only minimal fields needed for idempotency and debugging, or encrypt payloads and enforce retention TTL (e.g., 30–90 days).
Remediation risk: Low. Mostly a data storage change; handle existing rows with a cleanup job.

6. [Medium] Password reset URL construction can fall back to request host/origin
Files: backend/src/routes/auth.ts (resolveFrontendBaseUrl)
Risk: If FRONTEND_URL is not set, host header injection could cause password reset links to point to attacker-controlled domains.
Likely exploit/failure mode: Misconfigured environment leads to phishing reset links.
Safest remediation: Require FRONTEND_URL in all environments and remove host/origin fallback or enforce strict allowlist.
Remediation risk: Low. Configuration-only change.

7. [Medium] Public document tokens are long-lived and non-revocable
Files: backend/src/lib/jwt.ts (public document token TTL 30d), backend/src/lib/publicDocumentAccess.ts, backend/src/routes/appointments.ts, backend/src/routes/invoices.ts, backend/src/routes/quotes.ts, backend/src/routes/portal.ts
Risk: Anyone with a leaked link has full access to public documents and portal data for up to 30 days; no revocation mechanism.
Likely exploit/failure mode: Forwarded link exposes client data and invoice/quote details.
Safest remediation: Reduce TTL, add per-document revocation (token version, or store token hashes), and/or allow explicit link expiration from the UI.
Remediation risk: Medium. Requires schema changes and link regeneration strategy.

8. [Medium] Notification and activity logs are exposed to all authenticated users in a business
Files: backend/src/routes/notification-logs.ts, backend/src/routes/activity-logs.ts
Risk: Logs can contain customer emails, phone numbers, and operational metadata and are accessible without permission checks.
Likely exploit/failure mode: Team members without billing/communications permissions can access sensitive logs.
Safest remediation: Add `requirePermission("settings.read")` or a dedicated permission for logs; restrict fields returned.
Remediation risk: Low-medium. Potential role changes needed.

9. [Low] No global rate limiting for high-impact routes
Files: backend/src/app.ts, backend/src/routes/invoices.ts, backend/src/routes/appointments.ts, backend/src/routes/billing.ts
Risk: High-volume API calls (invoice send, portal session creation, public change requests) can be abused or cause noisy operational load.
Likely exploit/failure mode: Abuse or denial-of-service behavior at the application layer.
Safest remediation: Add route-specific limits, especially for send-email and portal session endpoints.
Remediation risk: Low.

10. [Medium] Access tokens remain valid after password change/reset
Files: backend/src/lib/jwt.ts, backend/src/routes/users.ts, backend/src/routes/auth.ts
Risk: Compromised tokens remain valid until expiry (7 days), even after password changes.
Likely exploit/failure mode: Stolen token can be reused until expiry despite user action.
Safest remediation: Add token versioning (e.g., user tokenVersion in DB) and invalidate on password change/reset; or shorten access token TTL with refresh.
Remediation risk: Medium. Requires auth middleware changes and migration.

Notes
- No file upload endpoints were found in the repo at time of audit.
- No hardcoded secrets were found in the repository (search for common key patterns).

