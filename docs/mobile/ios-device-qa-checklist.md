# Strata first-iPhone QA checklist

## Account and session

- Sign up with email/password
- Sign in with email/password
- Sign in with Google
- Confirm Google auth returns to the app, not only Safari
- Kill the app after sign-in and relaunch
- Confirm session persists after process death
- Background the app for 30 seconds and foreground it
- Confirm the current route and signed-in state restore cleanly
- Sign out and confirm protected routes bounce back safely

## App shell and safe areas

- Verify header spacing under notch / Dynamic Island
- Verify bottom navigation/drawer controls stay above the home indicator
- Verify dialogs and sheets are not clipped by safe areas
- Verify status bar text remains legible on light backgrounds

## Keyboard and forms

- Sign-in and sign-up fields use the right keyboard/autofill behavior
- Booking form fields stay visible when the keyboard opens
- Lead editing fields stay usable on phone
- Appointment editing fields stay usable on phone
- Invoice payment dialogs stay usable on phone

## Route returns and external flows

- Google auth return restores the intended in-app route
- Stripe invoice payment return lands back on the invoice screen
- Stripe appointment deposit return lands back on the appointment screen
- Billing portal return lands back on billing settings or paused recovery
- Invalid or expired return URLs fall back safely

## Core phone workflows

- Booking request submission
- Lead detail and edit
- Create appointment from lead
- Create appointment from booking request
- Calendar month/day use on phone
- Appointment inspector on phone
- Invoice detail on phone
- Record payment on phone
- Notification bell and unread state on phone

## Compliance surfaces

- Open privacy policy inside the app
- Open terms inside the app
- Open support contact from inside the app
- Open `Settings > Account`, confirm `Delete account` is easy to find, then enter Profile and complete the in-app delete-account flow
- Verify the delete warning explains permanent deletion plus any legally retained billing or tax history
- Type `DELETE`, complete deletion, and confirm the app signs out automatically with no web handoff

## Reliability

- Turn network off and confirm the app fails clearly, not silently
- Trigger one known bad request and confirm diagnostics are visible in logs
- Confirm the app recovers after network returns

## Release assets check

- App icon looks correct on device
- Launch screen feels branded and not generic
- App name is consistently `Strata CRM`
