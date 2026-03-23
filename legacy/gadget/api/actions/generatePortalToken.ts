import { randomBytes } from "crypto";
import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, api, emails, currentAppUrl, logger }) => {
  // Token-based portal data lookup
  if (params.token) {
    const client = await (api.internal.client as any).maybeFindFirst({
      filter: { portalToken: { equals: params.token } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    if (!client) {
      throw new Error("Invalid or expired portal link.");
    }

    const appointments = await api.appointment.findMany({
      filter: { clientId: { equals: client.id } },
      select: {
        id: true,
        title: true,
        startTime: true,
        status: true,
        totalPrice: true,
        vehicle: { year: true, make: true, model: true },
      },
      sort: { startTime: "Descending" },
      first: 20,
    });

    const vehicles = await api.vehicle.findMany({
      filter: { clientId: { equals: client.id } },
      select: {
        id: true,
        year: true,
        make: true,
        model: true,
        color: true,
        licensePlate: true,
      },
      first: 50,
    });

    return {
      success: true,
      clientId: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      appointments,
      vehicles,
    };
  }

  const clientId = params.clientId;
  if (!clientId) {
    throw new Error("clientId is required");
  }

  const client = await api.client.maybeFindOne(clientId, {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      portalToken: true,
    },
  });

  if (!client) {
    throw new Error("Client not found");
  }

  if (!client.email) {
    throw new Error("Client has no email address on file");
  }

  const token = randomBytes(32).toString("hex");
  await api.client.update(clientId, { portalToken: token });

  const portalUrl = currentAppUrl + "/portal/" + token;

  try {
    await emails.sendMail({
    from: "noreply@strata.gadget.app",
    to: client.email,
    subject: "Access Your Service Portal",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Access Your Service Portal</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#f97316;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Your Service Portal</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px 40px;">
              <p style="margin:0 0 16px 0;font-size:16px;color:#111827;font-weight:600;">Hi ${client.firstName},</p>
              <p style="margin:0 0 28px 0;font-size:15px;color:#4b5563;line-height:1.6;">
                Click the button below to access your personal service portal where you can view your appointments, invoices, and vehicle history. No password required.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px auto;">
                <tr>
                  <td style="border-radius:6px;background-color:#f97316;">
                    <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;background-color:#f97316;">View My Portal</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
                This link is unique to you — please do not share it.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px 40px;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;font-size:14px;color:#6b7280;">Thank you for your business!</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
  } catch (error) {
    logger.warn({ clientId, error }, 'Failed to send portal link email; token was generated successfully');
  }

  return { success: true, portalUrl };
};

export const params = {
  clientId: { type: "string" },
  token: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
};