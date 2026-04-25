import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  getActiveCalendarAppointments,
  getCalendarDaySnapshot,
  getJobSpanStart,
  getOverviewCalendarAppointments,
  getHistoricalCalendarAppointments,
  getVisibleCalendarAppointments,
  getJobSpanEnd,
  getWorkEnd,
  getWorkStart,
  hasLaborOnDay,
  hasPresenceOnDay,
  isMultiDayJob,
} from "@/lib/calendarJobSpans";
import { getCalendarBlockLabel, isCalendarBlockAppointment, isFullDayCalendarBlock } from "@/lib/calendarBlocks";
import { getDisplayedAppointmentAmount } from "@/lib/appointmentAmounts";
import { AlertTriangle, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerImpactFeedback } from "@/lib/nativeInteractions";
import {
  getMultiDayDayKind,
  getMultiDayDayLabel,
  getMultiDayDayShortLabel,
  getMultiDayDayTone,
} from "@/lib/calendarJobSpans";

export let activeDragDurationMs = 3600000;

export const START_HOUR = 7;
export const END_HOUR = 20;
export const HOUR_HEIGHT = 72;
export const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
export const SLOT_INTERVAL_MINUTES = 15;
export const MAX_SLOT_OFFSET_MINUTES = (END_HOUR - START_HOUR) * 60 - SLOT_INTERVAL_MINUTES;

export function clampSlotMinutes(totalMinutesFromStart: number): number {
  const snapped = Math.round(totalMinutesFromStart / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;
  return Math.max(0, Math.min(MAX_SLOT_OFFSET_MINUTES, snapped));
}

export function buildSlotDate(baseDate: Date, totalMinutesFromStart: number): Date {
  const clampedMinutes = clampSlotMinutes(totalMinutesFromStart);
  const slotDate = new Date(baseDate);
  slotDate.setHours(
    START_HOUR + Math.floor(clampedMinutes / 60),
    clampedMinutes % 60,
    0,
    0
  );
  return slotDate;
}

type StatusStyle = {
  surface: string;
  text: string;
  border: string;
  accent: string;
  pill: string;
};

export const STATUS_STYLES: Record<string, StatusStyle> = {
  scheduled: {
    surface: "bg-white",
    text: "text-slate-900",
    border: "border-amber-200/90",
    accent: "bg-amber-500",
    pill: "bg-amber-100 text-amber-800",
  },
  pending: {
    surface: "bg-white",
    text: "text-slate-900",
    border: "border-amber-200/90",
    accent: "bg-amber-500",
    pill: "bg-amber-100 text-amber-800",
  },
  confirmed: {
    surface: "bg-white",
    text: "text-slate-900",
    border: "border-sky-200/90",
    accent: "bg-sky-500",
    pill: "bg-sky-100 text-sky-800",
  },
  in_progress: {
    surface: "bg-white",
    text: "text-slate-900",
    border: "border-violet-200/90",
    accent: "bg-violet-500",
    pill: "bg-violet-100 text-violet-800",
  },
  "in-progress": {
    surface: "bg-white",
    text: "text-slate-900",
    border: "border-violet-200/90",
    accent: "bg-violet-500",
    pill: "bg-violet-100 text-violet-800",
  },
  completed: {
    surface: "bg-white",
    text: "text-slate-900",
    border: "border-emerald-200/90",
    accent: "bg-emerald-500",
    pill: "bg-emerald-100 text-emerald-800",
  },
  cancelled: {
    surface: "bg-slate-50/95",
    text: "text-slate-600",
    border: "border-slate-200/90",
    accent: "bg-slate-400",
    pill: "bg-slate-200 text-slate-700",
  },
  "no-show": {
    surface: "bg-white",
    text: "text-slate-900",
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

const PRESSABLE_CARD_STYLE: CSSProperties = {
  WebkitTouchCallout: "none",
  WebkitTapHighlightColor: "transparent",
  WebkitUserSelect: "none",
  userSelect: "none",
  touchAction: "manipulation",
};

function useLongPressActions(onOpen: () => void) {
  const timerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null && typeof window !== "undefined") {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const begin = useCallback((event?: { touches?: ArrayLike<{ clientX: number; clientY: number }> }) => {
    if (typeof window === "undefined") return;
    clearTimer();
    longPressTriggeredRef.current = false;
    const firstTouch = event?.touches?.[0];
    touchStartRef.current = firstTouch ? { x: firstTouch.clientX, y: firstTouch.clientY } : null;
    timerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      void triggerImpactFeedback("medium");
      onOpen();
    }, 420);
  }, [clearTimer, onOpen]);

  const consumeIfLongPress = useCallback((event: { preventDefault(): void; stopPropagation(): void }) => {
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      event.stopPropagation();
      longPressTriggeredRef.current = false;
      clearTimer();
      touchStartRef.current = null;
      return true;
    }
    clearTimer();
    touchStartRef.current = null;
    return false;
  }, [clearTimer]);

  const handleTouchMove = useCallback((event: { touches?: ArrayLike<{ clientX: number; clientY: number }> }) => {
    const firstTouch = event.touches?.[0];
    const start = touchStartRef.current;
    if (!firstTouch || !start) return;
    const distance = Math.hypot(firstTouch.clientX - start.x, firstTouch.clientY - start.y);
    if (distance > 10) {
      clearTimer();
      touchStartRef.current = null;
    }
  }, [clearTimer]);

  const openContextMenu = useCallback((event: { preventDefault(): void }) => {
    event.preventDefault();
    longPressTriggeredRef.current = true;
    void triggerImpactFeedback("medium");
    onOpen();
  }, [onOpen]);

  return {
    begin,
    clearTimer,
    consumeIfLongPress,
    handleTouchMove,
    openContextMenu,
  };
}

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

