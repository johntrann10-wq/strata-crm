import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
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
  onReschedule?: (appointmentId: string, newStart: Date, newEnd: Date | null) => void;
  conflictIds?: Set<string>;
}

export function WeekView({
  currentDate,
  appointments,
  onSlotClick,
  onApptClick,
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
      container.scrollTop = Math.max(0, scrollOffset - 100);
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
    finalHour = Math.max(START_HOUR, Math.min(END_HOUR - 1, finalHour));
    return { hour: finalHour, minute: snappedMinute };
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header row */}
      <div className="sticky top-0 grid grid-cols-[56px_repeat(7,1fr)] border-b shrink-0 bg-background z-10">
        <div className="border-r" />
        {weekDays.map((day, di) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={di}
              className={cn(
                "py-2 text-center",
                isToday && "bg-primary/5"
              )}
            >
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                {DAY_NAMES[di]}
              </div>
              <div className="mt-1 flex items-center justify-center">
                <span
                  className={cn(
                    "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground"
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Staff workload bar */}
      <StaffWorkloadBar appointments={appointments} />

      {/* Scrollable area */}
      <div id="week-scroll-container" className="flex-1 overflow-y-auto">
        <div
          className="grid grid-cols-[56px_repeat(7,1fr)] relative"
          style={{ height: TOTAL_HEIGHT }}
        >
          {/* Hour label column */}
          <div className="border-r">
            {TIME_HOURS.map((hour) => (
              <div
                key={hour}
                className="border-b border-border/40 flex items-start justify-end pr-2"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="text-xs text-muted-foreground -mt-2">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, di) => {
            const dayAppts = appointments.filter((apt) =>
              isSameDay(new Date(apt.startTime), day)
            );

            return (
              <div
                key={di}
                className="relative border-r"
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
                {/* Hour grid lines */}
                {TIME_HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-b border-border/30 pointer-events-none"
                    style={{
                      top: (hour - START_HOUR) * HOUR_HEIGHT,
                      height: HOUR_HEIGHT,
                    }}
                  />
                ))}

                {/* Drag ghost */}
                {dragOverInfo && dragOverInfo.dayIndex === di && (
                  <div
                    className="absolute inset-x-0 bg-blue-400/30 border-t-2 border-blue-500 pointer-events-none z-20"
                    style={{
                      top:
                        (dragOverInfo.hour - START_HOUR + dragOverInfo.minute / 60) *
                        HOUR_HEIGHT,
                      height: (activeDragDurationMs / 3600000) * HOUR_HEIGHT,
                    }}
                  />
                )}

                {/* Appointments */}
                {dayAppts.map((apt) => (
                  <AppointmentBlock
                    key={apt.id}
                    apt={apt}
                    onClick={() => onApptClick(apt)}
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