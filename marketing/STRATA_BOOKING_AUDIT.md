# Strata Booking Audit

## Summary
Strata already has a strong booking foundation, but it does **not** have a true public self-booking system yet.

What exists today is a solid operator-side scheduling stack:
- service catalog with categories, durations, and add-ons
- appointments with staff, location, timing, deposits, notes, and conflict protection
- customer and vehicle CRM
- public appointment confirmation, public deposit payment, and public change-request flows
- lead capture for request-style intake
- reminders, confirmations, review requests, and reactivation automations

What does **not** exist yet:
- a public slot-picker
- public availability search
- customer self-book vs request-only toggle at the service level
- booking-specific intake builder tied to services
- service-level booking constraints beyond duration/price/add-on structure
- a business-facing booking page builder/editor

This means the next-generation booking system should be built by reusing Strata’s existing scheduling, CRM, deposits, payments, and public-document primitives, while adding a new public booking layer and booking-builder configuration model.

## Existing Booking-Adjacent Product Areas

### 1. Services and Service Catalog
Strata already has a meaningful service model.

Existing support:
- service name
- price
- duration in minutes
- category and categoryId
- notes
- taxable
- add-on flag
- active/inactive state
- add-on link relationships between base services and add-ons

Evidence:
- `backend/src/db/schema.ts`
- `backend/src/routes/services.ts`
- `backend/src/routes/service-addon-links.ts`
- `web/routes/_app.services._index.tsx`

What this means for booking:
- the booking system can reuse the service catalog as its source of truth
- service durations already support slot calculations
- add-on relationships already support package-style booking selections
- service notes can likely power lightweight internal booking hints, but are not yet a true customer-facing booking description system

### 2. Appointments and Calendar
Appointments are already robust enough to act as the downstream booking record.

Existing support:
- start and end time
- assigned staff
- location
- status and job phase
- client + vehicle linkage
- notes and internal notes
- tax/admin fee/total price
- deposit amount and deposit-paid state
- public token version
- overlap checks
- capacity checks
- calendar blocks

Evidence:
- `backend/src/db/schema.ts`
- `backend/src/routes/appointments.ts`
- `web/routes/_app.calendar.tsx`
- `web/routes/_app.appointments.new.tsx`
- `web/routes/_app.appointments.$id.tsx`

Current scheduling rules already enforced server-side:
- time overlap detection
- per-slot appointment capacity
- per-slot calendar-block capacity
- staff-specific collision checks
- location validation

This is a major strength. A new public booking flow should end in the same appointment model rather than inventing a separate “booking” object unless there is a strong need for a temporary draft or request state.

### 3. Availability and Capacity
Strata has real availability-adjacent controls, but not a public availability engine yet.

Existing support:
- default appointment start time
- appointment buffer minutes
- calendar block capacity per slot
- operatingHours on the business
- location-level timezone
- business timezone

Evidence:
- `backend/src/db/schema.ts`
- `web/routes/_app.settings.tsx`
- `backend/src/routes/appointments.ts`
- `backend/src/routes/locations.ts`

What exists:
- business-level timing defaults
- conflict/capacity enforcement once a slot is chosen

What is missing:
- public-facing availability generation
- staff availability rules
- service-to-staff assignment rules
- service-to-location restrictions
- business-hours-aware public slot search
- mobile/on-site travel window logic for public booking

### 4. Staff / Team Assignment
Team and permissions are already well developed.

Existing support:
- staff roster
- role-based access
- custom permissions
- active/invited/suspended states
- assignment of appointments to staff

Evidence:
- `backend/src/routes/staff.ts`
- `backend/src/db/schema.ts`
- `web/routes/_app.settings.tsx`
- `backend/src/routes/appointments.ts`

What is missing for booking:
- booking-facing rules like “this service can only be booked with these staff”
- public choice of staff vs automatic assignment
- per-staff working hours or availability exceptions

### 5. Business Hours / Locations / Mobile vs In-Shop
Strata already recognizes multiple shop realities, but only partially expresses them for booking.

Existing support:
- business type
- operating hours
- locations with timezone/address/phone
- appointment location assignment
- mobile-address field on appointment creation UI

Evidence:
- `backend/src/db/schema.ts`
- `backend/src/routes/locations.ts`
- `web/routes/_app.settings.tsx`
- `web/routes/_app.appointments.new.tsx`

What is missing for booking:
- public “in-shop vs mobile service” branching
- service-area logic for mobile operators
- location selection in a public booking funnel
- routing or travel constraints

### 6. Quotes / Invoices / Deposits / Payments
Strata already has customer-facing money flows that are very reusable.

Existing support:
- quote creation and public approval
- invoice creation and public payment
- appointment-linked deposit collection
- Stripe Connect payment readiness
- public portal links that consolidate documents and payments

Evidence:
- `backend/src/routes/quotes.ts`
- `backend/src/routes/invoices.ts`
- `backend/src/routes/appointments.ts`
- `backend/src/routes/portal.ts`
- `web/routes/portal.$token.tsx`

Booking relevance:
- deposit capture can be reused immediately for book-now flows
- portal and confirmation pages already provide a polished post-booking destination
- public token system already supports secure customer-facing appointment flows

### 7. Customer / Client + Vehicle Capture
CRM capture is one of Strata’s strongest reusable assets.

Existing support:
- client first/last name
- email
- phone
- notes
- marketing opt-in
- vehicles with year/make/model/VIN/color/license plate
- client-to-vehicle linkage
- appointment/quote/invoice linkage

