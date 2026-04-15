# Strata Booking Redesign Plan

## Redesign Goal
Turn Strata booking into a best-in-class public scheduling product for automotive service businesses that:
- feels premium and mobile-first
- minimizes scrolling and visual clutter
- preserves strong service context
- supports both instant booking and guided request flows
- saves progress automatically
- lets each business shape behavior and branding without code

This redesign should reuse Strata's strongest existing truth:
- service catalog
- appointment engine
- CRM
- add-on linking
- deposit checkout
- public confirmation and customer portal flows

## Product Principles
- One clear decision per screen on mobile
- Strong service context from start to finish
- Minimal scrolling, especially before the first commitment action
- Trust through structure and clarity, not big paragraphs
- Business customization without turning the builder into enterprise clutter
- Reuse Strata's existing data model wherever the current foundation is already strong

## Final Customer Flow Blueprint

### Flow overview
1. Landing and service selection
2. Vehicle details
3. Service mode and location
4. Timing
5. Contact
6. Add-ons and notes
7. Review and confirmation
8. Success and follow-up

### Step 1: Landing and service selection
Target:
- look like a premium automotive service storefront, not a list of forms

Content:
- business hero with brand token styling
- short trust bar
- featured services above the fold
- category filter chips
- each service card shows:
  - name
  - short public description
  - price if enabled
  - duration if enabled
  - deposit if applicable
  - service mode
  - one primary CTA
  - one secondary `Learn more`

Behavior:
- if deep-linked from Services page, preselect service and drop into the correct next step
- if request-only, CTA still feels strong:
  - `Request service`
- if self-book:
  - `Book now`

### Step 2: Vehicle details
Target:
- short, confidence-building, automotive-specific intake

Fields:
- year
- make
- model
- color
- optional plate/VIN later only if the builder enables deeper intake

UX:
- show service context at top
- short "why we ask" helper
- support autosave after each field cluster

### Step 3: Service mode and location
Target:
- only appear when needed

Branching:
- in-shop only:
  - show location selection only if multiple locations
- mobile only:
  - go directly to service address
- both:
  - choose `In-shop visit` or `Mobile / on-site`

Future-friendly:
- support service-area validation here

### Step 4: Timing
Target:
- premium slot selection that feels more like checkout than scheduler software

Self-book:
- date carousel or compact date rail
- strong time-slot buttons
- clear unavailable / sold-out states
- "earliest available" shortcut

Request-only:
- replace slot picker with a lightweight timing preference selector:
  - first available
  - mornings
  - afternoons
  - specific date
  - flexible this week

This reduces friction when live slot precision is unnecessary.

### Step 5: Contact
Target:
- compact, trustworthy, low-friction capture

Fields:
- first name
- last name
- email if required
- phone if required

Behavior:
- if draft exists and email/phone is entered, draft becomes identifiable for follow-up

### Step 6: Add-ons and notes
Target:
- upsells should feel helpful, not spammy

Content:
- clean "Frequently added" module
- optional notes field
- optional custom questions if configured

Rules:
- add-ons should be ranked, vehicle-aware when configured, and visually restrained

### Step 7: Review and confirmation
Target:
- strong summary with one obvious action

Review shows:
- selected service
- add-ons
- vehicle
- mode/location
- date/time or request timing preference
- deposit amount if applicable
- contact
- what happens next

Primary CTA:
- `Book appointment`
- `Send request`

### Step 8: Success and follow-up
Self-book success:
- scheduled date/time
- confirmation action
- portal action
- deposit next step if required

Request success:
- clear "request sent" message
- follow-up expectation
- optional return to services or customer portal if relevant

## Final Builder Information Architecture

### Desktop layout
- left: focused builder controls
- right: sticky live preview

### Mobile layout
- stacked layout
- preview behind a compact toggle or sheet
- save affordance remains accessible

### Final top-level sections
1. Flow
2. Services
3. Availability
4. Payments & Deposits
5. Branding & Content
6. Follow-up & Draft Recovery
7. Advanced Rules

