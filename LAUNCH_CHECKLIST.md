# Pre-Launch Checklist — Stage 6: Launch Readiness

Use this checklist before going live. Complete each section and tick items as done.

## Already in the repo

- **CORS** — Backend uses `FRONTEND_URL` to allow the frontend origin.
- **Cron workflow** — [.github/workflows/cron-automations.yml](.github/workflows/cron-automations.yml) runs hourly; add repo secrets `API_URL` and `CRON_SECRET`.
- **Vercel** — [vercel.json](vercel.json) sets build command and output directory (`build/client`).
- **Netlify** — [netlify.toml](netlify.toml) sets build command and publish directory (`build/client`).
- **.gitignore** — Excludes `build/`, `dist/`, `.env`, Playwright artifacts.

**Your remaining steps:** Set production env vars (backend + frontend), deploy backend and frontend, run DB migrations, add GitHub secrets for cron (optional), then run the smoke checks below.

---

## 1. Multi-tenant guards

All tenant-scoped API routes must use `requireAuth` + `requireTenant` and filter by `req.businessId`. See [backend/TENANCY.md](backend/TENANCY.md) for details.

| Area | Status | Notes |
|------|--------|--------|
| **Auth middleware** | ☐ | `requireAuth` sets `req.businessId` from first business where `ownerId === userId`. |
| **Appointments** | ☐ | All routes: `requireAuth`, `requireTenant`; list/create/read/update use `eq(appointments.businessId, bid)`; create validates client, vehicle, staff, location belong to business. |
| **Invoices** | ☐ | All routes: `requireAuth`, `requireTenant`; all queries filter by `businessId`; create validates client. |
| **Invoice line items** | ☐ | All routes: `requireAuth`, `requireTenant`; every operation verifies parent invoice has `invoice.businessId === bid`. |
| **Payments** | ☐ | All routes: `requireAuth`, `requireTenant`; list/fetch by `businessId`; create validates invoice belongs to business. |
| **Clients** | ☐ | All routes: `requireAuth`, `requireTenant`; all queries filter by `businessId`. |
| **Vehicles** | ☐ | All routes: `requireAuth`, `requireTenant`; validate vehicle and client belong to business. |
| **Staff, Locations, Services** | ☐ | All routes: `requireAuth`, `requireTenant`; filter by `businessId`. |
| **Quotes** | ☐ | All routes: `requireAuth`, `requireTenant`; filter by `businessId`. |
| **Actions** (getDashboardStats, getCapacityInsights, restore*, etc.) | ☐ | All use `requireAuth`, `requireTenant` and pass `businessId(req)` into queries. |
| **Activity logs / Notification logs** | ☐ | Both use `requireAuth`, `requireTenant` and filter by `businessId`. |
| **Businesses** | ☐ | `requireAuth` only (no tenant yet); list filtered by `ownerId`; create sets `ownerId = req.userId`. |
| **Users** | ☐ | `requireAuth` only; user can only read/update own record. |
| **runAutomations** | ☐ | Intentionally no `requireAuth`; protected by `CRON_SECRET` header (cron-only). |

**Verification:** Run backend tests; integration tests confirm protected routes return 401 without session. No route that returns tenant data should be callable without a valid session that has a business.

---

## 2. Stripe subscription billing ($29/mo, first month free)

