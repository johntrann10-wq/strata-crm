# Strata iOS launch go / no-go checklist

Use this checklist as the strict gate for Strata's first iOS hybrid-shell launch. Do not mark an item `done` unless it is implemented and verifiable.

## Web / app side ready

| Item | Owner | Status | Blocking reason | Acceptance criteria |
| --- | --- | --- | --- | --- |
| Capacitor-style shell config exists | code | done | None on the web side; the repo already has a shell config scaffold | [`capacitor.config.ts`](../../capacitor.config.ts) exists, reads env placeholders, and documents bundled vs remote shell loading |
| Native-shell detection is centralized | code | done | None on the web side | [`mobileShell.ts`](../../web/lib/mobileShell.ts) is the only app-side source of truth for shell detection and app-return routing helpers |
| App-return route exists | code | done | None on the web side | [`app-return.tsx`](../../web/routes/app-return.tsx) exists and can safely render as an auth-return holding screen |
| Google auth return path is app-return aware | code | done | None on the web side | Backend auth redirect logic sends `/app-return` token returns in query params, and auth entry points build an app-return-safe redirect target |
| Route restore after app return is implemented | code | done | None on the web side | [`root.tsx`](../../web/root.tsx) can consume the app-return token and navigate to the sanitized `next` route |
| Stripe and billing web return routes are shell-compatible | code | partial | Existing HTTPS routes are ready, but the shell does not yet reclaim them with universal links | Billing, invoice, and payment returns continue using normal frontend HTTPS routes and are documented for native handoff |
| Safe-area and app-shell viewport behavior exists | code | done | None on the web side | [`root.tsx`](../../web/root.tsx) and [`app.css`](../../web/app.css) provide edge-to-edge meta tags and shell-only safe-area adjustments |
| Remote client diagnostics exist | code | partial | Backend ingestion exists, but no native crash SDK or operational alerting is configured yet | Browser/runtime diagnostics can be sent to `/api/client-diagnostics/report` when enabled |
| Privacy, terms, support, and deletion initiation are visible in-app | code | partial | In-app deletion exists, but the reviewer path and seeded demo account still need a final device pass | Privacy/terms/support are reachable from auth and app-return screens, and signed-in users can fully delete their account inside the app from Settings > Account > Profile |
| Mobile QA checklist exists | code | done | None on the web side | [`ios-device-qa-checklist.md`](./ios-device-qa-checklist.md) exists with iPhone-specific test coverage |

## Native config required

| Item | Owner | Status | Blocking reason | Acceptance criteria |
| --- | --- | --- | --- | --- |
| Final bundle identifier is chosen | ops | missing | The config still uses placeholders; App Store Connect and Xcode cannot be finalized yet | A production bundle id is selected and matches Xcode target settings and App Store Connect |
| Final app display name is chosen | ops | missing | The config still uses placeholders | Final app name is set consistently in env, Xcode, and App Store Connect |
| iOS project is generated | Xcode | missing | No native iOS project exists in the repo yet | `npx cap add ios` has been run and the generated iOS project opens successfully in Xcode |
| Associated Domains are configured | Xcode | missing | Universal links are not configured yet | Xcode has `applinks:<production-domain>` configured and signed correctly |
| Apple App Site Association file is hosted | ops | missing | Universal links cannot verify without hosted association data | `https://<production-domain>/.well-known/apple-app-site-association` serves the correct app association payload |
| URL scheme fallback is registered | Xcode | missing | A custom-scheme fallback is documented but not registered | Xcode `URL Types` contains the chosen app scheme and the scheme is documented for fallback use |
| Production web origin for the shell is finalized | ops | missing | Universal-link and auth-return behavior depend on a stable origin | One production frontend origin is chosen and used consistently in auth, billing, and app link configuration |

## Xcode / manual setup required

| Item | Owner | Status | Blocking reason | Acceptance criteria |
| --- | --- | --- | --- | --- |
| Signing team and provisioning are configured | Xcode | missing | No iOS target exists yet | The app builds and runs on a real device with the intended Apple team |
| Status bar behavior is verified in shell | Xcode | missing | Web meta tags are ready, but native shell behavior is not verified yet | The packaged app shows the intended status bar style without clipping or white flashes |
| Launch screen and splash behavior are configured | Xcode | missing | No launch assets are installed yet | The app has launch artwork configured and no default Capacitor placeholder is visible |
| ATS exceptions for local/dev testing are scoped | Xcode | missing | Dev-shell behavior may need ATS allowances, but none are configured yet | If a dev server is used, ATS exceptions are limited to dev only and removed from production builds |
| Push capability decision is explicit | Xcode | missing | Push is not implemented; capability state is undefined | Push remains disabled for the first release, or capability + entitlements are intentionally configured |

## Assets required

| Item | Owner | Status | Blocking reason | Acceptance criteria |
| --- | --- | --- | --- | --- |
| 1024 App Store icon exists | design | missing | No icon pack is prepared yet | Final 1024x1024 icon asset exists and matches brand guidelines |
| Full iPhone app icon set exists | design | missing | Xcode asset catalog cannot be completed yet | All required iPhone icon sizes are exported and imported into the iOS project |
| Launch / splash artwork exists | design | missing | No branded launch artwork has been prepared yet | Launch assets exist and are wired in Xcode |
| App Store screenshots exist | design | missing | Submission assets are not prepared | Screenshot set exists for required iPhone sizes using current product branding |
| App Store listing copy exists | ops | missing | Submission metadata is not prepared | App name, subtitle, description, keywords, support URL, and privacy URL are finalized |

