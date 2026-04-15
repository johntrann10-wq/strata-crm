# Booking Post-Launch Hardening

Date: 2026-04-14

## Purpose

This document captures the small, high-value follow-up work for booking after soft launch. The booking system is already a real product, but these items will raise confidence from launch-ready to more battle-tested.

## Priority Follow-Ups

### 1. Live backend-integrated browser smoke

Current state:

- Playwright coverage is strong for the booking UI and mocked contract behavior
- the most important remaining gap is one true browser smoke against a live backend

Add:

- one browser test that runs against a real deployed environment or staging-like environment
- cover:
  - service-page entry into booking
  - one self-book submission
  - one request-only submission
  - one builder setting save and visible public application

Why it matters:

- this validates the full browser-to-backend-to-database path, not just mocked route behavior

### 2. DB-backed end-to-end persistence coverage

Current state:

- booking runtime logic is covered
- browser flows are covered
- persistence confidence is still stronger in pieces than as one integrated booking-specific flow

Add:

- DB-backed test coverage that proves:
  - self-book creates the expected appointment, client, and vehicle records
  - request-only creates the expected request/lead follow-up path
  - booking builder changes persist and survive reload

Why it matters:

- this catches silent persistence regressions that a mocked browser pass can miss

### 3. Exact public payload-field exposure test

Current state:

- public booking routes are shaped correctly by current usage
- there is not yet a dedicated regression that asserts the exact allowed public payload contract and rejects internal-only leakage

Add:

- one integration test for:
  - `GET /api/businesses/:id/public-booking-config`
  - `GET /api/businesses/:id/public-booking-availability`
  - `POST /api/businesses/:id/public-bookings`

Assert:

- only the intended public fields are exposed
- internal settings, secrets, admin-only controls, or staff-only data are not returned

Why it matters:

- this is the cleanest way to lock down public payload safety as booking evolves

## Suggested Order

1. exact public payload-field exposure test
2. DB-backed end-to-end persistence coverage
3. live backend-integrated browser smoke

Reason:

- payload exposure is the fastest, safest regression lock
- persistence coverage catches the most expensive product failures
- live smoke is high value, but usually depends on environment stability and deployment hooks

## Not a Launch Blocker

These items are important, but they should not block the current booking launch if the launch checklist is green:

- richer CI-integrated live browser smoke
- broader persistence matrix across every service-mode combination
- deeper public payload snapshot coverage for every edge state

## Success State

Post-launch booking hardening is in a stronger place when:

- one live browser smoke proves real booking persistence
- one DB-backed booking suite proves end-to-end record creation
- one exact public payload-field test prevents accidental data exposure during future booking changes
