import { escapeHtml, formatCurrency, formatDate } from "./escape.js";

export type QuoteTemplateData = {
  status?: string | null;
  subtotal?: string | number | null;
  taxRate?: string | number | null;
  taxAmount?: string | number | null;
  total?: string | number | null;
  notes?: string | null;
  createdAt?: string | Date | null;
  expiresAt?: string | Date | null;
  business: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    timezone?: string | null;
  };
  client: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
    color?: string | null;
    licensePlate?: string | null;
  } | null;
  lineItems: Array<{
    description?: string | null;
    quantity?: string | number | null;
    unitPrice?: string | number | null;
    total?: string | number | null;
  }>;
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

export function renderQuoteHtml(data: QuoteTemplateData): string {
  const tz = data.business.timezone ?? "America/New_York";
  const status = (data.status ?? "draft").toLowerCase();
  const businessName = escapeHtml(data.business.name ?? "Business");
  const clientName = escapeHtml([data.client.firstName, data.client.lastName].filter(Boolean).join(" ") || "Client");
  const clientEmail = escapeHtml(data.client.email ?? "");
  const clientPhone = escapeHtml(data.client.phone ?? "");
  const clientAddress = escapeHtml(data.client.address ?? "");
  const createdAt = escapeHtml(formatDate(data.createdAt, tz) || "-");
  const expiresAt = escapeHtml(formatDate(data.expiresAt, tz) || "-");
  const vehicleLine = escapeHtml([data.vehicle?.year, data.vehicle?.make, data.vehicle?.model].filter(Boolean).join(" ") || "-");
  const vehicleMeta = escapeHtml([data.vehicle?.color, data.vehicle?.licensePlate].filter(Boolean).join(" - "));
  const notes = escapeHtml(data.notes ?? "");
  const taxRate = escapeHtml(String(data.taxRate ?? 0));
  const taxAmount = money(data.taxAmount);
  const rows = (data.lineItems ?? [])
    .map((line) => `<tr><td class="desc">${escapeHtml(line.description ?? "")}</td><td class="num" data-label="Qty">${escapeHtml(String(line.quantity ?? ""))}</td><td class="num" data-label="Unit">${money(line.unitPrice)}</td><td class="num" data-label="Amount">${money(line.total)}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Estimate - ${businessName}</title>
  <style>
    :root { color-scheme: light; --ink:#0f172a; --muted:#475569; --line:#dbe2ea; --panel:#f8fafc; --accent:#f97316; }
    * { box-sizing:border-box; } html,body { margin:0; background:#eef2f6; color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif; }
    .page { padding:32px 18px 56px; } .doc { max-width:860px; margin:0 auto; background:#fff; border:1px solid rgba(148,163,184,.2); border-radius:24px; box-shadow:0 24px 60px rgba(15,23,42,.12); overflow:hidden; }
    .header { padding:32px 36px 24px; border-bottom:1px solid var(--line); display:grid; grid-template-columns:minmax(0,1.35fr) minmax(260px,.85fr); gap:24px; background:radial-gradient(circle at top right, rgba(249,115,22,.14), transparent 32%),linear-gradient(180deg, rgba(248,250,252,.95), #fff); }
    .eyebrow,.section-title { font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); margin:0 0 10px; }
    .section-title { color:#64748b; margin-bottom:12px; }
    h1 { margin:0; font-size:32px; line-height:1.05; letter-spacing:-.03em; }
    .sub { margin:10px 0 0; color:var(--muted); font-size:14px; max-width:42ch; } .stack { display:grid; gap:4px; margin-top:16px; color:var(--muted); font-size:13px; }
    .meta { border:1px solid rgba(148,163,184,.22); border-radius:18px; padding:18px; background:rgba(255,255,255,.84); }
    .meta .number { font-size:28px; font-weight:700; letter-spacing:-.03em; margin:8px 0 10px; }
    .pill { display:inline-flex; border-radius:999px; padding:6px 10px; font-size:12px; font-weight:700; background:#e5e7eb; color:#374151; }
    .pill.sent { background:#dbeafe; color:#1d4ed8; } .pill.accepted { background:#dcfce7; color:#166534; } .pill.declined { background:#fee2e2; color:#b91c1c; } .pill.expired { background:#fef3c7; color:#92400e; }
    .meta-grid { display:grid; gap:10px; margin-top:16px; } .meta-row { display:flex; justify-content:space-between; gap:12px; font-size:13px; } .meta-row span:first-child { color:#64748b; } .meta-row span:last-child { font-weight:600; text-align:right; }
    .body { padding:28px 36px 36px; display:grid; gap:22px; }
    .hero,.summary { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(250px,.8fr); gap:18px; }
    .card { border:1px solid var(--line); border-radius:18px; padding:18px; background:#fff; } .soft { background:var(--panel); }
    .party { font-size:18px; font-weight:700; letter-spacing:-.02em; margin:0 0 6px; } .detail { color:var(--muted); font-size:14px; word-break:break-word; }
    .amount { border-radius:20px; padding:20px 22px; background:linear-gradient(180deg, rgba(249,115,22,.08), rgba(255,255,255,.96)); border:1px solid rgba(249,115,22,.18); } .amount .big { margin:8px 0 6px; font-size:36px; line-height:1; letter-spacing:-.04em; font-weight:800; }
    table { width:100%; border-collapse:collapse; } .lines { border:1px solid var(--line); border-radius:18px; overflow:hidden; background:#fff; }
    .lines th { background:var(--panel); color:#64748b; font-size:11px; letter-spacing:.14em; text-transform:uppercase; text-align:left; padding:13px 16px; border-bottom:1px solid var(--line); }
    .lines td { padding:15px 16px; border-bottom:1px solid #edf2f7; font-size:14px; vertical-align:top; } .lines tr:last-child td { border-bottom:none; } .desc { font-weight:600; } .num { text-align:right; white-space:nowrap; }
    .totals td { padding:6px 0; font-size:14px; border:none; } .totals .label { color:#64748b; } .totals .value { text-align:right; font-weight:600; } .totals .grand td { padding-top:12px; border-top:1px solid rgba(148,163,184,.35); font-size:20px; font-weight:800; color:var(--ink); }
    .footer { padding:0 36px 34px; color:#64748b; font-size:12px; text-align:center; }
    @page { margin:14mm; } @media (max-width:760px) { .page{padding:0;} .doc{border:none;border-radius:0;box-shadow:none;} .header,.body,.footer{padding-left:20px;padding-right:20px;} .header,.hero,.summary{grid-template-columns:1fr;} .lines thead{display:none;} .lines,.lines tbody,.lines tr,.lines td{display:block;width:100%;} .lines td{padding:8px 16px;border-bottom:none;} .lines tr{padding:10px 0;border-bottom:1px solid #edf2f7;} .lines tr:last-child{border-bottom:none;} .num::before{content:attr(data-label);float:left;color:#64748b;font-weight:600;} }
    @media print { html,body{background:#fff;} .page{padding:0;} .doc{max-width:none;border:none;border-radius:0;box-shadow:none;} }
  </style>
</head>
<body>
  <div class="page">
    <main class="doc">
      <section class="header">
        <div>
          <p class="eyebrow">Customer Estimate</p>
          <h1>${businessName}</h1>
          <p class="sub">A clean estimate of proposed work, pricing, and next steps.</p>
          <div class="stack">
            ${data.business.email ? `<div>${escapeHtml(data.business.email)}</div>` : ""}
            ${data.business.phone ? `<div>${escapeHtml(data.business.phone)}</div>` : ""}
            ${data.business.address ? `<div>${escapeHtml(data.business.address)}</div>` : ""}
          </div>
        </div>
        <aside class="meta">
          <p class="section-title">Estimate</p>
          <div class="number">${money(data.total)}</div>
          <span class="pill ${status}">${escapeHtml(label(status))}</span>
          <div class="meta-grid">
            <div class="meta-row"><span>Created</span><span>${createdAt}</span></div>
            <div class="meta-row"><span>Valid through</span><span>${expiresAt}</span></div>
            <div class="meta-row"><span>Vehicle</span><span>${vehicleLine}</span></div>
          </div>
        </aside>
      </section>
      <section class="body">
        <section class="hero">
          <div class="card">
            <p class="section-title">Prepared For</p>
            <p class="party">${clientName}</p>
            ${clientEmail ? `<div class="detail">${clientEmail}</div>` : ""}
            ${clientPhone ? `<div class="detail">${clientPhone}</div>` : ""}
            ${clientAddress ? `<div class="detail">${clientAddress}</div>` : ""}
            ${vehicleLine !== "-" ? `<div class="detail" style="margin-top:8px;"><strong>${vehicleLine}</strong>${vehicleMeta ? ` - ${vehicleMeta}` : ""}</div>` : ""}
          </div>
          <div class="amount">
            <p class="section-title">Estimated Total</p>
            <div class="big">${money(data.total)}</div>
            <div class="detail">Prepared for review and approval.</div>
          </div>
        </section>
        <section class="lines">
          <table>
            <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4">No line items</td></tr>'}</tbody>
          </table>
        </section>
        <section class="summary">
          <div style="display:grid; gap:18px;">
            <div class="card">
              <p class="section-title">Estimate Notes</p>
              <div class="detail">${notes || "Review the proposed work and reach out with any questions before approving."}</div>
            </div>
            <div class="card soft">
              <p class="section-title">Next Steps</p>
              <div class="detail">Approve this estimate to move forward with scheduling, work preparation, and invoicing.</div>
            </div>
          </div>
          <div class="card soft">
            <p class="section-title">Estimate Summary</p>
            <table class="totals">
              <tr><td class="label">Subtotal</td><td class="value">${money(data.subtotal)}</td></tr>
              ${numberValue(data.taxAmount) > 0 ? `<tr><td class="label">Tax (${taxRate}%)</td><td class="value">${taxAmount}</td></tr>` : ""}
              <tr class="grand"><td>Estimated total</td><td class="value">${money(data.total)}</td></tr>
            </table>
          </div>
        </section>
      </section>
      <div class="footer">Generated by ${businessName}. Pricing and scope are subject to final approval.</div>
    </main>
  </div>
</body>
</html>`.replaceAll("â€”", "-").replaceAll("âˆ’", "-");
}
