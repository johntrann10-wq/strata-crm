export interface LogErrorOptions {
  api: any;
  logger: any;
  businessId: string;
  severity: "warning" | "error" | "critical";
  category: "email" | "inventory" | "payment" | "automation" | "scheduling" | "data-integrity" | "other";
  message: string;
  context?: Record<string, unknown>;
}

export async function logError(options: LogErrorOptions): Promise<void> {
  const { api, logger, businessId, severity, category, message, context } = options;

  if (!businessId) {
    logger.warn({ severity, category, message }, "logError: businessId is falsy, skipping systemErrorLog write");
    return;
  }

  try {
    const payload: Record<string, unknown> = {
      business: { _link: businessId },
      severity,
      category,
      message,
      resolved: false,
    };

    if (context !== undefined) {
      payload.context = context;
    }

    await api.internal.systemErrorLog.create(payload);
  } catch (err) {
    logger.warn({ err }, "logError: failed to write systemErrorLog");
  }
}