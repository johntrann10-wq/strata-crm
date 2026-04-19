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

function getNotificationBucket(notification: AppNotificationRecord): "leads" | "calendar" | "other" {
  const bucket = notification.metadata?.notificationBucket;
  return bucket === "leads" || bucket === "calendar" ? bucket : "other";
}

export function useNotifications(enabled: boolean) {
  const [notifications, setNotifications] = useState<AppNotificationRecord[]>([]);
  const [counts, setCounts] = useState<AppNotificationCounts>(EMPTY_COUNTS);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const refreshInFlight = useRef(false);

  const fetchNotifications = useCallback(async (first = 12) => {
    if (!enabled) return [];
    setLoadingList(true);
    try {
      const records = await api.notification.list({ first });
      setNotifications(records);
      return records;
    } finally {
      setLoadingList(false);
    }
  }, [enabled]);

  const fetchUnreadCount = useCallback(async () => {
    if (!enabled) return EMPTY_COUNTS;
    setLoadingCounts(true);
    try {
      const nextCounts = await api.notification.unreadCount();
      setCounts(nextCounts);
      return nextCounts;
    } finally {
      setLoadingCounts(false);
    }
  }, [enabled]);

  const refresh = useCallback(async (first = 12) => {
    if (!enabled || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      await Promise.all([fetchNotifications(first), fetchUnreadCount()]);
    } finally {
      refreshInFlight.current = false;
    }
  }, [enabled, fetchNotifications, fetchUnreadCount]);

  const markAsRead = useCallback(async (notificationId: string) => {
    const target = notifications.find((notification) => notification.id === notificationId);
    if (!target || target.isRead) return;

    const bucket = getNotificationBucket(target);
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, isRead: true } : notification
      )
    );
    setCounts((current) => ({
      total: Math.max(0, current.total - 1),
      leads: bucket === "leads" ? Math.max(0, current.leads - 1) : current.leads,
      calendar: bucket === "calendar" ? Math.max(0, current.calendar - 1) : current.calendar,
    }));

    try {
      await api.notification.markRead({ id: notificationId });
    } catch (error) {
      await refresh(notifications.length || 12);
      throw error;
    }
  }, [notifications, refresh]);

  const markAllAsRead = useCallback(async () => {
    const unreadNotifications = notifications.filter((notification) => !notification.isRead);
    if (!unreadNotifications.length && counts.total === 0) return;

    setNotifications((current) =>
      current.map((notification) => ({ ...notification, isRead: true }))
    );
    setCounts(EMPTY_COUNTS);

    try {
      await api.notification.markAllRead();
    } catch (error) {
      await refresh(notifications.length || 12);
      throw error;
    }
  }, [counts.total, notifications, refresh]);

  useEffect(() => {
    if (!enabled) {
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
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, refresh]);

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
