import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api }) => {
  await preventCrossUserDataAccess(params, record);

  // Check for active appointments assigned to this staff member that would block deactivation
  const activeAppointments = await api.appointment.findMany({
    filter: {
      assignedStaffId: { equals: record.id },
      status: { in: ["scheduled", "confirmed", "in_progress"] },
    },
    first: 250,
    select: { id: true, status: true, startTime: true },
  });

  if (activeAppointments.length > 0) {
    throw new Error(
      `Cannot deactivate staff member: they have ${activeAppointments.length} active appointment${activeAppointments.length === 1 ? "" : "s"} with a status of 'pending', 'confirmed', or 'in-progress'. Please reassign or cancel those appointments before deactivating this staff member.`
    );
  }

  // Check for future appointments in 'completed' or 'no-show' status as an edge-case audit (non-blocking)
  const now = new Date().toISOString();
  const futureEdgeCaseAppointments = await api.appointment.findMany({
    filter: {
      assignedStaffId: { equals: record.id },
      status: { in: ["completed", "no-show"] },
      startTime: { greaterThan: now },
    },
    first: 250,
    select: { id: true, status: true, startTime: true },
  });

  if (futureEdgeCaseAppointments.length > 0) {
    logger.warn(
      { staffId: record.id, count: futureEdgeCaseAppointments.length },
      `Staff member has ${futureEdgeCaseAppointments.length} future appointment(s) marked 'completed' or 'no-show' that may need review.`
    );
  }

  record.active = false;
  await save(record);

  logger.info(
    { staffId: record.id },
    `Staff member ${record.firstName} ${record.lastName} has been deactivated.`
  );
};

export const options: ActionOptions = {
  actionType: "custom",
};
