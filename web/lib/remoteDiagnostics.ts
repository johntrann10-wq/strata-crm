import { getAuthToken, getCurrentBusinessId } from "./auth";
import { isNativeShell } from "./mobileShell";

type RemoteDiagnosticEvent = {
  category: "runtime_error" | "reliability";
  source: string;
  severity: "info" | "warning" | "error";
  message: string;
  detail?: string;
  path?: string;
  method?: string;
  status?: number;
  timestamp: string;
};

const RECENT_EVENT_WINDOW_MS = 30_000;
const recentEventKeys = new Map<string, number>();

function shouldUseSameOriginApi(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith(".vercel.app") || host.endsWith(".netlify.app");
}

function resolveApiBase(): string {
  const raw =
    import.meta.env.VITE_API_URL?.trim() ||
    import.meta.env.NEXT_PUBLIC_API_URL?.trim() ||
    "";
  if (raw) return raw.replace(/\/+$/, "");
  if (import.meta.env.PROD && shouldUseSameOriginApi()) return "";
  if (import.meta.env.DEV) return "";
  if (import.meta.env.PROD && import.meta.env.VITE_ALLOW_RELATIVE_API === "true") return "";
  return "";
}

function isRemoteDiagnosticsEnabled(): boolean {
  const configured = import.meta.env.VITE_REMOTE_DIAGNOSTICS_ENABLED?.trim().toLowerCase();
  if (!configured) return import.meta.env.PROD;
  return configured !== "false" && configured !== "0" && configured !== "off";
}

function trimTo(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function buildEventKey(event: RemoteDiagnosticEvent): string {
  return [
    event.category,
    event.source,
    event.severity,
    event.message,
    event.path ?? "",
    event.method ?? "",
    String(event.status ?? ""),
    event.detail ?? "",
  ].join("|");
}

export function reportRemoteDiagnosticEvent(event: RemoteDiagnosticEvent): void {
  if (typeof window === "undefined") return;
  if (!isRemoteDiagnosticsEnabled()) return;

  const key = buildEventKey(event);
  const now = Date.now();
  const recentAt = recentEventKeys.get(key);
  if (recentAt && now - recentAt < RECENT_EVENT_WINDOW_MS) {
    return;
  }
  recentEventKeys.set(key, now);

  for (const [candidateKey, candidateAt] of recentEventKeys.entries()) {
    if (now - candidateAt > RECENT_EVENT_WINDOW_MS) {
      recentEventKeys.delete(candidateKey);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authToken = getAuthToken();
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const businessId = getCurrentBusinessId();
  if (businessId) {
    headers["x-business-id"] = businessId;
  }

  const payload = {
    events: [
      {
        ...event,
        source: trimTo(event.source, 80) ?? "unknown",
        message: trimTo(event.message, 400) ?? "Unknown client diagnostic",
        detail: trimTo(event.detail, 2000),
        path: trimTo(event.path, 400),
        method: trimTo(event.method, 16),
        appShell: isNativeShell(),
        userAgent: trimTo(navigator.userAgent, 280),
      },
    ],
  };

  void fetch(`${resolveApiBase()}/api/client-diagnostics/report`, {
    method: "POST",
    headers,
    credentials: "include",
    keepalive: true,
    body: JSON.stringify(payload),
  }).catch(() => {
    // Remote diagnostics are best-effort only.
  });
}
