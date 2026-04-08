import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { CarFront, CircleDollarSign, Clock3, ExternalLink, Loader2, MapPin, User, Wrench } from "lucide-react";
import { api } from "@/api";
import { useAction } from "@/hooks/useApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getJobPhaseLabel, getOperationalDayLabel, getOperationalTimelineLabel, isMultiDayJob } from "@/lib/calendarJobSpans";

export type AppointmentInspectorRecord = {
  id: string;
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
  location?: { name?: string | null } | null;
  client?: { firstName?: string | null; lastName?: string | null } | null;
  vehicle?: { year?: number | null; make?: string | null; model?: string | null } | null;
  assignedStaff?: { firstName?: string | null; lastName?: string | null } | null;
};

const LIFECYCLE_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  "no-show": "No Show",
};

const QUICK_PHASE_OPTIONS = [
  { value: "active_work", label: "Active" },
  { value: "waiting", label: "Waiting" },
  { value: "curing", label: "Curing" },
  { value: "hold", label: "On hold" },
  { value: "pickup_ready", label: "Ready" },
] as const;

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
  if (isMultiDayJob(appointment)) return getJobPhaseLabel(appointment.jobPhase);
  return LIFECYCLE_STATUS_LABELS[String(appointment.status ?? "")] ?? getJobPhaseLabel(appointment.jobPhase);
}

function getLifecycleLabel(appointment: AppointmentInspectorRecord): string {
  return LIFECYCLE_STATUS_LABELS[String(appointment.status ?? "")] ?? "Scheduled";
}

function getCollectedAmount(appointment: AppointmentInspectorRecord): number {
  const total = Number(appointment.totalPrice ?? 0);
  const deposit = Number(appointment.depositAmount ?? 0);
  if (appointment.paidAt) return total;
  if (!appointment.depositPaid) return 0;
  if (deposit > 0) return Math.min(total, deposit);
  return total;
}

function getBalanceDue(appointment: AppointmentInspectorRecord): number {
  const total = Number(appointment.totalPrice ?? 0);
  const collected = getCollectedAmount(appointment);
  return Math.max(0, total - collected);
}

function getMoneyStateLabel(appointment: AppointmentInspectorRecord): string {
  if (appointment.paidAt || (appointment.depositPaid && Number(appointment.depositAmount ?? 0) <= 0)) {
    return "Paid";
  }
  if (appointment.depositPaid && Number(appointment.depositAmount ?? 0) > 0) {
    return "Deposit collected";
  }
  if (Number(appointment.depositAmount ?? 0) > 0) {
    return "Deposit due";
  }
  return "No deposit set";
}

function canConfirmAppointment(appointment: AppointmentInspectorRecord): boolean {
  return appointment.status === "scheduled";
}

function canStartAppointment(appointment: AppointmentInspectorRecord): boolean {
  return appointment.status === "scheduled" || appointment.status === "confirmed";
}

function canCompleteAppointment(appointment: AppointmentInspectorRecord): boolean {
  return appointment.status === "confirmed" || appointment.status === "in_progress";
}

