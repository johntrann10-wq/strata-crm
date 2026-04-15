# Booking Launch Checklist

Date: 2026-04-14

## Purpose

This checklist is for final launch confidence on Strata online booking. It assumes the current booking QA pass is the source of truth and focuses on deploy readiness, smoke verification, and the few remaining blockers that matter before launch.

## Migration Readiness

Required booking migrations:

1. `backend/drizzle/0030_booking_builder.sql`
2. `backend/drizzle/0031_booking_builder_controls.sql`
3. `backend/drizzle/0032_service_booking_advanced_controls.sql`

Verified in repo:

- all three files are present
- all three are ordered correctly after `0029_rate_limits_public_tokens.sql`
- `backend/scripts/init-schema.sql` also includes the same booking columns for fresh environment bootstrap

## Deploy Ordering Requirement

Apply database migrations before, or at the same time as, the backend deploy.

Recommended order:

1. apply DB migrations through `0032_service_booking_advanced_controls.sql`
2. deploy backend
3. deploy frontend
4. run booking smoke tests immediately

Why this matters:

- `0030_booking_builder.sql` is the practical booking baseline
  - it adds the core business and service booking columns the public booking runtime depends on
  - without it, booking may not expose services correctly and the launch should be treated as blocked
- `0031_booking_builder_controls.sql` powers builder content, trust bullets, booking-day controls, blackout dates, slot interval, and business-level intake/display settings
- `0032_service_booking_advanced_controls.sql` powers service-specific mode, day/window overrides, and service slot-capacity controls

## Codepath Audit Notes

### Safe / drift-tolerant areas

`backend/src/routes/services.ts`

- service CRUD and booking-field persistence are heavily column-aware
- most booking fields are only read or written when the column exists
- missing `0031` or `0032` columns mostly degrade advanced controls rather than crashing service routes

`backend/src/routes/businesses.ts`

- business serialization and several booking settings fall back safely
- business-level booking schedule resolution falls back to operating hours, appointment buffer, and calendar capacity when booking-specific overrides are absent
- `ensureBusinessAutomationColumns()` can add many missing business booking columns on the `businesses` table

### Important assumptions / deploy blockers

Public booking runtime in `backend/src/routes/businesses.ts` assumes meaningful booking data exists on both businesses and services:

- `GET /api/businesses/:id/public-booking-config`
- `GET /api/businesses/:id/public-booking-availability`
- `POST /api/businesses/:id/public-bookings`

These routes expect the core `0030` booking columns to exist so they can:

- determine whether booking is enabled
- decide default flow behavior
- decide whether a service is bookable
- carry service deposit, lead-time, and booking-window rules

Practical launch guidance:

- missing `0030` should be treated as a deploy blocker
- missing `0031` or `0032` may not hard-crash immediately, but they can cause builder settings to silently not persist or advanced service behavior to be ignored
- for launch confidence, all three migrations should be applied before exposing the booking page publicly

## Pre-Launch Verification

- Confirm the deploy target database has all three booking migrations applied.
- Confirm fresh environments also include these columns through `backend/scripts/init-schema.sql`.
- Confirm the backend revision includes the booking routes and builder changes.
- Confirm the frontend revision includes:
  - services-page booking entry
  - public booking flow
  - booking builder UI

## Live Smoke Checklist

### Services and builder

- Open the Services page.
- Confirm the page loads without runtime errors.
- Confirm the booking builder section renders.
- Confirm booking controls are visible for a user with `settings.write`.
- Confirm booking controls are hidden or disabled for a user without `settings.write`.

### Builder save/apply

- Enable booking for a test business.
- Change at least one business-level booking setting:
  - title
  - intro text
  - trust bullet
  - booking mode
- Save.
- Refresh.
- Confirm the setting persists.
- Open the public booking page and confirm the new setting is applied.

### Service-page integration

- Open Services.
- Click `Book now` on a self-book service.
- Confirm the public booking flow opens with that service preselected.
- Click `Request service` on a request-only service.
- Confirm the public booking flow opens with the correct service context and request mode.
- If service/category filters are in use, confirm selected context carries through into booking.

### Self-book flow

- Complete one self-book flow end to end.
- Confirm:
  - service stays selected throughout
  - vehicle intake works
  - contact details submit cleanly
  - date/time selection works
  - confirmation state shows the selected service and time

### Request-only flow

- Complete one request-only flow end to end.
- Confirm:
  - service context is preserved
  - request timing works without slot selection when applicable
  - confirmation state explains that follow-up will come from the shop

### Public booking protections

- Submit invalid public booking input and confirm the error is clear.
- Attempt repeated rapid public booking submissions and confirm throttling returns a clean rate-limit response.
- Confirm public booking responses do not expose internal-only business settings or admin data.

## Launch Blockers

Treat launch as blocked if any of the following are true:

- `0030_booking_builder.sql` is not applied in production
- builder settings save, but do not persist after reload
- service CTAs fail to carry service context into booking
- self-book flow cannot create a real booking
- request-only flow cannot create a real request
- builder permissions leak to a user without the correct access
- public booking rate limiting is broken or absent

## Good-to-Go Criteria

Booking is launch-ready when:

- all three migrations are applied
- services page loads
- booking builder loads
- self-book flow works
- request-only flow works
- service context carries through
- builder settings save and apply
- permission-hidden builder behavior works
- public booking throttling works
