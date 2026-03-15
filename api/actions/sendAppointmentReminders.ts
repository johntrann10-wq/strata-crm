import { ActionOptions } from "gadget-server";
import { esc } from "../../lib/escapeHtml";

export const run: ActionRun = async ({ logger, api }) => {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const appointments = await api.appointment.findMany({
    filter: {
      AND: [
        {
          status: {
            in: ["confirmed", "scheduled"],
          },
        },
        {
          startTime: {
            greaterThanOrEqual: windowStart.toISOString(),
          },
        },
        {
          startTime: {
            lessThanOrEqual: windowEnd.toISOString(),
          },
        },
        {
          reminderSent: { equals: false },
        },
      ],
    },
    select: {
      id: true,
      startTime: true,
      status: true,
      businessId: true,
      client: {
        id: true,
        firstName: true,
        email: true,
      },
    },
    first: 250,
  });

  // Batch-load businesses by their id (appointment.businessId is the business record id)
  const businessIds = [
    ...new Set(
      appointments
        .map((a) => a.businessId)
        .filter((id): id is string => id != null)
    ),
  ];

  const businesses =
    businessIds.length > 0
      ? await api.business.findMany({
          filter: {
            id: { in: businessIds },
          },
          select: { id: true, name: true, timezone: true },
          first: 250,
        })
      : [];

  const businessById = new Map(businesses.map((b) => [b.id, b]));

  let remindersSent = 0;

  for (const appointment of appointments) {
    try {
      const client = appointment.client;
      const biz = businessById.get(appointment.businessId!);
      const businessName = biz?.name ?? "Your service provider";
      const timezone = biz?.timezone ?? "America/New_York";

      if (!client?.email) {
        logger.info(
          { appointmentId: appointment.id },
          "Skipping appointment reminder - client has no email"
        );
        continue;
      }

      const appointmentDate = new Date(appointment.startTime!);
      const formattedDate = appointmentDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: timezone,
      });
      const formattedTime = appointmentDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: timezone,
      });

      const result = await api.sendNotification({
        type: "appointment_reminder",
        recipientEmail: client.email,
        subject: `Reminder: Your appointment tomorrow at ${formattedTime} — ${businessName}`,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#111827;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${esc(businessName)}</h1>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Appointment Reminder</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:40px 40px 32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#374151;">Hi ${esc(client.firstName)},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                This is a friendly reminder that you have an appointment scheduled for <strong>tomorrow</strong>. We look forward to seeing you!
              </p>

              <!-- Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:80px;">Date</td>
                        <td style="font-size:15px;color:#111827;font-weight:500;">${esc(formattedDate)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:80px;">Time</td>
                        <td style="font-size:15px;color:#111827;font-weight:500;">${esc(formattedTime)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
                If you need to reschedule or have any questions, please contact us and we'll be happy to help.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f3f4f6;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} ${esc(businessName)}. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
        businessId: appointment.businessId ?? undefined,
        clientId: client.id,
        relatedModel: "appointment",
        relatedId: appointment.id,
      });

      if (result.success === true) {
        await api.internal.appointment.update(appointment.id, { reminderSent: true });
        remindersSent++;
        logger.info(
          { appointmentId: appointment.id, clientEmail: client.email, businessName },
          "Queued appointment reminder via sendNotification"
        );
      } else {
        logger.warn(
          { appointmentId: appointment.id },
          "Reminder email send failed; reminderSent flag NOT set so it will be retried"
        );
      }
    } catch (error) {
      logger.warn(
        { appointmentId: appointment.id, error: (error as Error).message },
        "Failed to send appointment reminder - skipping"
      );
      continue;
    }
  }

  logger.info(
    { remindersSent, totalEligible: appointments.length },
    "Appointment reminders batch complete"
  );
};

// The scheduler trigger has been removed from this action. Appointment reminders are now sent
// exclusively by runAutomations.ts (which runs hourly) to avoid a race condition where both
// schedulers could send a reminder to the same client before either stamps reminderSent: true.
export const options: ActionOptions = {
  triggers: {
    api: true,
  },
};