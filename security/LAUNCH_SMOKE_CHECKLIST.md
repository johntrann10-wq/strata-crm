# Launch Smoke Checklist

Date: 2026-04-14

Use this immediately after deploy. Keep it short, real, and sequential.

## 1. Config readiness

- Confirm `FRONTEND_URL` is set to the exact SPA origin only.
  Example: `https://stratacrm.app`
  Not valid: `https://stratacrm.app/app` or any value with query/hash.
- Confirm `JWT_SECRET` is present, non-placeholder, and long random production entropy.
- If Stripe billing is enabled, confirm all three are set together:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_ID`
- If encrypted integration secrets or outbound webhook signing are enabled, confirm:
  - `INTEGRATION_VAULT_SECRET`
  - `INTEGRATION_VAULT_KEY_ID`
  - optional rotation values only if actively rotating
- If Google sign-in is enabled, confirm:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `API_BASE`
- If password reset or transactional email is expected to work, confirm either:
  - `RESEND_API_KEY` + `RESEND_FROM`
  - or full SMTP config

## 2. Startup validation

- Verify backend boot succeeds without env validation errors.
- Verify startup logs show the intended service state:
  - Stripe enabled or intentionally disabled
  - Resend/SMTP enabled or intentionally disabled
  - integration vault enabled if encrypted integrations are in use
- If the backend boots with “partially configured” warnings for Stripe, email, or vault, stop and fix config before proceeding.

## 3. Auth smoke

- Sign up for a fresh workspace.
- Sign in with email.
- If Google sign-in is enabled in production, complete one Google sign-in flow on desktop and mobile.
- Trigger forgot password.
- Open the reset email and confirm the reset link lands on the correct frontend origin.
- Complete password reset and sign in with the new password.

## 4. Core workflow smoke

- Create one client.
- Create one vehicle.
- Create one appointment.
- Create one quote.
- Create one invoice.
- Open client, vehicle, and appointment detail pages after reload.
- Archive one test client or vehicle only if the workspace is disposable.

## 5. Public/customer-facing smoke

- Open one real customer portal link.
- Open one real public estimate link.
- Open one real public invoice link.
- Open one real public appointment link if appointment public pages are active.
- Confirm public pages do not show admin navigation or internal UI.
- Confirm an intentionally invalid or revoked public link fails cleanly.

## 6. Billing smoke

- Open billing settings.
- Create one billing portal session.
- Return from portal and confirm billing state refreshes.
- If Stripe checkout/payment links are enabled, open one invoice payment link and one appointment deposit payment link.

## 7. Webhook smoke

- Confirm at least one Stripe webhook delivery succeeds after deploy.
- Confirm invalid webhook signatures return `400`.
- Confirm valid webhook deliveries do not accumulate failed processing records.

## 8. Stop-the-line criteria

Pause launch work if any of these happen:
- password reset links use the wrong host
- sign-in or sign-up loops
- public links expose internal UI or wrong records
- billing portal session creation fails
- webhook signature verification fails unexpectedly for valid Stripe events
- repeated `401`, `403`, `404`, or `429` spikes on launch-critical routes
