import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { CarFront, CircleDollarSign, Clock3, ExternalLink, Loader2, MapPin, Plus, Trash2, User, Wrench } from "lucide-react";
import { api } from "@/api";
import { useAction, useFindMany, useFindFirst } from "@/hooks/useApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveTimeSelect, buildQuarterHourOptions, toDateInputValue } from "@/components/appointments/SchedulingControls";
import { cn } from "@/lib/utils";
import {
  getJobPhaseLabel,
  getOperationalDayLabel,
  getOperationalTimelineLabel,
  isMultiDayJob,
  parseCalendarDateTimeInput,
} from "@/lib/calendarJobSpans";
import { getDisplayedAppointmentAmount } from "@/lib/appointmentAmounts";
import { hasBackendFinanceField, resolveAppointmentFinanceState } from "@/lib/appointmentFinanceState";

export type AppointmentInspectorRecord = {
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
  subtotal?: number | string | null;
  taxRate?: number | string | null;
  taxAmount?: number | string | null;
  applyTax?: boolean | null;
  adminFeeRate?: number | string | null;
  adminFeeAmount?: number | string | null;
  applyAdminFee?: boolean | null;
  totalPrice?: number | null;
  depositAmount?: number | null;
  paidAt?: string | null;
  invoiceStatus?: string | null;
  invoicePaidAt?: string | null;
  collectedAmount?: number | null;
  balanceDue?: number | null;
  paidInFull?: boolean | null;
  depositSatisfied?: boolean | null;
  assignedStaffId?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  location?: { name?: string | null } | null;
  client?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
  vehicle?: { id?: string | null; year?: number | null; make?: string | null; model?: string | null } | null;
  assignedStaff?: { firstName?: string | null; lastName?: string | null } | null;
};

