import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { cn } from "@/lib/utils";
import {
  getMultiDayDayKind,
  getMultiDayDayLabel,
  getMultiDayDayShortLabel,
  getMultiDayDayTone,
  getJobSpanEnd,
  getJobSpanStart,
  getOperationalDayLabel,
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
  isSameDay,
  formatHour,
  getWeekDays,
  type ApptRecord,
  AppointmentBlock,
  StaffWorkloadBar,
  activeDragDurationMs,
  getCalendarAppointmentAmount,
} from "./CalendarViews";
import { NativeContextActions } from "@/components/mobile/NativeContextActions";
import { triggerNativeFeedback } from "@/lib/nativeInteractions";

interface WeekViewProps {
  currentDate: Date;
  appointments: ApptRecord[];
  onSlotClick: (date: Date) => void;
  onApptClick: (apt: ApptRecord, dayContext?: Date) => void;
  onDayClick?: (date: Date) => void;
  onWeekNavigate?: (direction: -1 | 1) => void;
  onReschedule?: (appointmentId: string, newStart: Date, newEnd: Date | null) => void;
  conflictIds?: Set<string>;
}

type MobileWeekSwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  axis: "pending" | "horizontal" | "vertical";
  captured: boolean;
};

type PositionedWeekAppointment = {
  appointment: ApptRecord;
  leftCss: string;
  widthCss: string;
  zIndex: number;
};

const MOBILE_WEEK_SWIPE_INTENT_PX = 12;
const MOBILE_WEEK_SWIPE_THRESHOLD_PX = 36;
const MOBILE_WEEK_MIN_TRANSITION_PX = 180;
const MOBILE_WEEK_MAX_TRANSITION_PX = 360;

