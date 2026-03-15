import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  throw new Error("Business accounts cannot be deleted through the API. Please contact support to close your account.");
};

export const options: ActionOptions = {
  actionType: "delete",
};
