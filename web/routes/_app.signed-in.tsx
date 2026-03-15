import { useState, useCallback, useEffect, useRef } from "react";
import { useOutletContext, Link } from "react-router";
import { useFindMany, useGlobalAction } from "@gadgetinc/react";
import { formatDistanceToNow, format } from "date-fns";
import {
  Calendar,
  FileText,
  Users,
  DollarSign,
  Clock,
  Activity,
  Plus,
  Car,
  Bell,
  CheckCircle,
  UserPlus,
  CalendarPlus,
  Receipt,
  ArrowRight,
  TrendingUp,
  Zap,
  AlertTriangle,
  BarChart2,
  RefreshCw,
  TrendingDown,
  Repeat2,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { StatusBadge } from "../components/shared/StatusBadge";
import { RevenueSparkline } from "../components/dashboard/RevenueSparkline";
import { CapacityRing } from "../components/dashboard/CapacityRing";

function formatBusinessType(type: string | null | undefined): string {
  if (!type) return "";
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatLastRefreshed(date: Date | null): string {
  if (!date) return "";
  const diff = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return "Updated just now";
  return `Updated ${diff} min ago`;
}

function ActivityTypeIcon({ type }: { type: string }) {
  const cls = "h-4 w-4";
  if (type.startsWith("appointment")) return <Calendar className={cls} />;
  if (type.startsWith("invoice")) return <FileText className={cls} />;
  if (type === "payment-received") return <DollarSign className={cls} />;
  if (type === "client-added") return <UserPlus className={cls} />;
  if (type === "vehicle-added") return <Car className={cls} />;
  if (type === "reminder-sent") return <Bell className={cls} />;
  if (type === "review-requested") return <CheckCircle className={cls} />;
  return <Activity className={cls} />;
}

function getRecommendationIconComponent(icon: string) {
  switch (icon) {
    case "calendar":
      return Calendar;
    case "users":
      return Users;
    case "receipt":
      return Receipt;
    case "trending-up":
      return TrendingUp;
    default:
      return AlertTriangle;
  }
}

function getRecommendationIconColors(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
    case "medium":
      return "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400";
    case "low":
      return "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getProgressBarColor(pct: number): string {
  if (pct < 50) return "bg-amber-400";
  if (pct < 80) return "bg-orange-400";
  return "bg-green-500";
}

function SmartInsightsCard({ data, fetching }: { data: any; fetching: boolean }) {
  const utilizationPct: number = (data as any)?.utilizationPct ?? 0;
  const appointmentCount: number = (data as any)?.appointmentCount ?? 0;
  const openSlots: number = (data as any)?.openSlots ?? 0;
  const recommendations: any[] = (data as any)?.recommendations ?? [];

  return (
    <Card className="rounded-xl border-border bg-card flex flex-col">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-orange-500" />
          <CardTitle className="text-[13px] font-semibold">Smart Insights</CardTitle>
        </div>
        <span className="text-xs text-muted-foreground">This week</span>
      </CardHeader>
      <CardContent className="flex-1">
        {fetching ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : !data || !(data as any).recommendations ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No insights available yet</p>
          </div>
        ) : (
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium">This Week's Utilization</span>
              <span className="text-sm font-bold text-orange-500">{utilizationPct}%</span>
            </div>
            <div className="w-full bg-border rounded-full h-1.5 mb-4">
              <div
                className={cn("h-1.5 rounded-full transition-all", getProgressBarColor(utilizationPct))}
                style={{ width: `${utilizationPct}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground mb-4">
              <span>{appointmentCount} appointments booked</span>
              <span>{openSlots} open hours</span>
            </div>
            <Separator className="mb-3" />
            {recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">All clear this week!</p>
            ) : (
              <div>
                {recommendations.map((rec: any, idx: number) => {
                  const IconComponent = getRecommendationIconComponent(rec.icon);
                  return (
                    <div key={idx} className="flex items-start gap-3 py-2.5 border-b last:border-0">
                      <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <IconComponent className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          {rec.priority === "high" ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                          ) : rec.priority === "medium" ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                          )}
                          <p className="text-sm font-medium">{rec.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {rec.description}
                        </p>
                        <Link to={rec.actionHref}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 mt-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                          >
                            {rec.actionLabel}
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityIconColor(type: string): string {
  if (type.startsWith("appointment")) return "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";
  if (type.startsWith("invoice")) return "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400";
  if (type === "payment-received") return "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400";
  if (type === "client-added") return "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400";
  if (type === "vehicle-added") return "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400";
  if (type === "reminder-sent") return "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-muted text-muted-foreground";
}

export default function SignedIn() {
  const { user, businessName, businessId } = useOutletContext<AuthOutletContext & { businessId?: string }>();

  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [filterNow, setFilterNow] = useState(() => new Date());

  const [{ data: upcomingAppointments, fetching: fetchingUpcoming }] = useFindMany(
    api.appointment,
    {
      filter: {
        AND: [
          { startTime: { greaterThanOrEqual: filterNow.toISOString() } },
          { status: { in: ["scheduled", "confirmed", "in_progress"] } },
          { business: { id: { equals: businessId ?? "" } } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
        client: { firstName: true, lastName: true },
        vehicle: { year: true, make: true, model: true },
      },
      sort: { startTime: "Ascending" },
      first: 6,
      pause: !businessId,
    }
  );

  const [{ data: dashStats, fetching: fetchingStats }, runGetStats] = useGlobalAction(api.getDashboardStats);
  const [{ data: capacityData, fetching: fetchingCapacity }, runGetCapacity] = useGlobalAction(api.getCapacityInsights);

  const runGetStatsRef = useRef(runGetStats);
  useEffect(() => { runGetStatsRef.current = runGetStats; }, [runGetStats]);

  const runGetCapacityRef = useRef(runGetCapacity);
  useEffect(() => { runGetCapacityRef.current = runGetCapacity; }, [runGetCapacity]);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialized = useRef(false);

  const handleRefresh = useCallback(async () => {
    if (new Date().toDateString() !== filterNow.toDateString()) {
      setFilterNow(new Date());
    }
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      setRefreshing(true);
    }, 300);
    try {
      await Promise.all([runGetStatsRef.current(), runGetCapacityRef.current()]);
      setLastRefreshed(new Date());
    } finally {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      setRefreshing(false);
    }
  }, [filterNow]);

  useEffect(() => {
    if (!businessId) return;
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    void handleRefresh();
  }, [businessId, handleRefresh]);

  useEffect(() => {
    const interval = setInterval(() => {
      void handleRefresh();
    }, 60000);
    return () => clearInterval(interval);
  }, [handleRefresh]);

  const [{ data: activityLogs, fetching: fetchingActivity }] = useFindMany(api.activityLog, {
    filter: businessId ? { business: { id: { equals: businessId } } } : undefined,
    sort: { createdAt: "Descending" },
    select: { id: true, type: true, description: true, createdAt: true },
    first: 8,
    live: true,
    pause: !businessId,
  });

  const [{ data: failedNotifications }] = useFindMany(api.notificationLog, {
    filter: { AND: [{ status: { equals: "failed" } }, { business: { id: { equals: businessId ?? "" } } }] },
    first: 1,
    select: { id: true },
    pause: !businessId,
  });

  // Derived values
  const todayRevenue: number = (dashStats as any)?.todayRevenue ?? 0;
  const outstandingBalance: number = (dashStats as any)?.outstandingBalance ?? 0;
  const repeatCustomerRate: number = (dashStats as any)?.repeatCustomerRate ?? 0;
  const weeklyRevenue: any[] = (dashStats as any)?.weeklyRevenue ?? [];
  const revenueThisMonth: number = (dashStats as any)?.revenueThisMonth ?? 0;
  const openInvoicesCount: number = (dashStats as any)?.openInvoicesCount ?? 0;
  const totalClients: number = (dashStats as any)?.totalClients ?? 0;
  const todayCount: number = (dashStats as any)?.todayAppointmentsCount ?? 0;
  const todayBookedHours: number = (dashStats as any)?.todayBookedHours ?? 0;
  const totalAvailableHours: number = (dashStats as any)?.totalAvailableHours ?? 8;

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{businessName}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {formatLastRefreshed(lastRefreshed)}
            </span>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                  aria-label="Refresh dashboard"
                >
                  <RefreshCw
                    className={cn("h-4 w-4", refreshing && "animate-spin")}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh dashboard</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* KPI Grid — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* 1. Today's Revenue */}
        <div className="rounded-xl border border-border bg-card px-5 pt-5 pb-4 hover:border-border/80 transition-colors h-full">
          <div className="flex flex-row items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.06em] leading-none">
              Today's Revenue
            </p>
            <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 bg-muted">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          {fetchingStats && !dashStats ? (
            <Skeleton className="h-7 w-24 mt-3" />
          ) : (
            <div className="text-2xl font-semibold tracking-tight mt-3">{formatCurrency(todayRevenue)}</div>
          )}
          <p className="text-[12px] text-muted-foreground mt-1">Collected today</p>
        </div>

        {/* 2. This Month */}
        <Link to="/invoices" className="group">
          <div className="rounded-xl border border-border bg-card px-5 pt-5 pb-4 hover:border-border/80 transition-colors h-full">
            <div className="flex flex-row items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.06em] leading-none">
                This Month
              </p>
              <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 bg-muted">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            {fetchingStats && !dashStats ? (
              <Skeleton className="h-7 w-24 mt-3" />
            ) : (
              <div className="text-2xl font-semibold tracking-tight mt-3">{formatCurrency(revenueThisMonth)}</div>
            )}
            <p className="text-[12px] text-muted-foreground mt-1">Total revenue</p>
          </div>
        </Link>

        {/* 3. Open Invoices */}
        <Link to="/invoices" className="group">
          <div className="rounded-xl border border-border bg-card px-5 pt-5 pb-4 hover:border-border/80 transition-colors h-full">
            <div className="flex flex-row items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.06em] leading-none">
                Open Invoices
              </p>
              <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 bg-muted">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            {fetchingStats && !dashStats ? (
              <Skeleton className="h-7 w-12 mt-3" />
            ) : (
              <div className="text-2xl font-semibold tracking-tight mt-3">{openInvoicesCount}</div>
            )}
            <p className="text-[12px] text-muted-foreground mt-1">
              {fetchingStats && !dashStats ? "" : `${formatCurrency(outstandingBalance)} outstanding`}
            </p>
          </div>
        </Link>

        {/* 4. Today's Jobs */}
        <Link to="/calendar" className="group">
          <div className="rounded-xl border border-border bg-card px-5 pt-5 pb-4 hover:border-border/80 transition-colors h-full">
            <div className="flex flex-row items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.06em] leading-none">
                Today's Jobs
              </p>
              <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 bg-muted">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            {fetchingStats && !dashStats ? (
              <Skeleton className="h-7 w-10 mt-3" />
            ) : (
              <div className="text-2xl font-semibold tracking-tight mt-3">{todayCount}</div>
            )}
            <p className="text-[12px] text-muted-foreground mt-1">Scheduled today</p>
          </div>
        </Link>

        {/* 5. Total Clients */}
        <Link to="/clients" className="group">
          <div className="rounded-xl border border-border bg-card px-5 pt-5 pb-4 hover:border-border/80 transition-colors h-full">
            <div className="flex flex-row items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.06em] leading-none">
                Total Clients
              </p>
              <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 bg-muted">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            {fetchingStats && !dashStats ? (
              <Skeleton className="h-7 w-12 mt-3" />
            ) : (
              <div className="text-2xl font-semibold tracking-tight mt-3">{totalClients}</div>
            )}
            <p className="text-[12px] text-muted-foreground mt-1">In your database</p>
          </div>
        </Link>

        {/* 6. Capacity Ring */}
        <div className="rounded-xl border border-border bg-card px-5 pt-5 pb-4 hover:border-border/80 transition-colors h-full">
          <div className="flex flex-row items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.06em] leading-none">
              Capacity
            </p>
            <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 bg-muted">
              <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          <div className="flex flex-col items-center mt-3">
            <CapacityRing
              bookedHours={todayBookedHours}
              totalHours={totalAvailableHours}
              fetching={fetchingStats && !dashStats}
            />
            <p className="text-[12px] text-muted-foreground mt-1">
              {fetchingStats && !dashStats ? "Loading..." : `${todayBookedHours} hours booked`}
            </p>
          </div>
        </div>
      </div>

      {/* Failed Notifications Banner */}
      {failedNotifications && failedNotifications.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{failedNotifications.length} notification(s) failed to send.</span>
          <Link to="/admin/recovery" className="ml-1 underline font-medium hover:text-amber-900">
            View in Recovery →
          </Link>
        </div>
      )}

      {/* Smart Insights */}
      <SmartInsightsCard data={capacityData} fetching={(fetchingStats || fetchingCapacity) && !capacityData} />

      {/* Today's Schedule + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Today's Schedule */}
        <Card className="rounded-xl border-border bg-card flex flex-col">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[13px] font-semibold">
              Today's Schedule
              {!fetchingStats && upcomingAppointments && upcomingAppointments.length > 0 && (
                <span className="text-muted-foreground font-normal"> · {upcomingAppointments.length}</span>
              )}
            </CardTitle>
            <Link to="/appointments/new">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs px-2">
                <Plus className="h-3 w-3" />
                New Appointment
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex-1">
            {fetchingUpcoming && !upcomingAppointments ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : !upcomingAppointments || upcomingAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Clock className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No appointments today</p>
                <Link to="/appointments/new">
                  <Button variant="outline" size="sm" className="mt-3 gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Book Appointment
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingAppointments.map((appt) => {
                  const apt = appt as typeof appt & {
                    client: { firstName: string; lastName: string } | null;
                    vehicle: { year: number | null; make: string | null; model: string | null } | null;
                  };
                  return (
                    <Link
                      key={apt.id}
                      to={`/appointments/${apt.id}`}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors group"
                    >
                      <div className="shrink-0 pt-0.5">
                        <p className="text-xs font-mono text-muted-foreground">
                          {apt.startTime ? format(new Date(apt.startTime), "h:mm a") : "—"}
                        </p>
                        {apt.endTime && (
                          <p className="text-xs font-mono text-muted-foreground/60">
                            {format(new Date(apt.endTime), "h:mm a")}
                          </p>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {apt.client
                            ? `${apt.client.firstName} ${apt.client.lastName}`
                            : apt.title ?? "Appointment"}
                        </p>
                        {apt.vehicle && (
                          <p className="text-xs text-muted-foreground truncate">
                            {apt.vehicle.year ? `${apt.vehicle.year} ` : ""}{apt.vehicle.make} {apt.vehicle.model}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <StatusBadge status={apt.status ?? "pending"} type="appointment" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="rounded-xl border-border bg-card flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-[13px] font-semibold">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {fetchingActivity && !activityLogs ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5 pt-1">
                      <div className="h-3 bg-muted rounded animate-pulse w-4/5" />
                      <div className="h-2.5 bg-muted rounded animate-pulse w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !activityLogs || activityLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Activity className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No recent activity</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Actions and updates will be tracked here
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {activityLogs.map((log, idx) => (
                  <div
                    key={log.id}
                    className={cn(
                      "flex items-start gap-3 py-2.5",
                      idx < activityLogs.length - 1 && "border-b border-border/50"
                    )}
                  >
                    <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <ActivityTypeIcon type={log.type ?? ""} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug text-foreground line-clamp-2">
                        {log.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {log.createdAt
                          ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
