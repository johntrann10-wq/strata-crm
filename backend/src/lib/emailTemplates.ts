/**
 * Built-in email templates for client and business owner emails.
 * All placeholders (e.g. {{clientName}}) are replaced with escaped values in sendTemplatedEmail.
 * Fallbacks: use "-" or "N/A" when data is missing.
 */

/** Placeholders: clientName, businessName, dateTime, vehicle, address, serviceSummary, confirmationUrl, portalUrl (use - or leave blank if missing) */
type BuiltinEmailTemplate = {
  subject: string;
  bodyHtml: string;
  bodyText: string;
};

function renderClientShell(options: {
  businessName: string;
  eyebrow: string;
  title: string;
  introHtml: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  ctaHint?: string;
  showCtaHint?: boolean;
  footerNote?: string;
}) {
  const cta =
    options.ctaLabel && options.ctaUrl
      ? `<div style="margin-top:20px;">
          <a href="${options.ctaUrl}" style="display:inline-block;padding:12px 18px;background:#ea580c;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px;">${options.ctaLabel}</a>
        </div>
        ${
          options.showCtaHint
            ? `<p style="margin:12px 0 0;color:#64748b;font-size:13px;line-height:1.5;">${options.ctaHint ?? `${options.ctaLabel}: ${options.ctaUrl}`}</p>`
            : ""
        }`
      : "";

  const footer = options.footerNote
    ? `<p style="margin:18px 0 0;color:#64748b;font-size:14px;line-height:1.6;">${options.footerNote}</p>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#eef2f7;color:#0f172a;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
    <div style="background:linear-gradient(180deg,#ffffff,rgba(255,255,255,0.98));border:1px solid rgba(148,163,184,0.22);border-radius:22px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,0.10);">
      <div style="height:6px;background:linear-gradient(90deg,#f97316,#fb923c 40%,#0f172a);"></div>
      <div style="padding:28px;">
        <div style="font-size:18px;font-weight:700;color:#0f172a;">${options.businessName}</div>
        <div style="margin-top:12px;display:inline-flex;border-radius:999px;padding:6px 10px;background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">${options.eyebrow}</div>
        <h1 style="font-size:28px;line-height:1.08;letter-spacing:-0.03em;margin:16px 0 12px;color:#0f172a;">${options.title}</h1>
        <div style="color:#334155;font-size:15px;line-height:1.65;">${options.introHtml}</div>
        <div style="margin-top:18px;">${options.bodyHtml}</div>
        ${cta}
        ${footer}
      </div>
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#94a3b8;">${options.businessName}</p>
  </div></body></html>`;
}

function renderInfoCard(title: string, bodyHtml: string) {
  return `<div style="margin:0 0 14px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;padding:16px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b;">${title}</div>
    <div style="margin-top:8px;color:#334155;font-size:14px;line-height:1.6;">${bodyHtml}</div>
  </div>`;
}

function renderDetailGrid(rows: Array<{ label: string; value: string }>) {
  return `<div style="border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;padding:18px;">
    ${rows
      .map(
        (row) => `<div style="padding:${row === rows[0] ? "0" : "12px 0 0"};">
          <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;">${row.label}</div>
          <div style="margin-top:4px;color:#0f172a;font-weight:600;line-height:1.5;">${row.value}</div>
        </div>`
      )
      .join("")}
  </div>`;
}

export const appointmentConfirmation: BuiltinEmailTemplate = {
  subject: "Appointment confirmed - {{businessName}}",
  bodyHtml: renderClientShell({
    businessName: "{{businessName}}",
    eyebrow: "Confirmed booking",
    title: "Appointment confirmed",
    introHtml: `<p style="margin:0;">Hi {{clientName}},</p><p style="margin:10px 0 0;">Your appointment is confirmed for <strong>{{dateTime}}</strong>.</p>`,
    bodyHtml:
      renderDetailGrid([
        { label: "Vehicle", value: "{{vehicle}}" },
        { label: "Address", value: "{{address}}" },
        { label: "Service details", value: "{{serviceSummary}}" },
      ]) +
      `<div style="margin-top:14px;">${renderInfoCard("Payment status", "{{paymentStatus}}")}</div>` +
      `<div style="margin-top:14px;">${renderInfoCard("Customer hub", "You can open your customer hub any time from your appointment page to review active estimates, invoices, appointments, and vehicles in one place.")}</div>` +
      `<div style="margin-top:14px;">${renderInfoCard(
        "Need to change anything?",
        "If you need to reschedule or update anything before the appointment, contact us directly.<br>{{businessPhone}}<br>{{businessEmail}}<br>{{businessAddress}}"
      )}</div>`,
    ctaLabel: "{{confirmationActionLabel}}",
    ctaUrl: "{{confirmationUrl}}",
    ctaHint: "{{confirmationUrl}}",
    showCtaHint: false,
  }),
  bodyText: `{{businessName}}

Appointment confirmed

Hi {{clientName}},

Your appointment is confirmed for {{dateTime}}.

Vehicle: {{vehicle}}
Address: {{address}}
Service details: {{serviceSummary}}
Payment status: {{paymentStatus}}

Customer hub stays available from your appointment page.

{{confirmationActionLabel}}: {{confirmationUrl}}

If you need to reschedule or update anything before the appointment, contact us directly.
{{businessPhone}}
{{businessEmail}}
{{businessAddress}}`,
};

