import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api }) => {
  // 1. Input validation
  if (!params.businessId) {
    throw new Error("businessId is required");
  }

  let clientIds: string[];
  try {
    if (!params.clientIds) {
      throw new Error("missing");
    }
    const parsed = JSON.parse(params.clientIds as string);
    if (!Array.isArray(parsed)) {
      throw new Error("not an array");
    }
    clientIds = parsed;
  } catch {
    throw new Error("clientIds must be a valid JSON array of strings");
  }

  if (clientIds.length === 0) {
    return { sent: 0, failed: 0, results: [] };
  }

  // 2. Load business info
  const business = await api.business.maybeFindOne(params.businessId as string, {
    select: { id: true, name: true, email: true, phone: true, googleReviewLink: true },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  const businessName = business.name;
  let sentCount = 0;
  let failedCount = 0;
  const results: Array<{ clientId: string; status: string; reason?: string }> = [];

  // 3. Process each client sequentially
  for (const clientId of clientIds) {
    try {
      // a) Load the client
      const client = await api.client.maybeFindOne(clientId, {
        select: { id: true, firstName: true, lastName: true, email: true, marketingOptIn: true },
      });

      // b) Skip if no client, no email, or marketingOptIn is false
      if (!client) {
        logger.warn({ clientId }, "Client not found, skipping");
        results.push({ clientId, status: "skipped", reason: "Client not found" });
        continue;
      }
      if (!client.email) {
        logger.warn({ clientId }, "Client has no email, skipping");
        results.push({ clientId, status: "skipped", reason: "No email address" });
        continue;
      }
      if (client.marketingOptIn === false) {
        logger.warn({ clientId }, "Client opted out of marketing, skipping");
        results.push({ clientId, status: "skipped", reason: "Opted out of marketing" });
        continue;
      }

      // c) Load most recent completed appointment
      const lastAppt = await api.appointment.maybeFindFirst({
        filter: {
          AND: [
            { clientId: { equals: clientId } },
            { businessId: { equals: params.businessId as string } },
            { status: { equals: "completed" } },
          ],
        },
        sort: { startTime: "Descending" },
        select: {
          id: true,
          startTime: true,
          totalPrice: true,
          appointmentServices: {
            edges: { node: { service: { name: true, category: true } } },
          },
        },
      });

      // d) Check for existing outreach reminder in the last 30 days
      const recentReminder = await api.maintenanceReminder.maybeFindFirst({
        filter: {
          AND: [
            { clientId: { equals: clientId } },
            { businessId: { equals: params.businessId as string } },
            { type: { equals: "custom" } },
            {
              createdAt: {
                greaterThanOrEqual: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
              },
            },
          ],
        },
        select: { id: true },
      });

      if (recentReminder) {
        results.push({ clientId, status: "already_contacted", reason: "Already contacted in last 30 days" });
        continue;
      }

      // e) Build personalized email content
      let daysSinceLast = 0;
      let serviceNames = "your vehicle";

      if (lastAppt) {
        daysSinceLast = Math.round(
          (Date.now() - new Date(lastAppt.startTime as unknown as string).getTime()) / 86400000
        );
        const names = lastAppt.appointmentServices.edges
          .map((e: { node: { service?: { name?: string } } }) => e.node.service?.name)
          .filter(Boolean)
          .join(", ");
        if (names) {
          serviceNames = names;
        }
      }

      const subject = `We miss you at ${businessName}! It's been ${daysSinceLast} days 🚗`;
      const bookingHref = business.email ? `mailto:${business.email}` : "#";
      const lastVisitText = lastAppt
        ? `your last visit was ${daysSinceLast} days ago for ${serviceNames}`
        : `we haven't seen you in a while`;

      const googleReviewSection = business.googleReviewLink
        ? `<p style="text-align:center; margin-top:12px;">
            <a href="${business.googleReviewLink}" style="color:#6b7280; font-size:14px; text-decoration:underline;">
              Leave us a review ⭐
            </a>
          </p>`
        : "";

      const footerContact = [
        business.phone ? `📞 ${business.phone}` : "",
        business.email ? `✉️ ${business.email}` : "",
      ]
        .filter(Boolean)
        .join(" &nbsp;|&nbsp; ");

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; max-width:600px;">
          <tr>
            <td style="background-color:#111827; padding:32px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:700;">${businessName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="font-size:18px; color:#111827; margin:0 0 16px;">Hi ${client.firstName},</p>
              <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 16px;">
                We miss you! We noticed that ${lastVisitText}, and we'd love to see you and your vehicle again.
              </p>
              <p style="font-size:16px; color:#374151; line-height:1.6; margin:0 0 24px;">
                Whether it's time for another detail, a quick check-up, or a new service, our team is ready to take care of you and your car.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${bookingHref}" style="display:inline-block; background-color:#111827; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:6px; font-size:16px; font-weight:600;">
                      Book Your Next Appointment
                    </a>
                  </td>
                </tr>
              </table>
              ${googleReviewSection}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb; padding:24px; text-align:center; border-top:1px solid #e5e7eb;">
              <p style="font-size:14px; color:#6b7280; margin:0 0 8px;">${footerContact}</p>
              <p style="font-size:12px; color:#9ca3af; margin:0;">&copy; ${new Date().getFullYear()} ${businessName}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      // f) Send the email
      const notifResult = await api.sendNotification({ type: 'lapsed_client_outreach', recipientEmail: client.email, subject, html, businessId: params.businessId as string, clientId: clientId, relatedModel: 'client', relatedId: clientId });

      // g) Create a maintenanceReminder record to track the outreach
      await api.maintenanceReminder.create({
        type: "custom",
        title: `Re-engagement outreach sent to ${client.firstName} ${client.lastName}`,
        message: `Automated lapse outreach email sent. Last visit: ${daysSinceLast} days ago.`,
        dueDate: new Date(),
        sent: true,
        sentAt: new Date(),
        business: { _link: params.businessId as string },
        client: { _link: clientId },
      });

      sentCount++;
      results.push({ clientId, status: "sent" });
    } catch (error) {
      // h) Catch errors per client and continue
      logger.warn({ clientId, error }, "Failed to process client outreach");
      failedCount++;
      results.push({
        clientId,
        status: "failed",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // 4. Return summary
  return {
    sent: sentCount,
    failed: failedCount,
    results,
  };
};

export const params = {
  businessId: { type: "string" },
  clientIds: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
};