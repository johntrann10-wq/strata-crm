declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || "";
const clarityProjectId = import.meta.env.VITE_CLARITY_PROJECT_ID?.trim() || "";

export function getGaMeasurementId() {
  return gaMeasurementId;
}

export function getClarityProjectId() {
  return clarityProjectId;
}

export function analyticsEnabled() {
  return Boolean(gaMeasurementId || clarityProjectId);
}

export function trackPageView(pagePath: string) {
  if (typeof window === "undefined") return;

  window.gtag?.("event", "page_view", {
    page_title: document.title,
    page_location: window.location.href,
    page_path: pagePath,
  });
}

export function trackEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  window.gtag?.("event", eventName, params);
  window.clarity?.("event", eventName);
}

