import { ActionOptions } from "gadget-server";
import { esc } from "../lib/escapeHtml";

export const run: ActionRun = async ({ logger, api }) => {
  const now = new Date();

  const rules = await api.automationRule.findMany({
    filter: { enabled: { equals: true } },
    select: {
      id: true,
      triggerType: true,
      delayHours: true,
      customMessage: true,
      businessId: true,
    },
    first: 250,
  });

  const businessIds = [...new Set(rules.map((r) => r.businessId).filter(Boolean))] as string[];
  const businessMap = new Map<
    string,
    {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      timezone: string | null;
      googleReviewLink: string | null;
      yelpReviewLink: string | null;
      facebookReviewLink: string | null;
      website: string | null;
    }
  >();

  if (businessIds.length > 0) {
    const businesses = await api.business.findMany({
      filter: { id: { in: businessIds } },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        timezone: true,
        googleReviewLink: true,
        yelpReviewLink: true,
        facebookReviewLink: true,
        website: true,
      },
      first: 250,
    });
    for (const biz of businesses) {
      businessMap.set(biz.id, biz);
    }
  }

  let rulesProcessed = 0;
  let totalSent = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const rule of rules) {
    rulesProcessed++;
    const business = businessMap.get(rule.businessId as string);
    const businessName = esc(business?.name ?? "Your provider");

    try {
      if (rule.triggerType === "appointment-reminder") {
        const hoursAhead = (rule.delayHours ?? 0) > 0 ? rule.delayHours! : 24;
        const windowStart = new Date(now.getTime() + (hoursAhead - 1) * 3600000);
        const windowEnd = new Date(now.getTime() + (hoursAhead + 1) * 3600000);

        const appointments = await api.appointment.findMany({
          filter: {
            AND: [
              { businessId: { equals: rule.businessId as string } },
              { startTime: { greaterThanOrEqual: windowStart.toISOString() } },
              { startTime: { lessThanOrEqual: windowEnd.toISOString() } },
              { status: { in: ["confirmed", "scheduled"] } },
              { reminderSent: { equals: false } },
            ],
          },
          select: {
            id: true,
            startTime: true,
            client: { id: true, firstName: true, email: true },
          },
          first: 50,
        });

        for (const appointment of appointments) {
          if (!appointment.client?.email) {
            await api.automationLog.create({
              triggerType: "appointment-reminder",
              status: "skipped",
              recipientName: appointment.client?.firstName ?? "Unknown",
              reason: "No email on file",
              relatedRecordId: appointment.id,
              rule: { _link: rule.id },
              business: { _link: rule.businessId as string },
            });
            totalSkipped++;
          } else {
            const freshAppt = await api.appointment.findOne(appointment.id, { select: { reminderSent: true } });
            if (freshAppt.reminderSent) {
              totalSkipped++;
              continue;
            }

            const appointmentDate = appointment.startTime ? new Date(appointment.startTime) : null;
            const dateStr = appointmentDate
              ? appointmentDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "your scheduled time";
            const timeStr = appointmentDate
              ? appointmentDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
              : "";
            const clientFirstName = esc(appointment.client.firstName ?? "");

            try {
              const notifResult = await api.sendNotification({
                type: "appointment_reminder",
                recipientEmail: appointment.client.email,
                subject: `Reminder: Your appointment — ${business?.name ?? "Your provider"}`,
                html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background-color:#111827;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:24px;">${businessName}</h1>
  </div>
  <div style="background-color:#ffffff;padding:32px;">
    <h2 style="color:#111827;margin-top:0;">Appointment Reminder</h2>
    <p style="color:#374151;font-size:16px;">Hi ${clientFirstName},</p>
    <p style="color:#374151;font-size:16px;">This is a friendly reminder about your upcoming appointment on <strong>${esc(dateStr)}</strong>${timeStr ? ` at <strong>${esc(timeStr)}</strong>` : ""}.</p>
    <p style="color:#374151;font-size:16px;">We look forward to seeing you soon!</p>
    ${business?.phone ? `<p style="color:#374151;font-size:14px;">Questions? Call us at ${esc(business.phone)}</p>` : ""}
  </div>
  <div style="background-color:#f3f4f6;padding:16px;text-align:center;">
    <p style="color:#6b7280;font-size:12px;margin:0;">&copy; ${now.getFullYear()} ${businessName}. All rights reserved.</p>
  </div>
</div>`,
                businessId: rule.businessId as string,
                clientId: appointment.client.id,
                relatedModel: "appointment",
                relatedId: appointment.id,
              });
              if (notifResult.success === true) {
                await api.internal.appointment.update(appointment.id, { reminderSent: true });
              }
              await api.automationLog.create({
                triggerType: "appointment-reminder",
                status: "sent",
                recipientName: appointment.client.firstName ?? "Unknown",
                recipientEmail: appointment.client.email,
                relatedRecordId: appointment.id,
                rule: { _link: rule.id },
                business: { _link: rule.businessId as string },
              });
              totalSent++;
            } catch (sendError) {
              logger.warn({ sendError, appointmentId: appointment.id }, "Failed to send appointment reminder");
              await api.automationLog.create({
                triggerType: "appointment-reminder",
                status: "failed",
                recipientName: appointment.client.firstName ?? "Unknown",
                recipientEmail: appointment.client.email,
                relatedRecordId: appointment.id,
                rule: { _link: rule.id },
                business: { _link: rule.businessId as string },
              });
              totalFailed++;
            }
          }
        }
      } else if (rule.triggerType === "job-completed") {
        const delayMs = ((rule.delayHours ?? 0) > 0 ? rule.delayHours! : 2) * 3600000;
        const cutoff = new Date(now.getTime() - delayMs);

        const appointments = await api.appointment.findMany({
          filter: {
            AND: [
              { businessId: { equals: rule.businessId as string } },
              { status: { equals: "completed" } },
              { reviewRequestSent: { equals: false } },
              { completedAt: { lessThanOrEqual: cutoff.toISOString() } },
            ],
          },
          select: {
            id: true,
            completedAt: true,
            client: { id: true, firstName: true, email: true, marketingOptIn: true },
          },
          first: 50,
        });

        for (const appointment of appointments) {
          if (!appointment.client?.email) {
            await api.automationLog.create({
              triggerType: "job-completed",
              status: "skipped",
              recipientName: appointment.client?.firstName ?? "Unknown",
              reason: "No email on file",
              relatedRecordId: appointment.id,
              rule: { _link: rule.id },
              business: { _link: rule.businessId as string },
            });
            totalSkipped++;
            continue;
          }

          if (appointment.client?.marketingOptIn === false) {
            await api.automationLog.create({
              triggerType: "job-completed",
              status: "skipped",
              recipientName: appointment.client?.firstName ?? "Unknown",
              reason: "Client opted out of marketing",
              relatedRecordId: appointment.id,
              rule: { _link: rule.id },
              business: { _link: rule.businessId as string },
            });
            totalSkipped++;
            continue;
          }

          const freshAppointment = await api.appointment.findOne(appointment.id, {
            select: { reviewRequestSent: true },
          });
          if (freshAppointment.reviewRequestSent) {
            totalSkipped++;
            continue;
          }

          const clientFirstName = esc(appointment.client.firstName ?? "");
          const reviewLinksHtml = [
            business?.googleReviewLink
              ? `<a href="${esc(business.googleReviewLink)}" style="display:inline-block;background-color:#4285F4;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;margin:4px;">&#11088; Google Review</a>`
              : "",
            business?.yelpReviewLink
              ? `<a href="${esc(business.yelpReviewLink)}" style="display:inline-block;background-color:#D32323;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;margin:4px;">Yelp Review</a>`
              : "",
            business?.facebookReviewLink
              ? `<a href="${esc(business.facebookReviewLink)}" style="display:inline-block;background-color:#1877F2;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;margin:4px;">Facebook Review</a>`
              : "",
          ]
            .filter(Boolean)
            .join("\n");

          try {
            const reviewNotifResult = await api.sendNotification({
              type: "review_request",
              recipientEmail: appointment.client.email,
              subject: `How was your experience with ${business?.name ?? "Your provider"}? ⭐`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background-color:#111827;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:24px;">${businessName}</h1>
  </div>
  <div style="background-color:#ffffff;padding:32px;">
    <h2 style="color:#111827;margin-top:0;">How did we do?</h2>
    <p style="color:#374151;font-size:16px;">Hi ${clientFirstName},</p>
    <p style="color:#374151;font-size:16px;">Thank you for choosing ${businessName}! We hope you're happy with the work we completed. Your feedback means the world to us.</p>
    ${rule.customMessage ? `<p style="color:#374151;font-size:16px;">${esc(rule.customMessage)}</p>` : ""}
    ${reviewLinksHtml ? `<div style="text-align:center;margin:24px 0;">${reviewLinksHtml}</div>` : ""}
    <p style="color:#374151;font-size:14px;">Thank you for your business!</p>
  </div>
  <div style="background-color:#f3f4f6;padding:16px;text-align:center;">
    <p style="color:#6b7280;font-size:12px;margin:0;">&copy; ${now.getFullYear()} ${businessName}. All rights reserved.</p>
  </div>
</div>`,
              businessId: rule.businessId as string,
              clientId: appointment.client.id,
              relatedModel: "appointment",
              relatedId: appointment.id,
            });
            if (reviewNotifResult.success === true) {
              await api.internal.appointment.update(appointment.id, { reviewRequestSent: true });
              await api.automationLog.create({
                triggerType: "job-completed",
                status: "sent",
                recipientName: appointment.client.firstName ?? "Unknown",
                recipientEmail: appointment.client.email,
                relatedRecordId: appointment.id,
                rule: { _link: rule.id },
                business: { _link: rule.businessId as string },
              });
              totalSent++;
            } else {
              logger.warn({ appointmentId: appointment.id }, "Review request send returned non-success; flag NOT stamped, will retry next run");
              await api.automationLog.create({
                triggerType: "job-completed",
                status: "failed",
                recipientName: appointment.client.firstName ?? "Unknown",
                recipientEmail: appointment.client.email,
                relatedRecordId: appointment.id,
                rule: { _link: rule.id },
                business: { _link: rule.businessId as string },
              });
              totalFailed++;
            }
          } catch (sendError) {
            logger.warn({ sendError, appointmentId: appointment.id }, "Failed to send job-completed review request");
            await api.automationLog.create({
              triggerType: "job-completed",
              status: "failed",
              recipientName: appointment.client.firstName ?? "Unknown",
              recipientEmail: appointment.client.email,
              relatedRecordId: appointment.id,
              rule: { _link: rule.id },
              business: { _link: rule.businessId as string },
            });
            totalFailed++;
          }
        }
      } else if (rule.triggerType === "invoice-unpaid") {
        const delayMs = ((rule.delayHours ?? 0) > 0 ? rule.delayHours! : 72) * 3600000;
        const cutoff = new Date(now.getTime() - delayMs);

        const invoices = await api.invoice.findMany({
          filter: {
            AND: [
              { businessId: { equals: rule.businessId as string } },
              { status: { in: ["sent", "partial"] } },
              {
                OR: [
                  { dueDate: { lessThanOrEqual: cutoff.toISOString() } },
                  {
                    AND: [
                      { dueDate: { isSet: false } },
                      { createdAt: { lessThanOrEqual: cutoff.toISOString() } },
                    ],
                  },
                ],
              },
            ],
          },
          select: {
            id: true,
            total: true,
            dueDate: true,
            client: { id: true, firstName: true, email: true },
          },
          first: 50,
        });

        for (const invoice of invoices) {
          if (!invoice.client?.email) {
            await api.automationLog.create({
              triggerType: "invoice-unpaid",
              status: "skipped",
              recipientName: invoice.client?.firstName ?? "Unknown",
              reason: "No email on file",
              relatedRecordId: invoice.id,
              rule: { _link: rule.id },
              business: { _link: rule.businessId as string },
            });
            totalSkipped++;
            continue;
          }

          const recentLog = await api.automationLog.maybeFindFirst({
            filter: {
              AND: [
                { triggerType: { equals: "invoice-unpaid" } },
                { relatedRecordId: { equals: invoice.id } },
                { status: { equals: "sent" } },
                { createdAt: { greaterThan: new Date(now.getTime() - 7 * 86400000).toISOString() } },
              ],
            },
            select: { id: true },
          });

          if (recentLog) {
            totalSkipped++;
            continue;
          }

          const clientFirstName = esc(invoice.client.firstName ?? "");
          const dueDateStr = invoice.dueDate
            ? new Date(invoice.dueDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "the due date";
          const totalStr = invoice.total != null ? `$${invoice.total.toFixed(2)}` : "an outstanding amount";

          try {
            await api.sendNotification({
              type: "invoice_reminder",
              recipientEmail: invoice.client.email,
              subject: `Payment reminder: Invoice from ${business?.name ?? "Your provider"}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background-color:#111827;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:24px;">${businessName}</h1>
  </div>
  <div style="background-color:#ffffff;padding:32px;">
    <h2 style="color:#111827;margin-top:0;">Payment Reminder</h2>
    <p style="color:#374151;font-size:16px;">Hi ${clientFirstName},</p>
    <p style="color:#374151;font-size:16px;">This is a friendly reminder that you have an outstanding invoice of <strong>${esc(totalStr)}</strong> that was due on <strong>${esc(dueDateStr)}</strong>.</p>
    ${rule.customMessage ? `<p style="color:#374151;font-size:16px;">${esc(rule.customMessage)}</p>` : ""}
    <p style="color:#374151;font-size:16px;">Please arrange payment at your earliest convenience. Thank you!</p>
    ${business?.phone ? `<p style="color:#374151;font-size:14px;">Questions? Call us at ${esc(business.phone)}</p>` : ""}
    ${business?.email ? `<p style="color:#374151;font-size:14px;">Or email us at ${esc(business.email)}</p>` : ""}
  </div>
  <div style="background-color:#f3f4f6;padding:16px;text-align:center;">
    <p style="color:#6b7280;font-size:12px;margin:0;">&copy; ${now.getFullYear()} ${businessName}. All rights reserved.</p>
  </div>
</div>`,
              businessId: rule.businessId as string,
              clientId: invoice.client.id,
              relatedModel: "invoice",
              relatedId: invoice.id,
            });
            try {
              await api.automationLog.create({
                triggerType: "invoice-unpaid",
                status: "sent",
                recipientName: invoice.client.firstName ?? "Unknown",
                recipientEmail: invoice.client.email,
                relatedRecordId: invoice.id,
                rule: { _link: rule.id },
                business: { _link: rule.businessId as string },
              });
            } catch (logErr) {
              logger.warn({ logErr, invoiceId: invoice.id }, "Failed to write automation log for sent invoice reminder");
            }
            totalSent++;
          } catch (sendError) {
            logger.warn({ sendError, invoiceId: invoice.id }, "Failed to send invoice-unpaid reminder");
            await api.automationLog.create({
              triggerType: "invoice-unpaid",
              status: "failed",
              recipientName: invoice.client.firstName ?? "Unknown",
              recipientEmail: invoice.client.email,
              relatedRecordId: invoice.id,
              rule: { _link: rule.id },
              business: { _link: rule.businessId as string },
            });
            totalFailed++;
          }
        }
      } else if (rule.triggerType === "lapsed-client") {
        const thresholdDays = (rule.delayHours ?? 0) > 0 ? Math.round(rule.delayHours! / 24) : 90;
        const cutoff = new Date(now.getTime() - thresholdDays * 86400000);

        const recentAppointments = await api.appointment.findMany({
          filter: {
            AND: [
              { businessId: { equals: rule.businessId as string } },
              { status: { equals: "completed" } },
            ],
          },
          select: {
            clientId: true,
            completedAt: true,
            client: { id: true, firstName: true, email: true, marketingOptIn: true },
          },
          sort: { completedAt: "Descending" },
          first: 250,
        });

        const clientMap = new Map<string, (typeof recentAppointments)[0]>();
        for (const appt of recentAppointments) {
          if (appt.clientId && !clientMap.has(appt.clientId)) {
            clientMap.set(appt.clientId, appt);
          }
        }

        // NOTE: Known limitation — for businesses with more than 250 completed appointments,
        // this first-pass only sees the most recent 250 records (sorted by completedAt descending).
        // The second-pass check below corrects for active clients whose most recent appointment
        // fell outside this 250-record page, preventing false-positive lapsed-client emails.
        const lapsedCandidates = [...clientMap.values()].filter((appt) => {
          if (!appt.client?.email) return false;
          if (appt.client.marketingOptIn === false) return false;
          if (!appt.completedAt) return false;
          return new Date(appt.completedAt) < cutoff;
        });

        // Second-pass: for each candidate, verify there is no more recent completed appointment
        // beyond what was captured in the first 250 records. This prevents emailing active clients
        // whose latest visit simply wasn't in the first page of results.
        const lapsedClients: typeof lapsedCandidates = [];
        for (const appt of lapsedCandidates) {
          const clientId = appt.clientId as string;
          const moreRecentAppt = await api.appointment.maybeFindFirst({
            filter: {
              AND: [
                { clientId: { equals: clientId } },
                { businessId: { equals: rule.businessId as string } },
                { status: { equals: "completed" } },
                { completedAt: { greaterThan: cutoff.toISOString() } },
              ],
            },
            select: { id: true },
          });
          if (!moreRecentAppt) {
            lapsedClients.push(appt);
          }
        }

        const toProcess = lapsedClients.slice(0, 30);

        for (const appt of toProcess) {
          const clientId = appt.clientId as string;

          const recentLog = await api.automationLog.maybeFindFirst({
            filter: {
              AND: [
                { triggerType: { equals: "lapsed-client" } },
                { relatedRecordId: { equals: clientId } },
                { status: { equals: "sent" } },
                { createdAt: { greaterThan: new Date(now.getTime() - 30 * 86400000).toISOString() } },
              ],
            },
            select: { id: true },
          });

          if (recentLog) {
            totalSkipped++;
            continue;
          }

          const clientFirstName = esc(appt.client?.firstName ?? "there");

          try {
            await api.sendNotification({
              type: "lapsed_client",
              recipientEmail: appt.client!.email!,
              subject: `We miss you at ${business?.name ?? "Your provider"}!`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background-color:#111827;padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:24px;">${businessName}</h1>
  </div>
  <div style="background-color:#ffffff;padding:32px;">
    <h2 style="color:#111827;margin-top:0;">We miss you!</h2>
    <p style="color:#374151;font-size:16px;">Hi ${clientFirstName},</p>
    <p style="color:#374151;font-size:16px;">It's been a while since your last visit to ${businessName}, and we'd love to see you again!</p>
    ${rule.customMessage ? `<p style="color:#374151;font-size:16px;">${esc(rule.customMessage)}</p>` : ""}
    <p style="color:#374151;font-size:16px;">We're ready to take great care of you whenever you're ready to come back.</p>
    <div style="text-align:center;margin:24px 0;">
      ${business?.phone ? `<a href="tel:${esc(business.phone)}" style="display:inline-block;background-color:#f97316;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">📞 Call to Book: ${esc(business.phone)}</a>` : ""}
    </div>
    ${business?.website ? `<p style="color:#6b7280;font-size:13px;text-align:center;">Or visit us at <a href="${esc(business.website)}" style="color:#f97316;">${esc(business.website)}</a></p>` : ""}
  </div>
  <div style="background-color:#f3f4f6;padding:16px;text-align:center;">
    <p style="color:#6b7280;font-size:12px;margin:4px 0 0;">To unsubscribe from future messages, please contact ${businessName}.</p>
    <p style="color:#6b7280;font-size:12px;margin:0;">&copy; ${now.getFullYear()} ${businessName}. All rights reserved.</p>
  </div>
</div>`,
              businessId: rule.businessId as string,
              clientId: appt.client!.id,
              relatedModel: "client",
              relatedId: clientId,
            });
            await api.automationLog.create({
              triggerType: "lapsed-client",
              status: "sent",
              recipientName: appt.client?.firstName ?? "Unknown",
              recipientEmail: appt.client?.email ?? undefined,
              relatedRecordId: clientId,
              rule: { _link: rule.id },
              business: { _link: rule.businessId as string },
            });
            totalSent++;
          } catch (sendError) {
            logger.warn({ sendError, clientId }, "Failed to send lapsed-client outreach");
            await api.automationLog.create({
              triggerType: "lapsed-client",
              status: "failed",
              recipientName: appt.client?.firstName ?? "Unknown",
              recipientEmail: appt.client?.email ?? undefined,
              relatedRecordId: clientId,
              rule: { _link: rule.id },
              business: { _link: rule.businessId as string },
            });
            totalFailed++;
          }
        }
      } else if (rule.triggerType === "service-interval") {
        const businessRecord = businessMap.get(rule.businessId as string);

        const reminders = await api.maintenanceReminder.findMany({
          filter: {
            AND: [
              { businessId: { equals: businessRecord?.id ?? "" } },
              { sent: { equals: false } },
              { dueDate: { lessThanOrEqual: now.toISOString() } },
            ],
          },
          select: { id: true },
          first: 50,
        });

        for (const reminder of reminders) {
          await api.maintenanceReminder.send(reminder.id);
          await api.automationLog.create({
            triggerType: "service-interval",
            status: "sent",
            relatedRecordId: reminder.id,
            rule: { _link: rule.id },
            business: { _link: rule.businessId as string },
          });
          totalSent++;
        }
      }

      await api.automationRule.update(rule.id, { lastRunAt: now });
    } catch (error) {
      totalFailed++;
      logger.error({ error, ruleId: rule.id, triggerType: rule.triggerType }, "Error processing automation rule");
      await api.automationLog.create({
        triggerType: rule.triggerType as any,
        status: "failed",
        relatedRecordId: rule.id,
        rule: { _link: rule.id },
        business: { _link: rule.businessId as string },
      });
    }
  }

  return { rulesProcessed, totalSent, totalSkipped, totalFailed };
};

export const options: ActionOptions = {
  triggers: {
    api: true,
    scheduler: [{ cron: "0 * * * *" }],
  },
};