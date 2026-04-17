import { buildPublicDocumentUrl } from "./publicDocumentAccess.js";

export const bookingBrandLogoFitModes = ["contain", "cover", "wordmark"] as const;
export const bookingBrandLogoBackgroundPlates = ["auto", "light", "dark", "none"] as const;

export type BookingBrandLogoFitMode = (typeof bookingBrandLogoFitModes)[number];
export type BookingBrandLogoBackgroundPlate = (typeof bookingBrandLogoBackgroundPlates)[number];

export type BookingBrandLogoTransform = {
  version: 1;
  fitMode: BookingBrandLogoFitMode;
  backgroundPlate: BookingBrandLogoBackgroundPlate;
  rotationDeg: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export const defaultBookingBrandLogoTransform: BookingBrandLogoTransform = {
  version: 1,
  fitMode: "contain",
  backgroundPlate: "auto",
  rotationDeg: 0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeBookingBrandLogoFitMode(value: string | null | undefined): BookingBrandLogoFitMode {
  return value === "cover" || value === "wordmark" ? value : "contain";
}

export function normalizeBookingBrandLogoBackgroundPlate(
  value: string | null | undefined
): BookingBrandLogoBackgroundPlate {
  return value === "light" || value === "dark" || value === "none" ? value : "auto";
}

export function normalizeBookingBrandLogoTransform(
  value: Partial<BookingBrandLogoTransform> | null | undefined
): BookingBrandLogoTransform {
  return {
    version: 1,
    fitMode: normalizeBookingBrandLogoFitMode(value?.fitMode),
    backgroundPlate: normalizeBookingBrandLogoBackgroundPlate(value?.backgroundPlate),
    rotationDeg: Number.isFinite(value?.rotationDeg)
      ? Math.round(clamp(Number(value?.rotationDeg), -180, 180) * 10) / 10
      : defaultBookingBrandLogoTransform.rotationDeg,
    zoom: Number.isFinite(value?.zoom)
      ? Math.round(clamp(Number(value?.zoom), 1, 4) * 100) / 100
      : defaultBookingBrandLogoTransform.zoom,
    offsetX: Number.isFinite(value?.offsetX)
      ? Math.round(clamp(Number(value?.offsetX), -2, 2) * 1000) / 1000
      : defaultBookingBrandLogoTransform.offsetX,
    offsetY: Number.isFinite(value?.offsetY)
      ? Math.round(clamp(Number(value?.offsetY), -2, 2) * 1000) / 1000
      : defaultBookingBrandLogoTransform.offsetY,
  };
}

export function parseBookingBrandLogoTransform(
  raw: string | null | undefined
): BookingBrandLogoTransform {
  const normalized = raw?.trim();
  if (!normalized) return defaultBookingBrandLogoTransform;
  try {
    return normalizeBookingBrandLogoTransform(JSON.parse(normalized) as Partial<BookingBrandLogoTransform>);
  } catch {
    return defaultBookingBrandLogoTransform;
  }
}

export function serializeBookingBrandLogoTransform(
  value: Partial<BookingBrandLogoTransform> | null | undefined
): string {
  return JSON.stringify(normalizeBookingBrandLogoTransform(value));
}

export function buildPublicBookingBrandLogoPath(businessId: string): string {
  return `/api/businesses/${encodeURIComponent(businessId)}/public-booking-brand-logo`;
}

export function buildPublicBookingBrandLogoUrl(businessId: string): string {
  return buildPublicDocumentUrl(buildPublicBookingBrandLogoPath(businessId));
}

export function buildPublicBookingPreviewImagePath(businessId: string): string {
  return `/api/businesses/${encodeURIComponent(businessId)}/public-booking-preview.svg`;
}

export function buildPublicBookingPreviewImageUrl(businessId: string): string {
  return buildPublicDocumentUrl(buildPublicBookingPreviewImagePath(businessId));
}

export function resolveBookingBrandLogoPlateStyles(
  backgroundPlate: BookingBrandLogoBackgroundPlate | null | undefined
): {
  background: string;
  border: string;
  shadow: string;
  imageFilter: string;
  monogramBackground: string;
  monogramForeground: string;
} {
  switch (normalizeBookingBrandLogoBackgroundPlate(backgroundPlate)) {
    case "dark":
      return {
        background: "#0f172a",
        border: "rgba(51,65,85,0.9)",
        shadow: "0 20px 40px rgba(15,23,42,0.16)",
        imageFilter: "drop-shadow(0 2px 18px rgba(255,255,255,0.18))",
        monogramBackground: "#0f172a",
        monogramForeground: "#ffffff",
      };
    case "none":
      return {
        background: "transparent",
        border: "transparent",
        shadow: "none",
        imageFilter: "drop-shadow(0 8px 18px rgba(15,23,42,0.14))",
        monogramBackground: "#f97316",
        monogramForeground: "#ffffff",
      };
    case "auto":
    case "light":
    default:
      return {
        background: "rgba(255,255,255,0.98)",
        border: "rgba(226,232,240,0.95)",
        shadow: "0 18px 36px rgba(15,23,42,0.08)",
        imageFilter:
          "drop-shadow(0 1px 0 rgba(255,255,255,0.9)) drop-shadow(0 8px 18px rgba(15,23,42,0.12))",
        monogramBackground: "#f97316",
        monogramForeground: "#ffffff",
      };
  }
}
