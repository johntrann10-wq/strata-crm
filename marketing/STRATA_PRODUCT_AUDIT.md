# Strata Product Audit (Evidence-Based)

## Product Summary
Strata is a multi-tenant CRM and workflow system for automotive service businesses. It centers the daily flow around scheduling and appointments, then carries that same customer, vehicle, and service context into quotes, invoices, deposits, payments, and follow-ups. It includes a customer-facing portal and public documents, plus configurable email/SMS automations and optional integrations (Stripe, QuickBooks, Google Calendar, Twilio, outbound webhooks).

Evidence highlights: [web/routes/_app.calendar.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.calendar.tsx), [web/routes/_app.appointments.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.appointments.$id.tsx), [web/routes/_app.invoices.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.invoices.$id.tsx), [web/routes/portal.$token.tsx](/C:/Users/jake/gadget/strata/web/routes/portal.$token.tsx), [backend/src/routes/appointments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts), [backend/src/routes/invoices.ts](/C:/Users/jake/gadget/strata/backend/src/routes/invoices.ts), [backend/src/routes/quotes.ts](/C:/Users/jake/gadget/strata/backend/src/routes/quotes.ts), [backend/src/routes/billing.ts](/C:/Users/jake/gadget/strata/backend/src/routes/billing.ts).

## Target Audiences (Supported by Code)
- Automotive service businesses broadly.
- Auto detailers and mobile detailers.
- Tint shops.
- Wrap/PPF shops.
- Owner-operators and small teams managing appointments, quotes, invoices, customers, vehicles, deposits, and payments.

Evidence: business type enum includes auto_detailing, mobile_detailing, wrap_ppf, window_tinting, performance, mechanic, tire_shop, muffler_shop. [backend/src/db/schema.ts](/C:/Users/jake/gadget/strata/backend/src/db/schema.ts)

## Core Workflows (What the App Actually Supports)
- Month/day calendar and schedule management with appointment detail inspection and conflict awareness.
- Create and manage appointments with services, staff assignment, job phases, notes, deposits, and confirmations.
- Quote creation, sending, public acceptance/decline, and revision requests.
- Invoice creation, sending, public view, payment collection, and manual payment logging.
- Stripe payments for deposits and invoice balances using Stripe Connect.
- Client and vehicle CRM with history, notes, and related quotes/invoices/appointments.
- Lead capture (public request form) and lead pipeline tracking.
- Finance overview: revenue, invoices, payments, and expenses.
- Automations for reminders, lapsed clients, review requests, uncontacted leads, abandoned quotes.
- Customer portal with active quotes, invoices, appointments, and payment links.

## Main App Routes and Pages (Frontend Evidence)
- Dashboard: `/signed-in` - [web/routes/_app.signed-in.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.signed-in.tsx)
- Calendar: `/calendar` - [web/routes/_app.calendar.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.calendar.tsx)
- Schedule: `/appointments` and `/appointments/:id` - [web/routes/_app.appointments._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.appointments._index.tsx), [web/routes/_app.appointments.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.appointments.$id.tsx)
- Jobs: `/jobs` and `/jobs/:id` - [web/routes/_app.jobs._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.jobs._index.tsx), [web/routes/_app.jobs.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.jobs.$id.tsx)
- Quotes: `/quotes` and `/quotes/:id` - [web/routes/_app.quotes._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.quotes._index.tsx), [web/routes/_app.quotes.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.quotes.$id.tsx)
- Invoices: `/invoices` and `/invoices/:id` - [web/routes/_app.invoices._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.invoices._index.tsx), [web/routes/_app.invoices.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.invoices.$id.tsx)
- Finances: `/finances` - [web/routes/_app.finances.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.finances.tsx)
- Clients: `/clients` and `/clients/:id` - [web/routes/_app.clients._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.clients._index.tsx), [web/routes/_app.clients.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.clients.$id.tsx)
- Vehicles: `/clients/:id/vehicles` - [web/routes/_app.clients.$id.vehicles.$vehicleId.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.clients.$id.vehicles.$vehicleId.tsx), [web/routes/_app.clients.$id.vehicles.new.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.clients.$id.vehicles.new.tsx)
- Leads: `/leads` - [web/routes/_app.leads.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.leads.tsx)
- Services: `/services` - [web/routes/_app.services._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)
- Settings: `/settings` - [web/routes/_app.settings.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.settings.tsx)
- Billing recovery: `/subscribe` - [web/routes/_app.subscribe.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.subscribe.tsx)
- Onboarding: `/onboarding` - [web/routes/_app.onboarding.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.onboarding.tsx)