export function AppointmentInspectorPanel({
  appointment,
  emptyTitle = "Select a job",
  emptyDescription = "Pick any job to inspect the customer, vehicle, timing, money, and current stage.",
  onAppointmentChange,
}: {
  appointment: AppointmentInspectorRecord | null;
  emptyTitle?: string;
  emptyDescription?: string;
  onAppointmentChange?: (() => void | Promise<void>) | undefined;
}) {
  const [{ fetching: updatingLifecycle }, updateAppointmentStatus] = useAction(api.appointment.updateStatus);
  const [{ fetching: updatingPhase }, updateAppointment] = useAction(api.appointment.update);
  const [{ fetching: completingAppointment }, completeAppointment] = useAction(api.appointment.complete);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingPhase, setPendingPhase] = useState<string | null>(null);

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

  const lifecycleLabel = getLifecycleLabel(appointment);
  const moneyStateLabel = getMoneyStateLabel(appointment);
  const collectedAmount = getCollectedAmount(appointment);
  const balanceDue = getBalanceDue(appointment);
  const totalAmount = Number(appointment.totalPrice ?? 0);

  async function handleLifecycleUpdate(nextStatus: "confirmed" | "in_progress") {
    setPendingStatus(nextStatus);
    const result = await updateAppointmentStatus({ id: appointment.id, status: nextStatus } as any);
    setPendingStatus(null);
    if (result.error) {
      toast.error("Failed to update appointment: " + result.error.message);
      return;
    }
    toast.success(nextStatus === "confirmed" ? "Appointment confirmed" : "Appointment started");
    await onAppointmentChange?.();
  }

  async function handleComplete() {
    setPendingStatus("completed");
    const result = await completeAppointment({ id: appointment.id } as any);
    setPendingStatus(null);
    if (result.error) {
      toast.error("Failed to complete appointment: " + result.error.message);
      return;
    }
    toast.success("Appointment completed");
    await onAppointmentChange?.();
  }

  async function handlePhaseUpdate(nextPhase: string) {
    setPendingPhase(nextPhase);
    const result = await updateAppointment({ id: appointment.id, jobPhase: nextPhase } as any);
    setPendingPhase(null);
    if (result.error) {
      toast.error("Failed to update stage: " + result.error.message);
      return;
    }
    toast.success(`${getJobPhaseLabel(nextPhase)} set`);
    await onAppointmentChange?.();
  }

  return (
    <Card className="border-border/70 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Appointment Inspector</p>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {lifecycleLabel}
              </span>
              {isMultiDayJob(appointment) ? (
                <span className="rounded-full border border-primary/15 bg-primary/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                  {getStageLabel(appointment)}
                </span>
              ) : null}
            </div>
          </div>
          <h3 className="text-lg font-semibold text-foreground">{getAppointmentLabel(appointment)}</h3>
        </div>

        <div className="grid gap-3 text-sm">
          <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Money</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{getAmountLabel(appointment)}</p>
              </div>
              <span className="rounded-full border border-border/70 bg-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {moneyStateLabel}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MoneyTile label="Collected" value={collectedAmount > 0 ? formatCurrency(collectedAmount) : "-"} />
              <MoneyTile label="Balance due" value={balanceDue > 0 ? formatCurrency(balanceDue) : totalAmount > 0 ? "Paid" : "-"} />
            </div>
          </div>
          <InspectorRow icon={User} label="Customer" value={getClientName(appointment)} />
          <InspectorRow icon={CarFront} label="Vehicle" value={getVehicleLabel(appointment)} />
          <InspectorRow icon={Clock3} label="Timing" value={getTimingLabel(appointment)} />
          <InspectorRow icon={Wrench} label="Stage" value={getStageLabel(appointment)} />
          <InspectorRow icon={MapPin} label="Location" value={appointment.location?.name ?? "No location"} />
          <InspectorRow icon={Wrench} label="Assigned tech" value={getTechName(appointment)} />
        </div>

        {appointment.status !== "cancelled" && appointment.status !== "no-show" ? (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/[0.12] p-3">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quick controls</p>
              <p className="text-xs text-muted-foreground">Move the job forward without leaving the board.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canConfirmAppointment(appointment) ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => void handleLifecycleUpdate("confirmed")}
                  disabled={updatingLifecycle || updatingPhase || completingAppointment}
                >
                  {pendingStatus === "confirmed" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  Confirm
                </Button>
              ) : null}
              {canStartAppointment(appointment) ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => void handleLifecycleUpdate("in_progress")}
                  disabled={updatingLifecycle || updatingPhase || completingAppointment}
                >
                  {pendingStatus === "in_progress" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  Start work
                </Button>
              ) : null}
              {canCompleteAppointment(appointment) ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => void handleComplete()}
                  disabled={updatingLifecycle || updatingPhase || completingAppointment}
                >
                  {pendingStatus === "completed" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  Mark complete
                </Button>
              ) : null}
            </div>

            {isMultiDayJob(appointment) ? (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">In-shop stage</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PHASE_OPTIONS.map((option) => {
                    const active = appointment.jobPhase === option.value;
                    return (
                      <Button
                        key={option.value}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="rounded-xl"
                        onClick={() => void handlePhaseUpdate(option.value)}
                        disabled={active || updatingLifecycle || updatingPhase || completingAppointment}
                      >
                        {pendingPhase === option.value ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button asChild className="w-full rounded-xl">
            <Link to={`/appointments/${appointment.id}`}>
              Open full details
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full rounded-xl">
            <Link to={`/appointments/${appointment.id}`}>
              Manage timing and payment
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MoneyTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/80 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
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
