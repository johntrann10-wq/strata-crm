import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router";
import { toast } from "sonner";
import { AlertTriangle, Ban, CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus } from "lucide-react";
import { api } from "../api";
import { useAction, useFindMany, useGlobalAction } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { cn } from "@/lib/utils";
import { AppointmentInspectorPanel } from "@/components/appointments/AppointmentInspectorPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type ApptRecord,
  ConflictBanner,
  DayView,
  MonthView,
  detectConflicts,
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

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPanelDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatPanelTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-border/70 bg-white/78 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-white/82 px-3 py-3 text-left transition-colors hover:bg-white",
        selected && !isCalendarBlockAppointment(appointment) && "border-primary/35 bg-primary/[0.05]"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {[getCalendarAppointmentLabel(appointment), Number(appointment.totalPrice ?? 0) > 0 ? formatCurrency(Number(appointment.totalPrice ?? 0)) : null]
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
            ? getOperationalTimelineLabel(appointment)
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

function DetailStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/72 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
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
  const initialView =
    requestedView === "month" || requestedView === "day"
      ? requestedView
      : null;

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setView] = useState<"month" | "day">(initialView ?? "month");
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
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const layoutInitializedRef = useRef(false);

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
    if (next.get("view") === "week") {
      next.set("view", "month");
      setSearchParams(next, { replace: true });
      return;
    }
    if (next.get("view") === view) return;
    next.set("view", view);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, view]);

  const { start: viewStart, end: viewEnd } = useMemo(
    () => getViewRange(currentDate, view),
    [currentDate, view]
  );

  const { queryStart, queryEnd } = useMemo(() => {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      queryStart: viewStart.getTime() < monthStart.getTime() ? viewStart : monthStart,
      queryEnd: viewEnd.getTime() > monthEnd.getTime() ? viewEnd : monthEnd,
    };
  }, [currentDate, viewEnd, viewStart]);

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
      totalPrice: true,
      depositAmount: true,
      depositPaid: true,
      paidAt: true,
      assignedStaffId: true,
      isMobile: true,
      notes: true,
      internalNotes: true,
      client: { id: true, firstName: true, lastName: true },
      vehicle: { id: true, make: true, model: true, year: true },
      assignedStaff: { id: true, firstName: true, lastName: true },
    },
    first: 500,
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
  const [{ data: monthFinanceMetrics }, runMonthFinanceMetrics] = useGlobalAction(api.getFinanceMetrics);
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
    setCurrentDate((d) => navigateDate(d, view, -1));
  }

  function handleNext() {
    setCurrentDate((d) => navigateDate(d, view, 1));
  }

  function handleToday() {
    setCurrentDate(new Date());
  }

  function handleDayClick(date: Date) {
    setCurrentDate(date);
    const daySnapshot = getCalendarDaySnapshot(appointments, date);
    const nextAppointment =
      daySnapshot.agendaItems.find(({ appointment }) => !isCalendarBlockAppointment(appointment))?.appointment ?? null;
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
    if (isCalendarBlockAppointment(apt)) {
      setSelectedBlock(apt);
      return;
    }
    setSelectedAppointmentId(apt.id);
  }

  function handleNewAppointment() {
    const iso = toLocalDateString(currentDate);
    navigate(`/appointments/new?date=${encodeURIComponent(iso)}${
      currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
    }`);
  }

  function handleOpenBlockDialog() {
    const selectedDate = toLocalDateString(currentDate);
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

  const selectedDaySnapshot = useMemo(() => getCalendarDaySnapshot(appointments, currentDate), [appointments, currentDate]);
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
          !isCalendarBlockAppointment(appointment) && getOperationalDayLabel(appointment, currentDate) === "Drop-off"
      ).length,
    [currentDate, selectedDayAgendaItems]
  );
  const selectedDayPickups = useMemo(
    () =>
      selectedDayAgendaItems.filter(
        ({ appointment }) =>
          !isCalendarBlockAppointment(appointment) && getOperationalDayLabel(appointment, currentDate) === "Pickup"
      ).length,
    [currentDate, selectedDayAgendaItems]
  );
  const selectedDayInShopCount = useMemo(
    () => selectedDayAgendaItems.filter(({ kind }) => kind === "onsite").length,
    [selectedDayAgendaItems]
  );
  const selectedDayRevenue = useMemo(
    () =>
      getOverviewCalendarAppointments(selectedDayAppointments).reduce(
        (total, appointment) => total + Number(appointment.totalPrice ?? 0),
        0
      ),
    [selectedDayAppointments]
  );
  const selectedDayUnassigned = selectedDayAppointments.filter((appointment) => !appointment.assignedStaffId).length;
  const selectedDayConflicts = selectedDayAppointments.filter((appointment) => activeConflicts.has(appointment.id)).length;
  const selectedMonthRange = useMemo(() => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }, [currentDate]);
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
  const selectedMonthRevenue = monthFinanceMetrics?.revenueThisMonth ?? 0;
  const selectedMonthConflicts = selectedMonthAppointments.filter((appointment) => activeConflicts.has(appointment.id)).length;
  const selectedMonthUnassigned = selectedMonthAppointments.filter((appointment) => !appointment.assignedStaffId).length;
  const selectedMonthDaysWithWork = useMemo(
    () =>
      new Set(
        selectedMonthAppointments.flatMap((appointment) => {
          const dates: string[] = [];
          const cursor = dayStart(getJobSpanStart(appointment));
          const last = dayEnd(getJobSpanEnd(appointment));
          while (cursor.getTime() <= last.getTime()) {
            if (cursor.getMonth() === currentDate.getMonth() && cursor.getFullYear() === currentDate.getFullYear()) {
              dates.push(toLocalDateString(cursor));
            }
            cursor.setDate(cursor.getDate() + 1);
          }
          return dates;
        })
      ).size,
    [currentDate, selectedMonthAppointments]
  );
  const busiestMonthDay = useMemo(() => {
    const counts = new Map<string, { date: Date; count: number }>();
    for (const appointment of selectedMonthAppointments) {
      const cursor = dayStart(getJobSpanStart(appointment));
      const last = dayEnd(getJobSpanEnd(appointment));
      while (cursor.getTime() <= last.getTime()) {
        if (cursor.getMonth() === currentDate.getMonth() && cursor.getFullYear() === currentDate.getFullYear()) {
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
  }, [currentDate, selectedMonthAppointments]);
  const availableViews = isMobileLayout ? (["day", "month"] as const) : (["day", "month"] as const);
  const selectedAppointment = useMemo(
    () => appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null,
    [appointments, selectedAppointmentId]
  );

  useEffect(() => {
    if (selectedAppointment && selectableDayAgendaItems.some(({ appointment }) => appointment.id === selectedAppointment.id)) return;
    setSelectedAppointmentId(selectableDayAgendaItems[0]?.appointment.id ?? null);
  }, [selectableDayAgendaItems, selectedAppointment]);

  useEffect(() => {
    if (!businessId) return;
    void runMonthFinanceMetrics({
      rangeStart: selectedMonthRange.start.toISOString(),
      rangeEnd: selectedMonthRange.end.toISOString(),
    });
  }, [businessId, runMonthFinanceMetrics, selectedMonthRange]);

  return (
    <div className="page-content flex h-full flex-col">
      <div className="page-section space-y-4">
        <div className="surface-panel overflow-hidden sm:rounded-[2rem]">
          <div className="border-b border-white/60 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.1),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Scheduling
                  </span>
                  {activeLocationName ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {activeLocationName}
                    </span>
                  ) : null}
                </div>

                <div>
                  <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.6rem]">
                    {getHeaderTitle(currentDate, view)}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {view === "month" ? "Month for density and date navigation." : "Day for timed work and in-shop awareness."}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="inline-flex w-full items-center justify-between rounded-full border border-white/70 bg-white/72 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_10px_24px_rgba(15,23,42,0.05)] sm:w-auto sm:justify-start">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={handlePrev} aria-label="Previous">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={isToday ? "default" : "secondary"}
                      size="sm"
                      className="rounded-full px-4"
                      onClick={handleToday}
                    >
                      Today
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={handleNext} aria-label="Next">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="inline-flex w-full items-center overflow-x-auto rounded-full border border-white/70 bg-white/72 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_10px_24px_rgba(15,23,42,0.05)] sm:w-auto">
                    {availableViews.map((calendarView) => (
                      <button
                        key={calendarView}
                        type="button"
                        onClick={() => setView(calendarView)}
                        className={cn(
                          "shrink-0 rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors",
                          view === calendarView
                            ? "bg-foreground text-background shadow-[0_8px_20px_rgba(15,23,42,0.18)]"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {calendarView === "month" ? "Month" : "Day"}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              <div className="flex flex-col gap-2.5 lg:min-w-[220px] lg:items-end">
                <Button size="lg" className="justify-center rounded-2xl shadow-[0_16px_36px_rgba(249,115,22,0.24)] lg:min-w-[220px]" onClick={handleNewAppointment}>
                  <Plus className="mr-2 h-4 w-4" />
                  New appointment
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="justify-center rounded-2xl border-border/70 bg-white/82 lg:min-w-[220px]"
                  onClick={handleOpenBlockDialog}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Block time
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

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden pb-2",
              (isFirstLoad || rescheduling) && "pointer-events-none opacity-70"
            )}
          >
            {view === "month" ? (
              <MonthView
                currentDate={currentDate}
                selectedDate={currentDate}
                selectedAppointmentId={selectedAppointmentId}
                appointments={appointments}
                onDayClick={handleDayClick}
                onApptClick={handleApptClick}
                conflictIds={activeConflicts}
                isMobileLayout={isMobileLayout}
              />
            ) : null}
            {view === "day" ? (
              <DayView
                currentDate={currentDate}
                appointments={appointments}
                onSlotClick={handleSlotClick}
                onApptClick={handleApptClick}
                selectedAppointmentId={selectedAppointmentId}
                isMobileLayout={isMobileLayout}
                onReschedule={handleReschedule}
                conflictIds={activeConflicts}
              />
            ) : null}
          </div>

          <aside
            className={cn(
              "space-y-4 xl:sticky xl:top-24 xl:self-start",
              isMobileLayout && "flex min-w-0 max-w-full flex-col overflow-hidden space-y-3"
            )}
          >
            {view === "month" ? (
              <>
                <div
                  className={cn(
                    "surface-panel min-w-0 max-w-full rounded-[1.6rem] p-4",
                    isMobileLayout && "order-2 overflow-hidden xl:order-none"
                  )}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Month overview</p>
                    <h2 className="mt-1 text-lg font-semibold text-foreground">
                      {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </h2>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <MetricBadge label="Jobs" value={String(selectedMonthAppointments.length)} />
                    <MetricBadge label="Revenue" value={formatCurrency(selectedMonthRevenue)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                      {selectedMonthDaysWithWork} active days
                    </span>
                    <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                      {selectedMonthUnassigned} unassigned
                    </span>
                    <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                      {selectedMonthConflicts} conflicts
                    </span>
                  </div>
                </div>

                <div
                  className={cn(
                    "surface-panel min-w-0 max-w-full rounded-[1.5rem] p-4",
                    isMobileLayout && "order-1 h-[19rem] min-h-[19rem] max-h-[19rem] overflow-hidden [contain:layout_paint] xl:order-none"
                  )}
                >
                  <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Day inspector</p>
                      <h3 className="truncate text-base font-semibold text-foreground">{formatPanelDate(currentDate)}</h3>
                    </div>
                    <div className="mt-3 grid min-w-0 gap-2 text-xs [grid-template-columns:repeat(2,minmax(0,1fr))]">
                      <DetailStat label="Active" value={selectedDayActiveItems} />
                      <DetailStat label="Revenue" value={formatCurrency(selectedDayRevenue)} />
                      <DetailStat label="Drop-offs" value={selectedDayDropoffs} />
                      <DetailStat label="Pickups" value={selectedDayPickups} />
                    </div>
                    <div className={cn("mt-3 min-h-0 min-w-0", isMobileLayout && "flex flex-1 flex-col overflow-hidden")}>
                      {selectedDayAgendaItems.length > 0 ? (
                        <div
                          className={cn(
                            "min-w-0 space-y-2",
                            isMobileLayout && "min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1 [overscroll-behavior:contain]"
                          )}
                        >
                          {selectedDayAgendaItems.slice(0, 5).map(({ appointment, kind }) => (
                            <AgendaPreviewRow
                              key={`${appointment.id}-${kind}`}
                              appointment={appointment}
                              kind={kind}
                              selected={selectedAppointmentId === appointment.id}
                              currentDate={currentDate}
                              onClick={() => handleApptClick(appointment)}
                            />
                          ))}
                          {selectedDayAgendaItems.length > 5 ? (
                            <p className="px-1 text-xs text-muted-foreground">+{selectedDayAgendaItems.length - 5} more on this date</p>
                          ) : null}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "space-y-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-5",
                            isMobileLayout && "h-full min-h-0 overflow-hidden"
                          )}
                        >
                          <p className="text-sm font-medium text-foreground">No appointments on this date</p>
                          {busiestMonthDay ? (
                            <p className="text-xs text-muted-foreground">
                              Busiest day this month: {formatPanelDate(busiestMonthDay.date)} ({busiestMonthDay.count})
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <AppointmentInspectorPanel
                  appointment={selectedAppointment}
                  emptyTitle="Select an appointment"
                  emptyDescription="Choose a job from the day agenda or calendar to inspect money, customer, vehicle, timing, and stage."
                  onAppointmentChange={() => refetchAppointments()}
                />
              </>
            ) : null}

            {view === "day" ? (
              <>
                <div className="surface-panel rounded-[1.6rem] p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Day overview</p>
                    <h2 className="mt-1 text-lg font-semibold text-foreground">{formatPanelDate(currentDate)}</h2>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <DetailStat label="Active" value={selectedDayActiveItems} />
                    <DetailStat label="Revenue" value={formatCurrency(selectedDayRevenue)} />
                    <DetailStat label="In shop" value={selectedDayInShopCount} />
                    <DetailStat label="Pickups" value={selectedDayPickups} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                      {selectedDayDropoffs} drop-offs
                    </span>
                    <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                      {selectedDayUnassigned} unassigned
                    </span>
                    <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                      {selectedDayConflicts} conflicts
                    </span>
                  </div>
                </div>

                <div className="surface-panel rounded-[1.5rem] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Day agenda</p>
                    </div>
                  </div>
                  {selectedDayAgendaItems.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {selectedDayAgendaItems.slice(0, 6).map(({ appointment, kind }) => (
                        <AgendaPreviewRow
                          key={`${appointment.id}-${kind}-day`}
                          appointment={appointment}
                          kind={kind}
                          selected={selectedAppointmentId === appointment.id}
                          currentDate={currentDate}
                          onClick={() => handleApptClick(appointment)}
                        />
                      ))}
                      {selectedDayAgendaItems.length > 6 ? (
                        <p className="px-1 text-xs text-muted-foreground">+{selectedDayAgendaItems.length - 6} more on this day</p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-foreground">No appointments on this day</p>
                    </div>
                  )}
                </div>

                <AppointmentInspectorPanel
                  appointment={selectedAppointment}
                  emptyTitle="Select an appointment"
                  emptyDescription="Choose a job from the day agenda or timeline to inspect money, customer, vehicle, timing, and stage."
                  onAppointmentChange={() => refetchAppointments()}
                />
              </>
            ) : null}
          </aside>
        </div>
      </div>

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
