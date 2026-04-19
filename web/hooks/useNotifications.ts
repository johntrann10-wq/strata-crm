import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api";

export type AppNotificationRecord = {
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
};

export type AppNotificationCounts = {
  total: number;
  leads: number;
  calendar: number;
};

const EMPTY_COUNTS: AppNotificationCounts = {
  total: 0,
  leads: 0,
  calendar: 0,
};
const NOTIFICATION_RETRY_BACKOFF_MS = 60_000;
const NOTIFICATION_SUSPEND_STORAGE_KEY = "strata.notifications.suspendedUntil";

function readNotificationsSuspendedUntil(): number {
  if (typeof window === "undefined") return 0;
  const rawValue = window.sessionStorage.getItem(NOTIFICATION_SUSPEND_STORAGE_KEY);
  const parsedValue = Number(rawValue ?? 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function writeNotificationsSuspendedUntil(value: number): void {
  if (typeof window === "undefined") return;
  if (value > 0) {
    window.sessionStorage.setItem(NOTIFICATION_SUSPEND_STORAGE_KEY, String(value));
    return;
  }
  window.sessionStorage.removeItem(NOTIFICATION_SUSPEND_STORAGE_KEY);
}

function getNotificationScope(
  notification: AppNotificationRecord
): "leads" | "calendar" | "finance" | "general" {
  const bucket =
    typeof notification.metadata?.notificationBucket === "string"
      ? notification.metadata.notificationBucket
      : typeof notification.metadata?.bucket === "string"
        ? notification.metadata.bucket
        : null;

  if (bucket === "leads") return "leads";
  if (bucket === "calendar") return "calendar";
  if (bucket === "finance") return "finance";
  if (bucket === "other") return "general";

  if (
    notification.entityType === "booking_request" ||
    notification.entityType === "client" ||
    notification.type === "new_lead" ||
    notification.type.startsWith("lead_") ||
    notification.type.startsWith("booking_request")
  ) {
    return "leads";
  }

  if (notification.entityType === "appointment" || notification.type.startsWith("appointment_")) {
    return "calendar";
  }

  if (
    notification.entityType === "invoice" ||
    notification.entityType === "payment" ||
    notification.type === "payment_received"
  ) {
    return "finance";
  }

  return "general";
}

function isAbortedNotificationRequest(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "REQUEST_ABORTED"
  );
}

export function useNotifications(enabled: boolean) {
  const [notifications, setNotifications] = useState<AppNotificationRecord[]>([]);
  const [counts, setCounts] = useState<AppNotificationCounts>(EMPTY_COUNTS);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const notificationsRef = useRef<AppNotificationRecord[]>([]);
  const countsRef = useRef<AppNotificationCounts>(EMPTY_COUNTS);
  const refreshInFlight = useRef(false);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const suspendedUntilRef = useRef(readNotificationsSuspendedUntil());

  const notificationsTemporarilyUnavailable = useCallback(() => {
    suspendedUntilRef.current = Math.max(suspendedUntilRef.current, readNotificationsSuspendedUntil());
    return !enabled || Date.now() < suspendedUntilRef.current;
  }, [enabled]);

  const suspendNotificationRefresh = useCallback(() => {
    suspendedUntilRef.current = Date.now() + NOTIFICATION_RETRY_BACKOFF_MS;
    writeNotificationsSuspendedUntil(suspendedUntilRef.current);
  }, []);

  const abortRefresh = useCallback(() => {
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    refreshInFlight.current = false;
  }, []);

  const fetchNotifications = useCallback(async (first = 12, signal?: AbortSignal) => {
    if (notificationsTemporarilyUnavailable()) return notificationsRef.current;
    setLoadingList(true);
    try {
      const records = await api.notification.list({ first, signal });
      suspendedUntilRef.current = 0;
      writeNotificationsSuspendedUntil(0);
      notificationsRef.current = records;
      setNotifications(records);
      return records;
    } finally {
      setLoadingList(false);
    }
  }, [notificationsTemporarilyUnavailable]);

  const fetchUnreadCount = useCallback(async (signal?: AbortSignal) => {
    if (notificationsTemporarilyUnavailable()) return countsRef.current;
    setLoadingCounts(true);
    try {
      const nextCounts = await api.notification.unreadCount({ signal });
      suspendedUntilRef.current = 0;
      writeNotificationsSuspendedUntil(0);
      countsRef.current = nextCounts;
      setCounts(nextCounts);
      return nextCounts;
    } finally {
      setLoadingCounts(false);
    }
  }, [notificationsTemporarilyUnavailable]);

  const refresh = useCallback(async (first = 12) => {
    if (notificationsTemporarilyUnavailable() || refreshInFlight.current) return;
    const controller = new AbortController();
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = controller;
    refreshInFlight.current = true;
    try {
      await Promise.all([
        fetchNotifications(first, controller.signal),
        fetchUnreadCount(controller.signal),
      ]);
    } catch (error) {
      if (isAbortedNotificationRequest(error) || controller.signal.aborted) return;
      suspendNotificationRefresh();
    } finally {
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
      refreshInFlight.current = false;
    }
  }, [fetchNotifications, fetchUnreadCount, notificationsTemporarilyUnavailable, suspendNotificationRefresh]);

  const markAsRead = useCallback(async (notificationId: string) => {
    const target = notificationsRef.current.find((notification) => notification.id === notificationId);
    if (!target || target.isRead) return;

    const scope = getNotificationScope(target);
    setNotifications((current) => {
      const next = current.map((notification) =>
        notification.id === notificationId ? { ...notification, isRead: true } : notification
      );
      notificationsRef.current = next;
      return next;
    });
    setCounts((current) => {
      const next = {
        total: Math.max(0, current.total - 1),
        leads: scope === "leads" ? Math.max(0, current.leads - 1) : current.leads,
        calendar: scope === "calendar" ? Math.max(0, current.calendar - 1) : current.calendar,
      };
      countsRef.current = next;
      return next;
    });

    try {
      await api.notification.markRead({ id: notificationId });
    } catch (error) {
      await refresh(notificationsRef.current.length || 12);
      throw error;
    }
  }, [refresh]);

  const markAllAsRead = useCallback(async () => {
    const unreadNotifications = notificationsRef.current.filter((notification) => !notification.isRead);
    if (!unreadNotifications.length && countsRef.current.total === 0) return;

    setNotifications((current) => {
      const next = current.map((notification) => ({ ...notification, isRead: true }));
      notificationsRef.current = next;
      return next;
    });
    countsRef.current = EMPTY_COUNTS;
    setCounts(EMPTY_COUNTS);

    try {
      await api.notification.markAllRead();
    } catch (error) {
      await refresh(notificationsRef.current.length || 12);
      throw error;
    }
  }, [refresh]);

  useEffect(() => {
    if (!enabled) {
      abortRefresh();
      suspendedUntilRef.current = 0;
      writeNotificationsSuspendedUntil(0);
      notificationsRef.current = [];
      countsRef.current = EMPTY_COUNTS;
      setNotifications([]);
      setCounts(EMPTY_COUNTS);
      return;
    }

    void refresh();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, 45000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      abortRefresh();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [abortRefresh, enabled, refresh]);

  return {
    notifications,
    counts,
    loading: loadingList || loadingCounts,
    fetchNotifications,
    fetchUnreadCount,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}