Evidence:
- `backend/src/db/schema.ts`
- `backend/src/routes/clients.ts`
- `backend/src/routes/vehicles.ts`
- `web/routes/_app.clients.$id.tsx`
- `web/routes/_app.clients.$id.vehicles.$vehicleId.tsx`

Booking relevance:
- public booking should create or match clients and vehicles using the same CRM tables
- vehicle-first flows are very believable for automotive businesses

### 8. Lead Capture / Request Forms
This is the closest current public intake flow to booking.

Existing support:
- public lead form per business
- source/campaign capture
- service interest
- vehicle field
- summary field
- marketing opt-in
- lead auto-response email/SMS
- follow-up alerts to the shop
- rate limiting

Evidence:
- `web/routes/_public.lead.$businessId.tsx`
- `backend/src/routes/businesses.ts`
- `backend/src/lib/leads.ts`

Important product truth:
- this is currently **request-based**, not self-scheduled
- it already captures useful booking-intake data
- it already has a cleaner public UI and should be reused as the low-friction branch of a future booking system

### 9. Customer-Facing Pages
Strata already has strong public destination pages after work is booked or paid.

Existing support:
- public appointment confirmation page
- public appointment deposit payment page
- public appointment change request
- public quote pages with accept/decline/revision
- public invoice page with pay CTA
- customer hub aggregating appointments, quotes, invoices, and vehicles

Evidence:
- `backend/src/routes/appointments.ts`
- `backend/src/routes/quotes.ts`
- `backend/src/routes/invoices.ts`
- `backend/src/routes/portal.ts`
- `web/routes/portal.$token.tsx`

Booking relevance:
- after a customer books, Strata already has a credible confirmation and follow-up surface
- the booking system does not need to invent a new portal from scratch

### 10. Business Settings / Permissions
Settings already contain booking-adjacent controls.

Existing support:
- lead capture enablement
- bookingRequestUrl
- appointment confirmation email toggle
- appointment reminder email toggle
- lapsed-client automation pointing to a booking link
- locations
- team
- timezone and default schedule behavior

Evidence:
- `web/routes/_app.settings.tsx`
- `backend/src/routes/businesses.ts`

What is missing:
- service-by-service booking visibility
- booking funnel copy/design controls
- intake field configuration
- request-only vs book-now mode
- deposit policy rules per service/package
- slot display strategy and availability windows

## What Strata Already Has for Booking-Related Claims

### Truthful claims today
- Service catalog with durations, categories, and add-ons
- Scheduling engine with overlap and capacity protection
- Team/location assignment support
- Customer and vehicle CRM tied into appointments
- Deposit collection through Stripe
- Public appointment confirmation and change requests
- Appointment confirmations and reminders
- Customer portal with appointments, quotes, invoices, and payment access
- Request-style lead capture for shops that want intake before booking

### Claims not yet truthful
- 24/7 online self-booking
- live slot selection
- service-level booking rules exposed to customers
- business-customizable booking pages
- public availability selection by staff/location/service

## Existing Booking Constraints in the Data Model
The current model already supports:
- service duration
- service active/inactive state
- add-on relationships
- appointment start/end times
- staff assignment
- location assignment
- slot capacity
- deposit amount
- public token version for revocation
- operating hours string on business

The current model does **not** clearly support:
- service lead time
- service-specific padding
- service-specific booking window
- min/max notice
- blackout dates
- service-specific deposit rule object
- service-specific intake question schema
- public booking-page sections/content
- automatic staff routing rules
- service-specific location availability

## What Is Safely Reusable
- Service catalog as the booking catalog base
- Add-on links as package/add-on upsell logic
- Appointment model as the final scheduled record
- Existing server-side overlap/capacity protection
- Location and staff entities
- Client and vehicle capture tables
- Public appointment confirmation pages
- Public deposit and invoice payment flows
- Portal/customer-hub architecture
- Lead capture flow for request-only mode
- Existing email/SMS confirmation and reminder plumbing
- Existing public-token security model

## What Is Missing and Should Be Added

### Must be new
- public booking page route(s)
- public availability/slot search endpoint(s)
- business-configurable booking builder model
- booking page sections tied to services
- service visibility and ordering for booking
- service mode: self-book vs request-only
- intake-question schema for booking
- slot-generation logic respecting hours/buffer/capacity/location/staff
- booking confirmation payload/path that creates appointments safely

### Should likely be new but additive
- service-specific deposit policy overrides
- service-specific booking descriptions/images
- staff-selection policy
- location-selection policy
- customer-side reschedule/cancel policy
- booking analytics / conversion events

### Should stay out of scope initially
- complex dispatch/travel routing
- marketplace-style staff calendar optimization
- heavy no-code CMS system
- full two-way calendar sync dependency

## Screenshot-Worthy Booking States After Implementation
- Services page showing bookable services, packages, and add-ons configured by the shop
- Public booking landing page for a business with branded service selection
- Service detail / package selection state with estimated duration and deposit preview
- Slot-selection screen showing clean availability
- Customer + vehicle intake step
- Confirmation screen with deposit/payment CTA
- Booked appointment visible instantly in the calendar/day inspector
- Customer hub showing the new appointment and next action

## Booking Differentiators Strata Could Truthfully Claim After Implementation
1. Service booking that lands directly inside the same scheduling, CRM, and billing workflow shops already run.
2. Vehicle-aware intake built for automotive work, not generic salon-style booking.
3. Request-only and self-book flows living inside one system instead of separate tools.
4. Deposits, confirmations, reminders, and portal access connected from the moment a booking is created.
5. Package and add-on booking powered by the same service catalog shops already manage internally.
6. Calendar-safe booking with real overlap/capacity rules, not a detached form that staff still have to re-enter manually.