## Customer-Facing/Public Pages (Frontend + Backend Evidence)
- Customer hub portal: `/portal/:token` - [web/routes/portal.$token.tsx](/C:/Users/jake/gadget/strata/web/routes/portal.$token.tsx), [backend/src/routes/portal.ts](/C:/Users/jake/gadget/strata/backend/src/routes/portal.ts)
- Public quotes: `/api/quotes/:id/public-html` with accept/decline and revision requests - [backend/src/routes/quotes.ts](/C:/Users/jake/gadget/strata/backend/src/routes/quotes.ts)
- Public invoices: `/api/invoices/:id/public-html` with Stripe pay link support - [backend/src/routes/invoices.ts](/C:/Users/jake/gadget/strata/backend/src/routes/invoices.ts)
- Public appointments: `/api/appointments/:id/public-html` with change request and deposit payment - [backend/src/routes/appointments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts)
- Public lead capture: `/lead/:businessId` - [web/routes/_public.lead.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.lead.$businessId.tsx), [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)

## Feature Inventory by Category (Evidence + Readiness)
Production-ready means fully usable in the current app. Solid but secondary means present and usable but not a hero claim. Partial means present but not a full workflow or is config-dependent. Internal/admin-only means not a marketing claim.

### Scheduling and Jobs
- Month and day calendar views with conflict visibility and time blocks (Production-ready). Evidence: [web/routes/_app.calendar.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.calendar.tsx), [web/components/CalendarViews.tsx](/C:/Users/jake/gadget/strata/web/components/CalendarViews.tsx)
- Appointment creation and detail management (services, staff, notes, statuses, deposits) (Production-ready). Evidence: [web/routes/_app.appointments.new.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.appointments.new.tsx), [web/routes/_app.appointments.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.appointments.$id.tsx), [backend/src/routes/appointments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts)
- Jobs list and job detail derived from appointments (Production-ready). Evidence: [web/routes/_app.jobs._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.jobs._index.tsx), [backend/src/routes/jobs.ts](/C:/Users/jake/gadget/strata/backend/src/routes/jobs.ts)

### CRM (Clients and Vehicles)
- Client records with contact info, notes, activity, related quotes/invoices/appointments (Production-ready). Evidence: [web/routes/_app.clients.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.clients.$id.tsx), [backend/src/routes/clients.ts](/C:/Users/jake/gadget/strata/backend/src/routes/clients.ts)
- Vehicle records linked to clients (Production-ready). Evidence: [web/routes/_app.clients.$id.vehicles.$vehicleId.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.clients.$id.vehicles.$vehicleId.tsx), [backend/src/routes/vehicles.ts](/C:/Users/jake/gadget/strata/backend/src/routes/vehicles.ts)
- Vehicle catalog and VIN lookup (Solid but secondary). Evidence: [web/components/vehicles/VehicleCatalogFields.tsx](/C:/Users/jake/gadget/strata/web/components/vehicles/VehicleCatalogFields.tsx), [backend/src/routes/vehicle-catalog.ts](/C:/Users/jake/gadget/strata/backend/src/routes/vehicle-catalog.ts)

