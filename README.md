# Strata

Automotive business CRM: appointments, clients, vehicles, invoices, payments, and automations. Multi-tenant, session-based auth, Node + Express API and React Router frontend.

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

Frontend: default port (e.g. 5173). Backend: port 3001. Set `API_BASE=http://localhost:3001` if the frontend runs on a different host.
