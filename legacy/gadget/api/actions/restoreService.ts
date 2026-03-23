import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, session, api }) => {
  const userId = session?.get("user") as string | undefined;

  if (!userId) {
    throw new Error("Authentication required.");
  }

  const id = params.id as string;

  const service = await api.service.maybeFindOne(id, {
    select: { id: true, name: true, businessId: true, deletedAt: true, active: true },
  });

  if (!service) {
    throw new Error("Service not found.");
  }

  if (!service.deletedAt) {
    throw new Error("This service is not archived — nothing to restore.");
  }

  if (service.businessId !== userId) {
    throw new Error("You do not have permission to restore this service.");
  }

  const business = await api.business.maybeFindFirst({
    filter: { ownerId: { equals: userId } },
    select: { id: true },
  });

  if (!business) {
    throw new Error("Business not found.");
  }

  await api.internal.service.update(id, { deletedAt: null, active: true });

  await api.activityLog.create({
    type: "service-restored",
    description: `Service restored: ${service.name}`,
    business: { _link: business.id },
    service: { _link: id },
    metadata: { performedBy: userId, restoredAt: new Date().toISOString() },
  });

  return { success: true, serviceId: id };
};

export const params = {
  id: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
};