# Strata — Deploy Guide

## Overview

- **Frontend**: React Router (Vite) app in `web/`. Deploy to **Vercel** or **Netlify**.
- **Backend**: Node + Express API in `backend/`. Deploy to **Render**, **Railway**, **Heroku**, or **Vercel (serverless)**.

## Prerequisites

- Node 18+
- PostgreSQL (e.g. Neon, Supabase, Railway)
- SMTP (Gmail App Password or SendGrid, etc.)

## Environment

### Frontend (Vercel/Netlify)

**Recommended (no client rebuild when the API URL changes):** set **`STRATA_API_ORIGIN`** to your backend origin (e.g. `https://your-api.onrender.com`). The repo includes a same-origin **`/api` proxy** (Vercel Edge: `api/[...path].ts`; Netlify Edge: `netlify/edge-functions/strata-api-proxy.ts`). The browser keeps calling `/api/...` on your site; the edge function forwards to the real API. Set **`FRONTEND_URL`** on the backend to your Vercel/Netlify site for CORS if you also call the API directly.

**Alternative:** set **`VITE_API_URL`** at **build time** so the SPA calls the API host from the browser (backend must allow CORS for your frontend origin).

### Backend

Copy from `backend/.env.example`:

- `DATABASE_URL` — PostgreSQL connection string
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — SMTP credentials (optional: `SMTP_FROM` for From address)
- `JWT_SECRET` — JWT signing secret (required for `sign-in`, `sign-up`, and `GET /api/auth/me`)
- `SESSION_SECRET` — random string for session signing
- `FRONTEND_URL` — origin of the frontend (e.g. `https://your-app.vercel.app`) for CORS and Stripe redirect URLs
- `API_BASE` — backend API origin (required for Google OAuth redirect URIs)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth credentials
- `APPLE_SIGN_IN_CLIENT_IDS` — optional comma-separated Apple audiences the backend should accept for native Sign in with Apple (`app.stratacrm.mobile` by default)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` — required for paid subscriptions ($29/mo, first month free)
- `CRON_SECRET` — required; `POST /api/actions/runAutomations` requires header `x-cron-secret: <CRON_SECRET>`
- `PORT` — required (server port, e.g. `3001`)
- `LOG_LEVEL` — required (e.g. `info`)

### Stripe (subscription billing)

1. Create a [Stripe](https://dashboard.stripe.com) account and get **Secret key** (Settings → API keys).
2. Create a **Product** (e.g. "Strata Monthly") and a **Price**: $29/month, recurring. Copy the Price ID (`price_...`).
3. Set **Customer portal** (Settings → Billing → Customer portal) so customers can update payment method and cancel.
4. Add env: `STRIPE_SECRET_KEY=sk_live_...`, `STRIPE_PRICE_ID=price_...`.
5. **Webhook**: Stripe Dashboard → Developers → Webhooks → Add endpoint: `https://your-api.onrender.com/api/billing/webhook`. Select events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the **Signing secret** (`whsec_...`) and set `STRIPE_WEBHOOK_SECRET=whsec_...`.
6. Ensure `FRONTEND_URL` is set so checkout success/cancel and portal return URLs are correct.

## Backend (Node)

```bash
cd backend
yarn install
cp .env.example .env   # fill in values
yarn db:generate       # Drizzle: generate migrations
yarn db:migrate        # run migrations
yarn build
yarn start             # or NODE_ENV=production node dist/index.js
```

### Render

1. New → Web Service; connect repo.
2. Root directory: `backend`
3. Build: `yarn install && yarn build`
4. Start: `yarn start`
5. Add env vars (DATABASE_URL, SMTP_*, SESSION_SECRET, PORT).

### Heroku

```bash
cd backend
heroku create your-strata-api
heroku config:set DATABASE_URL=... SESSION_SECRET=... SMTP_HOST=... SMTP_PORT=465 SMTP_USER=... SMTP_PASS=...
git subtree push --prefix backend heroku main
```

### Railway

1. New Project → Deploy from GitHub; select repo, set root to `backend`.
2. Add PostgreSQL plugin; link DATABASE_URL.
3. Add env vars; deploy.

## Frontend (Vercel / Netlify)

```bash
yarn install
yarn build
```

- **Vercel**: Import repo → Framework Preset: Vite (or Other) → Build Command: `yarn build` → Output: `build/client` (or per React Router output).
- **Netlify**: Build command: `yarn build`; Publish directory: `build/client` (check `react-router.config.ts` and build output).

Set **`STRATA_API_ORIGIN`** (or **`VITE_API_URL`**) as above so `/api` reaches your backend.

**CORS:** Set `FRONTEND_URL=https://your-app.vercel.app` (or your Netlify URL) on the backend. With the edge proxy, the browser often uses same-origin `/api` (no CORS for those requests); keep `FRONTEND_URL` correct for OAuth redirects and any direct API calls.

## Native iOS Sign in with Apple

The iOS shell now uses Apple's native `AuthenticationServices` flow and sends the Apple identity token to the backend for verification. Before shipping it, complete these manual Apple-side steps:

1. In Apple Developer, open the App ID for `app.stratacrm.mobile` and enable **Sign in with Apple**.
2. Regenerate any provisioning profiles used by the iOS target after enabling the capability.
3. In Xcode, confirm the `App` target shows the **Sign in with Apple** capability and that the entitlements file is included in signing.
4. If users may choose **Hide My Email**, configure Apple's private email relay for the sender addresses/domains Strata uses for transactional mail so relay addresses can still receive support, reset, and notification emails.

See [docs/mobile/sign-in-with-apple.md](docs/mobile/sign-in-with-apple.md) for the full setup and QA checklist.

## Automations (cron)

Appointment reminders, lapsed client detection, and review requests run via:

- **Endpoint:** `POST /api/actions/runAutomations`
- **Auth:** No session; require header `x-cron-secret: <CRON_SECRET>` (CRON_SECRET is always required).
- **Schedule:** Use an external cron (e.g. GitHub Actions, Render Cron, cron-job.org) to call this URL at the desired frequency (e.g. hourly).

See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) §3 for a full checklist and example GitHub Actions workflow.

## Running locally

1. **Backend** (with DB and .env):
   ```bash
   cd backend && yarn install && yarn dev
   ```
2. **Frontend** (proxy to backend if needed):
   ```bash
   yarn install && yarn dev
   ```
If the frontend runs on a different port, set `VITE_API_URL=http://localhost:3001` in the frontend env (Vite) or use a Vite proxy.

## Weekly summary emails

The backend supports `sendWeeklySummary(businessId, businessEmail, businessName)`. Use a cron job (e.g. Render Cron, GitHub Actions, or external cron) to call an internal endpoint or a script that:

1. Lists businesses with onboarding complete.
2. For each, calls `sendWeeklySummary(...)` (implement a small cron route or script that uses `src/lib/email.ts`).

Add a default `weekly_summary` template in `email_templates` (system default: `businessId = null`) with subject/body using `{{businessName}}`, `{{weekStart}}`, `{{weekEnd}}`.

## Production checklist

- [ ] DATABASE_URL, SESSION_SECRET, SMTP_* set on backend
- [ ] `STRATA_API_ORIGIN` (recommended) or `VITE_API_URL` set so the frontend can reach the API
- [ ] CRON_SECRET set on backend; cron job configured to call `POST /api/actions/runAutomations` with header
- [ ] Migrations run on backend DB
- [ ] Frontend build succeeds (`yarn build`)
- [ ] Backend starts and `GET /api/health` returns 200
- [ ] Full pre-launch list: [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)