export function getMonthGrid(
  date: Date,
  options?: { trimTrailingFullNextMonthWeek?: boolean }
): Date[][] {
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
  if (options?.trimTrailingFullNextMonthWeek) {
    while (
      grid.length > 0 &&
      !grid[grid.length - 1]?.some(
        (gridDay) => gridDay.getFullYear() === year && gridDay.getMonth() === month
      )
    ) {
      grid.pop();
    }
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
    const originalDay = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + direction);
    const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(originalDay, lastDayOfTargetMonth));
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
  internalNotes?: string | null;
  jobStartTime?: string | null;
  expectedCompletionTime?: string | null;
  pickupReadyTime?: string | null;
  vehicleOnSite?: boolean | null;
  jobPhase?: string | null;
  status: string;
  subtotal?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  applyTax?: boolean | null;
  adminFeeRate?: number | null;
  adminFeeAmount?: number | null;
  applyAdminFee?: boolean | null;
  totalPrice?: number | null;
  isMobile?: boolean | null;
  assignedStaffId?: string | null;
  client: { id?: string | null; firstName: string; lastName: string; phone?: string | null; email?: string | null } | null;
  vehicle: { make: string; model: string; year?: number | null } | null;
  assignedStaff: { firstName: string; lastName: string } | null;
};

