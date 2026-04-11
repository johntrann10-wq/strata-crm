# Strata App Audit Inventory

Updated: 2026-04-10

## Audit Goal

Audit every user-facing page and every critical function family in Strata so the app can be hardened for real shop use without breaking routes, data contracts, auth, or persistence.

## Route Inventory

### Public / Marketing

- `web/routes/_public.tsx`
- `web/routes/_public._index.tsx`
- `web/routes/_public.features.tsx`
- `web/routes/_public.pricing.tsx`
- `web/routes/_public.privacy.tsx`
- `web/routes/_public.terms.tsx`
- `web/routes/_public.lead.$businessId.tsx`
- `web/routes/_public.$slug.tsx`
- `web/routes/portal.$token.tsx`
- `web/routes/$.tsx`

### Auth

- `web/routes/_auth.tsx`
- `web/routes/_auth.sign-in.tsx`
- `web/routes/_auth.sign-up.tsx`
- `web/routes/_auth.forgot-password.tsx`
- `web/routes/_auth.reset-password.tsx`
- `web/routes/_auth.verify-email.tsx`

### App Shell / Navigation

- `web/routes/_app.tsx`
- `web/routes/_app.signed-in.tsx`
- `web/routes/_app.subscribe.tsx`
- `web/routes/_app.profile.tsx`
- `web/routes/_app.onboarding.tsx`

### Scheduling

- `web/routes/_app.calendar.tsx`
- `web/routes/_app.appointments._index.tsx`
- `web/routes/_app.appointments.new.tsx`
- `web/routes/_app.appointments.$id.tsx`

### CRM Records

- `web/routes/_app.clients._index.tsx`
- `web/routes/_app.clients.new.tsx`
- `web/routes/_app.clients.$id.tsx`
- `web/routes/_app.clients.$id.vehicles.new.tsx`
- `web/routes/_app.clients.$id.vehicles.$vehicleId.tsx`
- `web/routes/_app.vehicles._index.tsx`
- `web/routes/_app.leads.tsx`

### Operations

- `web/routes/_app.jobs._index.tsx`
- `web/routes/_app.jobs.$id.tsx`
- `web/routes/_app.services._index.tsx`

### Financials

- `web/routes/_app.quotes._index.tsx`
- `web/routes/_app.quotes.new.tsx`
- `web/routes/_app.quotes.$id.tsx`
- `web/routes/_app.invoices._index.tsx`
- `web/routes/_app.invoices.new.tsx`
- `web/routes/_app.invoices.$id.tsx`
- `web/routes/_app.finances.tsx`

### Settings / Integrations

- `web/routes/_app.settings.tsx`

## Backend Route Inventory

### Highest-Risk Business Endpoints

- `backend/src/routes/auth.ts`
- `backend/src/routes/appointments.ts`
- `backend/src/routes/appointment-services.ts`
- `backend/src/routes/clients.ts`
- `backend/src/routes/vehicles.ts`
- `backend/src/routes/jobs.ts`
- `backend/src/routes/quotes.ts`
- `backend/src/routes/quote-line-items.ts`
- `backend/src/routes/invoices.ts`
- `backend/src/routes/invoice-line-items.ts`
- `backend/src/routes/payments.ts`
- `backend/src/routes/portal.ts`

### Important Supporting Endpoints

- `backend/src/routes/staff.ts`
- `backend/src/routes/locations.ts`
- `backend/src/routes/services.ts`
- `backend/src/routes/service-categories.ts`
- `backend/src/routes/service-addon-links.ts`
- `backend/src/routes/activity-logs.ts`
- `backend/src/routes/notification-logs.ts`
- `backend/src/routes/actions.ts`
- `backend/src/routes/integrations.ts`
- `backend/src/routes/businesses.ts`
- `backend/src/routes/billing.ts`
- `backend/src/routes/expenses.ts`
- `backend/src/routes/users.ts`
- `backend/src/routes/vehicle-catalog.ts`

## Shared Systems Inventory

### Scheduling Surface Components

- `web/components/CalendarViews.tsx`
- `web/components/DayView.tsx`
- `web/components/WeekView.tsx`
- `web/components/appointments/AppointmentInspectorPanel.tsx`
- `web/components/appointments/SchedulingControls.tsx`
- `web/components/shared/QuickBookSheet.tsx`

### Financial Surface Components / Helpers

- `web/components/AppointmentDetailCards.tsx`
- `web/components/invoices/InvoiceLineItemsTable.tsx`
- `web/lib/paymentStates.ts`
- `backend/src/lib/appointmentFinance.ts`

### Shared App Shell / Navigation

- `web/components/shared/PageHeader.tsx`
- `web/components/shared/ListViewToolbar.tsx`
- `web/components/shared/NavDrawer.tsx`
- `web/components/shared/QuickCreateMenu.tsx`
- `web/components/shared/CommandPalette.tsx`

## Critical Workflow Map

### P0 Workflows

