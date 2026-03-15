import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, api }) => {
  const serviceIds = params.serviceIds as string[] | undefined;
  const vehicleId = params.vehicleId as string | undefined;
  const businessId = params.businessId as string | undefined;

  // Step 1: Early return if no serviceIds or no businessId
  if (!serviceIds || serviceIds.length === 0 || !businessId) {
    return {
      estimates: [],
      totalEstimatedMinutes: 0,
      totalDefaultMinutes: 0,
      totalSampleSize: 0,
      confidence: "none",
      vehicleMake: null,
    };
  }

  // Step 2: Fetch vehicle make if vehicleId is provided
  let vehicleMake: string | null = null;
  if (vehicleId) {
    const vehicle = await api.vehicle.maybeFindOne(vehicleId, {
      select: { id: true, make: true },
    });
    vehicleMake = vehicle?.make ?? null;
  }

  // Step 3: Fetch services by their IDs
  const services = await api.service.findMany({
    filter: { id: { in: serviceIds } },
    select: { id: true, name: true, duration: true, category: true },
    first: 50,
  });

  // Step 4: Batch fetch all appointment services for the given serviceIds and businessId
  const allApptServices = await api.appointmentService.findMany({
    filter: {
      serviceId: { in: serviceIds },
      businessId: { equals: businessId },
    },
    select: {
      id: true,
      serviceId: true,
      appointment: {
        startTime: true,
        completedAt: true,
        status: true,
        vehicle: { make: true },
      },
    },
    first: 250,
  });

  const apptServicesByServiceId = new Map<string, (typeof allApptServices)[number][]>();
  for (const apptService of allApptServices) {
    const sid = apptService.serviceId as string;
    if (!apptServicesByServiceId.has(sid)) apptServicesByServiceId.set(sid, []);
    apptServicesByServiceId.get(sid)!.push(apptService);
  }

  // Step 4 & 5: For each service compute historical durations and blended estimate
  const estimates: Array<{
    serviceId: string;
    name: string;
    category: string | null;
    defaultMinutes: number;
    estimatedMinutes: number;
    historicalAvgMinutes: number | null;
    sampleSize: number;
    confidence: string;
  }> = [];

  for (const service of services) {
    const apptServices = apptServicesByServiceId.get(service.id) ?? [];

    // Compute actual durations from completed appointments
    const validDurations: number[] = [];
    for (const apptService of apptServices) {
      const appt = apptService.appointment;
      if (!appt) continue;
      if (appt.status !== "completed") continue;
      if (!appt.completedAt) continue;
      if (!appt.startTime) continue;
      // Filter by vehicle make if provided
      if (vehicleMake !== null && appt.vehicle?.make !== vehicleMake) continue;

      const actualDuration = Math.round(
        (new Date(appt.completedAt).getTime() - new Date(appt.startTime).getTime()) / 60000
      );
      if (actualDuration > 0 && actualDuration <= 1440) {
        validDurations.push(actualDuration);
      }
    }

    // Step 5: Compute blended estimate
    const defaultMinutes = service.duration || 60;
    const sampleSize = validDurations.length;
    const historicalAvg =
      sampleSize > 0
        ? validDurations.reduce((sum, d) => sum + d, 0) / sampleSize
        : null;

    let estimatedMinutes: number;
    let perConfidence: string;

    if (sampleSize === 0) {
      estimatedMinutes = defaultMinutes;
      perConfidence = "none";
    } else if (sampleSize <= 2) {
      estimatedMinutes = Math.round(0.25 * historicalAvg! + 0.75 * defaultMinutes);
      perConfidence = "low";
    } else if (sampleSize <= 4) {
      estimatedMinutes = Math.round(0.5 * historicalAvg! + 0.5 * defaultMinutes);
      perConfidence = "medium";
    } else {
      estimatedMinutes = Math.round(0.75 * historicalAvg! + 0.25 * defaultMinutes);
      perConfidence = "high";
    }

    // Round to nearest 5 minutes
    estimatedMinutes = Math.round(estimatedMinutes / 5) * 5;

    estimates.push({
      serviceId: service.id,
      name: service.name,
      category: service.category ?? null,
      defaultMinutes,
      estimatedMinutes,
      historicalAvgMinutes: historicalAvg !== null ? Math.round(historicalAvg) : null,
      sampleSize,
      confidence: perConfidence,
    });
  }

  // Step 6: Compute totals and overall confidence
  const totalEstimatedMinutes = estimates.reduce((sum, e) => sum + e.estimatedMinutes, 0);
  const totalDefaultMinutes = estimates.reduce((sum, e) => sum + e.defaultMinutes, 0);
  const totalSampleSize = estimates.reduce((sum, e) => sum + e.sampleSize, 0);

  let confidence: string;
  if (estimates.length === 0) {
    confidence = "none";
  } else if (estimates.every((e) => e.confidence === "high")) {
    confidence = "high";
  } else if (estimates.some((e) => e.confidence === "none")) {
    confidence = "none";
  } else if (estimates.some((e) => e.confidence === "low")) {
    confidence = "low";
  } else {
    confidence = "medium";
  }

  // Step 7: Return aggregated result
  return {
    estimates,
    totalEstimatedMinutes,
    totalDefaultMinutes,
    totalSampleSize,
    confidence,
    vehicleMake,
  };
};

export const params = {
  serviceIds: {
    type: "array",
    items: { type: "string" },
  },
  vehicleId: { type: "string" },
  businessId: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
};
