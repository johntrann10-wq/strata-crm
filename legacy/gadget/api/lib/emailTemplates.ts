import { esc } from './escapeHtml';

// ─── Shared Utilities ────────────────────────────────────────────────────────

export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export const formatDatetime = (iso: string | Date | null | undefined, timezone?: string): string => {
  if (!iso) return 'your scheduled time';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return 'your scheduled time';
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (timezone) options.timeZone = timezone;
    return date.toLocaleDateString('en-US', options);
  } catch {
    return 'your scheduled time';
  }
};

export const formatTime = (iso: string | Date | null | undefined, timezone?: string): string => {
  if (!iso) return '';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return '';
    const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
    if (timezone) options.timeZone = timezone;
    return date.toLocaleTimeString('en-US', options);
  } catch {
    return '';
  }
};

// ─── Private Layout Helpers ───────────────────────────────────────────────────

const baseLayout = (businessName: string, accentColor: string, content: string, year?: number): string => {
  const currentYear = year ?? new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(businessName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:${esc(accentColor)};padding:32px 40px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${esc(businessName)}</p>
        </td></tr>
        <tr><td style="padding:40px 40px 32px 40px;color:#374151;">${content}</td></tr>
        <tr><td style="background-color:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;">This email was sent by ${esc(businessName)}. Please do not reply directly to this email.</p>
          <p style="margin:0;font-size:12px;color:#d1d5db;">&copy; ${currentYear} ${esc(businessName)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const infoBox = (label: string, value: string, colorScheme: 'default' | 'success' | 'warning' | 'danger' = 'default'): string => {
  const schemes = {
    default: { border: '#4f46e5', bg: '#f0f4ff' },
    success: { border: '#22c55e', bg: '#f0fdf4' },
    warning: { border: '#f59e0b', bg: '#fffbeb' },
    danger:  { border: '#ef4444', bg: '#fff5f5' },
  };
  const { border, bg } = schemes[colorScheme];
  const labelEl = label
    ? `<p style="margin:0 0 6px 0;font-size:12px;font-weight:600;color:${border};text-transform:uppercase;letter-spacing:0.8px;">${esc(label)}</p>`
    : '';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr>
    <td style="background-color:${bg};border-left:4px solid ${border};border-radius:4px;padding:16px 20px;">
      ${labelEl}<p style="margin:0;font-size:15px;color:#1f2937;line-height:1.6;">${value}</p>
    </td></tr></table>`;
};

const detailRow = (label: string, value: string): string =>
  `<tr>
    <td style="padding:10px 16px;font-size:14px;color:#6b7280;width:38%;vertical-align:top;border-bottom:1px solid #e5e7eb;">${esc(label)}</td>
    <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#111827;vertical-align:top;border-bottom:1px solid #e5e7eb;">${value}</td>
  </tr>`;

const detailsCard = (rows: string[]): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f9fafb;border-collapse:collapse;">
    <tbody>${rows.join('')}</tbody>
  </table>`;

const ctaButton = (href: string, label: string, color = '#4f46e5'): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td align="center">
    <a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
      style="display:inline-block;background-color:${esc(color)};color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 36px;border-radius:6px;letter-spacing:0.3px;">${esc(label)}</a>
  </td></tr></table>`;

const lineItemsTable = (
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>,
  subtotal: number,
  taxAmount?: number,
  taxRate?: number,
  discountAmount?: number,
  total?: number,
): string => {
  const rows = items.map((item) =>
    `<tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${esc(item.description)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:center;">${item.quantity}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:right;">${formatCurrency(item.unitPrice)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#111827;text-align:right;">${formatCurrency(item.total)}</td>
    </tr>`
  ).join('');
  const taxLabel = taxRate ? `Tax (${taxRate}%)` : 'Tax';
  const taxRow = taxAmount && taxAmount > 0
    ? `<tr><td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${taxLabel}</td><td style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(taxAmount)}</td></tr>`
    : '';
  const discountRow = discountAmount && discountAmount > 0
    ? `<tr><td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">Discount</td><td style="padding:8px 16px;font-size:14px;color:#ef4444;text-align:right;">-${formatCurrency(discountAmount)}</td></tr>`
    : '';
  const totalAmount = total ?? subtotal;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;overflow:hidden;">
  <thead><tr style="background-color:#111827;">
    <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:left;text-transform:uppercase;letter-spacing:0.6px;">Description</th>
    <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:center;text-transform:uppercase;letter-spacing:0.6px;">Qty</th>
    <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Unit Price</th>
    <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Total</th>
  </tr></thead>
  <tbody>
    ${rows}
    <tr style="background-color:#f9fafb;"><td colspan="3" style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">Subtotal</td><td style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(subtotal)}</td></tr>
    ${discountRow}${taxRow}
    <tr style="background-color:#f0f4ff;"><td colspan="3" style="padding:14px 16px;font-size:16px;font-weight:700;color:#111827;text-align:right;">Total Due</td><td style="padding:14px 16px;font-size:16px;font-weight:700;color:#4f46e5;text-align:right;">${formatCurrency(totalAmount)}</td></tr>
  </tbody>
</table>`;
};

const reviewButtons = (links: { google?: string | null; yelp?: string | null; facebook?: string | null }): string => {
  const buttons: string[] = [];
  if (links.google) buttons.push(`<a href="${esc(links.google)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#4285f4;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Google</a>`);
  if (links.yelp)   buttons.push(`<a href="${esc(links.yelp)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#d32323;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Yelp</a>`);
  if (links.facebook) buttons.push(`<a href="${esc(links.facebook)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#1877f2;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Facebook</a>`);
  if (buttons.length === 0) return `<p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6;">We'd love to hear your feedback! Please search for us online to leave a review.</p>`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center">${buttons.join('\n')}</td></tr></table>`;
};

const contactBlock = (phone?: string | null, email?: string | null): string => {
  if (!phone && !email) return '';
  const parts: string[] = [];
  if (phone) parts.push(`Phone: <a href="tel:${esc(phone)}" style="color:#4f46e5;text-decoration:none;">${esc(phone)}</a>`);
  if (email) parts.push(`Email: <a href="mailto:${esc(email)}" style="color:#4f46e5;text-decoration:none;">${esc(email)}</a>`);
  return `<p style="margin:16px 0 0 0;font-size:14px;color:#6b7280;line-height:1.8;">${parts.join(' &nbsp;|&nbsp; ')}</p>`;
};

// ─── Exported Email Templates ─────────────────────────────────────────────────

export const appointmentConfirmationEmail = (params: {
  clientFirstName: string;
  businessName: string;
  appointmentDate?: string;
  appointmentTime?: string;
  vehicleDescription?: string;
  endTime?: string;
  mobileAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  customMessage?: string;
}): string => {
  const { clientFirstName, businessName, appointmentDate, appointmentTime, vehicleDescription, endTime, mobileAddress, businessPhone, businessEmail, customMessage } = params;
  const rows: string[] = [];
  if (appointmentDate) rows.push(detailRow('Date', esc(appointmentDate)));
  if (appointmentTime) rows.push(detailRow('Time', esc(appointmentTime)));
  if (endTime) rows.push(detailRow('Estimated End', esc(endTime)));
  if (vehicleDescription) rows.push(detailRow('Vehicle', esc(vehicleDescription)));
  if (mobileAddress) rows.push(detailRow('Location', esc(mobileAddress)));
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Confirmed &#x2713;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, your appointment has been booked.</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">We've received your booking request at <strong>${esc(businessName)}</strong> and will confirm it shortly.</p>
    ${rows.length > 0 ? detailsCard(rows) : ''}
    ${customMessage ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(customMessage)}</p>` : ''}
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Best regards,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const appointmentReminderEmail = (params: {
  clientFirstName: string;
  businessName: string;
  appointmentDate?: string;
  appointmentTime?: string;
  vehicleDescription?: string;
  mobileAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  customMessage?: string;
}): string => {
  const { clientFirstName, businessName, appointmentDate, appointmentTime, vehicleDescription, mobileAddress, businessPhone, businessEmail, customMessage } = params;
  const rows: string[] = [];
  if (appointmentDate) rows.push(detailRow('Date', esc(appointmentDate)));
  if (appointmentTime) rows.push(detailRow('Time', esc(appointmentTime)));
  if (vehicleDescription) rows.push(detailRow('Vehicle', esc(vehicleDescription)));
  if (mobileAddress) rows.push(detailRow('Location', esc(mobileAddress)));
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Reminder &#x1F514;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, your appointment is coming up soon.</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">This is a friendly reminder about your upcoming appointment at <strong>${esc(businessName)}</strong>.</p>
    ${rows.length > 0 ? detailsCard(rows) : ''}
    ${customMessage ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(customMessage)}</p>` : ''}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">Please arrive a few minutes early. If you need to reschedule, contact us as soon as possible.</p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">See you soon,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const appointmentCancellationEmail = (params: {
  clientFirstName: string;
  businessName: string;
  reason?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, reason, businessPhone, businessEmail } = params;
  const boxValue = `Your appointment at <strong>${esc(businessName)}</strong> has been cancelled. We apologize for any inconvenience.${reason ? `<br /><br /><strong>Reason:</strong> ${esc(reason)}` : ''}`;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Cancelled</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we're sorry to inform you about your appointment.</p>
    ${infoBox('', boxValue, 'danger')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">We'd love to reschedule at a time that works for you. Please contact us to book again.</p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Sincerely,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const jobCompleteEmail = (params: {
  clientFirstName: string;
  businessName: string;
  vehicleDescription?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, vehicleDescription, businessPhone, businessEmail } = params;
  const vehicleText = vehicleDescription ? esc(vehicleDescription) : 'Your vehicle';
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Your Vehicle is Ready! &#x1F697;&#x2728;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, great news!</p>
    ${infoBox('', `&#x2713; Work complete &#x2014; ${vehicleText} is ready for pickup at <strong>${esc(businessName)}</strong>.`, 'success')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">Our team has finished and everything is looking great. You can pick up at your convenience during business hours.</p>
    <p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">If you have any questions or need to make arrangements, please don't hesitate to reach out.</p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Thank you for choosing us,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const reviewRequestEmail = (params: {
  clientFirstName: string;
  businessName: string;
  googleReviewLink?: string;
  yelpReviewLink?: string;
  facebookReviewLink?: string;
  customMessage?: string;
}): string => {
  const { clientFirstName, businessName, googleReviewLink, yelpReviewLink, facebookReviewLink, customMessage } = params;
  const hasLinks = !!(googleReviewLink || yelpReviewLink || facebookReviewLink);
  const reviewSection = hasLinks
    ? reviewButtons({ google: googleReviewLink, yelp: yelpReviewLink, facebook: facebookReviewLink })
    : `<p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6;">You can find us on Google Maps by searching for <strong>${esc(businessName)}</strong> to leave a review.</p>`;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">How Did We Do? &#x2B50;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we hope your experience was exceptional!</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">Thank you for choosing <strong>${esc(businessName)}</strong>! Your feedback helps us improve.</p>
    ${customMessage ? `<p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">${esc(customMessage)}</p>` : ''}
    ${reviewSection}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Thank you again for your business!<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const invoiceSentEmail = (params: {
  clientFirstName: string;
  businessName: string;
  invoiceNumber: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  taxAmount: number;
  taxRate?: number;
  discountAmount: number;
  total: number;
  dueDate?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, invoiceNumber, lineItems, subtotal, taxAmount, taxRate, discountAmount, total, dueDate, businessPhone, businessEmail } = params;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Invoice #${esc(invoiceNumber)}</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, please find your invoice from ${esc(businessName)} below.</p>
    ${dueDate ? infoBox('', `Payment due by <strong>${esc(dueDate)}</strong>.`, 'warning') : ''}
    ${lineItemsTable(lineItems, subtotal, taxAmount, taxRate, discountAmount, total)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">If you have any questions about this invoice, please don't hesitate to contact us.</p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Thank you for your business,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const paymentReceiptEmail = (params: {
  clientFirstName: string;
  businessName: string;
  invoiceNumber: string;
  amountPaid: number;
  invoiceTotal: number;
  remainingBalance: number;
  paymentMethod?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, invoiceNumber, amountPaid, invoiceTotal, remainingBalance, paymentMethod, businessPhone, businessEmail } = params;
  const rows: string[] = [
    detailRow('Invoice', `#${esc(invoiceNumber)}`),
    detailRow('Amount Paid', formatCurrency(amountPaid)),
  ];
  if (paymentMethod) rows.push(detailRow('Payment Method', esc(paymentMethod)));
  rows.push(detailRow('Invoice Total', formatCurrency(invoiceTotal)));
  rows.push(detailRow('Remaining Balance', formatCurrency(remainingBalance)));
  const balanceBox = remainingBalance <= 0
    ? infoBox('', '&#x2713; Paid in full &#x2014; Thank you!', 'success')
    : infoBox('', `Remaining balance: <strong>${formatCurrency(remainingBalance)}</strong>. Please arrange payment at your convenience.`, 'warning');
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Payment Received &#x2713;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we've received your payment. Here are the details:</p>
    ${detailsCard(rows)}
    ${balanceBox}
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Thank you for your business,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const quoteSentEmail = (params: {
  clientFirstName: string;
  businessName: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  taxAmount?: number;
  taxRate?: number;
  total: number;
  acceptUrl: string;
  expiresAt?: string;
  notes?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, lineItems, subtotal, taxAmount, taxRate, total, acceptUrl, expiresAt, notes, businessPhone, businessEmail } = params;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Your Quote is Ready &#x1F4CB;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, please find your quote from ${esc(businessName)} below.</p>
    ${expiresAt ? infoBox('', `This quote expires on <strong>${esc(expiresAt)}</strong>.`, 'warning') : ''}
    ${lineItemsTable(lineItems, subtotal, taxAmount, taxRate, undefined, total)}
    ${notes ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(notes)}</p>` : ''}
    ${ctaButton(acceptUrlimport { esc } from './escapeHtml';

// ─── Shared Utilities ────────────────────────────────────────────────────────

export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export const formatDatetime = (iso: string | Date | null | undefined, timezone?: string): string => {
  if (!iso) return 'your scheduled time';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return 'your scheduled time';
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (timezone) options.timeZone = timezone;
    return date.toLocaleDateString('en-US', options);
  } catch { return 'your scheduled time'; }
};

export const formatTime = (iso: string | Date | null | undefined, timezone?: string): string => {
  if (!iso) return '';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return '';
    const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
    if (timezone) options.timeZone = timezone;
    return date.toLocaleTimeString('en-US', options);
  } catch { return ''; }
};

// ─── Private Layout Helpers ───────────────────────────────────────────────────

const baseLayout = (businessName: string, accentColor: string, content: string, year?: number): string => {
  const currentYear = year ?? new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(businessName)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:${esc(accentColor)};padding:32px 40px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${esc(businessName)}</p>
        </td></tr>
        <tr><td style="padding:40px 40px 32px 40px;color:#374151;">${content}</td></tr>
        <tr><td style="background-color:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;">This email was sent by ${esc(businessName)}. Please do not reply directly to this email.</p>
          <p style="margin:0;font-size:12px;color:#d1d5db;">&copy; ${currentYear} ${esc(businessName)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const infoBox = (label: string, value: string, colorScheme: 'default' | 'success' | 'warning' | 'danger' = 'default'): string => {
  const schemes = {
    default: { border: '#4f46e5', bg: '#f0f4ff' },
    success: { border: '#22c55e', bg: '#f0fdf4' },
    warning: { border: '#f59e0b', bg: '#fffbeb' },
    danger:  { border: '#ef4444', bg: '#fff5f5' },
  };
  const { border, bg } = schemes[colorScheme];
  const labelEl = label
    ? `<p style="margin:0 0 6px 0;font-size:12px;font-weight:600;color:${border};text-transform:uppercase;letter-spacing:0.8px;">${esc(label)}</p>`
    : '';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr>
    <td style="background-color:${bg};border-left:4px solid ${border};border-radius:4px;padding:16px 20px;">
      ${labelEl}<p style="margin:0;font-size:15px;color:#1f2937;line-height:1.6;">${value}</p>
    </td></tr></table>`;
};

const detailRow = (label: string, value: string): string =>
  `<tr>
    <td style="padding:10px 16px;font-size:14px;color:#6b7280;width:38%;vertical-align:top;border-bottom:1px solid #e5e7eb;">${esc(label)}</td>
    <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#111827;vertical-align:top;border-bottom:1px solid #e5e7eb;">${value}</td>
  </tr>`;

const detailsCard = (rows: string[]): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f9fafb;border-collapse:collapse;">
    <tbody>${rows.join('')}</tbody>
  </table>`;

const ctaButton = (href: string, label: string, color = '#4f46e5'): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td align="center">
    <a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
      style="display:inline-block;background-color:${esc(color)};color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 36px;border-radius:6px;letter-spacing:0.3px;">${esc(label)}</a>
  </td></tr></table>`;

const lineItemsTable = (
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>,
  subtotal: number, taxAmount?: number, taxRate?: number, discountAmount?: number, total?: number
): string => {
  const rows = items.map((item) =>
    `<tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${esc(item.description)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:center;">${item.quantity}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:right;">${formatCurrency(item.unitPrice)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#111827;text-align:right;">${formatCurrency(item.total)}</td>
    </tr>`).join('');
  const taxLabel = taxRate ? `Tax (${taxRate}%)` : 'Tax';
  const taxRow = taxAmount && taxAmount > 0
    ? `<tr><td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${taxLabel}</td><td style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(taxAmount)}</td></tr>`
    : '';
  const discountRow = discountAmount && discountAmount > 0
    ? `<tr><td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">Discount</td><td style="padding:8px 16px;font-size:14px;color:#ef4444;text-align:right;">-${formatCurrency(discountAmount)}</td></tr>`
    : '';
  const totalAmount = total ?? subtotal;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;overflow:hidden;">
  <thead><tr style="background-color:#111827;">
    <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:left;text-transform:uppercase;letter-spacing:0.6px;">Description</th>
    <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:center;text-transform:uppercase;letter-spacing:0.6px;">Qty</th>
    <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Unit Price</th>
    <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Total</th>
  </tr></thead>
  <tbody>
    ${rows}
    <tr style="background-color:#f9fafb;"><td colspan="3" style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">Subtotal</td><td style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(subtotal)}</td></tr>
    ${discountRow}${taxRow}
    <tr style="background-color:#f0f4ff;"><td colspan="3" style="padding:14px 16px;font-size:16px;font-weight:700;color:#111827;text-align:right;">Total Due</td><td style="padding:14px 16px;font-size:16px;font-weight:700;color:#4f46e5;text-align:right;">${formatCurrency(totalAmount)}</td></tr>
  </tbody>
</table>`;
};

const reviewButtons = (links: { google?: string | null; yelp?: string | null; facebook?: string | null }): string => {
  const buttons: string[] = [];
  if (links.google) buttons.push(`<a href="${esc(links.google)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#4285f4;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Google</a>`);
  if (links.yelp)   buttons.push(`<a href="${esc(links.yelp)}"   target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#d32323;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Yelp</a>`);
  if (links.facebook) buttons.push(`<a href="${esc(links.facebook)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#1877f2;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Facebook</a>`);
  if (buttons.length === 0) return `<p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6;">We'd love to hear your feedback! Please search for us online to leave a review.</p>`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center">${buttons.join('\n')}</td></tr></table>`;
};

const contactBlock = (phone?: string | null, email?: string | null): string => {
  if (!phone && !email) return '';
  const parts: string[] = [];
  if (phone) parts.push(`Phone: <a href="tel:${esc(phone)}" style="color:#4f46e5;text-decoration:none;">${esc(phone)}</a>`);
  if (email) parts.push(`Email: <a href="mailto:${esc(email)}" style="color:#4f46e5;text-decoration:none;">${esc(email)}</a>`);
  return `<p style="margin:16px 0 0 0;font-size:14px;color:#6b7280;line-height:1.8;">${parts.join(' &nbsp;|&nbsp; ')}</p>`;
};

// ─── Exported Email Templates ─────────────────────────────────────────────────

export const appointmentConfirmationEmail = (params: {
  clientFirstName: string; businessName: string; appointmentDate?: string; appointmentTime?: string;
  vehicleDescription?: string; endTime?: string; mobileAddress?: string;
  businessPhone?: string; businessEmail?: string; customMessage?: string;
}): string => {
  const { clientFirstName, businessName, appointmentDate, appointmentTime, vehicleDescription, endTime, mobileAddress, businessPhone, businessEmail, customMessage } = params;
  const rows: string[] = [];
  if (appointmentDate) rows.push(detailRow('Date', esc(appointmentDate)));
  if (appointmentTime) rows.push(detailRow('Time', esc(appointmentTime)));
  if (endTime) rows.push(detailRow('Estimated End', esc(endTime)));
  if (vehicleDescription) rows.push(detailRow('Vehicle', esc(vehicleDescription)));
  if (mobileAddress) rows.push(detailRow('Location', esc(mobileAddress)));
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Confirmed &#x2713;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, your appointment has been booked.</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">We've received your booking request at <strong>${esc(businessName)}</strong> and will confirm it shortly.</p>
    ${rows.length > 0 ? detailsCard(rows) : ''}
    ${customMessage ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(customMessage)}</p>` : ''}
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Best regards,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const appointmentReminderEmail = (params: {
  clientFirstName: string; businessName: string; appointmentDate?: string; appointmentTime?: string;
  vehicleDescription?: string; mobileAddress?: string; businessPhone?: string; businessEmail?: string; customMessage?: string;
}): string => {
  const { clientFirstName, businessName, appointmentDate, appointmentTime, vehicleDescription, mobileAddress, businessPhone, businessEmail, customMessage } = params;
  const rows: string[] = [];
  if (appointmentDate) rows.push(detailRow('Date', esc(appointmentDate)));
  if (appointmentTime) rows.push(detailRow('Time', esc(appointmentTime)));
  if (vehicleDescription) rows.push(detailRow('Vehicle', esc(vehicleDescription)));
  if (mobileAddress) rows.push(detailRow('Location', esc(mobileAddress)));
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Reminder &#x1F514;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, your appointment is coming up soon.</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">This is a friendly reminder about your upcoming appointment at <strong>${esc(businessName)}</strong>.</p>
    ${rows.length > 0 ? detailsCard(rows) : ''}
    ${customMessage ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(customMessage)}</p>` : ''}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">Please arrive a few minutes early. If you need to reschedule, contact us as soon as possible.</p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">See you soon,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const appointmentCancellationEmail = (params: {
  clientFirstName: string; businessName: string; reason?: string; businessPhone?: string; businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, reason, businessPhone, businessEmail } = params;
  const boxValue = `Your appointment at <strong>${esc(businessName)}</strong> has been cancelled. We apologize for any inconvenience.${reason ? `<br /><br /><strong>Reason:</strong> ${esc(reason)}` : ''}`;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Cancelled</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we're sorry to inform you about your appointment.</p>
    ${infoBox('', boxValue, 'danger')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">We'd love to reschedule at a time that works for you. Please contact us to book again.</p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Sincerely,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const jobCompleteEmail = (params: {
  clientFirstName: string; businessName: string; vehicleDescription?: string; businessPhone?: string; businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, vehicleDescription, businessPhone, businessEmail } = params;
  const vehicleText = vehicleDescription ? esc(vehicleDescription) : 'Your vehicle';
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Your Vehicle is Ready! &#x1F697;&#x2728;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, great news!</p>
    ${infoBox('', `&#x2713; Work complete &#x2014; ${vehicleText} is ready for pickup at <strong>${esc(businessName)}</strong>.`, 'success')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">Our team has finished and everything is looking great. You can pick up at your convenience during business hours.</p>
    <p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">If you have any questions or need to make arrangements, please don't hesitate to reach out.</p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Thank you for choosing us,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const reviewRequestEmail = (params: {
  clientFirstName: string; businessName: string; googleReviewLink?: string; yelpReviewLink?: string;
  facebookReviewLink?: string; customMessage?: string;
}): string => {
  const { clientFirstName, businessName, googleReviewLink, yelpReviewLink, facebookReviewLink, customMessage } = params;
  const hasLinks = !!(googleReviewLink || yelpReviewLink || facebookReviewLink);
  const reviewSection = hasLinks
    ? reviewButtons({ google: googleReviewLink, yelp: yelpReviewLink, facebook: facebookReviewLink })
    : `<p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6;">You can find us on Google Maps by searching for <strong>${esc(businessName)}</strong> to leave a review.</p>`;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">How Did We Do? &#x2B50;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we hope your experience was exceptional!</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">Thank you for choosing <strong>${esc(businessName)}</strong>! Your feedback helps us improve.</p>
    ${customMessage ? `<p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">${esc(customMessage)}</p>` : ''}
    ${reviewSection}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Thank you again for your business!<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const invoiceSentEmail = (params: {
  clientFirstName: string; businessName: string; invoiceNumber: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number; taxAmount: number; taxRate?: number; discountAmount: number; total: number;
  dueDate?: string; businessPhone?: string; businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, invoiceNumber, lineItems, subtotal, taxAmount, taxRate, discountAmount, total, dueDate, businessPhone, businessEmail } = params;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Invoice #${esc(invoiceNumber)}</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, please find your invoice from ${esc(businessName)} below.</p>
    ${dueDate ? infoBox('', `Payment due by <strong>${esc(dueDate)}</strong>.`, 'warning') : ''}
    ${lineItemsTable(lineItems, subtotal, taxAmount, taxRate, discountAmount, total)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">If you have any questions about this invoice, please don't hesitate to contact us.</p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Thank you for your business,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const paymentReceiptEmail = (params: {
  clientFirstName: string; businessName: string; invoiceNumber: string; amountPaid: number;
  invoiceTotal: number; remainingBalance: number; paymentMethod?: string; businessPhone?: string; businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, invoiceNumber, amountPaid, invoiceTotal, remainingBalance, paymentMethod, businessPhone, businessEmail } = params;
  const rows: string[] = [
    detailRow('Invoice', `#${esc(invoiceNumber)}`),
    detailRow('Amount Paid', formatCurrency(amountPaid)),
  ];
  if (paymentMethod) rows.push(detailRow('Payment Method', esc(paymentMethod)));
  rows.push(detailRow('Invoice Total', formatCurrency(invoiceTotal)));
  rows.push(detailRow('Remaining Balance', formatCurrency(remainingBalance)));
  const balanceBox = remainingBalance <= 0
    ? infoBox('', '&#x2713; Paid in full &#x2014; Thank you!', 'success')
    : infoBox('', `Remaining balance: <strong>${formatCurrency(remainingBalance)}</strong>. Please arrange payment at your convenience.`, 'warning');
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Payment Received &#x2713;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we've received your payment. Here are the details:</p>
    ${detailsCard(rows)}
    ${balanceBox}
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">Thank you for your business,<br /><strong>${esc(businessName)}</strong></p>`;
  return baseLayout(businessName, '#111827', content);
};

export const quoteSentEmail = (params: {
  clientFirstName: string; businessName: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number; taxAmount?: number; taxRate?: number; total: number; acceptUrl: string;
  expiresAt?: string; notes?: string; businessPhone?: string; businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, lineItems, subtotal, taxAmount, taxRate, total, acceptUrl, expiresAt, notes, businessPhone, businessEmail } = params;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Your Quote is Ready &#x1F4CB;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, please find your quote from ${esc(businessName)} below.</p>
    ${expiresAt ? infoBox('', `This quote expires on <strong>${esc(expiresAt)}</strong>.`, 'warning') : ''}
    ${lineItemsTable(lineItems, subtotal, taxAmount, taxRate, undefined, total)}
    ${notes ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(notes)}</p>` : ''}
    ${ctaButton(acceptUrl, 'Accept This Quote')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">If you have any questions, please don't hesitate to contact us.</p>
    ${contactBlock(businessPhoneimport { esc } from './escapeHtml';

// ─── Shared Utilities ────────────────────────────────────────────────────────

export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export const formatDatetime = (
  iso: string | Date | null | undefined,
  timezone?: string
): string => {
  if (!iso) return 'your scheduled time';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return 'your scheduled time';
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    if (timezone) options.timeZone = timezone;
    return date.toLocaleDateString('en-US', options);
  } catch {
    return 'your scheduled time';
  }
};

export const formatTime = (
  iso: string | Date | null | undefined,
  timezone?: string
): string => {
  if (!iso) return '';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return '';
    const options: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    if (timezone) options.timeZone = timezone;
    return date.toLocaleTimeString('en-US', options);
  } catch {
    return '';
  }
};

// ─── Private Layout Helpers ───────────────────────────────────────────────────

const baseLayout = (
  businessName: string,
  accentColor: string,
  content: string,
  year?: number
): string => {
  const currentYear = year ?? new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(businessName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:${esc(accentColor)};padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${esc(businessName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px 40px;color:#374151;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;">This email was sent by ${esc(businessName)}. Please do not reply directly to this email.</p>
              <p style="margin:0;font-size:12px;color:#d1d5db;">&copy; ${currentYear} ${esc(businessName)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const infoBox = (
  label: string,
  value: string,
  colorScheme: 'default' | 'success' | 'warning' | 'danger' = 'default'
): string => {
  const schemes = {
    default: { border: '#4f46e5', bg: '#f0f4ff' },
    success: { border: '#22c55e', bg: '#f0fdf4' },
    warning: { border: '#f59e0b', bg: '#fffbeb' },
    danger: { border: '#ef4444', bg: '#fff5f5' },
  };
  const { border, bg } = schemes[colorScheme];
  const labelEl = label
    ? `<p style="margin:0 0 6px 0;font-size:12px;font-weight:600;color:${border};text-transform:uppercase;letter-spacing:0.8px;">${esc(label)}</p>`
    : '';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td style="background-color:${bg};border-left:4px solid ${border};border-radius:4px;padding:16px 20px;">
      ${labelEl}<p style="margin:0;font-size:15px;color:#1f2937;line-height:1.6;">${value}</p>
    </td>
  </tr>
</table>`;
};

const detailRow = (label: string, value: string): string =>
  `<tr>
    <td style="padding:10px 16px;font-size:14px;color:#6b7280;width:38%;vertical-align:top;border-bottom:1px solid #e5e7eb;">${esc(label)}</td>
    <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#111827;vertical-align:top;border-bottom:1px solid #e5e7eb;">${value}</td>
  </tr>`;

const detailsCard = (rows: string[]): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f9fafb;border-collapse:collapse;">
    <tbody>${rows.join('')}</tbody>
  </table>`;

const ctaButton = (href: string, label: string, color = '#4f46e5'): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
  <tr>
    <td align="center">
      <a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
        style="display:inline-block;background-color:${esc(color)};color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 36px;border-radius:6px;letter-spacing:0.3px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;

const lineItemsTable = (
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>,
  subtotal: number,
  taxAmount?: number,
  taxRate?: number,
  discountAmount?: number,
  total?: number
): string => {
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${esc(item.description)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:center;">${item.quantity}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:right;">${formatCurrency(item.unitPrice)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#111827;text-align:right;">${formatCurrency(item.total)}</td>
        </tr>`
    )
    .join('');

  const taxLabel = taxRate ? `Tax (${taxRate}%)` : 'Tax';
  const taxRow =
    taxAmount && taxAmount > 0
      ? `<tr>
          <td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${taxLabel}</td>
          <td style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(taxAmount)}</td>
        </tr>`
      : '';

  const discountRow =
    discountAmount && discountAmount > 0
      ? `<tr>
          <td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">Discount</td>
          <td style="padding:8px 16px;font-size:14px;color:#ef4444;text-align:right;">-${formatCurrency(discountAmount)}</td>
        </tr>`
      : '';

  const totalAmount = total ?? subtotal;

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;overflow:hidden;">
  <thead>
    <tr style="background-color:#111827;">
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:left;text-transform:uppercase;letter-spacing:0.6px;">Description</th>
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:center;text-transform:uppercase;letter-spacing:0.6px;">Qty</th>
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Unit Price</th>
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Total</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr style="background-color:#f9fafb;">
      <td colspan="3" style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">Subtotal</td>
      <td style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(subtotal)}</td>
    </tr>
    ${discountRow}
    ${taxRow}
    <tr style="background-color:#f0f4ff;">
      <td colspan="3" style="padding:14px 16px;font-size:16px;font-weight:700;color:#111827;text-align:right;">Total Due</td>
      <td style="padding:14px 16px;font-size:16px;font-weight:700;color:#4f46e5;text-align:right;">${formatCurrency(totalAmount)}</td>
    </tr>
  </tbody>
</table>`;
};

const reviewButtons = (links: {
  google?: string | null;
  yelp?: string | null;
  facebook?: string | null;
}): string => {
  const buttons: string[] = [];
  if (links.google) {
    buttons.push(
      `<a href="${esc(links.google)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#4285f4;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Google</a>`
    );
  }
  if (links.yelp) {
    buttons.push(
      `<a href="${esc(links.yelp)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#d32323;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Yelp</a>`
    );
  }
  if (links.facebook) {
    buttons.push(
      `<a href="${esc(links.facebook)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#1877f2;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Facebook</a>`
    );
  }
  if (buttons.length === 0) {
    return `<p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6;">We'd love to hear your feedback! Please search for us online to leave a review.</p>`;
  }
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td align="center">
      ${buttons.join('\n      ')}
    </td>
  </tr>
</table>`;
};

const contactBlock = (phone?: string | null, email?: string | null): string => {
  if (!phone && !email) return '';
  const parts: string[] = [];
  if (phone)
    parts.push(
      `Phone: <a href="tel:${esc(phone)}" style="color:#4f46e5;text-decoration:none;">${esc(phone)}</a>`
    );
  if (email)
    parts.push(
      `Email: <a href="mailto:${esc(email)}" style="color:#4f46e5;text-decoration:none;">${esc(email)}</a>`
    );
  return `<p style="margin:16px 0 0 0;font-size:14px;color:#6b7280;line-height:1.8;">${parts.join(' &nbsp;|&nbsp; ')}</p>`;
};

// ─── Exported Email Templates ─────────────────────────────────────────────────

export const appointmentConfirmationEmail = (params: {
  clientFirstName: string;
  businessName: string;
  appointmentDate?: string;
  appointmentTime?: string;
  vehicleDescription?: string;
  endTime?: string;
  mobileAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  customMessage?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    appointmentDate,
    appointmentTime,
    vehicleDescription,
    endTime,
    mobileAddress,
    businessPhone,
    businessEmail,
    customMessage,
  } = params;

  const rows: string[] = [];
  if (appointmentDate) rows.push(detailRow('Date', esc(appointmentDate)));
  if (appointmentTime) rows.push(detailRow('Time', esc(appointmentTime)));
  if (endTime) rows.push(detailRow('Estimated End', esc(endTime)));
  if (vehicleDescription) rows.push(detailRow('Vehicle', esc(vehicleDescription)));
  if (mobileAddress) rows.push(detailRow('Location', esc(mobileAddress)));

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Confirmed &#x2713;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, your appointment has been booked.</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      We've received your booking request at <strong>${esc(businessName)}</strong> and will confirm it shortly.
    </p>
    ${rows.length > 0 ? detailsCard(rows) : ''}
    ${customMessage ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(customMessage)}</p>` : ''}
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">We look forward to seeing you!</p>
    <p style="margin:16px 0 0 0;font-size:15px;color:#374151;">
      Best regards,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const appointmentReminderEmail = (params: {
  clientFirstName: string;
  businessName: string;
  appointmentDate?: string;
  appointmentTime?: string;
  vehicleDescription?: string;
  mobileAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  customMessage?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    appointmentDate,
    appointmentTime,
    vehicleDescription,
    mobileAddress,
    businessPhone,
    businessEmail,
    customMessage,
  } = params;

  const rows: string[] = [];
  if (appointmentDate) rows.push(detailRow('Date', esc(appointmentDate)));
  if (appointmentTime) rows.push(detailRow('Time', esc(appointmentTime)));
  if (vehicleDescription) rows.push(detailRow('Vehicle', esc(vehicleDescription)));
  if (mobileAddress) rows.push(detailRow('Location', esc(mobileAddress)));

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Reminder &#x1F514;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, your appointment is coming up soon.</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      This is a friendly reminder about your upcoming appointment at <strong>${esc(businessName)}</strong>.
    </p>
    ${rows.length > 0 ? detailsCard(rows) : ''}
    ${customMessage ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(customMessage)}</p>` : ''}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      Please arrive a few minutes early. If you need to reschedule, contact us as soon as possible.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      See you soon,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const appointmentCancellationEmail = (params: {
  clientFirstName: string;
  businessName: string;
  reason?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, reason, businessPhone, businessEmail } = params;

  const boxValue = `Your appointment at <strong>${esc(businessName)}</strong> has been cancelled. We apologize for any inconvenience.${
    reason ? `<br /><br /><strong>Reason:</strong> ${esc(reason)}` : ''
  }`;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Cancelled</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we're sorry to inform you about your appointment.</p>
    ${infoBox('', boxValue, 'danger')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      We'd love to reschedule at a time that works for you. Please contact us to book again.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Sincerely,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const jobCompleteEmail = (params: {
  clientFirstName: string;
  businessName: string;
  vehicleDescription?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, vehicleDescription, businessPhone, businessEmail } =
    params;

  const vehicleText = vehicleDescription ? esc(vehicleDescription) : 'Your vehicle';
  const boxValue = `&#x2713; Work complete &#x2014; ${vehicleText} is ready for pickup at <strong>${esc(businessName)}</strong>.`;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Your Vehicle is Ready! &#x1F697;&#x2728;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, great news!</p>
    ${infoBox('', boxValue, 'success')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      Our team has finished and everything is looking great. You can pick up at your convenience during business hours.
    </p>
    <p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      If you have any questions or need to make arrangements, please don't hesitate to reach out.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you for choosing us,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const reviewRequestEmail = (params: {
  clientFirstName: string;
  businessName: string;
  googleReviewLink?: string;
  yelpReviewLink?: string;
  facebookReviewLink?: string;
  customMessage?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    googleReviewLink,
    yelpReviewLink,
    facebookReviewLink,
    customMessage,
  } = params;

  const hasLinks = !!(googleReviewLink || yelpReviewLink || facebookReviewLink);

  const reviewSection = hasLinks
    ? reviewButtons({ google: googleReviewLink, yelp: yelpReviewLink, facebook: facebookReviewLink })
    : `<p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6;">You can find us on Google Maps by searching for <strong>${esc(businessName)}</strong> to leave a review.</p>`;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">How Did We Do? &#x2B50;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we hope your experience was exceptional!</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      Thank you for choosing <strong>${esc(businessName)}</strong>! We hope your experience was exceptional.
    </p>
    ${customMessage ? `<p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">${esc(customMessage)}</p>` : ''}
    ${reviewSection}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you again for your business!<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const invoiceSentEmail = (params: {
  clientFirstName: string;
  businessName: string;
  invoiceNumber: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  taxAmount: number;
  taxRate?: number;
  discountAmount: number;
  total: number;
  dueDate?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    invoiceNumber,
    lineItems,
    subtotal,
    taxAmount,
    taxRate,
    discountAmount,
    total,
    dueDate,
    businessPhone,
    businessEmail,
  } = params;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Invoice #${esc(invoiceNumber)}</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, please find your invoice from ${esc(businessName)} below.</p>
    ${dueDate ? infoBox('', `Payment due by <strong>${esc(dueDate)}</strong>.`, 'warning') : ''}
    ${lineItemsTable(lineItems, subtotal, taxAmount, taxRate, discountAmount, total)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      If you have any questions about this invoice, please don't hesitate to contact us.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you for your business,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const paymentReceiptEmail = (params: {
  clientFirstName: string;
  businessName: string;
  invoiceNumber: string;
  amountPaid: number;
  invoiceTotal: number;
  remainingBalance: number;
  paymentMethod?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    invoiceNumber,
    amountPaid,
    invoiceTotal,
    remainingBalance,
    paymentMethod,
    businessPhone,
    businessEmail,
  } = params;

  const rows: string[] = [
    detailRow('Invoice', `#${esc(invoiceNumber)}`),
    detailRow('Amount Paid', formatCurrency(amountPaid)),
  ];
  if (paymentMethod) rows.push(detailRow('Payment Method', esc(paymentMethod)));
  rows.push(detailRow('Invoice Total', formatCurrency(invoiceTotal)));
  rows.push(detailRow('Remaining Balance', formatCurrency(remainingBalance)));

  const balanceBox =
    remainingBalance <= 0
      ? infoBox('', '&#x2713; Paid in full &#x2014; Thank you!', 'success')
      : infoBox(
          '',
          `Remaining balance: <strong>${formatCurrency(remainingBalance)}</strong>. Please arrange payment at your convenience.`,
          'warning'
        );

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Payment Received &#x2713;</h1>import { esc } from './escapeHtml';

// ─── Shared Utilities ────────────────────────────────────────────────────────

export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export const formatDatetime = (
  iso: string | Date | null | undefined,
  timezone?: string
): string => {
  if (!iso) return 'your scheduled time';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return 'your scheduled time';
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    if (timezone) options.timeZone = timezone;
    return date.toLocaleDateString('en-US', options);
  } catch {
    return 'your scheduled time';
  }
};

export const formatTime = (
  iso: string | Date | null | undefined,
  timezone?: string
): string => {
  if (!iso) return '';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return '';
    const options: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    if (timezone) options.timeZone = timezone;
    return date.toLocaleTimeString('en-US', options);
  } catch {
    return '';
  }
};

// ─── Private Layout Helpers ───────────────────────────────────────────────────

const baseLayout = (
  businessName: string,
  accentColor: string,
  content: string,
  year?: number
): string => {
  const currentYear = year ?? new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(businessName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:${esc(accentColor)};padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${esc(businessName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px 40px;color:#374151;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;">This email was sent by ${esc(businessName)}. Please do not reply directly to this email.</p>
              <p style="margin:0;font-size:12px;color:#d1d5db;">&copy; ${currentYear} ${esc(businessName)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const infoBox = (
  label: string,
  value: string,
  colorScheme: 'default' | 'success' | 'warning' | 'danger' = 'default'
): string => {
  const schemes = {
    default: { border: '#4f46e5', bg: '#f0f4ff' },
    success: { border: '#22c55e', bg: '#f0fdf4' },
    warning: { border: '#f59e0b', bg: '#fffbeb' },
    danger: { border: '#ef4444', bg: '#fff5f5' },
  };
  const { border, bg } = schemes[colorScheme];
  const labelEl = label
    ? `<p style="margin:0 0 6px 0;font-size:12px;font-weight:600;color:${border};text-transform:uppercase;letter-spacing:0.8px;">${esc(label)}</p>`
    : '';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td style="background-color:${bg};border-left:4px solid ${border};border-radius:4px;padding:16px 20px;">
      ${labelEl}<p style="margin:0;font-size:15px;color:#1f2937;line-height:1.6;">${value}</p>
    </td>
  </tr>
</table>`;
};

const detailRow = (label: string, value: string): string =>
  `<tr>
    <td style="padding:10px 16px;font-size:14px;color:#6b7280;width:38%;vertical-align:top;border-bottom:1px solid #e5e7eb;">${esc(label)}</td>
    <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#111827;vertical-align:top;border-bottom:1px solid #e5e7eb;">${value}</td>
  </tr>`;

const detailsCard = (rows: string[]): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f9fafb;border-collapse:collapse;">
    <tbody>${rows.join('')}</tbody>
  </table>`;

const ctaButton = (href: string, label: string, color = '#4f46e5'): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
  <tr>
    <td align="center">
      <a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
        style="display:inline-block;background-color:${esc(color)};color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 36px;border-radius:6px;letter-spacing:0.3px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;

const lineItemsTable = (
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>,
  subtotal: number,
  taxAmount?: number,
  taxRate?: number,
  discountAmount?: number,
  total?: number
): string => {
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${esc(item.description)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:center;">${item.quantity}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:right;">${formatCurrency(item.unitPrice)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#111827;text-align:right;">${formatCurrency(item.total)}</td>
        </tr>`
    )
    .join('');

  const taxLabel = taxRate ? `Tax (${taxRate}%)` : 'Tax';
  const taxRow =
    taxAmount && taxAmount > 0
      ? `<tr>
          <td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${taxLabel}</td>
          <td style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(taxAmount)}</td>
        </tr>`
      : '';

  const discountRow =
    discountAmount && discountAmount > 0
      ? `<tr>
          <td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">Discount</td>
          <td style="padding:8px 16px;font-size:14px;color:#ef4444;text-align:right;">-${formatCurrency(discountAmount)}</td>
        </tr>`
      : '';

  const totalAmount = total ?? subtotal;

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;overflow:hidden;">
  <thead>
    <tr style="background-color:#111827;">
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:left;text-transform:uppercase;letter-spacing:0.6px;">Description</th>
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:center;text-transform:uppercase;letter-spacing:0.6px;">Qty</th>
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Unit Price</th>
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Total</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr style="background-color:#f9fafb;">
      <td colspan="3" style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">Subtotal</td>
      <td style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(subtotal)}</td>
    </tr>
    ${discountRow}
    ${taxRow}
    <tr style="background-color:#f0f4ff;">
      <td colspan="3" style="padding:14px 16px;font-size:16px;font-weight:700;color:#111827;text-align:right;">Total Due</td>
      <td style="padding:14px 16px;font-size:16px;font-weight:700;color:#4f46e5;text-align:right;">${formatCurrency(totalAmount)}</td>
    </tr>
  </tbody>
</table>`;
};

const reviewButtons = (links: {
  google?: string | null;
  yelp?: string | null;
  facebook?: string | null;
}): string => {
  const buttons: string[] = [];
  if (links.google) {
    buttons.push(
      `<a href="${esc(links.google)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#4285f4;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Google</a>`
    );
  }
  if (links.yelp) {
    buttons.push(
      `<a href="${esc(links.yelp)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#d32323;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Yelp</a>`
    );
  }
  if (links.facebook) {
    buttons.push(
      `<a href="${esc(links.facebook)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#1877f2;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Facebook</a>`
    );
  }
  if (buttons.length === 0) {
    return `<p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6;">We'd love to hear your feedback! Please search for us online to leave a review.</p>`;
  }
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td align="center">
      ${buttons.join('\n      ')}
    </td>
  </tr>
</table>`;
};

const contactBlock = (phone?: string | null, email?: string | null): string => {
  if (!phone && !email) return '';
  const parts: string[] = [];
  if (phone)
    parts.push(
      `Phone: <a href="tel:${esc(phone)}" style="color:#4f46e5;text-decoration:none;">${esc(phone)}</a>`
    );
  if (email)
    parts.push(
      `Email: <a href="mailto:${esc(email)}" style="color:#4f46e5;text-decoration:none;">${esc(email)}</a>`
    );
  return `<p style="margin:16px 0 0 0;font-size:14px;color:#6b7280;line-height:1.8;">${parts.join(' &nbsp;|&nbsp; ')}</p>`;
};

// ─── Exported Email Templates ─────────────────────────────────────────────────

export const appointmentConfirmationEmail = (params: {
  clientFirstName: string;
  businessName: string;
  appointmentDate?: string;
  appointmentTime?: string;
  vehicleDescription?: string;
  endTime?: string;
  mobileAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  customMessage?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    appointmentDate,
    appointmentTime,
    vehicleDescription,
    endTime,
    mobileAddress,
    businessPhone,
    businessEmail,
    customMessage,
  } = params;

  const rows: string[] = [];
  if (appointmentDate) rows.push(detailRow('Date', esc(appointmentDate)));
  if (appointmentTime) rows.push(detailRow('Time', esc(appointmentTime)));
  if (endTime) rows.push(detailRow('Estimated End', esc(endTime)));
  if (vehicleDescription) rows.push(detailRow('Vehicle', esc(vehicleDescription)));
  if (mobileAddress) rows.push(detailRow('Location', esc(mobileAddress)));

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Confirmed &#x2713;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, your appointment has been booked.</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      We've received your booking request at <strong>${esc(businessName)}</strong> and will confirm it shortly.
    </p>
    ${rows.length > 0 ? detailsCard(rows) : ''}
    ${customMessage ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(customMessage)}</p>` : ''}
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">We look forward to seeing you!</p>
    <p style="margin:16px 0 0 0;font-size:15px;color:#374151;">
      Best regards,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const appointmentReminderEmail = (params: {
  clientFirstName: string;
  businessName: string;
  appointmentDate?: string;
  appointmentTime?: string;
  vehicleDescription?: string;
  mobileAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  customMessage?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    appointmentDate,
    appointmentTime,
    vehicleDescription,
    mobileAddress,
    businessPhone,
    businessEmail,
    customMessage,
  } = params;

  const rows: string[] = [];
  if (appointmentDate) rows.push(detailRow('Date', esc(appointmentDate)));
  if (appointmentTime) rows.push(detailRow('Time', esc(appointmentTime)));
  if (vehicleDescription) rows.push(detailRow('Vehicle', esc(vehicleDescription)));
  if (mobileAddress) rows.push(detailRow('Location', esc(mobileAddress)));

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Reminder &#x1F514;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, your appointment is coming up soon.</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      This is a friendly reminder about your upcoming appointment at <strong>${esc(businessName)}</strong>.
    </p>
    ${rows.length > 0 ? detailsCard(rows) : ''}
    ${customMessage ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(customMessage)}</p>` : ''}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      Please arrive a few minutes early. If you need to reschedule, contact us as soon as possible.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      See you soon,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const appointmentCancellationEmail = (params: {
  clientFirstName: string;
  businessName: string;
  reason?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, reason, businessPhone, businessEmail } = params;

  const boxValue = `Your appointment at <strong>${esc(businessName)}</strong> has been cancelled. We apologize for any inconvenience.${
    reason ? `<br /><br /><strong>Reason:</strong> ${esc(reason)}` : ''
  }`;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Cancelled</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we're sorry to inform you about your appointment.</p>
    ${infoBox('', boxValue, 'danger')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      We'd love to reschedule at a time that works for you. Please contact us to book again.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Sincerely,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const jobCompleteEmail = (params: {
  clientFirstName: string;
  businessName: string;
  vehicleDescription?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, vehicleDescription, businessPhone, businessEmail } =
    params;

  const vehicleText = vehicleDescription ? esc(vehicleDescription) : 'Your vehicle';
  const boxValue = `&#x2713; Work complete &#x2014; ${vehicleText} is ready for pickup at <strong>${esc(businessName)}</strong>.`;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Your Vehicle is Ready! &#x1F697;&#x2728;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, great news!</p>
    ${infoBox('', boxValue, 'success')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      Our team has finished and everything is looking great. You can pick up at your convenience during business hours.
    </p>
    <p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      If you have any questions or need to make arrangements, please don't hesitate to reach out.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you for choosing us,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const reviewRequestEmail = (params: {
  clientFirstName: string;
  businessName: string;
  googleReviewLink?: string;
  yelpReviewLink?: string;
  facebookReviewLink?: string;
  customMessage?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    googleReviewLink,
    yelpReviewLink,
    facebookReviewLink,
    customMessage,
  } = params;

  const hasLinks = !!(googleReviewLink || yelpReviewLink || facebookReviewLink);

  const reviewSection = hasLinks
    ? reviewButtons({ google: googleReviewLink, yelp: yelpReviewLink, facebook: facebookReviewLink })
    : `<p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6;">You can find us on Google Maps by searching for <strong>${esc(businessName)}</strong> to leave a review.</p>`;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">How Did We Do? &#x2B50;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we hope your experience was exceptional!</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      Thank you for choosing <strong>${esc(businessName)}</strong>! We hope your experience was exceptional.
    </p>
    ${customMessage ? `<p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">${esc(customMessage)}</p>` : ''}
    ${reviewSection}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you again for your business!<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const invoiceSentEmail = (params: {
  clientFirstName: string;
  businessName: string;
  invoiceNumber: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  taxAmount: number;
  taxRate?: number;
  discountAmount: number;
  total: number;
  dueDate?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    invoiceNumber,
    lineItems,
    subtotal,
    taxAmount,
    taxRate,
    discountAmount,
    total,
    dueDate,
    businessPhone,
    businessEmail,
  } = params;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Invoice #${esc(invoiceNumber)}</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, please find your invoice from ${esc(businessName)} below.</p>
    ${dueDate ? infoBox('', `Payment due by <strong>${esc(dueDate)}</strong>.`, 'warning') : ''}
    ${lineItemsTable(lineItems, subtotal, taxAmount, taxRate, discountAmount, total)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      If you have any questions about this invoice, please don't hesitate to contact us.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you for your business,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const paymentReceiptEmail = (params: {
  clientFirstName: string;
  businessName: string;
  invoiceNumber: string;
  amountPaid: number;
  invoiceTotal: number;
  remainingBalance: number;
  paymentMethod?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    invoiceNumber,
    amountPaid,
    invoiceTotal,
    remainingBalance,
    paymentMethod,
    businessPhone,
    businessEmail,
  } = params;

  const rows: string[] = [
    detailRow('Invoice', `#${esc(invoiceNumber)}`),
    detailRow('Amount Paid', formatCurrency(amountPaid)),
  ];
  if (paymentMethod) rows.push(detailRow('Payment Method', esc(paymentMethod)));
  rows.push(detailRow('Invoice Total', formatCurrency(invoiceTotal)));
  rows.push(detailRow('Remaining Balance', formatCurrency(remainingBalance)));

  const balanceBox =
    remainingBalance <= 0
      ? infoBox('', '&#x2713; Paid in full &#x2014; Thank you!', 'success')
      : infoBox(
          '',
          `Remaining balance: <strong>${formatCurrency(remainingBalance)}</strong>. Please arrange payment at your convenience.`,
          'warning'
        );

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Payment Received &#x2713;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we've received your payment. Here are the details:</p>
    ${detailsCard(rows)}
    ${balanceBox}
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24pximport { esc } from './escapeHtml';

// ─── Shared Utilities ────────────────────────────────────────────────────────

export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export const formatDatetime = (
  iso: string | Date | null | undefined,
  timezone?: string
): string => {
  if (!iso) return 'your scheduled time';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return 'your scheduled time';
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    if (timezone) options.timeZone = timezone;
    return date.toLocaleDateString('en-US', options);
  } catch {
    return 'your scheduled time';
  }
};

export const formatTime = (
  iso: string | Date | null | undefined,
  timezone?: string
): string => {
  if (!iso) return '';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return '';
    const options: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    if (timezone) options.timeZone = timezone;
    return date.toLocaleTimeString('en-US', options);
  } catch {
    return '';
  }
};

// ─── Private Layout Helpers ───────────────────────────────────────────────────

const baseLayout = (
  businessName: string,
  accentColor: string,
  content: string,
  year?: number
): string => {
  const currentYear = year ?? new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(businessName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:${esc(accentColor)};padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${esc(businessName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px 40px;color:#374151;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 8px 0;font-size:13px;color:#9ca3af;">This email was sent by ${esc(businessName)}. Please do not reply directly to this email.</p>
              <p style="margin:0;font-size:12px;color:#d1d5db;">&copy; ${currentYear} ${esc(businessName)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const infoBox = (
  label: string,
  value: string,
  colorScheme: 'default' | 'success' | 'warning' | 'danger' = 'default'
): string => {
  const schemes = {
    default: { border: '#4f46e5', bg: '#f0f4ff' },
    success: { border: '#22c55e', bg: '#f0fdf4' },
    warning: { border: '#f59e0b', bg: '#fffbeb' },
    danger: { border: '#ef4444', bg: '#fff5f5' },
  };
  const { border, bg } = schemes[colorScheme];
  const labelEl = label
    ? `<p style="margin:0 0 6px 0;font-size:12px;font-weight:600;color:${border};text-transform:uppercase;letter-spacing:0.8px;">${esc(label)}</p>`
    : '';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td style="background-color:${bg};border-left:4px solid ${border};border-radius:4px;padding:16px 20px;">
      ${labelEl}<p style="margin:0;font-size:15px;color:#1f2937;line-height:1.6;">${value}</p>
    </td>
  </tr>
</table>`;
};

const detailRow = (label: string, value: string): string =>
  `<tr>
    <td style="padding:10px 16px;font-size:14px;color:#6b7280;width:38%;vertical-align:top;border-bottom:1px solid #e5e7eb;">${esc(label)}</td>
    <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#111827;vertical-align:top;border-bottom:1px solid #e5e7eb;">${value}</td>
  </tr>`;

const detailsCard = (rows: string[]): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background-color:#f9fafb;border-collapse:collapse;">
    <tbody>${rows.join('')}</tbody>
  </table>`;

const ctaButton = (href: string, label: string, color = '#4f46e5'): string =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
  <tr>
    <td align="center">
      <a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
        style="display:inline-block;background-color:${esc(color)};color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 36px;border-radius:6px;letter-spacing:0.3px;">${esc(label)}</a>
    </td>
  </tr>
</table>`;

const lineItemsTable = (
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>,
  subtotal: number,
  taxAmount?: number,
  taxRate?: number,
  discountAmount?: number,
  total?: number
): string => {
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${esc(item.description)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:center;">${item.quantity}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:right;">${formatCurrency(item.unitPrice)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#111827;text-align:right;">${formatCurrency(item.total)}</td>
        </tr>`
    )
    .join('');

  const taxLabel = taxRate ? `Tax (${taxRate}%)` : 'Tax';
  const taxRow =
    taxAmount && taxAmount > 0
      ? `<tr>
          <td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${taxLabel}</td>
          <td style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(taxAmount)}</td>
        </tr>`
      : '';

  const discountRow =
    discountAmount && discountAmount > 0
      ? `<tr>
          <td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">Discount</td>
          <td style="padding:8px 16px;font-size:14px;color:#ef4444;text-align:right;">-${formatCurrency(discountAmount)}</td>
        </tr>`
      : '';

  const totalAmount = total ?? subtotal;

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;overflow:hidden;">
  <thead>
    <tr style="background-color:#111827;">
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:left;text-transform:uppercase;letter-spacing:0.6px;">Description</th>
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:center;text-transform:uppercase;letter-spacing:0.6px;">Qty</th>
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Unit Price</th>
      <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Total</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr style="background-color:#f9fafb;">
      <td colspan="3" style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">Subtotal</td>
      <td style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(subtotal)}</td>
    </tr>
    ${discountRow}
    ${taxRow}
    <tr style="background-color:#f0f4ff;">
      <td colspan="3" style="padding:14px 16px;font-size:16px;font-weight:700;color:#111827;text-align:right;">Total Due</td>
      <td style="padding:14px 16px;font-size:16px;font-weight:700;color:#4f46e5;text-align:right;">${formatCurrency(totalAmount)}</td>
    </tr>
  </tbody>
</table>`;
};

const reviewButtons = (links: {
  google?: string | null;
  yelp?: string | null;
  facebook?: string | null;
}): string => {
  const buttons: string[] = [];
  if (links.google) {
    buttons.push(
      `<a href="${esc(links.google)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#4285f4;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Google</a>`
    );
  }
  if (links.yelp) {
    buttons.push(
      `<a href="${esc(links.yelp)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#d32323;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Yelp</a>`
    );
  }
  if (links.facebook) {
    buttons.push(
      `<a href="${esc(links.facebook)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#1877f2;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin:6px;">Review on Facebook</a>`
    );
  }
  if (buttons.length === 0) {
    return `<p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6;">We'd love to hear your feedback! Please search for us online to leave a review.</p>`;
  }
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td align="center">
      ${buttons.join('\n      ')}
    </td>
  </tr>
</table>`;
};

const contactBlock = (phone?: string | null, email?: string | null): string => {
  if (!phone && !email) return '';
  const parts: string[] = [];
  if (phone)
    parts.push(
      `Phone: <a href="tel:${esc(phone)}" style="color:#4f46e5;text-decoration:none;">${esc(phone)}</a>`
    );
  if (email)
    parts.push(
      `Email: <a href="mailto:${esc(email)}" style="color:#4f46e5;text-decoration:none;">${esc(email)}</a>`
    );
  return `<p style="margin:16px 0 0 0;font-size:14px;color:#6b7280;line-height:1.8;">${parts.join(' &nbsp;|&nbsp; ')}</p>`;
};

// ─── Exported Email Templates ─────────────────────────────────────────────────

export const appointmentConfirmationEmail = (params: {
  clientFirstName: string;
  businessName: string;
  appointmentDate?: string;
  appointmentTime?: string;
  vehicleDescription?: string;
  endTime?: string;
  mobileAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  customMessage?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    appointmentDate,
    appointmentTime,
    vehicleDescription,
    endTime,
    mobileAddress,
    businessPhone,
    businessEmail,
    customMessage,
  } = params;

  const rows: string[] = [];
  if (appointmentDate) rows.push(detailRow('Date', esc(appointmentDate)));
  if (appointmentTime) rows.push(detailRow('Time', esc(appointmentTime)));
  if (endTime) rows.push(detailRow('Estimated End', esc(endTime)));
  if (vehicleDescription) rows.push(detailRow('Vehicle', esc(vehicleDescription)));
  if (mobileAddress) rows.push(detailRow('Location', esc(mobileAddress)));

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Confirmed &#x2713;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, your appointment has been booked.</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      We've received your booking request at <strong>${esc(businessName)}</strong> and will confirm it shortly.
    </p>
    ${rows.length > 0 ? detailsCard(rows) : ''}
    ${customMessage ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(customMessage)}</p>` : ''}
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">We look forward to seeing you!</p>
    <p style="margin:16px 0 0 0;font-size:15px;color:#374151;">
      Best regards,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const appointmentReminderEmail = (params: {
  clientFirstName: string;
  businessName: string;
  appointmentDate?: string;
  appointmentTime?: string;
  vehicleDescription?: string;
  mobileAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  customMessage?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    appointmentDate,
    appointmentTime,
    vehicleDescription,
    mobileAddress,
    businessPhone,
    businessEmail,
    customMessage,
  } = params;

  const rows: string[] = [];
  if (appointmentDate) rows.push(detailRow('Date', esc(appointmentDate)));
  if (appointmentTime) rows.push(detailRow('Time', esc(appointmentTime)));
  if (vehicleDescription) rows.push(detailRow('Vehicle', esc(vehicleDescription)));
  if (mobileAddress) rows.push(detailRow('Location', esc(mobileAddress)));

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Reminder &#x1F514;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, your appointment is coming up soon.</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      This is a friendly reminder about your upcoming appointment at <strong>${esc(businessName)}</strong>.
    </p>
    ${rows.length > 0 ? detailsCard(rows) : ''}
    ${customMessage ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;padding:12px 16px;border-left:3px solid #e5e7eb;font-style:italic;">${esc(customMessage)}</p>` : ''}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      Please arrive a few minutes early. If you need to reschedule, contact us as soon as possible.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      See you soon,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const appointmentCancellationEmail = (params: {
  clientFirstName: string;
  businessName: string;
  reason?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, reason, businessPhone, businessEmail } = params;

  const boxValue = `Your appointment at <strong>${esc(businessName)}</strong> has been cancelled. We apologize for any inconvenience.${
    reason ? `<br /><br /><strong>Reason:</strong> ${esc(reason)}` : ''
  }`;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Cancelled</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we're sorry to inform you about your appointment.</p>
    ${infoBox('', boxValue, 'danger')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      We'd love to reschedule at a time that works for you. Please contact us to book again.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Sincerely,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const jobCompleteEmail = (params: {
  clientFirstName: string;
  businessName: string;
  vehicleDescription?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const { clientFirstName, businessName, vehicleDescription, businessPhone, businessEmail } =
    params;

  const vehicleText = vehicleDescription ? esc(vehicleDescription) : 'Your vehicle';
  const boxValue = `&#x2713; Work complete &#x2014; ${vehicleText} is ready for pickup at <strong>${esc(businessName)}</strong>.`;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Your Vehicle is Ready! &#x1F697;&#x2728;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, great news!</p>
    ${infoBox('', boxValue, 'success')}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      Our team has finished and everything is looking great. You can pick up at your convenience during business hours.
    </p>
    <p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      If you have any questions or need to make arrangements, please don't hesitate to reach out.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you for choosing us,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const reviewRequestEmail = (params: {
  clientFirstName: string;
  businessName: string;
  googleReviewLink?: string;
  yelpReviewLink?: string;
  facebookReviewLink?: string;
  customMessage?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    googleReviewLink,
    yelpReviewLink,
    facebookReviewLink,
    customMessage,
  } = params;

  const hasLinks = !!(googleReviewLink || yelpReviewLink || facebookReviewLink);

  const reviewSection = hasLinks
    ? reviewButtons({ google: googleReviewLink, yelp: yelpReviewLink, facebook: facebookReviewLink })
    : `<p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6;">You can find us on Google Maps by searching for <strong>${esc(businessName)}</strong> to leave a review.</p>`;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">How Did We Do? &#x2B50;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we hope your experience was exceptional!</p>
    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      Thank you for choosing <strong>${esc(businessName)}</strong>! We hope your experience was exceptional.
    </p>
    ${customMessage ? `<p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">${esc(customMessage)}</p>` : ''}
    ${reviewSection}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you again for your business!<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const invoiceSentEmail = (params: {
  clientFirstName: string;
  businessName: string;
  invoiceNumber: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  taxAmount: number;
  taxRate?: number;
  discountAmount: number;
  total: number;
  dueDate?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    invoiceNumber,
    lineItems,
    subtotal,
    taxAmount,
    taxRate,
    discountAmount,
    total,
    dueDate,
    businessPhone,
    businessEmail,
  } = params;

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Invoice #${esc(invoiceNumber)}</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, please find your invoice from ${esc(businessName)} below.</p>
    ${dueDate ? infoBox('', `Payment due by <strong>${esc(dueDate)}</strong>.`, 'warning') : ''}
    ${lineItemsTable(lineItems, subtotal, taxAmount, taxRate, discountAmount, total)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      If you have any questions about this invoice, please don't hesitate to contact us.
    </p>
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you for your business,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const paymentReceiptEmail = (params: {
  clientFirstName: string;
  businessName: string;
  invoiceNumber: string;
  amountPaid: number;
  invoiceTotal: number;
  remainingBalance: number;
  paymentMethod?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    invoiceNumber,
    amountPaid,
    invoiceTotal,
    remainingBalance,
    paymentMethod,
    businessPhone,
    businessEmail,
  } = params;

  const rows: string[] = [
    detailRow('Invoice', `#${esc(invoiceNumber)}`),
    detailRow('Amount Paid', formatCurrency(amountPaid)),
  ];
  if (paymentMethod) rows.push(detailRow('Payment Method', esc(paymentMethod)));
  rows.push(detailRow('Invoice Total', formatCurrency(invoiceTotal)));
  rows.push(detailRow('Remaining Balance', formatCurrency(remainingBalance)));

  const balanceBox =
    remainingBalance <= 0
      ? infoBox('', '&#x2713; Paid in full &#x2014; Thank you!', 'success')
      : infoBox(
          '',
          `Remaining balance: <strong>${formatCurrency(remainingBalance)}</strong>. Please arrange payment at your convenience.`,
          'warning'
        );

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Payment Received &#x2713;</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${esc(clientFirstName)}, we've received your payment. Here are the details:</p>
    ${detailsCard(rows)}
    ${balanceBox}
    ${contactBlock(businessPhone, businessEmail)}
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you for your business,<br />
      <strong>${esc(businessName)}</strong>
    </p>`;

  return baseLayout(businessName, '#111827', content);
};

export const quoteSentEmail = (params: {
  clientFirstName: string;
  businessName: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  taxAmount?: number;
  taxRate?: number;
  total: number;
  acceptUrl: string;
  expiresAt?: string;
  notes?: string;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    lineItems,
    subtotal,
    taxAmount,
    taxRate,
    total,
    acceptUrl,
    expiresAt,
    notes,
    businessPhone,
    businessEmail,
  } = params;

  const content = `
    const baseTemplate = (businessName: string, content: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${businessName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#111827;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${businessName}</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 40px 32px 40px;color:#374151;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;color:#9ca3af;">This email was sent by ${businessName}. If you have any questions, please reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const highlightBox = (label: string, value: string): string => `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
  <tr>
    <td style="background-color:#f0f4ff;border-left:4px solid #4f46e5;border-radius:4px;padding:16px 20px;">
      <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.8px;">${label}</p>
      <p style="margin:0;font-size:16px;font-weight:600;color:#1f2937;">${value}</p>
    </td>
  </tr>
</table>
`;

export const appointmentConfirmationEmail = (params: {
  clientFirstName: string;
  businessName: string;
  appointmentDate: string;
  appointmentTime: string;
}): string => {
  const { clientFirstName, businessName, appointmentDate, appointmentTime } = params;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Confirmed ✓</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${clientFirstName}, your appointment has been confirmed.</p>

    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      We're looking forward to seeing you! Your appointment at <strong>${businessName}</strong> is all set. Here are the details:
    </p>

    ${highlightBox("Date", appointmentDate)}
    ${highlightBox("Time", appointmentTime)}

    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      If you need to reschedule or cancel, please contact us as soon as possible so we can accommodate you and other clients.
    </p>
    <p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      We look forward to serving you!
    </p>
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Best regards,<br />
      <strong>${businessName}</strong>
    </p>
  `;
  return baseTemplate(businessName, content);
};

export const weeklyReportEmail = (params: {
  businessName: string;
  ownerFirstName: string;
  weekStart: string;
  weekEnd: string;
  weeklyRevenue: number;
  appointmentsCompleted: number;
  newClients: number;
  avgTicketValue: number;
  unpaidInvoicesCount: number;
  unpaidInvoicesTotal: number;
  upcomingAppointments: Array<{
    clientName: string;
    startTime: string;
    serviceSummary: string;
  }>;
  appUrl: string;
}): string => {
  const {
    businessName,
    ownerFirstName,
    weekStart,
    weekEnd,
    weeklyRevenue,
    appointmentsCompleted,
    newClients,
    avgTicketValue,
    unpaidInvoicesCount,
    unpaidInvoicesTotal,
    upcomingAppointments,
    appUrl,
  } = params;

  const kpiCard = (
    label: string,
    value: string,
    sub: string,
    valueColor = '#111827'
  ): string =>
    `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
      <tr>
        <td style="padding:16px;text-align:center;">
          <p style="margin:0 0 6px 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">${label}</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:${valueColor};">${value}</p>
          ${sub ? `<p style="margin:4px 0 0 0;font-size:11px;color:#9ca3af;">${sub}</p>` : ''}
        </td>
      </tr>
    </table>`;

  const unpaidColor = unpaidInvoicesCount > 0 ? '#f59e0b' : '#111827';

  const kpiRows = `
    <tr>
      <td style="padding:12px 8px;width:50%;vertical-align:top;">
        ${kpiCard('WEEKLY REVENUE', formatCurrency(weeklyRevenue), '')}
      </td>
      <td style="padding:12px 8px;width:50%;vertical-align:top;">
        ${kpiCard('JOBS COMPLETED', String(appointmentsCompleted), 'this week')}
      </td>
    </tr>
    <tr>
      <td style="padding:12px 8px;width:50%;vertical-align:top;">
        ${kpiCard('NEW CLIENTS', String(newClients), 'added this week')}
      </td>
      <td style="padding:12px 8px;width:50%;vertical-align:top;">
        ${kpiCard('AVG TICKET', avgTicketValue > 0 ? formatCurrency(avgTicketValue) : '—', 'per completed job')}
      </td>
    </tr>
    <tr>
      <td style="padding:12px 8px;width:50%;vertical-align:top;">
        ${kpiCard('UNPAID INVOICES', String(unpaidInvoicesCount), formatCurrency(unpaidInvoicesTotal) + ' outstanding', unpaidColor)}
      </td>
      <td style="padding:12px 8px;width:50%;vertical-align:top;">
        ${kpiCard('UPCOMING APPTS', String(upcomingAppointments.length), 'next 7 days')}
      </td>
    </tr>`;

  const appointmentRows = upcomingAppointments
    .map(
      (appt, i) =>
        `<tr style="background-color:${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
          <td style="padding:10px 40px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">${esc(appt.clientName)}</p>
            <p style="margin:2px 0 0 0;font-size:12px;color:#6b7280;">${esc(appt.serviceSummary)}</p>
          </td>
          <td style="padding:10px 40px;border-bottom:1px solid #e5e7eb;text-align:right;">
            <p style="margin:0;font-size:13px;color:#374151;">${esc(appt.startTime)}</p>
          </td>
        </tr>`
    )
    .join('');

  const upcomingSection =
    upcomingAppointments.length > 0
      ? `<tr>
          <td>
            <p style="margin:0 0 12px 0;font-size:14px;font-weight:600;color:#111827;padding:0 40px;">Upcoming Appointments</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;">
              ${appointmentRows}
            </table>
          </td>
        </tr>`
      : `<tr>
          <td>
            <p style="margin:0;font-size:13px;color:#9ca3af;padding:8px 40px;">No upcoming appointments scheduled.</p>
          </td>
        </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weekly Report - ${esc(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#111827;padding:28px 40px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${esc(businessName)}</p>
              <p style="margin:6px 0 0 0;font-size:13px;color:#9ca3af;">Weekly Performance Report</p>
              <p style="margin:4px 0 0 0;font-size:12px;color:#6b7280;">${esc(weekStart)} – ${esc(weekEnd)}</p>
            </td>
          </tr>
          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0 40px;">
              <p style="margin:0;font-size:15px;color:#374151;">Hi ${esc(ownerFirstName)}, here's your weekly summary for ${esc(businessName)}.</p>
            </td>
          </tr>
          <!-- KPI Cards -->
          <tr>
            <td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${kpiRows}
              </table>
            </td>
          </tr>
          <!-- Upcoming Appointments -->
          ${upcomingSection}
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <a href="${esc(appUrl)}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;font-size:13px;font-weight:500;text-decoration:none;">View your dashboard</a>
              <p style="margin:8px 0 0 0;font-size:12px;color:#d1d5db;">&copy; ${new Date().getFullYear()} ${esc(businessName)} &nbsp;&middot;&nbsp; This report is sent every Monday morning.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const appointmentReminderEmail = (params: {
  clientFirstName: string;
  businessName: string;
  appointmentDate: string;
  appointmentTime: string;
}): string => {
  const { clientFirstName, businessName, appointmentDate, appointmentTime } = params;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Reminder 🔔</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${clientFirstName}, just a friendly reminder about your upcoming appointment.</p>

    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      This is a reminder that you have an upcoming appointment at <strong>${businessName}</strong>. We can't wait to see you!
    </p>

    ${highlightBox("Date", appointmentDate)}
    ${highlightBox("Time", appointmentTime)}

    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      Please arrive a few minutes early so we can get started on time. If you need to reschedule or cancel, please let us know as soon as possible.
    </p>
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      See you soon,<br />
      <strong>${businessName}</strong>
    </p>
  `;
  return baseTemplate(businessName, content);
};

export const appointmentCancellationEmail = (params: {
  clientFirstName: string;
  businessName: string;
  reason?: string;
}): string => {
  const { clientFirstName, businessName, reason } = params;
  const reasonBlock = reason
    ? `<p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;"><strong>Reason:</strong> ${reason}</p>`
    : "";
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Appointment Cancelled</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${clientFirstName}, we're sorry to inform you that your appointment has been cancelled.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="background-color:#fff5f5;border-left:4px solid #ef4444;border-radius:4px;padding:16px 20px;">
          <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
            Your appointment at <strong>${businessName}</strong> has been cancelled. We apologize for any inconvenience this may cause.
          </p>
          ${reasonBlock}
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      We'd love to reschedule at a time that works for you. Please contact us to book a new appointment at your earliest convenience.
    </p>
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Sincerely,<br />
      <strong>${businessName}</strong>
    </p>
  `;
  return baseTemplate(businessName, content);
};

export const jobCompleteEmail = (params: {
  clientFirstName: string;
  businessName: string;
}): string => {
  const { clientFirstName, businessName } = params;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Your Vehicle is Ready! 🚗✨</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${clientFirstName}, great news — your vehicle is ready for pickup!</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="background-color:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;padding:16px 20px;">
          <p style="margin:0;font-size:15px;font-weight:600;color:#15803d;">
            ✓ Work Complete — Your vehicle is ready for pickup at ${businessName}.
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      Our team has finished working on your vehicle and it's looking great! You can come pick it up at your convenience during our business hours.
    </p>
    <p style="margin:16px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      If you have any questions or need to make arrangements, please don't hesitate to reach out to us.
    </p>
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you for choosing us,<br />
      <strong>${businessName}</strong>
    </p>
  `;
  return baseTemplate(businessName, content);
};

export const reviewRequestEmail = (params: {
  clientFirstName: string;
  businessName: string;
  reviewLink: string;
}): string => {
  const { clientFirstName, businessName, reviewLink } = params;
  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">How Did We Do? ⭐</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${clientFirstName}, we hope you're loving your vehicle!</p>

    <p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.6;">
      Thank you so much for choosing <strong>${businessName}</strong>. We hope your experience with us was exceptional. Your feedback means the world to us and helps us continue to deliver the best service possible.
    </p>
    <p style="margin:0 0 32px 0;font-size:15px;color:#374151;line-height:1.6;">
      If you have a moment, we'd love to hear what you think. Leaving a review takes less than a minute and makes a huge difference for our business.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px 0;">
      <tr>
        <td align="center">
          <a
            href="${reviewLink}"
            target="_blank"
            rel="noopener noreferrer"
            style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 36px;border-radius:6px;letter-spacing:0.3px;"
          >
            Leave a Review
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
      Or copy and paste this link into your browser:<br />
      <a href="${reviewLink}" style="color:#4f46e5;word-break:break-all;">${reviewLink}</a>
    </p>

    <p style="margin:32px 0 0 0;font-size:15px;color:#374151;">
      Thank you again,<br />
      <strong>${businessName}</strong>
    </p>
  `;
  return baseTemplate(businessName, content);
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

export const invoiceEmail = (params: {
  clientFirstName: string;
  businessName: string;
  invoiceNumber: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  businessPhone?: string;
  businessEmail?: string;
}): string => {
  const {
    clientFirstName,
    businessName,
    invoiceNumber,
    lineItems,
    subtotal,
    taxAmount,
    discountAmount,
    total,
    businessPhone,
    businessEmail,
  } = params;

  const lineItemRows = lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${item.description}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:center;">${item.quantity}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-align:right;">${formatCurrency(item.unitPrice)}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#111827;text-align:right;">${formatCurrency(item.total)}</td>
      </tr>
    `
    )
    .join("");

  const discountRow =
    discountAmount > 0
      ? `
      <tr>
        <td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">Discount</td>
        <td style="padding:8px 16px;font-size:14px;color:#ef4444;text-align:right;">-${formatCurrency(discountAmount)}</td>
      </tr>
    `
      : "";

  const taxRow =
    taxAmount > 0
      ? `
      <tr>
        <td colspan="3" style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">Tax</td>
        <td style="padding:8px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(taxAmount)}</td>
      </tr>
    `
      : "";

  const contactLine = [
    businessPhone ? `Phone: ${businessPhone}` : null,
    businessEmail ? `Email: ${businessEmail}` : null,
  ]
    .filter(Boolean)
    .join(" &nbsp;|&nbsp; ");

  const content = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#111827;">Invoice</h1>
    <p style="margin:0 0 24px 0;font-size:15px;color:#6b7280;">Hi ${clientFirstName}, please find your invoice from ${businessName} below.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
      <tr>
        <td style="font-size:13px;color:#6b7280;padding-bottom:4px;">Invoice Number</td>
        <td style="font-size:13px;color:#111827;font-weight:600;padding-bottom:4px;text-align:right;">#${invoiceNumber}</td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:6px;border-collapse:separate;overflow:hidden;">
      <thead>
        <tr style="background-color:#111827;">
          <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:left;text-transform:uppercase;letter-spacing:0.6px;">Description</th>
          <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:center;text-transform:uppercase;letter-spacing:0.6px;">Qty</th>
          <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Unit Price</th>
          <th style="padding:12px 16px;font-size:12px;font-weight:600;color:#d1d5db;text-align:right;text-transform:uppercase;letter-spacing:0.6px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemRows}
        <tr style="background-color:#f9fafb;">
          <td colspan="3" style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">Subtotal</td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;text-align:right;">${formatCurrency(subtotal)}</td>
        </tr>
        ${discountRow}
        ${taxRow}
        <tr style="background-color:#f0f4ff;">
          <td colspan="3" style="padding:14px 16px;font-size:16px;font-weight:700;color:#111827;text-align:right;">Total Due</td>
          <td style="padding:14px 16px;font-size:16px;font-weight:700;color:#4f46e5;text-align:right;">${formatCurrency(total)}</td>
        </tr>
      </tbody>
    </table>

    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;line-height:1.6;">
      If you have any questions about this invoice, please don't hesitate to contact us.
    </p>
    ${
      contactLine
        ? `<p style="margin:16px 0 0 0;font-size:14px;color:#6b7280;">${contactLine}</p>`
        : ""
    }
    <p style="margin:24px 0 0 0;font-size:15px;color:#374151;">
      Thank you for your business,<br />
      <strong>${businessName}</strong>
    </p>
  `;

  return baseTemplate(businessName, content);
};