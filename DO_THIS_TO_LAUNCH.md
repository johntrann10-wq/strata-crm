# Do this to launch

Run the automated step, then do the dashboard steps (you must do these in your accounts).

---

## 1. Automated (run locally)

From the repo root:

```bash
yarn predeploy
```

This runs backend tests, builds the backend, and builds the frontend. If this fails, fix errors before deploying.

**Then run migrations against your production database** (one time):

```bash
cd backend
# Set DATABASE_URL to your production DB, then:
yarn db:generate
yarn db:migrate
```

(Or run the same migration command in your backend host’s shell if it has DB access.)

---

## 2. Backend (Render / Railway / Heroku)

Create a new Web Service (or equivalent), connect this repo, set **Root directory** to `backend`.

**Environment variables** — add these (use real values):

| Name | Value | Required |
|------|--------|----------|
| `DATABASE_URL` | Your PostgreSQL connection string | Yes |
| `SESSION_SECRET` | Long random string (e.g. `openssl rand -hex 32`) | Yes |
| `JWT_SECRET` | JWT signing secret (e.g. `openssl rand -hex 32`) | Yes (required in production) |
| `SMTP_HOST` | e.g. `smtp.gmail.com` | Yes |
| `SMTP_PORT` | `465` | Yes |
| `SMTP_USER` | Your SMTP login email | Yes |
| `SMTP_PASS` | Your SMTP password (e.g. Gmail App Password) | Yes |
| `CRON_SECRET` | Long random string (for cron endpoint) | Yes |
| `FRONTEND_URL` | Your frontend URL, e.g. `https://your-app.vercel.app` (no trailing slash) | If frontend on different domain |
| `API_BASE` | Backend URL origin (no trailing slash) | Yes (required for Google Calendar, QuickBooks, and Twilio callbacks) |
| `STRIPE_SECRET_KEY` | Stripe Secret key (sk_live_... or sk_test_...) | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (whsec_...) | Yes |
| `STRIPE_PRICE_ID` | Stripe Price ID (price_...) | Yes |
| `GOOGLE_CLIENT_ID` | Google Calendar OAuth Client ID | If using Google Calendar |
| `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth Client Secret | If using Google Calendar |
| `QUICKBOOKS_CLIENT_ID` | QuickBooks OAuth Client ID | If using QuickBooks |
| `QUICKBOOKS_CLIENT_SECRET` | QuickBooks OAuth Client Secret | If using QuickBooks |
| `INTEGRATION_VAULT_SECRET` | Long random string for encrypted provider secrets | If using any integration |
| `INTEGRATION_VAULT_KEY_ID` | Label for the active vault key, e.g. `current` | If using any integration |
| `FEATURE_INTEGRATION_QUICKBOOKS_ONLINE` | `true` to enable QuickBooks flows | If using QuickBooks |
| `FEATURE_INTEGRATION_GOOGLE_CALENDAR` | `true` to enable Google Calendar flows | If using Google Calendar |
| `FEATURE_INTEGRATION_TWILIO_SMS` | `true` to enable Twilio SMS flows | If using Twilio |
| `FEATURE_INTEGRATION_OUTBOUND_WEBHOOKS` | `true` to enable signed outbound webhooks | If using outbound webhooks |
| `PORT` | `3001` | Yes |
| `LOG_LEVEL` | `info` | Yes |

**Build command:** `yarn install && yarn build`  
**Start command:** `yarn start`

After deploy, note your backend URL (e.g. `https://your-api.onrender.com`).

---

## 3. Frontend (Vercel or Netlify)

Import this repo. Root is the repo root (not `web/`). Build and output are set in `vercel.json` / `netlify.toml`.

**Environment variables** (use your **Railway** backend URL, no trailing slash):

| Name | Value |
|------|--------|
| `VITE_API_URL` | Backend URL origin, e.g. `https://your-backend.example.com` — used by the browser (Vite env). |

Deploy. Note your frontend URL. On the backend (Railway), set `FRONTEND_URL` to this Vercel URL so CORS and redirects work.

---

## 4. GitHub Actions (cron — optional)

If you want automations (reminders, lapsed clients, review requests) to run on a schedule:

1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** → name: `API_URL`, value: your backend URL (e.g. `https://your-api.onrender.com`).
3. **New repository secret** → name: `CRON_SECRET`, value: the same string you set as `CRON_SECRET` on the backend.

The workflow `.github/workflows/cron-automations.yml` runs hourly. You can also run it manually from the **Actions** tab.

---

## 5. Smoke test

1. Open your frontend URL.
2. Sign up with email/password.
3. Complete onboarding (business type, staff/hours, business details).
4. Create a client, then an appointment.
5. Create an invoice, send to client (use your own email to test), and confirm the email arrives.

Optional (recommended): run the automated critical-path smoke suite locally:

```bash
yarn test:e2e
```

If all of that works, you’re launched.
