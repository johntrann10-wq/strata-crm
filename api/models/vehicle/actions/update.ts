import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  if (record.changed("clientId") && record.clientId != null) {
    const client = await api.client.maybeFindOne(record.clientId, { select: { id: true, businessId: true } });
    if (!client) {
      throw new Error("Client not found.");
    }
    if (client.businessId !== record.businessId) {
      throw new Error("Cannot link vehicle to a client from a different business.");
    }
  }

  if (record.vin && String(record.vin).trim() !== "") {
    const normalizedVin = String(record.vin).trim().toUpperCase();
    if (
      normalizedVin.length !== 17 ||
      !/^[A-Z0-9]{17}$/.test(normalizedVin) ||
      /[IOQ]/.test(normalizedVin)
    ) {
      throw new Error(
        "Invalid VIN format. VINs must be exactly 17 alphanumeric characters and cannot contain the letters I, O, or Q."
      );
    }
    record.vin = normalizedVin;

    const existingVin = await api.vehicle.findFirst({
      filter: {
        businessId: { equals: record.businessId },
        vin: { equals: record.vin },
        id: { notEquals: record.id },
      },
    });
    if (existingVin) {
      throw new Error("Another vehicle with this VIN already exists in your account.");
    }
  }

  if (record.licensePlate && String(record.licensePlate).trim() !== "") {
    const existingPlate = await api.vehicle.findFirst({
      filter: {
        businessId: { equals: record.businessId },
        licensePlate: { equals: record.licensePlate },
        id: { notEquals: record.id },
      },
    });
    if (existingPlate) {
      throw new Error("Another vehicle with this license plate already exists in your account.");
    }
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, api, logger }) => {
  try {
    const allChanges = record.changes() as Record<string, { changed: boolean; current: any; previous: any }>;
    const systemFields = new Set(["updatedAt", "createdAt"]);

    const filteredChanges: Record<string, { changed: boolean; current: any; previous: any }> = {};
    for (const [field, change] of Object.entries(allChanges)) {
      if (!systemFields.has(field)) {
        filteredChanges[field] = change;
      }
    }

    const changedFields = Object.keys(filteredChanges);
    if (changedFields.length === 0) return;

    const previousValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};
    for (const field of changedFields) {
      previousValues[field] = filteredChanges[field].previous;
      newValues[field] = filteredChanges[field].current;
    }

    const descParts = [record.year, record.make, record.model].filter(Boolean);
    const description = `Vehicle updated: ${descParts.join(" ")}`;

    await (api.activityLog.create as any)({
      type: "vehicle-updated",
      description,
      business: { _link: record.businessId },
      ...(record.clientId ? { client: { _link: record.clientId } } : {}),
      vehicle: { _link: record.id },
      metadata: {
        performedBy: null,
        changedFields,
        previousValues,
        newValues,
      },
    });
  } catch (error) {
    logger.warn({ error }, "Failed to write activity log for vehicle update");
  }
};

export const options: ActionOptions = {
  actionType: "update",
};
