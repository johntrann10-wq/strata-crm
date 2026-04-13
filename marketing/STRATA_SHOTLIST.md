# Strata Screenshot Shotlist (Evidence-Based)

## Seeded Demo Data Requirements
- Business: Coastline Detail Co.
- Team members: Jake, Marco.
- Appointments across a full week with real client names, vehicle details, service names, totals, and deposit statuses.
- Quotes and invoices populated with real line items and totals.
- No empty tables or blank states.
- No settings or admin screens unless explicitly listed below.

## Capture Standards
- Desktop viewport: 1440x1024.
- Mobile viewport: 390x844.
- Keep text readable at 1x scale.
- No dev overlays, debug UI, or local chrome.
- Crop to emphasize the product, not whitespace.

## Required Shots

| Filename | Route / Page | Viewport | What It Proves | Homepage Placement + Crop Notes |
| --- | --- | --- | --- | --- |
| hero-desktop-calendar.png | `/calendar` (month view with day inspector open) | Desktop | Clear month-to-day scheduling with real appointments | Hero desktop image. Crop to show month grid, selected day inspector, and appointment list. |
| hero-mobile-appointment.png | `/appointments/:id` | Mobile | Appointment details with customer, vehicle, service, and deposit/payment status | Hero mobile overlay. Crop to show title, client, vehicle, service summary, deposit/payment badge. |
| desktop-customer-crm.png | `/clients` | Desktop | Client and vehicle CRM with search + structured list | Feature showcase. Crop to show list density and quick context. |
| mobile-client-detail.png | `/clients/:id` | Mobile | Client detail with vehicles and recent activity | Feature showcase. Crop to show name, vehicle list, and workflow metrics. |
| desktop-invoice.png | `/invoices/:id` | Desktop | Invoice detail with line items, totals, and status | Feature showcase. Crop to show line items, totals, and status badge. |
| mobile-portal-payment.png | `/portal/:token` (customer hub) | Mobile | Customer-facing payment and document access | Trust proof. Crop to show invoice card with pay CTA and overall portal context. |
| desktop-team-access.png | `/settings?tab=team` | Desktop | Team access and roles | Secondary trust proof. Crop to show team list and role/permission context without clutter. |

## Optional Alternates (If Any Shot Feels Weak)
- Replace desktop-team-access.png with `/finances` overview if team access feels too admin-heavy.
- Replace desktop-customer-crm.png with `/appointments` schedule list if CRM list looks sparse.

## Final Selection Notes (Why These Won)
- hero-desktop-calendar.png: Dense, readable week coverage with clear appointment cards and a visible day inspector that instantly communicates scheduling power.
- hero-mobile-appointment.png: Clean appointment detail view with customer, vehicle, service, and status in one screen for immediate mobile trust.
- desktop-customer-crm.png: Strong list density and vehicle context with search/segments visible without feeling cluttered.
- mobile-client-detail.png: Shows client profile, vehicles, and activity in a compact, modern mobile layout.
- desktop-invoice.png: Clear line items, totals, and status with a trustworthy invoicing layout.
- mobile-portal-payment.png: Customer hub view shows payment entry point and documents in a polished, legible mobile card stack.
- desktop-team-access.png: Demonstrates roles and team access in a real-world context without feeling overly technical.
