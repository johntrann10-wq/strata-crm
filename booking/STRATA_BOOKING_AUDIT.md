# Strata Booking Audit

## Executive Summary
Strata already has a real booking foundation. This is not a fake marketing shell.

What exists today:
- a public booking route with step-based service, vehicle, timing, contact, and review steps
- business-configurable request-only vs self-book behavior
- service-level booking controls, featured services, add-ons, deposits, and availability overrides
- real appointment creation for self-book flows
- real lead creation for request-only flows
- customer and vehicle capture into the existing CRM
- appointment confirmation URLs, portal URLs, and appointment deposit checkout
- a business-side booking builder embedded in the Services page

What does not exist yet:
- draft booking autosave or resume
- a dedicated booking draft / booking request record
- a true branding token system for the public booking surface
- a structured custom intake-question builder
- booking-funnel analytics and abandonment tracking
- a more powerful live preview / flow-editor architecture in the builder

Bottom line:
- The backend booking engine is stronger than the UI makes it feel.
- The customer-facing booking page and booking builder are both real and usable, but still visually and structurally behind the product ambition.
- The biggest product gap is not "can Strata book work?" It is "can Strata feel like an industry-leading, low-friction, high-conversion booking product?"

## Scope Inspected

### Frontend routes
- [web/routes/_public.book.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
- [web/routes/_public.lead.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.lead.$businessId.tsx)
- [web/routes/_app.services._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)
- [web/routes/portal.$token.tsx](/C:/Users/jake/gadget/strata/web/routes/portal.$token.tsx)
- [web/routes/_app.appointments.new.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.appointments.new.tsx)

### Backend routes and libs
- [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- [backend/src/routes/services.ts](/C:/Users/jake/gadget/strata/backend/src/routes/services.ts)
- [backend/src/routes/appointments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts)
- [backend/src/lib/booking.ts](/C:/Users/jake/gadget/strata/backend/src/lib/booking.ts)
- [backend/src/lib/leads.ts](/C:/Users/jake/gadget/strata/backend/src/lib/leads.ts)
- [backend/src/lib/stripe.ts](/C:/Users/jake/gadget/strata/backend/src/lib/stripe.ts)

### Data model and migrations
- [backend/src/db/schema.ts](/C:/Users/jake/gadget/strata/backend/src/db/schema.ts)
- [backend/drizzle/0030_booking_builder.sql](/C:/Users/jake/gadget/strata/backend/drizzle/0030_booking_builder.sql)
- [backend/drizzle/0031_booking_builder_controls.sql](/C:/Users/jake/gadget/strata/backend/drizzle/0031_booking_builder_controls.sql)
- [backend/drizzle/0032_service_booking_advanced_controls.sql](/C:/Users/jake/gadget/strata/backend/drizzle/0032_service_booking_advanced_controls.sql)
- [backend/scripts/init-schema.sql](/C:/Users/jake/gadget/strata/backend/scripts/init-schema.sql)

### Existing tests
- [backend/src/lib/booking.test.ts](/C:/Users/jake/gadget/strata/backend/src/lib/booking.test.ts)
- [e2e/public-booking.spec.ts](/C:/Users/jake/gadget/strata/e2e/public-booking.spec.ts)
- [e2e/booking-builder.spec.ts](/C:/Users/jake/gadget/strata/e2e/booking-builder.spec.ts)
- [e2e/public-lead-capture.spec.ts](/C:/Users/jake/gadget/strata/e2e/public-lead-capture.spec.ts)

## Capability Classification

| Capability | Current truth | Classification | Why |
| --- | --- | --- | --- |
| Services-page handoff | Real CTAs and service/category handoff into `/book/:businessId` | `solid but needs UI redesign` | Strong plumbing, weaker storefront/merchandising feel |
| Self-book vs request-only | Real business default + service override + backend branching | `production-ready` | Logic and persistence paths are real and tested |
| Draft lead capture / autosave | No booking draft object, no autosave API, no resume path | `partial / needs backend work` | Biggest gap relative to redesign goal |
| Vehicle capture | Public booking collects real vehicle data and creates/matches vehicles | `production-ready` | Strong enough already, mostly a UX polish opportunity |
| Availability rules | Business and service booking windows, lead time, capacity, blackout dates | `solid but needs UI redesign` | Real scheduling logic, but not yet deep routing/staff/service-area logic |
| Deposits / payments | Appointment deposit flow, Stripe checkout, public deposit collection | `production-ready` | Reusable and real today |
| Confirmations / follow-up | Confirmation URL, portal URL, request auto-response/follow-up | `production-ready` | Strong post-submit path already exists |
| Branding / customization | Copy controls, show/hide prices/durations, featured services | `partial / needs backend work` | Too shallow for full customization positioning |
| Booking builder settings | Real tabs, save flow, permission gating, preview | `solid but needs UI redesign` | Works, but still feels like settings more than flow design |
| Mobile/on-site vs in-shop | Real branching and address capture | `solid but needs UI redesign` | Useful now, but not yet travel-aware or service-area aware |
| Add-ons / upsells | Linked add-ons surfaced as "Frequently added" | `solid but needs UI redesign` | Real data model, but light recommendation logic |
| Draft resume / anti-abandonment | Not present | `not ready for customer-facing marketing emphasis` | Requires schema, API, and UX additions |
| Structured custom intake questions | Not present | `not ready for customer-facing marketing emphasis` | No question schema or builder |
| Booking analytics / funnel events | Not evident in booking runtime | `not ready for customer-facing marketing emphasis` | No real conversion instrumentation layer |

## Current Booking Architecture

### Services page handoff
Current state:
- The Services page acts as the public booking entry point.
- Service cards can link to `/book/:businessId` with `service`, `category`, `source=services-page`, and optional `step=service`.
- CTA behavior already changes by effective flow:
  - `Book now`
  - `Request service`
  - `Learn more`

Evidence:
- [web/routes/_app.services._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)
- [e2e/booking-builder.spec.ts](/C:/Users/jake/gadget/strata/e2e/booking-builder.spec.ts)

### Public booking flow
Current state:
- The public route is a real step-based flow, not a giant form.
- Current steps:
  - service
  - vehicle
  - location / service mode when required
  - timing
  - contact
  - review
- Supports:
  - service/category deep links
  - featured services
  - add-ons
  - request-only mode
  - self-book mode
  - mobile / in-shop branching
  - live availability fetch for self-book
  - appointment or lead creation on submit

Evidence:
- [web/routes/_public.book.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
- [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- [e2e/public-booking.spec.ts](/C:/Users/jake/gadget/strata/e2e/public-booking.spec.ts)

### Self-book vs request-only flows
Current state:
- Business-level default flow exists.
- Service-level override exists.
- Effective flow is resolved server-side.
- Request-only submissions create lead-like CRM entries.
- Self-book submissions create real appointments and appointment services.

Evidence:
- [backend/src/lib/booking.ts](/C:/Users/jake/gadget/strata/backend/src/lib/booking.ts)
- [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)

### Draft lead capture / autosave
Current state:
- No booking draft API
- No booking draft table
- No local draft persistence in the public booking flow
- No resume link or draft recovery path
- Lead capture submits only on final submit

Evidence:
- [web/routes/_public.book.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
- [web/routes/_public.lead.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.lead.$businessId.tsx)
- [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)

### Vehicle capture
Current state:
- Public booking captures:
  - year
  - make
  - model
  - color
- Public lead capture captures a single vehicle text field.
- Booking submit can create or match a real vehicle record.

Evidence:
- [web/routes/_public.book.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
- [web/routes/_public.lead.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.lead.$businessId.tsx)
- [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)

### Availability rules
Current state:
- Business-level booking schedule exists:
  - day indexes
  - start time
  - end time
  - blackout dates
  - slot interval
  - buffer minutes
  - capacity per slot
- Service-level overrides exist:
  - lead time
  - booking window days
  - service days
  - service start/end time
  - service slot capacity
- Self-book availability filters by overlap and capacity.

Evidence:
- [backend/src/lib/booking.ts](/C:/Users/jake/gadget/strata/backend/src/lib/booking.ts)
- [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- [backend/src/db/schema.ts](/C:/Users/jake/gadget/strata/backend/src/db/schema.ts)

### Deposits and payments
Current state:
- Services can carry booking deposit amounts.
- Self-book flow returns deposit amount.
- Created appointments store deposit amount.
- Appointment confirmation pages support public deposit checkout.
- Stripe checkout session creation is real.

Evidence:
- [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- [backend/src/routes/appointments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts)
- [backend/src/lib/stripe.ts](/C:/Users/jake/gadget/strata/backend/src/lib/stripe.ts)

### Confirmations and follow-up
Current state:
- Self-book returns:
  - appointment id
  - confirmation URL
  - portal URL
  - scheduled time
- Request-only returns:
  - lead id
  - confirmation message
- Appointment confirmation emails exist.
- Public appointment page supports deposit follow-up and change request.
- Request-only flow sends auto-response/follow-up where configured.

Evidence:
- [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- [backend/src/routes/appointments.ts](/C:/Users/jake/gadget/strata/backend/src/routes/appointments.ts)
- [web/routes/portal.$token.tsx](/C:/Users/jake/gadget/strata/web/routes/portal.$token.tsx)

### Branding and customization
Current state:
- Business-level booking content supports:
  - page title
  - page subtitle
  - confirmation message
  - three trust bullets
  - notes prompt
  - show/hide pricing
  - show/hide durations
- Service-level public settings support:
  - description
  - featured
  - hide price
  - hide duration
- No tokenized theming system exists.
- No per-business visual identity layer exists beyond copy/settings.

Evidence:
- [backend/src/db/schema.ts](/C:/Users/jake/gadget/strata/backend/src/db/schema.ts)
- [web/routes/_app.services._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)

### Booking builder settings
Current state:
- Builder lives on the Services page.
- Has sections/tabs for:
  - Flow
  - Services
  - Availability
  - Payments & Deposits
  - Branding & Content
- Saves business-level settings
- Service forms save service-level booking settings
- Preview exists
- Permission gating exists for business-level edits

Evidence:
- [web/routes/_app.services._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)
- [e2e/booking-builder.spec.ts](/C:/Users/jake/gadget/strata/e2e/booking-builder.spec.ts)

### Mobile / on-site vs in-shop support
Current state:
- Service-level mode supports:
  - `in_shop`
  - `mobile`
  - `both`
- Public flow supports choosing mobile vs in-shop when relevant.
- Mobile mode captures address fields.
- Appointment creation writes mobile context into appointment and client data.

Evidence:
- [backend/src/db/schema.ts](/C:/Users/jake/gadget/strata/backend/src/db/schema.ts)
- [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- [web/routes/_public.book.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
- [e2e/public-booking.spec.ts](/C:/Users/jake/gadget/strata/e2e/public-booking.spec.ts)

### Add-ons and upsells
Current state:
- Linked add-ons exist in the data model.
- Public booking shows them as "Frequently added".
- Add-ons affect subtotal, duration, deposit, availability query, and appointment services.

Evidence:
- [backend/src/routes/businesses.ts](/C:/Users/jake/gadget/strata/backend/src/routes/businesses.ts)
- [web/routes/_public.book.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
- [web/routes/_app.services._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)

## Exact Reasons The Current UX Feels Outdated

### Public booking page
1. It still spends too much vertical space on chrome instead of progress.
2. Service selection uses many bordered cards and secondary badges, which creates a "nice app form" feel instead of a premium booking checkout feel.
3. Service context is strong, but repeated too often:
   - selected-service summary
   - step card context
   - sidebar summary
4. Helper text and trust copy are cleaner than before, but still not compressed enough for the "minimal scrolling" goal.
5. Timing selection is functionally correct but visually ordinary. It does not feel like a premium availability selector.
6. There is no draft indicator, resume state, or "your progress is safe" reassurance.
7. Request-only mode still reads like a booking page trying to imitate scheduling instead of a high-conversion guided request flow.
8. The step shell is better than a long form, but the visual system still leans on many boxes, badges, and bordered surfaces.
9. Mobile still requires more scanning and scrolling than necessary, especially once selected-service context, trust, stepper, step content, and sticky actions are all present.
10. The success state is solid, but not distinctive enough to feel memorable or screenshot-worthy.

### Booking builder
1. It still feels like a product settings panel more than a flow designer.
2. Business-level settings and service-level settings are still mentally far apart, even though they shape the same public experience.
3. Tabs help, but the builder still reads as "configure fields" rather than "design a booking journey."
4. The live preview is polished but static. It does not preview step decisions, branching, or service-specific behavior convincingly.
5. Service cards below the builder are better than before, but still too admin-oriented for a true flow editor.
6. No section ordering or builder-driven content architecture exists.
7. No visual identity system exists beyond copy.
8. No abandonment/draft messaging editor exists because the product layer itself is missing.
9. No custom-intake section builder exists, so the editor cannot yet feel complete.
10. On mobile, preview access is improved, but editing still feels like a dense config surface rather than a focused builder.

## Strongest Reusable Pieces

### Strongest backend primitives
- service catalog + linked add-ons
- business + service booking settings already persisted
- availability helper functions in [backend/src/lib/booking.ts](/C:/Users/jake/gadget/strata/backend/src/lib/booking.ts)
- public booking config / availability / submit endpoints
- request-only lead creation path
- self-book appointment creation path
- public token + confirmation + portal infrastructure
- appointment deposit checkout infrastructure

### Strongest frontend surfaces
- polished public lead shell in [web/routes/_public.lead.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.lead.$businessId.tsx)
- current step-based public booking route in [web/routes/_public.book.$businessId.tsx](/C:/Users/jake/gadget/strata/web/routes/_public.book.$businessId.tsx)
- services-page handoff patterns in [web/routes/_app.services._index.tsx](/C:/Users/jake/gadget/strata/web/routes/_app.services._index.tsx)
- public portal as a strong post-booking destination in [web/routes/portal.$token.tsx](/C:/Users/jake/gadget/strata/web/routes/portal.$token.tsx)

### Strongest constraints to respect
- do not split booking into a disconnected parallel system
- keep `appointments` as the booked-work source of truth
- preserve current public token/document flows
- preserve request-only businesses that do not want live slots
- preserve service catalog truth instead of inventing a new booking-only catalog

## Schema and API Gaps For The Redesign Goal

### Draft autosave
Current gap:
- no persisted booking draft / session state

Recommended additions:
- new table `booking_drafts`
- fields:
  - `id`
  - `business_id`
  - `service_id`
  - `status` (`active`, `submitted`, `expired`, `abandoned`)
  - `flow_mode` (`request`, `self_book`)
  - `payload_json`
  - `source`
  - `campaign`
  - `email`
  - `phone`
  - `vehicle_summary`
  - `last_completed_step`
  - `resume_token`
  - `started_at`
  - `last_active_at`
  - `submitted_at`
- new API:
  - `POST /api/businesses/:id/public-booking-drafts`
  - `PATCH /api/public-booking-drafts/:resumeToken`
  - `GET /api/public-booking-drafts/:resumeToken`

### Builder customization
Current gap:
- builder settings exist, but not section architecture, not preview architecture, and not customizable flow content blocks

Recommended additions:
- either extend `businesses` with a small number of JSON columns or add a `booking_page_configs` table
- recommended stored structures:
  - `booking_flow_sections_json`
  - `booking_branding_json`
  - `booking_confirmation_content_json`
  - `booking_intake_config_json`
  - `booking_upsell_config_json`

### Branding tokens
Current gap:
- copy-level customization only

Recommended additions:
- business-level `booking_branding_json`
- supported tokens:
  - `logoUrl`
  - `heroImageUrl`
  - `coverImageUrl`
  - `accentColor`
  - `surfaceTone`
  - `buttonTone`
  - `textTone`
  - `borderStyle`
  - `radiusScale`
  - `showPoweredBy`

### Advanced service-level booking controls
Current gap:
- good first generation controls exist, but not enough for the final positioning

Recommended additions:
- `services.booking_intake_schema_json`
- `services.booking_upsell_group_key`
- `services.booking_confirmation_variant`
- `services.booking_reschedule_policy_json`
- `services.booking_service_area_json`
- `services.booking_priority_rank`
- `services.booking_media_json`

### Mobile/on-site vs in-shop branching
Current gap:
- mode exists, but routing depth is basic

Recommended additions:
- `locations.service_area_json` or `businesses.mobile_service_area_json`
- `services.booking_mobile_buffer_minutes`
- `services.booking_mobile_lead_time_hours`
- optional `services.booking_requires_address_validation`

### Add-ons / upsells
Current gap:
- linked add-ons exist, but not recommendation logic or display strategy configuration

Recommended additions:
- `service_addon_links.recommendation_rank`
- `service_addon_links.recommendation_copy`
- `service_addon_links.recommendation_style`
- optional `service_addon_links.vehicle_match_json`

## Biggest Constraints
- Request-only flow currently stores lead state in `clients.notes` via [backend/src/lib/leads.ts](/C:/Users/jake/gadget/strata/backend/src/lib/leads.ts). That is workable, but not ideal for sophisticated booking-request lifecycle UX.
- Draft/resume cannot be added cleanly without a real booking-draft object.
- Appointment deposits are strong after appointment creation, but a richer "reserve with deposit before full confirmation" flow would need careful handling.
- Public branding is copy-first today, so a truly premium branded booking page requires a new token layer.
- Availability is capacity- and hours-aware, but not yet staff-aware or dispatch-aware.

## Screenshot-Worthy And Preview-Worthy States

### Screenshot-worthy customer states
- services-page featured service card with strong `Book now` / `Request service` CTAs
- selected-service booking hero with price, duration, deposit, and next-step clarity
- premium date/time step with live slot selection
- mobile/on-site address step for hybrid services
- "Frequently added" upsell step that feels clean, not spammy
- direct-book confirmation with confirmation link and portal entry
- request-submitted confirmation with clear follow-up expectation

### Preview-worthy builder states
- live preview of request-only flow for a tint/wrap service
- live preview of instant-book flow for a detailing/coating package
- branded builder preview with hero media / brand accent / trust content
- service-specific override preview:
  - featured
  - hidden price
  - deposit required
  - mobile-only
- anti-abandonment draft-save experience preview

## Audit Conclusion
Strata already has enough real booking infrastructure to justify a serious redesign. The product does not need a brand-new booking engine.

The redesign should focus on:
- dramatically better public UX
- real draft and anti-abandonment infrastructure
- richer builder architecture
- stronger brand customization
- more structured request/draft state instead of overloading lead notes

That path keeps the strongest current truth:
- services stay the source of truth
- appointments stay the source of truth for booked work
- clients and vehicles stay the CRM source of truth
- public confirmations, portal access, and deposits remain reusable assets
