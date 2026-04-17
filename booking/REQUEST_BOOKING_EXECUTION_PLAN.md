# Request Booking Execution Plan

Date: April 16, 2026

Goal:
- let customers request a specific day and time
- let owners clearly review that requested slot
- let owners approve it, propose alternates, or ask for another day
- let customers respond without starting over
- keep the final conversion into a confirmed appointment smooth and modern

This plan assumes:
- no large rewrite of the existing self-book path
- no regression to current appointment, quote, invoice, auth, or portal behavior
- request-only and mixed-mode flows should become reliable without breaking direct self-booking

## Product Direction

### Keep these existing strengths

- Draft autosave and resume already work well enough to keep.
- Mixed mode already exists through business default flow plus per-service overrides.
- Self-book availability and appointment creation already work.
- Public token infrastructure already exists.
- Appointment public change requests already establish a reusable pattern for customer responses after initial scheduling.

### Do not keep doing this

- Do not collapse request-only bookings directly into generic leads and stop there.
- Do not rely on lead notes to carry request timing.
- Do not ask customers to start over after the owner proposes changes.

## Recommended Architecture

### New primary concept

Add a first-class `booking_request` model and keep:
- `booking_drafts` for pre-submit work
- `appointments` for confirmed work

### Model responsibilities

#### `booking_drafts`
- pre-submit form state
- autosave
- resume
- abandonment analytics

#### `booking_requests`
- durable submitted request
- owner review object
- customer response thread
- alternate proposal container
- approval-to-appointment bridge

#### `appointments`
- confirmed scheduled work only

## Phase 1: Data Model And Backend Groundwork

### 1.1 Add a `booking_requests` table

Recommended fields:
- `id`
- `businessId`
- `draftId`
- `clientId`
- `vehicleId`
- `serviceId`
- `locationId`
- `addonServiceIds`
- `serviceMode`
- `status`
- `requestedDate`
- `requestedStartTime`
- `requestedTimezone`
- `timingPreferenceType`
- `flexibilityNotes`
- `customerNotes`
- `source`
- `campaign`
- `ownerMessage`
- `approvedAppointmentId`
- `publicTokenVersion`
- `submittedAt`
- `ownerRespondedAt`
- `customerRespondedAt`
- `approvedAt`
- `declinedAt`
- `expiredAt`
- `createdAt`
- `updatedAt`

### 1.2 Add a `booking_request_proposals` table

Recommended fields:
- `id`
- `bookingRequestId`
- `startTime`
- `endTime`
- `status`
- `sortOrder`
- `createdAt`
- `updatedAt`

Why a separate table:
- owner needs to propose multiple slots cleanly
- customer needs to accept one exact option
- keeping proposals normalized avoids stuffing arrays into one field

### 1.3 Add request status enums

Recommended statuses:
- `submitted`
- `under_review`
- `approved_as_requested`
- `proposed_alternatives`
- `waiting_on_customer`
- `customer_accepted`
- `customer_requested_new_time`
- `declined`
- `expired`
- `converted_to_appointment`

### 1.4 Add request API types and serializers

Need:
- request summary serializer
- request detail serializer
- proposal serializer
- owner-facing and customer-facing views

### 1.5 Keep activity logs as the event trail

Add structured activity actions:
- `booking_request.submitted`
- `booking_request.owner_approved`
- `booking_request.alternatives_proposed`
- `booking_request.customer_accepted`
- `booking_request.customer_requested_new_time`
- `booking_request.declined`
- `booking_request.expired`
- `booking_request.converted`

## Phase 2: Fix Public Request Submission

### 2.1 Add requested date to final submit schema

Current issue:
- `bookingDate` is in draft save but not in final submit schema

Change:
- include `bookingDate` in final public booking submit schema

### 2.2 Add requested time to request-only UI

Current issue:
- request-only customers can choose a day but not a structured time

Recommended UX:
- if service is request-only:
  - show preferred date
  - show preferred time
  - optionally show flexibility selector

