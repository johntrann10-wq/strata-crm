import { applyParams, save, ActionOptions, assert } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";
import { escapeHtml, esc } from "../../../lib/escapeHtml";

export const run: ActionRun = async ({ params, record, logger, api, connections, session }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  if (!record.clientId) {
    throw new Error('A client is required to create an appointment.');
  }

  const userId = session?.get("user") as string | undefined;

  const business = await api.business.findFirst({
    filter: { owner: { id: { equals: userId } } },
    select: { id: true, appointmentBufferMinutes: true },
  });

  assert(business, "No business found for current user");
  record.businessId = business.id;

  if (record.clientId) {
    const clientRecord = await api.client.maybeFindOne(record.clientId, { select: { id: true, deletedAt: true } });
    if (!clientRecord || clientRecord.deletedAt !== null) {
      throw new Error("Cannot book an appointment for an archived client. Please restore the client record first.");
    }
  }

  if (!record.vehicleId) {
    throw new Error('A vehicle is required to create an appointment.');
  }

  if (record.vehicleId) {
    const vehicleRecord = await api.vehicle.maybeFindOne(record.vehicleId, { select: { id: true, clientId: true, deletedAt: true } });
    if (!vehicleRecord || vehicleRecord.deletedAt !== null) {
      throw new Error("Cannot book an appointment for an archived vehicle. Please restore the vehicle record first.");
    }
    if (vehicleRecord.clientId !== record.clientId) {
      throw new Error('The selected vehicle does not belong to the selected client. Please select a vehicle owned by this client.');
    }
  }

  if (!record.endTime) {
    throw new Error("An end time is required to prevent scheduling conflicts.");
  }

  const startMs = new Date(record.startTime as unknown as string).getTime();
  const endMs = new Date(record.endTime as unknown as string).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    throw new Error('Invalid start or end time provided.');
  }

  if (endMs <= startMs) {
    throw new Error('End time must be after start time.');
  }

  const durationMs = endMs - startMs;
  const maxDurationMs = 24 * 60 * 60 * 1000; // 24 hours
  if (durationMs > maxDurationMs) {
    throw new Error('Appointment duration cannot exceed 24 hours.');
  }

  const bufferMs = (business.appointmentBufferMinutes ?? 15) * 60 * 1000;

  const bufferedStart = new Date(new Date(record.startTime as unknown as string).getTime() - bufferMs).toISOString();
  const bufferedEnd = new Date(new Date(record.endTime as unknown as string).getTime() + bufferMs).toISOString();

  if (record.assignedStaffId) {
    const staffOverlaps = await api.appointment.findMany({
      filter: {
        AND: [
          { businessId: { equals: record.businessId } },
          { assignedStaffId: { equals: record.assignedStaffId } },
          { status: { in: ["scheduled", "confirmed", "in_progress"] } },
          { startTime: { lessThan: bufferedEnd } },
          { endTime: { greaterThan: bufferedStart } },
        ],
      },
      select: { id: true, title: true },
      first: 250,
    });

    if (staffOverlaps.length > 0) {
      throw new Error("Staff conflict: the assigned staff member already has an appointment at this time.");
    }
  }

  // Business-level double-booking check (solo operator scenario — no staff assigned)
  if (!record.assignedStaffId) {
    const businessOverlaps = await api.appointment.findMany({
      filter: {
        AND: [
          { businessId: { equals: record.businessId } },
          { status: { in: ["scheduled", "confirmed", "in_progress"] } },
          { startTime: { lessThan: bufferedEnd } },
          { endTime: { greaterThan: bufferedStart } },
          ...(record.id ? [{ id: { notEquals: record.id } }] : []),
        ],
      },
      select: { id: true },
      first: 250,
    });

    if (businessOverlaps.length > 0) {
      throw new Error("Double-booking detected: there is already an appointment scheduled at this time.");
    }
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api, emails }) => {
  try {
    const serviceIds = (params.serviceIds as string[] | undefined) ?? [];
    if (serviceIds.length > 0) {
      const services = await api.service.findMany({
        filter: { id: { in: serviceIds } },
        select: { id: true, price: true, duration: true },
        first: 50,
      });
      const serviceMap = new Map(services.map((s) => [s.id, s]));
      await Promise.all(
        serviceIds.map(async (serviceId) => {
          const service = serviceMap.get(serviceId);
          await api.appointmentService.create({
            appointment: { _link: record.id },
            service: { _link: serviceId },
            business: { _link: record.businessId as string },
            price: service?.price ?? 0,
            ...(service?.duration != null ? { duration: service.duration } : {}),
          });
        })
      );
    }
  } catch (err) {
    logger.warn({ err, appointmentId: record.id }, "Failed to link appointment services; appointment was saved successfully");
  }

  try {
    await api.activityLog.create({
      type: "appointment-created",
      description: "New appointment booked",
      business: { _link: record.businessId },
      ...(record.clientId ? { client: { _link: record.clientId } } : {}),
      appointment: { _link: record.id },
    });
  } catch (err) {
    logger.warn({ err, appointmentId: record.id }, "Failed to create activity log for appointment; appointment was saved successfully");
  }

  try {
    const client = await api.client.maybeFindOne(record.clientId as string, {
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!client || !client.email) {
      logger.info({ clientId: record.clientId }, "No client email found, skipping booking confirmation email");
      return;
    }

    const biz = await api.business.maybeFindFirst({
      filter: { id: { equals: record.businessId as string } },
      select: { id: true, name: true, phone: true, email: true, timezone: true },
    });

    const businessName = biz?.name ?? "Your Service Provider";

    const formattedDate = new Date(record.startTime as unknown as string).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: biz?.timezone ?? "UTC",
    });

    let endTimeRow = "";
    if (record.endTime) {
      const formattedEnd = new Date(record.endTime as unknown as string).toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: biz?.timezone ?? "UTC",
      });
      endTimeRow = `
              <tr>
                <td style="padding: 8px 12px; font-weight: 600; color: #374151; width: 140px;">Estimated end</td>
                <td style="padding: 8px 12px; color: #111827;">${formattedEnd}</td>
              </tr>`;
    }

    let locationRow = "";
    if (record.isMobile && record.mobileAddress) {
      locationRow = `
              <tr>
                <td style="padding: 8px 12px; font-weight: 600; color: #374151; width: 140px;">Location</td>
                <td style="padding: 8px 12px; color: #111827;">${esc(record.mobileAddress as string)}</td>
              </tr>`;
    }

    let contactInfo = "";
    if (biz?.phone || biz?.email) {
      const phoneLine = biz?.phone ? `<p style="margin: 4px 0; color: #4b5563;">Phone: ${biz.phone}</p>` : "";
      const emailLine = biz?.email ? `<p style="margin: 4px 0; color: #4b5563;">Email: ${biz.email}</p>` : "";
      contactInfo = `
              <div style="margin-top: 24px;">
                <p style="margin: 0 0 8px; font-weight: 600; color: #374151;">Contact us:</p>
                ${phoneLine}
                ${emailLine}
              </div>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #111827; padding: 32px 40px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">${esc(businessName)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; font-size: 18px; font-weight: 600; color: #111827;">Hi ${escapeHtml(client.firstName ?? "")},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: #4b5563; line-height: 1.6;">Your appointment has been booked and is pending confirmation.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 8px 12px; font-weight: 600; color: #374151; width: 140px;">Date &amp; Time</td>
                  <td style="padding: 8px 12px; color: #111827;">${formattedDate}</td>
                </tr>
                ${endTimeRow}
                ${locationRow}
              </table>
              <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">We'll send you another confirmation once your appointment is officially confirmed. If you need to make changes, please contact us.</p>
              ${contactInfo}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f3f4f6; padding: 24px 40px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af;">&copy; ${new Date().getFullYear()} ${esc(businessName)}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await api.sendNotification({
      type: "appointment_confirmation",
      recipientEmail: client.email,
      subject: `Booking Confirmed: ${formattedDate} — ${businessName}`,
      html,
      businessId: record.businessId as string,
      clientId: client.id,
      relatedModel: "appointment",
      relatedId: record.id,
    });
  } catch (err) {
    logger.warn({ err, appointmentId: record.id }, "Failed to send booking confirmation email; appointment was saved successfully");
  }
};

export const options: ActionOptions = {
  actionType: "create",
};

export const params = {
  serviceIds: { type: "string", array: true },
};
