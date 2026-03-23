import { applyParams, save, ActionOptions } from "gadget-server";
import { randomBytes } from "crypto";

const quoteSelect = {
  id: true,
  status: true,
  sentAt: true,
  acceptToken: true,
  subtotal: true,
  taxRate: true,
  taxAmount: true,
  total: true,
  notes: true,
  expiresAt: true,
  client: {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
  },
  lineItems: {
    edges: {
      node: {
        description: true,
        quantity: true,
        unitPrice: true,
        total: true,
      },
    },
  },
} as const;

export const run: ActionRun = async ({ params, record, api }) => {
  // Load the full quote record for reference
  await api.quote.findOne(record.id, { select: quoteSelect });

  // Idempotency and re-send safety guards
  if (record.status === "accepted") {
    throw new Error("Cannot re-send an accepted quote. The client has already accepted this quote.");
  }
  if (record.status === "expired") {
    throw new Error("Cannot send an expired quote. Update the expiry date and try again.");
  }

  if (record.status === "sent" && record.acceptToken) {
    // Re-send case: preserve the existing acceptToken so the accept link stays the same
    record.sentAt = new Date();
  } else {
    // Fresh send (status is 'draft' or null/undefined): generate a new token
    const acceptToken = randomBytes(32).toString("hex");
    record.acceptToken = acceptToken;
    record.status = "sent";
    record.sentAt = new Date();
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, api, emails, currentAppUrl, logger }) => {
  // Load the updated quote record with all required fields
  const quote = await api.quote.findOne(record.id, { select: quoteSelect });

  // If the client has no email, return early
  if (!quote.client?.email) {
    return;
  }

  // Look up the business record for the business name
  let biz: { id: string; name: string } | null = null;
  try {
    biz = await api.business.maybeFindFirst({
      filter: { id: { equals: record.businessId as string } },
      select: { id: true, name: true },
    });
  } catch {
    biz = null;
  }

  const businessName = biz?.name ?? "Your Service Provider";

  // Build accept URL
  const acceptUrl = `${currentAppUrl}/quotes/accept?token=${quote.acceptToken}`;

  // Currency formatter
  const formatCurrency = (value: number | null | undefined) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value ?? 0);

  // Build line items rows
  const lineItemRows =
    quote.lineItems?.edges
      ?.map(
        (edge) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #374151;">${edge.node.description ?? ""}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 14px; color: #374151;">${edge.node.quantity ?? 1}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 14px; color: #374151;">${formatCurrency(edge.node.unitPrice)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 14px; color: #374151;">${formatCurrency(edge.node.total)}</td>
        </tr>`
      )
      .join("") ?? "";

  // Tax row (only if taxRate > 0)
  const taxRow =
    (quote.taxRate ?? 0) > 0
      ? `<tr>
          <td colspan="3" style="padding: 8px 12px; text-align: right; font-size: 14px; color: #6b7280;">Tax (${quote.taxRate}%)</td>
          <td style="padding: 8px 12px; text-align: right; font-size: 14px; color: #6b7280;">${formatCurrency(quote.taxAmount)}</td>
        </tr>`
      : "";

  // Expiry notice (only if expiresAt is set)
  const expiryNotice = quote.expiresAt
    ? `<p style="margin: 16px 0; color: #6b7280; font-size: 14px;">
        This quote expires on ${new Date(quote.expiresAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}.
      </p>`
    : "";

  // Notes section
  const notesSection = quote.notes
    ? `<p style="margin: 16px 0; font-size: 14px; color: #374151;"><strong>Notes:</strong> ${quote.notes}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Quote from ${businessName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Arial, Helvetica, sans-serif; color: #111827;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #f97316; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: bold; letter-spacing: -0.5px;">${businessName}</h1>
              <p style="margin: 8px 0 0; color: #ffedd5; font-size: 15px; font-weight: 500;">Quote for Services</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">

              <p style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #111827;">Hi ${quote.client.firstName},</p>
              <p style="margin: 0 0 28px; font-size: 15px; color: #374151; line-height: 1.6;">
                <strong>${businessName}</strong> has prepared a quote for you. Please review the details below and accept when you're ready to proceed.
              </p>

              <!-- Line Items Table -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 8px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #f3f4f6;">
                    <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Description</th>
                    <th style="padding: 10px 12px; text-align: center; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; width: 60px;">Qty</th>
                    <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; width: 100px;">Unit Price</th>
                    <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; width: 100px;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItemRows}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3" style="padding: 10px 12px; text-align: right; font-size: 14px; color: #6b7280; border-top: 1px solid #e5e7eb;">Subtotal</td>
                    <td style="padding: 10px 12px; text-align: right; font-size: 14px; color: #374151; border-top: 1px solid #e5e7eb;">${formatCurrency(quote.subtotal)}</td>
                  </tr>
                  ${taxRow}
                  <tr style="background-color: #f9fafb;">
                    <td colspan="3" style="padding: 12px; text-align: right; font-weight: bold; font-size: 16px; color: #111827; border-top: 2px solid #e5e7eb;">Total</td>
                    <td style="padding: 12px; text-align: right; font-weight: bold; font-size: 16px; color: #111827; border-top: 2px solid #e5e7eb;">${formatCurrency(quote.total)}</td>
                  </tr>
                </tfoot>
              </table>

              ${notesSection}

              <!-- Accept Button -->
              <div style="text-align: center; margin: 36px 0 28px;">
                <a href="${acceptUrl}"
                   style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-size: 16px; font-weight: bold; letter-spacing: 0.025em;">
                  Accept Quote
                </a>
              </div>

              ${expiryNotice}

              <!-- Footer -->
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 24px;">
              <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center; line-height: 1.6;">
                Thank you for your business! If you have any questions about this quote, please don't hesitate to reach out.
              </p>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const result = await api.sendNotification({
    type: "quote_sent",
    recipientEmail: quote.client.email,
    subject: `Your Quote from ${businessName}`,
    html,
    businessId: record.businessId as string,
    clientId: quote.client.id,
    relatedModel: "quote",
    relatedId: record.id,
  });

  logger.info({ quoteId: record.id, notificationLogId: result.notificationLogId }, "Quote email queued via sendNotification");
};

export const options: ActionOptions = {
  actionType: "custom",
  triggers: { api: true },
};
