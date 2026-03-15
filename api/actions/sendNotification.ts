import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, emails }) => {
  const { type, recipientEmail, subject, html, htmlBody, businessId, clientId, relatedModel, relatedId } = params;
  const body = (html ?? htmlBody ?? '') as string;

  if (clientId) {
    const client = await api.client.maybeFindOne(clientId as string, {
      select: { id: true, businessId: true },
    });

    if (!client) {
      logger.warn({ type, recipientEmail, businessId, clientId }, 'sendNotification authorization failed: client not found');
      throw new Error("Unauthorized: recipient does not belong to this business.");
    }
    if (client.businessId !== businessId) {
      logger.warn({ type, recipientEmail, businessId, clientId }, 'sendNotification authorization failed: businessId mismatch');
      throw new Error("Unauthorized: recipient does not belong to this business.");
    }
  }

  let notificationLogId: string | undefined;
  let currentRetryCount = 0;
  let success = false;

  try {
    const createInput: Record<string, any> = {
      recipientEmail: recipientEmail!,
      status: "pending",
      subject,
      type: type as any,
      lastAttemptAt: new Date(),
      retryCount: 0,
    };

    if (relatedModel) createInput.relatedModel = relatedModel;
    if (relatedId) createInput.relatedId = relatedId;
    if (businessId) createInput.business = { _link: businessId };
    if (clientId) createInput.client = { _link: clientId };
    if (body) createInput.htmlBody = body;

    const log = await api.notificationLog.create(createInput);
    notificationLogId = log.id;
    currentRetryCount = (log as any).retryCount ?? 0;

    try {
      await emails.sendMail({
        to: recipientEmail!,
        subject: subject!,
        html: body,
      });

      await api.notificationLog.update(notificationLogId, {
        status: "sent",
      });

      success = true;
    } catch (emailErr: any) {
      const backoffMinutes = Math.min(Math.pow(2, currentRetryCount) * 30, 24 * 60);
      const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

      try {
        await api.notificationLog.update(notificationLogId, {
          status: "failed",
          errorMessage: emailErr?.message ?? String(emailErr),
          nextRetryAt,
          retryCount: currentRetryCount + 1,
        });
      } catch (updateErr: any) {
        logger.warn(
          { notificationLogId, updateError: updateErr?.message },
          "Failed to update notification log after email send failure"
        );
      }

      logger.warn({ notificationLogId, type, recipientEmail: recipientEmail, retryCount: currentRetryCount + 1, nextRetryAt: nextRetryAt.toISOString(), error: emailErr?.message }, 'Email send failed, scheduled for retry');
      success = false;
    }
  } catch (err: any) {
    logger.warn({ error: err?.message }, "Unexpected error in sendNotification action");
    success = false;
  }

  return { notificationLogId, success };
};

export const params = {
  type: { type: "string" },
  recipientEmail: { type: "string" },
  subject: { type: "string" },
  html: { type: "string" },
  htmlBody: { type: "string" },
  businessId: { type: "string" },
  clientId: { type: "string" },
  relatedModel: { type: "string" },
  relatedId: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
  returnType: true,
};
