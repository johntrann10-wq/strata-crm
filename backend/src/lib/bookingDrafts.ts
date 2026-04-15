export const bookingDraftStatuses = [
  "anonymous_draft",
  "identified_lead",
  "qualified_booking_intent",
  "submitted_request",
  "confirmed_booking",
] as const;

export type BookingDraftStatus = (typeof bookingDraftStatuses)[number];

export type BookingDraftComparableInput = {
  serviceId?: string | null;
  addonServiceIds?: string[] | null;
  serviceMode?: string | null;
  locationId?: string | null;
  bookingDate?: string | null;
  startTime?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  vehicleYear?: number | string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  serviceAddress?: string | null;
  serviceCity?: string | null;
  serviceState?: string | null;
  serviceZip?: string | null;
  notes?: string | null;
  marketingOptIn?: boolean | null;
  source?: string | null;
  campaign?: string | null;
  currentStep?: number | null;
  serviceCategoryFilter?: string | null;
  expandedServiceId?: string | null;
};

function cleanText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanAddonIds(value: string[] | null | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? [])
        .map((item) => cleanText(item))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function hasVehicleContext(input: BookingDraftComparableInput): boolean {
  return Boolean(cleanText(input.vehicleMake) || cleanText(input.vehicleModel) || cleanText(input.vehicleYear?.toString()));
}

function hasTimingContext(input: BookingDraftComparableInput): boolean {
  return Boolean(cleanText(input.bookingDate) || cleanText(input.startTime));
}

function hasIdentifiedContact(input: BookingDraftComparableInput): boolean {
  return Boolean(cleanText(input.email) || cleanText(input.phone));
}

export function hasMeaningfulBookingDraftIntent(input: BookingDraftComparableInput): boolean {
  return Boolean(cleanText(input.serviceId) && (hasIdentifiedContact(input) || hasVehicleContext(input) || hasTimingContext(input)));
}

export function deriveBookingDraftStatus(input: BookingDraftComparableInput): BookingDraftStatus | null {
  if (!hasMeaningfulBookingDraftIntent(input)) {
    return null;
  }
  if (hasIdentifiedContact(input) && (hasVehicleContext(input) || hasTimingContext(input))) {
    return "qualified_booking_intent";
  }
  if (hasIdentifiedContact(input)) {
    return "identified_lead";
  }
  return "anonymous_draft";
}

export function buildBookingDraftComparableSignature(input: BookingDraftComparableInput): string {
  const normalizedStep =
    typeof input.currentStep === "number" && Number.isFinite(input.currentStep)
      ? Math.max(0, Math.floor(input.currentStep))
      : 0;

  return JSON.stringify({
    serviceId: cleanText(input.serviceId),
    addonServiceIds: cleanAddonIds(input.addonServiceIds),
    serviceMode: cleanText(input.serviceMode || "in_shop") || "in_shop",
    locationId: cleanText(input.locationId),
    bookingDate: cleanText(input.bookingDate),
    startTime: cleanText(input.startTime),
    firstName: cleanText(input.firstName),
    lastName: cleanText(input.lastName),
    email: cleanText(input.email).toLowerCase(),
    phone: cleanText(input.phone),
    vehicleYear: cleanText(input.vehicleYear?.toString()),
    vehicleMake: cleanText(input.vehicleMake),
    vehicleModel: cleanText(input.vehicleModel),
    vehicleColor: cleanText(input.vehicleColor),
    serviceAddress: cleanText(input.serviceAddress),
    serviceCity: cleanText(input.serviceCity),
    serviceState: cleanText(input.serviceState),
    serviceZip: cleanText(input.serviceZip),
    notes: cleanText(input.notes),
    marketingOptIn: input.marketingOptIn !== false,
    source: cleanText(input.source),
    campaign: cleanText(input.campaign),
    currentStep: normalizedStep,
    serviceCategoryFilter: cleanText(input.serviceCategoryFilter),
    expandedServiceId: cleanText(input.expandedServiceId),
  });
}
