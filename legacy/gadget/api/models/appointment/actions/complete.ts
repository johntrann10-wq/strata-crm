import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";
import { esc } from "../../../lib/escapeHtml";
import { logError } from "../../../lib/logError";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });
  if (record.status === "completed") {
    throw new Error("This appointment has already been completed.");
  }
  if (record.status === "cancelled") {
    throw new Error("Cannot complete a cancelled appointment.");
  }

  const fresh = await api.appointment.findOne(record.id, { select: { id: true, status: true, updatedAt: true } });

  if (fresh.status === "completed") {
    throw new Error("This appointment has already been completed by another user. Please refresh and try again.");
  }
  if (fresh.status === "cancelled") {
    throw new Error("Cannot complete a cancelled appointment.");
  }
  if (fresh.updatedAt.getTime() !== record.updatedAt.getTime()) {
    throw new Error("This appointment was modified by another user. Please refresh and try again.");
  }

  const openInvoices = await api.invoice.findMany({
    filter: {
      AND: [
        { appointment: { id: { equals: record.id } } },
        { status: { in: ["sent", "partial"] } },
      ],
    },
    select: { id: true, invoiceNumber: true, total: true },
    first: 5,
  });

  if (openInvoices.length > 0) {
    throw new Error(
      "Cannot complete this appointment — there " +
        (openInvoices.length === 1
          ? "is 1 invoice with outstanding balances (sent or partially paid)"
          : "are " + openInvoices.length + " invoices with outstanding balances (sent or partially paid)") +
        " that must be collected or voided first."
    );
  }

  record.status = "completed";
  record.completedAt = new Date();

  if (!record.assignedStaffId) {
    logger.warn({ appointmentId: record.id, businessId: record.businessId }, 'Completing appointment with no assigned staff member — job accountability cannot be tracked');
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api, emails }) => {
  try {
    if (record.inventoryDeductedAt) {
      logger.info({ appointmentId: record.id }, "Inventory already deducted for this appointment, skipping");
    } else {
      await api.internal.appointment.update(record.id, { inventoryDeductedAt: new Date() });
      const appointmentServices = await api.appointmentService.findMany({
        filter: { appointmentId: { equals: record.id } },
        select: { id: true, serviceId: true },
        first: 50,
      });

      if (appointmentServices.length > 0) {
        for (const apptService of appointmentServices) {
          try {
            const serviceInventoryItems = await api.serviceInventoryItem.findMany({
              filter: { serviceId: { equals: apptService.serviceId } },
              select: {
                id: true,
                quantityUsed: true,
                inventoryItem: { id: true, name: true, quantity: true },
              },
              first: 50,
            });

            for (const sii of serviceInventoryItems) {
              const inventoryItem = sii.inventoryItem;
              const newQuantity = (inventoryItem.quantity ?? 0) - (sii.quantityUsed ?? 1);
              await api.inventoryItem.update(inventoryItem.id, { quantity: Math.max(0, newQuantity) });
              if (newQuantity < 0) {
                logger.warn(
                  { appointmentId: record.id, itemName: inventoryItem.name },
                  "Inventory item went below zero after job completion"
                );
              }
            }
          } catch (siiError) {
            logger.warn(
              { appointmentId: record.id, serviceId: apptService.serviceId, error: siiError },
              "Failed to deduct inventory for service"
            );
            await logError({ api, logger, businessId: record.businessId as string, severity: 'warning', category: 'inventory', message: 'Failed to deduct inventory for service during job completion', context: { appointmentId: record.id, serviceId: apptService.serviceId, error: String(siiError) } });
          }
        }
      }
    }
  } catch (invError) {
    logger.warn(
      { appointmentId: record.id, error: invError },
      "Failed to process inventory deduction for appointment completion"
    );
    await logError({ api, logger, businessId: record.businessId as string, severity: 'error', category: 'inventory', message: 'Failed to process inventory deduction block for appointment completion', context: { appointmentId: record.id, error: String(invError) } });
  }

  const freshAppointment = await api.appointment.findOne(record.id, { select: { id: true, reviewRequestSent: true } });
  if (freshAppointment.reviewRequestSent) {
    logger.info({ appointmentId: record.id }, "Review request already sent, skipping");
    return;
  }

  if (!record.clientId) {
    logger.warn({ appointmentId: record.id }, "No clientId on appointment, skipping completion emails");
    return;
  }

  const [client, business] = await Promise.all([
    api.client.maybeFindOne(record.clientId as string, {
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    api.business.maybeFindFirst({
      filter: { id: { equals: record.businessId as string } },
      select: { id: true, name: true, googleReviewLink: true, yelpReviewLink: true, facebookReviewLink: true, timezone: true },
    }),
  ]);

  if (!client) {
    logger.warn({ appointmentId: record.id, clientId: record.clientId }, "Client not found, skipping completion emails");
    return;
  }

  const businessName = business?.name ?? "Your Service Provider";
  const clientFullName = `${client.firstName} ${client.lastName}`.trim();

  const reviewButtons: string[] = [];
  if (business?.googleReviewLink) {
    reviewButtons.push(`<a href="${esc(business.googleReviewLink)}" target="_blank" style="display:inline-block;background-color:#4285f4;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px;margin:4px;">Leave a Google Review</a>`);
  }
  if (business?.yelpReviewLink) {
    reviewButtons.push(`<a href="${esc(business.yelpReviewLink)}" target="_blank" style="display:inline-block;background-color:#d32323;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px;margin:4px;">Review Us on Yelp</a>`);
  }
  if (business?.facebookReviewLink) {
    reviewButtons.push(`<a href="${esc(business.facebookReviewLink)}" target="_blank" style="display:inline-block;background-color:#1877f2;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px;margin:4px;">Review Us on Facebook</a>`);
  }

  if (client.email) {
    try {
    await api.sendNotification({
      type: "job_completion",
      recipientEmail: client.email,
      subject: `Your vehicle is ready! — ${businessName}`,
      html: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <tr>
              <td style="background-color:#111827;padding:32px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${esc(businessName)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:40px 40px 24px 40px;">
                <p style="margin:0 0 16px 0;font-size:16px;color:#374151;">Hi ${esc(clientFullName)},</p>
                <p style="margin:0 0 16px 0;font-size:16px;color:#374151;line-height:1.6;">
                  Great news — the work on your vehicle is complete and it is ready for pickup at your earliest convenience.
                </p>
                <p style="margin:0 0 16px 0;font-size:16px;color:#374151;line-height:1.6;">
                  Thank you for trusting us with your vehicle. We truly appreciate your business and look forward to seeing you again!
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} ${esc(businessName)}. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
      businessId: business?.id ?? (record.businessId as string),
      clientId: client.id,
      relatedModel: "appointment",
      relatedId: record.id,
    });
    logger.info({ appointmentId: record.id, clientEmail: client.email }, "Job completion notification queued");
    } catch (jobCompletionError) {
      logger.warn({ appointmentId: record.id, error: jobCompletionError }, "Failed to send job completion notification");
      await logError({ api, logger, businessId: business?.id ?? (record.businessId as string), severity: "error", category: "email", message: "Failed to send job completion notification", context: { appointmentId: record.id, error: String(jobCompletionError) } });
    }

    if (!(business?.googleReviewLink || business?.yelpReviewLink || business?.facebookReviewLink)) {
      logger.info({ appointmentId: record.id }, 'No review links configured, skipping review request');
    } else {
    try {
    const result = await api.sendNotification({
      type: "review_request",
      recipientEmail: client.email,
      subject: `How was your experience with ${businessName}? ⭐`,
      html: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <tr>
              <td style="background-color:#111827;padding:32px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${esc(businessName)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:40px 40px 24px 40px;">
                <h2 style="margin:0 0 8px 0;font-size:20px;color:#111827;text-align:center;">⭐⭐⭐⭐⭐</h2>
                <h3 style="margin:0 0 24px 0;font-size:18px;color:#111827;text-align:center;">How did we do?</h3>
                <p style="margin:0 0 16px 0;font-size:16px;color:#374151;">Hi ${esc(clientFullName)},</p>
                <p style="margin:0 0 24px 0;font-size:16px;color:#374151;line-height:1.6;">
                  We hope you are loving the results! Your feedback means the world to us. If you have a moment, we would really appreciate it if you could leave us a Google review — it helps other customers find us and motivates our team.
                </p>
                ${
                  reviewButtons.length > 0
                    ? `<table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="padding:8px 0 24px 0;">
                      ${reviewButtons.join("\n                      ")}
                    </td>
                  </tr>
                </table>`
                    : `<p style="margin:0 0 24px 0;font-size:16px;color:#374151;line-height:1.6;">
                  You can find us by searching for <strong>${esc(businessName)}</strong> on Google Maps to leave your review.
                </p>`
                }
              </td>
            </tr>
            <tr>
              <td style="background-color:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} ${esc(businessName)}. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
      businessId: business?.id ?? (record.businessId as string),
      clientId: client.id,
      relatedModel: "appointment",
      relatedId: record.id,
    });
    if (result.success === true) {
      await api.internal.appointment.update(record.id, { reviewRequestSent: true });
      logger.info({ appointmentId: record.id, clientEmail: client.email }, 'Review request notification queued and flag stamped');
    } else {
      logger.warn({ appointmentId: record.id }, 'Review request send returned non-success; reviewRequestSent flag NOT stamped so runAutomations can retry');
    }
    } catch (reviewRequestError) {
      logger.warn({ appointmentId: record.id, error: reviewRequestError }, "Failed to send review request notification");
      await logError({ api, logger, businessId: business?.id ?? (record.businessId as string), severity: "error", category: "email", message: "Failed to send review request notification", context: { appointmentId: record.id, error: String(reviewRequestError) } });
    }
    }
  }

  try {
    await api.activityLog.create({
      type: "appointment-completed",
      description: "Appointment marked as completed",
      business: business ? { _link: business.id } : undefined,
      client: { _link: client.id },
      appointment: { _link: record.id },
    } as any);
  } catch (error) {
    logger.warn({ appointmentId: record.id, error }, "Failed to create activity log for appointment completion");
  }
};

export const options: ActionOptions = {
  actionType: "custom",
};