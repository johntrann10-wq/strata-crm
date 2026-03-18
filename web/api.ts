import { clearAuthToken, emitAuthEvent, getAuthToken } from "./lib/auth";

/**
 * Fetch-based API client for Node API endpoints.
 * Uses JWT in Authorization header and talks directly to the Express backend.
 */
/** Base URL for the backend API (your Railway/Express backend). */
function resolveApiBase(): string {
  const apiBaseFromViteEnv = (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
  const trimmed = apiBaseFromViteEnv?.trim();
  if (trimmed) return trimmed;

  // Local dev: rely on same-origin `/api` (Vite proxy in `vite.config.mts`).
  if (import.meta.env.DEV) return "";

  // Production: fail loudly so misconfiguration is obvious.
  throw new Error(
    "Strata config error: VITE_API_URL is required in production builds. " +
      "Set it to your backend origin (e.g. https://your-api.example.com)."
  );
}

// Base origin for browser API calls.
export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  status: number;
  path: string;
  detail?: string;
  constructor(message: string, status: number, path: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.detail = detail;
  }
}

function getToken() {
  return getAuthToken();
}
async function request<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}/api${path}`;
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...init.headers,
  };
  if (token) {
    (headers as any).Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    ...init,
    headers,
  });
  if (!res.ok) {
    // Special-case 402 for businesses so onboarding is never blocked
    if (res.status === 402 && path.startsWith("/businesses")) {
      return { records: [] } as T;
    }
    if (res.status === 401 || res.status === 403) {
      // Invalid/expired token: clear local auth so boot + protected pages can redirect predictably.
      clearAuthToken();
      emitAuthEvent("auth:invalid", { status: res.status, path });
    }
    const errBody = (await res.json().catch(() => ({}))) as { message?: string; detail?: string };
    const message = errBody.message ?? res.statusText ?? `Request failed ${res.status}`;
    throw new ApiError(message, res.status, path, errBody.detail);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
function resource(path: string) {
  const base = path.startsWith("/") ? path : `/${path}`;
  return {
    findMany: (opts?: { filter?: unknown; sort?: unknown; first?: number; select?: unknown }) => {
      const query = opts ? { filter: opts.filter, sort: opts.sort, first: opts.first, select: opts.select } : {};
      const search = Object.keys(query).length ? "?" + new URLSearchParams(serializeQuery(query as Record<string, unknown>)).toString() : "";
      return request<{ records?: unknown[] }>(`${base}${search}`).then((r) => r?.records ?? []);
    },
    findFirst: (opts?: { filter?: unknown; select?: unknown }) =>
      resource(path).findMany({ ...opts, first: 1 }).then((arr) => arr[0] ?? null),
    maybeFindFirst: (opts?: { filter?: unknown; select?: unknown }) =>
      resource(path).findFirst(opts),
    findOne: (id: string, _opts?: Record<string, unknown>) =>
      request<unknown>(`${base}/${encodeURIComponent(id)}`),
    create: (data: Record<string, unknown>) =>
      request<{ record?: unknown }>(base, { method: "POST", body: JSON.stringify(data) }).then((r) => r?.record ?? r),
    update: (id: string, data: Record<string, unknown>) =>
      request<{ record?: unknown }>(`${base}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }).then((r) => r?.record ?? r),
    delete: (id: string) =>
      request(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}
