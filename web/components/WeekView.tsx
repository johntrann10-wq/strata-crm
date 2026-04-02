import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getJobPhaseLabel, getJobPhaseTone, hasLaborOnDay, hasPresenceOnDay, isMultiDayJob } from "@/lib/calendarJobSpans";
import {
  START_HOUR,
  END_HOUR,
  HOUR_HEIGHT,
  TOTAL_HEIGHT,
  TIME_HOURS,
  DAY_NAMES,
  isSameDay,
  formatHour,
  getWeekDays,
  type ApptRecord,
  AppointmentBlock,
  StaffWorkloadBar,
  activeDragDurationMs,
} from "./CalendarViews";

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

  const getSnappedTimeFromY = (yOffset: number): { hour: number; minute: number } => {
    const totalMinutesFromStart = (yOffset / HOUR_HEIGHT) * 60;
    const rawHour = Math.floor(totalMinutesFromStart / 60) + START_HOUR;
    const rawMinute = Math.floor(totalMinutesFromStart % 60);
    let snappedMinute = Math.round(rawMinute / 15) * 15;
    let finalHour = rawHour;
    if (snappedMinute >= 60) {
      finalHour += 1;
      snappedMinute = 0;
    }
    finalHour = Math.max(START_HOUR, Math.min(19, finalHour));
    return { hour: finalHour, minute: snappedMinute };
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

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background/95 shadow-sm">
      <div className="sticky top-0 z-10 grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-border/70 bg-background/95 backdrop-blur-sm">
        <div className="border-r border-border/60 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Hours</p>
        </div>
        {weekDays.map((day, di) => {
          const isToday = isSameDay(day, today);
          const bookedCount = appointments.filter((apt) => hasLaborOnDay(apt, day)).length;
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
                  className="absolute flex h-6 items-center gap-1.5 overflow-hidden rounded-full border border-border/60 bg-background/95 px-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground shadow-sm"
                  style={{
                    top: `${laneIndex * 28 + 6}px`,
                    left: `${(startIndex / 7) * 100}%`,
                    width: `${((endIndex - startIndex + 1) / 7) * 100}%`,
                  }}
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", getJobPhaseTone(apt.jobPhase))} />
                  <span className="truncate">{apt.title || apt.client?.lastName || "Job"}</span>
                  <span className="hidden truncate rounded-full bg-muted px-1.5 py-0.5 text-[9px] md:inline-flex">{getJobPhaseLabel(apt.jobPhase)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      <StaffWorkloadBar appointments={appointments} />

      <div id="week-scroll-container" className="flex-1 overflow-y-auto">
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
  );
}
