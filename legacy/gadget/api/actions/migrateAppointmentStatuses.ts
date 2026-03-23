import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  let migratedScheduled = 0;
  let migratedInProgress = 0;

  // Migrate "pending" -> "scheduled"
  {
    let hasNextPage = true;
    let after: string | undefined = undefined;
    let page: any;

    while (hasNextPage) {
      page = await api.appointment.findMany({
        first: 250,
        after,
        filter: { status: { equals: "pending" as any } },
        select: { id: true },
      });

      for (const record of page) {
        await api.internal.appointment.update(record.id, { status: "scheduled" });
        migratedScheduled++;
      }

      hasNextPage = page.hasNextPage;
      after = page.endCursor ?? undefined;
    }
  }

  // Migrate "in-progress" -> "in_progress"
  {
    let hasNextPage = true;
    let after: string | undefined = undefined;
    let page: any;

    while (hasNextPage) {
      page = await api.appointment.findMany({
        first: 250,
        after,
        filter: { status: { equals: "in-progress" as any } },
        select: { id: true },
      });

      for (const record of page) {
        await api.internal.appointment.update(record.id, { status: "in_progress" });
        migratedInProgress++;
      }

      hasNextPage = page.hasNextPage;
      after = page.endCursor ?? undefined;
    }
  }

  const total = migratedScheduled + migratedInProgress;
  logger.info({ migratedScheduled, migratedInProgress, total }, "Appointment status migration complete");

  return { migratedScheduled, migratedInProgress, total };
};

export const options: ActionOptions = {
  triggers: { api: true },
};