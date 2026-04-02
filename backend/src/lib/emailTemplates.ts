/**
 * Built-in email templates for client and business owner emails.
 * All placeholders (e.g. {{clientName}}) are replaced with escaped values in sendTemplatedEmail.
 * Fallbacks: use "-" or "N/A" when data is missing.
 */

/** Placeholders: clientName, businessName, dateTime, vehicle, address, serviceSummary, confirmationUrl (use - or leave blank if missing) */
type BuiltinEmailTemplate = {
  subject: string;
  bodyHtml: string;
  bodyText: string;
};

export const appointmentConfirmation: BuiltinEmailTemplate = {
  subject: "Appointment confirmed - {{businessName}}",
  bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
  <div class="wrap" style="max-width:620px;margin:0 auto;padding:28px 18px;background:#f3f6fa;">
    <div class="card" style="overflow:hidden;background:#fff;border-radius:20px;box-shadow:0 18px 50px rgba(15,23,42,0.12);border:1px solid rgba(148,163,184,0.18);">
      <div style="height:6px;background:linear-gradient(90deg,#f97316,#fb923c 38%,#0f172a);"></div>
      <div style="padding:28px 28px 24px;background:radial-gradient(circle at top right,rgba(249,115,22,0.14),transparent 30%),linear-gradient(180deg,rgba(248,250,252,0.96),#fff);">
      <div class="brand" style="font-size:18px;font-weight:700;color:#0f172a;">{{businessName}}</div>
      <div style="margin-top:10px;display:inline-flex;border-radius:999px;padding:6px 10px;background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Confirmed booking</div>
      <h1 style="font-size:28px;line-height:1.05;letter-spacing:-0.03em;margin:14px 0 12px;color:#0f172a;">Appointment confirmed</h1>
      <p>Hi {{clientName}},</p>
      <p style="color:#475569;">Your appointment is confirmed for <strong>{{dateTime}}</strong>.</p>
      <div style="margin:18px 0;border:1px solid #e2e8f0;border-radius:16px;background:#fff;padding:18px;">
        <div style="display:grid;gap:12px;">
          <div><div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;">Vehicle</div><div style="margin-top:4px;color:#0f172a;font-weight:600;">{{vehicle}}</div></div>
          <div><div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;">Address</div><div style="margin-top:4px;color:#0f172a;font-weight:600;">{{address}}</div></div>
          <div><div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;">Service details</div><div style="margin-top:4px;color:#475569;">{{serviceSummary}}</div></div>
        </div>
      </div>
      <div style="border-radius:16px;border:1px solid rgba(15,23,42,0.08);background:linear-gradient(180deg,rgba(15,23,42,0.03),rgba(255,255,255,0.98));padding:16px;color:#475569;font-size:14px;">
        If you need to reschedule or update anything before the appointment, reply to this email or contact the shop directly.
      </div>
      </div>
    </div>
    <p class="footer" style="margin-top:18px;font-size:12px;color:#94a3b8;text-align:center;">{{businessName}}</p>
  </div></body></html>`,
  bodyText: `{{businessName}}

Appointment confirmed

Hi {{clientName}},

Your appointment is confirmed for {{dateTime}}.

Vehicle: {{vehicle}}
Address: {{address}}
Service details: {{serviceSummary}}

If you need to reschedule or update anything before the appointment, reply to this email or contact the shop directly.`,
};

/** Placeholders: clientName, businessName, dateTime, vehicle, serviceSummary */
export const appointmentReminder: BuiltinEmailTemplate = {
  subject: "Reminder: appointment tomorrow - {{businessName}}",
  bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
  <div class="wrap" style="max-width:560px;margin:0 auto;padding:24px;">
    <div class="card" style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:24px;">
      <div class="brand" style="font-size:18px;font-weight:700;">{{businessName}}</div>
      <h1 style="font-size:20px;margin:0 0 16px;">Appointment reminder</h1>
      <p>Hi {{clientName}},</p>
      <p>This is a friendly reminder that your appointment is scheduled for <strong>{{dateTime}}</strong>.</p>
      <p>Vehicle: {{vehicle}}</p>
      <p>{{serviceSummary}}</p>
      <p class="muted" style="color:#6b7280;font-size:14px;">See you soon!</p>
    </div>
    <p class="footer" style="margin-top:24px;font-size:12px;color:#9ca3af;">{{businessName}}</p>
  </div></body></html>`,
  bodyText: `{{businessName}}

Appointment reminder

Hi {{clientName}},

This is a friendly reminder that your appointment is scheduled for {{dateTime}}.
Vehicle: {{vehicle}}
Service details: {{serviceSummary}}

See you soon!`,
};

