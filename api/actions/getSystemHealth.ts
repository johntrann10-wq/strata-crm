import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  try {
    const userId = session?.get("user") as string | undefined;

    if (!userId) {
      return {
        unresolvedErrors: 0,
        criticalErrors: 0,
        warningErrors: 0,
        failedNotifications: 0,
        pendingRetryNotifications: 0,
        failedAutomations: 0,
        lowStockItems: 0,
      };
    }

    const business = await api.business.findFirst({
      filter: { ownerId: { equals: userId } },
      select: { id: true },
    });

    if (!business) {
      return {
        unresolvedErrors: 0,
        criticalErrors: 0,
        warningErrors: 0,
        failedNotifications: 0,
        pendingRetryNotifications: 0,
        failedAutomations: 0,
        lowStockItems: 0,
      };
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Unresolved system errors
    const unresolvedErrorLogs = await api.systemErrorLog.findMany({
      first: 250,
      filter: {
        businessId: { equals: userId },
        resolved: { equals: false },
      },
      select: { id: true, severity: true },
    });

    const unresolvedErrors = unresolvedErrorLogs.length;
    const criticalErrors = unresolvedErrorLogs.filter((e) => e.severity === "critical").length;
    const warningErrors = unresolvedErrorLogs.filter((e) => e.severity === "warning").length;

    // Failed notifications with retryCount >= 3 (permanently failed)
    const failedNotificationLogs = await api.notificationLog.findMany({
      first: 250,
      filter: {
        AND: [
          { businessId: { equals: userId } },
          { status: { equals: "failed" } },
          { retryCount: { greaterThanOrEqual: 3 } },
        ],
      },
      select: { id: true },
    });
    const failedNotifications = failedNotificationLogs.length;

    // Failed notifications with retryCount < 3 (pending retry)
    const pendingRetryLogs = await api.notificationLog.findMany({
      first: 250,
      filter: {
        AND: [
          { businessId: { equals: userId } },
          { status: { equals: "failed" } },
          { retryCount: { lessThan: 3 } },
        ],
      },
      select: { id: true },
    });
    const pendingRetryNotifications = pendingRetryLogs.length;

    // Failed automations in the last 24 hours
    const failedAutomationLogs = await api.automationLog.findMany({
      first: 250,
      filter: {
        AND: [
          { businessId: { equals: userId } },
          { status: { equals: "failed" } },
          { createdAt: { greaterThan: twentyFourHoursAgo } },
        ],
      },
      select: { id: true },
    });
    const failedAutomations = failedAutomationLogs.length;

    // Low stock inventory items (quantity not null and <= 5)
    const lowStockInventory = await api.inventoryItem.findMany({
      first: 250,
      filter: {
        AND: [
          { businessId: { equals: userId } },
          { quantity: { isSet: true } },
          { quantity: { lessThanOrEqual: 5 } },
        ],
      },
      select: { id: true },
    });
    const lowStockItems = lowStockInventory.length;

    return {
      unresolvedErrors,
      criticalErrors,
      warningErrors,
      failedNotifications,
      pendingRetryNotifications,
      failedAutomations,
      lowStockItems,
    };
  } catch (error) {
    logger.warn({ error }, "Failed to retrieve system health data, returning zeros");
    return {
      unresolvedErrors: 0,
      criticalErrors: 0,
      warningErrors: 0,
      failedNotifications: 0,
      pendingRetryNotifications: 0,
      failedAutomations: 0,
      lowStockItems: 0,
    };
  }
};

export const options: ActionOptions = {
  triggers: { api: true },
  returnType: true,
};
