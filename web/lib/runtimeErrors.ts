import { reportRemoteDiagnosticEvent } from "./remoteDiagnostics";

export type RuntimeErrorEntry = {
  id: string;
  source: "window.error" | "window.unhandledrejection" | "react.boundary";
  message: string;
  detail?: string;
  path: string;
  timestamp: string;
};

const STORAGE_KEY = "strata.runtimeErrors";
const CHANGE_EVENT = "strata:runtime-errors";
const MAX_ENTRIES = 20;

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

function readEntries(): RuntimeErrorEntry[] {
  try {
    const raw = safeSessionStorageGet(STORAGE_KEY);
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
    safeSessionStorageSet(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
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
  reportRemoteDiagnosticEvent({
    category: "runtime_error",
    source: params.source,
    severity: "error",
    message: entry.message,
    detail: entry.detail,
    path: entry.path,
    timestamp: entry.timestamp,
  });
  if (import.meta.env.DEV) {
    console.error("[Strata runtime]", entry);
  }
}

export function listRuntimeErrors(): RuntimeErrorEntry[] {
  return readEntries();
}

export function clearRuntimeErrors(): void {
  if (typeof window === "undefined") return;
  try {
    safeSessionStorageRemove(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Ignore storage failures in private mode / quota edge cases.
  }
}

export function getRuntimeErrorsEventName(): string {
  return CHANGE_EVENT;
}
