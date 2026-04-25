import { isNativeShell, openNativeBrowserUrl } from "@/lib/mobileShell";

const DEFAULT_PUBLIC_APP_ORIGIN = "https://stratacrm.app";

function normalizeHttpOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function getCurrentClientOrigin(): string | null {
  if (typeof window === "undefined") return null;
  const origin = window.location.origin?.trim();
  if (!origin) return null;
  return origin.replace(/\/+$/, "");
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

export function getPublicAppBaseUrl(): string {
  const explicit =
    normalizeHttpOrigin(import.meta.env.VITE_PUBLIC_APP_URL) ??
    normalizeHttpOrigin(import.meta.env.VITE_FRONTEND_URL);

  if (explicit) return explicit;
  if (typeof window === "undefined") return DEFAULT_PUBLIC_APP_ORIGIN;
  if (isNativeShell()) return DEFAULT_PUBLIC_APP_ORIGIN;

  const currentOrigin = normalizeHttpOrigin(getCurrentClientOrigin());
  if (!currentOrigin) return DEFAULT_PUBLIC_APP_ORIGIN;

  try {
    const url = new URL(currentOrigin);
    if (isLoopbackHost(url.hostname)) return currentOrigin;
    if (url.protocol === "https:") return currentOrigin;
  } catch {
    return DEFAULT_PUBLIC_APP_ORIGIN;
  }

  return DEFAULT_PUBLIC_APP_ORIGIN;
}

export function buildPublicBookingUrl(businessId: string | null | undefined): string {
  if (!businessId) return "";
  return `${getPublicAppBaseUrl()}/book/${encodeURIComponent(businessId)}`;
}

export function buildPreviewBookingUrl(businessId: string | null | undefined): string {
  if (!businessId) return "";
  const origin = getCurrentClientOrigin() ?? getPublicAppBaseUrl();
  return `${origin}/book/${encodeURIComponent(businessId)}`;
}

export function openExternalUrl(url: string): void {
  if (!url || typeof window === "undefined") return;

  if (isNativeShell()) {
    void openNativeBrowserUrl(url).catch(() => {
      window.location.assign(url);
    });
    return;
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(url);
  }
}