Suggested timing preference options:
- exact time
- morning
- afternoon
- any time that day
- next available

### 2.3 Create `booking_request` on request-only submit

Replace current behavior:
- today request-only submit creates only a lead/client and stops

New behavior:
1. validate request payload
2. create or link client
3. create or link vehicle
4. create `booking_request`
5. finalize draft as `submitted_request`
6. write request activity logs
7. send owner/customer notifications
8. return request token URL

### 2.4 Preserve the lead relationship without making it the request object

Recommendation:
- still create the client/lead so CRM continuity stays intact
- but treat `booking_request` as the source of truth for scheduling review

## Phase 3: Owner Review Queue

### 3.1 Add a dedicated request queue

Recommended surface:
- `Appointments -> Requests`

Why:
- this is fundamentally a scheduling review workflow
- owner needs to compare requested timing with availability
- the destination is appointment creation

### 3.2 Request list should show

- customer name
- service summary
- vehicle
- service mode
- location/address
- requested date
- requested time
- flexibility label
- source/campaign
- submission age
- SLA age
- current request status

### 3.3 Request detail should support

- approve requested slot
- propose alternate slots
- ask customer to choose another day
- view existing notes and contact info
- create quote first if needed
- convert manually if phone follow-up happens outside the portal

### 3.4 Approve-as-requested flow

Owner action:
- approve requested slot

System should:
1. validate slot against current availability
2. create appointment
3. link `approvedAppointmentId`
4. mark request `converted_to_appointment`
5. send confirmation to customer
6. issue appointment token + portal URL

### 3.5 Alternate proposal flow

Owner action:
- propose 1-3 alternate slots

System should:
1. validate those slots
2. create `booking_request_proposals`
3. mark request `waiting_on_customer`
4. send customer response link

### 3.6 Ask-customer-to-choose-again flow

Owner action:
- ask for a new day/time

System should:
1. mark request `waiting_on_customer`
2. optionally include owner message
3. send token link back to customer

## Phase 4: Customer Tokenized Request Response Page

### 4.1 Add a new public request token route

Recommended concept:
- separate from current appointment/quote/invoice portal token flow
- dedicated to booking request negotiation

Suggested route pattern:
- `/request/:token`
- or `/booking-request/:token`

### 4.2 Customer request page should show

- submitted service
- add-ons
- vehicle
- address/location
- submitted requested date/time
- flexibility
- owner message
- proposed alternative slots if any
- current status

### 4.3 Customer actions should include

- accept one proposed slot
- say none of these work
- choose another requested day/time
- update notes
- confirm contact details without retyping everything

### 4.4 Never restart from scratch

Important rule:
- once a request is submitted, the customer should never need to rebuild the request from the blank booking page

Implementation principle:
- drafts are for pre-submit
- request token page is for post-submit negotiation

## Phase 5: Notifications

### 5.1 Update customer acknowledgment

For request-only submissions, customer message should include:
- submitted service summary
- requested date/time
- flexibility label
- response expectations
- secure request link for updates

### 5.2 Update owner alert

Owner alert must include:
- customer
- vehicle
- service summary
- requested date
- requested time
- flexibility
- service mode
- address/location
- direct deep link into request review

### 5.3 Add alternate proposal notification

When owner proposes new slots:
- send request-response email/SMS with token link

### 5.4 Add acceptance confirmation

When customer accepts a proposed slot:
- create appointment
- send normal appointment confirmation flow

## Phase 6: Booking Builder And Service Settings

### 6.1 Keep current flow controls

Already good enough:
- business default `request` vs `self_book`
- per-service overrides

### 6.2 Add request-specific settings

Recommended additions:
- allow requested time in request flow
- allow flexibility selector
- owner proposal mode:
  - approve only
  - approve or propose alternates
- default customer response expiration window
- request auto-expire days

### 6.3 Keep self-book behavior separate

Do not pollute self-book services with request-only negotiation states.

## Phase 7: Leads Integration

### 7.1 Keep leads page as secondary context

