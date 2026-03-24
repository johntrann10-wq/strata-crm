# Strata Platform Architecture

## Product Architecture

Strata is a multi-tenant shop operating system for automotive service businesses. The platform serves multiple verticals through a shared operational core and vertical-specific presets layered on top.

### Core product pillars

- Tenant-aware account and billing structure
- Shared CRM and vehicle record system
- Unified commercial workflow: lead -> quote -> appointment -> job -> invoice -> paid
- Flexible service model that supports detailing, tint, PPF, wrap, tire, and mechanic operations
- Desktop-first operations UI with high-quality mobile execution for owners and technicians

### System architecture

- Frontend: React Router 7 SPA with TypeScript, Tailwind, Radix/shadcn primitives
- Backend: Express + TypeScript API with domain routes
- Database: PostgreSQL with Drizzle ORM
- Deployment: Vercel frontend, Railway backend, Postgres database
- Auth: JWT-based auth with tenant context resolution
- Tenant scope: all operational records scoped by `businessId`

### Domain boundaries

- Identity
  Users, authentication, memberships, roles, permissions
- Tenant
  Businesses, locations, business configuration, subscriptions
- CRM
  Customers, vehicles, documents, notes, tags, custom fields
- Catalog
  Services, packages, service templates, vertical presets
- Sales
  Estimates, quote line items, approvals, follow-up
- Scheduling
  Appointments, calendar views, technician assignments, capacity
- Operations
  Jobs/work orders, status pipelines, checklists, media, internal notes
- Billing
  Invoices, payments, balances, billing events
- Platform
  Activity logs, notification logs, automation jobs, reporting

## Multi-Tenant Domain Model

### Tenant primitives

- `users`
  Global identity records
- `businesses`
  Tenant container; current production tenant primitive
- `business_memberships`
  Many-to-many tenant membership model for owners and staff
- `role_permission_grants`
  Default and tenant-scoped overrides for permissions
- `locations`
  Per-tenant operating locations

### Shared business entities

- `clients`
- `vehicles`
- `services`
- `service_addon_links`
- `appointments`
- `appointment_services`
- `quotes`
- `quote_line_items`
- `invoices`
- `invoice_line_items`
- `payments`
- `staff`
- `activity_logs`
- `notification_logs`
- `email_templates`

### Phase 1 target additions

- Membership roles
  `owner`, `admin`, `manager`, `service_advisor`, `technician`
- Permissions
  Dashboard, CRM, services, quotes, appointments, jobs, invoices, payments, team, settings
- Tenant context resolution
  Resolve current business by ownership or active membership, optionally switched by request header

## Module Breakdown

### Phase 1: Foundation

- Auth and session context
- Tenant membership and role system
- Organization onboarding
- Base layout and navigation shell
- Design system patterns
- Tenant-scoped backend context

### Phase 2: Core records

- Customers
- Vehicles
- Services
- Packages
- Quotes
- Appointments

### Phase 3: Operations

- Jobs/work orders
- Technician workload
- Scheduling views
- Internal notes
- Attachments and media
- Status flows

### Phase 4: Commercials

- Invoices
- Payments
- KPI dashboard
- Settings by business type
- Business profile and operating rules

### Phase 5: Scale

- Multi-location workflows
- Search
- Filters
- Command palette
- Audit expansion
- Background jobs and automation reliability

## Reusable UI System

### Layout primitives

- App shell with permanent desktop nav and mobile sheet nav
- Record index pattern
  Header, filters, bulk actions, data table/list, empty state
- Record detail pattern
  Summary rail, timeline, related records, next-step CTA
- Composer pattern
  Sheet/dialog for quick create, full-page form for deep create/edit

### Interaction principles

- One primary CTA per surface
- Secondary actions grouped in context menus or sheets
- Status always visible
- Notes and internal updates separated from customer-facing content
- Related records shown as linked operational graph, not isolated pages

### Visual system

- Dense but readable information hierarchy
- Strong table/list rhythm
- Accent color reserved for primary actions and urgent workflow highlights
- Consistent card, drawer, command palette, and empty-state patterns
- Operational metrics visible without clutter

## Folder Structure

### Current target structure

```text
web/
  components/
    app/
    shared/
    ui/
  hooks/
  lib/
  routes/
backend/src/
  db/
  integration/
  lib/
  middleware/
  routes/
  types/
```

### Desired module-oriented direction

```text
web/
  components/
    app/
    ui/
  features/
    auth/
    tenant/
    crm/
    vehicles/
    catalog/
    scheduling/
    jobs/
    billing/
    dashboard/
  hooks/
  lib/
  routes/

backend/src/
  db/
  domains/
    auth/
    tenant/
    crm/
    catalog/
    scheduling/
    jobs/
    billing/
    reporting/
  lib/
  middleware/
  routes/
```

We will move toward this incrementally instead of rewriting the repo in one shot.

## Database Schema Direction

### Tenant and identity

- `users`
- `businesses`
- `business_memberships`
- `role_permission_grants`
- `locations`

### CRM and assets

- `clients`
- `vehicles`
- `vehicle_media` (planned)
- `notes` (planned)
- `media_uploads` (planned)
- `tags` and `entity_tags` (planned)
- `custom_fields` and `custom_field_values` (planned)

### Catalog and sales

- `services`
- `packages` (planned)
- `quote_line_items`
- `invoice_line_items`

### Operations

- `appointments`
- `appointment_services`
- `jobs` (planned)
- `job_assignments` (planned)
- `job_media` (planned)

### Finance and audit

- `invoices`
- `payments`
- `activity_logs`
- `notification_logs`
- `email_templates`
- `idempotency_keys`

## Phase 1 Implementation Plan

### Completed in this pass

- Added tenant membership schema
- Added role/permission schema foundation
- Added backend tenant context resolver
- Updated auth middleware to resolve tenant by owner or membership
- Added auth context endpoint for tenant-aware app bootstrap
- Ensured new businesses create an owner membership automatically

### Next Phase 1 tasks

1. Add tenant-aware frontend bootstrap using `/api/auth/context`
2. Add membership management routes
3. Add permission enforcement middleware
4. Add staff invite and role assignment flow
5. Add location switcher and current-tenant switch support
6. Harden onboarding for team and tenant defaults
