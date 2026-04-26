import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { endOfWeek, format, isToday, startOfWeek } from "date-fns";
import { Link, useLocation, useNavigate, useOutletContext } from "react-router";
import { ArrowUpRight, CalendarRange, ChevronLeft, ChevronRight, Inbox, Mail, MessageSquare, Phone, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { api, ApiError } from "../api";
import { useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { getCalendarAppointmentAmount, getCalendarDayRevenue } from "@/components/CalendarViews";
import { isNativeIOSApp } from "@/lib/mobileShell";
import {
  getJobPhaseLabel,
  getJobPhaseTone,
  getOperationalDayLabel,
  getOperationalTimelineLabel,
  getJobSpanEnd,
  getJobSpanStart,
  hasLaborOnDay,
  hasPresenceOnDay,
  isMultiDayJob,
} from "@/lib/calendarJobSpans";
import { isCalendarBlockAppointment } from "@/lib/calendarBlocks";
import { cn } from "@/lib/utils";
import { triggerImpactFeedback, triggerSelectionFeedback } from "@/lib/nativeInteractions";
import { getDateSearchAliases, smartSearchMatches } from "@/lib/smartSearch";

type StaffRecord = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
};

type LocationRecord = {
  id: string;
  name?: string | null;
};

type AppointmentRecord = {
  id: string;
  businessId?: string | null;
  title?: string | null;
  status?: string | null;
  startTime: string;
  endTime?: string | null;
  jobStartTime?: string | null;
  expectedCompletionTime?: string | null;
  pickupReadyTime?: string | null;
  vehicleOnSite?: boolean | null;
  jobPhase?: string | null;
  subtotal?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  applyTax?: boolean | null;
  adminFeeRate?: number | null;
  adminFeeAmount?: number | null;
  applyAdminFee?: boolean | null;
  totalPrice?: number | null;
  depositAmount?: number | null;
  paidAt?: string | null;
  collectedAmount?: number | null;
  balanceDue?: number | null;
  paidInFull?: boolean | null;
  depositSatisfied?: boolean | null;
  assignedStaffId?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  location?: { name?: string | null } | null;
  client?: { id?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null } | null;
  vehicle?: { id?: string | null; year?: number | null; make?: string | null; model?: string | null } | null;
  assignedStaff?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
};

type DaySnapshot = {
  date: Date;
  jobs: AppointmentRecord[];
  dropOffs: AppointmentRecord[];
  timedWork: AppointmentRecord[];
  inShop: AppointmentRecord[];
  pickups: AppointmentRecord[];
};

const SCHEDULE_SCROLL_STORAGE_KEY = "strata:schedule:scroll-position";

function getAppScrollContainer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("main.app-native-scroll");
}

function captureScheduleScrollPosition(routeKey: string) {
  if (typeof window === "undefined") return;
  const container = getAppScrollContainer();
  const top = container?.scrollTop ?? window.scrollY ?? 0;
  window.sessionStorage.setItem(
    SCHEDULE_SCROLL_STORAGE_KEY,
    JSON.stringify({ routeKey, top })
  );
}

