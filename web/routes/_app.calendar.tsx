import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router";
import { toast } from "sonner";
import { AlertTriangle, Ban, ChevronLeft, ChevronRight, MapPin, Plus } from "lucide-react";
import { api } from "../api";
import { useAction, useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { cn } from "@/lib/utils";
import { AppointmentInspectorPanel } from "@/components/appointments/AppointmentInspectorPanel";
import {
  selectorPillButtonClassName,
  selectorSelectTriggerClassName,
  selectorShellClassName,
} from "@/components/shared/selectorStyles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  type ApptRecord,
  ConflictBanner,
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
import { triggerNativeHaptic } from "@/lib/nativeFieldOps";

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

function MobileInlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-white/86 px-2.5 py-1 text-[11px] shadow-sm">
      <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

type InspectorSwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  axis: "pending" | "horizontal" | "vertical";
  captured: boolean;
};

function isCalendarSwipeInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "button, a, input, textarea, select, label, summary, [role='button'], [role='menuitem'], [data-calendar-swipe-ignore='true']"
    )
  );
}

function AgendaPreviewRow({
  appointment,
  kind,
  selected,
  currentDate,
  onClick,
}: {
  appointment: ApptRecord;
  kind: "timed" | "onsite";
  selected: boolean;
  currentDate: Date;
  onClick: () => void;
}) {
  const appointmentAmount = getCalendarAppointmentAmount(appointment);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "native-touch-surface flex w-full items-start gap-3 rounded-[1.2rem] border border-border/60 bg-white/88 px-3 py-3 text-left transition-all hover:bg-white/96",
        "[-webkit-touch-callout:none] touch-manipulation",
        selected && !isCalendarBlockAppointment(appointment) && "border-primary/35 bg-primary/[0.05]"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {[getCalendarAppointmentLabel(appointment), appointmentAmount > 0 ? formatCurrency(appointmentAmount) : null]
            .filter(Boolean)
            .join(" • ")}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {appointment.client
            ? [appointment.client.firstName, appointment.client.lastName].filter(Boolean).join(" ").trim() || "Client"
            : "Internal"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {appointment.vehicle
            ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
            : appointment.assignedStaff
              ? `${appointment.assignedStaff.firstName} ${appointment.assignedStaff.lastName}`
              : kind === "onsite"
                ? "Vehicle in shop"
                : "Unassigned"}
        </p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {kind === "onsite"
            ? `${getOperationalDayLabel(appointment, currentDate)} · ${formatPanelShortDate(getJobSpanStart(appointment))} to ${formatPanelShortDate(getJobSpanEnd(appointment))}`
            : isCalendarBlockAppointment(appointment)
              ? isFullDayCalendarBlock(appointment)
                ? "All-day block"
                : `${formatPanelTime(appointment.startTime)} - ${formatPanelTime(appointment.endTime)}`
              : `${formatPanelTime(appointment.startTime)}${appointment.endTime ? ` - ${formatPanelTime(appointment.endTime)}` : ""}`}
        </p>
      </div>
      <span className="shrink-0 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {kind === "onsite"
          ? getOperationalDayLabel(appointment, currentDate)
          : isCalendarBlockAppointment(appointment)
            ? (isFullDayCalendarBlock(appointment) ? "All day" : "Blocked")
            : getOperationalDayLabel(appointment, currentDate)}
      </span>
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
    selectorSelectTriggerClassName("w-full min-w-0 max-w-full [font-variant-numeric:tabular-nums]"),
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
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [inspectorSwipeOffset, setInspectorSwipeOffset] = useState(0);
  const [inspectorSwipeAnimating, setInspectorSwipeAnimating] = useState(false);
  const inspectorSwipeRef = useRef<InspectorSwipeGesture | null>(null);
  const layoutInitializedRef = useRef(false);
  const lastInternalUrlSyncRef = useRef<{ view: "month" | "week"; date: string } | null>(null);

  useEffect(() => {
    const nextView =
      requestedView === "month"
        ? "month"
        : requestedView === "week" || requestedView === "day"
          ? "week"
          : null;
    if (!nextView || nextView === view) return;
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
      client: { id: true, firstName: true, lastName: true },
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
  const [{ fetching: unblockingBlock }, updateAppointmentStatus] = useAction(api.appointment.updateStatus);
  const timeOptions = useMemo(() => buildQuarterHourOptions(), []);
  const timeSelectTriggerClassName =
    selectorSelectTriggerClassName("h-11 w-full [font-variant-numeric:tabular-nums]");

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
    void triggerNativeHaptic("light");
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
    void triggerNativeHaptic("light");
    if (isCalendarBlockAppointment(apt)) {
      setSelectedBlock(apt);
      return;
    }
    setSelectedAppointmentId(apt.id);
    setIsAppointmentInspectorOpen(true);
  }

  function handleNewAppointment() {
    void triggerNativeHaptic("light");
    const targetDate = view === "month" ? selectedDate : currentDate;
    const iso = toLocalDateString(targetDate);
    navigate(`/appointments/new?date=${encodeURIComponent(iso)}${
      currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
    }`);
  }

  function handleOpenBlockDialog() {
    void triggerNativeHaptic("light");
    const targetDate = view === "month" ? selectedDate : currentDate;
    const selectedDate = toLocalDateString(targetDate);
    setEditingBlockId(null);
    setBlockMode("time");
    setBlockStartDate(selectedDate);
    setBlockEndDate(selectedDate);
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
    const result = await updateAppointmentStatus({ id: block.id, status: "cancelled" } as any);
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
  const selectedAppointment = useMemo(
    () =>
      isAppointmentInspectorOpen
        ? appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null
        : null,
    [appointments, selectedAppointmentId, isAppointmentInspectorOpen]
  );
  const inspectorAppointments = useMemo(
    () => selectableDayAgendaItems.map(({ appointment }) => appointment),
    [selectableDayAgendaItems]
  );
  const inspectorAppointmentIndex = useMemo(
    () => inspectorAppointments.findIndex((appointment) => appointment.id === selectedAppointmentId),
    [inspectorAppointments, selectedAppointmentId]
  );
  const inspectorAppointmentCount = inspectorAppointments.length;
  const canSwipeToPreviousAppointment = inspectorAppointmentIndex > 0;
  const canSwipeToNextAppointment =
    inspectorAppointmentIndex >= 0 && inspectorAppointmentIndex < inspectorAppointmentCount - 1;

  function releaseInspectorSwipe() {
    inspectorSwipeRef.current = null;
    setInspectorSwipeAnimating(true);
    setInspectorSwipeOffset(0);
  }

  function selectInspectorAppointmentByDirection(direction: -1 | 1) {
    if (inspectorAppointmentCount <= 1 || inspectorAppointmentIndex < 0) return false;
    const nextIndex = inspectorAppointmentIndex + direction;
    if (nextIndex < 0 || nextIndex >= inspectorAppointmentCount) return false;
    setInspectorSwipeAnimating(true);
    setSelectedAppointmentId(inspectorAppointments[nextIndex].id);
    setInspectorSwipeOffset(0);
    void triggerNativeHaptic("light");
    return true;
  }

  function handleInspectorSwipePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!isMobileLayout || inspectorAppointmentCount <= 1 || event.pointerType === "mouse") return;
    if (isCalendarSwipeInteractiveTarget(event.target)) return;
    inspectorSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: "pending",
      captured: false,
    };
    setInspectorSwipeAnimating(false);
  }

  function handleInspectorSwipePointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = inspectorSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (gesture.axis === "pending") {
      if (absY > Math.max(absX * 1.1, 12)) {
        gesture.axis = "vertical";
        return;
      }
      if (absX <= Math.max(absY * 1.35, 18)) return;
      gesture.axis = "horizontal";
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.captured = true;
      } catch {
        gesture.captured = false;
      }
    }

    if (gesture.axis !== "horizontal") return;
    event.preventDefault();

    const direction = deltaX < 0 ? 1 : -1;
    const canMove = direction === 1 ? canSwipeToNextAppointment : canSwipeToPreviousAppointment;
    const resistedOffset = canMove ? deltaX : deltaX * 0.24;
    setInspectorSwipeOffset(Math.max(-96, Math.min(96, resistedOffset)));
  }

  function handleInspectorSwipePointerUp(event: PointerEvent<HTMLDivElement>) {
    const gesture = inspectorSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if (gesture.axis === "horizontal" && Math.abs(inspectorSwipeOffset) >= 52) {
      const direction = inspectorSwipeOffset < 0 ? 1 : -1;
      selectInspectorAppointmentByDirection(direction);
    }

    releaseInspectorSwipe();
  }

  function handleInspectorSwipePointerCancel() {
    releaseInspectorSwipe();
  }

  useEffect(() => {
    if (!selectedAppointmentId) return;
    const stillVisible = selectableDayAgendaItems.some(({ appointment }) => appointment.id === selectedAppointmentId);
    if (stillVisible) return;
    setSelectedAppointmentId(null);
    setIsAppointmentInspectorOpen(false);
  }, [selectableDayAgendaItems, selectedAppointmentId]);

  useEffect(() => {
    if (isAppointmentInspectorOpen) return;
    inspectorSwipeRef.current = null;
    setInspectorSwipeOffset(0);
    setInspectorSwipeAnimating(false);
  }, [isAppointmentInspectorOpen]);

  const dayInspectorTitleId = `day-inspector-title-${view}`;

  const dayInspectorPanel = (
    <aside
      role="complementary"
      aria-label="Day inspector"
      aria-labelledby={dayInspectorTitleId}
      className="native-foreground-panel flex h-full min-h-0 flex-col overflow-hidden"
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
              <MobileInlineStat label="Jobs" value={String(selectedDayAgendaItems.length)} />
              <MobileInlineStat label="Revenue" value={formatCurrency(selectedDayRevenue)} />
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
      <div className={cn("min-h-0 flex-1", isMobileLayout ? "px-2.5 pb-2.5 pt-2.5" : "px-3 pb-3 pt-3")}>
        <div className="grid h-full min-h-0 gap-3 grid-cols-1">
          <div
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden rounded-[1.3rem] border border-border/60 bg-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
              isMobileLayout ? "min-h-[14.25rem] p-2" : "min-h-[22rem] p-3 xl:min-h-[25rem]"
            )}
          >
            <div className={cn("flex items-center justify-between gap-3", isMobileLayout ? "mb-2" : "mb-3")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Selected date
              </p>
              <span className={cn("rounded-full border border-border/70 bg-background font-medium text-muted-foreground", isMobileLayout ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]")}>
                {selectedDayAgendaItems.length}
              </span>
            </div>
            {selectedDayAgendaItems.length > 0 ? (
              <div
                className={cn(
                  "min-h-0 flex-1 space-y-2 overflow-y-auto scroll-pb-8 pb-2",
                  isMobileLayout
                    ? "touch-pan-y overscroll-contain px-0.5 pb-3 pr-0.5 pt-0.5 [-webkit-overflow-scrolling:touch]"
                    : "pr-1 pt-0.5"
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
                  />
                ))}
                {isMobileLayout ? <div aria-hidden="true" className="h-6 shrink-0" /> : null}
              </div>
            ) : (
              <div className={cn("rounded-2xl border border-dashed border-border/70 bg-muted/10", isMobileLayout ? "px-3 py-4" : "px-4 py-5")}>
                <p className="text-sm font-medium text-foreground">No appointments on this date</p>
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

  return (
    <div className="page-content flex h-full min-h-0 flex-col overflow-hidden">
      <div className="page-section flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden sm:gap-3">
        <div className={cn("surface-panel shrink-0 overflow-hidden", isMobileLayout ? "rounded-[1.15rem]" : "rounded-[1.35rem] sm:rounded-[1.7rem]")}>
          <div
            className={cn(
              "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))]",
              isMobileLayout ? "px-2.5 py-2" : "border-b border-white/60 px-4 py-3 sm:px-5"
            )}
          >
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
                  <div className={selectorShellClassName(isMobileLayout ? "w-full justify-between" : "w-full sm:w-auto sm:justify-start")}>
                    <Button variant="ghost" size="icon" className={cn("rounded-full", isMobileLayout ? "h-6.5 w-6.5" : "h-8 w-8")} onClick={handlePrev} aria-label="Previous">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={isToday ? "default" : "secondary"}
                      size="sm"
                      className={cn("rounded-full", isMobileLayout ? "h-6.5 px-3 text-[11px]" : "h-8 px-4")}
                      onClick={handleToday}
                    >
                      Today
                    </Button>
                    <Button variant="ghost" size="icon" className={cn("rounded-full", isMobileLayout ? "h-6.5 w-6.5" : "h-8 w-8")} onClick={handleNext} aria-label="Next">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {availableViews.length > 1 ? (
                    <div className={selectorShellClassName(isMobileLayout ? "w-full flex-nowrap" : "w-full sm:w-auto")}>
                      {availableViews.map((calendarView) => (
                        <button
                          key={calendarView}
                          type="button"
                          onClick={() => handleViewChange(calendarView)}
                          className={selectorPillButtonClassName(
                            view === calendarView,
                            cn("shrink-0 capitalize", isMobileLayout ? "min-h-8 flex-1 px-3 py-1.5 text-xs" : "px-4 py-1.5 text-sm")
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
              "min-h-0 flex-1 gap-3 overflow-hidden",
              isMobileLayout ? "grid grid-rows-[minmax(0,1.45fr)_minmax(13.5rem,0.85fr)]" : "grid lg:grid-cols-[minmax(0,1fr)_24rem]"
            )}
          >
            <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
              <div
                className={cn(
                  "surface-panel min-h-0 overflow-hidden rounded-[1.45rem] p-2.5 sm:rounded-[1.7rem] sm:p-3",
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
                "min-h-0 overflow-hidden",
                isMobileLayout ? "surface-panel rounded-[1.45rem] p-2.5 sm:rounded-[1.7rem] sm:p-3" : "flex h-full min-h-[24rem] lg:min-h-0"
              )}
            >
              {isMobileLayout ? dayInspectorPanel : <div className="flex min-h-0 flex-1">{dayInspectorPanel}</div>}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div
              className={cn(
                "surface-panel min-h-0 overflow-hidden rounded-[1.45rem] p-2.5 sm:rounded-[1.7rem] sm:p-3",
                (isFirstLoad || rescheduling) && "pointer-events-none opacity-70"
              )}
            >
              <div className={cn("overflow-hidden", isMobileLayout ? "h-full min-h-0" : "h-[23rem] xl:h-[clamp(24rem,46dvh,34rem)]")}>
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
          </div>
        )}
      </div>

      <Sheet
        open={isAppointmentInspectorOpen}
        onOpenChange={(open) => {
          setIsAppointmentInspectorOpen(open);
          if (!open) setSelectedAppointmentId(null);
        }}
      >
        <SheetContent
          side={isMobileLayout ? "bottom" : "right"}
          swipeToClose
          showHandle={false}
          onSwipeClose={() => {
            setIsAppointmentInspectorOpen(false);
            setSelectedAppointmentId(null);
          }}
          className={cn(
            "gap-0 !border-0 !bg-transparent !shadow-none p-2 [&>button]:right-5 [&>button]:top-5 [&>button]:z-30 [&>button]:rounded-full [&>button]:bg-white/85 [&>button]:backdrop-blur-xl",
            isMobileLayout
              ? "max-h-[92dvh] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              : "sm:inset-y-5 sm:right-5 sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:w-[min(92vw,34rem)] sm:max-w-[34rem] sm:p-0 lg:w-[36rem] lg:max-w-[36rem]"
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/75 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.91))] shadow-[0_28px_80px_rgba(15,23,42,0.26),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-2xl">
            <div className="flex shrink-0 justify-center pt-3">
              <span aria-hidden="true" className="native-sheet-handle" />
            </div>
            <div className="shrink-0 border-b border-white/65 px-5 pb-3 pt-2 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Floating inspector</p>
                  <SheetTitle className="mt-1 truncate pr-4 text-lg font-semibold tracking-[-0.03em] text-foreground">
                    {selectedAppointment ? getCalendarAppointmentLabel(selectedAppointment) : "Appointment"}
                  </SheetTitle>
                </div>
                {inspectorAppointmentCount > 1 ? (
                  <div className="mr-8 flex shrink-0 items-center gap-1.5" data-calendar-swipe-ignore="true">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full border-white/70 bg-white/82 shadow-sm"
                      onClick={() => selectInspectorAppointmentByDirection(-1)}
                      disabled={!canSwipeToPreviousAppointment}
                      aria-label="Previous appointment"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="rounded-full border border-white/70 bg-white/82 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm">
                      {Math.max(inspectorAppointmentIndex + 1, 1)}/{inspectorAppointmentCount}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full border-white/70 bg-white/82 shadow-sm"
                      onClick={() => selectInspectorAppointmentByDirection(1)}
                      disabled={!canSwipeToNextAppointment}
                      aria-label="Next appointment"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <SheetDescription className="sr-only">
                Review appointment money, customer, vehicle, timing, and status details for the selected calendar job.
              </SheetDescription>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4 touch-pan-y"
              onPointerDown={handleInspectorSwipePointerDown}
              onPointerMove={handleInspectorSwipePointerMove}
              onPointerUp={handleInspectorSwipePointerUp}
              onPointerCancel={handleInspectorSwipePointerCancel}
            >
              <div
                className={cn(
                  "min-h-full will-change-transform",
                  inspectorSwipeAnimating ? "transition-[opacity,transform] duration-200 ease-out" : "transition-none"
                )}
                style={
                  isMobileLayout
                    ? {
                        transform: `translate3d(${inspectorSwipeOffset}px, 0, 0)`,
                        opacity: String(1 - Math.min(Math.abs(inspectorSwipeOffset), 96) / 420),
                      }
                    : undefined
                }
              >
                {isAppointmentInspectorOpen ? (
                  <AppointmentInspectorPanel
                    appointment={selectedAppointment}
                    emptyTitle="Select an appointment"
                    emptyDescription={
                      view === "month"
                        ? "Choose a job from the month day list or calendar to inspect money, customer, vehicle, timing, and stage."
                        : "Choose a job from the week board to inspect money, customer, vehicle, timing, and stage."
                    }
                    compact={isMobileLayout}
                    presentation="floating"
                    onAppointmentChange={() => refetchAppointments()}
                    onRequestClose={() => {
                      setIsAppointmentInspectorOpen(false);
                      setSelectedAppointmentId(null);
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={showBlockDialog}
        onOpenChange={(open) => {
          setShowBlockDialog(open);
          if (!open) setEditingBlockId(null);
        }}
      >
        <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-[1.75rem] p-0 sm:max-w-lg">
          <DialogHeader>
            <div className="rounded-t-[1.75rem] border-b border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-5 py-5 sm:px-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Ban className="h-3.5 w-3.5" />
                Unavailable time
              </div>
              <DialogTitle className="mt-3 text-left text-xl font-semibold tracking-[-0.03em] text-slate-950">
                {editingBlockId ? "Edit block" : "Block time"}
              </DialogTitle>
            </div>
          </DialogHeader>
          <form className="space-y-5 px-5 py-5 sm:px-6 sm:py-6" onSubmit={handleCreateBlock}>
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

            <DialogFooter className="flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setShowBlockDialog(false)} disabled={creatingBlock} className="h-11 rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={creatingBlock || updatingBlock} className="h-11 rounded-xl">
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
