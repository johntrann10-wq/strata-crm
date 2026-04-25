# Sign in with Apple for iOS

## Manual setup checklist

1. Apple Developer -> Certificates, IDs & Profiles -> Identifiers -> `app.stratacrm.mobile`
2. Enable the **Sign in with Apple** capability for that App ID.
3. Regenerate the provisioning profile(s) used by the Strata iOS target after enabling the capability.
4. In Xcode, open the `App` target and confirm the entitlements file includes **Sign in with Apple**.
5. If you want the backend to accept additional Apple audiences later, set `APPLE_SIGN_IN_CLIENT_IDS` as a comma-separated list. If you do nothing, the backend accepts `app.stratacrm.mobile`.
6. If customers may choose **Hide My Email**, configure Apple's private email relay for the sender addresses/domains Strata uses (`support@stratacrm.app`, reset emails, notifications, etc.) so account and support mail can still reach relay inboxes.

## What the app now does

- Uses native `AuthenticationServices` on iPhone and iPad.
- Requests only `fullName` and `email` during the first Apple authorization.
- Verifies the Apple identity token on the backend against Apple's signing keys.
- Links Apple auth to an existing account when the verified Apple email matches an existing Strata user.
- Stores the Apple subject plus private-relay metadata for reliable future logins and account deletion support.
- Reuses the normal Strata JWT/cookie session flow after Apple auth succeeds.

## Manual QA checklist

1. On a physical iPhone, open the sign-in screen and confirm **Sign in with Apple** appears alongside Google and email login.
2. On a physical iPad, repeat the same check and confirm the Apple sheet is anchored correctly and not clipped.
3. Test first-time signup with a real Apple ID that shares the real email address.
4. Verify the new account lands in the normal signed-in/onboarding flow and stays signed in after app relaunch.
5. Sign out and sign back in with the same Apple ID. Confirm returning login works even if Apple no longer returns name/email in the credential payload.
6. Test with **Hide My Email** enabled. Confirm the account is created, the profile shows Apple relay enabled, and the session persists normally.
7. Create a pre-existing Strata account with the same email, then use Apple sign-in. Confirm the account is linked instead of creating a duplicate user.
8. Open a team invite flow and choose **Hide My Email** during Apple sign-in. Confirm the invite still attaches the correct team access instead of dropping the user into a disconnected account.
9. Start Apple sign-in and cancel the native sheet. Confirm the app returns to the auth screen without a scary error state.
10. Turn off network access temporarily and confirm the auth screen shows a clear failure state instead of hanging.
11. Verify Google auth and email/password auth still work after the Apple changes.
