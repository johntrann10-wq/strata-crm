import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record);

  const linkedAppointmentServices = await api.appointmentService.findMany({
    filter: { serviceId: { equals: record.id } },
    first: 1,
  });

  if (linkedAppointmentServices.length > 0) {
    throw new Error(
      "Cannot delete service: it has been used in past appointments. Deactivate it instead to hide it from future bookings."
    );
  }

  (record as any).deletedAt = new Date();
  await save(record);
};

export const options: ActionOptions = {
  actionType: "custom",
};
