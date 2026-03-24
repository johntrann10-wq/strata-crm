const AUTH_TOKEN_KEY = "authToken";
const CURRENT_BUSINESS_ID_KEY = "currentBusinessId";

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

export type AuthEventName = "auth:invalid" | "auth:logout";

export function emitAuthEvent(name: AuthEventName, detail?: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

