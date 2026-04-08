import { Link } from "react-router";
import { CarFront, CircleDollarSign, Clock3, ExternalLink, MapPin, User, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getJobPhaseLabel, getOperationalDayLabel, getOperationalTimelineLabel, isMultiDayJob } from "@/lib/calendarJobSpans";

export type AppointmentInspectorRecord = {
  id: string;
  title?: string | null;
  startTime: string;
  endTime?: string | null;
  jobStartTime?: string | null;
  expectedCompletionTime?: string | null;
  pickupReadyTime?: string | null;
  vehicleOnSite?: boolean | null;
  jobPhase?: string | null;
  totalPrice?: number | null;
  location?: { name?: string | null } | null;
  client?: { firstName?: string | null; lastName?: string | null } | null;
  vehicle?: { year?: number | null; make?: string | null; model?: string | null } | null;
  assignedStaff?: { firstName?: string | null; lastName?: string | null } | null;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getAppointmentLabel(appointment: AppointmentInspectorRecord): string {
  if (appointment.title?.trim()) return appointment.title.trim();
  const clientName = [appointment.client?.firstName, appointment.client?.lastName].filter(Boolean).join(" ").trim();
  return clientName || "Appointment";
}

function getClientName(appointment: AppointmentInspectorRecord): string {
  return [appointment.client?.firstName, appointment.client?.lastName].filter(Boolean).join(" ").trim() || "Internal";
}

function getVehicleLabel(appointment: AppointmentInspectorRecord): string {
  return [appointment.vehicle?.year, appointment.vehicle?.make, appointment.vehicle?.model].filter(Boolean).join(" ").trim() || "No vehicle";
}

function getTechName(appointment: AppointmentInspectorRecord): string {
  return [appointment.assignedStaff?.firstName, appointment.assignedStaff?.lastName].filter(Boolean).join(" ").trim() || "Unassigned";
}

function getAmountLabel(appointment: AppointmentInspectorRecord): string {
  const amount = Number(appointment.totalPrice ?? 0);
  return amount > 0 ? formatCurrency(amount) : "No amount set";
}

function getTimingLabel(appointment: AppointmentInspectorRecord): string {
  if (isMultiDayJob(appointment)) return getOperationalTimelineLabel(appointment);
  const start = new Date(appointment.startTime);
  const end = appointment.endTime ? new Date(appointment.endTime) : null;
  return `${start.toLocaleDateString("en-US", { weekday: "short" })} ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${end ? ` - ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}`;
}

function getStageLabel(appointment: AppointmentInspectorRecord): string {
  return isMultiDayJob(appointment) ? getOperationalDayLabel(appointment, new Date()) : getJobPhaseLabel(appointment.jobPhase);
}

export function AppointmentInspectorPanel({
  appointment,
  emptyTitle = "Select a job",
  emptyDescription = "Pick any job to inspect the customer, vehicle, timing, money, and current stage.",
}: {
  appointment: AppointmentInspectorRecord | null;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!appointment) {
    return (
      <Card className="border-border/70 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Inspector</p>
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="text-sm text-muted-foreground">{emptyDescription}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Appointment Inspector</p>
          <h3 className="text-lg font-semibold text-foreground">{getAppointmentLabel(appointment)}</h3>
        </div>

        <div className="grid gap-3 text-sm">
          <InspectorRow icon={CircleDollarSign} label="Amount" value={getAmountLabel(appointment)} strong />
          <InspectorRow icon={User} label="Customer" value={getClientName(appointment)} />
          <InspectorRow icon={CarFront} label="Vehicle" value={getVehicleLabel(appointment)} />
          <InspectorRow icon={Clock3} label="Timing" value={getTimingLabel(appointment)} />
          <InspectorRow icon={Wrench} label="Stage" value={getStageLabel(appointment)} />
          <InspectorRow icon={MapPin} label="Location" value={appointment.location?.name ?? "No location"} />
          <InspectorRow icon={Wrench} label="Assigned tech" value={getTechName(appointment)} />
        </div>

        <div className="flex flex-col gap-2">
          <Button asChild className="w-full rounded-xl">
            <Link to={`/appointments/${appointment.id}`}>
              Open full details
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full rounded-xl">
            <Link to={`/appointments/${appointment.id}`}>
              Edit appointment
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InspectorRow({
  icon: Icon,
  label,
  value,
  strong = false,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-sm text-foreground", strong && "font-semibold")}>{value}</p>
      </div>
    </div>
  );
}