/** Placeholders: clientName, businessName, amount, invoiceNumber, paidAt, method */
export const paymentReceipt: BuiltinEmailTemplate = {
  subject: "Payment receipt - {{businessName}}",
  bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
  <div class="wrap" style="max-width:560px;margin:0 auto;padding:24px;">
    <div class="card" style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:24px;">
      <div class="brand" style="font-size:18px;font-weight:700;">{{businessName}}</div>
      <h1 style="font-size:20px;margin:0 0 16px;">Payment received</h1>
      <p>Hi {{clientName}},</p>
      <p>We received your payment of <strong>{{amount}}</strong> for invoice {{invoiceNumber}}.</p>
      <p class="muted" style="color:#6b7280;">Paid on {{paidAt}} via {{method}}. Thank you!</p>
    </div>
    <p class="footer" style="margin-top:24px;font-size:12px;color:#9ca3af;">{{businessName}}</p>
  </div></body></html>`,
  bodyText: `{{businessName}}

Payment received

Hi {{clientName}},

We received your payment of {{amount}} for invoice {{invoiceNumber}}.
Paid on {{paidAt}} via {{method}}.

Thank you!`,
};

/** Placeholders: clientName, businessName, reviewUrl, serviceSummary */
export const reviewRequest: BuiltinEmailTemplate = {
  subject: "How did we do? - {{businessName}}",
  bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
  <div class="wrap" style="max-width:560px;margin:0 auto;padding:24px;">
    <div class="card" style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:24px;">
      <div class="brand" style="font-size:18px;font-weight:700;">{{businessName}}</div>
      <h1 style="font-size:20px;margin:0 0 16px;">We'd love your feedback</h1>
      <p>Hi {{clientName}},</p>
      <p>Thank you for choosing us. Your opinion helps us improve.</p>
      <p>{{serviceSummary}}</p>
      <p><a href="{{reviewUrl}}" style="display:inline-block;padding:10px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:6px;">Leave a review</a></p>
    </div>
    <p class="footer" style="margin-top:24px;font-size:12px;color:#9ca3af;">{{businessName}}</p>
  </div></body></html>`,
  bodyText: `{{businessName}}

We'd love your feedback

Hi {{clientName}},

Thank you for choosing us. Your opinion helps us improve.
{{serviceSummary}}

Leave a review: {{reviewUrl}}`,
};

