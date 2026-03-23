import { ActionOptions } from 'gadget-server';
import { weeklyReportEmail, formatCurrency } from '../lib/emailTemplates';

export const run: ActionRun = async ({ logger, api, emails, currentAppUrl }) => {
  // Step 1 — Compute report window
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const weekStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysToLastMonday - 7
  ));

  const weekEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysToLastMonday - 1,
    23, 59, 59, 999
  ));

  const nextWeekStart = new Date(now);
  const nextWeekEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 7,
    23, 59, 59, 999
  ));

  const fmtShort = (d: Date): string =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

  const fmtApptTime = (iso: string): string =>
    new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });

  // Step 2 — Load all businesses with owner email
  const businesses = await api.business.findMany({
    filter: { onboardingComplete: { equals: true } },
    select: {
      id: true,
      name: true,
      owner: { id: true, email: true, firstName: true },
    },
    first: 250,
  });

  if (businesses.hasNextPage) {
    logger.warn('More than 250 businesses found; only processing first 250 in weekly report');
  }

  let reportsSent = 0;
  let reportsSkipped = 0;
  let reportsErrored = 0;

  // Steps 3 & 4 — Per-business metrics and send email
  await Promise.all(businesses.map(async (business) => {
    try {
      if (!business.owner?.email) {
        logger.warn({ businessId: business.id }, 'No owner email found for business, skipping weekly report');
        reportsSkipped++;
        return;
      }

      if (!business.owner?.id) {
        logger.warn({ businessId: business.id }, 'No owner ID found for business, skipping weekly report');
        reportsSkipped++;
        return;
      }

      const ownerEmail = business.owner.email;
      const ownerId = business.owner.id;

      const [payments, completedAppointments, newClientRecords, unpaidInvoiceRecords, upcomingAppts] = await Promise.all([
        // a) weeklyRevenue — payments paid during the report week
        api.payment.findMany({
          filter: {
            AND: [
              { paidAt: { greaterThanOrEqual: weekStart.toISOString() } },
              { paidAt: { lessThanOrEqual: weekEnd.toISOString() } },
              { businessId: { equals: business.id } },
            ],
          },
          select: { id: true, amount: true },
          first: 250,
        }),

        // b) appointmentsCompleted — appointments completed during the report week
        api.appointment.findMany({
          filter: {
            AND: [
              { status: { equals: 'completed' } },
              { completedAt: { greaterThanOrEqual: weekStart.toISOString() } },
              { completedAt: { lessThanOrEqual: weekEnd.toISOString() } },
              { businessId: { equals: business.id } },
            ],
          },
          select: { id: true },
          first: 250,
        }),

        // c) newClients — clients created during the report week
        api.client.findMany({
          filter: {
            AND: [
              { createdAt: { greaterThanOrEqual: weekStart.toISOString() } },
              { createdAt: { lessThanOrEqual: weekEnd.toISOString() } },
              { businessId: { equals: business.id } },
            ],
          },
          select: { id: true },
          first: 250,
        }),

        // d) unpaidInvoices — invoices with status sent or partial
        api.invoice.findMany({
          filter: {
            AND: [
              { status: { in: ['sent', 'partial'] } },
              { businessId: { equals: business.id } },
            ],
          },
          select: { id: true, total: true },
          first: 250,
        }),

        // e) upcomingAppointments — next 7 days
        api.appointment.findMany({
          filter: {
            AND: [
              { startTime: { greaterThanOrEqual: nextWeekStart.toISOString() } },
              { startTime: { lessThanOrEqual: nextWeekEnd.toISOString() } },
              { status: { in: ['scheduled', 'confirmed'] } },
              { businessId: { equals: business.id } },
            ],
          },
          select: {
            id: true,
            startTime: true,
            client: { firstName: true, lastName: true },
            appointmentServices: {
              edges: {
                node: {
                  service: { name: true },
                },
              },
            },
          },
          sort: { startTime: 'Ascending' },
          first: 10,
        }),
      ]);

      // Compute metrics
      const weeklyRevenue = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
      const appointmentsCompleted = completedAppointments.length;
      const newClients = newClientRecords.length;
      const unpaidInvoicesCount = unpaidInvoiceRecords.length;
      const unpaidInvoicesTotal = unpaidInvoiceRecords.reduce((sum, inv) => sum + (inv.total ?? 0), 0);
      const avgTicketValue = appointmentsCompleted > 0
        ? Math.round((weeklyRevenue / appointmentsCompleted) * 100) / 100
        : 0;

      // Format upcoming appointments
      const formattedUpcoming = upcomingAppts.map((appt) => {
        const clientName =
          [appt.client?.firstName, appt.client?.lastName].filter(Boolean).join(' ') || 'Unknown Client';
        const startTimeStr = appt.startTime
          ? fmtApptTime(appt.startTime as unknown as string)
          : 'TBD';
        const edges = (appt.appointmentServices as any)?.edges ?? [];
        const serviceNames: string[] = edges
          .map((e: any) => e?.node?.service?.name)
          .filter(Boolean);
        let serviceSummary: string;
        if (serviceNames.length === 0) {
          serviceSummary = 'Appointment';
        } else if (serviceNames.length === 1) {
          serviceSummary = serviceNames[0];
        } else {
          serviceSummary = `${serviceNames[0]} + ${serviceNames.length - 1} more`;
        }
        return { clientName, startTimeStr, serviceSummary };
      });

      // Render and send
      const ownerFirstName = business.owner?.firstName || 'there';
      const html = weeklyReportEmail({
        businessName: business.name,
        ownerFirstName,
        weekStart: fmtShort(weekStart),
        weekEnd: fmtShort(weekEnd),
        weeklyRevenue,
        appointmentsCompleted,
        newClients,
        avgTicketValue,
        unpaidInvoicesCount,
        unpaidInvoicesTotal,
        upcomingAppointments: formattedUpcoming,
        appUrl: currentAppUrl,
      });

      await emails.sendMail({
        to: ownerEmail,
        subject: `Weekly Report: ${business.name} — ${fmtShort(weekStart)} to ${fmtShort(weekEnd)}`,
        html,
      });

      logger.info({ businessId: business.id, ownerEmail }, 'Weekly report sent');
      reportsSent++;
    } catch (error) {
      logger.error({ businessId: business.id, error }, 'Failed to send weekly report');
      reportsErrored++;
    }
  }));

  // Step 5 — Return
  return {
    reportsSent,
    reportsSkipped,
    reportsErrored,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };
};

export const options: ActionOptions = {
  triggers: { api: true, scheduler: [{ cron: '0 8 * * 1' }] },
};