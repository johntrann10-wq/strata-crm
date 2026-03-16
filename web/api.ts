/**
 * Fetch-based API client for Node API endpoints.
 * Replaces @gadget-client/strata; all requests go to /node-api/* on Vercel,
 * which is rewritten to your Railway backend's /api/*.
 */
/** Base URL for the API. Empty = same origin. */
export const API_BASE =
  typeof window !== "undefined"
    ? ""
    : process.env.API_BASE ?? "";
function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("authToken");
}
async function request<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}/node-api${path}`;
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
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? res.statusText ?? `Request failed ${res.status}`);
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
  // Global actions (POST /node-api/actions/:name)
  getDashboardStats: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/getDashboardStats", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getCapacityInsights: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/getCapacityInsights", { method: "POST", body: JSON.stringify(params ?? {}) }),
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
  // Billing: $29/mo, first month free
  billing: {
    getStatus: () => request<{ status: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null }>("/billing/status"),
    createCheckoutSession: () =>
      request<{ url: string }>("/billing/create-checkout-session", { method: "POST" }),
    createPortalSession: () =>
      request<{ url: string }>("/billing/portal", { method: "POST" }),
  },
} as const;