function serializeQuery(q: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return out;
}
function action(path: string) {
  const [resourceName, actionName] = path.split("/").filter(Boolean);
  const base = `/${resourceName}`;
  return (params?: Record<string, unknown>) =>
    request<{ data?: unknown; error?: { message?: string } }>(
      actionName ? `${base}/${actionName}` : base,
      { method: "POST", body: JSON.stringify(params ?? {}) }
    );
}
// Resource endpoints matching your Node API and frontend usage
export const api = {
  appointment: {
    ...resource("appointments"),
    updateStatus: (params: Record<string, unknown>) =>
      request<unknown>("/appointments/" + (params?.id ?? "") + "/updateStatus", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    complete: (params: Record<string, unknown>) =>
      request<unknown>("/appointments/" + (params?.id ?? "") + "/complete", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    cancel: (params: Record<string, unknown>) =>
      request<unknown>("/appointments/" + (params?.id ?? "") + "/cancel", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    resendReviewRequest: (params: Record<string, unknown>) =>
      request<unknown>("/appointments/" + (params?.id ?? "") + "/resendReviewRequest", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },
  appointmentService: resource("appointment-services"),
  appointmentPhoto: resource("appointment-photos"),
  invoice: {
    ...resource("invoices"),
    sendToClient: (params: Record<string, unknown>) =>
      request<unknown>("/invoices/" + (params?.id ?? "") + "/sendToClient", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    voidInvoice: (params: Record<string, unknown>) =>
      request<unknown>("/invoices/" + (params?.id ?? "") + "/void", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },
  invoiceLineItem: resource("invoice-line-items"),
  payment: {
    ...resource("payments"),
    reversePayment: (params: Record<string, unknown>) =>
      request<unknown>("/payments/" + (params?.id ?? "") + "/reverse", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },
  client: resource("clients"),
  vehicle: resource("vehicles"),
  vehicleInspection: resource("vehicle-inspections"),
  business: {
    ...resource("businesses"),
    completeOnboarding: (id: string) =>
      request<unknown>(`/businesses/${encodeURIComponent(id)}/completeOnboarding`, { method: "POST" }),
  },
  staff: resource("staff"),
  location: resource("locations"),
  service: resource("services"),
  serviceInventoryItem: resource("service-inventory-items"),
  quote: {
    ...resource("quotes"),
    send: (params: Record<string, unknown>) =>
      request<unknown>("/quotes/" + (params?.id ?? "") + "/send", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    sendFollowUp: (params: Record<string, unknown>) =>
      request<unknown>("/quotes/" + (params?.id ?? "") + "/sendFollowUp", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },
  quoteLineItem: resource("quote-line-items"),
  inventoryItem: resource("inventory-items"),
  activityLog: resource("activity-logs"),
  notificationLog: resource("notification-logs"),
  systemErrorLog: resource("system-error-logs"),
  backupSnapshot: resource("backup-snapshots"),
  automationLog: resource("automation-logs"),
  automationRule: resource("automation-rules"),
  user: {
    ...resource("users"),
    signIn: (params: Record<string, unknown>) =>
      request<unknown>("/auth/sign-in", { method: "POST", body: JSON.stringify(params) }),
    signUp: (params: Record<string, unknown>) =>
      request<unknown>("/auth/sign-up", { method: "POST", body: JSON.stringify(params) }),
    signOut: () => request("/auth/sign-out", { method: "POST" }),
    me: () => request<{ id: string; email: string; firstName?: string; lastName?: string }>("/auth/me"),
    sendResetPassword: (params: Record<string, unknown>) =>
      request<unknown>("/auth/forgot-password", { method: "POST", body: JSON.stringify(params) }),
    resetPassword: (params: Record<string, unknown>) =>
      request<unknown>("/auth/reset-password", { method: "POST", body: JSON.stringify(params) }),
    update: (params: Record<string, unknown>) =>
      request<unknown>("/users/" + (params?.id ?? "") + "/update", {
        method: "PATCH",
        body: JSON.stringify(params),
      }),
    changePassword: (params: Record<string, unknown>) =>
      request<unknown>("/users/change-password", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    findOne: (id: string, _opts?: Record<string, unknown>) =>
      request<unknown>(`/users/${encodeURIComponent(id)}`),
  },
  // Global actions (POST /api/actions/:name)
  getDashboardStats: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/getDashboardStats", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getCapacityInsights: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/getCapacityInsights", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getInvoiceMetrics: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/getInvoiceMetrics", { method: "POST", body: JSON.stringify(params ?? {}) }),
  generatePortalToken: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/generatePortalToken", { method: "POST", body: JSON.stringify(params ?? {}) }),
  restoreClient: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/restoreClient", { method: "POST", body: JSON.stringify(params ?? {}) }),
  restoreVehicle: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/restoreVehicle", { method: "POST", body: JSON.stringify(params ?? {}) }),
  restoreService: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/restoreService", { method: "POST", body: JSON.stringify(params ?? {}) }),
  unvoidInvoice: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/unvoidInvoice", { method: "POST", body: JSON.stringify(params ?? {}) }),
  reversePayment: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/reversePayment", { method: "POST", body: JSON.stringify(params ?? {}) }),
  revertRecord: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/revertRecord", { method: "POST", body: JSON.stringify(params ?? {}) }),
  retryFailedNotifications: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/retryFailedNotifications", { method: "POST", body: JSON.stringify(params ?? {}) }),
  createBackup: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/createBackup", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getAnalyticsData: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/getAnalyticsData", { method: "POST", body: JSON.stringify(params ?? {}) }),
  optimizeDailyRoute: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/optimizeDailyRoute", { method: "POST", body: JSON.stringify(params ?? {}) }),
  // Lightweight client-side helpers for appointment UX; backend endpoints are not required for launch.
  checkAvailability: (params?: Record<string, unknown>) =>
    Promise.resolve({
      available: true,
      staffConflicts: [],
      businessConflicts: [],
    } as unknown),
  getUpsellRecommendations: (params?: Record<string, unknown>) =>
    Promise.resolve({
      recommendations: [],
    } as unknown),
  estimateDuration: (params?: Record<string, unknown>) =>
    Promise.resolve({
      totalEstimatedMinutes: null,
    } as unknown),
  // Billing: $29/mo, first month free
  billing: {
    getStatus: () => request<{ status: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null }>("/billing/status"),
    createCheckoutSession: () =>
      request<{ url: string }>("/billing/create-checkout-session", { method: "POST" }),
    createPortalSession: () =>
      request<{ url: string }>("/billing/portal", { method: "POST" }),
  },
} as const;
