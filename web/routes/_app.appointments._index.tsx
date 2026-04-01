import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertCircle, Calendar, ChevronDown, ChevronRight, Loader2, Plus, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { api, ApiError } from "../api";
import { useAction, useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EmptyState } from "../components/shared/EmptyState";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";

type AppointmentStatusTab = "all" | "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled";
type AppointmentView = AppointmentStatusTab | "mine";

type StaffRecord = {
  id: string;
  userId?: string | null;
};

type LocationRecord = {
  id: string;
  name?: string | null;
};

type AppointmentListRecord = {
  id: string;
  title?: string | null;
  status?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: { name?: string | null } | null;
  client?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
  vehicle?: { id?: string | null; year?: number | null; make?: string | null; model?: string | null } | null;
  assignedStaff?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
};

const QUICK_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  "no-show": [],
};

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function notifyAppointmentConfirmation(
  deliveryStatus?: string | null,
  deliveryError?: string | null,
  fallbackMessage = "Appointment confirmed"
) {
  if (deliveryStatus === "emailed") {
    toast.success(`${fallbackMessage} and email sent`);
    return;
  }
  if (deliveryStatus === "missing_email") {
    toast.warning(`${fallbackMessage}, but the client has no email address.`);
    return;
  }
  if (deliveryStatus === "smtp_disabled") {
    toast.warning(`${fallbackMessage}, but transactional email is not configured.`);
    return;
  }
  if (deliveryStatus === "email_failed") {
    toast.warning(`${fallbackMessage}, but confirmation email failed${deliveryError ? `: ${deliveryError}` : "."}`);
    return;
  }
  toast.success(fallbackMessage);
}

function matchesTab(status: string | null | undefined, tab: AppointmentStatusTab): boolean {
  if (tab === "all") return true;
  if (tab === "cancelled") return status === "cancelled" || status === "no-show";
  return status === tab;
}

