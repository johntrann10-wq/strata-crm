import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  if ((record as any).email) {
    const existingByEmail = await api.client.maybeFindFirst({
      filter: {
        businessId: { equals: (record as any).businessId },
        email: { equals: (record as any).email },
        id: { notEquals: (record as any).id },
      } as any,
    });
    if (existingByEmail) {
      throw new Error("Another client with this email address already exists in your account.");
    }
  }

  if ((record as any).phone) {
    const existingByPhone = await api.client.maybeFindFirst({
      filter: {
        businessId: { equals: (record as any).businessId },
        phone: { equals: (record as any).phone },
        id: { notEquals: (record as any).id },
      } as any,
    });
    if (existingByPhone) {
      throw new Error("Another client with this phone number already exists in your account.");
    }
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ params, record, logger, api }) => {
  try {
    const changes = (record as any).changes();
    const systemFields = new Set(["updatedAt"]);
    const changedFields = Object.keys(changes).filter((f) => !systemFields.has(f));

    const previousValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    for (const field of changedFields) {
      previousValues[field] = (changes as any)[field].previous;
      newValues[field] = (changes as any)[field].current;
    }

    await api.activityLog.create({
      type: "client-updated",
      description: `Client updated: ${(record as any).firstName} ${(record as any).lastName}`,
      business: { _link: (record as any).businessId } as any,
      client: { _link: (record as any).id },
      metadata: {
        performedBy: (params as any).userId ?? null,
        changedFields,
        previousValues,
        newValues,
      },
    });
  } catch (error) {
    logger.warn({ error }, "Failed to create activity log for client update");
  }
};

export const params = {
  userId: { type: "string" },
};

export const options: ActionOptions = {
  actionType: "update",
};
