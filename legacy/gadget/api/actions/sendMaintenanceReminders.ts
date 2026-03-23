import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const now = new Date().toISOString();
  let processedCount = 0;
  let hasNextPage = true;
  let cursor: string | undefined;

  while (hasNextPage) {
    const reminders = await api.maintenanceReminder.findMany({
      filter: {
        sent: { equals: false },
        dueDate: { lessThanOrEqual: now },
      },
      first: 250,
      after: cursor,
      select: {
        id: true,
      },
    });

    for (const reminder of reminders) {
      await api.maintenanceReminder.send(reminder.id);
      processedCount++;
    }

    hasNextPage = reminders.hasNextPage;
    cursor = reminders.endCursor ?? undefined;
  }

  logger.info({ processedCount }, `Processed ${processedCount} maintenance reminders`);
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [{ cron: "0 10 * * *" }],
  },
};