export function detectConflicts(
  appointments: ApptRecord[],
  appointmentCapacityPerSlot = 1
): {
  staffConflictIds: Set<string>;
  businessConflictIds: Set<string>;
} {
  const staffConflictIds = new Set<string>();
  const businessConflictIds = new Set<string>();
  const capacity = Math.max(1, Math.floor(appointmentCapacityPerSlot || 1));

  const activeAppointments = appointments.filter(
    (apt) =>
      apt.status !== "cancelled" &&
      apt.status !== "no-show" &&
      apt.status !== "completed" &&
      !isCalendarBlockAppointment(apt)
  );

  const groups = new Map<string, ApptRecord[]>();
  for (const apt of activeAppointments) {
    if (!apt.assignedStaffId) continue;
    if (!groups.has(apt.assignedStaffId)) groups.set(apt.assignedStaffId, []);
    groups.get(apt.assignedStaffId)!.push(apt);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const active: Array<{ appointment: ApptRecord; endMs: number }> = [];
    for (const apt of group) {
      const startMs = new Date(apt.startTime).getTime();
      const endMs = apt.endTime ? new Date(apt.endTime).getTime() : startMs + 3600000;
      for (let i = active.length - 1; i >= 0; i -= 1) {
        if (active[i]!.endMs <= startMs) active.splice(i, 1);
      }
      if (active.length >= capacity) {
        staffConflictIds.add(apt.id);
        for (const entry of active) staffConflictIds.add(entry.appointment.id);
      }
      active.push({ appointment: apt, endMs });
    }
  }

  const unassigned = activeAppointments.filter((apt) => !apt.assignedStaffId);
  unassigned.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const active: Array<{ appointment: ApptRecord; endMs: number }> = [];
  for (const apt of unassigned) {
    const startMs = new Date(apt.startTime).getTime();
    const endMs = apt.endTime ? new Date(apt.endTime).getTime() : startMs + 3600000;
    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (active[i]!.endMs <= startMs) active.splice(i, 1);
    }
    if (active.length >= capacity) {
      businessConflictIds.add(apt.id);
      for (const entry of active) businessConflictIds.add(entry.appointment.id);
    }
    active.push({ appointment: apt, endMs });
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

export function formatStatusLabel(status: string | null | undefined): string {
  return String(status ?? "scheduled")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function staffInitials(staff: { firstName: string; lastName: string } | null): string {
  if (!staff) return "?";
  return `${staff.firstName.charAt(0)}${staff.lastName.charAt(0)}`.toUpperCase();
}

export function apptLabel(apt: ApptRecord): string {
  if (isCalendarBlockAppointment(apt)) return getCalendarBlockLabel(apt);
  if (apt.title) return apt.title;
  if (apt.client) return `${apt.client.firstName} ${apt.client.lastName}`;
  return "Appointment";
}

export function apptClientLabel(apt: ApptRecord): string {
  if (!apt.client) return "Internal";
  return [apt.client.firstName, apt.client.lastName].filter(Boolean).join(" ").trim() || "Client";
}

export function apptVehicleLabel(apt: ApptRecord): string {
  if (!apt.vehicle) return "No vehicle";
  return [apt.vehicle.year, apt.vehicle.make, apt.vehicle.model].filter(Boolean).join(" ").trim() || "Vehicle";
}

function toMoneyNumber(value: number | string | null | undefined): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
}

export function getCalendarAppointmentAmount(apt: ApptRecord): number {
  return getDisplayedAppointmentAmount(apt);
}

export function getCalendarDayRevenue(appointments: ApptRecord[], date: Date): number {
  const dayKey = toDayKey(date);

  return getOverviewCalendarAppointments(appointments).reduce((total, appointment) => {
    return toDayKey(getJobSpanStart(appointment)) === dayKey
      ? total + getCalendarAppointmentAmount(appointment)
      : total;
  }, 0);
}

export function apptMoneyLabel(apt: ApptRecord): string | null {
  const amount = getCalendarAppointmentAmount(apt);
  if (amount <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function apptStageLabel(apt: ApptRecord, dayContext?: Date): string {
  const multiDayKind = dayContext ? getMultiDayDayKind(apt, dayContext) : null;
  if (multiDayKind) return getMultiDayDayLabel(multiDayKind);
  return formatStatusLabel(apt.status);
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
  dayContext?: Date;
  onClick: () => void;
  onLongPress?: (apt: ApptRecord) => void;
  isSelected?: boolean;
  draggable?: boolean;
  onDragStart?: (apt: ApptRecord, e: React.DragEvent) => void;
  isConflict?: boolean;
  leftCss?: string;
  widthCss?: string;
  zIndex?: number;
}

export function AppointmentBlock({
  apt,
  dayContext,
  onClick,
  onLongPress,
  isSelected = false,
  draggable: draggableProp,
  onDragStart,
  isConflict,
  leftCss,
  widthCss,
  zIndex,
}: AppointmentBlockProps) {
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const openActions = useCallback(() => {
    onLongPress?.(apt);
  }, [apt, onLongPress]);
  const longPress = useLongPressActions(openActions);

  const start = new Date(apt.startTime);
  const end = apt.endTime ? new Date(apt.endTime) : new Date(start.getTime() + 60 * 60 * 1000);

  const startDecimal = Math.max(start.getHours() + start.getMinutes() / 60, START_HOUR);
  const endDecimal = Math.min(end.getHours() + end.getMinutes() / 60, END_HOUR);

  const top = (startDecimal - START_HOUR) * HOUR_HEIGHT;
  const height = Math.max((endDecimal - startDecimal) * HOUR_HEIGHT, 42);

  const style = getStatusStyle(apt.status);
  const isBlock = isCalendarBlockAppointment(apt);
  const multiDayKind = dayContext ? getMultiDayDayKind(apt, dayContext) : null;
  const multiDayLabel = getMultiDayDayLabel(multiDayKind);
  const moneyLabel = apptMoneyLabel(apt);
  const customerLabel = apptClientLabel(apt);
  const vehicleLabel = apptVehicleLabel(apt);
  const dense = height < 74;
  const constrainedWidth = Boolean(widthCss);
  const narrow = constrainedWidth;
  const ultraNarrow = false;

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
        "absolute overflow-hidden rounded-xl border bg-white/98 px-2.5 py-2 text-left shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all select-none [&_*]:select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        isBlock ? "border-slate-300/90 bg-slate-100/95 text-slate-800" : style.surface,
        isBlock ? "" : style.text,
        isBlock ? "" : style.border,
        isSelected && "ring-2 ring-primary/45 shadow-md",
        narrow && "px-2 py-1.5",
        hovered && !isDragging && "shadow-md -translate-y-px",
        isDragging ? "cursor-grabbing opacity-50" : "cursor-grab",
        isConflict && "ring-1 ring-rose-300"
      )}
      title={isConflict ? "Scheduling conflict" : undefined}
      aria-haspopup={onLongPress ? "dialog" : undefined}
      draggable={draggableProp ?? true}
      onClick={(event) => {
        if (longPress.consumeIfLongPress(event)) return;
        event.stopPropagation();
        onClick();
      }}
      onSelectStart={(event) => event.preventDefault()}
      onTouchStart={longPress.begin}
      onTouchEnd={longPress.consumeIfLongPress}
      onTouchCancel={longPress.clearTimer}
      onTouchMove={longPress.handleTouchMove}
      onContextMenu={onLongPress ? longPress.openContextMenu : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        position: "absolute",
        left: leftCss ?? "6px",
        width: widthCss ?? undefined,
        right: widthCss ? undefined : "6px",
        zIndex: zIndex ?? undefined,
        ...PRESSABLE_CARD_STYLE,
      }}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full", isBlock ? "bg-slate-500" : style.accent)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={cn("truncate font-semibold", dense || narrow ? "text-[10px]" : "text-[12px]")}>{apptLabel(apt)}</p>
              {!ultraNarrow ? (
                <p className={cn("truncate text-muted-foreground", dense || narrow ? "text-[9px]" : "text-[11px]")}>
                  {customerLabel}
                </p>
              ) : null}
              {!dense && !narrow ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{vehicleLabel}</p>
              ) : null}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 font-medium",
                isBlock ? "bg-slate-200 text-slate-700" : style.pill,
                dense || narrow ? "text-[8px]" : "text-[10px]"
              )}
            >
              {isBlock ? (isFullDayCalendarBlock(apt) ? "All day" : "Blocked") : moneyLabel ?? formatDuration(apt.startTime, apt.endTime)}
            </span>
          </div>

          <div className={cn("mt-1.5 flex items-center justify-between gap-2", height <= 92 && "mt-1")}>
            <p className={cn("truncate text-muted-foreground", dense || narrow ? "text-[8px]" : "text-[10px]")}>
              {formatTime(start)}
              {apt.endTime ? ` - ${formatTime(end)}` : ""}
            </p>
            {!isBlock ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-1.5 py-0.5 font-medium text-muted-foreground",
                  dense || narrow ? "text-[8px]" : "text-[10px]"
                )}
              >
                {multiDayKind ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", getMultiDayDayTone(multiDayKind))} /> : null}
                <span className="truncate">{multiDayKind ? multiDayLabel : formatStatusLabel(apt.status)}</span>
              </span>
            ) : null}
          </div>

          {height > 110 ? (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className={cn("truncate uppercase tracking-[0.12em] text-muted-foreground", narrow ? "text-[8px]" : "text-[10px]")}>
                {apt.assignedStaff ? `${apt.assignedStaff.firstName} ${apt.assignedStaff.lastName}` : "Unassigned"}
              </p>
              {apt.isMobile ? <span className={cn("font-medium text-muted-foreground", narrow ? "text-[8px]" : "text-[10px]")}>Mobile</span> : null}
            </div>
          ) : null}
        </div>
        {isConflict ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" /> : null}
      </div>
    </button>
  );
}

