# Access And Logging Hardening

Date: 2026-04-14

## Scope

This pass focused on reducing sensitive data exposure in logs, stored webhook records, and operator-facing diagnostics while preserving operational debugging value.

## Changes Made

### Centralized redaction

- Expanded `backend/src/lib/logger.ts` so generic strings are sanitized in addition to key-based redaction.
- Redaction now catches:
  - bearer tokens
  - JWT-like tokens
  - reset, invite, auth, session, secret, and signature query parameters in URLs
  - token-like key/value pairs embedded in freeform strings
- Top-level log messages now pass through the same string sanitizer as structured log context.
- Contact masking now handles both email and SMS recipients more safely under generic `recipient` fields.

### Activity log access and response shaping

- `GET /api/activity-logs` remains gated by `dashboard.view`.
- `POST /api/activity-logs` now uses an explicit in-handler permission assertion and async wrapping so permission failures return cleanly instead of risking unhandled promise behavior.
- Activity log metadata returned to clients is sanitized before serialization.
- Token-bearing URLs and contact fields inside activity metadata are redacted before reaching the browser.

### Notification log access and response shaping

- `GET /api/notification-logs` remains gated by `settings.read`.
- Notification log responses now return only the fields needed for operator-facing review:
  - id
  - channel
  - masked recipient
  - subject
  - sent/delivery status fields
  - sanitized provider error text
  - retry counters
- Raw `metadata`, `providerMessageId`, business identifiers, and other internal provider payload fields are no longer returned from the endpoint.

### Stripe webhook payload storage

- Stored Stripe webhook payloads remain summarized rather than raw.
- This pass tightened the summary to omit null fields and keep only operationally useful identifiers and money/status fields.
- Stored webhook error text and local billing sync errors are sanitized before persistence.

## Tests Added

- `backend/src/lib/logger.test.ts`
  - URL token redaction
  - JWT/bearer token redaction in generic strings
- `backend/src/routes/activity-logs.test.ts`
  - activity metadata sanitization
  - fallback sanitization for non-JSON metadata strings
- `backend/src/routes/notification-logs.test.ts`
  - minimized notification serialization
  - recipient masking for email and SMS
- `backend/src/integration/permissions.integration.test.ts`
  - activity log write permission enforcement

## Operational Tradeoffs

- Activity metadata is still stored in full internally because it powers collaboration and audit workflows; this pass focuses on safe exposure and logging rather than destructive backfill of historical records.
- Notification subjects are still returned because they can help operators reconcile sends, but provider internals and raw metadata are now withheld.
- Stripe webhook summaries still retain IDs, statuses, and amounts because those are operationally useful for reconciliation and support.

## Follow-Up Worth Considering

- Backfill or prune older activity/notification log rows if historic records contain overly sensitive metadata from before hardening.
- Add an admin-only support/debug view if deeper provider diagnostics are needed, instead of broadening the default notification log payload.
- Extend structured redaction into any third-party transport logs or job payload snapshots that may be added later.
