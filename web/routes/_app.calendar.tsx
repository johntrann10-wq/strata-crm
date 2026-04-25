import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type TouchEvent } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router";
import { toast } from "sonner";
import { AlertTriangle, Ban, CalendarDays, ChevronLeft, ChevronRight, Mail, MapPin, MessageSquare, Phone, Plus, Users, X } from "lucide-react";
import { api } from "../api";
import { useAction, useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { cn } from "@/lib/utils";
import { AppointmentInspectorPanel } from "@/components/appointments/AppointmentInspectorPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  type ApptRecord,
  ConflictBanner,
  getWeekDays,
  MonthView,
  WeekView,
  detectConflicts,
  getCalendarAppointmentAmount,
  getCalendarDayRevenue,
  getHeaderTitle,
  getViewRange,
  navigateDate,
} from "../components/CalendarViews";
import {
  dayEnd,
  dayStart,
  getCalendarDaySnapshot,
  getJobPhaseLabel,
  getJobSpanEnd,
  getJobSpanStart,
  getActiveCalendarAppointments,
  getOperationalDayLabel,
  getOperationalTimelineLabel,
  getOverviewCalendarAppointments,
} from "@/lib/calendarJobSpans";
import { buildCalendarBlockInternalNotes, getCalendarBlockLabel, getCalendarBlockNote, isCalendarBlockAppointment, isFullDayCalendarBlock, parseCalendarBlock, type CalendarBlockMode } from "@/lib/calendarBlocks";
import { buildQuarterHourOptions, ResponsiveTimeSelect } from "@/components/appointments/SchedulingControls";
import { triggerImpactFeedback, triggerSelectionFeedback } from "@/lib/nativeInteractions";

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthAnchor(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPanelDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatPanelTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatPanelShortDate(value: Date): string {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function InlineMetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/84 px-3 py-1.5 text-xs shadow-sm">
      <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

const PRESSABLE_CARD_STYLE: CSSProperties = {
  WebkitTouchCallout: "none",
  WebkitTapHighlightColor: "transparent",
  WebkitUserSelect: "none",
  userSelect: "none",
  touchAction: "manipulation",
};

function normalizePhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

function formatDisplayPhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  const trimmed = value?.trim();
  return trimmed || null;
}

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

const GALLERY_SWIPE_THRESHOLD_PX = 44;
const GALLERY_SWIPE_LOCK_PX = 10;
const GALLERY_FLICK_THRESHOLD_PX = 24;
const GALLERY_FLICK_VELOCITY = 0.34;
const GALLERY_SETTLE_MS = 270;

function dampenGalleryOffset(offset: number, width: number, blockedAtEdge: boolean): number {
  if (blockedAtEdge) {
    return offset * 0.24;
  }
  const maxTravel = Math.max(width * 0.92, 1);
  const clamped = Math.max(-maxTravel, Math.min(maxTravel, offset));
  const progress = Math.min(Math.abs(clamped) / maxTravel, 1);
  const eased = 1 - Math.pow(1 - progress, 0.82);
  return Math.sign(clamped) * eased * maxTravel;
}

function MobileAppointmentGallery({
  appointments,
  selectedAppointmentId,
  onSelectAppointment,
  onAppointmentChange,
  onRequestClose,
  emptyDescription,
}: {
  appointments: ApptRecord[];
  selectedAppointmentId: string | null;
  onSelectAppointment: (appointmentId: string) => void;
  onAppointmentChange: () => void | Promise<void>;
  onRequestClose: () => void;
  emptyDescription: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef<{
    startX: number;
    startY: number;
    startAt: number;
    lastX: number;
    lastAt: number;
    lock: "horizontal" | "vertical" | null;
  } | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const selectedIndex = Math.max(
    0,
    appointments.findIndex((appointment) => appointment.id === selectedAppointmentId)
  );
  const currentAppointment = appointments[selectedIndex] ?? null;
  const canGoPrevious = selectedIndex > 0;
  const canGoNext = selectedIndex >= 0 && selectedIndex < appointments.length - 1;
  const galleryWidth = containerRef.current?.clientWidth ?? 390;
  const dragProgress = Math.min(Math.abs(dragOffset) / Math.max(galleryWidth, 1), 1);
  const incomingDirection = dragOffset < 0 ? "next" : dragOffset > 0 ? "previous" : null;
  const slideSlots = [
    { key: "previous", appointment: canGoPrevious ? appointments[selectedIndex - 1] : null },
    { key: "current", appointment: currentAppointment },
    { key: "next", appointment: canGoNext ? appointments[selectedIndex + 1] : null },
  ];

  useEffect(() => {
    return () => {
      if (settleTimerRef.current != null) {
        window.clearTimeout(settleTimerRef.current);
      }
      if (dragFrameRef.current != null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setDragOffset(0);
    setDragging(false);
    setSettling(false);
    touchRef.current = null;
    pendingDragOffsetRef.current = 0;
  }, [selectedAppointmentId]);

  const setDragOffsetOnFrame = useCallback((nextOffset: number) => {
    pendingDragOffsetRef.current = nextOffset;
    if (dragFrameRef.current != null) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      setDragOffset(pendingDragOffsetRef.current);
      dragFrameRef.current = null;
    });
  }, []);

  const settleBackToCurrent = useCallback(() => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current);
    }
    if (dragFrameRef.current != null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    pendingDragOffsetRef.current = 0;
    setDragging(false);
    setSettling(true);
    setDragOffset(0);
    settleTimerRef.current = window.setTimeout(() => {
      setSettling(false);
      settleTimerRef.current = null;
    }, GALLERY_SETTLE_MS);
  }, []);

  const moveToIndex = useCallback(
    (nextIndex: number, direction: "previous" | "next") => {
      const nextAppointment = appointments[nextIndex];
      if (!nextAppointment) {
        settleBackToCurrent();
        return;
      }

      const width = containerRef.current?.clientWidth ?? window.innerWidth;
      if (settleTimerRef.current != null) {
        window.clearTimeout(settleTimerRef.current);
      }
      if (dragFrameRef.current != null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      pendingDragOffsetRef.current = direction === "next" ? -width : width;
      setSettling(true);
      setDragOffset(direction === "next" ? -width : width);
      settleTimerRef.current = window.setTimeout(() => {
        onSelectAppointment(nextAppointment.id);
        void triggerSelectionFeedback();
        setDragOffset(0);
        setDragging(false);
        setSettling(false);
        settleTimerRef.current = null;
      }, GALLERY_SETTLE_MS);
    },
    [appointments, onSelectAppointment, settleBackToCurrent]
  );

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (settling) return;
    const touch = event.touches[0];
    if (!touch) return;
    const now = performance.now();
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, startAt: now, lastX: touch.clientX, lastAt: now, lock: null };
    pendingDragOffsetRef.current = 0;
    setDragging(false);
    setDragOffset(0);
  }, [settling]);

  const handleTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      const gesture = touchRef.current;
      if (!touch || !gesture || settling) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const now = performance.now();

      gesture.lastX = touch.clientX;
      gesture.lastAt = now;

      if (!gesture.lock && Math.max(absX, absY) > GALLERY_SWIPE_LOCK_PX) {
        gesture.lock = absX > absY * 1.25 ? "horizontal" : "vertical";
        if (gesture.lock === "horizontal") setDragging(true);
      }

      if (gesture.lock !== "horizontal") return;

      event.preventDefault();
      const width = containerRef.current?.clientWidth ?? window.innerWidth;
      const blockedAtEdge = (deltaX > 0 && !canGoPrevious) || (deltaX < 0 && !canGoNext);
      setDragOffsetOnFrame(dampenGalleryOffset(deltaX, width, blockedAtEdge));
    },
    [canGoNext, canGoPrevious, setDragOffsetOnFrame, settling]
  );

  const handleTouchEnd = useCallback(() => {
    const gesture = touchRef.current;
    touchRef.current = null;
    const finalOffset = pendingDragOffsetRef.current || dragOffset;
    const swipeDuration = gesture ? Math.max(1, gesture.lastAt - gesture.startAt) : 1;
    const swipeVelocity = gesture ? (gesture.lastX - gesture.startX) / swipeDuration : 0;

    if (!gesture || gesture.lock !== "horizontal") {
      setDragging(false);
      setDragOffset(0);
      return;
    }

    if (
      canGoNext &&
      (finalOffset <= -GALLERY_SWIPE_THRESHOLD_PX ||
        (finalOffset <= -GALLERY_FLICK_THRESHOLD_PX && swipeVelocity <= -GALLERY_FLICK_VELOCITY))
    ) {
      moveToIndex(selectedIndex + 1, "next");
      return;
    }

    if (
      canGoPrevious &&
      (finalOffset >= GALLERY_SWIPE_THRESHOLD_PX ||
        (finalOffset >= GALLERY_FLICK_THRESHOLD_PX && swipeVelocity >= GALLERY_FLICK_VELOCITY))
    ) {
      moveToIndex(selectedIndex - 1, "previous");
      return;
    }

    settleBackToCurrent();
  }, [canGoNext, canGoPrevious, dragOffset, moveToIndex, selectedIndex, settleBackToCurrent]);

  const handleTouchCancel = useCallback(() => {
    touchRef.current = null;
    settleBackToCurrent();
  }, [settleBackToCurrent]);

  const trackStyle: CSSProperties = {
    transform: `translate3d(calc(-100% + ${dragOffset}px), 0, 0)`,
    transition: dragging
      ? "none"
      : settling
        ? `transform ${GALLERY_SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
        : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
  };

  if (appointments.length === 0) {
    return (
      <div className="mobile-gallery-scroll h-full overflow-y-auto px-1 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <AppointmentInspectorPanel
          appointment={null}
          emptyTitle="Select an appointment"
          emptyDescription={emptyDescription}
          compact
          minimalChrome
          onAppointmentChange={onAppointmentChange}
          onRequestClose={onRequestClose}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_18%_0%,rgba(251,146,60,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(15,23,42,0.05))]"
    >
      <button
        type="button"
        onClick={onRequestClose}
        className="absolute right-3.5 top-3.5 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-500 shadow-[0_12px_28px_rgba(15,23,42,0.16)] backdrop-blur-xl transition-colors active:scale-95 hover:text-slate-950"
        aria-label="Close appointment inspector"
      >
        <X className="h-4 w-4" />
      </button>
      {appointments.length > 1 ? (
        <>
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute bottom-4 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/70 bg-white/84 px-3 py-1.5 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl",
              dragging && "opacity-90"
            )}
          >
            <span className="text-[10px] font-semibold tabular-nums text-slate-500">
              {selectedIndex + 1}/{appointments.length}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {appointments.map((appointment, index) => (
                <span
                  key={appointment.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    index === selectedIndex ? "w-5 bg-slate-950" : "w-1.5 bg-slate-300"
                  )}
                />
              ))}
            </span>
          </div>
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-10 left-0 z-20 w-12 bg-gradient-to-r from-slate-950/12 to-transparent transition-opacity",
              canGoPrevious ? "opacity-100" : "opacity-0"
            )}
          />
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-10 right-0 z-20 w-12 bg-gradient-to-l from-slate-950/12 to-transparent transition-opacity",
              canGoNext ? "opacity-100" : "opacity-0"
            )}
          />
        </>
      ) : null}
      <div
        className="flex h-full min-h-0 will-change-transform"
        style={trackStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {slideSlots.map(({ key, appointment }) => (
          <div
            key={`${key}-${appointment?.id ?? "edge"}`}
            className="mobile-gallery-scroll h-full min-w-full overflow-y-auto overscroll-contain px-2.5 pb-[max(2.75rem,env(safe-area-inset-bottom))] pt-3"
            style={{ touchAction: "pan-y" }}
            aria-hidden={key !== "current"}
          >
            {appointment ? (
              <div
                className={cn(
                  "min-h-full pb-10 transition-[opacity,transform,filter] duration-300 ease-out",
                  key === "current" ? "scale-100 opacity-100" : "scale-[0.965] opacity-55"
                )}
                style={{
                  transform:
                    key === "current"
                      ? `scale(${1 - dragProgress * 0.018})`
                      : key === incomingDirection
                        ? `scale(${0.965 + dragProgress * 0.035})`
                        : undefined,
                  opacity: key === "current" ? 1 : key === incomingDirection ? 0.55 + dragProgress * 0.4 : undefined,
                  filter: key === "current" || key === incomingDirection ? "none" : "saturate(0.92)",
                }}
              >
                <AppointmentInspectorPanel
                  appointment={appointment}
                  emptyTitle="Select an appointment"
                  emptyDescription={emptyDescription}
                  compact
                  minimalChrome
                  onAppointmentChange={onAppointmentChange}
                  onRequestClose={onRequestClose}
                />
              </div>
            ) : (
              <div className="h-full rounded-[1.35rem]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgendaPreviewRow({
  appointment,
  kind,
  selected,
  currentDate,
  onClick,
  onLongPress,
  emphasized = false,
}: {
  appointment: ApptRecord;
  kind: "timed" | "onsite";
  selected: boolean;
  currentDate: Date;
  onClick: () => void;
  onLongPress?: () => void;
  emphasized?: boolean;
}) {
  const openActions = useCallback(() => {
    if (!onLongPress) return;
    void triggerSelectionFeedback();
    onLongPress();
  }, [onLongPress]);
  const longPress = useLongPressActions(openActions);
  const appointmentAmount = getCalendarAppointmentAmount(appointment);
  const appointmentLabel = getCalendarAppointmentLabel(appointment);
  const clientLabel = appointment.client
    ? [appointment.client.firstName, appointment.client.lastName].filter(Boolean).join(" ").trim() || "Client"
    : "Internal";
  const secondaryLabel = appointment.vehicle
    ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
    : appointment.assignedStaff
      ? `${appointment.assignedStaff.firstName} ${appointment.assignedStaff.lastName}`
      : kind === "onsite"
        ? "Vehicle in shop"
        : "Unassigned";
  const timingLabel =
    kind === "onsite"
      ? `${getOperationalDayLabel(appointment, currentDate)} · ${formatPanelShortDate(getJobSpanStart(appointment))} to ${formatPanelShortDate(getJobSpanEnd(appointment))}`
      : isCalendarBlockAppointment(appointment)
        ? isFullDayCalendarBlock(appointment)
          ? "All-day block"
          : `${formatPanelTime(appointment.startTime)} - ${formatPanelTime(appointment.endTime)}`
        : `${formatPanelTime(appointment.startTime)}${appointment.endTime ? ` - ${formatPanelTime(appointment.endTime)}` : ""}`;

  return (
    <button
      type="button"
      aria-haspopup={onLongPress ? "dialog" : undefined}
      onClick={(event) => {
        if (longPress.consumeIfLongPress(event)) return;
        onClick();
      }}
      onDragStart={(event) => event.preventDefault()}
      onSelectStart={(event) => event.preventDefault()}
      onTouchStart={longPress.begin}
      onTouchEnd={longPress.consumeIfLongPress}
      onTouchCancel={longPress.clearTimer}
      onTouchMove={longPress.handleTouchMove}
      onContextMenu={onLongPress ? longPress.openContextMenu : undefined}
      className={cn(
        "flex w-full select-none items-start gap-3 rounded-2xl border border-border/60 bg-white/82 text-left transition-colors hover:bg-white [&_*]:select-none",
        emphasized ? "gap-3.5 rounded-[1.35rem] px-3.5 py-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]" : "px-3 py-3",
        selected && !isCalendarBlockAppointment(appointment) && "border-primary/35 bg-primary/[0.05]"
      )}
      style={PRESSABLE_CARD_STYLE}
      draggable={false}
    >
      <div className="min-w-0 flex-1">
        <div className={cn("flex items-start justify-between gap-3", emphasized && "gap-2.5")}>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate font-semibold text-foreground", emphasized ? "text-[15px] leading-5" : "text-sm")}>
              {appointmentLabel}
            </p>
            {appointmentAmount > 0 ? (
              <p className={cn("mt-1 font-semibold text-foreground/90", emphasized ? "text-sm" : "text-xs")}>
                {formatCurrency(appointmentAmount)}
              </p>
            ) : null}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border border-border/70 bg-background font-semibold uppercase tracking-[0.12em] text-muted-foreground",
              emphasized ? "px-2.5 py-1 text-[10px]" : "px-2 py-0.5 text-[10px]"
            )}
          >
            {kind === "onsite"
              ? getOperationalDayLabel(appointment, currentDate)
              : isCalendarBlockAppointment(appointment)
                ? (isFullDayCalendarBlock(appointment) ? "All day" : "Blocked")
                : getOperationalDayLabel(appointment, currentDate)}
          </span>
        </div>
        <p className={cn("mt-1.5 truncate text-muted-foreground", emphasized ? "text-[13px]" : "text-xs")}>{clientLabel}</p>
        <p className={cn("truncate text-muted-foreground", emphasized ? "text-[13px]" : "text-xs")}>{secondaryLabel}</p>
        <p className={cn("mt-1.5 truncate text-muted-foreground", emphasized ? "text-[12px]" : "text-[11px]")}>{timingLabel}</p>
      </div>
    </button>
  );
}

function getCalendarAppointmentLabel(appointment: ApptRecord): string {
  if (isCalendarBlockAppointment(appointment)) return getCalendarBlockLabel(appointment);
  if (appointment.title?.trim()) return appointment.title.trim();
  if (appointment.client) return [appointment.client.firstName, appointment.client.lastName].filter(Boolean).join(" ").trim() || "Appointment";
  return "Appointment";
}

function parseDateInput(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function parseOptionalDateInput(value: string | null): Date | null {
  if (!value) return null;
  const parsed = parseDateInput(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const CALENDAR_FETCH_LIMIT = 1000;

function combineDateAndTime(dateValue: string, timeValue: string): Date {
  const [hours, minutes] = timeValue.split(":").map(Number);
  const date = parseDateInput(dateValue);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function eachDateInclusive(startValue: string, endValue: string): Date[] {
  const cursor = parseDateInput(startValue);
  const end = parseDateInput(endValue);
  const dates: Date[] = [];
  while (cursor.getTime() <= end.getTime()) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function mobileDateInputClassName(isMobileLayout: boolean) {
  return cn(
    "w-full min-w-0 max-w-full rounded-xl border border-input/90 bg-background text-sm font-medium [font-variant-numeric:tabular-nums] shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-border focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
    isMobileLayout
      ? "h-11 appearance-none px-3"
      : "h-11 px-3"
  );
}

export default function CalendarPage() {
  const { businessId, currentLocationId } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const requestedDate = parseOptionalDateInput(searchParams.get("date"));
  const initialView =
    requestedView === "month"
      ? "month"
      : requestedView === "week" || requestedView === "day"
        ? "week"
      : null;

  const [currentDate, setCurrentDate] = useState(() => requestedDate ?? new Date());
  const [visibleMonthDate, setVisibleMonthDate] = useState(() => toMonthAnchor(requestedDate ?? new Date()));
  const [selectedDate, setSelectedDate] = useState(() => requestedDate ?? new Date());
  const [view, setView] = useState<"month" | "week">(initialView ?? "month");
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [blockMode, setBlockMode] = useState<CalendarBlockMode>("time");
  const [blockStartDate, setBlockStartDate] = useState(() => toLocalDateString(new Date()));
  const [blockEndDate, setBlockEndDate] = useState(() => toLocalDateString(new Date()));
  const [blockStartTime, setBlockStartTime] = useState("09:00");
  const [blockEndTime, setBlockEndTime] = useState("10:00");
  const [blockStaffId, setBlockStaffId] = useState("none");
  const [blockNotes, setBlockNotes] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<ApptRecord | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [isAppointmentInspectorOpen, setIsAppointmentInspectorOpen] = useState(false);
  const [calendarActionsAppointment, setCalendarActionsAppointment] = useState<ApptRecord | null>(null);
  const [calendarActionsOpen, setCalendarActionsOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const layoutInitializedRef = useRef(false);
  const dayInspectorRef = useRef<HTMLElement | null>(null);
  const lastInternalUrlSyncRef = useRef<{ view: "month" | "week"; date: string } | null>(null);

  useEffect(() => {
    const nextView =
      requestedView === "month"
        ? "month"
        : requestedView === "week" || requestedView === "day"
          ? "week"
          : null;
    if (!nextView || nextView === view) return;
    const pendingInternalSync = lastInternalUrlSyncRef.current;
    if (pendingInternalSync?.view === view) return;
    setView(nextView);
  }, [requestedView, view]);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileLayout(mobile);
      if (!layoutInitializedRef.current) {
        setView(initialView ?? "month");
        layoutInitializedRef.current = true;
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [initialView]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (next.get("view") === "day") {
      next.set("view", "week");
      setSearchParams(next, { replace: true, preventScrollReset: true });
      return;
    }
    const dateValue = toLocalDateString(view === "month" ? selectedDate : currentDate);
    if (next.get("view") === view && next.get("date") === dateValue) return;
    lastInternalUrlSyncRef.current = { view, date: dateValue };
    next.set("view", view);
    next.set("date", dateValue);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }, [currentDate, searchParams, selectedDate, setSearchParams, view]);

  useEffect(() => {
    if (!requestedDate) return;
    const requestedKey = toLocalDateString(requestedDate);
    const internalSync = lastInternalUrlSyncRef.current;
    if (internalSync) {
      if (internalSync.view === view && internalSync.date === requestedKey) {
        lastInternalUrlSyncRef.current = null;
        return;
      }
      return;
    }
    if (view === "week") {
      if (toLocalDateString(selectedDate) !== requestedKey) {
        setSelectedDate(requestedDate);
      }
      if (toLocalDateString(currentDate) !== requestedKey) {
        setCurrentDate(requestedDate);
      }
      const requestedMonthAnchor = toMonthAnchor(requestedDate);
      if (toLocalDateString(visibleMonthDate) !== toLocalDateString(requestedMonthAnchor)) {
        setVisibleMonthDate(requestedMonthAnchor);
      }
      return;
    }

    const requestedMonthAnchor = toMonthAnchor(requestedDate);
    const requestedMonthKey = toLocalDateString(requestedMonthAnchor);
    const visibleMonthKey = toLocalDateString(visibleMonthDate);

    if (visibleMonthKey !== requestedMonthKey) {
      setVisibleMonthDate(requestedMonthAnchor);
    }
    if (toLocalDateString(selectedDate) !== requestedKey) {
      setSelectedDate(requestedDate);
    }
  }, [currentDate, requestedDate, selectedDate, view, visibleMonthDate]);

  useEffect(() => {
    if (view !== "week") return;
    if (toLocalDateString(currentDate) === toLocalDateString(selectedDate)) return;
    setCurrentDate(selectedDate);
  }, [currentDate, selectedDate, view]);

  const calendarReturnTo = useMemo(() => {
    const query = searchParams.toString();
    if (query) return `/calendar?${query}`;
    const anchorDate = view === "month" ? selectedDate : currentDate;
    return `/calendar?view=${view}&date=${encodeURIComponent(toLocalDateString(anchorDate))}`;
  }, [currentDate, searchParams, selectedDate, view]);

  const visibleDate = view === "month" ? visibleMonthDate : currentDate;

  const { start: viewStart, end: viewEnd } = useMemo(
    () => getViewRange(visibleDate, view),
    [visibleDate, view]
  );

  const { queryStart, queryEnd } = useMemo(() => {
    if (view === "month") {
      return {
        queryStart: new Date(visibleDate.getFullYear(), visibleDate.getMonth() - 1, 1, 0, 0, 0, 0),
        queryEnd: new Date(visibleDate.getFullYear(), visibleDate.getMonth() + 2, 0, 23, 59, 59, 999),
      };
    }

    const monthStart = new Date(visibleDate.getFullYear(), visibleDate.getMonth(), 1);
    const monthEnd = new Date(visibleDate.getFullYear(), visibleDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      queryStart: viewStart.getTime() < monthStart.getTime() ? viewStart : monthStart,
      queryEnd: viewEnd.getTime() > monthEnd.getTime() ? viewEnd : monthEnd,
    };
  }, [view, viewEnd, viewStart, visibleDate]);

  const { startGte, startLte } = useMemo(
    () => ({ startGte: queryStart.toISOString(), startLte: queryEnd.toISOString() }),
    [queryEnd, queryStart]
  );

  const [{ data: appointmentsData, fetching, error }, refetchAppointments] = useFindMany(api.appointment, {
    startGte,
    startLte,
    locationId: currentLocationId ?? undefined,
    sort: { startTime: "Ascending" },
    pause: !businessId,
    select: {
      id: true,
      businessId: true,
      title: true,
      startTime: true,
      endTime: true,
      jobStartTime: true,
      expectedCompletionTime: true,
      pickupReadyTime: true,
      vehicleOnSite: true,
      jobPhase: true,
      status: true,
      subtotal: true,
      taxRate: true,
      taxAmount: true,
      applyTax: true,
      adminFeeRate: true,
      adminFeeAmount: true,
      applyAdminFee: true,
      totalPrice: true,
      depositAmount: true,
      paidAt: true,
      collectedAmount: true,
      balanceDue: true,
      paidInFull: true,
      depositSatisfied: true,
      assignedStaffId: true,
      isMobile: true,
      notes: true,
      internalNotes: true,
      client: { id: true, firstName: true, lastName: true, phone: true, email: true },
      vehicle: { id: true, make: true, model: true, year: true },
      assignedStaff: { id: true, firstName: true, lastName: true },
    },
    first: CALENDAR_FETCH_LIMIT,
  });

  const [{ data: locationsRaw }] = useFindMany(api.location, {
    first: 100,
    pause: !businessId,
  } as any);
  const [{ data: businessSettings }] = useFindMany(api.business, {
    filter: businessId
      ? { id: { equals: businessId } }
      : { id: { equals: "skip" } },
    select: { id: true, calendarBlockCapacityPerSlot: true },
    first: 1,
    pause: !businessId,
  } as any);
  const [{ data: staffRaw }] = useFindMany(api.staff, {
    filter: {
      businessId: { equals: businessId ?? "" },
      active: { equals: true },
    },
    select: { id: true, firstName: true, lastName: true },
    first: 100,
    sort: { firstName: "Ascending" },
    pause: !businessId,
  } as any);

  const activeLocationName = useMemo(() => {
    const locations = (locationsRaw ?? []) as Array<{ id: string; name?: string | null }>;
    return locations.find((location) => location.id === currentLocationId)?.name?.trim() || null;
  }, [locationsRaw, currentLocationId]);

  const stableAppointmentsRef = useRef<ApptRecord[]>([]);
  if (appointmentsData !== undefined) {
    stableAppointmentsRef.current = appointmentsData as unknown as ApptRecord[];
  }
  const appointments = stableAppointmentsRef.current;

  const isFirstLoad = fetching && appointmentsData === undefined;

  const appointmentCapacityPerSlot = Math.max(
    1,
    Math.min(
      12,
      Number(
        Array.isArray(businessSettings) && businessSettings.length > 0
          ? (businessSettings[0] as { calendarBlockCapacityPerSlot?: number | null }).calendarBlockCapacityPerSlot ?? 1
          : 1
      ) || 1
    )
  );
  const { staffConflictIds, businessConflictIds } = useMemo(
    () => detectConflicts(appointments, appointmentCapacityPerSlot),
    [appointments, appointmentCapacityPerSlot]
  );
  const activeConflicts = conflictDismissed
    ? new Set<string>()
    : new Set([...staffConflictIds, ...businessConflictIds]);

  useEffect(() => {
    setConflictDismissed(false);
  }, [appointmentsData]);

  const [{ fetching: rescheduling }, runReschedule] = useAction(api.appointment.update);
  const [{ fetching: creatingBlock }, createAppointment] = useAction(api.appointment.create);
  const [{ fetching: updatingBlock }, updateAppointment] = useAction(api.appointment.update);
  const [{ fetching: unblockingBlock }, deleteAppointment] = useAction(api.appointment.delete);
  const timeOptions = useMemo(() => buildQuarterHourOptions(), []);
  const timeSelectTriggerClassName =
    "h-11 rounded-xl border-input/90 text-sm font-medium [font-variant-numeric:tabular-nums] shadow-[0_1px_2px_rgba(15,23,42,0.03)]";

  async function handleReschedule(appointmentId: string, newStart: Date, newEnd: Date | null) {
    const result = await runReschedule({ id: appointmentId, startTime: newStart, endTime: newEnd ?? undefined });
    if (result.error) {
      toast.error("Could not reschedule: " + result.error.message);
    } else {
      toast.success("Appointment rescheduled");
      void refetchAppointments();
    }
  }

  const isToday = currentDate.toDateString() === new Date().toDateString();

  const activeAppointments = useMemo(() => getActiveCalendarAppointments(appointments), [appointments]);
  const overviewAppointments = useMemo(() => getOverviewCalendarAppointments(appointments), [appointments]);

  function handlePrev() {
    if (view === "month") {
      const nextMonth = new Date(visibleMonthDate.getFullYear(), visibleMonthDate.getMonth() - 1, 1);
      setVisibleMonthDate(nextMonth);
      setSelectedDate((selected) => {
        const lastDayOfTargetMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
        return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(selected.getDate(), lastDayOfTargetMonth));
      });
      return;
    }
    setCurrentDate((d) => {
      const next = navigateDate(d, view, -1);
      setSelectedDate(next);
      return next;
    });
  }

  function handleNext() {
    if (view === "month") {
      const nextMonth = new Date(visibleMonthDate.getFullYear(), visibleMonthDate.getMonth() + 1, 1);
      setVisibleMonthDate(nextMonth);
      setSelectedDate((selected) => {
        const lastDayOfTargetMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
        return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(selected.getDate(), lastDayOfTargetMonth));
      });
      return;
    }
    setCurrentDate((d) => {
      const next = navigateDate(d, view, 1);
      setSelectedDate(next);
      return next;
    });
  }

  function handleToday() {
    const today = new Date();
    if (view === "month") {
      setVisibleMonthDate(toMonthAnchor(today));
    } else {
      setCurrentDate(today);
    }
    setSelectedDate(today);
  }

  function handleViewChange(nextView: "month" | "week") {
    if (nextView === view) return;
    const dateValue = toLocalDateString(selectedDate);
    lastInternalUrlSyncRef.current = {
      view: nextView,
      date: dateValue,
    };
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", nextView);
    nextParams.set("date", dateValue);
    setSearchParams(nextParams, { replace: true, preventScrollReset: true });
    if (nextView === "week") {
      setCurrentDate(selectedDate);
    } else {
      setVisibleMonthDate(toMonthAnchor(selectedDate));
    }
    setView(nextView);
  }

  function handleDayClick(date: Date) {
    setSelectedDate(date);
    setCurrentDate(date);
    const shouldShiftVisibleMonth =
      date.getMonth() !== visibleMonthDate.getMonth() || date.getFullYear() !== visibleMonthDate.getFullYear();
    if (view === "week" || shouldShiftVisibleMonth) {
      if (view === "month") {
        setVisibleMonthDate(toMonthAnchor(date));
      }
    }
    const daySnapshot = getCalendarDaySnapshot(appointments, date);
    const nextAppointment =
      daySnapshot.agendaItems.find(({ appointment }) => !isCalendarBlockAppointment(appointment))?.appointment ?? null;
    if (view === "month" && isMobileLayout) {
      setSelectedAppointmentId(null);
      setIsAppointmentInspectorOpen(false);
      window.requestAnimationFrame(() => {
        dayInspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      return;
    }
    setSelectedAppointmentId(nextAppointment?.id ?? null);
  }

  function handleSlotClick(date: Date) {
    const dateStr = toLocalDateString(date);
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    navigate(`/appointments/new?date=${encodeURIComponent(dateStr)}&time=${encodeURIComponent(`${h}:${m}`)}${
      currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
    }`);
  }

  function handleApptClick(apt: ApptRecord) {
    void triggerSelectionFeedback();
    if (isCalendarBlockAppointment(apt)) {
      setSelectedBlock(apt);
      return;
    }
    setSelectedAppointmentId(apt.id);
    setIsAppointmentInspectorOpen(true);
  }

  function handleCalendarAppointmentLongPress(apt: ApptRecord) {
    if (isCalendarBlockAppointment(apt)) {
      handleApptClick(apt);
      return;
    }
    setCalendarActionsAppointment(apt);
    setCalendarActionsOpen(true);
  }

  function handleOpenCalendarAppointmentRecord(apt: ApptRecord) {
    void triggerSelectionFeedback();
    setCalendarActionsOpen(false);
    navigate(`/appointments/${apt.id}?from=${encodeURIComponent(calendarReturnTo)}`);
  }

  function handleOpenCalendarClientRecord(apt: ApptRecord) {
    if (!apt.client?.id) return;
    void triggerSelectionFeedback();
    setCalendarActionsOpen(false);
    navigate(`/clients/${apt.client.id}?from=${encodeURIComponent(calendarReturnTo)}`);
  }

  function handleNewAppointment() {
    const targetDate = view === "month" ? selectedDate : currentDate;
    const iso = toLocalDateString(targetDate);
    navigate(`/appointments/new?date=${encodeURIComponent(iso)}${
      currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
    }`);
  }

  function handleOpenBlockDialog() {
    const targetDate = view === "month" ? selectedDate : currentDate;
    const targetDateValue = toLocalDateString(targetDate);
    setEditingBlockId(null);
    setBlockMode("time");
    setBlockStartDate(targetDateValue);
    setBlockEndDate(targetDateValue);
    setBlockStartTime("09:00");
    setBlockEndTime("10:00");
    setBlockStaffId("none");
    setBlockNotes("");
    setShowBlockDialog(true);
  }

  function handleEditBlock(block: ApptRecord) {
    const parsed = parseCalendarBlock(block.internalNotes);
    const startDate = toLocalDateString(new Date(block.startTime));
    const endDate = toLocalDateString(new Date(block.endTime));
    setEditingBlockId(block.id);
    setBlockMode(parsed?.mode ?? "time");
    setBlockStartDate(startDate);
    setBlockEndDate(startDate === endDate ? startDate : endDate);
    setBlockStartTime(block.startTime ? new Date(block.startTime).toTimeString().slice(0, 5) : "09:00");
    setBlockEndTime(block.endTime ? new Date(block.endTime).toTimeString().slice(0, 5) : "10:00");
    setBlockStaffId(block.assignedStaffId ?? "none");
    setBlockNotes(getCalendarBlockNote(block.internalNotes) ?? "");
    setSelectedBlock(null);
    setShowBlockDialog(true);
  }

  async function handleUnblock(block: ApptRecord) {
    if (!isCalendarBlockAppointment(block)) {
      toast.error("Only blocked time can be removed from this menu.");
      return;
    }

    const result = await deleteAppointment({ id: block.id } as any);
    if (result.error) {
      toast.error("Could not remove block: " + result.error.message);
      return;
    }
    toast.success("Block removed");
    setSelectedBlock(null);
    void refetchAppointments();
  }

  async function handleCreateBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!businessId) {
      toast.error("Business context is missing.");
      return;
    }

    const effectiveEndDate = blockMode === "time" ? blockStartDate : blockEndDate;

    if (effectiveEndDate < blockStartDate) {
      toast.error("End date must be on or after start date.");
      return;
    }

    if (blockMode === "time") {
      const start = combineDateAndTime(blockStartDate, blockStartTime);
      const end = combineDateAndTime(blockStartDate, blockEndTime);
      if (end.getTime() <= start.getTime()) {
        toast.error("End time must be after start time.");
        return;
      }
    }

    const previewNotes = buildCalendarBlockInternalNotes({ mode: blockMode }, blockNotes);
    const title = getCalendarBlockLabel({ title: null, internalNotes: previewNotes });
    const internalNotes = buildCalendarBlockInternalNotes(
      { mode: blockMode },
      blockNotes
    );
    const assignedStaffId = blockStaffId === "none" ? undefined : blockStaffId;

    if (editingBlockId) {
      const startTime =
        blockMode === "full-day"
          ? combineDateAndTime(blockStartDate, "00:00")
          : combineDateAndTime(blockStartDate, blockStartTime);
      const endTime =
        blockMode === "full-day"
          ? combineDateAndTime(effectiveEndDate, "23:59")
          : combineDateAndTime(blockStartDate, blockEndTime);

      const result = await updateAppointment({
        id: editingBlockId,
        title,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        assignedStaffId,
        internalNotes,
      } as any);

      if (result.error) {
        toast.error("Could not update block: " + result.error.message);
        return;
      }

      toast.success("Block updated");
      setShowBlockDialog(false);
      setEditingBlockId(null);
      void refetchAppointments();
      return;
    }

    const dates = eachDateInclusive(blockStartDate, effectiveEndDate);

    for (const date of dates) {
      const dayValue = toLocalDateString(date);
      const startTime =
        blockMode === "full-day"
          ? combineDateAndTime(dayValue, "00:00")
          : combineDateAndTime(dayValue, blockStartTime);
      const endTime =
        blockMode === "full-day"
          ? combineDateAndTime(dayValue, "23:59")
          : combineDateAndTime(dayValue, blockEndTime);

      const result = await createAppointment({
        title,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: "scheduled",
        assignedStaffId,
        locationId: currentLocationId ?? undefined,
        internalNotes,
      } as any);

      if (result.error) {
        toast.error("Could not create blocked time: " + result.error.message);
        return;
      }
    }

    toast.success(
      `${dates.length} ${dates.length === 1 ? "calendar block" : "calendar blocks"} created`
    );
    setShowBlockDialog(false);
    setEditingBlockId(null);
    void refetchAppointments();
  }

  const inspectorDate = view === "month" ? selectedDate : currentDate;
  const selectedDaySnapshot = useMemo(() => getCalendarDaySnapshot(appointments, inspectorDate), [appointments, inspectorDate]);
  const selectedDayAppointments = selectedDaySnapshot.dayAppts;
  const selectedDayOnSiteJobs = selectedDaySnapshot.daySpans;
  const selectedDayOnSiteOnlyJobs = selectedDaySnapshot.onSiteOnlyJobs;
  const selectedDayAgendaItems = selectedDaySnapshot.agendaItems;
  const selectableDayAgendaItems = useMemo(
    () => selectedDayAgendaItems.filter(({ appointment }) => !isCalendarBlockAppointment(appointment)),
    [selectedDayAgendaItems]
  );
  const selectedDayActiveItems = selectedDaySnapshot.activeItemCount;
  const selectedDayDropoffs = useMemo(
    () =>
      selectedDayAgendaItems.filter(
        ({ appointment }) =>
          !isCalendarBlockAppointment(appointment) && getOperationalDayLabel(appointment, inspectorDate) === "Drop-off"
      ).length,
    [inspectorDate, selectedDayAgendaItems]
  );
  const selectedDayPickups = useMemo(
    () =>
      selectedDayAgendaItems.filter(
        ({ appointment }) =>
          !isCalendarBlockAppointment(appointment) && getOperationalDayLabel(appointment, inspectorDate) === "Pickup"
      ).length,
    [inspectorDate, selectedDayAgendaItems]
  );
  const selectedDayInShopCount = useMemo(
    () => selectedDayAgendaItems.filter(({ kind }) => kind === "onsite").length,
    [selectedDayAgendaItems]
  );
  const selectedDayRevenue = useMemo(
    () => getCalendarDayRevenue(appointments, inspectorDate),
    [appointments, inspectorDate]
  );
  const selectedDayUnassigned = selectedDayAppointments.filter((appointment) => !appointment.assignedStaffId).length;
  const selectedDayConflicts = selectedDayAppointments.filter((appointment) => activeConflicts.has(appointment.id)).length;
  const selectedMonthRange = useMemo(() => {
    const start = new Date(visibleMonthDate.getFullYear(), visibleMonthDate.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(visibleMonthDate.getFullYear(), visibleMonthDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }, [visibleMonthDate]);
  const selectedMonthAppointments = useMemo(
    () =>
      overviewAppointments.filter((appointment) => {
        const monthStart = selectedMonthRange.start;
        const monthEnd = selectedMonthRange.end;
        const spanStart = getJobSpanStart(appointment);
        const spanEnd = getJobSpanEnd(appointment);
        return spanStart.getTime() <= monthEnd.getTime() && spanEnd.getTime() >= monthStart.getTime();
      }),
    [overviewAppointments, selectedMonthRange]
  );
  const selectedMonthRevenue = useMemo(
    () =>
      selectedMonthAppointments.reduce((total, appointment) => {
        const scheduledAt = getJobSpanStart(appointment);
        const isScheduledThisMonth =
          scheduledAt.getTime() >= selectedMonthRange.start.getTime() &&
          scheduledAt.getTime() <= selectedMonthRange.end.getTime();
        if (!isScheduledThisMonth) return total;
        return total + getCalendarAppointmentAmount(appointment);
      }, 0),
    [selectedMonthAppointments, selectedMonthRange]
  );
  const desktopMonthHeightClassName = "sm:h-[31rem] lg:h-[34rem] xl:h-[clamp(35rem,56dvh,42rem)]";
  const busiestMonthDay = useMemo(() => {
    const counts = new Map<string, { date: Date; count: number }>();
    for (const appointment of selectedMonthAppointments) {
      const cursor = dayStart(getJobSpanStart(appointment));
      const last = dayEnd(getJobSpanEnd(appointment));
      while (cursor.getTime() <= last.getTime()) {
        if (cursor.getMonth() === visibleMonthDate.getMonth() && cursor.getFullYear() === visibleMonthDate.getFullYear()) {
          const key = toLocalDateString(cursor);
          const existing = counts.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            counts.set(key, { date: new Date(cursor), count: 1 });
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count)[0] ?? null;
  }, [selectedMonthAppointments, visibleMonthDate]);
  const availableViews = ["month", "week"] as const;
  const mobileWeekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const selectedAppointment = useMemo(
    () =>
      isAppointmentInspectorOpen
        ? appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null
        : null,
    [appointments, selectedAppointmentId, isAppointmentInspectorOpen]
  );
  const sameDayGalleryAppointments = useMemo(() => {
    const seen = new Set<string>();
    const sameDayAppointments = selectableDayAgendaItems
      .map(({ appointment }) => appointment)
      .filter((appointment) => {
        if (isCalendarBlockAppointment(appointment) || seen.has(appointment.id)) return false;
        seen.add(appointment.id);
        return true;
      });
    if (sameDayAppointments.length > 0) return sameDayAppointments;
    return selectedAppointment ? [selectedAppointment] : [];
  }, [selectableDayAgendaItems, selectedAppointment]);

  useEffect(() => {
    if (!selectedAppointmentId) return;
    const stillVisible = selectableDayAgendaItems.some(({ appointment }) => appointment.id === selectedAppointmentId);
    if (stillVisible) return;
    setSelectedAppointmentId(null);
    setIsAppointmentInspectorOpen(false);
  }, [selectableDayAgendaItems, selectedAppointmentId]);

  const useFlowingMonthInspector = isMobileLayout && view === "month";
  const dayInspectorTitleId = `day-inspector-title-${view}`;

  const dayInspectorPanel = (
    <aside
      ref={dayInspectorRef}
      role="complementary"
      aria-label="Day inspector"
      aria-labelledby={dayInspectorTitleId}
      className={cn(
        "native-foreground-panel flex min-h-0 flex-col",
        useFlowingMonthInspector ? "h-auto overflow-visible" : "h-full overflow-hidden"
      )}
    >
        <div
          className={cn(
            "sticky top-0 z-10 flex flex-wrap items-start justify-between border-b border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.92))]",
            isMobileLayout ? "gap-2 px-2.5 pb-2 pt-2.5" : "gap-3 px-3 pb-3 pt-3"
          )}
        >
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Day inspector</p>
            <h3 id={dayInspectorTitleId} className={cn("truncate font-semibold text-foreground", isMobileLayout ? "text-sm" : "text-base")}>
              {formatPanelDate(inspectorDate)}
            </h3>
          </div>
          {isMobileLayout ? (
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full border border-border/70 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {formatCurrency(selectedDayRevenue)}
              </span>
              <span className="rounded-full border border-border/70 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {selectedDayAgendaItems.length} jobs
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                {selectedDayDropoffs} drop-offs
              </span>
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                {selectedDayInShopCount} in shop
              </span>
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                {selectedDayPickups} pickups
              </span>
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                {selectedDayUnassigned} unassigned
              </span>
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                {selectedDayConflicts} conflicts
              </span>
            </div>
          )}
      </div>
      <div className={cn(isMobileLayout ? "mt-2" : "mt-3", useFlowingMonthInspector ? "overflow-visible" : "min-h-0 flex-1")}>
        <div className={cn("grid grid-cols-1 gap-3", useFlowingMonthInspector ? "h-auto" : "h-full min-h-0")}>
          <div
            className={cn(
              "flex flex-col rounded-[1.3rem] border border-border/60 bg-white/72",
              useFlowingMonthInspector
                ? "overflow-visible p-2.5"
                : isMobileLayout
                  ? "h-full min-h-[15.5rem] overflow-hidden p-2"
                  : "h-full min-h-[22rem] overflow-hidden p-3 xl:min-h-[25rem]"
            )}
          >
            <div className={cn("flex items-center justify-between gap-3", isMobileLayout ? "mb-2" : "mb-3")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {view === "month" ? "Selected date" : "Selected day"}
              </p>
              <span
                className={cn(
                  "rounded-full border border-border/70 bg-background text-[11px] font-medium text-muted-foreground",
                  isMobileLayout && view === "month" ? "px-3 py-1.5" : "px-2.5 py-1"
                )}
              >
                {selectedDayAgendaItems.length}
              </span>
            </div>
            {selectedDayAgendaItems.length > 0 ? (
              <div
                className={cn(
                  useFlowingMonthInspector
                    ? "space-y-2.5 pb-1"
                    : "min-h-0 flex-1 space-y-2 overflow-y-auto scroll-pb-8 pb-2",
                  isMobileLayout && !useFlowingMonthInspector
                    ? view === "month"
                      ? "touch-pan-y overscroll-contain px-0.5 pb-4 pr-0.5 pt-0.5 [-webkit-overflow-scrolling:touch]"
                      : "touch-pan-y overscroll-contain px-1 pb-4 pr-0.5 pt-0.5 [-webkit-overflow-scrolling:touch]"
                    : !useFlowingMonthInspector
                      ? "pr-1 pt-0.5"
                      : null
                )}
              >
                {selectedDayAgendaItems.map(({ appointment, kind }) => (
                  <AgendaPreviewRow
                    key={`${appointment.id}-${kind}-${view}`}
                    appointment={appointment}
                    kind={kind}
                    selected={selectedAppointmentId === appointment.id}
                    currentDate={inspectorDate}
                    onClick={() => handleApptClick(appointment)}
                    onLongPress={() => handleCalendarAppointmentLongPress(appointment)}
                    emphasized={isMobileLayout && view === "week"}
                  />
                ))}
                {isMobileLayout && !useFlowingMonthInspector ? <div aria-hidden="true" className="h-6 shrink-0" /> : null}
              </div>
            ) : (
              <div className={cn("rounded-2xl border border-dashed border-border/70 bg-muted/10", isMobileLayout ? "px-3 py-4" : "px-4 py-5")}>
                <p className="text-sm font-medium text-foreground">No appointments on this {view === "month" ? "date" : "day"}</p>
                {view === "month" && busiestMonthDay ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Busiest day this month: {formatPanelDate(busiestMonthDay.date)} ({busiestMonthDay.count})
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );

  const mobileWeekPanel = (
    <div className="surface-panel shrink-0 rounded-[1.2rem] p-2">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Week</p>
          <p className="text-sm font-semibold text-foreground">
            {formatPanelShortDate(mobileWeekDays[0] ?? currentDate)} - {formatPanelShortDate(mobileWeekDays[6] ?? currentDate)}
          </p>
        </div>
        <span className="rounded-full border border-border/70 bg-white/82 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Sun-Sat
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {mobileWeekDays.map((day) => {
          const dayKey = toLocalDateString(day);
          const selectedKey = toLocalDateString(selectedDate);
          const todayKey = toLocalDateString(new Date());
          const daySnapshot = getCalendarDaySnapshot(appointments, day);
          const isSelected = dayKey === selectedKey;
          const isTodayColumn = dayKey === todayKey;

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => {
                void triggerSelectionFeedback();
                setSelectedDate(day);
                setCurrentDate(day);
              }}
              className={cn(
                "native-touch-surface flex min-h-[4.35rem] flex-col items-center justify-between rounded-[1rem] border px-1.5 py-2 text-center transition-colors",
                isSelected
                  ? "border-foreground bg-foreground text-background shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
                  : "border-border/70 bg-white/84 text-foreground",
                isTodayColumn && !isSelected && "border-primary/35 bg-primary/[0.06]"
              )}
              aria-pressed={isSelected}
              aria-label={`Select ${formatPanelDate(day)}`}
            >
              <span className={cn("text-[10px] font-semibold uppercase tracking-[0.12em]", isSelected ? "text-background/70" : "text-muted-foreground")}>
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className="text-base font-semibold tabular-nums">{day.getDate()}</span>
              <span className={cn("text-[10px] font-semibold", isSelected ? "text-background/75" : "text-muted-foreground")}>
                {daySnapshot.agendaItems.length}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "page-content flex flex-col",
        isMobileLayout ? "h-auto min-h-full overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]" : "h-full min-h-0 overflow-hidden"
      )}
    >
      <div
        className={cn(
          "page-section flex min-h-0 flex-col gap-2.5 sm:gap-3",
          isMobileLayout ? "overflow-visible" : "flex-1 overflow-hidden"
        )}
      >
        <div className={cn("surface-panel shrink-0 overflow-hidden", isMobileLayout ? "rounded-[1.15rem]" : "rounded-[1.35rem] sm:rounded-[1.7rem]")}>
          <div className="border-b border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-4 py-3 sm:px-5">
            <div className={cn("flex flex-col", isMobileLayout ? "gap-2.5" : "gap-3 xl:flex-row xl:items-center xl:justify-between")}>
              <div className={cn("flex min-w-0 flex-1 flex-col", isMobileLayout ? "gap-2" : "gap-3")}>
                <div className={cn("flex flex-wrap items-center", isMobileLayout ? "gap-1.5" : "gap-2")}>
                  <h1 className={cn("font-semibold tracking-[-0.02em] text-foreground", isMobileLayout ? "text-sm" : "text-lg sm:text-xl")}>
                    {getHeaderTitle(visibleDate, view)}
                  </h1>
                  {activeLocationName ? (
                    <span className={cn("inline-flex items-center gap-1.5 text-muted-foreground", isMobileLayout ? "text-[11px]" : "text-sm")}>
                      <MapPin className="h-3.5 w-3.5" />
                      {activeLocationName}
                    </span>
                  ) : null}
                </div>

                <div className={cn(isMobileLayout ? "grid gap-2" : "flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center")}>
                  <div className={cn("inline-flex items-center rounded-full border border-white/70 bg-white/78 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_8px_20px_rgba(15,23,42,0.04)]", isMobileLayout ? "w-full justify-between" : "w-full sm:w-auto sm:justify-start")}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("rounded-full", isMobileLayout ? "h-6.5 w-6.5" : "h-10 w-10 sm:h-8 sm:w-8")}
                      onClick={handlePrev}
                      aria-label="Previous"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={isToday ? "default" : "secondary"}
                      size="sm"
                      className={cn("rounded-full font-semibold", isMobileLayout ? "h-6.5 px-3 text-[11px]" : "h-10 px-5 text-sm sm:h-8 sm:px-4 sm:text-sm")}
                      onClick={handleToday}
                    >
                      Today
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("rounded-full", isMobileLayout ? "h-6.5 w-6.5" : "h-10 w-10 sm:h-8 sm:w-8")}
                      onClick={handleNext}
                      aria-label="Next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {availableViews.length > 1 ? (
                    <div className={cn("inline-flex items-center overflow-x-auto rounded-full border border-white/70 bg-white/78 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_8px_20px_rgba(15,23,42,0.04)]", isMobileLayout ? "w-full flex-nowrap" : "w-full sm:w-auto")}>
                      {availableViews.map((calendarView) => (
                        <button
                          key={calendarView}
                          type="button"
                          onClick={() => handleViewChange(calendarView)}
                          aria-pressed={view === calendarView}
                          className={cn(
                            "shrink-0 rounded-full font-medium capitalize transition-colors",
                            isMobileLayout ? "min-h-8 flex-1 px-3 py-1.5 text-xs" : "px-4 py-1.5 text-sm",
                            view === calendarView
                              ? "bg-foreground text-background shadow-[0_8px_20px_rgba(15,23,42,0.18)]"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          {calendarView === "month" ? "Month" : "Week"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={cn("flex", isMobileLayout ? "gap-2" : "flex-col gap-2 sm:flex-row xl:shrink-0")}>
                <Button className={cn("rounded-2xl px-4", isMobileLayout ? "h-8 flex-1 text-[11px]" : "h-10")} onClick={handleNewAppointment}>
                  <Plus className="mr-2 h-4 w-4" />
                  {isMobileLayout ? "New" : "New appointment"}
                </Button>
                <Button
                  variant="outline"
                  className={cn("rounded-2xl border-border/70 bg-white/82 px-4", isMobileLayout ? "h-8 flex-1 text-[11px]" : "h-10")}
                  onClick={handleOpenBlockDialog}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  {isMobileLayout ? "Block" : "Block time"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <ConflictBanner
          staffConflictCount={conflictDismissed ? 0 : staffConflictIds.size}
          businessConflictCount={conflictDismissed ? 0 : businessConflictIds.size}
          onDismiss={() => setConflictDismissed(true)}
        />

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-rose-100 p-2 text-rose-700">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-rose-900">Calendar could not load</p>
                  <p className="mt-1 text-sm text-rose-800/90">{error.message}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="border-rose-300 bg-background text-rose-900 hover:bg-rose-100"
                onClick={() => refetchAppointments()}
                disabled={fetching}
              >
                {fetching ? "Retrying..." : "Try again"}
              </Button>
            </div>
          </div>
        ) : null}

        {view === "month" ? (
          <div
            className={cn(
              "min-h-0 flex-1 gap-3",
              isMobileLayout ? "flex flex-col overflow-visible" : "grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_24rem]"
            )}
          >
            <div
              className={cn(
                "flex min-h-0 flex-col gap-3 overflow-hidden",
                isMobileLayout && "h-[clamp(20rem,44dvh,23rem)] shrink-0"
              )}
            >
              <div
                className={cn(
                  "surface-panel h-full min-h-0 overflow-hidden rounded-[1.45rem] p-2.5 sm:rounded-[1.7rem] sm:p-3",
                  (isFirstLoad || rescheduling) && "pointer-events-none opacity-70"
                )}
              >
                <div className={cn("overflow-hidden", isMobileLayout ? "h-full min-h-0" : desktopMonthHeightClassName)}>
                  <MonthView
                    currentDate={visibleMonthDate}
                    selectedDate={selectedDate}
                    selectedAppointmentId={selectedAppointmentId}
                    appointments={appointments}
                    onDayClick={handleDayClick}
                    onApptClick={handleApptClick}
                    conflictIds={activeConflicts}
                    isMobileLayout={isMobileLayout}
                  />
                </div>
              </div>
              <div className={cn("flex shrink-0 justify-start", isMobileLayout && "hidden")}>
                <InlineMetricPill label="Month revenue" value={formatCurrency(selectedMonthRevenue)} />
              </div>
            </div>

            <div
              className={cn(
                "min-h-0",
                isMobileLayout
                  ? "surface-panel overflow-visible rounded-[1.45rem] p-2.5 sm:rounded-[1.7rem] sm:p-3"
                  : "flex h-full min-h-[24rem] overflow-hidden lg:min-h-0"
              )}
            >
              {isMobileLayout ? dayInspectorPanel : <div className="flex min-h-0 flex-1">{dayInspectorPanel}</div>}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {isMobileLayout ? (
              <>
                {mobileWeekPanel}
                <div className="surface-panel min-h-0 flex-1 overflow-hidden rounded-[1.45rem] p-2.5">
                  {dayInspectorPanel}
                </div>
              </>
            ) : (
              <div
                className={cn(
                  "surface-panel min-h-0 overflow-hidden rounded-[1.45rem] p-2.5 sm:rounded-[1.7rem] sm:p-3",
                  (isFirstLoad || rescheduling) && "pointer-events-none opacity-70"
                )}
              >
                <div className="h-[23rem] overflow-hidden xl:h-[clamp(24rem,46dvh,34rem)]">
                  <WeekView
                    currentDate={currentDate}
                    appointments={appointments}
                    onSlotClick={handleSlotClick}
                    onApptClick={handleApptClick}
                    onDayClick={(date) => {
                      setSelectedDate(date);
                      setCurrentDate(date);
                    }}
                    onReschedule={handleReschedule}
                    conflictIds={activeConflicts}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet
        open={calendarActionsOpen}
        onOpenChange={(open) => {
          setCalendarActionsOpen(open);
          if (!open) setCalendarActionsAppointment(null);
        }}
      >
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-[1.75rem] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>{calendarActionsAppointment ? getCalendarAppointmentLabel(calendarActionsAppointment) : "Appointment"}</SheetTitle>
            <SheetDescription>
              Long-press calendar cards to jump into the job, open the client, or contact them faster.
            </SheetDescription>
          </SheetHeader>
          {calendarActionsAppointment ? (
            <div className="mt-4 grid gap-2">
              <Button type="button" variant="outline" className="justify-start" onClick={() => handleOpenCalendarAppointmentRecord(calendarActionsAppointment)}>
                <CalendarDays className="mr-2 h-4 w-4" />
                Open appointment
              </Button>
              {calendarActionsAppointment.client?.id ? (
                <Button type="button" variant="outline" className="justify-start" onClick={() => handleOpenCalendarClientRecord(calendarActionsAppointment)}>
                  <Users className="mr-2 h-4 w-4" />
                  Open client
                </Button>
              ) : null}
              {normalizePhone(calendarActionsAppointment.client?.phone) ? (
                <Button asChild variant="outline" className="justify-start">
                  <a href={`tel:${normalizePhone(calendarActionsAppointment.client?.phone)}`} onClick={() => setCalendarActionsOpen(false)}>
                    <Phone className="mr-2 h-4 w-4" />
                    Call client {formatDisplayPhone(calendarActionsAppointment.client?.phone) ? `(${formatDisplayPhone(calendarActionsAppointment.client?.phone)})` : ""}
                  </a>
                </Button>
              ) : null}
              {normalizePhone(calendarActionsAppointment.client?.phone) ? (
                <Button asChild variant="outline" className="justify-start">
                  <a href={`sms:${normalizePhone(calendarActionsAppointment.client?.phone)}`} onClick={() => setCalendarActionsOpen(false)}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Text client
                  </a>
                </Button>
              ) : null}
              {calendarActionsAppointment.client?.email ? (
                <Button asChild variant="outline" className="justify-start">
                  <a href={`mailto:${calendarActionsAppointment.client.email}`} onClick={() => setCalendarActionsOpen(false)}>
                    <Mail className="mr-2 h-4 w-4" />
                    Email client
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={isAppointmentInspectorOpen}
        onOpenChange={(open) => {
          setIsAppointmentInspectorOpen(open);
          if (!open) setSelectedAppointmentId(null);
        }}
      >
        <DialogContent
          showCloseButton={!isMobileLayout}
          className={cn(
            "grid max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[1.25rem] p-0 sm:ml-auto sm:mr-4 sm:mt-6 sm:max-h-[calc(100dvh-3rem)] sm:w-[30rem] sm:max-w-[30rem] sm:rounded-[1.75rem] lg:w-[34rem] lg:max-w-[34rem]",
            isMobileLayout
              ? "h-[min(86dvh,46rem)] grid-rows-[minmax(0,1fr)] !border-0 !bg-transparent !p-0 !shadow-none"
              : "grid-rows-[auto_minmax(0,1fr)]"
          )}
        >
          {isMobileLayout ? (
            <>
              <DialogTitle className="sr-only">Appointment inspector</DialogTitle>
              <DialogDescription className="sr-only">
                Swipe horizontally between appointments on this day, or scroll vertically inside the selected appointment.
              </DialogDescription>
              {isAppointmentInspectorOpen ? (
                <MobileAppointmentGallery
                  appointments={sameDayGalleryAppointments}
                  selectedAppointmentId={selectedAppointmentId}
                  onSelectAppointment={setSelectedAppointmentId}
                  onAppointmentChange={() => refetchAppointments()}
                  onRequestClose={() => {
                    setIsAppointmentInspectorOpen(false);
                    setSelectedAppointmentId(null);
                  }}
                  emptyDescription={
                    view === "month"
                      ? "Choose a job from the month day list or calendar to inspect money, customer, vehicle, timing, and stage."
                      : "Choose a job from the day agenda or timeline to inspect money, customer, vehicle, timing, and stage."
                  }
                />
              ) : null}
            </>
          ) : (
            <>
              <DialogHeader className="border-b border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-left sm:py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Appointment inspector</p>
                <DialogTitle className="mt-1 text-lg font-semibold text-foreground">
                  {selectedAppointment ? getCalendarAppointmentLabel(selectedAppointment) : "Appointment"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Review appointment money, customer, vehicle, timing, and status details for the selected calendar job.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                {isAppointmentInspectorOpen ? (
                  <AppointmentInspectorPanel
                    appointment={selectedAppointment}
                    emptyTitle="Select an appointment"
                    emptyDescription={
                      view === "month"
                        ? "Choose a job from the month day list or calendar to inspect money, customer, vehicle, timing, and stage."
                        : "Choose a job from the day agenda or timeline to inspect money, customer, vehicle, timing, and stage."
                    }
                    compact={isMobileLayout}
                    onAppointmentChange={() => refetchAppointments()}
                    onRequestClose={() => {
                      setIsAppointmentInspectorOpen(false);
                      setSelectedAppointmentId(null);
                    }}
                  />
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showBlockDialog}
        onOpenChange={(open) => {
          setShowBlockDialog(open);
          if (!open) setEditingBlockId(null);
        }}
      >
        <DialogContent className="grid max-h-[calc(100dvh-2.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[1.5rem] p-0 sm:max-h-[min(46rem,calc(100dvh-4rem))] sm:max-w-lg sm:rounded-[1.75rem]">
          <DialogHeader>
            <div className="rounded-t-[1.75rem] border-b border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Ban className="h-3.5 w-3.5" />
                Unavailable time
              </div>
              <DialogTitle className="mt-3 text-left text-xl font-semibold tracking-[-0.03em] text-slate-950">
                {editingBlockId ? "Edit block" : "Block time"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {editingBlockId
                  ? "Adjust the blocked time window, coverage, team member, and internal notes."
                  : "Create a blocked time window, choose its coverage, assign it to a team member if needed, and add internal notes."}
              </DialogDescription>
            </div>
          </DialogHeader>
          <form className="flex h-full min-h-0 flex-col" onSubmit={handleCreateBlock}>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
              <div className="space-y-2.5">
                <Label htmlFor="block-mode">Coverage</Label>
                <div className="inline-flex w-full rounded-2xl border border-border/70 bg-muted/20 p-1">
                  {(
                    [
                      { value: "time", label: "Specific time" },
                      { value: "full-day", label: "Full day" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      id={option.value === "time" ? "block-mode" : undefined}
                      type="button"
                      onClick={() => setBlockMode(option.value)}
                      className={cn(
                        "flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        blockMode === option.value
                          ? "bg-white text-foreground shadow-sm"
                          : "text-muted-foreground"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-border/70 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <div className={cn("grid gap-3", blockMode === "full-day" ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
                  <div className="space-y-2">
                    <Label htmlFor="block-start-date">{blockMode === "time" ? "Date" : "Start date"}</Label>
                    <Input
                      id="block-start-date"
                      type="date"
                      value={blockStartDate}
                      onChange={(event) => {
                        setBlockStartDate(event.target.value);
                        if (blockMode === "time") setBlockEndDate(event.target.value);
                      }}
                      className={mobileDateInputClassName(isMobileLayout)}
                    />
                  </div>
                  {blockMode === "full-day" ? (
                    <div className="space-y-2">
                      <Label htmlFor="block-end-date">End date</Label>
                      <Input
                        id="block-end-date"
                        type="date"
                        value={blockEndDate}
                        onChange={(event) => setBlockEndDate(event.target.value)}
                        className={mobileDateInputClassName(isMobileLayout)}
                      />
                    </div>
                  ) : null}
                </div>

                {blockMode === "time" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="block-start-time">Start time</Label>
                      <ResponsiveTimeSelect
                        id="block-start-time"
                        value={blockStartTime}
                        onChange={setBlockStartTime}
                        options={timeOptions}
                        placeholder="Start time"
                        useNative={isMobileLayout}
                        desktopClassName={timeSelectTriggerClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="block-end-time">End time</Label>
                      <ResponsiveTimeSelect
                        id="block-end-time"
                        value={blockEndTime}
                        onChange={setBlockEndTime}
                        options={timeOptions}
                        placeholder="End time"
                        useNative={isMobileLayout}
                        desktopClassName={timeSelectTriggerClassName}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="block-staff">Team member</Label>
                <select
                  id="block-staff"
                  value={blockStaffId}
                  onChange={(event) => setBlockStaffId(event.target.value)}
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="none">Business-wide block</option>
                  {((staffRaw ?? []) as Array<{ id: string; firstName: string; lastName: string }>).map((staffMember) => (
                    <option key={staffMember.id} value={staffMember.id}>
                      {staffMember.firstName} {staffMember.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="block-notes">Internal note</Label>
                <Textarea
                  id="block-notes"
                  value={blockNotes}
                  onChange={(event) => setBlockNotes(event.target.value)}
                  placeholder="Optional note for the team..."
                  className="min-h-[96px] resize-none rounded-2xl"
                />
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 border-t border-border/60 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:px-6 sm:pb-6">
              <Button type="button" variant="outline" onClick={() => setShowBlockDialog(false)} disabled={creatingBlock} className="h-11 w-full rounded-xl sm:w-auto">
                Cancel
              </Button>
              <Button type="submit" disabled={creatingBlock || updatingBlock} className="h-11 w-full rounded-xl sm:w-auto">
                {creatingBlock || updatingBlock ? "Saving..." : editingBlockId ? "Save changes" : "Save block"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedBlock != null}
        onOpenChange={(open) => {
          if (!open) setSelectedBlock(null);
        }}
      >
        <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-[1.5rem] sm:max-w-md">
          {selectedBlock ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-left text-xl font-semibold tracking-[-0.03em] text-slate-950">
                  {getCalendarBlockLabel(selectedBlock)}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Review the blocked time details, coverage, assigned team member, and notes for this calendar block.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Coverage</dt>
                      <dd className="text-right font-medium text-foreground">
                        {isFullDayCalendarBlock(selectedBlock) ? "Full day" : "Specific time"}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Scheduled</dt>
                      <dd className="text-right font-medium text-foreground">
                        {isFullDayCalendarBlock(selectedBlock)
                          ? formatPanelDate(new Date(selectedBlock.startTime))
                          : `${formatPanelDate(new Date(selectedBlock.startTime))} · ${formatPanelTime(selectedBlock.startTime)} - ${formatPanelTime(selectedBlock.endTime)}`}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Applies to</dt>
                      <dd className="text-right font-medium text-foreground">
                        {selectedBlock.assignedStaff
                          ? `${selectedBlock.assignedStaff.firstName} ${selectedBlock.assignedStaff.lastName}`
                          : "Business-wide"}
                      </dd>
                    </div>
                    {activeLocationName ? (
                      <div className="flex items-start justify-between gap-4">
                        <dt className="text-muted-foreground">Location</dt>
                        <dd className="text-right font-medium text-foreground">{activeLocationName}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
                {getCalendarBlockNote(selectedBlock.internalNotes) ? (
                  <div className="space-y-2">
                    <Label>Internal note</Label>
                    <div className="rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm leading-6 text-foreground">
                      {getCalendarBlockNote(selectedBlock.internalNotes)}
                    </div>
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedBlock(null)}>
                  Close
                </Button>
                <Button type="button" variant="outline" onClick={() => handleEditBlock(selectedBlock)}>
                  Edit block
                </Button>
                <Button type="button" variant="destructive" onClick={() => void handleUnblock(selectedBlock)} disabled={unblockingBlock}>
                  {unblockingBlock ? "Removing..." : "Unblock"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

    </div>
  );
}
