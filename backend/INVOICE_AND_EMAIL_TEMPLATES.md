# Invoice & Email Templates (Stage 3)

## Invoice template

- **HTML invoice**: Responsive (mobile & desktop), XSS-safe (all dynamic content escaped via `escapeHtml`).
- **Contents**: Business info (name, email, phone, address, timezone), client info, line items, subtotal, discount, tax, total, partial payments, payment history.
- **Endpoint**: `GET /api/invoices/:id/html` — returns `text/html` for the invoice (requires auth + tenant). Use for print or “View as PDF” in the browser.

Data is built from session (business) and invoice record; all user-supplied fields are escaped in `backend/src/lib/invoiceTemplate.ts`.

## Client email templates (built-in)

All templates support DB overrides (per-business or system default in `email_templates`). If no row exists, built-in defaults in `backend/src/lib/emailTemplates.ts` are used. **All placeholder values are HTML-escaped** when replacing in the body.

| Slug | Purpose | Main placeholders |
|------|--------|--------------------|
| `appointment_confirmation` | Appointment confirmed | clientName, businessName, dateTime, vehicle, address, serviceSummary, confirmationUrl |
| `appointment_reminder` | Reminder before appointment | clientName, businessName, dateTime, vehicle, serviceSummary |
| `payment_receipt` | Payment received | clientName, businessName, amount, invoiceNumber, paidAt, method |
| `review_request` | Post-visit review ask | clientName, businessName, reviewUrl, serviceSummary |
| `lapsed_client_reengagement` | Re-engage lapsed clients | clientName, businessName, lastVisit, bookUrl, serviceSummary |

**Helpers** in `backend/src/lib/email.ts`: `sendAppointmentConfirmation`, `sendAppointmentReminder`, `sendPaymentReceipt`, `sendReviewRequest`, `sendLapsedClientReengagement`. Each accepts the vars above; missing optional fields are replaced with "—" in the email.

## Weekly summary (business owner)

- **Slug**: `weekly_summary`
- **Recipients**: Business owner email.
- **Vars** (filled from DB by `getWeeklySummaryVars`): businessName, weekStart, weekEnd, completedCount, revenueTotal, openInvoicesCount, overdueCount, staffUtilization.
- **Send**: `sendWeeklySummary(businessId, businessEmail, businessName?)` — fetches stats for the current week (Sun–Sat) and sends the summary.

## Escaping and safety

- **Invoice HTML**: `backend/src/lib/escape.ts` provides `escapeHtml`; `invoiceTemplate.ts` uses it for every dynamic string.
- **Emails**: `sendTemplatedEmail` replaces `{{var}}` in HTML body with `escapeHtml(value)` so all template vars are safe for HTML.

## Timezone

- Invoice and email formatting use business timezone (`business.timezone`, default `America/New_York`) via `formatDate` / `formatDateTime` in `escape.ts`.