1. Auth and session continuity
2. Client and vehicle creation
3. Appointment booking and editing
4. Calendar month/day understanding
5. Schedule week understanding
6. Appointment finance state
7. Invoice creation from appointment
8. Payment collection and reversal
9. Public portal / print document correctness
10. Persistence after reload on mobile and desktop

### P1 Workflows

1. Dashboard clarity
2. Job status/lifecycle transitions
3. Search/filter behavior
4. Staff and location assignment
5. Integration settings and notifications

## Page Audit Matrix

### Scheduling

#### Calendar

- Route: `web/routes/_app.calendar.tsx`
- Purpose: month/day scheduling workspace
- Core actions: navigate dates, inspect selected day, inspect appointment, reschedule, create blocks
- Shared dependencies:
  - `api.appointment`
  - `CalendarViews.tsx`
  - `DayView.tsx`
  - `AppointmentInspectorPanel.tsx`
- Risk level: P0
- Current audit notes:
  - nested scroll behavior has already caused desktop trap issues
  - finance state is shared with the appointment inspector and must stay consistent
  - month/day data density and performance are sensitive to appointment volume

#### Schedule

- Route: `web/routes/_app.appointments._index.tsx`
- Purpose: weekly planning sheet
- Core actions: understand the week, inspect a day, jump into appointments
- Shared dependencies:
  - `api.appointment`
  - shared appointment inspector and schedule day dialog logic
- Risk level: P0
- Current audit notes:
  - mobile density and overflow have been frequent regressions
  - week anchoring and day grouping need steady verification

#### New Appointment

- Route: `web/routes/_app.appointments.new.tsx`
- Purpose: create single-day and multi-day appointments
- Core actions: choose client/vehicle/services, set timing, set pricing, create appointment
- Shared dependencies:
  - `api.appointment.create`
  - `SchedulingControls.tsx`
- Risk level: P0
- Current audit notes:
  - booking finance defaults are highly sensitive
  - custom pricing and multi-day state must match downstream appointment/invoice logic

#### Appointment Detail

- Route: `web/routes/_app.appointments.$id.tsx`
- Purpose: full control surface for a single appointment
- Core actions: edit details, edit services, collect/reverse payment, manage lifecycle, link invoice
- Shared dependencies:
  - `AppointmentDetailCards.tsx`
  - `paymentStates.ts`
  - backend appointment finance summary
- Risk level: P0
- Current audit notes:
  - this page historically drifted from the shared appointment inspector
  - payment and deposit logic must not fork from the backend finance summary

### Financials

#### Invoices

- Routes:
  - `web/routes/_app.invoices._index.tsx`
  - `web/routes/_app.invoices.new.tsx`
  - `web/routes/_app.invoices.$id.tsx`
- Purpose: create, manage, collect, and reverse invoice payments
- Risk level: P0
- Current audit notes:
  - invoice payment state must reflect back on linked appointments
  - invoice-from-appointment prefill must not invent phantom adjustments

#### Quotes

- Routes:
  - `web/routes/_app.quotes._index.tsx`
  - `web/routes/_app.quotes.new.tsx`
  - `web/routes/_app.quotes.$id.tsx`
- Risk level: P1

### CRM Records

#### Clients / Vehicles

- Routes:
  - `web/routes/_app.clients._index.tsx`
  - `web/routes/_app.clients.new.tsx`
  - `web/routes/_app.clients.$id.tsx`
  - `web/routes/_app.clients.$id.vehicles.new.tsx`
  - `web/routes/_app.clients.$id.vehicles.$vehicleId.tsx`
  - `web/routes/_app.vehicles._index.tsx`
- Risk level: P0 for create/edit attachment to appointments
- Current audit notes:
  - vehicle linking is critical to scheduling and invoicing
  - mobile create/edit flows should be verified after finance/scheduling stabilization

## First P0 Findings

### Finding 1: Finance state logic still exists in multiple UI layers

- Severity: P0
- Surfaces involved:
  - `web/components/appointments/AppointmentInspectorPanel.tsx`
  - `web/routes/_app.appointments.$id.tsx`
  - `web/components/AppointmentDetailCards.tsx`
  - `web/lib/paymentStates.ts`
- Why it matters:
  - payment/deposit state is core shop truth
  - duplicated logic creates false paid / false deposit-collected states
- Status:
  - partially hardened already
  - still requires full verification against freshly created appointments, linked invoices, and payment reversals

### Finding 2: Scheduling surfaces are scroll-fragile

- Severity: P0
- Surfaces involved:
  - `web/routes/_app.calendar.tsx`
  - `web/components/DayView.tsx`
  - `web/routes/_app.appointments._index.tsx`
- Why it matters:
  - shop users live in these screens all day
  - nested scroll traps, mobile cropping, and inspector overflow directly slow real work
- Status:
  - one desktop calendar scroll trap was fixed
  - more nested-scroll auditing is still needed

### Finding 3: Appointment and invoice finance truth still spans multiple systems

- Severity: P0
- Systems involved:
  - `backend/src/routes/appointments.ts`
  - `backend/src/routes/invoices.ts`
  - `backend/src/lib/appointmentFinance.ts`
  - frontend appointment and invoice pages