/** Placeholders: clientName, businessName, dateTime, vehicle, serviceSummary */
export const appointmentReminder: BuiltinEmailTemplate = {
  subject: "Reminder: appointment tomorrow - {{businessName}}",
  bodyHtml: renderClientShell({
    businessName: "{{businessName}}",
    eyebrow: "Upcoming visit",
    title: "Appointment reminder",
    introHtml: `<p style="margin:0;">Hi {{clientName}},</p><p style="margin:10px 0 0;">This is a friendly reminder that your appointment is scheduled for <strong>{{dateTime}}</strong>.</p>`,
    bodyHtml:
      renderDetailGrid([
        { label: "Vehicle", value: "{{vehicle}}" },
        { label: "Service details", value: "{{serviceSummary}}" },
      ]) +
      `<div style="margin-top:14px;">${renderInfoCard("See you soon", "We look forward to taking care of your vehicle.")}</div>`,
  }),
  bodyText: `{{businessName}}

Appointment reminder

Hi {{clientName}},

This is a friendly reminder that your appointment is scheduled for {{dateTime}}.
Vehicle: {{vehicle}}
Service details: {{serviceSummary}}

See you soon!`,
};

/** Placeholders: businessName, clientName, dateTime, vehicle, preferredTiming, message, clientEmail, clientPhone, appointmentUrl */
export const appointmentChangeRequestAlert: BuiltinEmailTemplate = {
  subject: "Appointment change request - {{businessName}}",
  bodyHtml: renderClientShell({
    businessName: "{{businessName}}",
    eyebrow: "Schedule change request",
    title: "A customer requested an appointment change",
    introHtml:
      `<p style="margin:0;">{{clientName}} asked to change an upcoming appointment scheduled for <strong>{{dateTime}}</strong>.</p>` +
      `<p style="margin:10px 0 0;">Review the request details below and follow up with the customer to confirm the next step.</p>`,
    bodyHtml: renderDetailGrid([
      { label: "Customer", value: "{{clientName}}" },
      { label: "Vehicle", value: "{{vehicle}}" },
      { label: "Preferred timing", value: "{{preferredTiming}}" },
      { label: "Request details", value: "{{message}}" },
      { label: "Customer email", value: "{{clientEmail}}" },
      { label: "Customer phone", value: "{{clientPhone}}" },
    ]),
    ctaLabel: "Open appointment",
    ctaUrl: "{{appointmentUrl}}",
    ctaHint: `Appointment: {{appointmentUrl}}`,
    showCtaHint: false,
    footerNote: "This request came from the public appointment page.",
  }),
  bodyText: `{{businessName}}

Appointment change request

{{clientName}} asked to change an upcoming appointment scheduled for {{dateTime}}.

Customer: {{clientName}}
Vehicle: {{vehicle}}
Preferred timing: {{preferredTiming}}
Request details: {{message}}
Customer email: {{clientEmail}}
Customer phone: {{clientPhone}}

Open appointment: {{appointmentUrl}}`,
};

