import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record, { userBelongsToField: "business" });
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger }) => {
  if (record.reorderThreshold != null && record.quantity != null) {
    if (record.quantity <= record.reorderThreshold) {
      logger.warn(
        {
          itemName: record.name,
          currentQuantity: record.quantity,
          reorderThreshold: record.reorderThreshold,
        },
        `Low inventory alert: "${record.name}" has ${record.quantity} units remaining, at or below the reorder threshold of ${record.reorderThreshold}.`
      );
    }
  }
};

export const options: ActionOptions = {
  actionType: "update",
};
