import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  HandCoins,
  History,
  Inbox,
  Landmark,
  Settings,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCommandPalette } from "@/components/shared/CommandPaletteContext";
import { cn } from "@/lib/utils";
import { triggerSelectionFeedback } from "@/lib/nativeInteractions";
import type { HomeDashboardRange, HomeDashboardSnapshot } from "@/lib/homeDashboard";
import { formatDashboardCompactCurrency, formatDashboardCurrency } from "@/lib/homeDashboard";

type WidgetStateProps = {
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
};

const dashboardPanelClassName =
  "rounded-[1.75rem] border border-slate-200/80 bg-white/92 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur";

const dashboardInsetClassName =
  "rounded-[1.15rem] border border-slate-200/75 bg-slate-50/80";

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRelativeTime(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "Just now";
  return formatDistanceToNowStrict(parsed, { addSuffix: true });
}

function formatDateLabel(value: string | null | undefined, pattern = "EEE, MMM d") {
  const parsed = parseDate(value);
  if (!parsed) return "-";
  return format(parsed, pattern);
}

function shiftDateKey(value: string, days: number) {
  const base = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return value;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatDashboardAxisCurrency(value: number) {
  if (value === 0) return "$0";
  return formatDashboardCompactCurrency(value);
}

const DASHBOARD_SHORTCUTS_STORAGE_KEY = "strata.dashboard.shortcuts.v1";
const DEFAULT_DASHBOARD_SHORTCUT_KEYS = ["new_appointment", "global_search", "search_appointments", "add_lead"] as const;

type DashboardShortcutAction = Omit<HomeDashboardSnapshot["quickActions"][number], "key" | "permission"> & {
  key: string;
  permission: string;
  behavior?: "link" | "command";
};

type DashboardStaticShortcut = DashboardShortcutAction & {
  isAvailable: (snapshot: HomeDashboardSnapshot | null | undefined, backendActions: DashboardShortcutAction[]) => boolean;
};

const DASHBOARD_STATIC_SHORTCUTS: DashboardStaticShortcut[] = [
  {
    key: "global_search",
    label: "Search all",
    description: "Open the command palette for clients, jobs, appointments, vehicles, quotes, and invoices.",
    url: "#",
    permission: "dashboard.read",
    behavior: "command",
    isAvailable: (snapshot) => Boolean(snapshot),
  },
  {
    key: "search_appointments",
    label: "Search appointments",
    description: "Jump to schedule search for client names, times, vehicles, statuses, and techs.",
    url: "/appointments?focus=search",
    permission: "appointments.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.todaySchedule),
  },
  {
    key: "search_leads",
    label: "Search leads",
    description: "Open the lead queue with search focused for status, source, vehicle, and customer lookups.",
    url: "/leads?focus=search",
    permission: "customers.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.clientVisibility || snapshot?.modulePermissions.pipeline || snapshot?.modulePermissions.conversion),
  },
  {
    key: "add_lead",
    label: "Add lead",
    description: "Open the lead intake form without hunting through the lead queue.",
    url: "/leads?compose=1",
    permission: "customers.write",
    isAvailable: (_snapshot, backendActions) => backendActions.some((action) => action.key === "add_client"),
  },
  {
    key: "calendar_week",
    label: "Week calendar",
    description: "Open the calendar directly in the mobile-friendly week view.",
    url: "/calendar?view=week",
    permission: "appointments.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.todaySchedule),
  },
  {
    key: "booking_requests",
    label: "Booking requests",
    description: "Review inbound booking requests and customer replies.",
    url: "/appointments/requests",
    permission: "appointments.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.todaySchedule),
  },
  {
    key: "clients",
    label: "Clients",
    description: "Open customer records and contact history.",
    url: "/clients",
    permission: "customers.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.clientVisibility),
  },
  {
    key: "vehicles",
    label: "Vehicles",
    description: "Jump to the vehicle list for VIN, plate, and service history lookups.",
    url: "/vehicles",
    permission: "vehicles.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.vehicleVisibility),
  },
  {
    key: "jobs",
    label: "Jobs",
    description: "Open active job workflow and status tracking.",
    url: "/jobs",
    permission: "jobs.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.todaySchedule),
  },
  {
    key: "quotes",
    label: "Quotes",
    description: "Review estimates and approvals.",
    url: "/quotes",
    permission: "quotes.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.quoteVisibility),
  },
  {
    key: "invoices",
    label: "Invoices",
    description: "Review invoice status, balances, and sends.",
    url: "/invoices",
    permission: "invoices.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.invoiceVisibility),
  },
  {
    key: "finances",
    label: "Finances",
    description: "Open cash, payment, and collection visibility.",
    url: "/finances",
    permission: "payments.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.paymentVisibility || snapshot?.modulePermissions.revenueCollections || snapshot?.modulePermissions.cash),
  },
  {
    key: "settings",
    label: "Settings",
    description: "Open workspace, team, and account settings.",
    url: "/settings",
    permission: "settings.read",
    isAvailable: (snapshot) => Boolean(snapshot?.modulePermissions.settingsVisibility),
  },
];

function loadStoredDashboardShortcuts(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_SHORTCUTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return null;
  }
}

function getAvailableDashboardShortcuts(snapshot: HomeDashboardSnapshot | null | undefined): DashboardShortcutAction[] {
  const backendActions = ((snapshot?.quickActions ?? []) as DashboardShortcutAction[]).map((action) => ({
    ...action,
    behavior: "link" as const,
  }));
  const shortcuts = [...backendActions];

  DASHBOARD_STATIC_SHORTCUTS.forEach((shortcut) => {
    if (!shortcut.isAvailable(snapshot, backendActions)) return;
    if (shortcuts.some((action) => action.key === shortcut.key)) return;
    const { isAvailable: _isAvailable, ...action } = shortcut;
    shortcuts.push(action);
  });

  return shortcuts;
}

function getDefaultDashboardShortcuts(availableActions: DashboardShortcutAction[]): DashboardShortcutAction[] {
  const availableByKey = new Map(availableActions.map((action) => [action.key, action]));
  const defaults = DEFAULT_DASHBOARD_SHORTCUT_KEYS
    .map((key) => availableByKey.get(key))
    .filter((action): action is DashboardShortcutAction => Boolean(action));
  return defaults.length > 0 ? defaults : availableActions.slice(0, 4);
}