### Section details

#### Flow
- booking enabled
- business default flow
- request-only vs self-book explainer cards
- which steps are shown
- request timing style
- default post-submit action

#### Services
- visible on booking page
- featured services
- ordering
- public descriptions
- CTA posture
- linked add-on merchandising
- service-specific overrides

#### Availability
- business booking days
- business booking hours
- blackout dates
- slot interval
- buffer
- capacity
- service-specific scheduling overrides
- mobile/on-site rules

#### Payments & Deposits
- deposit required / optional / none
- whether deposit is shown early or late
- confirmation email behavior
- future-ready support for reserve-with-deposit flows

#### Branding & Content
- title
- intro
- trust bullets
- confirmation message
- logo
- hero media
- accent styling tokens
- button tone

#### Follow-up & Draft Recovery
- autosave enabled
- reminder copy
- resume-link email/SMS behavior
- when to prompt for contact early
- abandoned draft follow-up delay

#### Advanced Rules
- custom intake questions
- service-area rules
- service-specific lead-time overrides
- request-only exceptions
- vehicle-aware recommendation logic

## Final Services-Page Integration Blueprint

### Role of the Services page
The Services page remains the merchandising and builder home. It should do three jobs:
- internal service management
- public booking entry setup
- booking-flow editing

### Customer entry behavior
Each public-facing service card should support:
- `Book now`
- `Request service`
- `Learn more`

Selected service context passed through:
- `service`
- `category`
- `source=services-page`
- optional future `variant` / `campaign`

### Service-card redesign requirements
- stronger hero service cards for featured offers
- cleaner visual separation between internal and public posture
- clearer deposit and timing visibility
- stronger "what happens next" language

### Builder relationship
The builder should feel like editing how the public Services-to-Booking handoff works, not editing unrelated database settings.

## Final Branding / Token System

### Token groups
- `surface`
- `accent`
- `button`
- `text`
- `radius`
- `heroMedia`
- `logo`
- `badgeStyle`

### Recommended business-level storage
- `booking_branding_json`

### Example capabilities
- use logo in hero and confirmation
- hero image for premium service categories
- color system that remains inside Strata-safe bounds
- page density preference:
  - compact
  - balanced
  - editorial

Guardrails:
- keep sufficient contrast
- preserve form accessibility
- keep the booking page recognizably Strata, not arbitrary white-label chaos

## Data Model Recommendations

### 1. `booking_drafts`
Purpose:
- store autosaved in-progress public booking state

Recommended fields:
- `id`
- `business_id`
- `resume_token`
- `status`
- `flow_mode`
- `service_id`
- `payload_json`
- `last_completed_step`
- `source`
- `campaign`
- `email`
- `phone`
- `vehicle_summary`
- `started_at`
- `last_active_at`
- `submitted_at`

### 2. `booking_page_configs`
Purpose:
- give the builder a real configuration object beyond scattered columns

Recommended fields:
- `business_id`
- `flow_sections_json`
- `branding_json`
- `confirmation_json`
- `draft_recovery_json`
- `analytics_config_json`
- `updated_at`

### 3. `service_booking_display`
Purpose:
- keep service-level public-booking presentation organized without bloating core service CRUD forever

Recommended fields:
- `service_id`
- `public_description`
- `hero_copy`
- `media_json`
- `featured_rank`
- `upsell_group_key`
- `question_schema_json`

### 4. `booking_events`
Purpose:
- analytics and abandonment instrumentation

Recommended fields:
- `id`
- `business_id`
- `draft_id`
- `service_id`
- `event_name`
- `step_key`
- `metadata_json`
- `created_at`

### 5. Longer-term request object
Current request-mode writes into `clients` + `lead notes`.

Recommended long-term addition:
- `booking_requests`

This would allow:
- cleaner request lifecycle
- better analytics
- better builder/reporting logic
- less overloading of lead note text parsing

## API Recommendations

