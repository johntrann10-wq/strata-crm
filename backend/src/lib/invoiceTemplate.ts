/**
 * Standardized HTML invoice template for clients.
 * Responsive (mobile & desktop), XSS-safe (all inputs escaped), includes line items, discounts, tax, partial payments.
 */

import { escapeHtml, formatCurrency, formatDate } from "./escape.js";

export type InvoiceTemplateBusiness = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  timezone?: string | null;
};

export type InvoiceTemplateClient = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type InvoiceTemplateLineItem = {
  description?: string | null;
  quantity?: string | number | null;
  unitPrice?: string | number | null;
  total?: string | number | null;
};

export type InvoiceTemplatePayment = {
  amount?: string | number | null;
  method?: string | null;
  paidAt?: string | Date | null;
};

export type InvoiceTemplateData = {
  invoiceNumber?: string | null;
  status?: string | null;
  dueDate?: string | Date | null;
  subtotal?: string | number | null;
  taxRate?: string | number | null;
  taxAmount?: string | number | null;
  discountAmount?: string | number | null;
  total?: string | number | null;
  totalPaid?: string | number | null;
  notes?: string | null;
  createdAt?: string | Date | null;
  business: InvoiceTemplateBusiness;
  client: InvoiceTemplateClient;
  lineItems: InvoiceTemplateLineItem[];
  payments: InvoiceTemplatePayment[];
};

function fmtCur(n: string | number | null | undefined): string {
  if (n === null || n === undefined) return "$0.00";
  const num = typeof n === "string" ? parseFloat(n) : n;
  return formatCurrency(Number.isFinite(num) ? num : 0);
}

export function renderInvoiceHtml(data: InvoiceTemplateData): string {
  const tz = data.business?.timezone ?? "America/New_York";
  const businessName = escapeHtml(data.business?.name ?? "Business");
  const businessEmail = escapeHtml(data.business?.email ?? "");
  const businessPhone = escapeHtml(data.business?.phone ?? "");
  const businessAddr = [data.business?.address, data.business?.city, data.business?.state, data.business?.zip]
    .filter(Boolean)
    .join(", ");
  const clientName = [data.client?.firstName, data.client?.lastName].filter(Boolean).join(" ") || "Client";
  const clientEmail = escapeHtml(data.client?.email ?? "");
  const clientPhone = escapeHtml(data.client?.phone ?? "");
  const invoiceNumber = escapeHtml(data.invoiceNumber ?? "—");
  const dueDate = formatDate(data.dueDate, tz);
  const subtotal = fmtCur(data.subtotal);
  const taxRate = escapeHtml(String(data.taxRate ?? 0));
  const taxAmount = fmtCur(data.taxAmount);
  const discountAmount = fmtCur(data.discountAmount);
  const total = fmtCur(data.total);
  const totalPaid = fmtCur(data.totalPaid);
  const notes = escapeHtml(data.notes ?? "");
  const status = escapeHtml(data.status ?? "draft");

  const lineRows = (data.lineItems ?? []).map(
    (li) =>
      `<tr>
        <td class="desc">${escapeHtml(li.description ?? "")}</td>
        <td class="qty">${escapeHtml(String(li.quantity ?? ""))}</td>
        <td class="num">${fmtCur(li.unitPrice)}</td>
        <td class="num">${fmtCur(li.total)}</td>
      </tr>`
  ).join("");

  const paymentRows = (data.payments ?? []).map(
    (p) =>
      `<tr>
        <td>${formatDate(p.paidAt, tz)}</td>
        <td>${escapeHtml(String(p.method ?? ""))}</td>
        <td class="num">${fmtCur(p.amount)}</td>
      </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invoice ${invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.5; color: #1a1a1a; margin: 0; padding: 16px; background: #f5f5f5; }
    .invoice { max-width: 700px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; }
    .header { padding: 24px; border-bottom: 1px solid #eee; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; }
    .brand { font-size: 1.25rem; font-weight: 700; color: #111; }
    .meta { text-align: right; }
    .meta .inv-num { font-size: 1.1rem; font-weight: 600; }
    .meta .status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-top: 4px; }
    .status.paid { background: #dcfce7; color: #166534; }
    .status.partial { background: #fef9c3; color: #854d0e; }
    .status.sent { background: #dbeafe; color: #1e40af; }
    .status.draft { background: #f3f4f6; color: #374151; }
    .parties { padding: 24px; display: flex; flex-wrap: wrap; gap: 24px; }
    .party { flex: 1; min-width: 180px; }
    .party h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
    .party p { margin: 0 0 4px; }
    .party p:last-child { margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
    .num, .qty { text-align: right; }
    .totals { padding: 24px; background: #fafafa; }
    .totals table { max-width: 280px; margin-left: auto; }
    .totals td { border: none; padding: 4px 0; }
    .totals .label { color: #6b7280; }
    .totals .grand { font-size: 1.25rem; font-weight: 700; padding-top: 8px; border-top: 2px solid #1a1a1a; }
    .payments { padding: 0 24px 24px; }
    .payments h3 { font-size: 12px; color: #6b7280; margin: 0 0 8px; }
    .notes { padding: 24px; border-top: 1px solid #eee; color: #6b7280; font-size: 13px; }
    @media (max-width: 600px) {
      .header { flex-direction: column; }
      .meta { text-align: left; }
      th, td { padding: 8px; font-size: 13px; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div>
        <div class="brand">${businessName}</div>
        ${businessEmail ? `<p>${businessEmail}</p>` : ""}
        ${businessPhone ? `<p>${businessPhone}</p>` : ""}
        ${businessAddr ? `<p>${escapeHtml(businessAddr)}</p>` : ""}
      </div>
      <div class="meta">
        <div class="inv-num">Invoice ${invoiceNumber}</div>
        <span class="status ${escapeHtml(status)}">${status}</span>
        ${dueDate ? `<p style="margin-top:8px;">Due: ${escapeHtml(dueDate)}</p>` : ""}
      </div>
    </div>
    <div class="parties">
      <div class="party">
        <h3>Bill to</h3>
        <p><strong>${escapeHtml(clientName)}</strong></p>
        ${clientEmail ? `<p>${clientEmail}</p>` : ""}
        ${clientPhone ? `<p>${clientPhone}</p>` : ""}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="desc">Description</th>
          <th class="qty">Qty</th>
          <th class="num">Unit price</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${lineRows || "<tr><td colspan=\"4\">No line items</td></tr>"}</tbody>
    </table>
    <div class="totals">
      <table>
        <tr><td class="label">Subtotal</td><td class="num">${subtotal}</td></tr>
        ${Number(parseFloat(String(data.discountAmount ?? 0))) > 0 ? `<tr><td class="label">Discount</td><td class="num">−${discountAmount}</td></tr>` : ""}
        ${Number(parseFloat(String(data.taxAmount ?? 0))) > 0 ? `<tr><td class="label">Tax (${taxRate}%)</td><td class="num">${taxAmount}</td></tr>` : ""}
        <tr><td class="label grand">Total</td><td class="num grand">${total}</td></tr>
        ${Number(parseFloat(String(data.totalPaid ?? 0))) > 0 ? `<tr><td class="label">Paid</td><td class="num">${totalPaid}</td></tr>` : ""}
      </table>
    </div>
    ${paymentRows ? `<div class="payments"><h3>Payment history</h3><table><thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>${paymentRows}</tbody></table></div>` : ""}
    ${notes ? `<div class="notes">${notes}</div>` : ""}
  </div>
</body>
</html>`;
}
