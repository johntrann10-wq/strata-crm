import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections, session }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  const userId = session?.get("user") as string | undefined;
  if (!(record as any).businessId && userId) {
    const business = await api.business.findFirst({
      filter: { owner: { id: { equals: userId } } },
      select: { id: true },
    });
    if (business) {
      (record as any).businessId = business.id;
    }
  }

  if ((record as any).email) {
    const existingByEmail = await api.client.maybeFindFirst({
      filter: {
        businessId: { equals: (record as any).businessId },
        email: { equals: (record as any).email as string },
      } as any,
    });
    if (existingByEmail) {
      throw new Error("A client with this email address already exists in your account.");
    }
  }

  if ((record as any).phone) {
    const existingByPhone = await api.client.maybeFindFirst({
      filter: {
        businessId: { equals: (record as any).businessId },
        phone: { equals: (record as any).phone as string },
      } as any,
    });
    if (existingByPhone) {
      throw new Error("A client with this phone number already exists in your account.");
    }
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api, connections }) => {
  const r = record as any;
  try {
    await api.activityLog.create({
      type: "client-added",
      description: `New client added: ${r.firstName} ${r.lastName}`,
      business: { _link: r.businessId },
      client: { _link: r.id },
    });
  } catch (error) {
    logger.warn({ error }, "Failed to create activity log for client create");
  }
};

export const options: ActionOptions = {
  actionType: "create",
};
