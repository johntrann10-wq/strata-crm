# Strata Booking Execution Spec

## Purpose
This document turns the current booking audit and redesign plan into a concrete implementation blueprint for Strata.

Source of truth:
- [STRATA_BOOKING_AUDIT.md](C:/Users/jake/gadget/strata/booking/STRATA_BOOKING_AUDIT.md)
- [STRATA_BOOKING_REDESIGN_PLAN.md](C:/Users/jake/gadget/strata/booking/STRATA_BOOKING_REDESIGN_PLAN.md)

Constraints:
- preserve existing booking logic where it is already strong
- preserve `appointments` as the booked-work source of truth
- preserve request-only flows for businesses that do not want live booking
- add draft autosave safely without turning booking into a parallel system
- keep changes incremental and reviewable

## 1. Exact Component Tree For Customer Flow

Primary route:
- [web/routes/_public.book.$businessId.tsx](C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)

Recommended split:

```text
PublicBookingRoute
  BookingPageShell
    BookingHero
      BookingHeroBrand
      BookingHeroTrustBar
      BookingHeroStatusPill
    BookingProgressRail
    BookingMainGrid
      BookingStepPane
        BookingStepCard
          BookingStepHeader
          BookingDraftSaveIndicator
          BookingStepBody
            ServiceSelectionStep
              ServiceCategoryChips
              FeaturedServiceCarousel
              ServiceGrid
                ServiceTile
                  ServiceTileHeader
                  ServiceTileStats
                  ServiceTileActions
                  ServiceTileDetailsDrawer
            VehicleDetailsStep
              VehicleQuickFields
              VehicleContextHint
            ServiceModeStep
              ServiceModeCards
              LocationPicker
              MobileAddressFields
            TimingStep
              TimingModeSelector
              AvailabilityDateRail
              AvailabilitySlotGrid
              RequestTimingSelector
              AvailabilityFeedback
            ContactStep
              ContactFields
              ContactTrustHint
            AddonsAndNotesStep
              RecommendedAddons
              CustomQuestionGroup
              NotesField
            ReviewStep
              ReviewSummaryBlocks
              DepositSummary
              NextStepExplanation
          BookingStepFooter
            BackButton
            PrimaryActionButton
      BookingSummaryRail
        SelectedServiceSummary
        BookingMiniTimeline
        BookingPricingSummary
        BookingNextStepCard
        ResumeLaterCard
    BookingResultState
      BookingSuccessCard
      BookingResultActions
```

## 2. Exact Component Tree For Builder

Primary route:
- [web/routes/_app.services._index.tsx](C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)

Recommended split:

```text
BookingBuilderSurface
  BookingBuilderHero
    BookingBuilderStatus
    BookingBuilderPublicLinkActions
    BookingBuilderHealthPills
  BookingBuilderWorkspace
    BookingBuilderLeftPane
      BookingBuilderNav
        FlowTab
        ServicesTab
        AvailabilityTab
        PaymentsTab
        BrandingTab
        DraftRecoveryTab
        AdvancedRulesTab
      BookingBuilderSectionHost
        FlowSection
          FlowModeCards
          StepVisibilityControls
          RequestVsSelfBookExplainer
        ServicesSection
          PublicServiceOrderBoard
          FeaturedServicesEditor
          ServiceOverrideList
        AvailabilitySection
          BusinessScheduleControls
          BlackoutDateEditor
          SlotCadenceControls
          MobileServiceControls
        PaymentsSection
          DepositBehaviorControls
          ConfirmationDeliveryControls
        BrandingSection
          BookingBrandTokensForm
          HeroContentEditor
          TrustContentEditor
          ConfirmationContentEditor
        DraftRecoverySection
          AutosaveControls
          ResumeMessagingControls
          AbandonmentFollowUpControls
        AdvancedRulesSection
          CustomQuestionsEditor
          ServiceAreaRulesEditor
          VehicleAwareUpsellRules
    BookingBuilderRightPane
      BookingPreviewShell
        PreviewViewportTabs
        PreviewDeviceFrame
          BookingPreviewRenderer
            PreviewLandingState
            PreviewStepState
            PreviewSuccessState
        PreviewStateControls
          PreviewStepSelector
          PreviewServiceSelector
          PreviewFlowModeSelector
```

