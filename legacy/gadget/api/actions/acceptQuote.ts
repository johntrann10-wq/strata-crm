import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, api, logger }) => {
  const token = params.token;
  if (!token) {
    throw new Error("Token is required");
  }

  if (token.length < 32 || !/^[a-f0-9]+$/i.test(token)) {
    logger.warn({ tokenLength: token?.length }, "acceptQuote: malformed token attempt");
    throw new Error("Invalid or malformed acceptance token.");
  }

  const quote = await api.quote.maybeFindFirst({
    filter: { acceptToken: { equals: token } },
    select: { id: true, status: true, expiresAt: true, clientId: true, vehicleId: true, businessId: true },
  });

  if (!quote) {
    throw new Error("Quote not found or link is invalid");
  }

  if (quote.expiresAt && new Date(quote.expiresAt as unknown as string).toISOString().slice(0, 10) <= new Date().toISOString().slice(0, 10)) {
    logger.warn({ quoteId: quote.id }, "acceptQuote: token used on expired quote");
    throw new Error("This quote link has expired. Please contact us to request a new quote.");
  }

  if (quote.status === "accepted") {
    return { success: true, alreadyAccepted: true, quoteId: quote.id };
  }

  if (quote.status === "expired" || quote.status === "declined") {
    throw new Error("This quote is no longer available");
  }

  await api.internal.quote.update(quote.id, { status: "accepted", acceptedAt: new Date(), acceptToken: null });

  logger.info({ quoteId: quote.id, clientId: quote.clientId }, "Quote accepted via public token link");

  let appointmentId: string | null = null;
  try {
    const fullQuote = await api.quote.findOne(quote.id, {
      select: { id: true, vehicleId: true, businessId: true, clientId: true, notes: true },
    });

    const appointmentData: Record<string, unknown> = {
      title: "Appointment from accepted quote",
      status: "scheduled",
    };

    if (fullQuote.clientId) {
      appointmentData.client = { _link: fullQuote.clientId };
    }
    if (fullQuote.vehicleId) {
      appointmentData.vehicle = { _link: fullQuote.vehicleId };
    }
    if (fullQuote.businessId) {
      appointmentData.business = { _link: fullQuote.businessId };
    }
    if (fullQuote.notes) {
      appointmentData.notes = fullQuote.notes;
    }

    const appointment = await api.appointment.create(appointmentData as Parameters<typeof api.appointment.create>[0]);
    appointmentId = appointment.id;
  } catch (err) {
    logger.warn({ quoteId: quote.id, err }, "acceptQuote: failed to auto-create appointment from accepted quote");
  }

  return { success: true, alreadyAccepted: false, quoteId: quote.id, appointmentId };
};

export const params = {
  token: { type: "string" },
};

export const options: ActionOptions = {
  returnType: true,
  triggers: { api: true },
};
