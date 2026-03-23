import { deleteRecord, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const linkedServiceItems = await api.serviceInventoryItem.findMany({
    filter: { inventoryItem: { id: { equals: record.id } } },
    first: 1,
    select: { id: true },
  });

  if (linkedServiceItems.length > 0) {
    throw new Error("Cannot delete inventory item: it is linked to one or more service configurations. Remove it from those services first.");
  }

  if ((record.quantity ?? 0) > 0) {
    throw new Error("Cannot delete an inventory item that still has stock. Set the quantity to zero first.");
  }

  await deleteRecord(record);
};

export const options: ActionOptions = {
  actionType: "delete",
};
