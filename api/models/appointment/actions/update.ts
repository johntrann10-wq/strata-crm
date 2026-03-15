import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";
import { esc } from "../../../lib/escapeHtml";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  const current = await api.appointment.findOne(record.id, { select: { id: true, status: true, startTime: true, endTime: true, updatedAt: true, businessId: true, rescheduleCount: true } });
  if (current.status === "completed") {
    throw new Error("Cannot edit a completed appointment.");
  }
  if (current.status === "cancelled") {
    throw new Error("Cannot edit a cancelled appointment.");
  }
  if (current.status === "no-show") {
    throw new Error("Cannot edit a no-show appointment.");
  }

  if (record.changed("startTime") || record.changed("endTime") || record.changed("assignedStaffId")) {
    if (record.startTime && !record.endTime) {
      record.endTime = current.endTime;
    }

    if (record.startTime && record.endTime) {
      const startMs = (record.startTime as Date).getTime();
      const endMs = (record.endTime as Date).getTime();
      if (endMs <= startMs) {
        throw new Error("End time must be after start time.");
      }

      // Null-safety guard for businessId
      let businessId = record.businessId as string;
      if (!businessId) {
        const fetched = await api.appointment.findOne(record.id, { select: { businessId: true } });
        businessId = fetched.businessId;
      }

      const biz = await api.business.maybeFindFirst({
        filter: { id: { equals: businessId } },
        select: { appointmentBufferMinutes: true },
      });
      const bufferMs = (biz?.appointmentBufferMinutes ?? 15) * 60 * 1000;

      const bufferedStart = new Date((record.startTime as Date).getTime() - bufferMs);
      const bufferedEnd = new Date((record.endTime as Date).getTime() + bufferMs);
      const bufferedStartIso = bufferedStart.toISOString();
      const bufferedEndIso = bufferedEnd.toISOString();

      const overlapping = await api.appointment.findMany({
        filter: {
          AND: [
            { businessId: { equals: businessId } },
            { id: { notEquals: record.id } },
            { status: { in: ["scheduled", "confirmed", "in_progress"] } },
            { startTime: { lessThan: bufferedEndIso } },
            { endTime: { greaterThan: bufferedStartIso } },
          ],
        } as any,
        select: { id: true },
      });

      if (overlapping.length > 0) {
        throw new Error("This appointment conflicts with an existing appointment. Please choose a different time.");
      }

      if (record.assignedStaffId && (record.changed("assignedStaffId") || record.changed("startTime") || record.changed("endTime"))) {
        const staffOverlap = await api.appointment.findMany({
          filter: {
            AND: [
              { assignedStaffId: { equals: record.assignedStaffId as string } },
              { id: { notEquals: record.id } },
              { status: { in: ["scheduled", "confirmed", "in_progress"] } },
              { startTime: { lessThan: bufferedEndIso } },
              { endTime: { greaterThan: bufferedStartIso } },
            ],
          } as any,
          select: { id: true },
        });

        if (staffOverlap.length > 0) {
          throw new Error("The assigned staff member has a conflicting appointment during this time.");
        }
      }
    }
  }

  if (record.assignedStaffId && record.changed("assignedStaffId") && !record.changed("startTime") && !record.changed("endTime")) {
    const apptStartTime = current.startTime as Date | null;
    const apptEndTime = current.endTime as Date | null;

    if (apptStartTime && apptEndTime) {
      let staffCheckBusinessId = record.businessId as string;
      if (!staffCheckBusinessId) {
        const fetched = await api.appointment.findOne(record.id, { select: { businessId: true } });
        staffCheckBusinessId = fetched.businessId;
      }

      const biz = await api.business.maybeFindFirst({
        filter: { id: { equals: staffCheckBusinessId } },
        select: { appointmentBufferMinutes: true },
      });
      const bufferMs = (biz?.appointmentBufferMinutes ?? 15) * 60 * 1000;

      const bufferedStart = new Date(apptStartTime.getTime() - bufferMs);
      const bufferedEnd = new Date(apptEndTime.getTime() + bufferMs);
      const bufferedStartIso = bufferedStart.toISOString();
      const bufferedEndIso = bufferedEnd.toISOString();

      const staffOverlap = await api.appointment.findMany({
        filter: {
          AND: [
            { assignedStaffId: { equals: record.assignedStaffId as string } },
            { id: { notEquals: record.id } },
            { status: { in: ["scheduled", "confirmed", "in_progress"] } },
            { startTime: { lessThan: bufferedEndIso } },
            { endTime: { greaterThan: bufferedStartIso } },
          ],
        } as any,
        select: { id: true },
      });

      if (staffOverlap.length > 0) {
        throw new Error("The assigned staff member has a conflicting appointment during this time.");
      }
    }
  }

  const latestSnapshot = await api.appointment.findOne(record.id, { select: { id: true, updatedAt: true } });
  if (latestSnapshot.updatedAt.getTime() !== current.updatedAt.getTime()) {
    throw new Error("This appointment was modified by another user while you were editing. Please refresh and try again.");
  }

  if (record.changed("startTime") || record.changed("endTime")) {
    const currentRescheduleCount = (current.rescheduleCount as number | null) ?? 0;
    record.rescheduleCount = currentRescheduleCount + 1;
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, api, logger }) => {
  let changedFields: string[] = [];
  let previousValues: Record<string, unknown> = {};
  let newValues: Record<string, unknown> = {};

  try {
    const allChanges = record.changes();
    const systemFields = new Set(["updatedAt", "createdAt"]);


    for (const [field, change] of Object.entries(allChanges) as [string, { changed: boolean; current: unknown; previous: unknown }][]) {
      if (systemFields.has(field)) continue;
      changedFields.push(field);
      previousValues[field] = change.previous;
      newValues[field] = change.current;
    }

    if (changedFields.length === 0) return;

    let description: string;
    if (changedFields.includes("startTime") || changedFields.includes("endTime")) {
      description = "Appointment rescheduled";
    } else if (changedFields.includes("assignedStaffId")) {
      description = "Appointment staff reassigned";
    } else {
      description = "Appointment updated";
    }

    await api.activityLog.create({
      type: "appointment-updated",
      description,
      business: { _link: record.businessId as string },
      ...(record.clientId ? { client: { _link: record.clientId as any } } : {}),
      appointment: { _link: record.id },
      metadata: {
        performedBy: null,
        changedFields,
        previousValues,
        newValues,
        rescheduleCount: record.rescheduleCount,
      } as any,
    } as any);
  } catch (error) {
    logger.warn({ error }, "Failed to write audit log for appointment update");
  }

  if (changedFields.includes("startTime") || changedFields.includes("endTime")) {
    try {
      const client = record.clientId
        ? await api.client.maybeFindOne(record.clientId as string, {
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : null;

      const business = await api.business.maybeFindFirst({
        filter: { id: { equals: record.businessId as string } },
        select: { id: true, name: true, phone: true, email: true },
      });

      if (client?.email) {
        const newStartTime = record.startTime as Date | null;
        const newEndTime = record.endTime as Date | null;

        const dateOptions: Intl.DateTimeFormatOptions = {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        };
        const timeOptions: Intl.DateTimeFormatOptions = {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        };

        const formattedDate = newStartTime
          ? newStartTime.toLocaleDateString("en-US", dateOptions)
          : "Date TBD";
        const formattedStart = newStartTime
          ? newStartTime.toLocaleTimeString("en-US", timeOptions)
          : "Time TBD";
        const formattedEnd = newEndTime
          ? newEndTime.toLocaleTimeString("en-US", timeOptions)
          : "";

        const timeDisplay = formattedEnd
          ? `${formattedStart} – ${formattedEnd}`
          : formattedStart;

        const businessName = business?.name ?? "Your service provider";
        const businessPhone = business?.phone ?? "";
        const clientName = `${client.firstName} ${client.lastName}`.trim();

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Appointment Rescheduled</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#111827;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${esc(businessName)}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;color:#374151;">
              <h2 style="margin:0 0 16px 0;font-size:20px;color:#111827;">Your Appointment Has Been Rescheduled</h2>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#6b7280;">Hi ${esc(clientName)},</p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;">
                We wanted to let you know that your appointment has been rescheduled. Here are the updated details:
              </p>
              <!-- Appointment Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:12px;">
                          <span style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">New Date</span><br />
                          <span style="font-size:16px;font-weight:600;color:#111827;margin-top:4px;display:block;">${esc(formattedDate)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:12px;">
                          <span style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">New Time</span><br />
                          <span style="font-size:16px;font-weight:600;color:#111827;margin-top:4px;display:block;">${esc(timeDisplay)}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;">
                If you have any questions or need to make changes, please don't hesitate to contact us.
              </p>
              ${businessPhone ? `<p style="margin:0 0 8px 0;font-size:14px;color:#6b7280;">📞 <a href="tel:${businessPhone}" style="color:#4f46e5;text-decoration:none;">${esc(businessPhone)}</a></p>` : ""}
              ${business?.email ? `<p style="margin:0 0 24px 0;font-size:14px;color:#6b7280;">✉️ <a href="mailto:${business.email}" style="color:#4f46e5;text-decoration:none;">${esc(business.email ?? "")}</a></p>` : ""}
              <p style="margin:0;font-size:15px;line-height:1.6;">Thank you,<br /><strong>${esc(businessName)}</strong></p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated notification from ${esc(businessName)}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        await api.sendNotification({
          type: "appointment_reschedule",
          recipientEmail: client.email,
          subject: `Your Appointment Has Been Rescheduled – ${formattedDate}`,
          html,
          businessId: record.businessId as string,
          clientId: client.id,
          relatedModel: "appointment",
          relatedId: record.id,
        });
      }
    } catch (emailError) {
      logger.warn({ error: emailError }, "Failed to send reschedule notification email");
    }
  }
};

// Expose changedFields outside of try block for use in the email section
// Note: we use a module-level helper to share state between the two blocks

export const options: ActionOptions = {
  actionType: "update",
};