import { deleteRecord, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record);

  const appointment = record.appointmentId
    ? await api.appointment.maybeFindOne(record.appointmentId, { select: { id: true, status: true } })
    : null;

  if (appointment?.status === "completed") {
    throw new Error(
      "Cannot remove services from a completed appointment — the job record is locked. Create a corrected invoice line item instead."
    );
  }

  if (appointment?.status === "cancelled") {
    throw new Error("Cannot remove services from a cancelled appointment.");
  }

  await deleteRecord(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api }) => {
  const appointmentId = record.appointmentId as string | undefined;
  if (!appointmentId) return;

  try {
    const remainingServices = await api.appointmentService.findMany({
      filter: { appointment: { id: { equals: appointmentId } } },
      select: { id: true, price: true },
      first: 250,
    });

    const totalPrice = remainingServices.reduce((sum, svc) => sum + (svc.price ?? 0), 0);

    await api.internal.appointment.update(appointmentId, { totalPrice });
  } catch (err) {
    logger.warn({ err, appointmentId }, "Failed to recalculate appointment totalPrice after appointmentService deletion");
  }
};

export const options: ActionOptions = {
  actionType: "delete",
};
