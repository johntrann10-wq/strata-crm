# Testing

## One command: `yarn test`

From the project root, run:

```bash
yarn test
```

This runs all **backend** unit and integration tests.

## What’s included

### Backend (Vitest)

- **Unit tests**: Route validation (Zod schemas) and helpers for:
  - `errors`, `idempotency`, `appointments`, `invoices`, `invoice-line-items`, `payments`, `actions`
  - `appointmentOverlap`: double-booking check returns true/false based on overlapping appointments
- **Integration tests**: HTTP layer and auth:
  - `GET /api/health` → 200
  - Protected routes (`/api/appointments`, `/api/invoices`, `/api/payments`, `/api/clients`) → 401 when unauthenticated
  - `POST /api/auth/sign-in` with invalid body → 400
- **Concurrency / hardening tests** (skipped unless `RUN_CONCURRENCY_TESTS=1` and a real DB is configured):
  - Payment reversal idempotency: second reverse returns 200 with same payment
  - Concurrent invoice creation: parallel creates yield unique invoice numbers

Run backend tests only:

```bash
yarn test:backend
# or
cd backend && yarn test
```

### E2E (Playwright)

Critical path checks (sign-in page, redirect when unauthenticated).

1. Start the app (in two terminals):

   ```bash
   yarn dev          # frontend (default http://localhost:5173)
   yarn dev:backend  # API (default http://localhost:3001)
   ```

2. Install browsers (once):

   ```bash
   npx playwright install
   ```

3. Run E2E:

   ```bash
   yarn test:e2e
   ```

## Multi-tenant safety

Backend routes enforce tenancy; see [backend/TENANCY.md](backend/TENANCY.md). Integration tests confirm that protected endpoints return 401 without a session.
