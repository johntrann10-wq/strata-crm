import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

const VALID_STATUSES = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no-show"] as const;
type AppointmentStatus = (typeof VALID_STATUSES)[number];

const TRANSITIONS: Record<string, string[]> = {
  "scheduled":   ["confirmed", "cancelled", "no-show"],
  "confirmed":   ["in_progress", "cancelled", "no-show"],
  "in_progress": ["confirmed", "completed", "cancelled"],
  "completed":   [],
  "cancelled":   [],
  "no-show":     [],
};

export const run: ActionRun = async ({ params, record, logger, api }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const status = params.status as string;

  if (!VALID_STATUSES.includes(status as AppointmentStatus)) {
    throw new Error(
      `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(", ")}`
    );
  }

  const currentStatus = record.status as string;
  const allowed = TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(status)) {
    throw new Error(
      `Invalid transition: cannot move from "${currentStatus}" to "${status}". Valid next steps are: ${allowed.join(", ") || "none (terminal state)"}`
    );
  }

  const previousStatus = record.status;
  record.status = status as any;

  await save(record);

  logger.info(
    { appointmentId: record.id, previousStatus, newStatus: status },
    "Appointment status updated"
  );
};

export const params = {
  status: {
    type: "string",
    required: true,
  },
};

export const options: ActionOptions = {
  actionType: "custom",
};
