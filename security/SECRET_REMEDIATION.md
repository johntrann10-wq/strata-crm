# Secret Remediation
Date: 2026-04-14

## Summary
- Current tracked-file scan found no confirmed live secrets in committed source or config.
- Placeholder, dummy, and example values remain in committed example/test files where appropriate.
- The highest structural leak risk was client env exposure: Vite previously exposed all `STRATA_*` env vars to the browser bundle. This has been narrowed so only `VITE_*` and `NEXT_PUBLIC_*` are client-exposed.

## Masked Findings Summary
- No active tracked secrets were confirmed by the final repository scan.
- Historical repo search showed commits that introduced or edited secret-related env variable names, but not confirmed live secret material in the current searchable history:
  - commit `401…753` touched auth/env-related configuration
  - commit `aff…2f` touched Stripe/env deployment wiring
  - commit `a11…124` touched Google auth env references
  - commit `d6c…b19` touched Resend env references
- Example/test placeholders still exist intentionally in:
  - [/.env.example](/C:/Users/jake/gadget/strata/.env.example)
  - [/backend/.env.example](/C:/Users/jake/gadget/strata/backend/.env.example)
  - [/backend/vitest.setup.ts](/C:/Users/jake/gadget/strata/backend/vitest.setup.ts)
  - local-run/test helper files with dummy localhost credentials

## Remediation Implemented

### 1. Client Bundle Exposure Reduced
- Removed `STRATA_` from Vite `envPrefix` so future server-only `STRATA_*` env values cannot be accidentally bundled into the SPA.
- Removed browser-side `import.meta.env.STRATA_API_ORIGIN` usage.
- Added bundle-time secret pattern checks to fail builds if secret-like values appear in built client assets.

Files:
- [/vite.config.mts](/C:/Users/jake/gadget/strata/vite.config.mts)
- [/web/api.ts](/C:/Users/jake/gadget/strata/web/api.ts)
- [/scripts/verify-client-bundle.mjs](/C:/Users/jake/gadget/strata/scripts/verify-client-bundle.mjs)

### 2. Startup Env Validation Hardened
- Production startup now rejects:
  - placeholder JWT secrets
  - malformed `FRONTEND_URL`
  - placeholder or malformed Stripe secrets when Stripe env is configured
  - placeholder Resend API keys when Resend env is configured
  - placeholder Google client secret when Google OAuth is configured
  - weak or placeholder `CRON_SECRET` / `INTEGRATION_VAULT_SECRET` when set
- Non-production still keeps safe local defaults to avoid breaking dev setup.
- Added warnings for partial SMTP / Resend config instead of silently appearing configured.

Files:
- [/backend/src/lib/env.ts](/C:/Users/jake/gadget/strata/backend/src/lib/env.ts)
- [/backend/src/lib/env.test.ts](/C:/Users/jake/gadget/strata/backend/src/lib/env.test.ts)

### 3. Example Config Cleaned Up
- Replaced realistic-looking secret placeholders with clearer non-secret placeholders.
- Removed unused `SESSION_SECRET` examples to reduce confusion.
- Added missing recommended env docs for:
  - `TRUST_PROXY`
  - `INTEGRATION_VAULT_SECRET`
  - `EMAIL_REPLY_TO`

Files:
- [/.env.example](/C:/Users/jake/gadget/strata/.env.example)
- [/backend/.env.example](/C:/Users/jake/gadget/strata/backend/.env.example)
- [/run-local.cjs](/C:/Users/jake/gadget/strata/run-local.cjs)

### 4. Repo Secret Scanning Added
- Added tracked-file secret scan script with masked output.
- Script intentionally ignores placeholders, localhost examples, and vendored/generated directories.
- Wired into `predeploy` so CI/deploy workflows fail before shipping a likely secret.

Files:
- [/scripts/scan-secrets.mjs](/C:/Users/jake/gadget/strata/scripts/scan-secrets.mjs)
- [/package.json](/C:/Users/jake/gadget/strata/package.json)

## Rotation Checklist

## No Forced Rotation Confirmed From Repo Evidence
- Based on current tracked-file scan and lightweight git-history review, no live committed secret was confirmed.
- Because of that, there is no repo-proven mandatory rotation list from this pass alone.

## Rotate Externally If Any Real Value Was Ever Pasted Into Tracked Files
- `JWT_SECRET`
- `CRON_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `GOOGLE_CLIENT_SECRET`
- SMTP app password / `SMTP_PASS`
- `INTEGRATION_VAULT_SECRET`
- Any QuickBooks or Twilio production credentials

## Priority Rotation Order If Uncertain
1. `JWT_SECRET`
2. `STRIPE_SECRET_KEY`
3. `STRIPE_WEBHOOK_SECRET`
4. `INTEGRATION_VAULT_SECRET`
5. `SMTP_PASS`
6. `RESEND_API_KEY`
7. `GOOGLE_CLIENT_SECRET`
8. `CRON_SECRET`

## Verification Performed
- `npm run scan:secrets` passed
- `npm run lint` passed
- `npm run test` passed
- `npm --prefix backend run build` passed
- Built backend app imported successfully with env validation enabled

## Remaining Risks
- Ignored local env files are intentionally not enumerated in this document; operators should still review local workstation secret handling separately.
- Historical rotation certainty is limited by the scope of this pass; if any real credentials were ever pasted into docs, screenshots, messages, or private branches, rotate them outside the app regardless of the current scan result.
