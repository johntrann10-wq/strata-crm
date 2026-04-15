# Post-Hardening QA

Date: 2026-04-14

## What Was Tested

### Baseline verification
- `npm run lint` passed.
- `npm run test` passed after the added auth recovery regression coverage.
- `npm --prefix backend run build` had already passed earlier in the hardening cycle and no production code changed during this QA pass.

### Browser and workflow regression
- `npx playwright test e2e/signup-trial-billing.spec.ts e2e/mobile-core.spec.ts e2e/client-vehicle-regression.spec.ts e2e/billing-regression.spec.ts e2e/integration-settings.spec.ts e2e/critical-path.spec.ts --reporter=line --workers=1`
- Result: `18 passed`, `1 skipped`.

Covered by that browser pass:
- signup
- login
- team invite / access-state UI coverage
- create appointment
- edit appointment coverage already exercised in the mocked calendar/client flows
- client CRUD coverage through the critical path and client detail regression
- vehicle CRUD coverage through the critical path and client/vehicle regression
- quote creation
- invoice creation
- deposit and payment workflow surfaces
- billing portal session recovery flows
- notification and activity visibility in settings
- mobile auth and billing surfaces

### Focused backend security regression
- `npm --prefix backend run test -- src/integration/auth-password-reset.integration.test.ts src/routes/auth.test.ts src/integration/permissions.integration.test.ts src/integration/rate-limits.integration.test.ts src/integration/api.integration.test.ts src/lib/publicDocumentAccess.test.ts src/lib/integrationVault.test.ts src/lib/businessWebhookSecret.test.ts src/routes/activity-logs.test.ts src/routes/notification-logs.test.ts`
- Result: `10 passed`, `56 passed` tests inside those files.

Covered by that focused backend pass:
- forgot password
- reset password
- trusted frontend-origin reset-link generation
- auth token revocation via token-version bump
- server-side permission enforcement
- notification/activity visibility gating
- Stripe webhook signature rejection
- public tokenized document access rules
- encrypted field read/write behavior
- rate-limit behavior on protected routes

### Existing backend suite coverage used in this pass
The full backend suite also passed and still covers:
- webhook fixture parsing in `backend/src/lib/stripeBillingWebhooks.test.ts`
- reliability guardrails in `backend/src/integration/reliability.integration.test.ts`
- billing access and prompt logic in `backend/src/lib/billingAccess.test.ts` and `backend/src/lib/billingPrompts.test.ts`

## Failures Found

### Test drift
The failures found during this QA pass were test-harness drift, not confirmed app regressions:
- signup CTA assertions were still expecting older landing-page copy
- the integration settings Playwright test was asserting stale mocked copy and action labels
- forgot/reset password did not have enough direct regression coverage for the hardened behavior

### Environment noise
- Playwright dev-server startup still logs repeated Vite proxy errors for `/api/health` and occasional `/api/auth/me` before the mocked routes settle.
- Test runs still emit the expected warning that Resend is partially configured in the test environment.

## Fixes Made

### Updated Playwright specs to match current product truth
- `C:\Users\jake\gadget\strata\e2e\signup-trial-billing.spec.ts`
- `C:\Users\jake\gadget\strata\e2e\critical-path.spec.ts`
- `C:\Users\jake\gadget\strata\e2e\dashboard-home.spec.ts`
- `C:\Users\jake\gadget\strata\e2e\integration-settings.spec.ts`

Changes:
- aligned signup CTA expectations with the current `Start free trial` copy
- removed brittle integration-settings assertions tied to outdated mock copy
- kept the settings spec focused on current billing, visibility, and recovery behavior

### Added missing auth recovery regression coverage
- `C:\Users\jake\gadget\strata\backend\src\integration\auth-password-reset.integration.test.ts`

New assertions added:
- forgot-password returns the generic non-enumerating success response for unknown emails
- forgot-password uses the configured frontend origin rather than the request host
- reset-password rotates the password hash and token version
- reset-password clears the auth cookie
- invalid reset tokens fail cleanly

