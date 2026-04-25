import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isCalendarBlockAppointment } from "@/lib/calendarBlocks";
import {
  getMultiDayDayKind,
  getMultiDayDayLabel,
  getMultiDayDayTone,
  getJobSpanEnd,
  getJobSpanStart,
  hasLaborOnDay,
  hasPresenceOnDay,
  isMultiDayJob,
} from "@/lib/calendarJobSpans";
import {
  START_HOUR,
  END_HOUR,
  HOUR_HEIGHT,
  TOTAL_HEIGHT,
  TIME_HOURS,
  DAY_NAMES,
  clampSlotMinutes,
  isSameDay,
  formatHour,
  getWeekDays,
  type ApptRecord,
  AppointmentBlock,
  StaffWorkloadBar,
  activeDragDurationMs,
  getCalendarAppointmentAmount,
  getStatusStyle,
} from "./CalendarViews";
import { triggerSelectionFeedback } from "@/lib/nativeInteractions";

interface WeekViewProps {
  currentDate: Date;
  appointments: ApptRecord[];
  onSlotClick: (date: Date) => void;
  onApptClick: (apt: ApptRecord) => void;
  onDayClick?: (date: Date) => void;
  onReschedule?: (appointmentId: string, newStart: Date, newEnd: Date | null) => void;
  conflictIds?: Set<string>;
}

