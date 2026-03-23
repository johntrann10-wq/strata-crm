import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossUserDataAccess } from "gadget-server/auth";

export const run: ActionRun = async ({ params, record, logger, api, connections, session }) => {
  applyParams(params, record);
  await preventCrossUserDataAccess(params, record);

  if (!record.businessId) {
    const userId = session?.get("user") as string | undefined;
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

  if (record.clientId) {
    const client = await api.client.maybeFindOne(record.clientId, {
      select: { id: true, businessId: true },
    });
    if (client && client.businessId !== record.businessId) {
      throw new Error("Cannot link vehicle to a client from a different business.");
    }
  }

  if (record.vin && record.vin.trim() !== "") {
    const normalizedVin = record.vin.trim().toUpperCase();
    record.vin = normalizedVin;

    if (!/^[A-Z0-9]{17}$/.test(normalizedVin) || /[IOQ]/.test(normalizedVin)) {
      throw new Error(
        "Invalid VIN format. VINs must be exactly 17 alphanumeric characters and cannot contain the letters I, O, or Q."
      );
    }

    const existingVehicleByVin = await api.vehicle.maybeFindFirst({
      filter: {
        businessId: { equals: record.businessId },
        vin: { equals: normalizedVin },
      },
    });
    if (existingVehicleByVin) {
      throw new Error("A vehicle with this VIN already exists in your account.");
    }
  }

  if (record.licensePlate && record.licensePlate.trim() !== "") {
    const existingVehicleByPlate = await api.vehicle.maybeFindFirst({
      filter: {
        businessId: { equals: record.businessId },
        licensePlate: { equals: record.licensePlate.trim() },
      },
    });
    if (existingVehicleByPlate) {
      throw new Error("A vehicle with this license plate already exists in your account.");
    }
  }

  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, api }) => {
  try {
    const descriptionParts = [record.year, record.make, record.model].filter(Boolean);
    const description = `Vehicle added: ${descriptionParts.join(" ")}`;

    await api.activityLog.create({
      type: "vehicle-created",
      description,
      business: { _link: record.businessId },
      ...(record.clientId ? { client: { _link: record.clientId } } : {}),
      vehicle: { _link: record.id },
      metadata: {
        performedBy: null,
        vin: record.vin ?? null,
        licensePlate: record.licensePlate ?? null,
      },
    } as any);
  } catch (err) {
    logger.warn({ error: err }, "Failed to write activity log for vehicle creation");
  }
};

export const options: ActionOptions = {
  actionType: "create",
};
