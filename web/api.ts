import { clearAuthState, getAuthToken, getCurrentBusinessId } from "./lib/auth";
import type { HomeDashboardRange, HomeDashboardSnapshot } from "./lib/homeDashboard";
import { recordReliabilityDiagnostic } from "./lib/reliabilityDiagnostics";

const DEFAULT_NATIVE_SHELL_API_ORIGIN = "https://stratacrm.app";

/** Standard auth payload from sign-in, sign-up, and GET /auth/me. */
export type AuthUserData = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  googleProfileId: string | null;
  appleSubject: string | null;
  appleEmailIsPrivateRelay: boolean;
  hasPassword: boolean;
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

function shouldUseSameOriginApi(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith(".vercel.app") ||
    host.endsWith(".netlify.app")
  );
}

function isNativeShellRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "capacitor:";
}

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

  // Capacitor shells cannot rely on relative `/api/*` paths because the app
  // runs from `capacitor://localhost`, not the public website origin.
  if (isNativeShellRuntime()) return DEFAULT_NATIVE_SHELL_API_ORIGIN;

  // Use same-origin /api on Vercel/Netlify only when no explicit API origin was baked into the client.
  if (import.meta.env.PROD && shouldUseSameOriginApi()) return "";

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
const inFlightGetRequests = new Map<string, Promise<unknown>>();

function buildApiUrl(path: string, baseOverride?: string): string {
  if (path.startsWith("http")) return path;
  return `${baseOverride ?? API_BASE}/api${path}`;
}

function buildInFlightRequestKey(params: {
  method: string;
  url: string;
  authToken?: string | null;
  businessId?: string | null;
  hasAbortSignal?: boolean;
}): string | null {
  if (params.method !== "GET") return null;
  if (params.hasAbortSignal) return null;
  return [params.method, params.url, params.authToken ?? "", params.businessId ?? ""].join("|");
}

async function performRequest(url: string, init: RequestInit): Promise<Response> {
  return await fetch(url, init);
}

function isAbortLikeRequestError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  const message = error.message.toLowerCase();
  return (
    message.includes("abort") ||
    message.includes("aborted") ||
    message.includes("request was cancelled") ||
    message.includes("request was canceled")
  );
}

export class ApiError extends Error {
  status: number;
  path: string;
  detail?: string;
  code?: string;
  constructor(message: string, status: number, path: string, detail?: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.detail = detail;
    this.code = code;
  }
}

function isExpectedSubscriptionRestriction(params: {
  status: number;
  method: string;
  code?: string;
}): boolean {
  return (
    params.status === 402 &&
    params.code === "SUBSCRIPTION_REQUIRED" &&
    params.method.toUpperCase() === "GET"
  );
}

function emitSubscriptionRequired(path: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("subscription:required", { detail: { path } }));
}

function shouldInvalidateHomeDashboard(path: string, method: string): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) return false;
  return [
    "/businesses",
    "/clients",
    "/appointments",
    "/quotes",
    "/invoices",
    "/payments",
    "/staff",
    "/locations",
    "/actions/runAutomations",
    "/actions/runIntegrationJobs",
  ].some((prefix) => path.startsWith(prefix));
}

function emitHomeDashboardInvalidated(path: string, method: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("dashboard:invalidate", {
      detail: {
        path,
        method,
        at: new Date().toISOString(),
      },
    })
  );
}

type AppRequestInit = RequestInit & {
  suppressAuthInvalidation?: boolean;
};