export function WeekView({
  currentDate,
  appointments,
  onSlotClick,
  onApptClick,
  onDayClick,
  onWeekNavigate,
  onReschedule,
  conflictIds,
}: WeekViewProps) {
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const today = useMemo(() => new Date(), []);
  const [dragOverInfo, setDragOverInfo] = useState<{ dayIndex: number; hour: number; minute: number } | null>(null);
  const [mobileWeekSwipeOffset, setMobileWeekSwipeOffset] = useState(0);
  const [mobileWeekSwipeAnimating, setMobileWeekSwipeAnimating] = useState(false);
  const [focusedDayIndex, setFocusedDayIndex] = useState(() =>
    Math.max(0, getWeekDays(currentDate).findIndex((day) => isSameDay(day, currentDate)))
  );
  const mobileWeekSwipeRef = useRef<MobileWeekSwipeGesture | null>(null);
  const mobileWeekTouchRef = useRef<MobileWeekSwipeGesture | null>(null);
  const mobileWeekTransitionTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const mobileWeekSettleTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const suppressMobileDayTapRef = useRef(false);

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
    const currentIndex = weekDays.findIndex((day) => isSameDay(day, currentDate));
    const todayIndex = weekDays.findIndex((day) => isSameDay(day, today));
    setFocusedDayIndex(currentIndex >= 0 ? currentIndex : Math.max(0, todayIndex));
  }, [currentDate, today, weekDays]);

  useEffect(() => {
    return () => {
      if (mobileWeekTransitionTimeoutRef.current) {
        window.clearTimeout(mobileWeekTransitionTimeoutRef.current);
      }
      if (mobileWeekSettleTimeoutRef.current) {
        window.clearTimeout(mobileWeekSettleTimeoutRef.current);
      }
    };
  }, []);

  const clearMobileWeekTransitionTimers = () => {
    if (mobileWeekTransitionTimeoutRef.current) {
      window.clearTimeout(mobileWeekTransitionTimeoutRef.current);
      mobileWeekTransitionTimeoutRef.current = null;
    }
    if (mobileWeekSettleTimeoutRef.current) {
      window.clearTimeout(mobileWeekSettleTimeoutRef.current);
      mobileWeekSettleTimeoutRef.current = null;
    }
  };

  const getMobileWeekTransitionDistance = () => {
    if (typeof window === "undefined") return 220;
    return Math.min(
      MOBILE_WEEK_MAX_TRANSITION_PX,
      Math.max(MOBILE_WEEK_MIN_TRANSITION_PX, Math.round(window.innerWidth * 0.72))
    );
  };

  const clampMobileWeekDrag = (offset: number) => {
    const transitionDistance = getMobileWeekTransitionDistance();
    return Math.max(-transitionDistance, Math.min(transitionDistance, offset));
  };

  const resetSuppressedDayTap = () => {
    window.setTimeout(() => {
      suppressMobileDayTapRef.current = false;
    }, 120);
  };

  const runMobileWeekTransition = (direction: -1 | 1) => {
    if (!onWeekNavigate) return;
    clearMobileWeekTransitionTimers();
    const transitionDistance = getMobileWeekTransitionDistance();
    triggerNativeFeedback("light");
    setMobileWeekSwipeAnimating(true);
    setMobileWeekSwipeOffset(direction === 1 ? -transitionDistance : transitionDistance);

    mobileWeekTransitionTimeoutRef.current = window.setTimeout(() => {
      onWeekNavigate(direction);
      setMobileWeekSwipeAnimating(false);
      setMobileWeekSwipeOffset(direction === 1 ? transitionDistance : -transitionDistance);

      mobileWeekSettleTimeoutRef.current = window.setTimeout(() => {
        setMobileWeekSwipeAnimating(true);
        setMobileWeekSwipeOffset(0);
        mobileWeekTransitionTimeoutRef.current = window.setTimeout(() => {
          setMobileWeekSwipeAnimating(false);
        }, 210);
      }, 20);
    }, 150);
  };

  const startMobileWeekTouch = (clientX: number, clientY: number) => {
    if (!onWeekNavigate) return;
    clearMobileWeekTransitionTimers();
    setMobileWeekSwipeAnimating(false);
    mobileWeekSwipeRef.current = null;
    mobileWeekTouchRef.current = {
      pointerId: -1,
      startX: clientX,
      startY: clientY,
      axis: "pending",
      captured: false,
    };
  };

  const moveMobileWeekTouch = (clientX: number, clientY: number, preventDefault: () => void) => {
    const gesture = mobileWeekTouchRef.current;
    if (!gesture) return;

    const dx = clientX - gesture.startX;
    const dy = clientY - gesture.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (gesture.axis === "pending") {
      if (absX < MOBILE_WEEK_SWIPE_INTENT_PX && absY < MOBILE_WEEK_SWIPE_INTENT_PX) return;
      if (absY > absX) {
        gesture.axis = "vertical";
        return;
      }
      if (absX > absY + 6) {
        gesture.axis = "horizontal";
        gesture.captured = true;
        suppressMobileDayTapRef.current = true;
      }
    }

    if (gesture.axis !== "horizontal") return;
    preventDefault();
    setMobileWeekSwipeOffset(clampMobileWeekDrag(dx * 0.86));
  };

  const finishMobileWeekTouch = (clientX: number, clientY: number) => {
    const gesture = mobileWeekTouchRef.current;
    if (!gesture) return;

    const dx = clientX - gesture.startX;
    const dy = clientY - gesture.startY;
    const axis = gesture.axis;
    mobileWeekTouchRef.current = null;

    if (axis !== "horizontal") {
      setMobileWeekSwipeOffset(0);
      return;
    }

    resetSuppressedDayTap();
    const shouldNavigate =
      Math.abs(dx) >= MOBILE_WEEK_SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.08;
    if (!shouldNavigate) {
      setMobileWeekSwipeAnimating(true);
      setMobileWeekSwipeOffset(0);
      mobileWeekTransitionTimeoutRef.current = window.setTimeout(() => {
        setMobileWeekSwipeAnimating(false);
      }, 180);
      return;
    }

    runMobileWeekTransition(dx < 0 ? 1 : -1);
  };

  const cancelMobileWeekTouch = () => {
    mobileWeekTouchRef.current = null;
    setMobileWeekSwipeAnimating(true);
    setMobileWeekSwipeOffset(0);
    mobileWeekTransitionTimeoutRef.current = window.setTimeout(() => {
      setMobileWeekSwipeAnimating(false);
    }, 180);
  };

  const handleMobileWeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onWeekNavigate) return;
    if (event.pointerType === "touch") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (mobileWeekTouchRef.current) return;
    clearMobileWeekTransitionTimers();
    setMobileWeekSwipeAnimating(false);
    mobileWeekSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: "pending",
      captured: false,
    };
  };

  const handleMobileWeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = mobileWeekSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (gesture.axis === "pending") {
      if (absX < MOBILE_WEEK_SWIPE_INTENT_PX && absY < MOBILE_WEEK_SWIPE_INTENT_PX) return;
      if (absY > absX) {
        gesture.axis = "vertical";
        return;
      }
      if (absX > absY + 8) {
        gesture.axis = "horizontal";
        gesture.captured = true;
        suppressMobileDayTapRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    if (gesture.axis !== "horizontal") return;
    event.preventDefault();
    setMobileWeekSwipeOffset(clampMobileWeekDrag(dx * 0.86));
  };

  const finishMobileWeekSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = mobileWeekSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const axis = gesture.axis;
    const captured = gesture.captured;
    mobileWeekSwipeRef.current = null;

    if (captured && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (axis !== "horizontal") {
      setMobileWeekSwipeOffset(0);
      return;
    }

    resetSuppressedDayTap();
    const shouldNavigate =
      Math.abs(dx) >= MOBILE_WEEK_SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.08;
    if (!shouldNavigate) {
      setMobileWeekSwipeAnimating(true);
      setMobileWeekSwipeOffset(0);
      mobileWeekTransitionTimeoutRef.current = window.setTimeout(() => {
        setMobileWeekSwipeAnimating(false);
      }, 180);
      return;
    }

    runMobileWeekTransition(dx < 0 ? 1 : -1);
  };

  const handleMobileWeekTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    startMobileWeekTouch(touch.clientX, touch.clientY);
  };

  const handleMobileWeekTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    moveMobileWeekTouch(touch.clientX, touch.clientY, () => event.preventDefault());
  };

  const handleMobileWeekTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    finishMobileWeekTouch(touch.clientX, touch.clientY);
  };

  const cancelMobileWeekSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = mobileWeekSwipeRef.current;
    if (gesture?.captured && event.currentTarget.hasPointerCapture(gesture.pointerId)) {
      event.currentTarget.releasePointerCapture(gesture.pointerId);
    }
    mobileWeekSwipeRef.current = null;
    setMobileWeekSwipeAnimating(true);
    setMobileWeekSwipeOffset(0);
    mobileWeekTransitionTimeoutRef.current = window.setTimeout(() => {
      setMobileWeekSwipeAnimating(false);
    }, 180);
  };

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

  const daySummaries = useMemo(
    () => weekDays.map((day) => getWeekDaySummary(day, appointments, conflictIds)),
    [appointments, conflictIds, weekDays]
  );
  const positionedDayAppointments = useMemo(() => {
    const map = new Map<string, PositionedWeekAppointment[]>();
    weekDays.forEach((day) => {
      const dayAppts = appointments.filter((apt) => hasLaborOnDay(apt, day));
      map.set(toDayKey(day), getPositionedWeekAppointments(dayAppts));
    });
    return map;
  }, [appointments, weekDays]);
  const mobileWeekPages = useMemo(
    () =>
      [-1, 0, 1].map((offset) => {
        const anchor = new Date(currentDate);
        anchor.setDate(anchor.getDate() + offset * 7);
        const days = offset === 0 ? weekDays : getWeekDays(anchor);
        return {
          offset,
          summaries: days.map((day) => getWeekDaySummary(day, appointments, conflictIds)),
        };
      }),
    [appointments, conflictIds, currentDate, weekDays]
  );
  const focusedSummary = daySummaries[focusedDayIndex] ?? daySummaries[0];
  const weekTotalItems = daySummaries.reduce((sum, summary) => sum + summary.totalItems, 0);
  const weekTotalValue = daySummaries.reduce((sum, summary) => sum + summary.totalValue, 0);
  const mobileWeekMotionStyle = {
    transform: `translate3d(${mobileWeekSwipeOffset}px, 0, 0)`,
    opacity: Math.max(0.76, 1 - Math.min(Math.abs(mobileWeekSwipeOffset) / 420, 0.24)),
  };
  const mobileWeekMotionClassName = cn(
    "will-change-transform",
    mobileWeekSwipeAnimating && "ios-swipe-transition"
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background/95 shadow-sm">
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="shrink-0 border-b border-border/70 bg-white/94 px-3 py-2.5 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Week</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                {formatMobileDate(weekDays[0])} - {formatMobileDate(weekDays[6])}
              </p>
            </div>
            <div className="shrink-0 rounded-full border border-border/65 bg-muted/20 px-3 py-1.5 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {weekTotalItems} items
              </p>
              <p className="text-[11px] font-semibold text-foreground">{formatCompactCurrency(weekTotalValue)}</p>
            </div>
          </div>

          <div
            data-week-date-carousel="true"
            className="mt-2 overflow-hidden rounded-[1.1rem]"
            role="group"
            aria-label="Swipe week dates for previous or next week"
            onPointerDown={handleMobileWeekPointerDown}
            onPointerMove={handleMobileWeekPointerMove}
            onPointerUp={finishMobileWeekSwipe}
            onPointerCancel={cancelMobileWeekSwipe}
            onTouchStart={handleMobileWeekTouchStart}
            onTouchMove={handleMobileWeekTouchMove}
            onTouchEnd={handleMobileWeekTouchEnd}
            onTouchCancel={cancelMobileWeekTouch}
          >
            <div
              className={cn("flex select-none", mobileWeekMotionClassName)}
              style={{
                width: `${mobileWeekPages.length * 100}%`,
                transform: `translate3d(calc(-${100 / mobileWeekPages.length}% + ${mobileWeekSwipeOffset}px), 0, 0)`,
              }}
            >
              {mobileWeekPages.map((page) => (
                <div
                  key={page.offset}
                  className="min-w-0 px-0.5"
                  style={{ flexBasis: `${100 / mobileWeekPages.length}%` }}
                >
                  <div className="grid select-none grid-cols-7 gap-1 rounded-[1.1rem]">
                    {page.summaries.map((summary, index) => {
                      const selected = page.offset === 0 && index === focusedDayIndex;
                      const isToday = isSameDay(summary.day, today);
                      return (
                        <button
                          key={`${page.offset}-${summary.day.toISOString()}`}
                          type="button"
                          data-week-day-card="true"
                          data-selected={selected ? "true" : "false"}
                          className={cn(
                            "min-w-0 rounded-[1rem] border px-1 py-1.5 text-center transition-all active:scale-[0.98]",
                            selected
                              ? "border-primary/45 bg-primary/[0.08] shadow-sm"
                              : "border-border/60 bg-white/78 active:bg-muted/30",
                            isToday && !selected && "border-primary/25"
                          )}
                          onClick={() => {
                            if (suppressMobileDayTapRef.current) return;
                            if (page.offset === 0) {
                              setFocusedDayIndex(index);
                            }
                            onDayClick?.(summary.day);
                          }}
                          aria-pressed={selected}
                        >
                          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{DAY_NAMES[index]}</p>
                          <span
                            className={cn(
                              "mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                              selected ? "bg-primary text-primary-foreground" : isToday ? "bg-primary/10 text-primary" : "bg-muted text-foreground"
                            )}
                          >
                            {summary.day.getDate()}
                          </span>
                          <span
                            className={cn(
                              "mx-auto mt-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-none",
                              summary.totalItems > 0 ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground"
                            )}
                          >
                            {summary.totalItems > 0 ? summary.totalItems : "·"}
                          </span>
                          {summary.conflictCount > 0 ? (
                            <span className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-rose-500" aria-label={`${summary.conflictCount} conflicts`} />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ios-momentum-y min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          {focusedSummary ? (
            <div className={cn("space-y-2.5", mobileWeekMotionClassName)} style={mobileWeekMotionStyle}>
              <div className="rounded-[1.25rem] border border-border/70 bg-white/88 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {focusedSummary.day.toLocaleDateString("en-US", { weekday: "long" })}
                    </p>
                    <p className="mt-0.5 truncate text-base font-semibold tracking-tight text-foreground">
                      {focusedSummary.day.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm active:scale-[0.98]"
                    onClick={() => {
                      const slot = new Date(focusedSummary.day);
                      slot.setHours(9, 0, 0, 0);
                      onSlotClick(slot);
                    }}
                  >
                    Add 9 AM
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <MobileWeekSignal label="Booked" value={String(focusedSummary.labor.length)} />
                  <MobileWeekSignal label="On site" value={String(focusedSummary.onsiteOnly.length)} />
                  <MobileWeekSignal label="Value" value={formatCompactCurrency(focusedSummary.totalValue)} />
                </div>
              </div>

              {focusedSummary.labor.length === 0 && focusedSummary.onsiteOnly.length === 0 ? (
                <button
                  type="button"
                  className="w-full rounded-[1.35rem] border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground"
                  onClick={() => {
                    const slot = new Date(focusedSummary.day);
                    slot.setHours(9, 0, 0, 0);
                    onSlotClick(slot);
                  }}
                >
                  No appointments on this day. Tap to create one.
                </button>
              ) : null}

              {focusedSummary.labor.length > 0 ? (
                <MobileWeekGroup title="Scheduled work">
                  {focusedSummary.labor.map((appointment) => (
                    <MobileWeekAppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      currentDate={focusedSummary.day}
                      conflict={conflictIds?.has(appointment.id)}
                      onOpen={() => onApptClick(appointment, focusedSummary.day)}
                    />
                  ))}
                </MobileWeekGroup>
              ) : null}

              {focusedSummary.onsiteOnly.length > 0 ? (
                <MobileWeekGroup title="In shop / multi-day">
                  {focusedSummary.onsiteOnly.map((appointment) => (
                    <MobileWeekAppointmentCard
                      key={`${appointment.id}-onsite`}
                      appointment={appointment}
                      currentDate={focusedSummary.day}
                      mode="onsite"
                      conflict={conflictIds?.has(appointment.id)}
                      onOpen={() => onApptClick(appointment, focusedSummary.day)}
                    />
                  ))}
                </MobileWeekGroup>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="ios-momentum-x hidden min-h-0 flex-1 overflow-x-auto overscroll-x-contain lg:block">
        <div className="flex h-full min-w-[46rem] flex-col lg:min-w-0">
      <div
        className={cn(
          "ios-touch-pan-y sticky top-0 z-10 grid select-none grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-border/70 bg-background/95 backdrop-blur-sm",
          mobileWeekMotionClassName
        )}
        style={mobileWeekMotionStyle}
        data-week-date-strip="wide"
        role="group"
        aria-label="Swipe week dates for previous or next week"
        onPointerDown={handleMobileWeekPointerDown}
        onPointerMove={handleMobileWeekPointerMove}
        onPointerUp={finishMobileWeekSwipe}
        onPointerCancel={cancelMobileWeekSwipe}
        onTouchStart={handleMobileWeekTouchStart}
        onTouchMove={handleMobileWeekTouchMove}
        onTouchEnd={handleMobileWeekTouchEnd}
        onTouchCancel={cancelMobileWeekTouch}
      >
        <div className="border-r border-border/60 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Hours</p>
        </div>
        {weekDays.map((day, di) => {
          const isToday = isSameDay(day, today);
          const bookedCount = appointments.filter((apt) => hasLaborOnDay(apt, day)).length;
          const onSiteCount = appointments.filter((apt) => isMultiDayJob(apt) && hasPresenceOnDay(apt, day)).length;
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
                  onClick={() => onApptClick(apt, weekDays[startIndex] ?? currentDate)}
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
                    {getMultiDayDayShortLabel(getMultiDayDayKind(apt, weekDays[startIndex] ?? currentDate))}
                  </span>
                  <span className="truncate font-medium text-foreground">{apt.title || apt.vehicle?.model || apt.client?.lastName || "Job"}</span>
                  <span className="hidden truncate rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground md:inline-flex">
                    {`${weekDays[startIndex]?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? ""} to ${weekDays[endIndex]?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? ""}`}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      <StaffWorkloadBar appointments={appointments} />

      <div id="week-scroll-container" className="ios-momentum-y flex-1 overflow-y-auto">
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
            const dayAppts = positionedDayAppointments.get(toDayKey(day)) ?? [];
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

                {dayAppts.map(({ appointment, leftCss, widthCss, zIndex }) => (
                  <AppointmentBlock
                    key={appointment.id}
                    apt={appointment}
                    dayContext={day}
                    layout="week"
                    onClick={(event) => {
                      event.stopPropagation();
                      onApptClick(appointment, day);
                    }}
                    isConflict={conflictIds?.has(appointment.id)}
                    leftCss={leftCss}
                    widthCss={widthCss}
                    zIndex={zIndex}
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

function MobileWeekSignal({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      <span className="text-foreground">{value}</span>
      {label}
    </span>
  );
}

function MobileWeekGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MobileWeekAppointmentCard({
  appointment,
  currentDate,
  conflict,
  mode = "timed",
  onOpen,
}: {
  appointment: ApptRecord;
  currentDate: Date;
  conflict?: boolean;
  mode?: "timed" | "onsite";
  onOpen: () => void;
}) {
  const amount = getCalendarAppointmentAmount(appointment);
  const multiDayKind = getMultiDayDayKind(appointment, currentDate);
  const phaseLabel = multiDayKind ? getMultiDayDayLabel(multiDayKind) : getOperationalDayLabel(appointment, currentDate);
  const phaseShortLabel = multiDayKind ? getMultiDayDayShortLabel(multiDayKind) : getOperationalDayLabel(appointment, currentDate);
  const timeLabel = mode === "onsite" ? "On site" : formatAppointmentTimeRange(appointment);
  const windowLabel = isMultiDayJob(appointment) ? formatJobWindow(appointment) : null;
  const title = getAppointmentTitle(appointment);
  const clientLabel = getClientLabel(appointment);
  const vehicleLabel = getVehicleLabel(appointment);

  return (
    <NativeContextActions
      label={title}
      actions={[
        { label: "Open appointment", detail: windowLabel ? `${phaseLabel} · ${windowLabel}` : timeLabel, onSelect: onOpen },
        {
          label: "New appointment this day",
          detail: currentDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
          href: `/appointments/new?date=${toDayKey(currentDate)}&from=${encodeURIComponent(`/calendar?view=week&date=${toDayKey(currentDate)}`)}`,
        },
      ]}
    >
      <button
        type="button"
        className={cn(
          "relative w-full overflow-hidden rounded-[1.2rem] border bg-white/94 px-3.5 py-3 text-left shadow-sm transition-colors active:scale-[0.99]",
          conflict ? "border-rose-200 bg-rose-50/65" : "border-border/65 hover:bg-white"
        )}
        onClick={onOpen}
      >
        <span
          className={cn(
            "absolute inset-y-3 left-0 w-1 rounded-r-full",
            multiDayKind ? getMultiDayDayTone(multiDayKind) : conflict ? "bg-rose-500" : "bg-primary"
          )}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-border/65 bg-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground">
                {timeLabel}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
                  multiDayKind ? `${getMultiDayDayTone(multiDayKind)} text-white` : "bg-muted text-muted-foreground"
                )}
              >
                {phaseShortLabel}
              </span>
              {conflict ? (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-rose-700">
                  Conflict
                </span>
              ) : null}
            </div>
            {amount > 0 ? (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {formatCompactCurrency(amount)}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold leading-5 text-foreground">{title}</p>
          <div className="mt-1 min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">{clientLabel}</p>
            {vehicleLabel ? <p className="mt-0.5 truncate text-xs text-muted-foreground/90">{vehicleLabel}</p> : null}
            {windowLabel ? (
              <p className="mt-1 truncate text-[11px] font-medium text-muted-foreground/90">
                {phaseLabel} · {windowLabel}
              </p>
            ) : null}
          </div>
        </div>
      </button>
    </NativeContextActions>
  );
}

function getPositionedWeekAppointments(dayAppointments: ApptRecord[]): PositionedWeekAppointment[] {
  const sorted = [...dayAppointments].sort((a, b) => {
    const startDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    if (startDiff !== 0) return startDiff;
    const aEnd = a.endTime ? new Date(a.endTime).getTime() : new Date(a.startTime).getTime() + 3600000;
    const bEnd = b.endTime ? new Date(b.endTime).getTime() : new Date(b.startTime).getTime() + 3600000;
    return aEnd - bEnd;
  });

  const gutter = 4;
  const horizontalInset = 4;
  const positioned: PositionedWeekAppointment[] = [];
  let index = 0;

  while (index < sorted.length) {
    const cluster: ApptRecord[] = [];
    let clusterEnd = 0;

    while (index < sorted.length) {
      const appointment = sorted[index];
      const startMs = new Date(appointment.startTime).getTime();
      const endMs = appointment.endTime ? new Date(appointment.endTime).getTime() : startMs + 3600000;

      if (cluster.length === 0 || startMs < clusterEnd) {
        cluster.push(appointment);
        clusterEnd = Math.max(clusterEnd, endMs);
        index += 1;
        continue;
      }
      break;
    }

    const lanes: Array<Array<{ startMs: number; endMs: number }>> = [];
    const laneAssignments = new Map<string, number>();

    for (const appointment of cluster) {
      const startMs = new Date(appointment.startTime).getTime();
      const endMs = appointment.endTime ? new Date(appointment.endTime).getTime() : startMs + 3600000;
      let laneIndex = lanes.findIndex((lane) => lane[lane.length - 1]!.endMs <= startMs);

      if (laneIndex === -1) {
        laneIndex = lanes.length;
        lanes.push([]);
      }

      lanes[laneIndex]!.push({ startMs, endMs });
      laneAssignments.set(appointment.id, laneIndex);
    }

    const maxColumns = Math.max(lanes.length, 1);
    const widthCss = `calc((100% - ${horizontalInset * 2}px - ${(maxColumns - 1) * gutter}px) / ${maxColumns})`;

    for (const appointment of cluster) {
      const laneIndex = laneAssignments.get(appointment.id) ?? 0;
      positioned.push({
        appointment,
        leftCss: `calc(${horizontalInset}px + (${laneIndex} * (${widthCss} + ${gutter}px)))`,
        widthCss,
        zIndex: 20 + laneIndex,
      });
    }
  }

  return positioned;
}

function getWeekDaySummary(day: Date, appointments: ApptRecord[], conflictIds?: Set<string>) {
  const labor = appointments
    .filter((apt) => hasLaborOnDay(apt, day))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const onsiteOnly = appointments
    .filter((apt) => isMultiDayJob(apt) && hasPresenceOnDay(apt, day) && !hasLaborOnDay(apt, day))
    .sort((a, b) => getJobSortTime(a).getTime() - getJobSortTime(b).getTime());
  const totalValue = labor.reduce((sum, apt) => sum + getCalendarAppointmentAmount(apt), 0);

  return {
    day,
    labor,
    onsiteOnly,
    totalItems: labor.length + onsiteOnly.length,
    conflictCount: labor.filter((apt) => conflictIds?.has(apt.id)).length,
    totalValue,
  };
}

function getJobSortTime(appointment: ApptRecord) {
  return new Date(appointment.jobStartTime ?? appointment.startTime);
}

function getAppointmentTitle(appointment: ApptRecord) {
  if (appointment.title?.trim()) return appointment.title.trim();
  const clientLabel = getClientLabel(appointment);
  if (clientLabel !== "Internal") return clientLabel;
  return "Appointment";
}

function getClientLabel(appointment: ApptRecord) {
  return appointment.client
    ? [appointment.client.firstName, appointment.client.lastName].filter(Boolean).join(" ").trim() || "Client"
    : "Internal";
}

function getVehicleLabel(appointment: ApptRecord) {
  return appointment.vehicle
    ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
    : "";
}

function formatAppointmentTimeRange(appointment: ApptRecord) {
  const start = new Date(appointment.startTime);
  const end = appointment.endTime ? new Date(appointment.endTime) : null;
  return end ? `${formatShortTime(start)}-${formatShortTime(end)}` : formatShortTime(start);
}

function formatShortTime(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" ", "");
}

function formatMobileDate(date: Date | undefined) {
  if (!date) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatJobWindow(appointment: ApptRecord) {
  const start = getJobSpanStart(appointment);
  const end = getJobSpanEnd(appointment);
  if (isSameDay(start, end)) return formatMobileDate(start);
  return `${formatMobileDate(start)} - ${formatMobileDate(end)}`;
}

function formatCompactCurrency(value: number) {
  if (value <= 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 0,
  }).format(value);
}

function toDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
