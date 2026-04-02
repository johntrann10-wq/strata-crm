import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus } from "lucide-react";
import { api } from "../api";
import { useAction, useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  type ApptRecord,
  ConflictBanner,
  DayView,
  MonthView,
  WeekView,
  detectConflicts,
  getHeaderTitle,
  getWeekDays,
  getViewRange,
  navigateDate,
} from "../components/CalendarViews";
import { dayEnd, dayStart, getJobSpanEnd, getJobSpanStart, hasLaborOnDay, hasPresenceOnDay, isMultiDayJob } from "@/lib/calendarJobSpans";

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

export default function CalendarPage() {
  const { businessId, currentLocationId } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setView] = useState<"month" | "week" | "day">("week");
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const layoutInitializedRef = useRef(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileLayout(mobile);
      if (!layoutInitializedRef.current) {
        setView(mobile ? "month" : "week");
        layoutInitializedRef.current = true;
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const { start: viewStart, end: viewEnd } = useMemo(
    () => getViewRange(currentDate, view),
    [currentDate, view]
  );

  const { startGte, startLte } = useMemo(
    () => ({ startGte: viewStart.toISOString(), startLte: viewEnd.toISOString() }),
    [viewStart, viewEnd]
  );

  const [{ data: appointmentsData, fetching, error }, refetchAppointments] = useFindMany(api.appointment, {
    startGte,
    startLte,
    locationId: currentLocationId ?? undefined,
    sort: { startTime: "Ascending" },
    pause: !businessId,
    select: {
      id: true,
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
      assignedStaffId: true,
      isMobile: true,
      client: { firstName: true, lastName: true },
      vehicle: { make: true, model: true, year: true },
      assignedStaff: { firstName: true, lastName: true },
    },
    first: 250,
  });

  const [{ data: locationsRaw }] = useFindMany(api.location, {
    first: 100,
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

  const { staffConflictIds, businessConflictIds } = useMemo(() => detectConflicts(appointments), [appointments]);
  const activeConflicts = conflictDismissed
    ? new Set<string>()
    : new Set([...staffConflictIds, ...businessConflictIds]);

  useEffect(() => {
    setConflictDismissed(false);
  }, [appointmentsData]);

  const [{ fetching: rescheduling }, runReschedule] = useAction(api.appointment.update);

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

  const activeAppointments = appointments.filter(
    (appointment) => appointment.status !== "cancelled" && appointment.status !== "no-show"
  );

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
    navigate(`/appointments/${apt.id}`);
  }

  function handleNewAppointment() {
    const iso = toLocalDateString(currentDate);
    navigate(`/appointments/new?date=${encodeURIComponent(iso)}${
      currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
    }`);
  }

  const selectedDayAppointments = useMemo(
    () => activeAppointments.filter((appointment) => hasLaborOnDay(appointment, currentDate)),
    [activeAppointments, currentDate]
  );
  const selectedDayOnSiteJobs = useMemo(
    () => activeAppointments.filter((appointment) => isMultiDayJob(appointment) && hasPresenceOnDay(appointment, currentDate)),
    [activeAppointments, currentDate]
  );
  const selectedDayOnSiteOnlyJobs = useMemo(() => {
    const bookedIds = new Set(selectedDayAppointments.map((appointment) => appointment.id));
    return selectedDayOnSiteJobs.filter((appointment) => !bookedIds.has(appointment.id));
  }, [selectedDayAppointments, selectedDayOnSiteJobs]);
  const selectedDayActiveItems = selectedDayAppointments.length + selectedDayOnSiteOnlyJobs.length;
  const selectedDayRevenue = selectedDayAppointments.reduce((total, appointment) => total + Number(appointment.totalPrice ?? 0), 0);
  const selectedDayUnassigned = selectedDayAppointments.filter((appointment) => !appointment.assignedStaffId).length;
  const selectedDayConflicts = selectedDayAppointments.filter((appointment) => activeConflicts.has(appointment.id)).length;
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const selectedWeekAppointments = useMemo(
    () =>
      activeAppointments.filter((appointment) =>
        weekDays.some((day) => hasLaborOnDay(appointment, day))
      ),
    [activeAppointments, weekDays]
  );
  const selectedWeekRevenue = selectedWeekAppointments.reduce((total, appointment) => total + Number(appointment.totalPrice ?? 0), 0);
  const selectedWeekUnassigned = selectedWeekAppointments.filter((appointment) => !appointment.assignedStaffId).length;
  const selectedWeekConflicts = selectedWeekAppointments.filter((appointment) => activeConflicts.has(appointment.id)).length;
  const weekAgenda = useMemo(
    () =>
      weekDays
        .map((day) => ({
          day,
          appointments: selectedWeekAppointments.filter(
            (appointment) => hasLaborOnDay(appointment, day)
          ),
        }))
        .filter((entry) => entry.appointments.length > 0),
    [selectedWeekAppointments, weekDays]
  );
  const selectedMonthAppointments = useMemo(
    () =>
      activeAppointments.filter((appointment) => {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
        const spanStart = getJobSpanStart(appointment);
        const spanEnd = getJobSpanEnd(appointment);
        return spanStart.getTime() <= monthEnd.getTime() && spanEnd.getTime() >= monthStart.getTime();
      }),
    [activeAppointments, currentDate]
  );
  const selectedMonthRevenue = selectedMonthAppointments.reduce(
    (total, appointment) => total + Number(appointment.totalPrice ?? 0),
    0
  );
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
  const availableViews = isMobileLayout ? (["day", "week", "month"] as const) : (["week", "day", "month"] as const);

  return (
    <div className="page-content flex h-full flex-col">
      <div className="page-section space-y-4">
        <div className="surface-panel overflow-hidden sm:rounded-[2rem]">
          <div className="border-b border-white/60 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,249,252,0.9))] px-4 py-4 sm:px-6">
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
                        {calendarView === "month" ? "Month" : calendarView === "week" ? "Week" : "Day"}
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
                appointments={appointments}
                onDayClick={handleDayClick}
                onApptClick={handleApptClick}
                conflictIds={activeConflicts}
              />
            ) : null}
            {view === "week" ? (
              <WeekView
                currentDate={currentDate}
                appointments={appointments}
                onSlotClick={handleSlotClick}
                onApptClick={handleApptClick}
                onDayClick={handleDayClick}
                onReschedule={handleReschedule}
                conflictIds={activeConflicts}
              />
            ) : null}
            {view === "day" ? (
              <DayView
                currentDate={currentDate}
                appointments={appointments}
                onSlotClick={handleSlotClick}
                onApptClick={handleApptClick}
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
                    <div className="rounded-[20px] border border-white/70 bg-white/78 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Appointments</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{selectedMonthAppointments.length}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/70 bg-white/78 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Revenue</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(selectedMonthRevenue)}</p>
                    </div>
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
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected date</p>
                      <h3 className="truncate text-base font-semibold text-foreground">{formatPanelDate(currentDate)}</h3>
                    </div>
                    <div className="mt-3 grid min-w-0 gap-2 text-xs [grid-template-columns:repeat(3,minmax(0,1fr))]">
                        <div className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                          <p className={cn("truncate font-semibold text-foreground", isMobileLayout && "text-[13px] leading-none")}>
                            {selectedDayActiveItems}
                          </p>
                          <p className="mt-1 truncate text-muted-foreground">Active</p>
                        </div>
                      <div className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                        <p className={cn("truncate font-semibold text-foreground", isMobileLayout && "text-[13px] leading-none tracking-tight")}>
                          {formatCurrency(selectedDayRevenue)}
                        </p>
                        <p className="mt-1 truncate text-muted-foreground">Revenue</p>
                      </div>
                      <div className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                        <p className={cn("truncate font-semibold text-foreground", isMobileLayout && "text-[13px] leading-none")}>
                          {selectedDayUnassigned}
                        </p>
                        <p className="mt-1 truncate text-muted-foreground">Open</p>
                      </div>
                    </div>
                    <div className={cn("mt-3 min-h-0 min-w-0", isMobileLayout && "flex flex-1 flex-col overflow-hidden")}>
                      {selectedDayOnSiteJobs.length > 0 ? (
                        <div className="mb-3 flex min-w-0 shrink-0 flex-wrap gap-2 overflow-x-hidden">
                          {selectedDayOnSiteJobs.slice(0, 3).map((appointment) => (
                            <button
                              key={`${appointment.id}-presence`}
                              type="button"
                              onClick={() => handleApptClick(appointment)}
                              className={cn(
                                "inline-flex max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-full border border-border/60 bg-background/80 px-3 py-1.5 font-semibold text-muted-foreground",
                                isMobileLayout && "px-2.5 py-1 text-[10px] leading-none"
                              )}
                            >
                              <span className="h-2 w-2 rounded-full bg-sky-500" />
                              <span className="min-w-0 max-w-full truncate">
                                {appointment.title ||
                                  (appointment.client ? `${appointment.client.firstName} ${appointment.client.lastName}` : "Job")}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {selectedDayAppointments.length > 0 ? (
                        <div
                          className={cn(
                            "min-w-0 space-y-2",
                            isMobileLayout && "min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1 [overscroll-behavior:contain]"
                          )}
                        >
                          {selectedDayAppointments.slice(0, 5).map((appointment) => (
                            <button
                              key={appointment.id}
                              type="button"
                              onClick={() => handleApptClick(appointment)}
                              className={cn(
                                "flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-2xl border border-white/65 bg-white/72 px-3 py-3 text-left transition-colors hover:bg-white/88",
                                isMobileLayout && "gap-2.5 px-3 py-2.5"
                              )}
                            >
                              <div className="min-w-[62px] text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {formatPanelTime(appointment.startTime)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-start justify-between gap-2">
                                  <p className={cn("min-w-0 flex-1 truncate font-semibold text-foreground", isMobileLayout ? "text-[13px] leading-4" : "text-sm")}>
                                    {appointment.title ||
                                      (appointment.client ? `${appointment.client.firstName} ${appointment.client.lastName}` : "Appointment")}
                                  </p>
                                  <span
                                    className={cn(
                                      "max-w-[6.75rem] shrink-0 truncate rounded-full border border-border/70 bg-background px-2 py-0.5 font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                                      isMobileLayout && "max-w-[5.5rem] text-[9px] leading-none"
                                    )}
                                  >
                                    {appointment.status.replace("_", " ")}
                                  </span>
                                </div>
                                <p className={cn("truncate text-muted-foreground", isMobileLayout ? "text-[11px] leading-4" : "text-xs")}>
                                  {appointment.vehicle
                                    ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
                                    : appointment.assignedStaff
                                      ? `${appointment.assignedStaff.firstName} ${appointment.assignedStaff.lastName}`
                                      : "Unassigned"}
                                </p>
                              </div>
                            </button>
                          ))}
                          {selectedDayAppointments.length > 5 ? (
                            <p className="px-1 text-xs text-muted-foreground">+{selectedDayAppointments.length - 5} more on this date</p>
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
              </>
            ) : null}

            {view === "week" ? (
              <>
                <div className="surface-panel rounded-[1.6rem] p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Week summary</p>
                    <h2 className="mt-1 text-lg font-semibold text-foreground">
                      {weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
                      {weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </h2>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-[20px] border border-white/70 bg-white/78 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Appointments</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{selectedWeekAppointments.length}</p>
                    </div>
                    <div className="rounded-[20px] border border-white/70 bg-white/78 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Revenue</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(selectedWeekRevenue)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                      {selectedWeekUnassigned} unassigned
                    </span>
                    <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                      {selectedWeekConflicts} conflicts
                    </span>
                  </div>
                </div>

                <div className="surface-panel rounded-[1.5rem] p-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Week line-up</p>
                    <h3 className="text-base font-semibold text-foreground">{formatPanelDate(currentDate)}</h3>
                  </div>
                  {weekAgenda.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {weekAgenda.map((entry) => (
                        <div key={entry.day.toISOString()} className="rounded-2xl border border-white/65 bg-white/72 px-3 py-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setCurrentDate(entry.day)}
                              className="text-left text-sm font-semibold text-foreground"
                            >
                              {formatPanelDate(entry.day)}
                            </button>
                            <span className="text-xs text-muted-foreground">{entry.appointments.length} booked</span>
                          </div>
                          <div className="space-y-2">
                            {entry.appointments.slice(0, 4).map((appointment) => (
                              <button
                                key={appointment.id}
                                type="button"
                                onClick={() => handleApptClick(appointment)}
                                className="flex w-full items-start gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-left transition-colors hover:bg-background"
                              >
                                <div className="min-w-[62px] text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                  {formatPanelTime(appointment.startTime)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="truncate text-sm font-semibold text-foreground">
                                      {appointment.title ||
                                        (appointment.client ? `${appointment.client.firstName} ${appointment.client.lastName}` : "Appointment")}
                                    </p>
                                    <span className="shrink-0 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                      {appointment.status.replace("_", " ")}
                                    </span>
                                  </div>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {appointment.vehicle
                                      ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
                                      : appointment.assignedStaff
                                        ? `${appointment.assignedStaff.firstName} ${appointment.assignedStaff.lastName}`
                                        : "Unassigned"}
                                  </p>
                                </div>
                              </button>
                            ))}
                            {entry.appointments.length > 4 ? (
                              <p className="px-1 text-xs text-muted-foreground">+{entry.appointments.length - 4} more on this day</p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-foreground">No appointments this week</p>
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {view === "day" ? (
              <>
                <div className="surface-panel rounded-[1.6rem] p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Day summary</p>
                    <h2 className="mt-1 text-lg font-semibold text-foreground">{formatPanelDate(currentDate)}</h2>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-[20px] border border-white/70 bg-white/78 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Appointments</p>
                        <p className="mt-2 text-2xl font-semibold text-foreground">{selectedDayActiveItems}</p>
                      </div>
                    <div className="rounded-[20px] border border-white/70 bg-white/78 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Revenue</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(selectedDayRevenue)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
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
                  {selectedDayOnSiteJobs.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Vehicles on site</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedDayOnSiteJobs.slice(0, 4).map((appointment) => (
                          <button
                            key={`${appointment.id}-day-presence`}
                            type="button"
                            onClick={() => handleApptClick(appointment)}
                            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
                          >
                            <span className="h-2 w-2 rounded-full bg-sky-500" />
                            <span className="max-w-[11rem] truncate">
                              {appointment.title ||
                                (appointment.client ? `${appointment.client.firstName} ${appointment.client.lastName}` : "Job")}
                            </span>
                          </button>
                        ))}
                        {selectedDayOnSiteJobs.length > 4 ? (
                          <span className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                            +{selectedDayOnSiteJobs.length - 4} more
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {selectedDayAppointments.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {selectedDayAppointments.slice(0, 6).map((appointment) => (
                        <button
                          key={appointment.id}
                          type="button"
                          onClick={() => handleApptClick(appointment)}
                          className="flex w-full items-start gap-3 rounded-2xl border border-white/65 bg-white/72 px-3 py-3 text-left transition-colors hover:bg-white/88"
                        >
                          <div className="min-w-[62px] text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {formatPanelTime(appointment.startTime)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {appointment.title ||
                                  (appointment.client ? `${appointment.client.firstName} ${appointment.client.lastName}` : "Appointment")}
                              </p>
                              <span className="shrink-0 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {appointment.status.replace("_", " ")}
                              </span>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {appointment.vehicle
                                ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
                                : appointment.assignedStaff
                                  ? `${appointment.assignedStaff.firstName} ${appointment.assignedStaff.lastName}`
                                  : "Unassigned"}
                            </p>
                          </div>
                        </button>
                      ))}
                      {selectedDayAppointments.length > 6 ? (
                        <p className="px-1 text-xs text-muted-foreground">+{selectedDayAppointments.length - 6} more on this day</p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-foreground">No appointments on this day</p>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </aside>
        </div>
      </div>

    </div>
  );
}
