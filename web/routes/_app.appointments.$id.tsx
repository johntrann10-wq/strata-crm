import { useState, useEffect, Fragment } from "react";
import { useParams, Link, useOutletContext } from "react-router";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { usePageContext } from "../components/shared/CommandPaletteContext";
import { ContextualNextStep } from "../components/shared/ContextualNextStep";
import { RelatedRecordsPanel, type RelatedRecord } from "../components/shared/RelatedRecordsPanel";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EntityCollaborationCard } from "../components/shared/EntityCollaborationCard";
import { ChecklistCard } from "../components/shared/ChecklistCard";
import { VerticalWorkflowCard } from "../components/shared/VerticalWorkflowCard";
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

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, businessType, permissions } = useOutletContext<AuthOutletContext>();
  const canEditCollaboration = permissions.has("appointments.write");
  const { setPageContext } = usePageContext();
  const intakePreset = getIntakePreset(businessType);

  const [isEditing, setIsEditing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showCompleteWarningDialog, setShowCompleteWarningDialog] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [internalNotesValue, setInternalNotesValue] = useState("");


  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editStaffId, setEditStaffId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editInternalNotes, setEditInternalNotes] = useState("");
  const [editVehicleId, setEditVehicleId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("__none__");
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
  const [{ fetching: completing }, runComplete] = useAction(api.appointment.complete);
  const [{ fetching: cancelling }, runCancel] = useAction(api.appointment.cancel);
  const [{ fetching: updatingNotes }, runUpdate] = useAction(api.appointment.update);
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

  const handleStatusChange = async (newStatus: string) => {
    if (!appointment) return;
    const result = await runUpdateStatus({ id: appointment.id, status: newStatus });
    if (result.error) {
      toast.error(`Failed to update status: ${result.error.message}`);
    } else {
      toast.success(`Status updated to ${STATUS_LABELS[newStatus] ?? newStatus}`);
    }
  };

  const handleComplete = async () => {
    if (!appointment) return;
    const result = await runComplete({ id: appointment.id });
    if (result.error) {
      toast.error(`Failed to complete appointment: ${result.error.message}`);
    } else {
      toast.success("Appointment marked as complete");
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

    const result = await runUpdate({
      id: appointment.id,
      title: editTitle || null,
      startTime,
      endTime,
      assignedStaff: editStaffId ? { _link: editStaffId } : null,
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
          <Link to="/appointments">Back to Appointments</Link>
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
          <Link to="/appointments">
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

  const isActionLoading = updatingStatus || completing || cancelling;
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

  const relatedRecords: RelatedRecord[] = [];
  if (appointment) {
    if (appointment.client) {
      relatedRecords.push({
        type: "client",
        id: appointment.client.id,
        label: `${appointment.client.firstName} ${appointment.client.lastName}`,
        href: `/clients/${appointment.client.id}`,
      });
    }
    if (appointment.vehicle) {
      relatedRecords.push({
        type: "vehicle",
        id: appointment.vehicle.id,
        label: `${appointment.vehicle.year ?? ""} ${appointment.vehicle.make} ${appointment.vehicle.model}`.trim(),
        href: `/clients/${appointment.client?.id ?? ""}`,
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
        href: `/invoices/${invoice.id}`,
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
        href: `/quotes/${quote.id}`,
      });
    }
  }

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/appointments">
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

        <div className="flex items-center gap-2 flex-wrap shrink-0">
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

          {quote && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/quotes/${quote.id}`}>
                <FileText className="h-4 w-4 mr-2" />
                View Quote
              </Link>
            </Button>
          )}
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
                  <CardTitle className="text-base">Appointment Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                  <CardTitle className="text-base">Services</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
                    <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                      <SelectTrigger className="sm:flex-1">
                        <SelectValue placeholder={servicesFetching ? "Loading services..." : "Add a service from your catalog"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select a service</SelectItem>
                        {availableServices.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.name ?? "Service"}
                            {service.category ? ` - ${service.category}` : ""}
                            {service.price != null ? ` - ${formatCurrency(Number(service.price))}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <CardTitle className="text-base">Notes</CardTitle>
                  {!isEditing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit2 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
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
              />

              <VerticalWorkflowCard businessType={businessType} mode="appointment" />

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

            {/* Assigned Staff */}
            <div className="space-y-2">
              <Label>Assigned Staff</Label>
              <Select
                value={editStaffId || "__unassigned__"}
                onValueChange={(val) => setEditStaffId(val === "__unassigned__" ? "" : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {(staffForEdit as any[])?.map((staff: any) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.firstName} {staff.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
