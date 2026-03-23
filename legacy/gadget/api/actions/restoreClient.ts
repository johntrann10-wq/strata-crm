import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const id = params.id as string;
  const userId = session?.get("user") as string;

  // Find the client using internal API to access soft-deleted records
  let client: any;
  try {
    client = await api.internal.client.findOne(id);
  } catch {
    throw new Error("Client not found.");
  }

  if (!client.deletedAt) {
    throw new Error("This client is not archived — nothing to restore.");
  }

  // Verify the client belongs to the current user's business
  // client.businessId is the user ID of the business owner
  if (client.businessId !== userId) {
    throw new Error("Unauthorized: client does not belong to your business.");
  }

  // Find the business record for the activity log
  const business = await api.business.maybeFindFirst({
    filter: { ownerId: { equals: userId } },
    select: { id: true },
  });

  if (!business) {
    throw new Error("Business not found.");
  }

  // Restore the client by clearing deletedAt
  await api.internal.client.update(id, { deletedAt: null });

  // Write activity log entry
  await api.activityLog.create({
    type: "client-restored",
    description: `Client restored: ${client.firstName} ${client.lastName}`,
    business: { _link: business.id },
    client: { _link: id },
    metadata: {
      performedBy: userId,
      restoredAt: new Date().toISOString(),
    },
  });

  return { success: true, clientId: id };
};

export const params = {
  id: { type: "string" },
};

export const options: ActionOptions = {
  returnType: true,
  triggers: { api: true },
};
