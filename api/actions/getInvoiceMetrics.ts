import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ api, session }) => {
  const userId = session?.get("user") as string | undefined;
  if (!userId) return { outstandingBalance: 0, openInvoicesCount: 0, revenueThisMonth: 0, invoicesThisMonth: 0 };

  const business = await api.business.maybeFindFirst({
    filter: { ownerId: { equals: userId } },
    select: { id: true },
  });
  if (!business) return { outstandingBalance: 0, openInvoicesCount: 0, revenueThisMonth: 0, invoicesThisMonth: 0 };

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [openResult, revenueThisMonth, invoicesThisMonth] = await Promise.all([
    // Loop a: open invoices (status in sent, partial) — count and sum total
    (async () => {
      let count = 0;
      let balance = 0;
      let after: string | undefined;
      let hasNextPage = true;
      while (hasNextPage) {
        const records = await api.invoice.findMany({
          first: 250,
          after,
          filter: {
            AND: [
              { status: { in: ["sent", "partial"] } },
              { businessId: { equals: business.id } },
            ],
          },
          select: { id: true, total: true },
        });
        for (const invoice of records) {
          count++;
          balance += invoice.total ?? 0;
        }
        hasNextPage = records.hasNextPage;
        after = records.endCursor;
      }
      return { count, balance };
    })(),

    // Loop b: payments this month — sum amount
    (async () => {
      let revenue = 0;
      let after: string | undefined;
      let hasNextPage = true;
      while (hasNextPage) {
        const records = await api.payment.findMany({
          first: 250,
          after,
          filter: {
            AND: [
              { createdAt: { greaterThanOrEqual: startOfMonth } },
              { businessId: { equals: business.id } },
            ],
          },
          select: { id: true, amount: true },
        });
        for (const payment of records) {
          revenue += payment.amount ?? 0;
        }
        hasNextPage = records.hasNextPage;
        after = records.endCursor;
      }
      return revenue;
    })(),

    // Loop c: invoices this month — count
    (async () => {
      let count = 0;
      let after: string | undefined;
      let hasNextPage = true;
      while (hasNextPage) {
        const records = await api.invoice.findMany({
          first: 250,
          after,
          filter: {
            AND: [
              { createdAt: { greaterThanOrEqual: startOfMonth } },
              { businessId: { equals: business.id } },
            ],
          },
          select: { id: true },
        });
        count += records.length;
        hasNextPage = records.hasNextPage;
        after = records.endCursor;
      }
      return count;
    })(),
  ]);

  return {
    outstandingBalance: openResult.balance,
    openInvoicesCount: openResult.count,
    revenueThisMonth,
    invoicesThisMonth,
  };
};

export const options: ActionOptions = {
  triggers: { api: true },
};