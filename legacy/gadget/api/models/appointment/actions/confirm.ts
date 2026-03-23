import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";
import { format } from "date-fns";
import { esc } from '../../../lib/escapeHtml';

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });
  if (record.status === 'completed') {
    throw new Error('Cannot confirm an appointment that has already been completed.');
  }
  if (record.status === 'cancelled') {
    throw new Error('Cannot confirm a cancelled appointment.');
  }
  if (record.status === 'confirmed') {
    // Idempotent: already confirmed, skip silently
    logger.info({ appointmentId: record.id }, 'Appointment is already confirmed, skipping');
    return;
  }

  // Fresh re-read for optimistic locking to prevent double-confirm and confirm/cancel race conditions
  const fresh = await api.appointment.findOne(record.id, {
    select: { id: true, status: true, updatedAt: true },
  });

  if (fresh.status === 'confirmed') {
    logger.info({ appointmentId: record.id }, 'Appointment is already confirmed (fresh check), skipping');
    return;
  }
  if (fresh.status === 'completed') {
    throw new Error('Cannot confirm an appointment that has already been completed.');
  }
  if (fresh.status === 'cancelled') {
    throw new Error('Cannot confirm a cancelled appointment.');
  }
  if (fresh.updatedAt.getTime() !== record.updatedAt.getTime()) {
    throw new Error('This appointment was modified by another user. Please refresh and try again.');
  }

  record.status = "confirmed";
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api }) => {
  const client = await api.client.maybeFindOne(record.clientId as string, {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  });

  const business = await api.business.maybeFindFirst({
    filter: { id: { equals: record.businessId as string } },
    select: { id: true, name: true, phone: true, email: true },
  });
  const businessName = business?.name ?? 'Your Service Provider';

  if (!client) {
    logger.warn(
      { appointmentId: record.id, clientId: record.clientId },
      "Client not found when sending appointment confirmation email; skipping"
    );
    return;
  }

  try {
    if (client.email) {
      const formattedTime = record.startTime
        ? format(record.startTime as unknown as Date, "MMMM d, yyyy 'at' h:mm a")
        : "your scheduled time";

      const contactLines = [
        business?.phone ? `<p style="margin:0 0 4px;font-size:14px;color:#374151;">📞 ${esc(business.phone)}</p>` : '',
        business?.email ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;">✉️ ${esc(business.email)}</p>` : '',
      ].filter(Boolean).join('');

      const contactSection = contactLines
        ? `<p style="margin:0 0 8px;font-size:14px;color:#374151;">If you need to make any changes, please contact us:</p>${contactLines}`
        : '';

      await api.sendNotification({
        type: "appointment_confirmation",
        recipientEmail: client.email,
        subject: `Appointment Confirmed — ${businessName}`,
        html: `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
            <tr>
              <td style="background:#111827;padding:24px 32px;">
                <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${esc(businessName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${esc(client.firstName ?? '')},</p>
                <p style="margin:0 0 24px;font-size:15px;color:#374151;">Your appointment has been confirmed. We look forward to seeing you!</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Appointment Date &amp; Time</p>
                      <p style="margin:0;font-size:16px;color:#111827;font-weight:bold;">${formattedTime}</p>
                    </td>
                  </tr>
                </table>
                ${contactSection}
                <p style="margin:0;font-size:14px;color:#374151;">Thank you for choosing us!</p>
              </td>
            </tr>
            <tr>
              <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">© ${new Date().getFullYear()} ${esc(businessName)}. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
        businessId: record.businessId as string,
        clientId: client.id,
        relatedModel: "appointment",
        relatedId: record.id,
      });

      logger.info(
        { clientId: client.id, appointmentId: record.id, clientEmail: client.email },
        "Appointment confirmation email sent to client"
      );
    }
  } catch (error) {
    logger.warn({ appointmentId: record.id, error }, "Failed to send appointment confirmation email");
  }

  try {
    await api.activityLog.create({
      type: "appointment-confirmed",
      description: "Appointment confirmed",
      business: { _link: record.businessId } as any,
      client: { _link: record.clientId } as any,
      appointment: { _link: record.id },
      metadata: { performedBy: null } as any,
    });
  } catch (error: any) {
    logger.warn(
      { appointmentId: record.id, error: error.message },
      "Failed to create activity log entry for appointment confirmation"
    );
  }
};

export const options: ActionOptions = {
  actionType: "custom",
};
