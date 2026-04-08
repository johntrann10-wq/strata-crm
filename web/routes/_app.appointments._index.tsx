import { useEffect, useMemo, useState } from "react";
import { endOfWeek, format, isSameDay, isToday, startOfWeek } from "date-fns";
import { Link, useOutletContext } from "react-router";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { AppointmentInspectorPanel } from "@/components/appointments/AppointmentInspectorPanel";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { api, ApiError } from "../api";
import { useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
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

type StaffRecord = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
};

type LocationRecord = {
  id: string;
  name?: string | null;
};

type ScheduleFilter =
  | "all"
  | "drop_offs"
  | "in_shop"
  | "active_work"
  | "waiting"
  | "ready"
  | "pickups";

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
  totalPrice?: number | null;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
  paidAt?: string | null;
  assignedStaffId?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  location?: { name?: string | null } | null;
  client?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
  vehicle?: { id?: string | null; year?: number | null; make?: string | null; model?: string | null } | null;
  assignedStaff?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
};

type ShopStatusSnapshot = {
  inShopNow: AppointmentRecord[];
  dropOffsToday: AppointmentRecord[];
  pickupsToday: AppointmentRecord[];
  activeWork: AppointmentRecord[];
  waitingJobs: AppointmentRecord[];
  readyForPickup: AppointmentRecord[];
};

type DaySnapshot = {
  date: Date;
  jobs: AppointmentRecord[];
  dropOffs: AppointmentRecord[];
  active: AppointmentRecord[];
  waiting: AppointmentRecord[];
  ready: AppointmentRecord[];
  pickups: AppointmentRecord[];
  carryOvers: AppointmentRecord[];
  highlights: AppointmentRecord[];
};

