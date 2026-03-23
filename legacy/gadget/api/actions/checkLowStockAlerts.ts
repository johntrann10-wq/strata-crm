import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ logger, api, emails }) => {
  // Fetch all inventory items where quantity and reorderThreshold are both set, with pagination
  const allItems: Array<{
    id: string;
    name: string;
    quantity: number | null;
    reorderThreshold: number | null;
    businessId: string | null;
    business: { id: string; email: string | null; ownerId?: string | null } | null;
  }> = [];

  let hasNextPage = true;
  let cursor: string | undefined = undefined;

  while (hasNextPage) {
    const result = await api.inventoryItem.findMany({
      filter: {
        AND: [
          { quantity: { isSet: true } },
          { reorderThreshold: { isSet: true } },
        ],
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        reorderThreshold: true,
        businessId: true,
        business: { id: true, email: true, ownerId: true } as any,
      },
      first: 250,
      after: cursor,
    }) as any;

    for (const item of result) {
      allItems.push(item);
    }
    hasNextPage = result.hasNextPage;
    cursor = result.endCursor;
  }

  // Filter in JS: items where quantity <= reorderThreshold
  const lowStockItems = allItems.filter(
    (item) =>
      item.quantity !== null &&
      item.reorderThreshold !== null &&
      item.quantity <= item.reorderThreshold
  );

  // Group low-stock items by businessId
  const groupedByBusiness = new Map<
    string,
    typeof lowStockItems
  >();

  for (const item of lowStockItems) {
    const bizId = item.businessId ?? "unknown";
    if (!groupedByBusiness.has(bizId)) {
      groupedByBusiness.set(bizId, []);
    }
    groupedByBusiness.get(bizId)!.push(item);
  }

  // For each business group, log a structured warning and send email notifications
  for (const [businessId, items] of groupedByBusiness) {
    // Look up the owner user to get their email
    const ownerUser = await api.user.maybeFindOne(
      items[0]?.business?.ownerId ?? businessId,
      { select: { id: true, email: true } }
    );
    const ownerEmail = ownerUser?.email ?? null;

    // Keep existing structured log warnings per item
    for (const item of items) {
      logger.warn(
        {
          businessId,
          ownerEmail,
          itemName: item.name,
          currentQuantity: item.quantity,
          reorderThreshold: item.reorderThreshold,
        },
        "Low stock alert: item is at or below reorder threshold"
      );
    }

    // Skip email if no owner email found
    if (!ownerEmail) continue;

    const tableRows = items
      .map(
        (item) => `
          <tr>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px;">${item.name}</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #dc2626; font-weight: 600; font-size: 14px;">${item.quantity}</td>
            <td style="padding: 10px 16px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151; font-size: 14px;">${item.reorderThreshold}</td>
          </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #111827; padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">⚠️ Low Stock Alert</h1>
              <p style="margin: 6px 0 0; color: #9ca3af; font-size: 13px;">Business ID: ${businessId}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.5;">
                The following inventory items are at or below their reorder threshold and may need restocking:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #111827;">
                    <th style="padding: 11px 16px; text-align: left; color: #ffffff; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">Item Name</th>
                    <th style="padding: 11px 16px; text-align: center; color: #ffffff; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">Current Qty</th>
                    <th style="padding: 11px 16px; text-align: center; color: #ffffff; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">Reorder Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 16px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">
                This is an automated low stock alert. Please log in to review and restock your inventory.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      await emails.sendMail({
        to: ownerEmail,
        subject: `Low Stock Alert: ${items.length} item${items.length !== 1 ? "s" : ""} need${items.length === 1 ? "s" : ""} restocking`,
        html,
      });
      logger.info(
        { businessId, ownerEmail, itemCount: items.length },
        "Low stock alert email sent successfully"
      );
    } catch (error: any) {
      logger.warn(
        { businessId, error: error.message },
        "Failed to send low stock alert email"
      );
    }
  }
};

export const options: ActionOptions = {
  triggers: {
    scheduler: [{ cron: "0 9 * * *" }],
  },
};
