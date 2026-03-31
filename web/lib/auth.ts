const AUTH_TOKEN_KEY = "authToken";
const CURRENT_BUSINESS_ID_KEY = "currentBusinessId";
const CURRENT_LOCATION_ID_KEY = "currentLocationId";
const AUTH_EVENT_CHANNEL_KEY = "authEventChannel";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getCurrentBusinessId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CURRENT_BUSINESS_ID_KEY);
}

export function setCurrentBusinessId(businessId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENT_BUSINESS_ID_KEY, businessId);
}

export function clearCurrentBusinessId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CURRENT_BUSINESS_ID_KEY);
}

export function getCurrentLocationId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CURRENT_LOCATION_ID_KEY);
}

export function setCurrentLocationId(locationId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENT_LOCATION_ID_KEY, locationId);
}

export function clearCurrentLocationId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CURRENT_LOCATION_ID_KEY);
}

export type AuthEventName = "auth:invalid" | "auth:logout";

export function emitAuthEvent(name: AuthEventName, detail?: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function broadcastAuthEvent(name: AuthEventName, detail?: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AUTH_EVENT_CHANNEL_KEY,
      JSON.stringify({
        name,
        detail,
        at: Date.now(),
      })
    );
  } catch {
    // Ignore storage failures in private mode / quota edge cases.
  }
}

export function clearAuthState(name?: AuthEventName, detail?: unknown): void {
  clearAuthToken();
  clearCurrentBusinessId();
  clearCurrentLocationId();
  if (!name) return;
  emitAuthEvent(name, detail);
  broadcastAuthEvent(name, detail);
}

export function readBroadcastAuthEvent(event: StorageEvent): { name: AuthEventName; detail?: unknown } | null {
  if (event.key !== AUTH_EVENT_CHANNEL_KEY || !event.newValue) return null;
  try {
    const parsed = JSON.parse(event.newValue) as { name?: unknown; detail?: unknown };
    if (parsed.name === "auth:invalid" || parsed.name === "auth:logout") {
      return {
        name: parsed.name,
        detail: parsed.detail,
      };
    }
    return null;
  } catch {
    return null;
  }
}

