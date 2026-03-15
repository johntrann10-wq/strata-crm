import { deleteRecord, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const appointmentStatus = record.status as string;

  if (appointmentStatus === "in_progress") {
    throw new Error("Cannot delete an in-progress appointment. Cancel it first, then delete it.");
  }

  if (appointmentStatus === "completed") {
    throw new Error("Cannot delete a completed appointment. Completed jobs are preserved for historical records.");
  }

  const activeInvoices = await api.invoice.findMany({
    filter: {
      AND: [
        { appointmentId: { equals: record.id } },
        { status: { notIn: ["void"] } },
      ],
    } as any,
    first: 1,
    select: { id: true, status: true },
  });

  if (activeInvoices.length > 0) {
    throw new Error("Cannot delete appointment: it has an attached invoice. Void the invoice first, then delete the appointment.");
  }

  await deleteRecord(record);
};

export const options: ActionOptions = {
  actionType: "delete",
};