## Provider / dashboard config required

| Item | Owner | Status | Blocking reason | Acceptance criteria |
| --- | --- | --- | --- | --- |
| Google OAuth allowed origins and redirect targets are reviewed | ops | partial | App-side return flow exists, but provider-side config has not been checked against the final domain/app return path | Google OAuth app settings explicitly allow the production frontend origin and the backend callback flow continues to return to the correct frontend route |
| Stripe billing and payment return routes are validated | ops | partial | The web routes exist, but real native reopen behavior is not configured or tested | Stripe return URLs point to the production frontend HTTPS routes that the app will reclaim via universal links |
| Production app-shell env values are set | ops | missing | Only example values exist in the repo | Final production values exist for app id, app name, app return path, diagnostics toggles, and any shell server URL needs |
| Remote diagnostics destination is monitored | ops | partial | Client diagnostics can reach the backend, but no operator runbook or alert routing is in place | Backend logs for `client-diagnostics` are visible in the production monitoring path and someone owns response |
| Support workflow for deletion requests exists | ops | partial | The UI can initiate deletion requests, but operational handling still needs confirmation | A support owner and response path exist for deletion requests submitted from profile |

## Real-device QA required

| Item | Owner | Status | Blocking reason | Acceptance criteria |
| --- | --- | --- | --- | --- |
| Sign in / sign up on iPhone | QA | missing | Checklist exists, but no native-device run has happened yet | Real iPhone test confirms sign in and sign up work in the packaged shell |
| Background / foreground recovery | QA | missing | Not yet tested in a native shell | The app resumes without losing session or landing on a broken route |
| Relaunch after process death | QA | missing | Not yet tested in a native shell | The app reopens cleanly and restores the expected signed-in or signed-out state |
| Google auth return works on device | QA | missing | Universal links / Safari return have not been tested on a real device | User completes Google auth and lands back inside the app at the intended route |
| Stripe / billing return works on device | QA | missing | Safari return behavior has not been tested on a real device | Billing portal, checkout, or invoice payment flows return to the app correctly |
| Booking flow works on phone in shell | QA | missing | Mobile web is good, but native-shell behavior is not yet verified | Public booking can be completed without viewport, keyboard, or reload issues |
| Calendar works on phone in shell | QA | missing | Native-shell touch and safe-area behavior is unverified | Day/week/month calendar flows work on a real iPhone without clipping or dead tap zones |
| Leads / appointments / invoices work on phone in shell | QA | missing | No native-shell workflow pass has happened yet | Core CRM pages are usable on a real iPhone without layout or persistence regressions |
| Privacy / terms / support / deletion are reachable on device | QA | missing | No device pass has confirmed reviewer-facing compliance surfaces | These routes and actions are visible and usable on a real iPhone build |
| Bad-network behavior is acceptable | QA | missing | Network-interruption behavior has not been tested in shell conditions | The app fails gracefully when offline, slow, or resumed on a weak network |
| Notch / safe-area / keyboard behavior is acceptable | QA | missing | Real iPhone viewport behavior has not been validated | No critical content is hidden under the notch/home indicator and keyboard interactions remain usable |

## TestFlight go / no-go gate

| Gate item | Owner | Status | Blocking reason | Acceptance criteria |
| --- | --- | --- | --- | --- |
| All `missing` items in native config are complete | Xcode | missing | Native shell is not generated or configured yet | Bundle id, iOS project, Associated Domains, and URL scheme fallback are all complete |
| Required assets are complete | design | missing | App icons and screenshots do not exist yet | Icons, splash, and screenshots are imported and ready for upload |
| Provider config is aligned with the production domain | ops | partial | Google and Stripe return paths are not fully validated against final native config yet | Provider dashboards match the chosen production origin and tested return behavior |
| Real-device QA checklist is completed | QA | missing | No full iPhone pass has happened yet | The checklist is executed on at least one notch iPhone and issues are resolved |
| A signed iOS build installs and runs | Xcode | missing | There is no generated iOS build yet | A real archive/build runs on device and is ready for TestFlight upload |

## App Store submission go / no-go gate

| Gate item | Owner | Status | Blocking reason | Acceptance criteria |
| --- | --- | --- | --- | --- |
| TestFlight build has passed real-device QA | QA | missing | No TestFlight build exists yet | The same build or a direct successor has completed the QA checklist |
| App Store metadata is complete | ops | missing | Listing content is not prepared yet | App name, subtitle, description, privacy info, support URL, screenshots, and review notes are ready |
| Privacy / support / deletion review story is complete | ops | partial | The UI exists, but the review narrative, seeded demo account, and device recording still need to be finalized | Review notes explain privacy/support/deletion clearly and reviewers can complete deletion fully in app without a website handoff |
| Submission-only regressions are cleared | QA | missing | No TestFlight soak or submission dry run has happened yet | Final smoke pass after archive upload shows no new blocking issues |
