import { useState } from "react";
import { useFindMany, useAction } from "@gadgetinc/react";
import { Link, useNavigate, useOutletContext } from "react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { QuickBookSheet } from "../components/shared/QuickBookSheet";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EmptyState } from "../components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Zap, Calendar, ChevronRight, ChevronDown, Search, AlertCircle } from "lucide-react";

function formatStatus(status: string): string {
  return status
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const QUICK_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  "no-show": [],
};

export default function AppointmentsPage() {
  const { user, businessId } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const [quickBookOpen, setQuickBookOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [, runUpdateStatus] = useAction(api.appointment.updateStatus);

  const handleQuickStatus = async (
    e: React.MouseEvent,
    appointmentId: string,
    newStatus: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const result = await runUpdateStatus({ id: appointmentId, status: newStatus });
    if (result.error) {
      toast.error("Failed: " + result.error.message);
    } else {
      toast.success("Status updated to " + newStatus);
      refetch({ requestPolicy: "network-only" });
    }
  };

  const [{ data: appointments, fetching: appointmentsFetching, error: appointmentsError }, refetch] = useFindMany(
    api.appointment,
    {
      filter: { business: { id: { equals: businessId } } },
      sort: { startTime: "Descending" },
      first: 100,
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
        client: { id: true, firstName: true, lastName: true },
        vehicle: { id: true, year: true, make: true, model: true },
        assignedStaff: { id: true, firstName: true, lastName: true },
      },
      pause: !businessId,
    }
  );

  const isLoading = appointmentsFetching;

  const filteredAppointments = appointments
    ? appointments.filter((appt) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const clientName = `${appt.client?.firstName ?? ""} ${appt.client?.lastName ?? ""}`.toLowerCase();
        const vehicleStr = `${appt.vehicle?.make ?? ""} ${appt.vehicle?.model ?? ""}`.toLowerCase();
        const titleStr = (appt.title ?? "").toLowerCase();
        return titleStr.includes(q) || clientName.includes(q) || vehicleStr.includes(q);
      })
    : [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Jobs"
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search appointments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <Button variant="outline" onClick={() => setQuickBookOpen(true)}>
              <Zap className="h-4 w-4 mr-2" />
              Quick Book
            </Button>
            <Button asChild>
              <Link to="/appointments/new">
                <Plus className="h-4 w-4 mr-2" />
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

      {appointmentsError && !isLoading ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Could not load appointments. Please refresh the page.</span>
          <span className="text-destructive/70 text-xs">({appointmentsError.message})</span>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 bg-white rounded-lg border animate-pulse"
            >
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
          title="No appointments yet"
          description="Book your first appointment to get started."
          action={
            <Button asChild>
              <Link to="/appointments/new">
                <Plus className="h-4 w-4 mr-2" />
                New Appointment
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {filteredAppointments.map((appt) => {
            const clientName = `${appt.client?.firstName ?? ""} ${appt.client?.lastName ?? ""}`.trim();
            const vehicleStr = [appt.vehicle?.year, appt.vehicle?.make, appt.vehicle?.model]
              .filter(Boolean)
              .join(" ");
            let formattedTime = "";
            try {
              formattedTime = appt.startTime
                ? format(new Date(appt.startTime), "MMM d, yyyy h:mm a")
                : "";
            } catch {
              formattedTime = "";
            }

            return (
              <Link
                key={appt.id}
                to={`/appointments/${appt.id}`}
                className="flex items-center justify-between p-4 bg-white rounded-lg border hover:border-primary transition-colors"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={appt.status ?? ""} type="appointment" />
                    <span className="font-medium">
                      {appt.title || clientName || "Appointment"}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {clientName}
                    {vehicleStr && (
                      <>
                        {" · "}
                        {vehicleStr}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {formattedTime && <span>{formattedTime}</span>}
                  {appt.assignedStaff && (
                    <span>
                      {appt.assignedStaff.firstName} {appt.assignedStaff.lastName}
                    </span>
                  )}
                  {(QUICK_TRANSITIONS[appt.status ?? ""]?.length ?? 0) > 0 && (
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                            Status
                            <ChevronDown className="h-3 w-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {QUICK_TRANSITIONS[appt.status ?? ""].map((status) => (
                            <DropdownMenuItem
                              key={status}
                              onSelect={(e) => {
                                handleQuickStatus(
                                  e as unknown as React.MouseEvent,
                                  appt.id,
                                  status
                                );
                              }}
                            >
                              {formatStatus(status)}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}