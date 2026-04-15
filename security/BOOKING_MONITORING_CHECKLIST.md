# Booking Monitoring Checklist

Date: 2026-04-15

Focus window: first 72 hours after booking goes live.

Purpose: monitor the production booking system with the signal that actually exists today.

## Signal Map

### Strong server-side signal

These produce clear backend activity or outcome signal today:

- draft create
  - activity: `booking.draft_created`
- draft update
  - activity: `booking.draft_updated`
- draft abandon
  - activity: `booking.draft_abandoned`
- request-only submit
  - activity: `booking.request_created`
  - draft finalization activity: `booking.draft_submitted`
- direct-book submit
  - activity: `booking.public_booked`
  - draft finalization activity: `booking.draft_confirmed`
- rate-limit events
  - `429` responses
  - `Rate limit exceeded`
  - `Rate limiter failed` if something is unhealthy

### Medium signal

These are monitorable, but mostly through normal request logs plus outcome inspection:

- public config fetch
  - route: `GET /api/businesses/:id/public-booking-config`
  - there is no dedicated booking activity-log event for successful fetch
- availability fetch
  - route: `GET /api/businesses/:id/public-booking-availability`
  - again, mostly visible through request/access logs

### Weaker signal

These are observable today, but not with a dedicated server activity event:

- draft resume after reload
  - route: `GET /api/businesses/:id/public-booking-drafts/:resumeToken`
  - client analytics event exists: `booking_draft_resumed`
  - server route does not currently emit a dedicated activity-log event on successful resume

## High-Signal Routes To Watch

- `GET /api/businesses/:id/public-booking-config`
- `POST /api/businesses/:id/public-booking-drafts`
- `GET /api/businesses/:id/public-booking-drafts/:resumeToken`
- `POST /api/businesses/:id/public-booking-drafts/:resumeToken/abandon`
- `GET /api/businesses/:id/public-booking-availability`
- `POST /api/businesses/:id/public-bookings`

## First 0-6 Hours

- Confirm at least one clean Services -> Booking handoff.
- Confirm at least one `booking.request_created` event.
- Confirm at least one `booking.public_booked` event.
- Confirm at least one `booking.draft_created` and one `booking.draft_updated` event.
- Watch for unexpected `404` or `429` spikes on:
  - `public-booking-config`
  - `public-booking-drafts`
  - `public-bookings`

Healthy signs:
- some draft creation/update traffic
- at least one request-only conversion
- at least one direct-book conversion
- low or zero `Rate limiter failed`

## 6-24 Hours

- Review whether draft creation is happening but submits are not.
- Review whether direct-book failures cluster around availability/deposit services.
- Review whether request-only conversions complete more often than direct-book conversions.
- Review whether `public-booking-config` failures cluster on one business.

Questions to answer:
- Are service CTAs handing off cleanly?
- Are direct-book services converting at all?
- Are draft resumes returning `200` when users refresh?
- Are throttles blocking obvious abuse only, or also real users?

## 24-72 Hours

- Look for repeating failure patterns by one business, one service, or one flow:
  - request-only only
  - self-book only
  - mobile-only services
  - deposit-required services
- Compare draft activity to submitted outcomes:
  - many drafts + no submit events suggests conversion or resume trouble
- Look for unusual `404` on draft resume routes, which can indicate invalid or prematurely finalized resume tokens.

## Exact Things To Check If Something Breaks

### If service context is lost

Check in this order:

1. Services-page CTA query params
   - `service`
   - `category`
   - `source=services-page`
   - optional `step=service`
2. `GET /api/businesses/:id/public-booking-config`
3. selected-service hydration logic in [C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx](C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
4. services handoff logic in [C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx](C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)

### If draft resume fails

Check in this order:

1. local storage still contains the booking draft snapshot
2. `resumeToken` exists in the saved snapshot
3. `GET /api/businesses/:id/public-booking-drafts/:resumeToken` returns `200`
4. the draft is not already finalized as:
   - `submitted_request`
   - `confirmed_booking`
5. whether the route is returning `404` broadly or only for one token/business

### If request-only works but direct-book fails

Check in this order:

1. `GET /api/businesses/:id/public-booking-availability`
2. business booking hours / blackout dates
3. service lead-time / booking-window / buffer / slot-capacity constraints
4. location requirements for in-shop services
5. deposit-required service settings
6. direct-book branch in [C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)

### If public config payload is wrong

Check in this order:

1. builder save/apply on `/services`
2. `GET /api/businesses/:id/public-booking-config`
3. payload builder in [C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
4. regression coverage in [C:/Users/jake/gadget/strata/backend/src/routes/businesses.test.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.test.ts)

### If public booking gets rate-limited incorrectly

Check in this order:

1. whether users are actually sending repeated draft autosaves or submits
2. `429` rate and retry-after headers on:
   - `POST /public-booking-drafts`
   - `POST /public-bookings`
3. shared rate-limit behavior in [C:/Users/jake/gadget/strata/backend/src/middleware/security.ts](C:/Users/jake/gadget/strata/backend/src/middleware/security.ts)
4. regression coverage in [C:/Users/jake/gadget/strata/backend/src/integration/rate-limits.integration.test.ts](C:/Users/jake/gadget/strata/backend/src/integration/rate-limits.integration.test.ts)

## What Healthy Looks Like

- `public-booking-config` mostly returns `200`
- draft create/update activity is present during real sessions
- some draft resumes succeed after refresh/revisit
- request-only and direct-book both produce real completed outcomes
- `429` volume is low and concentrated on obvious retry/abuse patterns
- no recurring `Rate limiter failed`

## Current Observability Gaps

These are not blockers, but they are worth remembering during the first 72 hours:

- no dedicated activity-log event for successful `public-booking-config` fetch
- no dedicated server activity-log event for successful draft resume
- draft resume is best monitored today through:
  - request logs
  - client analytics
  - successful downstream submit behavior
