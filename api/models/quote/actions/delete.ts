import { deleteRecord, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record);

  if (record.status === "accepted") {
    throw new Error(
      "Cannot delete an accepted quote — it has been converted to a job. Archive or void the linked appointment instead."
    );
  }

  if (record.appointmentId != null) {
    throw new Error("Cannot delete a quote that has a linked appointment.");
  }

  await deleteRecord(record);
};

export const options: ActionOptions = {
  actionType: "delete",
};
