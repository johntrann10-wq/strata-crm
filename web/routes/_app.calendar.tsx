import { useState, useEffect, useMemo, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router";
import { useFindMany, useAction } from "../hooks/useApi";
import { api } from "../api";
import { toast } from "sonner";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ApptRecord,
  getViewRange,
  getHeaderTitle,
  navigateDate,
  MonthView,
  WeekView,
  DayView,
  detectConflicts,
  ConflictBanner,
} from "../components/CalendarViews";
import { QuickBookSheet } from "../components/shared/QuickBookSheet";

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { user, businessId } = useOutletContext<AuthOutletContext>();
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
      client: { firstName: true, lastName: true },
      vehicle: { make: true, model: true },
      assignedStaff: { firstName: true, lastName: true },
    },
    first: 250,
  });

  // Keep previous appointments visible during re-fetches (isFirstLoad pattern)
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
      void refetchAppointments({ requestPolicy: "network-only" });
    }
  }

  const isToday = currentDate.toDateString() === new Date().toDateString();

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
    setQuickBookTime(h + ":" + m);
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
    navigate("/appointments/" + id);
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Header ── */}
      <div className="relative flex items-center justify-between px-4 py-3 border-b border-border shrink-0 gap-2 flex-wrap">
        {fetching && (
          <div className="absolute top-2 right-2 z-10">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrev} aria-label="Previous">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant={isToday ? "default" : "outline"} size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext} aria-label="Next">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <h2 className="text-base font-semibold text-foreground ml-1">
            {getHeaderTitle(currentDate, view)}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            {(["month", "week", "day"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1.5 capitalize transition-colors",
                  view === v
                    ? "bg-blue-600 text-white font-medium"
                    : "bg-background text-muted-foreground hover:bg-muted/50"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <Button size="sm" onClick={handleNewAppointment} className="gap-1">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Appointment</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      <ConflictBanner
        staffConflictCount={conflictDismissed ? 0 : staffConflictIds.size}
        businessConflictCount={conflictDismissed ? 0 : businessConflictIds.size}
        onDismiss={() => setConflictDismissed(true)}
      />

      {/* ── Error with retry ── */}
      {error && (
        <div className="mx-4 mt-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-sm text-red-700 dark:text-red-300">
            Failed to load appointments: {error.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/50"
            onClick={() => refetchAppointments()}
            disabled={fetching}
          >
            {fetching ? "Retrying…" : "Try again"}
          </Button>
        </div>
      )}

      {/* ── Calendar Body ── */}
        <div className={cn("flex flex-col flex-1 overflow-hidden", isFirstLoad && "opacity-60 pointer-events-none")}>
          {view === "month" && (
            <MonthView
              currentDate={currentDate}
              appointments={appointments}
              onDayClick={handleDayClick}
              onApptClick={handleApptClick}
              conflictIds={activeConflicts}
            />
          )}
          {view === "week" && (
            <WeekView
              currentDate={currentDate}
              appointments={appointments}
              onSlotClick={handleSlotClick}
              onApptClick={handleApptClick}
              onReschedule={handleReschedule}
              conflictIds={activeConflicts}
            />
          )}
          {view === "day" && (
            <DayView
              currentDate={currentDate}
              appointments={appointments}
              onSlotClick={handleSlotClick}
              onApptClick={handleApptClick}
              isMobileLayout={isMobileLayout}
              onReschedule={handleReschedule}
              conflictIds={activeConflicts}
            />
          )}
        </div>

      {quickBookOpen && (
        <QuickBookSheet
          open={quickBookOpen}
          onOpenChange={setQuickBookOpen}
          initialDate={quickBookDate}
          initialTime={quickBookTime}
          onBooked={handleBooked}
          businessId={businessId ?? undefined}
        />
      )}
    </div>
  );
}