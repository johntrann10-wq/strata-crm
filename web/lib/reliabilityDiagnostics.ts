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
const DEDUPE_WINDOW_MS = 15_000;

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
    // Ignore storage failures for restricted documents or private mode edge cases.
  }
}

function safeSessionStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures for restricted documents or private mode edge cases.
  }
}

function readEntries(): ReliabilityDiagnosticEntry[] {
  try {
    const raw = safeSessionStorageGet(STORAGE_KEY);
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
    safeSessionStorageSet(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
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
  const existing = readEntries();
  const now = Date.now();
  const duplicate = existing.find((candidate) => {
    const candidateAt = Date.parse(candidate.timestamp);
    if (!Number.isFinite(candidateAt) || now - candidateAt > DEDUPE_WINDOW_MS) return false;
    return (
      candidate.source === entry.source &&
      candidate.severity === entry.severity &&
      candidate.message === entry.message &&
      candidate.path === entry.path &&
      candidate.method === entry.method &&
      candidate.status === entry.status &&
      candidate.detail === entry.detail
    );
  });
  if (duplicate) return;
  writeEntries([entry, ...existing]);
  if (import.meta.env.DEV) {
    console.error("[Strata reliability]", entry);
  }
}

export function listReliabilityDiagnostics(): ReliabilityDiagnosticEntry[] {
  return readEntries();
}

export function clearReliabilityDiagnostics(): void {
  if (typeof window === "undefined") return;
  try {
    safeSessionStorageRemove(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Ignore storage failures in private mode / quota edge cases.
  }
}

export function getReliabilityDiagnosticsEventName(): string {
  return CHANGE_EVENT;
}
