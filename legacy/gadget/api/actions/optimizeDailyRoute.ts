import { ActionOptions } from "gadget-server";

export const run: ActionRun = async ({ params, api, session }) => {
  const userId = session?.get("user") as string | undefined;

  if (!userId || !params.date) {
    return { stops: [], mapsUrl: "", totalStops: 0, mobileStops: 0, shopStops: 0 };
  }

  const dayStart = new Date(params.date + "T00:00:00.000Z");
  const dayEnd = new Date(params.date + "T23:59:59.999Z");

  const appointments = await api.appointment.findMany({
    filter: {
      AND: [
        { businessId: { equals: userId } },
        { startTime: { greaterThanOrEqual: dayStart } },
        { startTime: { lessThanOrEqual: dayEnd } },
        { NOT: [{ status: { in: ["cancelled", "no-show"] } }] },
      ],
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      mobileAddress: true,
      isMobile: true,
      totalPrice: true,
      client: {
        firstName: true,
        lastName: true,
        phone: true,
      },
      vehicle: {
        year: true,
        make: true,
        model: true,
      },
    },
    sort: { startTime: "Ascending" },
    first: 50,
  });

  const shopAppts = appointments
    .filter((a) => !a.isMobile || !a.mobileAddress)
    .sort((a, b) => new Date(a.startTime ?? 0).getTime() - new Date(b.startTime ?? 0).getTime());

  const mobileAppts = appointments
    .filter((a) => a.isMobile && a.mobileAddress)
    .sort((a, b) => (a.mobileAddress ?? "").localeCompare(b.mobileAddress ?? ""));

  const combined = [...shopAppts, ...mobileAppts];

  const mapsUrl =
    mobileAppts.length > 0
      ? "https://www.google.com/maps/dir/" +
        mobileAppts.map((a) => encodeURIComponent(a.mobileAddress!)).join("/")
      : "";

  const stops = combined.map((appt, index) => {
    const clientName = appt.client
      ? `${appt.client.firstName} ${appt.client.lastName}`
      : "";
    const vehicleLabel = appt.vehicle
      ? [appt.vehicle.year, appt.vehicle.make, appt.vehicle.model].filter(Boolean).join(" ")
      : "";
    const address = appt.mobileAddress || "Shop Drop-off";
    const mapsLink =
      appt.isMobile && appt.mobileAddress
        ? "https://www.google.com/maps/search/" + encodeURIComponent(appt.mobileAddress)
        : undefined;

    return {
      stopNumber: index + 1,
      id: appt.id,
      title: appt.title,
      clientName,
      vehicleLabel,
      address,
      isMobile: appt.isMobile,
      status: appt.status,
      startTime: appt.startTime,
      endTime: appt.endTime,
      totalPrice: appt.totalPrice,
      mapsLink,
    };
  });

  return {
    stops,
    mapsUrl,
    totalStops: combined.length,
    mobileStops: mobileAppts.length,
    shopStops: shopAppts.length,
  };
};

export const params = {
  date: { type: "string" },
};

export const options: ActionOptions = {
  triggers: { api: true },
  returnType: true,
};