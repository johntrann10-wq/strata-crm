import { save, ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ record, api, logger }) => {
  // 1. Load the full quote
  const quote = await api.quote.findOne(record.id, {
    select: {
      id: true,
      status: true,
      total: true,
      subtotal: true,
      taxRate: true,
      taxAmount: true,
      notes: true,
      expiresAt: true,
      acceptToken: true,
      followUpSentAt: true,
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
    },
  });

  // Idempotency guard: prevent duplicate follow-ups
  if (quote.followUpSentAt !== null && quote.followUpSentAt !== undefined) {
    logger.info("Follow-up already sent for this quote, skipping duplicate");
    return;
  }

  // 2. Load the business owner (wrap in try/catch)
  try {
    await api.user.findOne(record.businessId as string, {
      select: { firstName: true, lastName: true },
    });
  } catch (_e) {
    // owner not found, continue
  }

  // 3. Check status
  if (quote.status === "accepted" || quote.status === "declined") {
    throw new Error("Cannot send follow-up for a quote that is already accepted or declined");
  }

  // 4. Set followUpSentAt
  record.followUpSentAt = new Date();

  // 5. Save
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, api, logger, currentAppUrl }) => {
  // 1. Load updated quote with same select
  const quote = await api.quote.findOne(record.id, {
    select: {
      id: true,
      status: true,
      total: true,
      subtotal: true,
      taxRate: true,
      taxAmount: true,
      notes: true,
      expiresAt: true,
      acceptToken: true,
      followUpSentAt: true,
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
    },
  });

  // 2. If client has no email, return early
  if (!quote.client?.email) {
    return;
  }

  // 3. Load owner and build businessName
  let owner: { firstName?: string | null; lastName?: string | null } | undefined;
  try {
    owner = await api.user.findOne(record.businessId as string, {
      select: { firstName: true, lastName: true },
    });
  } catch (_e) {
    // owner not found
  }

  const ownerName = [owner?.firstName, owner?.lastName].filter(Boolean).join(" ").trim();
  const businessName = ownerName || "Your Service Provider";

  // 4. Build accept URL
  const acceptUrl = `${currentAppUrl}/quotes/accept?token=${quote.acceptToken}`;

  // 5. Format currency
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  // Build line items rows
  const lineItemsHtml = (quote.lineItems?.edges ?? [])
    .map(
      ({ node }) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; color: #333;">${node.description ?? ""}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; text-align: center; color: #333;">${node.quantity ?? 1}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; text-align: right; color: #333;">${formatter.format(node.unitPrice ?? 0)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; text-align: right; color: #333;">${formatter.format(node.total ?? 0)}</td>
        </tr>`
    )
    .join("");

  const taxRow =
    (quote.taxRate ?? 0) > 0
      ? `<tr>
          <td colspan="3" style="padding: 8px 12px; text-align: right; color: #666;">Tax (${quote.taxRate}%)</td>
          <td style="padding: 8px 12px; text-align: right; color: #333;">${formatter.format(quote.taxAmount ?? 0)}</td>
        </tr>`
      : "";

  const expiryNotice = quote.expiresAt
    ? `<p style="color: #e67e22; font-size: 14px; margin-top: 16px; margin-bottom: 0;">
        This quote expires on ${new Date(quote.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
      </p>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background-color: #f97316; padding: 32px 40px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">${businessName}</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 6px 0 0; font-size: 15px;">Quote Follow-Up</p>
    </div>
    <div style="padding: 32px 40px;">
      <h2 style="color: #1a1a1a; margin: 0 0 12px; font-size: 20px;">Hi ${quote.client.firstName}, just following up!</h2>
      <p style="color: #4a4a4a; line-height: 1.7; margin: 0 0 28px; font-size: 15px;">
        We wanted to check in on the quote we sent you. It is still available and we would love to get started on your vehicle.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 14px;">
        <thead>
          <tr style="background-color: #f8f8f8;">
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #888; border-bottom: 2px solid #e8e8e8; text-transform: uppercase; letter-spacing: 0.5px;">Description</th>
            <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; color: #888; border-bottom: 2px solid #e8e8e8; text-transform: uppercase; letter-spacing: 0.5px;">Qty</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; color: #888; border-bottom: 2px solid #e8e8e8; text-transform: uppercase; letter-spacing: 0.5px;">Unit Price</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; color: #888; border-bottom: 2px solid #e8e8e8; text-transform: uppercase; letter-spacing: 0.5px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding: 8px 12px; text-align: right; color: #666; font-size: 14px;">Subtotal</td>
            <td style="padding: 8px 12px; text-align: right; color: #333; font-size: 14px;">${formatter.format(quote.subtotal ?? 0)}</td>
          </tr>
          ${taxRow}
          <tr style="background-color: #f8f8f8;">
            <td colspan="3" style="padding: 12px 12px; text-align: right; font-weight: 700; color: #1a1a1a; font-size: 15px; border-top: 2px solid #e8e8e8;">Total</td>
            <td style="padding: 12px 12px; text-align: right; font-weight: 700; color: #1a1a1a; font-size: 15px; border-top: 2px solid #e8e8e8;">${formatter.format(quote.total ?? 0)}</td>
          </tr>
        </tfoot>
      </table>
      <div style="text-align: center; margin: 36px 0 24px;">
        <a href="${acceptUrl}" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 6px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">Accept Quote</a>
      </div>
      ${expiryNotice}
    </div>
    <div style="background-color: #f8f8f8; padding: 20px 40px; border-top: 1px solid #e8e8e8;">
      <p style="color: #888; font-size: 13px; margin: 0; text-align: center; line-height: 1.5;">
        Reply to this email or give us a call if you have any questions!
      </p>
    </div>
  </div>
</body>
</html>`;

  // 6. Send email via sendNotification to enable notification log tracking and retries
  try {
    const result = await api.sendNotification({
      type: "quote_followup",
      recipientEmail: quote.client.email,
      subject: `Following up on your quote from ${businessName}`,
      html: html,
      businessId: record.businessId as string,
      clientId: quote.client.id,
      relatedModel: "quote",
      relatedId: record.id,
    });
    logger.info({ quoteId: record.id, notificationLogId: (result as any)?.notificationLogId }, "Quote follow-up email queued via sendNotification");
  } catch (err) {
    logger.warn({ quoteId: record.id, err }, "Failed to queue quote follow-up notification; followUpSentAt was already saved");
  }
};

export const options: ActionOptions = {
  actionType: "custom",
  triggers: { api: true },
};