function WidgetErrorState({ title, error, onRetry }: { title: string; error?: Error | null; onRetry?: () => void }) {
  return (
    <Card className={cn(dashboardPanelClassName, "min-h-[220px]")}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>This section is temporarily unavailable.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
          <AlertCircle className="h-3.5 w-3.5" />
          Needs retry
        </div>
        <p className="text-sm text-muted-foreground">{error?.message ?? "Dashboard data could not be loaded."}</p>
        {onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CardLoadingShell({ title, rows = 4, compact = false }: { title: string; rows?: number; compact?: boolean }) {
  return (
    <Card className={cn(dashboardPanelClassName, compact ? "min-h-[140px]" : "min-h-[220px]")}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function HomeOverviewKpiStrip({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  if (loading) {
    return (
      <Card className={cn(dashboardPanelClassName, "overflow-hidden")}>
        <CardContent className="grid grid-cols-2 gap-0 p-0 xl:grid-cols-4">
          {["Bookings today", "Bookings this week", "Revenue this month", "Overdue balance"].map((title, index) => (
            <div key={title} className={cn("space-y-3 px-3 py-4 sm:px-4", getKpiStripCellBorderClass(index))}>
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }
  if (error) return <WidgetErrorState title="KPI Strip" error={error} onRetry={onRetry} />;

  const bookings = snapshot?.bookingsOverview;
  const goals = snapshot?.goals;
  const cash = snapshot?.revenueCollections;
  const overdueCount = snapshot?.actionQueue.items.filter((item) => item.type === "overdue_invoice").length ?? 0;
  const items = [
    {
      key: "bookings_today",
      title: "Bookings today",
      value: bookings?.bookingsToday ?? 0,
      context: `${bookings?.bookingsThisWeek ?? 0} scheduled this week`,
      href: "/appointments",
      tone: "text-slate-950",
    },
    {
      key: "bookings_week",
      title: "Bookings this week",
      value: bookings?.bookingsThisWeek ?? 0,
      context: `${bookings?.bookingsThisMonth ?? 0} scheduled this month`,
      href: "/appointments",
      tone: "text-slate-950",
    },
    {
      key: "revenue_month",
      title: "Revenue this month",
      value: formatDashboardCompactCurrency(snapshot?.monthlyRevenueChart.totalBookedThisMonth ?? 0),
      context: goals?.percentToGoal != null ? `${goals.percentToGoal}% to goal` : "Booked revenue month to date",
      href: "/calendar",
      tone: "text-slate-950",
    },
    {
      key: "overdue_balance",
      title: "Overdue balance",
      value: formatDashboardCompactCurrency(cash?.overdueInvoiceAmount ?? 0),
      context: overdueCount > 0 ? `${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"}` : "No overdue invoices",
      href: "/invoices",
      tone: (cash?.overdueInvoiceAmount ?? 0) > 0 ? "text-amber-700" : "text-slate-950",
    },
  ];

  return (
    <Card className={cn(dashboardPanelClassName, "overflow-hidden border-slate-200/75")}>
      <CardContent className="grid grid-cols-2 gap-0 p-0 xl:grid-cols-4">
        {items.map((item, index) => (
          <Link
            key={item.key}
            to={item.href}
            className={cn(
              "group flex min-h-[118px] flex-col justify-between px-3 py-4 transition-colors hover:bg-white/80 sm:min-h-[126px] sm:px-4",
              getKpiStripCellBorderClass(index)
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{item.title}</p>
                <p className={cn("mt-2.5 text-2xl font-semibold tracking-[-0.05em] sm:mt-3 sm:text-3xl", item.tone)}>{item.value}</p>
              </div>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50/80 text-slate-600 transition-colors group-hover:border-amber-200 group-hover:bg-amber-50 group-hover:text-amber-700 sm:h-9 sm:w-9">
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500 sm:mt-4 sm:text-sm">{item.context}</p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function getKpiStripCellBorderClass(index: number) {
  if (index === 0) return "";
  if (index === 1) return "border-l border-slate-200/75";
  if (index === 2) return "border-t border-slate-200/75 xl:border-l xl:border-t-0";
  return "border-l border-t border-slate-200/75";
}

export function HomeWeeklyAppointmentOverviewCard({
  snapshot,
  loading,
  error,
  onRetry,
  selectedDate,
  onSelectDate,
  onChangeWeek,
  nativeIOS = false,
}: {
  snapshot?: HomeDashboardSnapshot | null;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  selectedDate?: string | null;
  onSelectDate?: (date: string | null) => void;
  onChangeWeek?: (weekStartDate: string | null, selectedDate?: string | null) => void;
  nativeIOS?: boolean;
}) {
  if (loading) return <CardLoadingShell title="Weekly Appointment Overview" rows={7} />;
  if (error) return <WidgetErrorState title="Weekly Appointment Overview" error={error} onRetry={onRetry} />;

  const overview = snapshot?.weeklyOverview;
  if (!overview?.allowed) {
    return (
      <Card className={dashboardPanelClassName}>
        <CardHeader>
          <CardTitle>Weekly Appointment Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={CalendarClock} title="Weekly overview hidden" description="This role does not have access to appointment scheduling data." />
        </CardContent>
      </Card>
    );
  }

  const hasAppointments = overview.days.some((day) => day.appointmentCount > 0);
  const totalAppointments = overview.days.reduce((sum, day) => sum + day.appointmentCount, 0);
  const totalBookedValue = overview.days.reduce((sum, day) => sum + day.bookedValue, 0);
  const busiestDay = overview.days.reduce<(typeof overview.days)[number] | null>((best, day) => {
    if (!best) return day;
    if (day.appointmentCount > best.appointmentCount) return day;
    if (day.appointmentCount === best.appointmentCount && day.bookedValue > best.bookedValue) return day;
    return best;
  }, null);
  const activeDay =
    overview.days.find((day) => day.date === selectedDate)
    ?? overview.days.find((day) => day.date === overview.selectedDate)
    ?? overview.days.find((day) => day.appointmentCount > 0)
    ?? overview.days[0]
    ?? null;

  if (!activeDay) {
    return (
      <Card className={dashboardPanelClassName}>
        <CardHeader>
          <CardTitle>Weekly Appointment Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={CalendarClock} title="No week selected" description="Choose a week to review your appointment load." />
        </CardContent>
      </Card>
    );
  }

  if (nativeIOS) {
    return (
      <Card className="overflow-hidden rounded-[1.45rem] border-white/80 bg-white/96 shadow-[0_14px_32px_rgba(15,23,42,0.07)]">
        <CardHeader className="border-b border-slate-100/90 px-3.5 pb-3 pt-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Week pulse</p>
              <CardTitle className="mt-1 text-[1.2rem] tracking-[-0.03em]">Today and next jobs</CardTitle>
              <CardDescription className="mt-1 text-[12px] leading-5 text-slate-500">
                {formatDateLabel(overview.weekStart, "MMM d")} - {formatDateLabel(overview.weekEnd, "MMM d")}
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full border-slate-200 bg-white/88"
                onClick={() => onChangeWeek?.(shiftDateKey(overview.days[0]?.date ?? activeDay.date, -7), shiftDateKey(activeDay.date, -7))}
                aria-label="Previous week"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full border-slate-200 bg-white/88"
                onClick={() => onChangeWeek?.(shiftDateKey(overview.days[0]?.date ?? activeDay.date, 7), shiftDateKey(activeDay.date, 7))}
                aria-label="Next week"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-3.5 py-3.5">
          <div className="grid grid-cols-7 gap-1.5">
            {overview.days.map((day) => {
              const isActive = day.date === activeDay.date;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => {
                    void triggerSelectionFeedback();
                    onSelectDate?.(day.date);
                  }}
                  className={cn(
                    "native-touch-surface flex min-h-[4.25rem] flex-col items-center justify-between rounded-[0.95rem] border px-0.5 py-1.5 text-center transition-all",
                    isActive
                      ? "border-primary/35 bg-primary text-primary-foreground shadow-[0_10px_22px_rgba(249,115,22,0.2)]"
                      : "border-slate-200/75 bg-slate-50/80 text-slate-600 active:bg-slate-100"
                  )}
                  aria-pressed={isActive}
                >
                  <span className={cn("text-[8px] font-semibold uppercase tracking-[0.12em]", isActive ? "text-primary-foreground/75" : "text-slate-500")}>
                    {day.shortLabel}
                  </span>
                  <span className="text-[15px] font-semibold leading-none tabular-nums">{formatDateLabel(day.date, "d")}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", isActive ? "bg-white/18" : "bg-white text-slate-700")}>
                    {day.appointmentCount}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-[1.2rem] border border-slate-200/75 bg-slate-50/75 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Selected day</p>
                <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-slate-950">
                  {activeDay.label}, {formatDateLabel(activeDay.date, "MMM d")}
                </p>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">
                  {activeDay.appointmentCount} appointment{activeDay.appointmentCount === 1 ? "" : "s"} · {formatDashboardCurrency(activeDay.bookedValue)} booked
                </p>
              </div>
              <Button asChild variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full border-slate-200 bg-white/90">
                <Link to={activeDay.calendarUrl} aria-label={`Open ${activeDay.label} in calendar`}>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="space-y-2.5">
            {activeDay.previewItems.length === 0 ? (
              <div className="rounded-[1.15rem] border border-dashed border-slate-200/80 bg-white/80 px-3.5 py-4 text-sm text-slate-500">
                No jobs queued for this day.
              </div>
            ) : (
              activeDay.previewItems.slice(0, 4).map((item) => (
                <Link
                  key={item.id}
                  to={item.url}
                  className="native-touch-surface flex min-h-[4.35rem] items-start gap-3 rounded-[1.15rem] border border-white/80 bg-white/94 px-3.5 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] active:scale-[0.99]"
                >
                  <div className="shrink-0 rounded-[0.9rem] bg-slate-100 px-2.5 py-2 text-center">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Start</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-800">{formatDateLabel(item.startTime, "h:mm a")}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{item.title}</p>
                    <p className="mt-1 line-clamp-1 text-[12px] text-slate-500">
                      {item.clientName}
                      {item.vehicleLabel ? ` · ${item.vehicleLabel}` : ""}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={dashboardPanelClassName}>
      <CardHeader className="border-b border-slate-100/90 pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Operating week</p>
            <CardTitle className="text-xl tracking-[-0.03em]">Weekly Appointment Overview</CardTitle>
            <CardDescription className="text-slate-500">{formatDateLabel(overview.weekStart, "MMM d")} - {formatDateLabel(overview.weekEnd, "MMM d")}</CardDescription>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
            <div className="rounded-[1rem] border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Week load</p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{totalAppointments}</p>
              <p className="text-xs text-slate-500">appointments booked</p>
            </div>
            <div className="rounded-[1rem] border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Booked value</p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{formatDashboardCurrency(totalBookedValue)}</p>
              <p className="text-xs text-slate-500">scheduled this week</p>
            </div>
            <div className="rounded-[1rem] border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Busiest day</p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{busiestDay ? busiestDay.shortLabel : "--"}</p>
              <p className="text-xs text-slate-500">{busiestDay ? `${busiestDay.appointmentCount} jobs` : "no load yet"}</p>
            </div>
          </div>
        </div>
        <CardAction className="w-full lg:w-auto">
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full border-slate-200 bg-slate-50/80"
              onClick={() => onChangeWeek?.(shiftDateKey(overview.days[0]?.date ?? activeDay.date, -7), shiftDateKey(activeDay.date, -7))}
              aria-label="Previous week"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full border-slate-200 bg-slate-50/80"
              onClick={() => onChangeWeek?.(shiftDateKey(overview.days[0]?.date ?? activeDay.date, 7), shiftDateKey(activeDay.date, 7))}
              aria-label="Next week"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button asChild variant="outline" size="sm" className="min-h-[42px] flex-1 rounded-full border-slate-200 bg-slate-50/80 sm:flex-none">
              <Link to={activeDay.calendarUrl}>
                Open day view
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAppointments ? (
          <EmptyState
            icon={CalendarClock}
            title="No appointments scheduled this week"
            description="This week is open right now. Add the next appointment to start filling the board."
            action={
              <Button asChild className="rounded-full bg-slate-950 text-white hover:bg-slate-800">
                <Link to="/appointments/new">New appointment</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <div className="-mx-1 overflow-x-auto px-1 pb-2">
                <div className="grid min-w-[1470px] grid-cols-7 gap-3 2xl:min-w-0">
                  {overview.days.map((day) => {
                    const isActive = day.date === activeDay.date;
                    return (
                      <div
                        key={day.date}
                        className={cn(
                          "flex min-h-[208px] min-w-0 flex-col overflow-hidden rounded-[1.25rem] border text-left transition-all",
                          isActive
                            ? "border-amber-300 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                            : "border-slate-200/80 bg-white/88 hover:border-slate-300 hover:bg-white"
                        )}
                      >
                        <div className={cn("border-b px-4 py-3.5", isActive ? "border-amber-200 bg-amber-50/55" : "border-slate-200/80 bg-slate-50/55")}>
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectDate?.(day.date)}
                              className="min-w-0 flex-1 rounded-[1rem] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/70"
                              aria-label={`Open ${day.label} summary in weekly overview`}
                              aria-pressed={isActive}
                            >
                              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{day.shortLabel}</p>
                              <p className="mt-1 whitespace-nowrap text-sm font-semibold tracking-tight text-slate-950">{formatDateLabel(day.date, "MMM d")}</p>
                              <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">Booked</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">
                                {formatDashboardCurrency(day.bookedValue)}
                              </p>
                            </button>
                            <Link
                              to={day.calendarUrl}
                              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-950"
                              aria-label={`Open ${day.label} in calendar`}
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col justify-between px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => onSelectDate?.(day.date)}
                            className="min-w-0 flex-1 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/70"
                            aria-label={`Focus ${day.label} in weekly overview`}
                            aria-pressed={isActive}
                          >
                            <div>
                              <p className="text-[34px] font-semibold leading-none tracking-[-0.05em] text-slate-950">{day.appointmentCount}</p>
                              <p className="mt-1 text-[11px] font-medium text-slate-500">{day.appointmentCount === 1 ? "appointment" : "appointments"}</p>
                              <p className="mt-3 text-[11px] text-slate-500">{day.previewItems.length} in queue</p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {day.capacityUsage != null ? `${day.capacityUsage}% covered` : "No coverage signal"}
                              </p>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                              <span className="font-medium text-slate-600">Up {day.statusCounts.upcoming}</span>
                              <span className="font-medium text-blue-700">Live {day.statusCounts.inProgress}</span>
                              <span className="font-medium text-emerald-700">Done {day.statusCounts.completed}</span>
                              <span className="font-medium text-rose-700">Cancel {day.statusCounts.cancelled}</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:hidden">
              {overview.days.map((day) => {
                const isActive = day.date === activeDay.date;
                return (
                  <div
                    key={day.date}
                    className={cn(
                      "rounded-[1.2rem] border p-3 transition-colors",
                      isActive ? "border-amber-300 bg-amber-50/60 shadow-sm" : "border-slate-200/75 bg-white/88"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => onSelectDate?.(day.date)} className="min-w-0 text-left" aria-pressed={isActive}>
                        <span className="sr-only">{`Focus ${day.label} in weekly overview`}</span>
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{day.label}</p>
                        <div className="mt-1 flex items-end justify-between gap-3">
                          <p className="text-lg font-semibold tracking-tight text-slate-950">{day.appointmentCount} {day.appointmentCount === 1 ? "appointment" : "appointments"}</p>
                          <p className="text-sm font-medium text-slate-700">{formatDashboardCurrency(day.bookedValue)}</p>
                        </div>
                      </button>
                      <Button asChild variant="ghost" size="icon" className="mt-0.5 h-8 w-8 rounded-full">
                        <Link to={day.calendarUrl} aria-label={`Open ${day.label} in calendar`}>
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Up {day.statusCounts.upcoming}</span>
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Live {day.statusCounts.inProgress}</span>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Done {day.statusCounts.completed}</span>
                      <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">Cancel {day.statusCounts.cancelled}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {day.previewItems.length === 0 ? (
                        <div className="rounded-[1rem] border border-dashed border-slate-200/80 bg-white/75 px-3 py-3 text-xs text-slate-500">
                          No jobs queued yet.
                        </div>
                      ) : (
                        day.previewItems.slice(0, 3).map((item) => (
                          <Link
                            key={item.id}
                            to={item.url}
                            className="block rounded-[1rem] border border-slate-200/80 bg-white/92 px-3 py-2.5 transition-colors hover:border-amber-200 hover:bg-amber-50/45"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-[12px] font-semibold leading-4 text-slate-950">{item.title}</p>
                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">
                                  {item.clientName}
                                  {item.vehicleLabel ? ` · ${item.vehicleLabel}` : ""}
                                </p>
                              </div>
                              <p className="shrink-0 text-[11px] font-medium text-slate-500">
                                {formatDateLabel(item.startTime, "h:mm a")}
                              </p>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                    {day.capacityUsage != null ? (
                      <div className="mt-3 flex items-center justify-between rounded-[0.95rem] border border-slate-200/75 bg-slate-100/85 px-3 py-2 text-[11px] text-slate-500">
                        <span>Assigned coverage</span>
                        <span className="font-semibold text-slate-700">{day.capacityUsage}%</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className={cn(dashboardInsetClassName, "overflow-hidden p-0")}>
              <div className="border-b border-slate-200/80 bg-slate-50/45 px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1.5">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Dispatch board</p>
                    <p className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{activeDay.label}, {formatDateLabel(activeDay.date, "MMM d")}</p>
                    <p className="text-sm text-slate-500">
                      {activeDay.appointmentCount} appointments scheduled with {formatDashboardCurrency(activeDay.bookedValue)} booked for the day
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button asChild variant="outline" className="min-h-[42px] w-full rounded-full border-slate-200 bg-white/80 sm:w-auto">
                      <Link to={activeDay.calendarUrl}>
                        Open day in calendar
                        <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-500">
                      {busiestDay?.date === activeDay.date ? "Highest load this week" : "Review details before dispatch"}
                    </div>
                    {activeDay.capacityUsage != null ? (
                      <div className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-500">
                        Assigned coverage {activeDay.capacityUsage}%
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                  <div className="rounded-[1rem] border border-slate-200/80 bg-white/92 px-3.5 py-3.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Upcoming</p>
                    <p className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{activeDay.statusCounts.upcoming}</p>
                    <p className="text-[11px] text-slate-500">still waiting to start</p>
                  </div>
                  <div className="rounded-[1rem] border border-slate-200/80 bg-white/92 px-3.5 py-3.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Live</p>
                    <p className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{activeDay.statusCounts.inProgress}</p>
                    <p className="text-[11px] text-slate-500">currently in the bay</p>
                  </div>
                  <div className="rounded-[1rem] border border-slate-200/80 bg-white/92 px-3.5 py-3.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Done</p>
                    <p className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{activeDay.statusCounts.completed}</p>
                    <p className="text-[11px] text-slate-500">wrapped for the day</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-0 lg:grid-cols-[0.9fr_1.4fr]">
                <div className="border-b border-slate-200/80 bg-white/70 px-4 py-4 lg:border-b-0 lg:border-r sm:px-5">
                  <div className="rounded-[1rem] border border-slate-200/80 bg-white/92 px-3.5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status mix</p>
                      <span className="text-[11px] text-slate-400">Day health</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-[0.9rem] bg-slate-50 px-3 py-2.5"><span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Upcoming</span><span className="mt-1 block font-semibold text-slate-900">{activeDay.statusCounts.upcoming}</span></div>
                      <div className="rounded-[0.9rem] bg-blue-50 px-3 py-2.5"><span className="block text-[10px] uppercase tracking-[0.14em] text-blue-600">In progress</span><span className="mt-1 block font-semibold text-blue-900">{activeDay.statusCounts.inProgress}</span></div>
                      <div className="rounded-[0.9rem] bg-emerald-50 px-3 py-2.5"><span className="block text-[10px] uppercase tracking-[0.14em] text-emerald-600">Completed</span><span className="mt-1 block font-semibold text-emerald-900">{activeDay.statusCounts.completed}</span></div>
                      <div className="rounded-[0.9rem] bg-rose-50 px-3 py-2.5"><span className="block text-[10px] uppercase tracking-[0.14em] text-rose-600">Cancelled</span><span className="mt-1 block font-semibold text-rose-900">{activeDay.statusCounts.cancelled}</span></div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-[1rem] border border-slate-200/80 bg-white/92 px-3.5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Coverage</p>
                      <span className="text-[11px] text-slate-400">Crew signal</span>
                    </div>
                    <div className="mt-3 space-y-2.5">
                      {activeDay.capacityUsage != null ? (
                        <>
                          <div className="flex items-center justify-between rounded-[0.95rem] border border-slate-200/80 bg-slate-50/85 px-3 py-2.5 text-sm text-slate-500">
                            <span>Assigned coverage</span>
                            <span className="font-semibold text-slate-900">{activeDay.capacityUsage}%</span>
                          </div>
                          <p className="text-xs leading-5 text-slate-500">Use this as a quick staffing signal before opening the full calendar day view.</p>
                        </>
                      ) : (
                        <div className="rounded-[0.95rem] border border-dashed border-slate-200/80 bg-white/75 px-3 py-3 text-sm text-slate-500">
                          No staffing coverage signal is available for this day.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-white/80 px-4 py-4 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Day queue</p>
                      <p className="mt-1 text-sm text-slate-500">{activeDay.previewItems.length} scheduled stop{activeDay.previewItems.length === 1 ? "" : "s"} ready for review</p>
                    </div>
                    <span className="rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                      {activeDay.previewItems.length} items
                    </span>
                  </div>
                  <div className="mt-3 space-y-2.5 lg:max-h-[340px] lg:overflow-y-auto lg:pr-1">
                  {activeDay.previewItems.length === 0 ? (
                    <div className="rounded-[1rem] border border-dashed border-slate-200/80 bg-white/80 px-3 py-4 text-sm text-slate-500">
                      No jobs queued for this day yet.
                    </div>
                  ) : (
                    activeDay.previewItems.map((item) => (
                      <Link
                        key={item.id}
                        to={item.url}
                        className="flex items-start gap-3 rounded-[1rem] border border-slate-200/80 bg-white/95 px-3.5 py-3 transition-colors hover:border-amber-200 hover:bg-amber-50/45"
                      >
                        <div className="shrink-0 rounded-[0.95rem] border border-slate-200/80 bg-slate-50 px-2.5 py-2 text-center">
                          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Start</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-700">{formatDateLabel(item.startTime, "h:mm a")}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-950">{item.title}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {item.clientName} · {item.vehicleLabel}
                          </p>
                        </div>
                        <div className="shrink-0 self-center text-right">
                          <span className="inline-flex items-center text-xs font-medium text-slate-700">
                            Open
                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
export function HomeUpcomingAttentionPanel({
  snapshot,
  range,
  loading,
  error,
  onRetry,
  onDismiss,
  nativeIOS = false,
}: {
  snapshot?: HomeDashboardSnapshot | null;
  range: HomeDashboardRange;
  onDismiss?: (itemId: string) => void;
  nativeIOS?: boolean;
} & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Upcoming Jobs / Needs Attention" rows={6} />;
  if (error) return <WidgetErrorState title="Upcoming Jobs / Needs Attention" error={error} onRetry={onRetry} />;

  const scheduleItems = snapshot?.todaySchedule.items.slice(0, 4) ?? [];
  const queueItems = snapshot?.actionQueue.items.slice(0, 5) ?? [];
  const rangeLabel = range === "today" ? "today" : range === "week" ? "this week" : "this month";
  const scheduleCount = scheduleItems.length;
  const queueCount = queueItems.length;
  const priorityMoneyAtRisk = queueItems.reduce((sum, item) => sum + (item.amountAtRisk ?? 0), 0);

  if (nativeIOS) {
    return (
      <Card className="overflow-hidden rounded-[1.45rem] border-white/80 bg-white/96 shadow-[0_14px_32px_rgba(15,23,42,0.07)]">
        <CardHeader className="border-b border-slate-100/90 px-3.5 pb-3 pt-3.5">
          <CardTitle className="text-[1.15rem] tracking-[-0.03em]">Needs attention</CardTitle>
          <CardDescription className="text-[12px] leading-5 text-slate-500">
            {scheduleCount} upcoming · {queueCount} action item{queueCount === 1 ? "" : "s"} · {formatDashboardCompactCurrency(priorityMoneyAtRisk)} at risk
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 px-3.5 py-3.5">
          {scheduleItems.length === 0 && queueItems.length === 0 ? (
            <div className="rounded-[1.15rem] border border-dashed border-slate-200/80 bg-slate-50/80 px-3.5 py-4 text-sm text-slate-500">
              No upcoming jobs or urgent action items in this view.
            </div>
          ) : null}
          {scheduleItems.slice(0, 2).map((item) => (
            <Link
              key={item.id}
              to={item.urls.appointment}
              className="native-touch-surface flex min-h-[4.25rem] items-start gap-3 rounded-[1.15rem] border border-amber-100 bg-amber-50/70 px-3.5 py-3 active:scale-[0.99]"
            >
              <div className="shrink-0 rounded-[0.85rem] bg-white/80 px-2.5 py-2 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-700">Next</p>
                <p className="mt-1 text-[11px] font-semibold text-amber-900">{formatDateLabel(item.startTime, "h:mm a")}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{item.title}</p>
                <p className="mt-1 line-clamp-1 text-[12px] text-slate-500">
                  {item.client.name} · {item.vehicle.label}
                </p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-amber-700/70" />
            </Link>
          ))}
          {queueItems.slice(0, 3).map((item) => (
            <NativeAttentionQueueItem
              key={item.id}
              item={item}
              onDismiss={item.supportsDismiss ? onDismiss : undefined}
            />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={dashboardPanelClassName}>
      <CardHeader className="border-b border-slate-100/90 pb-5">
        <CardTitle className="text-xl tracking-[-0.03em]">Upcoming Jobs / Needs Attention</CardTitle>
        <CardDescription className="text-slate-500">The next jobs in {rangeLabel} and the revenue-pressure items that need action first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2.5 sm:grid-cols-3">
          <div className={cn(dashboardInsetClassName, "p-3.5")}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Upcoming</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight text-slate-950">{scheduleCount}</p>
              <CalendarClock className="h-4 w-4 text-slate-300" />
            </div>
            <p className="text-xs text-slate-500">jobs in the current {rangeLabel} view</p>
          </div>
          <div className={cn(dashboardInsetClassName, "p-3.5")}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Needs action</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight text-slate-950">{queueCount}</p>
              <ClipboardList className="h-4 w-4 text-slate-300" />
            </div>
            <p className="text-xs text-slate-500">priority items waiting on the team</p>
          </div>
          <div className={cn(dashboardInsetClassName, "p-3.5")}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">At risk</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className={cn("text-2xl font-semibold tracking-tight", priorityMoneyAtRisk > 0 ? "text-amber-700" : "text-slate-950")}>
                {formatDashboardCompactCurrency(priorityMoneyAtRisk)}
              </p>
              <CircleDollarSign className={cn("h-4 w-4", priorityMoneyAtRisk > 0 ? "text-amber-300" : "text-slate-300")} />
            </div>
            <p className="text-xs text-slate-500">urgent money tied to the queue</p>
          </div>
        </div>

        <div className={cn(dashboardInsetClassName, "overflow-hidden")}>
          <div className="border-b border-slate-200/80 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Operating queue
                </div>
                <p className="mt-1 text-xs text-slate-500">Upcoming work first, then items blocking cash or follow-up.</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] text-slate-500">
                {scheduleCount + queueCount} items
              </span>
            </div>
          </div>
          <div className="divide-y divide-slate-200/75 xl:max-h-[535px] xl:overflow-y-auto">
            {scheduleItems.length === 0 && queueItems.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">No upcoming jobs or urgent action items in this view.</div>
            ) : (
              <>
                {scheduleItems.map((item) => (
                  <Link
                    key={item.id}
                    to={item.urls.appointment}
                    className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-white/70"
                  >
                    <div className="shrink-0 rounded-[0.95rem] border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-amber-700">Next</p>
                      <p className="mt-1 text-[11px] font-semibold text-amber-900">{formatDateLabel(item.startTime, "h:mm a")}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                          <CalendarClock className="h-3 w-3" />
                          Upcoming
                        </span>
                        <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{formatDateLabel(item.startTime, "EEE")}</span>
                      </div>
                      <p className="mt-2 font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.client.name} · {item.vehicle.label}
                      </p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                ))}
                {queueItems.map((item) => (
                  <div key={item.id} className="px-4 py-3.5">
                    <div className="rounded-[1rem] border border-slate-200/80 bg-white/88 px-3.5 py-3">
                      <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                              item.urgency === "critical"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : item.urgency === "high"
                                  ? "border-orange-200 bg-orange-50 text-orange-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                            )}
                          >
                            {item.urgency}
                          </span>
                          {item.amountAtRisk != null ? (
                            <Badge variant="outline" className="border-slate-200 bg-slate-50">
                              {formatDashboardCurrency(item.amountAtRisk)} at risk
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 font-semibold text-slate-950">{item.label}</p>
                        <p className="mt-1 text-sm text-slate-500">{item.reason}</p>
                      </div>
                      <Button asChild size="sm" className="rounded-full bg-slate-950 text-white hover:bg-slate-800">
                        <Link to={item.ctaUrl}>{item.ctaLabel}</Link>
                      </Button>
                    </div>
                    {item.supportsDismiss && onDismiss ? (
                      <div className="mt-3 flex gap-2">
                        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full border border-slate-200 bg-slate-50/80 text-xs text-slate-700" onClick={() => onDismiss(item.id)}>
                          Dismiss
                        </Button>
                      </div>
                    ) : null}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NativeAttentionQueueItem({
  item,
  onDismiss,
}: {
  item: HomeDashboardSnapshot["actionQueue"]["items"][number];
  onDismiss?: (itemId: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const gestureRef = useRef({
    active: false,
    dragging: false,
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    startTime: 0,
  });

  const completeDismiss = () => {
    if (!onDismiss || removing) return;
    void triggerSelectionFeedback();
    setRemoving(true);
    window.setTimeout(() => onDismiss(item.id), 170);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.15rem] transition-[max-height,opacity,transform] duration-200",
        removing ? "max-h-0 scale-[0.98] opacity-0" : "max-h-56 opacity-100"
      )}
    >
      {onDismiss ? (
        <div className="absolute inset-0 flex items-center justify-end rounded-[1.15rem] bg-emerald-500 px-4 text-sm font-semibold text-white">
          Dismiss
        </div>
      ) : null}
      <div
        className={cn(
          "rounded-[1.15rem] border border-slate-200/80 bg-slate-50/90 px-3.5 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition-[transform,background-color,box-shadow] duration-150",
          dragging && "transition-none",
          onDismiss && "active:bg-white"
        )}
        style={{ transform: `translate3d(${offset}px,0,0)`, touchAction: "pan-y" }}
        onPointerDown={(event) => {
          if (!onDismiss || event.pointerType === "mouse") return;
          gestureRef.current = {
            active: true,
            dragging: false,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startTime: performance.now(),
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const gesture = gestureRef.current;
          if (!onDismiss || !gesture.active || gesture.pointerId !== event.pointerId) return;
          const dx = event.clientX - gesture.startX;
          const dy = event.clientY - gesture.startY;
          if (!gesture.dragging) {
            if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
            if (Math.abs(dx) <= Math.abs(dy) * 1.25) return;
            gesture.dragging = true;
            setDragging(true);
          }
          event.preventDefault();
          setOffset(Math.max(-124, Math.min(124, dx * 0.82)));
        }}
        onPointerUp={(event) => {
          const gesture = gestureRef.current;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          if (!gesture.active || gesture.pointerId !== event.pointerId) return;
          const elapsed = Math.max(1, performance.now() - gesture.startTime);
          const velocity = Math.abs(offset) / elapsed;
          const shouldDismiss = gesture.dragging && onDismiss && (Math.abs(offset) > 82 || velocity > 0.65);
          gestureRef.current.active = false;
          gestureRef.current.dragging = false;
          gestureRef.current.pointerId = null;
          setDragging(false);
          if (shouldDismiss) {
            setOffset(offset < 0 ? -420 : 420);
            completeDismiss();
          } else {
            setOffset(0);
          }
        }}
        onPointerCancel={() => {
          gestureRef.current.active = false;
          gestureRef.current.dragging = false;
          gestureRef.current.pointerId = null;
          setDragging(false);
          setOffset(0);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                  item.urgency === "critical"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : item.urgency === "high"
                      ? "border-orange-200 bg-orange-50 text-orange-700"
                      : "border-slate-200 bg-white text-slate-600"
                )}
              >
                {item.urgency}
              </span>
              {item.amountAtRisk != null ? (
                <Badge variant="outline" className="border-slate-200 bg-white text-[10px]">
                  {formatDashboardCurrency(item.amountAtRisk)}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{item.label}</p>
            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">{item.reason}</p>
          </div>
          <Button asChild size="sm" className="min-h-9 shrink-0 rounded-full bg-slate-950 px-3 text-xs text-white hover:bg-slate-800">
            <Link to={item.ctaUrl}>{item.ctaLabel}</Link>
          </Button>
        </div>
        {onDismiss ? (
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full border border-slate-200 bg-white/80 text-xs text-slate-700" onClick={completeDismiss}>
              Dismiss
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HomeMonthlyRevenueChartCard({
  snapshot,
  financeDashboard,
  loading,
  error,
  onRetry,
}: {
  snapshot?: HomeDashboardSnapshot | null;
  financeDashboard?: {
    kpis: {
      grossRevenue: number;
      expenses: number;
      projectedNetProfit: number;
      awaitingPayment: number;
    };
  } | null;
} & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Monthly Revenue" rows={6} />;
  if (error) return <WidgetErrorState title="Monthly Revenue" error={error} onRetry={onRetry} />;

  const chart = snapshot?.monthlyRevenueChart;
  if (!chart?.allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={BarChart3} title="Revenue chart hidden" description="This role does not have access to revenue visibility." />
        </CardContent>
      </Card>
    );
  }

  const bars = [
    {
      key: "booked",
      label: "Booked",
      value: chart.totalBookedThisMonth,
      tone: "bg-amber-500",
      hint: "scheduled work this month",
      url: "/calendar?view=month",
    },
    {
      key: "invoiced",
      label: "Invoiced",
      value: financeDashboard?.kpis.grossRevenue ?? 0,
      tone: "bg-slate-900",
      hint: "invoice value created this month",
      url: "/finances",
    },
    {
      key: "expenses",
      label: "Expenses",
      value: financeDashboard?.kpis.expenses ?? 0,
      tone: "bg-rose-500",
      hint: "logged expenses this month",
      url: "/finances?view=expenses",
    },
  ];
  const maxValue = Math.max(1, ...bars.map((bar) => bar.value));
  const hasAnyRevenue = bars.some((bar) => bar.value > 0);
  const summaryItems = [
    {
      label: "Booked",
      value: formatDashboardCompactCurrency(chart.totalBookedThisMonth),
      tone: "text-slate-950",
      hint: "scheduled work this month",
    },
    {
      label: "Invoiced",
      value: formatDashboardCompactCurrency(financeDashboard?.kpis.grossRevenue ?? 0),
      tone: "text-slate-950",
      hint: "invoice value this month",
    },
    {
      label: "Expenses",
      value: formatDashboardCompactCurrency(financeDashboard?.kpis.expenses ?? 0),
      tone: (financeDashboard?.kpis.expenses ?? 0) > 0 ? "text-rose-700" : "text-slate-950",
      hint: "logged expenses this month",
    },
    {
      label: "Projected net",
      value: formatDashboardCompactCurrency(financeDashboard?.kpis.projectedNetProfit ?? 0),
      tone: (financeDashboard?.kpis.projectedNetProfit ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700",
      hint: `Awaiting payment ${formatDashboardCompactCurrency(financeDashboard?.kpis.awaitingPayment ?? 0)}`,
    },
  ];

  return (
    <Card className={dashboardPanelClassName}>
      <CardHeader className="border-b border-slate-100/90 pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-xl tracking-[-0.03em]">Monthly Revenue</CardTitle>
            <CardDescription>
              {formatDateLabel(chart.monthStart, "MMMM yyyy")} · booked work, invoiced value, and expenses using the same finance source as the finances page.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          {summaryItems.map((item) => (
            <div key={item.label} className={cn(dashboardInsetClassName, "p-3.5")}>
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
              <p className={cn("mt-1 text-2xl font-semibold tracking-tight", item.tone)}>{item.value}</p>
              <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
            </div>
          ))}
        </div>

        <div className={cn(dashboardInsetClassName, "overflow-hidden p-0")}>
          {!hasAnyRevenue ? (
            <div className="p-4">
              <EmptyState
                icon={BarChart3}
                title="No revenue activity this month yet"
                description="Booked work, issued invoices, and expenses will show here automatically as business activity lands."
              />
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200/80 px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <span>Open any bar to jump into the source view behind that month-to-date number.</span>
                  {chart.goalAmount != null ? <span>Monthly goal: {formatDashboardCurrency(chart.goalAmount)}</span> : null}
                </div>
              </div>
              <div className="px-4 py-4">
                <div className="rounded-[1.1rem] border border-slate-200/70 bg-white/92 p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    {bars.map((bar) => {
                      const barHeight = bar.value > 0 ? Math.max(10, Math.round((bar.value / maxValue) * 100)) : 10;
                      return (
                        <Link
                          key={bar.key}
                          to={bar.url}
                          className="group rounded-[1rem] border border-slate-200/70 bg-slate-50/70 p-4 transition-colors hover:bg-white"
                        >
                          <div className="flex h-48 items-end justify-center rounded-[0.9rem] border border-dashed border-slate-200/80 bg-white px-6 pb-4 pt-6">
                            <div className="flex h-full w-full items-end justify-center">
                              <div className={cn("w-full max-w-[92px] rounded-t-[18px] transition-all group-hover:opacity-90", bar.tone)} style={{ height: `${barHeight}%` }} />
                            </div>
                          </div>
                          <div className="mt-4 space-y-1 text-center">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{bar.label}</p>
                            <p className="text-2xl font-semibold tracking-tight text-slate-950">{formatDashboardCompactCurrency(bar.value)}</p>
                            <p className="text-xs text-slate-500">{bar.hint}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    Booked
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
                    Invoiced
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    Expenses
                  </span>
                  <span>Projected net: {formatDashboardCurrency(financeDashboard?.kpis.projectedNetProfit ?? 0)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
export function HomeBookingsOverviewCard({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Bookings Overview" rows={6} compact />;
  if (error) return <WidgetErrorState title="Bookings Overview" error={error} onRetry={onRetry} />;

  const bookings = snapshot?.bookingsOverview;
  if (!bookings?.allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bookings Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={TrendingUp} title="Bookings overview hidden" description="This role does not have the visibility needed for booking performance." />
        </CardContent>
      </Card>
    );
  }

  const isEmpty =
    bookings.bookingsThisWeek === 0 &&
    bookings.bookingsThisMonth === 0 &&
    bookings.quotesSent === 0 &&
    bookings.quotesAccepted === 0 &&
    bookings.depositsCollectedAmount === 0 &&
    bookings.depositsDueAmount === 0;
  const depositCoverageBase = bookings.depositsCollectedAmount + bookings.depositsDueAmount;
  const depositCoveragePercent =
    depositCoverageBase > 0 ? Math.max(0, Math.min(100, Math.round((bookings.depositsCollectedAmount / depositCoverageBase) * 100))) : null;
  const addOnInsights = bookings.addOnInsights ?? {
    appointmentCount: 0,
    appointmentsWithAddOns: 0,
    attachmentRate: 0,
    addOnRevenue: 0,
    addOnCount: 0,
    averageAddOnRevenuePerBooking: 0,
    customerRequestCount: 0,
    customerRequestValue: 0,
    customerApprovedCount: 0,
    customerDeclinedCount: 0,
    customerRequestApprovalRate: null,
    pendingCustomerRequestCount: 0,
    pendingCustomerRequestValue: 0,
    topAddOns: [],
    topAddOnDrivers: [],
  };
  const stats = [
    {
      label: "Bookings this week",
      value: `${bookings.bookingsThisWeek}`,
      href: bookings.links.bookingsThisWeek,
      detail: bookings.bookingsToday > 0 ? `${bookings.bookingsToday} booked today` : "View this week's calendar",
    },
    {
      label: "Bookings this month",
      value: `${bookings.bookingsThisMonth}`,
      href: bookings.links.bookingsThisMonth,
      detail: "Open month view",
    },
    {
      label: "Quotes sent",
      value: `${bookings.quotesSent}`,
      href: bookings.links.quotesSent,
      detail: "Quotes waiting on response",
    },
    {
      label: "Quotes accepted",
      value: `${bookings.quotesAccepted}`,
      href: bookings.links.quotesAccepted,
      detail: "Accepted quotes ready to book",
    },
    {
      label: "Quote to book",
      value: bookings.quoteToBookConversionRate == null ? "--" : `${bookings.quoteToBookConversionRate}%`,
      href: bookings.links.quoteToBookConversionRate,
      detail: "Quoted stage to booked stage",
    },
    {
      label: "Avg ticket",
      value: bookings.averageTicketValue == null ? "--" : formatDashboardCurrency(bookings.averageTicketValue),
      href: bookings.links.averageTicketValue,
      detail: "Average booked value this month",
    },
  ];

  return (
    <Card className={dashboardPanelClassName}>
      <CardHeader>
        <CardTitle>Bookings Overview</CardTitle>
        <CardDescription className="text-slate-500">Booking pace, quote performance, and deposit pressure in one owner read.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEmpty ? (
          <EmptyState
            icon={TrendingUp}
            title="No booking performance data yet"
            description="Quotes, booked work, and deposit activity will show up here as soon as the shop gets moving."
          />
        ) : (
          <>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Link to={bookings.links.bookingsThisWeek} className={cn(dashboardInsetClassName, "block p-3.5 transition-colors hover:bg-white/92")}>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Weekly pace</p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{bookings.bookingsThisWeek}</p>
                <p className="text-xs text-slate-500">bookings in the current week</p>
              </Link>
              <Link to={bookings.links.quoteToBookConversionRate} className={cn(dashboardInsetClassName, "block p-3.5 transition-colors hover:bg-white/92")}>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Conversion</p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
                  {bookings.quoteToBookConversionRate == null ? "--" : `${bookings.quoteToBookConversionRate}%`}
                </p>
                <p className="text-xs text-slate-500">quoted stage to booked stage</p>
              </Link>
              <Link to={bookings.links.averageTicketValue} className={cn(dashboardInsetClassName, "block p-3.5 transition-colors hover:bg-white/92")}>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Avg ticket</p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
                  {bookings.averageTicketValue == null ? "--" : formatDashboardCompactCurrency(bookings.averageTicketValue)}
                </p>
                <p className="text-xs text-slate-500">average booked value this month</p>
              </Link>
            </div>
            <div className={cn(dashboardInsetClassName, "overflow-hidden")}>
              <div className="grid divide-y divide-slate-200/80 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {stats.map((stat) => (
                <Link
                  key={stat.label}
                  to={stat.href}
                  className="block p-3.5 transition-colors hover:bg-white/92"
                  aria-label={`Open ${stat.label.toLowerCase()} details`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{stat.label}</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{stat.value}</p>
                    </div>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{stat.detail}</p>
                </Link>
              ))}
              </div>
            </div>
            <div className={cn(dashboardInsetClassName, "p-4")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Deposit coverage</p>
                  <p className="mt-1 text-sm text-slate-500">Upcoming deposit requirements already covered vs still due.</p>
                </div>
                {depositCoveragePercent != null ? <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{depositCoveragePercent}% covered</div> : null}
              </div>
              {depositCoveragePercent != null ? <Progress className="mt-3 h-2" value={depositCoveragePercent} /> : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Link to={bookings.links.depositsCollected} className="flex flex-col gap-2 rounded-[0.95rem] bg-emerald-50/70 px-3 py-3 transition-colors hover:bg-emerald-50 sm:flex-row sm:items-center sm:justify-between sm:gap-3" aria-label="Open deposits collected details">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-emerald-700/80">Deposits covered</p>
                    <p className="mt-1 text-xs text-emerald-700/80">Upcoming deposit-backed jobs already covered</p>
                  </div>
                  <p className="text-lg font-semibold tracking-tight text-emerald-800">{formatDashboardCurrency(bookings.depositsCollectedAmount)}</p>
                </Link>
                <Link to={bookings.links.depositsDue} className="flex flex-col gap-2 rounded-[0.95rem] bg-orange-50/70 px-3 py-3 transition-colors hover:bg-orange-50 sm:flex-row sm:items-center sm:justify-between sm:gap-3" aria-label="Open deposits due details">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-orange-700/80">Deposits due</p>
                    <p className="mt-1 text-xs text-orange-700/80">{bookings.depositsDueCount} appointment{bookings.depositsDueCount === 1 ? "" : "s"} need deposits</p>
                  </div>
                  <p className="text-lg font-semibold tracking-tight text-orange-800">{formatDashboardCurrency(bookings.depositsDueAmount)}</p>
                </Link>
              </div>
            </div>
            <div className={cn(dashboardInsetClassName, "p-4")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Add-on lift</p>
                  <p className="mt-1 text-sm text-slate-500">Monthly add-on attachment and booked add-on revenue.</p>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {addOnInsights.attachmentRate}% attach
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[0.95rem] bg-white/80 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Revenue</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{formatDashboardCurrency(addOnInsights.addOnRevenue)}</p>
                </div>
                <div className="rounded-[0.95rem] bg-white/80 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Bookings</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
                    {addOnInsights.appointmentsWithAddOns}/{Math.max(addOnInsights.appointmentCount, 0)}
                  </p>
                </div>
                <div className="rounded-[0.95rem] bg-white/80 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Avg lift</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
                    {formatDashboardCompactCurrency(addOnInsights.averageAddOnRevenuePerBooking)}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[0.95rem] border border-orange-200/80 bg-orange-50/70 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-orange-700/80">Customer asks</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-orange-900">{addOnInsights.customerRequestCount}</p>
                  <p className="text-xs text-orange-800/75">{formatDashboardCompactCurrency(addOnInsights.customerRequestValue)} requested this month</p>
                </div>
                <div className="rounded-[0.95rem] border border-emerald-200/80 bg-emerald-50/70 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-emerald-700/80">Approved</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-emerald-900">{addOnInsights.customerApprovedCount}</p>
                  <p className="text-xs text-emerald-800/75">
                    {addOnInsights.customerRequestApprovalRate == null ? "No reviewed requests yet" : `${addOnInsights.customerRequestApprovalRate}% approval rate`}
                  </p>
                </div>
                <div className="rounded-[0.95rem] border border-slate-200/80 bg-white/80 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Pending</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{addOnInsights.pendingCustomerRequestCount}</p>
                  <p className="text-xs text-slate-500">{formatDashboardCompactCurrency(addOnInsights.pendingCustomerRequestValue)} waiting in needs attention</p>
                </div>
              </div>
              {addOnInsights.topAddOns.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {addOnInsights.topAddOns.map((addon) => (
                    <Badge key={addon.id} variant="outline" className="rounded-full bg-white px-3 py-1 text-slate-700">
                      {addon.name} · {addon.count} · {formatDashboardCompactCurrency(addon.revenue)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Add-ons selected on appointments this month will show up here.</p>
              )}
              {addOnInsights.topAddOnDrivers.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Best base-service drivers</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {addOnInsights.topAddOnDrivers.map((driver) => (
                      <div key={driver.id} className="rounded-[0.95rem] border border-slate-200/80 bg-white/80 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 text-sm font-semibold leading-5 text-slate-950">{driver.name}</p>
                          <span className="shrink-0 text-sm font-semibold text-emerald-700">{formatDashboardCompactCurrency(driver.revenue)}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {driver.count} add-on{driver.count === 1 ? "" : "s"} booked from this service
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {driver.topAddOns.map((addon) => (
                            <Badge key={addon.id} variant="outline" className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                              {addon.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type BottomPanelTab = "activity" | "receivables" | "follow_up";

export function HomeBottomPanels({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Operational feed" rows={5} />;
  if (error) return <WidgetErrorState title="Operational feed" error={error} onRetry={onRetry} />;

  const activityItems = snapshot?.recentActivity.items.slice(0, 8) ?? [];
  const receivablesItems = (snapshot?.actionQueue.items ?? []).filter((item) => item.type === "overdue_invoice" || item.type === "deposit_due");
  const followUpItems = (snapshot?.actionQueue.items ?? []).filter((item) => item.type === "uncontacted_lead" || item.type === "quote_follow_up");

  const panels: Array<{
    key: BottomPanelTab;
    title: string;
    description: string;
    icon: typeof History;
    count: number;
    content: ReactNode;
  }> = [
    {
      key: "activity",
      title: "Recent Activity",
      description: "Meaningful business events from the live shop day.",
      icon: History,
      count: activityItems.length,
      content:
        activityItems.length === 0 ? (
          <EmptyState icon={History} title="No activity yet" description="Appointments, payments, and quote changes will show here as the business runs." />
        ) : (
          <div className="overflow-hidden rounded-[1rem] border border-slate-200/80 bg-white/92 xl:max-h-[360px] xl:overflow-y-auto">
            {activityItems.map((item) => (
              <div key={item.id} className="border-b border-slate-200/70 p-3.5 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Live event</p>
                    {item.url ? (
                      <Link to={item.url} className="mt-1 block font-semibold text-slate-950 hover:text-amber-700">
                        {item.label}
                      </Link>
                    ) : (
                      <p className="mt-1 font-semibold text-slate-950">{item.label}</p>
                    )}
                    {item.detail ? <p className="mt-1 text-sm text-slate-500">{item.detail}</p> : null}
                  </div>
                  <span className="rounded-full bg-slate-100/80 px-2 py-1 text-[11px] font-medium text-slate-500">
                    {formatRelativeTime(item.occurredAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ),
    },
    {
      key: "receivables",
      title: "Unpaid Invoices / Deposits Due",
      description: "Money risk and missing deposits that need follow-up.",
      icon: CircleDollarSign,
      count: receivablesItems.length,
      content:
        receivablesItems.length === 0 ? (
          <EmptyState icon={Landmark} title="No overdue balances or deposit misses" description="Overdue invoices and missing deposits will surface here when they need attention." />
        ) : (
          <div className="overflow-hidden rounded-[1rem] border border-slate-200/80 bg-white/92 xl:max-h-[360px] xl:overflow-y-auto">
            {receivablesItems.map((item) => (
              <Link key={item.id} to={item.ctaUrl} className="block border-b border-slate-200/70 p-3.5 transition-colors last:border-b-0 hover:bg-amber-50/45">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {item.type === "overdue_invoice" ? "Invoice risk" : "Deposit miss"}
                    </p>
                    <p className="font-semibold text-slate-950">{item.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.reason}</p>
                  </div>
                  {item.amountAtRisk != null ? (
                    <Badge variant="outline" className="shrink-0 border-orange-200 bg-orange-50/80 font-semibold text-orange-700">
                      {formatDashboardCurrency(item.amountAtRisk)}
                    </Badge>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        ),
    },
    {
      key: "follow_up",
      title: "Lead / Quote follow-up",
      description: "Sales follow-up that still needs a response.",
      icon: Inbox,
      count: followUpItems.length,
      content:
        followUpItems.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No lead or quote follow-up gaps" description="Leads and quote follow-ups are under control right now." />
        ) : (
          <div className="overflow-hidden rounded-[1rem] border border-slate-200/80 bg-white/92 xl:max-h-[360px] xl:overflow-y-auto">
            {followUpItems.map((item) => (
              <Link key={item.id} to={item.ctaUrl} className="flex items-start justify-between gap-3 border-b border-slate-200/70 p-3.5 transition-colors last:border-b-0 hover:bg-amber-50/45">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {item.type === "quote_follow_up" ? "Quote follow-up" : "Lead response"}
                  </p>
                  <p className="font-semibold text-slate-950">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.reason}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 text-slate-400" />
              </Link>
            ))}
          </div>
        ),
    },
  ].filter((panel) => panel.count > 0);

  if (panels.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {panels.map((panel) => (
        <Card key={panel.key} className={dashboardPanelClassName}>
          <CardHeader className="border-b border-slate-100/90 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-500">
                <panel.icon className="h-4 w-4" />
                <CardTitle className="text-lg tracking-[-0.02em]">{panel.title}</CardTitle>
              </div>
              <span className="rounded-full border border-slate-200/80 bg-slate-50/85 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {panel.count}
              </span>
            </div>
            <CardDescription className="text-slate-500">{panel.description}</CardDescription>
          </CardHeader>
          <CardContent className="p-4">{panel.content}</CardContent>
        </Card>
      ))}
    </div>
  );
}

export function HomeCompactQuickActions({
  snapshot,
  loading,
  error,
  onRetry,
  nativeIOS = false,
}: { snapshot?: HomeDashboardSnapshot | null; nativeIOS?: boolean } & WidgetStateProps) {
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const [customizing, setCustomizing] = useState(false);
  const [selectedShortcutKeys, setSelectedShortcutKeys] = useState<string[] | null>(() => loadStoredDashboardShortcuts());
  const availableActions = useMemo(() => getAvailableDashboardShortcuts(snapshot), [snapshot]);
  const defaultActions = useMemo(() => getDefaultDashboardShortcuts(availableActions), [availableActions]);
  const visibleActions = useMemo(() => {
    if (!selectedShortcutKeys) return defaultActions;
    const availableByKey = new Map(availableActions.map((action) => [action.key, action]));
    return selectedShortcutKeys
      .map((key) => availableByKey.get(key))
      .filter((action): action is DashboardShortcutAction => Boolean(action));
  }, [availableActions, defaultActions, selectedShortcutKeys]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedShortcutKeys) return;
    window.localStorage.setItem(DASHBOARD_SHORTCUTS_STORAGE_KEY, JSON.stringify(selectedShortcutKeys));
  }, [selectedShortcutKeys]);

  if (loading) return <CardLoadingShell title="Shortcuts" rows={2} compact />;
  if (error) return <WidgetErrorState title="Shortcuts" error={error} onRetry={onRetry} />;

  if (availableActions.length === 0) return null;

  return (
    <Card
      className={cn(
        dashboardPanelClassName,
        "border-dashed border-slate-200/80 bg-gradient-to-r from-white/88 via-white/78 to-slate-50/78",
        nativeIOS && "rounded-[1.45rem] border-white/80 bg-white/96 shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className={cn("text-base tracking-[-0.02em] text-slate-800", nativeIOS && "text-[1.05rem]")}>Shortcuts</CardTitle>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "h-8 w-8 rounded-full border-slate-200 bg-white/88 text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition-all hover:border-slate-300 hover:bg-white hover:text-slate-950",
              nativeIOS && "h-10 w-10",
              customizing && "border-slate-300 bg-slate-950 text-white hover:bg-slate-900 hover:text-white"
            )}
            onClick={() => setCustomizing((current) => !current)}
            aria-expanded={customizing}
            aria-label={customizing ? "Done customizing shortcuts" : "Customize shortcuts"}
            title={customizing ? "Done customizing shortcuts" : "Customize shortcuts"}
          >
            <Settings className={cn("h-4 w-4 transition-transform", customizing && "rotate-45")} aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {customizing ? (
          <div className="rounded-[1.15rem] border border-slate-200/80 bg-white/82 p-3">
            <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-4", nativeIOS && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2")}>
              {availableActions.map((action) => {
                const activeKeys = selectedShortcutKeys ?? defaultActions.map((item) => item.key);
                const checked = activeKeys.includes(action.key);
                return (
                  <label
                    key={action.key}
                    className={cn(
                      "flex min-h-[58px] cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
                      checked
                        ? "border-slate-300 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const current = selectedShortcutKeys ?? defaultActions.map((item) => item.key);
                        if (event.target.checked) {
                          setSelectedShortcutKeys([...current.filter((key) => key !== action.key), action.key]);
                        } else {
                          setSelectedShortcutKeys(current.filter((key) => key !== action.key));
                        }
                      }}
                      className="h-4 w-4 accent-slate-950"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold leading-tight">{action.label}</span>
                      <span className={cn("mt-1 block text-[11px] font-medium leading-snug", checked ? "text-white/72" : "text-slate-500")}>
                        {action.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full text-xs text-slate-500"
                onClick={() => {
                  setSelectedShortcutKeys(null);
                  if (typeof window !== "undefined") {
                    window.localStorage.removeItem(DASHBOARD_SHORTCUTS_STORAGE_KEY);
                  }
                }}
              >
                Reset shortcuts
              </Button>
            </div>
          </div>
        ) : null}

        <div className={cn("grid gap-2 sm:flex sm:flex-wrap", nativeIOS && "grid-cols-2 sm:grid")}>
          {visibleActions.length > 0 ? (
            (nativeIOS ? visibleActions.slice(0, 6) : visibleActions).map((action) => {
              const primary = action.key === "new_appointment";
              const className = cn(
                "min-h-[42px] w-full justify-center rounded-full sm:w-auto sm:justify-start",
                primary
                  ? "bg-slate-950 text-white hover:bg-slate-800"
                  : "border-slate-200 bg-white/85 text-slate-700 hover:bg-slate-50",
                nativeIOS && "min-h-[3.25rem] rounded-[1rem] px-3 text-sm shadow-[0_8px_18px_rgba(15,23,42,0.04)] sm:w-full sm:justify-center"
              );

              if (action.behavior === "command") {
                return (
                  <Button
                    key={action.key}
                    type="button"
                    variant="outline"
                    className={className}
                    onClick={() => {
                      void triggerSelectionFeedback();
                      setCommandPaletteOpen(true);
                    }}
                  >
                    {action.label}
                  </Button>
                );
              }

              return (
                <Button
                  key={action.key}
                  asChild
                  variant={primary ? "default" : "outline"}
                  className={className}
                >
                  <Link to={action.url}>{action.label}</Link>
                </Button>
              );
            })
          ) : (
            <div className="rounded-[1rem] border border-dashed border-slate-200/80 bg-white/72 px-3 py-3 text-sm text-slate-500">
              No shortcuts selected.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
