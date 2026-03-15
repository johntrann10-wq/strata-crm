import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const quotes = await api.quote.findMany({
    filter: {
      AND: [
        { status: { equals: "sent" } },
        { followUpSentAt: { isSet: false } },
        { createdAt: { lessThan: cutoff.toISOString() } },
      ],
    },
    select: {
      id: true,
      status: true,
      followUpSentAt: true,
      createdAt: true,
      client: {
        id: true,
        email: true,
        firstName: true,
      },
    },
    first: 50,
  });

  for (const quote of quotes) {
    try {
      await api.quote.sendFollowUp(quote.id);
    } catch (error) {
      logger.error({ error, quoteId: quote.id }, "Failed to send follow-up for quote");
    }
  }

  logger.info({ count: quotes.length }, "Sent lost quote follow-up emails");

  return { processed: quotes.length };
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [{ cron: "0 9 * * *" }],
  },
};
