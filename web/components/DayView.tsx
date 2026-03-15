import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
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

  useEffect(() => {
    if (isMobileLayout) return;
    const container = document.getElementById("day-scroll-container");
    if (!container) return;
    const now = new Date();
    const currentMinutes = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
    const scrollTop = (currentMinutes / 60) * HOUR_HEIGHT - 100;
    container.scrollTop = Math.max(0, scrollTop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isMobileLayout) {
    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto h-full">
        {dayAppts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <CalendarIcon className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground">No appointments today</p>
            <Button onClick={() => onSlotClick(currentDate)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Appointment
            </Button>
          </div>
        ) : (
          dayAppts.map((apt) => (
            <div
              key={apt.id}
              className={cn("rounded-lg p-3 cursor-pointer border", getStatusStyle(apt.status))}
              onClick={() => onApptClick(apt)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{apptLabel(apt)}</span>
                <span className="text-xs px-2 py-0.5 rounded-full border capitalize">
                  {apt.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatTime(new Date(apt.startTime))}
                {apt.endTime ? ` – ${formatTime(new Date(apt.endTime))}` : ""}
              </div>
              {apt.vehicle && (
                <div className="text-xs text-muted-foreground mt-1">
                  {[apt.vehicle.year, apt.vehicle.make, apt.vehicle.model]
                    .filter(Boolean)
                    .join(" ")}
                </div>
              )}
              {apt.assignedStaff && (
                <div className="text-xs text-muted-foreground">
                  {apt.assignedStaff.firstName} {apt.assignedStaff.lastName}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  // Desktop layout
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

  // END_HOUR is used for grid boundary reference
  const _endHour = END_HOUR;
  void _endHour;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <StaffWorkloadBar appointments={dayAppts} />
      <div id="day-scroll-container" className="flex-1 overflow-y-auto">
        <div
          className="grid grid-cols-[56px_1fr] relative"
          style={{ height: TOTAL_HEIGHT }}
        >
          {/* Hour labels column */}
          <div className="relative">
            {TIME_HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start justify-end pr-2"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              >
                <span className="text-xs text-muted-foreground -mt-2 select-none">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* Single day column */}
          <div
            className="relative cursor-pointer"
            style={{ height: TOTAL_HEIGHT }}
            onClick={handleColumnClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Hour grid lines */}
            {TIME_HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-border/40 pointer-events-none"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              />
            ))}

            {/* Drag ghost */}
            {dragOverMinute !== null && (
              <div
                className="absolute left-0 right-0 bg-blue-400/30 border-t-2 border-blue-500 pointer-events-none"
                style={{
                  top: (dragOverMinute / 60) * HOUR_HEIGHT,
                  height: (activeDragDurationMs / 3600000) * HOUR_HEIGHT,
                }}
              />
            )}

            {/* Appointment blocks */}
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