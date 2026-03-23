export const run: ActionRun = async ({ logger, api, session }) => {
  const userId = session?.get("user") as string | undefined;
  if (!userId) return { rules: [], businessId: null };

  const business = await api.business.maybeFindFirst({
    filter: { owner: { id: { equals: userId } } },
    select: { id: true, name: true },
  });
  if (!business) return { rules: [], businessId: null };

  const savedRules = await api.automationRule.findMany({
    filter: { businessId: { equals: business.id } },
    select: { id: true, triggerType: true, enabled: true, delayHours: true, customMessage: true, lastRunAt: true },
    first: 20,
  });

  const RULE_DEFAULTS = [
    {
      triggerType: "job-completed",
      label: "Job Completed Review Request",
      description: "Automatically send a review request email after each job is marked complete.",
      defaultDelayHours: 2,
      icon: "check-circle",
    },
    {
      triggerType: "invoice-unpaid",
      label: "Unpaid Invoice Reminder",
      description: "Send a payment reminder when an invoice becomes overdue.",
      defaultDelayHours: 72,
      icon: "file-text",
    },
    {
      triggerType: "appointment-reminder",
      label: "Appointment Reminder",
      description: "Send clients a reminder email before their scheduled appointment.",
      defaultDelayHours: 24,
      icon: "calendar",
    },
    {
      triggerType: "service-interval",
      label: "Service Interval Reminder",
      description: "Notify clients when their vehicle is due for a recurring service.",
      defaultDelayHours: 0,
      icon: "wrench",
    },
    {
      triggerType: "lapsed-client",
      label: "Lapsed Client Win-Back",
      description: "Re-engage clients who have not returned within a configurable period.",
      defaultDelayHours: 2160,
      icon: "users",
    },
  ];

  const mergedRules = RULE_DEFAULTS.map((def) => {
    const saved = savedRules.find((r) => r.triggerType === def.triggerType);
    return {
      ...def,
      id: saved?.id ?? null,
      enabled: saved?.enabled ?? false,
      delayHours: saved?.delayHours ?? def.defaultDelayHours,
      customMessage: saved?.customMessage ?? "",
      lastRunAt: saved?.lastRunAt ?? null,
    };
  });

  return { rules: mergedRules, businessId: business.id };
};
