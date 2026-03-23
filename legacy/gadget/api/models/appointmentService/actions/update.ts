import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  const appointment = record.appointmentId
    ? await api.appointment.maybeFindOne(record.appointmentId, { select: { id: true, status: true } })
    : null;

  if (appointment?.status === "completed") {
    throw new Error("Cannot modify services on a completed appointment — the job record is locked.");
  }
  if (appointment?.status === "cancelled") {
    throw new Error("Cannot modify services on a cancelled appointment.");
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api }) => {
  const appointmentId = record.appointmentId;
  if (!appointmentId) return;

  try {
    const services = await api.appointmentService.findMany({
      filter: { appointmentId: { equals: appointmentId } },
      select: { id: true, price: true },
      first: 250,
    });

    const totalPrice = services.reduce((sum, s) => sum + (s.price ?? 0), 0);

    await api.internal.appointment.update(appointmentId, { totalPrice });
  } catch (err) {
    logger.warn({ err, appointmentId }, "Failed to recalculate appointment totalPrice after appointmentService update");
  }
};

export const options: ActionOptions = {
  actionType: "update",
};
