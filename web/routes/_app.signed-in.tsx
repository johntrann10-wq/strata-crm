import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useOutletContext, useSearchParams } from "react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertCircle, CalendarPlus, RefreshCw, Settings2 } from "lucide-react";
import { api } from "../api";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import {
  HomeActionQueueCard,
  HomeAutomationsCard,
  HomeBusinessHealthCard,
  DashboardPageErrorGrid,
  HomeDashboardTopBar,
  HomeGoalsCard,
  HomePipelineCard,
  HomeQuickActionsCard,
  HomeRecentActivityCard,
  HomeRevenueCollectionsCard,
  HomeSignalsStrip,
  HomeSummaryCards,
  HomeTodayScheduleCard,
} from "@/components/dashboard/HomeDashboardWidgets";
import { PageHeader } from "../components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAction, useFindMany } from "../hooks/useApi";
import type { HomeDashboardRange, HomeDashboardSnapshot, HomeDashboardWidgetKey } from "@/lib/homeDashboard";
import type { AuthOutletContext } from "./_app";
import { getPreferredAuthorizedAppPath } from "@/lib/permissionRouting";
import { recordReliabilityDiagnostic } from "@/lib/reliabilityDiagnostics";
import { cn } from "@/lib/utils";

type StaffRecord = {
  id: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

const RANGE_VALUES: HomeDashboardRange[] = ["today", "week", "month"];
const SUMMARY_WIDGETS: HomeDashboardWidgetKey[] = [
  "summary_needs_action",
  "summary_today",
  "summary_cash",
  "summary_conversion",
];

function isValidRange(value: string | null): value is HomeDashboardRange {
  return RANGE_VALUES.includes(value as HomeDashboardRange);
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

function getWidgetLabel(widget: HomeDashboardWidgetKey) {
  switch (widget) {
    case "summary_needs_action":
      return "Needs Action";
    case "summary_today":
      return "Today";
    case "summary_cash":
      return "Cash";
    case "summary_conversion":
      return "Conversion";
    case "today_schedule":
      return "Today Schedule";
    case "action_queue":
      return "Action Queue";
    case "quick_actions":
      return "Quick Actions";
    case "pipeline":
      return "Pipeline";
    case "revenue_collections":
      return "Revenue + Collections";
    case "recent_activity":
      return "Recent Activity";
    case "automations":
      return "Automations";
    case "business_health":
      return "Business Health";
    case "goals":
      return "Goals";
    default:
      return widget;
  }
}

export default function DashboardHomeRoute() {
  const outletContext = useOutletContext<AuthOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const canViewDashboard = outletContext.permissions.has("dashboard.view");

  const range = isValidRange(searchParams.get("range")) ? searchParams.get("range") : "today";
  const canFilterTeam = outletContext.permissions.has("team.read");
  const teamMemberId = canFilterTeam ? searchParams.get("team") ?? "all" : "all";

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
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftWidgetOrder, setDraftWidgetOrder] = useState<HomeDashboardWidgetKey[]>([]);
  const [draftHiddenWidgets, setDraftHiddenWidgets] = useState<HomeDashboardWidgetKey[]>([]);
  const [draftDefaultRange, setDraftDefaultRange] = useState<HomeDashboardRange>("today");
  const [draftDefaultTeam, setDraftDefaultTeam] = useState("all");
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
    });
  }, [range, runDashboard, teamMemberId]);

  useEffect(() => {
    void refreshDashboard("force");
  }, [refreshDashboard]);

  useEffect(() => {
    if (!snapshot) return;
    setDraftWidgetOrder(snapshot.preferences.widgetOrder);
    setDraftHiddenWidgets(snapshot.preferences.hiddenWidgets as HomeDashboardWidgetKey[]);
    setDraftDefaultRange(snapshot.preferences.defaultRange ?? snapshot.filters.range);
    setDraftDefaultTeam(snapshot.preferences.defaultTeamMemberId ?? "all");
  }, [snapshot]);

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

  const updateQueueItem = useCallback(
    async (payload: Parameters<typeof api.updateHomeDashboardPreferences>[0]) => {
      await runPreferenceUpdate(payload);
      await refreshDashboard("force");
    },
    [refreshDashboard, runPreferenceUpdate]
  );

  const saveCustomization = useCallback(async () => {
    await runPreferenceUpdate({
      widgetOrder: draftWidgetOrder,
      hiddenWidgets: draftHiddenWidgets,
      defaultRange: draftDefaultRange,
      defaultTeamMemberId: canFilterTeam && draftDefaultTeam !== "all" ? draftDefaultTeam : null,
    });
    setCustomizeOpen(false);
    await refreshDashboard("force");
  }, [canFilterTeam, draftDefaultRange, draftDefaultTeam, draftHiddenWidgets, draftWidgetOrder, refreshDashboard, runPreferenceUpdate]);

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

  const visibleSummaryWidgets = useMemo(() => {
    const hidden = new Set(snapshot?.preferences.hiddenWidgets ?? []);
    return (snapshot?.preferences.widgetOrder ?? []).filter(
      (widget): widget is HomeDashboardWidgetKey => SUMMARY_WIDGETS.includes(widget as HomeDashboardWidgetKey) && !hidden.has(widget)
    );
  }, [snapshot?.preferences.hiddenWidgets, snapshot?.preferences.widgetOrder]);

  const visibleMainWidgets = useMemo(() => {
    const hidden = new Set(snapshot?.preferences.hiddenWidgets ?? []);
    return (snapshot?.preferences.widgetOrder ?? []).filter(
      (widget): widget is HomeDashboardWidgetKey => !SUMMARY_WIDGETS.includes(widget as HomeDashboardWidgetKey) && !hidden.has(widget)
    );
  }, [snapshot?.preferences.hiddenWidgets, snapshot?.preferences.widgetOrder]);

  const lastUpdatedLabel = useMemo(() => {
    if (!snapshot?.generatedAt) return "Waiting on first snapshot";
    return formatDistanceToNowStrict(new Date(snapshot.generatedAt), { addSuffix: true });
  }, [snapshot?.generatedAt]);
  const featureEnabled = snapshot?.featureFlags.homeDashboardV2 ?? true;

  const pageError = error as Error | null;
  const safePageError = pageError ? new Error("Dashboard data is temporarily unavailable.") : null;
  const pageLoading = fetching && !snapshot;
  const staleSnapshotWarning = !pageLoading && pageError && snapshot;
  const widgetErrorFor = useCallback(
    (widget: HomeDashboardWidgetKey) => {
      const message = snapshot?.widgetErrors?.[widget]?.message;
      return message ? new Error(message) : null;
    },
    [snapshot?.widgetErrors]
  );

  if (!canViewDashboard) {
    return <Navigate to={getPreferredAuthorizedAppPath(outletContext.permissions, outletContext.enabledModules)} replace />;
  }

  const mainWidgetMap: Record<HomeDashboardWidgetKey, ReactNode> = {
    summary_needs_action: <HomeSummaryCards snapshot={snapshot} range={range} loading={pageLoading} />,
    summary_today: <HomeSummaryCards snapshot={snapshot} range={range} loading={pageLoading} />,
    summary_cash: <HomeSummaryCards snapshot={snapshot} range={range} loading={pageLoading} />,
    summary_conversion: <HomeSummaryCards snapshot={snapshot} range={range} loading={pageLoading} />,
    today_schedule: <HomeTodayScheduleCard snapshot={snapshot} range={range} loading={pageLoading} />,
    action_queue: (
      <HomeActionQueueCard
        snapshot={snapshot}
        loading={pageLoading}
        onDismiss={(itemId) => void updateQueueItem({ dismissQueueItemId: itemId })}
        onSnooze={(itemId) =>
          void updateQueueItem({
            snoozeQueueItemId: itemId,
            snoozeUntil: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          })
        }
      />
    ),
    quick_actions: <HomeQuickActionsCard snapshot={snapshot} loading={pageLoading || staffFetching} />,
    pipeline: <HomePipelineCard snapshot={snapshot} loading={pageLoading} />,
    revenue_collections: <HomeRevenueCollectionsCard snapshot={snapshot} loading={pageLoading} />,
    recent_activity: <HomeRecentActivityCard snapshot={snapshot} loading={pageLoading} />,
    automations: <HomeAutomationsCard snapshot={snapshot} loading={pageLoading} />,
    business_health: <HomeBusinessHealthCard snapshot={snapshot} loading={pageLoading} />,
    goals: <HomeGoalsCard snapshot={snapshot} loading={pageLoading} canEdit={outletContext.permissions.has("settings.write")} />,
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Dashboard"
        badge={
          <Badge variant="outline" className="rounded-full bg-white/80 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {outletContext.businessName ?? "Workspace"}
          </Badge>
        }
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
        secondaryAction={
          featureEnabled ? (
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setCustomizeOpen(true)}>
              <Settings2 className="mr-2 h-4 w-4" />
              Customize
            </Button>
          ) : (
            <Badge variant="outline" className="rounded-full bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Stable dashboard mode
            </Badge>
          )
        }
      />

      {featureEnabled ? <HomeSignalsStrip snapshot={snapshot} loading={pageLoading} /> : null}

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
        <div className="space-y-4">
          {visibleSummaryWidgets.length > 0 ? (
            <HomeSummaryCards
              snapshot={snapshot}
              range={range}
              visibleKeys={visibleSummaryWidgets}
              loading={pageLoading}
              onRetry={() => void refreshDashboard("force")}
            />
          ) : null}

          <div className="grid gap-4 xl:grid-cols-12">
            {visibleMainWidgets.map((widget) => (
              <div
                key={widget}
                className={cn(
                  "col-span-12",
                  widget === "today_schedule" && "xl:col-span-8",
                  widget === "action_queue" && "xl:col-span-4",
                  (widget === "quick_actions" || widget === "pipeline" || widget === "revenue_collections") && "xl:col-span-4",
                  (widget === "recent_activity" || widget === "automations" || widget === "business_health" || widget === "goals") && "md:col-span-6 xl:col-span-4"
                )}
              >
                {widget === "today_schedule" ? (
                  <HomeTodayScheduleCard snapshot={snapshot} range={range} loading={pageLoading} error={widgetErrorFor("today_schedule")} onRetry={() => void refreshDashboard("force")} />
                ) : widget === "action_queue" ? (
                  <HomeActionQueueCard
                    snapshot={snapshot}
                    loading={pageLoading}
                    error={widgetErrorFor("action_queue")}
                    onRetry={() => void refreshDashboard("force")}
                    onDismiss={(itemId) => void updateQueueItem({ dismissQueueItemId: itemId })}
                    onSnooze={(itemId) =>
                      void updateQueueItem({
                        snoozeQueueItemId: itemId,
                        snoozeUntil: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
                      })
                    }
                  />
                ) : widget === "quick_actions" ? (
                  <HomeQuickActionsCard snapshot={snapshot} loading={pageLoading || staffFetching} error={widgetErrorFor("quick_actions")} onRetry={() => void refreshDashboard("force")} />
                ) : widget === "pipeline" ? (
                  <HomePipelineCard snapshot={snapshot} loading={pageLoading} error={widgetErrorFor("pipeline")} onRetry={() => void refreshDashboard("force")} />
                ) : widget === "revenue_collections" ? (
                  <HomeRevenueCollectionsCard snapshot={snapshot} loading={pageLoading} error={widgetErrorFor("revenue_collections")} onRetry={() => void refreshDashboard("force")} />
                ) : widget === "recent_activity" ? (
                  <HomeRecentActivityCard snapshot={snapshot} loading={pageLoading} error={widgetErrorFor("recent_activity")} onRetry={() => void refreshDashboard("force")} />
                ) : widget === "automations" ? (
                  <HomeAutomationsCard snapshot={snapshot} loading={pageLoading} error={widgetErrorFor("automations")} onRetry={() => void refreshDashboard("force")} />
                ) : widget === "business_health" ? (
                  <HomeBusinessHealthCard snapshot={snapshot} loading={pageLoading} error={widgetErrorFor("business_health")} onRetry={() => void refreshDashboard("force")} />
                ) : widget === "goals" ? (
                  <HomeGoalsCard snapshot={snapshot} loading={pageLoading} error={widgetErrorFor("goals")} onRetry={() => void refreshDashboard("force")} canEdit={outletContext.permissions.has("settings.write")} />
                ) : (
                  mainWidgetMap[widget]
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={featureEnabled && customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-[1.5rem] p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border/70 px-5 py-4">
            <DialogTitle>Customize dashboard</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">Default date filter</span>
                <select
                  className="w-full rounded-xl border border-border/70 bg-white px-3 py-2"
                  value={draftDefaultRange}
                  onChange={(event) => setDraftDefaultRange(event.target.value as HomeDashboardRange)}
                >
                  <option value="today">Today</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                </select>
              </label>
              {canFilterTeam ? (
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">Default team filter</span>
                  <select
                    className="w-full rounded-xl border border-border/70 bg-white px-3 py-2"
                    value={draftDefaultTeam}
                    onChange={(event) => setDraftDefaultTeam(event.target.value)}
                  >
                    <option value="all">All team members</option>
                    {staffOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Visible widgets and order</h3>
                <p className="text-sm text-muted-foreground">Hide cards you never use and move the important ones up.</p>
              </div>
              <div className="space-y-2">
                {draftWidgetOrder.map((widget, index) => {
                  const hidden = draftHiddenWidgets.includes(widget);
                  return (
                    <div key={widget} className="flex items-center justify-between gap-3 rounded-[1rem] border border-border/70 bg-white/80 px-3 py-3">
                      <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={() =>
                            setDraftHiddenWidgets((current) =>
                              hidden ? current.filter((item) => item !== widget) : [...current, widget]
                            )
                          }
                        />
                        <span className="font-medium text-foreground">{getWidgetLabel(widget)}</span>
                      </label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={index === 0}
                          onClick={() =>
                            setDraftWidgetOrder((current) => {
                              const next = [...current];
                              [next[index - 1], next[index]] = [next[index], next[index - 1]];
                              return next;
                            })
                          }
                        >
                          Up
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={index === draftWidgetOrder.length - 1}
                          onClick={() =>
                            setDraftWidgetOrder((current) => {
                              const next = [...current];
                              [next[index + 1], next[index]] = [next[index], next[index + 1]];
                              return next;
                            })
                          }
                        >
                          Down
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-4">
            <Button type="button" variant="outline" onClick={() => setCustomizeOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveCustomization()}>
              Save preferences
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}
