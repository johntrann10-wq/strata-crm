import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const current = await api.invoice.findOne(record.id, { select: { id: true, status: true } });

  if (current.status === "paid") {
    throw new Error("Cannot send a paid invoice.");
  }
  if (current.status === "void") {
    throw new Error("Cannot send a voided invoice.");
  }
  if (current.status === "sent") {
    logger.info({ invoiceId: record.id }, "Invoice already marked as sent, proceeding to re-send email only");
  }

  record.status = "sent";
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api, emails }) => {
  const fullInvoice = await api.invoice.findOne(record.id, {
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      subtotal: true,
      taxAmount: true,
      taxRate: true,
      discountAmount: true,
      total: true,
      lineItems: {
        edges: {
          node: {
            id: true,
            description: true,
            quantity: true,
            unitPrice: true,
            total: true,
          },
        },
      },
      client: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
  });

  if (fullInvoice.status === "void") {
    logger.warn({ invoiceId: record.id }, "Invoice is voided, skipping send");
    return;
  }

  const businessRecord = await api.business.maybeFindFirst({
    filter: { id: { equals: record.businessId as string } },
    select: { id: true, name: true, phone: true, email: true },
  });

  const clientEmail = fullInvoice.client?.email;
  if (!clientEmail) {
    logger.info({ invoiceId: record.id }, "Invoice client has no email, skipping send");
    return;
  }

  const clientName = `${fullInvoice.client?.firstName ?? ""} ${fullInvoice.client?.lastName ?? ""}`.trim();
  const businessName = businessRecord?.name ?? "Your Service Provider";
  const businessEmail = businessRecord?.email ?? "";
  const businessPhone = businessRecord?.phone ?? "";

  const lineItems = fullInvoice.lineItems?.edges?.map((edge) => edge.node) ?? [];

  const formatCurrency = (amount: number | null | undefined): string => {
    if (amount == null) return "$0.00";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  const lineItemsRows = lineItems
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${item.description ?? ""}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:center;color:#111827;">${item.quantity ?? 0}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;color:#111827;">${formatCurrency(item.unitPrice)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;color:#111827;">${formatCurrency(item.total)}</td>
        </tr>`
    )
    .join("");

  const subtotalRow = `
    <tr>
      <td colspan="3" style="padding:8px 14px;text-align:right;font-size:14px;font-weight:500;color:#374151;">Subtotal</td>
      <td style="padding:8px 14px;text-align:right;font-size:14px;color:#111827;">${formatCurrency(fullInvoice.subtotal)}</td>
    </tr>`;

  const taxRow =
    fullInvoice.taxAmount != null && fullInvoice.taxAmount > 0
      ? `<tr>
          <td colspan="3" style="padding:8px 14px;text-align:right;font-size:14px;font-weight:500;color:#374151;">Tax${fullInvoice.taxRate != null ? ` (${fullInvoice.taxRate}%)` : ""}</td>
          <td style="padding:8px 14px;text-align:right;font-size:14px;color:#111827;">${formatCurrency(fullInvoice.taxAmount)}</td>
        </tr>`
      : "";

  const discountRow =
    fullInvoice.discountAmount != null && fullInvoice.discountAmount > 0
      ? `<tr>
          <td colspan="3" style="padding:8px 14px;text-align:right;font-size:14px;font-weight:500;color:#374151;">Discount</td>
          <td style="padding:8px 14px;text-align:right;font-size:14px;color:#16a34a;">-${formatCurrency(fullInvoice.discountAmount)}</td>
        </tr>`
      : "";

  const totalRow = `
    <tr>
      <td colspan="3" style="padding:12px 14px;text-align:right;font-size:16px;font-weight:700;color:#111827;border-top:2px solid #111827;">Total</td>
      <td style="padding:12px 14px;text-align:right;font-size:16px;font-weight:700;color:#111827;border-top:2px solid #111827;">${formatCurrency(fullInvoice.total)}</td>
    </tr>`;

  const invoiceLabel = fullInvoice.invoiceNumber ? `#${fullInvoice.invoiceNumber}` : `#${record.id}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${invoiceLabel}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.12);">
          <!-- Header -->
          <tr>
            <td style="background-color:#111827;padding:32px 40px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${businessName}</h1>
              ${businessPhone ? `<p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">${businessPhone}</p>` : ""}
            </td>
          </tr>
          <!-- Invoice Info -->
          <tr>
            <td style="padding:32px 40px 16px;">
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Invoice ${invoiceLabel}</h2>
              <p style="margin:0;font-size:14px;color:#6b7280;">Dear ${clientName},</p>
              <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Please find your invoice details below.</p>
            </td>
          </tr>
          <!-- Line Items Table -->
          <tr>
            <td style="padding:0 40px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background-color:#f9fafb;">
                    <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Description</th>
                    <th style="padding:10px 14px;text-align:center;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Qty</th>
                    <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Unit Price</th>
                    <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItemsRows}
                </tbody>
                <tfoot>
                  ${subtotalRow}
                  ${taxRow}
                  ${discountRow}
                  ${totalRow}
                </tfoot>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:14px;color:#6b7280;text-align:center;">Thank you for your business.</p>
              ${businessEmail ? `<p style="margin:8px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Questions? Contact us at <a href="mailto:${businessEmail}" style="color:#111827;">${businessEmail}</a></p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const result = await api.sendNotification({
      type: "invoice_sent",
      recipientEmail: clientEmail,
      subject: `Invoice ${invoiceLabel} from ${businessName}`,
      html,
      businessId: record.businessId as string,
      clientId: fullInvoice.client?.id,
      relatedModel: "invoice",
      relatedId: record.id,
    });
    logger.info({ invoiceId: record.id, notificationLogId: result.notificationLogId }, "Invoice email queued via sendNotification");
  } catch (emailError: any) {
    logger.warn({ invoiceId: record.id, error: emailError?.message }, "Failed to queue invoice email via sendNotification; invoice is already marked sent");
  }
};

export const options: ActionOptions = {
  actionType: "custom",
};