import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record);

  const upcomingAppointments = await api.appointment.findMany({
    filter: {
      assignedStaffId: { equals: record.id },
      status: { in: ["scheduled", "confirmed", "in_progress"] },
    },
    first: 1,
    select: { id: true },
  });

  if (upcomingAppointments.length > 0) {
    throw new Error(
      "Cannot delete staff member: they are assigned to upcoming appointment(s). Reassign or cancel those appointments first."
    );
  }

  (record as any).deletedAt = new Date();
  await save(record);
};

export const options: ActionOptions = {
  actionType: "custom",
};