### Public customer-facing
- `GET /api/businesses/:id/public-booking-config`
  - keep, but version/expand payload
- `POST /api/businesses/:id/public-booking-drafts`
  - create draft and return resume token
- `PATCH /api/public-booking-drafts/:resumeToken`
  - autosave partial draft state
- `GET /api/public-booking-drafts/:resumeToken`
  - restore draft
- `GET /api/businesses/:id/public-booking-availability`
  - keep, but support richer timing request states later
- `POST /api/businesses/:id/public-bookings`
  - keep, but optionally accept `draftId`

### Builder/admin-facing
- `GET /api/businesses/:id/booking-builder-config`
- `PATCH /api/businesses/:id/booking-builder-config`
- `PATCH /api/services/:id/booking-display`
- `PATCH /api/services/:id/booking-rules`
- `GET /api/businesses/:id/booking-preview`
  - optional server-shaped preview payload later

## Event Analytics Recommendations

### Funnel events
- `booking_page_viewed`
- `booking_service_selected`
- `booking_vehicle_completed`
- `booking_mode_selected`
- `booking_timing_viewed`
- `booking_slot_selected`
- `booking_contact_completed`
- `booking_addon_selected`
- `booking_review_viewed`
- `booking_submitted`
- `booking_success_viewed`
- `booking_abandoned`
- `booking_resumed`

### Builder events
- `booking_builder_viewed`
- `booking_builder_section_opened`
- `booking_builder_saved`
- `booking_preview_opened`
- `booking_preview_cta_tested`

### Why this matters
Without funnel analytics, Strata cannot truthfully optimize for conversion at an industry-leading level.

## Anti-Abandonment / Draft Lead Strategy

### Strategy
1. Start a booking draft as soon as service selection is committed.
2. Autosave draft after:
   - service step
   - vehicle step
   - timing step
   - contact step
3. Once email or phone is known:
   - make the draft resumable across devices
   - optionally allow follow-up messaging if the business enables it
4. If booking is abandoned:
   - send a gentle resume email/SMS only if the business enables it
   - log abandonment analytics

### UX rules
- reassure early: `Your progress saves automatically.`
- do not show enterprise-style "draft saved" noise every few seconds
- use subtle save-state language:
  - `Saved`
  - `Saving...`
  - `Resume later with this link`

### Safe rollout strategy
- Phase 1:
  - local draft + server draft
  - no outbound recovery messaging yet
- Phase 2:
  - optional email/SMS resume reminders
- Phase 3:
  - business-configurable abandoned booking automation

## Exact UX Problems To Solve First
1. Too much vertical chrome before users commit to the next step
2. Service selection still looks like app cards, not a high-conversion storefront
3. No persistent autosave or resume confidence
4. Request-only flow still feels like a weaker sibling of self-book
5. Timing step does not feel premium enough
6. Add-on/upsell design is functional but not conversion-optimized
7. Builder still feels like settings, not design
8. Builder preview is not interactive enough to be convincing
9. Branding is copy-only, not visual-system driven
10. Request-mode backend model is still too tied to freeform lead notes

## Suggested Phasing

### Phase 1: Conversion-first redesign
- redesign public booking UX
- redesign builder IA and preview
- improve service-page handoff
- no broad backend rewrite

### Phase 2: Draft and abandonment layer
- add booking draft schema/API
- add autosave UI
- add resume links
- add analytics events

### Phase 3: Deep customization
- branding token system
- custom question builder
- richer upsell logic
- service-area and advanced mobile logic

### Phase 4: Scheduling depth
- staff-aware public scheduling
- smarter routing
- reserve-with-deposit enhancements if needed

## Top Redesign Recommendation
Do not rebuild booking as a separate mini-product.

Build the redesign around these truths:
- Services is the entry point
- Booking is the conversion layer
- Appointments are the booked-work record
- Leads / requests are the fallback path
- Portal and public appointment pages are the post-booking trust layer

That gives Strata the best chance to become meaningfully better than generic automotive booking tools without breaking the real system it already has.
