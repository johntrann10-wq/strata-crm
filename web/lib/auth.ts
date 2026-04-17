const CURRENT_BUSINESS_ID_KEY = "currentBusinessId";
const CURRENT_LOCATION_ID_KEY = "currentLocationId";
const AUTH_EVENT_CHANNEL_KEY = "authEventChannel";
const SESSION_AUTH_TOKEN_KEY = "strataSessionAuthToken";
const LEGACY_AUTH_TOKEN_KEY = "authToken";
let inMemoryAuthToken: string | null = null;

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures for restricted documents or private mode edge cases.
  }
}

function safeLocalStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures for restricted documents or private mode edge cases.
  }
}

function safeSessionStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function safeSessionStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

export function getAuthToken(): string | null {
  if (!inMemoryAuthToken) {
    inMemoryAuthToken = safeSessionStorageGet(SESSION_AUTH_TOKEN_KEY);
  }
  return inMemoryAuthToken;
}

export function setAuthToken(token: string): void {
  inMemoryAuthToken = token;
  safeSessionStorageSet(SESSION_AUTH_TOKEN_KEY, token);
}

export function persistAuthState(token: string, detail?: unknown): void {
  if (typeof window === "undefined") return;
  setAuthToken(token);
  emitAuthEvent("auth:login", detail);
  broadcastAuthEvent("auth:login", detail);
}

export function clearAuthToken(): void {
  inMemoryAuthToken = null;
  safeSessionStorageRemove(SESSION_AUTH_TOKEN_KEY);
  safeLocalStorageRemove(LEGACY_AUTH_TOKEN_KEY);
}

export function getCurrentBusinessId(): string | null {
  return safeLocalStorageGet(CURRENT_BUSINESS_ID_KEY);
}

export function setCurrentBusinessId(businessId: string): void {
  safeLocalStorageSet(CURRENT_BUSINESS_ID_KEY, businessId);
}

export function clearCurrentBusinessId(): void {
  safeLocalStorageRemove(CURRENT_BUSINESS_ID_KEY);
}

export function getCurrentLocationId(): string | null {
  return safeLocalStorageGet(CURRENT_LOCATION_ID_KEY);
}

export function setCurrentLocationId(locationId: string): void {
  safeLocalStorageSet(CURRENT_LOCATION_ID_KEY, locationId);
}

export function clearCurrentLocationId(): void {
  safeLocalStorageRemove(CURRENT_LOCATION_ID_KEY);
}

export type AuthEventName = "auth:invalid" | "auth:logout" | "auth:login";

export function emitAuthEvent(name: AuthEventName, detail?: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function broadcastAuthEvent(name: AuthEventName, detail?: unknown): void {
  if (typeof window === "undefined") return;
  try {
    safeLocalStorageSet(
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
    if (parsed.name === "auth:invalid" || parsed.name === "auth:logout" || parsed.name === "auth:login") {
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

export function parseAuthTokenFromHash(hash: string | null | undefined): { token: string | null; cleanedHash: string } {
  const value = typeof hash === "string" ? hash : "";
  if (!value || !value.includes("authToken=")) {
    return { token: null, cleanedHash: value };
  }
  const params = new URLSearchParams(value.replace(/^#/, ""));
  const token = params.get("authToken");
  if (!token) return { token: null, cleanedHash: value };
  params.delete("authToken");
  const remainder = params.toString();
  return { token, cleanedHash: remainder ? `#${remainder}` : "" };
}

