import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { CarFront, CircleDollarSign, Clock3, ExternalLink, Loader2, MapPin, User, Wrench } from "lucide-react";
import { api } from "@/api";
import { useAction, useFindMany } from "@/hooks/useApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveTimeSelect, buildQuarterHourOptions, toDateInputValue } from "@/components/appointments/SchedulingControls";
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
  assignedStaffId?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
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

const TIME_OPTIONS = buildQuarterHourOptions();

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function toTimeInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mm = String(parsed.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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
  const [{ data: staffOptionsRaw }] = useFindMany(api.staff, { first: 100 } as any);
  const [{ fetching: savingDeposit }, updateAppointmentMoney] = useAction(api.appointment.update);
  const [{ fetching: recordingPayment }, recordDepositPayment] = useAction(api.appointment.recordDepositPayment);
  const [{ fetching: reversingPayment }, reverseDepositPayment] = useAction(api.appointment.reverseDepositPayment);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingPhase, setPendingPhase] = useState<string | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [timingDialogOpen, setTimingDialogOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [assignedStaffIdDraft, setAssignedStaffIdDraft] = useState("unassigned");
  const [notesDraft, setNotesDraft] = useState("");
  const [internalNotesDraft, setInternalNotesDraft] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceStartTime, setServiceStartTime] = useState("");
  const [serviceEndTime, setServiceEndTime] = useState("");
  const [dropoffDate, setDropoffDate] = useState("");
  const [dropoffTime, setDropoffTime] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [pickupReadyDate, setPickupReadyDate] = useState("");
  const [pickupReadyTime, setPickupReadyTime] = useState("");
  const [depositDraft, setDepositDraft] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);

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
  const hasClient = Boolean(appointment.client?.firstName || appointment.client?.lastName);
  const isInternalAppointment = !hasClient;
  const effectiveCollectionAmount =
    isInternalAppointment && totalAmount > 0
      ? Number(appointment.depositAmount ?? 0) > 0
        ? Number(appointment.depositAmount ?? 0)
        : totalAmount
      : Number(appointment.depositAmount ?? 0);
  const canManageMoney = appointment.status !== "cancelled" && appointment.status !== "no-show" && totalAmount > 0;
  const staffOptions = ((staffOptionsRaw ?? []) as Array<{ id: string; firstName?: string | null; lastName?: string | null }>).map((staff) => ({
    id: staff.id,
    label: [staff.firstName, staff.lastName].filter(Boolean).join(" ").trim() || "Unnamed staff",
  }));

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

  function openDepositDialog() {
    const currentAmount = Number(appointment.depositAmount ?? 0);
    setDepositDraft(currentAmount > 0 ? currentAmount.toFixed(2) : "");
    setDepositDialogOpen(true);
  }

  function openTimingDialog() {
    setServiceDate(toDateInputValue(appointment.startTime));
    setServiceStartTime(toTimeInputValue(appointment.startTime));
    setServiceEndTime(toTimeInputValue(appointment.endTime));
    setDropoffDate(toDateInputValue(appointment.jobStartTime));
    setDropoffTime(toTimeInputValue(appointment.jobStartTime));
    setPickupDate(toDateInputValue(appointment.expectedCompletionTime));
    setPickupTime(toTimeInputValue(appointment.expectedCompletionTime));
    setPickupReadyDate(toDateInputValue(appointment.pickupReadyTime));
    setPickupReadyTime(toTimeInputValue(appointment.pickupReadyTime));
    setTimingDialogOpen(true);
  }

  function openDetailsDialog() {
    setAssignedStaffIdDraft(appointment.assignedStaffId || "unassigned");
    setNotesDraft(appointment.notes ?? "");
    setInternalNotesDraft(appointment.internalNotes ?? "");
    setDetailsDialogOpen(true);
  }

  function openPaymentDialog() {
    setPaymentAmount(effectiveCollectionAmount > 0 ? effectiveCollectionAmount.toFixed(2) : "0.00");
    setPaymentMethod("cash");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentDialogOpen(true);
  }

  async function handleSaveDeposit() {
    const nextAmount = depositDraft.trim() === "" ? 0 : Number(depositDraft);
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      toast.error("Enter a valid deposit amount.");
      return;
    }
    if (totalAmount > 0 && nextAmount > totalAmount) {
      toast.error("Deposit cannot be greater than the appointment total.");
      return;
    }
    const result = await updateAppointmentMoney({ id: appointment.id, depositAmount: nextAmount } as any);
    if (result.error) {
      toast.error("Failed to update deposit: " + result.error.message);
      return;
    }
    toast.success(nextAmount > 0 ? "Deposit updated" : "Deposit removed");
    setDepositDialogOpen(false);
    await onAppointmentChange?.();
  }

  async function handleRecordPayment() {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount.");
      return;
    }
    if (Math.abs(amount - effectiveCollectionAmount) > 0.009) {
      toast.error(`Payment must match ${formatCurrency(effectiveCollectionAmount)}.`);
      return;
    }
    const [year, month, day] = paymentDate.split("-").map(Number);
    const paidAtDate = new Date(year, (month || 1) - 1, day || 1);
    const result = await recordDepositPayment({
      id: appointment.id,
      amount,
      method: paymentMethod,
      paidAt: paidAtDate.toISOString(),
    } as any);
    if (result.error) {
      toast.error("Failed to record payment: " + result.error.message);
      return;
    }
    toast.success(isInternalAppointment ? "Payment recorded" : "Deposit recorded");
    setPaymentDialogOpen(false);
    await onAppointmentChange?.();
  }

  async function handleSaveTiming() {
    if (!serviceDate || !serviceStartTime) {
      toast.error("Choose the service date and start time.");
      return;
    }

    const nextStartTime = new Date(`${serviceDate}T${serviceStartTime}`);
    const nextEndTime = serviceEndTime ? new Date(`${serviceDate}T${serviceEndTime}`) : undefined;
    if (nextEndTime && nextEndTime.getTime() <= nextStartTime.getTime()) {
      toast.error("Work end must be after work start.");
      return;
    }

    let nextJobStartTime: Date | null = null;
    let nextExpectedCompletionTime: Date | null = null;
    let nextPickupReadyTime: Date | null = null;

    if (isMultiDayJob(appointment)) {
      if (!dropoffDate || !dropoffTime || !pickupDate || !pickupTime) {
        toast.error("Choose both drop-off and pickup timing.");
        return;
      }
      nextJobStartTime = new Date(`${dropoffDate}T${dropoffTime}`);
      nextExpectedCompletionTime = new Date(`${pickupDate}T${pickupTime}`);
      if (nextExpectedCompletionTime.getTime() < nextJobStartTime.getTime()) {
        toast.error("Pickup must be after drop-off.");
        return;
      }
      if (
        toDateInputValue(nextJobStartTime) === toDateInputValue(nextStartTime) &&
        nextJobStartTime.getTime() > nextStartTime.getTime()
      ) {
        toast.error("Drop-off cannot be after the scheduled labor start.");
        return;
      }
      if (pickupReadyDate && pickupReadyTime) {
        nextPickupReadyTime = new Date(`${pickupReadyDate}T${pickupReadyTime}`);
      }
    }

    const result = await updateAppointment({
      id: appointment.id,
      startTime: nextStartTime,
      endTime: nextEndTime,
      jobStartTime: isMultiDayJob(appointment) ? nextJobStartTime : null,
      expectedCompletionTime: isMultiDayJob(appointment) ? nextExpectedCompletionTime : null,
      pickupReadyTime: nextPickupReadyTime,
      vehicleOnSite: Boolean(isMultiDayJob(appointment)),
      jobPhase: isMultiDayJob(appointment) ? appointment.jobPhase ?? "scheduled" : "scheduled",
    } as any);
    if (result.error) {
      toast.error("Failed to update timing: " + result.error.message);
      return;
    }
    toast.success("Timing updated");
    setTimingDialogOpen(false);
    await onAppointmentChange?.();
  }

  async function handleSaveDetails() {
    const result = await updateAppointment({
      id: appointment.id,
      assignedStaffId: assignedStaffIdDraft === "unassigned" ? undefined : assignedStaffIdDraft,
      notes: notesDraft,
      internalNotes: internalNotesDraft,
    } as any);
    if (result.error) {
      toast.error("Failed to update appointment details: " + result.error.message);
      return;
    }
    toast.success("Assignment and notes updated");
    setDetailsDialogOpen(false);
    await onAppointmentChange?.();
  }

  async function handleReversePayment() {
    const confirmed = window.confirm(isInternalAppointment ? "Mark this appointment unpaid again?" : "Reverse this deposit collection?");
    if (!confirmed) return;
    const result = await reverseDepositPayment({ id: appointment.id } as any);
    if (result.error) {
      toast.error("Failed to reverse payment: " + result.error.message);
      return;
    }
    toast.success(isInternalAppointment ? "Payment reversed" : "Deposit reversed");
    await onAppointmentChange?.();
  }

  return (
    <>
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

            {canManageMoney ? (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Money actions</p>
                <div className="flex flex-wrap gap-2">
                  {!isInternalAppointment ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={openDepositDialog}
                      disabled={savingDeposit || recordingPayment || reversingPayment}
                    >
                      {Number(appointment.depositAmount ?? 0) > 0 ? "Edit deposit" : "Set deposit"}
                    </Button>
                  ) : null}
                  {!appointment.depositPaid && effectiveCollectionAmount > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={openPaymentDialog}
                      disabled={savingDeposit || recordingPayment || reversingPayment}
                    >
                      {recordingPayment ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                      {isInternalAppointment ? "Mark paid" : "Collect deposit"}
                    </Button>
                  ) : null}
                  {appointment.depositPaid ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => void handleReversePayment()}
                      disabled={savingDeposit || recordingPayment || reversingPayment}
                    >
                      {reversingPayment ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                      {isInternalAppointment ? "Mark unpaid" : "Reverse deposit"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Timing</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={openTimingDialog}
                  disabled={updatingPhase || updatingLifecycle || completingAppointment}
                >
                  Edit timing
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={openDetailsDialog}
                  disabled={updatingPhase || updatingLifecycle || completingAppointment}
                >
                  Edit assignment
                </Button>
              </div>
            </div>
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

      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set deposit</DialogTitle>
            <DialogDescription>
              Choose how much you want to collect up front for this appointment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="inspector-deposit-amount">Deposit amount</Label>
              <Input
                id="inspector-deposit-amount"
                inputMode="decimal"
                value={depositDraft}
                onChange={(event) => setDepositDraft(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">Appointment total: {formatCurrency(totalAmount)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositDialogOpen(false)} disabled={savingDeposit}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveDeposit()} disabled={savingDeposit}>
              {savingDeposit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={timingDialogOpen} onOpenChange={setTimingDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit timing</DialogTitle>
            <DialogDescription>
              Update the service window and, for multi-day jobs, the shop stay timeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inspector-service-date">Service date</Label>
                <Input
                  id="inspector-service-date"
                  type="date"
                  value={serviceDate}
                  onChange={(event) => setServiceDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inspector-service-start">Work start</Label>
                <ResponsiveTimeSelect
                  id="inspector-service-start"
                  value={serviceStartTime}
                  onChange={setServiceStartTime}
                  options={TIME_OPTIONS}
                  placeholder="Select a start time"
                  useNative={false}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inspector-service-end">Work end</Label>
              <ResponsiveTimeSelect
                id="inspector-service-end"
                value={serviceEndTime}
                onChange={setServiceEndTime}
                options={TIME_OPTIONS}
                placeholder="No end time"
                useNative={false}
                allowEmpty
              />
            </div>

            {isMultiDayJob(appointment) ? (
              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/[0.12] p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="inspector-dropoff-date">Drop-off date</Label>
                    <Input
                      id="inspector-dropoff-date"
                      type="date"
                      value={dropoffDate}
                      onChange={(event) => setDropoffDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inspector-dropoff-time">Drop-off time</Label>
                    <ResponsiveTimeSelect
                      id="inspector-dropoff-time"
                      value={dropoffTime}
                      onChange={setDropoffTime}
                      options={TIME_OPTIONS}
                      placeholder="Select a time"
                      useNative={false}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="inspector-pickup-date">Pickup date</Label>
                    <Input
                      id="inspector-pickup-date"
                      type="date"
                      value={pickupDate}
                      onChange={(event) => setPickupDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inspector-pickup-time">Pickup time</Label>
                    <ResponsiveTimeSelect
                      id="inspector-pickup-time"
                      value={pickupTime}
                      onChange={setPickupTime}
                      options={TIME_OPTIONS}
                      placeholder="Select a time"
                      useNative={false}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="inspector-ready-date">Pickup ready date</Label>
                    <Input
                      id="inspector-ready-date"
                      type="date"
                      value={pickupReadyDate}
                      onChange={(event) => setPickupReadyDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inspector-ready-time">Pickup ready time</Label>
                    <ResponsiveTimeSelect
                      id="inspector-ready-time"
                      value={pickupReadyTime}
                      onChange={setPickupReadyTime}
                      options={TIME_OPTIONS}
                      placeholder="Not set"
                      useNative={false}
                      allowEmpty
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimingDialogOpen(false)} disabled={updatingPhase}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveTiming()} disabled={updatingPhase}>
              {updatingPhase ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save timing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit assignment and notes</DialogTitle>
            <DialogDescription>
              Update who owns the job and keep the team notes current without leaving the board.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inspector-assigned-tech">Assigned tech</Label>
              <select
                id="inspector-assigned-tech"
                value={assignedStaffIdDraft}
                onChange={(event) => setAssignedStaffIdDraft(event.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="unassigned">Unassigned</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inspector-client-notes">Client notes</Label>
              <Textarea
                id="inspector-client-notes"
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                placeholder="Notes visible on the appointment"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inspector-internal-notes">Internal notes</Label>
              <Textarea
                id="inspector-internal-notes"
                value={internalNotesDraft}
                onChange={(event) => setInternalNotesDraft(event.target.value)}
                placeholder="Private team notes"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)} disabled={updatingPhase}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveDetails()} disabled={updatingPhase}>
              {updatingPhase ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isInternalAppointment ? "Record payment" : "Collect deposit"}</DialogTitle>
            <DialogDescription>
              {isInternalAppointment
                ? "Record the collected amount for this internal appointment."
                : "Record the required deposit for this appointment."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="inspector-payment-amount">Amount</Label>
              <Input
                id="inspector-payment-amount"
                inputMode="decimal"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Required amount: {formatCurrency(effectiveCollectionAmount)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inspector-payment-method">Method</Label>
              <select
                id="inspector-payment-method"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="check">Check</option>
                <option value="venmo">Venmo</option>
                <option value="cashapp">CashApp</option>
                <option value="zelle">Zelle</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inspector-payment-date">Paid on</Label>
              <Input
                id="inspector-payment-date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)} disabled={recordingPayment}>
              Cancel
            </Button>
            <Button onClick={() => void handleRecordPayment()} disabled={recordingPayment}>
              {recordingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isInternalAppointment ? "Mark paid" : "Record deposit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