## Remaining Risks

### Still skipped in the backend suite
These test files remain intentionally skipped in the repo and therefore are still open QA debt:
- `backend/src/integration/appointment-finance.integration.test.ts`
- `backend/src/integration/critical-path.integration.test.ts`
- `backend/src/integration/home-dashboard.integration.test.ts`
- `backend/src/integration/concurrency.integration.test.ts`

### Customer-facing document browser coverage is still lighter than backend coverage
- public token and access logic is well covered in `backend/src/lib/publicDocumentAccess.test.ts`
- invoice/quote/payment workflow surfaces are covered in `e2e/billing-regression.spec.ts`
- there is still no dedicated end-to-end browser spec for a live customer opening a public quote/invoice/payment link from the outside

### Delete-flow automation is still thinner than create/edit coverage
- appointment, client, and vehicle creation/edit behavior is exercised in this pass
- dedicated automated delete regression coverage for appointment/client/vehicle flows is still missing
- that means delete-path confidence currently relies more on route logic, permissions, and existing app behavior than on direct regression automation

### Browser regression is mock-heavy by design
- the Playwright suite proves front-end workflow behavior and API contract expectations
- it does not fully replace live end-to-end verification against a deployed backend for email delivery, Stripe redirects, or public customer document access

## Rollout Checklist

- Confirm `FRONTEND_URL` is set correctly in every environment so reset links cannot fall back to an untrusted host.
- Confirm `JWT_SECRET`, Stripe secrets, and vault secrets are present and valid.
- Confirm billing portal and checkout environment variables are present in production.
- Confirm webhook signing secret is present and the Stripe billing webhook endpoint is still reachable.
- Run one real smoke flow in staging or production:
  - sign up
  - sign in
  - create client
  - create vehicle
  - create appointment
  - create invoice
  - open billing settings
  - send a password reset email
- Verify at least one real password reset email lands with the correct frontend URL.
- Verify at least one real Stripe webhook delivery succeeds after deploy.

## Recommended Monitoring After Deploy

- Monitor `401` and `403` rates on:
  - `/api/clients`
  - `/api/appointments`
  - `/api/activity-logs`
  - `/api/notification-logs`
  - `/api/billing/portal`
  - `/api/billing/create-checkout-session`
- Monitor `429` rates for:
  - sign-in
  - forgot-password
  - reset-password
  - public lead capture
  - billing portal session creation
  - billing checkout session creation
- Monitor password reset completion events versus reset-email sends.
- Monitor Stripe webhook signature failures separately from ordinary webhook processing failures.
- Monitor customer-facing payment and document error rates for unexpected `400`, `401`, and `404` responses.

## Overall QA Assessment

Critical tested flows are not currently broken in this pass.

The main issues uncovered were stale tests and one missing regression area around forgot/reset password. Those are now corrected and covered. The biggest remaining gap is broader non-mocked end-to-end coverage for public customer document flows and the still-skipped backend integration suites.

---

## Targeted Gap-Closure Pass

Date: 2026-04-14

### Goal
- close the two clearest remaining QA gaps from this document:
  - public customer-link browser coverage
  - destructive delete/archive regression coverage for core records

### What was added

#### New browser coverage
- `C:\Users\jake\gadget\strata\e2e\public-customer-links.spec.ts`
- `C:\Users\jake\gadget\strata\e2e\delete-flow-regression.spec.ts`

#### Supporting test coverage
- `C:\Users\jake\gadget\strata\backend\src\integration\permissions.integration.test.ts`

### What was tested in this pass

#### Public customer-link browser coverage
- valid customer hub render for tokenized portal access
- valid public estimate link render
- valid public invoice link render
- valid public appointment link render
- public revision-request submission flow
- public invoice payment handoff flow
- public appointment deposit handoff flow
- expired portal token state
- revoked portal token state
- invalid portal token state
- neighboring-record/token-manipulation failure state
- absence of internal/admin UI in the customer-facing experience

