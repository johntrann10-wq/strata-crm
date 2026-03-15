import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";
import { esc } from "../../../lib/escapeHtml";

export const run: ActionRun = async ({ params, record, logger, api }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  if (record.status !== "completed") {
    throw new Error("Review requests can only be sent for completed appointments.");
  }

  record.reviewRequestSent = false;
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api }) => {
  const client = await api.client.maybeFindOne(record.clientId, {
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (!client || !client.email) {
    logger.warn({ clientId: record.clientId }, "Client not found or has no email, skipping review request re-send");
    return;
  }

  const business = await api.business.maybeFindFirst({
    filter: { id: { equals: record.businessId as string } },
    select: { id: true, name: true, googleReviewLink: true, yelpReviewLink: true, facebookReviewLink: true },
  });

  const businessName = business?.name ?? "our business";

  let reviewButtonsHtml = "";
  if (business?.googleReviewLink || business?.yelpReviewLink || business?.facebookReviewLink) {
    const buttons: string[] = [];
    if (business?.googleReviewLink) {
      buttons.push(
        `<a href="${esc(business.googleReviewLink)}" style="display:inline-block;margin:8px;padding:12px 24px;background-color:#4285f4;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">Review on Google</a>`
      );
    }
    if (business?.yelpReviewLink) {
      buttons.push(
        `<a href="${esc(business.yelpReviewLink)}" style="display:inline-block;margin:8px;padding:12px 24px;background-color:#d32323;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">Review on Yelp</a>`
      );
    }
    if (business?.facebookReviewLink) {
      buttons.push(
        `<a href="${esc(business.facebookReviewLink)}" style="display:inline-block;margin:8px;padding:12px 24px;background-color:#1877f2;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">Review on Facebook</a>`
      );
    }
    reviewButtonsHtml = `<div style="text-align:center;margin:24px 0;">${buttons.join("")}</div>`;
  } else {
    reviewButtonsHtml = `<p style="text-align:center;color:#555;">We'd love to hear your feedback! Please reach out to share your experience.</p>`;
  }

  const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#f5a623;font-size:48px;margin:0;">⭐⭐⭐⭐⭐</h1>
          <h2 style="color:#333;margin-top:12px;">How was your experience?</h2>
        </div>
        <p style="color:#555;font-size:16px;">Hi ${client.firstName},</p>
        <p style="color:#555;font-size:16px;">We hope you enjoyed your recent service at <strong>${businessName}</strong>. Your feedback means the world to us and helps us continue to improve!</p>
        <p style="color:#555;font-size:16px;">If you have a moment, we'd greatly appreciate it if you could leave us a review on one of the platforms below:</p>
        ${reviewButtonsHtml}
        <p style="color:#555;font-size:16px;">Thank you for choosing <strong>${businessName}</strong>. We look forward to serving you again!</p>
        <p style="color:#999;font-size:12px;text-align:center;margin-top:32px;">You received this email because you recently had a service appointment with ${businessName}.</p>
      </div>
    `;

  const result = await api.sendNotification({
    type: "review_request",
    recipientEmail: client.email,
    subject: `How was your experience with ${businessName}? ⭐`,
    html: htmlBody,
    businessId: record.businessId as string,
    clientId: client.id,
    relatedModel: "appointment",
    relatedId: record.id,
  });

  logger.info({ appointmentId: record.id, clientEmail: client.email, notificationLogId: result.notificationLogId }, "Review request email re-queued via sendNotification");

  if (result.success === true) {
    try {
      await api.internal.appointment.update(record.id, { reviewRequestSent: true });
    } catch (err) {
      logger.error({ appointmentId: record.id, err }, "Failed to set reviewRequestSent flag after re-sending review request");
    }
  } else {
    logger.warn({ appointmentId: record.id }, "Review request re-send returned non-success; flag NOT stamped so it can be retried");
  }
};

export const options: ActionOptions = {
  actionType: "custom",
};