Current leads page is still useful for:
- marketing/source tracking
- response SLA
- quote-first workflows

But it should not be the primary owner review surface for booking requests.

### 7.2 Link lead and request

Recommended:
- request detail page should link to lead/client
- lead page should show linked booking requests

### 7.3 Show booking request context on leads

At minimum:
- latest request status
- requested slot
- deep link to request review

## Phase 8: Appointment Conversion Rules

### 8.1 Convert only from approved or accepted state

Appointment creation should happen when:
- owner approves requested slot
- customer accepts an owner proposal

### 8.2 Preserve original request history

Even after appointment creation, keep:
- original requested slot
- alternate proposals
- customer responses
- owner decision trail

### 8.3 Link request to appointment

Need:
- `approvedAppointmentId` on `booking_requests`
- request activity log showing conversion

## Phase 9: Verification Plan

### Core scenarios

#### Scenario 1: Request-only exact time
1. customer selects request-only service
2. customer picks date and time
3. customer submits
4. owner sees exact requested slot
5. owner approves as requested
6. appointment is created
7. customer receives confirmation

#### Scenario 2: Request-only with alternate proposal
1. customer selects request-only service
2. customer submits requested date/time
3. owner proposes 3 alternates
4. customer accepts one
5. appointment is created with accepted slot

#### Scenario 3: Customer needs another day
1. owner proposes alternates
2. customer says none work
3. customer picks another day/time
4. owner reviews updated request

#### Scenario 4: Mixed mode
1. one service is self-book
2. one service is request-only
3. both behave correctly using `effectiveFlow`

#### Scenario 5: Draft continuity
1. customer starts booking
2. draft autosaves
3. customer resumes
4. submits request
5. post-submit flow moves to request token page, not draft resume

### Tests to add

- backend request submit schema tests
- request record creation tests
- request proposal tests
- request acceptance conversion tests
- public token authorization tests
- owner queue filtering/status tests
- customer response tests
- mixed-mode regression tests

## Phase 10: Migration And Rollout Notes

### Historical request-only bookings

Important limitation:
- most historical request-only submissions cannot be fully backfilled with requested timing because final request submission did not store it durably

Possible partial backfill:
- if a recent `booking_draft` still exists and can be matched to a lead

But in most cases:
- requested timing history is already lost

### Safe rollout strategy

1. add schema and backend reads/writes
2. add owner queue behind safe navigation
3. add request token flow
4. switch request-only submit path from generic lead-only to request creation
5. keep self-book path unchanged
6. monitor owner usage and notification delivery

## Recommended Milestones

### Milestone 1
- schema
- serializers
- request creation backend
- notification updates

### Milestone 2
- owner request queue
- request detail actions

### Milestone 3
- customer token response page
- approve/propose/respond loop

### Milestone 4
- polish
- dashboard widgets
- lead/request linking
- automation hooks

## What This Improves

- owners can clearly see requested booking date/time
- owners can act without retyping anything
- customers can respond without starting over
- mixed mode becomes coherent
- request-only flow feels like a real modern booking negotiation system instead of a generic lead form

## What This Preserves

- existing self-book flow
- existing draft autosave
- existing service flow overrides
- current appointment confirmation and portal mechanics
- current CRM lead continuity
- current auth, permissions, and multi-tenant boundaries

## What Risks This Avoids

- no rewrite of availability engine
- no rewrite of self-booking
- no overload of lead notes as pseudo-workflow state
- no fake “request approved” status inside appointments before an appointment exists
- no forcing customers to re-enter data after owner follow-up

## Remaining UX Debt Even After This Plan

- the request queue should eventually surface in dashboard summary cards
- SMS parity for request proposal/response should follow email quickly
- customer-side request thread could later support lightweight messaging, but that should not block the core accept/propose workflow

## Recommendation

The best path is:
- keep drafts
- add booking requests
- convert to appointments only when a slot is actually approved

That gives Strata a clean request-booking workflow without destabilizing the rest of the production booking system.
