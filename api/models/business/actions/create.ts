import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections, session }) => {
  applyParams(params, record);
  const userId = session?.get('user') as string | undefined;
  if (userId) {
    record.ownerId = userId;
    const existing = await api.business.maybeFindFirst({
      filter: { owner: { id: { equals: userId } } },
      select: { id: true },
    });
    if (existing) {
      throw new Error('You already have a business registered. Each account can only have one business.');
    }
  }
  await preventCrossUserDataAccess(params, record);
  await save(record);
};

export const options: ActionOptions = {
  actionType: "create",
};