const FILTER_OPTIONS: Array<{ value: ScheduleFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "drop_offs", label: "Drop-offs" },
  { value: "in_shop", label: "In shop" },
  { value: "active_work", label: "Active work" },
  { value: "waiting", label: "Waiting / curing / hold" },
  { value: "ready", label: "Ready for pickup" },
  { value: "pickups", label: "Pickups" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
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

function getAppointmentMoneyLabel(appointment: AppointmentRecord): string | null {
  const amount = Number(appointment.totalPrice ?? 0);
  if (amount <= 0) return null;
  return formatCurrency(amount);
}

function isOperationalAppointment(appointment: AppointmentRecord): boolean {
  return appointment.status !== "cancelled" && appointment.status !== "no-show";
}

function isDropOffDay(appointment: AppointmentRecord, date: Date): boolean {
  return isSameDay(getJobSpanStart(appointment), date);
}

function isPickupDay(appointment: AppointmentRecord, date: Date): boolean {
  return isSameDay(getJobSpanEnd(appointment), date);
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

function matchesScheduleFilter(appointment: AppointmentRecord, filter: ScheduleFilter, today: Date): boolean {
  switch (filter) {
    case "drop_offs":
      return isDropOffDay(appointment, today);
    case "in_shop":
      return isInShopOnDate(appointment, today);
    case "active_work":
      return isActiveWorkJob(appointment) && hasPresenceOnDay(appointment, today);
    case "waiting":
      return isWaitingJob(appointment) && hasPresenceOnDay(appointment, today);
    case "ready":
      return isReadyForPickupJob(appointment) && hasPresenceOnDay(appointment, today);
    case "pickups":
      return isPickupDay(appointment, today);
    default:
      return true;
  }
}

function buildShopStatus(appointments: AppointmentRecord[], today: Date): ShopStatusSnapshot {
  return {
    inShopNow: sortByOperationalTime(appointments.filter((appointment) => isInShopOnDate(appointment, today))),
    dropOffsToday: sortByOperationalTime(
      appointments.filter((appointment) => hasLaborOnDay(appointment, today) && isDropOffDay(appointment, today))
    ),
    pickupsToday: sortByOperationalTime(
      appointments.filter((appointment) => hasPresenceOnDay(appointment, today) && isPickupDay(appointment, today))
    ),
    activeWork: sortByOperationalTime(
      appointments.filter((appointment) => isActiveWorkJob(appointment) && hasPresenceOnDay(appointment, today))
    ),
    waitingJobs: sortByOperationalTime(
      appointments.filter((appointment) => isWaitingJob(appointment) && hasPresenceOnDay(appointment, today))
    ),
    readyForPickup: sortByOperationalTime(
      appointments.filter((appointment) => isReadyForPickupJob(appointment) && hasPresenceOnDay(appointment, today))
    ),
  };
}

function buildDaySnapshot(appointments: AppointmentRecord[], date: Date): DaySnapshot {
  const jobs = sortByOperationalTime(appointments.filter((appointment) => hasPresenceOnDay(appointment, date) || hasLaborOnDay(appointment, date)));
  const dropOffs = jobs.filter((appointment) => isDropOffDay(appointment, date));
  const active = jobs.filter((appointment) => isActiveWorkJob(appointment) && hasPresenceOnDay(appointment, date));
  const waiting = jobs.filter((appointment) => isWaitingJob(appointment) && hasPresenceOnDay(appointment, date));
  const ready = jobs.filter((appointment) => isReadyForPickupJob(appointment) && hasPresenceOnDay(appointment, date));
  const pickups = jobs.filter((appointment) => isPickupDay(appointment, date));
  const carryOvers = jobs.filter(
    (appointment) => isMultiDayJob(appointment) && hasPresenceOnDay(appointment, date) && !isDropOffDay(appointment, date) && !isPickupDay(appointment, date)
  );
  const highlights = dedupeAppointments([...ready, ...dropOffs, ...active, ...pickups, ...carryOvers]).slice(0, 3);

  return { date, jobs, dropOffs, active, waiting, ready, pickups, carryOvers, highlights };
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

export default function AppointmentsPage() {
  const { businessId, currentLocationId, setCurrentLocationId } = useOutletContext<AuthOutletContext>();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [activeLocationId, setActiveLocationId] = useState<string>(currentLocationId ?? "all");
  const [activeFilter, setActiveFilter] = useState<ScheduleFilter>("all");
  const [activeTechFilter, setActiveTechFilter] = useState<string>("all");
  const [isSmallViewport, setIsSmallViewport] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  useEffect(() => {
    setActiveLocationId(currentLocationId ?? "all");
  }, [currentLocationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsSmallViewport(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
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
  const today = useMemo(() => new Date(), []);

  const [{ data: appointmentsData, fetching, error }, refetchAppointments] = useFindMany(api.appointment, {
    startGte: queryStart,
    startLte: queryEnd,
    locationId: activeLocationId !== "all" ? activeLocationId : undefined,
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
      totalPrice: true,
      depositAmount: true,
      depositPaid: true,
      paidAt: true,
      assignedStaffId: true,
      notes: true,
      internalNotes: true,
      location: { name: true },
      client: { id: true, firstName: true, lastName: true },
      vehicle: { id: true, year: true, make: true, model: true },
      assignedStaff: { id: true, firstName: true, lastName: true },
    },
  });
  const [{ data: staffRaw }] = useFindMany(api.staff, { first: 100, pause: !businessId } as any);
  const [{ data: locationsRaw }] = useFindMany(api.location, { first: 100, pause: !businessId } as any);

  const records = useMemo(() => ((appointmentsData ?? []) as AppointmentRecord[]).filter(isOperationalAppointment), [appointmentsData]);
  const staffRecords = useMemo(() => ((staffRaw ?? []) as StaffRecord[]).filter(Boolean), [staffRaw]);
  const locationRecords = useMemo(() => ((locationsRaw ?? []) as LocationRecord[]).filter(Boolean), [locationsRaw]);
  const searchTerm = search.trim().toLowerCase();

  const filteredRecords = useMemo(() => {
    return records.filter((appointment) => {
      if (activeTechFilter !== "all" && appointment.assignedStaffId !== activeTechFilter) return false;
      if (activeFilter !== "all" && !matchesScheduleFilter(appointment, activeFilter, today)) return false;
      if (!searchTerm) return true;

      const haystack = [
        getAppointmentLabel(appointment),
        getClientName(appointment),
        getVehicleLabel(appointment),
        getTechName(appointment),
        appointment.location?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchTerm);
    });
  }, [activeFilter, activeTechFilter, records, searchTerm, today]);

  const weekSnapshots = useMemo(() => weekDays.map((date) => buildDaySnapshot(filteredRecords, date)), [filteredRecords, weekDays]);
  const shopStatus = useMemo(() => buildShopStatus(records, today), [records, today]);
  const todaySnapshot = useMemo(() => buildDaySnapshot(filteredRecords, today), [filteredRecords, today]);
  const inShopThisWeek = useMemo(() => sortByOperationalTime(filteredRecords.filter((appointment) => isInShopOnDate(appointment, today))), [filteredRecords, today]);
  const pickupFocus = useMemo(
    () => sortByOperationalTime(filteredRecords.filter((appointment) => isReadyForPickupJob(appointment) || isPickupDay(appointment, today))),
    [filteredRecords, today]
  );
  const todayAttention = useMemo(
    () =>
      dedupeAppointments([
        ...shopStatus.dropOffsToday,
        ...todaySnapshot.active,
        ...todaySnapshot.waiting,
        ...todaySnapshot.ready,
        ...shopStatus.pickupsToday,
      ]),
    [shopStatus.dropOffsToday, shopStatus.pickupsToday, todaySnapshot.active, todaySnapshot.ready, todaySnapshot.waiting]
  );
  const selectedAppointment = useMemo(
    () => filteredRecords.find((appointment) => appointment.id === selectedAppointmentId) ?? null,
    [filteredRecords, selectedAppointmentId]
  );

  useEffect(() => {
    if (selectedAppointment && filteredRecords.some((appointment) => appointment.id === selectedAppointment.id)) return;
    const nextSelection =
      todayAttention[0]?.id ??
      inShopThisWeek[0]?.id ??
      pickupFocus[0]?.id ??
      filteredRecords[0]?.id ??
      null;
    setSelectedAppointmentId(nextSelection);
  }, [filteredRecords, inShopThisWeek, pickupFocus, selectedAppointment, todayAttention]);

  const isInitialLoad = fetching && appointmentsData === undefined;
  const weekLabel = `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d")}`;

  return (
    <div className="page-content page-section max-w-7xl">
      <PageHeader
        title="Schedule"
        subtitle="Weekly operations"
        right={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Button asChild variant="outline" className="w-full lg:w-auto">
              <Link to="/calendar?view=day">
                <CalendarRange className="mr-2 h-4 w-4" />
                Open Calendar
              </Link>
            </Button>
            <Button asChild className="w-full lg:w-auto">
              <Link to="/appointments/new">
                <Plus className="mr-2 h-4 w-4" />
                New Appointment
              </Link>
            </Button>
          </div>
        }
      />

      <section className="space-y-4">
        <div className="rounded-[1.35rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Scheduling</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">{weekLabel}</h2>
                <span className="text-sm text-muted-foreground">{format(currentDate, "EEEE, MMMM d")}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start xl:self-auto">
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-9 rounded-xl px-3 text-sm" onClick={() => setCurrentDate(new Date())}>
                This week
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isSmallViewport ? (
            <div className="mt-4">
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
          ) : null}

          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1.25fr)_150px_170px_170px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a client, vehicle, job, or tech"
                className="h-10 rounded-xl pl-9"
              />
            </div>
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
              <SelectTrigger className="h-10 rounded-xl">
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
            <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as ScheduleFilter)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="All work" />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="border-border/70">
                <CardContent className="space-y-3 p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-14" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.75fr)_minmax(320px,1fr)]">
            <Card className="border-border/70">
              <CardContent className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-2xl" />
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/70">
              <CardContent className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full rounded-2xl" />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : filteredRecords.length === 0 ? (
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
                  setActiveFilter("all");
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
        <div className="mt-4 space-y-4">
          <Card className="mx-1 overflow-hidden border-border/70 shadow-[0_14px_36px_rgba(15,23,42,0.04)] sm:mx-0">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Week strip</p>
                  <h3 className="text-base font-semibold text-foreground">Operational week</h3>
                </div>
                <span className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {filteredRecords.length} jobs
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:grid xl:grid-cols-7 xl:overflow-visible">
                {weekSnapshots.map((snapshot) => (
                  <DaySnapshotCard
                    key={snapshot.date.toISOString()}
                    snapshot={snapshot}
                    selectedAppointmentId={selectedAppointmentId}
                    onSelectAppointment={setSelectedAppointmentId}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {isSmallViewport && selectedAppointment ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-2xl border-border/70 bg-white/90"
                onClick={() => setMobileInspectorOpen(true)}
              >
                Inspect selected job
              </Button>
              <Dialog open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}>
                <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-[26rem] overflow-hidden rounded-[1.5rem] p-0">
                  <DialogHeader className="border-b border-border/60 px-5 py-4">
                    <DialogTitle>Appointment Inspector</DialogTitle>
                  </DialogHeader>
                  <div className="max-h-[calc(90dvh-5rem)] overflow-y-auto px-2.5 py-3">
                    <AppointmentInspectorPanel
                      appointment={selectedAppointment}
                      emptyDescription="Pick any row in the weekly board to inspect the customer, vehicle, timing, money, and current stage."
                      compact
                      onAppointmentChange={() => refetchAppointments()}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : null}

          <div className="grid gap-4 px-1 sm:px-0 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
            <section className="space-y-4">
              <OperationalListSection
                title="Today queue"
                eyebrow="What needs attention now"
                items={todayAttention}
                emptyLabel="Nothing needs attention on today's board."
                referenceDate={today}
                selectedAppointmentId={selectedAppointmentId}
                onSelectAppointment={setSelectedAppointmentId}
              />
              <OperationalListSection
                title="In shop"
                eyebrow="Vehicles occupying shop space"
                items={inShopThisWeek}
                emptyLabel="No vehicles are occupying shop space right now."
                multiDay
                referenceDate={today}
                selectedAppointmentId={selectedAppointmentId}
                onSelectAppointment={setSelectedAppointmentId}
              />
            </section>

            <section className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <AppointmentInspectorPanel
                appointment={selectedAppointment}
                emptyDescription="Pick any row in the weekly board to inspect the customer, vehicle, timing, money, and current stage."
                onAppointmentChange={() => refetchAppointments()}
              />
              <OperationalListSection
                title="Pickup focus"
                eyebrow="Leaving soon"
                items={pickupFocus}
                emptyLabel="No pickup-ready or pickup-today jobs in this view."
                referenceDate={today}
                selectedAppointmentId={selectedAppointmentId}
                onSelectAppointment={setSelectedAppointmentId}
              />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };

function DaySnapshotCard({
  snapshot,
  selectedAppointmentId,
  onSelectAppointment,
}: {
  snapshot: DaySnapshot;
  selectedAppointmentId: string | null;
  onSelectAppointment: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "w-[240px] shrink-0 rounded-[1.05rem] border border-border/70 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)] xl:w-auto",
        isToday(snapshot.date) && "border-primary/20 bg-primary/[0.035]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {format(snapshot.date, "EEE")}
          </p>
          <h4 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            {format(snapshot.date, "MMM d")}
          </h4>
        </div>
        <span className="rounded-full border border-border/70 bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {snapshot.jobs.length} jobs
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {snapshot.highlights.length > 0 ? (
          snapshot.highlights.slice(0, 2).map((appointment) => (
            <button
              key={appointment.id}
              type="button"
              onClick={() => onSelectAppointment(appointment.id)}
              className={cn(
                "flex w-full items-start gap-2 rounded-xl border border-border/60 bg-background/80 px-2.5 py-2 text-left transition-colors hover:bg-background",
                selectedAppointmentId === appointment.id && "border-primary/40 bg-primary/[0.05]"
              )}
            >
              <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", getJobPhaseTone(appointment.jobPhase))} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words text-[13px] font-semibold leading-4 text-foreground">{getAppointmentLabel(appointment)}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {getVehicleLabel(appointment) || getClientName(appointment) || getTechName(appointment)}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {getOperationalDayLabel(appointment, snapshot.date)}
              </span>
            </button>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
            No operational pressure on this day.
          </div>
        )}
      </div>
    </div>
  );
}

function OperationalListSection({
  title,
  eyebrow,
  items,
  emptyLabel,
  multiDay = false,
  referenceDate,
  selectedAppointmentId,
  onSelectAppointment,
}: {
  title: string;
  eyebrow: string;
  items: AppointmentRecord[];
  emptyLabel: string;
  multiDay?: boolean;
  referenceDate: Date;
  selectedAppointmentId: string | null;
  onSelectAppointment: (id: string) => void;
}) {
  return (
    <Card className="mx-1 border-border/70 shadow-[0_12px_28px_rgba(15,23,42,0.04)] sm:mx-0">
      <CardContent className="space-y-3 p-4">
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 8).map((appointment) => {
              const vehicleLabel = getVehicleLabel(appointment);
              const clientName = getClientName(appointment);
              const moneyLabel = getAppointmentMoneyLabel(appointment);
              const timelineLabel = multiDay ? getOperationalTimelineLabel(appointment) : format(new Date(appointment.startTime), "EEE h:mm a");
              const metaLine = [clientName || "Internal", vehicleLabel || "No vehicle"].join(" · ");
              const detailLine = [timelineLabel, getTechName(appointment)].join(" · ");

              return (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={() => onSelectAppointment(appointment.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border border-border/60 bg-white/88 px-3 py-2.5 text-left transition-colors hover:bg-white",
                    selectedAppointmentId === appointment.id && "border-primary/40 bg-primary/[0.05]"
                  )}
                >
                  <div className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", getJobPhaseTone(appointment.jobPhase))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 break-words text-[13px] font-semibold leading-4 text-foreground">{getAppointmentLabel(appointment)}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{metaLine}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{detailLine}</p>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                        {moneyLabel ? <span className="text-[11px] font-semibold text-foreground">{moneyLabel}</span> : null}
                        <span className="shrink-0 rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {multiDay ? getOperationalDayLabel(appointment, referenceDate) : getJobPhaseLabel(appointment.jobPhase)}
                        </span>
                      </div>
                    </div>

                    {appointment.location?.name ? (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">{appointment.location.name}</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
