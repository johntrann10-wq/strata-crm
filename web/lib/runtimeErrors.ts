type RuntimeErrorEntry = {
  id: string;
  source: "window.error" | "window.unhandledrejection" | "react.boundary";
  message: string;
  detail?: string;
  path: string;
  timestamp: string;
};

const STORAGE_KEY = "strata.runtimeErrors";
const MAX_ENTRIES = 20;

function readEntries(): RuntimeErrorEntry[] {
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

function writeEntries(entries: RuntimeErrorEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Ignore storage failures in private mode / quota edge cases.
  }
}

export function recordRuntimeError(params: {
  source: RuntimeErrorEntry["source"];
  message: string;
  detail?: string;
}): void {
  if (typeof window === "undefined") return;
  const entry: RuntimeErrorEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: params.source,
    message: params.message.trim() || "Unknown runtime error",
    detail: params.detail?.trim() || undefined,
    path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    timestamp: new Date().toISOString(),
  };
  const next = [entry, ...readEntries()].slice(0, MAX_ENTRIES);
  writeEntries(next);
  console.error("[Strata runtime]", entry);
}

