import { useState, useEffect, Fragment } from "react";
import { useParams, Link, useOutletContext, useSearchParams } from "react-router";
import { useFindOne, useFindFirst, useFindMany, useAction } from "../hooks/useApi";
import { api } from "../api";
import { toast } from "sonner";
import type { AuthOutletContext } from "./_app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getTransactionalEmailErrorMessage } from "../lib/transactionalEmail";
import { invoiceAllowsPayment, validatePaymentAmount } from "@/lib/validation";
import { usePageContext } from "../components/shared/CommandPaletteContext";
import { ContextualNextStep } from "../components/shared/ContextualNextStep";
import { RelatedRecordsPanel, type RelatedRecord } from "../components/shared/RelatedRecordsPanel";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EntityCollaborationCard } from "../components/shared/EntityCollaborationCard";
import { ChecklistCard } from "../components/shared/ChecklistCard";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { CommunicationCard } from "../components/shared/CommunicationCard";
import { getIntakePreset } from "../lib/intakePresets";
import {
  ClientCard,
  VehicleCard,
  InvoiceCard,
  FinancialSummaryCard,
} from "../components/AppointmentDetailCards";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  MapPin,
  Clock,
  DollarSign,
  CheckCircle,
  Edit2,
  Check,
  X,
  FileText,
  User,
  AlertTriangle,
  Plus,
  Trash2,
  RotateCcw,
  MoreHorizontal,
} from "lucide-react";

const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no-show",
] as const;

const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["confirmed", "cancelled", "no-show"],
  confirmed: ["in_progress", "cancelled", "no-show"],
  in_progress: ["confirmed", "completed", "cancelled"],
  completed: [],
  cancelled: [],
  "no-show": [],
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  "no-show": "No Show",
};

const JOB_PHASE_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  active_work: "Active work",
  waiting: "Waiting",
  curing: "Curing",
  hold: "Hold",
  pickup_ready: "Pickup ready",
};

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toTimeInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}

function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function safeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatFreshness(value: string | Date | null | undefined, label: string): string | null {
  const parsed = safeDate(value);
  return parsed ? `${label} ${parsed.toLocaleDateString()}` : null;
}

function isOlderThanDays(value: string | Date | null | undefined, days: number): boolean {
  const parsed = safeDate(value);
  if (!parsed) return false;
  return Date.now() - parsed.getTime() >= days * 24 * 60 * 60 * 1000;
}

function JobLifecycleStepper({
  status,
  invoicedAt,
  paidAt,
}: {
  status: string;
  invoicedAt: Date | null;
  paidAt: Date | null;
}) {
  const stages = [
    { key: "scheduled", label: "Scheduled" },
    { key: "confirmed", label: "Confirmed" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
    { key: "invoiced", label: "Invoiced" },
    { key: "paid", label: "Paid" },
  ];

  if (status === "cancelled" || status === "no-show") {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 py-2.5 rounded-md border text-sm font-medium",
          status === "cancelled"
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-amber-50 border-amber-200 text-amber-800"
        )}
      >
        <X className="h-4 w-4 shrink-0" />
        <span className="capitalize">{status}</span>
        <span className="font-normal text-xs">
          {status === "cancelled"
            ? "— This appointment was cancelled."
            : "— Client did not show up."}
        </span>
      </div>
    );
  }

  let currentStageIndex: number;
  if (status === "scheduled") {
    currentStageIndex = 0;
  } else if (status === "confirmed") {
    currentStageIndex = 1;
  } else if (status === "in_progress") {
    currentStageIndex = 2;
  } else if (status === "completed") {
    if (paidAt) {
      currentStageIndex = 5;
    } else if (invoicedAt) {
      currentStageIndex = 4;
    } else {
      currentStageIndex = 3;
    }
  } else {
    currentStageIndex = 0;
  }

  return (
    <div className="bg-card border rounded-lg px-4 py-3">
      {/* Desktop stepper */}
      <div className="hidden sm:flex items-center w-full">
        {stages.map((stage, i) => (
          <Fragment key={stage.key}>
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center border-2 transition-colors",
                  i < currentStageIndex
                    ? "bg-primary border-primary text-primary-foreground"
                    : i === currentStageIndex
                    ? "border-primary text-primary bg-background ring-2 ring-primary/20"
                    : "border-muted-foreground/30 text-muted-foreground bg-background"
                )}
              >
                {i < currentStageIndex ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span className="text-xs font-bold">{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "mt-1 text-xs whitespace-nowrap",
                  i <= currentStageIndex ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 mb-4 transition-colors",
                  i < currentStageIndex ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            )}
          </Fragment>
        ))}
      </div>

      {/* Mobile: show current stage only */}
      <div className="sm:hidden flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
            <span className="text-xs text-primary-foreground font-bold">
              {currentStageIndex + 1}
            </span>
          </div>
          <span className="text-sm font-medium">{stages[currentStageIndex]?.label}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          Step {currentStageIndex + 1} of {stages.length}
        </span>
      </div>
    </div>
  );
}

