# Appointment Finance QA Checklist

Use this checklist before considering appointment finance fully hardened for production.

## New appointment defaults

- Create a new client appointment with no deposit and no payment.
- Verify on the appointment page that:
  - `Collected` is `$0.00`
  - `Balance due` matches the appointment total
  - it does not say `Deposit collected`
  - it does not say `Paid in full`
- Verify the same appointment in:
  - Calendar appointment inspector
  - Schedule day inspector
  - Schedule weekly board row

## Deposit-required appointment

- Create a new client appointment with a required deposit.
- Verify before payment that:
  - deposit is due
  - no collected money is shown
  - balance due matches the full appointment total
- Record the deposit.
- Verify on all appointment surfaces that:
  - `Deposit collected` shows
  - `Collected` matches the deposit only
  - `Balance due` matches total minus deposit
  - the appointment is not shown as `Paid in full`
- Reverse the deposit.
- Verify the appointment returns to unpaid state everywhere.

## No-deposit full payment

- Create a no-deposit appointment.
- Mark it paid in full from the appointment page.
- Verify on all appointment surfaces that:
  - it shows `Paid in full`
  - `Collected` matches the full total
  - `Balance due` is zero
  - it does not show `Deposit collected`

## Invoice-linked appointment

- Create an invoice from an unpaid appointment.
- Verify the appointment still shows unpaid before invoice payment.
- Record an invoice payment.
- Verify the linked appointment updates immediately:
  - `Collected` matches invoice payment
  - `Balance due` updates correctly
  - `Paid in full` appears only when the invoice is fully paid
- Reverse the invoice payment.
- Verify the linked appointment returns to the correct unpaid or partial state.

## Stripe deposit flow

- Create a deposit-required appointment.
- Start a Stripe deposit checkout session.
- Complete the Stripe payment.
- Verify after return:
  - the appointment shows the deposit as collected
  - no duplicate deposit is recorded
  - the public appointment page no longer prompts for the same deposit
- Repeat the success URL / refresh flow and verify it stays idempotent.

## Public appointment page

- Open a public appointment page for:
  - no-deposit unpaid appointment
  - deposit-required unpaid appointment
  - deposit-collected appointment
  - paid-in-full appointment
- Verify the messaging is accurate in each case.
- Verify the Stripe CTA only appears when a deposit is actually still due.

## Historical data audit

- Run `npm --prefix backend run audit:appointment-finance`.
- Review any flagged appointments before making live data corrections.
- Confirm there are no no-deposit appointments with legacy `deposit_paid = true`.
- If cleanup is needed, run `npm --prefix backend run repair:appointment-finance` first in dry-run mode and inspect the proposed changes.
- Only use `npx tsx backend/scripts/repair-appointment-finance.ts --apply` after reviewing the dry-run output and confirming the repairs are safe for production data.