/** Placeholders: clientName, businessName, lastVisit, bookUrl, serviceSummary */
export const lapsedClientReengagement: BuiltinEmailTemplate = {
  subject: "We miss you - {{businessName}}",
  bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
  <div class="wrap" style="max-width:560px;margin:0 auto;padding:24px;">
    <div class="card" style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:24px;">
      <div class="brand" style="font-size:18px;font-weight:700;">{{businessName}}</div>
      <h1 style="font-size:20px;margin:0 0 16px;">We'd love to see you again</h1>
      <p>Hi {{clientName}},</p>
      <p>It's been a while since your last visit ({{lastVisit}}). We're here whenever you're ready to book.</p>
      <p>{{serviceSummary}}</p>
      <p><a href="{{bookUrl}}" style="display:inline-block;padding:10px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:6px;">Book now</a></p>
    </div>
    <p class="footer" style="margin-top:24px;font-size:12px;color:#9ca3af;">{{businessName}}</p>
  </div></body></html>`,
  bodyText: `{{businessName}}

We'd love to see you again

Hi {{clientName}},

It's been a while since your last visit ({{lastVisit}}). We're here whenever you're ready to book.
{{serviceSummary}}

Book now: {{bookUrl}}`,
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
  appointment_confirmation: appointmentConfirmation,
  appointment_reminder: appointmentReminder,
  payment_receipt: paymentReceipt,
  review_request: reviewRequest,
  lapsed_client_reengagement: lapsedClientReengagement,
  weekly_summary: weeklySummary,
  quote_sent: {
    subject: "Your quote from {{businessName}}",
    bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
    <div style="max-width:620px;margin:0 auto;padding:28px 18px;background:#f3f6fa;">
      <div style="overflow:hidden;background:#fff;border-radius:20px;box-shadow:0 18px 50px rgba(15,23,42,0.12);border:1px solid rgba(148,163,184,0.18);">
        <div style="height:6px;background:linear-gradient(90deg,#f97316,#fb923c 38%,#0f172a);"></div>
        <div style="padding:28px;background:radial-gradient(circle at top right,rgba(249,115,22,0.14),transparent 30%),linear-gradient(180deg,rgba(248,250,252,0.96),#fff);">
        <div style="font-size:18px;font-weight:700;color:#0f172a;">{{businessName}}</div>
        <div style="margin-top:10px;display:inline-flex;border-radius:999px;padding:6px 10px;background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Estimate ready</div>
        <h1 style="font-size:28px;line-height:1.05;letter-spacing:-0.03em;margin:14px 0 16px;color:#0f172a;">Your quote is ready</h1>
        <p>Hi {{clientName}},</p>
        <p style="color:#475569;">We prepared a quote for <strong>{{vehicle}}</strong> totaling <strong>{{amount}}</strong>.</p>
        <div style="margin:18px 0;border:1px solid #e2e8f0;border-radius:16px;background:#fff;padding:18px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;">Next step</div>
          <div style="margin-top:6px;color:#475569;">Review the quote details, pricing, and scope, then let us know when you are ready to move forward.</div>
        </div>
        <p style="color:#475569;">{{message}}</p>
        <p style="margin:22px 0 0;"><a href="{{quoteUrl}}" style="display:inline-block;padding:12px 22px;background:#ea580c;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;">View quote</a></p>
        </div>
      </div>
    </div></body></html>`,
    bodyText: `{{businessName}}

Your quote is ready

Hi {{clientName}},

We prepared a quote for {{vehicle}} totaling {{amount}}.

Next step: Review the quote details, pricing, and scope, then let us know when you are ready to move forward.
{{message}}

View quote: {{quoteUrl}}`,
  },
  quote_follow_up: {
    subject: "Following up on your quote from {{businessName}}",
    bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:24px;">
        <div style="font-size:18px;font-weight:700;">{{businessName}}</div>
        <h1 style="font-size:20px;margin:0 0 16px;">Checking in on your quote</h1>
        <p>Hi {{clientName}},</p>
        <p>We wanted to follow up on your quote for <strong>{{vehicle}}</strong> totaling <strong>{{amount}}</strong>.</p>
        <p>{{message}}</p>
        <p><a href="{{quoteUrl}}" style="display:inline-block;padding:10px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:6px;">Review quote</a></p>
      </div>
    </div></body></html>`,
    bodyText: `{{businessName}}

Checking in on your quote

Hi {{clientName}},

We wanted to follow up on your quote for {{vehicle}} totaling {{amount}}.
{{message}}

Review quote: {{quoteUrl}}`,
  },
  invoice_sent: {
    subject: "Your invoice from {{businessName}}",
    bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
    <div style="max-width:620px;margin:0 auto;padding:28px 18px;background:#f3f6fa;">
      <div style="overflow:hidden;background:#fff;border-radius:20px;box-shadow:0 18px 50px rgba(15,23,42,0.12);border:1px solid rgba(148,163,184,0.18);">
        <div style="height:6px;background:linear-gradient(90deg,#f97316,#fb923c 38%,#0f172a);"></div>
        <div style="padding:28px;background:radial-gradient(circle at top right,rgba(249,115,22,0.14),transparent 30%),linear-gradient(180deg,rgba(248,250,252,0.96),#fff);">
        <div style="font-size:18px;font-weight:700;color:#0f172a;">{{businessName}}</div>
        <div style="margin-top:10px;display:inline-flex;border-radius:999px;padding:6px 10px;background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Invoice ready</div>
        <h1 style="font-size:28px;line-height:1.05;letter-spacing:-0.03em;margin:14px 0 16px;color:#0f172a;">Your invoice is ready</h1>
        <p>Hi {{clientName}},</p>
        <p style="color:#475569;">Invoice <strong>{{invoiceNumber}}</strong> is ready for <strong>{{amount}}</strong>.</p>
        <div style="margin:18px 0;border:1px solid #e2e8f0;border-radius:16px;background:#fff;padding:18px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;">Billing summary</div>
          <div style="margin-top:6px;color:#475569;">Open the invoice to review the completed work, payment status, and your service record details.</div>
        </div>
        <p style="color:#475569;">{{message}}</p>
        <p style="margin:22px 0 0;"><a href="{{invoiceUrl}}" style="display:inline-block;padding:12px 22px;background:#ea580c;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;">View invoice</a></p>
        </div>
      </div>
    </div></body></html>`,
    bodyText: `{{businessName}}

Your invoice is ready

Hi {{clientName}},

Invoice {{invoiceNumber}} is ready for {{amount}}.

Billing summary: Open the invoice to review the completed work, payment status, and your service record details.
{{message}}

View invoice: {{invoiceUrl}}`,
  },
};

export function getBuiltinTemplate(slug: string): BuiltinEmailTemplate | null {
  return builtins[slug] ?? null;
}

export const EMAIL_TEMPLATE_SLUGS = Object.keys(builtins);

