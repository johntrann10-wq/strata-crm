import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const fresh = await api.maintenanceReminder.findOne(record.id, { select: { id: true, sent: true } });
  if (fresh.sent === true) {
    logger.info({ reminderId: record.id }, "Maintenance reminder already sent, skipping duplicate send");
    return;
  }

  record.sent = true;
  record.sentAt = new Date();
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api }) => {
  const client = await api.client.maybeFindOne(record.clientId as string, {
    select: { id: true, firstName: true, email: true },
  });

  if (!client) {
    logger.warn({ reminderId: record.id, clientId: record.clientId }, "Maintenance reminder send: client not found, skipping email");
    return;
  }

  const business = await api.business.maybeFindOne(record.businessId as string, {
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!business) {
    logger.warn({ reminderId: record.id, businessId: record.businessId }, "Maintenance reminder send: business not found, skipping email");
    return;
  }

  if (client.email) {
    const reminderMessage = (record.message as string | null) || (record.title as string);

    const result = await api.sendNotification({
      type: "maintenance_reminder",
      recipientEmail: client.email,
      subject: record.title as string,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${record.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#111827;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${business.name}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#374151;">Hi ${client.firstName},</p>
              <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">${reminderMessage}</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="mailto:${business.email || ""}" style="display:inline-block;background-color:#111827;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:6px;">Schedule Your Service</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:14px;color:#6b7280;line-height:1.6;">We're here to help keep your vehicle in top condition. Don't hesitate to reach out — we'd love to see you again!</p>
              ${business.phone ? `<p style="margin:0;font-size:14px;color:#6b7280;">Call us: <a href="tel:${business.phone}" style="color:#111827;text-decoration:none;font-weight:600;">${business.phone}</a></p>` : ""}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;color:#9ca3af;">&copy; ${new Date().getFullYear()} ${business.name}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      businessId: record.businessId as string,
      clientId: record.clientId as string,
      relatedModel: "maintenanceReminder",
      relatedId: record.id,
    });

    logger.info(
      { clientId: record.clientId, clientEmail: client.email, reminderId: record.id, reminderTitle: record.title, notificationLogId: result.notificationLogId },
      "Maintenance reminder queued via sendNotification"
    );
  } else {
    logger.info(
      { clientId: record.clientId, reminderId: record.id },
      "Maintenance reminder marked sent but client has no email address — skipping email delivery"
    );
  }
};

export const options: ActionOptions = {
  actionType: "custom",
};
