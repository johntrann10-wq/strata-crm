import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, Users } from "lucide-react";
import { api } from "../api";
import { useAction, useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { QuickBookSheet } from "../components/shared/QuickBookSheet";
import {
  type ApptRecord,
  ConflictBanner,
  DayView,
  MonthView,
  WeekView,
  detectConflicts,
  getHeaderTitle,
  getViewRange,
  navigateDate,
} from "../components/CalendarViews";

const VIEW_LABELS = {
  month: "See the full month, then drill into one day at a time",
  week: "Balance staff and bay time",
  day: "Run the day with clean slots and obvious next actions",
} as const;

export default function CalendarPage() {
  const { businessId, currentLocationId } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [quickBookOpen, setQuickBookOpen] = useState(false);
  const [quickBookDate, setQuickBookDate] = useState<string | undefined>(undefined);
  const [quickBookTime, setQuickBookTime] = useState<string | undefined>(undefined);
  const [showMobileAgenda, setShowMobileAgenda] = useState(false);
  const [showMobileTeam, setShowMobileTeam] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobileLayout(window.innerWidth < 768);
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
  const unassignedAppointments = activeAppointments.filter((appointment) => !appointment.assignedStaffId).length;
  const mobileAppointments = activeAppointments.filter((appointment) => appointment.isMobile).length;
  const nextUpcoming = activeAppointments.find((appointment) => new Date(appointment.startTime).getTime() >= Date.now()) ?? null;
  const uniqueStaff = new Set(
    activeAppointments
      .filter((appointment) => appointment.assignedStaff)
      .map((appointment) => appointment.assignedStaffId ?? `${appointment.assignedStaff?.firstName}-${appointment.assignedStaff?.lastName}`)
  ).size;
  const activeRevenue = activeAppointments.reduce((total, appointment) => total + Number(appointment.totalPrice ?? 0), 0);

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
    setView("day");
  }

  function handleSlotClick(date: Date) {
    const dateStr = date.toISOString().split("T")[0];
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    setQuickBookDate(dateStr);
    setQuickBookTime(`${h}:${m}`);
    setQuickBookOpen(true);
  }

  function handleApptClick(apt: ApptRecord) {
    navigate(`/appointments/${apt.id}`);
  }

  function handleNewAppointment() {
    const iso = currentDate.toISOString().split("T")[0];
    setQuickBookDate(iso);
    setQuickBookTime(undefined);
    setQuickBookOpen(true);
  }

  function handleBackToMonth() {
    setView("month");
  }

  function handleBooked(id: string) {
    navigate(`/appointments/${id}`);
  }

  const selectedDayAppointments = useMemo(
    () => activeAppointments.filter((appointment) => new Date(appointment.startTime).toDateString() === currentDate.toDateString()),
    [activeAppointments, currentDate]
  );
  const selectedDayRevenue = selectedDayAppointments.reduce((total, appointment) => total + Number(appointment.totalPrice ?? 0), 0);
  const selectedDayUnassigned = selectedDayAppointments.filter((appointment) => !appointment.assignedStaffId).length;
  const selectedDayConflicts = selectedDayAppointments.filter((appointment) => activeConflicts.has(appointment.id)).length;
  const teamOnDeck = Array.from(
    selectedDayAppointments.reduce((map, appointment) => {
      const key =
        appointment.assignedStaffId ??
        (appointment.assignedStaff ? `${appointment.assignedStaff.firstName}-${appointment.assignedStaff.lastName}` : "__unassigned__");
      const existing = map.get(key) ?? {
        label: appointment.assignedStaff
          ? `${appointment.assignedStaff.firstName} ${appointment.assignedStaff.lastName}`
          : "Unassigned",
        count: 0,
      };
      existing.count += 1;
      map.set(key, existing);
      return map;
    }, new Map<string, { label: string; count: number }>())
  );

  return (
    <div className="page-content flex h-full flex-col">
      <div className="page-section space-y-4">
        <div className="surface-panel overflow-hidden sm:rounded-[2rem]">
          <div className="border-b border-white/60 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,249,252,0.9))] px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
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
                  {!isMobileLayout ? (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      {VIEW_LABELS[view]}. Clean time-slot planning, clear workload visibility, and faster booking decisions.
                    </p>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-600">{VIEW_LABELS[view]}.</p>
                  )}
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
                    {(["month", "day"] as const).map((calendarView) => (
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
                    {view === "day" ? (
                      <Button variant="ghost" size="sm" className="rounded-full" onClick={handleBackToMonth}>
                        Back to month
                      </Button>
                    ) : null}
                  </div>

                {isMobileLayout ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="rounded-2xl border border-white/70 bg-white/78 px-3 py-3 text-center shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                      <p className="text-lg font-semibold text-foreground">{activeAppointments.length}</p>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Booked</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/78 px-3 py-3 text-center shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                      <p className="text-lg font-semibold text-foreground">{unassignedAppointments}</p>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Open</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/78 px-3 py-3 text-center shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                      <p className="text-lg font-semibold text-foreground">{activeConflicts.size}</p>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Conflicts</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2.5 sm:min-w-[280px] sm:max-w-[340px] xl:w-[340px]">
                <Button size="lg" className="justify-center rounded-2xl shadow-[0_16px_36px_rgba(249,115,22,0.24)]" onClick={handleNewAppointment}>
                  <Plus className="mr-2 h-4 w-4" />
                  New appointment
                </Button>
                <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-1", isMobileLayout && "hidden sm:grid")}>
                  <div className="rounded-[22px] border border-white/80 bg-white/82 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Next up</p>
                    {nextUpcoming ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {nextUpcoming.title ||
                            (nextUpcoming.client
                              ? `${nextUpcoming.client.firstName} ${nextUpcoming.client.lastName}`
                              : "Appointment")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(nextUpcoming.startTime).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No upcoming appointments in this range.</p>
                    )}
                  </div>
                  <div className="rounded-[22px] border border-white/80 bg-slate-950 p-4 text-white shadow-[0_16px_40px_rgba(15,23,42,0.24)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Operating lane</p>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xl font-semibold">{activeAppointments.length}</p>
                        <p className="text-xs text-slate-300">Booked</p>
                      </div>
                      <div>
                        <p className="text-xl font-semibold">{unassignedAppointments}</p>
                        <p className="text-xs text-slate-300">Open</p>
                      </div>
                      <div>
                        <p className="text-xl font-semibold">{activeConflicts.size}</p>
                        <p className="text-xs text-slate-300">Conflicts</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-300">
                      {uniqueStaff > 0 ? `${uniqueStaff} team members are carrying the current schedule.` : "No team assignments yet in this range."}
                    </p>
                  </div>
                </div>
                {isMobileLayout ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-center rounded-xl"
                      onClick={() => setShowMobileAgenda((value) => !value)}
                    >
                      <Clock3 className="mr-2 h-4 w-4" />
                      {showMobileAgenda ? "Hide agenda" : "Show agenda"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-center rounded-xl"
                      onClick={() => setShowMobileTeam((value) => !value)}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      {showMobileTeam ? "Hide team" : "Show team"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={cn("mt-5 grid gap-3", isMobileLayout ? "grid-cols-2" : "md:grid-cols-4")}>
              <div className="rounded-[22px] border border-white/80 bg-white/82 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Booked in view</p>
                <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950">{activeAppointments.length}</p>
                <p className="mt-1 text-sm text-slate-600">Everything active in this scheduling window.</p>
              </div>
              <div className="rounded-[22px] border border-white/80 bg-white/82 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Revenue in play</p>
                <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(activeRevenue)}
                </p>
                <p className="mt-1 text-sm text-slate-600">Quoted job value tied to the visible schedule.</p>
              </div>
              <div className="rounded-[22px] border border-white/80 bg-white/82 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Mobile work</p>
                <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950">{mobileAppointments}</p>
                <p className="mt-1 text-sm text-slate-600">Appointments leaving the shop and needing route awareness.</p>
              </div>
              <div className="rounded-[22px] border border-white/80 bg-white/82 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Team coverage</p>
                <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950">{uniqueStaff}</p>
                <p className="mt-1 text-sm text-slate-600">Assigned staff visible in this calendar range.</p>
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

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden pb-2",
              (isFirstLoad || rescheduling) && "pointer-events-none opacity-70"
            )}
          >
            {view === "month" ? (
              <MonthView
                currentDate={currentDate}
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

          <aside className={cn("space-y-4", isMobileLayout && "space-y-3")}>
            <div className="surface-panel rounded-[1.6rem] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected day</p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">
                    {currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </h2>
                </div>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleDayClick(currentDate)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Book
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[20px] border border-white/70 bg-white/78 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Appointments</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{selectedDayAppointments.length}</p>
                </div>
                <div className="rounded-[20px] border border-white/70 bg-white/78 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Revenue</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(selectedDayRevenue)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                  {selectedDayUnassigned} unassigned
                </span>
                <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                  {selectedDayConflicts} conflicts
                </span>
                <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-muted-foreground">
                  {teamOnDeck.length} owners on deck
                </span>
              </div>
            </div>

            <div className="surface-panel rounded-[1.5rem] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Agenda</p>
                  <p className="mt-1 text-sm text-muted-foreground">What this day actually looks like.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  {isMobileLayout ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-3"
                      onClick={() => setShowMobileAgenda((value) => !value)}
                    >
                      {showMobileAgenda ? "Hide" : "Show"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {!isMobileLayout || showMobileAgenda ? selectedDayAppointments.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {selectedDayAppointments.slice(0, 6).map((appointment) => (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => handleApptClick(appointment)}
                      className="flex w-full items-start gap-3 rounded-2xl border border-white/65 bg-white/72 px-3 py-3 text-left transition-colors hover:bg-white/88"
                    >
                      <div className="min-w-[54px] text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {new Date(appointment.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {appointment.title ||
                            (appointment.client ? `${appointment.client.firstName} ${appointment.client.lastName}` : "Appointment")}
                        </p>
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
                  <p className="mt-1 text-xs text-muted-foreground">Use Book to place something into this slot.</p>
                </div>
              ) : isMobileLayout ? (
                <div className="mt-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                  Tap Show to see the day agenda.
                </div>
              ) : null}
            </div>

            <div className="surface-panel rounded-[1.5rem] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Team on deck</p>
                  <p className="mt-1 text-sm text-muted-foreground">Keep visibility on who owns the day.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {isMobileLayout ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-3"
                      onClick={() => setShowMobileTeam((value) => !value)}
                    >
                      {showMobileTeam ? "Hide" : "Show"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {!isMobileLayout || showMobileTeam ? (
                <div className="mt-3 space-y-2">
                  {teamOnDeck.length > 0 ? (
                  teamOnDeck.slice(0, 5).map(([key, entry]) => (
                    <div key={key} className="flex items-center justify-between rounded-2xl border border-white/65 bg-white/72 px-3 py-2.5">
                      <span className="text-sm font-medium text-foreground">{entry.label}</span>
                      <span className="text-xs text-muted-foreground">{entry.count} booked</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                    Nobody is assigned on this day yet.
                  </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                  Tap Show to see assigned staff for this day.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {quickBookOpen ? (
        <QuickBookSheet
          open={quickBookOpen}
          onOpenChange={setQuickBookOpen}
          initialDate={quickBookDate}
          initialTime={quickBookTime}
          onBooked={handleBooked}
          businessId={businessId ?? undefined}
        />
      ) : null}
    </div>
  );
}
