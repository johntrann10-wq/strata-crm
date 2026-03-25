import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export let activeDragDurationMs = 3600000;

export const START_HOUR = 7;
export const END_HOUR = 20;
export const HOUR_HEIGHT = 72;
export const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

type StatusStyle = {
  surface: string;
  text: string;
  border: string;
  accent: string;
  pill: string;
};

export const STATUS_STYLES: Record<string, StatusStyle> = {
  scheduled: {
    surface: "bg-amber-50/95",
    text: "text-amber-950",
    border: "border-amber-200/90",
    accent: "bg-amber-500",
    pill: "bg-amber-100 text-amber-800",
  },
  pending: {
    surface: "bg-amber-50/95",
    text: "text-amber-950",
    border: "border-amber-200/90",
    accent: "bg-amber-500",
    pill: "bg-amber-100 text-amber-800",
  },
  confirmed: {
    surface: "bg-sky-50/95",
    text: "text-sky-950",
    border: "border-sky-200/90",
    accent: "bg-sky-500",
    pill: "bg-sky-100 text-sky-800",
  },
  in_progress: {
    surface: "bg-violet-50/95",
    text: "text-violet-950",
    border: "border-violet-200/90",
    accent: "bg-violet-500",
    pill: "bg-violet-100 text-violet-800",
  },
  "in-progress": {
    surface: "bg-violet-50/95",
    text: "text-violet-950",
    border: "border-violet-200/90",
    accent: "bg-violet-500",
    pill: "bg-violet-100 text-violet-800",
  },
  completed: {
    surface: "bg-emerald-50/95",
    text: "text-emerald-950",
    border: "border-emerald-200/90",
    accent: "bg-emerald-500",
    pill: "bg-emerald-100 text-emerald-800",
  },
  cancelled: {
    surface: "bg-slate-100/95",
    text: "text-slate-600",
    border: "border-slate-200/90",
    accent: "bg-slate-400",
    pill: "bg-slate-200 text-slate-700",
  },
  "no-show": {
    surface: "bg-rose-50/95",
    text: "text-rose-950",
    border: "border-rose-200/90",
    accent: "bg-rose-500",
    pill: "bg-rose-100 text-rose-800",
  },
};

