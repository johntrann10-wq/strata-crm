import { useEffect, useMemo, useRef, useState } from "react";
import { endOfWeek, format, isToday, startOfWeek } from "date-fns";
import { Link, useOutletContext, useSearchParams } from "react-router";
import { ArrowUpRight, CalendarRange, ChevronLeft, ChevronRight, Inbox, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { api, ApiError } from "../api";
import { useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { getCalendarAppointmentAmount, getCalendarDayRevenue } from "@/components/CalendarViews";
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
import { triggerNativeHaptic } from "@/lib/nativeFieldOps";
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
  assignedStaffId?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  location?: { name?: string | null } | null;
  client?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
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

const FILTER_OPTIONS: Array<{ value: ScheduleFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "drop_offs", label: "Drop-offs" },
  { value: "in_shop", label: "In shop" },
  { value: "active_work", label: "Active work" },
  { value: "waiting", label: "Waiting / curing / hold" },
  { value: "ready", label: "Ready for pickup" },
  { value: "pickups", label: "Pickups" },
];

function isScheduleFilter(value: string | null): value is ScheduleFilter {
  return FILTER_OPTIONS.some((option) => option.value === value);
}

function parseScheduleDateParam(value: string | null): Date | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;

  const today = new Date();
  if (normalized === "today") return today;
  if (normalized === "tomorrow") return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (normalized === "yesterday") return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

  const dateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;

  const [, year, month, day] = dateMatch;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }
  return parsed;
}

function normalizeSmartSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildSmartSearchTokens(value: string): string[] {
  const normalized = normalizeSmartSearchText(value);
  if (!normalized) return [];
  return Array.from(new Set(normalized.split(/\s+/).filter(Boolean)));
}

