import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from "lucide-react";

// ─── Module-level drag duration tracker ──────────────────────────────────────
export let activeDragDurationMs = 3600000;

// ─── Constants ────────────────────────────────────────────────────────────────
export const START_HOUR = 7;
export const END_HOUR = 20;
export const HOUR_HEIGHT = 64;
export const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

// ─── Status Styles ────────────────────────────────────────────────────────────
export const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  pending: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  confirmed: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
  in_progress: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
  "in-progress": { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
  completed: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-300" },
  "no-show": { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
};

export function getStatusStyle(status: string): { bg: string; text: string; border: string } {
  return STATUS_STYLES[status] ?? STATUS_STYLES["scheduled"];
}

// ─── Day / Month Names ────────────────────────────────────────────────────────
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ─── Date Helpers ─────────────────────────────────────────────────────────────
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export function formatTime(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  const min = m.toString().padStart(2, "0");
  return `${hour}:${min} ${ampm}`;
}

export function getMonthGrid(date: Date): Date[][] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startDow = new Date(year, month, 1).getDay();
  const grid: Date[][] = [];
  let day = 1 - startDow;
  for (let row = 0; row < 6; row++) {
    const week: Date[] = [];
    for (let col = 0; col < 7; col++) {
      week.push(new Date(year, month, day));
      day++;
    }
    grid.push(week);
  }
  return grid;
}

export function getWeekDays(date: Date): Date[] {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day;
  });
}