/** Placeholders: clientName, businessName, amount, invoiceNumber, paidAt, method */
export const paymentReceipt: BuiltinEmailTemplate = {
  subject: "Payment receipt - {{businessName}}",
  bodyHtml: renderClientShell({
    businessName: "{{businessName}}",
    eyebrow: "Payment received",
    title: "Payment receipt",
    introHtml: `<p style="margin:0;">Hi {{clientName}},</p><p style="margin:10px 0 0;">We received your payment of <strong>{{amount}}</strong> for invoice <strong>{{invoiceNumber}}</strong>.</p>`,
    bodyHtml: renderDetailGrid([
      { label: "Paid on", value: "{{paidAt}}" },
      { label: "Method", value: "{{method}}" },
    ]),
    footerNote: "Thank you for your business.",
  }),
  bodyText: `{{businessName}}

Payment received

Hi {{clientName}},

We received your payment of {{amount}} for invoice {{invoiceNumber}}.
Paid on {{paidAt}} via {{method}}.

Thank you!`,
};

/** Placeholders: clientName, businessName, reviewUrl, serviceSummary */
export const reviewRequest: BuiltinEmailTemplate = {
  subject: "Would you mind leaving a quick review for {{businessName}}?",
  bodyHtml: renderClientShell({
    businessName: "{{businessName}}",
    eyebrow: "Feedback request",
    title: "Thank you for trusting {{businessName}}",
    introHtml:
      `<p style="margin:0;">Hi {{clientName}},</p>` +
      `<p style="margin:10px 0 0;">Thanks again for choosing {{businessName}}.</p>` +
      `<p style="margin:10px 0 0;">If your recent visit went well, would you mind taking a minute to leave us a quick review? It helps other customers feel confident booking with us and helps our team keep improving.</p>`,
    bodyHtml:
      renderInfoCard("Recent service", "{{serviceSummary}}") +
      `<p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.6;">We really appreciate your time and support.</p>`,
    ctaLabel: "Leave a quick review",
    ctaUrl: "{{reviewUrl}}",
    ctaHint: `Review link: {{reviewUrl}}`,
    showCtaHint: false,
    footerNote: "Thank you for supporting a local business.",
  }),
  bodyText: `{{businessName}}

Thank you for trusting {{businessName}}

Hi {{clientName}},

Thanks again for choosing {{businessName}}.

If your recent visit went well, would you mind taking a minute to leave us a quick review? It helps other customers feel confident booking with us and helps our team keep improving.

Recent service: {{serviceSummary}}

Leave a review: {{reviewUrl}}`,
};

/** Placeholders: clientName, businessName, lastVisit, bookUrl, serviceSummary */
export const lapsedClientReengagement: BuiltinEmailTemplate = {
  subject: "We miss you - {{businessName}}",
  bodyHtml: renderClientShell({
    businessName: "{{businessName}}",
    eyebrow: "We miss you",
    title: "We'd love to see you again",
    introHtml: `<p style="margin:0;">Hi {{clientName}},</p><p style="margin:10px 0 0;">It's been a while since your last visit (<strong>{{lastVisit}}</strong>). We're here whenever you're ready to book.</p>`,
    bodyHtml: renderInfoCard("Recommended next visit", "{{serviceSummary}}"),
    ctaLabel: "Book now",
    ctaUrl: "{{bookUrl}}",
    ctaHint: `Booking link: {{bookUrl}}`,
    showCtaHint: false,
  }),
  bodyText: `{{businessName}}

We'd love to see you again

Hi {{clientName}},

It's been a while since your last visit ({{lastVisit}}). We're here whenever you're ready to book.
{{serviceSummary}}

Book now: {{bookUrl}}`,
};

/** Placeholders: businessName, clientName, vehicle, amount, requestDetails, clientEmail, clientPhone, quoteUrl */
export const quoteRevisionRequestAlert: BuiltinEmailTemplate = {
  subject: "Estimate revision request - {{businessName}}",
  bodyHtml: renderClientShell({
    businessName: "{{businessName}}",
    eyebrow: "Estimate revision request",
    title: "A customer requested estimate changes",
    introHtml:
      `<p style="margin:0;">{{clientName}} asked for revisions on an estimate for <strong>{{vehicle}}</strong> totaling <strong>{{amount}}</strong>.</p>` +
      `<p style="margin:10px 0 0;">Review the request details below and update the estimate if the scope or pricing needs to change.</p>`,
    bodyHtml: renderDetailGrid([
      { label: "Customer", value: "{{clientName}}" },
      { label: "Vehicle", value: "{{vehicle}}" },
      { label: "Estimate total", value: "{{amount}}" },
      { label: "Requested changes", value: "{{requestDetails}}" },
      { label: "Customer email", value: "{{clientEmail}}" },
      { label: "Customer phone", value: "{{clientPhone}}" },
    ]),
    ctaLabel: "Open estimate",
    ctaUrl: "{{quoteUrl}}",
    ctaHint: `Estimate: {{quoteUrl}}`,
    showCtaHint: false,
    footerNote: "This request came from the public estimate page.",
  }),
  bodyText: `{{businessName}}

Estimate revision request

{{clientName}} asked for revisions on an estimate for {{vehicle}} totaling {{amount}}.

Customer: {{clientName}}
Vehicle: {{vehicle}}
Estimate total: {{amount}}
Requested changes: {{requestDetails}}
Customer email: {{clientEmail}}
Customer phone: {{clientPhone}}

Open estimate: {{quoteUrl}}`,
};

