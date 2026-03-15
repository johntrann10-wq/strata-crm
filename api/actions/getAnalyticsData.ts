import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const userId = session?.get("user") as string | undefined;

  const emptyResult = {
    repeatCustomerRate: 0,
    avgTicketValue: 0,
    completedThisMonth: 0,
    totalRevenueAllTime: 0,
    totalClients: 0,
    totalCompletedJobs: 0,
    revenueByMonth: [] as { label: string; revenue: number }[],
    appointmentsByStatus: [] as { status: string; count: number }[],
    topServices: [] as { name: string; count: number; revenue: number }[],
  };

  if (!userId) return emptyResult;

  const business = await api.business.maybeFindFirst({
    filter: { ownerId: { equals: userId } },
    select: { id: true },
  });

  if (!business) return emptyResult;

  const now = new Date();
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const monthBuckets: { start: Date; end: Date; label: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i + 1, 1) - 1);
    const label = start.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    monthBuckets.push({ start, end, label });
  }

  // Paginate up to 2000 completed appointments for accurate all-time metrics
  const completedAppointments: { id: string; startTime: string | null; totalPrice: number | null; clientId: string | null }[] = [];
  let caPage = await api.appointment.findMany({
    filter: {
      AND: [
        { businessId: { equals: business.id } },
        { status: { equals: "completed" } },
      ],
    },
    select: { id: true, startTime: true, totalPrice: true, clientId: true },
    first: 250,
  });
  completedAppointments.push(...(caPage as any[]));
  while (caPage.hasNextPage && completedAppointments.length < 2000) {
    caPage = await caPage.nextPage();
    completedAppointments.push(...(caPage as any[]));
  }

  // Run the remaining four fetches concurrently, each with their own pagination
  const [allClients, payments, allAppointments, appointmentServices] = await Promise.all([
    // allClients: paginate up to 500 for accurate count
    (async () => {
      const clients: { id: string }[] = [];
      const page1 = await api.client.findMany({
        filter: { businessId: { equals: business.id } },
        select: { id: true },
        first: 250,
      });
      clients.push(...page1);
      if (page1.hasNextPage && clients.length < 500) {
        const page2 = await page1.nextPage();
        clients.push(...page2);
      }
      return clients;
    })(),

    // payments: single fetch (6-month window, 250 cap is acceptable for revenue chart)
    api.payment.findMany({
      filter: {
        AND: [
          { businessId: { equals: business.id } },
          { createdAt: { greaterThanOrEqual: sixMonthsAgo.toISOString() } },
        ],
      },
      select: { id: true, amount: true, createdAt: true },
      first: 250,
    }),

    // allAppointments: paginate up to 1000 for accurate status breakdown
    (async () => {
      const appts: { id: string; status: string | null }[] = [];
      let page = await api.appointment.findMany({
        filter: { businessId: { equals: business.id } },
        select: { id: true, status: true },
        first: 250,
      });
      appts.push(...page);
      while (page.hasNextPage && appts.length < 1000) {
        page = await page.nextPage();
        appts.push(...page);
      }
      return appts;
    })(),

    // appointmentServices: paginate up to 500 for accurate top services
    (async () => {
      try {
        const services: { id: string; price: number | null; service: { id: string; name: string } | null }[] = [];
        const page1 = await api.appointmentService.findMany({
          filter: { appointment: { business: { id: { equals: business.id } } } } as any,
          select: { id: true, price: true, service: { id: true, name: true } },
          first: 250,
        });
        services.push(...page1);
        if (page1.hasNextPage && services.length < 500) {
          const page2 = await page1.nextPage();
          services.push(...(page2 as typeof services));
        }
        return services;
      } catch (_e) {
        return [] as { id: string; price: number | null; service: { id: string; name: string } | null }[];
      }
    })(),
  ]);

  // Compute metrics
  const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // repeatCustomerRate
  const clientVisitMap = new Map<string, number>();
  for (const appt of completedAppointments) {
    if (appt.clientId) {
      clientVisitMap.set(appt.clientId, (clientVisitMap.get(appt.clientId) ?? 0) + 1);
    }
  }
  const repeatCount = [...clientVisitMap.values()].filter((v) => v >= 2).length;
  const repeatCustomerRate =
    allClients.length > 0 ? Math.round((repeatCount / allClients.length) * 100 * 10) / 10 : 0;

  // avgTicketValue
  const avgTicketValue =
    completedAppointments.length > 0
      ? Math.round(
          (completedAppointments.reduce((s, a) => s + (a.totalPrice ?? 0), 0) /
            completedAppointments.length) *
            100
        ) / 100
      : 0;

  // completedThisMonth
  const completedThisMonth = completedAppointments.filter(
    (a) => a.startTime && new Date(a.startTime) >= startOfThisMonth
  ).length;

  // totalRevenueAllTime
  const totalRevenueAllTime = completedAppointments.reduce((s, a) => s + (a.totalPrice ?? 0), 0);

  // totalClients
  const totalClients = allClients.length;

  // totalCompletedJobs
  const totalCompletedJobs = completedAppointments.length;

  // revenueByMonth
  const revenueByMonth = monthBuckets.map((b) => ({
    label: b.label,
    revenue: payments
      .filter((p) => new Date(p.createdAt) >= b.start && new Date(p.createdAt) <= b.end)
      .reduce((s, p) => s + (p.amount ?? 0), 0),
  }));

  // appointmentsByStatus
  const statusMap = new Map<string, number>();
  for (const appt of allAppointments) {
    if (appt.status) {
      statusMap.set(appt.status, (statusMap.get(appt.status) ?? 0) + 1);
    }
  }
  const appointmentsByStatus = [...statusMap.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // topServices
  const serviceMap = new Map<string, { name: string; count: number; revenue: number }>();
  for (const as of appointmentServices) {
    if (as.service?.id) {
      const existing = serviceMap.get(as.service.id);
      if (existing) {
        existing.count += 1;
        existing.revenue += as.price ?? 0;
      } else {
        serviceMap.set(as.service.id, {
          name: as.service.name ?? "",
          count: 1,
          revenue: as.price ?? 0,
        });
      }
    }
  }
  const topServices = [...serviceMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    repeatCustomerRate,
    avgTicketValue,
    completedThisMonth,
    totalRevenueAllTime,
    totalClients,
    totalCompletedJobs,
    revenueByMonth,
    appointmentsByStatus,
    topServices,
  };
};

export const options: ActionOptions = {
  triggers: { api: true },
};