### Quotes and Invoices
- Quote builder, sending, follow-up, and status tracking (Production-ready). Evidence: [web/routes/_app.quotes.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.quotes.$id.tsx), [backend/src/routes/quotes.ts](/C:/Users/jake/gadget/strata/backend/src/routes/quotes.ts)
- Public quote acceptance/decline and revision requests (Production-ready). Evidence: [backend/src/routes/quotes.ts](/C:/Users/jake/gadget/strata/backend/src/routes/quotes.ts), [backend/src/lib/quoteTemplate.ts](/C:/Users/jake/gadget/strata/backend/src/lib/quoteTemplate.ts)
- Invoice builder, sending, payment recording, status tracking (Production-ready). Evidence: [web/routes/_app.invoices.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.invoices.$id.tsx), [backend/src/routes/invoices.ts](/C:/Users/jake/gadget/strata/backend/src/routes/invoices.ts)
- Public invoice views with Stripe pay links (Production-ready). Evidence: [backend/src/routes/invoices.ts](/C:/Users/jake/gadget/strata/backend/src/routes/invoices.ts), [backend/src/lib/invoiceTemplate.ts](/C:/Users/jake/gadget/strata/backend/src/lib/invoiceTemplate.ts)

### Payments and Deposits
- Stripe deposit collection for appointments (Production-ready). Evidence: [backend/src/routes/appointments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts), [backend/src/lib/stripe.ts](/C:/Users/jake/gadget/strata/backend/src/lib/stripe.ts)
- Stripe invoice payment sessions (Production-ready). Evidence: [backend/src/lib/stripe.ts](/C:/Users/jake/gadget/strata/backend/src/lib/stripe.ts), [backend/src/routes/invoices.ts](/C:/Users/jake/gadget/strata/backend/src/routes/invoices.ts)
- Manual payment recording and reversals (Production-ready). Evidence: [web/routes/_app.invoices.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.invoices.$id.tsx), [backend/src/routes/payments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/payments.ts)
- Stripe Connect account setup for payments (Production-ready). Evidence: [backend/src/routes/billing.ts](/C:/Users/jake/gadget/strata/backend/src/routes/billing.ts), [web/routes/_app.settings.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.settings.tsx)

### Finance and Reporting
- Finance dashboard with KPIs, trends, invoice aging, payments, expenses (Production-ready). Evidence: [web/routes/_app.finances.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.finances.tsx), [backend/src/routes/actions.ts](/C:/Users/jake/gadget/strata/backend/src/routes/actions.ts)
- Home dashboard with booking pipeline, action queue, deposit coverage, goals (Production-ready). Evidence: [web/routes/_app.signed-in.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.signed-in.tsx), [backend/src/lib/homeDashboard.ts](/C:/Users/jake/gadget/strata/backend/src/lib/homeDashboard.ts)

