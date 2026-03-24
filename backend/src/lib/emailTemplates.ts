/**
 * Built-in email templates for client and business owner emails.
 * All placeholders (e.g. {{clientName}}) are replaced with escaped values in sendTemplatedEmail.
 * Fallbacks: use "—" or "N/A" when data is missing.
 */

/** Placeholders: clientName, businessName, dateTime, vehicle, address, serviceSummary, confirmationUrl (use — or leave blank if missing) */
export const appointmentConfirmation = {
  subject: "Appointment confirmed – {{businessName}}",
  bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
  <div class="wrap" style="max-width:560px;margin:0 auto;padding:24px;">
    <div class="card" style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:24px;">
      <div class="brand" style="font-size:18px;font-weight:700;">{{businessName}}</div>
      <h1 style="font-size:20px;margin:0 0 16px;">Appointment confirmed</h1>
      <p>Hi {{clientName}},</p>
      <p>Your appointment is confirmed for <strong>{{dateTime}}</strong>.</p>
      <p>Vehicle: {{vehicle}}</p>
      <p>Address: {{address}}</p>
      <p>{{serviceSummary}}</p>
      <p><a href="{{confirmationUrl}}" style="display:inline-block;padding:10px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:6px;">View details</a></p>
      <p class="muted" style="color:#6b7280;font-size:14px;">If you need to reschedule, please contact us.</p>
    </div>
    <p class="footer" style="margin-top:24px;font-size:12px;color:#9ca3af;">{{businessName}}</p>
  </div></body></html>`,
};

/** Placeholders: clientName, businessName, dateTime, vehicle, serviceSummary */
export const appointmentReminder = {
  subject: "Reminder: appointment tomorrow – {{businessName}}",
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
};

/** Placeholders: clientName, businessName, amount, invoiceNumber, paidAt, method */
export const paymentReceipt = {
  subject: "Payment receipt – {{businessName}}",
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
};

/** Placeholders: clientName, businessName, reviewUrl, serviceSummary */
export const reviewRequest = {
  subject: "How did we do? – {{businessName}}",
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
};

/** Placeholders: clientName, businessName, lastVisit, bookUrl, serviceSummary */
export const lapsedClientReengagement = {
  subject: "We miss you – {{businessName}}",
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
};

/** Placeholders: businessName, weekStart, weekEnd, completedCount, revenueTotal, openInvoicesCount, overdueCount, staffUtilization */
export const weeklySummary = {
  subject: "Your week at a glance – {{businessName}}",
  bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
  <div class="wrap" style="max-width:560px;margin:0 auto;padding:24px;">
    <div class="brand" style="font-size:18px;font-weight:700;">{{businessName}}</div>
    <h1 style="font-size:20px;margin:0 0 16px;">Weekly summary ({{weekStart}} – {{weekEnd}})</h1>
    <div class="card" style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:24px;margin-bottom:16px;">
      <table class="summary" style="width:100%;border-collapse:collapse;">
        <tr><th style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;text-align:left;">Completed appointments</th><td style="padding:8px 0;border-bottom:1px solid #eee;">{{completedCount}}</td></tr>
        <tr><th style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;text-align:left;">Revenue</th><td style="padding:8px 0;border-bottom:1px solid #eee;">{{revenueTotal}}</td></tr>
        <tr><th style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;text-align:left;">Open invoices</th><td style="padding:8px 0;border-bottom:1px solid #eee;">{{openInvoicesCount}}</td></tr>
        <tr><th style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;text-align:left;">Overdue invoices</th><td style="padding:8px 0;border-bottom:1px solid #eee;">{{overdueCount}}</td></tr>
        <tr><th style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;text-align:left;">Staff utilization</th><td style="padding:8px 0;border-bottom:1px solid #eee;">{{staffUtilization}}</td></tr>
      </table>
    </div>
    <p class="footer" style="margin-top:24px;font-size:12px;color:#9ca3af;">Strata – {{businessName}}</p>
  </div></body></html>`,
};

const builtins: Record<string, { subject: string; bodyHtml: string }> = {
  appointment_confirmation: appointmentConfirmation,
  appointment_reminder: appointmentReminder,
  payment_receipt: paymentReceipt,
  review_request: reviewRequest,
  lapsed_client_reengagement: lapsedClientReengagement,
  weekly_summary: weeklySummary,
  quote_sent: {
    subject: "Your quote from {{businessName}}",
    bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:24px;">
        <div style="font-size:18px;font-weight:700;">{{businessName}}</div>
        <h1 style="font-size:20px;margin:0 0 16px;">Your quote is ready</h1>
        <p>Hi {{clientName}},</p>
        <p>We prepared a quote for <strong>{{vehicle}}</strong> totaling <strong>{{amount}}</strong>.</p>
        <p>{{message}}</p>
        <p><a href="{{quoteUrl}}" style="display:inline-block;padding:10px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:6px;">View quote</a></p>
      </div>
    </div></body></html>`,
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
  },
  invoice_sent: {
    subject: "Your invoice from {{businessName}}",
    bodyHtml: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:24px;">
        <div style="font-size:18px;font-weight:700;">{{businessName}}</div>
        <h1 style="font-size:20px;margin:0 0 16px;">Your invoice is ready</h1>
        <p>Hi {{clientName}},</p>
        <p>Invoice <strong>{{invoiceNumber}}</strong> is ready for <strong>{{amount}}</strong>.</p>
        <p>{{message}}</p>
        <p><a href="{{invoiceUrl}}" style="display:inline-block;padding:10px 20px;background:#ea580c;color:#fff;text-decoration:none;border-radius:6px;">View invoice</a></p>
      </div>
    </div></body></html>`,
  },
};

export function getBuiltinTemplate(slug: string): { subject: string; bodyHtml: string } | null {
  return builtins[slug] ?? null;
}

export const EMAIL_TEMPLATE_SLUGS = Object.keys(builtins);