const MONTH_DAY_OVERFLOW_BADGE_THRESHOLD = 5;

function DayStatusDots({ appointments }: { appointments: ApptRecord[] }) {
  if (appointments.length === 0) return null;

  const orderedAppointments = [...appointments].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  const countLabel = orderedAppointments.some((apt) => isCalendarBlockAppointment(apt))
    ? `${appointments.length} item${appointments.length === 1 ? "" : "s"}`
    : `${appointments.length} appt${appointments.length === 1 ? "" : "s"}`;

  return (
    <div className="pointer-events-none min-w-0 overflow-visible space-y-1 pb-0.5 sm:pb-1">
      <div className="flex min-h-[8px] flex-wrap items-center justify-center gap-0.5 overflow-visible sm:grid sm:min-h-[12px] sm:grid-cols-8 sm:justify-normal sm:gap-1">
        {orderedAppointments.map((apt) => {
          const status = getStatusStyle(apt.status);
          return (
            <span
              key={apt.id}
              className={cn(
                "block h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2",
                isCalendarBlockAppointment(apt) ? "bg-slate-500" : status.accent
              )}
            />
          );
        })}
      </div>
      <span className="hidden sm:inline-flex text-[10px] font-semibold leading-none text-foreground/80">
        {countLabel}
      </span>
    </div>
  );
}