export function getStatusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status] ?? STATUS_STYLES.scheduled;
}

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
    return `${MONTH_NAMES[start.getMonth()]} - ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
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

export function detectConflicts(appointments: ApptRecord[]): {
  staffConflictIds: Set<string>;
  businessConflictIds: Set<string>;
} {
  const staffConflictIds = new Set<string>();
  const businessConflictIds = new Set<string>();

  const activeAppointments = appointments.filter(
    (apt) => apt.status !== "cancelled" && apt.status !== "no-show" && apt.status !== "completed"
  );

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

  const unassigned = activeAppointments.filter((apt) => !apt.assignedStaffId);
  unassigned.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
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

  return { staffConflictIds, businessConflictIds };
}

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

export function staffInitials(staff: { firstName: string; lastName: string } | null): string {
  if (!staff) return "?";
  return `${staff.firstName.charAt(0)}${staff.lastName.charAt(0)}`.toUpperCase();
}

export function apptLabel(apt: ApptRecord): string {
  if (apt.title) return apt.title;
  if (apt.client) return `${apt.client.firstName} ${apt.client.lastName}`;
  return "Appointment";
}

export const TIME_HOURS: number[] = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, i) => START_HOUR + i
);

const STAFF_COLORS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-pink-500",
  "bg-indigo-500",
];

function getStaffColorClass(name: string): string {
  return STAFF_COLORS[name.charCodeAt(0) % STAFF_COLORS.length];
}

interface CalendarNavProps {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNew?: () => void;
}

export function CalendarNav({ title, onPrev, onNext, onToday, onNew }: CalendarNavProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-2">
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
      <h2 className="flex items-center gap-1.5 text-base font-semibold">
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        {title}
      </h2>
      {onNew ? (
        <Button size="sm" onClick={onNew}>
          <Plus className="mr-1 h-4 w-4" />
          New
        </Button>
      ) : (
        <div className="w-[88px]" />
      )}
    </div>
  );
}

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
  const end = apt.endTime ? new Date(apt.endTime) : new Date(start.getTime() + 60 * 60 * 1000);

  const startDecimal = Math.max(start.getHours() + start.getMinutes() / 60, START_HOUR);
  const endDecimal = Math.min(end.getHours() + end.getMinutes() / 60, END_HOUR);

  const top = (startDecimal - START_HOUR) * HOUR_HEIGHT;
  const height = Math.max((endDecimal - startDecimal) * HOUR_HEIGHT, 42);

  const style = getStatusStyle(apt.status);
  const dense = height < 74;

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
    <button
      type="button"
      className={cn(
        "absolute left-1.5 right-1.5 overflow-hidden rounded-xl border px-2.5 py-2 text-left shadow-sm transition-all select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        style.surface,
        style.text,
        style.border,
        hovered && !isDragging && "shadow-md -translate-y-px",
        isDragging ? "cursor-grabbing opacity-50" : "cursor-grab",
        isConflict && "ring-1 ring-rose-300"
      )}
      style={{ top: `${top}px`, height: `${height}px`, position: "absolute" }}
      title={isConflict ? "Scheduling conflict" : undefined}
      draggable={draggableProp ?? true}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full", style.accent)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={cn("truncate font-semibold", dense ? "text-[11px]" : "text-xs")}>{apptLabel(apt)}</p>
              <p className={cn("truncate opacity-80", dense ? "text-[10px]" : "text-[11px]")}>
                {formatTime(start)}
                {apt.endTime ? ` - ${formatTime(end)}` : ""}
              </p>
            </div>
            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 font-medium", style.pill, dense ? "text-[9px]" : "text-[10px]")}>
              {formatDuration(apt.startTime, apt.endTime)}
            </span>
          </div>

          {!dense && apt.vehicle ? (
            <p className="mt-1 truncate text-[11px] opacity-75">
              {[apt.vehicle.year, apt.vehicle.make, apt.vehicle.model].filter(Boolean).join(" ")}
            </p>
          ) : null}

          {height > 92 ? (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="truncate text-[10px] uppercase tracking-[0.12em] opacity-60">
                {apt.assignedStaff ? `${apt.assignedStaff.firstName} ${apt.assignedStaff.lastName}` : "Unassigned"}
              </p>
              {apt.isMobile ? <span className="text-[10px] font-medium opacity-70">Mobile</span> : null}
            </div>
          ) : null}
        </div>
        {isConflict ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" /> : null}
      </div>
    </button>
  );
}

interface StaffWorkloadBarProps {
  appointments: ApptRecord[];
}

export function StaffWorkloadBar({ appointments }: StaffWorkloadBarProps) {
  const staffMap = useMemo(() => {
    const map = new Map<string, { name: string; bookedMinutes: number; appointmentCount: number }>();
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
          appointmentCount: 0,
        });
      }
      const startMs = new Date(apt.startTime).getTime();
      const endMs = apt.endTime ? new Date(apt.endTime).getTime() : startMs + 3600000;
      const staff = map.get(id)!;
      staff.bookedMinutes += (endMs - startMs) / 60000;
      staff.appointmentCount += 1;
    }
    return map;
  }, [appointments]);

  if (staffMap.size === 0) return null;

  return (
    <div className="border-b border-border/70 bg-muted/25 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Team load</p>
          <p className="text-xs text-muted-foreground">See booked time before reassigning or stacking work.</p>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from(staffMap.entries()).map(([id, { name, bookedMinutes, appointmentCount }]) => {
          const utilization = Math.min(bookedMinutes / 480, 1.0);
          const barColor =
            utilization < 0.5
              ? "bg-emerald-500"
              : utilization < 0.8
                ? "bg-amber-500"
                : "bg-rose-500";
          const dotColor = getStaffColorClass(name);
          const totalMinutes = Math.round(bookedMinutes);
          const h = Math.floor(totalMinutes / 60);
          const m = totalMinutes % 60;
          const formatted = m === 0 ? `${h}h` : `${h}h ${m}m`;

          return (
            <div
              key={id}
              className="min-w-[210px] rounded-xl border border-border/70 bg-background/95 px-3 py-3 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm",
                    dotColor
                  )}
                >
                  {name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {appointmentCount} {appointmentCount === 1 ? "booking" : "bookings"} booked
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">{formatted}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", barColor)}
                  style={{ width: `${Math.max(utilization * 100, 8)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ConflictBannerProps {
  staffConflictCount: number;
  businessConflictCount: number;
  onDismiss: () => void;
}

export function ConflictBanner({
  staffConflictCount,
  businessConflictCount,
  onDismiss,
}: ConflictBannerProps) {
  if (staffConflictCount === 0 && businessConflictCount === 0) return null;

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-rose-100 p-2 text-rose-700">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-rose-900">Scheduling conflicts need review</p>
            <div className="mt-1 space-y-1 text-xs text-rose-800">
              {staffConflictCount > 0 ? (
                <p>
                  {staffConflictCount} staff conflict{staffConflictCount > 1 ? "s" : ""} from double-booked technicians.
                </p>
              ) : null}
              {businessConflictCount > 0 ? (
                <p>
                  {businessConflictCount} unassigned overlap{businessConflictCount > 1 ? "s" : ""} still need a slot or owner.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

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
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-background/95 shadow-sm sm:rounded-[24px]">
      <div className="grid grid-cols-7 border-b border-border/70 bg-muted/20 px-2 py-2">
        {DAY_NAMES.map((name) => (
          <div key={name} className="px-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {name}
          </div>
        ))}
      </div>

      <div className="grid min-w-0 flex-1 grid-rows-6 overflow-auto">
        {grid.map((week, wi) => (
          <div key={wi} className="grid min-h-0 grid-cols-7 border-b border-border/60 last:border-b-0">
            {week.map((day, di) => {
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = isSameDay(day, today);
              const dayAppts = appointments.filter((a) => isSameDay(new Date(a.startTime), day));
              const hasConflict = !!conflictIds && dayAppts.some((a) => conflictIds.has(a.id));

              return (
                <button
                  key={di}
                  type="button"
                  className={cn(
                    "group flex min-h-0 flex-col border-r border-border/60 px-2 py-2 text-left transition-colors last:border-r-0",
                    "hover:bg-muted/35",
                    !isCurrentMonth && "bg-muted/10 text-muted-foreground",
                    isToday && "bg-primary/[0.045]"
                  )}
                  onClick={() => onDayClick(day)}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                        isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <div className="flex items-center gap-2">
                      {dayAppts.length > 0 ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {dayAppts.length}
                        </span>
                      ) : null}
                      {hasConflict ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> : null}
                    </div>
                  </div>

                  <div className="space-y-1 overflow-hidden">
                    {dayAppts.slice(0, 3).map((apt) => {
                      const status = getStatusStyle(apt.status);
                      return (
                        <button
                          key={apt.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left shadow-sm transition-colors",
                            "hover:opacity-95",
                            status.surface,
                            status.text,
                            status.border
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onApptClick(apt);
                          }}
                        >
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", status.accent)} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-semibold">{apptLabel(apt)}</p>
                            <p className="truncate text-[10px] opacity-75">
                              {formatTime(new Date(apt.startTime))}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                    {dayAppts.length > 3 ? (
                      <p className="px-1 text-[11px] font-medium text-muted-foreground">
                        +{dayAppts.length - 3} more
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export { WeekView } from "./WeekView";
export { DayView } from "./DayView";