Service-level editor split:

```text
ServiceBookingOverridesPanel
  ServiceBookingOverviewCard
  ServiceBookingBehaviorCard
  ServiceBookingAvailabilityCard
  ServiceBookingPricingDisplayCard
  ServiceBookingMediaCard
  ServiceBookingUpsellCard
  ServiceBookingQuestionsCard
```

## 3. Exact Data Model Additions

### New table: `booking_drafts`
Purpose:
- autosave public booking progress
- support resume later
- support abandonment analytics

Fields:
- `id uuid primary key`
- `business_id uuid not null`
- `service_id uuid null`
- `flow_mode text not null`
- `status text not null default 'active'`
- `resume_token text not null unique`
- `source text null`
- `campaign text null`
- `email text null`
- `phone text null`
- `vehicle_summary text null`
- `last_completed_step text null`
- `current_step text null`
- `payload_json jsonb not null default '{}'`
- `last_validation_error text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `last_active_at timestamptz not null default now()`
- `submitted_at timestamptz null`
- `expires_at timestamptz null`

Indexes:
- `(business_id, status)`
- `(resume_token)`
- `(last_active_at)`
- partial index for active drafts by business

### New table: `booking_events`
Purpose:
- booking funnel analytics

Fields:
- `id uuid primary key`
- `business_id uuid not null`
- `booking_draft_id uuid null`
- `service_id uuid null`
- `event_name text not null`
- `step_key text null`
- `metadata_json jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

Indexes:
- `(business_id, event_name, created_at desc)`
- `(booking_draft_id, created_at asc)`

### New table: `booking_page_configs`
Purpose:
- move beyond scattered business-level booking columns without breaking current business settings

Fields:
- `business_id uuid primary key`
- `branding_json jsonb not null default '{}'`
- `flow_sections_json jsonb not null default '{}'`
- `draft_recovery_json jsonb not null default '{}'`
- `confirmation_json jsonb not null default '{}'`
- `analytics_config_json jsonb not null default '{}'`
- `updated_at timestamptz not null default now()`

### New table: `service_booking_overrides`
Purpose:
- hold service-specific public-booking behavior that is too rich for the main `services` table

Fields:
- `service_id uuid primary key`
- `public_description text null`
- `hero_copy text null`
- `media_json jsonb not null default '{}'`
- `question_schema_json jsonb not null default '[]'`
- `upsell_config_json jsonb not null default '{}'`
- `display_config_json jsonb not null default '{}'`
- `rule_config_json jsonb not null default '{}'`
- `updated_at timestamptz not null default now()`

### Optional later table: `booking_requests`
Purpose:
- replace overloading request-mode data into `clients.notes`

