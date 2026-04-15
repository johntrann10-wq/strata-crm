# Strata Booking Requirements

## Goal
Build a next-generation booking page system that lives off the Services page and is customizable per business, while staying truthful to Strata’s existing product.

The booking system should feel cleaner, more premium, and more conversion-focused than typical automotive booking tools, but it must be built on Strata’s real foundations:
- services
- appointments
- CRM
- deposits/payments
- public confirmation pages
- reminders/automations
- lead capture

## Strongest Existing Booking-Related Features
- Service catalog with durations, categories, prices, active state, and add-ons
- Add-on linking between services to create package-style selections
- Appointment creation with client, vehicle, staff, location, notes, deposits, and finance totals
- Server-side overlap and capacity enforcement
- Business timing defaults like appointment buffer and default start time
- Team and location models already tied into appointments
- Public appointment confirmation page with deposit payment and change-request support
- Customer hub that consolidates active appointments, invoices, quotes, and vehicles
- Lead capture form with service interest, vehicle, notes, and follow-up automation
- Appointment confirmation/reminder automations and payment-ready public surfaces

Primary evidence:
- `backend/src/routes/services.ts`
- `backend/src/routes/service-addon-links.ts`
- `backend/src/routes/appointments.ts`
- `backend/src/routes/businesses.ts`
- `backend/src/routes/portal.ts`
- `web/routes/_app.services._index.tsx`
- `web/routes/_app.appointments.new.tsx`
- `web/routes/_public.lead.$businessId.tsx`
- `web/routes/portal.$token.tsx`

## What Should Be Reused from Lead Capture
Lead capture is the right starting point for the “request-only” side of booking.

Reuse directly:
- public business-scoped route pattern
- public config fetch pattern
- premium mobile-first public form shell
- customer capture fields:
  - first name
  - last name
  - email
  - phone
  - vehicle
  - service interest
  - notes
  - marketing opt-in
- source/campaign tracking
- honeypot anti-spam field
- rate-limited public submission endpoint
- auto-response email/SMS hooks
- internal follow-up alerting

What should be evolved from lead capture:
- convert generic “service request” into booking-builder-driven steps
- allow selected services/add-ons to prefill intake automatically
- allow request-only services to fall back into the existing lead path
- preserve low-friction request mode for shops that do not want live self-booking

## What Must Be New

### 1. Booking builder configuration
Need a new per-business booking config layer.

Recommended capabilities:
- enable/disable booking per business
- choose request-only, self-book, or mixed mode
- choose which services are visible on public booking pages
- order services/categories for booking
- mark service as:
  - hidden
  - request-only
  - self-bookable
- optional custom booking title/subtitle for the page
- optional lightweight service-facing description content
- optional deposit messaging

### 2. Public slot-selection engine
Need new backend + frontend support for:
- available slot generation
- staff/location aware slot validation
- business-hours-aware slot windows
- buffer-aware start time logic
- capacity-aware filtering
- final server-side confirmation before create

### 3. Booking intake step model
Need a booking-oriented intake config separate from generic service notes.

Recommended support:
- default customer fields
- default vehicle fields
- optional per-service or per-category intake questions
- internal-use answers stored safely for staff review

### 4. Booking confirmation/create flow
Need a secure public submission path that:
- creates or matches client
- creates or matches vehicle
- creates appointment
- assigns deposit if required
- returns the customer to a public confirmation page

### 5. Mixed-mode fallback
If a service cannot safely self-book, the public flow should degrade into request mode instead of pretending availability exists.

## What Data Models / Routes / Components Already Support This

### Existing models to reuse
- `businesses`
  - timezone
  - operatingHours
  - defaultAppointmentStartTime
  - appointmentBufferMinutes
  - calendarBlockCapacityPerSlot
  - leadCaptureEnabled
  - bookingRequestUrl
- `services`
  - name
  - price
  - durationMinutes
  - category/categoryId
  - notes
  - taxable
  - isAddon
  - active
- `service_addon_links`
- `appointments`
  - clientId
  - vehicleId
  - assignedStaffId
  - locationId
  - startTime/endTime
  - depositAmount
  - publicTokenVersion
  - notes/internalNotes
- `clients`
- `vehicles`
- `staff`
- `locations`

### Existing backend routes to reuse
- `backend/src/routes/services.ts`
- `backend/src/routes/service-addon-links.ts`
- `backend/src/routes/appointments.ts`
- `backend/src/routes/businesses.ts`
- `backend/src/routes/staff.ts`
- `backend/src/routes/locations.ts`
- `backend/src/routes/portal.ts`
- `backend/src/routes/invoices.ts`
- `backend/src/routes/quotes.ts`

