# App Review resubmission guide

Use this guide to rebuild the reviewer demo path before each App Review round. The seeded account is intentionally disposable because the in-app delete-account flow is part of the review path.

## Demo account checklist

1. Set a reviewer password for the target environment:
   - `APP_REVIEW_DEMO_PASSWORD='choose-a-review-password'`
2. Optionally override the login email or business name:
   - `APP_REVIEW_DEMO_EMAIL='appreview@stratacrm.app'`
   - `APP_REVIEW_DEMO_BUSINESS_NAME='Northline Auto Studio'`
3. Run the deterministic seed:
   - `npm run seed:app-review-demo`
4. Confirm the seeded workspace contains:
   - 4 customers
   - 4 vehicles
   - 4 appointments
   - 2 quotes
   - 2 invoices
   - 3 notifications
   - 3 native photo assets
5. Use the seeded login in App Review Notes:
   - Email: `APP_REVIEW_DEMO_EMAIL` or `appreview@stratacrm.app`
   - Password: the exact value supplied in `APP_REVIEW_DEMO_PASSWORD`
6. Keep account deletion as the last reviewer step:
   - the flow permanently deletes the seeded account and signs the reviewer out
   - rerun `npm run seed:app-review-demo` before each new review pass or after a deleted account

### Seeded sample path

- `Maya Chen` / `2022 Tesla Model Y`
  - upcoming mobile appointment
  - accepted quote
  - paid historical invoice
- `Daniel Rivera` / `2021 Ford F-150`
  - active in-progress appointment
- `Olivia Brooks` / `2020 BMW X5`
  - completed appointment
  - partial invoice with a recent payment
- `Jordan Kim` / `2023 Subaru Crosstrek`
  - fresh lead
  - sent estimate with follow-up activity

## Review path checklist

1. Log in with the seeded App Review account.
2. Open the dashboard.
   - verify cards, recent activity, revenue, and jobs are populated
   - open the notification bell and confirm lead, calendar, and finance examples are present
3. Open Calendar.
   - open `Maya Chen - Mobile maintenance wash`
4. On appointment detail, use the native actions.
   - `Call customer`
   - `Text customer`
   - `Email customer`
   - `Open in Maps`
   - `Add follow-up reminder`
   - `Share details`
   - one quick action such as `Mark arrived` or `Start job`
   - confirm the photo-intake card shows existing media and upload affordances
5. From the appointment, open the customer or vehicle record.
   - confirm customer tools, vehicle history, invoices, and estimates are populated
6. Open Settings.
   - switch to the `Account` tab
   - use `Open account settings`
7. On Profile, initiate account deletion.
   - pause on the `Delete account` card so review can see it is reachable inside the signed-in app
   - tap `Delete account`
   - pause on the destructive warning screen
   - tap `Continue to confirmation`
   - type `DELETE`
   - tap `Delete account permanently`
   - confirm the success state says no extra website step is required
   - confirm the app signs out and returns to auth with the deletion-success banner

## Account deletion verification path

Use this exact sequence when you or App Review need to validate guideline 5.1.1(v):

1. Sign in with the seeded reviewer account.
2. Open `Settings`.
3. Switch to the `Account` tab.
4. Tap `Delete account` or tap `Open account settings` and use the `Delete account` section on Profile.
5. On the warning screen, verify the UI explains:
   - the deletion is permanent
   - linked Apple / Google / password sign-in stops working
   - only legally required billing, tax, or historical shop records may remain in anonymized form
6. Tap `Continue to confirmation`.
7. Type `DELETE`.
8. Tap `Delete account permanently`.
9. Wait for the in-app success state.
10. Confirm the app signs out automatically and returns to sign-in with the `account deleted successfully` banner.

## Physical-device recording checklist

Use this when Apple asks for a device video of the delete flow:

1. Install the exact review build on a physical iPhone or iPad.
2. Open `Settings > Control Center` on the device and make sure `Screen Recording` is available.
3. Start screen recording from Control Center and wait for the countdown to finish.
4. Launch Strata CRM.
5. Sign in with the seeded App Review account.
6. Open `Settings`.
7. Tap the `Account` tab.
8. Pause briefly on the `Account & deletion` card so it is clear the delete option is easy to find.
9. Tap `Delete account` or `Open account settings`.
10. Pause on the `Delete account` card in Profile.
11. Tap `Delete account`.
12. Pause on the warning screen long enough to capture the permanent-deletion and retained-record copy.
13. Tap `Continue to confirmation`.
14. Type `DELETE`.
15. Tap `Delete account permanently`.
16. Capture the success state and automatic sign-out.
17. Capture the sign-in screen showing the deletion-success banner.
18. Stop recording and attach the clip in App Review notes if Apple requests it.

## Draft App Review Notes

Thank you for reviewing Strata CRM.

You can test the app with this demo account:

- Email: `appreview@stratacrm.app`
- Password: `[replace with the APP_REVIEW_DEMO_PASSWORD used for this review build]`

Suggested review path:

1. Sign in and open the dashboard.
2. Open the notification bell to view seeded lead, appointment, and payment notifications.
3. Go to Calendar and open `Maya Chen - Mobile maintenance wash`.
4. On the appointment screen, test the native actions:
   - call, text, email
   - open the address in Apple Maps
   - add a follow-up reminder
   - share the appointment/customer details from the native share sheet
   - use a quick action such as `Mark arrived` or `Start job`
   - open the photo intake section
5. Open the customer record from the appointment to view the vehicle, estimate, invoice, and additional native contact tools.
6. Go to `Settings > Account`, then open the Profile screen and use the in-app `Delete account` flow.
7. On the delete flow, type `DELETE` and confirm deletion. The app completes deletion inside the app, shows a success state, and signs the user out automatically. No website handoff is required.

The app also supports:

- Sign in with Apple
- Google sign-in
- email/password sign-in and sign-up entirely in app
- in-app privacy, terms, and support links
- in-app account deletion that permanently removes access and linked identities, while retaining only legally required billing or tax history in anonymized form when necessary
