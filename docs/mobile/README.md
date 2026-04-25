# iOS launch handoff docs

Use this folder as the single repo source of truth for Strata's first iOS hybrid-shell launch.

## Start here

1. Read [iOS native integration handoff](./ios-native-integration-handoff.md)
2. Check [iOS go / no-go checklist](./ios-go-no-go-checklist.md)
3. Use [iOS hybrid shell readiness](./ios-hybrid-shell-readiness.md) while generating the shell
4. Run [iOS device QA checklist](./ios-device-qa-checklist.md) on real hardware before TestFlight
5. Use [App Review resubmission guide](./app-review-resubmission.md) when seeding the reviewer account and drafting review notes

## Status rule

- `done`: implemented and directly verifiable in the repo or an already-completed external configuration
- `partial`: scaffolded or documented, but still blocked by native, provider, asset, or device work
- `missing`: not implemented yet

## Launch rule

Do not call Strata `TestFlight-ready` or `App Store-ready` until the go / no-go checklist is satisfied end to end.
