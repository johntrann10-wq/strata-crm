import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useOutletContext, useSearchParams } from "react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertCircle, CalendarPlus, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useAction, useFindMany, useGlobalAction } from "../hooks/useApi";
import type { HomeDashboardRange, HomeDashboardSnapshot } from "@/lib/homeDashboard";
import { isNativeIOSApp, isNativeShell } from "@/lib/mobileShell";
import { triggerImpactFeedback } from "@/lib/nativeInteractions";
import type { AuthOutletContext } from "./_app";
import { getPreferredAuthorizedAppPath } from "@/lib/permissionRouting";
import { recordReliabilityDiagnostic } from "@/lib/reliabilityDiagnostics";

type FinanceDashboardSummary = {
  kpis: {
    grossRevenue: number;
    expenses: number;
    projectedNetProfit: number;
    awaitingPayment: number;
  };
};

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
  const nativeShellSession = isNativeShell();
  const nativeIOSDashboard = isNativeIOSApp();
  const canViewDashboard = outletContext.permissions.has("dashboard.view");
  const canReadPayments = outletContext.permissions.has("payments.read");

  const range = nativeShellSession
    ? "today"
    : isValidRange(searchParams.get("range"))
      ? searchParams.get("range")
      : "today";
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
  const [{ data: financeDashboardData, fetching: financeFetching, error: financeError }, runFinanceDashboard] = useGlobalAction(api.getFinanceDashboard);
  const [, runPreferenceUpdate] = useAction(api.updateHomeDashboardPreferences);
  const [showInsights, setShowInsights] = useState(() => !nativeShellSession);
  const snapshot = (data ?? null) as HomeDashboardSnapshot | null;
  const visibleSnapshot = useMemo(() => {
    if (!nativeIOSDashboard || !snapshot?.nudges?.length) return snapshot;
    return {
      ...snapshot,
      nudges: snapshot.nudges.filter((nudge) => !/(billing|checkout|stripe|subscribe|subscription|trial|upgrade|payment method)/i.test(`${nudge.label} ${nudge.detail} ${nudge.url}`)),
    };
  }, [nativeIOSDashboard, snapshot]);
  const financeDashboard = (financeDashboardData ?? null) as FinanceDashboardSummary | null;
  const lastMarkedSeenRef = useRef<string | null>(null);
  const lastRefreshRef = useRef(0);

  const refreshDashboard = useCallback(async (reason?: string) => {
    const now = Date.now();
    if (reason !== "force" && now - lastRefreshRef.current < 1_500) {
      return;
    }
    lastRefreshRef.current = now;
    const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    const requests: Array<Promise<unknown>> = [
      runDashboard({
        range,
        teamMemberId: teamMemberId === "all" ? null : teamMemberId,
        weekStartDate,
      }),
    ];
    if (canReadPayments) {
      requests.push(runFinanceDashboard({ paymentLimit: 8, invoiceLimit: 150, monthCount: 6 }));
    }
    await Promise.all(requests);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
    }
  }, [canReadPayments, range, runDashboard, runFinanceDashboard, teamMemberId, weekStartDate]);

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
      setSearchParams(next, { replace: true, preventScrollReset: true });
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
      setSearchParams(next, { replace: true, preventScrollReset: true });
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
      setSearchParams(next, { replace: true, preventScrollReset: true });
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
      setSearchParams(next, { replace: true, preventScrollReset: true });
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
  const stableDashboardModePill = featureEnabled ? null : (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
      Stable dashboard mode
    </span>
  );

  const pageError = error as Error | null;
  const safePageError = pageError ? new Error("Dashboard data is temporarily unavailable.") : null;
  const pageLoading = fetching && !snapshot;
  const staleSnapshotWarning = !pageLoading && pageError && snapshot;
  const hasMeaningfulMonthlyRevenue =
    !!visibleSnapshot?.monthlyRevenueChart.allowed &&
    (
      visibleSnapshot.monthlyRevenueChart.totalBookedThisMonth > 0
      || (financeDashboard?.kpis.grossRevenue ?? 0) > 0
      || (financeDashboard?.kpis.expenses ?? 0) > 0
      || (financeDashboard?.kpis.projectedNetProfit ?? 0) !== 0
    );
  const hasMeaningfulBookingsOverview =
    !!visibleSnapshot?.bookingsOverview.allowed &&
    (
      visibleSnapshot.bookingsOverview.bookingsToday > 0
      || visibleSnapshot.bookingsOverview.bookingsThisWeek > 0
      || visibleSnapshot.bookingsOverview.bookingsThisMonth > 0
      || visibleSnapshot.bookingsOverview.quotesSent > 0
      || visibleSnapshot.bookingsOverview.quotesAccepted > 0
      || visibleSnapshot.bookingsOverview.depositsCollectedAmount > 0
      || visibleSnapshot.bookingsOverview.depositsDueAmount > 0
      || visibleSnapshot.bookingsOverview.funnel.length > 0
    );
  const shouldRenderInsights = pageLoading || hasMeaningfulMonthlyRevenue || hasMeaningfulBookingsOverview;

  if (!canViewDashboard) {
    return <Navigate to={getPreferredAuthorizedAppPath(outletContext.permissions, outletContext.enabledModules)} replace />;
  }

  return (
    <div className={nativeIOSDashboard ? "space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]" : "space-y-4 sm:space-y-5"}>
      <HomeDashboardTopBar
        title="Dashboard"
        businessName={outletContext.businessName}
        roleLabel={getRoleLabel(visibleSnapshot?.context.role ?? outletContext.membershipRole)}
        range={range}
        onRangeChange={setRange}
        showRangeSelector={!nativeShellSession}
        teamOptions={staffOptions}
        teamMemberId={teamMemberId}
        onTeamChange={setTeam}
        canFilterTeam={canFilterTeam}
        lastUpdatedLabel={lastUpdatedLabel}
        refreshing={fetching && !!snapshot}
        primaryAction={
          <Button asChild className={nativeIOSDashboard ? "min-h-11 w-full rounded-full bg-primary text-primary-foreground shadow-[0_12px_24px_rgba(249,115,22,0.18)] hover:bg-primary/90" : "min-h-[44px] w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800 sm:w-auto"}>
            <Link to="/appointments/new">
              <CalendarPlus className="mr-2 h-4 w-4" />
              New appointment
            </Link>
          </Button>
        }
        secondaryAction={stableDashboardModePill}
        nativeIOS={nativeIOSDashboard}
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
        <div className={nativeIOSDashboard ? "space-y-3" : "surface-panel overflow-hidden rounded-[1.9rem] border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 shadow-[0_20px_50px_rgba(15,23,42,0.07)] sm:p-5"}>
          <div className={nativeIOSDashboard ? "space-y-3" : "space-y-4"}>
            <HomeCompactQuickActions
              snapshot={visibleSnapshot}
              loading={pageLoading || staffFetching}
              error={visibleSnapshot?.widgetErrors?.quick_actions ? new Error(visibleSnapshot.widgetErrors.quick_actions.message) : null}
              onRetry={() => void refreshDashboard("force")}
              nativeIOS={nativeIOSDashboard}
            />

            <div className={nativeIOSDashboard ? "grid gap-3" : "grid gap-4 lg:grid-cols-12"}>
              <div className="lg:col-span-8">
                <HomeWeeklyAppointmentOverviewCard
                  snapshot={visibleSnapshot}
                  loading={pageLoading}
                  error={visibleSnapshot?.widgetErrors?.today_schedule ? new Error(visibleSnapshot.widgetErrors.today_schedule.message) : null}
                  onRetry={() => void refreshDashboard("force")}
                  selectedDate={selectedWeekDay}
                  onSelectDate={setSelectedWeekDay}
                  onChangeWeek={setWeekStart}
                  nativeIOS={nativeIOSDashboard}
                />
              </div>
              <div className="lg:col-span-4">
                <HomeUpcomingAttentionPanel
                  snapshot={visibleSnapshot}
                  range={range}
                  loading={pageLoading}
                  error={visibleSnapshot?.widgetErrors?.action_queue ? new Error(visibleSnapshot.widgetErrors.action_queue.message) : null}
                  onRetry={() => void refreshDashboard("force")}
                  onDismiss={(itemId) => void updateQueueItem({ dismissQueueItemId: itemId })}
                  nativeIOS={nativeIOSDashboard}
                />
              </div>
            </div>

            <HomeOverviewKpiStrip snapshot={visibleSnapshot} loading={pageLoading} error={visibleSnapshot?.widgetErrors?.summary_today ? new Error(visibleSnapshot.widgetErrors.summary_today.message) : null} onRetry={() => void refreshDashboard("force")} />

            {!nativeIOSDashboard ? (
              <HomeBottomPanels
                snapshot={visibleSnapshot}
                loading={pageLoading}
                error={visibleSnapshot?.widgetErrors?.recent_activity ? new Error(visibleSnapshot.widgetErrors.recent_activity.message) : null}
                onRetry={() => void refreshDashboard("force")}
              />
            ) : null}

            {shouldRenderInsights && !nativeIOSDashboard ? (
              <div className="native-panel-card rounded-[1.6rem] border border-slate-200/75 bg-white/92 p-4 sm:p-5">
                <button
                  type="button"
                  onClick={() => {
                    setShowInsights((current) => !current);
                    void triggerImpactFeedback("light");
                  }}
                  className="native-touch-surface flex w-full items-start justify-between gap-4 rounded-[1.2rem] border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-left"
                  aria-expanded={showInsights}
                >
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Business insights</p>
                    <p className="mt-1 text-base font-semibold tracking-[-0.02em] text-slate-950">
                      {showInsights ? "Hide deeper booking and finance trends" : "Open deeper booking and finance trends"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Keep the first screen focused on today&apos;s operating board, then expand into revenue and booking performance when you need owner context.
                    </p>
                  </div>
                  <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-500">
                    {showInsights ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </button>
                {showInsights ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-12">
                    {pageLoading || hasMeaningfulMonthlyRevenue ? (
                      <div className="lg:col-span-8">
                        <HomeMonthlyRevenueChartCard
                          snapshot={visibleSnapshot}
                          financeDashboard={financeDashboard}
                          loading={pageLoading || (canReadPayments && financeFetching && !financeDashboard)}
                          error={financeError as Error | null}
                          onRetry={() => void refreshDashboard("force")}
                        />
                      </div>
                    ) : null}
                    {pageLoading || hasMeaningfulBookingsOverview ? (
                      <div className="lg:col-span-4">
                        <HomeBookingsOverviewCard
                          snapshot={visibleSnapshot}
                          loading={pageLoading}
                          error={visibleSnapshot?.widgetErrors?.pipeline ? new Error(visibleSnapshot.widgetErrors.pipeline.message) : null}
                          onRetry={() => void refreshDashboard("force")}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
