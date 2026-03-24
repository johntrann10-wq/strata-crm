import {
  clearAuthToken,
  emitAuthEvent,
  getAuthToken,
  getCurrentBusinessId,
  setAuthToken,
} from "./lib/auth";

/** Standard auth payload from sign-in, sign-up, and GET /auth/me. */
export type AuthUserData = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  token: string;
};

export type AuthContextData = {
  businesses: Array<{
    id: string;
    name: string | null;
    type: string | null;
    role: string;
    status: string;
    isDefault: boolean;
    permissions: string[];
  }>;
  currentBusinessId: string | null;
};

type AuthEnvelope = { data: AuthUserData };
type AuthContextEnvelope = { data: AuthContextData };

/**
 * Fetch-based API client for Node API endpoints.
 * Uses JWT in Authorization header and talks directly to the Express backend.
 *
 * Public API origin (baked at build time):
 * - `VITE_API_URL` or `NEXT_PUBLIC_API_URL` — absolute origin, e.g. https://api.example.com (no trailing slash)
 * - If both unset: empty string → relative `/api/...` (dev: Vite proxy; prod: same-origin + edge proxy when VITE_ALLOW_RELATIVE_API=true at build)
 */
function resolveApiBase(): string {
  // Use `import.meta.env.VITE_*` directly here — assigning `import.meta.env` to a variable
  // breaks Vite's static replacement and can minify to `{}`, ignoring build-time API URLs.
  const raw =
    import.meta.env.VITE_API_URL?.trim() ||
    import.meta.env.NEXT_PUBLIC_API_URL?.trim() ||
    "";
  if (raw) return raw.replace(/\/+$/, "");

  // Development: always same-origin; Vite proxies /api (see vite.config.mts).
  if (import.meta.env.DEV) return "";

  // Production with empty origin: only valid when build used VITE_ALLOW_RELATIVE_API=true (see vite.config.mts).
  if (import.meta.env.PROD && import.meta.env.VITE_ALLOW_RELATIVE_API !== "true") {
    throw new Error(
      "[Strata] Missing VITE_API_URL / NEXT_PUBLIC_API_URL and VITE_ALLOW_RELATIVE_API was not true at build time. Rebuild with env set — see .env.example."
    );
  }
  return "";
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
  const currentBusinessId = getCurrentBusinessId();
  if (currentBusinessId) {
    (headers as any)["x-business-id"] = currentBusinessId;
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
    const errText = await res.text();
    let errBody: { message?: string; detail?: string } = {};
    if (errText) {
      try {
        errBody = JSON.parse(errText) as { message?: string; detail?: string };
      } catch {
        errBody = { message: errText.slice(0, 200) };
      }
    }
    let message =
      errBody.message ?? res.statusText ?? `Request failed ${res.status}`;
    if (res.status === 404 && import.meta.env.PROD) {
      const snippet = errText.slice(0, 120).toLowerCase();
      const looksLikeSpaOrStatic = snippet.includes("<!doctype") || snippet.includes("<html");
      if (looksLikeSpaOrStatic || (!errBody.message && !errText.trim())) {
        message =
          "API not found (404). Set STRATA_API_ORIGIN on Vercel/Netlify for the /api proxy, or VITE_API_URL / NEXT_PUBLIC_API_URL at build time (see DEPLOY.md).";
      }
    }
    throw new ApiError(message, res.status, path, errBody.detail);
  }
  const text = await res.text();
  try {
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    throw new ApiError("Invalid JSON from server", res.status, path);
  }
}

function assertAuthEnvelope(body: unknown, path: string): AuthUserData {
  if (!body || typeof body !== "object") {
    throw new ApiError("Invalid auth response", 500, path);
  }
  const data = (body as AuthEnvelope).data;
  if (
    !data ||
    typeof data.id !== "string" ||
    typeof data.email !== "string" ||
    typeof data.token !== "string"
  ) {
    throw new ApiError("Invalid auth response", 500, path);
  }
  return data;
}

