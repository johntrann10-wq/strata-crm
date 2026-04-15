# Launch Monitoring Checklist

Date: 2026-04-14

Focus window: first 72 hours after soft launch.

## High-signal log events to watch

### Public customer/document routes
- Watch for `Launch monitor: public document client error`
- Expected routes include:
  - `/api/portal/:token`
  - `/api/quotes/:id/public-html`
  - `/api/quotes/:id/public-respond`
  - `/api/quotes/:id/public-request-revision`
  - `/api/invoices/:id/public-html`
  - `/api/invoices/:id/public-pay`
  - `/api/appointments/:id/public-html`
  - `/api/appointments/:id/public-pay`
  - `/api/appointments/:id/public-request-change`
- Alert if `400/401/403/404` rises suddenly or clusters on one document type.

### Protected CRUD denials
- Watch for `Launch monitor: protected CRUD denied`
- High-priority route families:
  - `/api/clients`
  - `/api/vehicles`
  - `/api/appointments`
  - `/api/quotes`
  - `/api/invoices`
  - `/api/payments`
- Alert if `401/403` rates rise after deploy, especially for owners/admins.

### Rate limiting
- Watch for `Rate limit exceeded`
- Prioritize:
  - sign-in
  - sign-up
  - forgot password
  - reset password
  - billing portal session creation
  - billing checkout session creation
  - public lead capture
  - public payment/deposit session creation
- Investigate immediately if `429` affects legitimate production users rather than obvious abuse.

### Password reset lifecycle
- Watch for:
  - `Password reset email sent`
  - `Password reset completed`
- If send volume exists without completion volume, inspect:
  - delivery failures
  - bad `FRONTEND_URL`
  - expired-link complaints

### Billing and Stripe
- Watch for:
  - `Stripe billing portal session created`
  - `Stripe webhook signature verification failed`
  - `Stripe webhook handler error`
  - `Stripe webhook processed`
- Alert immediately if:
  - valid Stripe webhooks start failing signature verification
  - webhook failures outnumber processed events
  - portal session creation drops unexpectedly

## 0-6 hours

- Watch auth errors every 30-60 minutes.
- Check public document route errors after any customer-facing send.
- Confirm at least one Stripe webhook processed successfully.
- Confirm at least one billing portal session created successfully.

## 6-24 hours

- Review `401/403` trends on protected CRUD routes.
- Review `429` trends on auth and public routes.
- Review password reset send/completion ratio.
- Review public payment and deposit session errors.

## 24-72 hours

- Look for repeating route-specific failures rather than isolated single-user mistakes.
- Look for revoked/expired public-link complaints.
- Look for billing state drift between UI and Stripe-driven webhook updates.
- Look for elevated `404` on public routes that may indicate malformed customer links.

## Suggested alert priorities

### Immediate
- repeated auth failures for valid users
- wrong-host password reset links
- Stripe webhook signature failures for real deliveries
- public customer links returning the wrong record or failing broadly

### Same day
- growing `429` volume on legit flows
- billing portal failures
- public payment/deposit link failures
- elevated `403` on owner/admin CRUD actions

### Daily review
- send/completion conversion for password resets
- public document error mix by route family
- webhook processed vs failed counts
- portal session creation volume vs failures

## What “healthy” looks like

- small background level of invalid/expired public-link errors, not spikes
- some `401/403` from stale sessions or low-permission users, but not owners/admins being blocked from normal work
- low `429` volume concentrated on obvious abuse-prone endpoints
- password reset completions following sends
- Stripe webhook processed logs consistently present with very low failure rate
