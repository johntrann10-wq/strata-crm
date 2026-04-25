import { isNativeShell } from "./mobileShell";

const DEFAULT_PUBLIC_APP_ORIGIN = "https://stratacrm.app";

function normalizeOrigin(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getPublicAppOrigin(): string {
  const configuredOrigin = normalizeOrigin(import.meta.env.VITE_PUBLIC_APP_URL?.trim());
  if (configuredOrigin) return configuredOrigin;

  if (typeof window !== "undefined" && !isNativeShell()) {
    const browserOrigin = normalizeOrigin(window.location.origin);
    if (browserOrigin) return browserOrigin;
  }

  return DEFAULT_PUBLIC_APP_ORIGIN;
}

export function buildPublicBookingUrl(businessId: string): string {
  return `${getPublicAppOrigin()}/book/${encodeURIComponent(businessId)}`;
}

export function buildLocalBookingPreviewUrl(businessId: string): string {
  const path = `/book/${encodeURIComponent(businessId)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin.replace(/\/+$/, "")}${path}`;
}
