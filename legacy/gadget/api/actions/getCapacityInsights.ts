import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, connections }) => {
  // 1. Calculate week boundaries
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + daysToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  // 2. Fetch this week's appointments
  const appointments = await api.appointment.findMany({
    filter: {
      AND: [
        { startTime: { greaterThanOrEqual: weekStart.toISOString() } },
        { startTime: { lessThanOrEqual: weekEnd.toISOString() } },
        { status: { notEquals: "cancelled" } },
      ],
    },
    select: { id: true, startTime: true, endTime: true, status: true },
    first: 250,
  });

  // 3. Lapsed clients count — lastVisit field does not exist on client model; skip the query
  const lapsedClients: { id: string }[] = [];

  // 4. Fetch count of lost quotes
  let lostQuotes: { id: string }[] = [];
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    lostQuotes = await api.quote.findMany({
      filter: {
        AND: [
          { status: { in: ["draft", "sent"] } },
          { followUpSentAt: { isSet: false } },
          { createdAt: { lessThan: threeDaysAgo.toISOString() } },
        ],
      },
      select: { id: true },
      first: 250,
    });
  } catch {
    lostQuotes = [];
  }

  // 5. Calculate capacity
  const WORKING_HOURS_PER_DAY = 8;
  const WORKING_DAYS = 5;
  const totalAvailableMinutes = WORKING_HOURS_PER_DAY * 60 * WORKING_DAYS; // 2400

  let bookedMinutes = 0;
  for (const appointment of appointments) {
    let duration: number;
    if (appointment.endTime && appointment.startTime) {
      const startMs = new Date(appointment.startTime).getTime();
      const endMs = new Date(appointment.endTime).getTime();
      duration = (endMs - startMs) / 60000;
    } else {
      duration = 60;
    }
    bookedMinutes += duration;
  }

  const utilizationPct = Math.min(100, Math.round((bookedMinutes / totalAvailableMinutes) * 100));
  const openSlots = Math.max(0, Math.floor((totalAvailableMinutes - bookedMinutes) / 60));

  // 6. Build recommendations
  const recommendations: {
    id: string;
    priority: "high" | "medium" | "low";
    icon: string;
    title: string;
    description: string;
    actionLabel: string;
    actionHref: string;
  }[] = [];

  if (utilizationPct < 50) {
    recommendations.push({
      id: "low-utilization",
      priority: "high",
      icon: "calendar",
      title: "Week is under 50% booked",
      description: `You have ~${openSlots} open hours this week. Consider reaching out to clients to fill the schedule.`,
      actionLabel: "View Calendar",
      actionHref: "/calendar",
    });
  }

  if (lapsedClients.length > 0) {
    recommendations.push({
      id: "lapsed-clients",
      priority: lapsedClients.length > 5 ? "high" : "medium",
      icon: "users",
      title: `${lapsedClients.length} lapsed client${lapsedClients.length === 1 ? "" : "s"} to re-engage`,
      description: "Clients who haven't visited in 90+ days. A quick follow-up email could bring them back.",
      actionLabel: "View Lapsed Clients",
      actionHref: "/lapsed-clients",
    });
  }

  if (lostQuotes.length > 0) {
    recommendations.push({
      id: "lost-quotes",
      priority: "medium",
      icon: "receipt",
      title: `${lostQuotes.length} quote${lostQuotes.length === 1 ? "" : "s"} need follow-up`,
      description: "Open quotes older than 3 days with no follow-up sent. A nudge could convert them to jobs.",
      actionLabel: "View Lost Quotes",
      actionHref: "/quotes?tab=lost",
    });
  }

  if (utilizationPct >= 80) {
    recommendations.push({
      id: "high-utilization",
      priority: "low",
      icon: "trending-up",
      title: "Strong week ahead!",
      description: `Your schedule is ${utilizationPct}% booked this week. Great job keeping the calendar full.`,
      actionLabel: "View Calendar",
      actionHref: "/calendar",
    });
  }

  // 7. Return insights
  return {
    utilizationPct,
    bookedMinutes,
    totalAvailableMinutes,
    openSlots,
    appointmentCount: appointments.length,
    lapsedClientCount: lapsedClients.length,
    lostQuoteCount: lostQuotes.length,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    recommendations,
  };
};

export const options: ActionOptions = {
  triggers: { api: true },
};
