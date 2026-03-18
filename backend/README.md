# Strata Backend

Production-ready Node + TypeScript API for Strata (auto shop management). Replaces the former Gadget backend.

## Stack

- **Express** — HTTP server
- **Drizzle ORM** — PostgreSQL with migrations
- **express-session** — session auth (cookie-based)
- **Zod** — request validation
- **Nodemailer** — SMTP email with customizable templates

## Setup

```bash
yarn install
cp .env.example .env   # set DATABASE_URL, SMTP_*, SESSION_SECRET
yarn db:generate       # generate migrations
yarn db:migrate        # run migrations
yarn dev               # start dev server (port 3001)
```

## Scripts

| Script | Description |
|--------|-------------|
| `yarn dev` | Start with tsx watch |
| `yarn build` | Compile to `dist/` |
| `yarn start` | Run `dist/index.js` |
| `yarn test` | Run Vitest |
| `yarn db:generate` | Drizzle: generate migration |
| `yarn db:migrate` | Drizzle: run migrations |

## API

All routes are under `/api/`. Auth uses JWTs sent by the frontend via `Authorization: Bearer <token>`. Ensure CORS allows the `Authorization` header.

- **Auth**: `POST /api/auth/sign-in`, `POST /api/auth/sign-up`, `POST /api/auth/sign-out`, `POST /api/auth/verify-email`
- **Resources**: `GET/POST/PATCH/DELETE /api/appointments`, `/api/invoices`, `/api/payments`, `/api/clients`, `/api/vehicles`, `/api/businesses`, `/api/quotes`, `/api/staff`, `/api/locations`, `/api/services`
- **Actions**: `POST /api/actions/getDashboardStats`, `/api/actions/getCapacityInsights`, `/api/actions/generatePortalToken`, etc.

## Multi-tenant

Every request is scoped by `req.businessId` (derived from the signed-in user’s owned business). All resource routes enforce tenant isolation.

## Email templates

Templates are stored in `email_templates` (per-business or system default). Use `sendTemplatedEmail()` and `sendWeeklySummary()` from `src/lib/email.ts`. Add a cron job to send weekly summaries (see root `DEPLOY.md`).

## Business types

Schema supports `business.type` (e.g. `tire_shop`, `auto_detailing`, `body_shop`). Use `getBusinessTypeGroup()` in `src/types/index.ts` for tire vs detail vs body branching in logic or API responses.
