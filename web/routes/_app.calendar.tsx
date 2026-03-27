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
  getViewRange,
  navigateDate,
} from "../components/CalendarViews";

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    setView("day");
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
    () => activeAppointments.filter((appointment) => new Date(appointment.startTime).toDateString() === currentDate.toDateString()),
    [activeAppointments, currentDate]
  );
  const selectedDayRevenue = selectedDayAppointments.reduce((total, appointment) => total + Number(appointment.totalPrice ?? 0), 0);
  const selectedDayUnassigned = selectedDayAppointments.filter((appointment) => !appointment.assignedStaffId).length;
  const selectedDayConflicts = selectedDayAppointments.filter((appointment) => activeConflicts.has(appointment.id)).length;
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

          <aside className={cn("space-y-4", isMobileLayout && "space-y-3")}>
            <div className="surface-panel rounded-[1.6rem] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected day</p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">
                    {currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </h2>
                </div>
                <Button size="sm" variant="outline" className="rounded-full" onClick={handleNewAppointment}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  New appointment
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
              </div>
            </div>

            <div className="surface-panel rounded-[1.5rem] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Day agenda</p>
                </div>
              </div>
              {selectedDayAppointments.length > 0 ? (
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
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

    </div>
  );
}
