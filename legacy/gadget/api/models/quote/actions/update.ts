import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  const current = await api.quote.findOne(record.id, { select: { id: true, status: true } });

  if (current.status === "accepted") {
    const changes = record.changes();
    const changedFields = Object.keys(changes);
    const nonAppointmentChanges = changedFields.filter((field) => field !== "appointmentId");
    if (nonAppointmentChanges.length > 0) {
      throw new Error("Cannot modify a quote that has already been accepted.");
    }
  }

  if (current.status === "declined") {
    throw new Error("Cannot modify a declined quote.");
  }

  await save(record);
};

export const options: ActionOptions = {
  actionType: "update",
};
