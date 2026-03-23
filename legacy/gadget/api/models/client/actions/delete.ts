import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const activeAppointments = await api.appointment.findMany({
    filter: {
      AND: [
        { clientId: { equals: (record as any).id } },
        { status: { in: ["scheduled", "confirmed", "in_progress"] } },
      ],
    },
    select: { id: true },
  });

  if (activeAppointments.length > 0) {
    throw new Error(
      `Cannot delete client: they have ${activeAppointments.length} active appointment(s). Cancel or complete those appointments first.`
    );
  }

  const unpaidInvoices = await api.invoice.findMany({
    filter: {
      AND: [
        { clientId: { equals: (record as any).id } },
        { status: { in: ["draft", "sent", "partial"] } },
      ],
    },
    select: { id: true },
  });

  if (unpaidInvoices.length > 0) {
    throw new Error(
      `Cannot delete client: they have ${unpaidInvoices.length} unpaid invoice(s). Void or resolve those invoices first.`
    );
  }

  (record as any).deletedAt = new Date();
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api }) => {
  try {
    await api.activityLog.create({
      type: "client-deleted",
      description: `Client archived: ${(record as any).firstName} ${(record as any).lastName}`,
      business: { _link: (record as any).businessId },
      client: { _link: (record as any).id },
      metadata: { performedBy: null, archivedAt: new Date().toISOString() },
    } as any);
  } catch (error) {
    logger.warn({ error }, "Failed to write activity log for client deletion");
  }

  try {
    const vehicles = await api.internal.vehicle.findMany({
      filter: {
        clientId: { equals: (record as any).id },
        deletedAt: { isSet: false },
      },
      select: { id: true },
    } as any);

    for (const vehicle of vehicles) {
      await api.internal.vehicle.update(vehicle.id, { deletedAt: new Date() });
    }
  } catch (error) {
    logger.warn({ error }, "Failed to cascade soft-delete vehicles for deleted client");
  }
};

export const options: ActionOptions = {
  actionType: "custom",
};
