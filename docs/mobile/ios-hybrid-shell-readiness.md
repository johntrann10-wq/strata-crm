# Strata iOS hybrid-shell readiness

This repo is prepared for a first iOS launch using a Capacitor-style native shell with Strata's web app as the source of truth.

## What this file is for

Use this document during shell generation. It answers:
- which runtime model Strata expects
- which env values matter before native setup starts
- which files the iOS engineer should inspect first
- how auth and external returns should behave inside the shell

## Chosen packaging path

- Runtime model: native iOS shell + Strata web UI
- Production web content: bundled `build/client`
- Development shell content: optional remote server via `STRATA_CAPACITOR_SERVER_URL`
- API origin inside the shell: explicit absolute API URL at build time
- Default production frontend origin: `https://stratacrm.app`
- Default native auth return path: `/app-return`
- Default custom URL scheme: `strata` as fallback only

## Inspect these files first

1. [`capacitor.config.ts`](../../capacitor.config.ts)
2. [`web/lib/mobileShell.ts`](../../web/lib/mobileShell.ts)
3. [`web/routes/app-return.tsx`](../../web/routes/app-return.tsx)
4. [`web/root.tsx`](../../web/root.tsx)
5. [`backend/src/routes/auth.ts`](../../backend/src/routes/auth.ts)

## Environment contract

### Required before serious native work

- `STRATA_CAPACITOR_APP_ID`
  - final iOS bundle identifier placeholder used by `capacitor.config.ts`
- `STRATA_CAPACITOR_APP_NAME`
  - final app display name placeholder used by `capacitor.config.ts`
- `FRONTEND_URL`
  - canonical production frontend origin that universal links will claim
- `VITE_API_URL`
  - absolute API origin for bundled mobile web assets
- Recommended default:
  - `FRONTEND_URL=https://stratacrm.app`

### Required for native-friendly auth return behavior

- `VITE_APP_RETURN_PATH`
  - default: `/app-return`
- `VITE_APP_URL_SCHEME`
  - fallback-only custom scheme name, default: `strata`

### Optional for shell/dev diagnostics

- `STRATA_CAPACITOR_SERVER_URL`
  - dev-only remote server URL for device testing against Vite or a preview deployment
- `VITE_REMOTE_DIAGNOSTICS_ENABLED`
  - enables lightweight remote client error reporting
- `CLIENT_ERROR_REPORTING_ENABLED`
  - enables backend ingestion of client diagnostic events

## Production vs development shell URL handling

### Production

- Leave `STRATA_CAPACITOR_SERVER_URL` unset.
- Bundle `build/client` into the shell.
- Use a real absolute `VITE_API_URL`.
- Keep auth, billing, and payment returns on the main frontend HTTPS origin.
- Recommended default:
  - universal links on `https://stratacrm.app`
- Do not point production shells at a remote web server unless there is a deliberate operational reason.

### Development

- Set `STRATA_CAPACITOR_SERVER_URL` only when intentionally running the shell against a remote dev or preview server.
- Example:
  - `STRATA_CAPACITOR_SERVER_URL=http://YOUR-LAN-IP:5173`
- If using cleartext `http://`, allow it only in debug builds.

## Deep-link / callback patterns

### Google auth

- Browser flow:
  - `https://your-frontend/signed-in#authToken=...`
- Native-shell flow:
  - `https://your-frontend/app-return?next=%2Fsigned-in&authToken=...`
- The app shell consumes that URL, persists auth, and routes to `next`.
- Recommended path:
  - keep the backend OAuth callback unchanged
  - let the backend redirect back to `https://stratacrm.app/app-return?...`

### Stripe invoice / deposit / billing returns

- Existing frontend return URLs remain the source of truth:
  - `/appointments/:id?stripePayment=success|cancelled`
  - `/invoices/:id?stripePayment=success|cancelled`
  - `/settings?tab=billing&billingPortal=return`
  - `/subscribe?billingPortal=return`
- Universal links should reclaim those HTTPS routes from Safari.
- Do not replace them with custom-scheme-only URLs unless a provider forces it.
- Recommended path:
  - keep Stripe returns on HTTPS routes under `https://stratacrm.app`
  - reclaim them with Associated Domains in the native shell

## Safe-area and status bar notes

- Web layer already uses `viewport-fit=cover`
- `MobileShellBridge` marks shell mode on the document
- CSS safe-area handling is active only for shell mode
- Capacitor status bar behavior is scaffolded in `capacitor.config.ts`

## Exact command to start shell creation

From the repo root:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npm run build
npx cap add ios
npx cap sync ios
```

Run that only after the required env values above are settled enough that the generated project will not immediately need to be renamed.

## Immediate Xcode work after generation

1. Open the generated iOS project in Xcode.
2. Set the real bundle identifier.
3. Set the real display name.
4. Configure signing and Apple Team.
5. Add `Associated Domains`.
6. Add `URL Types` only for the custom-scheme fallback.
7. Import icon and splash assets.
8. Verify status bar and launch behavior on a real device.

## What this file does not claim

- It does not mean the iOS project already exists.
- It does not mean Associated Domains are configured.
- It does not mean Google or Stripe native return flows are tested.
- It does not mean Strata is TestFlight-ready.
