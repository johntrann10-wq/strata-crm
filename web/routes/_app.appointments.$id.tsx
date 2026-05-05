import { useState, useEffect, Fragment, useMemo } from "react";
import { useParams, Link, useNavigate, useOutletContext, useSearchParams } from "react-router";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getDisplayedAppointmentAmount } from "@/lib/appointmentAmounts";
import { getCalendarBlockLabel, isCalendarBlockAppointment, isFullDayCalendarBlock } from "@/lib/calendarBlocks";
import { getTransactionalEmailErrorMessage } from "../lib/transactionalEmail";
import { invoiceAllowsPayment, validatePaymentAmount } from "@/lib/validation";
import { canOpenExternalPaymentProvider } from "@/lib/mobileShell";
import { hasBackendFinanceField, resolveAppointmentFinanceState } from "@/lib/appointmentFinanceState";
import { usePageContext } from "../components/shared/CommandPaletteContext";
import { ContextualNextStep } from "../components/shared/ContextualNextStep";
import { RelatedRecordsPanel, type RelatedRecord } from "../components/shared/RelatedRecordsPanel";
import { StatusBadge } from "../components/shared/StatusBadge";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { CommunicationCard } from "../components/shared/CommunicationCard";
import { EntityCollaborationCard } from "../components/shared/EntityCollaborationCard";
import {
  buildQuarterHourOptions,
  FormDatePicker,
  ResponsiveTimeSelect,
  toDateInputValue,
} from "../components/appointments/SchedulingControls";
import { getIntakePreset } from "../lib/intakePresets";
import {
  triggerImpactFeedback,
  triggerNotificationFeedback,
  triggerSelectionFeedback,
} from "../lib/nativeInteractions";
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
  CalendarDays,
  Phone,
  Mail,
  MessageSquare,
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

function parseDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function trimContactValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatDisplayPhone(value: string | null | undefined): string | null {
  const trimmed = trimContactValue(value);
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return trimmed;
}

function buildPhoneHref(value: string | null | undefined): string | null {
  const trimmed = trimContactValue(value);
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : null;
}

function buildSmsHref(value: string | null | undefined): string | null {
  const trimmed = trimContactValue(value);
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^\d+]/g, "");
  return normalized ? `sms:${normalized}` : null;
}

function buildEmailHref(value: string | null | undefined): string | null {
  const trimmed = trimContactValue(value);
  return trimmed ? `mailto:${trimmed}` : null;
}

type CustomerAddonRequest = {
  activityId: string;
  addonServiceId: string;
  addonName: string;
  addonPrice: number | null;
  addonDurationMinutes: number | null;
  parentServiceName: string | null;
  clientName: string | null;
  createdAt: string | Date | null;
};

function parseActivityMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata) return {};
  if (typeof metadata === "object" && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
  if (typeof metadata !== "string") return {};
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseCustomerAddonRequests(
  records: Array<{ id?: string | null; type?: string | null; action?: string | null; metadata?: unknown; createdAt?: string | Date | null }>
): CustomerAddonRequest[] {
  const seenAddonServiceIds = new Set<string>();
  return records
    .filter((record) => (record.type ?? record.action) === "appointment.public_addon_requested")
    .map((record) => {
      const parsed = parseActivityMetadata(record.metadata);
      const addonServiceId = typeof parsed.addonServiceId === "string" ? parsed.addonServiceId : "";
      const addonName = typeof parsed.addonName === "string" && parsed.addonName.trim() ? parsed.addonName.trim() : "Requested add-on";
      const addonPrice = Number(parsed.addonPrice);
      const addonDurationMinutes = Number(parsed.addonDurationMinutes);
      return {
        activityId: record.id ?? `${addonServiceId}:${String(record.createdAt ?? "")}`,
        addonServiceId,
        addonName,
        addonPrice: Number.isFinite(addonPrice) ? addonPrice : null,
        addonDurationMinutes: Number.isFinite(addonDurationMinutes) ? addonDurationMinutes : null,
        parentServiceName:
          typeof parsed.parentServiceName === "string" && parsed.parentServiceName.trim()
            ? parsed.parentServiceName.trim()
            : null,
        clientName:
          typeof parsed.clientName === "string" && parsed.clientName.trim()
            ? parsed.clientName.trim()
            : null,
        createdAt: record.createdAt ?? null,
      };
    })
    .filter((request): request is CustomerAddonRequest => {
      if (!request?.addonServiceId || seenAddonServiceIds.has(request.addonServiceId)) return false;
      seenAddonServiceIds.add(request.addonServiceId);
      return true;
    });
}

function getResolvedCustomerAddonRequestIds(
  records: Array<{ type?: string | null; action?: string | null; metadata?: unknown }>
): Set<string> {
  const resolved = new Set<string>();
  for (const record of records) {
    const action = record.type ?? record.action;
    if (action !== "appointment.public_addon_approved" && action !== "appointment.public_addon_declined") continue;
    const parsed = parseActivityMetadata(record.metadata);
    const addonServiceId = typeof parsed.addonServiceId === "string" ? parsed.addonServiceId : "";
    if (addonServiceId) resolved.add(addonServiceId);
  }
  return resolved;
}

function safeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readMetadataString(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

type AppointmentDetailRecord = {
  id: string;
  title?: string | null;
  status?: string | null;
  isMobile?: boolean | null;
  mobileAddress?: string | null;
  subtotal?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  applyTax?: boolean | null;
  adminFeeRate?: number | null;
  adminFeeAmount?: number | null;
  applyAdminFee?: boolean | null;
  totalPrice?: number | null;
  client?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  vehicle?: {
    id: string;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    color?: string | null;
    licensePlate?: string | null;
  } | null;
  assignedStaff?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  source?: {
    type: "lead" | "booking_request";
    label: string;
    leadClientId?: string | null;
    bookingRequestId?: string | null;
    href?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
  customerAddonRequests?: CustomerAddonRequest[] | null;
};

type AppointmentServiceCatalogRecord = {
  id: string;
  name?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  price?: number | string | null;
  durationMinutes?: number | null;
  active?: boolean | null;
};

type AppointmentAddonLinkRecord = {
  parentServiceId?: string | null;
  addonServiceId?: string | null;
};

function buildAppointmentAddonSuggestions(
  services: AppointmentServiceCatalogRecord[],
  addonLinks: AppointmentAddonLinkRecord[],
  selectedServiceIds: Set<string>
) {
  const serviceById = new Map(services.filter((service) => service.id).map((service) => [service.id, service]));

  return Array.from(selectedServiceIds)
    .flatMap((parentServiceId) => {
      const baseService = serviceById.get(parentServiceId);
      if (!baseService) return [];
      const linkedAddons = addonLinks
        .filter((link) => link.parentServiceId === parentServiceId)
        .map((link) => (link.addonServiceId ? serviceById.get(link.addonServiceId) : null))
        .filter(
          (addon): addon is AppointmentServiceCatalogRecord =>
            Boolean(addon?.id) && addon?.active !== false && !selectedServiceIds.has(addon.id)
        );
      return linkedAddons.length > 0 ? [{ baseService, linkedAddons }] : [];
    })
    .slice(0, 4);
}

function getAppointmentDetailClientName(appointment: AppointmentDetailRecord) {
  if (!appointment.client) return "Internal block";
  return [appointment.client.firstName, appointment.client.lastName].filter(Boolean).join(" ").trim();
}

function getAppointmentDetailVehicleLabel(appointment: AppointmentDetailRecord) {
  if (!appointment.vehicle) return "No vehicle attached";
  return [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ").trim();
}

function getAppointmentDisplayState(
  appointment: AppointmentDetailRecord,
  appointmentServicesLength: number,
  isInternalCalendarBlock: boolean,
  blockCoverageLabel: string | null,
) {
  const displayedAmount = getDisplayedAppointmentAmount(appointment);
  const appointmentClientName = getAppointmentDetailClientName(appointment);
  const appointmentVehicleLabel = getAppointmentDetailVehicleLabel(appointment);
  const appointmentLocationLabel = appointment.isMobile ? appointment.mobileAddress || "Mobile service" : "In-shop service";
  const appointmentValueLabel =
    displayedAmount > 0
      ? formatCurrency(displayedAmount)
      : appointmentServicesLength > 0
        ? `${appointmentServicesLength} booked service${appointmentServicesLength === 1 ? "" : "s"}`
        : "No pricing attached yet";
  const appointmentSubjectLabel = isInternalCalendarBlock ? blockCoverageLabel ?? "Internal block" : appointmentClientName;
  const appointmentSecondaryLabel = isInternalCalendarBlock
    ? appointment.assignedStaff
      ? [appointment.assignedStaff.firstName, appointment.assignedStaff.lastName].filter(Boolean).join(" ").trim()
      : "Business-wide block"
    : appointmentVehicleLabel;

  return {
    appointmentClientName,
    appointmentVehicleLabel,
    appointmentLocationLabel,
    appointmentValueLabel,
    appointmentSubjectLabel,
    appointmentSecondaryLabel,
  };
}

function JobLifecycleStepper({
  status,
  invoicedAt,
  paidAt,
  paymentRecorded = false,
}: {
  status: string;
  invoicedAt: Date | null;
  paidAt: Date | null;
  paymentRecorded?: boolean;
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
    if (paidAt || paymentRecorded) {
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

const TIME_OPTIONS = buildQuarterHourOptions();

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, businessType, permissions, currentLocationId } = useOutletContext<AuthOutletContext>();
  const { setPageContext } = usePageContext();
  const intakePreset = getIntakePreset(businessType);
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/calendar?view=month";
  const hasQueueReturn = searchParams.has("from");
  const withReturn = (pathname: string) =>
    `${pathname}${pathname.includes("?") ? "&" : "?"}from=${encodeURIComponent(returnTo)}`;

  const [isEditing, setIsEditing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCompleteWarningDialog, setShowCompleteWarningDialog] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [internalNotesValue, setInternalNotesValue] = useState("");


  const [showEditDialog, setShowEditDialog] = useState(false);
  const [recordDepositOpen, setRecordDepositOpen] = useState(false);
  const [reverseDepositOpen, setReverseDepositOpen] = useState(false);
  const [editDepositOpen, setEditDepositOpen] = useState(false);
  const [editPricingOpen, setEditPricingOpen] = useState(false);
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
  const [editClientId, setEditClientId] = useState("");
  const [editVehicleId, setEditVehicleId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("__none__");
  const [addingRequestedAddonId, setAddingRequestedAddonId] = useState<string | null>(null);
  const [decliningRequestedAddonId, setDecliningRequestedAddonId] = useState<string | null>(null);
  const [depositPaymentAmount, setDepositPaymentAmount] = useState("");
  const [depositPaymentMethod, setDepositPaymentMethod] = useState("cash");
  const [depositPaymentDate, setDepositPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [depositPaymentNotes, setDepositPaymentNotes] = useState("");
  const [depositAmountDraft, setDepositAmountDraft] = useState("");
  const [pricingTaxRateDraft, setPricingTaxRateDraft] = useState("0");
  const [pricingApplyTaxDraft, setPricingApplyTaxDraft] = useState(false);
  const [pricingAdminFeeRateDraft, setPricingAdminFeeRateDraft] = useState("0");
  const [pricingApplyAdminFeeDraft, setPricingApplyAdminFeeDraft] = useState(false);
  const [showMobileAppointmentInfo, setShowMobileAppointmentInfo] = useState(false);
  const [showMobileServices, setShowMobileServices] = useState(false);
  const [showMobileNotes, setShowMobileNotes] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [editServiceIds, setEditServiceIds] = useState<string[]>([]);
  const [isSmallViewport, setIsSmallViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsSmallViewport(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

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
        subtotal: true,
        taxRate: true,
        taxAmount: true,
        applyTax: true,
        adminFeeRate: true,
        adminFeeAmount: true,
        applyAdminFee: true,
        totalPrice: true,
        depositAmount: true,
        collectedAmount: true,
        balanceDue: true,
        paidInFull: true,
        depositSatisfied: true,
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

  const [{ data: appointmentServices }, refetchAppointmentServices] = useFindMany(api.appointmentService, {
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
        price: true,
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
    entityId: id ?? "",
    first: 100,
    sort: { createdAt: "Descending" },
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
  const [{ data: clientsForEdit, fetching: clientsForEditFetching }] = useFindMany(api.client, {
    filter: { businessId: { equals: appointment?.business?.id } },
    select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    sort: { firstName: "Ascending" },
    first: 200,
    pause: !appointment?.business?.id,
  } as any);
  const [{ data: vehiclesForEdit, fetching: vehiclesForEditFetching }] = useFindMany(api.vehicle, {
    filter: editClientId ? { clientId: { equals: editClientId } } : { id: { equals: "" } },
    select: { id: true, year: true, make: true, model: true, color: true, licensePlate: true },
    sort: { updatedAt: "Descending" },
    first: 100,
    pause: !editClientId,
  } as any);
  const [{ data: serviceCatalog, fetching: servicesFetching }] = useFindMany(api.service, {
    first: 200,
    sort: { createdAt: "Descending" },
    pause: !appointment?.business?.id,
  } as any);
  const [{ data: serviceAddonLinks }] = useFindMany(api.serviceAddonLink, {
    first: 500,
    pause: !appointment?.business?.id,
  } as any);

  const [{ fetching: updatingStatus }, runUpdateStatus] = useAction(api.appointment.updateStatus);
  const [{ fetching: sendingConfirmation }, runSendConfirmation] = useAction(api.appointment.sendConfirmation);
  const [{ fetching: completing }, runComplete] = useAction(api.appointment.complete);
  const [{ fetching: cancelling }, runCancel] = useAction(api.appointment.cancel);
  const [{ fetching: deletingAppointment }, runDeleteAppointment] = useAction(
    (params: Record<string, unknown>) => api.appointment.delete(params)
  );
  const [{ fetching: updatingNotes }, runUpdate] = useAction(api.appointment.update);
  const [{ fetching: recordingDeposit }, runRecordDepositPayment] = useAction(api.appointment.recordDepositPayment);
  const [{ fetching: creatingStripeDepositSession }, runCreateStripeDepositSession] = useAction(
    api.appointment.createStripeDepositSession
  );
  const [{ fetching: reversingDeposit }, runReverseDepositPayment] = useAction(api.appointment.reverseDepositPayment);
  const [{ fetching: addingService }, runAddAppointmentService] = useAction(api.appointmentService.create);
  const [{ fetching: reviewingAddonRequest }, runReviewAddonRequest] = useAction(api.appointment.reviewAddonRequest);
  const [{ fetching: removingService }, runRemoveAppointmentService] = useAction(
    (params: Record<string, unknown>) => api.appointmentService.delete(params)
  );
  const [{ fetching: completingService }, runCompleteService] = useAction(api.appointmentService.complete);
  const [{ fetching: reopeningService }, runReopenService] = useAction(api.appointmentService.reopen);
  const [{ fetching: confirmingStripeDeposit }, runConfirmStripeDeposit] = useAction(
    api.appointment.confirmStripeDepositSession
  );

  useEffect(() => {
    if (appointment) {
      setNotesValue(appointment.notes ?? "");
      setInternalNotesValue(appointment.internalNotes ?? "");
    }
  }, [appointment]);

  useEffect(() => {
    const paymentStatus = searchParams.get("stripePayment");
    if (!paymentStatus) return;
    const sessionId = searchParams.get("session_id");
    let cancelled = false;

    const clearParams = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("stripePayment");
      next.delete("session_id");
      setSearchParams(next, { replace: true });
    };

    if (!canOpenExternalPaymentProvider()) {
      clearParams();
      return;
    }

    const run = async () => {
      if (paymentStatus === "success" && sessionId) {
        try {
          const result = await runConfirmStripeDeposit({ id, sessionId });
          if (cancelled) return;
          if (result?.confirmed || result?.depositSatisfied === true) {
            toast.success("Stripe deposit received.");
          } else {
            toast.message("Stripe checkout completed. Deposit status is still syncing.");
          }
        } catch {
          if (cancelled) return;
          toast.message("Stripe checkout completed. Deposit status is still syncing.");
        }
        void refetchAppointment();
        void refetchActivity();
      } else if (paymentStatus === "success") {
        toast.message("Stripe checkout completed. Deposit status is still syncing.");
        void refetchAppointment();
        void refetchActivity();
      } else if (paymentStatus === "cancelled") {
        toast.message("Stripe checkout was cancelled.");
      }
      if (!cancelled) clearParams();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [id, refetchActivity, refetchAppointment, runConfirmStripeDeposit, searchParams, setSearchParams]);

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
  }, [appointment, invoice, setPageContext]);

  const existingServiceIds = useMemo(
    () =>
      new Set(
        ((appointmentServices ?? []) as Array<{ serviceId?: string | null }>)
          .map((service) => service.serviceId)
          .filter((serviceId): serviceId is string => Boolean(serviceId))
      ),
    [appointmentServices]
  );
  const serviceCatalogRecords = useMemo(
    () => (serviceCatalog ?? []) as AppointmentServiceCatalogRecord[],
    [serviceCatalog]
  );
  const availableServices = useMemo(
    () => serviceCatalogRecords.filter((service) => service.id && !existingServiceIds.has(service.id)),
    [existingServiceIds, serviceCatalogRecords]
  );
  const appointmentAddonSuggestions = useMemo(
    () =>
      buildAppointmentAddonSuggestions(
        serviceCatalogRecords,
        (serviceAddonLinks ?? []) as AppointmentAddonLinkRecord[],
        existingServiceIds
      ),
    [existingServiceIds, serviceAddonLinks, serviceCatalogRecords]
  );
  const customerAddonActivityRecords = (activityLogs ?? []) as Array<{
      id?: string | null;
      type?: string | null;
      action?: string | null;
      metadata?: unknown;
      createdAt?: string | Date | null;
    }>;
  const appointmentCustomerAddonRequests = Array.isArray((appointment as AppointmentDetailRecord | null)?.customerAddonRequests)
    ? ((appointment as AppointmentDetailRecord).customerAddonRequests ?? [])
    : [];
  const resolvedCustomerAddonRequestIds = getResolvedCustomerAddonRequestIds(customerAddonActivityRecords);
  const customerAddonRequests = Array.from(
    [...appointmentCustomerAddonRequests, ...parseCustomerAddonRequests(customerAddonActivityRecords)]
      .reduce((acc, request) => {
        if (!request.addonServiceId || resolvedCustomerAddonRequestIds.has(request.addonServiceId)) return acc;
        if (!acc.has(request.addonServiceId)) acc.set(request.addonServiceId, request);
        return acc;
      }, new Map<string, CustomerAddonRequest>())
      .values()
  );

  useEffect(() => {
    if (customerAddonRequests.length === 0 || window.location.hash !== "#customer-addon-requests") return;
    const timeout = window.setTimeout(() => {
      document.getElementById("customer-addon-requests")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [customerAddonRequests.length]);

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
      void triggerNotificationFeedback("success");
      return;
    }
    if (deliveryStatus === "missing_email") {
      toast.warning(`${successLabel}, but the client has no email address.`);
      void triggerNotificationFeedback("warning");
      return;
    }
    if (deliveryStatus === "smtp_disabled") {
      toast.warning(`${successLabel}, but transactional email is not configured.`);
      void triggerNotificationFeedback("warning");
      return;
    }
    if (deliveryStatus === "email_failed") {
      toast.warning(`${successLabel}, but confirmation email failed${deliveryError ? `: ${deliveryError}` : "."}`);
      void triggerNotificationFeedback("warning");
      return;
    }
    toast.success(successLabel);
    void triggerNotificationFeedback("success");
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!appointment) return;
    await triggerImpactFeedback("light");
    const result = await runUpdateStatus({ id: appointment.id, status: newStatus });
    if (result.error) {
      toast.error(`Failed to update status: ${result.error.message}`);
      void triggerNotificationFeedback("error");
    } else {
      const payload = result.data as { deliveryStatus?: string | null; deliveryError?: string | null } | null;
      if (newStatus === "confirmed") {
        notifyConfirmationResult(payload?.deliveryStatus ?? null, payload?.deliveryError ?? null);
      } else {
        toast.success(`Status updated to ${STATUS_LABELS[newStatus] ?? newStatus}`);
        void triggerNotificationFeedback("success");
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
    await triggerImpactFeedback("light");
    const result = await runSendConfirmation({ id: appointment.id, ...payload });
    if (result.error) {
      toast.error(getTransactionalEmailErrorMessage(result.error, "Appointment confirmation"));
      void triggerNotificationFeedback("error");
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
    await triggerImpactFeedback("medium");
    const result = await runComplete({ id: appointment.id });
    if (result.error) {
      toast.error(`Failed to complete appointment: ${result.error.message}`);
      void triggerNotificationFeedback("error");
    } else {
      toast.success("Appointment marked as complete");
      void triggerNotificationFeedback("success");
      void refetchAppointment();
      void refetchActivity();
    }
  };

  const handleCancel = async () => {
    if (!appointment) return;
    await triggerImpactFeedback("rigid");
    const result = await runCancel({ id: appointment.id });
    if (result.error) {
      toast.error(`Failed to cancel appointment: ${result.error.message}`);
      void triggerNotificationFeedback("error");
    } else {
      toast.success("Appointment cancelled");
      void triggerNotificationFeedback("warning");
      setShowCancelDialog(false);
      void refetchAppointment();
      void refetchActivity();
    }
  };

  const handleDeleteAppointment = async () => {
    if (!appointment) return;
    await triggerImpactFeedback("rigid");
    const result = await runDeleteAppointment({ id: appointment.id });
    if (result.error) {
      const message = result.error.message ?? "Failed to delete appointment";
      toast.error(message.includes("can't be deleted") ? message : `Failed to delete appointment: ${message}`);
      void triggerNotificationFeedback("error");
      return;
    }
    toast.success("Appointment deleted");
    void triggerNotificationFeedback("warning");
    setShowDeleteDialog(false);
    navigate(returnTo);
  };

  const handleSaveNotes = async () => {
    if (!appointment) return;
    await triggerImpactFeedback("light");
    const result = await runUpdate({
      id: appointment.id,
      notes: notesValue,
      internalNotes: internalNotesValue,
    });
    if (result.error) {
      toast.error("Failed to save notes: " + result.error.message);
      void triggerNotificationFeedback("error");
      return;
    }
    setIsEditing(false);
    toast.success("Notes updated");
    void triggerNotificationFeedback("success");
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
        setEditClientId(appointment.client?.id ?? "");
        setEditVehicleId(appointment.vehicle?.id ?? "");
      }
      setShowEditDialog(true);
    };

  const handleSaveEdit = async () => {
    if (!appointment) return;
    if (editClientId && !editVehicleId) {
      toast.error("Select a vehicle for the chosen client before saving.");
      return;
    }
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
          clientId: editClientId || undefined,
          vehicleId: editVehicleId || undefined,
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
    void refetchAppointmentServices();
  };

  const handleAddSuggestedService = async (service: AppointmentServiceCatalogRecord) => {
    if (!appointment?.id || !service.id) return;
    await triggerImpactFeedback("light");
    const result = await runAddAppointmentService({
      appointmentId: appointment.id,
      serviceId: service.id,
    });
    if (result.error) {
      toast.error(`Failed to add ${service.name ?? "add-on"}: ${result.error.message}`);
      void triggerNotificationFeedback("error");
      return;
    }
    toast.success(`${service.name ?? "Add-on"} added to appointment`);
    void triggerNotificationFeedback("success");
    void refetchAppointment();
    void refetchAppointmentServices();
    void refetchActivity();
  };

  const handleApproveRequestedService = async (request: CustomerAddonRequest, alreadyAdded: boolean) => {
    if (!appointment?.id || !request.addonServiceId) return;
    setAddingRequestedAddonId(request.addonServiceId);
    await triggerImpactFeedback("light");
    if (!alreadyAdded) {
      const result = await runAddAppointmentService({
        appointmentId: appointment.id,
        serviceId: request.addonServiceId,
      });
      if (result.error) {
        setAddingRequestedAddonId(null);
        toast.error(`Failed to add requested add-on: ${result.error.message}`);
        void triggerNotificationFeedback("error");
        return;
      }
    }
    const reviewResult = await runReviewAddonRequest({
      id: appointment.id,
      addonServiceId: request.addonServiceId,
      addonName: request.addonName,
      action: "approved",
    }).finally(() => setAddingRequestedAddonId(null));
    if (reviewResult.error) {
      toast.warning("Add-on was added, but the request still needs review.");
      void triggerNotificationFeedback("warning");
      return;
    }
    toast.success(alreadyAdded ? "Add-on request approved" : "Requested add-on added to appointment");
    void triggerNotificationFeedback("success");
    void refetchAppointment();
    void refetchAppointmentServices();
    void refetchActivity();
  };

  const handleDeclineRequestedService = async (request: CustomerAddonRequest) => {
    if (!appointment?.id || !request.addonServiceId) return;
    setDecliningRequestedAddonId(request.addonServiceId);
    await triggerImpactFeedback("light");
    const result = await runReviewAddonRequest({
      id: appointment.id,
      addonServiceId: request.addonServiceId,
      addonName: request.addonName,
      action: "declined",
    }).finally(() => setDecliningRequestedAddonId(null));
    if (result.error) {
      toast.error(`Failed to dismiss add-on request: ${result.error.message}`);
      void triggerNotificationFeedback("error");
      return;
    }
    toast.success("Add-on request dismissed");
    void triggerNotificationFeedback("success");
    void refetchAppointment();
    void refetchActivity();
  };

  const handleRemoveService = async (appointmentServiceId: string) => {
    const result = await runRemoveAppointmentService({ id: appointmentServiceId });
    if (result.error) {
      toast.error(`Failed to remove service: ${result.error.message}`);
      return;
    }
    toast.success("Service removed from appointment");
    void refetchAppointment();
    void refetchAppointmentServices();
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

  const handleOperationalUpdate = async ({
    successLabel,
    nextStatus,
    updateValues,
  }: {
    successLabel: string;
    nextStatus?: string | null;
    updateValues?: Record<string, unknown> | null;
  }) => {
    if (!appointment) return;

    await triggerImpactFeedback("light");

    if (nextStatus && appointment.status !== nextStatus) {
      const statusResult = await runUpdateStatus({ id: appointment.id, status: nextStatus });
      if (statusResult.error) {
        toast.error(`Failed to update status: ${statusResult.error.message}`);
        void triggerNotificationFeedback("error");
        return;
      }
    }

    if (updateValues) {
      const updateResult = await runUpdate({
        id: appointment.id,
        ...updateValues,
      });
      if (updateResult.error) {
        toast.error(`Failed to update appointment: ${updateResult.error.message}`);
        void triggerNotificationFeedback("error");
        return;
      }
    }

    toast.success(successLabel);
    void triggerNotificationFeedback("success");
    void refetchAppointment();
    void refetchActivity();
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
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading appointment details...</p>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-destructive text-lg font-medium">
          {error ? `Error: ${error.message}` : "Appointment not found"}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {error ? (
            <Button variant="outline" onClick={() => void refetchAppointment()}>
              Retry
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link to={returnTo}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Appointments
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const pageTitle =
    isCalendarBlockAppointment(appointment)
      ? getCalendarBlockLabel(appointment)
      : appointment.title ||
        (appointment.client
          ? `${appointment.client.firstName} ${appointment.client.lastName}`
          : "Appointment");
  const isInternalCalendarBlock = isCalendarBlockAppointment(appointment);
  const hasClientContext = Boolean(
    appointment.client &&
      (
        appointment.client.id ||
        appointment.client.firstName ||
        appointment.client.lastName ||
        appointment.client.phone ||
        appointment.client.email
      )
  );
  const isInternalAppointment = isInternalCalendarBlock || !hasClientContext;
  const blockCoverageLabel = isInternalAppointment
    ? isFullDayCalendarBlock(appointment)
      ? "Full-day block"
      : "Timed block"
    : null;
  const isActionLoading = updatingStatus || completing || cancelling || deletingAppointment || sendingConfirmation;
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
  const {
    appointmentClientName,
    appointmentVehicleLabel,
    appointmentLocationLabel,
    appointmentValueLabel,
    appointmentSubjectLabel,
    appointmentSecondaryLabel,
  } = getAppointmentDisplayState(
    appointment as AppointmentDetailRecord,
    appointmentServices?.length ?? 0,
    isInternalAppointment,
    blockCoverageLabel
  );
  const appointmentMapsHref = appointment?.isMobile && appointment.mobileAddress
    ? `https://maps.apple.com/?q=${encodeURIComponent(appointment.mobileAddress)}`
    : null;
  const appointmentClientPhone = trimContactValue(appointment.client?.phone ?? null);
  const appointmentClientPhoneLabel = formatDisplayPhone(appointmentClientPhone);
  const appointmentClientEmail = trimContactValue(appointment.client?.email ?? null);
  const appointmentCallHref = buildPhoneHref(appointmentClientPhone);
  const appointmentSmsHref = buildSmsHref(appointmentClientPhone);
  const appointmentEmailHref = buildEmailHref(appointmentClientEmail);
  const appointmentHasMedia = ((activityLogs ?? []) as Array<{ type?: string | null }>).some((record) =>
    String(record.type ?? "").endsWith(".media_added")
  );
  const supportsInShopWorkflow = !isInternalAppointment && !appointment.isMobile;
  const quickJumpLinks = [
    { label: "Schedule", href: "#appointment-schedule-card" },
    { label: "Services", href: "#appointment-services-card" },
    { label: "Notes", href: "#appointment-notes-card" },
    { label: appointmentHasMedia ? "Photos" : "Add photos", href: "#appointment-media-card" },
    { label: "Client", href: "#appointment-client-card" },
    { label: "Vehicle", href: "#appointment-vehicle-card" },
    { label: "Payments", href: "#appointment-finance-card" },
  ];
  const hasPlaceholderClient =
    appointment.client?.firstName === "Walk-in" && appointment.client?.lastName === "Customer";
    const hasPlaceholderVehicle =
      appointment.vehicle?.make === "Unspecified" &&
      appointment.vehicle?.model === "Vehicle";
    const missingLinkedRecords = !appointment.client || !appointment.vehicle;
    const depositAmountValue = Number(appointment.depositAmount ?? 0);
    const totalPriceValue = getDisplayedAppointmentAmount(appointment);
    const financeState = resolveAppointmentFinanceState(
      {
        ...(appointment as Record<string, unknown>),
        totalPrice: totalPriceValue,
        invoiceStatus: String((invoice as any)?.status ?? ""),
        invoicePaidAt: (invoice as any)?.lastPaidAt ?? null,
      },
      ((activityLogs ?? []) as Array<{ type?: string | null; action?: string | null; metadata?: string | null }>)
    );
    const normalizedCollectedAmount = financeState.collectedAmount;
  const hasRecordedPayment = financeState.hasAnyPayment;
  const remainingBalanceValue = financeState.balanceDue;
  const nextPaymentAmount = financeState.nextCollectionAmount;
  const showsDepositCollectedState =
    hasRecordedPayment &&
    remainingBalanceValue > 0.009 &&
    financeState.depositSatisfied;
  const showsPaidStatusInsteadOfDeposit = totalPriceValue > 0 ? financeState.isPaidInFull : financeState.paidInFull;
  const showsCollectPaymentLabel = !isInternalAppointment && hasRecordedPayment;
  const appointmentSource = (appointment.source ?? null) as AppointmentDetailRecord["source"];
  const appointmentSourceMetadata =
    appointmentSource?.metadata && typeof appointmentSource.metadata === "object"
      ? appointmentSource.metadata
      : {};
  const appointmentSourceHref =
    typeof appointmentSource?.href === "string" && appointmentSource.href.trim()
      ? appointmentSource.href.trim()
      : null;
  const appointmentSourceRequestedServices =
    readMetadataString(appointmentSourceMetadata, "requestedServices") ??
    readMetadataString(appointmentSourceMetadata, "serviceSummary");
  const appointmentSourceSummary =
    readMetadataString(appointmentSourceMetadata, "sourceSummary") ??
    readMetadataString(appointmentSourceMetadata, "requestedTiming");
  const appointmentSourceLeadSource =
    readMetadataString(appointmentSourceMetadata, "leadSource") ??
    readMetadataString(appointmentSourceMetadata, "sourceDetail");
  const appointmentSourceAddress =
    readMetadataString(appointmentSourceMetadata, "requestedAddress") ??
    readMetadataString(appointmentSourceMetadata, "serviceAddress") ??
    readMetadataString(appointmentSourceMetadata, "mobileServiceAddress");
  const appointmentSourceCustomerName =
    readMetadataString(appointmentSourceMetadata, "customerName") ??
    (appointment.client
      ? [appointment.client.firstName, appointment.client.lastName].filter(Boolean).join(" ").trim() || null
      : null);
  const appointmentSourcePhone =
    readMetadataString(appointmentSourceMetadata, "customerPhone") ?? appointment.client?.phone?.trim() ?? null;
  const appointmentSourceEmail =
    readMetadataString(appointmentSourceMetadata, "customerEmail") ?? appointment.client?.email?.trim() ?? null;
  const canEditDeposit =
    !showsPaidStatusInsteadOfDeposit &&
    appointment.status !== "cancelled" &&
    appointment.status !== "no-show";
  const clientOptions = ((clientsForEdit as any[]) ?? []) as Array<{
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
  }>;
  const vehicleOptions = ((vehiclesForEdit as any[]) ?? []) as Array<{
    id: string;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    color?: string | null;
    licensePlate?: string | null;
  }>;
  const canQuickEditAppointment =
    appointment.status !== "cancelled" &&
    appointment.status !== "no-show";
  const canQuickCancelAppointment =
    appointment.status !== "cancelled" &&
    appointment.status !== "completed" &&
    appointment.status !== "no-show";
  const canQuickCompleteAppointment =
    appointment.status !== "completed" &&
    appointment.status !== "cancelled" &&
    appointment.status !== "no-show";
  const primaryEditLabel = appointment.status === "completed" ? "Edit Details" : "Reschedule";
  const canMarkArrived =
    supportsInShopWorkflow &&
    appointment.status !== "completed" &&
    appointment.status !== "cancelled" &&
    appointment.status !== "no-show" &&
    !(appointment as any).vehicleOnSite;
  const canStartJob =
    !isInternalAppointment &&
    appointment.status !== "in_progress" &&
    appointment.status !== "completed" &&
    appointment.status !== "cancelled" &&
    appointment.status !== "no-show";
  const canSetWaiting = supportsInShopWorkflow && appointment.status === "in_progress" && String((appointment as any).jobPhase ?? "") !== "waiting";
  const canSetCuring = supportsInShopWorkflow && appointment.status === "in_progress" && String((appointment as any).jobPhase ?? "") !== "curing";
  const canSetPickupReady =
    supportsInShopWorkflow &&
    appointment.status !== "completed" &&
    appointment.status !== "cancelled" &&
    appointment.status !== "no-show" &&
    String((appointment as any).jobPhase ?? "") !== "pickup_ready";

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
        href: appointment.client?.id
          ? withReturn(`/clients/${appointment.client.id}/vehicles/${appointment.vehicle.id}`)
          : null,
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
    setDepositPaymentAmount(
      nextPaymentAmount > 0 ? nextPaymentAmount.toFixed(2) : "0.00"
    );
    setDepositPaymentMethod("cash");
    setDepositPaymentDate(new Date().toISOString().split("T")[0]);
    setDepositPaymentNotes("");
    setRecordDepositOpen(true);
  };

  const handleOpenDepositSettingsDialog = () => {
    const currentDepositAmount = Number(appointment?.depositAmount ?? 0);
    setDepositAmountDraft(currentDepositAmount > 0 ? currentDepositAmount.toFixed(2) : "");
    setEditDepositOpen(true);
  };

  const handleOpenPricingDialog = () => {
    setPricingTaxRateDraft(Number(appointment?.taxRate ?? 0).toFixed(2));
    setPricingApplyTaxDraft(Boolean(appointment?.applyTax) && Number(appointment?.taxRate ?? 0) > 0);
    setPricingAdminFeeRateDraft(Number(appointment?.adminFeeRate ?? 0).toFixed(2));
    setPricingApplyAdminFeeDraft(Boolean(appointment?.applyAdminFee) && Number(appointment?.adminFeeRate ?? 0) > 0);
    setEditPricingOpen(true);
  };

  const handleSaveDepositAmount = async () => {
    if (!appointment?.id) return;
    const nextAmount = depositAmountDraft.trim() === "" ? 0 : Number(depositAmountDraft);
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      toast.error("Enter a valid deposit amount.");
      return;
    }
    if (totalPriceValue > 0 && nextAmount > totalPriceValue) {
      toast.error("Deposit cannot be greater than the appointment total.");
      return;
    }
    const result = await runUpdate({
      id: appointment.id,
      depositAmount: nextAmount,
    });
    if (result.error) {
      toast.error("Failed to update deposit: " + result.error.message);
      return;
    }
    toast.success(nextAmount > 0 ? "Deposit updated" : "Deposit removed");
    setEditDepositOpen(false);
    void refetchAppointment();
  };

  const pricingSubtotal = Number(appointment?.subtotal ?? 0);
  const pricingTaxRateValue = pricingApplyTaxDraft ? Number(pricingTaxRateDraft || 0) : 0;
  const pricingAdminFeeRateValue = pricingApplyAdminFeeDraft ? Number(pricingAdminFeeRateDraft || 0) : 0;
  const pricingAdminFeePreview =
    pricingApplyAdminFeeDraft && pricingAdminFeeRateValue > 0 ? (pricingSubtotal * pricingAdminFeeRateValue) / 100 : 0;
  const pricingTaxableSubtotal = pricingSubtotal + pricingAdminFeePreview;
  const pricingTaxPreview = pricingApplyTaxDraft && pricingTaxRateValue > 0 ? (pricingTaxableSubtotal * pricingTaxRateValue) / 100 : 0;
  const pricingTotalPreview = pricingTaxableSubtotal + pricingTaxPreview;

  const handleSavePricing = async () => {
    if (!appointment?.id) return;
    if (!Number.isFinite(pricingTaxRateValue) || pricingTaxRateValue < 0 || pricingTaxRateValue > 100) {
      toast.error("Enter a valid tax rate between 0 and 100.");
      return;
    }
    if (!Number.isFinite(pricingAdminFeeRateValue) || pricingAdminFeeRateValue < 0 || pricingAdminFeeRateValue > 100) {
      toast.error("Enter a valid admin fee rate between 0 and 100.");
      return;
    }
    const result = await runUpdate({
      id: appointment.id,
      taxRate: pricingApplyTaxDraft ? pricingTaxRateValue : 0,
      applyTax: pricingApplyTaxDraft && pricingTaxRateValue > 0,
      adminFeeRate: pricingApplyAdminFeeDraft ? pricingAdminFeeRateValue : 0,
      applyAdminFee: pricingApplyAdminFeeDraft && pricingAdminFeeRateValue > 0,
    });
    if (result.error) {
      toast.error("Failed to update pricing: " + result.error.message);
      return;
    }
    toast.success("Pricing updated");
    setEditPricingOpen(false);
    void refetchAppointment();
  };

  const handleRecordDepositPayment = async () => {
    if (!appointment?.id) return;
    const depositAmount = nextPaymentAmount;
    const amount = parseFloat(depositPaymentAmount);
    const validation = validatePaymentAmount(amount, depositAmount);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    if (Math.abs(amount - depositAmount) > 0.009) {
      toast.error(`Payment must match the amount due of ${formatCurrency(depositAmount)}.`);
      return;
    }
    const paidAtDate = parseDateInputValue(depositPaymentDate);
    if (!paidAtDate) {
      toast.error("Enter a valid payment date.");
      return;
    }
    const result = await runRecordDepositPayment({
      id: appointment.id,
      amount,
      method: depositPaymentMethod,
      paidAt: paidAtDate.toISOString(),
      notes: depositPaymentNotes || undefined,
    });
    if (!result.error) {
      toast.success(showsPaidStatusInsteadOfDeposit || nextPaymentAmount >= remainingBalanceValue ? "Appointment paid in full" : "Payment recorded");
      setRecordDepositOpen(false);
      void refetchAppointment();
      void refetchActivity();
    } else {
      toast.error("Failed to record payment: " + result.error.message);
    }
  };

  const handleReverseDepositPayment = async () => {
    if (!appointment?.id) return;
    const result = await runReverseDepositPayment({ id: appointment.id });
    if (!result.error) {
      toast.success(showsPaidStatusInsteadOfDeposit ? "Payment reversed" : "Deposit reversed");
      setReverseDepositOpen(false);
      void refetchAppointment();
      void refetchActivity();
    } else {
      toast.error("Failed to reverse payment: " + result.error.message);
    }
  };

  const handleStripeDepositCheckout = async () => {
    if (!appointment?.id) return;
    if (!canOpenExternalPaymentProvider()) return;
    const result = await runCreateStripeDepositSession({ id: appointment.id });
    if (!result.error) {
      const url = (result.data as { url?: string } | undefined)?.url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.error("Stripe Checkout link was not returned.");
      return;
    }
    toast.error("Failed to open Stripe Checkout: " + result.error.message);
  };

  const handleContextualAction = (action?: string) => {
    if (!action) return;
    if (action === "confirm") {
      void handleStatusChange("confirmed");
    } else if (action === "start-job") {
      void handleStatusChange("in_progress");
    } else if (action === "complete") {
      const hasServices = appointmentServices && appointmentServices.length > 0;
      const hasTotalPrice = getDisplayedAppointmentAmount(appointment ?? {}) > 0;
      if (!hasServices && !hasTotalPrice) {
        setShowCompleteWarningDialog(true);
      } else {
        void handleComplete();
      }
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:py-6 space-y-5">
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to appointments queue" /> : null}
      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.10),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-4 shadow-[0_18px_44px_rgba(15,23,42,0.07)] sm:p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
              Appointment record
            </Badge>
            <StatusBadge status={appointment.status} type="appointment" />
            {appointmentSource ? (
              <Badge variant="outline" className="rounded-full border-slate-300 bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-700">
                Created from {appointmentSource.label}
              </Badge>
            ) : null}
            {appointment.rescheduleCount != null && appointment.rescheduleCount > 0 ? (
              <Badge className="rounded-full border-amber-200 bg-amber-100 text-amber-800 text-[11px] uppercase tracking-[0.16em]">
                {appointment.rescheduleCount}x rescheduled
              </Badge>
            ) : null}
          </div>
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">{pageTitle}</h1>
            {isInternalAppointment ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Review the blocked time, assigned team coverage, and notes here without mixing it up with a customer job.
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[20px] border border-white/80 bg-white/85 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {isInternalAppointment ? "Block" : "Booked for"}
              </p>
              <p className="mt-2 text-base font-semibold text-slate-950">{appointmentSubjectLabel}</p>
              <p className="mt-1 text-sm text-slate-600">{appointmentSecondaryLabel}</p>
            </div>
            <div className="rounded-[20px] border border-white/80 bg-white/85 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Scheduled</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{formatDate(appointment.startTime)}</p>
              <p className="mt-1 text-sm text-slate-600">{formatTime(appointment.startTime)}</p>
            </div>
            <div className="rounded-[20px] border border-white/80 bg-white/85 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {isInternalAppointment ? "Coverage" : "Work in play"}
              </p>
              <p className="mt-2 text-base font-semibold text-slate-950">{appointmentValueLabel}</p>
              <p className="mt-1 text-sm text-slate-600">{appointmentLocationLabel}</p>
            </div>
          </div>
        </div>
      </section>

      {customerAddonRequests.length > 0 ? (
        <Card
          id="customer-addon-requests"
          className="scroll-mt-24 overflow-hidden border-orange-200 bg-orange-50/85 shadow-[0_14px_34px_rgba(249,115,22,0.12)] dark:border-orange-400/25 dark:bg-orange-500/10"
        >
          <CardHeader className="border-b border-orange-200/75 bg-white/55 px-4 py-4 dark:border-orange-400/20 dark:bg-white/5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base text-orange-950 dark:text-orange-100">Customer add-on request</CardTitle>
                <p className="mt-1 text-sm leading-5 text-orange-900/75 dark:text-orange-100/75">
                  Review this before the appointment changes. Approving adds the service to the job.
                </p>
              </div>
              <Badge className="shrink-0 rounded-full border border-orange-200 bg-white px-2.5 py-1 text-orange-900 hover:bg-white dark:border-orange-400/25 dark:bg-orange-500/15 dark:text-orange-100">
                {customerAddonRequests.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {customerAddonRequests.map((request) => {
              const alreadyAdded = existingServiceIds.has(request.addonServiceId);
              const catalogService = serviceCatalogRecords.find((service) => service.id === request.addonServiceId);
              const displayPrice =
                request.addonPrice != null
                  ? request.addonPrice
                  : catalogService?.price != null
                    ? Number(catalogService.price)
                    : null;
              const displayDuration = request.addonDurationMinutes ?? catalogService?.durationMinutes ?? null;
              const isAddingThisRequest = addingRequestedAddonId === request.addonServiceId;
              const isDecliningThisRequest = decliningRequestedAddonId === request.addonServiceId;
              return (
                <div
                  key={`priority-${request.activityId}`}
                  className="rounded-2xl border border-orange-200 bg-background/95 p-4 shadow-sm dark:border-orange-400/20 dark:bg-slate-950/45"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="space-y-1">
                        <p className="break-words text-base font-semibold text-foreground">{request.addonName}</p>
                        <p className="text-sm leading-5 text-muted-foreground">
                          {request.clientName ? `${request.clientName} requested this` : "Customer requested this"}
                          {request.parentServiceName ? ` with ${request.parentServiceName}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground dark:bg-white/5">
                          {displayPrice != null && Number.isFinite(displayPrice)
                            ? `Adds ${formatCurrency(displayPrice)}`
                            : "Price from catalog"}
                        </span>
                        {displayDuration ? (
                          <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground dark:bg-white/5">
                            Adds {displayDuration} min
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid shrink-0 gap-2 sm:grid-cols-2 md:flex md:flex-col md:items-end">
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11 w-full rounded-full px-4 md:w-auto"
                        variant={alreadyAdded ? "outline" : "default"}
                        onClick={() => void handleApproveRequestedService(request, alreadyAdded)}
                        disabled={addingService || reviewingAddonRequest || (!alreadyAdded && !catalogService)}
                      >
                        {isAddingThisRequest ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : alreadyAdded ? (
                          <CheckCircle className="mr-2 h-4 w-4" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        {alreadyAdded ? "Mark approved" : catalogService ? "Approve & add" : "Unavailable"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11 w-full rounded-full border-border bg-background/85 px-4 text-muted-foreground hover:bg-muted hover:text-foreground md:w-auto dark:bg-white/5 dark:hover:bg-white/10"
                        onClick={() => void handleDeclineRequestedService(request)}
                        disabled={reviewingAddonRequest || addingService}
                      >
                        {isDecliningThisRequest ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <X className="mr-2 h-4 w-4" />
                        )}
                        Decline
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to={returnTo}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
        </div>

        <div className="hidden w-full items-center gap-2 sm:flex sm:flex-wrap lg:w-auto lg:justify-end">
          {canQuickEditAppointment ? (
            <Button size="sm" onClick={handleOpenEditDialog}>
              <Clock className="h-4 w-4 mr-2" />
              {primaryEditLabel}
            </Button>
          ) : null}

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

          {!isInternalAppointment && appointment.status !== "cancelled" && appointment.status !== "no-show" ? (
            <Button variant="outline" size="sm" onClick={() => void handleSendConfirmation()} disabled={isActionLoading}>
              {sendingConfirmation ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Send Confirmation
            </Button>
          ) : null}

          {canEditDeposit ? (
            <Button variant="outline" size="sm" onClick={handleOpenDepositSettingsDialog} disabled={updatingNotes}>
              <DollarSign className="h-4 w-4 mr-2" />
              {Number(appointment.depositAmount ?? 0) > 0 ? "Edit Deposit" : "Set Deposit"}
            </Button>
          ) : null}

          {isInternalAppointment && nextPaymentAmount > 0 ? (
            <Button variant="outline" size="sm" onClick={handleOpenDepositDialog} disabled={recordingDeposit}>
              {recordingDeposit ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4 mr-2" />
              )}
              Mark Paid
            </Button>
          ) : null}

          {isInternalAppointment && hasRecordedPayment ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReverseDepositOpen(true)}
              disabled={reversingDeposit}
            >
              {reversingDeposit ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Reverse Payment
            </Button>
          ) : null}

          {permissions.has("appointments.write") ? (
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-700"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isActionLoading}
            >
              {deletingAppointment ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {isInternalAppointment ? "Delete Block" : "Delete Appointment"}
            </Button>
          ) : null}

          {canQuickCompleteAppointment && (
            <Button
              variant="outline"
              size="sm"
              className="border-green-500 text-green-700 hover:bg-green-50"
              onClick={() => {
                const hasServices = appointmentServices && appointmentServices.length > 0;
                const hasTotalPrice = getDisplayedAppointmentAmount(appointment) > 0;
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

          {canQuickCancelAppointment && (
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

          {!isInternalAppointment && !invoiceFetching && !invoice && appointment.status !== "cancelled" && (
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

          {!isInternalAppointment && !quoteFetching && !quote && appointment.status !== "cancelled" && appointment.client?.id && (
            <Button variant="outline" size="sm" asChild>
              <Link
                to={`/quotes/new?appointmentId=${appointment.id}&clientId=${appointment.client.id}`}
              >
                <FileText className="h-4 w-4 mr-2" />
                Create Quote
              </Link>
            </Button>
          )}

            {!isInternalAppointment && invoice && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/invoices/${invoice.id}`}>
                  <FileText className="h-4 w-4 mr-2" />
                  View Invoice
                </Link>
              </Button>
            )}

            {!isInternalAppointment && invoice && invoiceAllowsPayment(invoice.status) && invoice.status !== "paid" && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/invoices/${invoice.id}?recordPayment=1`}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Record Payment
                </Link>
              </Button>
            )}

            {!isInternalAppointment && quote && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/quotes/${quote.id}`}>
                  <FileText className="h-4 w-4 mr-2" />
                  View Quote
                </Link>
              </Button>
            )}

            {nextPaymentAmount > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={handleOpenDepositDialog}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  {showsCollectPaymentLabel || depositAmountValue <= 0 ? "Collect Payment" : "Collect Deposit"}
                </Button>
                {!hasRecordedPayment &&
                appointment.depositAmount != null &&
                appointment.depositAmount > 0 &&
                canOpenExternalPaymentProvider() ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleStripeDepositCheckout()}
                    disabled={creatingStripeDepositSession}
                  >
                    {creatingStripeDepositSession ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DollarSign className="h-4 w-4 mr-2" />}
                    Pay with Stripe
                  </Button>
                ) : null}
              </>
            )}
          </div>

        <div className="flex items-center gap-2 sm:hidden">
          <div className="grid w-full gap-2">
            <div className="grid grid-cols-2 gap-2">
              {canQuickEditAppointment ? (
                <Button
                  variant="outline"
                  className="justify-center"
                  onClick={handleOpenEditDialog}
                  disabled={isActionLoading}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  {primaryEditLabel}
                </Button>
              ) : null}

              {canQuickCancelAppointment ? (
                <Button
                  variant="outline"
                  className={cn(
                    "justify-center border-red-500 text-red-700 hover:bg-red-50 hover:text-red-700",
                    !canQuickEditAppointment && "col-span-2"
                  )}
                  onClick={() => setShowCancelDialog(true)}
                  disabled={isActionLoading}
                >
                  {cancelling ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <X className="h-4 w-4 mr-2" />
                  )}
                  Cancel
                </Button>
              ) : canQuickEditAppointment ? (
                <Button
                  variant="outline"
                  className="justify-center"
                  onClick={() => setShowMobileActions(true)}
                >
                  <MoreHorizontal className="h-4 w-4 mr-2" />
                  More
                </Button>
              ) : null}
            </div>

            {isInternalAppointment && (nextPaymentAmount > 0 || hasRecordedPayment) ? (
              <Button
                variant="outline"
                className="w-full justify-center"
                onClick={() => (hasRecordedPayment && nextPaymentAmount <= 0 ? setReverseDepositOpen(true) : handleOpenDepositDialog())}
                disabled={hasRecordedPayment && nextPaymentAmount <= 0 ? reversingDeposit : recordingDeposit}
              >
                {(hasRecordedPayment && nextPaymentAmount <= 0 ? reversingDeposit : recordingDeposit) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : hasRecordedPayment && nextPaymentAmount <= 0 ? (
                  <RotateCcw className="h-4 w-4 mr-2" />
                ) : (
                  <DollarSign className="h-4 w-4 mr-2" />
                )}
                {hasRecordedPayment && nextPaymentAmount <= 0 ? "Reverse Payment" : "Mark Paid"}
              </Button>
            ) : null}

            {!isInternalAppointment && canEditDeposit ? (
              <Button
                variant="outline"
                className="w-full justify-center"
                onClick={handleOpenDepositSettingsDialog}
                disabled={updatingNotes}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                {Number(appointment.depositAmount ?? 0) > 0 ? "Edit Deposit" : "Set Deposit"}
              </Button>
            ) : null}

              {permissions.has("appointments.write") ? (
                <Button
                  variant="outline"
                  className="w-full justify-center border-red-300 text-red-700 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isActionLoading}
                >
                  {deletingAppointment ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  {isInternalAppointment ? "Delete Block" : "Delete Appointment"}
                </Button>
              ) : null}

            {canQuickCompleteAppointment ? (
              <Button
              className="w-full"
              onClick={() => {
                const hasServices = appointmentServices && appointmentServices.length > 0;
                const hasTotalPrice = getDisplayedAppointmentAmount(appointment) > 0;
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

            <Sheet open={showMobileActions} onOpenChange={setShowMobileActions}>
              <Button
                variant="outline"
                className="w-full justify-center"
                aria-label="More appointment actions"
                onClick={() => {
                  void triggerSelectionFeedback();
                  setShowMobileActions(true);
                }}
              >
                <MoreHorizontal className="h-4 w-4 mr-2" />
                More actions
              </Button>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-[1.75rem] pb-[max(1rem,env(safe-area-inset-bottom))]">
              <SheetHeader>
                <SheetTitle>Appointment actions</SheetTitle>
                <SheetDescription>
                  Open the next workflow step for this appointment without leaving the detail view guessing.
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-2">
                {canQuickEditAppointment ? (
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      setShowMobileActions(false);
                      handleOpenEditDialog();
                    }}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    {appointment.status === "completed" ? "Edit appointment details" : "Reschedule appointment"}
                  </Button>
                ) : null}
                {!isInternalAppointment && appointment.status !== "cancelled" && appointment.status !== "no-show" ? (
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      setShowMobileActions(false);
                      void handleSendConfirmation();
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Send confirmation
                  </Button>
                ) : null}
                {!isInternalAppointment && !invoiceFetching && !invoice && appointment.status !== "cancelled" ? (
                  <Button asChild variant="outline" className="justify-start">
                    <Link
                      to={`/invoices/new?appointmentId=${appointment.id}${
                        appointment.client?.id ? `&clientId=${appointment.client.id}` : ""
                      }`}
                      onClick={() => setShowMobileActions(false)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Create invoice
                    </Link>
                  </Button>
                ) : null}
                {!isInternalAppointment && !quoteFetching && !quote && appointment.status !== "cancelled" && appointment.client?.id ? (
                  <Button asChild variant="outline" className="justify-start">
                    <Link
                      to={`/quotes/new?appointmentId=${appointment.id}&clientId=${appointment.client.id}`}
                      onClick={() => setShowMobileActions(false)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Create quote
                    </Link>
                  </Button>
                ) : null}
                {!isInternalAppointment && invoice ? (
                  <Button asChild variant="outline" className="justify-start">
                    <Link to={`/invoices/${invoice.id}`} onClick={() => setShowMobileActions(false)}>
                      <FileText className="mr-2 h-4 w-4" />
                      View invoice
                    </Link>
                  </Button>
                ) : null}
                {!isInternalAppointment && invoice && invoiceAllowsPayment(invoice.status) && invoice.status !== "paid" ? (
                  <Button asChild variant="outline" className="justify-start">
                    <Link to={`/invoices/${invoice.id}?recordPayment=1`} onClick={() => setShowMobileActions(false)}>
                      <DollarSign className="mr-2 h-4 w-4" />
                      Record payment
                    </Link>
                  </Button>
                ) : null}
                {!isInternalAppointment && quote ? (
                  <Button asChild variant="outline" className="justify-start">
                    <Link to={`/quotes/${quote.id}`} onClick={() => setShowMobileActions(false)}>
                      <FileText className="mr-2 h-4 w-4" />
                      View quote
                    </Link>
                  </Button>
                ) : null}
                {nextPaymentAmount > 0 ? (
                  <>
                    <Button
                      variant="outline"
                      className="justify-start"
                      onClick={() => {
                        setShowMobileActions(false);
                        handleOpenDepositDialog();
                      }}
                    >
                      <DollarSign className="mr-2 h-4 w-4" />
                      {showsCollectPaymentLabel || depositAmountValue <= 0 ? "Collect payment" : "Collect deposit"}
                    </Button>
                    {!hasRecordedPayment &&
                    appointment.depositAmount != null &&
                    appointment.depositAmount > 0 &&
                    canOpenExternalPaymentProvider() ? (
                      <Button
                        variant="outline"
                        className="justify-start"
                        disabled={creatingStripeDepositSession}
                        onClick={() => {
                          setShowMobileActions(false);
                          void handleStripeDepositCheckout();
                        }}
                      >
                        {creatingStripeDepositSession ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                        Pay with Stripe
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {permissions.has("appointments.write") ? (
                  <Button
                    variant="outline"
                    className="justify-start border-red-300 text-red-700 hover:bg-red-50 hover:text-red-700"
                    onClick={() => {
                      setShowMobileActions(false);
                      setShowDeleteDialog(true);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isInternalAppointment ? "Delete block" : "Delete appointment"}
                  </Button>
                ) : null}
                {hasRecordedPayment ? (
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      setShowMobileActions(false);
                      setReverseDepositOpen(true);
                    }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {showsPaidStatusInsteadOfDeposit ? "Reverse payment" : "Reverse deposit"}
                  </Button>
                ) : null}
                {(VALID_TRANSITIONS[appointment.status] ?? []).map((status) => (
                  <Button
                    key={status}
                    variant="outline"
                    className="justify-start capitalize"
                    onClick={() => {
                      setShowMobileActions(false);
                      void handleStatusChange(status);
                    }}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Mark {status.replace("-", " ")}
                  </Button>
                ))}
                {canQuickCancelAppointment ? (
                  <Button
                    variant="outline"
                    className="justify-start border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
                    onClick={() => {
                      setShowMobileActions(false);
                      setShowCancelDialog(true);
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel appointment
                  </Button>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
          </div>
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

      {!isInternalAppointment ? (
        <Card className="border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.08),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">Operations hub</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Reach the client, move the job forward, and jump straight to the details that matter on site.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em]">
                  {appointment.isMobile ? "Mobile job" : "Shop workflow"}
                </Badge>
                {(appointment as any).vehicleOnSite ? (
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    Vehicle on site
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reach client</p>
                <span className="text-xs text-muted-foreground">{appointmentClientPhoneLabel || appointmentClientEmail || "No live contact on file"}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <OperationalActionButton icon={Phone} label="Call client" detail={appointmentClientPhoneLabel ?? "No phone"} href={appointmentCallHref} />
                <OperationalActionButton icon={MessageSquare} label="Text client" detail={appointmentClientPhoneLabel ?? "No phone"} href={appointmentSmsHref} />
                <OperationalActionButton icon={Mail} label="Email client" detail={appointmentClientEmail ?? "No email"} href={appointmentEmailHref} />
                <OperationalActionButton icon={MapPin} label="Open in Maps" detail={appointmentLocationLabel} href={appointmentMapsHref} />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Job state</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {canMarkArrived ? (
                  <OperationalActionButton
                    icon={MapPin}
                    label="Mark arrived"
                    detail="Keep the job visible on site"
                    onClick={() =>
                      void handleOperationalUpdate({
                        successLabel: "Vehicle marked on site",
                        updateValues: {
                          vehicleOnSite: true,
                        },
                      })
                    }
                  />
                ) : null}
                {canStartJob ? (
                  <OperationalActionButton
                    icon={Clock}
                    label="Start job"
                    detail="Move into active work"
                    onClick={() =>
                      void handleOperationalUpdate({
                        successLabel: "Job started",
                        nextStatus: appointment.status === "scheduled" ? "confirmed" : "in_progress",
                        updateValues: {
                          vehicleOnSite: true,
                          jobPhase: "active_work",
                          jobStartTime: (appointment as any).jobStartTime ?? new Date().toISOString(),
                        },
                      })
                    }
                  />
                ) : null}
                {canSetWaiting ? (
                  <OperationalActionButton
                    icon={Clock}
                    label="Waiting"
                    detail="Pause for parts, approval, or cooldown"
                    onClick={() =>
                      void handleOperationalUpdate({
                        successLabel: "Job marked waiting",
                        updateValues: {
                          vehicleOnSite: true,
                          jobPhase: "waiting",
                        },
                      })
                    }
                  />
                ) : null}
                {canSetCuring ? (
                  <OperationalActionButton
                    icon={Clock}
                    label="Curing"
                    detail="Keep the team synced on cure time"
                    onClick={() =>
                      void handleOperationalUpdate({
                        successLabel: "Job marked curing",
                        updateValues: {
                          vehicleOnSite: true,
                          jobPhase: "curing",
                        },
                      })
                    }
                  />
                ) : null}
                {canSetPickupReady ? (
                  <OperationalActionButton
                    icon={CalendarDays}
                    label="Pickup ready"
                    detail={(appointment as any).pickupReadyTime ? "Already stamped ready" : "Stamp handoff timing now"}
                    onClick={() =>
                      void handleOperationalUpdate({
                        successLabel: "Marked ready for pickup",
                        updateValues: {
                          vehicleOnSite: true,
                          jobPhase: "pickup_ready",
                          pickupReadyTime: (appointment as any).pickupReadyTime ?? new Date().toISOString(),
                        },
                      })
                    }
                  />
                ) : null}
                {canQuickCompleteAppointment ? (
                  <OperationalActionButton
                    icon={CheckCircle}
                    label="Complete"
                    detail="Wrap the visit and lock billing follow-through"
                    onClick={() => {
                      const hasServices = appointmentServices && appointmentServices.length > 0;
                      const hasTotalPrice = getDisplayedAppointmentAmount(appointment) > 0;
                      if (!hasServices && !hasTotalPrice) {
                        void triggerSelectionFeedback();
                        setShowCompleteWarningDialog(true);
                      } else {
                        void handleComplete();
                      }
                    }}
                  />
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Jump to</p>
              <div className="flex flex-wrap gap-2">
                {quickJumpLinks.map((link) => (
                  <Button key={link.href} type="button" variant="outline" size="sm" className="rounded-full" asChild>
                    <a href={link.href}>{link.label}</a>
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <JobLifecycleStepper
        status={appointment.status}
        invoicedAt={(appointment as any).invoicedAt ?? null}
        paidAt={(appointment as any).paidAt ?? null}
        paymentRecorded={hasRecordedPayment}
      />

      {!isInternalAppointment && (hasPlaceholderClient || hasPlaceholderVehicle || missingLinkedRecords) && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-medium">
                {missingLinkedRecords
                  ? "This appointment is currently an internal block."
                  : "This appointment is still using placeholder booking records."}
              </p>
              <p className="text-amber-800">
                Attach the real client and vehicle before sending documents or relying on this record for follow-up.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            {(hasPlaceholderClient || missingLinkedRecords) ? (
              <Button
                variant="outline"
                size="sm"
                className="border-amber-300 bg-background/70 hover:bg-background"
                onClick={handleOpenEditDialog}
              >
                Attach client and vehicle
              </Button>
            ) : null}
            {hasPlaceholderClient ? (
              <Button variant="outline" size="sm" asChild className="border-amber-300 bg-background/70 hover:bg-background">
                <Link to={withReturn("/clients")}>Open clients</Link>
              </Button>
            ) : null}
            {hasPlaceholderVehicle && appointment.client?.id ? (
              <Button variant="outline" size="sm" asChild className="border-amber-300 bg-background/70 hover:bg-background">
                <Link to={withReturn(`/clients/${appointment.client.id}`)}>Open client record</Link>
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {appointment && !isInternalAppointment ? (
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
      ) : null}

      {!isInternalAppointment ? <RelatedRecordsPanel records={relatedRecords} loading={fetching} /> : null}

      {!isInternalAppointment && (quoteNeedsFollowUp || invoiceNeedsFollowUp) && (
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
              <Card id="appointment-schedule-card" className="scroll-mt-24">
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
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Job lifecycle</p>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">In-shop timeline</p>
                      </div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Drop-off</p>
                          <p className="text-sm font-medium">{formatDateTime((appointment as any).jobStartTime ?? appointment.startTime)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Vehicle leaves shop</p>
                          <p className="text-sm font-medium">{formatDateTime((appointment as any).expectedCompletionTime)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Current stage</p>
                          <p className="text-sm font-medium">{JOB_PHASE_LABELS[String((appointment as any).jobPhase ?? "scheduled")] ?? "Scheduled"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Pickup ready</p>
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

                  {appointmentSource ? (
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Created from {appointmentSource.label}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {appointmentSource.type === "booking_request" && appointmentSource.bookingRequestId
                              ? `Booking request ID: ${appointmentSource.bookingRequestId}`
                              : appointmentSource.leadClientId
                                ? `Lead ID: ${appointmentSource.leadClientId}`
                                : "Source record linked to this appointment"}
                          </p>
                        </div>
                        {appointmentSourceHref ? (
                          <Button asChild variant="outline" size="sm" className="shrink-0">
                            <Link to={appointmentSourceHref}>Open source</Link>
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {appointmentSourceRequestedServices ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Requested work</p>
                            <p className="mt-1 text-sm text-slate-900">{appointmentSourceRequestedServices}</p>
                          </div>
                        ) : null}
                        {appointmentSourceSummary ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Source summary</p>
                            <p className="mt-1 text-sm text-slate-900">{appointmentSourceSummary}</p>
                          </div>
                        ) : null}
                        {appointmentSourceLeadSource ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Lead source</p>
                            <p className="mt-1 text-sm text-slate-900">{appointmentSourceLeadSource}</p>
                          </div>
                        ) : null}
                        {appointmentSourceAddress ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Requested address</p>
                            <p className="mt-1 text-sm text-slate-900">{appointmentSourceAddress}</p>
                          </div>
                        ) : null}
                        {appointmentSourceCustomerName || appointmentSourcePhone || appointmentSourceEmail ? (
                          <div className="sm:col-span-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Captured contact</p>
                            <p className="mt-1 text-sm text-slate-900">
                              {[appointmentSourceCustomerName, appointmentSourcePhone, appointmentSourceEmail].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {appointment.depositAmount != null && appointment.depositAmount > 0 && (
                    <div className="flex items-start gap-3">
                      <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">
                          {isInternalAppointment ? "Payment" : "Deposit"}: {formatCurrency(appointment.depositAmount)}
                        </p>
                        <p className="text-sm">
                          {hasRecordedPayment ? (
                            <span className="text-green-600 font-medium">
                              {showsPaidStatusInsteadOfDeposit
                                ? "Paid in full"
                                : isInternalAppointment
                                  ? "Recorded"
                                  : "Collected"}
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium">
                              {isInternalAppointment ? "Waiting on payment" : "Waiting on collection"}
                            </span>
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

              {customerAddonRequests.length > 0 ? (
                <Card
                  id="customer-addon-requests-detail"
                  className="scroll-mt-24 border-orange-200 bg-orange-50/80 shadow-sm dark:border-orange-400/25 dark:bg-orange-500/10"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Customer add-on requests</CardTitle>
                        <p className="mt-1 text-sm leading-5 text-orange-900/75 dark:text-orange-100/75">
                          Customer-approved revenue waiting for review. Approving adds the service and sends the updated appointment confirmation.
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="rounded-full border border-orange-200 bg-white text-orange-900 dark:border-orange-400/25 dark:bg-orange-500/15 dark:text-orange-100"
                      >
                        {customerAddonRequests.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {customerAddonRequests.map((request) => {
                      const alreadyAdded = existingServiceIds.has(request.addonServiceId);
                      const catalogService = serviceCatalogRecords.find(
                        (service) => service.id === request.addonServiceId
                      );
                      const displayPrice =
                        request.addonPrice != null
                          ? request.addonPrice
                          : catalogService?.price != null
                            ? Number(catalogService.price)
                            : null;
                      const displayDuration = request.addonDurationMinutes ?? catalogService?.durationMinutes ?? null;
                      const isAddingThisRequest = addingRequestedAddonId === request.addonServiceId;
                      const isDecliningThisRequest = decliningRequestedAddonId === request.addonServiceId;
                      return (
                        <div
                          key={request.activityId}
                          className="rounded-2xl border border-orange-200 bg-background p-4 shadow-sm dark:border-orange-400/20 dark:bg-slate-950/40"
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0 space-y-3">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="break-words text-base font-semibold text-foreground">{request.addonName}</p>
                                  {alreadyAdded ? <StatusBadge status="added" type="job" /> : null}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {request.clientName ? `${request.clientName} requested this` : "Customer requested this"}
                                  {request.parentServiceName ? ` with ${request.parentServiceName}` : ""}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground dark:bg-white/5">
                                  {displayPrice != null && Number.isFinite(displayPrice)
                                    ? `Adds ${formatCurrency(displayPrice)}`
                                    : "Price from catalog"}
                                </span>
                                {displayDuration ? (
                                  <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground dark:bg-white/5">
                                    Adds {displayDuration} min
                                  </span>
                                ) : null}
                                {request.createdAt ? (
                                  <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground dark:bg-white/5">
                                    Requested {formatDateTime(request.createdAt)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 md:items-end">
                              {!catalogService && !alreadyAdded ? (
                                <p className="max-w-56 text-sm text-muted-foreground">
                                  This add-on is no longer active in the service catalog.
                                </p>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                className="min-h-10 w-full sm:w-auto"
                                variant={alreadyAdded ? "outline" : "default"}
                                onClick={() => void handleApproveRequestedService(request, alreadyAdded)}
                                disabled={addingService || reviewingAddonRequest || (!alreadyAdded && !catalogService)}
                              >
                                {isAddingThisRequest ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : alreadyAdded ? (
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                ) : (
                                  <Plus className="mr-2 h-4 w-4" />
                                )}
                                {alreadyAdded ? "Mark approved" : catalogService ? "Approve & add" : "Unavailable"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="min-h-10 w-full border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground sm:w-auto dark:bg-white/5 dark:hover:bg-white/10"
                                onClick={() => void handleDeclineRequestedService(request)}
                                disabled={reviewingAddonRequest || addingService}
                              >
                                {isDecliningThisRequest ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <X className="mr-2 h-4 w-4" />
                                )}
                                Decline request
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ) : null}

              <Card id="appointment-services-card" className="scroll-mt-24">
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

                  {appointmentAddonSuggestions.length > 0 ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-amber-950">Suggested add-ons</p>
                          <p className="text-xs text-amber-800">
                            Quick add linked upgrades already configured for the booked services.
                          </p>
                        </div>
                        <Badge variant="outline" className="w-fit border-amber-300 bg-white text-amber-900">
                          Revenue lift
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-3">
                        {appointmentAddonSuggestions.map((suggestion) => (
                          <div key={suggestion.baseService.id} className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-800">
                              For {suggestion.baseService.name ?? "selected service"}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {suggestion.linkedAddons.map((addon) => (
                                <button
                                  key={addon.id}
                                  type="button"
                                  className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => void handleAddSuggestedService(addon)}
                                  disabled={addingService}
                                >
                                  <span className="min-w-0 break-words font-medium text-slate-950">{addon.name ?? "Add-on"}</span>
                                  <span className="shrink-0 text-slate-600">{formatCurrency(Number(addon.price ?? 0))}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(appointmentServices as any[])?.length ? (
                    <div className="space-y-3">
                      {((appointmentServices as any[]) ?? []).map((item: any) => {
                        const isCompleted = completedServiceIds.get(item.id) === true;
                        const serviceUnitPrice = Number(item.unitPrice ?? item.service?.price ?? 0);
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
                                {formatCurrency(serviceUnitPrice)}
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
              <Card id="appointment-notes-card" className="scroll-mt-24">
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
              {isInternalAppointment ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Block details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {isFullDayCalendarBlock(appointment) ? "Full day blocked" : "Specific time blocked"}
                        </p>
                        <p className="text-muted-foreground">{formatDateTime(appointment.startTime)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Coverage</p>
                        <p className="text-muted-foreground">
                          {appointment.assignedStaff
                            ? `${appointment.assignedStaff.firstName} ${appointment.assignedStaff.lastName}`
                            : "Business-wide block"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Location</p>
                        <p className="text-muted-foreground">{appointmentLocationLabel}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div id="appointment-client-card" className="scroll-mt-24">
                    <ClientCard client={appointment.client} locationLabel={appointmentLocationLabel} mapsHref={appointmentMapsHref} />
                  </div>
                  <div id="appointment-vehicle-card" className="scroll-mt-24">
                    <VehicleCard vehicle={appointment.vehicle} clientId={appointment.client?.id} />
                  </div>
                  <InvoiceCard invoice={invoice} invoiceFetching={invoiceFetching} appointmentId={appointment.id} />
                </>
              )}

              {/* Financial Summary Card */}
              <div id="appointment-finance-card" className="scroll-mt-24">
              <FinancialSummaryCard 
                subtotal={appointment.subtotal}
                taxRate={appointment.taxRate}
                taxAmount={appointment.taxAmount}
                applyTax={appointment.applyTax}
                adminFeeRate={appointment.adminFeeRate}
                adminFeeAmount={appointment.adminFeeAmount}
                applyAdminFee={appointment.applyAdminFee}
                totalPrice={totalPriceValue}
                depositAmount={appointment.depositAmount}
                collectedAmount={normalizedCollectedAmount}
                balanceDue={remainingBalanceValue}
                paidInFull={showsPaidStatusInsteadOfDeposit}
                depositSatisfied={financeState.depositSatisfied}
                paymentStateOverride={
                  showsPaidStatusInsteadOfDeposit
                    ? {
                        rowLabel: "Status",
                        stateLabel: "Paid",
                        detail: "This appointment has been marked paid.",
                        amountLabel: "-",
                        showRemainingBalance: false,
                      }
                    : undefined
                }
                depositActionLabel={
                  nextPaymentAmount > 0
                    ? isInternalAppointment
                        ? "Mark paid"
                        : showsCollectPaymentLabel || depositAmountValue <= 0
                          ? "Collect payment"
                          : "Collect deposit"
                    : null
                }
                onDepositAction={
                  nextPaymentAmount > 0
                    ? handleOpenDepositDialog
                    : null
                }
                depositActionDisabled={
                  recordingDeposit ||
                  nextPaymentAmount <= 0
                }
                secondaryDepositActionLabel={
                  hasRecordedPayment
                    ? isInternalAppointment
                      ? "Reverse payment"
                      : showsPaidStatusInsteadOfDeposit
                        ? "Reverse payment"
                        : "Reverse deposit collection"
                    : null
                }
                onSecondaryDepositAction={hasRecordedPayment ? () => setReverseDepositOpen(true) : null}
                secondaryDepositActionDisabled={reversingDeposit}
                pricingActionLabel="Edit pricing"
                onPricingAction={handleOpenPricingDialog}
                pricingActionDisabled={updatingNotes}
              />
              </div>

              {canEditDeposit ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleOpenDepositSettingsDialog}
                  disabled={updatingNotes}
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  {Number(appointment.depositAmount ?? 0) > 0 ? "Edit deposit / partial payment" : "Set deposit / partial payment"}
                </Button>
              ) : null}

              {!isInternalAppointment ? (
                <div id="appointment-media-card" className="scroll-mt-24">
                <EntityCollaborationCard
                  entityType="appointment"
                  entityId={appointment.id}
                  records={((activityLogs ?? []) as any[])}
                  fetching={activityFetching}
                  canWrite={permissions.has("appointments.write")}
                  title="Job photos & activity"
                  showNoteComposer={false}
                  onCreated={() => {
                    void refetchActivity();
                    void refetchAppointment();
                  }}
                />
                </div>
              ) : null}

              {!isInternalAppointment ? (
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
              ) : null}

            </div>
          </div>
      </div>

      <Dialog open={recordDepositOpen} onOpenChange={setRecordDepositOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isInternalAppointment ? "Mark Payment" : showsCollectPaymentLabel || depositAmountValue <= 0 ? "Collect Payment" : "Collect Deposit"}</DialogTitle>
            <DialogDescription>
              {isInternalAppointment
                ? "Record this internal appointment amount as already settled without creating an invoice."
                : showsCollectPaymentLabel || depositAmountValue <= 0
                  ? "Record the remaining appointment balance without changing the rest of the booking."
                  : "Collect the appointment deposit now without changing the rest of the booking."}
            </DialogDescription>
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
                {isInternalAppointment
                  ? "Amount to record"
                  : showsCollectPaymentLabel || depositAmountValue <= 0
                    ? "Amount due now"
                    : "Deposit to collect"}: {formatCurrency(nextPaymentAmount)}
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
                placeholder="Optional note for this payment"
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
              {isInternalAppointment ? "Mark paid" : showsCollectPaymentLabel || depositAmountValue <= 0 ? "Collect payment" : "Collect deposit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDepositOpen} onOpenChange={setEditDepositOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set deposit or partial payment</DialogTitle>
            <DialogDescription>
              Choose how much you want to collect up front for this appointment. Leave it blank or set it to 0 to remove the deposit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deposit-amount-draft">Deposit amount</Label>
              <Input
                id="deposit-amount-draft"
                inputMode="decimal"
                value={depositAmountDraft}
                onChange={(event) => setDepositAmountDraft(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Appointment total: {formatCurrency(getDisplayedAppointmentAmount(appointment ?? {}))}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDepositOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveDepositAmount()} disabled={updatingNotes}>
              {updatingNotes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editPricingOpen} onOpenChange={setEditPricingOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit pricing</DialogTitle>
            <DialogDescription>
              Adjust taxes and fees the same way you would on an invoice. Service subtotal comes from the appointment's booked services.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Services subtotal</span>
                <span className="font-medium">{formatCurrency(pricingSubtotal)}</span>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Apply tax</p>
                  <p className="text-xs text-muted-foreground">Use a percentage on top of the services subtotal and admin fee.</p>
                </div>
                <Switch checked={pricingApplyTaxDraft} onCheckedChange={setPricingApplyTaxDraft} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="appointment-pricing-tax-rate" className="text-sm text-muted-foreground">
                  Tax rate
                </Label>
                <div className="flex items-center">
                  <Input
                    id="appointment-pricing-tax-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={pricingTaxRateDraft}
                    onChange={(event) => setPricingTaxRateDraft(event.target.value)}
                    disabled={!pricingApplyTaxDraft}
                    className="h-8 w-20 rounded-r-none px-2 text-right"
                  />
                  <span className="inline-flex h-8 items-center rounded-r-md border border-l-0 border-input bg-muted px-2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Add admin fee</p>
                  <p className="text-xs text-muted-foreground">Adds an appointment-level admin fee based on the services subtotal.</p>
                </div>
                <Switch checked={pricingApplyAdminFeeDraft} onCheckedChange={setPricingApplyAdminFeeDraft} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="appointment-pricing-admin-fee-rate" className="text-sm text-muted-foreground">
                  Admin fee
                </Label>
                <div className="flex items-center">
                  <Input
                    id="appointment-pricing-admin-fee-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={pricingAdminFeeRateDraft}
                    onChange={(event) => setPricingAdminFeeRateDraft(event.target.value)}
                    disabled={!pricingApplyAdminFeeDraft}
                    className="h-8 w-20 rounded-r-none px-2 text-right"
                  />
                  <span className="inline-flex h-8 items-center rounded-r-md border border-l-0 border-input bg-muted px-2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(pricingSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Admin fee{pricingApplyAdminFeeDraft && pricingAdminFeeRateValue > 0 ? ` (${pricingAdminFeeRateValue.toFixed(2)}%)` : ""}
                  </span>
                  <span className="font-medium">{formatCurrency(pricingAdminFeePreview)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Tax{pricingApplyTaxDraft && pricingTaxRateValue > 0 ? ` (${pricingTaxRateValue.toFixed(2)}%)` : ""}
                  </span>
                  <span className="font-medium">{formatCurrency(pricingTaxPreview)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(pricingTotalPreview)}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditPricingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSavePricing()} disabled={updatingNotes}>
              {updatingNotes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save pricing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={reverseDepositOpen} onOpenChange={setReverseDepositOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isInternalAppointment || showsPaidStatusInsteadOfDeposit ? "Reverse payment?" : "Reverse deposit collection?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isInternalAppointment
                ? "This will mark the internal appointment amount as unpaid again."
                : showsPaidStatusInsteadOfDeposit
                  ? "This will reverse the recorded appointment payment. Use this if the payment record was entered by mistake."
                  : "This will mark the appointment deposit as uncollected again. Use this if the manual deposit record was entered by mistake."}
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-x-hidden overflow-y-auto p-0">
          <div className="space-y-4 p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>{appointment.status === "completed" ? "Edit Appointment Details" : "Edit Appointment"}</DialogTitle>
            <DialogDescription>
              {appointment.status === "completed"
                ? "Attach the real client and vehicle, adjust assignment, and clean up the finished record without reopening the job."
                : "Update the appointment details, timing, assignment, and notes for this booking."}
            </DialogDescription>
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
              <FormDatePicker
                id="edit-date"
                value={editDate}
                onChange={setEditDate}
                placeholder="Pick a date"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Client</Label>
                <FormSelect
                  value={editClientId || "__keep__"}
                  onChange={(value) => {
                    const nextClientId = value === "__keep__" ? "" : value;
                    setEditClientId(nextClientId);
                    setEditVehicleId("");
                  }}
                >
                  <option value="__keep__">
                    {clientsForEditFetching ? "Loading clients..." : "Select client"}
                  </option>
                  {clientOptions.map((client) => (
                    <option key={client.id} value={client.id}>
                      {[`${client.firstName} ${client.lastName}`, client.phone ?? client.email ?? null]
                        .filter(Boolean)
                        .join(" - ")}
                    </option>
                  ))}
                </FormSelect>
              </div>
              <div className="space-y-2">
                <Label>Vehicle</Label>
                <FormSelect
                  value={editVehicleId || "__none__"}
                  onChange={(value) => setEditVehicleId(value === "__none__" ? "" : value)}
                  disabled={!editClientId || vehiclesForEditFetching}
                >
                  <option value="__none__">
                    {!editClientId
                      ? "Select client first"
                      : vehiclesForEditFetching
                        ? "Loading vehicles..."
                        : "Select vehicle"}
                  </option>
                  {vehicleOptions.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {[vehicle.year, vehicle.make, vehicle.model, vehicle.color, vehicle.licensePlate]
                        .filter(Boolean)
                        .join(" ")}
                    </option>
                  ))}
                </FormSelect>
                {editClientId && !vehiclesForEditFetching && vehicleOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This client has no vehicles on file yet.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Start Time / End Time */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-start-time">{editVehicleOnSite ? "Work start" : "Start Time"}</Label>
                <ResponsiveTimeSelect
                  id="edit-start-time"
                  value={editStartTime}
                  onChange={setEditStartTime}
                  options={TIME_OPTIONS}
                  placeholder="Select a start time"
                  useNative={isSmallViewport}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end-time">{editVehicleOnSite ? "Work end" : "End Time"}</Label>
                <ResponsiveTimeSelect
                  id="edit-end-time"
                  value={editEndTime}
                  onChange={setEditEndTime}
                  options={TIME_OPTIONS}
                  placeholder="No end time"
                  useNative={isSmallViewport}
                  allowEmpty
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 p-3">
              <div className="flex items-start gap-3">
                <input
                  id="edit-vehicle-on-site"
                  type="checkbox"
                  checked={editVehicleOnSite}
                  onChange={(event) => setEditVehicleOnSite(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
                />
                <div>
                  <Label htmlFor="edit-vehicle-on-site">Multi-day / on-site job</Label>
                  <p className="text-xs text-muted-foreground">
                    Keep the vehicle visible in the shop across drop-off, work, waiting, curing, and pickup.
                  </p>
                </div>
              </div>

              {editVehicleOnSite ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-job-start-date">Drop-off date</Label>
                    <FormDatePicker
                      id="edit-job-start-date"
                      value={editJobStartDate}
                      onChange={setEditJobStartDate}
                      placeholder="Pick a date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-job-start-time">Drop-off time</Label>
                    <ResponsiveTimeSelect
                      id="edit-job-start-time"
                      value={editJobStartTime}
                      onChange={setEditJobStartTime}
                      options={TIME_OPTIONS}
                      placeholder="Select a time"
                      useNative={isSmallViewport}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-expected-completion-date">Pickup date</Label>
                    <FormDatePicker
                      id="edit-expected-completion-date"
                      value={editExpectedCompletionDate}
                      onChange={setEditExpectedCompletionDate}
                      placeholder="Pick a date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-expected-completion-time">Pickup time</Label>
                    <ResponsiveTimeSelect
                      id="edit-expected-completion-time"
                      value={editExpectedCompletionTime}
                      onChange={setEditExpectedCompletionTime}
                      options={TIME_OPTIONS}
                      placeholder="Select a time"
                      useNative={isSmallViewport}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Current stage</Label>
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
                    <Label htmlFor="edit-pickup-ready-date">Pickup ready</Label>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <FormDatePicker
                        id="edit-pickup-ready-date"
                        value={editPickupReadyDate}
                        onChange={setEditPickupReadyDate}
                        placeholder="Pick a date"
                        allowClear
                      />
                      <ResponsiveTimeSelect
                        value={editPickupReadyTime}
                        onChange={setEditPickupReadyTime}
                        options={TIME_OPTIONS}
                        placeholder="Not set"
                        useNative={isSmallViewport}
                        allowEmpty
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
          </div>
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isInternalAppointment ? "Delete this internal block?" : "Delete this appointment?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isInternalAppointment
                ? "This permanently removes the internal appointment and its attached services from the schedule."
                : "This permanently removes the appointment and its attached services from the schedule."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAppointment}>
              {isInternalAppointment ? "Keep block" : "Keep appointment"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteAppointment()}
              disabled={deletingAppointment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingAppointment ? "Deleting..." : isInternalAppointment ? "Delete block" : "Delete appointment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OperationalActionButton({
  icon: Icon,
  label,
  detail,
  href,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  detail: string;
  href?: string | null;
  onClick?: (() => void) | null;
}) {
  const content = (
    <>
      <div className="rounded-full bg-primary/10 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </>
  );

  const className =
    "flex items-center gap-3 rounded-[1rem] border border-border/70 bg-background/90 px-4 py-3 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-background";

  if (href) {
    return (
      <a
        href={href}
        className={className}
        onClick={() => {
          void triggerSelectionFeedback();
        }}
      >
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          void triggerSelectionFeedback();
          onClick();
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`${className} cursor-not-allowed opacity-70`} aria-disabled="true">
      {content}
    </div>
  );
}
