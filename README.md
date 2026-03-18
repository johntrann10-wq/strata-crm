# Strata

Automotive business CRM: appointments, clients, vehicles, invoices, payments, and automations. Multi-tenant, Node + Express API and a React Router (Vite) frontend hosted on Vercel.

## Architecture (what runs in production)
- **Frontend (Vercel):** React Router SPA built from `web/` (see `react-router.config.ts` with `appDirectory: "web"` and `ssr: false`).
  - All API calls are made by the custom client in `web/api.ts` (no Gadget runtime).
  - Calls the Express backend directly at `/api/*` using a **JWT bearer token** in the `Authorization` header.
  - Token is stored client-side in `localStorage` under `authToken`.
- **Backend (Railway/Express):** Express + Drizzle app in `backend/`.
  - REST resources are mounted under `/api/*` (e.g. `/api/appointments`, `/api/clients`, `/api/invoices`).
  - Model/action-style endpoints are mounted under `/api/actions/*` and resource-specific routes (e.g. `/api/appointments/:id/complete`).
  - Multi-tenancy: every request is scoped to `businessId` derived from the authenticated user.
  - **Sessions are a backend-only fallback** when no `Authorization` header is present; the frontend does not rely on cookies.

## Quick start

- **Deploy & launch:** [DEPLOY.md](DEPLOY.md) and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)
- **Onboarding new users:** [ONBOARDING.md](ONBOARDING.md)
- **Backend:** `backend/` — [backend/README.md](backend/README.md)
- **Tests:** [TESTING.md](TESTING.md)

## Local development

```bash
yarn install
cd backend && cp .env.example .env   # set DATABASE_URL, SMTP_*, SESSION_SECRET
cd backend && yarn db:migrate
yarn dev:backend   # terminal 1
yarn dev           # terminal 2
```

Frontend: default port (e.g. 5173). Backend: port 3001. Set `VITE_API_URL=http://localhost:3001` if the frontend runs on a different host.

Backend auth note: `JWT_SECRET` is required for `POST /api/auth/sign-in`, `POST /api/auth/sign-up`, and `GET /api/auth/me` to work.
