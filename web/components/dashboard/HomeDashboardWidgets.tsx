import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  Car,
  CheckCircle2,
  ChevronRight,
  Gauge,
  HandCoins,
  History,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";
import type { HomeDashboardRange, HomeDashboardSnapshot } from "@/lib/homeDashboard";
import { formatDashboardCompactCurrency, formatDashboardCurrency } from "@/lib/homeDashboard";

type WidgetStateProps = {
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
};

type TopBarProps = {
  businessName: string | null;
  roleLabel: string;
  range: HomeDashboardRange;
  onRangeChange: (value: HomeDashboardRange) => void;
  teamOptions: Array<{ id: string; name: string }>;
  teamMemberId: string;
  onTeamChange: (value: string) => void;
  canFilterTeam: boolean;
  lastUpdatedLabel: string;
  refreshing: boolean;
  secondaryAction?: ReactNode;
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: string | null | undefined, compact = false) {
  const parsed = parseDate(value);
  if (!parsed) return "-";
  return format(parsed, compact ? "EEE h:mm a" : "MMM d, h:mm a");
}

function formatRelativeTime(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "Just now";
  return `${formatDistanceToNowStrict(parsed, { addSuffix: true })}`;
}

function getUrgencyTone(urgency: HomeDashboardSnapshot["actionQueue"]["items"][number]["urgency"]) {
  switch (urgency) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "high":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function getFinanceBadgeTone(tone: "warning" | "success" | "muted") {
  switch (tone) {
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function getSummaryCardDescription(range: HomeDashboardRange) {
  switch (range) {
    case "week":
      return "This week's live shop load.";
    case "month":
      return "This month's scheduled workload.";
    default:
      return "What the shop is carrying today.";
  }
}

function WidgetErrorState({ title, error, onRetry }: { title: string; error?: Error | null; onRetry?: () => void }) {
  return (
    <Card className="min-h-[220px]">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>This widget could not load right now.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-start justify-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
          <AlertCircle className="h-3.5 w-3.5" />
          Needs retry
        </div>
        <p className="text-sm text-muted-foreground">{error?.message ?? "The dashboard snapshot request failed."}</p>
      </CardContent>
      {onRetry ? (
        <CardFooter>
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function CardLoadingShell({ title, rows = 4, compact = false }: { title: string; rows?: number; compact?: boolean }) {
  return (
    <Card className={cn(compact ? "min-h-[150px]" : "min-h-[220px]")}>
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

export function HomeDashboardTopBar({
  businessName,
  roleLabel,
  range,
  onRangeChange,
  teamOptions,
  teamMemberId,
  onTeamChange,
  canFilterTeam,
  lastUpdatedLabel,
  refreshing,
  secondaryAction,
}: TopBarProps) {
  const rangeOptions: Array<{ value: HomeDashboardRange; label: string }> = [
    { value: "today", label: "Today" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
  ];

  return (
    <Card className="overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-white/78 py-0 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="h-1.5 bg-gradient-to-r from-sky-700 via-blue-600 to-cyan-400" />
      <CardContent className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50/90 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-sky-800">
              {businessName ?? "Current business"}
            </Badge>
            <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50/90 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-700">
              {roleLabel}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            <span>{refreshing ? "Refreshing..." : `Last updated ${lastUpdatedLabel}`}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {secondaryAction}
          <div className="inline-flex rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onRangeChange(option.value)}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  range === option.value ? "bg-white text-foreground shadow-sm" : "text-slate-500 hover:text-foreground"
                )}
                aria-pressed={range === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>

          {canFilterTeam ? (
            <label className="inline-flex min-w-[210px] items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-500">
              <UserRound className="h-4 w-4" />
              <span className="sr-only">Filter dashboard by team member</span>
              <select
                className="w-full bg-transparent text-sm text-foreground outline-none"
                value={teamMemberId}
                onChange={(event) => onTeamChange(event.target.value)}
                aria-label="Filter dashboard by team member"
              >
                <option value="all">All team members</option>
                {teamOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function HomeSummaryCards({
  snapshot,
  range,
  visibleKeys,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null; range: HomeDashboardRange; visibleKeys?: string[] } & WidgetStateProps) {
  const cards = snapshot?.summaryCards;
  const items = [
    {
      key: "summary_needs_action",
      title: "Needs Action",
      icon: AlertCircle,
      value: cards?.needsAction.total ?? 0,
      context: cards ? `${cards.needsAction.breakdown.overdue_invoice ?? 0} overdue invoices, ${cards.needsAction.breakdown.deposit_due ?? 0} deposit misses.` : "High-priority follow-up queue.",
      href: "/signed-in#action-queue",
    },
    {
      key: "summary_today",
      title: range === "today" ? "Today" : range === "week" ? "This Week" : "This Month",
      icon: CalendarClock,
      value: cards?.today.jobs ?? 0,
      context: cards ? `${cards.today.dropoffs} drop-offs, ${cards.today.pickups} pickups, ${cards.today.inShop} in shop.` : getSummaryCardDescription(range),
      href: "/appointments",
    },
    {
      key: "summary_cash",
      title: "Cash",
      icon: HandCoins,
      value: cards ? formatDashboardCompactCurrency(cards.cash.collectedToday) : formatDashboardCompactCurrency(0),
      context: cards ? `${formatDashboardCompactCurrency(cards.cash.overdueInvoiceAmount)} overdue and ${formatDashboardCompactCurrency(cards.cash.depositsDueAmount)} in deposits due.` : "Collected today and cash at risk.",
      href: "/finances",
    },
    {
      key: "summary_conversion",
      title: "Conversion",
      icon: TrendingUp,
      value: cards?.conversion.conversionRate != null ? `${Math.round(cards.conversion.conversionRate)}%` : `${cards?.conversion.booked ?? 0}`,
      context: cards ? `${cards.conversion.newLeads} new leads, ${cards.conversion.quoted} quoted, ${cards.conversion.booked} booked.` : "Lead to booking signal from live data.",
      href: "/leads",
    },
  ];

  const filteredItems = visibleKeys?.length ? items.filter((item) => visibleKeys.includes(item.key)) : items;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {filteredItems.map((item) =>
        loading ? (
          <CardLoadingShell key={item.key} title={item.title} rows={2} compact />
        ) : snapshot?.widgetErrors?.[item.key as keyof typeof snapshot.widgetErrors] ? (
          <WidgetErrorState
            key={item.key}
            title={item.title}
            error={new Error(snapshot.widgetErrors[item.key as keyof typeof snapshot.widgetErrors]?.message ?? "This widget is temporarily unavailable.")}
            onRetry={onRetry}
          />
        ) : error ? (
          <WidgetErrorState key={item.key} title={item.title} error={error} onRetry={onRetry} />
        ) : (
          <Card key={item.key} className="gap-3 py-4">
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{item.title}</CardTitle>
                </div>
                <Button asChild variant="ghost" size="sm" className="rounded-full text-xs">
                  <Link to={item.href}>
                    Open
                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">{item.value}</div>
              <p className="text-sm leading-5 text-muted-foreground">{item.context}</p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}

export function HomeTodayScheduleCard({
  snapshot,
  range,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null; range: HomeDashboardRange } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Today Schedule" rows={6} />;
  if (error) return <WidgetErrorState title="Today Schedule" error={error} onRetry={onRetry} />;

  const items = snapshot?.todaySchedule.items ?? [];
  const heading = range === "today" ? "Today Schedule" : range === "week" ? "This Week" : "This Month";

  return (
    <Card id="today-schedule" className="min-h-[480px]">
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
        <CardDescription>
          {range === "today"
            ? "Every active drop-off, overlap, and pickup that touches today."
            : "Operational schedule filtered from the same live appointment source."}
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to="/appointments">Open schedule</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing scheduled in this view"
            description="Create the next appointment to keep the board moving and give the team something to work from."
            action={
              <Button asChild>
                <Link to="/appointments/new">Create appointment</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-[1.2rem] border border-border/70 bg-white/80 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={item.status} type="appointment" />
                      {item.financeBadges.map((badge) => (
                        <span
                          key={badge.key}
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            getFinanceBadgeTone(badge.tone)
                          )}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                    <div>
                      <Link to={item.urls.appointment} className="text-base font-semibold tracking-[-0.02em] text-slate-950 hover:text-orange-700">
                        {item.title}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDateTime(item.startTime, true)}
                        {item.endTime ? ` - ${formatDateTime(item.endTime, true)}` : ""}
                      </p>
                    </div>
                    <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
                      <span className="inline-flex items-center gap-2">
                        <UserRound className="h-4 w-4" />
                        {item.client.url ? <Link to={item.client.url}>{item.client.name}</Link> : item.client.name}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <Car className="h-4 w-4" />
                        {item.vehicle.url ? <Link to={item.vehicle.url}>{item.vehicle.label}</Link> : item.vehicle.label}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        {item.servicesSummary.label}
                      </span>
                    </div>
                    {item.assignedTeam.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {item.assignedTeam.map((member) => (
                          <Badge key={member.id ?? member.name} variant="outline" className="rounded-full bg-slate-50">
                            {member.name}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:max-w-[220px] sm:justify-end">
                    {item.inlineActions.slice(0, 3).map((action) => (
                      <Button key={action.key} asChild size="sm" variant={action.key === "collect_payment" ? "default" : "outline"} className="rounded-full">
                        <Link to={action.url}>{action.label}</Link>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HomeActionQueueCard({
  snapshot,
  loading,
  error,
  onRetry,
  onDismiss,
  onSnooze,
}: {
  snapshot?: HomeDashboardSnapshot | null;
  onDismiss?: (itemId: string) => void;
  onSnooze?: (itemId: string) => void;
} & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Action Queue" rows={5} />;
  if (error) return <WidgetErrorState title="Action Queue" error={error} onRetry={onRetry} />;

  const items = snapshot?.actionQueue.items ?? [];

  return (
    <Card id="action-queue" className="min-h-[480px]">
      <CardHeader>
        <CardTitle>Action Queue</CardTitle>
        <CardDescription>The next things someone on the team can actually do.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No urgent queue items"
            description="The live follow-up queues are clear right now. That usually means deposits, invoices, and leads are under control."
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-[1.1rem] border border-border/70 bg-white/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", getUrgencyTone(item.urgency))}>
                        {item.urgency}
                      </span>
                      {item.amountAtRisk != null ? (
                        <Badge variant="outline" className="rounded-full bg-slate-50">
                          {formatDashboardCurrency(item.amountAtRisk)} at risk
                        </Badge>
                      ) : null}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-950">{item.label}</p>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.reason}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.occurredAt ? formatRelativeTime(item.occurredAt) : "Needs attention now"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Button asChild size="sm" className="rounded-full">
                      <Link to={item.ctaUrl}>
                        {item.ctaLabel}
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <div className="flex gap-2">
                      {item.supportsSnooze && onSnooze ? (
                        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={() => onSnooze(item.id)}>
                          Snooze
                        </Button>
                      ) : null}
                      {item.supportsDismiss && onDismiss ? (
                        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={() => onDismiss(item.id)}>
                          Dismiss
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HomeSignalsStrip({ snapshot, loading }: { snapshot?: HomeDashboardSnapshot | null; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr]">
        <CardLoadingShell title="Since you last checked" rows={2} compact />
        <CardLoadingShell title="Worth noticing" rows={2} compact />
        <CardLoadingShell title="Contextual nudges" rows={2} compact />
      </div>
    );
  }

  const sinceLastChecked = snapshot?.sinceLastChecked;
  const valueMoments = snapshot?.valueMoments ?? [];
  const nudges = snapshot?.nudges ?? [];

  return (
    <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr]">
      <Card className="gap-3 py-4">
        <CardHeader>
          <CardTitle>Since you last checked</CardTitle>
          <CardDescription>
            {sinceLastChecked?.allowed && sinceLastChecked.since ? `Changes since ${formatRelativeTime(sinceLastChecked.since)}` : "We'll start tracking this after your first visit."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <SignalStat label="New leads" value={sinceLastChecked?.newLeads ?? 0} />
          <SignalStat label="New bookings" value={sinceLastChecked?.newBookings ?? 0} />
          <SignalStat label="Payments received" value={sinceLastChecked?.paymentsReceived ?? 0} />
          <SignalStat label="New issues" value={sinceLastChecked?.newIssues ?? 0} tone="text-rose-700" />
          <SignalStat label="Resolved issues" value={sinceLastChecked?.resolvedIssues ?? 0} tone="text-emerald-700" />
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader>
          <CardTitle>Worth noticing</CardTitle>
          <CardDescription>Factual proof that the dashboard is paying for its space.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {valueMoments.length === 0 ? (
            <p className="text-sm text-muted-foreground">The dashboard will surface signal here as soon as the shop generates it.</p>
          ) : (
            valueMoments.slice(0, 3).map((moment) => (
              <div key={moment.id} className="rounded-[1rem] border border-border/70 bg-white/80 p-3">
                <p className="font-medium text-slate-950">{moment.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{moment.detail}</p>
                {moment.url ? (
                  <Button asChild variant="link" className="mt-1 h-auto px-0 text-sm">
                    <Link to={moment.url}>Open</Link>
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader>
          <CardTitle>Contextual nudges</CardTitle>
          <CardDescription>Only the next few setup wins that actually matter right now.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {nudges.length === 0 ? (
            <p className="text-sm text-muted-foreground">No setup nudges right now. The basics are in a healthy state.</p>
          ) : (
            nudges.map((nudge) => (
              <div
                key={nudge.id}
                className={cn(
                  "rounded-[1rem] border p-3",
                  nudge.tone === "warning" ? "border-orange-200 bg-orange-50/80" : "border-sky-200 bg-sky-50/80"
                )}
              >
                <p className="font-medium text-slate-950">{nudge.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{nudge.detail}</p>
                <Button asChild variant="link" className="mt-1 h-auto px-0 text-sm">
                  <Link to={nudge.url}>Open</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SignalStat({ label, value, tone = "text-slate-950" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-[1rem] border border-border/70 bg-white/80 px-3 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-xl font-semibold tracking-tight", tone)}>{value}</p>
    </div>
  );
}

export function HomeQuickActionsCard({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Quick Actions" rows={4} compact />;
  if (error) return <WidgetErrorState title="Quick Actions" error={error} onRetry={onRetry} />;

  const actions = snapshot?.quickActions ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Fast paths for the work people repeat all day.</CardDescription>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <EmptyState icon={Zap} title="No quick actions available" description="This role does not have creation actions on the dashboard right now." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {actions.map((action) => (
              <Button
                key={action.key}
                asChild
                variant={action.key === "new_appointment" ? "default" : "outline"}
                className="h-auto min-h-[78px] justify-start rounded-[1.1rem] px-4 py-3 text-left"
              >
                <Link to={action.url}>
                  <span className="flex flex-col items-start">
                    <span className="font-semibold">{action.label}</span>
                    <span className="mt-1 text-xs text-muted-foreground">{action.description}</span>
                  </span>
                </Link>
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HomePipelineCard({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Pipeline" rows={5} compact />;
  if (error) return <WidgetErrorState title="Pipeline" error={error} onRetry={onRetry} />;

  const stages = snapshot?.pipeline.stages ?? [];
  const hrefByStage: Record<string, string> = {
    new_leads: "/leads",
    quoted: "/quotes",
    booked: "/appointments",
    completed: "/jobs",
    paid: "/invoices",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>Real pipeline stages based on current leads, quotes, bookings, and paid work.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No pipeline data yet" description="Leads, quotes, and booked work will show up here as soon as they exist." />
        ) : (
          stages.map((stage) => (
            <Link
              key={stage.key}
              to={hrefByStage[stage.key] ?? "/signed-in"}
              className="flex items-center justify-between rounded-[1rem] border border-border/70 bg-white/80 px-3 py-3 transition-colors hover:border-orange-200 hover:bg-orange-50/60"
            >
              <div>
                <p className="font-medium text-slate-950">{stage.label}</p>
                <p className="text-xs text-muted-foreground">
                  {stage.value != null ? formatDashboardCompactCurrency(stage.value) : "Count only"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold tracking-tight text-slate-950">{stage.count}</p>
                <p className="text-xs text-muted-foreground">records</p>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function HomeRevenueCollectionsCard({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Revenue + Collections" rows={6} />;
  if (error) return <WidgetErrorState title="Revenue + Collections" error={error} onRetry={onRetry} />;

  const data = snapshot?.revenueCollections;
  const rows = data
    ? [
        { label: "Booked this week", value: formatDashboardCurrency(data.bookedRevenueThisWeek), tone: "text-slate-950" },
        { label: "Collected this week", value: formatDashboardCurrency(data.collectedThisWeek), tone: "text-emerald-700" },
        { label: "Collected today", value: formatDashboardCurrency(data.collectedToday), tone: "text-slate-950" },
        { label: "Outstanding", value: formatDashboardCurrency(data.outstandingInvoiceAmount), tone: "text-amber-700" },
        { label: "Overdue", value: formatDashboardCurrency(data.overdueInvoiceAmount), tone: "text-rose-700" },
        { label: "Deposits due", value: `${formatDashboardCurrency(data.depositsDueAmount)} · ${data.depositsDueCount}`, tone: "text-orange-700" },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue + Collections</CardTitle>
        <CardDescription>The money picture that matters for today's operation.</CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to="/finances">Open finances</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between rounded-[1rem] border border-border/70 bg-white/80 px-3 py-3">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className={cn("text-sm font-semibold", row.tone)}>{row.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function HomeRecentActivityCard({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Recent Activity" rows={5} />;
  if (error) return <WidgetErrorState title="Recent Activity" error={error} onRetry={onRetry} />;

  const items = snapshot?.recentActivity.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Meaningful activity pulled from real shop events.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState icon={History} title="No activity yet" description="Appointments, payments, quotes, and automations will start showing here as the shop runs." />
        ) : (
          <div className="space-y-3">
            {items.slice(0, 8).map((item) => (
              <Fragment key={item.id}>
                <div className="flex items-start gap-3">
                  <div className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <History className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.url ? (
                        <Link to={item.url} className="font-medium text-slate-950 hover:text-orange-700">
                          {item.label}
                        </Link>
                      ) : (
                        <p className="font-medium text-slate-950">{item.label}</p>
                      )}
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(item.occurredAt)}</span>
                    </div>
                    {item.detail ? <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p> : null}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AutomationStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-[1rem] border border-border/70 bg-white/80 px-3 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{value == null ? "--" : value}</p>
    </div>
  );
}

export function HomeAutomationsCard({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Automations" rows={5} compact />;
  if (error) return <WidgetErrorState title="Automations" error={error} onRetry={onRetry} />;

  const automations = snapshot?.automations;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automations</CardTitle>
        <CardDescription>Messages sent, success rate, and failure pressure.</CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings?tab=automations">Open settings</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {!automations || !automations.allowed ? (
          <EmptyState icon={Sparkles} title="Automation data hidden" description="This role does not have access to automation controls." />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <AutomationStat label="Reminders" value={automations.remindersSentThisWeek} />
              <AutomationStat label="Review requests" value={automations.reviewRequestsSentThisWeek} />
              <AutomationStat label="Reactivation" value={automations.reactivationMessagesSentThisWeek} />
              <AutomationStat label="Invoice nudges" value={automations.invoiceNudgesSentThisWeek ?? null} />
            </div>
            <div className="rounded-[1rem] border border-border/70 bg-white/80 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Delivery success</span>
                <span className="text-sm font-semibold text-slate-950">
                  {automations.deliverySuccessRate == null ? "--" : `${Math.round(automations.deliverySuccessRate)}%`}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Failures needing attention</span>
                <Badge className={cn("rounded-full", automations.failedAutomationCount > 0 ? "bg-rose-600" : "bg-emerald-600")}>
                  {automations.failedAutomationCount}
                </Badge>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function HomeBusinessHealthCard({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Business Health" rows={5} compact />;
  if (error) return <WidgetErrorState title="Business Health" error={error} onRetry={onRetry} />;

  const health = snapshot?.businessHealth;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Health</CardTitle>
        <CardDescription>Transparent score with the drivers behind it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!health || !health.allowed ? (
          <EmptyState icon={Gauge} title="Health score hidden" description="This role does not have the permissions needed for the health breakdown." />
        ) : (
          <>
            <div className="rounded-[1rem] border border-border/70 bg-white/80 p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Score</p>
                  <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-slate-950">{health.score ?? "--"}</p>
                </div>
                <div className="text-right text-sm text-muted-foreground">Top issues to fix first</div>
              </div>
              <Progress className="mt-4 h-2.5 bg-slate-200" value={health.score ?? 0} />
            </div>
            <div className="space-y-2">
              {health.factors.slice(0, 3).map((factor) => (
                <div key={factor.key} className="rounded-[1rem] border border-border/70 bg-white/80 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-950">{factor.label}</p>
                    <Badge variant="outline" className="rounded-full bg-slate-50">
                      {factor.issueCount} issues
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{factor.detail}</p>
                </div>
              ))}
            </div>
            {health.topIssues[0] ? (
              <div className="rounded-[1rem] border border-orange-200 bg-orange-50/80 p-3 text-sm text-orange-900">
                <p className="font-semibold">Next fix</p>
                <p className="mt-1">{health.topIssues[0].label}</p>
                <p className="mt-1 text-orange-800/80">{health.topIssues[0].detail}</p>
                {health.topIssues[0].url ? (
                  <Button asChild variant="link" className="mt-2 h-auto px-0 text-orange-800">
                    <Link to={health.topIssues[0].url!}>Open related queue</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function HomeGoalsCard({
  snapshot,
  canEdit,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null; canEdit: boolean } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Goals" rows={4} compact />;
  if (error) return <WidgetErrorState title="Goals" error={error} onRetry={onRetry} />;

  const goals = snapshot?.goals;
  const percent = goals?.percentToGoal ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Goals</CardTitle>
        <CardDescription>Monthly pace against the targets already configured for the business.</CardDescription>
        {canEdit ? (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings?tab=business">Edit goals</Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!goals || !goals.allowed ? (
          <EmptyState icon={Target} title="Goals hidden" description="This role does not have access to business goals." />
        ) : goals.monthlyRevenueGoal == null && goals.monthlyJobsGoal == null ? (
          <EmptyState
            icon={Target}
            title="No goals set yet"
            description="Set a monthly revenue or jobs target so the home dashboard can show pace, projection, and focus."
            action={
              canEdit ? (
                <Button asChild>
                  <Link to="/settings?tab=business">Set goals</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="rounded-[1rem] border border-border/70 bg-white/80 p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Monthly revenue goal</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {goals.monthlyRevenueGoal != null ? formatDashboardCurrency(goals.monthlyRevenueGoal) : "--"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Booked so far</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{formatDashboardCurrency(goals.currentRevenue)}</p>
                </div>
              </div>
              <Progress className="mt-4 h-2.5 bg-slate-200" value={Math.max(0, Math.min(100, percent))} />
              <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <span>{goals.percentToGoal == null ? "--" : `${Math.round(goals.percentToGoal)}% to goal`}</span>
                <span>Projected {goals.projectedMonthEnd == null ? "--" : formatDashboardCurrency(goals.projectedMonthEnd)}</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-[1rem] border border-border/70 bg-white/80 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Jobs goal</p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  {goals.monthlyJobsGoal == null ? "--" : `${goals.currentJobs}/${goals.monthlyJobsGoal}`}
                </p>
              </div>
              <div className="rounded-[1rem] border border-border/70 bg-white/80 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Projected finish</p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  {goals.projectedMonthEnd == null ? "--" : formatDashboardCompactCurrency(goals.projectedMonthEnd)}
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardPageErrorGrid({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="space-y-3">
      <HomeSummaryCards range="today" error={error} onRetry={onRetry} />
      <div className="grid gap-3 xl:grid-cols-[1.5fr_0.95fr]">
        <WidgetErrorState title="Today Schedule" error={error} onRetry={onRetry} />
        <WidgetErrorState title="Action Queue" error={error} onRetry={onRetry} />
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <WidgetErrorState title="Quick Actions" error={error} onRetry={onRetry} />
        <WidgetErrorState title="Pipeline" error={error} onRetry={onRetry} />
        <WidgetErrorState title="Revenue + Collections" error={error} onRetry={onRetry} />
      </div>
    </div>
  );
}
