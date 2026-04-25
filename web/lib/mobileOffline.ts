import { ApiError, api } from "@/api";

const CACHE_PREFIX = "strata.mobile.cache.v1";
const PENDING_APPOINTMENT_MUTATIONS_KEY = "strata.mobile.pendingAppointmentMutations.v1";

export type AppointmentDetailCachePayload = {
  appointment: Record<string, unknown> | null;
  appointmentServices: Array<Record<string, unknown>>;
  invoice: Record<string, unknown> | null;
  quote: Record<string, unknown> | null;
  activityLogs: Array<Record<string, unknown>>;
  cachedAt: string;
};

export type ClientDetailCachePayload = {
  client: Record<string, unknown> | null;
  vehicles: Array<Record<string, unknown>>;
  appointments: Array<Record<string, unknown>>;
  quotes: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  activityLogs: Array<Record<string, unknown>>;
  cachedAt: string;
};

type PendingAppointmentMutation = {
  id: string;
  kind: "status" | "patch";
  appointmentId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

function readLocalJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLocalJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore local cache write failures in restricted environments.
  }
}

function removeLocalKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore local cache write failures in restricted environments.
  }
}

function cacheKey(type: "appointment" | "client", id: string): string {
  return `${CACHE_PREFIX}:${type}:${id}`;
}

export function readCachedAppointmentDetail(id: string): AppointmentDetailCachePayload | null {
  return readLocalJson<AppointmentDetailCachePayload>(cacheKey("appointment", id));
}

export function writeCachedAppointmentDetail(id: string, payload: AppointmentDetailCachePayload): void {
  writeLocalJson(cacheKey("appointment", id), payload);
}

export function readCachedClientDetail(id: string): ClientDetailCachePayload | null {
  return readLocalJson<ClientDetailCachePayload>(cacheKey("client", id));
}

export function writeCachedClientDetail(id: string, payload: ClientDetailCachePayload): void {
  writeLocalJson(cacheKey("client", id), payload);
}

function readPendingAppointmentMutations(): PendingAppointmentMutation[] {
  return readLocalJson<PendingAppointmentMutation[]>(PENDING_APPOINTMENT_MUTATIONS_KEY) ?? [];
}

function writePendingAppointmentMutations(value: PendingAppointmentMutation[]): void {
  if (value.length === 0) {
    removeLocalKey(PENDING_APPOINTMENT_MUTATIONS_KEY);
    return;
  }
  writeLocalJson(PENDING_APPOINTMENT_MUTATIONS_KEY, value);
}

export function queuePendingAppointmentMutation(params: {
  kind: PendingAppointmentMutation["kind"];
  appointmentId: string;
  payload: Record<string, unknown>;
}): void {
  const queue = readPendingAppointmentMutations();
  queue.push({
    id: `${params.kind}:${params.appointmentId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    kind: params.kind,
    appointmentId: params.appointmentId,
    payload: params.payload,
    createdAt: new Date().toISOString(),
  });
  writePendingAppointmentMutations(queue);
}

export function listPendingAppointmentMutations(appointmentId: string): PendingAppointmentMutation[] {
  return readPendingAppointmentMutations()
    .filter((entry) => entry.appointmentId === appointmentId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function getPendingAppointmentOverlay(appointmentId: string): Record<string, unknown> {
  return listPendingAppointmentMutations(appointmentId).reduce<Record<string, unknown>>((overlay, mutation) => {
    if (mutation.kind === "status") {
      overlay.status = mutation.payload.status;
      return overlay;
    }

    for (const [key, value] of Object.entries(mutation.payload)) {
      if (key === "id") continue;
      overlay[key] = value;
    }
    return overlay;
  }, {});
}

function isNetworkLikeError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 0 || error.code === "REQUEST_ABORTED";
  }
  return error instanceof Error && /network|offline|abort/i.test(error.message);
}

export async function flushPendingAppointmentMutations(): Promise<{
  flushed: number;
  dropped: number;
  remaining: number;
}> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const remaining = readPendingAppointmentMutations().length;
    return { flushed: 0, dropped: 0, remaining };
  }

  const queue = readPendingAppointmentMutations();
  if (queue.length === 0) {
    return { flushed: 0, dropped: 0, remaining: 0 };
  }

  const retained: PendingAppointmentMutation[] = [];
  let flushed = 0;
  let dropped = 0;

  for (const mutation of queue) {
    try {
      if (mutation.kind === "status") {
        await api.appointment.updateStatus({
          id: mutation.appointmentId,
          ...mutation.payload,
        });
      } else {
        await api.appointment.update({
          id: mutation.appointmentId,
          ...mutation.payload,
        });
      }
      flushed += 1;
    } catch (error) {
      if (isNetworkLikeError(error)) {
        retained.push(mutation);
      } else {
        dropped += 1;
      }
    }
  }

  writePendingAppointmentMutations(retained);
  return { flushed, dropped, remaining: retained.length };
}
