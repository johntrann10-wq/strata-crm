# Strata — Cursor Project Brief

Use this document when working on the Strata codebase. It defines scope, priorities, and deployment so you can push production-ready updates back to GitHub.

---

## 1. Repo access

- **Share the GitHub repo with Cursor** (e.g. open the repo in Cursor, or connect the GitHub account in Cursor settings so it can read and push to the repo).
- Work in the `strata` repo; push branches/PRs or direct commits as agreed with the owner.

---

## 2. Backend rewrite (Node + TypeScript)

- **Rewrite all backend logic** that was previously in Gadget APIs into a **production-ready Node + TypeScript** service.
- Implement the API surface expected by the frontend (see `web/api.ts` and `server/api/`):
  - **REST-style resources**: appointments, invoices, payments, clients, vehicles, businesses, users, staff, locations, services, quotes, inventory, activity logs, notifications, backups, automations, vehicle inspections.
  - **Model-specific actions**: e.g. `appointment.updateStatus`, `appointment.complete`, `appointment.cancel`, `invoice.voidInvoice`, `payment.reverse`, `quote.send`, `quote.sendFollowUp`, `user.signIn`, `user.signUp`, `business.completeOnboarding`, etc.
  - **Global actions**: `getDashboardStats`, `getCapacityInsights`, `generatePortalToken`, `restoreClient`, `restoreVehicle`, `restoreService`, `unvoidInvoice`, `reversePayment`, `revertRecord`, `retryFailedNotifications`, `createBackup`, `getAnalyticsData`, `optimizeDailyRoute`.
- Use **PostgreSQL** (via `DATABASE_URL` in `.env`). Use an ORM or query builder (e.g. Drizzle, Prisma, Kysely) with proper migrations.
- Use **session/auth** (e.g. cookies + JWT or session store) so loaders and API can resolve the current user and tenant.
- Ensure **multi-tenant isolation**: all queries and mutations must be scoped by `businessId` (or equivalent tenant id) derived from the authenticated user.

---

## 3. Bug fixes (from Gadget audit)

- Fix all **multi-tenant** bugs: ensure no cross-tenant data leakage; validate `businessId` / tenant on every request.
- Fix **email** bugs: correct SMTP usage (see `.env.example`: `SMTP_*`), delivery, and error handling; ensure from/to and templates are correct.
- Fix **automation** bugs: reliable execution, idempotency where appropriate, and clear logging.
- Fix **invoice** bugs: totals, tax, discounts, line items, and status transitions (e.g. draft → sent → paid → void) with no double-counting or inconsistent state.
- Fix **appointment** bugs: status lifecycle (scheduled → confirmed → in progress → completed/cancelled), conflict checks, and timezone handling.

---

## 4. Production standards

- **Idempotency**: For payment, invoice, and other critical operations, support idempotency keys or duplicate detection so retries do not double-apply.
- **Logging**: Structured logging (e.g. request id, user id, tenant id, action, duration, errors). Log errors and important business events; avoid logging secrets.
- **Error handling**: Consistent error responses (e.g. status codes, JSON shape). Use typed errors where useful; never expose stack traces or internal details in production responses.
- **Type safety**: Full TypeScript on backend and shared types where applicable (e.g. API request/response types, domain models).

---

## 5. Business-type-specific behavior

- Support **business types** (e.g. tire shop, detail shop, body shop) and branch UI and logic where needed.
- **Tire shop**: e.g. tire-specific services, inventory (tires), and any tire-specific flows.
- **Detail shop**: e.g. detailing packages, add-ons, and scheduling nuances.
- **Body shop**: e.g. estimates, parts, insurance-related flows.
- Use `business.type` (or equivalent) to drive feature flags, forms, and validation. Add business-type-specific UI and backend rules without breaking existing flows.

---

## 6. Email system

- Make **all emails** (client-facing and business-facing) **customizable via templates** (e.g. stored in DB or files, with variables like `{{clientName}}`, `{{appointmentDate}}`).
- Implement **weekly summary emails** for business users (e.g. appointments, revenue, key metrics).
- Use the configured SMTP settings from env; support a simple template engine and a way to edit templates (admin or config).

---

## 7. Testing

- **Fully test**:
  - **Calendar**: views, navigation, time zones, and conflict checks.
  - **Appointment lifecycle**: create, update, confirm, complete, cancel, reschedule; status transitions and validations.
  - **Invoicing**: create invoice, line items, discounts, tax, totals; send; record payment; void; unvoid.
  - **Payments**: create, reverse; idempotency and balance consistency.
  - **Automations**: triggers, conditions, actions; no double-runs where idempotent.
- Prefer automated tests (e.g. Jest/Vitest for backend, React Testing Library or Playwright for frontend) for critical paths; document manual test scenarios where needed.

---

## 8. Dashboard & analytics

- **Optimize dashboard & analytics**: queries, caching, and indexing so dashboard and analytics endpoints are fast and accurate.
- Ensure metrics (revenue, appointments, capacity, etc.) are tenant-scoped and consistent with the rest of the app.

---

## 9. Build & deploy

- **Frontend**: Production build must succeed (`yarn build` or equivalent). Deployable via **GitHub → Vercel or Netlify** (or similar).
- **Backend**: Node server (Express, Fastify, or similar) with a production-ready start script. Deployable on **Render, Vercel (serverless), Heroku**, or another Node host.
- **Environment**: Use `.env` for local secrets; use `.env.example` as the template. Production uses platform env vars (no `.env` committed).
- Ensure **build scripts** for frontend and backend are documented (e.g. in README) and work in CI (e.g. `yarn build`, `yarn build:server` if applicable).

---

## 10. Delivering updates

- Push changes to GitHub (branch or main as agreed).
- Ensure the repo has a **fully working version**: frontend builds, backend runs, migrations and env are documented, and deployment steps are clear (e.g. in README or DEPLOY.md).
- Prefer small, reviewable commits; tag or document a “production-ready” revision when the above is satisfied.

---

## Quick reference

| Area            | Location / notes                                      |
|-----------------|--------------------------------------------------------|
| Frontend API    | `web/api.ts`, `web/hooks/useApi.ts`                    |
| Server stubs    | `server/api/` (appointments, invoices, payments)      |
| Env template    | `.env.example`                                         |
| App config      | `react-router.config.ts`, `vite.config.mts`           |