function scrollScheduleToTop() {
  if (typeof window === "undefined") return;
  const container = getAppScrollContainer();
  if (container) {
    container.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getClientName(appointment: AppointmentRecord): string {
  return [appointment.client?.firstName, appointment.client?.lastName].filter(Boolean).join(" ").trim();
}

function getVehicleLabel(appointment: AppointmentRecord): string {
  return [appointment.vehicle?.year, appointment.vehicle?.make, appointment.vehicle?.model].filter(Boolean).join(" ").trim();
}

function getTechName(appointment: AppointmentRecord): string {
  const techName = [appointment.assignedStaff?.firstName, appointment.assignedStaff?.lastName].filter(Boolean).join(" ").trim();
  return techName || "Unassigned";
}

function getAppointmentLabel(appointment: AppointmentRecord): string {
  if (appointment.title?.trim()) return appointment.title.trim();
  const clientName = getClientName(appointment);
  if (clientName) return clientName;
  if (isCalendarBlockAppointment(appointment)) return "Blocked time";
  return "Internal block";
}

function getAppointmentSearchParts(appointment: AppointmentRecord): unknown[] {
  const status = String(appointment.status ?? "").replace(/[_-]/g, " ");
  const phase = getJobPhaseLabel(appointment.jobPhase);
  return [
    getAppointmentLabel(appointment),
    getClientName(appointment),
    appointment.client?.phone,
    appointment.client?.email,
    getVehicleLabel(appointment),
    getTechName(appointment),
    appointment.location?.name,
    status,
    phase,
    appointment.notes,
    appointment.internalNotes,
    ...getDateSearchAliases(appointment.startTime),
    ...getDateSearchAliases(appointment.endTime),
    ...getDateSearchAliases(appointment.jobStartTime),
    ...getDateSearchAliases(appointment.expectedCompletionTime),
    ...getDateSearchAliases(appointment.pickupReadyTime),
  ];
}

function getAppointmentMoneyLabel(appointment: AppointmentRecord): string | null {
  const amount = getCalendarAppointmentAmount(appointment);
  if (amount <= 0) return null;
  return formatCurrency(amount);
}

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

const PRESSABLE_CARD_STYLE: CSSProperties = {
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
  WebkitTapHighlightColor: "transparent",
  userSelect: "none",
  touchAction: "manipulation",
};

function joinMeta(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" - ");
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

  const consumeIfLongPress = useCallback(
    (event: { preventDefault(): void; stopPropagation(): void }) => {
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
    },
    [clearTimer]
  );

  const handleTouchMove = useCallback(
    (event: { touches?: ArrayLike<{ clientX: number; clientY: number }> }) => {
      const firstTouch = event.touches?.[0];
      const start = touchStartRef.current;
      if (!firstTouch || !start) return;
      const distance = Math.hypot(firstTouch.clientX - start.x, firstTouch.clientY - start.y);
      if (distance > 10) {
        clearTimer();
        touchStartRef.current = null;
      }
    },
    [clearTimer]
  );

  const openContextMenu = useCallback(
    (event: { preventDefault(): void }) => {
      event.preventDefault();
      longPressTriggeredRef.current = true;
      void triggerImpactFeedback("medium");
      onOpen();
    },
    [onOpen]
  );

  return {
    begin,
    clearTimer,
    consumeIfLongPress,
    handleTouchMove,
    openContextMenu,
  };
}

function isOperationalAppointment(appointment: AppointmentRecord): boolean {
  return appointment.status !== "cancelled" && appointment.status !== "no-show";
}

function isDropOffDay(appointment: AppointmentRecord, date: Date): boolean {
  return hasPresenceOnDay(appointment, date) && getJobSpanStart(appointment).toDateString() === date.toDateString();
}

function isPickupDay(appointment: AppointmentRecord, date: Date): boolean {
  return hasPresenceOnDay(appointment, date) && getJobSpanEnd(appointment).toDateString() === date.toDateString();
}

function isWaitingJob(appointment: AppointmentRecord): boolean {
  return ["waiting", "curing", "hold"].includes(String(appointment.jobPhase ?? ""));
}

function isReadyForPickupJob(appointment: AppointmentRecord): boolean {
  return appointment.jobPhase === "pickup_ready";
}

function isActiveWorkJob(appointment: AppointmentRecord): boolean {
  return appointment.jobPhase === "active_work" || appointment.status === "in_progress";
}

function isInShopOnDate(appointment: AppointmentRecord, date: Date): boolean {
  return hasPresenceOnDay(appointment, date) && (Boolean(appointment.vehicleOnSite) || isMultiDayJob(appointment));
}

function sortByOperationalTime(records: AppointmentRecord[]): AppointmentRecord[] {
  return [...records].sort((a, b) => getJobSpanStart(a).getTime() - getJobSpanStart(b).getTime());
}

function dedupeAppointments(records: AppointmentRecord[]): AppointmentRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

function buildDaySnapshot(appointments: AppointmentRecord[], date: Date): DaySnapshot {
  const jobs = sortByOperationalTime(
    appointments.filter((appointment) => hasPresenceOnDay(appointment, date) || hasLaborOnDay(appointment, date))
  );
  const dropOffs = jobs.filter((appointment) => isDropOffDay(appointment, date));
  const pickups = jobs.filter((appointment) => isPickupDay(appointment, date));
  const timedWork = jobs.filter(
    (appointment) =>
      hasLaborOnDay(appointment, date) &&
      !dropOffs.some((record) => record.id === appointment.id) &&
      !pickups.some((record) => record.id === appointment.id)
  );
  const inShop = dedupeAppointments(
    jobs.filter(
      (appointment) =>
        isInShopOnDate(appointment, date) &&
        !dropOffs.some((record) => record.id === appointment.id) &&
        !pickups.some((record) => record.id === appointment.id) &&
        !timedWork.some((record) => record.id === appointment.id)
    )
  );

  return {
    date,
    jobs,
    dropOffs,
    timedWork,
    inShop,
    pickups,
  };
}

function getScheduleTimingLabel(appointment: AppointmentRecord): string {
  if (isMultiDayJob(appointment)) return getOperationalTimelineLabel(appointment);
  return format(new Date(appointment.startTime), "EEE h:mm a");
}

function MobileFilterSelect({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <div className="relative sm:hidden">
      <select
        aria-label={ariaLabel}
        className="border-input/90 h-10 w-full appearance-none rounded-xl border bg-background px-3.5 py-2 pr-10 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-border focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
    </div>
  );
}

function NativeScheduleHeader({
  weekLabel,
  currentDate,
  onPreviousWeek,
  onToday,
  onNextWeek,
}: {
  weekLabel: string;
  currentDate: Date;
  onPreviousWeek: () => void;
  onToday: () => void;
  onNextWeek: () => void;
}) {
  return (
    <header>
      <div className="rounded-[28px] border border-white/80 bg-white/92 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px_44px] items-center gap-2">
          <button
            type="button"
            aria-label="Previous week"
            onClick={onPreviousWeek}
            className="flex h-11 items-center justify-center rounded-[18px] text-slate-600 transition active:scale-[0.97]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className={cn(
              "min-w-0 rounded-[20px] px-3 py-2 text-center transition active:scale-[0.98]",
              isToday(currentDate) ? "bg-slate-950 text-white shadow-sm" : "bg-slate-50 text-slate-700"
            )}
          >
            <span className={cn("block text-[10px] font-semibold uppercase tracking-[0.14em]", isToday(currentDate) ? "text-white/70" : "text-slate-400")}>
              {isToday(currentDate) ? "This week" : "Jump to week"}
            </span>
            <span className="block truncate text-sm font-semibold leading-5">{weekLabel}</span>
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={onNextWeek}
            className="flex h-11 items-center justify-center rounded-[18px] text-slate-600 transition active:scale-[0.97]"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <Button asChild size="icon" className="h-11 w-11 rounded-[18px] shadow-[0_10px_25px_rgba(249,115,22,0.18)]">
            <Link
              to="/appointments/new"
              aria-label="New appointment"
              onClick={() => {
                void triggerImpactFeedback("light");
              }}
            >
              <Plus className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export default function AppointmentsPage() {
  const { businessId, currentLocationId, setCurrentLocationId } = useOutletContext<AuthOutletContext>();
  const location = useLocation();
  const nativeIOS = isNativeIOSApp();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string>(currentLocationId ?? "all");
  const [activeTechFilter, setActiveTechFilter] = useState<string>("all");
  const [inspectedDateKey, setInspectedDateKey] = useState<string | null>(null);
  const [inspectedAppointmentId, setInspectedAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    setActiveLocationId(currentLocationId ?? "all");
  }, [currentLocationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(location.search);
    const query = params.get("q");
    if (query !== null) setSearch(query);
    if (params.get("focus") !== "search") return;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [location.search]);

  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 0 }), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 0 }), [currentDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index)),
    [weekStart]
  );
  const queryStart = useMemo(
    () => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0, 0).toISOString(),
    [weekStart]
  );
  const queryEnd = useMemo(
    () => new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59, 999).toISOString(),
    [weekEnd]
  );

  const [{ data: appointmentsData, fetching, error }] = useFindMany(api.appointment, {
    startGte: queryStart,
    startLte: queryEnd,
    locationId: !nativeIOS && activeLocationId !== "all" ? activeLocationId : undefined,
    sort: { startTime: "Ascending" },
    first: 500,
    pause: !businessId,
    select: {
      id: true,
      businessId: true,
      title: true,
      status: true,
      startTime: true,
      endTime: true,
      jobStartTime: true,
      expectedCompletionTime: true,
      pickupReadyTime: true,
      vehicleOnSite: true,
      jobPhase: true,
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
      notes: true,
      internalNotes: true,
      location: { name: true },
      client: { id: true, firstName: true, lastName: true, phone: true, email: true },
      vehicle: { id: true, year: true, make: true, model: true },
      assignedStaff: { id: true, firstName: true, lastName: true },
    },
  });
  const [{ data: staffRaw }] = useFindMany(api.staff, { first: 100, pause: !businessId } as any);
  const [{ data: locationsRaw }] = useFindMany(api.location, { first: 100, pause: !businessId } as any);

  const records = useMemo(() => ((appointmentsData ?? []) as AppointmentRecord[]).filter(isOperationalAppointment), [appointmentsData]);
  const staffRecords = useMemo(() => ((staffRaw ?? []) as StaffRecord[]).filter(Boolean), [staffRaw]);
  const locationRecords = useMemo(() => ((locationsRaw ?? []) as LocationRecord[]).filter(Boolean), [locationsRaw]);
  const searchTerm = search.trim();

  const filteredRecords = useMemo(() => {
    return records.filter((appointment) => {
      if (!nativeIOS && activeTechFilter !== "all" && appointment.assignedStaffId !== activeTechFilter) return false;
      if (!searchTerm) return true;

      return smartSearchMatches(getAppointmentSearchParts(appointment), searchTerm);
    });
  }, [activeTechFilter, nativeIOS, records, searchTerm]);

  const weekSnapshots = useMemo(() => {
    return weekDays.map((date) => {
      return buildDaySnapshot(filteredRecords, date);
    });
  }, [filteredRecords, weekDays]);

  const weekCount = useMemo(() => {
    const ids = new Set<string>();
    weekSnapshots.forEach((snapshot) => {
      snapshot.jobs.forEach((appointment) => ids.add(appointment.id));
    });
    return ids.size;
  }, [weekSnapshots]);
  const inspectedSnapshot = useMemo(
    () => weekSnapshots.find((snapshot) => snapshot.date.toISOString() === inspectedDateKey) ?? null,
    [inspectedDateKey, weekSnapshots]
  );
  const openDayInspector = useCallback((date: Date, appointmentId?: string) => {
    void triggerSelectionFeedback();
    setInspectedDateKey(date.toISOString());
    setInspectedAppointmentId(appointmentId ?? null);
  }, []);
  const closeDayInspector = useCallback(() => {
    setInspectedDateKey(null);
    setInspectedAppointmentId(null);
  }, []);
  const isInitialLoad = fetching && appointmentsData === undefined;
  const weekLabel = `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d")}`;
  const scheduleReturnTo = `${location.pathname}${location.search}`;
  const goToPreviousWeek = useCallback(() => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7));
    scrollScheduleToTop();
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setCurrentDate(new Date());
    scrollScheduleToTop();
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7));
    scrollScheduleToTop();
  }, []);

  useEffect(() => {
    if (isInitialLoad || typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(SCHEDULE_SCROLL_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { routeKey?: string; top?: number };
      if (parsed.routeKey !== scheduleReturnTo || typeof parsed.top !== "number") return;
      const restore = () => {
        const container = getAppScrollContainer();
        if (container) {
          container.scrollTo({ top: parsed.top, behavior: "auto" });
        } else {
          window.scrollTo({ top: parsed.top, behavior: "auto" });
        }
      };
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(restore);
      });
    } catch {
      // Ignore invalid restoration state.
    } finally {
      window.sessionStorage.removeItem(SCHEDULE_SCROLL_STORAGE_KEY);
    }
  }, [isInitialLoad, scheduleReturnTo]);

  return (
    <div
      className={cn(
        nativeIOS
          ? "mx-auto w-full max-w-3xl space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2"
          : "page-content page-section max-w-7xl"
      )}
    >
      {nativeIOS ? (
        <NativeScheduleHeader
          weekLabel={weekLabel}
          currentDate={currentDate}
          onPreviousWeek={goToPreviousWeek}
          onToday={goToCurrentWeek}
          onNextWeek={goToNextWeek}
        />
      ) : (
        <PageHeader
          title="Schedule"
          right={
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <Button asChild variant="outline" className="w-full lg:w-auto">
                <Link
                  to="/calendar?view=day"
                  onClick={() => {
                    void triggerImpactFeedback("light");
                  }}
                >
                  <CalendarRange className="mr-2 h-4 w-4" />
                  Open Calendar
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full lg:w-auto">
                <Link
                  to="/appointments/requests"
                  onClick={() => {
                    void triggerImpactFeedback("light");
                  }}
                >
                  <Inbox className="mr-2 h-4 w-4" />
                  Booking Requests
                </Link>
              </Button>
              <Button asChild className="w-full lg:w-auto">
                <Link
                  to="/appointments/new"
                  onClick={() => {
                    void triggerImpactFeedback("light");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Appointment
                </Link>
              </Button>
            </div>
          }
        />
      )}

      <section className="space-y-3 sm:space-y-4">
        <div
          className={cn(
            "rounded-[1rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)] sm:rounded-[1.35rem] sm:p-4 sm:shadow-[0_12px_30px_rgba(15,23,42,0.04)]",
            nativeIOS && "rounded-[28px] border-white/80 bg-white/92 p-3.5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
          )}
        >
          <div className={cn("flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between", nativeIOS && "hidden")}>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Scheduling</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{weekLabel}</h2>
                <span className="text-xs text-muted-foreground sm:text-sm">{weekCount} jobs in view</span>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start xl:self-auto">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg sm:h-9 sm:w-9 sm:rounded-xl" onClick={goToPreviousWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-8 rounded-lg px-3 text-sm sm:h-9 sm:rounded-xl" onClick={goToCurrentWeek}>
                This week
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg sm:h-9 sm:w-9 sm:rounded-xl" onClick={goToNextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className={cn("mt-3 grid gap-2 lg:mt-4 lg:grid-cols-[minmax(0,1.25fr)_150px_170px_170px]", nativeIOS && "mt-0 gap-2.5 lg:grid-cols-1")}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, time, vehicle, status, or tech"
                className={cn("h-9 rounded-lg pl-9 sm:h-10 sm:rounded-xl", nativeIOS && "h-12 rounded-[20px] border-white/80 bg-slate-50/80 text-[16px] shadow-inner")}
              />
            </div>
            <div className={cn("sm:hidden", nativeIOS && "hidden")}>
              <MobileFilterSelect
                value={activeLocationId}
                ariaLabel="Filter schedule by location"
                onChange={(value) => {
                  setActiveLocationId(value);
                  setCurrentLocationId(value === "all" ? null : value);
                }}
              >
                <option value="all">All locations</option>
                {locationRecords.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name?.trim() || "Unnamed location"}
                  </option>
                ))}
              </MobileFilterSelect>
            </div>
            {!nativeIOS ? (
              <>
                <Select
                  value={activeLocationId}
                  onValueChange={(value) => {
                    setActiveLocationId(value);
                    setCurrentLocationId(value === "all" ? null : value);
                  }}
                >
                  <SelectTrigger className="hidden h-10 rounded-xl sm:flex">
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {locationRecords.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name?.trim() || "Unnamed location"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={activeTechFilter} onValueChange={setActiveTechFilter}>
                  <SelectTrigger className="h-9 rounded-lg sm:h-10 sm:rounded-xl">
                    <SelectValue placeholder="All techs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All techs</SelectItem>
                    {staffRecords.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {[staff.firstName, staff.lastName].filter(Boolean).join(" ").trim() || "Unnamed staff"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {error && !isInitialLoad ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>
            {error instanceof ApiError && (error.status === 401 || error.status === 403)
              ? "Your session expired. Redirecting to sign-in..."
              : "Could not load the weekly schedule. Please refresh the page."}
          </span>
        </div>
      ) : isInitialLoad ? (
        <div className="mt-4">
          <Card className={cn("border-border/70", nativeIOS && "rounded-[28px] border-white/80 bg-white/92 shadow-[0_18px_40px_rgba(15,23,42,0.06)]")}>
            <CardContent className="space-y-4 p-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="space-y-2 border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : weekCount === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={CalendarRange}
            title="No schedule activity in this view"
            description="Try clearing the search or filters, or move to a different week."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setActiveTechFilter("all");
                  setCurrentDate(new Date());
                }}
              >
                Reset view
              </Button>
            }
          />
        </div>
      ) : (
        <div className={cn("mt-4", nativeIOS && "mt-0")}>
          <Card className={cn("overflow-hidden border-border/70 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:shadow-[0_14px_36px_rgba(15,23,42,0.04)]", nativeIOS && "rounded-[30px] border-white/80 bg-white/92 shadow-[0_18px_40px_rgba(15,23,42,0.06)]")}>
            <CardContent className="p-0">
              <div className={cn("flex items-center justify-between border-b border-border/70 px-3 py-2.5 sm:px-5 sm:py-3", nativeIOS && "px-4 py-4")}>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Weekly board</p>
                  <h3 className={cn("text-sm font-semibold text-foreground sm:text-base", nativeIOS && "text-lg tracking-[-0.03em]")}>Operational week</h3>
                </div>
                <span className={cn("rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", nativeIOS && "border-slate-200 bg-slate-50 px-3 py-1.5")}>
                  {weekCount} jobs
                </span>
              </div>
              <div className={cn("divide-y divide-border/70", nativeIOS && "divide-slate-100")}>
                {weekSnapshots.map((snapshot) => (
                  <WeeklyDaySection
                    key={snapshot.date.toISOString()}
                    snapshot={snapshot}
                    onOpenDay={(appointmentId) => openDayInspector(snapshot.date, appointmentId)}
                    returnTo={scheduleReturnTo}
                    nativeIOS={nativeIOS}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Dialog open={Boolean(inspectedSnapshot)} onOpenChange={(open) => !open && closeDayInspector()}>
            <DialogContent
              showCloseButton={false}
              className={cn(
                "h-[min(92dvh,calc(100svh-1rem))] max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-3xl overflow-hidden rounded-[1.15rem] p-0 sm:h-[min(92dvh,calc(100svh-2rem))] sm:w-full sm:max-h-[calc(100svh-2rem)] sm:rounded-[1.5rem]",
                nativeIOS && "rounded-[30px]"
              )}
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              {inspectedSnapshot ? (
                <>
                  <DialogHeader className="sr-only">
                    <DialogTitle>Operational week detail for {format(inspectedSnapshot.date, "EEEE, MMMM d")}</DialogTitle>
                    <DialogDescription>
                      Review the day timeline, revenue, and job load for this week snapshot without leaving the board.
                    </DialogDescription>
                  </DialogHeader>
                  <ScheduleDayInspector snapshot={inspectedSnapshot} selectedAppointmentId={inspectedAppointmentId} returnTo={scheduleReturnTo} nativeIOS={nativeIOS} />
                </>
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };

function WeeklyDaySection({
  snapshot,
  onOpenDay,
  returnTo,
  nativeIOS = false,
}: {
  snapshot: DaySnapshot;
  onOpenDay: (appointmentId?: string) => void;
  returnTo: string;
  nativeIOS?: boolean;
}) {
  const dayRevenue = getCalendarDayRevenue(snapshot.jobs, snapshot.date);
  const groups = [
    { label: "Drop-offs", items: snapshot.dropOffs },
    { label: "Timed work", items: snapshot.timedWork },
    { label: "In shop", items: snapshot.inShop },
    { label: "Pickups", items: snapshot.pickups },
  ].filter((group) => group.items.length > 0);

  return (
    <section className={cn("px-3 py-3 sm:px-5 sm:py-4", isToday(snapshot.date) && "bg-primary/[0.025]", nativeIOS && "px-4 py-4")}>
      <div className={cn("flex flex-col gap-1 border-b border-border/60 pb-2.5 sm:pb-3 sm:flex-row sm:items-end sm:justify-between", nativeIOS && "border-slate-100 pb-3")}>
        <div>
          <h4 className={cn("text-sm font-semibold text-foreground sm:text-base", nativeIOS && "text-base tracking-[-0.02em]")}>
            {format(snapshot.date, "EEEE")} - {format(snapshot.date, "MMM d")}
          </h4>
          <p className={cn("text-[11px] text-muted-foreground sm:text-xs", nativeIOS && "mt-1 text-xs")}>
            {snapshot.jobs.length} {snapshot.jobs.length === 1 ? "job" : "jobs"}
            {dayRevenue > 0 ? ` - ${formatCurrency(dayRevenue)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {groups.map((group) => (
            <span key={group.label} className={cn("rounded-full border border-border/70 bg-muted/20 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground", nativeIOS && "border-slate-200 bg-slate-50 px-2.5 py-1")}>
              {group.items.length} {group.label}
            </span>
          ))}
          {isToday(snapshot.date) ? (
            <span className="w-fit rounded-full border border-primary/20 bg-primary/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Today
            </span>
          ) : null}
        </div>
      </div>

      {snapshot.jobs.length === 0 ? (
        <div className={cn("py-4 text-sm text-muted-foreground", nativeIOS && "rounded-[22px] bg-slate-50/80 px-4 py-5 text-center")}>No jobs scheduled for this day.</div>
      ) : (
        <div className={cn("space-y-3 pt-3 sm:space-y-4 sm:pt-4", nativeIOS && "space-y-3")}>
          {groups.map((group) => (
            <div key={group.label} className="space-y-1.5 sm:space-y-2">
              <div className={cn("text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:text-[11px]", nativeIOS && "px-1 text-[11px]")}>{group.label}</div>
              <div className="space-y-1.5 sm:space-y-2">
                {group.items.map((appointment) => (
                  <ScheduleBoardRow
                    key={`${group.label}-${appointment.id}`}
                    appointment={appointment}
                    referenceDate={snapshot.date}
                    onOpenDay={() => onOpenDay(appointment.id)}
                    returnTo={returnTo}
                    nativeIOS={nativeIOS}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ScheduleBoardRow({
  appointment,
  referenceDate,
  onOpenDay,
  returnTo,
  nativeIOS = false,
}: {
  appointment: AppointmentRecord;
  referenceDate: Date;
  onOpenDay: () => void;
  returnTo: string;
  nativeIOS?: boolean;
}) {
  const vehicleLabel = getVehicleLabel(appointment);
  const clientName = getClientName(appointment);
  const moneyLabel = getAppointmentMoneyLabel(appointment);
  const timingLabel = getScheduleTimingLabel(appointment);
  const stageLabel = isMultiDayJob(appointment)
    ? getOperationalDayLabel(appointment, referenceDate)
    : getJobPhaseLabel(appointment.jobPhase);
  const identityLabel = joinMeta([clientName || "Internal", vehicleLabel || "No vehicle"]);
  const supportLabel = joinMeta([appointment.location?.name ?? null, appointment.assignedStaffId ? getTechName(appointment) : null]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const openActions = useCallback(() => {
    void triggerSelectionFeedback();
    setActionsOpen(true);
  }, []);
  const longPress = useLongPressActions(openActions);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={(event) => {
          if (longPress.consumeIfLongPress(event)) return;
          onOpenDay();
        }}
        onDragStart={(event) => event.preventDefault()}
        onSelectStart={(event) => event.preventDefault()}
        onTouchStart={longPress.begin}
        onTouchEnd={longPress.consumeIfLongPress}
        onTouchCancel={longPress.clearTimer}
        onTouchMove={longPress.handleTouchMove}
        onContextMenu={longPress.openContextMenu}
        className={cn(
          "block w-full select-none rounded-lg border border-border/60 bg-white/92 px-2.5 py-2.5 text-left transition-[transform,background-color,border-color,box-shadow] hover:bg-white active:scale-[0.985] sm:rounded-xl sm:px-3 sm:py-3 [&_*]:select-none",
          nativeIOS && "rounded-[22px] border-white/80 bg-white px-3.5 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
        )}
        style={PRESSABLE_CARD_STYLE}
        draggable={false}
      >
        <div className={cn("pointer-events-none grid gap-1.5 sm:gap-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(220px,0.9fr)_auto] xl:items-start xl:gap-4", nativeIOS && "grid-cols-[4px_minmax(0,1fr)] gap-x-3")}>
          {nativeIOS ? <span className={cn("row-span-3 h-full min-h-14 rounded-full", getJobPhaseTone(appointment.jobPhase))} /> : null}
          <div className="min-w-0">
            <div className="flex min-w-0 items-start gap-2">
              <p className={cn("min-w-0 flex-1 break-words text-[12.5px] font-semibold leading-4.5 text-foreground sm:text-sm sm:leading-5", nativeIOS && "text-[15px] leading-5 tracking-[-0.01em]")}>
                {getAppointmentLabel(appointment)}
              </p>
              {moneyLabel ? <span className={cn("shrink-0 text-[11px] font-semibold text-foreground sm:text-[12px]", nativeIOS && "text-sm")}>{moneyLabel}</span> : null}
            </div>
            <p className={cn("mt-0.5 break-words text-[11px] text-muted-foreground sm:mt-1 sm:text-[13px]", nativeIOS && "mt-1 text-[13px] leading-5")}>{identityLabel}</p>
          </div>

          <div className={cn("min-w-0 space-y-0.5", nativeIOS && "col-start-2 rounded-2xl bg-slate-50/80 px-3 py-2")}>
            <p className={cn("break-words text-[11px] text-muted-foreground sm:text-[13px]", nativeIOS && "text-xs font-semibold text-slate-700")}>{timingLabel}</p>
            {supportLabel ? <p className={cn("break-words text-[10px] text-muted-foreground sm:text-[11px]", nativeIOS && "mt-0.5 text-xs")}>{supportLabel}</p> : null}
          </div>

          <div className={cn("flex min-w-0 items-center gap-1.5 xl:justify-end", nativeIOS && "col-start-2 justify-between")}>
            {!nativeIOS ? <span className={cn("h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5", getJobPhaseTone(appointment.jobPhase))} /> : null}
            <span className={cn("max-w-full truncate rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:px-2 sm:text-[10px]", nativeIOS && "border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px]")}>
              {stageLabel}
            </span>
            {nativeIOS ? <ChevronRight className="h-4 w-4 text-slate-300" /> : null}
          </div>
        </div>
      </button>
      <AppointmentQuickActionsSheet appointment={appointment} open={actionsOpen} onOpenChange={setActionsOpen} returnTo={returnTo} nativeIOS={nativeIOS} />
    </>
  );
}

function ScheduleDayInspector({
  snapshot,
  selectedAppointmentId,
  returnTo,
  nativeIOS = false,
}: {
  snapshot: DaySnapshot;
  selectedAppointmentId: string | null;
  returnTo: string;
  nativeIOS?: boolean;
}) {
  const dayRevenue = getCalendarDayRevenue(snapshot.jobs, snapshot.date);
  const groups = [
    { label: "Drop-offs", items: snapshot.dropOffs },
    { label: "Timed work", items: snapshot.timedWork },
    { label: "In shop", items: snapshot.inShop },
    { label: "Pickups", items: snapshot.pickups },
  ].filter((group) => group.items.length > 0);
  const selectedAppointment = selectedAppointmentId
    ? snapshot.jobs.find((appointment) => appointment.id === selectedAppointmentId) ?? null
    : null;
  const selectedGroupLabel =
    selectedAppointment
      ? groups.find((group) => group.items.some((appointment) => appointment.id === selectedAppointment.id))?.label ?? "Selected job"
      : null;
  const selectedCardRef = useRef<HTMLDivElement | null>(null);
  const selectedHref = selectedAppointment
    ? isCalendarBlockAppointment(selectedAppointment)
      ? `/calendar?view=week&date=${encodeURIComponent(format(snapshot.date, "yyyy-MM-dd"))}`
      : `/appointments/${selectedAppointment.id}?from=${encodeURIComponent(returnTo)}`
    : "#";

  useEffect(() => {
    selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedAppointmentId, snapshot.date]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DialogHeader className={cn("shrink-0 border-b border-border/70 bg-[linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.5))] px-4 py-3 sm:px-5 sm:py-4", nativeIOS && "border-slate-100 bg-white px-4 py-4")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Day inspector</p>
            <DialogTitle className={cn("mt-1 text-left text-base sm:text-lg", nativeIOS && "text-xl tracking-[-0.03em]")}>
              {format(snapshot.date, "EEEE")} - {format(snapshot.date, "MMMM d")}
            </DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {snapshot.jobs.length} {snapshot.jobs.length === 1 ? "job" : "jobs"}
              {dayRevenue > 0 ? ` - ${formatCurrency(dayRevenue)}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isToday(snapshot.date) ? (
              <span className="hidden rounded-full border border-primary/20 bg-primary/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary min-[390px]:inline-flex">
                Today
              </span>
            ) : null}
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs">
                Close
              </Button>
            </DialogClose>
          </div>
        </div>

        {selectedAppointment ? (
          <div className={cn("mt-3 rounded-2xl border border-primary/15 bg-primary/[0.055] p-3 text-left", nativeIOS && "rounded-[22px]")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{selectedGroupLabel}</p>
                <p className="mt-1 break-words text-sm font-semibold leading-5 text-foreground">
                  {getAppointmentLabel(selectedAppointment)}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {joinMeta([getClientName(selectedAppointment) || "Internal", getVehicleLabel(selectedAppointment) || "No vehicle"])}
                </p>
              </div>
              <Button asChild size="sm" variant="secondary" className="h-8 shrink-0 rounded-full px-3 text-xs">
                <Link
                  to={selectedHref}
                  onClick={() => {
                    captureScheduleScrollPosition(returnTo);
                  }}
                >
                  <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
                  Open
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </DialogHeader>
      <div className={cn("app-native-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:space-y-4 sm:px-5 sm:py-4", nativeIOS && "bg-slate-50/50 px-4 py-4")}>
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            No jobs scheduled for this day.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="space-y-1.5 sm:space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:text-[11px]">{group.label}</div>
              <div className="space-y-1.5 sm:space-y-2">
                {group.items.map((appointment) => {
                  const selected = appointment.id === selectedAppointmentId;
                  return (
                    <InspectorAppointmentCard
                      key={`${group.label}-${appointment.id}`}
                      appointment={appointment}
                      snapshotDate={snapshot.date}
                      selected={selected}
                      selectedCardRef={selected ? selectedCardRef : undefined}
                      returnTo={returnTo}
                      nativeIOS={nativeIOS}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InspectorAppointmentCard({
  appointment,
  snapshotDate,
  selected = false,
  selectedCardRef,
  returnTo,
  nativeIOS = false,
}: {
  appointment: AppointmentRecord;
  snapshotDate: Date;
  selected?: boolean;
  selectedCardRef?: RefObject<HTMLDivElement | null>;
  returnTo: string;
  nativeIOS?: boolean;
}) {
  const navigate = useNavigate();
  const [actionsOpen, setActionsOpen] = useState(false);
  const openActions = useCallback(() => {
    void triggerSelectionFeedback();
    setActionsOpen(true);
  }, []);
  const longPress = useLongPressActions(openActions);
  const openAppointment = useCallback(() => {
    void triggerSelectionFeedback();
    captureScheduleScrollPosition(returnTo);
    navigate(`/appointments/${appointment.id}?from=${encodeURIComponent(returnTo)}`);
  }, [appointment.id, navigate, returnTo]);

  return (
    <>
      <div
        ref={selectedCardRef}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-current={selected ? "true" : undefined}
        onClick={(event) => {
          if (longPress.consumeIfLongPress(event)) return;
          openAppointment();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openAppointment();
          }
        }}
        onDragStart={(event) => event.preventDefault()}
        onSelectStart={(event) => event.preventDefault()}
        onTouchStart={longPress.begin}
        onTouchEnd={longPress.consumeIfLongPress}
        onTouchCancel={longPress.clearTimer}
        onTouchMove={longPress.handleTouchMove}
        onContextMenu={longPress.openContextMenu}
        className={cn(
          "block select-none rounded-lg border px-2.5 py-2.5 transition-[transform,background-color,border-color,box-shadow] hover:bg-white active:scale-[0.985] sm:rounded-xl sm:px-3 sm:py-3 [&_*]:select-none",
          selected
            ? "border-primary/35 bg-primary/[0.055] shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
            : "border-border/60 bg-white/92",
          nativeIOS && "rounded-[22px] border-white/80 bg-white px-3.5 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]",
          nativeIOS && selected && "border-primary/25 bg-primary/[0.06]"
        )}
        style={PRESSABLE_CARD_STYLE}
        draggable={false}
      >
        <div className="pointer-events-none space-y-1">
          <div className="flex items-start justify-between gap-3">
            <p className={cn("min-w-0 flex-1 break-words text-[13px] font-semibold text-foreground sm:text-sm", nativeIOS && "text-[15px] leading-5 tracking-[-0.01em]")}>{getAppointmentLabel(appointment)}</p>
            {getAppointmentMoneyLabel(appointment) ? (
              <span className={cn("shrink-0 text-[11px] font-semibold text-foreground sm:text-xs", nativeIOS && "text-sm")}>{getAppointmentMoneyLabel(appointment)}</span>
            ) : null}
          </div>
          <p className={cn("break-words text-[11px] text-muted-foreground sm:text-sm", nativeIOS && "text-[13px] leading-5")}>
            {joinMeta([getClientName(appointment) || "Internal", getVehicleLabel(appointment) || "No vehicle"])}
          </p>
          <p className={cn("break-words text-[11px] text-muted-foreground sm:text-sm", nativeIOS && "text-[13px] font-semibold text-slate-700")}>{getScheduleTimingLabel(appointment)}</p>
          <div className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5", getJobPhaseTone(appointment.jobPhase))} />
            <span className="rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:px-2 sm:text-[10px]">
              {isMultiDayJob(appointment) ? getOperationalDayLabel(appointment, snapshotDate) : getJobPhaseLabel(appointment.jobPhase)}
            </span>
          </div>
        </div>
      </div>
      <AppointmentQuickActionsSheet appointment={appointment} open={actionsOpen} onOpenChange={setActionsOpen} returnTo={returnTo} nativeIOS={nativeIOS} />
    </>
  );
}

function AppointmentQuickActionsSheet({
  appointment,
  open,
  onOpenChange,
  returnTo,
  nativeIOS = false,
}: {
  appointment: AppointmentRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo: string;
  nativeIOS?: boolean;
}) {
  const navigate = useNavigate();
  const clientName = getClientName(appointment) || "Appointment";
  const clientHref = appointment.client?.id ? `/clients/${appointment.client.id}` : null;
  const normalizedPhone = normalizePhone(appointment.client?.phone);
  const displayPhone = formatDisplayPhone(appointment.client?.phone);
  const phoneHref = normalizedPhone ? `tel:${normalizedPhone}` : null;
  const textHref = normalizedPhone ? `sms:${normalizedPhone}` : null;
  const emailHref = appointment.client?.email ? `mailto:${appointment.client.email}` : null;

  const openAppointment = () => {
    void triggerSelectionFeedback();
    onOpenChange(false);
    captureScheduleScrollPosition(returnTo);
    navigate(`/appointments/${appointment.id}?from=${encodeURIComponent(returnTo)}`);
  };

  const openClient = () => {
    if (!clientHref) return;
    void triggerSelectionFeedback();
    onOpenChange(false);
    navigate(clientHref);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={cn("max-h-[85vh] overflow-y-auto rounded-t-[1.75rem] pb-[max(1rem,env(safe-area-inset-bottom))]", nativeIOS && "rounded-t-[30px] px-4")}>
        <SheetHeader>
          <SheetTitle>{clientName}</SheetTitle>
          <SheetDescription>Long-press appointment cards to move faster through client follow-up and job details.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid gap-2">
          <Button type="button" variant="outline" className={cn("justify-start", nativeIOS && "h-12 rounded-[18px]")} onClick={openAppointment}>
            <CalendarRange className="mr-2 h-4 w-4" />
            Open appointment
          </Button>
          {clientHref ? (
            <Button type="button" variant="outline" className={cn("justify-start", nativeIOS && "h-12 rounded-[18px]")} onClick={openClient}>
              <Users className="mr-2 h-4 w-4" />
              Open client
            </Button>
          ) : null}
          {phoneHref ? (
            <Button asChild variant="outline" className={cn("justify-start", nativeIOS && "h-12 rounded-[18px]")}>
              <a href={phoneHref} onClick={() => onOpenChange(false)}>
                <Phone className="mr-2 h-4 w-4" />
                Call client {displayPhone ? `(${displayPhone})` : ""}
              </a>
            </Button>
          ) : null}
          {textHref ? (
            <Button asChild variant="outline" className={cn("justify-start", nativeIOS && "h-12 rounded-[18px]")}>
              <a href={textHref} onClick={() => onOpenChange(false)}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Text client
              </a>
            </Button>
          ) : null}
          {emailHref ? (
            <Button asChild variant="outline" className={cn("justify-start", nativeIOS && "h-12 rounded-[18px]")}>
              <a href={emailHref} onClick={() => onOpenChange(false)}>
                <Mail className="mr-2 h-4 w-4" />
                Email client
              </a>
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
