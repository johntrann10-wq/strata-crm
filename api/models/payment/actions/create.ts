import { applyParams, save, ActionOptions, assert } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";
import { esc } from "../../lib/escapeHtml";
import { logError } from "../../lib/logError";

export const run: ActionRun = async ({ params, record, logger, api, session }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record, { userBelongsToField: 'business' });

  const userId = session?.get('user') as string | undefined;

  if (!record.businessId && userId) {
    const business = await api.business.findFirst({
      filter: { owner: { id: { equals: userId } } },
      select: { id: true },
    });
    if (business) {
      record.businessId = business.id;
    }
  }

  if (record.amount == null || record.amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  if (!isFinite(record.amount as number)) {
    throw new Error('Payment amount must be a valid finite number.');
  }

  const invoiceId = assert(record.invoiceId, "payment must have an associated invoice");

  const invoice = await api.invoice.findOne(invoiceId, {
    select: { id: true, status: true, total: true },
  });

  if (invoice.status === "void") {
    throw new Error("Cannot record a payment on a voided invoice.");
  }

  if (invoice.status === "paid") {
    throw new Error("This invoice has already been paid in full.");
  }

  // Re-fetch payment total as late as possible to minimize race window
  const existingPayments = await api.payment.findMany({
    filter: { invoice: { id: { equals: invoiceId } } },
    select: { id: true, amount: true },
  });
  const existingTotal = existingPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const invoiceTotal = invoice.total ?? 0;

  if (existingTotal + record.amount > invoiceTotal) {
    const remaining = invoiceTotal - existingTotal;
    const remainingFormatted = remaining <= 0 ? '0.00' : remaining.toFixed(2);
    throw new Error(
      `Payment of $${(record.amount as number).toFixed(2)} would exceed the invoice total. Remaining balance is $${remainingFormatted}.`
    );
  }

  // Final overpayment check with tolerance for floating point
  const EPSILON = 0.001;
  if (existingTotal + record.amount > invoiceTotal + EPSILON) {
    throw new Error('Payment amount exceeds invoice total.');
  }

  if (params.idempotencyKey) {
    record.idempotencyKey = params.idempotencyKey as string;
    const existingPayment = await api.payment.maybeFindFirst({
      filter: {
        AND: [
          { invoiceId: { equals: invoiceId } },
          { idempotencyKey: { equals: params.idempotencyKey as string } },
        ],
      } as any,
      select: { id: true },
    });
    if (existingPayment) {
      throw new Error(
        'A payment with this idempotency key has already been recorded for this invoice. This appears to be a duplicate submission.'
      );
    }
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api, emails }) => {
  const invoiceId = assert(record.invoiceId, "payment must have an associated invoice");

  const invoice = await api.invoice.findOne(invoiceId, {
    select: { id: true, total: true, status: true },
  });

  const payments = await api.payment.findMany({
    filter: { invoice: { id: { equals: invoiceId } } },
    select: { id: true, amount: true },
  });

  const totalPaid = payments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
  const invoiceTotal = invoice.total ?? 0;

  let newStatus = invoice.status;

  if (totalPaid >= invoiceTotal) {
    await api.invoice.update(invoice.id, {
      status: "paid",
      paidAt: new Date(),
    });
    newStatus = "paid";

    // Overpayment safety net: re-fetch ALL payments post-commit to audit for race-window overpayments
    const allPaymentsAudit = await api.payment.findMany({
      filter: { invoice: { id: { equals: invoiceId } } },
      select: { id: true, amount: true },
      first: 250,
    });
    const auditTotal = allPaymentsAudit.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    if (auditTotal > invoiceTotal + 0.01) {
      logger.error(
        {
          invoiceId,
          invoiceTotal,
          auditTotalPaid: auditTotal,
          overpaymentAmount: auditTotal - invoiceTotal,
          paymentIds: allPaymentsAudit.map((p) => p.id),
          newPaymentId: record.id,
          businessId: record.businessId,
        },
        "CRITICAL: Overpayment detected post-commit. Invoice total exceeded after payment recorded. Manual investigation required."
      );
      await logError({
        api,
        logger,
        businessId: record.businessId as string,
        severity: "critical",
        category: "payment",
        message: "Overpayment detected post-commit: invoice total exceeded after payment recorded",
        context: {
          invoiceId,
          invoiceTotal,
          auditTotalPaid: auditTotal,
          overpaymentAmount: auditTotal - invoiceTotal,
          newPaymentId: record.id,
        },
      });
    }
  } else if (totalPaid > 0 && totalPaid < invoiceTotal) {
    await api.invoice.update(invoice.id, {
      status: "partial",
    });
    newStatus = "partial";
  }

  logger.info(
    { paymentId: record.id, invoiceId, totalPaid, invoiceTotal, newStatus },
    "Payment created and invoice status updated"
  );

  try {
    await api.activityLog.create({
      type: "payment-received",
      description: `Payment of ${record.amount} received`,
      business: { _link: record.businessId },
      invoice: { _link: record.invoiceId },
      metadata: {
        paymentId: record.id,
        amount: record.amount,
        method: record.method,
      },
    });
  } catch (logErr: any) {
    logger.warn({ paymentId: record.id, invoiceId, error: logErr?.message }, 'Failed to write activity log for payment; continuing to send receipt email');
  }

  try {
    const fullInvoice = await api.invoice.findOne(invoiceId, {
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        status: true,
        client: { id: true, firstName: true, lastName: true, email: true },
      },
    });

    const biz = await api.business.maybeFindFirst({
      filter: { id: { equals: record.businessId as string } },
      select: { id: true, name: true, phone: true, email: true },
    });

    const clientEmail = fullInvoice.client?.email;
    if (!clientEmail) {
      logger.warn({ invoiceId, paymentId: record.id }, "No client email found; skipping payment receipt email");
      return;
    }

    const remaining = Math.max(0, (fullInvoice.total ?? 0) - totalPaid);
    const fmt = (n: number) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

    const isPaidInFull = remaining <= 0;
    const clientName = [fullInvoice.client?.firstName, fullInvoice.client?.lastName].filter(Boolean).join(" ") || "Valued Customer";
    const businessName = biz?.name ?? "Your Service Provider";
    const invoiceLabel = fullInvoice.invoiceNumber ?? `#${fullInvoice.id}`;

    const subject = isPaidInFull
      ? `Paid in Full — Invoice ${invoiceLabel} — ${businessName}`
      : `Payment Receipt — ${businessName}`;

    const methodRow = record.method
      ? `<tr>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;">Payment Method</td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;text-transform:capitalize;">${esc(record.method ?? "")}</td>
        </tr>`
      : "";

    const remainingRow = !isPaidInFull
      ? `<tr>
          <td style="padding:10px 16px;color:#b45309;font-size:14px;font-weight:600;">Remaining Balance</td>
          <td style="padding:10px 16px;font-size:14px;font-weight:600;text-align:right;color:#b45309;">${fmt(remaining)}</td>
        </tr>`
      : `<tr>
          <td colspan="2" style="padding:10px 16px;text-align:center;">
            <span style="display:inline-block;background:#dcfce7;color:#16a34a;border-radius:9999px;padding:4px 16px;font-size:14px;font-weight:700;">✓ Paid in full</span>
          </td>
        </tr>`;

    const closingNote = isPaidInFull
      ? `<p style="margin:0 0 12px;color:#374151;font-size:15px;">Thank you for your payment! We appreciate your business.</p>`
      : `<p style="margin:0 0 12px;color:#374151;font-size:15px;">Your remaining balance of <strong>${fmt(remaining)}</strong> is due. Please contact us if you have any questions.</p>`;

    const contactLines: string[] = [];
    if (biz?.phone) contactLines.push(`Phone: ${esc(biz.phone)}`);
    if (biz?.email) contactLines.push(`Email: ${esc(biz.email)}`);
    const contactBlock =
      contactLines.length > 0
        ? `<p style="margin:0 0 4px;color:#374151;font-size:14px;">${contactLines.join(" &nbsp;|&nbsp; ")}</p>`
        : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:#111827;padding:32px 40px;text-align:center;">
            <h1 style="margin:0 0 6px;color:#ffffff;font-size:22px;font-weight:700;">${esc(businessName)}</h1>
            <p style="margin:0;color:#9ca3af;font-size:14px;letter-spacing:0.05em;text-transform:uppercase;">Payment Receipt</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hi ${esc(clientName)},</p>
            <p style="margin:0 0 24px;color:#374151;font-size:15px;">We've received your payment. Here are the details:</p>

            <!-- Summary Box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px;">
              <tr>
                <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;">Invoice</td>
                <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;font-weight:600;">${esc(invoiceLabel)}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;">Amount Paid (This Payment)</td>
                <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;font-weight:600;">${fmt(record.amount ?? 0)}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;">Invoice Total</td>
                <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${fmt(fullInvoice.total ?? 0)}</td>
              </tr>
              ${methodRow}
              ${remainingRow}
            </table>

            ${closingNote}
            ${contactBlock}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">This is an automated receipt. Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await api.sendNotification({
      type: "payment_receipt",
      recipientEmail: clientEmail,
      subject,
      html,
      businessId: record.businessId as string,
      clientId: fullInvoice.client?.id,
      relatedModel: "invoice",
      relatedId: invoiceId,
    });

  } catch (emailError) {
    logger.warn({ error: emailError, invoiceId, paymentId: record.id }, "Failed to send payment receipt email");
  }
};

export const options: ActionOptions = {
  actionType: "create",
};

export const params = {
  idempotencyKey: { type: "string" },
};