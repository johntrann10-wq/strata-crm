import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";
import { esc } from "../../../lib/escapeHtml";

export const run: ActionRun = async ({ params, record, logger, api }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });
  if (record.status === 'cancelled') {
    logger.info({ appointmentId: record.id }, 'Appointment is already cancelled, skipping');
    return; // idempotent - already cancelled
  }
  if (record.status === 'completed') {
    throw new Error('Cannot cancel a completed appointment.');
  }

  const fresh = await api.appointment.findOne(record.id, {
    select: { id: true, status: true, updatedAt: true },
  });

  if (fresh.status === 'cancelled') {
    logger.info({ appointmentId: record.id }, 'Appointment is already cancelled (fresh read), skipping');
    return;
  }
  if (fresh.status === 'completed') {
    throw new Error('Cannot cancel a completed appointment.');
  }
  if (fresh.updatedAt?.getTime() !== record.updatedAt?.getTime()) {
    throw new Error('This appointment was modified by another user. Please refresh and try again.');
  }

  record.status = "cancelled";
  (record as any).cancelledAt = new Date();
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api }) => {
  if (!record.clientId) {
    logger.info({ appointmentId: record.id }, 'No clientId on cancelled appointment, skipping notification');
    return;
  }

  const client = await api.client.maybeFindOne(record.clientId, {
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  try {
    if (client && client.email) {
      const business = await api.business.maybeFindFirst({
        filter: { id: { equals: record.businessId as string } },
        select: { id: true, name: true },
      });

      const businessName = business?.name ?? "Your service provider";
      const reason = params.reason as string | undefined;

      await api.sendNotification({
        type: "appointment_cancellation",
        recipientEmail: client.email,
        subject: `Your appointment has been cancelled - ${businessName}`,
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Appointment Cancelled</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:28px 32px;text-align:center;">
              <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">${esc(businessName)}</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px 32px;color:#374151;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px 0;">Hi ${esc(client.firstName ?? "")} ${esc(client.lastName ?? "")},</p>
              <p style="margin:0 0 16px 0;">We're writing to let you know that your appointment with <strong>${esc(businessName)}</strong> has been cancelled.</p>
              ${reason ? `<p style="margin:0 0 16px 0;"><strong>Reason for cancellation:</strong> ${esc(reason)}</p>` : ""}
              <p style="margin:0 0 16px 0;">We apologize for any inconvenience. Please don't hesitate to contact us if you would like to reschedule.</p>
              <p style="margin:0 0 0 0;">Best regards,<br /><strong>${esc(businessName)}</strong></p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;text-align:center;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;">
              &copy; ${new Date().getFullYear()} ${esc(businessName)}. All rights reserved.
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
    }
  } catch (error: any) {
    logger.warn({ appointmentId: record.id, error }, 'Failed to send cancellation notification email');
  }

  logger.info(
    { appointmentId: record.id, clientId: record.clientId, reason: params.reason },
    "Appointment cancelled successfully"
  );

  try {
    const description = params.reason
      ? `Appointment cancelled: ${params.reason}`
      : "Appointment cancelled";
    await api.activityLog.create({
      type: "appointment-cancelled",
      description,
      business: { _link: record.businessId },
      ...(record.clientId ? { client: { _link: record.clientId } } : {}),
      appointment: { _link: record.id },
      metadata: { performedBy: null, reason: params.reason ?? null },
    } as any);
  } catch (error: any) {
    logger.warn({ appointmentId: record.id, errorMessage: error.message }, "Failed to create activity log for appointment cancellation");
  }

  try {
    const openInvoices = await api.invoice.findMany({
      filter: {
        AND: [
          { appointmentId: { equals: record.id } },
          { status: { in: ["draft", "sent", "partial"] } },
        ],
      },
      select: { id: true, invoiceNumber: true },
    });

    if (openInvoices.length > 0) {
      const voidedIds: string[] = [];

      for (const invoice of openInvoices) {
        try {
          await api.invoice.voidInvoice(invoice.id);
          voidedIds.push(invoice.id);
        } catch (voidError: any) {
          logger.warn(
            { appointmentId: record.id, invoiceId: invoice.id, errorMessage: voidError.message },
            "Failed to auto-void invoice for cancelled appointment"
          );
        }
      }

      await api.activityLog.create({
        type: "invoice-voided",
        description: `Auto-voided ${voidedIds.length} invoice(s) due to appointment cancellation`,
        business: { _link: record.businessId },
        appointment: { _link: record.id },
        metadata: { invoiceIds: voidedIds, totalFound: openInvoices.length },
      } as any);
    }
  } catch (error: any) {
    logger.warn(
      { appointmentId: record.id, errorMessage: error.message },
      "Failed to auto-void open invoices for cancelled appointment"
    );
  }
};

export const params = {
  reason: { type: "string" },
};

export const options: ActionOptions = {
  actionType: "custom",
};