import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, session }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  // If businessId is not set, look it up from the session user
  if (!record.businessId) {
    const userId = session?.get("user");
    if (userId) {
      const business = await api.business.maybeFindFirst({
        filter: { owner: { id: { equals: userId } } },
        select: { id: true },
      });
      if (business) {
        record.businessId = business.id;
      }
    }
  }

  // Validate that clientId is set
  if (!record.clientId) {
    throw new Error("A client is required to create a quote.");
  }

  // Validate the client belongs to the same business
  const client = await api.client.maybeFindOne(record.clientId, {
    select: { id: true, businessId: true },
  });
  if (client && client.businessId !== record.businessId) {
    throw new Error("Cannot create quote for a client from a different business.");
  }

  // If vehicleId is set, validate the vehicle belongs to the same business
  if (record.vehicleId) {
    const vehicle = await api.vehicle.maybeFindOne(record.vehicleId, {
      select: { id: true, businessId: true },
    });
    if (vehicle && vehicle.businessId !== record.businessId) {
      throw new Error("Cannot create quote for a vehicle from a different business.");
    }
  }

  // Default status to 'draft' if not set
  if (!record.status) {
    record.status = "draft";
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api }) => {
  try {
    await api.activityLog.create({
      type: "quote-created" as any,
      description: "Quote created",
      business: { _link: record.businessId },
      client: { _link: record.clientId },
    });
  } catch (error) {
    logger.warn({ error }, "Failed to create activity log for quote creation");
  }
};

export const options: ActionOptions = {
  actionType: "create",
};