/** Placeholders: clientName, businessName, serviceInterest, responseWindow */
export const leadAutoResponse: BuiltinEmailTemplate = {
  subject: "We received your request - {{businessName}}",
  bodyHtml: renderClientShell({
    businessName: "{{businessName}}",
    eyebrow: "Lead received",
    title: "Thanks, we have your request",
    introHtml:
      `<p style="margin:0;">Hi {{clientName}},</p>` +
      `<p style="margin:10px 0 0;">Thanks for reaching out to {{businessName}}.</p>` +
      `<p style="margin:10px 0 0;">Our team has your request and plans to follow up <strong>{{responseWindow}}</strong>.</p>`,
    bodyHtml:
      renderInfoCard("What you asked about", "{{serviceInterest}}") +
      renderInfoCard(
        "What happens next",
        "If we need anything before quoting or booking, we will reach out using the contact details you provided."
      ),
    footerNote: "You do not need to submit the form again unless something changed.",
  }),
  bodyText: `{{businessName}}

We received your request

Hi {{clientName}},

Thanks for reaching out to {{businessName}}.

Our team has your request and plans to follow up {{responseWindow}}.

What you asked about: {{serviceInterest}}

You do not need to submit the form again unless something changed.`,
};

/** Placeholders: businessName, responseWindow, requestUrl */
export const missedCallTextBack: BuiltinEmailTemplate = {
  subject: "We missed your call - {{businessName}}",
  bodyHtml: renderClientShell({
    businessName: "{{businessName}}",
    eyebrow: "Missed call",
    title: "Sorry we missed you",
    introHtml:
      `<p style="margin:0;">Thanks for calling {{businessName}}.</p>` +
      `<p style="margin:10px 0 0;">Our team plans to follow up <strong>{{responseWindow}}</strong>.</p>`,
    bodyHtml:
      renderInfoCard(
        "Need to send details now?",
        "Use the request link below to share your vehicle, service interest, or anything we should know before we reach back."
      ),
    ctaLabel: "Send request",
    ctaUrl: "{{requestUrl}}",
    ctaHint: `Request link: {{requestUrl}}`,
    showCtaHint: false,
    footerNote: "If you already left a voicemail, you do not need to call again.",
  }),
  bodyText: `Sorry we missed your call to {{businessName}}.

Our team plans to follow up {{responseWindow}}.

If you want to send details now, use this request link:
{{requestUrl}}

If you already left a voicemail, you do not need to call again.`,
};

/** Placeholders: ownerName, businessName, clientName, clientEmail, clientPhone, vehicle, serviceInterest, summary */
export const leadFollowUpAlert: BuiltinEmailTemplate = {
  subject: "New lead needs follow-up - {{businessName}}",
  bodyHtml: renderClientShell({
    businessName: "{{businessName}}",
    eyebrow: "Lead follow-up",
    title: "New lead waiting on contact",
    introHtml:
      `<p style="margin:0;">Hi {{ownerName}},</p>` +
      `<p style="margin:10px 0 0;">A new lead just came in and is ready for outreach.</p>`,
    bodyHtml: renderDetailGrid([
      { label: "Lead", value: "{{clientName}}" },
      { label: "Email", value: "{{clientEmail}}" },
      { label: "Phone", value: "{{clientPhone}}" },
      { label: "Vehicle", value: "{{vehicle}}" },
      { label: "Service interest", value: "{{serviceInterest}}" },
      { label: "Notes", value: "{{summary}}" },
    ]),
    footerNote: "Open Strata and move this lead into contact, quote, or booking while the intent is fresh.",
  }),
  bodyText: `{{businessName}}

New lead waiting on contact

Hi {{ownerName}},

A new lead just came in and is ready for outreach.

Lead: {{clientName}}
Email: {{clientEmail}}
Phone: {{clientPhone}}
Vehicle: {{vehicle}}
Service interest: {{serviceInterest}}
Notes: {{summary}}`,
};

