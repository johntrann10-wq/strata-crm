import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, api }) => {
  const clientId = params.clientId as string | undefined;
  const vehicleId = params.vehicleId as string | undefined;
  const businessId = params.businessId as string | undefined;

  let selectedServiceIds: string[] = [];
  try {
    if (params.selectedServiceIds) {
      const parsed = JSON.parse(params.selectedServiceIds as string);
      selectedServiceIds = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    selectedServiceIds = [];
  }

  if (!clientId || !businessId) {
    return { recommendations: [] };
  }

  const [historyRecords, vehicle, servicesData] = await Promise.all([
    api.appointmentService.findMany({
      filter: {
        AND: [
          { businessId: { equals: businessId } },
          { appointment: { client: { id: { equals: clientId } } } } as any,
          { appointment: { status: { equals: "completed" } } } as any,
        ],
      },
      select: {
        id: true,
        price: true,
        service: { id: true, name: true, category: true },
        appointment: { startTime: true, vehicleId: true },
      },
      sort: { createdAt: "Descending" },
      first: 250,
    }),
    vehicleId
      ? api.vehicle.maybeFindOne(vehicleId, {
          select: {
            id: true,
            paintType: true,
            mileage: true,
            lastServiceDate: true,
            tintPercentage: true,
            filmType: true,
            year: true,
            make: true,
            model: true,
          },
        })
      : Promise.resolve(null),
    api.service.findMany({
      filter: {
        AND: [
          { businessId: { equals: businessId } },
          { active: { equals: true } },
        ],
      },
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        duration: true,
        description: true,
      },
      first: 250,
    }),
  ]);

  // Build history lookup structures
  const historyByServiceId = new Map<string, Date[]>();
  const historyByCategory = new Map<string, Date[]>();
  const everReceivedServiceIds = new Set<string>();
  const everReceivedCategories = new Set<string>();

  for (const record of historyRecords) {
    if (!record.service) continue;
    const serviceId = record.service.id;
    const category = record.service.category as string | null | undefined;
    const date =
      record.appointment?.startTime
        ? new Date(record.appointment.startTime as unknown as string)
        : null;

    if (serviceId) {
      everReceivedServiceIds.add(serviceId);
      if (date) {
        const dates = historyByServiceId.get(serviceId) ?? [];
        dates.push(date);
        historyByServiceId.set(serviceId, dates);
      }
    }

    if (category) {
      everReceivedCategories.add(category);
      if (date) {
        const dates = historyByCategory.get(category) ?? [];
        dates.push(date);
        historyByCategory.set(category, dates);
      }
    }
  }

  for (const [, dates] of historyByServiceId) {
    dates.sort((a, b) => b.getTime() - a.getTime());
  }
  for (const [, dates] of historyByCategory) {
    dates.sort((a, b) => b.getTime() - a.getTime());
  }

  // Build selected service lookup
  const serviceMap = new Map(servicesData.map((s) => [s.id, s]));
  const selectedServicesData = selectedServiceIds
    .map((id) => serviceMap.get(id))
    .filter(Boolean) as typeof servicesData;
  const selectedCategories = new Set(
    selectedServicesData.map((s) => s.category).filter(Boolean) as string[]
  );

  type RuleContribution = { score: number; reason: string };

  type ScoredRecommendation = {
    serviceId: string;
    name: string;
    category: string | null;
    price: number;
    duration: number | null;
    score: number;
    reason: string;
  };

  const scored: ScoredRecommendation[] = [];

  for (const service of servicesData) {
    if (selectedServiceIds.includes(service.id)) continue;

    const category = (service.category as string | null | undefined) ?? null;
    const alreadyReceived = everReceivedServiceIds.has(service.id);
    const contributions: RuleContribution[] = [];

    // Rule A: Time-based recurrence (overdue services)
    let ruleAApplied = false;
    if (alreadyReceived) {
      const dates = historyByServiceId.get(service.id);
      if (dates && dates.length > 0) {
        const lastDate = dates[0];
        const daysSinceLast =
          (Date.now() - lastDate.getTime()) / (1000 * 86400);

        if (
          (category === "detailing" || category === "maintenance") &&
          daysSinceLast > 60
        ) {
          contributions.push({
            score: 70,
            reason: `Last detail was ${Math.round(daysSinceLast)} days ago — due for a refresh`,
          });
          ruleAApplied = true;
        } else if (category === "ceramic-coating" && daysSinceLast > 300) {
          contributions.push({
            score: 85,
            reason: `Ceramic coating from ${Math.round(daysSinceLast / 30)} months ago — maintenance coating recommended`,
          });
          ruleAApplied = true;
        } else if (category === "tires" && daysSinceLast > 150) {
          contributions.push({
            score: 65,
            reason: `Tire rotation overdue — last done ${Math.round(daysSinceLast)} days ago`,
          });
          ruleAApplied = true;
        } else if (category === "paint-correction" && daysSinceLast > 180) {
          contributions.push({
            score: 60,
            reason: `Paint correction recommended — last done ${Math.round(daysSinceLast / 30)} months ago`,
          });
          ruleAApplied = true;
        } else if (category === "tinting" && daysSinceLast > 365) {
          contributions.push({
            score: 55,
            reason: `Tint inspection recommended after ${Math.round(daysSinceLast / 30)} months`,
          });
          ruleAApplied = true;
        }
      }

      // If already received but Rule A didn't apply, skip — not overdue
      if (!ruleAApplied) continue;
    }

    // Rule B: Complementary service pairings
    for (const sel of selectedServicesData) {
      const selCategory = sel.category as string | null | undefined;
      if (selCategory === "paint-correction" && category === "ceramic-coating") {
        contributions.push({
          score: 90,
          reason: "Ceramic coating is the ideal follow-up to paint correction",
        });
      }
      if (selCategory === "detailing" && category === "ceramic-coating") {
        contributions.push({
          score: 75,
          reason: "Protect that fresh detail with ceramic coating",
        });
      }
      if (
        (selCategory === "wash" || selCategory === "detailing") &&
        category === "paint-correction"
      ) {
        contributions.push({
          score: 50,
          reason: "Paint correction removes swirls before detailing",
        });
      }
      if (selCategory === "tinting" && category === "ppf") {
        contributions.push({
          score: 65,
          reason: "PPF pairs perfectly with tint for full protection",
        });
      }
      if (selCategory === "ppf" && category === "tinting") {
        contributions.push({
          score: 65,
          reason: "Add tint to complete the protection package",
        });
      }
      if (selCategory === "alignment" && category === "tires") {
        contributions.push({
          score: 60,
          reason: "Fresh alignment works best with balanced tires",
        });
      }
      if (selCategory === "body-repair" && category === "paint-correction") {
        contributions.push({
          score: 70,
          reason: "Paint correction restores the finish after body work",
        });
      }
      if (selCategory === "oil-change" && category === "tires") {
        contributions.push({
          score: 45,
          reason: "Pair your oil change with a tire rotation",
        });
      }
    }

    // Rule C: Vehicle profile signals
    if (vehicle) {
      const paintType = vehicle.paintType as string | null | undefined;
      if (paintType === "ceramic-coated" && category === "maintenance") {
        contributions.push({
          score: 80,
          reason:
            "Vehicle has ceramic coating on file — maintenance boost recommended",
        });
      }
      if (
        paintType === "wrapped" &&
        (category === "maintenance" || category === "detailing")
      ) {
        contributions.push({
          score: 70,
          reason: "Wrapped vehicles benefit from wrap-safe detailing",
        });
      }
      if (
        paintType === "ppf" &&
        (category === "paint-correction" || category === "detailing")
      ) {
        contributions.push({
          score: 65,
          reason:
            "PPF-protected vehicle — safe paint decontamination recommended",
        });
      }
      if (
        vehicle.mileage != null &&
        vehicle.mileage > 30000 &&
        (category === "tires" || category === "alignment")
      ) {
        contributions.push({
          score: 55,
          reason: "High mileage vehicle — tire inspection recommended",
        });
      }
      if (vehicle.tintPercentage != null && category === "tinting") {
        contributions.push({
          score: 40,
          reason: "Tint on file — check for fading or bubbling",
        });
      }
    }

    // Rule D: First-time client (no completed service history)
    if (historyByServiceId.size === 0) {
      if (category === "ceramic-coating") {
        contributions.push({
          score: 55,
          reason: "Popular upgrade for new clients",
        });
      }
      if (category === "ppf") {
        contributions.push({
          score: 50,
          reason: "Top protection service for new vehicles",
        });
      }
    }

    // Rule E: Never received, popular category
    if (category && !everReceivedCategories.has(category)) {
      if (category === "ceramic-coating") {
        contributions.push({
          score: 45,
          reason: "Client has never tried ceramic coating",
        });
      }
      if (category === "ppf") {
        contributions.push({
          score: 40,
          reason: "Client has never had PPF protection",
        });
      }
    }

    if (contributions.length === 0) continue;

    const totalScore = contributions.reduce((sum, c) => sum + c.score, 0);
    const bestContribution = contributions.reduce(
      (best, c) => (c.score > best.score ? c : best),
      contributions[0]
    );

    scored.push({
      serviceId: service.id,
      name: service.name ?? "",
      category,
      price: service.price ?? 0,
      duration: (service.duration as number | null | undefined) ?? null,
      score: totalScore,
      reason: bestContribution.reason,
    });
  }

  const topRecommendations = scored
    .filter((r) => r.score > 0)
    .filter((r) => !selectedCategories.has(r.category ?? ""))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    recommendations: topRecommendations.map((r) => ({
      serviceId: r.serviceId,
      name: r.name,
      category: r.category,
      price: r.price,
      duration: r.duration,
      reason: r.reason,
      score: r.score,
    })),
  };
};

export const params = {
  clientId: { type: "string" },
  vehicleId: { type: "string" },
  businessId: { type: "string" },
  selectedServiceIds: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
};
