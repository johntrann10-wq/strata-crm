import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertCircle, Calendar, ChevronDown, ChevronRight, Loader2, Plus, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { QuickBookSheet } from "../components/shared/QuickBookSheet";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EmptyState } from "../components/shared/EmptyState";

type AppointmentStatusTab = "all" | "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled";
type AppointmentView = AppointmentStatusTab | "mine";

type StaffRecord = {
  id: string;
  userId?: string | null;
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

function matchesTab(status: string | null | undefined, tab: AppointmentStatusTab): boolean {
  if (tab === "all") return true;
  if (tab === "cancelled") return status === "cancelled" || status === "no-show";
  return status === tab;
}

export default function AppointmentsPage() {
  const { businessId, user } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const [quickBookOpen, setQuickBookOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState<AppointmentView>("all");

  const [, runUpdateStatus] = useAction(api.appointment.updateStatus);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const handleQuickStatus = async (event: Event | React.SyntheticEvent, appointmentId: string, newStatus: string) => {
    event.preventDefault();
    event.stopPropagation();
    const result = await runUpdateStatus({ id: appointmentId, status: newStatus });
    if (result?.error) {
      toast.error("Failed: " + result.error.message);
    } else {
      toast.success("Status updated to " + formatStatus(newStatus));
      void refetch();
    }
  };

  const [{ data: appointments, fetching: appointmentsFetching, error: appointmentsError }, refetch] = useFindMany(
    api.appointment,
    {
      search: debouncedSearch || undefined,
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

  const isInitialLoad = appointmentsFetching && appointments === undefined;
  const records = (Array.isArray(appointments) ? appointments : []) as AppointmentListRecord[];
  const staffRecords = ((staffRaw ?? []) as StaffRecord[]).filter(Boolean);
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Appointments"
        subtitle="Run the schedule clearly, move work forward fast, and keep status changes close to the list."
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              {appointmentsFetching && records.length > 0 ? (
                <Loader2 className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : (
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              )}
              <Input
                placeholder="Search appointments, clients, vehicles, or techs..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-72 pl-8"
              />
            </div>
            <Button variant="outline" onClick={() => setQuickBookOpen(true)}>
              <Zap className="mr-2 h-4 w-4" />
              Quick Book
            </Button>
            <Button asChild>
              <Link to="/appointments/new">
                <Plus className="mr-2 h-4 w-4" />
                New Appointment
              </Link>
            </Button>
          </div>
        }
      />

      <QuickBookSheet
        open={quickBookOpen}
        onOpenChange={setQuickBookOpen}
        onBooked={(id) => navigate(`/appointments/${id}`)}
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AppointmentView)}>
        <TabsList className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-7">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="mine" disabled={!myStaffRecord}>
            My Queue
          </TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

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
              : "Book your first appointment to start filling the schedule."
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
          {filteredAppointments.map((appointment) => {
            const clientName = `${appointment.client?.firstName ?? ""} ${appointment.client?.lastName ?? ""}`.trim();
            const vehicleLabel = [appointment.vehicle?.year, appointment.vehicle?.make, appointment.vehicle?.model]
              .filter(Boolean)
              .join(" ");
            const techName = appointment.assignedStaff
              ? `${appointment.assignedStaff.firstName ?? ""} ${appointment.assignedStaff.lastName ?? ""}`.trim()
              : "Unassigned";

            let formattedTime = "";
            try {
              formattedTime = appointment.startTime ? format(new Date(appointment.startTime), "MMM d, yyyy h:mm a") : "";
            } catch {
              formattedTime = "";
            }

            return (
              <Link
                key={appointment.id}
                to={`/appointments/${appointment.id}`}
                className="block rounded-lg border bg-white p-4 transition-colors hover:border-primary"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={appointment.status ?? ""} type="appointment" />
                      <span className="font-medium">{appointment.title || clientName || "Appointment"}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {clientName || "Walk-in customer"}
                      {vehicleLabel ? ` · ${vehicleLabel}` : ""}
                    </div>
                  </div>
                  <div className="grid flex-none gap-1 text-sm text-muted-foreground sm:grid-cols-2 sm:gap-x-6 lg:text-right">
                    <span>{formattedTime || "Unscheduled"}</span>
                    <span>{appointment.location?.name ?? "No location set"}</span>
                    <span>{techName}</span>
                    <span>{appointment.endTime ? format(new Date(appointment.endTime), "h:mm a") : "No end time"}</span>
                  </div>
                  <div
                    className="flex items-center gap-3"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    {(QUICK_TRANSITIONS[appointment.status ?? ""]?.length ?? 0) > 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
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
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
