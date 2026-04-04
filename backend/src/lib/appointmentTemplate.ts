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
  depositAmount?: string | number | null;
  depositPaid?: boolean | null;
  publicPaymentUrl?: string | null;
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
  const businessName = escapeHtml(data.business.name ?? "Business");
  const clientName = escapeHtml([data.client.firstName, data.client.lastName].filter(Boolean).join(" ") || "Client");
  const vehicleLabel = escapeHtml(
    [data.vehicle?.year, data.vehicle?.make, data.vehicle?.model].filter(Boolean).join(" ") || "Vehicle details to be confirmed"
  );
  const serviceSummary = escapeHtml(data.serviceSummary ?? "Appointment details confirmed");
  const notes = escapeHtml(data.notes ?? "");
  const appointmentDateTime = escapeHtml(data.appointmentDateTime ?? "Scheduled appointment");
  const publicPaymentUrl = data.publicPaymentUrl?.trim() || "";
  const depositAmount = Number.parseFloat(String(data.depositAmount ?? 0));
  const hasDeposit = Number.isFinite(depositAmount) && depositAmount > 0;
  const depositPaid = data.depositPaid === true;
  const paymentBanner =
    data.stripePaymentState === "success"
      ? `<div class="banner banner-success">Deposit received. Your payment has been recorded.</div>`
      : data.stripePaymentState === "cancelled"
        ? `<div class="banner banner-muted">Stripe checkout was cancelled. You can return and pay whenever you're ready.</div>`
        : "";
  const depositStatus = hasDeposit
    ? depositPaid
      ? "Deposit collected"
      : `${formatCurrency(depositAmount)} due before the appointment`
    : "No deposit required";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${businessName} Appointment</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; background: #f4f6fb; color: #0f172a; }
      .page { max-width: 780px; margin: 0 auto; padding: 24px 16px 48px; }
      .shell { background: #fff; border: 1px solid #e2e8f0; border-radius: 24px; overflow: hidden; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08); }
      .accent { height: 6px; background: linear-gradient(90deg, #f97316, #fb923c 45%, #0f172a); }
      .content { padding: 28px; }
      .eyebrow { display: inline-flex; padding: 6px 10px; border-radius: 999px; background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      h1 { margin: 16px 0 8px; font-size: 32px; line-height: 1.04; letter-spacing: -0.03em; }
      .lede { margin: 0; color: #475569; font-size: 15px; line-height: 1.7; }
      .banner { margin: 18px 0 0; padding: 14px 16px; border-radius: 16px; font-size: 14px; line-height: 1.5; }
      .banner-success { background: #ecfdf3; border: 1px solid #a7f3d0; color: #166534; }
      .banner-muted { background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 24px; }
      .card { border: 1px solid #e2e8f0; border-radius: 18px; background: #fff; padding: 18px; }
      .label { color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      .value { margin-top: 6px; font-size: 15px; line-height: 1.6; color: #0f172a; font-weight: 600; }
      .muted { color: #475569; font-weight: 400; }
      .amount { font-size: 34px; font-weight: 800; letter-spacing: -0.04em; margin-top: 8px; }
      .cta { display: inline-block; margin-top: 16px; padding: 12px 18px; border-radius: 999px; background: #ea580c; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; }
      .cta-note { margin-top: 10px; color: #64748b; font-size: 13px; line-height: 1.5; }
      .notes { white-space: pre-wrap; }
      .footer { margin-top: 18px; color: #64748b; font-size: 14px; line-height: 1.6; }
      @media (max-width: 640px) {
        .content { padding: 22px 18px; }
        h1 { font-size: 28px; }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="shell">
        <div class="accent"></div>
        <div class="content">
          <div class="eyebrow">Appointment confirmed</div>
          <h1>${escapeHtml(data.appointmentTitle?.trim() || "Appointment details")}</h1>
          <p class="lede">This page confirms your appointment with ${businessName} and shows any deposit still due.</p>
          ${paymentBanner}
          <div class="grid">
            <section class="card">
              <div class="label">Appointment</div>
              <div class="value">${appointmentDateTime}</div>
              <div class="value muted">${escapeHtml(label(data.status))}</div>
            </section>
            <section class="card">
              <div class="label">Deposit status</div>
              <div class="amount">${hasDeposit ? formatCurrency(depositAmount) : formatCurrency(0)}</div>
              <div class="value muted">${escapeHtml(depositStatus)}</div>
              ${hasDeposit && !depositPaid && publicPaymentUrl ? `<a class="cta" href="${escapeHtml(publicPaymentUrl)}">Pay ${formatCurrency(depositAmount)} with Stripe</a><div class="cta-note">Secure checkout powered by Stripe.</div>` : ""}
            </section>
            <section class="card">
              <div class="label">Client</div>
              <div class="value">${clientName}</div>
              ${data.client.email ? `<div class="value muted">${escapeHtml(data.client.email)}</div>` : ""}
              ${data.client.phone ? `<div class="value muted">${escapeHtml(data.client.phone)}</div>` : ""}
            </section>
            <section class="card">
              <div class="label">Vehicle</div>
              <div class="value">${vehicleLabel}</div>
              <div class="value muted">${serviceSummary}</div>
            </section>
          </div>
          ${notes ? `<section class="card" style="margin-top:16px;"><div class="label">Notes</div><div class="value muted notes">${notes}</div></section>` : ""}
          <p class="footer">
            Need to reschedule or update anything? Contact ${businessName}${data.business.phone ? ` at ${escapeHtml(data.business.phone)}` : ""}${data.business.email ? ` or ${escapeHtml(data.business.email)}` : ""}.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