function DayOverflowIndicator({ count, label }: { count: number; label: string }) {
  return (
    <div className="pointer-events-none flex min-w-0 flex-col items-center overflow-visible space-y-1 pb-0.5 sm:items-start sm:pb-1">
      <span
        title={label}
        aria-label={label}
        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-700 px-1.5 text-[10px] font-semibold leading-none tabular-nums text-white sm:h-4.5 sm:min-w-4.5 sm:px-1 sm:text-[9px]"
      >
        {count}
      </span>
      <span className="hidden sm:inline-flex text-[10px] font-semibold leading-none text-foreground/80">
        {label}
      </span>
    </div>
  );
}

function uniqueAppointmentsById(appointments: ApptRecord[]): ApptRecord[] {
  const seen = new Set<string>();
  return appointments.filter((appointment) => {
    if (seen.has(appointment.id)) return false;
    seen.add(appointment.id);
    return true;
  });
}

function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CompactSignal({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/65 bg-muted/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      <span className="text-foreground">{value}</span>
      {label}
    </span>
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
  selectedDate?: Date;
  selectedAppointmentId?: string | null;
  appointments: ApptRecord[];
  onDayClick: (date: Date) => void;
  onApptClick: (apt: ApptRecord) => void;
  conflictIds?: Set<string>;
  isMobileLayout?: boolean;
}

export function MonthView({
  currentDate,
  selectedDate,
  selectedAppointmentId,
  appointments,
  onDayClick,
  onApptClick,
  conflictIds,
  isMobileLayout = false,
}: MonthViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverPreviewRef = useRef<HTMLDivElement | null>(null);
  const grid = useMemo(
    () =>
      getMonthGrid(currentDate, {
        trimTrailingFullNextMonthWeek: isMobileLayout,
      }),
    [currentDate, isMobileLayout]
  );
  const today = useMemo(() => new Date(), []);
  const visibleAppointments = useMemo(() => getVisibleCalendarAppointments(appointments), [appointments]);
  const historicalAppointments = useMemo(() => getHistoricalCalendarAppointments(appointments), [appointments]);
  const monthGridLookup = useMemo(() => {
    const days = grid.flat();
    const dayKeys = new Set(days.map((day) => toDayKey(day)));
    const dayMap = new Map<string, ApptRecord[]>();
    const revenueMap = new Map<string, number>();
    const conflictDaySet = new Set<string>();

    getOverviewCalendarAppointments(historicalAppointments).forEach((appointment) => {
      const spanStart = getJobSpanStart(appointment);
      const spanEnd = isMultiDayJob(appointment) ? getJobSpanEnd(appointment) : getWorkEnd(appointment);
      const cursor = new Date(spanStart.getFullYear(), spanStart.getMonth(), spanStart.getDate());
      const last = new Date(spanEnd.getFullYear(), spanEnd.getMonth(), spanEnd.getDate());

      while (cursor.getTime() <= last.getTime()) {
        const key = toDayKey(cursor);
        const showsOnDay =
          hasLaborOnDay(appointment, cursor) ||
          (isMultiDayJob(appointment) && hasPresenceOnDay(appointment, cursor));

        if (showsOnDay && dayKeys.has(key)) {
          const list = dayMap.get(key);
          if (list) list.push(appointment);
          else dayMap.set(key, [appointment]);
          revenueMap.set(key, (revenueMap.get(key) ?? 0) + getCalendarAppointmentAmount(appointment));
        }

        cursor.setDate(cursor.getDate() + 1);
      }
    });

    if (conflictIds?.size) {
      visibleAppointments.forEach((appointment) => {
        if (!conflictIds.has(appointment.id)) return;
        const start = new Date(getWorkStart(appointment));
        const end = new Date(getWorkEnd(appointment));
        const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        while (cursor.getTime() <= last.getTime()) {
          if (hasLaborOnDay(appointment, cursor)) {
            const key = toDayKey(cursor);
            if (dayKeys.has(key)) conflictDaySet.add(key);
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      });
    }

    return {
      dayMap,
      revenueMap,
      conflictDaySet,
    };
  }, [grid, historicalAppointments, visibleAppointments, conflictIds]);
  const [hoverPreview, setHoverPreview] = useState<{
    date: Date;
    anchorLeft: number;
    anchorRight: number;
    anchorTop: number;
  } | null>(null);
  const [hoverPreviewPosition, setHoverPreviewPosition] = useState<{ left: number; top: number } | null>(null);
  const hoverPreviewData = useMemo(() => {
    if (!hoverPreview) return null;
    const previewKey = toDayKey(hoverPreview.date);
    const previewDensityItems = uniqueAppointmentsById(monthGridLookup.dayMap.get(previewKey) ?? []);
    const previewRevenue = monthGridLookup.revenueMap.get(previewKey) ?? 0;

    return {
      count: previewDensityItems.length,
      revenue: previewRevenue,
      appointments: previewDensityItems.slice(0, 4),
    };
  }, [hoverPreview, monthGridLookup]);
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    []
  );

  useEffect(() => {
    if (!hoverPreview || isMobileLayout) {
      setHoverPreviewPosition(null);
      return;
    }

    const updatePosition = () => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      const previewRect = hoverPreviewRef.current?.getBoundingClientRect();
      if (!containerRect || !previewRect) return;

      const gutter = 12;
      const edgePadding = 8;
      let left = hoverPreview.anchorRight + gutter;
      let top = hoverPreview.anchorTop;

      if (left + previewRect.width > containerRect.width - edgePadding) {
        left = hoverPreview.anchorLeft - previewRect.width - gutter;
      }
      if (left < edgePadding) {
        left = edgePadding;
      }

      if (top + previewRect.height > containerRect.height - edgePadding) {
        top = Math.max(edgePadding, containerRect.height - previewRect.height - edgePadding);
      }
      if (top < edgePadding) {
        top = edgePadding;
      }

      setHoverPreviewPosition({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [hoverPreview, isMobileLayout]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-background/95 shadow-sm sm:rounded-[24px]"
      onMouseLeave={() => {
        if (!isMobileLayout) setHoverPreview(null);
      }}
    >
      <div className="grid grid-cols-7 border-b border-border/70 bg-muted/20 px-2 py-2">
        {DAY_NAMES.map((name) => (
          <div key={name} className="px-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {name}
          </div>
        ))}
      </div>

      <div
        className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
        style={{ gridTemplateRows: `repeat(${grid.length}, minmax(0, 1fr))` }}
      >
        {grid.map((week, wi) => (
          <div key={wi} className="grid min-h-0 grid-cols-7 border-b border-border/60 last:border-b-0">
            {week.map((day, di) => {
              const dayKey = toDayKey(day);
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isToday = isSameDay(day, today);
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
              const dayDensityItems = uniqueAppointmentsById(monthGridLookup.dayMap.get(dayKey) ?? []);
              const hasConflict = monthGridLookup.conflictDaySet.has(dayKey);
              const shouldCollapseDayIndicators = dayDensityItems.length >= MONTH_DAY_OVERFLOW_BADGE_THRESHOLD;
              const dayCountLabel = dayDensityItems.some((apt) => isCalendarBlockAppointment(apt))
                ? `${dayDensityItems.length} item${dayDensityItems.length === 1 ? "" : "s"}`
                : `${dayDensityItems.length} appointment${dayDensityItems.length === 1 ? "" : "s"}`;
              const dayLabel = day.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              });

              return (
                <button
                  key={di}
                  type="button"
                  aria-label={`Open ${dayLabel}`}
                  className={cn(
                    "group relative flex h-full min-h-0 touch-manipulation select-none appearance-none flex-col border-r border-border/60 bg-transparent px-1 py-1 text-left transition-colors last:border-r-0 [webkit-tap-highlight-color:transparent] sm:px-2 sm:py-1.5 xl:px-2.5 xl:py-2",
                    "hover:bg-muted/25",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    !isCurrentMonth && "bg-muted/10 text-muted-foreground",
                    isToday && "bg-primary/[0.04]",
                    isSelected && "bg-primary/[0.03] ring-1 ring-inset ring-primary/30"
                  )}
                  onClick={() => onDayClick(day)}
                  onMouseEnter={(event) => {
                    if (isMobileLayout) return;
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    const targetRect = event.currentTarget.getBoundingClientRect();
                    if (!containerRect) return;
                    setHoverPreview({
                      date: day,
                      anchorLeft: targetRect.left - containerRect.left,
                      anchorRight: targetRect.right - containerRect.left,
                      anchorTop: targetRect.top - containerRect.top,
                    });
                  }}
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex items-start justify-between gap-1 sm:items-center sm:gap-2">
                      <span
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold sm:h-8 sm:w-8 sm:text-sm",
                          isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                        )}
                      >
                        {day.getDate()}
                      </span>
                      {hasConflict ? <AlertTriangle className="h-3 w-3 shrink-0 text-rose-600 sm:h-3.5 sm:w-3.5" /> : null}
                    </div>

                    <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden">
                      {dayDensityItems.length > 0 && !isMobileLayout ? (
                        <div className="mt-1 min-h-0 flex-1 space-y-1 overflow-hidden pt-1">
                          {dayDensityItems
                            .slice(0, 2)
                            .map((appointment, index) => (
                              <div
                                key={`${appointment.id}-${day.toISOString()}-label`}
                                className={cn(
                                  "truncate rounded-md bg-muted/[0.16] px-1.5 py-0.5 font-medium text-foreground/85",
                                  "text-[10px]",
                                  index === 0 ? "hidden sm:block" : "hidden xl:block"
                                )}
                              >
                                {apptLabel(appointment)}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="min-h-0 flex-1" />
                      )}

                      <div className="mt-auto min-h-[1rem] shrink-0 overflow-visible space-y-1 pt-1 pb-2 sm:min-h-[1.15rem] sm:pt-2 sm:pb-2.5">
                        {shouldCollapseDayIndicators ? (
                          <DayOverflowIndicator count={dayDensityItems.length} label={dayCountLabel} />
                        ) : (
                          <DayStatusDots appointments={dayDensityItems} />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {!isMobileLayout && hoverPreview && hoverPreviewData ? (
        <div
          ref={hoverPreviewRef}
          className="pointer-events-none absolute z-20 w-64 rounded-[1.2rem] border border-border/70 bg-white/97 p-3 shadow-[0_20px_48px_rgba(15,23,42,0.14)] backdrop-blur-sm transition-opacity duration-150"
          style={{
            left: hoverPreviewPosition?.left ?? -9999,
            top: hoverPreviewPosition?.top ?? -9999,
            opacity: hoverPreviewPosition ? 1 : 0,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Day</p>
              <h4 className="mt-1 text-sm font-semibold text-foreground">
                {hoverPreview.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </h4>
            </div>
            {hoverPreviewData.revenue > 0 ? (
              <span className="rounded-full border border-border/70 bg-muted/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
                {currencyFormatter.format(hoverPreviewData.revenue)}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
                <CompactSignal label="Scheduled" value={hoverPreviewData.count} />
          </div>

          <div className="mt-3 space-y-2">
            {hoverPreviewData.appointments.length > 0 ? (
              hoverPreviewData.appointments.slice(0, 2).map((appointment) => (
                <div key={appointment.id} className="rounded-xl border border-border/60 bg-muted/[0.12] px-3 py-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-foreground">{apptLabel(appointment)}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {apptClientLabel(appointment)} · {apptVehicleLabel(appointment)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
                No jobs scheduled on this day.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { WeekView } from "./WeekView";
export { DayView } from "./DayView";