- Why it matters:
  - linked invoice payments must reflect on appointments immediately and correctly
  - false balance, false paid, and false deposit states are trust-breaking
- Status:
  - backend finance summary exists
  - full regression matrix still needed

## Next Audit Slices

1. Appointment finance regression matrix
2. Invoice payment reflection back into appointment surfaces
3. New appointment creation defaults, especially finance defaults
4. Calendar and Schedule nested scroll/overflow audit
5. Client and vehicle linking audit for scheduling flows

## Appointment Finance Regression Matrix

### Create / Initial State

#### Scenario A: New appointment, no deposit, no payment

- Entry points:
  - `web/routes/_app.appointments.new.tsx`
  - calendar/shared inspector surfaces
  - `web/routes/_app.appointments.$id.tsx`
- Expected:
  - collected amount = `0`
  - balance due = total
  - not paid in full
  - no deposit collected state
- Current risk:
  - legacy `depositPaid` or fallback UI logic can still manufacture a collected state if a surface ignores backend finance fields

#### Scenario B: New appointment with deposit required, not yet collected

- Expected:
  - deposit due
  - collected amount = `0`
  - balance due = total
  - no paid-in-full state
- Current risk:
  - surfaces that collapse all payment language into deposit language can misstate next action

#### Scenario C: New appointment with deposit collected only

- Expected:
  - collected amount = deposit
  - balance due = total - deposit
  - deposit satisfied = true
  - not paid in full
- Current risk:
  - legacy `depositPaid` paths can disagree with computed finance summary if invoice carryover or reversal occurs later

### Invoice Reflection

#### Scenario D: Appointment -> invoice created, no payment yet

- Expected:
  - appointment still unpaid
  - invoice should not create phantom carryover or fake payment state
- Current risk:
  - invoice creation still interacts with appointment payment carryover logic in `backend/src/routes/invoices.ts`

#### Scenario E: Invoice paid in full

- Expected:
  - appointment collected amount reflects invoice payment
  - balance due becomes `0`
  - paid in full becomes true
- Current risk:
  - any surface still deriving state from `depositPaid` instead of backend summary can lag or disagree

#### Scenario F: Partial invoice payment

- Expected:
  - appointment collected amount reflects partial invoice collection
  - balance due remains positive
  - state should read as payment recorded, not deposit collected unless deposit threshold is actually met
- Current risk:
  - wording and remaining-balance logic can still diverge across pages

### Reversal / Correction

#### Scenario G: Reverse direct appointment payment

- Expected:
  - collected amount decreases correctly
  - deposit satisfied and paid-in-full state recompute correctly
- Current risk:
  - backend still uses some legacy `depositPaid` mutation paths during reversal

#### Scenario H: Reverse invoice payment

- Expected:
  - appointment finance state updates immediately from linked invoice totals
- Current risk:
  - requires verification that appointment refresh surfaces always consume updated backend summary

## Concrete P0 Findings From This Pass

### Finding 4: `depositPaid` still exists as an active state source in backend mutation paths

- Severity: P0
- Files:
  - `backend/src/routes/appointments.ts`
  - `backend/src/routes/invoices.ts`
- Evidence:
  - appointment creation/update still persists `depositPaid`
  - payment/reversal routes still set `depositPaid`
  - Stripe deposit confirmation routes still read/write `depositPaid`
- Why it matters:
  - `depositPaid` is now a legacy compatibility field but still behaves like a live source of truth in several code paths
  - this can reintroduce false finance state even after UI hardening

### Finding 5: Frontend finance state is improved but not yet fully normalized

- Severity: P0
- Files:
  - `web/components/appointments/AppointmentInspectorPanel.tsx`
  - `web/routes/_app.appointments.$id.tsx`
  - `web/components/AppointmentDetailCards.tsx`
  - `web/lib/paymentStates.ts`
- Evidence:
  - backend finance summary is now present
  - several UI layers still keep fallback logic for activity logs, `paidAt`, invoice state, and `depositPaid`
- Why it matters:
  - fallback logic is useful for backward compatibility, but the app is still vulnerable whenever one surface falls back while another trusts backend summary

### Finding 6: Portal and ancillary surfaces likely still use blunt deposit flags

- Severity: P1 trending P0
- Files:
  - `web/routes/portal.$token.tsx`
  - `web/routes/_app.signed-in.tsx`
- Evidence:
  - route inventory and grep show these surfaces still read `depositPaid`
- Why it matters:
  - customer-facing and dashboard-facing finance status can drift from hardened appointment finance logic

## Recommended Next Repair Queue

1. Normalize backend appointment payment state so `depositPaid` becomes compatibility-only, not a live business-rule driver.
2. Audit and patch every remaining frontend surface that still reads `depositPaid` without preferring backend `collectedAmount / balanceDue / paidInFull / depositSatisfied`.
3. Add regression coverage for the eight finance scenarios above.
4. Audit calendar and schedule finance summaries after invoice payment and reversal.
