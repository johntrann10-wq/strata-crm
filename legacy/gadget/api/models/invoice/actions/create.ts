import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections, session }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  if (record.clientId) {
    const client = await api.client.maybeFindOne(record.clientId, { select: { id: true, businessId: true } });
    if (client && client.businessId !== record.businessId) {
      throw new Error("Cannot create invoice for a client from a different business.");
    }
  }

  if (record.appointmentId) {
    const appointment = await api.appointment.maybeFindOne(record.appointmentId, { select: { id: true, businessId: true, clientId: true } });
    if (!appointment) {
      throw new Error("Appointment not found.");
    }
    if (appointment.businessId !== record.businessId) {
      throw new Error("Cannot link invoice to an appointment from a different business.");
    }
    if (record.clientId && appointment.clientId !== record.clientId) {
      throw new Error("The selected appointment belongs to a different client than the one on this invoice.");
    }
  }

  if (!record.status) {
    record.status = "draft";
  }

  if (record.invoiceNumber) {
    await save(record);
    return;
  }

  const userId = session?.get("user") as string | undefined;
  if (!userId) {
    await save(record);
    return;
  }

  const MAX_ATTEMPTS = 5;
  let saved = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Re-read the business record fresh on each attempt to get the latest counter
    const business = await api.business.findFirst({
      filter: { owner: { id: { equals: userId } } },
      select: { id: true, nextInvoiceNumber: true },
    });

    if (!business) {
      // No business found; save without an invoice number
      await save(record);
      return;
    }

    const seq = business.nextInvoiceNumber ?? 1;

    const year = new Date().getUTCFullYear();
    record.invoiceNumber = `INV-${year}-${String(seq).padStart(5, "0")}`;

    // Claim the sequence slot BEFORE writing the invoice to eliminate the race window.
    // A crash between here and the save below leaves a gap in numbering (harmless).
    await api.internal.business.update(business.id, {
      nextInvoiceNumber: seq + 1,
    });

    try {
      await save(record);
    } catch (error: any) {
      const message: string = error?.message ?? "";
      if (/unique|duplicate/i.test(message)) {
        // Counter is already bumped; the next attempt will read a higher value.
        record.invoiceNumber = null;
        continue;
      }
      throw error;
    }

    saved = true;
    break;
  }

  if (!saved) {
    throw new Error(`Failed to generate a unique invoice number after ${MAX_ATTEMPTS} attempts. Please try again.`);
  }
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api }) => {
  if (!record.appointmentId) {
    return;
  }

  try {
    const appointment = await api.appointment.maybeFindOne(record.appointmentId, {
      select: { id: true, invoicedAt: true },
    });

    if (!appointment) {
      logger.warn({ appointmentId: record.appointmentId }, "Appointment not found when trying to stamp invoicedAt");
      return;
    }

    if (appointment.invoicedAt) {
      return;
    }

    await api.internal.appointment.update(record.appointmentId, { invoicedAt: new Date() });
    logger.info({ appointmentId: record.appointmentId, invoiceId: record.id }, "Set invoicedAt timestamp on appointment");
  } catch (error) {
    logger.warn({ error, appointmentId: record.appointmentId }, "Failed to stamp invoicedAt on appointment");
  }
};

export const options: ActionOptions = {
  actionType: "create",
};
