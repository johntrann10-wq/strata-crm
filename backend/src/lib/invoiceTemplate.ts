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
  publicPaymentUrl?: string | null;
  portalUrl?: string | null;
};

function money(value: string | number | null | undefined): string {
  const parsed = typeof value === "string" ? parseFloat(value) : value;
  return formatCurrency(Number.isFinite(parsed as number) ? (parsed as number) : 0);
}

function numberValue(value: string | number | null | undefined): number {
  const parsed = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(parsed as number) ? (parsed as number) : 0;
}

function label(value: string | null | undefined): string {
  return (value ?? "draft")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function renderInvoiceHtml(data: InvoiceTemplateData): string {
  const tz = data.business.timezone ?? "America/New_York";
  const status = (data.status ?? "draft").toLowerCase();
  const businessName = escapeHtml(data.business.name ?? "Business");
  const clientName = escapeHtml([data.client.firstName, data.client.lastName].filter(Boolean).join(" ") || "Client");
  const clientEmail = escapeHtml(data.client.email ?? "");
  const clientPhone = escapeHtml(data.client.phone ?? "");
  const clientAddress = escapeHtml(data.client.address ?? "");
  const issuedDate = escapeHtml(formatDate(data.createdAt, tz) || "-");
  const dueDate = escapeHtml(formatDate(data.dueDate, tz) || "-");
  const balance = Math.max(numberValue(data.total) - numberValue(data.totalPaid), 0);
  const notes = escapeHtml(data.notes ?? "");
  const publicPaymentUrl = data.publicPaymentUrl?.trim() || "";
  const portalUrl = data.portalUrl?.trim() || "";
  const discountAmount = money(data.discountAmount);
  const taxAmount = money(data.taxAmount);
  const taxRate = escapeHtml(String(data.taxRate ?? 0));
  const lineItemCount = data.lineItems?.length ?? 0;
  const rows = (data.lineItems ?? [])
    .map((line) => `<tr><td class="desc">${escapeHtml(line.description ?? "")}</td><td class="num" data-label="Qty">${escapeHtml(String(line.quantity ?? ""))}</td><td class="num" data-label="Unit">${money(line.unitPrice)}</td><td class="num" data-label="Amount">${money(line.total)}</td></tr>`)
    .join("");
  const payments = (data.payments ?? [])
    .map((payment) => `<tr><td>${escapeHtml(formatDate(payment.paidAt, tz) || "-")}</td><td>${escapeHtml(payment.method ?? "-")}</td><td class="num">${money(payment.amount)}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invoice ${escapeHtml(data.invoiceNumber ?? "-")}</title>
  <style>
    :root { color-scheme: light; --ink:#0f172a; --muted:#475569; --line:#dbe2ea; --panel:#f8fafc; --accent:#f97316; }
    * { box-sizing:border-box; } html,body { margin:0; background:#f3f5f7; color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif; }
    .page { padding:24px 16px 40px; } .doc { max-width:820px; margin:0 auto; background:#fff; border:1px solid rgba(148,163,184,.22); border-radius:18px; box-shadow:0 10px 28px rgba(15,23,42,.08); overflow:hidden; }
    .header { padding:28px 32px 22px; border-bottom:1px solid var(--line); display:grid; grid-template-columns:minmax(0,1.35fr) minmax(240px,.85fr); gap:20px; background:#fff; }
    .eyebrow,.section-title { font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#64748b; margin:0 0 10px; }
    .eyebrow { color:var(--accent); }
    h1 { margin:0; font-size:30px; line-height:1.05; letter-spacing:-.03em; }
    .sub { margin:10px 0 0; color:var(--muted); font-size:14px; max-width:42ch; } .stack { display:grid; gap:4px; margin-top:16px; color:var(--muted); font-size:13px; }
    .meta { border:1px solid var(--line); border-radius:14px; padding:16px; background:var(--panel); }
    .meta .number { font-size:24px; font-weight:700; letter-spacing:-.03em; margin:8px 0 10px; }
    .pill { display:inline-flex; border-radius:999px; padding:6px 10px; font-size:12px; font-weight:700; background:#e5e7eb; color:#374151; }
    .pill.sent { background:#dbeafe; color:#1d4ed8; } .pill.paid { background:#dcfce7; color:#166534; } .pill.partial { background:#fef3c7; color:#92400e; } .pill.void { background:#fee2e2; color:#b91c1c; }
    .meta-grid { display:grid; gap:10px; margin-top:16px; } .meta-row { display:flex; justify-content:space-between; gap:12px; font-size:13px; } .meta-row span:first-child { color:#64748b; } .meta-row span:last-child { font-weight:600; text-align:right; }
    .body { padding:24px 32px 32px; display:grid; gap:18px; }
    .hero,.summary { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(250px,.8fr); gap:16px; }
    .card { border:1px solid var(--line); border-radius:14px; padding:16px; background:#fff; } .soft { background:var(--panel); }
    .party { font-size:18px; font-weight:700; letter-spacing:-.02em; margin:0 0 6px; } .detail { color:var(--muted); font-size:14px; word-break:break-word; }
    .amount { border-radius:14px; padding:18px; background:var(--panel); border:1px solid var(--line); } .amount .big { margin:8px 0 6px; font-size:34px; line-height:1; letter-spacing:-.04em; font-weight:800; }
    .cta { margin-top:16px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#f97316; color:#fff; padding:11px 18px; font-size:14px; font-weight:700; text-decoration:none; }
    .cta:hover { background:#ea580c; }
    .sub-cta { margin-top:12px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; border:1px solid #cbd5e1; background:#fff; color:#0f172a; padding:11px 18px; font-size:14px; font-weight:700; text-decoration:none; }
    .cta-note { margin-top:10px; color:#64748b; font-size:12px; }
    table { width:100%; border-collapse:collapse; } .lines { border:1px solid var(--line); border-radius:18px; overflow:hidden; background:#fff; }
    .lines th { background:var(--panel); color:#64748b; font-size:11px; letter-spacing:.14em; text-transform:uppercase; text-align:left; padding:13px 16px; border-bottom:1px solid var(--line); }
    .lines td { padding:15px 16px; border-bottom:1px solid #edf2f7; font-size:14px; vertical-align:top; } .lines tr:last-child td { border-bottom:none; } .desc { font-weight:600; } .num { text-align:right; white-space:nowrap; }
    .totals td { padding:6px 0; font-size:14px; border:none; } .totals .label { color:#64748b; } .totals .value { text-align:right; font-weight:600; } .totals .grand td { padding-top:12px; border-top:1px solid rgba(148,163,184,.35); font-size:20px; font-weight:800; color:var(--ink); }
    .payments th,.payments td { padding:10px 0; font-size:13px; border-bottom:1px solid rgba(148,163,184,.18); } .payments th { text-align:left; color:#64748b; font-size:11px; letter-spacing:.12em; text-transform:uppercase; } .payments tr:last-child td { border-bottom:none; }
    .footer { padding:0 32px 28px; color:#64748b; font-size:12px; text-align:center; }
    @page { margin:14mm; } @media (max-width:760px) { .page{padding:0;} .doc{border:none;border-radius:0;box-shadow:none;} .header,.body,.footer{padding-left:20px;padding-right:20px;} .header,.hero,.summary{grid-template-columns:1fr;} .lines thead{display:none;} .lines,.lines tbody,.lines tr,.lines td{display:block;width:100%;} .lines td{padding:8px 16px;border-bottom:none;} .lines tr{padding:10px 0;border-bottom:1px solid #edf2f7;} .lines tr:last-child{border-bottom:none;} .num::before{content:attr(data-label);float:left;color:#64748b;font-weight:600;} }
    @media print { html,body{background:#fff;} .page{padding:0;} .doc{max-width:none;border:none;border-radius:0;box-shadow:none;} }
  </style>
</head>
<body>
  <div class="page">
    <main class="doc">
      <section class="header">
        <div>
          <p class="eyebrow">Client Invoice</p>
          <h1>${businessName}</h1>
          <div class="stack">
            ${data.business.email ? `<div>${escapeHtml(data.business.email)}</div>` : ""}
            ${data.business.phone ? `<div>${escapeHtml(data.business.phone)}</div>` : ""}
            ${data.business.address ? `<div>${escapeHtml(data.business.address)}</div>` : ""}
          </div>
        </div>
        <aside class="meta">
          <p class="section-title">Invoice</p>
          <div class="number">#${escapeHtml(data.invoiceNumber ?? "-")}</div>
          <span class="pill ${status}">${escapeHtml(label(status))}</span>
          <div class="meta-grid">
            <div class="meta-row"><span>Issued</span><span>${issuedDate}</span></div>
            <div class="meta-row"><span>Due</span><span>${dueDate}</span></div>
            <div class="meta-row"><span>Balance due</span><span>${money(balance)}</span></div>
            <div class="meta-row"><span>Scope</span><span>${lineItemCount} ${lineItemCount === 1 ? "line item" : "line items"}</span></div>
          </div>
        </aside>
      </section>
      <section class="body">
        <section class="hero">
          <div class="card">
            <p class="section-title">Bill To</p>
            <p class="party">${clientName}</p>
            ${clientEmail ? `<div class="detail">${clientEmail}</div>` : ""}
            ${clientPhone ? `<div class="detail">${clientPhone}</div>` : ""}
            ${clientAddress ? `<div class="detail">${clientAddress}</div>` : ""}
          </div>
          <div class="amount">
            <p class="section-title">Total Invoice</p>
            <div class="big">${money(data.total)}</div>
            <div class="detail">${balance > 0 ? `${money(balance)} remaining` : "Paid in full"}</div>
            ${balance > 0 && publicPaymentUrl ? `<a class="cta" href="${escapeHtml(publicPaymentUrl)}">Pay ${money(balance)} with Stripe</a><div class="cta-note">Secure checkout powered by Stripe.</div>` : ""}
          </div>
        </section>
        <section class="lines">
          <table>
            <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4">No line items</td></tr>'}</tbody>
          </table>
        </section>
        <section class="summary">
          <div class="card">
            <p class="section-title">Notes</p>
            <div class="detail">${notes || "Thank you for your business."}</div>
          </div>
          <div style="display:grid; gap:18px;">
            <div class="card soft">
              <p class="section-title">Charges</p>
              <table class="totals">
                <tr><td class="label">Subtotal</td><td class="value">${money(data.subtotal)}</td></tr>
                ${numberValue(data.discountAmount) > 0 ? `<tr><td class="label">Discount</td><td class="value">-${discountAmount}</td></tr>` : ""}
                ${numberValue(data.taxAmount) > 0 ? `<tr><td class="label">Tax (${taxRate}%)</td><td class="value">${taxAmount}</td></tr>` : ""}
                ${numberValue(data.totalPaid) > 0 ? `<tr><td class="label">Payments received</td><td class="value">${money(data.totalPaid)}</td></tr>` : ""}
                <tr class="grand"><td>Total</td><td class="value">${money(data.total)}</td></tr>
              </table>
            </div>
            ${payments ? `<div class="card soft"><p class="section-title">Payment History</p><table class="payments"><thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>${payments}</tbody></table></div>` : ""}
          </div>
        </section>
        <section class="card soft">
          <p class="section-title">Questions?</p>
          <div class="detail">If anything on this invoice looks incorrect, contact ${businessName} before payment so the record can be reviewed with you.</div>
          ${portalUrl ? `<a class="sub-cta" href="${escapeHtml(portalUrl)}">Open customer hub</a>` : ""}
        </section>
      </section>
      <div class="footer">Generated by ${businessName}. Please keep this invoice for your service records and payment history.</div>
    </main>
  </div>
</body>
</html>`.replaceAll("â€”", "-").replaceAll("âˆ’", "-");
}