/** Placeholders: businessName, weekStart, weekEnd, completedCount, revenueTotal, openInvoicesCount, overdueCount, staffUtilization */
export const weeklySummary: BuiltinEmailTemplate = {
  subject: "Your week at a glance - {{businessName}}",
  bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
  <div class="wrap" style="max-width:560px;margin:0 auto;padding:24px;">
    <div class="brand" style="font-size:18px;font-weight:700;">{{businessName}}</div>
    <h1 style="font-size:20px;margin:0 0 16px;">Weekly summary ({{weekStart}} - {{weekEnd}})</h1>
    <div class="card" style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:24px;margin-bottom:16px;">
      <table class="summary" style="width:100%;border-collapse:collapse;">
        <tr><th style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;text-align:left;">Completed appointments</th><td style="padding:8px 0;border-bottom:1px solid #eee;">{{completedCount}}</td></tr>
        <tr><th style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;text-align:left;">Revenue</th><td style="padding:8px 0;border-bottom:1px solid #eee;">{{revenueTotal}}</td></tr>
        <tr><th style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;text-align:left;">Open invoices</th><td style="padding:8px 0;border-bottom:1px solid #eee;">{{openInvoicesCount}}</td></tr>
        <tr><th style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;text-align:left;">Overdue invoices</th><td style="padding:8px 0;border-bottom:1px solid #eee;">{{overdueCount}}</td></tr>
        <tr><th style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;text-align:left;">Staff utilization</th><td style="padding:8px 0;border-bottom:1px solid #eee;">{{staffUtilization}}</td></tr>
      </table>
    </div>
    <p class="footer" style="margin-top:24px;font-size:12px;color:#9ca3af;">Strata - {{businessName}}</p>
  </div></body></html>`,
  bodyText: `{{businessName}}

Weekly summary ({{weekStart}} - {{weekEnd}})

Completed appointments: {{completedCount}}
Revenue: {{revenueTotal}}
Open invoices: {{openInvoicesCount}}
Overdue invoices: {{overdueCount}}
Staff utilization: {{staffUtilization}}

Strata - {{businessName}}`,
};

const builtins: Record<string, BuiltinEmailTemplate> = {
  password_reset: {
    subject: "Reset your Strata password",
    bodyHtml: renderClientShell({
      businessName: "Strata",
      eyebrow: "Account security",
      title: "Reset your password",
      introHtml: `<p style="margin:0;">Hi {{userName}},</p><p style="margin:10px 0 0;">We received a request to reset the password for your Strata account.</p>`,
      bodyHtml:
        renderInfoCard("What happens next", "Use the secure link below to choose a new password. This link expires in 1 hour.") +
        renderInfoCard("Did not request this?", "You can ignore this email if you did not ask to reset your password. Your current password will stay unchanged."),
      ctaLabel: "Reset password",
      ctaUrl: "{{resetUrl}}",
      ctaHint: `Reset password: {{resetUrl}}`,
      showCtaHint: true,
      footerNote: "Need help? Contact Strata support.",
    }),
    bodyText: `Strata

Reset your password

Hi {{userName}},

We received a request to reset the password for your Strata account.

Use this secure link to choose a new password. This link expires in 1 hour:
{{resetUrl}}

If you did not request this, you can ignore this email and your password will stay unchanged.`,
  },
  team_invite: {
    subject: "You're invited to join {{businessName}} on Strata",
    bodyHtml: renderClientShell({
      businessName: "{{businessName}}",
      eyebrow: "Team access",
      title: "Join your shop on Strata",
      introHtml: `<p style="margin:0;">Hi {{userName}},</p><p style="margin:10px 0 0;">{{inviterName}} added you to <strong>{{businessName}}</strong> on Strata as a <strong>{{roleLabel}}</strong>.</p>`,
      bodyHtml:
        renderInfoCard(
          "Finish setup",
          "Use the secure link below to create or claim your Strata login. Once you finish, your team access will be ready automatically."
        ) +
        renderInfoCard(
          "Already have a Strata account?",
          "If you already use Strata, keep using <strong>{{inviteEmail}}</strong> so we can attach this shop to the right account."
        ),
      ctaLabel: "Accept team invite",
      ctaUrl: "{{inviteUrl}}",
      ctaHint: "Accept team invite: {{inviteUrl}}",
      showCtaHint: true,
      footerNote: "This invite link expires in 7 days. If it expires, ask your shop owner or admin to resend it.",
    }),
    bodyText: `{{businessName}}

Join your shop on Strata

Hi {{userName}},

{{inviterName}} added you to {{businessName}} on Strata as a {{roleLabel}}.

Use this secure link to create or claim your Strata login:
{{inviteUrl}}

If you already use Strata, keep using {{inviteEmail}} so we can attach this shop to the right account.

This invite link expires in 7 days. If it expires, ask your shop owner or admin to resend it.`,
  },
  team_access_ready: {
    subject: "Your Strata team access is ready for {{businessName}}",
    bodyHtml: renderClientShell({
      businessName: "{{businessName}}",
      eyebrow: "Team access",
      title: "Your access is ready",
      introHtml: `<p style="margin:0;">Hi {{userName}},</p><p style="margin:10px 0 0;">Your access to <strong>{{businessName}}</strong> on Strata is now active as a <strong>{{roleLabel}}</strong>.</p>`,
      bodyHtml:
        renderInfoCard(
          "What you can do now",
          "Sign in with your Strata email to view your schedule, assigned work, and the tools your shop gave you access to."
        ) +
        renderInfoCard("Sign in", "Use the secure link below to open Strata and access your shop account."),
      ctaLabel: "Open Strata",
      ctaUrl: "{{signInUrl}}",
      ctaHint: "Open Strata: {{signInUrl}}",
      showCtaHint: true,
      footerNote: "If this access looks wrong, contact your shop owner or admin before using the account.",
    }),
    bodyText: `{{businessName}}

Your access is ready

Hi {{userName}},

Your access to {{businessName}} on Strata is now active as a {{roleLabel}}.

Sign in here:
{{signInUrl}}

If this access looks wrong, contact your shop owner or admin before using the account.`,
  },
  appointment_confirmation: appointmentConfirmation,
  appointment_change_request_alert: appointmentChangeRequestAlert,
  appointment_reminder: appointmentReminder,
  lead_auto_response: leadAutoResponse,
  missed_call_text_back: missedCallTextBack,
  lead_follow_up_alert: leadFollowUpAlert,
  payment_receipt: paymentReceipt,
  review_request: reviewRequest,
  lapsed_client_reengagement: lapsedClientReengagement,
  weekly_summary: weeklySummary,
  quote_revision_request_alert: quoteRevisionRequestAlert,
  customer_portal_link: {
    subject: "Your customer hub from {{businessName}}",
    bodyHtml: renderClientShell({
      businessName: "{{businessName}}",
      eyebrow: "Customer hub",
      title: "Your customer hub is ready",
      introHtml: `<p style="margin:0;">Hi {{clientName}},</p><p style="margin:10px 0 0;">Use your customer hub to review active estimates, unpaid invoices, upcoming appointments, and vehicles in one place.</p>`,
      bodyHtml:
        renderInfoCard("Open your hub", "This secure link keeps all of your active records together so you can review what is open right now.") +
        renderInfoCard("Message from the shop", "{{message}}"),
      ctaLabel: "Open customer hub",
      ctaUrl: "{{portalUrl}}",
      ctaHint: `Customer hub: {{portalUrl}}`,
      showCtaHint: false,
      footerNote: "If you have any questions, contact us directly.<br>{{businessPhone}}<br>{{businessEmail}}<br>{{businessAddress}}",
    }),
    bodyText: `{{businessName}}

Your customer hub is ready

Hi {{clientName}},

Use your customer hub to review active estimates, unpaid invoices, upcoming appointments, and vehicles in one place.
{{message}}

Open customer hub: {{portalUrl}}

If you have any questions, contact us directly.
{{businessPhone}}
{{businessEmail}}
{{businessAddress}}`,
  },
  quote_sent: {
    subject: "Quote for {{vehicle}} from {{businessName}}",
    bodyHtml: renderClientShell({
      businessName: "{{businessName}}",
      eyebrow: "Estimate ready",
      title: "Your quote is ready",
      introHtml: `<p style="margin:0;">Hi {{clientName}},</p><p style="margin:10px 0 0;">We prepared a quote for <strong>{{vehicle}}</strong> totaling <strong>{{amount}}</strong>.</p>`,
      bodyHtml:
        renderInfoCard("Next step", "Review the quote details and contact us if you would like any changes before scheduling.") +
        renderInfoCard("Message from the shop", "{{message}}") +
        renderInfoCard("Customer hub", "View all active estimates, invoices, appointments, and vehicles from one place:<br>{{portalUrl}}"),
      ctaLabel: "View quote",
      ctaUrl: "{{quoteUrl}}",
      ctaHint: `Quote link: {{quoteUrl}}`,
      showCtaHint: false,
      footerNote: "If you have any questions, contact us directly.<br>{{businessPhone}}<br>{{businessEmail}}<br>{{businessAddress}}",
    }),
    bodyText: `{{businessName}}

Your quote is ready

Hi {{clientName}},

We prepared a quote for {{vehicle}} totaling {{amount}}.

Next step: Review the quote details and contact us if you would like any changes before scheduling.
{{message}}

View quote: {{quoteUrl}}

Customer hub: {{portalUrl}}

If you have any questions, contact us directly.
{{businessPhone}}
{{businessEmail}}
{{businessAddress}}`,
  },
  quote_follow_up: {
    subject: "Checking in on your {{businessName}} quote",
    bodyHtml: renderClientShell({
      businessName: "{{businessName}}",
      eyebrow: "Follow-up",
      title: "Checking in on your quote",
      introHtml: `<p style="margin:0;">Hi {{clientName}},</p><p style="margin:10px 0 0;">We wanted to follow up on your quote for <strong>{{vehicle}}</strong> totaling <strong>{{amount}}</strong>.</p>`,
      bodyHtml:
        renderInfoCard("Message from the shop", "{{message}}") +
        renderInfoCard("Customer hub", "View all active estimates, invoices, appointments, and vehicles from one place:<br>{{portalUrl}}"),
      ctaLabel: "Review quote",
      ctaUrl: "{{quoteUrl}}",
      ctaHint: `Quote link: {{quoteUrl}}`,
      showCtaHint: false,
      footerNote: "If you are ready to move forward, contact us directly and we will help with the next step.<br>{{businessPhone}}<br>{{businessEmail}}<br>{{businessAddress}}",
    }),
    bodyText: `{{businessName}}

Checking in on your quote

Hi {{clientName}},

We wanted to follow up on your quote for {{vehicle}} totaling {{amount}}.
{{message}}

Review quote: {{quoteUrl}}

Customer hub: {{portalUrl}}

If you are ready to move forward, contact us directly and we will help with the next step.
{{businessPhone}}
{{businessEmail}}
{{businessAddress}}`,
  },
  invoice_sent: {
    subject: "Invoice {{invoiceNumber}} from {{businessName}}",
    bodyHtml: renderClientShell({
      businessName: "{{businessName}}",
      eyebrow: "Invoice ready",
      title: "Your invoice is ready",
      introHtml: `<p style="margin:0;">Hi {{clientName}},</p><p style="margin:10px 0 0;">Invoice <strong>{{invoiceNumber}}</strong> is ready for <strong>{{amount}}</strong>.</p>`,
      bodyHtml:
        renderInfoCard("Details", "{{invoiceDetailsCopy}}") +
        renderInfoCard("Message from the shop", "{{message}}"),
      ctaLabel: "{{invoicePrimaryLabel}}",
      ctaUrl: "{{invoicePrimaryUrl}}",
      ctaHint: `Primary link: {{invoicePrimaryUrl}}`,
      showCtaHint: false,
      footerNote: "If you have any questions, contact us directly.<br>{{businessPhone}}<br>{{businessEmail}}<br>{{businessAddress}}",
    }),
    bodyText: `{{businessName}}

Your invoice is ready

Hi {{clientName}},

Invoice {{invoiceNumber}} is ready for {{amount}}.

Details: {{invoiceDetailsCopy}}
{{message}}

{{invoicePrimaryLabel}}: {{invoicePrimaryUrl}}

If you have any questions, contact us directly.
{{businessPhone}}
{{businessEmail}}
{{businessAddress}}`,
  },
};

export function getBuiltinTemplate(slug: string): BuiltinEmailTemplate | null {
  return builtins[slug] ?? null;
}

export const EMAIL_TEMPLATE_SLUGS = Object.keys(builtins);