export function getViewRange(
  date: Date,
  view: "month" | "week" | "day"
): { start: Date; end: Date } {
  if (view === "month") {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (view === "week") {
    const days = getWeekDays(date);
    return { start: startOfDay(days[0]), end: endOfDay(days[6]) };
  }
  return { start: startOfDay(date), end: endOfDay(date) };
}

export function getHeaderTitle(date: Date, view: "month" | "week" | "day"): string {
  if (view === "month") {
    return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  }
  if (view === "week") {
    const days = getWeekDays(date);
    const start = days[0];
    const end = days[6];
    if (start.getMonth() === end.getMonth()) {
      return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
    }
    return `${MONTH_NAMES[start.getMonth()]} – ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
  }
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function navigateDate(
  date: Date,
  view: "month" | "week" | "day",
  direction: -1 | 1
): Date {
  const d = new Date(date);
  if (view === "month") {
    d.setMonth(d.getMonth() + direction);
  } else if (view === "week") {
    d.setDate(d.getDate() + direction * 7);
  } else {
    d.setDate(d.getDate() + direction);
  }
  return d;
}

// ─── ApptRecord Type ──────────────────────────────────────────────────────────
export type ApptRecord = {
  id: string;
  title: string | null;
  startTime: string;
  endTime: string | null;
  status: string;
  totalPrice?: number | null;
  isMobile?: boolean | null;
  assignedStaffId?: string | null;
  client: { firstName: string; lastName: string } | null;
  vehicle: { make: string; model: string; year?: number | null } | null;
  assignedStaff: { firstName: string; lastName: string } | null;
};

// ─── detectConflicts ──────────────────────────────────────────────────────────
export function detectConflicts(appointments: ApptRecord[]): {
  staffConflictIds: Set<string>;
  businessConflictIds: Set<string>;
} {
  const staffConflictIds = new Set<string>();
  const businessConflictIds = new Set<string>();

  // Filter out cancelled and no-show appointments — they should never count as conflicts
  const activeAppointments = appointments.filter(
    (apt) => apt.status !== "cancelled" && apt.status !== "no-show" && apt.status !== "completed"
  );

  // Per-staff conflict detection using sweep-line O(n log n)
  const groups = new Map<string, ApptRecord[]>();
  for (const apt of activeAppointments) {
    if (!apt.assignedStaffId) continue;
    if (!groups.has(apt.assignedStaffId)) groups.set(apt.assignedStaffId, []);
    groups.get(apt.assignedStaffId)!.push(apt);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    let maxEndTime = 0;
    let maxEndAppt: ApptRecord | null = null;
    for (const apt of group) {
      const startMs = new Date(apt.startTime).getTime();
      const endMs = apt.endTime ? new Date(apt.endTime).getTime() : startMs + 3600000;
      if (maxEndAppt !== null && startMs < maxEndTime) {
        staffConflictIds.add(apt.id);
        staffConflictIds.add(maxEndAppt.id);
      }
      if (endMs > maxEndTime) {
        maxEndTime = endMs;
        maxEndAppt = apt;
      }
    }
  }

  // Business-level conflict detection for unassigned appointments using sweep-line
  const unassigned = activeAppointments.filter((apt) => !apt.assignedStaffId);
  unassigned.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  {
    let maxEndTime = 0;
    let maxEndAppt: ApptRecord | null = null;
    for (const apt of unassigned) {
      const startMs = new Date(apt.startTime).getTime();
      const endMs = apt.endTime ? new Date(apt.endTime).getTime() : startMs + 3600000;
      if (maxEndAppt !== null && startMs < maxEndTime) {
        businessConflictIds.add(apt.id);
        businessConflictIds.add(maxEndAppt.id);
      }
      if (endMs > maxEndTime) {
        maxEndTime = endMs;
        maxEndAppt = apt;
      }
    }
  }

  return { staffConflictIds, businessConflictIds };
}

// ─── formatDuration ───────────────────────────────────────────────────────────
export function formatDuration(startISO: string, endISO: string | null): string {
  if (!endISO) return "1h";
  const diffMs = new Date(endISO).getTime() - new Date(startISO).getTime();
  const totalMinutes = Math.round(diffMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// ─── staffInitials ────────────────────────────────────────────────────────────
export function staffInitials(staff: { firstName: string; lastName: string } | null): string {
  if (!staff) return "?";
  return `${staff.firstName.charAt(0)}${staff.lastName.charAt(0)}`.toUpperCase();
}

// ─── apptLabel ────────────────────────────────────────────────────────────────
export function apptLabel(apt: ApptRecord): string {
  if (apt.title) return apt.title;
  if (apt.client) return `${apt.client.firstName} ${apt.client.lastName}`;
  return "Appointment";
}

// ─── TIME_HOURS ───────────────────────────────────────────────────────────────
export const TIME_HOURS: number[] = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, i) => START_HOUR + i
);

// ─── Staff color palette ──────────────────────────────────────────────────────
const STAFF_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-teal-500",
  "bg-pink-500",
  "bg-indigo-500",
];

function getStaffColorClass(name: string): string {
  return STAFF_COLORS[name.charCodeAt(0) % 5];
}

// ─── CalendarNav ──────────────────────────────────────────────────────────────
interface CalendarNavProps {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNew?: () => void;
}

export function CalendarNav({ title, onPrev, onNext, onToday, onNew }: CalendarNavProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-background">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={onPrev} aria-label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onNext} aria-label="Next">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday} className="ml-1">
          Today
        </Button>
      </div>
      <h2 className="text-base font-semibold flex items-center gap-1.5">
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        {title}
      </h2>
      {onNew && (
        <Button size="sm" onClick={onNew}>
          <Plus className="h-4 w-4 mr-1" />
          New
        </Button>
      )}
      {!onNew && <div className="w-[88px]" />}
    </div>
  );
}

// ─── AppointmentBlock ─────────────────────────────────────────────────────────
interface AppointmentBlockProps {
  apt: ApptRecord;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (apt: ApptRecord, e: React.DragEvent) => void;
  isConflict?: boolean;
}

export function AppointmentBlock({
  apt,
  onClick,
  draggable: draggableProp,
  onDragStart,
  isConflict,
}: AppointmentBlockProps) {
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const start = new Date(apt.startTime);
  const end = apt.endTime
    ? new Date(apt.endTime)
    : new Date(start.getTime() + 60 * 60 * 1000);

  const startDecimal = Math.max(start.getHours() + start.getMinutes() / 60, START_HOUR);
  const endDecimal = Math.min(end.getHours() + end.getMinutes() / 60, END_HOUR);

  const top = (startDecimal - START_HOUR) * HOUR_HEIGHT;
  const height = Math.max((endDecimal - startDecimal) * HOUR_HEIGHT, 20);

  const style = getStatusStyle(apt.status);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    const durationMs = end.getTime() - start.getTime();
    activeDragDurationMs = durationMs;
    e.dataTransfer.setData("appointmentId", apt.id);
    e.dataTransfer.setData("origStartTime", apt.startTime);
    e.dataTransfer.setData("origEndTime", apt.endTime ?? "");
    e.dataTransfer.setData("durationMs", String(durationMs));
    e.dataTransfer.effectAllowed = "move";
    onDragStart?.(apt, e);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      className={cn(
        "absolute left-1 right-1 rounded px-1.5 py-0.5 border overflow-hidden transition-opacity select-none",
        style.bg,
        style.text,
        style.border,
        isConflict && "border-l-4 border-l-red-500",
        hovered && !isDragging && "opacity-80",
        isDragging ? "opacity-50 cursor-grabbing" : "cursor-grab"
      )}
      style={{ top: `${top}px`, height: `${height}px`, position: "absolute" }}
      title={isConflict ? "⚠ Scheduling conflict" : undefined}
      draggable={draggableProp ?? true}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex items-start justify-between gap-0.5 leading-tight">
        <p className="text-xs font-semibold truncate flex-1">
          {formatTime(start)}
          {apt.isMobile ? " 📍" : ""}
        </p>
        <span className="text-[10px] shrink-0 opacity-70 font-mono">
          {formatDuration(apt.startTime, apt.endTime)}
        </span>
      </div>
      <p className="text-xs leading-tight truncate font-medium">{apptLabel(apt)}</p>
      {height > 48 && apt.vehicle && (
        <p className="text-[10px] leading-tight truncate opacity-70">
          {[apt.vehicle.year, apt.vehicle.make, apt.vehicle.model].filter(Boolean).join(" ")}
        </p>
      )}
      {height > 64 && apt.assignedStaff && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-black/10 text-[9px] font-bold shrink-0">
            {staffInitials(apt.assignedStaff)}
          </span>
          <span className="text-[10px] truncate opacity-70">{apt.assignedStaff.firstName}</span>
        </div>
      )}
      {isConflict && (
        <div style={{ position: "absolute", top: "2px", right: "2px" }} className="text-[10px] leading-none">
          ⚠
        </div>
      )}
    </div>
  );
}

// ─── StaffWorkloadBar ─────────────────────────────────────────────────────────
interface StaffWorkloadBarProps {
  appointments: ApptRecord[];
}

export function StaffWorkloadBar({ appointments }: StaffWorkloadBarProps) {
  const staffMap = useMemo(() => {
    const map = new Map<string, { name: string; bookedMinutes: number }>();
    for (const apt of appointments) {
      if (apt.status === "cancelled" || apt.status === "no-show") continue;
      if (!apt.assignedStaff) continue;
      const id =
        apt.assignedStaffId ??
        `name:${apt.assignedStaff.firstName}${apt.assignedStaff.lastName}`;
      if (!map.has(id)) {
        map.set(id, {
          name: `${apt.assignedStaff.firstName} ${apt.assignedStaff.lastName}`,
          bookedMinutes: 0,
        });
      }
      const startMs = new Date(apt.startTime).getTime();
      const endMs = apt.endTime
        ? new Date(apt.endTime).getTime()
        : startMs + 3600000;
      map.get(id)!.bookedMinutes += (endMs - startMs) / 60000;
    }
    return map;
  }, [appointments]);

  if (staffMap.size === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-b bg-muted/30">
      {Array.from(staffMap.entries()).map(([id, { name, bookedMinutes }]) => {
        const utilization = Math.min(bookedMinutes / 480, 1.0);
        const barColor =
          utilization < 0.5
            ? "bg-green-500"
            : utilization < 0.8
            ? "bg-amber-500"
            : "bg-red-500";
        const dotColor = getStaffColorClass(name);
        const totalMinutes = Math.round(bookedMinutes);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        const formatted = m === 0 ? `${h}h` : `${h}h ${m}m`;
        return (
          <div
            key={id}
            className="flex flex-col min-w-[80px] max-w-[120px] bg-background rounded border px-2 py-1.5 text-xs"
          >
            <div className="flex items-center gap-1 mb-1">
              <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", dotColor)} />
              <span className="truncate font-medium">{name.split(" ")[0]}</span>
              <span className="ml-auto shrink-0 text-muted-foreground font-mono text-[10px]">
                {formatted}
              </span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full", barColor)}
                style={{ width: `${utilization * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ConflictBanner ───────────────────────────────────────────────────────────
interface ConflictBannerProps {
  staffConflictCount: number;
  businessConflictCount: number;
  onDismiss: () => void;
}

export function ConflictBanner({ staffConflictCount, businessConflictCount, onDismiss }: ConflictBannerProps) {
  if (staffConflictCount === 0 && businessConflictCount === 0) return null;
  return (
    <div className="flex items-start justify-between mx-4 mt-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm">
      <div className="flex flex-col gap-1">
        {staffConflictCount > 0 && (
          <span className="text-red-700">
            ⚠ {staffConflictCount} staff conflict{staffConflictCount > 1 ? "s" : ""} — staff member double-booked
          </span>
        )}
        {businessConflictCount > 0 && (
          <span className="text-amber-700">
            ⚠ {businessConflictCount} time slot conflict{businessConflictCount > 1 ? "s" : ""} — overlapping unassigned appointments
          </span>
        )}
      </div>
      <button
        className="ml-3 shrink-0 font-bold hover:opacity-70 text-lg leading-none"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ─── MonthView ────────────────────────────────────────────────────────────────
interface MonthViewProps {
  currentDate: Date;
  appointments: ApptRecord[];
  onDayClick: (date: Date) => void;
  onApptClick: (apt: ApptRecord) => void;
  conflictIds?: Set<string>;
}

export function MonthView({
  currentDate,
  appointments,
  onDayClick,
  onApptClick,
  conflictIds,
}: MonthViewProps) {
  const grid = useMemo(() => getMonthGrid(currentDate), [currentDate]);
  const today = useMemo(() => new Date(), []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-center text-xs font-medium text-muted-foreground py-2"
          >
            {name}
          </div>
        ))}
      </div>

      {/* 6-row month grid */}
      <div className="flex-1 grid grid-rows-6 min-h-0 overflow-hidden">
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0 min-h-0">
            {week.map((day, di) => {
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = isSameDay(day, today);
              const dayAppts = appointments.filter((a) =>
                isSameDay(new Date(a.startTime), day)
              );
              const hasConflict =
                !!conflictIds && dayAppts.some((a) => conflictIds.has(a.id));
              const apptCount = dayAppts.length;

              return (
                <div
                  key={di}
                  className={cn(
                    "border-r last:border-r-0 p-1 cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden flex flex-col",
                    !isCurrentMonth && "opacity-40"
                  )}
                  onClick={() => onDayClick(day)}
                >
                  <div className="relative flex items-center justify-center mb-0.5 shrink-0">
                    <span
                      className={cn(
                        "text-xs w-6 h-6 flex items-center justify-center rounded-full",
                        isToday && "bg-primary text-primary-foreground font-bold"
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {hasConflict && (
                      <span className="absolute right-0 top-0 text-[10px] leading-none text-red-500">
                        ⚠
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5 overflow-hidden">
                    {dayAppts.slice(0, 3).map((apt) => {
                      const s = getStatusStyle(apt.status);
                      return (
                        <div
                          key={apt.id}
                          className={cn(
                            "text-xs px-1 rounded truncate cursor-pointer",
                            s.bg,
                            s.text
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onApptClick(apt);
                          }}
                        >
                          {apptLabel(apt)}
                        </div>
                      );
                    })}
                    {dayAppts.length > 3 && (
                      <div className="text-xs text-muted-foreground px-1">
                        +{dayAppts.length - 3} more
                      </div>
                    )}
                  </div>
                  {apptCount > 0 && (
                    <div className="flex justify-center mt-0.5 shrink-0">
                      <div
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          apptCount <= 2
                            ? "bg-green-400"
                            : apptCount <= 4
                            ? "bg-amber-400"
                            : "bg-red-400"
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Re-exports from separate component files ─────────────────────────────────
export { WeekView } from "./WeekView";
export { DayView } from "./DayView";