function WorkflowWarningCard({
  title,
  detail,
  href,
  actionLabel,
}: {
  title: string;
  detail: string;
  href: string | null;
  actionLabel: string;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
      </div>
      {href ? (
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link to={href}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function FormSelect({
  className,
  value,
  onChange,
  children,
  ...props
}: Omit<JSX.IntrinsicElements["select"], "onChange"> & {
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <select
        className={cn(
          "border-input/90 h-10 w-full appearance-none rounded-xl border bg-background/85 px-3.5 py-2 pr-10 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user, businessType, permissions, currentLocationId } = useOutletContext<AuthOutletContext>();
  const canEditCollaboration = permissions.has("appointments.write");
  const { setPageContext } = usePageContext();
  const intakePreset = getIntakePreset(businessType);
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/appointments";
  const hasQueueReturn = searchParams.has("from");
  const withReturn = (pathname: string) =>
    `${pathname}${pathname.includes("?") ? "&" : "?"}from=${encodeURIComponent(returnTo)}`;

  const [isEditing, setIsEditing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showCompleteWarningDialog, setShowCompleteWarningDialog] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [internalNotesValue, setInternalNotesValue] = useState("");


  const [showEditDialog, setShowEditDialog] = useState(false);
  const [recordDepositOpen, setRecordDepositOpen] = useState(false);
  const [reverseDepositOpen, setReverseDepositOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editJobStartDate, setEditJobStartDate] = useState("");
  const [editJobStartTime, setEditJobStartTime] = useState("");
  const [editExpectedCompletionDate, setEditExpectedCompletionDate] = useState("");
  const [editExpectedCompletionTime, setEditExpectedCompletionTime] = useState("");
  const [editPickupReadyDate, setEditPickupReadyDate] = useState("");
  const [editPickupReadyTime, setEditPickupReadyTime] = useState("");
  const [editVehicleOnSite, setEditVehicleOnSite] = useState(false);
  const [editJobPhase, setEditJobPhase] = useState("scheduled");
  const [editStaffId, setEditStaffId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editInternalNotes, setEditInternalNotes] = useState("");
  const [editVehicleId, setEditVehicleId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("__none__");
  const [depositPaymentAmount, setDepositPaymentAmount] = useState("");
  const [depositPaymentMethod, setDepositPaymentMethod] = useState("cash");
  const [depositPaymentDate, setDepositPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [depositPaymentNotes, setDepositPaymentNotes] = useState("");
  const [showMobileAppointmentInfo, setShowMobileAppointmentInfo] = useState(false);
  const [showMobileServices, setShowMobileServices] = useState(false);
  const [showMobileNotes, setShowMobileNotes] = useState(false);
  const [showMobileWorkflowTools, setShowMobileWorkflowTools] = useState(false);
  const [editServiceIds, setEditServiceIds] = useState<string[]>([]);

  const [{ data: appointment, fetching, error }, refetchAppointment] = useFindOne(
    api.appointment,
    id!,
    {
      live: true,
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        jobStartTime: true,
        expectedCompletionTime: true,
        pickupReadyTime: true,
        vehicleOnSite: true,
        jobPhase: true,
        status: true,
        notes: true,
        internalNotes: true,
        isMobile: true,
        mobileAddress: true,
        totalPrice: true,
        depositAmount: true,
        depositPaid: true,
        completedAt: true,
        cancelledAt: true,
        reminderSent: true,
        reviewRequestSent: true,
        technicianNotes: true,
        rescheduleCount: true,
        invoicedAt: true,
        paidAt: true,
        client: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
        vehicle: {
          id: true,
          year: true,
          make: true,
          model: true,
          color: true,
          licensePlate: true,
        },
        assignedStaff: {
          id: true,
          firstName: true,
          lastName: true,
        },
        business: {
          id: true,
        },
      },
    }
  );

  const [{ data: appointmentServices }] = useFindMany(api.appointmentService, {
    filter: { appointmentId: { equals: id } },
    first: 50,
    live: true,
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
  });

  const [{ data: invoice, fetching: invoiceFetching }] = useFindFirst(api.invoice, {
    live: true,
    filter: { appointmentId: { equals: id } },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      total: true,
      lastSentAt: true,
      lastPaidAt: true,
    },
  });
  const [{ data: activityLogs, fetching: activityFetching }, refetchActivity] = useFindMany(api.activityLog, {
    entityType: "appointment",
    entityId: id,
    first: 8,
    pause: !id,
  } as any);

  const [{ data: quote, fetching: quoteFetching }] = useFindFirst(api.quote, {
    live: true,
    filter: { appointmentId: { equals: id } },
    select: {
      id: true,
      status: true,
      total: true,
      sentAt: true,
      followUpSentAt: true,
    },
  });

  const [{ data: staffForEdit }] = useFindMany(api.staff, {
    filter: { businessId: { equals: appointment?.business?.id } },
    select: { id: true, firstName: true, lastName: true },
    first: 50,
    pause: !appointment?.business?.id,
  } as any);
  const [{ data: serviceCatalog, fetching: servicesFetching }] = useFindMany(api.service, {
    first: 200,
    sort: { createdAt: "Descending" },
    pause: !appointment?.business?.id,
  } as any);

  const [{ fetching: updatingStatus }, runUpdateStatus] = useAction(api.appointment.updateStatus);
  const [{ fetching: sendingConfirmation }, runSendConfirmation] = useAction(api.appointment.sendConfirmation);
  const [{ fetching: completing }, runComplete] = useAction(api.appointment.complete);
  const [{ fetching: cancelling }, runCancel] = useAction(api.appointment.cancel);
  const [{ fetching: updatingNotes }, runUpdate] = useAction(api.appointment.update);
  const [{ fetching: recordingDeposit }, runRecordDepositPayment] = useAction(api.appointment.recordDepositPayment);
  const [{ fetching: reversingDeposit }, runReverseDepositPayment] = useAction(api.appointment.reverseDepositPayment);
  const [{ fetching: addingService }, runAddAppointmentService] = useAction(api.appointmentService.create);
  const [{ fetching: removingService }, runRemoveAppointmentService] = useAction(
    (params: Record<string, unknown>) => api.appointmentService.delete(params)
  );
  const [{ fetching: completingService }, runCompleteService] = useAction(api.appointmentService.complete);
  const [{ fetching: reopeningService }, runReopenService] = useAction(api.appointmentService.reopen);

  useEffect(() => {
    if (appointment) {
      setNotesValue(appointment.notes ?? "");
      setInternalNotesValue(appointment.internalNotes ?? "");
    }
  }, [appointment]);

  useEffect(() => {
    if (!appointment) return;
    const label =
      appointment.title ||
      (appointment.client
        ? `${appointment.client.firstName} ${appointment.client.lastName}`
        : "Appointment");
    setPageContext({
      entityType: "appointment",
      entityId: appointment.id,
      entityLabel: label,
      clientId: appointment.client?.id ?? null,
      clientName: appointment.client
        ? `${appointment.client.firstName} ${appointment.client.lastName}`
        : null,
      vehicleId: appointment.vehicle?.id ?? null,
      vehicleLabel: appointment.vehicle
        ? `${appointment.vehicle.year ?? ""} ${appointment.vehicle.make} ${appointment.vehicle.model}`.trim()
        : null,
      appointmentId: appointment.id,
      invoiceId: invoice?.id ?? null,
    });
    return () => {
      setPageContext({
        entityType: null,
        entityId: null,
        entityLabel: null,
        clientId: null,
        clientName: null,
        vehicleId: null,
        vehicleLabel: null,
        appointmentId: null,
        invoiceId: null,
      });
    };
  }, [appointment, invoice]);

  const existingServiceIds = new Set(
    ((appointmentServices ?? []) as Array<{ serviceId?: string | null }>).map((service) => service.serviceId).filter(Boolean)
  );
  const availableServices = ((serviceCatalog ?? []) as Array<{
    id: string;
    name?: string | null;
    category?: string | null;
    price?: number | string | null;
  }>).filter((service) => service.id && !existingServiceIds.has(service.id));
  const completedServiceIds = new Map(
    (((activityLogs ?? []) as Array<{ type?: string | null; metadata?: string | null }>).reduce(
      (acc, record) => {
        let appointmentServiceId: string | null = null;
        try {
          const parsed = record.metadata ? (JSON.parse(record.metadata) as { appointmentServiceId?: string }) : null;
          appointmentServiceId = parsed?.appointmentServiceId ?? null;
        } catch {
          appointmentServiceId = null;
        }
        if (!appointmentServiceId || acc.has(appointmentServiceId)) return acc;
        if (record.type === "job.service_completed") acc.set(appointmentServiceId, true);
        if (record.type === "job.service_reopened") acc.set(appointmentServiceId, false);
        return acc;
      },
      new Map<string, boolean>()
    ) as Map<string, boolean>).entries()
  );

  const notifyConfirmationResult = (
    deliveryStatus?: string | null,
    deliveryError?: string | null,
    successLabel = "Appointment confirmed"
  ) => {
    if (deliveryStatus === "emailed") {
      toast.success(`${successLabel} and email sent`);
      return;
    }
    if (deliveryStatus === "missing_email") {
      toast.warning(`${successLabel}, but the client has no email address.`);
      return;
    }
    if (deliveryStatus === "smtp_disabled") {
      toast.warning(`${successLabel}, but transactional email is not configured.`);
      return;
    }
    if (deliveryStatus === "email_failed") {
      toast.warning(`${successLabel}, but confirmation email failed${deliveryError ? `: ${deliveryError}` : "."}`);
      return;
    }
    toast.success(successLabel);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!appointment) return;
    const result = await runUpdateStatus({ id: appointment.id, status: newStatus });
    if (result.error) {
      toast.error(`Failed to update status: ${result.error.message}`);
    } else {
      const payload = result.data as { deliveryStatus?: string | null; deliveryError?: string | null } | null;
      if (newStatus === "confirmed") {
        notifyConfirmationResult(payload?.deliveryStatus ?? null, payload?.deliveryError ?? null);
      } else {
        toast.success(`Status updated to ${STATUS_LABELS[newStatus] ?? newStatus}`);
      }
      void refetchAppointment();
      void refetchActivity();
    }
  };

  const handleSendConfirmation = async (payload?: {
    message?: string;
    recipientEmail?: string;
    recipientName?: string;
  }) => {
    if (!appointment) return;
    const result = await runSendConfirmation({ id: appointment.id, ...payload });
    if (result.error) {
      toast.error(getTransactionalEmailErrorMessage(result.error, "Appointment confirmation"));
      return;
    }
    const deliveryResult = result.data as { deliveryStatus?: string | null; deliveryError?: string | null } | null;
    notifyConfirmationResult(
      deliveryResult?.deliveryStatus ?? null,
      deliveryResult?.deliveryError ?? null,
      "Confirmation sent"
    );
    void refetchActivity();
  };

  const handleComplete = async () => {
    if (!appointment) return;
    const result = await runComplete({ id: appointment.id });
    if (result.error) {
      toast.error(`Failed to complete appointment: ${result.error.message}`);
    } else {
      toast.success("Appointment marked as complete");
      void refetchAppointment();
      void refetchActivity();
    }
  };

  const handleCancel = async () => {
    if (!appointment) return;
    const result = await runCancel({ id: appointment.id });
    if (result.error) {
      toast.error(`Failed to cancel appointment: ${result.error.message}`);
    } else {
      toast.success("Appointment cancelled");
      setShowCancelDialog(false);
      void refetchAppointment();
      void refetchActivity();
    }
  };

  const handleSaveNotes = async () => {
    if (!appointment) return;
    const result = await runUpdate({
      id: appointment.id,
      notes: notesValue,
      internalNotes: internalNotesValue,
    });
    if (result.error) {
      toast.error("Failed to save notes: " + result.error.message);
      return;
    }
    setIsEditing(false);
    void refetchAppointment();
  };

  const handleCancelEdit = () => {
    if (appointment) {
      setNotesValue(appointment.notes ?? "");
      setInternalNotesValue(appointment.internalNotes ?? "");
    }
    setIsEditing(false);
  };

  const applyNotesTemplate = (target: "client" | "internal") => {
    if (target === "client") {
      setNotesValue(intakePreset.clientNotes);
    } else {
      setInternalNotesValue(intakePreset.internalNotes);
    }
    toast.success(`${intakePreset.label} applied`);
  };

  const handleOpenEditDialog = () => {
    if (appointment) {
      setEditTitle(appointment.title ?? "");
      setEditDate(toDateInputValue(appointment.startTime));
      setEditStartTime(toTimeInputValue(appointment.startTime));
      setEditEndTime(toTimeInputValue(appointment.endTime));
      setEditJobStartDate(toDateInputValue((appointment as any).jobStartTime ?? appointment.startTime));
      setEditJobStartTime(toTimeInputValue((appointment as any).jobStartTime ?? appointment.startTime));
      setEditExpectedCompletionDate(toDateInputValue((appointment as any).expectedCompletionTime));
      setEditExpectedCompletionTime(toTimeInputValue((appointment as any).expectedCompletionTime));
      setEditPickupReadyDate(toDateInputValue((appointment as any).pickupReadyTime));
      setEditPickupReadyTime(toTimeInputValue((appointment as any).pickupReadyTime));
      setEditVehicleOnSite(Boolean((appointment as any).vehicleOnSite));
      setEditJobPhase(String((appointment as any).jobPhase ?? "scheduled"));
      setEditStaffId(appointment.assignedStaff?.id ?? "");
      setEditNotes(appointment.notes ?? "");
      setEditInternalNotes(appointment.internalNotes ?? "");
    }
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!appointment) return;
    const startTime =
      editDate && editStartTime ? new Date(`${editDate}T${editStartTime}`) : undefined;
    const endTime =
      editDate && editEndTime ? new Date(`${editDate}T${editEndTime}`) : undefined;
    const jobStartDateTime =
      editVehicleOnSite && editJobStartDate && editJobStartTime
        ? new Date(`${editJobStartDate}T${editJobStartTime}`)
        : undefined;
    const expectedCompletionDateTime =
      editVehicleOnSite && editExpectedCompletionDate && editExpectedCompletionTime
        ? new Date(`${editExpectedCompletionDate}T${editExpectedCompletionTime}`)
        : null;
    const pickupReadyDateTime =
      editPickupReadyDate && editPickupReadyTime ? new Date(`${editPickupReadyDate}T${editPickupReadyTime}`) : null;

      const result = await runUpdate({
        id: appointment.id,
        title: editTitle || null,
        startTime,
        endTime,
        jobStartTime: editVehicleOnSite ? jobStartDateTime : null,
        expectedCompletionTime: editVehicleOnSite ? expectedCompletionDateTime : null,
        pickupReadyTime: pickupReadyDateTime,
        vehicleOnSite: editVehicleOnSite,
        jobPhase: editVehicleOnSite ? editJobPhase : "scheduled",
        assignedStaffId: editStaffId || undefined,
        notes: editNotes,
        internalNotes: editInternalNotes,
      });

    if (result.error) {
      toast.error(`Failed to update appointment: ${result.error.message}`);
    } else {
      toast.success("Appointment updated");
      setShowEditDialog(false);
      void refetchAppointment();
    }
  };

  const handleAddService = async () => {
    if (!appointment?.id || selectedServiceId === "__none__") return;
    const result = await runAddAppointmentService({
      appointmentId: appointment.id,
      serviceId: selectedServiceId,
    });
    if (result.error) {
      toast.error(`Failed to add service: ${result.error.message}`);
      return;
    }
    toast.success("Service added to appointment");
    setSelectedServiceId("__none__");
    void refetchAppointment();
  };

  const handleRemoveService = async (appointmentServiceId: string) => {
    const result = await runRemoveAppointmentService({ id: appointmentServiceId });
    if (result.error) {
      toast.error(`Failed to remove service: ${result.error.message}`);
      return;
    }
    toast.success("Service removed from appointment");
    void refetchAppointment();
  };

  const handleCompleteService = async (appointmentServiceId: string) => {
    const result = await runCompleteService({ id: appointmentServiceId });
    if ((result as any)?.error) {
      toast.error(`Failed to complete service: ${(result as any).error.message}`);
      return;
    }
    toast.success("Service marked complete");
    void refetchAppointment();
  };

  const handleReopenService = async (appointmentServiceId: string) => {
    const result = await runReopenService({ id: appointmentServiceId });
    if ((result as any)?.error) {
      toast.error(`Failed to reopen service: ${(result as any).error.message}`);
      return;
    }
    toast.success("Service reopened");
    void refetchAppointment();
  };

  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Invalid appointment ID.</p>
        <Button variant="outline" asChild>
          <Link to={returnTo}>Back to Appointments</Link>
        </Button>
      </div>
    );
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-destructive text-lg font-medium">
          {error ? `Error: ${error.message}` : "Appointment not found"}
        </p>
        <Button variant="outline" asChild>
          <Link to={returnTo}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Appointments
          </Link>
        </Button>
      </div>
    );
  }

  const pageTitle =
    appointment.title ||
    (appointment.client
      ? `${appointment.client.firstName} ${appointment.client.lastName}`
      : "Appointment");

  const isActionLoading = updatingStatus || completing || cancelling || sendingConfirmation;
  const quoteNeedsFollowUp = !!quote && ["sent", "accepted"].includes(String((quote as any).status ?? "")) && (
    !safeDate((quote as any).followUpSentAt ?? null)
      ? isOlderThanDays((quote as any).sentAt ?? null, 2)
      : isOlderThanDays((quote as any).followUpSentAt ?? null, 5)
  );
  const invoiceNeedsFollowUp =
    !!invoice &&
    ["sent", "partial"].includes(String((invoice as any).status ?? "")) &&
    !safeDate((invoice as any).lastPaidAt ?? null) &&
    isOlderThanDays((invoice as any).lastSentAt ?? null, 3);
  const appointmentClientName = appointment.client
    ? `${appointment.client.firstName} ${appointment.client.lastName}`
    : "Walk-in client";
  const appointmentVehicleLabel = appointment.vehicle
    ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
    : "No vehicle attached";
  const appointmentLocationLabel = appointment.isMobile
    ? appointment.mobileAddress || "Mobile service"
    : "In-shop service";
  const appointmentValueLabel =
    appointment.totalPrice != null && appointment.totalPrice > 0
      ? formatCurrency(appointment.totalPrice)
      : appointmentServices && appointmentServices.length > 0
        ? `${appointmentServices.length} booked service${appointmentServices.length === 1 ? "" : "s"}`
        : "No pricing attached yet";

  const relatedRecords: RelatedRecord[] = [];
  if (appointment) {
    if (appointment.client) {
      relatedRecords.push({
        type: "client",
        id: appointment.client.id,
        label: `${appointment.client.firstName} ${appointment.client.lastName}`,
        href: withReturn(`/clients/${appointment.client.id}`),
      });
    }
    if (appointment.vehicle) {
      relatedRecords.push({
        type: "vehicle",
        id: appointment.vehicle.id,
        label: `${appointment.vehicle.year ?? ""} ${appointment.vehicle.make} ${appointment.vehicle.model}`.trim(),
        href: withReturn(`/clients/${appointment.client?.id ?? ""}`),
      });
    }
    if (invoice) {
      relatedRecords.push({
        type: "invoice",
        id: invoice.id,
        label: invoice.invoiceNumber ?? "Invoice",
        sublabel:
          [
            formatFreshness((invoice as any).lastSentAt ?? null, "Sent"),
            formatFreshness((invoice as any).lastPaidAt ?? null, "Paid"),
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        status: invoice.status,
        href: withReturn(`/invoices/${invoice.id}`),
      });
    }
    if (quote) {
      relatedRecords.push({
        type: "quote",
        id: quote.id,
        label: "Quote",
        sublabel:
          [
            quote.total != null ? formatCurrency(Number(quote.total)) : null,
            formatFreshness((quote as any).sentAt ?? null, "Sent"),
            formatFreshness((quote as any).followUpSentAt ?? null, "Followed up"),
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        status: quote.status,
        href: withReturn(`/quotes/${quote.id}`),
      });
    }
  }

  const handleOpenDepositDialog = () => {
    const depositAmount = Number(appointment.depositAmount ?? 0);
    setDepositPaymentAmount(depositAmount > 0 ? depositAmount.toFixed(2) : "0.00");
    setDepositPaymentMethod("cash");
    setDepositPaymentDate(new Date().toISOString().split("T")[0]);
    setDepositPaymentNotes("");
    setRecordDepositOpen(true);
  };

  const handleRecordDepositPayment = async () => {
    if (!appointment?.id) return;
    const depositAmount = Number(appointment.depositAmount ?? 0);
    const amount = parseFloat(depositPaymentAmount);
    const validation = validatePaymentAmount(amount, depositAmount);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    if (Math.abs(amount - depositAmount) > 0.009) {
      toast.error(`Deposit payment must match the required deposit of ${formatCurrency(depositAmount)}.`);
      return;
    }
    const [py, pm, pd] = depositPaymentDate.split("-").map(Number);
    const paidAtDate = new Date(py, pm - 1, pd);
    const result = await runRecordDepositPayment({
      id: appointment.id,
      amount,
      method: depositPaymentMethod,
      paidAt: paidAtDate.toISOString(),
      notes: depositPaymentNotes || undefined,
    });
    if (!result.error) {
      toast.success("Deposit recorded");
      setRecordDepositOpen(false);
      void refetchAppointment();
      void refetchActivity();
    } else {
      toast.error("Failed to record deposit: " + result.error.message);
    }
  };

  const handleReverseDepositPayment = async () => {
    if (!appointment?.id) return;
    const result = await runReverseDepositPayment({ id: appointment.id });
    if (!result.error) {
      toast.success("Deposit payment reversed");
      setReverseDepositOpen(false);
      void refetchAppointment();
      void refetchActivity();
    } else {
      toast.error("Failed to reverse deposit: " + result.error.message);
    }
  };

  const handleContextualAction = (action?: string) => {
    if (!action) return;
    if (action === "confirm") {
      void handleStatusChange("confirmed");
    } else if (action === "start-job") {
      void handleStatusChange("in_progress");
    } else if (action === "complete") {
      const hasServices = appointmentServices && appointmentServices.length > 0;
      const hasTotalPrice = appointment?.totalPrice != null && appointment.totalPrice > 0;
      if (!hasServices && !hasTotalPrice) {
        setShowCompleteWarningDialog(true);
      } else {
        void handleComplete();
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to appointments queue" /> : null}
      <section className="overflow-hidden rounded-[30px] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.10),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.14),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-5 shadow-[0_22px_55px_rgba(15,23,42,0.08)]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
                Appointment record
              </Badge>
              <StatusBadge status={appointment.status} type="appointment" />
              {appointment.rescheduleCount != null && appointment.rescheduleCount > 0 ? (
                <Badge className="rounded-full border-amber-200 bg-amber-100 text-amber-800 text-[11px] uppercase tracking-[0.16em]">
                  {appointment.rescheduleCount}x rescheduled
                </Badge>
              ) : null}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.5rem]">{pageTitle}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Run the appointment from one place. Client context, vehicle context, status, billing, and handoff
                decisions should all feel obvious here.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Booked for</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{appointmentClientName}</p>
                <p className="mt-1 text-sm text-slate-600">{appointmentVehicleLabel}</p>
              </div>
              <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Scheduled</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{formatDate(appointment.startTime)}</p>
                <p className="mt-1 text-sm text-slate-600">{formatTime(appointment.startTime)}</p>
              </div>
              <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Work in play</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{appointmentValueLabel}</p>
                <p className="mt-1 text-sm text-slate-600">{appointmentLocationLabel}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[26px] bg-slate-950 p-5 text-white shadow-[0_18px_50px_rgba(15,23,42,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-300">Immediate actions</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Keep the job moving</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 text-orange-300" />
                <span>{formatDateTime(appointment.startTime)}</span>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-orange-300" />
                <span>{appointmentLocationLabel}</span>
              </div>
              <div className="flex items-start gap-3">
                <DollarSign className="mt-0.5 h-4 w-4 text-orange-300" />
                <span>{appointmentValueLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" asChild>
            <Link to={returnTo}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-6 shrink-0" />
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h1 className="text-xl font-semibold text-foreground truncate">{pageTitle}</h1>
            <StatusBadge status={appointment.status} type="appointment" />
            {appointment.rescheduleCount != null && appointment.rescheduleCount > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                {appointment.rescheduleCount}x rescheduled
              </Badge>
            )}
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-2 sm:flex sm:flex-wrap">
          {/* Edit Appointment Button */}
          {appointment.status !== "completed" &&
            appointment.status !== "cancelled" &&
            appointment.status !== "no-show" && (
              <Button variant="outline" size="sm" onClick={handleOpenEditDialog}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}

          {/* Change Status Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isActionLoading}>
                {updatingStatus && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Change Status
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(VALID_TRANSITIONS[appointment.status] ?? []).length === 0 ? (
                <DropdownMenuItem disabled>No transitions available</DropdownMenuItem>
              ) : (
                (VALID_TRANSITIONS[appointment.status] ?? []).map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => void handleStatusChange(status)}
                    className="capitalize cursor-pointer"
                  >
                    {status}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {appointment.status !== "cancelled" && appointment.status !== "no-show" ? (
            <Button variant="outline" size="sm" onClick={() => void handleSendConfirmation()} disabled={isActionLoading}>
              {sendingConfirmation ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Send Confirmation
            </Button>
          ) : null}

          {appointment.status !== "completed" && appointment.status !== "cancelled" && appointment.status !== "no-show" && (
            <Button
              variant="outline"
              size="sm"
              className="border-green-500 text-green-700 hover:bg-green-50"
              onClick={() => {
                const hasServices = appointmentServices && appointmentServices.length > 0;
                const hasTotalPrice = appointment.totalPrice != null && appointment.totalPrice > 0;
                if (!hasServices && !hasTotalPrice) {
                  setShowCompleteWarningDialog(true);
                } else {
                  void handleComplete();
                }
              }}
              disabled={isActionLoading}
            >
              {completing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Mark Complete
            </Button>
          )}

          {appointment.status !== "cancelled" && appointment.status !== "completed" && appointment.status !== "no-show" && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-500 text-red-700 hover:bg-red-50"
              onClick={() => setShowCancelDialog(true)}
              disabled={isActionLoading}
            >
              {cancelling ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Cancel Job
            </Button>
          )}

          {!invoiceFetching && !invoice && appointment.status !== "cancelled" && (
            <Button variant="outline" size="sm" asChild>
              <Link
                to={`/invoices/new?appointmentId=${appointment.id}${
                  appointment.client?.id ? `&clientId=${appointment.client.id}` : ""
                }`}
              >
                <FileText className="h-4 w-4 mr-2" />
                Create Invoice
              </Link>
            </Button>
          )}

          {!quoteFetching && !quote && appointment.status !== "cancelled" && appointment.client?.id && (
            <Button variant="outline" size="sm" asChild>
              <Link
                to={`/quotes/new?appointmentId=${appointment.id}&clientId=${appointment.client.id}`}
              >
                <FileText className="h-4 w-4 mr-2" />
                Create Quote
              </Link>
            </Button>
          )}

            {invoice && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/invoices/${invoice.id}`}>
                  <FileText className="h-4 w-4 mr-2" />
                  View Invoice
                </Link>
              </Button>
            )}

            {invoice && invoiceAllowsPayment(invoice.status) && invoice.status !== "paid" && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/invoices/${invoice.id}?recordPayment=1`}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Record Payment
                </Link>
              </Button>
            )}

            {quote && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/quotes/${quote.id}`}>
                  <FileText className="h-4 w-4 mr-2" />
                  View Quote
                </Link>
              </Button>
            )}

            {appointment.depositAmount != null && appointment.depositAmount > 0 && !appointment.depositPaid && (
              <Button variant="outline" size="sm" onClick={handleOpenDepositDialog}>
                <DollarSign className="h-4 w-4 mr-2" />
                Record Deposit
              </Button>
            )}
          </div>

        <div className="flex items-center gap-2 sm:hidden">
          {appointment.status !== "completed" && appointment.status !== "cancelled" && appointment.status !== "no-show" ? (
            <Button
              className="flex-1"
              onClick={() => {
                const hasServices = appointmentServices && appointmentServices.length > 0;
                const hasTotalPrice = appointment.totalPrice != null && appointment.totalPrice > 0;
                if (!hasServices && !hasTotalPrice) {
                  setShowCompleteWarningDialog(true);
                } else {
                  void handleComplete();
                }
              }}
              disabled={isActionLoading}
            >
              {completing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Mark Complete
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More appointment actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {appointment.status !== "completed" &&
              appointment.status !== "cancelled" &&
              appointment.status !== "no-show" ? (
                <DropdownMenuItem onClick={handleOpenEditDialog}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit appointment
                </DropdownMenuItem>
              ) : null}
              {appointment.status !== "cancelled" && appointment.status !== "no-show" ? (
                <DropdownMenuItem onClick={() => void handleSendConfirmation()}>
                  <FileText className="mr-2 h-4 w-4" />
                  Send confirmation
                </DropdownMenuItem>
              ) : null}
              {!invoiceFetching && !invoice && appointment.status !== "cancelled" ? (
                <DropdownMenuItem asChild>
                  <Link
                    to={`/invoices/new?appointmentId=${appointment.id}${
                      appointment.client?.id ? `&clientId=${appointment.client.id}` : ""
                    }`}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Create invoice
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {!quoteFetching && !quote && appointment.status !== "cancelled" && appointment.client?.id ? (
                <DropdownMenuItem asChild>
                  <Link to={`/quotes/new?appointmentId=${appointment.id}&clientId=${appointment.client.id}`}>
                    <FileText className="mr-2 h-4 w-4" />
                    Create quote
                  </Link>
                </DropdownMenuItem>
              ) : null}
                {invoice ? (
                  <DropdownMenuItem asChild>
                    <Link to={`/invoices/${invoice.id}`}>
                      <FileText className="mr-2 h-4 w-4" />
                      View invoice
                  </Link>
                </DropdownMenuItem>
                ) : null}
                {invoice && invoiceAllowsPayment(invoice.status) && invoice.status !== "paid" ? (
                  <DropdownMenuItem asChild>
                    <Link to={`/invoices/${invoice.id}?recordPayment=1`}>
                      <DollarSign className="mr-2 h-4 w-4" />
                      Record payment
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {quote ? (
                  <DropdownMenuItem asChild>
                    <Link to={`/quotes/${quote.id}`}>
                      <FileText className="mr-2 h-4 w-4" />
                      View quote
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {appointment.depositAmount != null && appointment.depositAmount > 0 && !appointment.depositPaid ? (
                  <DropdownMenuItem onClick={handleOpenDepositDialog}>
                    <DollarSign className="mr-2 h-4 w-4" />
                    Record deposit
                  </DropdownMenuItem>
                ) : null}
                {appointment.depositPaid ? (
                  <DropdownMenuItem onClick={() => setReverseDepositOpen(true)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reverse deposit
                  </DropdownMenuItem>
                ) : null}
                {(VALID_TRANSITIONS[appointment.status] ?? []).map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => void handleStatusChange(status)}
                  className="capitalize"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark {status.replace("-", " ")}
                </DropdownMenuItem>
              ))}
              {appointment.status !== "cancelled" &&
              appointment.status !== "completed" &&
              appointment.status !== "no-show" ? (
                <DropdownMenuItem
                  className="text-red-700 focus:text-red-700"
                  onClick={() => setShowCancelDialog(true)}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel appointment
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!appointment.assignedStaff &&
        appointment.status !== "completed" &&
        appointment.status !== "cancelled" &&
        appointment.status !== "no-show" && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>No staff assigned — assign a technician before starting this job.</span>
          </div>
        )}

      <JobLifecycleStepper
        status={appointment.status}
        invoicedAt={(appointment as any).invoicedAt ?? null}
        paidAt={(appointment as any).paidAt ?? null}
      />

      {appointment && (
        <ContextualNextStep
          entityType="appointment"
          status={appointment.status}
          data={{
            id: appointment.id,
            clientId: appointment.client?.id,
            invoiceId: invoice?.id,
          }}
          onActionClick={handleContextualAction}
        />
      )}

      <RelatedRecordsPanel records={relatedRecords} loading={fetching} />

      {(quoteNeedsFollowUp || invoiceNeedsFollowUp) && (
        <div className="grid gap-3 md:grid-cols-2">
          {quoteNeedsFollowUp ? (
            <WorkflowWarningCard
              title="Quote follow-up is stale"
              detail="This appointment is linked to a quote that likely needs another touch."
              href={quote ? `/quotes/${quote.id}` : null}
              actionLabel="Open quote"
            />
          ) : null}
          {invoiceNeedsFollowUp ? (
            <WorkflowWarningCard
              title="Invoice collection is stale"
              detail="The linked invoice has not been paid and has not been sent recently."
              href={invoice ? `/invoices/${invoice.id}` : null}
              actionLabel="Open invoice"
            />
          ) : null}
        </div>
      )}

      <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Appointment Info Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Appointment Info</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="lg:hidden"
                      onClick={() => setShowMobileAppointmentInfo((value) => !value)}
                    >
                      {showMobileAppointmentInfo ? "Hide" : "Show"}
                      <ChevronDown className={showMobileAppointmentInfo ? "ml-1 h-4 w-4 rotate-180" : "ml-1 h-4 w-4"} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className={showMobileAppointmentInfo ? "space-y-4" : "hidden space-y-4 lg:block"}>
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{formatDate(appointment.startTime)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatTime(appointment.startTime)}
                        {appointment.endTime ? ` – ${formatTime(appointment.endTime)}` : ""}
                      </p>
                    </div>
                  </div>

                  {(appointment as any).vehicleOnSite ? (
                    <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Job lifecycle</p>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Span start</p>
                          <p className="text-sm font-medium">{formatDateTime((appointment as any).jobStartTime ?? appointment.startTime)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Expected completion</p>
                          <p className="text-sm font-medium">{formatDateTime((appointment as any).expectedCompletionTime)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Phase</p>
                          <p className="text-sm font-medium">{JOB_PHASE_LABELS[String((appointment as any).jobPhase ?? "scheduled")] ?? "Scheduled"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Pickup</p>
                          <p className="text-sm font-medium">
                            {(appointment as any).pickupReadyTime ? formatDateTime((appointment as any).pickupReadyTime) : "Not scheduled"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {appointment.isMobile && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <Badge variant="secondary">Mobile Service</Badge>
                        {appointment.mobileAddress && (
                          <p className="text-sm text-muted-foreground">
                            {appointment.mobileAddress}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {appointment.depositAmount != null && appointment.depositAmount > 0 && (
                    <div className="flex items-start gap-3">
                      <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">
                          Deposit: {formatCurrency(appointment.depositAmount)}
                        </p>
                        <p className="text-sm">
                          {appointment.depositPaid ? (
                            <span className="text-green-600 font-medium">Paid</span>
                          ) : (
                            <span className="text-amber-600 font-medium">Unpaid</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {appointment.completedAt && (
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Completed</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDateTime(appointment.completedAt)}
                        </p>
                      </div>
                    </div>
                  )}

                  {(appointment as any).cancelledAt && (
                    <div className="flex items-start gap-3">
                      <X className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Cancelled</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDateTime((appointment as any).cancelledAt)}
                        </p>
                      </div>
                    </div>
                  )}

                  {appointment.assignedStaff && (
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Assigned Staff</p>
                        <p className="text-sm text-muted-foreground">
                          {appointment.assignedStaff.firstName} {appointment.assignedStaff.lastName}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Services</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="lg:hidden"
                      onClick={() => setShowMobileServices((value) => !value)}
                    >
                      {showMobileServices ? "Hide" : "Show"}
                      <ChevronDown className={showMobileServices ? "ml-1 h-4 w-4 rotate-180" : "ml-1 h-4 w-4"} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className={showMobileServices ? "space-y-4" : "hidden space-y-4 lg:block"}>
                  <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
                    <FormSelect
                      className="sm:flex-1"
                      value={selectedServiceId}
                      onChange={setSelectedServiceId}
                      disabled={servicesFetching}
                      aria-label="Add a service from your catalog"
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
                    </FormSelect>
                    <Button onClick={() => void handleAddService()} disabled={addingService || selectedServiceId === "__none__"}>
                      {addingService ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Add service
                    </Button>
                  </div>

                  {(appointmentServices as any[])?.length ? (
                    <div className="space-y-3">
                      {((appointmentServices as any[]) ?? []).map((item: any) => {
                        const isCompleted = completedServiceIds.get(item.id) === true;
                        return (
                          <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className={isCompleted ? "font-medium line-through text-muted-foreground" : "font-medium"}>
                                  {item.service?.name ?? "Service"}
                                </p>
                                {isCompleted ? <StatusBadge status="completed" type="job" /> : null}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {item.service?.category ?? "General"} · Qty {item.quantity ?? 1}
                                {item.service?.durationMinutes ? ` · ${item.service.durationMinutes} min` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-medium text-foreground">
                                {formatCurrency(Number(item.unitPrice ?? 0))}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => void (isCompleted ? handleReopenService(item.id) : handleCompleteService(item.id))}
                                disabled={completingService || reopeningService}
                              >
                                {completingService || reopeningService ? (
                                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="mr-1 h-4 w-4" />
                                )}
                                {isCompleted ? "Reopen" : "Complete"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-muted-foreground hover:text-destructive"
                                onClick={() => void handleRemoveService(item.id)}
                                disabled={removingService}
                              >
                                {removingService ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No services attached yet.</p>
                  )}
                </CardContent>
              </Card>

              {/* Notes Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">Notes</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="lg:hidden"
                      onClick={() => setShowMobileNotes((value) => !value)}
                    >
                      {showMobileNotes ? "Hide" : "Show"}
                      <ChevronDown className={showMobileNotes ? "ml-1 h-4 w-4 rotate-180" : "ml-1 h-4 w-4"} />
                    </Button>
                  </div>
                  {!isEditing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowMobileNotes(true);
                        setIsEditing(true);
                      }}
                    >
                      <Edit2 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </CardHeader>
                <CardContent className={showMobileNotes || isEditing ? "" : "hidden lg:block"}>
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-muted-foreground">Client Notes</p>
                          <Button type="button" variant="ghost" size="sm" onClick={() => applyNotesTemplate("client")}>
                            Apply {intakePreset.label}
                          </Button>
                        </div>
                        <Textarea
                          value={notesValue}
                          onChange={(e) => setNotesValue(e.target.value)}
                          placeholder="Notes visible to the client..."
                          rows={3}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-muted-foreground">Internal Notes</p>
                          <Button type="button" variant="ghost" size="sm" onClick={() => applyNotesTemplate("internal")}>
                            Apply {intakePreset.label}
                          </Button>
                        </div>
                        <Textarea
                          value={internalNotesValue}
                          onChange={(e) => setInternalNotesValue(e.target.value)}
                          placeholder="Internal notes (not visible to client)..."
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void handleSaveNotes()}
                          disabled={updatingNotes}
                        >
                          {updatingNotes ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 mr-2" />
                          )}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          disabled={updatingNotes}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Client Notes
                        </p>
                        {appointment.notes ? (
                          <p className="text-sm">{appointment.notes}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No client notes</p>
                        )}
                      </div>
                      <Separator />
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Internal Notes
                        </p>
                        {appointment.internalNotes ? (
                          <p className="text-sm">{appointment.internalNotes}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No internal notes</p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Client Card */}
              <ClientCard client={appointment.client} />

              {/* Vehicle Card */}
              <VehicleCard vehicle={appointment.vehicle} clientId={appointment.client?.id} />

              {/* Invoice Card */}
              <InvoiceCard invoice={invoice} invoiceFetching={invoiceFetching} appointmentId={appointment.id} />

              {/* Financial Summary Card */}
              <FinancialSummaryCard 
                totalPrice={appointment.totalPrice}
                depositAmount={appointment.depositAmount}
                depositPaid={appointment.depositPaid}
                depositActionLabel={
                  appointment.depositAmount != null && appointment.depositAmount > 0
                    ? appointment.depositPaid
                      ? "Deposit recorded"
                      : "Record deposit"
                    : null
                }
                onDepositAction={
                  appointment.depositAmount != null && appointment.depositAmount > 0 && !appointment.depositPaid
                    ? handleOpenDepositDialog
                    : null
                }
                depositActionDisabled={
                  recordingDeposit ||
                  appointment.depositAmount == null ||
                  appointment.depositAmount <= 0 ||
                  appointment.depositPaid === true
                }
                secondaryDepositActionLabel={appointment.depositPaid ? "Reverse deposit" : null}
                onSecondaryDepositAction={appointment.depositPaid ? () => setReverseDepositOpen(true) : null}
                secondaryDepositActionDisabled={reversingDeposit}
              />

              <CommunicationCard
                title="Client communication"
                recipientName={
                  appointment.client
                    ? `${appointment.client.firstName} ${appointment.client.lastName}`
                    : null
                }
                recipient={appointment.client?.email}
                primaryLabel="Send confirmation"
                activities={((activityLogs ?? []) as any[]).filter(
                  (record) =>
                    record.type === "appointment.confirmation_sent" ||
                    record.type === "appointment.confirmation_failed"
                )}
                sending={sendingConfirmation}
                canSend={permissions.has("appointments.write")}
                onPrimarySend={handleSendConfirmation}
              />

              <Card className="lg:hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Workflow Tools</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMobileWorkflowTools((value) => !value)}
                    >
                      {showMobileWorkflowTools ? "Hide" : "Show"}
                      <ChevronDown className={showMobileWorkflowTools ? "ml-1 h-4 w-4 rotate-180" : "ml-1 h-4 w-4"} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className={showMobileWorkflowTools ? "space-y-4" : "hidden"}>
                  <ChecklistCard
                    entityType="appointment"
                    entityId={appointment.id}
                    businessType={businessType}
                    records={(activityLogs as any[]) ?? []}
                    canWrite={canEditCollaboration}
                    onChanged={() => {
                      void refetchActivity();
                    }}
                  />
                  <EntityCollaborationCard
                    entityType="appointment"
                    entityId={appointment.id}
                    records={(activityLogs as any[]) ?? []}
                    fetching={activityFetching}
                    canWrite={canEditCollaboration}
                    onCreated={() => {
                      void refetchActivity();
                    }}
                  />
                </CardContent>
              </Card>

              <div className="hidden lg:block lg:space-y-4">
                <ChecklistCard
                  entityType="appointment"
                  entityId={appointment.id}
                  businessType={businessType}
                  records={(activityLogs as any[]) ?? []}
                  canWrite={canEditCollaboration}
                  onChanged={() => {
                    void refetchActivity();
                  }}
                />

                <EntityCollaborationCard
                  entityType="appointment"
                  entityId={appointment.id}
                  records={(activityLogs as any[]) ?? []}
                  fetching={activityFetching}
                  canWrite={canEditCollaboration}
                  onCreated={() => {
                    void refetchActivity();
                  }}
                />
              </div>

            </div>
          </div>
      </div>

      <Dialog open={recordDepositOpen} onOpenChange={setRecordDepositOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Deposit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="deposit-payment-amount">Amount</Label>
              <Input
                id="deposit-payment-amount"
                type="number"
                step="0.01"
                min="0"
                value={depositPaymentAmount}
                onChange={(e) => setDepositPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Deposit due: {formatCurrency(Number(appointment.depositAmount ?? 0))}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deposit-payment-method">Method</Label>
              <FormSelect id="deposit-payment-method" value={depositPaymentMethod} onChange={setDepositPaymentMethod}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="check">Check</option>
                <option value="venmo">Venmo</option>
                <option value="cashapp">CashApp</option>
                <option value="zelle">Zelle</option>
                <option value="other">Other</option>
              </FormSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deposit-payment-date">Paid On</Label>
              <Input
                id="deposit-payment-date"
                type="date"
                value={depositPaymentDate}
                onChange={(e) => setDepositPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deposit-payment-notes">Notes</Label>
              <Textarea
                id="deposit-payment-notes"
                value={depositPaymentNotes}
                onChange={(e) => setDepositPaymentNotes(e.target.value)}
                placeholder="Optional note for the deposit record"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDepositOpen(false)} disabled={recordingDeposit}>
              Cancel
            </Button>
            <Button onClick={() => void handleRecordDepositPayment()} disabled={recordingDeposit}>
              {recordingDeposit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Record Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={reverseDepositOpen} onOpenChange={setReverseDepositOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse deposit payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the appointment deposit as unpaid again. Use this if the manual deposit record was entered by mistake.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversingDeposit}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleReverseDepositPayment()} disabled={reversingDeposit}>
              {reversingDeposit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reverse Deposit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Appointment Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title (optional)</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Appointment title..."
              />
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>

            {/* Start Time / End Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-start-time">Start Time</Label>
                <Input
                  id="edit-start-time"
                  type="time"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end-time">End Time</Label>
                <Input
                  id="edit-end-time"
                  type="time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="edit-vehicle-on-site"
                  checked={editVehicleOnSite}
                  onCheckedChange={(checked) => setEditVehicleOnSite(Boolean(checked))}
                />
                <div>
                  <Label htmlFor="edit-vehicle-on-site">Multi-day / on-site job</Label>
                  <p className="text-xs text-muted-foreground">
                    Keep vehicle presence visible without blocking the full schedule.
                  </p>
                </div>
              </div>

              {editVehicleOnSite ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-job-start-date">Job Span Start</Label>
                    <Input
                      id="edit-job-start-date"
                      type="date"
                      value={editJobStartDate}
                      onChange={(e) => setEditJobStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-job-start-time">Span Start Time</Label>
                    <Input
                      id="edit-job-start-time"
                      type="time"
                      value={editJobStartTime}
                      onChange={(e) => setEditJobStartTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-expected-completion-date">Expected Completion</Label>
                    <Input
                      id="edit-expected-completion-date"
                      type="date"
                      value={editExpectedCompletionDate}
                      onChange={(e) => setEditExpectedCompletionDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-expected-completion-time">Completion Time</Label>
                    <Input
                      id="edit-expected-completion-time"
                      type="time"
                      value={editExpectedCompletionTime}
                      onChange={(e) => setEditExpectedCompletionTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Job Phase</Label>
                    <FormSelect value={editJobPhase} onChange={setEditJobPhase}>
                      <option value="scheduled">Scheduled</option>
                      <option value="active_work">Active work</option>
                      <option value="waiting">Waiting</option>
                      <option value="curing">Curing</option>
                      <option value="hold">Hold</option>
                      <option value="pickup_ready">Pickup ready</option>
                    </FormSelect>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-pickup-ready-date">Pickup Ready</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        id="edit-pickup-ready-date"
                        type="date"
                        value={editPickupReadyDate}
                        onChange={(e) => setEditPickupReadyDate(e.target.value)}
                      />
                      <Input
                        type="time"
                        value={editPickupReadyTime}
                        onChange={(e) => setEditPickupReadyTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Assigned Staff */}
            <div className="space-y-2">
              <Label>Assigned Staff</Label>
              <FormSelect
                value={editStaffId || "__unassigned__"}
                onChange={(val) => setEditStaffId(val === "__unassigned__" ? "" : val)}
              >
                <option value="__unassigned__">Unassigned</option>
                {(staffForEdit as any[])?.map((staff: any) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.firstName} {staff.lastName}
                  </option>
                ))}
              </FormSelect>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Client Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notes visible to the client..."
                rows={3}
              />
            </div>

            {/* Internal Notes */}
            <div className="space-y-2">
              <Label htmlFor="edit-internal-notes">Internal Notes</Label>
              <Textarea
                id="edit-internal-notes"
                value={editInternalNotes}
                onChange={(e) => setEditInternalNotes(e.target.value)}
                placeholder="Internal notes (not visible to client)..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={updatingNotes}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={updatingNotes}>
              {updatingNotes && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCompleteWarningDialog} onOpenChange={setShowCompleteWarningDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No services recorded — mark as complete anyway?</AlertDialogTitle>
            <AlertDialogDescription>
              This appointment has no services assigned. You can still mark it complete, but consider adding services to the invoice first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowCompleteWarningDialog(false);
                void handleComplete();
              }}
            >
              Mark Complete Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              The client will be notified by email. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleCancel()}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
