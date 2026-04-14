# Strata Hardening Plan
Date: 2026-04-13

Goals
- Protect tenant data and payment/customer flows.
- Reduce account takeover and token leakage risk.
- Ensure least-privilege access across team roles.
- Maintain reliability and avoid breaking production workflows.

Recommended Implementation Order
1. Enforce role/permission checks on core CRUD routes and logs.
2. Harden auth token handling (remove token-in-URL, add token revocation).
3. Replace in-memory rate limiting with a shared, trusted system.
4. Encrypt or rotate outbound webhook secrets and restrict access.
5. Reduce public document token exposure window and add revocation.
6. Redact or minimize Stripe webhook payload storage and add retention.

Fixes Safe to Do Now
- Require FRONTEND_URL and remove host/origin fallback for reset links.
- Add `requirePermission` checks to notification/activity log endpoints.
- Add defensive businessId filters in update/delete queries even after pre-checks.
- Add route-specific rate limits for email sending and portal session creation.

Fixes Requiring Migration/Backfill
- Token revocation: add `tokenVersion` to users and invalidate on password change/reset.
- Encrypt or migrate `integrationWebhookSecret` to the integration vault.
- Public document access: store token hash/version to enable explicit revocation.
- Stripe webhook payload storage: create a minimal payload schema and migrate existing rows or purge.

Fixes Requiring Feature Flags or Careful Rollout
- Permission enforcement on core business routes.
- Switch from localStorage auth to httpOnly cookie sessions or token exchange flow.
- Public link TTL reduction (customer experience impact).

Regression Risks to Watch
- Staff roles suddenly losing access to daily workflows due to permissions.
- OAuth sign-in breaking if token exchange flow is changed without frontend support.
- Billing portal access blocked if permissions are too strict.
- Public-facing links expiring prematurely and confusing customers.
- Integration webhook delivery failing due to secret rotation without coordination.

Suggested Verification Checklist
- Role-based access tests for each membership role (owner/admin/manager/service_advisor/technician).
- OAuth and email/password login flows.
- Password reset end-to-end with correct domain.
- Stripe webhook processing and portal access.
- Public quote/invoice/appointment links still render and pay correctly.
- Rate limit behavior under normal and abusive traffic.