#### Delete/archive browser coverage
- client archive happy path
- client archive permission-hidden path
- vehicle archive happy path
- vehicle archive permission-hidden path
- appointment delete happy path
- appointment delete blocked when linked invoices exist
- appointment delete permission-hidden path

### Real bugs found and fixed

#### Vehicle archive backend route was missing
- Issue:
  Vehicle archive UI existed, but there was no matching backend delete/archive route.
- Root cause:
  The vehicle detail screen had a destructive action wired up before a route existed to handle it safely.
- Fix:
  Added a permission-gated soft-delete archive route in `backend/src/routes/vehicles.ts`.
- Verification:
  New browser archive coverage passes and the permission integration suite now covers the route.
- Residual risk:
  This is now archive-only behavior by design; there is still no dedicated restore-flow coverage for vehicles.

#### Some destructive controls still rendered without write permission
- Issue:
  Client archive and appointment delete controls could still appear in the UI even when the backend would deny the action.
- Root cause:
  The backend was already protected, but the front-end controls were not consistently permission-gated.
- Fix:
  Added UI permission checks in:
  - `C:\Users\jake\gadget\strata\web\routes\_app.clients.$id.tsx`
  - `C:\Users\jake\gadget\strata\web\routes\_app.appointments.$id.tsx`
  - `C:\Users\jake\gadget\strata\web\routes\_app.clients.$id.vehicles.$vehicleId.tsx`
- Verification:
  New browser tests prove the controls disappear for read-only users.
- Residual risk:
  Quote destructive UI still has lighter browser coverage than client/vehicle/appointment.

### Harness issues found and corrected
- The billing Playwright helper was missing `appointments.write` in its default permission set, which falsely hid the delete button during test setup.
- Public customer-link assertions initially assumed semantic headings where the portal page uses card-title text.
- These were test-harness/assertion corrections, not production regressions.

### Verification results
- `npm run lint` passed.
- `npm --prefix backend run test -- src/lib/publicDocumentAccess.test.ts src/integration/permissions.integration.test.ts` passed.
- `npx playwright test e2e/public-customer-links.spec.ts e2e/delete-flow-regression.spec.ts --reporter=line --workers=1` passed with `9 passed`.

### Files changed in this pass
- `C:\Users\jake\gadget\strata\backend\src\routes\vehicles.ts`
- `C:\Users\jake\gadget\strata\backend\src\integration\permissions.integration.test.ts`
- `C:\Users\jake\gadget\strata\web\routes\_app.clients.$id.tsx`
- `C:\Users\jake\gadget\strata\web\routes\_app.appointments.$id.tsx`
- `C:\Users\jake\gadget\strata\web\routes\_app.clients.$id.vehicles.$vehicleId.tsx`
- `C:\Users\jake\gadget\strata\e2e\helpers\clientVehicleFlow.ts`
- `C:\Users\jake\gadget\strata\e2e\helpers\billingFlow.ts`
- `C:\Users\jake\gadget\strata\e2e\public-customer-links.spec.ts`
- `C:\Users\jake\gadget\strata\e2e\delete-flow-regression.spec.ts`

### Remaining QA gaps after this pass
- Public customer-link coverage is now present, but it is still mocked browser coverage rather than a live deployed external-customer smoke against real generated links.
- Quote delete and other quote-specific destructive UI still have lighter regression coverage than invoice void, which remains covered in the broader billing regression spec.
- The broader skipped backend integration suites listed earlier in this document are still open QA debt.

### Updated rollout recommendations
- Add one live post-deploy smoke using a real generated public portal link and one real public invoice/pay link from a staging-like workspace.
- Add one follow-up browser regression for quote-specific destructive behavior if quote archive/delete becomes operationally important.
- Continue monitoring `400`, `401`, `403`, and `404` rates on public document routes after deploy to catch token mismatch or revocation regressions quickly.
