type AppointmentTemplateData = {
  appointmentTitle?: string | null;
  appointmentDateTime?: string | null;
  status?: string | null;
  notes?: string | null;
  business: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  client: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
  } | null;
  serviceSummary?: string | null;
  totalPrice?: string | number | null;
  depositAmount?: string | number | null;
  collectedAmount?: string | number | null;
  balanceDue?: string | number | null;
  paidInFull?: boolean | null;
  depositSatisfied?: boolean | null;
  publicPaymentUrl?: string | null;
  publicRequestChangeUrl?: string | null;
  portalUrl?: string | null;
  changeRequestState?: "sent" | "recorded" | null;
  stripePaymentState?: "success" | "cancelled" | null;
};

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value: string | number | null | undefined): string {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(parsed) ? parsed : 0
  );
}

function label(value: string | null | undefined): string {
  return (value ?? "scheduled")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function renderAppointmentHtml(data: AppointmentTemplateData): string {
  const status = (data.status ?? "scheduled").toLowerCase();
  const businessName = escapeHtml(data.business.name ?? "Business");
  const clientName = escapeHtml([data.client.firstName, data.client.lastName].filter(Boolean).join(" ") || "Client");
  const vehicleLabel = escapeHtml(
    [data.vehicle?.year, data.vehicle?.make, data.vehicle?.model].filter(Boolean).join(" ") || "Vehicle details to be confirmed"
  );
  const serviceSummary = escapeHtml(data.serviceSummary ?? "Appointment details confirmed");
  const notes = escapeHtml(data.notes ?? "");
  const appointmentDateTime = escapeHtml(data.appointmentDateTime ?? "Scheduled appointment");
  const publicPaymentUrl = data.publicPaymentUrl?.trim() || "";
  const publicRequestChangeUrl = data.publicRequestChangeUrl?.trim() || "";
  const portalUrl = data.portalUrl?.trim() || "";
  const totalPrice = Number.parseFloat(String(data.totalPrice ?? 0));
  const depositAmount = Number.parseFloat(String(data.depositAmount ?? 0));
  const hasTotal = Number.isFinite(totalPrice) && totalPrice > 0;
  const hasDeposit = Number.isFinite(depositAmount) && depositAmount > 0;
  const backendCollectedAmount = Number.parseFloat(String(data.collectedAmount ?? 0));
  const backendBalanceDue = Number.parseFloat(String(data.balanceDue ?? 0));
  const hasBackendCollectedAmount = data.collectedAmount != null;
  const hasBackendBalanceDue = data.balanceDue != null;
  const hasBackendPaidInFull = data.paidInFull != null;
  const hasBackendDepositSatisfied = data.depositSatisfied != null;
  const hasBackendFinance =
    hasBackendCollectedAmount || hasBackendBalanceDue || hasBackendPaidInFull || hasBackendDepositSatisfied;
  const paidInFull = data.paidInFull === true;
  const depositSatisfied = data.depositSatisfied === true;
  const collectedAmount = Number.isFinite(backendCollectedAmount)
    ? Math.max(0, backendCollectedAmount)
    : hasBackendFinance
      ? 0
      : hasDeposit && depositSatisfied
      ? Math.min(totalPrice, depositAmount)
      : paidInFull
        ? Math.max(0, totalPrice)
        : 0;
  const remainingBalance =
    Number.isFinite(backendBalanceDue) && backendBalanceDue >= 0
      ? backendBalanceDue
      : hasBackendFinance
        ? Math.max(0, totalPrice)
      : hasTotal
        ? Math.max(totalPrice - collectedAmount, 0)
        : 0;
  const serviceItems = (data.serviceSummary ?? "Appointment details confirmed")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const paymentBanner =
    data.stripePaymentState === "success"
      ? `<div class="banner banner-success">Deposit received. Your payment has been recorded.</div>`
      : data.stripePaymentState === "cancelled"
        ? `<div class="banner banner-muted">Stripe checkout was cancelled. You can return and pay whenever you're ready.</div>`
        : "";
  const changeRequestBanner =
    data.changeRequestState === "sent"
      ? `<div class="banner banner-success">Your change request was sent to the shop. They can follow up using the contact details already on file.</div>`
      : data.changeRequestState === "recorded"
        ? `<div class="banner banner-muted">Your change request was recorded. The shop can review it from the appointment activity feed even if email alerts are unavailable right now.</div>`
        : "";
  const depositStatus = hasDeposit
    ? depositSatisfied
      ? "Deposit collected"
      : `${formatCurrency(depositAmount)} due before the appointment`
    : "No deposit required";
  const summaryTitle = hasTotal ? "Appointment total" : "Deposit status";
  const summaryAmount = hasTotal ? formatCurrency(totalPrice) : hasDeposit ? formatCurrency(depositAmount) : formatCurrency(0);
  const summaryDetail = hasTotal
    ? hasDeposit
      ? depositSatisfied || paidInFull
        ? `${formatCurrency(depositAmount)} deposit collected`
        : `${formatCurrency(depositAmount)} deposit due`
      : paidInFull
        ? "Paid in full"
        : "No deposit required"
    : depositStatus;
  const depositPanel = hasDeposit
    ? `<div class="meta-row"><span>Deposit required</span><span>${formatCurrency(depositAmount)}</span></div>
       <div class="meta-row"><span>Status</span><span>${escapeHtml(depositStatus)}</span></div>
       ${hasTotal ? `<div class="meta-row"><span>Remaining balance</span><span>${formatCurrency(remainingBalance)}</span></div>` : ""}`
    : `<div class="meta-row"><span>Deposit</span><span>No deposit required</span></div>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${businessName} Appointment</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; }
      .page { max-width: 960px; margin: 0 auto; padding: 24px 16px 48px; }
      .doc { background: #fff; border: 1px solid rgba(148,163,184,.22); border-radius: 26px; overflow: hidden; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08); }
      .accent { height: 6px; background: linear-gradient(90deg, #f97316, #fb923c 45%, #0f172a); }
      .header { padding: 28px 32px 24px; display: grid; gap: 16px; border-bottom: 1px solid #e2e8f0; }
      .header-top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
      .brand { font-size: 18px; font-weight: 700; color: #0f172a; }
      .eyebrow { display: inline-flex; padding: 6px 10px; border-radius: 999px; background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      .status { display: inline-flex; border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 700; background: #e5e7eb; color: #374151; }
      .status.confirmed { background: #dbeafe; color: #1d4ed8; }
      .status.completed { background: #dcfce7; color: #166534; }
      .status.in_progress { background: #fef3c7; color: #92400e; }
      h1 { margin: 14px 0 10px; font-size: 34px; line-height: 1.04; letter-spacing: -0.03em; }
      .lede { margin: 0; color: #475569; font-size: 15px; line-height: 1.7; max-width: 60ch; }
      .banner { margin: 18px 0 0; padding: 14px 16px; border-radius: 16px; font-size: 14px; line-height: 1.5; }
      .banner-success { background: #ecfdf3; border: 1px solid #a7f3d0; color: #166534; }
      .banner-muted { background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; }
      .body { padding: 24px 32px 32px; display: grid; gap: 18px; }
      .hero,.summary { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(280px,.8fr); gap: 16px; }
      .card { border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; padding: 18px; }
      .soft { background: #f8fafc; }
      .label { color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      .value { margin-top: 6px; font-size: 15px; line-height: 1.6; color: #0f172a; font-weight: 600; }
      .muted { color: #475569; font-weight: 400; }
      .amount { border-radius: 16px; padding: 18px; background: #f8fafc; border: 1px solid #e2e8f0; }
      .amount .big { margin: 8px 0 6px; font-size: 34px; line-height: 1; letter-spacing: -0.04em; font-weight: 800; }
      .pricing-grid { display: grid; gap: 10px; margin-top: 16px; }
      .pricing-row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; font-size: 14px; }
      .pricing-row span:first-child { color: #64748b; }
      .pricing-row span:last-child { font-weight: 700; color: #0f172a; text-align: right; }
      .pricing-row.total { padding-top: 10px; border-top: 1px solid #e2e8f0; }
      .pricing-row.remaining span:last-child { color: #c2410c; }
      .service-list { margin-top: 14px; display: grid; gap: 10px; }
      .service-item { border-radius: 14px; border: 1px solid #e2e8f0; background: #f8fafc; padding: 12px 14px; }
      .service-item-title { font-size: 14px; font-weight: 700; color: #0f172a; }
      .service-item-detail { margin-top: 4px; font-size: 13px; color: #64748b; line-height: 1.5; }
      .cta { display: inline-flex; align-items: center; justify-content: center; margin-top: 16px; padding: 12px 18px; border-radius: 999px; background: #ea580c; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; }
      .sub-cta { display: inline-flex; align-items: center; justify-content: center; margin-top: 12px; padding: 12px 18px; border-radius: 999px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; text-decoration: none; font-weight: 700; font-size: 14px; }
      .cta-note { margin-top: 10px; color: #64748b; font-size: 13px; line-height: 1.5; }
      .field-grid { display: grid; gap: 12px; margin-top: 16px; }
      .field-label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; color: #0f172a; }
      .field-input, .field-textarea { width: 100%; border-radius: 14px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font: inherit; padding: 12px 14px; }
      .field-textarea { min-height: 112px; resize: vertical; }
      .meta-grid { display: grid; gap: 10px; margin-top: 16px; }
      .meta-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
      .meta-row span:first-child { color: #64748b; }
      .meta-row span:last-child { font-weight: 600; text-align: right; }
      .notes { white-space: pre-wrap; }
      .footer { padding: 0 32px 28px; color: #64748b; font-size: 12px; text-align: center; }
      @media (max-width: 640px) {
        .header,.body,.footer { padding-left: 20px; padding-right: 20px; }
        .header-top,.hero,.summary { grid-template-columns: 1fr; display: grid; }
        h1 { font-size: 28px; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="doc">
        <div class="accent"></div>
        <header class="header">
          <div class="header-top">
            <div>
              <div class="brand">${businessName}</div>
              <div class="eyebrow" style="margin-top:12px;">Appointment confirmed</div>
              <h1>${escapeHtml(data.appointmentTitle?.trim() || "Appointment details")}</h1>
              <p class="lede">This page confirms your appointment with ${businessName} and shows the service details, deposit amount, and remaining balance before your visit.</p>
            </div>
            <div class="status ${escapeHtml(status)}">${escapeHtml(label(data.status))}</div>
          </div>
          ${paymentBanner}
          ${changeRequestBanner}
        </header>
        <main class="body">
          <section class="hero">
            <section class="card">
              <div class="label">Service details</div>
              <div class="value">${appointmentDateTime}</div>
              <div class="service-list">
                ${serviceItems
                  .map(
                    (service) => `<div class="service-item">
                  <div class="service-item-title">${escapeHtml(service)}</div>
                  <div class="service-item-detail">Scheduled for this appointment.</div>
                </div>`
                  )
                  .join("")}
              </div>
            </section>
            <section class="amount">
              <div class="label">${summaryTitle}</div>
              <div class="big">${summaryAmount}</div>
              <div class="muted">${escapeHtml(summaryDetail)}</div>
              <div class="pricing-grid">
                ${hasTotal ? `<div class="pricing-row total"><span>Appointment total</span><span>${formatCurrency(totalPrice)}</span></div>` : ""}
                ${hasDeposit ? `<div class="pricing-row"><span>Deposit due today</span><span>${formatCurrency(depositAmount)}</span></div>` : ""}
                ${hasTotal ? `<div class="pricing-row remaining"><span>Remaining balance due</span><span>${formatCurrency(remainingBalance)}</span></div>` : ""}
              </div>
              ${hasDeposit && !(depositSatisfied || paidInFull) && publicPaymentUrl ? `<a class="cta" href="${escapeHtml(publicPaymentUrl)}">Pay ${formatCurrency(depositAmount)} with Stripe</a><div class="cta-note">Secure checkout powered by Stripe.</div>` : hasDeposit && !(depositSatisfied || paidInFull) ? `<div class="cta-note">Deposit payment will appear here as soon as online payments are available.</div>` : ""}
            </section>
          </section>
          <section class="summary">
            <section class="card">
              <div class="label">Client</div>
              <div class="value">${clientName}</div>
              ${data.client.email ? `<div class="value muted">${escapeHtml(data.client.email)}</div>` : ""}
              ${data.client.phone ? `<div class="value muted">${escapeHtml(data.client.phone)}</div>` : ""}
            </section>
            <section class="card">
              <div class="label">Vehicle</div>
              <div class="value">${vehicleLabel}</div>
              <div class="meta-grid">
                ${depositPanel}
              </div>
            </section>
          </section>
          ${notes ? `<section class="card" style="margin-top:16px;"><div class="label">Notes</div><div class="value muted notes">${notes}</div></section>` : ""}
          ${publicRequestChangeUrl ? `<section id="request-change" class="card soft">
            <div class="label">Need to reschedule?</div>
            <div class="value muted">Send a quick change request here and the shop can follow up with the best next time.</div>
            <form method="post" action="${escapeHtml(publicRequestChangeUrl)}" class="field-grid">
              <label class="field-label">
                Preferred timing
                <input class="field-input" type="text" name="preferredTiming" placeholder="Example: next Tuesday afternoon" />
              </label>
              <label class="field-label">
                What needs to change?
                <textarea class="field-textarea" name="message" placeholder="Tell the shop what you need adjusted."></textarea>
              </label>
              <button class="sub-cta" type="submit" style="justify-self:start; margin-top:0;">Request a change</button>
            </form>
          </section>` : ""}
          ${portalUrl ? `<section class="card soft"><div class="label">Customer hub</div><div class="value muted">Open your full customer hub to review active estimates, unpaid invoices, upcoming appointments, and vehicle info in one place.</div><a class="sub-cta" href="${escapeHtml(portalUrl)}">Open customer hub</a></section>` : ""}
        </main>
        <div class="footer">
          Need to reschedule or update anything? Contact ${businessName}${data.business.phone ? ` at ${escapeHtml(data.business.phone)}` : ""}${data.business.email ? ` or ${escapeHtml(data.business.email)}` : ""}.
        </div>
      </div>
    </div>
  </body>
</html>`;
}