### Existing frontend routes/components to reuse
- `web/routes/_app.services._index.tsx`
- `web/routes/_app.calendar.tsx`
- `web/routes/_app.appointments.new.tsx`
- `web/routes/_app.settings.tsx`
- `web/routes/_public.lead.$businessId.tsx`
- `web/routes/portal.$token.tsx`
- `web/components/appointments/SchedulingControls.tsx`
- `web/components/vehicles/VehicleCatalogFields.tsx`

## Recommended Product Behavior

### Mode model
Support three booking modes:
- `request_only`
- `self_book`
- `hybrid`

Recommended meaning:
- `request_only`: every public service ends in a lead/request flow
- `self_book`: services can progress through service -> slot -> intake -> confirmation
- `hybrid`: some services self-book, others route to request-only

### Service display model
Booking should live off the Services page, but not expose every internal service automatically.

Recommended builder concept:
- internal service catalog remains the source of truth
- each service gets booking settings layered on top
- public-facing service groups can reuse categories, but can also be hidden/reordered independently

### Customer flow
Recommended happy path:
1. choose service or package
2. choose add-ons if applicable
3. choose location or service mode if needed
4. choose date/time from available slots
5. enter customer + vehicle details
6. answer intake questions
7. review deposit/confirmation details
8. submit and land on public appointment confirmation

### Request-only fallback path
Recommended request path:
1. choose service
2. enter customer + vehicle + notes
3. submit as request
4. create lead and optionally internal follow-up task/alert

## Recommended Architecture for a Customizable Booking Builder

### High-level architecture
Use the service catalog as the source of truth, then add a booking configuration layer on top.

Recommended layers:

#### Layer 1: Core operational data
Already exists:
- businesses
- services
- service add-ons
- staff
- locations
- appointments
- clients
- vehicles

#### Layer 2: Booking configuration
New additive model, likely per business and per service.

Suggested config areas:
- business-level booking settings
- service-level booking visibility/settings
- booking page content/theme/copy settings
- intake schema/settings

#### Layer 3: Public booking runtime
New public routes:
- booking landing page
- service selection
- slot lookup
- public booking submit
- confirmation page

#### Layer 4: Downstream workflow reuse
Use existing:
- appointment creation
- deposit collection
- appointment confirmation email/SMS
- public appointment HTML
- customer portal

## Safe New Models to Consider

### Option A: Minimal additive config tables
Recommended safest first architecture.

Potential new tables:
- `booking_page_configs`
- `service_booking_settings`
- `booking_intake_field_defs` or JSON config on page config

Why this is safer:
- leaves core services/appointments intact
- avoids rewriting internal scheduling
- lets public booking evolve independently

### Option B: Store config on businesses/services as JSON
Faster, but less scalable and harder to evolve cleanly.

Recommendation:
- avoid this unless speed is more important than long-term builder flexibility

## Booking Constraints to Reuse Immediately
- service duration
- appointment buffer
- time-slot capacity
- overlap detection
- staff collision checks
- location validity
- deposit amount on appointment
- public-token confirmation and change-request mechanics

## Booking Constraints That Must Be Added
- public booking windows and notice rules
- bookable days/hours derived from business rules
- staff/location eligibility per service
- service mode:
  - request-only
  - self-book
- configurable deposit policy per service/package
- intake question configuration

## Screenshot-Worthy Booking States
- services page with booking-enabled services and package/add-on logic
- booking builder settings with public visibility/order controls
- public booking hero/service picker
- public slot selection view
- mobile intake form with customer + vehicle capture
- appointment confirmation page with deposit CTA
- customer hub showing the booked work

## Recommended Implementation Order
1. Booking audit and requirements truth
2. Service-level booking settings
3. Business-level booking page config
4. Public request-only booking page built on lead capture
5. Slot-lookup backend using existing appointment rules
6. Self-book create flow to appointment
7. Confirmation/deposit polish
8. Builder UX and service-page integration

## Biggest Risks to Avoid
- claiming live online booking before slot logic is real
- creating a separate booking data model that drifts from appointments
- bypassing existing overlap/capacity logic
- exposing internal-only services automatically
- overcomplicating version one with dispatch/travel logic
- making request-only shops feel second-class

## Top Booking Differentiators Strata Can Truthfully Claim After Implementation
1. Online booking that lands directly inside the same CRM, calendar, deposit, and portal workflows shops already use.
2. Automotive-specific customer and vehicle intake instead of generic appointment forms.
3. Flexible request-only or self-book modes per business and per service.
4. Package-and-add-on booking powered by the same real service catalog the shop already maintains.
5. Booking confirmations, deposits, reminders, and portal access connected from day one.