| Item | Status | Notes |
|------|--------|--------|
| **Stripe account** | ☐ | Create at [dashboard.stripe.com](https://dashboard.stripe.com). Get Secret key (Settings → API keys). |
| **Product & Price** | ☐ | Create Product (e.g. "Strata Monthly") and recurring Price $29/month. Copy Price ID (`price_...`). |
| **Env vars** | ☐ | Backend: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `FRONTEND_URL`. |
| **Webhook** | ☐ | Stripe → Developers → Webhooks → Add `https://your-api-url/api/billing/webhook`. Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy signing secret to `STRIPE_WEBHOOK_SECRET`. |
| **Customer portal** | ☐ | Stripe → Settings → Billing → Customer portal: enable so customers can update payment method and cancel. |
| **DB columns** | ☐ | Run migration or apply SQL in [backend/MIGRATION_STAGE2.md](backend/MIGRATION_STAGE2.md) for `businesses` (stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, current_period_end). |

**Flow:** Sign up → Onboarding → Subscribe page → Stripe Checkout (30-day trial) → Dashboard. Settings → Billing: "Manage subscription" opens Stripe Customer Portal.

---

## 3. SMTP email setup

Email is used for: appointment confirmations, reminders, payment receipts, review requests, lapsed client re-engagement, weekly summary, and notification retries.

| Item | Status | Notes |
|------|--------|--------|
| **Env vars** | ☐ | Set in production: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. Optional: `SMTP_FROM` (defaults to `SMTP_USER`). |
| **Backend .env.example** | ☐ | Documents `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. Copy to `.env` and fill. |
| **Test send** | ☐ | After deploy, trigger an action that sends email (e.g. send invoice to client, or retry failed notification) and confirm delivery. |
| **Gmail** | ☐ | If using Gmail: use App Password (16-char), not account password; enable “Less secure app access” only if not using App Passwords. |
| **SendGrid / other** | ☐ | Use provider’s SMTP host/port and API key or SMTP credentials. |

**Code reference:** `backend/src/lib/email.ts` (nodemailer transport from env). Templates: `backend/src/lib/emailTemplates.ts` and DB table `email_templates`.

---

## 4. Automations run on schedule

Automations (appointment reminders, lapsed client detection, review requests) are triggered by calling the cron endpoint. They do **not** run automatically unless you schedule them.

| Item | Status | Notes |
|------|--------|--------|
| **Cron endpoint** | ☐ | `POST /api/actions/runAutomations`. No auth; protected by header `x-cron-secret: <CRON_SECRET>`. |
| **CRON_SECRET** | ☐ | Set `CRON_SECRET` in backend env (strong random string). Cron job must send this header. |
| **Schedule** | ☐ | Configure external cron (e.g. GitHub Actions, Render Cron, Vercel Cron, or cron-job.org) to call `POST https://<your-api>/api/actions/runAutomations` with header `x-cron-secret: <CRON_SECRET>` at desired frequency (e.g. hourly or daily). |
| **Weekly summary** | ☐ | Not part of `runAutomations`. Implement a separate cron or script that lists businesses and calls `sendWeeklySummary(businessId, businessEmail, businessName)` (see [DEPLOY.md](DEPLOY.md)). |
| **Logging** | ☐ | Backend logs automation results; check logs after first cron run to confirm no errors. |

**Example (GitHub Actions):**

```yaml
# .github/workflows/cron-automations.yml
on:
  schedule:
    - cron: '0 * * * *'  # hourly
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -s -X POST "https://YOUR_API_URL/api/actions/runAutomations" \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
```

---

## 5. Documentation for onboarding new users

| Item | Status | Notes |
|------|--------|--------|
| **User onboarding doc** | ☐ | Created: [ONBOARDING.md](ONBOARDING.md) — sign-up, first business, dashboard, calendar, clients, invoices. |
| **Deploy doc** | ☐ | [DEPLOY.md](DEPLOY.md) — env vars, backend/frontend deploy, cron. |
| **Backend README** | ☐ | [backend/README.md](backend/README.md) — setup, DB, SMTP, scripts. |
| **Testing** | ☐ | [TESTING.md](TESTING.md) — how to run unit, integration, and e2e tests. |

---

## 6. Production-ready, tested, deployable

### 5.1 Backend

| Item | Status | Notes |
|------|--------|--------|
| **Env (production)** | ☐ | `DATABASE_URL`, `SESSION_SECRET`, `SMTP_*`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `FRONTEND_URL`, `CRON_SECRET`, `PORT`, `LOG_LEVEL`. |
| **SESSION_SECRET** | ☐ | Strong random string; never default in production. |
| **Migrations** | ☐ | Run `yarn db:migrate` (or your migration process) against production DB before first deploy. |
| **Build** | ☐ | `cd backend && yarn build` succeeds. |
| **Tests** | ☐ | `yarn test` (backend) passes. Optional: run concurrency tests with `RUN_CONCURRENCY_TESTS=1` and real DB. |
| **Health** | ☐ | `GET /api/health` returns 200 and `{ "ok": true }`. |

### 5.2 Frontend

| Item | Status | Notes |
|------|--------|--------|
| **VITE_API_URL** | ☐ | In production, set `VITE_API_URL` to backend URL origin (e.g. `https://your-api.onrender.com`) so the app calls the correct API. |
| **Build** | ☐ | `yarn build` (from repo root) succeeds. |
| **E2E** | ☐ | Optional: run `yarn test:e2e` with app and backend running; Playwright tests critical paths. |

### 5.3 GitHub

| Item | Status | Notes |
|------|--------|--------|
| **Repo** | ☐ | Code pushed to GitHub (or your Git host). |
| **Secrets** | ☐ | Do not commit `.env` or secrets; use GitHub Secrets / Vercel / Netlify env for production. |
| **.gitignore** | ☐ | Includes `.env`, `node_modules`, `build`, `dist`, `.cursor`. |

### 5.4 Deploy: Vercel / Netlify (frontend)

| Item | Status | Notes |
|------|--------|--------|
| **Project** | ☐ | New project linked to repo. |
| **Root** | ☐ | Repository root (where `package.json` and `web/` live). |
| **Build command** | ☐ | `yarn build` (or `npm run build`). |
| **Output / Publish directory** | ☐ | React Router 7 default is typically `build/client` — confirm in [React Router deploy docs](https://reactrouter.com/start/deployment) and set in Vercel/Netlify. |
| **Env** | ☐ | `VITE_API_URL=https://your-backend-url` (no trailing slash). |
| **Branch** | ☐ | Deploy from `main` or your production branch. |

### 5.5 Deploy: Backend (Render / Railway / Heroku / Vercel serverless)

| Item | Status | Notes |
|------|--------|--------|
| **Service** | ☐ | New Web Service (Render) or equivalent. |
| **Root** | ☐ | `backend` (if monorepo). |
| **Build** | ☐ | `yarn install && yarn build`. |
| **Start** | ☐ | `yarn start` or `node dist/index.js`. |
| **Env** | ☐ | `DATABASE_URL`, `SESSION_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `CRON_SECRET`, `PORT`, `LOG_LEVEL`. |
| **DB** | ☐ | PostgreSQL attached; migrations run. |
| **CORS** | ☐ | If frontend and backend are on different origins, backend must allow frontend origin (e.g. Vercel URL). Add CORS middleware if not already present. |

---

## 7. Post-launch smoke checks

- [ ] Sign up a new user and complete onboarding (business type, details).
- [ ] Create a client and vehicle, then an appointment.
- [ ] Create an invoice, send to client, record a payment.
- [ ] Open calendar and confirm appointments load.
- [ ] Trigger one automation run (cron or manual `POST runAutomations` with `CRON_SECRET`) and check logs.
- [ ] Send a test email (e.g. invoice email or retry failed notification) and confirm receipt.

---

## Quick reference

| Concern | Where to look |
|--------|----------------|
| Multi-tenant safety | [backend/TENANCY.md](backend/TENANCY.md) |
| SMTP / email | [backend/.env.example](backend/.env.example), [backend/src/lib/email.ts](backend/src/lib/email.ts) |
| Automations / cron | [backend/src/routes/actions.ts](backend/src/routes/actions.ts) (`POST /runAutomations`), [backend/src/lib/automations.ts](backend/src/lib/automations.ts) |
| Deploy | [DEPLOY.md](DEPLOY.md) |
| Onboarding users | [ONBOARDING.md](ONBOARDING.md) |
| Tests | [TESTING.md](TESTING.md) |
