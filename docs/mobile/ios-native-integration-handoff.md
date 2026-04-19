# Strata iOS native integration handoff

This is the execution handoff for the engineer who will generate the iOS shell next.

## Default path to use

Use this path unless there is a concrete reason not to:

1. `Capacitor` as the shell.
2. `Bundled build/client` for production.
3. `https://stratacrm.app` as the frontend origin the app should reclaim with universal links.
4. `/app-return` as the native-friendly auth return path.
5. `strata` as the custom URL scheme, but fallback-only.
6. Existing HTTPS Stripe/billing return routes stay unchanged.

Why this is the default:
- it preserves the web app as the source of truth
- it keeps auth and Stripe returns on normal HTTPS routes
- it avoids inventing a separate mobile-only routing system

## Do this first

### Step 1: settle the values that should not be guessed

These need intentional values before you generate the iOS project:

| Variable | Recommended value | Why it matters |
| --- | --- | --- |
| `STRATA_CAPACITOR_APP_ID` | your real bundle id, e.g. `com.yourcompany.strata` | Avoid generating a project you immediately need to rename |
| `STRATA_CAPACITOR_APP_NAME` | `Strata CRM` unless product wants a shorter store name | Keeps config, Xcode, and store metadata aligned |
| `FRONTEND_URL` | `https://stratacrm.app` | This is the universal-link domain and auth/billing return origin |
| `VITE_API_URL` | your production API origin | Bundled mobile web assets need an absolute API base |
| `VITE_APP_RETURN_PATH` | `/app-return` | Keep this as-is unless you have a hard reason to change it |
| `VITE_APP_URL_SCHEME` | `strata` | Fallback-only scheme name |

### Step 2: inspect these files in this order

1. [`capacitor.config.ts`](../../capacitor.config.ts)
2. [`web/lib/mobileShell.ts`](../../web/lib/mobileShell.ts)
3. [`web/routes/app-return.tsx`](../../web/routes/app-return.tsx)
4. [`web/root.tsx`](../../web/root.tsx)
5. [`backend/src/routes/auth.ts`](../../backend/src/routes/auth.ts)
6. [`docs/mobile/ios-go-no-go-checklist.md`](./ios-go-no-go-checklist.md)

### Step 3: run the actual shell-generation commands

From the repo root:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npm run build
npx cap add ios
npx cap sync ios
```

Use `STRATA_CAPACITOR_SERVER_URL` only if you intentionally want a remote dev shell. Do not set it for the production shell path.

### Step 4: do these first in Xcode after generation

1. Open the generated iOS workspace/project.
2. Set the final bundle identifier.
3. Set the final display name.
4. Configure signing, team, and provisioning.
5. Add `Associated Domains` with:
   - `applinks:stratacrm.app`
6. Add `URL Types` for the fallback scheme:
   - `strata`
7. Import app icons and launch assets.
8. Run on a real iPhone before touching App Store Connect.

## What already exists in code

### Hybrid-shell config
- [`capacitor.config.ts`](../../capacitor.config.ts)
  - production expects bundled `build/client`
  - dev can optionally point at `STRATA_CAPACITOR_SERVER_URL`
  - navigation allow-list is derived from configured frontend/API hosts

### App-return and shell helpers
- [`mobileShell.ts`](../../web/lib/mobileShell.ts)
  - shell detection
  - app-return path resolution
  - safe redirect normalization
  - route restore helpers
  - fallback custom-scheme helper
- [`app-return.tsx`](../../web/routes/app-return.tsx)
  - branded native/auth return screen
- [`root.tsx`](../../web/root.tsx)
  - consumes app-return auth state and restores the intended route

### Auth behavior
- [`sign-in.tsx`](../../web/components/auth/sign-in.tsx)
- [`sign-up.tsx`](../../web/components/auth/sign-up.tsx)
  - both build Google sign-in URLs using the app-return-aware path helper
- [`auth.ts`](../../backend/src/routes/auth.ts)
  - normal web returns use hash-token redirects
  - `/app-return` uses query-token redirects so the shell can consume them cleanly
- [`auth.test.ts`](../../backend/src/routes/auth.test.ts)
  - covers the app-return redirect behavior

### Remote diagnostics
- [`remoteDiagnostics.ts`](../../web/lib/remoteDiagnostics.ts)
- [`runtimeErrors.ts`](../../web/lib/runtimeErrors.ts)
- [`reliabilityDiagnostics.ts`](../../web/lib/reliabilityDiagnostics.ts)
- [`client-diagnostics.ts`](../../backend/src/routes/client-diagnostics.ts)
  - lightweight browser/runtime reporting back to backend logs

## Provider/dashboard work you must do next

### Google auth

Use the current backend callback flow. Do not invent a separate mobile OAuth callback.

Required configuration outcome:
- Google OAuth still returns to the backend callback endpoint
- backend then redirects to:
  - `https://stratacrm.app/app-return?next=<encoded-route>&authToken=...`

Acceptance check:
1. Start Google sign-in from the app
2. Safari opens
3. Sign-in completes
4. The app reopens on `stratacrm.app`
5. `/app-return` consumes the token and restores the intended route

### Stripe / billing / payment returns

Keep the existing HTTPS return routes. Do not swap them to custom-scheme URLs.

Required configuration outcome:
- Stripe returns point to the normal frontend domain routes, such as:
  - `/appointments/:id?stripePayment=success|cancelled`
  - `/invoices/:id?stripePayment=success|cancelled`
  - `/settings?tab=billing&billingPortal=return`
  - `/subscribe?billingPortal=return`

Acceptance check:
1. Leave the app for Safari/Stripe
2. Complete or exit the flow
3. The app reopens through universal links on the correct route

## What is still manual outside the repo

### In Xcode
- generate the iOS project
- configure bundle id, signing, team, and provisioning
- configure Associated Domains
- configure URL Types fallback
- import icons and splash assets
- verify launch and status bar behavior on device

### In ops / deployment
- set final production values for the env contract above
- host a valid `apple-app-site-association` file on `stratacrm.app`
- make backend logs for `/api/client-diagnostics/report` visible to the team
- confirm who handles account deletion requests

## What to test first on a real iPhone

1. App launch and safe-area behavior
2. Sign in and sign up
3. Background / foreground recovery
4. Relaunch after process death
5. Google auth return
6. Stripe / billing return
7. Booking flow
8. Calendar day/week/month behavior
9. Leads, appointments, and invoices
10. Privacy, terms, support, and account deletion request
11. Slow network / offline interruption handling
12. Keyboard overlap and notch/home-indicator safety

## Exact point when Strata becomes TestFlight-ready

Strata becomes TestFlight-ready only when all of the following are true:
1. The iOS project exists and builds successfully in Xcode.
2. Final bundle id, signing, Associated Domains, and URL scheme fallback are configured.
3. Universal links on `stratacrm.app` are working on device.
4. Required icon and splash assets are installed.
5. Google and Stripe return behavior is verified on a real iPhone.
6. The real-device checklist passes on at least one supported iPhone.

## Exact point when Strata becomes App Store-submittable

Strata becomes App Store-submittable only when all of the following are true:
1. It is already TestFlight-ready.
2. A TestFlight build has completed the real-device QA pass without unresolved blockers.
3. App Store screenshots and listing content are complete.
4. Privacy, support, and deletion handling are documented for App Review.
5. Final submission smoke testing is clean on the archived build.