async function request<T = unknown>(
  path: string,
  init: AppRequestInit = {}
): Promise<T> {
  const url = buildApiUrl(path);
  const method = (init.method ?? "GET").toUpperCase();
  const suppressAuthInvalidation = init.suppressAuthInvalidation === true;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...init.headers,
  };
  const authToken = getAuthToken();
  if (authToken && !(headers as Record<string, string>).Authorization) {
    (headers as Record<string, string>).Authorization = `Bearer ${authToken}`;
  }
  const currentBusinessId = getCurrentBusinessId();
  if (currentBusinessId) {
    (headers as any)["x-business-id"] = currentBusinessId;
  }
  let res: Response;
  const { suppressAuthInvalidation: _ignoredSuppressAuthInvalidation, ...fetchInit } = init;
  const requestInit: RequestInit = {
    ...fetchInit,
    headers,
    credentials: "include",
  };
  const execute = async (): Promise<T> => {
    try {
      res = await performRequest(url, requestInit);
    } catch (error) {
      if (isAbortLikeRequestError(error)) {
        throw new ApiError("Request was cancelled", 0, path, undefined, "REQUEST_ABORTED");
      }
      const message = error instanceof Error ? error.message : "Network request failed";
      const canRetrySameOrigin =
        import.meta.env.PROD &&
        typeof window !== "undefined" &&
        API_BASE &&
        !path.startsWith("http");

      if (canRetrySameOrigin) {
        try {
          const fallbackUrl = buildApiUrl(path, "");
          res = await performRequest(fallbackUrl, requestInit);
        } catch {
          recordReliabilityDiagnostic({
            source: "api.network",
            severity: "warning",
            message: `Primary API origin failed for ${method} ${path}; same-origin fallback also failed`,
            method,
            path,
            detail: message,
          });
          throw new ApiError(message, 0, path);
        }
      } else {
        recordReliabilityDiagnostic({
          source: "api.network",
          severity: "error",
          message: `Network request failed for ${method} ${path}`,
          method,
          path,
          detail: message,
        });
        throw new ApiError(message, 0, path);
      }
    }
    if (
      import.meta.env.PROD &&
      typeof window !== "undefined" &&
      API_BASE &&
      !path.startsWith("http") &&
      res.status === 404
    ) {
      try {
        const fallbackUrl = buildApiUrl(path, "");
        const fallbackRes = await performRequest(fallbackUrl, requestInit);
        res = fallbackRes;
      } catch {
        // Keep the original response and let normal error handling below explain it.
      }
    }
    if (res.ok && shouldInvalidateHomeDashboard(path, method)) {
      emitHomeDashboardInvalidated(path, method);
    }
    if (!res.ok) {
      // Special-case 402 for businesses so onboarding is never blocked
      if (res.status === 402 && path.startsWith("/businesses")) {
        return { records: [] } as T;
      }
      if (res.status === 401 && !suppressAuthInvalidation) {
        // Invalid/expired token: clear local auth so boot + protected pages can redirect predictably.
        clearAuthState("auth:invalid", { status: res.status, path });
        recordReliabilityDiagnostic({
          source: "auth.invalid",
          severity: "warning",
          message: `Authentication expired or was rejected for ${method} ${path}`,
          method,
          path,
          status: res.status,
        });
      }
      const errText = await res.text();
      let errBody: { message?: string; detail?: string; code?: string } = {};
      if (errText) {
        try {
          errBody = JSON.parse(errText) as { message?: string; detail?: string; code?: string };
        } catch {
          errBody = { message: errText.slice(0, 200) };
        }
      }
      if (res.status === 402 && errBody.code === "SUBSCRIPTION_REQUIRED") {
        emitSubscriptionRequired(path);
      }
      let message =
        errBody.message ?? res.statusText ?? `Request failed ${res.status}`;
      const looksLikeHtmlFallback =
        res.status === 404 &&
        import.meta.env.PROD &&
        (errText.slice(0, 120).toLowerCase().includes("<!doctype") ||
          errText.slice(0, 120).toLowerCase().includes("<html"));
      if (looksLikeHtmlFallback && path === "/auth/apple/native") {
        message =
          "Sign in with Apple is not available on the deployed server for this build yet. Update the backend deployment and try again.";
      }
      if (res.status === 404 && import.meta.env.PROD) {
        const snippet = errText.slice(0, 120).toLowerCase();
        const looksLikeSpaOrStatic = snippet.includes("<!doctype") || snippet.includes("<html");
        if (looksLikeSpaOrStatic || (!errBody.message && !errText.trim())) {
          message =
            "API not found (404). Set STRATA_API_ORIGIN on Vercel/Netlify for the /api proxy, or VITE_API_URL / NEXT_PUBLIC_API_URL at build time (see DEPLOY.md).";
        }
      }
      if (!isExpectedSubscriptionRestriction({ status: res.status, method, code: errBody.code })) {
        recordReliabilityDiagnostic({
          source: "api.http",
          severity: res.status >= 500 ? "error" : "warning",
          message,
          method,
          path,
          status: res.status,
          detail: errBody.detail ?? errText.slice(0, 300),
        });
      }
      throw new ApiError(message, res.status, path, errBody.detail, errBody.code);
    }

    const text = await res.text();
    try {
      return (text ? JSON.parse(text) : null) as T;
    } catch {
      recordReliabilityDiagnostic({
        source: "api.parse",
        severity: "error",
        message: `Invalid JSON received for ${method} ${path}`,
        method,
        path,
        status: res.status,
        detail: text.slice(0, 300),
      });
      throw new ApiError("Invalid JSON from server", res.status, path);
    }
  };

  const requestKey = buildInFlightRequestKey({
    method,
    url,
    authToken,
    businessId: currentBusinessId,
    hasAbortSignal:
      typeof AbortSignal !== "undefined" && init.signal instanceof AbortSignal,
  });
  if (!requestKey) {
    return execute();
  }

  const existingRequest = inFlightGetRequests.get(requestKey) as Promise<T> | undefined;
  if (existingRequest) {
    return existingRequest;
  }

  const pendingRequest = execute().finally(() => {
    inFlightGetRequests.delete(requestKey);
  });
  inFlightGetRequests.set(requestKey, pendingRequest);
  return pendingRequest;
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
  const findMany = (opts?: {
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
      /** Workflow records: scope list to one location. */
      locationId?: string;
      /** Activity feed: scope list to one entity type. */
      entityType?: string;
      /** Activity feed: scope list to one entity id. */
      entityId?: string;
      /** Optional shell data that should not force a logout on transient 401s. */
      suppressAuthInvalidation?: boolean;
      /** Quotes: draft + sent only (dashboard). */
      pending?: boolean;
      /** Invoices: sent + partial only (dashboard unpaid). */
      unpaid?: boolean;
      /** Jobs: completed work without an invoice. */
      unbilled?: boolean;
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
      if (opts?.unbilled === true) query.unbilled = "1";
      if (opts?.startGte !== undefined && opts.startGte !== "") query.startGte = opts.startGte;
      if (opts?.startLte !== undefined && opts.startLte !== "") query.startLte = opts.startLte;
      if (opts?.clientId !== undefined && opts.clientId !== "") query.clientId = opts.clientId;
      if (opts?.vehicleId !== undefined && opts.vehicleId !== "") query.vehicleId = opts.vehicleId;
      if (opts?.locationId !== undefined && opts.locationId !== "") query.locationId = opts.locationId;
      if (opts?.entityType !== undefined && opts.entityType !== "") query.entityType = opts.entityType;
      if (opts?.entityId !== undefined && opts.entityId !== "") query.entityId = opts.entityId;
      const qs =
        Object.keys(query).length > 0
          ? "?" + new URLSearchParams(serializeQuery(query as Record<string, unknown>)).toString()
          : "";
      return request<{ records?: unknown[] }>(`${base}${qs}`, {
        suppressAuthInvalidation: opts?.suppressAuthInvalidation,
      }).then((r) => r?.records ?? []);
    };
  const findFirst = (opts?: { filter?: unknown; select?: unknown }) =>
    findMany({ ...opts, first: 1 }).then((arr) => arr[0] ?? null);
  return {
    findMany,
    findFirst,
    maybeFindFirst: findFirst,
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
      delete: (params: Record<string, unknown>) =>
        request<unknown>("/appointments/" + (params?.id ?? ""), {
          method: "DELETE",
        }),
      sendConfirmation: (params: Record<string, unknown>) =>
        request<unknown>("/appointments/" + (params?.id ?? "") + "/sendConfirmation", {
          method: "POST",
          body: JSON.stringify(params),
        }),
      recordDepositPayment: (params: Record<string, unknown>) =>
        request<unknown>("/appointments/" + (params?.id ?? "") + "/recordDepositPayment", {
          method: "POST",
          body: JSON.stringify(params),
        }),
      createStripeDepositSession: (params: Record<string, unknown>) =>
        request<{ url: string }>("/appointments/" + (params?.id ?? "") + "/create-deposit-payment-session", {
          method: "POST",
          body: JSON.stringify(params),
        }),
      confirmStripeDepositSession: (params: Record<string, unknown>) =>
        request<{ confirmed: boolean; depositSatisfied?: boolean }>(
          "/appointments/" + (params?.id ?? "") + "/confirm-stripe-deposit-session",
          {
            method: "POST",
            body: JSON.stringify(params),
          }
        ),
      reverseDepositPayment: (params: Record<string, unknown>) =>
        request<unknown>("/appointments/" + (params?.id ?? "") + "/reverseDepositPayment", {
          method: "POST",
          body: JSON.stringify(params),
        }),
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
    delete: (params: string | Record<string, unknown>) => {
      const id =
        typeof params === "string"
          ? params
          : typeof params?.id === "string"
            ? params.id
            : null;
      if (!id) throw new Error("delete requires id (string or { id })");
      return request<unknown>("/appointment-services/" + encodeURIComponent(id) + "/delete", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
    },
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
  client: {
    ...resource("clients"),
    sendPortal: (params: Record<string, unknown>) =>
      request<unknown>("/clients/" + (params?.id ?? "") + "/sendPortal", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },
  job: resource("jobs"),
  invoice: {
    ...resource("invoices"),
    createStripePaymentSession: (params: Record<string, unknown>) =>
      request<{ url: string }>("/invoices/" + (params?.id ?? "") + "/create-payment-session", {
        method: "POST",
        body: JSON.stringify(params),
      }),
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
  expense: resource("expenses"),
  activityLog: resource("activity-logs"),
  mediaAsset: resource("media-assets"),
  notification: {
    list: (params?: { first?: number; signal?: AbortSignal }) => {
      const first = Math.min(Math.max(Number(params?.first ?? 12), 1), 50);
      return request<{
        records: Array<{
          id: string;
          type: string;
          title: string;
          message: string;
          entityType: string | null;
          entityId: string | null;
          isRead: boolean;
          metadata: Record<string, unknown>;
          createdAt: string;
          updatedAt: string;
        }>;
      }>(`/notifications?first=${encodeURIComponent(String(first))}`, {
        signal: params?.signal,
        suppressAuthInvalidation: true,
      }).then((body) => body.records ?? []);
    },
    unreadCount: (params?: { signal?: AbortSignal }) =>
      request<{ total: number; leads: number; calendar: number }>("/notifications/unread-count", {
        signal: params?.signal,
        suppressAuthInvalidation: true,
      }),
    markRead: (params: { id: string }) =>
      request<{ ok: true; id: string }>(`/notifications/${encodeURIComponent(params.id)}/read`, {
        method: "POST",
        suppressAuthInvalidation: true,
      }),
    markAllRead: () =>
      request<{ ok: true }>("/notifications/read-all", {
        method: "POST",
        suppressAuthInvalidation: true,
      }),
  },
  notificationLog: resource("notification-logs"),
  integration: {
    listStatus: () =>
      request<{
        infrastructure: {
          vaultConfigured: boolean;
          cronSecretConfigured: boolean;
          providerConfiguration: {
            quickbooks_online: boolean;
            twilio_sms: boolean;
            google_calendar: boolean;
            outbound_webhooks: boolean;
          };
        };
        registry: Array<{
          provider: "quickbooks_online" | "twilio_sms" | "google_calendar" | "outbound_webhooks";
          label: string;
          ownerType: "business" | "user";
          description: string;
          permissions: { read: "settings.read"; write: "settings.write" };
          featureFlagEnabled: boolean;
        }>;
        connections: Array<{
          id: string;
          provider: "quickbooks_online" | "twilio_sms" | "google_calendar" | "outbound_webhooks";
          ownerType: "business" | "user";
          ownerKey: string;
          userId: string | null;
          status: "pending" | "connected" | "action_required" | "error" | "disconnected";
          displayName: string | null;
          externalAccountId: string | null;
          externalAccountName: string | null;
          scopes: string[];
          featureEnabled: boolean;
          lastSyncedAt: string | null;
          lastSuccessfulAt: string | null;
          lastError: string | null;
          actionRequired: string | null;
          connectedAt: string | null;
          disconnectedAt: string | null;
          configSummary: {
            hasEncryptedAccessToken: boolean;
            hasEncryptedRefreshToken: boolean;
            hasConfig: boolean;
            selectedCalendarId: string | null;
            selectedCalendarSummary: string | null;
            webhookUrl: string | null;
            twilioMessagingServiceSid: string | null;
            twilioAccountSid: string | null;
            twilioEnabledTemplateSlugs: string[];
          };
        }>;
      }>("/integrations"),
    listRecentOutboundWebhookEvents: () =>
      request<{
        records: Array<{
          id: string;
          action: string;
          entityType: string | null;
          entityId: string | null;
          createdAt: string;
        }>;
      }>("/integrations/outbound-webhooks/recent-events"),
    listFailures: () =>
      request<{
        records: Array<{
          id: string;
          provider: string;
          jobType: string;
          status: string;
          attemptCount: number;
          maxAttempts: number;
          lastError: string | null;
          deadLetteredAt: string | null;
          nextRunAt: string | null;
          updatedAt: string;
          displayName: string | null;
        }>;
      }>("/integrations/failures"),
    retryJob: (params: Record<string, unknown>) => {
      const id = params.id as string | undefined;
      if (!id) throw new Error("Integration retry requires id");
      return request<{ record: unknown }>(`/integrations/jobs/${encodeURIComponent(id)}/retry`, {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
    startQuickBooks: () =>
      request<{ url: string }>("/integrations/quickbooks/start", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    startGoogleCalendar: () =>
      request<{ url: string }>("/integrations/google-calendar/start", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    listGoogleCalendars: () =>
      request<{
        calendars: Array<{
          id: string;
          summary: string;
          primary?: boolean;
          accessRole?: string | null;
          timeZone?: string | null;
        }>;
      }>("/integrations/google-calendar/calendars"),
    selectGoogleCalendar: (params: { calendarId: string }) =>
      request<{ record: unknown }>("/integrations/google-calendar/select-calendar", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    disconnectGoogleCalendar: () =>
      request<{ record: unknown }>("/integrations/google-calendar/disconnect", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    resyncGoogleCalendar: () =>
      request<{
        queuedJobs: number;
        appointments: number;
      }>("/integrations/google-calendar/resync", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    sendOutboundWebhookTest: () =>
      request<{ record: unknown }>("/integrations/outbound-webhooks/test", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    replayOutboundWebhook: (params: { activityLogId: string }) =>
      request<{ record: unknown }>("/integrations/outbound-webhooks/replay", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    disconnectQuickBooks: () =>
      request<{ record: unknown }>("/integrations/quickbooks/disconnect", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    resyncQuickBooks: () =>
      request<{
        queuedJobs: number;
        clients: number;
        invoices: number;
        payments: number;
      }>("/integrations/quickbooks/resync", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    connectTwilio: (params: {
      accountSid: string;
      authToken?: string;
      messagingServiceSid: string;
      enabledTemplateSlugs: string[];
    }) =>
      request<{ record: unknown }>("/integrations/twilio/connect", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    disconnectTwilio: () =>
      request<{ record: unknown }>("/integrations/twilio/disconnect", {
        method: "POST",
        body: JSON.stringify({}),
      }),
  },
  vehicle: resource("vehicles"),
  vehicleCatalog: {
    listYears: () =>
      request<{ records?: Array<{ id: string; year: number; label: string }> }>("/vehicle-catalog/years").then(
        (body) => body?.records ?? []
      ),
    listMakes: (year: number) =>
      request<{ records?: Array<{ id: string; label: string; value: string; source: string; sourceVehicleId: string | null }> }>(
        `/vehicle-catalog/makes?${new URLSearchParams({ year: String(year) }).toString()}`
      ).then((body) => body?.records ?? []),
    listModels: (params: { year: number; makeId: string; make?: string }) =>
      request<{ records?: Array<{ id: string; label: string; value: string; source: string; sourceVehicleId: string | null }> }>(
        `/vehicle-catalog/models?${new URLSearchParams({
          year: String(params.year),
          makeId: params.makeId,
          ...(params.make ? { make: params.make } : {}),
        }).toString()}`
      ).then((body) => body?.records ?? []),
    listTrims: (params: { year: number; makeId: string; make?: string; model: string }) =>
      request<{ records?: Array<{ id: string; label: string; value: string; source: string; sourceVehicleId: string | null; bodyStyle: string | null; engine: string | null }> }>(
        `/vehicle-catalog/trims?${new URLSearchParams({
          year: String(params.year),
          makeId: params.makeId,
          model: params.model,
          ...(params.make ? { make: params.make } : {}),
        }).toString()}`
      ).then((body) => body?.records ?? []),
    vinLookup: (vin: string) =>
      request<{ record?: { vin: string; year: number | null; make: string | null; model: string | null; trim: string | null; bodyStyle: string | null; engine: string | null; displayName: string; source: string; sourceVehicleId: string | null } | null }>(
        "/vehicle-catalog/vin-lookup",
        { method: "POST", body: JSON.stringify({ vin }) }
      ).then((body) => body?.record ?? null),
  },
  business: {
    ...resource("businesses"),
    completeOnboarding: (id: string) =>
      request<unknown>(`/businesses/${encodeURIComponent(id)}/completeOnboarding`, { method: "POST" }),
  },
    staff: (() => {
      const r = resource("staff");
      return {
        ...r,
        resendInvite: (params: Record<string, unknown>) => {
          const id = params.id as string | undefined;
          if (!id) throw new Error("Staff resend invite requires id");
          return request<unknown>(`/staff/${encodeURIComponent(id)}/resend-invite`, {
            method: "POST",
          });
        },
        inviteLink: (params: Record<string, unknown>) => {
          const id = params.id as string | undefined;
          if (!id) throw new Error("Staff invite link requires id");
          return request<{ ok: true; inviteUrl: string; inviteEmail: string }>(`/staff/${encodeURIComponent(id)}/invite-link`, {
            method: "POST",
          });
        },
      };
    })(),
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
      reorder: (params: Record<string, unknown>) =>
        request<unknown>("/services/reorder", {
          method: "POST",
          body: JSON.stringify(params),
        }),
    };
  })(),
  serviceCategory: (() => {
    const r = resource("service-categories");
    return {
      ...r,
      capabilities: () => request<{ supportsManagement?: boolean }>("/service-categories/capabilities"),
      update: (params: Record<string, unknown>) => {
        const id = params.id as string | undefined;
        if (!id) throw new Error("Service category update requires id");
        const { id: _omit, ...body } = params;
        return r.update(id, body);
      },
      delete: (params: Record<string, unknown>) => {
        const id = params.id as string | undefined;
        if (!id) throw new Error("Service category delete requires id");
        const { id: _omit, ...body } = params;
        return request(`/service-categories/${encodeURIComponent(id)}`, {
          method: "DELETE",
          body: JSON.stringify(body),
        });
      },
      reorder: (params: Record<string, unknown>) =>
        request<unknown>("/service-categories/reorder", {
          method: "POST",
          body: JSON.stringify(params),
        }),
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
    signInWithApple: (params: Record<string, unknown>) =>
      request<AuthEnvelope>("/auth/apple/native", { method: "POST", body: JSON.stringify(params) }).then((body) => {
        return assertAuthEnvelope(body, "/auth/apple/native");
      }),
    forgotPassword: (params: Record<string, unknown>) =>
      request<{ ok: boolean; message?: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    resetPassword: (params: Record<string, unknown>) =>
      request<{ ok: boolean }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    signOut: () => request("/auth/sign-out", { method: "POST" }),
    /** Validates JWT, returns user + fresh token (also refreshes auth cookie server-side). */
    me: () =>
      request<AuthEnvelope>("/auth/me").then((body) => {
        const d = assertAuthEnvelope(body, "/auth/me");
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
    setPassword: (params: Record<string, unknown>) =>
      request<unknown>("/users/set-password", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    deleteAccount: (params: Record<string, unknown>) =>
      request<{
        ok: boolean;
        alreadyDeleted?: boolean;
        deletedAt?: string | null;
        deletionMode?: string;
        deletedDataSummary?: string[];
        retainedDataSummary?: string[];
        redirectPath?: string;
      }>("/users/delete-account", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    requestAccountDeletion: (params: Record<string, unknown>) =>
      request<{ ok: boolean; alreadyRequested?: boolean; requestedAt?: string | null }>("/users/request-account-deletion", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    findOne: (id: string, _opts?: Record<string, unknown>) =>
      request<unknown>(`/users/${encodeURIComponent(id)}`),
  },
  // Global actions (POST /api/actions/:name)
  getInvoiceMetrics: (params?: Record<string, unknown>) =>
    request<unknown>("/actions/getInvoiceMetrics", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getFinanceMetrics: (params?: Record<string, unknown>) =>
    request<{
      todayRevenue: number;
      revenueThisMonth: number;
      outstandingBalance: number;
      expensesToday: number;
      expensesThisMonth: number;
      netThisMonth: number;
      expenseCountThisMonth: number;
    }>("/actions/getFinanceMetrics", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getFinanceDashboard: (params?: Record<string, unknown>) =>
    request<{
      kpis: {
        grossRevenue: number;
        moneyCollected: number;
        awaitingPayment: number;
        overdueInvoices: number;
        overdueInvoiceCount: number;
        expenses: number;
        netProfit: number;
        projectedNetProfit: number;
        collectionRate: number;
      };
      statusBuckets: Array<{
        status: "draft" | "sent" | "partial" | "paid" | "overdue";
        count: number;
        totalAmount: number;
      }>;
      recentPayments: Array<{
        id: string;
        clientName: string;
        invoiceNumber: string;
        amount: number;
        method: string;
        paidAt: string | null;
      }>;
      invoiceRows: Array<{
        id: string;
        clientName: string;
        invoiceNumber: string;
        totalAmount: number;
        amountPaid: number;
        balanceDue: number;
        dueDate: string | null;
        status: "draft" | "sent" | "partial" | "paid" | "overdue";
        createdAt: string;
      }>;
      trend: Array<{
        key: string;
        label: string;
        invoiced: number;
        collected: number;
        expenses: number;
      }>;
      generatedAt: string;
      referenceDate: string;
    }>("/actions/getFinanceDashboard", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getGrowthMetrics: (params?: Record<string, unknown>) =>
    request<{
      periodDays: number | null;
      totalLeads: number;
      convertedLeadCount: number;
      bookedLeadCount: number;
      closeRate: number;
      bookingRate: number;
      averageFirstResponseHours: number | null;
      totalPayingCustomers: number;
      repeatCustomerCount: number;
      repeatCustomerRate: number;
      attributedRevenue: number;
      unattributedRevenue: number;
      returningRevenue: number;
      newCustomerRevenue: number;
      recentWeeks: Array<{
        label: string;
        leadCount: number;
        convertedCount: number;
        bookedCount: number;
        closeRate: number;
        bookingRate: number;
        averageFirstResponseHours: number | null;
      }>;
      revenueBySource: Array<{
        source: string;
        leadCount: number;
        convertedCount: number;
        bookedCount: number;
        closeRate: number;
        bookingRate: number;
        averageFirstResponseHours: number | null;
        revenue: number;
        shareOfRevenue: number;
      }>;
      }>("/actions/getGrowthMetrics", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getHomeDashboard: (params?: { range?: HomeDashboardRange; teamMemberId?: string | null; weekStartDate?: string | null }) =>
    request<HomeDashboardSnapshot>("/actions/getHomeDashboard", { method: "POST", body: JSON.stringify(params ?? {}) }),
  updateHomeDashboardPreferences: (params?: {
    widgetOrder?: string[];
    hiddenWidgets?: string[];
    defaultRange?: HomeDashboardRange | null;
    defaultTeamMemberId?: string | null;
    dismissQueueItemId?: string | null;
    clearDismissQueueItemId?: string | null;
    snoozeQueueItemId?: string | null;
    snoozeUntil?: string | null;
    clearSnoozeQueueItemId?: string | null;
    markSeenAt?: string | null;
  }) =>
    request<{ preferences: HomeDashboardSnapshot["preferences"] }>("/actions/updateHomeDashboardPreferences", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    }),
  getAutomationSummary: (params?: Record<string, unknown>) =>
    request<{
      uncontactedLeads: {
        sentLast30Days: number;
        lastSentAt: string | null;
        skippedLast30Days: number;
        lastSkippedAt: string | null;
        failedLast30Days: number;
        lastFailedAt: string | null;
      };
      appointmentReminders: {
        sentLast30Days: number;
        lastSentAt: string | null;
        skippedLast30Days: number;
        lastSkippedAt: string | null;
        failedLast30Days: number;
        lastFailedAt: string | null;
      };
      abandonedQuotes: {
        sentLast30Days: number;
        lastSentAt: string | null;
        skippedLast30Days: number;
        lastSkippedAt: string | null;
        failedLast30Days: number;
        lastFailedAt: string | null;
      };
      reviewRequests: {
        sentLast30Days: number;
        lastSentAt: string | null;
        skippedLast30Days: number;
        lastSkippedAt: string | null;
        failedLast30Days: number;
        lastFailedAt: string | null;
      };
      lapsedClients: {
        sentLast30Days: number;
        lastSentAt: string | null;
        skippedLast30Days: number;
        lastSkippedAt: string | null;
        failedLast30Days: number;
        lastFailedAt: string | null;
      };
    }>("/actions/getAutomationSummary", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getAutomationFeed: (params?: { limit?: number }) =>
    request<{
      records: Array<{
        id: string;
        kind: "sent" | "failed" | "skipped";
        automationType: "uncontacted_lead" | "appointment_reminder" | "abandoned_quote" | "review_request" | "lapsed_client";
        channel: "email" | "sms";
        recipient: string | null;
        entityType: string | null;
        entityId: string | null;
        createdAt: string;
        message: string;
      }>;
    }>("/actions/getAutomationFeed", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getWorkerHealth: (params?: Record<string, unknown>) =>
    request<{
      automations: {
        sentLast24Hours: number;
        skippedLast24Hours: number;
        lastActivityAt: string | null;
        lastSkippedAt: string | null;
        failedLast24Hours: number;
        lastFailureAt: string | null;
      };
      integrations: {
        lastAttemptAt: string | null;
        pendingJobs: number;
        processingJobs: number;
        failedJobs: number;
        deadLetterJobs: number;
      };
    }>("/actions/getWorkerHealth", { method: "POST", body: JSON.stringify(params ?? {}) }),
  getBusinessPreset: () =>
    request<{ group: string; count: number; names: string[] }>("/actions/getBusinessPreset", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  applyBusinessPreset: () =>
    request<
      | {
          ok: true;
          created: number;
          skipped: number;
          group: string;
          appliedCount?: number;
          expectedCount?: number;
          fullyApplied?: boolean;
        }
      | { ok: false; message: string }
    >("/actions/applyBusinessPreset", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  // Billing: $29/mo, first month free
  billing: {
    getStatus: () =>
      request<{
        status: string | null;
        accessState:
          | "pending_setup"
          | "pending_setup_failure"
          | "active_trial"
          | "active_paid"
          | "paused_missing_payment_method"
          | "canceled"
          | null;
        trialStartedAt: string | null;
        trialEndsAt: string | null;
        currentPeriodEnd: string | null;
        billingHasPaymentMethod: boolean;
        billingPaymentMethodAddedAt: string | null;
        billingSetupError: string | null;
        billingSetupFailedAt: string | null;
        billingLastStripeEventId: string | null;
        billingLastStripeEventType: string | null;
        billingLastStripeEventAt: string | null;
        billingLastStripeSyncStatus: "synced" | "failed" | null;
        billingLastStripeSyncError: string | null;
        activationMilestone: {
          reached: boolean;
          type:
            | "appointment_created"
            | "quote_created"
            | "invoice_created"
            | "payment_collected"
            | "clients_3_added"
            | null;
          occurredAt: string | null;
          detail: string | null;
        };
        billingPrompt: {
          stage:
            | "none"
            | "soft_activation"
            | "trial_7_days"
            | "trial_3_days"
            | "trial_1_day"
            | "paused";
          visible: boolean;
          daysLeftInTrial: number | null;
          dismissedUntil: string | null;
          cooldownDays: number;
        };
        billingEnforced: boolean;
        checkoutConfigured: boolean;
        portalConfigured: boolean;
        stripeConnectConfigured: boolean;
        stripeConnectAccountId: string | null;
        stripeConnectDetailsSubmitted: boolean;
        stripeConnectChargesEnabled: boolean;
        stripeConnectPayoutsEnabled: boolean;
        stripeConnectOnboardedAt: string | null;
        stripeConnectReady: boolean;
      }>("/billing/status"),
    refreshBillingState: () =>
      request<{
        status: string | null;
        accessState:
          | "pending_setup"
          | "pending_setup_failure"
          | "active_trial"
          | "active_paid"
          | "paused_missing_payment_method"
          | "canceled"
          | null;
        trialStartedAt: string | null;
        trialEndsAt: string | null;
        currentPeriodEnd: string | null;
        billingHasPaymentMethod: boolean;
        billingPaymentMethodAddedAt: string | null;
        billingSetupError: string | null;
        billingSetupFailedAt: string | null;
        billingLastStripeEventId: string | null;
        billingLastStripeEventType: string | null;
        billingLastStripeEventAt: string | null;
        billingLastStripeSyncStatus: "synced" | "failed" | null;
        billingLastStripeSyncError: string | null;
        activationMilestone: {
          reached: boolean;
          type:
            | "appointment_created"
            | "quote_created"
            | "invoice_created"
            | "payment_collected"
            | "clients_3_added"
            | null;
          occurredAt: string | null;
          detail: string | null;
        };
        billingPrompt: {
          stage:
            | "none"
            | "soft_activation"
            | "trial_7_days"
            | "trial_3_days"
            | "trial_1_day"
            | "paused";
          visible: boolean;
          daysLeftInTrial: number | null;
          dismissedUntil: string | null;
          cooldownDays: number;
        };
        billingEnforced: boolean;
        checkoutConfigured: boolean;
        portalConfigured: boolean;
        stripeConnectConfigured: boolean;
        stripeConnectAccountId: string | null;
        stripeConnectDetailsSubmitted: boolean;
        stripeConnectChargesEnabled: boolean;
        stripeConnectPayoutsEnabled: boolean;
        stripeConnectOnboardedAt: string | null;
        stripeConnectReady: boolean;
      }>("/billing/refresh-state", { method: "POST" }),
    retryTrialSetup: () =>
      request<{
        ok: true;
        accessState: string | null;
        status: string | null;
      }>("/billing/retry-setup", { method: "POST" }),
    createCheckoutSession: () =>
      request<{ url: string }>("/billing/create-checkout-session", { method: "POST" }),
    createPortalSession: (params?: {
      entryPoint?: "settings" | "trial_banner" | "paused_recovery";
    }) =>
      request<{ url: string }>("/billing/portal", {
        method: "POST",
        body: JSON.stringify(params ?? {}),
      }),
    createPortalSessionForPrompt: (params: {
      promptStage: "soft_activation" | "trial_7_days" | "trial_3_days" | "trial_1_day" | "paused";
      entryPoint?: "settings" | "trial_banner" | "paused_recovery";
    }) =>
      request<{ url: string }>("/billing/portal", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    trackPromptEvent: (params: {
      event: "shown" | "dismissed" | "converted";
      stage: "soft_activation" | "trial_7_days" | "trial_3_days" | "trial_1_day" | "paused";
    }) =>
      request<{ ok: true }>("/billing/prompt-event", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    createConnectOnboardingLink: () =>
      request<{ url: string }>("/billing/connect/onboarding-link", { method: "POST" }),
    createConnectDashboardLink: () =>
      request<{ url: string }>("/billing/connect/dashboard-link", { method: "POST" }),
    disconnectConnectAccount: () =>
      request<{ ok: true }>("/billing/connect/disconnect", { method: "POST" }),
  },
} as const;
