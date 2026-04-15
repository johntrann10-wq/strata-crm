# Soft Launch Incident Playbook

Date: 2026-04-14

Use this when something feels wrong during soft launch. Keep the response simple:
- identify the failure pattern
- contain it
- recover the affected flow
- only then widen scope

## Incident: Signup or login failures

### Likely causes
- bad auth env/config
- wrong `FRONTEND_URL`
- Google OAuth config mismatch
- stale session/cookie behavior
- auth route rate limiting hitting legitimate users

### Where to look first
- auth route request/error logs
- `401/403/429` patterns on auth and protected routes
- startup config logs
- browser network panel for `/api/auth/*` and `/api/auth/me`

### Immediate containment
- pause outbound launch invites if failures are broad
- switch to email/password only if Google auth is the only failing path
- tell testers not to keep retrying blindly if `429` is involved

### Recovery steps
1. Verify `FRONTEND_URL`, JWT secret, and Google OAuth env if applicable.
2. Confirm backend booted cleanly.
3. Reproduce with one controlled test account.
4. Check whether the failure is auth creation, auth persistence, or redirect handling.
5. If the issue is broad and not immediately reversible, pause soft launch or roll back.

## Incident: Password reset failures

### Likely causes
- email provider config incomplete
- wrong `FRONTEND_URL`
- reset links landing on the wrong host
- reset token complaints caused by stale links or repeated requests
- rate limiting on forgot/reset endpoints

### Where to look first
- `Password reset email sent`
- `Password reset completed`
- auth route logs for forgot/reset
- email delivery logs/provider dashboard

### Immediate containment
- stop telling users to use reset until the host/link issue is confirmed fixed
- offer direct admin support for affected accounts if the issue is isolated

### Recovery steps
1. Trigger one reset for a controlled account.
2. Verify email delivery.
3. Verify the reset URL host exactly matches the production frontend.
4. Complete the reset end to end.
5. If sends happen but completions do not, treat it as a launch-priority issue.

## Incident: Public invoice or payment link failures

### Likely causes
- malformed or revoked token
- wrong record/token pairing
- expired link behavior being triggered unexpectedly
- Stripe payment session creation failure
- customer opening an old link after state changed

### Where to look first
- `Launch monitor: public document client error`
- route-specific public errors on:
  - `/api/portal/:token`
  - `/api/invoices/:id/public-html`
  - `/api/invoices/:id/public-pay`
  - `/api/appointments/:id/public-html`
  - `/api/appointments/:id/public-pay`

### Immediate containment
- stop sending new customer links until the failure pattern is understood if it is broad
- use direct manual resend/regeneration for one affected customer first

### Recovery steps
1. Identify whether the failure is invalid token, revoked token, expired token, or payment handoff.
2. Reproduce using a fresh newly generated link.
3. Compare behavior between fresh link and reported broken link.
4. If only old links are affected, communicate that clearly and resend.
5. If fresh links are broken too, pause customer sends and escalate immediately.

## Incident: Stripe webhook failures

### Likely causes
- wrong `STRIPE_WEBHOOK_SECRET`
- endpoint mismatch
- bad raw body handling upstream
- processing exception after successful signature verification

### Where to look first
- `Stripe webhook signature verification failed`
- `Stripe webhook handler error`
- `Stripe webhook processed`
- Stripe dashboard webhook delivery history

### Immediate containment
- do not trust local billing state changes until webhook processing is healthy
- pause billing-sensitive operational actions if failures are broad

### Recovery steps
1. Confirm webhook secret matches the Stripe endpoint.
2. Confirm valid deliveries are reaching the correct deployed endpoint.
3. Separate signature failures from processing failures.
4. If signature verification is failing for valid deliveries, treat as urgent config or ingress issue.
5. If processing is failing after verification, inspect the specific event type and error path.

## Incident: Billing portal session failures

### Likely causes
- Stripe secret/config issue
- missing Stripe customer for a workspace
- broken billing return URL assumptions
- billing env partially configured

### Where to look first
- billing route logs
- `Stripe billing portal session created`
- Stripe customer state for the affected business

### Immediate containment
- avoid telling users to self-recover in billing if the portal is broadly failing
- handle affected businesses manually until root cause is clear

### Recovery steps
1. Test portal creation from billing settings on a controlled workspace.
2. Confirm the workspace has a valid Stripe customer.
3. Confirm Stripe is enabled in startup logs.
4. Confirm return URL behavior is normal.
5. If failures are broad, pause billing recovery instructions and escalate.

## Incident: Unexpected 401/403/404 spikes

### Likely causes
- auth/session regression
- permission scoping issue
- stale client-side state
- bad public link generation
- route mismatch after deploy

### Where to look first
- `Launch monitor: protected CRUD denied`
- `Launch monitor: public document client error`
- request logs by path and status

### Immediate containment
- identify whether the spike is internal-user routes or public customer routes
- pause the affected workflow if the spike is broad and reproducible

### Recovery steps
1. Group by route family.
2. Check whether failures are owner/admin, low-permission staff, or customers.
3. Reproduce one failing path with a controlled account or link.
4. If protected CRUD is failing for valid admins, consider rollback.
5. If public routes are failing broadly, stop customer sends and regenerate only after fix.

## Incident: 429 spikes

### Likely causes
- real abuse or scraping
- rate-limit thresholds too aggressive
- testers retrying the same broken flow repeatedly
- IP/proxy behavior making normal traffic look concentrated

### Where to look first
- `Rate limit exceeded`
- affected limiter id
- affected route family
- whether affected traffic is legit or obviously abusive

### Immediate containment
- tell internal testers to stop repeated retries on the failing path
- if real customers are getting blocked, reduce launch traffic until the pattern is clear

### Recovery steps
1. Identify the exact limited route.
2. Determine whether affected users are real customers or obvious abuse.
3. Confirm proxy/IP handling looks normal.
4. If thresholds are clearly too tight for valid use, adjust carefully.
5. If abuse is real, keep limits in place and communicate internally.

## Incident: Env/config mistake

### Likely causes
- wrong `FRONTEND_URL`
- missing Stripe env while billing is assumed live
- missing vault env while encrypted features are assumed live
- partial email config
- wrong webhook secret

### Where to look first
- startup validation errors
- startup warnings
- affected route family logs

### Immediate containment
- stop launch expansion until config is corrected
- do not patch around config mistakes in-app during launch unless absolutely necessary

### Recovery steps
1. Compare actual deployed env against the launch checklist.
2. Fix the misconfigured variable at the platform level.
3. redeploy or restart if required.
4. rerun the smallest possible smoke sequence for the affected flow.
5. only resume normal launch once the flow is confirmed healthy.

## Fast Prioritization Guide

### Stop and escalate immediately
- signup/login broadly failing
- password reset links using the wrong host
- valid Stripe webhooks failing signature verification
- public invoice/payment links broadly unusable

### Fix same hour
- billing portal failures
- owner/admin `401/403` spikes
- legitimate-user `429` spikes

### Monitor but do not overreact
- small number of expired/revoked public link errors
- isolated stale-session `401`
- isolated low-permission `403`

## What Was Preserved
- No app behavior was changed in this playbook pass.
- The operational response is built on the existing hardened routes, validations, and logs.

## Remaining Risk
- The biggest residual risk is still real-world deploy variance: actual platform env mistakes, actual Stripe endpoint mistakes, or customer behavior around old links. This playbook is designed to make those visible fast, not to eliminate them entirely.
