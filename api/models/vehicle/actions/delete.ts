import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const activeAppointments = await api.appointment.findMany({
    filter: {
      vehicleId: { equals: record.id },
      status: { in: ["scheduled", "confirmed", "in_progress"] },
    },
    first: 1,
  });

  if (activeAppointments.length > 0) {
    throw new Error("Cannot delete vehicle: it has active appointment(s). Cancel or complete those appointments first.");
  }

  (record as any).deletedAt = new Date();
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, api, logger }) => {
  try {
    const parts = [(record as any).year, (record as any).make, (record as any).model].filter(Boolean).join(" ");
    const description = `Vehicle archived: ${parts}`;

    const createInput: any = {
      type: "vehicle-deleted",
      description,
      business: { _link: (record as any).businessId },
      vehicle: { _link: record.id },
      metadata: {
        performedBy: null,
        archivedAt: new Date().toISOString(),
        vin: (record as any).vin ?? null,
      },
    };

    if ((record as any).clientId) {
      createInput.client = { _link: (record as any).clientId };
    }

    await api.activityLog.create(createInput);
  } catch (error) {
    logger.warn({ error }, "Failed to write activity log for vehicle deletion");
  }

  // appointmentPhoto does not have a deletedAt field, so cascade soft-delete is not applicable for this model.

  // vehicleInspection does not have a deletedAt field, so cascade soft-delete is not applicable for this model.
};

export const options: ActionOptions = {
  actionType: "custom",
};