Fields:
- `id uuid primary key`
- `business_id uuid not null`
- `booking_draft_id uuid null`
- `client_id uuid null`
- `vehicle_id uuid null`
- `service_id uuid not null`
- `status text not null default 'new'`
- `payload_json jsonb not null default '{}'`
- `source text null`
- `campaign text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## 4. Exact Route / API Changes

### Existing routes to extend
- [backend/src/routes/businesses.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- [backend/src/routes/services.ts](C:/Users/jake/gadget/strata/backend/src/routes/services.ts)
- [backend/src/routes/appointments.ts](C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts)

### New public booking APIs

#### `POST /api/businesses/:id/public-booking-drafts`
Use:
- create draft after service selection or first meaningful field completion

Request body:
- `serviceId`
- `source`
- `campaign`
- `currentStep`
- `payload`

Response:
- `draftId`
- `resumeToken`
- `status`
- `savedAt`

#### `PATCH /api/public-booking-drafts/:resumeToken`
Use:
- autosave incremental progress

Request body:
- `currentStep`
- `lastCompletedStep`
- `payload`
- `email`
- `phone`
- `vehicleSummary`

Response:
- `ok`
- `savedAt`
- `draftStatus`

#### `GET /api/public-booking-drafts/:resumeToken`
Use:
- restore draft into the booking flow

Response:
- `businessId`
- `serviceId`
- `flowMode`
- `currentStep`
- `lastCompletedStep`
- `payload`
- `resumeState`

#### `POST /api/public-booking-drafts/:resumeToken/abandon`
Use:
- explicit abandonment event when needed

### Existing public booking APIs to extend

#### `GET /api/businesses/:id/public-booking-config`
Add:
- `branding`
- `flowSections`
- `draftRecovery`
- `serviceDisplay`
- `customQuestionsSummary`

#### `GET /api/businesses/:id/public-booking-availability`
Keep current contract, but prepare for:
- `timingMode=request_preference`
- richer unavailable-reason payloads
- optional earliest-slot hints

#### `POST /api/businesses/:id/public-bookings`
Add:
- optional `draftId`
- optional `resumeToken`
- optional `requestTimingPreference`
- optional `questionAnswers`

### Admin / builder APIs

#### `GET /api/businesses/:id/booking-builder-config`
Returns:
- current builder config
- branding tokens
- section order
- draft recovery config
- preview defaults

#### `PATCH /api/businesses/:id/booking-builder-config`
Updates:
- flow config
- branding config
- draft recovery config
- confirmation config

#### `PATCH /api/services/:id/booking-display`
Updates:
- public description
- hero copy
- media config
- display config

#### `PATCH /api/services/:id/booking-rules`
Updates:
- public booking rules
- timing rules
- mobile/on-site rules
- add-on recommendation rules

#### `GET /api/businesses/:id/booking-preview`
Optional but recommended:
- server-shaped preview payload for consistent builder rendering

## 5. Exact Event Analytics

### Customer funnel events
- `booking_page_viewed`
- `booking_service_selected`
- `booking_service_details_opened`
- `booking_vehicle_started`
- `booking_vehicle_completed`
- `booking_mode_selected`
- `booking_location_selected`
- `booking_address_completed`
- `booking_timing_viewed`
- `booking_date_selected`
- `booking_slot_selected`
- `booking_timing_preference_selected`
- `booking_contact_started`
- `booking_contact_completed`
- `booking_addon_selected`
- `booking_addon_removed`
- `booking_notes_started`
- `booking_review_viewed`
- `booking_submit_attempted`
- `booking_submitted`
- `booking_success_viewed`
- `booking_resume_link_opened`
- `booking_abandoned`
- `booking_resumed`

### Builder events
- `booking_builder_viewed`
- `booking_builder_section_selected`
- `booking_builder_preview_opened`
- `booking_builder_preview_state_changed`
- `booking_builder_saved`
- `booking_builder_service_override_opened`
- `booking_builder_service_override_saved`

### Minimal event payload fields
- `businessId`
- `draftId`
- `serviceId`
- `flowMode`
- `stepKey`
- `source`
- `campaign`
- `serviceMode`
- `deviceType`
- `timestamp`

## 6. Exact State Machine For Draft Leads

### Draft states
- `idle`
- `creating`
- `active_unsynced`
- `active_synced`
- `restoring`
- `submitted_request`
- `submitted_booking`
- `abandoned`
- `expired`
- `errored`

### State transitions

```text
idle -> creating
creating -> active_synced
creating -> errored
active_synced -> active_unsynced
active_unsynced -> active_synced
active_synced -> restoring
restoring -> active_synced
active_synced -> submitted_request
active_synced -> submitted_booking
active_synced -> abandoned
abandoned -> active_synced
active_synced -> expired
active_unsynced -> errored
errored -> active_unsynced
```

### Draft behavior rules
- create a draft as soon as a service is chosen or a deep-linked service is confirmed
- save after each meaningful step transition
- debounce field-level autosave for active steps
- if network save fails:
  - keep local memory state
  - show subtle save warning
  - retry in background
- if a submitted booking/request is accepted:
  - mark draft submitted
  - prevent duplicate reuse

### Draft storage layers
- in-memory React state for immediate UI
- server draft record for resume/recovery
- optional short-lived localStorage pointer for same-device recovery only

## 7. Exact Theme / Branding Token Model

### Business-level token object
Stored in `booking_page_configs.branding_json`

```ts
type BookingBrandingTokens = {
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  accentColor?: string | null;
  accentColorMuted?: string | null;
  buttonTone?: "dark" | "accent" | "light";
  surfaceTone?: "clean" | "warm" | "editorial";
  textTone?: "default" | "contrast";
  radiusScale?: "soft" | "medium" | "bold";
  badgeStyle?: "filled" | "outline";
  density?: "compact" | "balanced";
  showPoweredBy?: boolean;
};
```

### Guardrails
- colors must be normalized into accessible ranges
- hero media must degrade gracefully on mobile
- token usage cannot break existing form contrast or focus states
- if no branding tokens exist, default to Strata-safe premium defaults

## 8. Exact Per-Service Booking Rule Model

### Base rules remain on `services`
Keep current fields:
- `bookingEnabled`
- `bookingFlowType`
- `bookingDescription`
- `bookingDepositAmount`
- `bookingLeadTimeHours`
- `bookingWindowDays`
- `bookingServiceMode`
- `bookingAvailableDays`
- `bookingAvailableStartTime`
- `bookingAvailableEndTime`
- `bookingCapacityPerSlot`
- `bookingFeatured`
- `bookingHidePrice`
- `bookingHideDuration`

### Extended per-service rule config
Stored in `service_booking_overrides.rule_config_json`

```ts
type ServiceBookingRuleConfig = {
  requestOnlyReason?: string | null;
  requestTimingStyle?: "none" | "specific_date" | "flexible_windows";
  mobileRules?: {
    addressRequired: boolean;
    serviceAreaType: "none" | "radius" | "zip_list";
    radiusMiles?: number | null;
    zipAllowlist?: string[] | null;
    mobileLeadTimeHours?: number | null;
    mobileBufferMinutes?: number | null;
  };
  addonRules?: {
    showMode: "always" | "vehicle_aware" | "service_aware";
    recommendationRank?: number;
  };
  questionRules?: {
    questionSchemaEnabled: boolean;
  };
};
```

### Display config
Stored in `service_booking_overrides.display_config_json`

```ts
type ServiceBookingDisplayConfig = {
  ctaStyle?: "book" | "request";
  heroEmphasis?: "normal" | "featured";
  showDepositBadge?: boolean;
  showServiceModeBadge?: boolean;
  summaryTone?: "default" | "premium";
};
```

## 9. Exact Desktop Layout Blueprint

### Customer booking page
- max-width centered shell
- top hero with selected service or storefront hero
- compact horizontal progress rail
- two-column main grid:
  - left: active step
  - right: sticky summary rail
- sticky footer CTA on smaller desktop heights if needed

Recommended proportions:
- page shell: `max-w-7xl`
- main grid: `minmax(0, 1.2fr) 360px`

### Builder
- main grid: `minmax(0, 1.15fr) 360px`
- left pane scrolls section content
- right pane keeps sticky preview
- top hero remains above both panes

## 10. Exact Mobile Layout Blueprint

### Customer booking page
- single column
- compact hero
- collapsed trust rail
- step header directly above current step content
- summary condensed into a collapsible top module
- sticky bottom action bar with:
  - back
  - primary CTA
- autosave indicator near step header, not as a toast

### Builder
- single column
- tabs scroll horizontally
- preview behind `Show preview` / `Hide preview`
- service overrides open in sheet-style panels or stacked cards
- save action stays visible after meaningful changes

## 11. Exact List Of Files To Create / Modify

### New backend files
- [backend/drizzle/0033_booking_drafts.sql](C:/Users/jake/gadget/strata/backend/drizzle/0033_booking_drafts.sql)
- [backend/drizzle/0034_booking_page_configs.sql](C:/Users/jake/gadget/strata/backend/drizzle/0034_booking_page_configs.sql)
- [backend/drizzle/0035_service_booking_overrides.sql](C:/Users/jake/gadget/strata/backend/drizzle/0035_service_booking_overrides.sql)
- [backend/drizzle/0036_booking_events.sql](C:/Users/jake/gadget/strata/backend/drizzle/0036_booking_events.sql)
- [backend/src/lib/bookingDrafts.ts](C:/Users/jake/gadget/strata/backend/src/lib/bookingDrafts.ts)
- [backend/src/lib/bookingEvents.ts](C:/Users/jake/gadget/strata/backend/src/lib/bookingEvents.ts)
- [backend/src/lib/bookingBranding.ts](C:/Users/jake/gadget/strata/backend/src/lib/bookingBranding.ts)

### Modified backend files
- [backend/src/db/schema.ts](C:/Users/jake/gadget/strata/backend/src/db/schema.ts)
- [backend/scripts/init-schema.sql](C:/Users/jake/gadget/strata/backend/scripts/init-schema.sql)
- [backend/src/routes/businesses.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- [backend/src/routes/services.ts](C:/Users/jake/gadget/strata/backend/src/routes/services.ts)
- [backend/src/lib/booking.ts](C:/Users/jake/gadget/strata/backend/src/lib/booking.ts)

### New backend tests
- [backend/src/lib/bookingDrafts.test.ts](C:/Users/jake/gadget/strata/backend/src/lib/bookingDrafts.test.ts)
- [backend/src/lib/bookingEvents.test.ts](C:/Users/jake/gadget/strata/backend/src/lib/bookingEvents.test.ts)
- [backend/src/integration/public-booking-drafts.integration.test.ts](C:/Users/jake/gadget/strata/backend/src/integration/public-booking-drafts.integration.test.ts)
- [backend/src/integration/public-booking-config.integration.test.ts](C:/Users/jake/gadget/strata/backend/src/integration/public-booking-config.integration.test.ts)

### New frontend files
- [web/components/booking/BookingPageShell.tsx](C:/Users/jake/gadget/strata/web/components/booking/BookingPageShell.tsx)
- [web/components/booking/BookingHero.tsx](C:/Users/jake/gadget/strata/web/components/booking/BookingHero.tsx)
- [web/components/booking/BookingProgressRail.tsx](C:/Users/jake/gadget/strata/web/components/booking/BookingProgressRail.tsx)
- [web/components/booking/BookingSummaryRail.tsx](C:/Users/jake/gadget/strata/web/components/booking/BookingSummaryRail.tsx)
- [web/components/booking/BookingDraftStatus.tsx](C:/Users/jake/gadget/strata/web/components/booking/BookingDraftStatus.tsx)
- [web/components/booking/steps/ServiceSelectionStep.tsx](C:/Users/jake/gadget/strata/web/components/booking/steps/ServiceSelectionStep.tsx)
- [web/components/booking/steps/VehicleDetailsStep.tsx](C:/Users/jake/gadget/strata/web/components/booking/steps/VehicleDetailsStep.tsx)
- [web/components/booking/steps/ServiceModeStep.tsx](C:/Users/jake/gadget/strata/web/components/booking/steps/ServiceModeStep.tsx)
- [web/components/booking/steps/TimingStep.tsx](C:/Users/jake/gadget/strata/web/components/booking/steps/TimingStep.tsx)
- [web/components/booking/steps/ContactStep.tsx](C:/Users/jake/gadget/strata/web/components/booking/steps/ContactStep.tsx)
- [web/components/booking/steps/AddonsAndNotesStep.tsx](C:/Users/jake/gadget/strata/web/components/booking/steps/AddonsAndNotesStep.tsx)
- [web/components/booking/steps/ReviewStep.tsx](C:/Users/jake/gadget/strata/web/components/booking/steps/ReviewStep.tsx)
- [web/components/booking/BookingSuccessState.tsx](C:/Users/jake/gadget/strata/web/components/booking/BookingSuccessState.tsx)
- [web/components/booking/useBookingDraft.ts](C:/Users/jake/gadget/strata/web/components/booking/useBookingDraft.ts)
- [web/components/booking/useBookingAnalytics.ts](C:/Users/jake/gadget/strata/web/components/booking/useBookingAnalytics.ts)
- [web/components/booking-builder/BookingBuilderShell.tsx](C:/Users/jake/gadget/strata/web/components/booking-builder/BookingBuilderShell.tsx)
- [web/components/booking-builder/BookingBuilderNav.tsx](C:/Users/jake/gadget/strata/web/components/booking-builder/BookingBuilderNav.tsx)
- [web/components/booking-builder/BookingPreviewShell.tsx](C:/Users/jake/gadget/strata/web/components/booking-builder/BookingPreviewShell.tsx)
- [web/components/booking-builder/BookingPreviewRenderer.tsx](C:/Users/jake/gadget/strata/web/components/booking-builder/BookingPreviewRenderer.tsx)

### Modified frontend files
- [web/routes/_public.book.$businessId.tsx](C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
- [web/routes/_app.services._index.tsx](C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)
- [web/routes/_public.lead.$businessId.tsx](C:/Users/jake/gadget/strata/web/routes/_public.lead.$businessId.tsx)

### New e2e tests
- [e2e/public-booking-draft-autosave.spec.ts](C:/Users/jake/gadget/strata/e2e/public-booking-draft-autosave.spec.ts)
- [e2e/public-booking-conversion-layout.spec.ts](C:/Users/jake/gadget/strata/e2e/public-booking-conversion-layout.spec.ts)
- [e2e/booking-builder-flow-editor.spec.ts](C:/Users/jake/gadget/strata/e2e/booking-builder-flow-editor.spec.ts)

### Modified existing tests
- [e2e/public-booking.spec.ts](C:/Users/jake/gadget/strata/e2e/public-booking.spec.ts)
- [e2e/booking-builder.spec.ts](C:/Users/jake/gadget/strata/e2e/booking-builder.spec.ts)
- [backend/src/lib/booking.test.ts](C:/Users/jake/gadget/strata/backend/src/lib/booking.test.ts)

## 12. Exact Recommended Implementation Order

### Phase 1: Data foundations
1. Add `booking_drafts`
2. Add `booking_page_configs`
3. Add `service_booking_overrides`
4. Add `booking_events`
5. Update schema and init schema

### Phase 2: Backend booking-draft and config APIs
1. Implement booking draft lib
2. Implement booking events lib
3. Add draft create/update/get endpoints
4. Extend booking config payload
5. Extend booking submit to accept draft linkage

### Phase 3: Public booking UX rebuild
1. Extract current booking page into composable components
2. Implement new page shell and progress architecture
3. Implement service storefront step
4. Implement premium timing step
5. Implement draft autosave hook
6. Implement success state and resume messaging

### Phase 4: Builder rebuild
1. Extract builder shell
2. Implement new nav and section IA
3. Implement preview shell and preview state controls
4. Move service-specific overrides into clearer sub-panels
5. Wire new branding/draft-recovery controls

### Phase 5: Services-page integration upgrade
1. Improve service public-entry cards
2. Preserve service context into booking
3. Surface featured and request-only posture more clearly

### Phase 6: Analytics and hardening
1. Emit booking funnel events
2. Add builder analytics
3. Add e2e draft tests
4. Add integration tests for draft APIs and public payload safety
5. Run full booking regression pass

### Recommended milestone cut

#### Milestone A
- public booking redesign
- no drafts yet
- builder shell redesign

#### Milestone B
- draft autosave and resume
- analytics events
- abandonment groundwork

#### Milestone C
- full branding tokens
- custom questions
- richer service-specific overrides

## Implementation Notes
- Reuse the current booking submit and availability logic whenever possible.
- Keep appointment creation in [backend/src/routes/businesses.ts](C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts) unless extraction clearly reduces risk.
- Do not replace lead/request mode with a new request table in the first pass unless required for draft implementation. It is acceptable to keep request persistence on the current lead path initially and add `booking_requests` later.
- Keep the public booking page compatible with current query-based service handoff from the Services page.
