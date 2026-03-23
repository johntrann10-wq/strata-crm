import { save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api }) => {
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });

  const adjustment = params.adjustment as number;

  if (adjustment === undefined || adjustment === null) {
    throw new Error("adjustment parameter is required.");
  }
  if (typeof adjustment !== "number" || !isFinite(adjustment) || isNaN(adjustment)) {
    throw new Error("adjustment must be a valid finite number.");
  }
  if (adjustment === 0) {
    throw new Error("adjustment cannot be zero — use a positive number to add stock or a negative number to remove stock.");
  }

  const reason = params.reason as string | undefined;

  const freshItem = await api.inventoryItem.findOne(record.id, { select: { id: true, quantity: true, updatedAt: true } });

  if (freshItem.updatedAt.getTime() !== record.updatedAt.getTime()) {
    throw new Error("Inventory record was modified by another operation. Please retry.");
  }

  const oldQuantity = freshItem.quantity ?? 0;
  const newQuantity = oldQuantity + adjustment;

  if (newQuantity < 0) {
    throw new Error("Quantity cannot go below zero");
  }

  record.quantity = newQuantity;

  await save(record);

  logger.info(
    {
      itemName: record.name,
      oldQuantity,
      adjustment,
      newQuantity,
      reason: reason ?? null,
    },
    `Inventory adjusted for "${record.name}": ${oldQuantity} + ${adjustment} = ${newQuantity}${reason ? ` (reason: ${reason})` : ""}`
  );
};

export const params = {
  adjustment: {
    type: "number",
  },
  reason: {
    type: "string",
  },
};

export const options: ActionOptions = {
  actionType: "custom",
};
