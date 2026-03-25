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
  month: "Plan the month",
  week: "Balance staff and bay time",
  day: "Run today's floor",
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

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileLayout(mobile);
      if (mobile) setView("day");
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
    const iso = date.toISOString().split("T")[0];
    setQuickBookDate(iso);
    setQuickBookTime(undefined);
    setQuickBookOpen(true);
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

  function handleBooked(id: string) {
    navigate(`/appointments/${id}`);
  }

  return (
    <div className="page-content flex h-full flex-col">
      <div className="page-section space-y-4">
        <div className="overflow-hidden rounded-[24px] border border-border/70 bg-background/95 shadow-sm sm:rounded-[28px]">
          <div className="border-b border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-4 sm:px-6">
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
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {getHeaderTitle(currentDate, view)}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {VIEW_LABELS[view]}. Book faster, spot conflicts earlier, and keep the floor balanced.
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="inline-flex w-full items-center justify-between rounded-full border border-border/70 bg-background/80 p-1 shadow-sm sm:w-auto sm:justify-start">
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

                  <div className="inline-flex w-full items-center overflow-x-auto rounded-full border border-border/70 bg-background/80 p-1 shadow-sm sm:w-auto">
                    {(["month", "week", "day"] as const).map((calendarView) => (
                      <button
                        key={calendarView}
                        type="button"
                        onClick={() => setView(calendarView)}
                        className={cn(
                          "shrink-0 rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors",
                          view === calendarView
                            ? "bg-foreground text-background shadow-sm"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {calendarView}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:min-w-[240px] sm:max-w-[280px] xl:w-[280px]">
                <Button size="lg" className="justify-center rounded-2xl" onClick={handleNewAppointment}>
                  <Plus className="mr-2 h-4 w-4" />
                  New appointment
                </Button>
                <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
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
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-b border-border/70 bg-muted/15 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4 xl:px-6">
            <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Booked</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{activeAppointments.length}</p>
                </div>
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Appointments in the active {view} view.</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coverage</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{uniqueStaff}</p>
                </div>
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {unassignedAppointments > 0 ? `${unassignedAppointments} appointments still need an owner.` : "All visible work has an owner."}
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Conflicts</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{activeConflicts.size}</p>
                </div>
                <AlertTriangle className={cn("h-5 w-5", activeConflicts.size > 0 ? "text-rose-600" : "text-muted-foreground")} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {activeConflicts.size > 0 ? "Resolve overlaps before they create handoff problems." : "No overlaps in the current view."}
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Field work</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{mobileAppointments}</p>
                </div>
                <Clock3 className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Mobile appointments in the visible schedule.</p>
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

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden pb-2",
            (isFirstLoad || rescheduling) && "opacity-70 pointer-events-none"
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
