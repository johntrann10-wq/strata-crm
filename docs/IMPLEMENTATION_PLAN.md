# Strata Production Implementation Plan

## Phase 1: Foundation

### Goals

- Make tenant context first-class
- Support owner and team access safely
- Create a reusable permission spine
- Tighten onboarding and app bootstrap

### Backend work

1. Tenant membership and permission schema
2. Tenant context resolver
3. Auth context endpoint
4. Membership-aware business creation
5. Permission middleware
6. Membership management routes

### Frontend work

1. Bootstrap current tenant from auth context
2. Add business switcher surface in app shell
3. Add team and role management in settings
4. Surface permission-aware navigation
5. Persist current tenant in client auth state

## Phase 2: Core Business Records

### Goals

- Shared data model for all supported verticals
- Fast customer and vehicle workflows
- Service and package reuse
- Faster sales workflow

### Build order

1. Customer index and detail
2. Vehicle profile and documents
3. Service catalog
4. Package composition
5. Quote builder
6. Appointment booking

## Phase 3: Operational Workflow

### Goals

- Move from booking to execution cleanly
- Make technician and advisor workflows obvious
- Track status, notes, and photos without friction

### Build order

1. Job/work order entity
2. Technician assignment and schedule capacity
3. Status pipeline configuration
4. Internal notes and activity feed
5. Media uploads and inspection evidence

## Phase 4: Billing and Management

### Goals

- Tight quote-to-cash path
- Operational dashboard with real decision support
- Business settings that reflect vertical needs

### Build order

1. Invoice improvements
2. Payment capture and reconciliation
3. KPI dashboard
4. Business-type settings presets
5. Notification and reminder policies

## Phase 5: Scale and Polish

### Goals

- Multi-location support
- Faster information retrieval
- Stronger auditability
- Better operator ergonomics

### Build order

1. Location-aware scheduling and records
2. Global command palette and search
3. Filtering system
4. Audit log expansion
5. Background jobs and automation hardening
6. Mobile polish for all critical flows

## Immediate Engineering Sequence

1. Ship tenant membership and permissions
2. Hook frontend auth/bootstrap into tenant context
3. Build team management UI
4. Add permission enforcement on sensitive routes
5. Stabilize current core workflows against the new tenant model
