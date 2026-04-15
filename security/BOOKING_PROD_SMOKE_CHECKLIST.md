# Booking Production Smoke Checklist

Date: 2026-04-15

Purpose: final live validation for Strata booking after deploy. This assumes booking is launch-ready in code and focuses only on production confidence.

## Run Order

Use this order exactly so failures are easier to isolate:

1. Services page loads
2. Services -> Booking handoff
3. Request-only flow
4. Direct-book flow
5. Refresh / resume draft flow
6. Builder save/apply
7. Permission-hidden builder behavior
8. Public throttling sanity check

## 1. Services Page Loads

- Open `/services` as a business user with booking enabled.
- Confirm the page renders without runtime errors.
- Confirm the booking builder renders.
- Confirm at least one service card shows the expected booking CTA:
  - `Book now`
  - `Request service`
  - `Learn more`

Blocker if:
- Services page crashes
- Builder does not render
- All service booking CTAs are missing unexpectedly

## 2. Services -> Booking Handoff

- Click `Book now` on a self-book service.
- Confirm `/book/:businessId` opens with that service already selected.
- Confirm these stay correct on the booking page:
  - service name
  - duration
  - visible price or starting price
  - deposit requirement if applicable
  - booking mode
  - category context if used
- Refresh once on the booking page and confirm the same service context remains.

Check first if service context is lost:
- Query params coming from the Services page:
  - `service`
  - `category`
  - `source=services-page`
  - optional `step=service`
- [C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx](C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)
- [C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx](C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
- `GET /api/businesses/:id/public-booking-config`

## 3. Request-Only Flow

- From Services, click `Request service` on a request-only service.
- Complete the flow without selecting a live timeslot.
- Submit.
- Confirm success state explains that the shop will follow up.
- Confirm a real request/lead is created in the business workflow.

Server route:
- `POST /api/businesses/:id/public-bookings`

Server activity expected:
- `booking.request_created`
- `booking.draft_submitted` if a resumable draft existed

Check first if request-only works incorrectly:
- service effective flow in public booking config
- request-only service override in Services
- request payload path in [C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)

## 4. Direct-Book Flow

- From Services, click `Book now` on a self-book service.
- Complete vehicle, location/timing, contact, and review.
- Submit.
- Confirm success state shows:
  - selected service
  - scheduled date/time
  - confirmation wording
- Confirm a real appointment is created.
- If deposit is required, confirm the returned state includes the deposit amount and the appointment follows the existing confirmation/payment flow.

Server route:
- `POST /api/businesses/:id/public-bookings`

Server activity expected:
- `booking.public_booked`
- `booking.draft_confirmed` if a resumable draft existed

Check first if request-only works but direct-book fails:
- `GET /api/businesses/:id/public-booking-availability`
- slot availability / capacity logic in [C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- deposit-related service settings on the selected service
- business hours / blackout / lead-time constraints

## 5. Refresh / Resume Draft Flow

- Start a booking.
- Select a service.
- Enter at least one meaningful field:
  - phone
  - email
  - vehicle
  - preferred timing
- Wait for `Draft saved`.
- Refresh the page.
- Confirm the booking resumes in the same flow with the same selected service and saved progress.

Routes involved:
- `POST /api/businesses/:id/public-booking-drafts`
- `GET /api/businesses/:id/public-booking-drafts/:resumeToken`
- `POST /api/businesses/:id/public-booking-drafts/:resumeToken/abandon`

Check first if draft resume fails:
- local storage key path in [C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx](C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
- whether `resumeToken` is being created after meaningful intent
- whether `GET /public-booking-drafts/:resumeToken` returns `200`
- whether the draft was already finalized as `submitted_request` or `confirmed_booking`

## 6. Builder Save / Apply

- As a user with `settings.write`, open Services.
- Change one booking builder setting:
  - page title
  - intro copy
  - trust bullet
  - branding token
  - booking mode
- Save.
- Refresh `/services`.
- Confirm the setting persists.
- Open the public booking page and confirm the change applies live.

Check first if public booking config looks wrong:
- `GET /api/businesses/:id/public-booking-config`
- [C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- [C:/Users/jake/gadget/strata/backend/src/routes/businesses.test.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.test.ts)
- builder persistence in [C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx](C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)

## 7. Permission-Hidden Builder Behavior

- Open Services as a user without `settings.write`.
- Confirm booking builder editing controls are hidden or disabled appropriately.
- Confirm no privileged booking settings can be saved.

Check first if permission behavior leaks:
- frontend permission checks in [C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx](C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)
- backend permissions integration coverage in [C:/Users/jake/gadget/strata/backend/src/integration/permissions.integration.test.ts](C:/Users/jake/gadget/strata/backend/src/integration/permissions.integration.test.ts)

## 8. Public Throttling Sanity Check

- Trigger repeated rapid requests against:
  - `POST /api/businesses/:id/public-bookings`
  - `POST /api/businesses/:id/public-booking-drafts`
- Confirm a clean `429` appears instead of a crash or broken JSON response.

Check first if public booking gets rate-limited incorrectly:
- recent `429` volume in app logs
- limiter definitions in [C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- shared limiter behavior in [C:/Users/jake/gadget/strata/backend/src/middleware/security.ts](C:/Users/jake/gadget/strata/backend/src/middleware/security.ts)
- regression coverage in [C:/Users/jake/gadget/strata/backend/src/integration/rate-limits.integration.test.ts](C:/Users/jake/gadget/strata/backend/src/integration/rate-limits.integration.test.ts)

## What Counts As A Launch Blocker

Treat booking as blocked in production if any of these fail:

- Services page cannot launch booking cleanly
- Service context is lost between Services and Booking
- Request-only flow does not create the correct follow-up path
- Direct-book flow does not create a real appointment
- Draft save/resume loses meaningful progress
- Builder changes do not persist or do not apply publicly
- Permission-hidden builder behavior leaks
- Booking throttling crashes or blocks legitimate use immediately
