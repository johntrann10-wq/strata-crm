import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, Navigate, useOutletContext, useSearchParams } from "react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertCircle, CalendarPlus, RefreshCw } from "lucide-react";
import { api } from "../api";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import {
  DashboardPageErrorGrid,
  HomeDashboardTopBar,
} from "@/components/dashboard/HomeDashboardWidgets";
import {
  HomeBookingsOverviewCard,
  HomeBottomPanels,
  HomeCompactQuickActions,
  HomeMonthlyRevenueChartCard,
  HomeOverviewKpiStrip,
  HomeUpcomingAttentionPanel,
  HomeWeeklyAppointmentOverviewCard,
} from "@/components/dashboard/HomeDashboardOverview";
import { PageHeader } from "../components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAction, useFindMany } from "../hooks/useApi";
import type { HomeDashboardRange, HomeDashboardSnapshot } from "@/lib/homeDashboard";
import type { AuthOutletContext } from "./_app";
import { getPreferredAuthorizedAppPath } from "@/lib/permissionRouting";
import { recordReliabilityDiagnostic } from "@/lib/reliabilityDiagnostics";

type StaffRecord = {
  id: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

const RANGE_VALUES: HomeDashboardRange[] = ["today", "week", "month"];
function isValidRange(value: string | null): value is HomeDashboardRange {
  return RANGE_VALUES.includes(value as HomeDashboardRange);
}

function isValidDateKey(value: string | null) {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatStaffName(staff: StaffRecord) {
  return `${staff.firstName ?? ""} ${staff.lastName ?? ""}`.trim() || "Unnamed team member";
}

function getRoleLabel(role: string | null | undefined) {
  switch ((role ?? "").toLowerCase()) {
    case "owner":
    case "admin":
      return "Owner view";
    case "manager":
      return "Manager view";
    case "technician":
    case "tech":
      return "Technician view";
    case "service_advisor":
      return "Advisor view";
    default:
      return "Daily control tower";
  }
}

export default function DashboardHomeRoute() {
  const outletContext = useOutletContext<AuthOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const canViewDashboard = outletContext.permissions.has("dashboard.view");

  const range = isValidRange(searchParams.get("range")) ? searchParams.get("range") : "today";
  const canFilterTeam = outletContext.permissions.has("team.read");
  const teamMemberId = canFilterTeam ? searchParams.get("team") ?? "all" : "all";
  const weekStartDate = isValidDateKey(searchParams.get("weekStart")) ? searchParams.get("weekStart") : null;
  const selectedWeekDay = isValidDateKey(searchParams.get("day")) ? searchParams.get("day") : null;

  const [{ data: staffData, fetching: staffFetching }] = useFindMany(api.staff, {
    pause: !canFilterTeam,
    sort: { firstName: "asc", lastName: "asc" },
    first: 100,
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
    },
  });

  const staffOptions = useMemo(
    () =>
      ((staffData ?? []) as StaffRecord[]).map((member) => ({
        id: member.id,
        name: formatStaffName(member),
      })),
    [staffData]
  );

  const [{ data, fetching, error }, runDashboard] = useAction(api.getHomeDashboard);
  const [, runPreferenceUpdate] = useAction(api.updateHomeDashboardPreferences);
  const snapshot = (data ?? null) as HomeDashboardSnapshot | null;
  const lastMarkedSeenRef = useRef<string | null>(null);
  const lastRefreshRef = useRef(0);

  const refreshDashboard = useCallback((reason?: string) => {
    const now = Date.now();
    if (reason !== "force" && now - lastRefreshRef.current < 1_500) {
      return Promise.resolve();
    }
    lastRefreshRef.current = now;
    return runDashboard({
      range,
      teamMemberId: teamMemberId === "all" ? null : teamMemberId,
      weekStartDate,
    });
  }, [range, runDashboard, teamMemberId, weekStartDate]);

  useEffect(() => {
    void refreshDashboard("force");
  }, [refreshDashboard]);

  useEffect(() => {
    if (!snapshot?.generatedAt || lastMarkedSeenRef.current === snapshot.generatedAt) return;
    lastMarkedSeenRef.current = snapshot.generatedAt;
    void runPreferenceUpdate({ markSeenAt: snapshot.generatedAt });
  }, [runPreferenceUpdate, snapshot?.generatedAt]);

  useEffect(() => {
    if (!snapshot?.degraded) return;
    recordReliabilityDiagnostic({
      source: "dashboard.degraded",
      severity: "warning",
      message: "Dashboard rendered with degraded widgets",
      detail: Object.keys(snapshot.widgetErrors ?? {}).join(", "),
    });
  }, [snapshot?.degraded, snapshot?.widgetErrors]);

  const setRange = useCallback(
    (nextRange: HomeDashboardRange) => {
      const next = new URLSearchParams(searchParams);
      next.set("range", nextRange);
      next.delete("weekStart");
      next.delete("day");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setTeam = useCallback(
    (nextTeam: string) => {
      const next = new URLSearchParams(searchParams);
      if (!canFilterTeam || nextTeam === "all") {
        next.delete("team");
      } else {
        next.set("team", nextTeam);
      }
      setSearchParams(next, { replace: true });
    },
    [canFilterTeam, searchParams, setSearchParams]
  );

  const setWeekStart = useCallback(
    (nextWeekStart: string | null, nextDay?: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (nextWeekStart) {
        next.set("weekStart", nextWeekStart);
      } else {
        next.delete("weekStart");
      }
      if (nextDay) {
        next.set("day", nextDay);
      } else {
        next.delete("day");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setSelectedWeekDay = useCallback(
    (nextDay: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (nextDay) {
        next.set("day", nextDay);
      } else {
        next.delete("day");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const updateQueueItem = useCallback(
    async (payload: Parameters<typeof api.updateHomeDashboardPreferences>[0]) => {
      await runPreferenceUpdate(payload);
      await refreshDashboard("force");
    },
    [refreshDashboard, runPreferenceUpdate]
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshDashboard();
      }
    };
    const onFocus = () => void refreshDashboard();
    const onInvalidation = () => void refreshDashboard("force");
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("dashboard:invalidate", onInvalidation as EventListener);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("dashboard:invalidate", onInvalidation as EventListener);
    };
  }, [refreshDashboard]);

  useEffect(() => {
    if (!snapshot?.featureFlags.homeDashboardV2) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshDashboard();
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshDashboard, snapshot?.featureFlags.homeDashboardV2]);

  const lastUpdatedLabel = useMemo(() => {
    if (!snapshot?.generatedAt) return "Waiting on first snapshot";
    return formatDistanceToNowStrict(new Date(snapshot.generatedAt), { addSuffix: true });
  }, [snapshot?.generatedAt]);
  const featureEnabled = snapshot?.featureFlags.homeDashboardV2 ?? true;

  const pageError = error as Error | null;
  const safePageError = pageError ? new Error("Dashboard data is temporarily unavailable.") : null;
  const pageLoading = fetching && !snapshot;
  const staleSnapshotWarning = !pageLoading && pageError && snapshot;
  const hasMeaningfulMonthlyRevenue =
    !!snapshot?.monthlyRevenueChart.allowed &&
    (
      snapshot.monthlyRevenueChart.totalBookedThisMonth > 0
      || snapshot.monthlyRevenueChart.totalCollectedThisMonth > 0
    );
  const hasMeaningfulBookingsOverview =
    !!snapshot?.bookingsOverview.allowed &&
    (
      snapshot.bookingsOverview.bookingsToday > 0
      || snapshot.bookingsOverview.bookingsThisWeek > 0
      || snapshot.bookingsOverview.bookingsThisMonth > 0
      || snapshot.bookingsOverview.quotesSent > 0
      || snapshot.bookingsOverview.quotesAccepted > 0
      || snapshot.bookingsOverview.depositsCollectedAmount > 0
      || snapshot.bookingsOverview.depositsDueAmount > 0
      || snapshot.bookingsOverview.funnel.length > 0
    );

  if (!canViewDashboard) {
    return <Navigate to={getPreferredAuthorizedAppPath(outletContext.permissions, outletContext.enabledModules)} replace />;
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Dashboard"
        right={
          <Button asChild className="min-h-[44px] rounded-xl bg-slate-950 text-white hover:bg-slate-800">
            <Link to="/appointments/new">
              <CalendarPlus className="mr-2 h-4 w-4" />
              New appointment
            </Link>
          </Button>
        }
      />

      <HomeDashboardTopBar
        businessName={outletContext.businessName}
        roleLabel={getRoleLabel(snapshot?.context.role ?? outletContext.membershipRole)}
        range={range}
        onRangeChange={setRange}
        teamOptions={staffOptions}
        teamMemberId={teamMemberId}
        onTeamChange={setTeam}
        canFilterTeam={canFilterTeam}
        lastUpdatedLabel={lastUpdatedLabel}
        refreshing={fetching && !!snapshot}
        secondaryAction={featureEnabled ? null : <Badge variant="outline" className="rounded-full bg-slate-50 px-3 py-2 text-xs text-slate-600">Stable dashboard mode</Badge>}
      />

      {staleSnapshotWarning ? (
        <div className="flex flex-col gap-3 rounded-[1.2rem] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Showing the last good snapshot</p>
              <p className="text-amber-800/80">Dashboard refresh failed. You can keep working and retry when ready.</p>
            </div>
          </div>
          <Button variant="outline" className="border-amber-300 bg-white/80" onClick={() => void refreshDashboard("force")}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      ) : null}

      {pageError && !snapshot ? (
        <DashboardPageErrorGrid error={safePageError ?? new Error("Dashboard data is temporarily unavailable.")} onRetry={() => void refreshDashboard("force")} />
      ) : (
        <div className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(219,234,254,0.85),_rgba(255,255,255,0.92)_38%,_rgba(241,245,249,0.88)_100%)] p-4 shadow-[0_28px_80px_rgba(15,23,42,0.10)] sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.55),transparent_34%,rgba(191,219,254,0.12))]" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-sky-200/25 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 bottom-10 h-44 w-44 rounded-full bg-blue-200/20 blur-3xl" />
          <div className="relative space-y-4">
          <HomeOverviewKpiStrip snapshot={snapshot} loading={pageLoading} error={snapshot?.widgetErrors?.summary_today ? new Error(snapshot.widgetErrors.summary_today.message) : null} onRetry={() => void refreshDashboard("force")} />

          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <HomeWeeklyAppointmentOverviewCard
                snapshot={snapshot}
                loading={pageLoading}
                error={snapshot?.widgetErrors?.today_schedule ? new Error(snapshot.widgetErrors.today_schedule.message) : null}
                onRetry={() => void refreshDashboard("force")}
                selectedDate={selectedWeekDay}
                onSelectDate={setSelectedWeekDay}
                onChangeWeek={setWeekStart}
              />
            </div>
            <div className="xl:col-span-4">
              <HomeUpcomingAttentionPanel
                snapshot={snapshot}
                range={range}
                loading={pageLoading}
                error={snapshot?.widgetErrors?.action_queue ? new Error(snapshot.widgetErrors.action_queue.message) : null}
                onRetry={() => void refreshDashboard("force")}
                onDismiss={(itemId) => void updateQueueItem({ dismissQueueItemId: itemId })}
                onSnooze={(itemId) =>
                  void updateQueueItem({
                    snoozeQueueItemId: itemId,
                    snoozeUntil: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
                  })
                }
              />
            </div>
          </div>

          {pageLoading || hasMeaningfulMonthlyRevenue || hasMeaningfulBookingsOverview ? (
            <div className="grid gap-4 xl:grid-cols-12">
              {pageLoading || hasMeaningfulMonthlyRevenue ? (
                <div className="xl:col-span-8">
                  <HomeMonthlyRevenueChartCard
                    snapshot={snapshot}
                    loading={pageLoading}
                    error={null}
                    onRetry={() => void refreshDashboard("force")}
                  />
                </div>
              ) : null}
              {pageLoading || hasMeaningfulBookingsOverview ? (
                <div className="xl:col-span-4">
                  <HomeBookingsOverviewCard
                    snapshot={snapshot}
                    loading={pageLoading}
                    error={snapshot?.widgetErrors?.pipeline ? new Error(snapshot.widgetErrors.pipeline.message) : null}
                    onRetry={() => void refreshDashboard("force")}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <HomeBottomPanels
            snapshot={snapshot}
            loading={pageLoading}
            error={snapshot?.widgetErrors?.recent_activity ? new Error(snapshot.widgetErrors.recent_activity.message) : null}
            onRetry={() => void refreshDashboard("force")}
          />

          <HomeCompactQuickActions
            snapshot={snapshot}
            loading={pageLoading || staffFetching}
            error={snapshot?.widgetErrors?.quick_actions ? new Error(snapshot.widgetErrors.quick_actions.message) : null}
            onRetry={() => void refreshDashboard("force")}
          />
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
