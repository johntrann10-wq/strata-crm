import { useState } from "react";
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
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import type { HomeDashboardRange, HomeDashboardSnapshot } from "@/lib/homeDashboard";
import { formatDashboardCompactCurrency, formatDashboardCurrency } from "@/lib/homeDashboard";

type WidgetStateProps = {
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
};

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

function WidgetErrorState({ title, error, onRetry }: { title: string; error?: Error | null; onRetry?: () => void }) {
  return (
    <Card className="min-h-[220px]">
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
    <Card className={cn(compact ? "min-h-[140px]" : "min-h-[220px]")}>
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {["Bookings today", "Bookings this week", "Revenue this month", "Outstanding overdue"].map((title) => (
          <CardLoadingShell key={title} title={title} rows={2} compact />
        ))}
      </div>
    );
  }
  if (error) return <WidgetErrorState title="KPI Strip" error={error} onRetry={onRetry} />;

  const bookings = snapshot?.bookingsOverview;
  const goals = snapshot?.goals;
  const cash = snapshot?.revenueCollections;
  const items = [
    {
      key: "bookings_today",
      title: "Bookings today",
      value: bookings?.bookingsToday ?? 0,
      context: `${bookings?.bookingsThisWeek ?? 0} booked this week`,
      href: "/appointments",
    },
    {
      key: "bookings_week",
      title: "Bookings this week",
      value: bookings?.bookingsThisWeek ?? 0,
      context: `${bookings?.bookingsThisMonth ?? 0} booked this month`,
      href: "/appointments",
    },
    {
      key: "revenue_month",
      title: "Revenue this month",
      value: formatDashboardCompactCurrency(snapshot?.monthlyRevenueChart.totalBookedThisMonth ?? 0),
      context: goals?.percentToGoal != null ? `${goals.percentToGoal}% to goal` : "Booked revenue month to date",
      href: "/calendar",
    },
    {
      key: "overdue_balance",
      title: "Outstanding overdue",
      value: formatDashboardCompactCurrency(cash?.overdueInvoiceAmount ?? 0),
      context: `${snapshot?.actionQueue.items.filter((item) => item.type === "overdue_invoice").length ?? 0} overdue invoices`,
      href: "/invoices",
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.key} className="gap-2 py-4">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardDescription className="text-[11px] uppercase tracking-[0.16em]">{item.title}</CardDescription>
                <CardTitle className="mt-2 text-3xl tracking-[-0.04em]">{item.value}</CardTitle>
              </div>
              <Button asChild variant="ghost" size="sm" className="rounded-full text-xs">
                <Link to={item.href}>
                  Open
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">{item.context}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function HomeWeeklyAppointmentOverviewCard({
  snapshot,
  loading,
  error,
  onRetry,
  selectedDate,
  onSelectDate,
  onChangeWeek,
}: {
  snapshot?: HomeDashboardSnapshot | null;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  selectedDate?: string | null;
  onSelectDate?: (date: string | null) => void;
  onChangeWeek?: (weekStartDate: string | null, selectedDate?: string | null) => void;
}) {
  if (loading) return <CardLoadingShell title="Weekly Appointment Overview" rows={7} />;
  if (error) return <WidgetErrorState title="Weekly Appointment Overview" error={error} onRetry={onRetry} />;

  const overview = snapshot?.weeklyOverview;
  if (!overview?.allowed) {
    return (
      <Card>
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
  const activeDay =
    overview.days.find((day) => day.date === selectedDate)
    ?? overview.days.find((day) => day.date === overview.selectedDate)
    ?? overview.days.find((day) => day.appointmentCount > 0)
    ?? overview.days[0]
    ?? null;

  if (!activeDay) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weekly Appointment Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={CalendarClock} title="No week selected" description="Choose a week to review your appointment load." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Appointment Overview</CardTitle>
        <CardDescription>{formatDateLabel(overview.weekStart, "MMM d")} - {formatDateLabel(overview.weekEnd, "MMM d")}</CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => onChangeWeek?.(shiftDateKey(overview.days[0]?.date ?? activeDay.date, -7), shiftDateKey(activeDay.date, -7))}
              aria-label="Previous week"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => onChangeWeek?.(shiftDateKey(overview.days[0]?.date ?? activeDay.date, 7), shiftDateKey(activeDay.date, 7))}
              aria-label="Next week"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-full">
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
            <div className="hidden overflow-hidden rounded-[1.3rem] border border-border/70 bg-white/90 lg:grid lg:grid-cols-7">
              {overview.days.map((day) => {
                const isActive = day.date === activeDay.date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => onSelectDate?.(day.date)}
                    className={cn(
                      "flex min-h-[380px] flex-col border-r border-border/60 p-0 text-left transition-colors last:border-r-0",
                      isActive ? "bg-orange-50/70 shadow-[inset_0_0_0_1px_rgba(251,146,60,0.35)]" : "bg-white/80 hover:bg-slate-50/90"
                    )}
                    aria-pressed={isActive}
                  >
                    <div className="border-b border-border/60 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{day.shortLabel}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateLabel(day.date, "MMM d")}</p>
                        </div>
                        <Link
                          to={day.calendarUrl}
                          className="rounded-full p-1 text-muted-foreground hover:bg-white hover:text-slate-950"
                          aria-label={`Open ${day.label} in calendar`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <p className="text-2xl font-semibold tracking-tight text-slate-950">{day.appointmentCount}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span>{day.appointmentCount === 1 ? "appointment" : "appointments"}</span>
                          <span className="text-slate-300">•</span>
                          <span className="font-semibold text-slate-800">{formatDashboardCompactCurrency(day.bookedValue)} booked</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col justify-between px-4 py-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-1.5 text-[10px]">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Up {day.statusCounts.upcoming}</span>
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Live {day.statusCounts.inProgress}</span>
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Done {day.statusCounts.completed}</span>
                          <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">Cancel {day.statusCounts.cancelled}</span>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Next jobs</p>
                          {day.previewItems.length === 0 ? (
                            <div className="rounded-[0.95rem] border border-dashed border-border/70 bg-white/75 px-2.5 py-3 text-xs text-muted-foreground">
                              No jobs queued yet.
                            </div>
                          ) : (
                            day.previewItems.slice(0, 3).map((item) => (
                              <Link
                                key={item.id}
                                to={item.url}
                                onClick={(event) => event.stopPropagation()}
                                className="block rounded-[0.95rem] border border-border/70 bg-white/88 px-3 py-3 transition-colors hover:border-orange-200 hover:bg-orange-50/50"
                              >
                                <div className="flex items-start justify-between gap-2.5">
                                  <div className="min-w-0">
                                    <p className="line-clamp-2 text-[12px] font-semibold leading-4 text-slate-950">{item.title}</p>
                                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                                      {item.clientName}
                                      {item.vehicleLabel ? ` · ${item.vehicleLabel}` : ""}
                                    </p>
                                  </div>
                                  <p className="shrink-0 text-[11px] font-medium text-muted-foreground">
                                    {formatDateLabel(item.startTime, "h:mm a")}
                                  </p>
                                </div>
                              </Link>
                            ))
                          )}
                        </div>
                      </div>
                      {day.capacityUsage != null ? (
                        <div className="flex items-center justify-between rounded-[0.9rem] border border-border/70 bg-slate-50/80 px-2.5 py-2 text-[11px] text-muted-foreground">
                          <span>Assigned</span>
                          <span className="font-semibold text-slate-700">{day.capacityUsage}%</span>
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 lg:hidden">
              {overview.days.map((day) => {
                const isActive = day.date === activeDay.date;
                return (
                  <div
                    key={day.date}
                    className={cn(
                      "rounded-[1.1rem] border p-3 transition-colors",
                      isActive ? "border-orange-300 bg-orange-50/70 shadow-sm" : "border-border/70 bg-white/80"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => onSelectDate?.(day.date)} className="min-w-0 text-left" aria-pressed={isActive}>
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{day.label}</p>
                        <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{day.appointmentCount} {day.appointmentCount === 1 ? "appointment" : "appointments"}</p>
                        <p className="text-sm font-medium text-slate-700">{formatDashboardCurrency(day.bookedValue)} booked</p>
                      </button>
                      <Button asChild variant="ghost" size="icon" className="mt-0.5 h-8 w-8 rounded-full">
                        <Link to={day.calendarUrl} aria-label={`Open ${day.label} in calendar`}>
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>Upcoming {day.statusCounts.upcoming}</span>
                      <span>In progress {day.statusCounts.inProgress}</span>
                      <span>Completed {day.statusCounts.completed}</span>
                      <span>Cancelled {day.statusCounts.cancelled}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {day.previewItems.length === 0 ? (
                        <div className="rounded-[0.95rem] border border-dashed border-border/70 bg-white/75 px-3 py-3 text-xs text-muted-foreground">
                          No jobs queued yet.
                        </div>
                      ) : (
                        day.previewItems.slice(0, 3).map((item) => (
                          <Link
                            key={item.id}
                            to={item.url}
                            className="block rounded-[0.95rem] border border-border/70 bg-white/88 px-3 py-2.5 transition-colors hover:border-orange-200 hover:bg-orange-50/50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[12px] font-semibold text-slate-950">{item.title}</p>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  {item.clientName} · {item.vehicleLabel}
                                </p>
                              </div>
                              <p className="shrink-0 text-[11px] font-medium text-muted-foreground">
                                {formatDateLabel(item.startTime, "h:mm a")}
                              </p>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                    {day.capacityUsage != null ? (
                      <div className="mt-3 flex items-center justify-between rounded-[0.9rem] border border-border/70 bg-slate-50/80 px-3 py-2 text-[11px] text-muted-foreground">
                        <span>Assigned</span>
                        <span className="font-semibold text-slate-700">{day.capacityUsage}%</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="rounded-[1.2rem] border border-border/70 bg-slate-50/90 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Selected day</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{activeDay.label}, {formatDateLabel(activeDay.date, "MMM d")}</p>
                  <p className="text-sm text-muted-foreground">
                    {activeDay.appointmentCount} appointments · {formatDashboardCurrency(activeDay.bookedValue)} booked
                  </p>
                </div>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to={activeDay.calendarUrl}>
                    Open day in calendar
                    <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {activeDay.previewItems.length === 0 ? (
                  <div className="rounded-[1rem] border border-dashed border-border/70 bg-white/80 px-3 py-4 text-sm text-muted-foreground">
                    No jobs queued for this day yet.
                  </div>
                ) : (
                  activeDay.previewItems.map((item) => (
                    <Link
                      key={item.id}
                      to={item.url}
                      className="flex items-start justify-between gap-3 rounded-[1rem] border border-border/70 bg-white/90 px-3 py-3 transition-colors hover:border-orange-200 hover:bg-orange-50/50"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.clientName} · {item.vehicleLabel}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{formatDateLabel(item.startTime, "h:mm a")}</p>
                        <span className="mt-1 inline-flex items-center text-xs font-medium text-slate-700">
                          Open
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </span>
                      </div>
                    </Link>
                  ))
                )}
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
  onSnooze,
}: {
  snapshot?: HomeDashboardSnapshot | null;
  range: HomeDashboardRange;
  onDismiss?: (itemId: string) => void;
  onSnooze?: (itemId: string) => void;
} & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Upcoming Jobs / Needs Attention" rows={6} />;
  if (error) return <WidgetErrorState title="Upcoming Jobs / Needs Attention" error={error} onRetry={onRetry} />;

  const scheduleItems = snapshot?.todaySchedule.items.slice(0, 4) ?? [];
  const queueItems = snapshot?.actionQueue.items.slice(0, 5) ?? [];
  const rangeLabel = range === "today" ? "today" : range === "week" ? "this week" : "this month";
  const upcomingHeading = range === "today" ? "Today’s queue" : range === "week" ? "This week" : "This month";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Jobs / Needs Attention</CardTitle>
        <CardDescription>The next jobs in {rangeLabel} and the revenue-pressure items that need action first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            {upcomingHeading}
          </div>
          {scheduleItems.length === 0 ? (
            <p className="rounded-[1rem] border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">No upcoming jobs in this view.</p>
          ) : (
            scheduleItems.map((item) => (
              <Link key={item.id} to={item.urls.appointment} className="block rounded-[1rem] border border-border/70 bg-white/80 p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.client.name} · {item.vehicle.label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateLabel(item.startTime, "EEE h:mm a")}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </Link>
            ))
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" />
            Needs attention
          </div>
          {queueItems.length === 0 ? (
            <div className="rounded-[1rem] border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">No urgent action items right now.</div>
          ) : (
            queueItems.map((item) => (
              <div key={item.id} className="rounded-[1rem] border border-border/70 bg-white/80 p-3">
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
                      {item.amountAtRisk != null ? <Badge variant="outline">{formatDashboardCurrency(item.amountAtRisk)} at risk</Badge> : null}
                    </div>
                    <p className="mt-2 font-semibold text-slate-950">{item.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                  </div>
                  <Button asChild size="sm" className="rounded-full">
                    <Link to={item.ctaUrl}>{item.ctaLabel}</Link>
                  </Button>
                </div>
                {(item.supportsSnooze || item.supportsDismiss) && (onSnooze || onDismiss) ? (
                  <div className="mt-2 flex gap-2">
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
                ) : null}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function HomeMonthlyRevenueChartCard({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  const [mode, setMode] = useState<"booked" | "collected">("booked");
  if (loading) return <CardLoadingShell title="Monthly Revenue Chart" rows={6} />;
  if (error) return <WidgetErrorState title="Monthly Revenue Chart" error={error} onRetry={onRetry} />;

  const chart = snapshot?.monthlyRevenueChart;
  if (!chart?.allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly Revenue Chart</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={BarChart3} title="Revenue chart hidden" description="This role does not have access to revenue visibility." />
        </CardContent>
      </Card>
    );
  }

  const values = chart.days.map((day) => (mode === "booked" ? day.bookedRevenue : day.collectedRevenue));
  const maxValue = Math.max(...values, 1);
  const hasAnyRevenue = values.some((value) => value > 0);
  const showGoalPace = mode === "booked" && chart.goalAmount != null && chart.days.some((day) => day.goalPaceRevenue != null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Revenue Chart</CardTitle>
        <CardDescription>
          {formatDateLabel(chart.monthStart, "MMMM yyyy")} · booked revenue by scheduled work day and collected revenue by payment day.
        </CardDescription>
        <CardAction>
          <div className="inline-flex rounded-2xl border border-border/70 bg-slate-50/80 p-1">
            {(["booked", "collected"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]",
                  mode === option ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
                )}
                aria-pressed={mode === option}
              >
                {option}
              </button>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1rem] border border-border/70 bg-white/80 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Booked this month</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{formatDashboardCurrency(chart.totalBookedThisMonth)}</p>
          </div>
          <div className="rounded-[1rem] border border-border/70 bg-white/80 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Collected this month</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{formatDashboardCurrency(chart.totalCollectedThisMonth)}</p>
          </div>
          <div className="rounded-[1rem] border border-border/70 bg-white/80 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Outstanding invoices</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{formatDashboardCurrency(chart.outstandingInvoiceAmount)}</p>
          </div>
          <div className="rounded-[1rem] border border-border/70 bg-white/80 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Percent to goal</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{chart.percentToGoal == null ? "--" : `${chart.percentToGoal}%`}</p>
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-border/70 bg-white/80 p-4">
          {!hasAnyRevenue ? (
            <EmptyState
              icon={BarChart3}
              title="No revenue activity this month yet"
              description="Booked and collected revenue will start drawing here as appointments, invoices, and payments land."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Revenue is grouped by business day. Tap a bar to drill into that date.</span>
                {showGoalPace ? <span>Goal pace is shown as a guide for booked revenue.</span> : null}
              </div>
              <div className="mt-4 rounded-[1rem] border border-border/60 bg-slate-50/70 p-3 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-[auto,1fr] sm:items-end">
                  <div className="hidden h-64 flex-col justify-between text-[10px] text-muted-foreground sm:flex">
                    <span>{formatDashboardCompactCurrency(maxValue)}</span>
                    <span>{formatDashboardCompactCurrency(maxValue / 2)}</span>
                    <span>$0</span>
                  </div>
                  <div className="min-w-0 overflow-x-auto pb-1">
                    <div className="relative min-w-[680px]">
                      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                        <div className="border-t border-dashed border-slate-300/90" />
                        <div className="border-t border-dashed border-slate-200/90" />
                        <div className="border-t border-dashed border-slate-300/90" />
                      </div>
                      <div className="relative flex h-64 items-end gap-1.5">
                        {chart.days.map((day) => {
                          const value = mode === "booked" ? day.bookedRevenue : day.collectedRevenue;
                          const barHeight = value > 0 ? Math.max(6, Math.round((value / maxValue) * 100)) : 0;
                          const goalPaceHeight =
                            showGoalPace && day.goalPaceRevenue != null
                              ? Math.max(4, Math.min(100, Math.round((day.goalPaceRevenue / maxValue) * 100)))
                              : null;
                          const targetUrl = mode === "booked" ? day.bookedUrl : day.collectedUrl;
                          const showTick = day.dayOfMonth === 1 || day.dayOfMonth === chart.days.length || day.dayOfMonth % 5 === 0;
                          return (
                            <Link
                              key={day.date}
                              to={targetUrl}
                              className="group flex min-w-[18px] flex-1 flex-col items-center justify-end gap-2"
                              aria-label={`Open ${mode} revenue records for ${formatDateLabel(day.date, "MMM d")}`}
                            >
                              <div className="relative flex h-56 w-full items-end rounded-t-[10px]">
                                {goalPaceHeight != null ? (
                                  <div
                                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-400/70"
                                    style={{ bottom: `${goalPaceHeight}%` }}
                                    aria-hidden="true"
                                  />
                                ) : null}
                                <div
                                  className={cn(
                                    "w-full rounded-t-[10px] transition-all group-hover:opacity-85",
                                    mode === "booked" ? "bg-[var(--color-chart-1)]" : "bg-[var(--color-chart-2)]",
                                    value === 0 ? "bg-slate-200/70" : null
                                  )}
                                  style={{ height: `${barHeight}%` }}
                                  aria-label={`${mode} revenue for day ${day.dayOfMonth}: ${formatDashboardCurrency(value)}`}
                                />
                              </div>
                              <div className="h-4 text-[10px] text-muted-foreground">{showTick ? day.dayOfMonth : ""}</div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", mode === "booked" ? "bg-[var(--color-chart-1)]" : "bg-[var(--color-chart-2)]")} />
                  {mode === "booked" ? "Booked revenue" : "Collected revenue"}
                </span>
                {chart.goalAmount != null ? <span>Monthly goal: {formatDashboardCurrency(chart.goalAmount)}</span> : null}
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
    bookings.depositsDueAmount === 0 &&
    bookings.funnel.length === 0;
  const funnelLinks: Record<string, string> = {
    new_leads: "/leads",
    quoted: "/quotes?tab=followup",
    booked: bookings.links.bookingsThisWeek,
    completed: "/jobs",
    paid: "/invoices?tab=paid",
  };
  const depositCoverageBase = bookings.depositsCollectedAmount + bookings.depositsDueAmount;
  const depositCoveragePercent =
    depositCoverageBase > 0 ? Math.max(0, Math.min(100, Math.round((bookings.depositsCollectedAmount / depositCoverageBase) * 100))) : null;
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
    <Card>
      <CardHeader>
        <CardTitle>Bookings Overview</CardTitle>
        <CardDescription>Booking volume, quote conversion, and deposit pressure in one quick business read.</CardDescription>
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
            <div className="grid gap-2 sm:grid-cols-2">
              {stats.map((stat) => (
                <Link
                  key={stat.label}
                  to={stat.href}
                  className="rounded-[1rem] border border-border/70 bg-white/80 px-3 py-3 transition-colors hover:border-orange-200 hover:bg-orange-50/60"
                  aria-label={`Open ${stat.label.toLowerCase()} details`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{stat.detail}</p>
                    </div>
                    <p className="shrink-0 text-lg font-semibold tracking-tight text-slate-950">{stat.value}</p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="rounded-[1rem] border border-border/70 bg-white/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Deposit coverage</p>
                  <p className="mt-1 text-sm text-muted-foreground">Collected deposits against upcoming deposit pressure.</p>
                </div>
                {depositCoveragePercent != null ? <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{depositCoveragePercent}% covered</div> : null}
              </div>
              {depositCoveragePercent != null ? <Progress className="mt-3 h-2" value={depositCoveragePercent} /> : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Link to={bookings.links.depositsCollected} className="flex items-center justify-between gap-3 rounded-[0.95rem] bg-emerald-50/70 px-3 py-3 transition-colors hover:bg-emerald-50" aria-label="Open deposits collected details">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-emerald-700/80">Deposits collected</p>
                    <p className="mt-1 text-xs text-emerald-700/80">Captured on booked work</p>
                  </div>
                  <p className="text-lg font-semibold tracking-tight text-emerald-800">{formatDashboardCurrency(bookings.depositsCollectedAmount)}</p>
                </Link>
                <Link to={bookings.links.depositsDue} className="flex items-center justify-between gap-3 rounded-[0.95rem] bg-orange-50/70 px-3 py-3 transition-colors hover:bg-orange-50" aria-label="Open deposits due details">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-orange-700/80">Deposits due</p>
                    <p className="mt-1 text-xs text-orange-700/80">{bookings.depositsDueCount} appointment{bookings.depositsDueCount === 1 ? "" : "s"} need deposits</p>
                  </div>
                  <p className="text-lg font-semibold tracking-tight text-orange-800">{formatDashboardCurrency(bookings.depositsDueAmount)}</p>
                </Link>
              </div>
            </div>
            {bookings.funnel.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {bookings.funnel.map((stage) => (
                  <Link
                    key={stage.key}
                    to={funnelLinks[stage.key] ?? "/signed-in"}
                    className="rounded-[1rem] border border-border/70 bg-slate-50/80 px-3 py-3 transition-colors hover:border-orange-200 hover:bg-orange-50/60"
                    aria-label={`Open ${stage.label.toLowerCase()} stage`}
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{stage.label}</p>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <p className="text-xl font-semibold tracking-tight text-slate-950">{stage.count}</p>
                      <p className="text-[11px] text-muted-foreground">{stage.value != null ? formatDashboardCompactCurrency(stage.value) : "count only"}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
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
  const [tab, setTab] = useState<BottomPanelTab>("activity");
  if (loading) return <CardLoadingShell title="Business Feed" rows={5} />;
  if (error) return <WidgetErrorState title="Business Feed" error={error} onRetry={onRetry} />;

  const activityItems = snapshot?.recentActivity.items.slice(0, 8) ?? [];
  const receivablesItems = (snapshot?.actionQueue.items ?? []).filter((item) => item.type === "overdue_invoice" || item.type === "deposit_due");
  const followUpItems = (snapshot?.actionQueue.items ?? []).filter((item) => item.type === "uncontacted_lead" || item.type === "quote_follow_up");

  const tabMeta: Array<{ key: BottomPanelTab; label: string; icon: typeof History; count: number }> = [
    { key: "activity", label: "Recent Activity", icon: History, count: activityItems.length },
    { key: "receivables", label: "Unpaid Invoices / Deposits Due", icon: CircleDollarSign, count: receivablesItems.length },
    { key: "follow_up", label: "Lead / Quote follow-up", icon: Inbox, count: followUpItems.length },
  ];
  const availableTabs = tabMeta.filter((item) => item.count > 0);
  const activeTab = availableTabs.some((item) => item.key === tab) ? tab : availableTabs[0]?.key ?? "activity";

  if (availableTabs.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Feed</CardTitle>
        <CardDescription>Recent business changes, money follow-up, and sales follow-up without extra dashboard clutter.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3">
          {availableTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-[1rem] border px-3 py-2.5 text-sm font-medium transition-colors",
                activeTab === item.key ? "border-slate-900 bg-slate-900 text-white" : "border-border/70 bg-white text-foreground"
              )}
              aria-pressed={activeTab === item.key}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>

        {activeTab === "activity" ? (
          activityItems.length === 0 ? (
            <EmptyState icon={History} title="No activity yet" description="Appointments, payments, and quote changes will show here as the business runs." />
          ) : (
            <div className="overflow-hidden rounded-[1rem] border border-border/70 bg-white/80">
              {activityItems.map((item) => (
                <div key={item.id} className="border-b border-border/60 p-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {item.url ? (
                        <Link to={item.url} className="font-semibold text-slate-950 hover:text-orange-700">
                          {item.label}
                        </Link>
                      ) : (
                        <p className="font-semibold text-slate-950">{item.label}</p>
                      )}
                      {item.detail ? <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p> : null}
                    </div>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(item.occurredAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === "receivables" ? (
          receivablesItems.length === 0 ? (
            <EmptyState icon={Landmark} title="No overdue balances or deposit misses" description="Overdue invoices and missing deposits will surface here when they need attention." />
          ) : (
            <div className="overflow-hidden rounded-[1rem] border border-border/70 bg-white/80">
              {receivablesItems.map((item) => (
                <Link key={item.id} to={item.ctaUrl} className="block border-b border-border/60 p-3 transition-colors last:border-b-0 hover:bg-orange-50/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{item.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                    </div>
                    {item.amountAtRisk != null ? <Badge variant="outline">{formatDashboardCurrency(item.amountAtRisk)}</Badge> : null}
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : followUpItems.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No lead or quote follow-up gaps" description="Leads and quote follow-ups are under control right now." />
        ) : (
          <div className="overflow-hidden rounded-[1rem] border border-border/70 bg-white/80">
            {followUpItems.map((item) => (
              <Link key={item.id} to={item.ctaUrl} className="flex items-start justify-between gap-3 border-b border-border/60 p-3 transition-colors last:border-b-0 hover:bg-orange-50/60">
                <div>
                  <p className="font-semibold text-slate-950">{item.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HomeCompactQuickActions({
  snapshot,
  loading,
  error,
  onRetry,
}: { snapshot?: HomeDashboardSnapshot | null } & WidgetStateProps) {
  if (loading) return <CardLoadingShell title="Quick Actions" rows={2} compact />;
  if (error) return <WidgetErrorState title="Quick Actions" error={error} onRetry={onRetry} />;

  const allowedKeys = new Set(["new_appointment", "new_quote", "new_invoice", "add_client"]);
  const actions = (snapshot?.quickActions ?? []).filter((action) => allowedKeys.has(action.key));

  if (actions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Small secondary shortcuts for the work that still needs a fast path.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action.key} asChild variant={action.key === "new_appointment" ? "default" : "outline"} className="rounded-full">
            <Link to={action.url}>{action.label}</Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}



