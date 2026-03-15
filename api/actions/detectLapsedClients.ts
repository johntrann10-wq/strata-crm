import { ActionOptions } from "gadget-server";

const CATEGORY_DEFAULT_DAYS: Record<string, number> = {
  "detailing": 60,
  "maintenance": 60,
  "ceramic-coating": 365,
  "ppf": 365,
  "tinting": 730,
  "wrap": 365,
  "paint-correction": 180,
  "tires": 90,
  "alignment": 120,
  "oil-change": 90,
  "glass": 365,
  "body-repair": 365,
  "other": 90,
};

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const run: ActionRun = async ({ params, logger, api }) => {
  const businessId = params.businessId as string | undefined;

  if (!businessId) {
    return {
      lapsedClients: [],
      totalRevenueAtRisk: 0,
      summary: { critical: 0, high: 0, medium: 0 },
    };
  }

  // Step 3: Load all completed appointments with cursor pagination (cap 5000)
  const MAX_RECORDS = 5000;
  const allAppointments: any[] = [];
  let cursor: string | null = null;

  let page: any;

  do {
    page = await api.appointment.findMany({
      filter: {
        AND: [
          { businessId: { equals: businessId } },
          { status: { equals: "completed" } },
        ],
      },
      select: {
        id: true,
        startTime: true,
        completedAt: true,
        totalPrice: true,
        clientId: true,
        client: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          marketingOptIn: true,
        },
        appointmentServices: {
          edges: {
            node: {
              service: { category: true },
            },
          },
        },
      },
      sort: { startTime: "Ascending" },
      first: 250,
      after: cursor ?? undefined,
    });

    allAppointments.push(...page);

    if (page.hasNextPage && allAppointments.length < MAX_RECORDS) {
      cursor = page.endCursor;
    } else {
      cursor = null;
    }
  } while (cursor !== null);

  // Step 4: Group appointments by clientId (already sorted ascending by startTime)
  const clientAppointmentsMap = new Map<string, any[]>();
  for (const appt of allAppointments) {
    if (!appt.clientId) continue;
    if (!clientAppointmentsMap.has(appt.clientId)) {
      clientAppointmentsMap.set(appt.clientId, []);
    }
    clientAppointmentsMap.get(appt.clientId)!.push(appt);
  }

  // Step 5: Load upcoming appointments to exclude already-booked clients
  const MAX_UPCOMING = 2000;
  const allUpcomingClientIds: string[] = [];
  let upcomingCursor: string | null = null;
  let upcomingFetchedCount = 0;

  let upcomingPage: any;
  do {
    upcomingPage = await api.appointment.findMany({
      filter: {
        AND: [
          { businessId: { equals: businessId } },
          { status: { in: ["scheduled", "confirmed", "in_progress"] } },
          { startTime: { greaterThanOrEqual: new Date().toISOString() } },
        ],
      },
      select: { clientId: true },
      first: 250,
      after: upcomingCursor ?? undefined,
    });

    upcomingFetchedCount += upcomingPage.length;
    for (const a of upcomingPage) {
      if (a.clientId) allUpcomingClientIds.push(a.clientId as string);
    }

    if (upcomingPage.hasNextPage && upcomingFetchedCount < MAX_UPCOMING) {
      upcomingCursor = upcomingPage.endCursor;
    } else {
      upcomingCursor = null;
    }
  } while (upcomingCursor !== null);

  const clientsWithUpcomingAppointments = new Set<string>(allUpcomingClientIds);

  // Step 6: Load recent maintenance reminders (last 30 days) to prevent double-emailing
  const MAX_REMINDERS = 2000;
  const allRecentContactedIds: string[] = [];
  let remindersCursor: string | null = null;
  let remindersFetchedCount = 0;

  let remindersPage: any;
  do {
    remindersPage = await api.maintenanceReminder.findMany({
      filter: {
        AND: [
          { businessId: { equals: businessId } },
          { type: { equals: "custom" } },
          {
            createdAt: {
              greaterThanOrEqual: new Date(
                Date.now() - 30 * 86400 * 1000
              ).toISOString(),
            },
          },
        ],
      },
      select: { clientId: true, sent: true },
      first: 250,
      after: remindersCursor ?? undefined,
    });

    remindersFetchedCount += remindersPage.length;
    for (const r of remindersPage) {
      if (r.sent && r.clientId) allRecentContactedIds.push(r.clientId as string);
    }

    if (remindersPage.hasNextPage && remindersFetchedCount < MAX_REMINDERS) {
      remindersCursor = remindersPage.endCursor;
    } else {
      remindersCursor = null;
    }
  } while (remindersCursor !== null);

  const recentlyContactedClientIds = new Set<string>(allRecentContactedIds);

  // Step 7: Compute lapse analysis for each client
  interface LapsedClient {
    clientId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    marketingOptIn: boolean | null;
    daysSinceLast: number;
    expectedIntervalDays: number;
    overdueRatio: number;
    lastVisitDate: string;
    lastServiceLabel: string;
    totalRevenue: number;
    avgJobValue: number;
    revenueAtRisk: number;
    urgency: string;
    recentlyContacted: boolean;
    appointmentCount: number;
  }

  const lapsedList: LapsedClient[] = [];

  for (const [clientId, appts] of clientAppointmentsMap) {
    if (clientsWithUpcomingAppointments.has(clientId)) continue;

    const clientInfo = appts[0]?.client;
    if (!clientInfo) continue;

    // Compute personal interval from gap medians
    let personalIntervalDays: number | null = null;
    if (appts.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < appts.length; i++) {
        const prev = new Date(appts[i - 1].startTime as unknown as string).getTime();
        const curr = new Date(appts[i].startTime as unknown as string).getTime();
        gaps.push((curr - prev) / 86400000);
      }
      personalIntervalDays = computeMedian(gaps);
    }

    // Compute category default interval (minimum across all unique categories)
    const allCategories: string[] = [];
    for (const appt of appts) {
      for (const edge of (appt.appointmentServices?.edges ?? [])) {
        const category = edge?.node?.service?.category;
        if (category) allCategories.push(category);
      }
    }
    const uniqueCategories = [...new Set(allCategories)];
    const categoryDays = uniqueCategories
      .map((c) => CATEGORY_DEFAULT_DAYS[c])
      .filter((d): d is number => d !== undefined);
    const categoryIntervalDays = categoryDays.length > 0 ? Math.min(...categoryDays) : null;

    const expectedIntervalDays = personalIntervalDays ?? categoryIntervalDays ?? 90;

    const lastAppt = appts[appts.length - 1];
    const lastVisitDate = new Date(lastAppt.startTime as unknown as string);
    const daysSinceLast = (Date.now() - lastVisitDate.getTime()) / 86400000;
    const overdueRatio = daysSinceLast / expectedIntervalDays;

    if (overdueRatio < 1.5) continue;

    const totalRevenue = appts.reduce((s: number, a: any) => s + (a.totalPrice ?? 0), 0);
    const avgJobValue = totalRevenue / appts.length;
    const revenueAtRisk = avgJobValue;

    let urgency: string;
    if (overdueRatio >= 3) {
      urgency = "critical";
    } else if (overdueRatio >= 2) {
      urgency = "high";
    } else {
      urgency = "medium";
    }

    const lastCategories = (lastAppt.appointmentServices?.edges ?? [])
      .map((e: any) => e?.node?.service?.category)
      .filter((c: any): c is string => Boolean(c));
    const lastServiceLabel = lastCategories.length > 0 ? lastCategories.join(", ") : "Service";

    const recentlyContacted = recentlyContactedClientIds.has(clientId);

    lapsedList.push({
      clientId,
      firstName: clientInfo.firstName,
      lastName: clientInfo.lastName,
      email: clientInfo.email ?? null,
      phone: clientInfo.phone ?? null,
      marketingOptIn: clientInfo.marketingOptIn ?? null,
      daysSinceLast: Math.round(daysSinceLast),
      expectedIntervalDays: Math.round(expectedIntervalDays),
      overdueRatio: parseFloat(overdueRatio.toFixed(2)),
      lastVisitDate: lastVisitDate.toISOString(),
      lastServiceLabel,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      avgJobValue: parseFloat(avgJobValue.toFixed(2)),
      revenueAtRisk: parseFloat(revenueAtRisk.toFixed(2)),
      urgency,
      recentlyContacted,
      appointmentCount: appts.length,
    });
  }

  const urgencyPriority: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  lapsedList.sort((a, b) => {
    const pa = urgencyPriority[a.urgency] ?? 3;
    const pb = urgencyPriority[b.urgency] ?? 3;
    if (pa !== pb) return pa - pb;
    return b.revenueAtRisk - a.revenueAtRisk;
  });

  const totalRevenueAtRisk = lapsedList.reduce((s, c) => s + c.revenueAtRisk, 0);

  return {
    lapsedClients: lapsedList,
    totalRevenueAtRisk: parseFloat(totalRevenueAtRisk.toFixed(2)),
    summary: {
      critical: lapsedList.filter((c) => c.urgency === "critical").length,
      high: lapsedList.filter((c) => c.urgency === "high").length,
      medium: lapsedList.filter((c) => c.urgency === "medium").length,
    },
  };
};

export const params = {
  businessId: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true, scheduler: [{ cron: "0 7 * * *" }] },
};