### Leads and Pipeline
- Lead capture via public request form (Production-ready). Evidence: [web/routes/_public.lead.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.lead.$businessId.tsx), [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- Lead pipeline and status tracking (Production-ready). Evidence: [web/routes/_app.leads.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.leads.tsx), [backend/src/lib/leads.ts](/C:/Users/jake/gadget/strata/backend/src/lib/leads.ts)
- Booking request URL used in automations (Partial, depends on shop-provided link). Evidence: [web/routes/_app.settings.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.settings.tsx), [backend/src/db/schema.ts](/C:/Users/jake/gadget/strata/backend/src/db/schema.ts)

### Automations and Communication
- Appointment confirmation emails and SMS (Production-ready if configured). Evidence: [backend/src/routes/appointments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts), [backend/src/lib/emailTemplates.ts](/C:/Users/jake/gadget/strata/backend/src/lib/emailTemplates.ts), [backend/src/lib/twilio.ts](/C:/Users/jake/gadget/strata/backend/src/lib/twilio.ts)
- Appointment reminders, review requests, lapsed client outreach, uncontacted lead and abandoned quote follow-ups (Production-ready, configurable). Evidence: [backend/src/lib/automations.ts](/C:/Users/jake/gadget/strata/backend/src/lib/automations.ts), [web/routes/_app.settings.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.settings.tsx)
- Email templates and logging (Production-ready). Evidence: [backend/src/lib/email.ts](/C:/Users/jake/gadget/strata/backend/src/lib/email.ts), [backend/src/db/schema.ts](/C:/Users/jake/gadget/strata/backend/src/db/schema.ts)

### Service Catalog
- Services with categories, durations, add-ons, and taxability (Production-ready). Evidence: [web/routes/_app.services._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx), [backend/src/routes/services.ts](/C:/Users/jake/gadget/strata/backend/src/routes/services.ts), [backend/src/routes/service-categories.ts](/C:/Users/jake/gadget/strata/backend/src/routes/service-categories.ts)

### Team, Roles, and Permissions
- Team management with roles and custom permissions (Production-ready). Evidence: [web/routes/_app.settings.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.settings.tsx), [backend/src/lib/permissions.ts](/C:/Users/jake/gadget/strata/backend/src/lib/permissions.ts), [backend/src/db/schema.ts](/C:/Users/jake/gadget/strata/backend/src/db/schema.ts)
- Membership status handling (Production-ready). Evidence: [backend/src/lib/tenantContext.ts](/C:/Users/jake/gadget/strata/backend/src/lib/tenantContext.ts)

### Billing, Access Control, and Trial
- Stripe subscription with 30-day trial and billing access states (Production-ready). Evidence: [backend/src/routes/billing.ts](/C:/Users/jake/gadget/strata/backend/src/routes/billing.ts), [backend/src/lib/billingLifecycle.ts](/C:/Users/jake/gadget/strata/backend/src/lib/billingLifecycle.ts)
- Stripe webhook sync and billing lifecycle (Production-ready). Evidence: [backend/src/lib/stripeBillingWebhooks.ts](/C:/Users/jake/gadget/strata/backend/src/lib/stripeBillingWebhooks.ts)
- Billing access enforcement (Production-ready). Evidence: [backend/src/middleware/subscription.ts](/C:/Users/jake/gadget/strata/backend/src/middleware/subscription.ts)
- Billing recovery UI and portal actions (Production-ready). Evidence: [web/routes/_app.subscribe.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.subscribe.tsx), [web/routes/_app.settings.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.settings.tsx)

### Integrations
- QuickBooks Online sync (Production-ready when enabled). Evidence: [backend/src/lib/quickbooks.ts](/C:/Users/jake/gadget/strata/backend/src/lib/quickbooks.ts), [backend/src/routes/integrations.ts](/C:/Users/jake/gadget/strata/backend/src/routes/integrations.ts)
- Google Calendar sync (Production-ready when enabled, one-way). Evidence: [backend/src/lib/googleCalendar.ts](/C:/Users/jake/gadget/strata/backend/src/lib/googleCalendar.ts)
- Twilio SMS messaging (Production-ready when enabled). Evidence: [backend/src/lib/twilio.ts](/C:/Users/jake/gadget/strata/backend/src/lib/twilio.ts)
- Outbound webhook events (Production-ready when enabled). Evidence: [backend/src/lib/integrations.ts](/C:/Users/jake/gadget/strata/backend/src/lib/integrations.ts)
- Integration feature flags (Internal/admin). Evidence: [backend/src/lib/integrationFeatureFlags.ts](/C:/Users/jake/gadget/strata/backend/src/lib/integrationFeatureFlags.ts)

### Customer Portal and Public Documents
- Customer hub portal with appointments, invoices, quotes, vehicles, payment links (Production-ready). Evidence: [web/routes/portal.$token.tsx](/C:/Users/jake/gadget/strata/web/routes/portal.$token.tsx), [backend/src/routes/portal.ts](/C:/Users/jake/gadget/strata/backend/src/routes/portal.ts)
- Public appointment, quote, and invoice documents (Production-ready). Evidence: [backend/src/routes/appointments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts), [backend/src/routes/quotes.ts](/C:/Users/jake/gadget/strata/backend/src/routes/quotes.ts), [backend/src/routes/invoices.ts](/C:/Users/jake/gadget/strata/backend/src/routes/invoices.ts)

## Features NOT to Emphasize Yet (Partial or Config-Dependent)
- Full online booking by customers. There is a public lead capture form and a booking request URL placeholder, but no live self-scheduling calendar. Evidence: [web/routes/_public.lead.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.lead.$businessId.tsx), [web/routes/_app.settings.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.settings.tsx)
- Two-way calendar sync. Google Calendar is one-way and feature-flagged. Evidence: [backend/src/lib/googleCalendar.ts](/C:/Users/jake/gadget/strata/backend/src/lib/googleCalendar.ts)
- Fully automated communications without configuration. Email/SMS requires SMTP/Twilio setup and is configurable. Evidence: [backend/src/lib/email.ts](/C:/Users/jake/gadget/strata/backend/src/lib/email.ts), [backend/src/lib/twilio.ts](/C:/Users/jake/gadget/strata/backend/src/lib/twilio.ts)

## Strongest Differentiators (Real, Evidence-Based)
- Calendar clarity: month view and day drill-down with appointment context. Evidence: [web/routes/_app.calendar.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.calendar.tsx)
- Vehicle-centric CRM tied directly to quotes, invoices, and appointments. Evidence: [web/routes/_app.clients.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.clients.$id.tsx)
- Clean quote-to-appointment-to-invoice path with public approval links. Evidence: [backend/src/routes/quotes.ts](/C:/Users/jake/gadget/strata/backend/src/routes/quotes.ts)
- Deposits and payments integrated into appointment flow with Stripe Connect. Evidence: [backend/src/routes/appointments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts), [backend/src/lib/stripe.ts](/C:/Users/jake/gadget/strata/backend/src/lib/stripe.ts)
- Customer hub consolidating active quotes, invoices, appointments, and vehicles. Evidence: [web/routes/portal.$token.tsx](/C:/Users/jake/gadget/strata/web/routes/portal.$token.tsx)

## Strongest Trust Signals (Real, Evidence-Based)
- Stripe billing + Stripe Connect payments (subscriptions and customer payments). Evidence: [backend/src/routes/billing.ts](/C:/Users/jake/gadget/strata/backend/src/routes/billing.ts), [backend/src/lib/stripe.ts](/C:/Users/jake/gadget/strata/backend/src/lib/stripe.ts)
- QuickBooks Online integration (optional). Evidence: [backend/src/lib/quickbooks.ts](/C:/Users/jake/gadget/strata/backend/src/lib/quickbooks.ts)
- Email templates and structured notifications (appointment confirmations, reminders, review requests). Evidence: [backend/src/lib/emailTemplates.ts](/C:/Users/jake/gadget/strata/backend/src/lib/emailTemplates.ts)
- Activity logging and webhook logs for traceability. Evidence: [backend/src/db/schema.ts](/C:/Users/jake/gadget/strata/backend/src/db/schema.ts), [backend/src/lib/integrations.ts](/C:/Users/jake/gadget/strata/backend/src/lib/integrations.ts)

## Strongest Mobile Workflows
- Appointment details, deposit collection, and invoice/quote links on mobile (Production-ready). Evidence: [web/routes/_app.appointments.$id.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.appointments.$id.tsx)
- Mobile customer portal to view quotes/invoices/appointments and pay (Production-ready). Evidence: [web/routes/portal.$token.tsx](/C:/Users/jake/gadget/strata/web/routes/portal.$token.tsx)
- Vehicle capture with VIN lookup and mobile-friendly selects (Solid but secondary). Evidence: [web/components/vehicles/VehicleCatalogFields.tsx](/C:/Users/jake/gadget/strata/web/components/vehicles/VehicleCatalogFields.tsx)

## Strongest Screenshot Candidates
- Calendar (month or day) with multiple real appointments and staff context.
- Appointment details panel with deposit/payment status and service list.
- Invoice detail or composer showing line items, totals, and status.
- Quote detail with status and public action context.
- Client record with vehicles and recent activity.
- Customer portal showing invoices/quotes/appointments and payment CTA.

## Recommended Homepage Messaging Pillars (Based on Real Features)
- Scheduling clarity first: month-to-day calendar built for shop flow.
- Client and vehicle context stays attached across quotes, appointments, and invoices.
- Clean quotes and invoices with public approvals and payment links.
- Deposits and payments tied into the appointment workflow.
- Mobile-ready views for owners and small teams on the move.

## Recommended Proof/Trust Elements
- Stripe payments + Stripe Connect.
- Customer portal and public documents.
- QuickBooks integration (if enabled).
- Email/SMS confirmations and reminders (when configured).
- Activity log and webhook infrastructure for accountability.

## CTA Strategy (Evidence-Consistent)
- Primary CTA: Start free trial (trial is supported in billing flow).
- Trust strip: 30-day free trial, no card required, founder pricing.
- Secondary CTA: View demo or see live product (optional, lower visual weight).

## Messaging Hierarchy Options (Use Only What Is True)
### Headline Options
- "A simpler CRM for automotive service businesses."
- "Run scheduling, CRM, and payments from one clean system."
- "The day-to-day shop workflow, finally in one place."

### Subheadline Options
- "Manage bookings, customers, quotes, invoices, deposits, and payments in a clean, mobile-friendly workspace built for automotive service teams."
- "Keep the calendar, customer records, and billing workflow connected so nothing falls through the cracks."

### Trust Strip Options
- "30-day free trial • No card required • Founder pricing available"
- "Stripe payments • Customer portal • QuickBooks sync (optional)"

### Showcase Section Headlines
- "See the week clearly"
- "Keep every vehicle tied to the work"
- "Send estimates and invoices that close faster"
- "Collect deposits without the chaos"

### Platform Grid Categories (Only Real Features)
- Scheduling
- CRM (Clients and Vehicles)
- Quotes
- Invoices
- Payments and Deposits
- Finance Dashboard
- Customer Portal
- Automations and Reminders

### Pricing/Trial Copy (Evidence-Consistent)
- "30-day free trial. No card required."
- "Founder pricing $29/mo. Public pricing $79/mo."

### Audience Labels
- Automotive service businesses
- Auto detailers
- Mobile detailers
- Tint shops
- Wrap/PPF shops
- Owner-operated shops

## Top Capabilities Ranking (Most Marketable, Real)
1. Calendar and scheduling with month-to-day clarity.
2. Quotes with public approval and revision requests.
3. Invoices with public payment links and Stripe.
4. Client and vehicle CRM tied to appointments.
5. Appointment deposits and payment status tracking.
6. Customer portal for all active work.
7. Finance dashboard with revenue, invoices, and expenses.
8. Service catalog with categories and add-ons.
9. Lead capture and pipeline view.
10. Automations for reminders, review requests, and lapsed clients.

### Top 3 Hero-Worthy Proof Points
- Calendar clarity that makes the month and day view easy to act on.
- Quotes and invoices that are client-ready with public approval and payment links.
- Client and vehicle context carried through the entire workflow.

### Top 6 Showcase-Worthy Features
- Smart scheduling and day drill-down.
- Client and vehicle CRM.
- Quotes with acceptance and follow-up.
- Invoices with payment collection.
- Deposits and payment status on appointments.
- Customer portal for clients.

### Top 8 Platform-Grid Features
- Scheduling
- CRM (Clients and Vehicles)
- Quotes
- Invoices
- Payments and Deposits
- Customer Portal
- Finance Dashboard
- Automations and Reminders

