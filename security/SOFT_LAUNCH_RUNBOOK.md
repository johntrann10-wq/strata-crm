# Soft Launch Runbook

Date: 2026-04-14

Source docs:
- `C:\Users\jake\gadget\strata\security\LAUNCH_SMOKE_CHECKLIST.md`
- `C:\Users\jake\gadget\strata\security\LAUNCH_MONITORING_CHECKLIST.md`
- `C:\Users\jake\gadget\strata\security\POST_HARDENING_QA.md`

## Goal

Launch Strata softly with:
- fast detection of auth, billing, and public-link failures
- one clear validation sequence
- obvious rollback triggers
- minimal confusion during the first 24 hours

## Exact Launch Sequence

1. Confirm the deploy candidate is the intended build.
2. Confirm required production env is present and correct.
3. Deploy backend and frontend.
4. Wait for backend boot confirmation and env validation success.
5. Run the post-deploy smoke sequence in order.
6. If smoke passes, open soft launch access.
7. Monitor closely for the first hour.
8. Continue structured checks through the first 24 hours.

## Pre-Launch Checks

### Config
- Confirm `FRONTEND_URL` is the exact app origin only.
- Confirm `JWT_SECRET` is present and non-placeholder.
- Confirm `DATABASE_URL` is correct for production.
- Confirm `PORT` and proxy settings are normal for the host.
- Confirm Stripe envs if billing is live:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_ID`
- Confirm vault envs if encrypted secrets/integrations are in use:
  - `INTEGRATION_VAULT_SECRET`
  - `INTEGRATION_VAULT_KEY_ID`
- Confirm email/reset env is complete if password reset is expected to work:
  - `RESEND_API_KEY` + `RESEND_FROM`
  - or complete SMTP env
- Confirm Google auth env if Google sign-in is exposed:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `API_BASE`

### Expected startup signals
- Backend boots without env validation errors.
- No partial-config warning is present for services you intend to use live.
- If Stripe is meant to be live, startup must not say `Stripe disabled`.
- If password reset is meant to be live, startup must not leave email delivery effectively disabled.

### Final QA confidence check
- Browser coverage passed for:
  - signup/login/reset-adjacent flows
  - public customer links
  - delete/archive regression
- Backend security regression passed for:
  - permissions
  - public token validation
  - env validation
  - launch-oriented logging checks

## Post-Deploy Smoke Sequence

Run in this order.

### 1. Health and boot
- Confirm backend is responding.
- Confirm no boot-time env validation errors.
- Confirm startup logs show the intended service state.

### 2. Signup and login
- Create a fresh account/workspace.
- Sign in with email.
- If enabled, complete one Google sign-in.
- Reload after login and confirm the session holds.

### 3. Password reset
- Trigger forgot password.
- Confirm the email arrives.
- Confirm the reset link lands on the correct frontend origin.
- Complete reset and log in with the new password.

### 4. Core workflow
- Create one client.
- Create one vehicle.
- Create one appointment.
- Create one quote.
- Create one invoice.
- Reload the detail pages and confirm data persists.

### 5. Public customer-facing flows
- Open one real portal link.
- Open one real estimate link.
- Open one real invoice link.
- Open one real invoice payment link.
- Open one real appointment public page if active.
- Confirm no admin/internal UI leaks into customer pages.
- Confirm one invalid or revoked link fails cleanly.

### 6. Billing
- Open billing settings.
- Create one billing portal session.
- Return from portal and confirm state refreshes.
- If active, open one appointment deposit link and one invoice payment link.

### 7. Webhooks
- Confirm at least one valid Stripe webhook processes successfully.
- Confirm no immediate spike in webhook failures.

## First-Hour Monitoring Steps

Check every 15-20 minutes.

### Auth and access
- Watch for `401/403` spikes on protected CRUD routes.
- Watch for owner/admin reports of being blocked unexpectedly.

### Public links
- Watch for `Launch monitor: public document client error`.
- Pay attention to:
  - `/api/portal/:token`
  - `/api/invoices/:id/public-html`
  - `/api/invoices/:id/public-pay`
  - `/api/quotes/:id/public-html`
  - `/api/appointments/:id/public-html`
  - `/api/appointments/:id/public-pay`

### Password reset
- Look for `Password reset email sent`.
- Look for matching `Password reset completed`.
- If sends happen without completions, investigate immediately.

### Billing and Stripe
- Watch for `Stripe billing portal session created`.
- Watch for `Stripe webhook processed`.
- Treat `Stripe webhook signature verification failed` as urgent if valid events are failing.

### Abuse and throttling
- Watch for `Rate limit exceeded`.
- Make sure `429` is concentrated on abuse-prone routes, not normal users.

## First-24-Hours Monitoring Steps

### Every few hours
- Review `401/403/404/429` trends by route family.
- Review public-link complaints or support replies.
- Review password reset send/completion ratio.
- Review billing portal and public payment flows.
- Review Stripe webhook processed vs failed counts.

### End-of-day review
- Were any valid users blocked by permission/auth mistakes?
- Were any public links malformed, revoked unexpectedly, or tied to the wrong record?
- Did billing portal creation or Stripe webhook handling fail at any meaningful rate?
- Did any rate limiter thresholds affect legitimate use?

## Rollback Triggers

Rollback or pause launch if any of these happen:
- signup or login breaks for valid users
- password reset links point to the wrong host or are broadly unusable
- public invoice/payment/portal links fail broadly
- valid Stripe webhooks are failing signature verification
- billing portal session creation fails consistently
- `401/403` spikes hit owners/admins on normal workflows
- `404` spikes hit public document routes broadly after customer sends
- `429` spikes affect ordinary auth or billing behavior for real users

## Triage: What To Check First

### If signup fails
- Check request/error logs on auth routes first.
- Check env/config next:
  - `FRONTEND_URL`
  - email config if invite/reset style flows are involved
  - Google OAuth env if Google signup is involved
- Check for `400/401/403/429` around auth endpoints.

### If login fails
- Check auth route logs and session/token logs first.
- Check cookie/session behavior in browser.
- Check for `401` spikes on `/api/auth/me` or protected routes.
- If Google login is failing, check OAuth env and redirect origin config first.

### If billing fails
- Check billing route logs first.
- Check `Stripe billing portal session created` presence or absence.
- Check Stripe env correctness:
  - secret key
  - webhook secret
  - price id
- Check webhook logs next.

### If public links fail
- Check `Launch monitor: public document client error` first.
- Check whether failures are:
  - expired/revoked link expected behavior
  - malformed token
  - wrong record id
  - Stripe payment handoff issue
- Check the specific route family next.

### If password reset fails
- Check `Password reset email sent` first.
- Then check whether `Password reset completed` follows.
- Then check:
  - `FRONTEND_URL`
  - email delivery config
  - support complaints about wrong-host links or expired links

## What Was Preserved
- No product UX changes.
- No billing, auth, or public-link logic changes in this runbook pass.
- Existing hardened validations and monitoring signals remain the source of truth.

## Remaining Operational Debt
- Live production smoke with real generated public links is still the highest-value final check.
- Broader skipped backend integration suites are still QA debt, even though launch-critical coverage is now much stronger.
