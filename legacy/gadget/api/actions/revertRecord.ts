import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, logger, api, session }) => {
  const userId = session?.get("user") as string | undefined;
  if (!userId) {
    throw new Error("Authentication required.");
  }

  const activityLogId = params.activityLogId as string;
  const recordType = params.recordType as string;

  // Find the activityLog entry
  const logEntry = await api.activityLog.findFirst({
    filter: { id: { equals: activityLogId } },
    select: {
      id: true,
      type: true,
      metadata: true,
      clientId: true,
      vehicleId: true,
      appointmentId: true,
      invoiceId: true,
      serviceId: true,
      businessId: true,
    },
  });

  if (!logEntry) {
    throw new Error("Audit log entry not found.");
  }

  // Verify ownership: find business owned by current user matching the log's businessId
  const business = await api.business.findFirst({
    filter: {
      ownerId: { equals: userId },
      id: { equals: logEntry.businessId! },
    },
    select: { id: true },
  });

  if (!business) {
    throw new Error("Not authorized to revert this record.");
  }

  // Extract previousValues from metadata
  const metadata = logEntry.metadata as Record<string, any> | null;
  const previousValues = metadata?.previousValues as Record<string, any> | undefined;

  if (!previousValues || Object.keys(previousValues).length === 0) {
    throw new Error(
      "This audit entry has no previous values to revert to. Only update-type entries support revert."
    );
  }

  // Determine target record id based on recordType
  const recordIdMap: Record<string, string | null | undefined> = {
    client: logEntry.clientId,
    vehicle: logEntry.vehicleId,
    appointment: logEntry.appointmentId,
    invoice: logEntry.invoiceId,
    service: logEntry.serviceId,
  };

  const recordId = recordIdMap[recordType];

  if (!recordId) {
    throw new Error(`No associated ${recordType} record found in this audit entry.`);
  }

  // Strip system fields before reverting
  const { updatedAt: _updatedAt, createdAt: _createdAt, id: _id, ...fieldsToRevert } = previousValues;

  // Use internal api to update the record
  await (api.internal as any)[recordType].update(recordId, fieldsToRevert);

  // Build entity link for the new activityLog entry
  const entityLinkMap: Record<string, Record<string, unknown>> = {
    client: { client: { _link: recordId } },
    vehicle: { vehicle: { _link: recordId } },
    appointment: { appointment: { _link: recordId } },
    invoice: { invoice: { _link: recordId } },
    service: { service: { _link: recordId } },
  };

  // Write a new activityLog entry for the revert
  await api.activityLog.create({
    type: "record-reverted",
    description: `Record reverted to previous state from audit entry ${activityLogId}`,
    business: { _link: logEntry.businessId! },
    ...(entityLinkMap[recordType] ?? {}),
    metadata: {
      performedBy: userId,
      activityLogId,
      recordType,
      recordId,
      revertedFields: Object.keys(fieldsToRevert),
    },
  });

  return {
    success: true,
    recordType,
    recordId,
    revertedFields: Object.keys(fieldsToRevert),
  };
};

export const params = {
  activityLogId: { type: "string" },
  recordType: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
};