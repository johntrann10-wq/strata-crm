import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Plus } from "lucide-react";
import {
  START_HOUR,
  END_HOUR,
  HOUR_HEIGHT,
  TOTAL_HEIGHT,
  TIME_HOURS,
  isSameDay,
  formatHour,
  formatTime,
  getStatusStyle,
  apptLabel,
  type ApptRecord,
  AppointmentBlock,
  StaffWorkloadBar,
  activeDragDurationMs,
} from "./CalendarViews";

interface DayViewProps {
  currentDate: Date;
  appointments: ApptRecord[];
  onSlotClick: (date: Date) => void;
  onApptClick: (apt: ApptRecord) => void;
  isMobileLayout: boolean;
  onReschedule?: (appointmentId: string, newStart: Date, newEnd: Date | null) => void;
  conflictIds?: Set<string>;
}

export function DayView({
  currentDate,
  appointments,
  onSlotClick,
  onApptClick,
  isMobileLayout,
  onReschedule,
  conflictIds,
}: DayViewProps) {
  const [dragOverMinute, setDragOverMinute] = useState<number | null>(null);

  const dayAppts = useMemo(
    () => appointments.filter((a) => isSameDay(new Date(a.startTime), currentDate)),
    [appointments, currentDate]
  );

  const today = useMemo(() => new Date(), []);
  const isToday = isSameDay(currentDate, today);
  const unassignedCount = dayAppts.filter((apt) => !apt.assignedStaffId).length;
  const nowLineTop = useMemo(() => {
    if (!isToday) return null;
    const currentDecimal = today.getHours() + today.getMinutes() / 60;
    if (currentDecimal < START_HOUR || currentDecimal > END_HOUR) return null;
    return (currentDecimal - START_HOUR) * HOUR_HEIGHT;
  }, [isToday, today]);

  useEffect(() => {
    if (isMobileLayout) return;
    const container = document.getElementById("day-scroll-container");
    if (!container) return;
    const now = new Date();
    const currentMinutes = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
    const scrollTop = (currentMinutes / 60) * HOUR_HEIGHT - 140;
    container.scrollTop = Math.max(0, scrollTop);
  }, [isMobileLayout]);

  if (isMobileLayout) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background/95 shadow-sm">
        <div className="border-b border-border/70 bg-white/80 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {currentDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {dayAppts.length} {dayAppts.length === 1 ? "appointment" : "appointments"}
                {unassignedCount > 0 ? ` - ${unassignedCount} unassigned` : ""}
              </p>
            </div>
            <Button size="sm" onClick={() => onSlotClick(currentDate)}>
              <Plus className="mr-2 h-4 w-4" />
              New appointment
            </Button>
          </div>
          {dayAppts.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                {dayAppts.length} booked
              </span>
              {unassignedCount > 0 ? (
                <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                  {unassignedCount} unassigned
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {dayAppts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-6 text-center">
              <CalendarIcon className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-base font-semibold text-foreground">Nothing booked yet</p>
              </div>
              <Button onClick={() => onSlotClick(currentDate)}>
                <Plus className="mr-2 h-4 w-4" />
                New appointment
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {dayAppts.map((apt) => {
                const style = getStatusStyle(apt.status);
                return (
                  <button
                    key={apt.id}
                    type="button"
                    className={cn(
                      "w-full rounded-2xl border bg-white px-4 py-4 text-left shadow-sm transition-all hover:-translate-y-px hover:shadow-md",
                      style.surface,
                      style.text,
                      style.border,
                      conflictIds?.has(apt.id) && "ring-1 ring-rose-300"
                    )}
                    onClick={() => onApptClick(apt)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">{apptLabel(apt)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatTime(new Date(apt.startTime))}
                          {apt.endTime ? ` - ${formatTime(new Date(apt.endTime))}` : ""}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize", style.pill)}>
                        {apt.status.replace("_", " ")}
                      </span>
                    </div>

                    {apt.vehicle ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {[apt.vehicle.year, apt.vehicle.make, apt.vehicle.model].filter(Boolean).join(" ")}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{apt.assignedStaff ? `${apt.assignedStaff.firstName} ${apt.assignedStaff.lastName}` : "Unassigned"}</span>
                      {apt.isMobile ? <span>Mobile</span> : null}
                      {conflictIds?.has(apt.id) ? <span className="font-semibold text-rose-700">Conflict</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const container = document.getElementById("day-scroll-container");
    const scrollTop = container?.scrollTop ?? 0;
    const y = e.clientY - rect.top + scrollTop;
    const totalMinutes = Math.round(((y / HOUR_HEIGHT) * 60) / 15) * 15;
    const hour = START_HOUR + Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const slotDate = new Date(currentDate);
    slotDate.setHours(hour, minute, 0, 0);
    onSlotClick(slotDate);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const container = document.getElementById("day-scroll-container");
    const scrollTop = container?.scrollTop ?? 0;
    const y = e.clientY - rect.top + scrollTop;
    const totalMinutes = Math.round(((y / HOUR_HEIGHT) * 60) / 15) * 15;
    setDragOverMinute(totalMinutes);
  };

  const handleDragLeave = () => {
    setDragOverMinute(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData("appointmentId");
    const origStartTime = e.dataTransfer.getData("origStartTime");
    const origEndTime = e.dataTransfer.getData("origEndTime");

    if (!appointmentId || dragOverMinute === null) {
      setDragOverMinute(null);
      return;
    }

    const hour = START_HOUR + Math.floor(dragOverMinute / 60);
    const minute = dragOverMinute % 60;
    const newStart = new Date(currentDate);
    newStart.setHours(hour, minute, 0, 0);

    let newEnd: Date | null = null;
    if (origStartTime && origEndTime) {
      const origStart = new Date(origStartTime);
      const origEnd = new Date(origEndTime);
      const duration = origEnd.getTime() - origStart.getTime();
      newEnd = new Date(newStart.getTime() + duration);
    }

    setDragOverMinute(null);
    onReschedule?.(appointmentId, newStart, newEnd);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background/95 shadow-sm">
      <div className="border-b border-border/70 bg-white/80 px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {currentDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {dayAppts.length} {dayAppts.length === 1 ? "appointment" : "appointments"}
              {unassignedCount > 0 ? ` - ${unassignedCount} unassigned` : ""}
            </p>
          </div>
          <Button size="sm" onClick={() => onSlotClick(currentDate)}>
            <Plus className="mr-2 h-4 w-4" />
            New appointment
          </Button>
        </div>
        {dayAppts.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
            <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
              {dayAppts.length} booked
            </span>
            {unassignedCount > 0 ? (
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                {unassignedCount} unassigned
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <StaffWorkloadBar appointments={dayAppts} />

      <div id="day-scroll-container" className="flex-1 overflow-y-auto">
        <div
          className="grid grid-cols-[72px_1fr] relative"
          style={{ height: TOTAL_HEIGHT }}
        >
          <div className="relative border-r border-border/60 bg-muted/15">
            {TIME_HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute inset-x-0 border-b border-border/40 px-3"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="relative -top-3 text-[11px] font-medium text-muted-foreground select-none">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          <div
            className="relative cursor-pointer bg-background"
            style={{ height: TOTAL_HEIGHT }}
            onClick={handleColumnClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {TIME_HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-border/35 pointer-events-none"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              />
            ))}

            {Array.from({ length: END_HOUR - START_HOUR }).map((_, index) => (
              <div
                key={`half-${index}`}
                className="absolute inset-x-0 border-t border-dashed border-border/20 pointer-events-none"
                style={{ top: index * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            ))}

            {dragOverMinute !== null ? (
              <div
                className="absolute inset-x-2 rounded-xl border border-primary/35 bg-primary/12 pointer-events-none"
                style={{
                  top: (dragOverMinute / 60) * HOUR_HEIGHT,
                  height: Math.max((activeDragDurationMs / 3600000) * HOUR_HEIGHT, 42),
                }}
              />
            ) : null}

            {nowLineTop != null ? (
              <div
                className="absolute inset-x-0 z-10 pointer-events-none"
                style={{ top: nowLineTop }}
              >
                <div className="flex items-center gap-2">
                  <span className="ml-2 h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm" />
                  <div className="h-px flex-1 bg-rose-400/80" />
                </div>
              </div>
            ) : null}

            {dayAppts.map((apt) => (
              <AppointmentBlock
                key={apt.id}
                apt={apt}
                onClick={() => onApptClick(apt)}
                isConflict={conflictIds?.has(apt.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