export default function AppointmentsPage() {
  const { businessId, user, currentLocationId, setCurrentLocationId } = useOutletContext<AuthOutletContext>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState<AppointmentView>("all");
  const [activeLocationId, setActiveLocationId] = useState<string>(currentLocationId ?? "all");

  const [, runUpdateStatus] = useAction(api.appointment.updateStatus);
  const [, runUpdateAppointment] = useAction(api.appointment.update);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setActiveLocationId(currentLocationId ?? "all");
  }, [currentLocationId]);

  const handleQuickStatus = async (event: Event | React.SyntheticEvent, appointmentId: string, newStatus: string) => {
    event.preventDefault();
    event.stopPropagation();
    const result = await runUpdateStatus({ id: appointmentId, status: newStatus });
    if (result?.error) {
      toast.error("Failed: " + result.error.message);
    } else {
      const payload = result.data as { deliveryStatus?: string | null; deliveryError?: string | null } | null;
      if (newStatus === "confirmed") {
        notifyAppointmentConfirmation(payload?.deliveryStatus ?? null, payload?.deliveryError ?? null);
      } else {
        toast.success("Status updated to " + formatStatus(newStatus));
      }
      void refetch();
    }
  };

  const handleAssignToMe = async (event: Event | React.SyntheticEvent, appointmentId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!myStaffRecord?.id) return;
    const result = await runUpdateAppointment({ id: appointmentId, assignedStaffId: myStaffRecord.id });
    if (result?.error) {
      toast.error("Failed: " + result.error.message);
    } else {
      toast.success("Appointment assigned to you");
      void refetch();
    }
  };

  const [{ data: appointments, fetching: appointmentsFetching, error: appointmentsError }, refetch] = useFindMany(
    api.appointment,
    {
      search: debouncedSearch || undefined,
      locationId: activeLocationId !== "all" ? activeLocationId : undefined,
      sort: { startTime: "Descending" },
      first: 100,
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
        location: { name: true },
        client: { id: true, firstName: true, lastName: true },
        vehicle: { id: true, year: true, make: true, model: true },
        assignedStaff: { id: true, firstName: true, lastName: true },
      },
      pause: !businessId,
    }
  );
  const [{ data: staffRaw }] = useFindMany(api.staff, {
    first: 100,
    pause: !businessId,
  } as any);
  const [{ data: locationsRaw }] = useFindMany(api.location, {
    first: 100,
    pause: !businessId,
  } as any);

  const isInitialLoad = appointmentsFetching && appointments === undefined;
  const records = useMemo(
    () => (Array.isArray(appointments) ? appointments : []) as AppointmentListRecord[],
    [appointments]
  );
  const staffRecords = ((staffRaw ?? []) as StaffRecord[]).filter(Boolean);
  const locationRecords = ((locationsRaw ?? []) as LocationRecord[]).filter(Boolean);
  const myStaffRecord = useMemo(
    () => staffRecords.find((staff) => staff.userId === user?.id) ?? null,
    [staffRecords, user?.id]
  );
  const filteredAppointments = useMemo(
    () =>
      records.filter((appointment) => {
        if (activeTab === "mine") {
          return !!myStaffRecord && appointment.assignedStaff?.id === myStaffRecord.id;
        }
        return matchesTab(appointment.status ?? null, activeTab);
      }),
    [records, activeTab, myStaffRecord]
  );
  const stats = useMemo(() => {
    const scheduled = records.filter((appointment) => appointment.status === "scheduled").length;
    const confirmed = records.filter((appointment) => appointment.status === "confirmed").length;
    const inProgress = records.filter((appointment) => appointment.status === "in_progress").length;
    const myQueue = myStaffRecord
      ? records.filter(
          (appointment) =>
            appointment.assignedStaff?.id === myStaffRecord.id &&
            ["scheduled", "confirmed", "in_progress"].includes(appointment.status ?? "")
        ).length
      : 0;
    return { scheduled, confirmed, inProgress, myQueue };
  }, [records, myStaffRecord]);

  return (
    <div className="page-content page-section max-w-6xl">
      <PageHeader
        title="Appointments"
        subtitle="Service board"
        right={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Select
              value={activeLocationId}
              onValueChange={(value) => {
                setActiveLocationId(value);
                setCurrentLocationId(value === "all" ? null : value);
              }}
            >
              <SelectTrigger className="w-full lg:w-52">
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
            <Button asChild variant="outline" className="w-full lg:w-auto">
              <Link to="/calendar">
                <Calendar className="mr-2 h-4 w-4" />
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

      <ListViewToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search appointments, clients, vehicles, or techs..."
        loading={appointmentsFetching && records.length > 0}
        resultCount={filteredAppointments.length}
        noun="appointments"
        filtersLabel={
          [
            activeTab !== "all" ? `View: ${activeTab === "mine" ? "my queue" : activeTab}` : null,
            activeLocationId !== "all"
              ? `Location: ${locationRecords.find((record) => record.id === activeLocationId)?.name ?? "Selected"}`
              : null,
            debouncedSearch ? `Search: ${debouncedSearch}` : null,
          ]
            .filter(Boolean)
            .join(" | ") || null
        }
        onClear={() => {
          setSearch("");
          setDebouncedSearch("");
          setActiveTab("all");
          setActiveLocationId("all");
          setCurrentLocationId(null);
        }}
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AppointmentView)}>
        <TabsList className="flex w-full gap-2 overflow-x-auto rounded-xl bg-transparent p-0 sm:grid sm:w-auto sm:grid-cols-7 xl:w-full">
          <TabsTrigger value="all" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">
            All
          </TabsTrigger>
          <TabsTrigger value="mine" disabled={!myStaffRecord} className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">
            My Queue
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">Scheduled</TabsTrigger>
          <TabsTrigger value="confirmed" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">Confirmed</TabsTrigger>
          <TabsTrigger value="in_progress" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">In Progress</TabsTrigger>
          <TabsTrigger value="completed" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">Completed</TabsTrigger>
          <TabsTrigger value="cancelled" className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary/10 sm:rounded-md sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Scheduled" value={String(stats.scheduled)} />
        <MetricCard label="Confirmed" value={String(stats.confirmed)} />
        <MetricCard label="In progress" value={String(stats.inProgress)} />
        <MetricCard
          label="My queue"
          value={myStaffRecord ? String(stats.myQueue) : "-"}
        />
      </div>

      {appointmentsError && !isInitialLoad ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {appointmentsError instanceof ApiError && (appointmentsError.status === 401 || appointmentsError.status === 403)
              ? "Your session expired. Redirecting to sign-in..."
              : "Could not load appointments. Please refresh the page."}
          </span>
          {!(appointmentsError instanceof ApiError && (appointmentsError.status === 401 || appointmentsError.status === 403)) ? (
            <span className="text-xs text-destructive/70">({appointmentsError.message})</span>
          ) : null}
        </div>
      ) : isInitialLoad ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between rounded-lg border bg-white p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : filteredAppointments.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={debouncedSearch ? "No matching appointments" : "No appointments in this view"}
          description={
            debouncedSearch
              ? "Try a different customer, vehicle, or technician search."
              : activeTab === "mine" && !myStaffRecord
              ? "Link this user to a staff profile to unlock an assigned queue."
                : activeTab === "mine"
                  ? "No appointments are assigned to this staff account right now."
              : "No appointments in this view."
          }
          action={
            <Button asChild>
              <Link to="/appointments/new">
                <Plus className="mr-2 h-4 w-4" />
                New Appointment
              </Link>
            </Button>
          }
        />
      ) : (
        <div className={appointmentsFetching ? "space-y-2 opacity-70" : "space-y-2"}>
          <div className="hidden items-center rounded-xl border border-border/70 bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.8fr)_190px_150px_190px_auto] lg:gap-4">
            <span>Appointment</span>
            <span>Schedule</span>
            <span>Location</span>
            <span>Assigned</span>
            <span className="text-right">Actions</span>
          </div>
          {filteredAppointments.map((appointment) => {
            const clientName = `${appointment.client?.firstName ?? ""} ${appointment.client?.lastName ?? ""}`.trim();
            const vehicleLabel = [appointment.vehicle?.year, appointment.vehicle?.make, appointment.vehicle?.model]
              .filter(Boolean)
              .join(" ");
            const techName = appointment.assignedStaff
              ? `${appointment.assignedStaff.firstName ?? ""} ${appointment.assignedStaff.lastName ?? ""}`.trim()
              : "Unassigned";
            const quoteHref = appointment.client?.id
              ? `/quotes/new?clientId=${appointment.client.id}${
                  appointment.vehicle?.id ? `&vehicleId=${appointment.vehicle.id}` : ""
                }`
              : null;
            const invoiceHref =
              appointment.status === "completed" && appointment.client?.id
                ? `/invoices/new?clientId=${appointment.client.id}&appointmentId=${appointment.id}`
                : null;

            let formattedTime = "";
            try {
              formattedTime = appointment.startTime ? format(new Date(appointment.startTime), "MMM d, yyyy h:mm a") : "";
            } catch {
              formattedTime = "";
            }

            return (
              <div
                key={appointment.id}
                className="rounded-xl border bg-white p-3 transition-colors hover:border-primary sm:rounded-lg sm:p-4 lg:p-0"
              >
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.8fr)_190px_150px_190px_auto] lg:items-center lg:gap-4 lg:px-4 lg:py-3">
                  <div className="min-w-0 flex-1 space-y-1 lg:min-w-0">
                    <Link
                      to={`/appointments/${appointment.id}`}
                      className="block rounded-lg transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge status={appointment.status ?? ""} type="appointment" />
                        <span className="font-medium">{appointment.title || clientName || "Appointment"}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {clientName || "Walk-in customer"}
                        {vehicleLabel ? ` - ${vehicleLabel}` : ""}
                      </div>
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-2 sm:gap-x-6 sm:text-sm lg:block">
                    <Link
                      to={`/appointments/${appointment.id}`}
                      className="block rounded-lg transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="block">{formattedTime || "Unscheduled"}</span>
                      <span className="mt-1 hidden text-xs text-muted-foreground lg:block">
                        {appointment.endTime ? `Ends ${format(new Date(appointment.endTime), "h:mm a")}` : "No end time"}
                      </span>
                    </Link>
                  </div>
                  <Link
                    to={`/appointments/${appointment.id}`}
                    className="block rounded-lg text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
                  >
                    {appointment.location?.name ?? "No location set"}
                  </Link>
                  <Link
                    to={`/appointments/${appointment.id}`}
                    className="block rounded-lg text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
                  >
                    <span className="block">{techName}</span>
                    <span className="mt-1 hidden text-xs text-muted-foreground lg:block">
                      {appointment.endTime ? format(new Date(appointment.endTime), "h:mm a") : "No end time"}
                    </span>
                  </Link>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center lg:justify-end lg:gap-2">
                    {myStaffRecord && !appointment.assignedStaff?.id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[38px] px-2 text-xs lg:min-w-[108px]"
                        onClick={(event) => void handleAssignToMe(event, appointment.id)}
                      >
                        <UserPlus className="mr-1 h-3 w-3" />
                        Assign to me
                      </Button>
                    ) : null}
                    {(QUICK_TRANSITIONS[appointment.status ?? ""]?.length ?? 0) > 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="min-h-[38px] px-2 text-xs lg:min-w-[92px]">
                            Status
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {QUICK_TRANSITIONS[appointment.status ?? ""].map((status) => (
                            <DropdownMenuItem key={status} onSelect={(event) => handleQuickStatus(event, appointment.id, status)}>
                              {formatStatus(status)}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                    {quoteHref ? (
                      <Button asChild variant="outline" size="sm" className="min-h-[38px] px-2 text-xs lg:min-w-[76px]">
                        <Link to={quoteHref}>Quote</Link>
                      </Button>
                    ) : null}
                    {invoiceHref ? (
                      <Button asChild variant="outline" size="sm" className="min-h-[38px] px-2 text-xs lg:min-w-[76px]">
                        <Link to={invoiceHref}>Invoice</Link>
                      </Button>
                    ) : null}
                    <Button asChild variant="ghost" size="sm" className="min-h-[38px] px-2 text-xs lg:min-w-[72px]">
                      <Link to={`/appointments/${appointment.id}`}>Open</Link>
                    </Button>
                    <ChevronRight className="ml-auto hidden h-4 w-4 text-muted-foreground sm:block" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="space-y-1 p-4">
        <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