export function WeekView({
  currentDate,
  appointments,
  onSlotClick,
  onApptClick,
  onDayClick,
  onReschedule,
  conflictIds,
}: WeekViewProps) {
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const today = useMemo(() => new Date(), []);
  const [dragOverInfo, setDragOverInfo] = useState<{ dayIndex: number; hour: number; minute: number } | null>(null);
  const [focusedDayIndex, setFocusedDayIndex] = useState(() =>
    Math.max(0, getWeekDays(currentDate).findIndex((day) => isSameDay(day, currentDate)))
  );

  useEffect(() => {
    const container = document.getElementById("week-scroll-container");
    if (container) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const scrollOffset = ((currentHour - START_HOUR) + currentMinute / 60) * HOUR_HEIGHT;
      container.scrollTop = Math.max(0, scrollOffset - 140);
    }
  }, []);

  useEffect(() => {
    const selectedIndex = weekDays.findIndex((day) => isSameDay(day, currentDate));
    setFocusedDayIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [currentDate, weekDays]);

  const getSnappedTimeFromY = (yOffset: number): { hour: number; minute: number } => {
    const clampedMinutes = clampSlotMinutes((yOffset / HOUR_HEIGHT) * 60);
    return {
      hour: START_HOUR + Math.floor(clampedMinutes / 60),
      minute: clampedMinutes % 60,
    };
  };

  const nowLineTop = useMemo(() => {
    if (!weekDays.some((day) => isSameDay(day, today))) return null;
    const currentDecimal = today.getHours() + today.getMinutes() / 60;
    if (currentDecimal < START_HOUR || currentDecimal > 20) return null;
    return (currentDecimal - START_HOUR) * HOUR_HEIGHT;
  }, [today, weekDays]);

  const multiDayJobs = useMemo(
    () => appointments.filter((apt) => isMultiDayJob(apt) && weekDays.some((day) => hasPresenceOnDay(apt, day))),
    [appointments, weekDays]
  );

  const spanLanes = useMemo(() => {
    const lanes: Array<Array<{ apt: ApptRecord; startIndex: number; endIndex: number }>> = [];
    const sorted = [...multiDayJobs].sort(
      (a, b) =>
        weekDays.findIndex((day) => hasPresenceOnDay(a, day)) -
        weekDays.findIndex((day) => hasPresenceOnDay(b, day))
    );
    for (const apt of sorted) {
      const startIndex = weekDays.findIndex((day) => hasPresenceOnDay(apt, day));
      const reverseEndIndex = [...weekDays].reverse().findIndex((day) => hasPresenceOnDay(apt, day));
      const endIndex = reverseEndIndex === -1 ? startIndex : weekDays.length - 1 - reverseEndIndex;
      let laneIndex = 0;
      while (true) {
        const lane = lanes[laneIndex] ?? [];
        const collision = lane.some((entry) => !(endIndex < entry.startIndex || startIndex > entry.endIndex));
        if (!collision) {
          lane.push({ apt, startIndex, endIndex });
          lanes[laneIndex] = lane;
          break;
        }
        laneIndex += 1;
      }
    }
    return lanes.slice(0, 2);
  }, [multiDayJobs, weekDays]);

  const daySummaries = useMemo(
    () => weekDays.map((day) => getWeekDaySummary(day, appointments, conflictIds)),
    [appointments, conflictIds, weekDays]
  );
  const focusedSummary = daySummaries[focusedDayIndex] ?? daySummaries[0];
  const weekTotal = daySummaries.reduce((total, summary) => total + summary.revenue, 0);

  const focusDay = useCallback(
    (index: number) => {
      const day = weekDays[index];
      if (!day) return;
      setFocusedDayIndex(index);
      void triggerSelectionFeedback();
      onDayClick?.(day);
    },
    [onDayClick, weekDays]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background/95 shadow-sm">
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="border-b border-border/70 bg-background/95 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {weekDays[0]?.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {weekDays[6]?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
              <h3 className="mt-1 text-base font-semibold text-foreground">Week view</h3>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">{appointments.length} jobs</p>
              {weekTotal > 0 ? <p>{formatCompactCurrency(weekTotal)}</p> : null}
            </div>
          </div>

          <div className="mt-3">
            <div className="grid grid-cols-7 gap-1">
              {daySummaries.map((summary, index) => {
                const isFocused = index === focusedDayIndex;
                const isCurrentDay = isSameDay(summary.date, today);
                return (
                  <button
                    key={summary.key}
                    type="button"
                    data-week-day-index={index}
                    onClick={() => focusDay(index)}
                    className={cn(
                      "min-w-0 rounded-xl border px-1 py-2 text-center transition-[background-color,border-color,box-shadow,transform] active:scale-[0.985]",
                      isFocused
                        ? "border-primary/35 bg-primary/[0.07] shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                        : "border-border/70 bg-white/92",
                      isCurrentDay && !isFocused && "border-primary/20"
                    )}
                    aria-pressed={isFocused}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {DAY_NAMES[index]}
                      </span>
                      {isCurrentDay ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                    </div>
                    <p className="mt-1 text-base font-semibold leading-none text-foreground">{summary.date.getDate()}</p>
                    <MobileWeekIndicators appointments={summary.items} selected={isFocused} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="app-native-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {focusedSummary ? (
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {focusedSummary.date.toLocaleDateString("en-US", { weekday: "long" })}
                  </p>
                  <h4 className="text-lg font-semibold text-foreground">
                    {focusedSummary.date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                  </h4>
                </div>
                {focusedSummary.revenue > 0 ? (
                  <span className="rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-xs font-semibold text-foreground">
                    {formatCompactCurrency(focusedSummary.revenue)}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <WeekMetric label="Booked" value={focusedSummary.bookedCount} />
                <WeekMetric label="On site" value={focusedSummary.onSiteCount} />
                <WeekMetric label="Conflicts" value={focusedSummary.conflictCount} tone={focusedSummary.conflictCount > 0 ? "danger" : "neutral"} />
              </div>

              {focusedSummary.groups.length > 0 ? (
                <div className="space-y-3">
                  {focusedSummary.groups.map((group) => (
                    <MobileWeekGroup
                      key={group.label}
                      label={group.label}
                      appointments={group.items}
                      day={focusedSummary.date}
                      conflictIds={conflictIds}
                      onOpenAppointment={onApptClick}
                    />
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSlotClick(new Date(focusedSummary.date.getFullYear(), focusedSummary.date.getMonth(), focusedSummary.date.getDate(), START_HOUR, 0, 0, 0))}
                  className="w-full rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm font-medium text-muted-foreground"
                >
                  No jobs scheduled. Tap to add one.
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="hidden min-h-0 flex-1 overflow-x-auto overscroll-x-contain lg:block">
        <div className="flex h-full min-w-[46rem] flex-col lg:min-w-0">
      <div className="sticky top-0 z-10 grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-border/70 bg-background/95 backdrop-blur-sm">
        <div className="border-r border-border/60 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Hours</p>
        </div>
        {weekDays.map((day, di) => {
          const isToday = isSameDay(day, today);
          const bookedCount = appointments.filter((apt) => hasLaborOnDay(apt, day)).length;
          const onSiteCount = appointments.filter(
            (apt) => isMultiDayJob(apt) && hasPresenceOnDay(apt, day) && !hasLaborOnDay(apt, day)
          ).length;
          const dayConflictCount = appointments.filter(
            (apt) => hasLaborOnDay(apt, day) && conflictIds?.has(apt.id)
          ).length;

          return (
            <div
              key={di}
              className={cn(
                "border-r border-border/60 px-3 py-3 text-center last:border-r-0",
                isToday && "bg-primary/[0.045]"
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {DAY_NAMES[di]}
              </p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onDayClick?.(day)}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  aria-label={`Open ${day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
                >
                  <span
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full text-base font-semibold",
                    isToday ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-foreground"
                  )}
                  >
                    {day.getDate()}
                  </span>
                </button>
              </div>
              <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                <span>{bookedCount} booked</span>
                {onSiteCount > 0 ? <span>{onSiteCount} on site</span> : null}
                {dayConflictCount > 0 ? <span className="font-semibold text-rose-700">{dayConflictCount} conflict</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      {spanLanes.length > 0 ? (
        <div className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-border/60 bg-muted/10">
          <div className="border-r border-border/60 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">On site</p>
          </div>
          <div className="relative col-span-7 px-2 py-2" style={{ height: `${spanLanes.length * 28 + 8}px` }}>
            {spanLanes.map((lane, laneIndex) =>
              lane.map(({ apt, startIndex, endIndex }) => (
                <button
                  key={`${apt.id}-span`}
                  type="button"
                  onClick={() => onApptClick(apt)}
                  className="absolute flex h-6 items-center gap-1.5 overflow-hidden rounded-full border border-border/60 bg-background/95 px-2.5 text-left text-[10px] shadow-sm"
                  style={{
                    top: `${laneIndex * 28 + 6}px`,
                    left: `${(startIndex / 7) * 100}%`,
                    width: `${((endIndex - startIndex + 1) / 7) * 100}%`,
                  }}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-white",
                      getMultiDayDayTone(getMultiDayDayKind(apt, weekDays[startIndex] ?? currentDate))
                    )}
                  >
                    On site
                  </span>
                  <span className="truncate font-medium text-foreground">{apt.title || apt.vehicle?.model || apt.client?.lastName || "Job"}</span>
                  <span className="hidden truncate rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground md:inline-flex">
                    {`${getJobSpanStart(apt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} drop-off -> ${getJobSpanEnd(apt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} pickup`}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      <StaffWorkloadBar appointments={appointments} />

      <div id="week-scroll-container" className="app-native-scroll flex-1 overflow-y-auto">
        <div
          className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] relative"
          style={{ height: TOTAL_HEIGHT }}
        >
          <div className="relative border-r border-border/60 bg-muted/15">
            {TIME_HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute inset-x-0 border-b border-border/40 px-3"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="relative -top-3 text-[11px] font-medium text-muted-foreground">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {weekDays.map((day, di) => {
            const dayAppts = appointments.filter((apt) => hasLaborOnDay(apt, day));
            const isTodayColumn = isSameDay(day, today);

          return (
            <div
              key={di}
                className={cn(
                  "relative border-r border-border/60 last:border-r-0",
                  "bg-background hover:bg-muted/10",
                  isTodayColumn && "bg-primary/[0.03]"
                )}
                style={{ height: TOTAL_HEIGHT }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const yOffset = e.clientY - rect.top;
                  const { hour, minute } = getSnappedTimeFromY(yOffset);
                  const clickedDate = new Date(day);
                  clickedDate.setHours(hour, minute, 0, 0);
                  onSlotClick(clickedDate);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const yOffset = e.clientY - rect.top;
                  const { hour, minute } = getSnappedTimeFromY(yOffset);
                  setDragOverInfo({ dayIndex: di, hour, minute });
                }}
                onDragLeave={() => {
                  setDragOverInfo(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const appointmentId = e.dataTransfer.getData("appointmentId");
                  const origStartTime = e.dataTransfer.getData("origStartTime");
                  const origEndTime = e.dataTransfer.getData("origEndTime");
                  if (!appointmentId || !dragOverInfo) {
                    setDragOverInfo(null);
                    return;
                  }
                  const newStart = new Date(weekDays[dragOverInfo.dayIndex]);
                  newStart.setHours(dragOverInfo.hour, dragOverInfo.minute, 0, 0);
                  let newEnd: Date | null = null;
                  if (origStartTime && origEndTime) {
                    const origStart = new Date(origStartTime);
                    const origEnd = new Date(origEndTime);
                    const duration = origEnd.getTime() - origStart.getTime();
                    newEnd = new Date(newStart.getTime() + duration);
                  }
                  setDragOverInfo(null);
                  onReschedule?.(appointmentId, newStart, newEnd);
                }}
            >
                {TIME_HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-b border-border/35 pointer-events-none"
                    style={{
                      top: (hour - START_HOUR) * HOUR_HEIGHT,
                      height: HOUR_HEIGHT,
                    }}
                  />
                ))}

                {Array.from({ length: END_HOUR - START_HOUR }).map((_, index) => (
                  <div
                    key={`half-${index}`}
                    className="absolute inset-x-0 border-b border-dashed border-border/20 pointer-events-none"
                    style={{
                      top: index * HOUR_HEIGHT + HOUR_HEIGHT / 2,
                    }}
                  />
                ))}

                {dragOverInfo && dragOverInfo.dayIndex === di ? (
                  <div
                    className="absolute inset-x-1 rounded-xl border border-primary/35 bg-primary/12 pointer-events-none z-20"
                    style={{
                      top:
                        (dragOverInfo.hour - START_HOUR + dragOverInfo.minute / 60) *
                        HOUR_HEIGHT,
                      height: Math.max((activeDragDurationMs / 3600000) * HOUR_HEIGHT, 42),
                    }}
                  />
                ) : null}

                {isTodayColumn && nowLineTop != null ? (
                  <div
                    className="absolute inset-x-0 z-10 pointer-events-none"
                    style={{ top: nowLineTop }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="ml-1 h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm" />
                      <div className="h-px flex-1 bg-rose-400/80" />
                    </div>
                  </div>
                ) : null}

                {dayAppts.map((apt) => (
                  <AppointmentBlock
                    key={apt.id}
                    apt={apt}
                    dayContext={day}
                    onClick={(event) => {
                      event.stopPropagation();
                      onApptClick(apt);
                    }}
                    isConflict={conflictIds?.has(apt.id)}
                  />
                ))}

              </div>
            );
          })}
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}


type WeekDaySummary = {
  key: string;
  date: Date;
  bookedCount: number;
  onSiteCount: number;
  conflictCount: number;
  revenue: number;
  items: ApptRecord[];
  groups: Array<{ label: string; items: ApptRecord[] }>;
};

function WeekMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-white/92 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold leading-none", tone === "danger" && value > 0 ? "text-rose-700" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}

function MobileWeekIndicators({
  appointments,
  selected,
}: {
  appointments: ApptRecord[];
  selected: boolean;
}) {
  const uniqueAppointments = Array.from(new Map(appointments.map((appointment) => [appointment.id, appointment])).values());

  if (uniqueAppointments.length === 0) {
    return <span className="mt-2 h-4 text-[10px] font-semibold text-muted-foreground">-</span>;
  }

  if (uniqueAppointments.length >= 5) {
    return (
      <span
        className={cn(
          "mt-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none tabular-nums",
          selected ? "bg-primary text-primary-foreground" : "bg-slate-800 text-white"
        )}
        aria-label={`${uniqueAppointments.length} calendar items`}
      >
        {uniqueAppointments.length}
      </span>
    );
  }

  return (
    <span className="mt-2 flex h-5 items-center justify-center gap-0.5" aria-label={`${uniqueAppointments.length} calendar items`}>
      {uniqueAppointments.map((appointment) => {
        const status = getStatusStyle(appointment.status);
        return (
          <span
            key={appointment.id}
            className={cn(
              "block h-1.5 w-1.5 rounded-full",
              isCalendarBlockAppointment(appointment) ? "bg-slate-500" : status.accent
            )}
          />
        );
      })}
    </span>
  );
}

function MobileWeekGroup({
  label,
  appointments,
  day,
  conflictIds,
  onOpenAppointment,
}: {
  label: string;
  appointments: ApptRecord[];
  day: Date;
  conflictIds?: Set<string>;
  onOpenAppointment: (appointment: ApptRecord) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <span className="text-[11px] font-medium text-muted-foreground">{appointments.length}</span>
      </div>
      <div className="space-y-2">
        {appointments.map((appointment) => (
          <MobileWeekAppointmentCard
            key={appointment.id}
            appointment={appointment}
            day={day}
            isConflict={conflictIds?.has(appointment.id)}
            onOpen={() => onOpenAppointment(appointment)}
          />
        ))}
      </div>
    </section>
  );
}

function MobileWeekAppointmentCard({
  appointment,
  day,
  isConflict,
  onOpen,
}: {
  appointment: ApptRecord;
  day: Date;
  isConflict?: boolean;
  onOpen: () => void;
}) {
  const amount = getCalendarAppointmentAmount(appointment);
  const presenceLabel = isMultiDayJob(appointment)
    ? getMultiDayDayLabel(getMultiDayDayKind(appointment, day))
    : null;
  const metaParts: ReactNode[] = [
    getClientLabel(appointment),
    getVehicleLabel(appointment),
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-2xl border bg-white/92 px-3 py-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition-[transform,background-color,border-color] active:scale-[0.985]",
        isConflict ? "border-rose-200 bg-rose-50/70" : "border-border/70"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5 text-foreground">{getAppointmentTitle(appointment)}</p>
          {metaParts.length > 0 ? (
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
              {metaParts.map((part, index) => (
                <span key={index}>
                  {index > 0 ? " - " : null}
                  {part}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        {amount > 0 ? <span className="shrink-0 text-xs font-semibold text-foreground">{formatCompactCurrency(amount)}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {formatAppointmentTimeRange(appointment)}
        </span>
        {presenceLabel ? (
          <span className="rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[10px] font-semibold text-primary">
            {presenceLabel}
          </span>
        ) : null}
        {isConflict ? (
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
            Conflict
          </span>
        ) : null}
      </div>
    </button>
  );
}

function getWeekDaySummary(day: Date, appointments: ApptRecord[], conflictIds?: Set<string>): WeekDaySummary {
  const labor = appointments
    .filter((appointment) => hasLaborOnDay(appointment, day))
    .sort((a, b) => getJobSortTime(a, day) - getJobSortTime(b, day));
  const onSite = appointments
    .filter((appointment) => isMultiDayJob(appointment) && hasPresenceOnDay(appointment, day) && !hasLaborOnDay(appointment, day))
    .sort((a, b) => getJobSortTime(a, day) - getJobSortTime(b, day));
  const timed = labor.filter((appointment) => !isMultiDayJob(appointment) || getMultiDayDayKind(appointment, day) !== "pickup");
  const pickups = labor.filter((appointment) => isMultiDayJob(appointment) && getMultiDayDayKind(appointment, day) === "pickup");
  const groups = [
    { label: "Timed work", items: timed },
    { label: "On site", items: onSite },
    { label: "Pickups", items: pickups },
  ].filter((group) => group.items.length > 0);

  return {
    key: toDayKey(day),
    date: day,
    bookedCount: labor.length,
    onSiteCount: onSite.length,
    conflictCount: labor.filter((appointment) => conflictIds?.has(appointment.id)).length,
    revenue: labor.reduce((total, appointment) => total + getCalendarAppointmentAmount(appointment), 0),
    items: [...labor, ...onSite],
    groups,
  };
}

function getJobSortTime(appointment: ApptRecord, day: Date): number {
  const phaseKind = getMultiDayDayKind(appointment, day);
  const value =
    phaseKind === "pickup"
      ? appointment.pickupReadyTime ?? appointment.expectedCompletionTime ?? appointment.endTime ?? appointment.startTime
      : appointment.jobStartTime ?? appointment.startTime;
  return new Date(value).getTime();
}

function getAppointmentTitle(appointment: ApptRecord): string {
  return appointment.title?.trim() || getVehicleLabel(appointment) || getClientLabel(appointment) || "Appointment";
}

function getClientLabel(appointment: ApptRecord): string {
  return [appointment.client?.firstName, appointment.client?.lastName].filter(Boolean).join(" ").trim();
}

function getVehicleLabel(appointment: ApptRecord): string {
  return [appointment.vehicle?.year, appointment.vehicle?.make, appointment.vehicle?.model].filter(Boolean).join(" ").trim();
}

function formatAppointmentTimeRange(appointment: ApptRecord): string {
  const start = new Date(appointment.startTime);
  const end = appointment.endTime ? new Date(appointment.endTime) : null;
  const startLabel = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (!end) return startLabel;
  const endLabel = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${startLabel} - ${endLabel}`;
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

function toDayKey(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}
