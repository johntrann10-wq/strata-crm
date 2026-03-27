export type ReliabilityDiagnosticEntry = {
  id: string;
  source:
    | "api.http"
    | "api.network"
    | "api.parse"
    | "auth.invalid"
    | "query.error"
    | "action.error"
    | "form.error";
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
  method?: string;
  status?: number;
  detail?: string;
  timestamp: string;
};

const STORAGE_KEY = "strata.reliabilityDiagnostics";
const CHANGE_EVENT = "strata:reliability-diagnostics";
const MAX_ENTRIES = 40;

function readEntries(): ReliabilityDiagnosticEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: ReliabilityDiagnosticEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Ignore storage failures in private mode / quota edge cases.
  }
}

export function recordReliabilityDiagnostic(params: {
  source: ReliabilityDiagnosticEntry["source"];
  severity?: ReliabilityDiagnosticEntry["severity"];
  message: string;
  path?: string;
  method?: string;
  status?: number;
  detail?: string;
}): void {
  if (typeof window === "undefined") return;
  const entry: ReliabilityDiagnosticEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: params.source,
    severity: params.severity ?? "error",
    message: params.message.trim() || "Unknown reliability event",
    path: params.path?.trim() || undefined,
    method: params.method?.trim() || undefined,
    status: typeof params.status === "number" ? params.status : undefined,
    detail: params.detail?.trim() || undefined,
    timestamp: new Date().toISOString(),
  };
  writeEntries([entry, ...readEntries()]);
  console.error("[Strata reliability]", entry);
}

export function listReliabilityDiagnostics(): ReliabilityDiagnosticEntry[] {
  return readEntries();
}

export function clearReliabilityDiagnostics(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Ignore storage failures in private mode / quota edge cases.
  }
}

export function getReliabilityDiagnosticsEventName(): string {
  return CHANGE_EVENT;
}
