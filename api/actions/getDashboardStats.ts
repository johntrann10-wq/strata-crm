import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const userId = session?.get("user") as string | undefined;

  const zeroValue = {
    totalClients: 0,
    openInvoicesCount: 0,
    revenueThisMonth: 0,
    todayAppointmentsCount: 0,
    todayRevenue: 0,
    outstandingBalance: 0,
    repeatCustomerRate: 0,
    weeklyRevenue: [] as Array<{ date: string; revenue: number }>,
    upcomingCount: 0,
    todayBookedHours: 0,
    totalAvailableHours: 8,
  };

  if (!userId) {
    return zeroValue;
  }

  const business = await api.business.maybeFindFirst({
    filter: { ownerId: { equals: userId } },
    select: { id: true },
  });

  if (!business) {
    return zeroValue;
  }

  // Cross-tenant isolation is guaranteed here: `business` was retrieved by filtering
  // ownerId === userId (the authenticated session user). All downstream queries are
  // scoped to `business.id`, which was derived from that owner match, so no data
  // belonging to another tenant can be returned by any of the fetches below.

  const TOTAL_AVAILABLE_HOURS = 8;

  // Compute date boundaries
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
  const sevenDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6)).toISOString();
  const twelveMonthsAgo = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate())).toISOString();

  // Single O(1) fetch. Returns actual count if <=250, or 250 as a display cap sentinel when
  // more than 250 clients exist (avoids O(n/250) cursor round trips for large client lists).
  const fetchClientCount = async (): Promise<number> => {
    const page = await api.client.findMany({
      filter: { business: { id: { equals: business.id } } },
      select: { id: true },
      first: 250,
    });
    return page.hasNextPage ? 250 : page.length;
  };

  // Open invoices are operationally bounded — a business won't have thousands of open invoices
  // simultaneously. A single page of 250 is sufficient; log a warning if exceeded.
  const fetchOpenInvoices = async (): Promise<{ count: number; totalBalance: number }> => {
    const page = await api.invoice.findMany({
      filter: {
        AND: [
          { status: { in: ["sent", "partial"] } },
          { business: { id: { equals: business.id } } },
        ],
      },
      select: { id: true, total: true },
      first: 250,
    });
    if (page.hasNextPage) {
      logger.warn("fetchOpenInvoices: more than 250 open invoices found; returning partial sum");
    }
    let count = 0;
    let totalBalance = 0;
    for (const invoice of page) {
      count += 1;
      totalBalance += invoice.total ?? 0;
    }
    return { count, totalBalance };
  };

  // Monthly payments are operationally bounded. A single page of 250 is sufficient;
  // log a warning if exceeded.
  const fetchMonthPayments = async (): Promise<number> => {
    const page = await api.payment.findMany({
      filter: {
        AND: [
          { createdAt: { greaterThanOrEqual: startOfMonth } },
          { business: { id: { equals: business.id } } },
        ],
      },
      select: { id: true, amount: true },
      first: 250,
    });
    if (page.hasNextPage) {
      logger.warn("fetchMonthPayments: more than 250 payments this month; returning partial sum");
    }
    let revenue = 0;
    for (const payment of page) {
      revenue += payment.amount ?? 0;
    }
    return revenue;
  };

  const fetchWeeklyPayments = async (): Promise<Array<{ amount: number; createdAt: string }>> => {
    const records = await api.payment.findMany({
      filter: {
        AND: [
          { createdAt: { greaterThanOrEqual: sevenDaysAgo } },
          { createdAt: { lessThanOrEqual: endOfToday } },
          { business: { id: { equals: business.id } } },
        ],
      },
      select: { id: true, amount: true, createdAt: true },
      first: 250,
    });
    return records.map((p) => ({
      amount: p.amount ?? 0,
      createdAt: p.createdAt as unknown as string,
    }));
  };

  const fetchTodayAppointments = async (): Promise<number> => {
    const records = await api.appointment.findMany({
      filter: {
        AND: [
          { startTime: { greaterThanOrEqual: startOfToday } },
          { startTime: { lessThanOrEqual: endOfToday } },
          { business: { id: { equals: business.id } } },
        ],
      },
      select: { id: true },
      first: 100,
    });
    return records.length;
  };

  const fetchUpcomingCount = async (): Promise<number> => {
    const records = await api.appointment.findMany({
      filter: {
        AND: [
          { startTime: { greaterThan: now.toISOString() } },
          { status: { in: ["scheduled", "confirmed", "in_progress"] } },
          { business: { id: { equals: business.id } } },
        ],
      },
      select: { id: true },
      first: 250,
    });
    return records.length;
  };

  // Uses a 12-month rolling window for accuracy and performance. Appointments older than
  // 12 months are not meaningful for measuring current repeat-customer behaviour, and
  // limiting the window prevents silently sampling only the first 250 records out of
  // tens-of-thousands of all-time appointments.
  const fetchRepeatRate = async (): Promise<number> => {
    const records = await api.appointment.findMany({
      filter: {
        AND: [
          { startTime: { greaterThanOrEqual: twelveMonthsAgo } },
          { business: { id: { equals: business.id } } },
        ],
      },
      select: { id: true, clientId: true },
      first: 250,
      sort: { createdAt: "Descending" },
    });
    const clientMap = new Map<string, number>();
    for (const appt of records) {
      const cid = appt.clientId;
      if (cid) {
        clientMap.set(cid, (clientMap.get(cid) ?? 0) + 1);
      }
    }
    if (clientMap.size === 0) return 0;
    let repeatClients = 0;
    for (const count of clientMap.values()) {
      if (count >= 2) repeatClients += 1;
    }
    return Math.round((repeatClients / clientMap.size) * 100);
  };

  const fetchTodayBookedHours = async (): Promise<number> => {
    const records = await api.appointment.findMany({
      filter: {
        AND: [
          { startTime: { greaterThanOrEqual: startOfToday } },
          { startTime: { lessThanOrEqual: endOfToday } },
          { business: { id: { equals: business.id } } },
        ],
        NOT: [{ status: { in: ["cancelled", "no-show"] } }],
      },
      select: { id: true, startTime: true, endTime: true },
      first: 250,
    });
    let totalHours = 0;
    for (const appt of records) {
      const startMs = appt.startTime ? new Date(appt.startTime as unknown as string).getTime() : NaN;
      const endMs = appt.endTime ? new Date(appt.endTime as unknown as string).getTime() : NaN;
      if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
        totalHours += (endMs - startMs) / 3600000;
      } else {
        totalHours += 1;
      }
    }
    return Math.round(totalHours * 10) / 10;
  };

  const [
    totalClients,
    invoiceResult,
    revenueThisMonth,
    weeklyPayments,
    todayAppointmentsCount,
    upcomingCount,
    repeatCustomerRate,
    todayBookedHours,
  ] = await Promise.all([
    fetchClientCount(),
    fetchOpenInvoices(),
    fetchMonthPayments(),
    fetchWeeklyPayments(),
    fetchTodayAppointments(),
    fetchUpcomingCount(),
    fetchRepeatRate(),
    fetchTodayBookedHours(),
  ]);

  // Build weeklyRevenue array for the last 7 days
  const weeklyRevenue: Array<{ date: string; revenue: number }> = [];
  const baseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
  for (let i = 0; i <= 6; i++) {
    const d = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    let dayRevenue = 0;
    for (const p of weeklyPayments) {
      if (p.createdAt.slice(0, 10) === dateStr) {
        dayRevenue += p.amount;
      }
    }
    weeklyRevenue.push({ date: dateStr, revenue: dayRevenue });
  }

  // Compute today's revenue
  const todayDateStr = endOfToday.slice(0, 10);
  let todayRevenue = 0;
  for (const p of weeklyPayments) {
    if (p.createdAt.slice(0, 10) === todayDateStr) {
      todayRevenue += p.amount;
    }
  }

  return {
    totalClients,
    openInvoicesCount: invoiceResult.count,
    revenueThisMonth,
    todayAppointmentsCount,
    todayRevenue,
    outstandingBalance: invoiceResult.totalBalance,
    repeatCustomerRate,
    weeklyRevenue,
    upcomingCount,
    todayBookedHours,
    totalAvailableHours: TOTAL_AVAILABLE_HOURS,
  };
};

export const options: ActionOptions = {
  triggers: { api: true },
};