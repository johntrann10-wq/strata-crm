# Testing

Strata is in production-hardening mode. The goal of this test stack is not just to catch broken pages, but to catch silent failures, false success states, stale auth behavior, and long-tail regressions before users feel them.

## Core commands

Run backend tests:

```bash
npm run test:backend
```

Run the frontend production build:

```bash
npm run build
```

Run the default Playwright suite:

```bash
npm run test:e2e
```

Run the reliability-focused Playwright suite:

```bash
npm run test:e2e:reliability
```

Run mobile auth coverage:

```bash
npm run test:e2e:mobile
```

## Coverage layers

### Backend (Vitest)

Backend tests live under [backend/src](/C:/Users/jake/gadget/strata/backend/src).

What is covered:

- route validation and core helpers
- integration coverage for unauthenticated access, health checks, and critical-path behavior
- concurrency coverage for invoice numbering and idempotent financial actions
- reliability integration coverage for:
  - protected writes refusing unauthenticated requests
  - invalid bearer tokens failing honestly instead of drifting into false success states

Important files:

- [backend/src/integration/api.integration.test.ts](/C:/Users/jake/gadget/strata/backend/src/integration/api.integration.test.ts)
- [backend/src/integration/critical-path.integration.test.ts](/C:/Users/jake/gadget/strata/backend/src/integration/critical-path.integration.test.ts)
- [backend/src/integration/concurrency.integration.test.ts](/C:/Users/jake/gadget/strata/backend/src/integration/concurrency.integration.test.ts)
- [backend/src/integration/reliability.integration.test.ts](/C:/Users/jake/gadget/strata/backend/src/integration/reliability.integration.test.ts)

### End-to-end (Playwright)

Playwright tests live under [e2e](/C:/Users/jake/gadget/strata/e2e).

Current suites:

- [e2e/critical-path.spec.ts](/C:/Users/jake/gadget/strata/e2e/critical-path.spec.ts)
  - local happy-path smoke for sign-up, onboarding, clients, appointments, and logout
- [e2e/live-auth-smoke.spec.ts](/C:/Users/jake/gadget/strata/e2e/live-auth-smoke.spec.ts)
  - deployed auth + navigation smoke
- [e2e/live-business-smoke.spec.ts](/C:/Users/jake/gadget/strata/e2e/live-business-smoke.spec.ts)
  - deployed business-critical smoke across leads, clients, vehicles, appointments, calendar, quotes, invoices, send, and print
- [e2e/reliability-diagnostics.spec.ts](/C:/Users/jake/gadget/strata/e2e/reliability-diagnostics.spec.ts)
  - simulated failed network/API/session scenarios
  - verifies failures show up honestly and are captured in diagnostics
- [e2e/soak-navigation.spec.ts](/C:/Users/jake/gadget/strata/e2e/soak-navigation.spec.ts)
  - repeated navigation across core workspaces looking for runtime or reliability events
- [e2e/mobile-core.spec.ts](/C:/Users/jake/gadget/strata/e2e/mobile-core.spec.ts)
  - mobile viewport auth flow coverage

Helper utilities:

- [e2e/helpers/reliability.ts](/C:/Users/jake/gadget/strata/e2e/helpers/reliability.ts)
  - reads and clears browser-side runtime/reliability diagnostics during tests

## Reliability diagnostics

Browser-side diagnostics are intentionally visible to the product team without devtools.

Sources:

- [web/lib/runtimeErrors.ts](/C:/Users/jake/gadget/strata/web/lib/runtimeErrors.ts)
  - uncaught browser errors, unhandled rejections, and React error boundaries
- [web/lib/reliabilityDiagnostics.ts](/C:/Users/jake/gadget/strata/web/lib/reliabilityDiagnostics.ts)
  - API network failures
  - malformed JSON responses
  - auth invalidation
  - failed actions and failed query flows

View them in:

- [web/routes/_app.settings.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.settings.tsx)

These diagnostics are session-scoped by design so a tester can reproduce a bug, open Settings, and inspect exactly what the browser experienced.

## Live smoke setup

For deployed smoke runs, set:

```bash
PLAYWRIGHT_BASE_URL=https://stratacrm.app
PLAYWRIGHT_SMOKE_EMAIL=your-email@example.com
PLAYWRIGHT_SMOKE_PASSWORD=your-password
```

Then run:

```bash
npx playwright test e2e/live-auth-smoke.spec.ts --config=playwright.config.ts --reporter=line
npx playwright test e2e/live-business-smoke.spec.ts --config=playwright.config.ts --reporter=line
```

## What this system is designed to catch

- silent fetch failures
- invalid JSON or broken proxy responses
- expired/stale session behavior
- false success states after failed actions
- navigation regressions after repeated use
- mobile auth friction
- business-critical workflow regressions in production

## Minimum hardening bar before pushing critical workflow changes

1. Reproduce the issue locally or in live smoke.
2. Fix the root cause, not just the visible symptom.
3. Run:

```bash
npm run test:backend
npm run build
```

4. Run the most relevant Playwright coverage:
   - local critical path
   - reliability suite
   - live auth/business smoke if the change affects production-critical flows
5. Check Settings diagnostics after manual QA if the bug involved weird browser behavior, auth drift, or API inconsistency.
