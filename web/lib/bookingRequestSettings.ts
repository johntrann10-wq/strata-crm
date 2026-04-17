export const DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT = 3;
export const DEFAULT_BOOKING_REQUEST_ALTERNATE_OFFER_EXPIRY_HOURS = 48;

export type BookingRequestSettings = {
  requireExactTime: boolean;
  allowTimeWindows: boolean;
  allowFlexibility: boolean;
  allowAlternateSlots: boolean;
  alternateSlotLimit: number;
  alternateOfferExpiryHours: number | null;
  confirmationCopy: string | null;
  ownerResponsePageCopy: string | null;
  alternateAcceptanceCopy: string | null;
  chooseAnotherDayCopy: string | null;
};

export type ServiceBookingRequestPolicy = {
  requireExactTime: boolean | null;
  allowTimeWindows: boolean | null;
  allowFlexibility: boolean | null;
  reviewMessage: string | null;
  allowAlternateSlots: boolean | null;
  alternateSlotLimit: number | null;
  alternateOfferExpiryHours: number | null;
};

function clampAlternateSlotLimit(value: number | null | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_BOOKING_REQUEST_ALTERNATE_SLOT_LIMIT;
  return Math.min(3, Math.max(1, Math.trunc(value as number)));
}

function normalizeAlternateExpiryHours(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(168, Math.max(1, Math.trunc(value)));
}

export function resolveEffectiveBookingRequestSettings(params: {
  business: BookingRequestSettings;
  service?: ServiceBookingRequestPolicy | null;
}): BookingRequestSettings & { reviewMessage: string | null } {
  const servicePolicy = params.service ?? null;
  const requireExactTime = servicePolicy?.requireExactTime ?? params.business.requireExactTime;
  const allowTimeWindows = requireExactTime
    ? false
    : servicePolicy?.allowTimeWindows ?? params.business.allowTimeWindows;

  return {
    requireExactTime,
    allowTimeWindows,
    allowFlexibility: servicePolicy?.allowFlexibility ?? params.business.allowFlexibility,
    allowAlternateSlots: servicePolicy?.allowAlternateSlots ?? params.business.allowAlternateSlots,
    alternateSlotLimit:
      servicePolicy?.alternateSlotLimit != null
        ? clampAlternateSlotLimit(servicePolicy.alternateSlotLimit)
        : clampAlternateSlotLimit(params.business.alternateSlotLimit),
    alternateOfferExpiryHours:
      servicePolicy?.alternateOfferExpiryHours != null
        ? normalizeAlternateExpiryHours(servicePolicy.alternateOfferExpiryHours)
        : normalizeAlternateExpiryHours(params.business.alternateOfferExpiryHours),
    confirmationCopy: params.business.confirmationCopy,
    ownerResponsePageCopy: params.business.ownerResponsePageCopy,
    alternateAcceptanceCopy: params.business.alternateAcceptanceCopy,
    chooseAnotherDayCopy: params.business.chooseAnotherDayCopy,
    reviewMessage: servicePolicy?.reviewMessage ?? null,
  };
}
