import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, api, session }) => {
  const id = params.id as string;
  const userId = session?.get("user") as string;

  // Use internal API to find soft-deleted vehicle (bypasses access control filters)
  const vehicle = await api.internal.vehicle.findFirst({
    filter: { id: { equals: id } },
    select: {
      id: true,
      year: true,
      make: true,
      model: true,
      vin: true,
      businessId: true,
      clientId: true,
      deletedAt: true,
    },
  });

  if (!vehicle) {
    throw new Error("Vehicle not found.");
  }

  if (!vehicle.deletedAt) {
    throw new Error("This vehicle is not archived — nothing to restore.");
  }

  // vehicle.businessId is a userId (vehicle.business belongsTo user)
  // Verify ownership: find the business record owned by this user, and confirm vehicle belongs to them
  if (vehicle.businessId !== userId) {
    throw new Error("You do not have permission to restore this vehicle.");
  }

  const business = await api.business.findFirst({
    filter: { ownerId: { equals: userId } },
    select: { id: true },
  });

  if (!business) {
    throw new Error("Business not found for this user.");
  }

  // Restore the vehicle by clearing deletedAt
  await api.internal.vehicle.update(id, { deletedAt: null });

  // Build description — filter out falsy parts, join with space
  const descParts = [
    vehicle.year != null ? String(vehicle.year) : null,
    vehicle.make ?? null,
    vehicle.model ?? null,
  ].filter((p): p is string => !!p);
  const description = `Vehicle restored: ${descParts.join(" ")}`;

  // Create activity log
  const activityLogData: any = {
    type: "vehicle-restored",
    description,
    business: { _link: business.id },
    vehicle: { _link: id },
    metadata: { performedBy: userId, restoredAt: new Date().toISOString() },
  };

  if (vehicle.clientId) {
    activityLogData.client = { _link: vehicle.clientId };
  }

  await api.activityLog.create(activityLogData);

  return { success: true, vehicleId: id };
};

export const params = {
  id: { type: "string" },
};

export const options: ActionOptions = {
  returnType: true,
  triggers: { api: true },
};
