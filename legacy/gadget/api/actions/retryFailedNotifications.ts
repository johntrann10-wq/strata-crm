import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, emails }) => {
  const now = new Date();

  // 1) Find notificationLog records eligible for retry
  const failedNotifications = await api.notificationLog.findMany({
    filter: {
      AND: [
        { status: { equals: "failed" } },
        { retryCount: { lessThan: 3 } },
        { nextRetryAt: { lessThanOrEqual: now } },
      ],
    },
    first: 50,
    select: {
      id: true,
      type: true,
      recipientEmail: true,
      subject: true,
      retryCount: true,
      htmlBody: true,
    },
  });

  let attempted = 0;
  let succeeded = 0;
  let permanentlyFailed = 0;

  for (const notification of failedNotifications) {
    // 2) Immediately mark as retrying to prevent double-processing
    await api.notificationLog.update(notification.id, {
      status: "retrying",
    });

    attempted++;

    // 3) Per-record try/catch to attempt sending
    try {
      await emails.sendMail({
        to: notification.recipientEmail,
        subject: notification.subject ?? "Notification",
        html: notification.htmlBody
          ? notification.htmlBody
          : `<p>We experienced a prior delivery issue with this notification and are resending it. We apologize for any inconvenience.</p>`,
      });

      // 4) On success: mark sent, clear error, record attempt time
      await api.notificationLog.update(notification.id, {
        status: "sent",
        errorMessage: null,
        lastAttemptAt: new Date(),
      });

      succeeded++;
    } catch (error) {
      // 5) On failure: increment retryCount and apply backoff or permanent failure
      const newRetryCount = (notification.retryCount ?? 0) + 1;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (newRetryCount === 1) {
        // Retry in 4 hours
        const nextRetryAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
        await api.notificationLog.update(notification.id, {
          status: "failed",
          retryCount: newRetryCount,
          errorMessage,
          lastAttemptAt: new Date(),
          nextRetryAt,
        });
      } else if (newRetryCount === 2) {
        // Retry in 24 hours
        const nextRetryAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await api.notificationLog.update(notification.id, {
          status: "failed",
          retryCount: newRetryCount,
          errorMessage,
          lastAttemptAt: new Date(),
          nextRetryAt,
        });
      } else {
        // 3 or more retries: permanently failed
        await api.notificationLog.update(notification.id, {
          status: "failed",
          retryCount: newRetryCount,
          errorMessage,
          lastAttemptAt: new Date(),
        });
        permanentlyFailed++;
      }
    }
  }

  // 6) Log summary
  logger.info(
    { attempted, succeeded, permanentlyFailed },
    `Retry notifications complete: ${attempted} attempted, ${succeeded} succeeded, ${permanentlyFailed} permanently failed`
  );
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [{ cron: "0 * * * *" }],
  },
};