function assertAuthContextEnvelope(body: unknown, path: string): AuthContextData {
  if (!body || typeof body !== "object" || !("data" in body)) {
    throw new ApiError("Invalid auth context response", 500, path);
  }
  const data = (body as AuthContextEnvelope).data;
  if (!data || !Array.isArray(data.businesses)) {
    throw new ApiError("Invalid auth context response", 500, path);
  }
  return data;
}
function resource(path: string) {
  const base = path.startsWith("/") ? path : `/${path}`;
  return {
    findMany: (opts?: {
      filter?: unknown;
      sort?: unknown;
      first?: number;
      select?: unknown;
      search?: string;
      status?: string;
      lost?: boolean;
      /** Appointments: ISO timestamp, inclusive lower bound on `startTime`. */
      startGte?: string;
      /** Appointments: ISO timestamp, inclusive upper bound on `startTime`. */
      startLte?: string;
      /** Appointments: scope list to one client. */
      clientId?: string;
      /** Workflow records: scope list to one vehicle. */
      vehicleId?: string;
      /** Activity feed: scope list to one entity type. */
      entityType?: string;
      /** Activity feed: scope list to one entity id. */
      entityId?: string;
      /** Quotes: draft + sent only (dashboard). */
      pending?: boolean;
      /** Invoices: sent + partial only (dashboard unpaid). */
      unpaid?: boolean;
    }) => {
      const query: Record<string, unknown> = {};
      if (opts?.filter !== undefined) query.filter = opts.filter;
      if (opts?.sort !== undefined) query.sort = opts.sort;
      if (opts?.first !== undefined) query.first = opts.first;
      if (opts?.select !== undefined) query.select = opts.select;
      if (opts?.search !== undefined && opts.search !== "") query.search = opts.search;
      if (opts?.status !== undefined && opts.status !== "" && opts.status !== "all") query.status = opts.status;
      if (opts?.lost === true) query.lost = "1";
      if (opts?.pending === true) query.pending = "1";
      if (opts?.unpaid === true) query.unpaid = "1";
      if (opts?.startGte !== undefined && opts.startGte !== "") query.startGte = opts.startGte;
      if (opts?.startLte !== undefined && opts.startLte !== "") query.startLte = opts.startLte;
      if (opts?.clientId !== undefined && opts.clientId !== "") query.clientId = opts.clientId;
      if (opts?.vehicleId !== undefined && opts.vehicleId !== "") query.vehicleId = opts.vehicleId;
      if (opts?.entityType !== undefined && opts.entityType !== "") query.entityType = opts.entityType;
      if (opts?.entityId !== undefined && opts.entityId !== "") query.entityId = opts.entityId;
      const qs =
        Object.keys(query).length > 0
          ? "?" + new URLSearchParams(serializeQuery(query as Record<string, unknown>)).toString()
          : "";
      return request<{ records?: unknown[] }>(`${base}${qs}`).then((r) => r?.records ?? []);
    },
    findFirst: (opts?: { filter?: unknown; select?: unknown }) =>
      resource(path).findMany({ ...opts, first: 1 }).then((arr) => arr[0] ?? null),
    maybeFindFirst: (opts?: { filter?: unknown; select?: unknown }) =>
      resource(path).findFirst(opts),
    findOne: (id: string, _opts?: Record<string, unknown>) =>
      request<unknown>(`${base}/${encodeURIComponent(id)}`),
    create: (data: Record<string, unknown>) =>
      request<{ record?: unknown }>(base, { method: "POST", body: JSON.stringify(data) }).then((r) => r?.record ?? r),
    /**
     * Supports both `update(id, body)` and `update({ id, ...body })` (hooks often pass a single object).
     */
    update: (idOrParams: string | Record<string, unknown>, data?: Record<string, unknown>) => {
      let id: string;
      let body: Record<string, unknown>;
      if (typeof idOrParams === "string") {
        id = idOrParams;
        body = data ?? {};
      } else if (idOrParams && typeof idOrParams === "object" && typeof idOrParams.id === "string") {
        const { id: rid, ...rest } = idOrParams as Record<string, unknown> & { id: string };
        id = rid;
        body = rest;
      } else {
        throw new Error("update requires id (string or { id })");
      }
      return request<{ record?: unknown }>(`${base}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }).then((r) => r?.record ?? r);
    },
    /** Supports `delete(id)` or `delete({ id })`. */
    delete: (idOrParams: string | Record<string, unknown>) => {
      const id =
        typeof idOrParams === "string"
          ? idOrParams
          : typeof idOrParams?.id === "string"
            ? idOrParams.id
            : null;
      if (!id) throw new Error("delete requires id (string or { id })");
      return request(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
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
  },
  appointmentService: {
    ...resource("appointment-services"),
    complete: (params: Record<string, unknown>) =>
      request<unknown>("/appointment-services/" + (params?.id ?? "") + "/complete", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    reopen: (params: Record<string, unknown>) =>
      request<unknown>("/appointment-services/" + (params?.id ?? "") + "/reopen", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },
  job: resource("jobs"),
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
  activityLog: resource("activity-logs"),
  notificationLog: resource("notification-logs"),
  client: resource("clients"),
  vehicle: resource("vehicles"),
  business: {
    ...resource("businesses"),
    completeOnboarding: (id: string) =>
      request<unknown>(`/businesses/${encodeURIComponent(id)}/completeOnboarding`, { method: "POST" }),
  },
  staff: resource("staff"),
  location: resource("locations"),
  service: (() => {
    const r = resource("services");
    return {
      ...r,
      update: (params: Record<string, unknown>) => {
        const id = params.id as string | undefined;
        if (!id) throw new Error("Service update requires id");
        const { id: _omit, ...body } = params;
        return r.update(id, body);
      },
      delete: (params: Record<string, unknown>) => {
        const id = params.id as string | undefined;
        if (!id) throw new Error("Service delete requires id");
        return r.delete(id);
      },
    };
  })(),
  /** Parent service → optional add-on service (same catalog model). */
  serviceAddonLink: (() => {
    const r = resource("service-addon-links");
    return {
      ...r,
      delete: (params: Record<string, unknown>) => {
        const id = params.id as string | undefined;
        if (!id) throw new Error("id required");
        return r.delete(id);
      },
    };
  })(),
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
    /** One-shot: create appointment from quote + link quote (accepted). */
    schedule: (params: Record<string, unknown>) => {
      const id = params?.id as string | undefined;
      if (!id) throw new Error("quote schedule requires id");
      const { id: _omit, ...body } = params;
      return request<unknown>("/quotes/" + encodeURIComponent(id) + "/schedule", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  },
  quoteLineItem: resource("quote-line-items"),
  user: {
    ...resource("users"),
    signIn: (params: Record<string, unknown>) =>
      request<AuthEnvelope>("/auth/sign-in", { method: "POST", body: JSON.stringify(params) }).then((body) => {
        assertAuthEnvelope(body, "/auth/sign-in");
        return body;
      }),
    signUp: (params: Record<string, unknown>) =>
      request<AuthEnvelope>("/auth/sign-up", { method: "POST", body: JSON.stringify(params) }).then((body) => {
        assertAuthEnvelope(body, "/auth/sign-up");
        return body;
      }),
    signOut: () => request("/auth/sign-out", { method: "POST" }),
    /** Validates JWT, returns user + fresh token (persisted to localStorage). */
    me: () =>
      request<AuthEnvelope>("/auth/me").then((body) => {
        const d = assertAuthEnvelope(body, "/auth/me");
        setAuthToken(d.token);
        return d;
      }),
    context: () =>
      request<AuthContextEnvelope>("/auth/context").then((body) =>
        assertAuthContextEnvelope(body, "/auth/context")
      ),
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
  getInvoiceMetrics: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/getInvoiceMetrics", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getBusinessPreset: () =>
    request<{ group: string; count: number; names: string[] }>("/actions/getBusinessPreset", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  applyBusinessPreset: () =>
    request<{ ok: true; created: number; skipped: number; group: string }>("/actions/applyBusinessPreset", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  // Billing: $29/mo, first month free
  billing: {
    getStatus: () => request<{ status: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null }>("/billing/status"),
    createCheckoutSession: () =>
      request<{ url: string }>("/billing/create-checkout-session", { method: "POST" }),
    createPortalSession: () =>
      request<{ url: string }>("/billing/portal", { method: "POST" }),
  },
} as const;