function getDateSearchParts(value: string | null | undefined): string[] {
  if (!value) return [];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return [];
  return [
    format(date, "EEE"),
    format(date, "EEEE"),
    format(date, "MMM d"),
    format(date, "MMMM d"),
    format(date, "yyyy-MM-dd"),
    format(date, "M/d/yyyy"),
    format(date, "h:mm a"),
    format(date, "h a"),
    format(date, "ha"),
    format(date, "HH:mm"),
    format(date, "HHmm"),
  ];
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

function getAppointmentMoneyLabel(appointment: AppointmentRecord): string | null {
  const amount = getCalendarAppointmentAmount(appointment);
  if (amount <= 0) return null;
  return formatCurrency(amount);
}

function getScheduleAppointmentHref(appointment: AppointmentRecord, date: Date): string {
  if (isCalendarBlockAppointment(appointment)) {
    return `/calendar?view=week&date=${encodeURIComponent(format(date, "yyyy-MM-dd"))}`;
  }
  return `/appointments/${appointment.id}`;
}

function getScheduleAppointmentActionLabel(appointment: AppointmentRecord): string {
  return isCalendarBlockAppointment(appointment) ? "Open calendar" : "Open appointment";
}

function buildAppointmentSearchText(appointment: AppointmentRecord): string {
  return normalizeSmartSearchText(
    [
      getAppointmentLabel(appointment),
      getClientName(appointment),
      getVehicleLabel(appointment),
      getTechName(appointment),
      appointment.location?.name ?? "",
      appointment.status ?? "",
      appointment.jobPhase ?? "",
      getJobPhaseLabel(appointment.jobPhase),
      appointment.notes ?? "",
      appointment.internalNotes ?? "",
      ...getDateSearchParts(appointment.startTime),
      ...getDateSearchParts(appointment.endTime),
      ...getDateSearchParts(appointment.jobStartTime),
      ...getDateSearchParts(appointment.expectedCompletionTime),
      ...getDateSearchParts(appointment.pickupReadyTime),
    ].join(" ")
  );
}

function matchesSmartSearch(haystack: string, tokens: string[]): boolean {
  return tokens.length === 0 || tokens.every((token) => haystack.includes(token));
}

function joinMeta(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" - ");
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

function matchesScheduleFilter(appointment: AppointmentRecord, filter: ScheduleFilter, date: Date): boolean {
  switch (filter) {
    case "drop_offs":
      return isDropOffDay(appointment, date);
    case "in_shop":
      return isInShopOnDate(appointment, date);
    case "active_work":
      return isActiveWorkJob(appointment) && hasPresenceOnDay(appointment, date);
    case "waiting":
      return isWaitingJob(appointment) && hasPresenceOnDay(appointment, date);
    case "ready":
      return isReadyForPickupJob(appointment) && hasPresenceOnDay(appointment, date);
    case "pickups":
      return isPickupDay(appointment, date);
    default:
      return true;
  }
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

export default function AppointmentsPage() {
  const { businessId, currentLocationId, setCurrentLocationId } = useOutletContext<AuthOutletContext>();
  const [searchParams] = useSearchParams();
  const searchParamKey = searchParams.toString();
  const [currentDate, setCurrentDate] = useState(() => parseScheduleDateParam(searchParams.get("when")) ?? new Date());
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [activeLocationId, setActiveLocationId] = useState<string>(currentLocationId ?? "all");
  const [activeFilter, setActiveFilter] = useState<ScheduleFilter>(() => {
    const requestedFilter = searchParams.get("filter");
    return isScheduleFilter(requestedFilter) ? requestedFilter : "all";
  });
  const [activeTechFilter, setActiveTechFilter] = useState<string>("all");
  const [inspectedDateKey, setInspectedDateKey] = useState<string | null>(null);
  const [inspectedAppointmentId, setInspectedAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    setActiveLocationId(currentLocationId ?? "all");
  }, [currentLocationId]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParamKey);
    const requestedFilter = nextParams.get("filter");
    const requestedDate = parseScheduleDateParam(nextParams.get("when"));
    setSearch(nextParams.get("q") ?? "");
    setActiveFilter(isScheduleFilter(requestedFilter) ? requestedFilter : "all");
    if (requestedDate) setCurrentDate(requestedDate);
  }, [searchParamKey]);

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
  const searchTokens = useMemo(() => buildSmartSearchTokens(search), [search]);

  const filteredRecords = useMemo(() => {
    return records.filter((appointment) => {
      if (activeTechFilter !== "all" && appointment.assignedStaffId !== activeTechFilter) return false;
      return matchesSmartSearch(buildAppointmentSearchText(appointment), searchTokens);
    });
  }, [activeTechFilter, records, searchTokens]);

  const weekSnapshots = useMemo(() => {
    return weekDays.map((date) => {
      const dayRecords =
        activeFilter === "all"
          ? filteredRecords
          : filteredRecords.filter((appointment) => matchesScheduleFilter(appointment, activeFilter, date));
      return buildDaySnapshot(dayRecords, date);
    });
  }, [activeFilter, filteredRecords, weekDays]);

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
  const openDayInspector = (date: Date, appointmentId?: string) => {
    void triggerNativeHaptic("light");
    setInspectedDateKey(date.toISOString());
    setInspectedAppointmentId(appointmentId ?? null);
  };
  const closeDayInspector = () => {
    setInspectedDateKey(null);
    setInspectedAppointmentId(null);
  };
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
            <Button asChild variant="outline" className="w-full lg:w-auto">
              <Link to="/appointments/requests">
                <Inbox className="mr-2 h-4 w-4" />
                Booking Requests
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

      <section className="space-y-3 sm:space-y-4">
        <div className="rounded-[1rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)] sm:rounded-[1.35rem] sm:p-4 sm:shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Scheduling</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{weekLabel}</h2>
                <span className="text-xs text-muted-foreground sm:text-sm">{weekCount} jobs in view</span>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start xl:self-auto">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg sm:h-9 sm:w-9 sm:rounded-xl" onClick={() => setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-8 rounded-lg px-3 text-sm sm:h-9 sm:rounded-xl" onClick={() => setCurrentDate(new Date())}>
                This week
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg sm:h-9 sm:w-9 sm:rounded-xl" onClick={() => setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 lg:mt-4 lg:grid-cols-[minmax(0,1.25fr)_150px_170px_170px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, vehicle, tech, date, or time"
                className="h-9 rounded-lg pl-9 sm:h-10 sm:rounded-xl"
              />
            </div>
            <div className="sm:hidden">
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
            <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as ScheduleFilter)}>
              <SelectTrigger className="h-9 rounded-lg sm:h-10 sm:rounded-xl">
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
        <div className="mt-4">
          <Card className="border-border/70">
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
        <div className="mt-4">
          <Card className="overflow-hidden border-border/70 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5 sm:px-5 sm:py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Weekly board</p>
                  <h3 className="text-sm font-semibold text-foreground sm:text-base">Operational week</h3>
                </div>
                <span className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {weekCount} jobs
                </span>
              </div>
              <div className="divide-y divide-border/70">
                {weekSnapshots.map((snapshot) => (
                  <WeeklyDaySection
                    key={snapshot.date.toISOString()}
                    snapshot={snapshot}
                    onOpenDay={(appointmentId) => openDayInspector(snapshot.date, appointmentId)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Dialog open={Boolean(inspectedSnapshot)} onOpenChange={(open) => !open && closeDayInspector()}>
            <DialogContent
              className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl overflow-hidden rounded-[1.15rem] p-0 sm:rounded-[1.5rem]"
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              {inspectedSnapshot ? (
                <ScheduleDayInspector snapshot={inspectedSnapshot} selectedAppointmentId={inspectedAppointmentId} />
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };

function WeeklyDaySection({ snapshot, onOpenDay }: { snapshot: DaySnapshot; onOpenDay: (appointmentId?: string) => void }) {
  const dayRevenue = getCalendarDayRevenue(snapshot.jobs, snapshot.date);
  const groups = [
    { label: "Drop-offs", items: snapshot.dropOffs },
    { label: "Timed work", items: snapshot.timedWork },
    { label: "In shop", items: snapshot.inShop },
    { label: "Pickups", items: snapshot.pickups },
  ].filter((group) => group.items.length > 0);

  return (
    <section className={cn("px-3 py-3 sm:px-5 sm:py-4", isToday(snapshot.date) && "bg-primary/[0.025]")}>
      <div className="flex flex-col gap-1 border-b border-border/60 pb-2.5 sm:pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground sm:text-base">
            {format(snapshot.date, "EEEE")} - {format(snapshot.date, "MMM d")}
          </h4>
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            {snapshot.jobs.length} {snapshot.jobs.length === 1 ? "job" : "jobs"}
            {dayRevenue > 0 ? ` - ${formatCurrency(dayRevenue)}` : ""}
          </p>
        </div>
        {isToday(snapshot.date) ? (
          <span className="w-fit rounded-full border border-primary/20 bg-primary/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Today
          </span>
        ) : null}
      </div>

      {snapshot.jobs.length === 0 ? (
        <div className="py-4 text-sm text-muted-foreground">No jobs scheduled for this day.</div>
      ) : (
        <div className="space-y-3 pt-3 sm:space-y-4 sm:pt-4">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1.5 sm:space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:text-[11px]">{group.label}</div>
              <div className="space-y-1.5 sm:space-y-2">
                {group.items.map((appointment) => (
                  <ScheduleBoardRow
                    key={`${group.label}-${appointment.id}`}
                    appointment={appointment}
                    referenceDate={snapshot.date}
                    onOpenDay={() => onOpenDay(appointment.id)}
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
}: {
  appointment: AppointmentRecord;
  referenceDate: Date;
  onOpenDay: () => void;
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

  return (
    <button
      type="button"
      onClick={onOpenDay}
      className="block rounded-lg border border-border/60 bg-white/92 px-2.5 py-2.5 text-left transition-colors hover:bg-white sm:rounded-xl sm:px-3 sm:py-3"
    >
      <div className="grid gap-1.5 sm:gap-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(220px,0.9fr)_auto] xl:items-start xl:gap-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 break-words text-[12.5px] font-semibold leading-4.5 text-foreground sm:text-sm sm:leading-5">
              {getAppointmentLabel(appointment)}
            </p>
            {moneyLabel ? <span className="shrink-0 text-[11px] font-semibold text-foreground sm:text-[12px]">{moneyLabel}</span> : null}
          </div>
          <p className="mt-0.5 break-words text-[11px] text-muted-foreground sm:mt-1 sm:text-[13px]">{identityLabel}</p>
        </div>

        <div className="min-w-0 space-y-0.5">
          <p className="break-words text-[11px] text-muted-foreground sm:text-[13px]">{timingLabel}</p>
          {supportLabel ? <p className="break-words text-[10px] text-muted-foreground sm:text-[11px]">{supportLabel}</p> : null}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 xl:justify-end">
          <span className={cn("h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5", getJobPhaseTone(appointment.jobPhase))} />
          <span className="max-w-full truncate rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:px-2 sm:text-[10px]">
            {stageLabel}
          </span>
        </div>
      </div>
    </button>
  );
}

function ScheduleDayInspector({
  snapshot,
  selectedAppointmentId,
}: {
  snapshot: DaySnapshot;
  selectedAppointmentId: string | null;
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
    selectedAppointment && groups.find((group) => group.items.some((appointment) => appointment.id === selectedAppointment.id))?.label;
  const selectedCardRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedAppointmentId, snapshot.date]);

  return (
    <>
      <DialogHeader className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Day inspector</p>
            <DialogTitle className="mt-1 truncate text-left text-lg font-semibold tracking-tight sm:text-xl">
              {format(snapshot.date, "EEEE")} - {format(snapshot.date, "MMMM d")}
            </DialogTitle>
          </div>
          <div className="shrink-0 rounded-2xl border border-border/70 bg-background/85 px-3 py-2 text-right shadow-sm">
            <p className="text-xs font-semibold text-foreground">
              {snapshot.jobs.length} {snapshot.jobs.length === 1 ? "job" : "jobs"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{dayRevenue > 0 ? formatCurrency(dayRevenue) : "No booked value"}</p>
          </div>
        </div>
      </DialogHeader>

      {selectedAppointment ? (
        <div className="border-b border-border/70 bg-primary/[0.035] px-4 py-3 sm:px-5">
          <div className="rounded-[1.25rem] border border-primary/18 bg-white/92 p-3.5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                  Selected job{selectedGroupLabel ? ` - ${selectedGroupLabel}` : ""}
                </p>
                <h3 className="mt-1 break-words text-base font-semibold leading-5 text-foreground">
                  {getAppointmentLabel(selectedAppointment)}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  {joinMeta([
                    getClientName(selectedAppointment) || "Internal",
                    getVehicleLabel(selectedAppointment) || "No vehicle",
                  ])}
                </p>
              </div>
              <Button asChild size="sm" className="h-9 shrink-0 rounded-full">
                <Link to={getScheduleAppointmentHref(selectedAppointment, snapshot.date)}>
                  {getScheduleAppointmentActionLabel(selectedAppointment)}
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <InspectorMetric label="Time" value={getScheduleTimingLabel(selectedAppointment)} />
              <InspectorMetric
                label="Stage"
                value={
                  isMultiDayJob(selectedAppointment)
                    ? getOperationalDayLabel(selectedAppointment, snapshot.date)
                    : getJobPhaseLabel(selectedAppointment.jobPhase)
                }
              />
              <InspectorMetric label="Value" value={getAppointmentMoneyLabel(selectedAppointment) ?? "No value"} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="ios-momentum-y max-h-[calc(92dvh-12rem)] space-y-3 overflow-y-auto px-4 py-3 sm:max-h-[calc(92dvh-12.5rem)] sm:space-y-4 sm:px-5 sm:py-4">
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
            No jobs scheduled for this day.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:text-[11px]">
                <span>{group.label}</span>
                <span>{group.items.length}</span>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                {group.items.map((appointment) => (
                  (() => {
                    const selected = appointment.id === selectedAppointmentId;
                    const appointmentHref = getScheduleAppointmentHref(appointment, snapshot.date);
                    const appointmentActionLabel = getScheduleAppointmentActionLabel(appointment);
                    return (
                  <Link
                    key={`${group.label}-${appointment.id}`}
                    ref={selected ? selectedCardRef : undefined}
                    to={appointmentHref}
                    className={cn(
                      "block rounded-xl border px-3 py-3 transition-colors active:scale-[0.99] sm:px-3.5",
                      selected
                        ? "border-primary/35 bg-primary/[0.055] shadow-[0_12px_28px_rgba(249,115,22,0.08)]"
                        : "border-border/60 bg-white/92 hover:bg-white"
                    )}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-[13px] font-semibold leading-5 text-foreground sm:text-sm">
                            {getAppointmentLabel(appointment)}
                          </p>
                          <p className="mt-0.5 break-words text-[11px] text-muted-foreground sm:text-sm">
                            {joinMeta([getClientName(appointment) || "Internal", getVehicleLabel(appointment) || "No vehicle"])}
                          </p>
                        </div>
                        {getAppointmentMoneyLabel(appointment) ? (
                          <span className="shrink-0 text-[11px] font-semibold text-foreground sm:text-xs">{getAppointmentMoneyLabel(appointment)}</span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {getScheduleTimingLabel(appointment)}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px]">
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", getJobPhaseTone(appointment.jobPhase))} />
                          {isMultiDayJob(appointment)
                            ? getOperationalDayLabel(appointment, snapshot.date)
                            : getJobPhaseLabel(appointment.jobPhase)}
                        </span>
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {appointmentActionLabel}
                          <ArrowUpRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                    );
                  })()
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function InspectorMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/75 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}