type AppointmentPaymentActivity = {
  action?: string | null;
  type?: string | null;
  metadata?: string | null;
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function toMoneyNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const normalized = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(normalized) ? normalized : 0;
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
  const amount = getDisplayedAppointmentAmount(appointment);
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

function getPaymentSummary(
  appointment: AppointmentInspectorRecord,
  activityLogs: AppointmentPaymentActivity[]
): {
  collectedAmount: number;
  balanceDue: number;
  moneyStateLabel: string;
  nextCollectionAmount: number;
  hasAnyPayment: boolean;
  isPaidInFull: boolean;
  } {
  const {
    depositAmount,
    collectedAmount,
    balanceDue,
    hasAnyPayment,
    isPaidInFull,
    nextCollectionAmount,
    hasBackendDepositSatisfied,
    depositSatisfied,
  } = resolveAppointmentFinanceState(appointment, activityLogs);

  let moneyStateLabel = "No deposit set";
  if (isPaidInFull) moneyStateLabel = "Paid in full";
  else if (
    hasAnyPayment &&
    balanceDue > 0.009 &&
    ((hasBackendDepositSatisfied && depositSatisfied) || (!hasBackendDepositSatisfied && depositAmount > 0))
  ) {
    moneyStateLabel = "Deposit collected";
  }
  else if (hasAnyPayment && balanceDue > 0.009) moneyStateLabel = "Payment recorded";
  else if (depositAmount > 0) moneyStateLabel = "Deposit due";

  return {
    collectedAmount,
    balanceDue,
    moneyStateLabel,
    nextCollectionAmount,
    hasAnyPayment,
    isPaidInFull,
  };
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
  compact = false,
  presentation = "card",
  onAppointmentChange,
  onRequestClose,
}: {
  appointment: AppointmentInspectorRecord | null;
  emptyTitle?: string;
  emptyDescription?: string;
  compact?: boolean;
  presentation?: "card" | "floating";
  onAppointmentChange?: (() => void | Promise<void>) | undefined;
  onRequestClose?: (() => void) | undefined;
}) {
  const [{ fetching: updatingLifecycle }, updateAppointmentStatus] = useAction(api.appointment.updateStatus);
  const [{ fetching: updatingPhase }, updateAppointment] = useAction(api.appointment.update);
  const [{ fetching: completingAppointment }, completeAppointment] = useAction(api.appointment.complete);
  const [{ fetching: cancellingAppointment }, cancelAppointment] = useAction(api.appointment.cancel);
  const [{ fetching: deletingAppointment }, deleteAppointment] = useAction(api.appointment.delete);
  const [{ data: staffOptionsRaw }] = useFindMany(api.staff, { first: 100 } as any);
  const [{ data: clientOptionsRaw, fetching: clientOptionsFetching }] = useFindMany(api.client, {
    filter: appointment?.businessId ? { businessId: { equals: appointment.businessId } } : { id: { equals: "" } },
    select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    sort: { firstName: "Ascending" },
    first: 200,
    pause: !appointment?.businessId,
  } as any);
  const [{ fetching: savingDeposit }, updateAppointmentMoney] = useAction(api.appointment.update);
  const [{ fetching: addingService }, addAppointmentService] = useAction(api.appointmentService.create);
  const [{ fetching: removingService }, removeAppointmentService] = useAction((params: Record<string, unknown>) =>
    api.appointmentService.delete(params)
  );
  const [{ fetching: recordingPayment }, recordDepositPayment] = useAction(api.appointment.recordDepositPayment);
  const [{ fetching: reversingPayment }, reverseDepositPayment] = useAction(api.appointment.reverseDepositPayment);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingPhase, setPendingPhase] = useState<string | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [timingDialogOpen, setTimingDialogOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [clientIdDraft, setClientIdDraft] = useState("internal");
  const [vehicleIdDraft, setVehicleIdDraft] = useState("none");
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
  const [priceDraft, setPriceDraft] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("__none__");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const selectedClientId = clientIdDraft !== "internal" ? clientIdDraft : null;
  const [{ data: vehicleOptionsRaw, fetching: vehicleOptionsFetching }] = useFindMany(api.vehicle, {
    filter: selectedClientId ? { clientId: { equals: selectedClientId } } : { id: { equals: "" } },
    select: { id: true, year: true, make: true, model: true, color: true, licensePlate: true },
    sort: { updatedAt: "Descending" },
    first: 100,
    pause: !selectedClientId,
  } as any);
  const [{ data: paymentActivityRaw }] = useFindMany(api.activityLog, {
    entityType: "appointment",
    entityId: appointment?.id ?? "",
    first: 25,
    sort: { createdAt: "Descending" },
    pause: !appointment?.id,
  } as any);

  const [{ data: linkedInvoice }] = useFindFirst(api.invoice, {
    live: true,
    filter: { appointmentId: { equals: appointment?.id ?? "" } },
    select: { id: true, status: true, paidAt: true },
    pause: !appointment?.id,
  } as any);
  const resolvedInvoiceStatus = (linkedInvoice as any)?.status ?? appointment?.invoiceStatus ?? null;
  const resolvedInvoicePaidAt = (linkedInvoice as any)?.paidAt ?? appointment?.invoicePaidAt ?? null;
  const appointmentWithInvoice: AppointmentInspectorRecord = appointment
    ? { ...appointment, invoiceStatus: resolvedInvoiceStatus, invoicePaidAt: resolvedInvoicePaidAt }
    : appointment;
  const isFloatingPresentation = presentation === "floating";

  const staffOptions = ((staffOptionsRaw ?? []) as Array<{ id: string; firstName?: string | null; lastName?: string | null }>).map((staff) => ({
    id: staff.id,
    label: [staff.firstName, staff.lastName].filter(Boolean).join(" ").trim() || "Unnamed staff",
  }));
  const clientOptions = ((clientOptionsRaw ?? []) as Array<{
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
  }>).map((client) => ({
    id: client.id,
    label: [
      [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || "Unnamed client",
      client.phone ?? client.email ?? null,
    ]
      .filter(Boolean)
      .join(" - "),
  }));
  const vehicleOptions = ((vehicleOptionsRaw ?? []) as Array<{
    id: string;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    color?: string | null;
    licensePlate?: string | null;
  }>).map((vehicle) => ({
    id: vehicle.id,
    label: [vehicle.year, vehicle.make, vehicle.model, vehicle.color, vehicle.licensePlate].filter(Boolean).join(" "),
  }));
  const [{ data: appointmentServicesRaw }] = useFindMany(api.appointmentService, {
    filter: appointment?.id ? { appointmentId: { equals: appointment.id } } : { id: { equals: "" } },
    first: 50,
    select: {
      id: true,
      serviceId: true,
      quantity: true,
      unitPrice: true,
      service: {
        id: true,
        name: true,
        category: true,
        durationMinutes: true,
      },
    },
    pause: !appointment?.id,
  } as any);
  const [{ data: serviceCatalogRaw, fetching: servicesFetching }] = useFindMany(api.service, {
    filter: appointment?.businessId ? { businessId: { equals: appointment.businessId } } : { id: { equals: "" } },
    first: 200,
    sort: { createdAt: "Descending" },
    pause: !appointment?.businessId,
  } as any);

  if (!appointment) {
    return (
      <Card className={cn(
        "native-panel-card border-border/70 shadow-[0_12px_28px_rgba(15,23,42,0.04)]",
        isFloatingPresentation && "py-0 !border-0 !bg-transparent !shadow-none supports-[backdrop-filter]:!bg-transparent"
      )}>
        <CardContent className={cn("space-y-2", compact ? "p-3" : "p-4", isFloatingPresentation && "p-0")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Inspector</p>
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="text-sm text-muted-foreground">{emptyDescription}</p>
        </CardContent>
      </Card>
    );
  }

  const lifecycleLabel = getLifecycleLabel(appointment);
  const paymentActivity = ((paymentActivityRaw ?? []) as AppointmentPaymentActivity[]) ?? [];
  const paymentSummary = getPaymentSummary(appointmentWithInvoice ?? appointment, paymentActivity);
  const moneyStateLabel = paymentSummary.moneyStateLabel;
  const collectedAmount = paymentSummary.collectedAmount;
  const balanceDue = paymentSummary.balanceDue;
  const servicesSubtotal = toMoneyNumber(appointment.subtotal);
  const adminFeeAmount = toMoneyNumber(appointment.adminFeeAmount);
  const adminFeeRate = toMoneyNumber(appointment.adminFeeRate);
  const taxAmount = toMoneyNumber(appointment.taxAmount);
  const taxRate = toMoneyNumber(appointment.taxRate);
  const showServicesSubtotal = servicesSubtotal > 0;
  const showAdminFee = appointment.applyAdminFee === true && adminFeeAmount > 0;
  const showTax = appointment.applyTax === true && taxAmount > 0;
  const showFinancialBreakdown = showServicesSubtotal || showAdminFee || showTax;
  const totalAmount = getDisplayedAppointmentAmount(appointment);
  const hasClient = Boolean(appointment.client?.firstName || appointment.client?.lastName);
  const isInternalAppointment = !hasClient;
  const effectiveCollectionAmount = paymentSummary.nextCollectionAmount;
  const canManageMoney = appointment.status !== "cancelled" && appointment.status !== "no-show" && totalAmount > 0;
  const appointmentServices = (appointmentServicesRaw ?? []) as Array<{
    id: string;
    serviceId?: string | null;
    quantity?: number | null;
    unitPrice?: number | null;
    service?: {
      id?: string | null;
      name?: string | null;
      category?: string | null;
      durationMinutes?: number | null;
    } | null;
  }>;
  const existingServiceIds = new Set(appointmentServices.map((service) => service.serviceId).filter(Boolean));
  const availableServices = ((serviceCatalogRaw ?? []) as Array<{
    id: string;
    name?: string | null;
    category?: string | null;
    price?: number | string | null;
  }>).filter((service) => service.id && !existingServiceIds.has(service.id));
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

  function openPriceDialog() {
    setPriceDraft(totalAmount > 0 ? totalAmount.toFixed(2) : "");
    setPriceDialogOpen(true);
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
    setClientIdDraft(appointment.client?.id || "internal");
    setVehicleIdDraft(appointment.vehicle?.id || "none");
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

  async function handleSavePrice() {
    const nextAmount = priceDraft.trim() === "" ? 0 : Number(priceDraft);
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      toast.error("Enter a valid total price.");
      return;
    }
    const result = await updateAppointmentMoney({ id: appointment.id, totalPrice: nextAmount } as any);
    if (result.error) {
      toast.error("Failed to update total price: " + result.error.message);
      return;
    }
    toast.success(nextAmount > 0 ? "Total price updated" : "Total price cleared");
    setPriceDialogOpen(false);
    await onAppointmentChange?.();
  }

  async function handleAddService() {
    if (selectedServiceId === "__none__") return;
    const result = await addAppointmentService({
      appointmentId: appointment.id,
      serviceId: selectedServiceId,
    } as any);
    if (result.error) {
      toast.error("Failed to add service: " + result.error.message);
      return;
    }
    toast.success("Service added");
    setSelectedServiceId("__none__");
    await onAppointmentChange?.();
  }

  async function handleRemoveService(appointmentServiceId: string) {
    const result = await removeAppointmentService({ id: appointmentServiceId } as any);
    if (result.error) {
      toast.error("Failed to remove service: " + result.error.message);
      return;
    }
    toast.success("Service removed");
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
    toast.success(paymentSummary.isPaidInFull || effectiveCollectionAmount >= balanceDue ? "Appointment paid in full" : "Payment recorded");
    setPaymentDialogOpen(false);
    await onAppointmentChange?.();
  }

  async function handleSaveTiming() {
    if (!serviceDate || !serviceStartTime) {
      toast.error("Choose the service date and start time.");
      return;
    }

    const nextStartTime = parseCalendarDateTimeInput(serviceDate, serviceStartTime);
    if (!nextStartTime) {
      toast.error("Choose a valid service start time.");
      return;
    }

    const nextEndTime = serviceEndTime ? parseCalendarDateTimeInput(serviceDate, serviceEndTime) : undefined;
    if (serviceEndTime && !nextEndTime) {
      toast.error("Choose a valid work end time.");
      return;
    }

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
      nextJobStartTime = parseCalendarDateTimeInput(dropoffDate, dropoffTime);
      nextExpectedCompletionTime = parseCalendarDateTimeInput(pickupDate, pickupTime);
      if (!nextJobStartTime || !nextExpectedCompletionTime) {
        toast.error("Choose valid drop-off and pickup timing.");
        return;
      }
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
      if ((pickupReadyDate && !pickupReadyTime) || (!pickupReadyDate && pickupReadyTime)) {
        toast.error("Choose both pickup ready date and time, or leave both blank.");
        return;
      }
      if (pickupReadyDate && pickupReadyTime) {
        nextPickupReadyTime = parseCalendarDateTimeInput(pickupReadyDate, pickupReadyTime);
        if (!nextPickupReadyTime) {
          toast.error("Choose a valid pickup ready time.");
          return;
        }
      }
      if (nextEndTime && nextEndTime.getTime() > nextExpectedCompletionTime.getTime()) {
        toast.error("Work end cannot be after pickup.");
        return;
      }
      if (nextPickupReadyTime && nextPickupReadyTime.getTime() < nextStartTime.getTime()) {
        toast.error("Pickup ready cannot be before work starts.");
        return;
      }
      if (nextPickupReadyTime && nextEndTime && nextPickupReadyTime.getTime() < nextEndTime.getTime()) {
        toast.error("Pickup ready cannot be before work ends.");
        return;
      }
      if (nextPickupReadyTime && nextPickupReadyTime.getTime() > nextExpectedCompletionTime.getTime()) {
        toast.error("Pickup ready cannot be after pickup.");
        return;
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
    if (selectedClientId && vehicleIdDraft === "none") {
      toast.error("Select a vehicle for the chosen client before saving.");
      return;
    }
    const result = await updateAppointment({
      id: appointment.id,
      clientId: selectedClientId ?? null,
      vehicleId: selectedClientId ? (vehicleIdDraft === "none" ? null : vehicleIdDraft) : null,
      assignedStaffId: assignedStaffIdDraft === "unassigned" ? undefined : assignedStaffIdDraft,
      notes: notesDraft,
      internalNotes: internalNotesDraft,
    } as any);
    if (result.error) {
      toast.error("Failed to update appointment details: " + result.error.message);
      return;
    }
    toast.success("Job details updated");
    setDetailsDialogOpen(false);
    await onAppointmentChange?.();
  }

  async function handleReversePayment() {
    const confirmed = window.confirm(
      paymentSummary.isPaidInFull ? "Reverse the recorded payment for this appointment?" : "Reverse the recorded deposit for this appointment?"
    );
    if (!confirmed) return;
    const result = await reverseDepositPayment({ id: appointment.id } as any);
    if (result.error) {
      toast.error("Failed to reverse payment: " + result.error.message);
      return;
    }
    toast.success(paymentSummary.isPaidInFull ? "Payment reversed" : "Deposit reversed");
    await onAppointmentChange?.();
  }

  async function handleCancelAppointment() {
    const confirmed = window.confirm("Cancel this appointment?");
    if (!confirmed) return;
    const result = await cancelAppointment({ id: appointment.id } as any);
    if (result.error) {
      toast.error("Failed to cancel appointment: " + result.error.message);
      return;
    }
    toast.success("Appointment cancelled");
    await onAppointmentChange?.();
    onRequestClose?.();
  }

  async function handleDeleteAppointment() {
    const confirmed = window.confirm(
      isInternalAppointment ? "Delete this blocked/internal appointment?" : "Delete this appointment?"
    );
    if (!confirmed) return;
    const result = await deleteAppointment({ id: appointment.id } as any);
    if (result.error) {
      const message = result.error.message ?? "Failed to delete appointment";
      toast.error(message.includes("can't be deleted") ? message : "Failed to delete appointment: " + message);
      return;
    }
    toast.success(isInternalAppointment ? "Block deleted" : "Appointment deleted");
    await onAppointmentChange?.();
    onRequestClose?.();
  }

  return (
    <>
      <Card className={cn(
        "native-panel-card border-border/70 shadow-[0_12px_28px_rgba(15,23,42,0.04)]",
        isFloatingPresentation && "py-0 !border-0 !bg-transparent !shadow-none supports-[backdrop-filter]:!bg-transparent"
      )}>
        <CardContent className={cn(compact ? "space-y-3 p-3" : "space-y-4 p-4", isFloatingPresentation && "p-0")}>
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
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
          <h3 className={cn("break-words font-semibold text-foreground", compact ? "line-clamp-2 text-base leading-5" : "text-lg")}>
            {getAppointmentLabel(appointment)}
          </h3>
        </div>

        <div className="grid gap-3 text-sm">
          <div className="native-foreground-panel rounded-xl border border-border/60 bg-background/76 px-3 py-3">
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
            {showFinancialBreakdown ? (
              <div className="mt-3 space-y-2 border-t border-border/50 pt-3 text-xs">
                {showServicesSubtotal ? (
                  <MoneyBreakdownRow label="Services subtotal" value={formatCurrency(servicesSubtotal)} />
                ) : null}
                {showAdminFee ? (
                  <MoneyBreakdownRow
                    label={adminFeeRate > 0 ? `Admin fee (${adminFeeRate}%)` : "Admin fee"}
                    value={formatCurrency(adminFeeAmount)}
                  />
                ) : null}
                {showTax ? (
                  <MoneyBreakdownRow
                    label={taxRate > 0 ? `Tax (${taxRate}%)` : "Tax"}
                    value={formatCurrency(taxAmount)}
                  />
                ) : null}
                <MoneyBreakdownRow label="Total" value={totalAmount > 0 ? formatCurrency(totalAmount) : "-"} strong />
              </div>
            ) : null}
          </div>
          <InspectorRow icon={User} label="Customer" value={getClientName(appointment)} />
          <InspectorRow icon={CarFront} label="Vehicle" value={getVehicleLabel(appointment)} />
          <InspectorRow icon={Clock3} label="Timing" value={getTimingLabel(appointment)} />
          <InspectorRow icon={Wrench} label="Stage" value={getStageLabel(appointment)} />
          <InspectorRow icon={MapPin} label="Location" value={appointment.location?.name ?? "No location"} />
          <InspectorRow icon={Wrench} label="Assigned tech" value={getTechName(appointment)} />
        </div>

        {appointment.status !== "cancelled" && appointment.status !== "no-show" ? (
          <div className="native-foreground-panel space-y-3 rounded-xl border border-border/60 bg-muted/[0.12] p-3">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quick controls</p>
              {!compact ? <p className="text-xs text-muted-foreground">Move the job forward without leaving the board.</p> : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {canConfirmAppointment(appointment) ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="native-touch-surface rounded-xl"
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
                  className="native-touch-surface rounded-xl"
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
                  className="native-touch-surface rounded-xl"
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
                <div className="grid gap-2 sm:grid-cols-3">
                  {QUICK_PHASE_OPTIONS.map((option) => {
                    const active = appointment.jobPhase === option.value;
                    return (
                      <Button
                        key={option.value}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="native-touch-surface rounded-xl"
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
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="native-touch-surface rounded-xl"
                    onClick={openPriceDialog}
                    disabled={savingDeposit || recordingPayment || reversingPayment}
                  >
                    Edit total
                  </Button>
                  {!isInternalAppointment ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="native-touch-surface rounded-xl"
                      onClick={openDepositDialog}
                      disabled={savingDeposit || recordingPayment || reversingPayment}
                    >
                      {Number(appointment.depositAmount ?? 0) > 0 ? "Edit deposit" : "Set deposit"}
                    </Button>
                  ) : null}
                  {effectiveCollectionAmount > 0.009 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="native-touch-surface rounded-xl"
                      onClick={openPaymentDialog}
                      disabled={savingDeposit || recordingPayment || reversingPayment}
                    >
                      {recordingPayment ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                      Mark paid
                    </Button>
                  ) : null}
                  {paymentSummary.hasAnyPayment ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="native-touch-surface rounded-xl"
                      onClick={() => void handleReversePayment()}
                      disabled={savingDeposit || recordingPayment || reversingPayment}
                    >
                      {reversingPayment ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                      {paymentSummary.isPaidInFull ? "Reverse payment" : "Reverse deposit"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Timing</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="native-touch-surface rounded-xl"
                  onClick={openTimingDialog}
                  disabled={updatingPhase || updatingLifecycle || completingAppointment}
                >
                  Edit timing
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="native-touch-surface rounded-xl"
                  onClick={openDetailsDialog}
                  disabled={updatingPhase || updatingLifecycle || completingAppointment}
                >
                  Edit details
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Appointment actions</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {appointment.status !== "cancelled" && appointment.status !== "completed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="native-touch-surface rounded-xl"
                    onClick={() => void handleCancelAppointment()}
                    disabled={cancellingAppointment || deletingAppointment}
                  >
                    {cancellingAppointment ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Cancel appointment
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="native-touch-surface rounded-xl border-red-300 text-red-700 hover:bg-red-50 hover:text-red-700"
                  onClick={() => void handleDeleteAppointment()}
                  disabled={cancellingAppointment || deletingAppointment}
                >
                  {deletingAppointment ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  {isInternalAppointment ? "Delete block" : "Delete appointment"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {!compact ? (
        <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Services</p>
              <p className="text-xs text-muted-foreground">Manage booked line items from the board.</p>
            </div>
            <span className="rounded-full border border-border/70 bg-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {appointmentServices.length}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={selectedServiceId}
              onChange={(event) => setSelectedServiceId(event.target.value)}
              disabled={servicesFetching}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm sm:flex-1"
            >
              <option value="__none__">
                {servicesFetching ? "Loading services..." : "Add a service from your catalog"}
              </option>
              {availableServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name ?? "Service"}
                  {service.category ? ` - ${service.category}` : ""}
                  {service.price != null ? ` - ${formatCurrency(Number(service.price))}` : ""}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => void handleAddService()}
              disabled={addingService || selectedServiceId === "__none__"}
            >
              {addingService ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add
            </Button>
          </div>
          {appointmentServices.length > 0 ? (
            <div className="space-y-2">
              {appointmentServices.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/[0.12] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{item.service?.name ?? "Service"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[item.service?.category, item.quantity ? `Qty ${item.quantity}` : null, item.service?.durationMinutes ? `${item.service.durationMinutes} min` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(Number(item.unitPrice ?? 0))}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                      onClick={() => void handleRemoveService(item.id)}
                      disabled={removingService}
                    >
                      {removingService ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
              No services attached yet.
            </div>
          )}
        </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-background/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Services</p>
                <p className="text-sm font-semibold text-foreground">{appointmentServices.length} booked</p>
              </div>
              <Button asChild size="sm" variant="outline" className="rounded-xl">
                <Link to={`/appointments/${appointment.id}`}>Manage</Link>
              </Button>
            </div>
          </div>
        )}

        <div className={cn("gap-2", compact ? "grid grid-cols-1" : "flex flex-col")}>
          <Button asChild className="native-touch-surface w-full rounded-xl">
            <Link to={`/appointments/${appointment.id}`}>
              Open full details
              {!compact ? <ExternalLink className="ml-2 h-4 w-4" /> : null}
            </Link>
          </Button>
          {!compact ? (
            <Button asChild variant="outline" className="native-touch-surface w-full rounded-xl">
              <Link to={`/appointments/${appointment.id}`}>
                Manage timing and payment
              </Link>
            </Button>
          ) : null}
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

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit total price</DialogTitle>
            <DialogDescription>
              Update the appointment total without leaving the scheduling surface.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="inspector-total-price">Total price</Label>
            <Input
              id="inspector-total-price"
              inputMode="decimal"
              value={priceDraft}
              onChange={(event) => setPriceDraft(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0.00"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceDialogOpen(false)} disabled={savingDeposit}>
              Cancel
            </Button>
            <Button onClick={() => void handleSavePrice()} disabled={savingDeposit}>
              {savingDeposit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save total
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
            <DialogTitle>Edit job details</DialogTitle>
            <DialogDescription>
              Update client, vehicle, assignment, and notes without leaving the board.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inspector-client">Client</Label>
                <select
                  id="inspector-client"
                  value={clientIdDraft}
                  onChange={(event) => {
                    const nextClientId = event.target.value;
                    setClientIdDraft(nextClientId);
                    setVehicleIdDraft("none");
                  }}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="internal">Internal / no client</option>
                  <option value="loading" disabled>
                    {clientOptionsFetching ? "Loading clients..." : "Select client"}
                  </option>
                  {clientOptions.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inspector-vehicle">Vehicle</Label>
                <select
                  id="inspector-vehicle"
                  value={vehicleIdDraft}
                  onChange={(event) => setVehicleIdDraft(event.target.value)}
                  disabled={!selectedClientId || vehicleOptionsFetching}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="none">
                    {!selectedClientId
                      ? "Internal / no vehicle"
                      : vehicleOptionsFetching
                        ? "Loading vehicles..."
                        : "Select vehicle"}
                  </option>
                  {vehicleOptions.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.label}
                    </option>
                  ))}
                </select>
                {selectedClientId && !vehicleOptionsFetching && vehicleOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">This client has no vehicles on file yet.</p>
                ) : null}
              </div>
            </div>
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
            <DialogTitle>Mark paid</DialogTitle>
            <DialogDescription>Record the payment collected for this appointment.</DialogDescription>
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
                Amount due now: {formatCurrency(effectiveCollectionAmount)}
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
              Mark paid
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
      <p className="mt-1 line-clamp-2 break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function MoneyBreakdownRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-muted-foreground", strong && "font-semibold text-foreground")}>{label}</span>
      <span className={cn("text-right text-foreground", strong ? "font-semibold" : "font-medium")}>{value}</span>
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
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className={cn("mt-1 line-clamp-2 break-words text-sm text-foreground", strong && "font-semibold")}>{value}</p>
      </div>
    </div>
  );
}
