import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Link, Navigate, useOutletContext, useSearchParams } from "react-router";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Inbox,
  Loader2,
  MessageSquareMore,
  RefreshCcw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { API_BASE } from "@/api";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { NativeContactActionsCard } from "@/components/mobile/NativeContactActionsCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  selectorGroupClassName,
  selectorPillButtonClassName,
  selectorSelectContentClassName,
  selectorSelectTriggerClassName,
} from "@/components/shared/selectorStyles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { clearAuthState, getAuthToken } from "@/lib/auth";
import { triggerNativeHaptic } from "@/lib/nativeFieldOps";
import { getPreferredAuthorizedAppPath } from "@/lib/permissionRouting";
import { cn } from "@/lib/utils";
import type { AuthOutletContext } from "./_app";
import { toast } from "sonner";

type BookingRequestStatus =
  | "submitted_request"
  | "under_review"
  | "approved_requested_slot"
  | "awaiting_customer_selection"
  | "confirmed"
  | "declined"
  | "customer_requested_new_time"
  | "expired";

type OwnerReviewStatus =
  | "pending"
  | "approved_requested_slot"
  | "proposed_alternates"
  | "requested_new_time"
  | "declined";

type CustomerResponseStatus =
  | "pending"
  | "accepted_requested_slot"
  | "accepted_alternate_slot"
  | "requested_new_time"
  | "declined"
  | "expired";

type Flexibility = "exact_time_only" | "same_day_flexible" | "any_nearby_slot";

type OwnerRequestPolicy = {
  requireExactTime: boolean;
  allowTimeWindows: boolean;
  allowFlexibility: boolean;
  reviewMessage: string | null;
  allowAlternateSlots: boolean;
  alternateSlotLimit: number;
  alternateOfferExpiryHours: number | null;
};

type AlternateSlotOption = {
  id: string;
  startTime: string;
  endTime: string | null;
  label: string;
  expiresAt: string | null;
};

type OwnerBookingRequestRecord = {
  id: string;
  businessId: string;
  clientId: string | null;
  vehicleId: string | null;
  serviceId: string | null;
  locationId: string | null;
  appointmentId: string | null;
  status: BookingRequestStatus;
  ownerReviewStatus: OwnerReviewStatus;
  customerResponseStatus: CustomerResponseStatus;
  serviceMode: "in_shop" | "mobile";
  addonServiceIds: string[];
  serviceSummary: string;
  requestedDate: string | null;
  requestedTimeStart: string | null;
  requestedTimeEnd: string | null;
  requestedTimeLabel: string | null;
  requestedTimingSummary: string | null;
  customerTimezone: string;
  flexibility: Flexibility;
  ownerResponseMessage: string | null;
  customerResponseMessage: string | null;
  alternateSlotOptions: AlternateSlotOption[];
  requestPolicy: OwnerRequestPolicy;
  customer: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  };
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
    summary: string | null;
  };
  serviceAddress: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  serviceZip: string | null;
  notes: string | null;
  marketingOptIn: boolean;
  source: string | null;
  campaign: string | null;
  submittedAt: string;
  underReviewAt: string | null;
  ownerRespondedAt: string | null;
  approvedRequestedSlotAt: string | null;
  customerRespondedAt: string | null;
  confirmedAt: string | null;
  declinedAt: string | null;
  expiredAt: string | null;
  expiresAt: string | null;
  publicResponseUrl: string;
  confirmationUrl: string | null;
  portalUrl: string | null;
};

type BookingRequestListResponse = { records: OwnerBookingRequestRecord[] };
type BookingRequestDetailResponse = { record: OwnerBookingRequestRecord };
type BookingRequestActionResponse = {
  ok: true;
  record: OwnerBookingRequestRecord;
  appointmentId?: string;
  confirmationUrl?: string | null;
  portalUrl?: string | null;
  scheduledFor?: string | null;
};

type AvailabilityHintSlot = {
  startTime: string;
  endTime: string;
  label: string;
};

type AvailabilityHintsResponse = {
  date: string;
  timezone: string;
  durationMinutes: number;
  slots: AvailabilityHintSlot[];
};

type StatusFilter = "open" | "waiting" | "confirmed" | "declined" | "all";

type AlternateDialogState = {
  open: boolean;
  message: string;
  expiresInHours: string;
  date: Date | null;
  selectedSlots: AvailabilityHintSlot[];
};

type AskNewTimeDialogState = {
  open: boolean;
  message: string;
  expiresInHours: string;
};

type ApproveDialogState = {
  open: boolean;
  message: string;
};

type DeclineDialogState = {
  open: boolean;
  message: string;
};

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string; helper: string }> = [
  { id: "open", label: "Open queue", helper: "New requests and customer follow-ups waiting on the team." },
  { id: "waiting", label: "Waiting on customer", helper: "Alternate times or new-time prompts sent back out." },
  { id: "confirmed", label: "Confirmed", helper: "Requests already converted into real appointments." },
  { id: "declined", label: "Closed", helper: "Declined or expired requests." },
  { id: "all", label: "All", helper: "Everything in one list." },
];

const FLEXIBILITY_LABELS: Record<Flexibility, string> = {
  exact_time_only: "Exact time only",
  same_day_flexible: "Same day flexible",
  any_nearby_slot: "Any nearby slot",
};

const PROPOSE_EXPIRY_OPTIONS = [
  { value: "24", label: "24 hours" },
  { value: "48", label: "48 hours" },
  { value: "72", label: "72 hours" },
  { value: "168", label: "7 days" },
];

const ASK_NEW_TIME_EXPIRY_OPTIONS = [
  { value: "24", label: "24 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
];

const DEFAULT_OWNER_REQUEST_POLICY: OwnerRequestPolicy = {
  requireExactTime: false,
  allowTimeWindows: true,
  allowFlexibility: true,
  reviewMessage: null,
  allowAlternateSlots: true,
  alternateSlotLimit: 3,
  alternateOfferExpiryHours: 48,
};

function formatDateTime(
  value: string | null | undefined,
  timeZone?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone || undefined,
    ...options,
  }).format(parsed);
}

function formatDateLabel(value: string | null | undefined, timeZone?: string | null): string {
  if (!value) return "No requested date";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timeZone || undefined,
  }).format(parsed);
}

function formatAgeLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Just now";
  return formatDistanceToNow(parsed, { addSuffix: true });
}

function requestStatusLabel(status: BookingRequestStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function requestStatusBadge(status: BookingRequestStatus): string {
  switch (status) {
    case "submitted_request":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "under_review":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "awaiting_customer_selection":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "customer_requested_new_time":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "confirmed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "declined":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "expired":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
}

function ownerReviewStatusLabel(status: OwnerReviewStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function urgencyTone(record: OwnerBookingRequestRecord): { label: string; className: string } | null {
  if (["confirmed", "declined", "expired"].includes(record.status)) return null;
  const submittedAt = new Date(record.submittedAt).getTime();
  if (!Number.isFinite(submittedAt)) return null;
  const hoursOld = (Date.now() - submittedAt) / (1000 * 60 * 60);
  if (hoursOld >= 24) return { label: "Urgent", className: "border-rose-200 bg-rose-50 text-rose-800" };
  if (hoursOld >= 8) return { label: "Aging", className: "border-amber-200 bg-amber-50 text-amber-800" };
  return { label: "Fresh", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
}

function matchesStatusFilter(record: OwnerBookingRequestRecord, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return ["submitted_request", "under_review", "customer_requested_new_time"].includes(record.status);
  if (filter === "waiting") return record.status === "awaiting_customer_selection";
  if (filter === "confirmed") return record.status === "confirmed";
  return record.status === "declined" || record.status === "expired";
}

function preferredStatusFilter(record: OwnerBookingRequestRecord): StatusFilter {
  if (record.status === "awaiting_customer_selection") return "waiting";
  if (record.status === "confirmed") return "confirmed";
  if (record.status === "declined" || record.status === "expired") return "declined";
  return "open";
}

function searchText(record: OwnerBookingRequestRecord): string {
  return [
    record.serviceSummary,
    record.customer.firstName,
    record.customer.lastName,
    record.customer.email,
    record.customer.phone,
    record.vehicle.summary,
    record.requestedTimingSummary,
    record.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildBusinessApiUrl(businessId: string, path: string): string {
  return `${API_BASE}/api/businesses/${encodeURIComponent(businessId)}${path}`;
}

async function businessApiRequest<T>(businessId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && init.body !== undefined) headers.set("Content-Type", "application/json");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  headers.set("x-business-id", businessId);

  const response = await fetch(buildBusinessApiUrl(businessId, path), {
    ...init,
    headers,
    credentials: "include",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) clearAuthState("auth:invalid", { status: response.status, path });
    const message =
      typeof payload?.message === "string" && payload.message.trim()
        ? payload.message
        : "This booking request action could not be completed.";
    throw new Error(message);
  }
  return payload as T;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function defaultAlternateDate(record: OwnerBookingRequestRecord | null): Date | null {
  if (!record) return null;
  return parseDateKey(record.requestedDate) ?? (record.requestedTimeStart ? new Date(record.requestedTimeStart) : null) ?? new Date();
}

function replaceRecord(records: OwnerBookingRequestRecord[], nextRecord: OwnerBookingRequestRecord): OwnerBookingRequestRecord[] {
  const existingIndex = records.findIndex((record) => record.id === nextRecord.id);
  if (existingIndex === -1) return [nextRecord, ...records];
  return records.map((record) => (record.id === nextRecord.id ? nextRecord : record));
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value || "-"}</span>
    </div>
  );
}

function buildBookingRequestAppointmentHref(record: OwnerBookingRequestRecord): string {
  const params = new URLSearchParams();
  params.set("from", `/appointments/requests?request=${record.id}`);
  params.set("sourceType", "booking_request");
  params.set("sourceBookingRequestId", record.id);
  if (record.clientId) params.set("sourceLeadClientId", record.clientId);
  params.set("requestedServices", record.serviceSummary || "");
  params.set("leadSource", record.source || "");
  params.set("sourceSummary", record.requestedTimingSummary || "");
  if ([record.customer.firstName, record.customer.lastName].filter(Boolean).join(" ").trim()) {
    params.set("sourceCustomerName", [record.customer.firstName, record.customer.lastName].filter(Boolean).join(" ").trim());
  }
  if (record.customer.phone) params.set("sourcePhone", record.customer.phone);
  if (record.customer.email) params.set("sourceEmail", record.customer.email);
  params.set("notes", record.notes || "");
  params.set(
    "internalNotes",
    [
      "Created from Booking Request",
      record.requestedTimingSummary ? `Requested timing: ${record.requestedTimingSummary}` : null,
      record.campaign ? `Campaign: ${record.campaign}` : null,
      record.source ? `Source detail: ${record.source}` : null,
    ]
      .filter(Boolean)
      .join("\n")
  );

  if (record.clientId) params.set("clientId", record.clientId);
  if (record.vehicleId) params.set("vehicleId", record.vehicleId);
  if (record.locationId) params.set("locationId", record.locationId);
  if (record.requestedDate) params.set("date", record.requestedDate);
  if (record.requestedTimeStart) {
    const requestedStart = new Date(record.requestedTimeStart);
    if (!Number.isNaN(requestedStart.getTime())) {
      params.set(
        "time",
        `${String(requestedStart.getHours()).padStart(2, "0")}:${String(requestedStart.getMinutes()).padStart(2, "0")}`
      );
    }
  }
  if (record.serviceMode === "mobile") {
    params.set("mobile", "1");
    params.set(
      "mobileAddress",
      [record.serviceAddress, record.serviceCity, record.serviceState, record.serviceZip].filter(Boolean).join(", ")
    );
  }
  if (record.serviceId) {
    params.set("serviceIds", [record.serviceId, ...record.addonServiceIds].filter(Boolean).join(","));
  }
  if (record.vehicle.summary) params.set("vehicleSummary", record.vehicle.summary);
  if (record.vehicle.year != null) params.set("vehicleYear", String(record.vehicle.year));
  if (record.vehicle.make) params.set("vehicleMake", record.vehicle.make);
  if (record.vehicle.model) params.set("vehicleModel", record.vehicle.model);
  if (record.vehicle.color) params.set("vehicleColor", record.vehicle.color);
  const sourceAddress = [record.serviceAddress, record.serviceCity, record.serviceState, record.serviceZip].filter(Boolean).join(", ");
  if (sourceAddress) params.set("sourceAddress", sourceAddress);
  return `/appointments/new?${params.toString()}`;
}

function customerDisplayName(record: OwnerBookingRequestRecord): string {
  return [record.customer.firstName, record.customer.lastName].filter(Boolean).join(" ") || "Customer";
}

function serviceAddressLabel(record: OwnerBookingRequestRecord): string {
  return [record.serviceAddress, record.serviceCity, record.serviceState, record.serviceZip].filter(Boolean).join(", ");
}

function buildBookingRequestShareItems(record: OwnerBookingRequestRecord): string[] {
  return [
    `${customerDisplayName(record)} · ${record.serviceSummary || "Booking request"}`,
    record.requestedTimingSummary ? `Requested timing: ${record.requestedTimingSummary}` : "",
    record.vehicle.summary ? `Vehicle: ${record.vehicle.summary}` : "",
    serviceAddressLabel(record) ? `Service address: ${serviceAddressLabel(record)}` : "",
    record.portalUrl || record.confirmationUrl || record.publicResponseUrl,
  ].filter(Boolean);
}

export default function AppointmentRequestsPage() {
  const outletContext = useOutletContext<AuthOutletContext>();
  if (!outletContext.permissions.has("appointments.read")) {
    return <Navigate to={getPreferredAuthorizedAppPath(outletContext.permissions, outletContext.enabledModules)} replace />;
  }
  return <AppointmentRequestsContent />;
}

function AppointmentRequestsContent() {
  const { businessId, permissions } = useOutletContext<AuthOutletContext>();
  const canManage = permissions.has("appointments.write");
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<OwnerBookingRequestRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<OwnerBookingRequestRecord | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityHints, setAvailabilityHints] = useState<AvailabilityHintsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [refreshKey, setRefreshKey] = useState(0);
  const [approveDialog, setApproveDialog] = useState<ApproveDialogState>({ open: false, message: "" });
  const [alternateDialog, setAlternateDialog] = useState<AlternateDialogState>({
    open: false,
    message: "",
    expiresInHours: "48",
    date: null,
    selectedSlots: [],
  });
  const [askNewTimeDialog, setAskNewTimeDialog] = useState<AskNewTimeDialogState>({
    open: false,
    message: "",
    expiresInHours: "72",
  });
  const [declineDialog, setDeclineDialog] = useState<DeclineDialogState>({ open: false, message: "" });
  const [submittingAction, setSubmittingAction] = useState<"approve" | "propose" | "ask" | "decline" | null>(null);
  const selectedRequestId = searchParams.get("request");

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    businessApiRequest<BookingRequestListResponse>(businessId, "/booking-requests")
      .then((payload) => {
        if (cancelled) return;
        setRecords(payload.records ?? []);
      })
      .catch((error) => {
        if (cancelled) return;
        setListError(error instanceof Error ? error.message : "Could not load booking requests.");
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, refreshKey]);

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      if (!matchesStatusFilter(record, statusFilter)) return false;
      if (!query) return true;
      return searchText(record).includes(query);
    });
  }, [records, search, statusFilter]);

  useEffect(() => {
    if (!visibleRecords.length) {
      if (selectedRequestId) {
        const next = new URLSearchParams(searchParams);
        next.delete("request");
        setSearchParams(next, { replace: true });
      }
      setSelectedRecord(null);
      return;
    }
    if (!selectedRequestId || !visibleRecords.some((record) => record.id === selectedRequestId)) {
      const next = new URLSearchParams(searchParams);
      next.set("request", visibleRecords[0].id);
      setSearchParams(next, { replace: true, preventScrollReset: true });
    }
  }, [searchParams, selectedRequestId, setSearchParams, visibleRecords]);

  useEffect(() => {
    if (!businessId || !selectedRequestId) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    businessApiRequest<BookingRequestDetailResponse>(
      businessId,
      `/booking-requests/${encodeURIComponent(selectedRequestId)}`
    )
      .then((payload) => {
        if (cancelled) return;
        setSelectedRecord(payload.record);
        setRecords((current) => replaceRecord(current, payload.record));
      })
      .catch((error) => {
        if (cancelled) return;
        setDetailError(error instanceof Error ? error.message : "Could not load this booking request.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, selectedRequestId]);

  useEffect(() => {
    if (!businessId || !selectedRecord) {
      setAvailabilityHints(null);
      return;
    }
    const requestedDate =
      selectedRecord.requestedDate ??
      (selectedRecord.requestedTimeStart ? toDateKey(new Date(selectedRecord.requestedTimeStart)) : "");
    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityError(null);

    businessApiRequest<AvailabilityHintsResponse>(
      businessId,
      `/booking-requests/${encodeURIComponent(selectedRecord.id)}/availability-hints${requestedDate ? `?date=${encodeURIComponent(requestedDate)}` : ""}`
    )
      .then((payload) => {
        if (!cancelled) setAvailabilityHints(payload);
      })
      .catch((error) => {
        if (!cancelled) {
          setAvailabilityError(error instanceof Error ? error.message : "Could not load availability hints.");
          setAvailabilityHints(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, selectedRecord]);

  const requestMetrics = useMemo(() => {
    const openCount = records.filter((record) => matchesStatusFilter(record, "open")).length;
    const waitingCount = records.filter((record) => matchesStatusFilter(record, "waiting")).length;
    const urgentCount = records.filter((record) => urgencyTone(record)?.label === "Urgent").length;
    return { openCount, waitingCount, urgentCount };
  }, [records]);

  const openAlternateDialog = () => {
    const requestPolicy = selectedRecord?.requestPolicy ?? DEFAULT_OWNER_REQUEST_POLICY;
    setAlternateDialog({
      open: true,
      message: "",
      expiresInHours: String(requestPolicy.alternateOfferExpiryHours ?? 48),
      date: defaultAlternateDate(selectedRecord),
      selectedSlots: [],
    });
  };

  const openAskNewTimeDialog = () => {
    setAskNewTimeDialog({
      open: true,
      message:
        selectedRecord?.requestedTimingSummary
          ? `Thanks for the request. We need another day or time than ${selectedRecord.requestedTimingSummary}.`
          : "",
      expiresInHours: "72",
    });
  };

  const applyRecordUpdate = (record: OwnerBookingRequestRecord) => {
    setSelectedRecord(record);
    setRecords((current) => replaceRecord(current, record));
    if (!matchesStatusFilter(record, statusFilter)) {
      setStatusFilter(preferredStatusFilter(record));
    }
  };

  const loadAlternateHints = async (date: Date) => {
    if (!businessId || !selectedRecord) return;
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    try {
      const payload = await businessApiRequest<AvailabilityHintsResponse>(
        businessId,
        `/booking-requests/${encodeURIComponent(selectedRecord.id)}/availability-hints?date=${encodeURIComponent(toDateKey(date))}`
      );
      setAvailabilityHints(payload);
    } catch (error) {
      setAvailabilityError(error instanceof Error ? error.message : "Could not load availability hints.");
      setAvailabilityHints(null);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!businessId || !selectedRecord) return;
    setSubmittingAction("approve");
    try {
      const payload = await businessApiRequest<BookingRequestActionResponse>(
        businessId,
        `/booking-requests/${encodeURIComponent(selectedRecord.id)}/approve`,
        {
          method: "POST",
          body: JSON.stringify({ message: approveDialog.message }),
        }
      );
      applyRecordUpdate(payload.record);
      setApproveDialog({ open: false, message: "" });
      toast.success(payload.scheduledFor ? `Appointment created for ${payload.scheduledFor}.` : "Appointment created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve this requested slot.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleProposeAlternates = async () => {
    if (!businessId || !selectedRecord) return;
    if (alternateDialog.selectedSlots.length === 0) {
      toast.error("Choose at least one alternate time.");
      return;
    }
    if (alternateDialog.selectedSlots.length > selectedAlternateSlotLimit) {
      toast.error(
        `Choose up to ${selectedAlternateSlotLimit} alternate time${selectedAlternateSlotLimit === 1 ? "" : "s"} for this request.`
      );
      return;
    }
    setSubmittingAction("propose");
    try {
      const payload = await businessApiRequest<BookingRequestActionResponse>(
        businessId,
        `/booking-requests/${encodeURIComponent(selectedRecord.id)}/propose-alternates`,
        {
          method: "POST",
          body: JSON.stringify({
            message: alternateDialog.message,
            expiresInHours: Number(alternateDialog.expiresInHours),
            options: alternateDialog.selectedSlots.map((slot) => ({
              startTime: slot.startTime,
              endTime: slot.endTime,
              label: slot.label,
            })),
          }),
        }
      );
      applyRecordUpdate(payload.record);
      setAlternateDialog({
        open: false,
        message: "",
        expiresInHours: String(selectedRequestPolicy.alternateOfferExpiryHours ?? 48),
        date: null,
        selectedSlots: [],
      });
      toast.success("Alternate times sent to the customer.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send alternate times.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleAskNewTime = async () => {
    if (!businessId || !selectedRecord) return;
    if (!askNewTimeDialog.message.trim()) {
      toast.error("Add a message so the customer knows what to do next.");
      return;
    }
    setSubmittingAction("ask");
    try {
      const payload = await businessApiRequest<BookingRequestActionResponse>(
        businessId,
        `/booking-requests/${encodeURIComponent(selectedRecord.id)}/request-new-time`,
        {
          method: "POST",
          body: JSON.stringify({
            message: askNewTimeDialog.message,
            expiresInHours: Number(askNewTimeDialog.expiresInHours),
          }),
        }
      );
      applyRecordUpdate(payload.record);
      setAskNewTimeDialog({ open: false, message: "", expiresInHours: "72" });
      toast.success("A secure follow-up link was sent to the customer.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not ask the customer for another time.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleDecline = async () => {
    if (!businessId || !selectedRecord) return;
    setSubmittingAction("decline");
    try {
      const payload = await businessApiRequest<BookingRequestActionResponse>(
        businessId,
        `/booking-requests/${encodeURIComponent(selectedRecord.id)}/decline`,
        {
          method: "POST",
          body: JSON.stringify({ message: declineDialog.message }),
        }
      );
      applyRecordUpdate(payload.record);
      setDeclineDialog({ open: false, message: "" });
      toast.success("The booking request was declined.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not decline this request.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const selectedUrgency = selectedRecord ? urgencyTone(selectedRecord) : null;
  const selectedRequestPolicy = selectedRecord?.requestPolicy ?? DEFAULT_OWNER_REQUEST_POLICY;
  const selectedAlternateSlotLimit = Math.max(1, selectedRequestPolicy.alternateSlotLimit || 1);
  const canApproveRequestedSlot =
    !!selectedRecord?.requestedTimeStart && !["confirmed", "declined", "expired"].includes(selectedRecord?.status ?? "");
  const canRespondWithOwnerAction =
    canManage && !!selectedRecord && !["confirmed", "declined", "expired"].includes(selectedRecord.status);
  const canProposeAlternates = canRespondWithOwnerAction && selectedRequestPolicy.allowAlternateSlots;
  const selectedCustomerName = selectedRecord ? customerDisplayName(selectedRecord) : "";
  const selectedServiceAddress = selectedRecord ? serviceAddressLabel(selectedRecord) : "";
  const selectedShareItems = useMemo(
    () => (selectedRecord ? buildBookingRequestShareItems(selectedRecord) : []),
    [selectedRecord]
  );

  return (
    <div className="page-content page-section max-w-7xl">
      <PageHeader
        title="Booking requests"
        right={
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <Button variant="outline" onClick={() => setRefreshKey((current) => current + 1)}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button asChild variant="outline">
              <Link to="/appointments">
                <CalendarClock className="mr-2 h-4 w-4" />
                Back to schedule
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <MetricCard label="Open now" value={String(requestMetrics.openCount)} detail="Fresh requests and customer follow-ups." />
        <MetricCard label="Waiting on customer" value={String(requestMetrics.waitingCount)} detail="Alternate choices or new-time prompts still out." />
        <MetricCard label="Urgent" value={String(requestMetrics.urgentCount)} detail="Requests older than one day without a final answer." />
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="native-panel-card overflow-hidden py-0 lg:sticky lg:top-24 lg:self-start">
          <CardHeader className="border-b border-slate-200/80 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Request inbox</CardTitle>
                <CardDescription>Review the queue like an operating inbox, with timing and customer context visible before you open the full thread.</CardDescription>
              </div>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {records.length} total
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, vehicle, service, or timing"
                className="h-11 rounded-xl"
              />
              <div className={selectorGroupClassName()}>
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setStatusFilter(filter.id)}
                    className={selectorPillButtonClassName(statusFilter === filter.id, "native-touch-surface")}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {STATUS_FILTERS.find((filter) => filter.id === statusFilter)?.helper}
              </p>
            </div>
          </CardHeader>
          <CardContent className="ios-momentum-y px-0 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto">
            {listLoading ? (
              <div className="space-y-3 px-5 py-5 sm:px-6">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                    <div className="mt-3 h-5 w-2/3 animate-pulse rounded bg-slate-200" />
                    <div className="mt-2 h-4 w-full animate-pulse rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : listError ? (
              <div className="px-5 py-5 sm:px-6">
                <EmptyState
                  icon={AlertCircle}
                  title="Request inbox unavailable"
                  description={listError}
                  action={
                    <Button variant="outline" onClick={() => setRefreshKey((current) => current + 1)}>
                      Retry
                    </Button>
                  }
                />
              </div>
            ) : visibleRecords.length === 0 ? (
              <div className="px-5 py-5 sm:px-6">
                <EmptyState
                  icon={Inbox}
                  title="No booking requests in this view"
                  description="As soon as customers request a day or time, the queue will show the service, vehicle, timing, and what needs action."
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-200/80">
                {visibleRecords.map((record) => {
                  const active = record.id === selectedRequestId;
                  const urgency = urgencyTone(record);
                  return (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => {
                        const next = new URLSearchParams(searchParams);
                        next.set("request", record.id);
                        setSearchParams(next, { preventScrollReset: true });
                        void triggerNativeHaptic(active ? "light" : "medium");
                      }}
                      className={cn(
                        "native-touch-surface touch-manipulation flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors sm:px-6",
                        active ? "bg-orange-50/60" : "bg-white hover:bg-slate-50/80"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{record.serviceSummary || "Requested service"}</p>
                          <p className="mt-1 truncate text-sm text-slate-600">
                            {[record.customer.firstName, record.customer.lastName].filter(Boolean).join(" ") || "Customer"}
                            {record.vehicle.summary ? ` - ${record.vehicle.summary}` : ""}
                          </p>
                        </div>
                        <ChevronRight className={cn("mt-1 h-4 w-4 shrink-0 text-slate-400", active && "text-orange-600")} />
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Requested time</p>
                        <p className="mt-1 text-sm font-medium text-slate-950">{record.requestedTimingSummary || "Customer requested follow-up"}</p>
                        <p className="mt-1 text-xs text-slate-500">{FLEXIBILITY_LABELS[record.flexibility]}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Badge className={cn("rounded-full px-2.5 py-1", requestStatusBadge(record.status))}>
                          {requestStatusLabel(record.status)}
                        </Badge>
                        {urgency ? (
                          <Badge className={cn("rounded-full px-2.5 py-1", urgency.className)}>{urgency.label}</Badge>
                        ) : null}
                        <span>Submitted {formatAgeLabel(record.submittedAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <div className="space-y-4 min-w-0">
          {detailLoading && !selectedRecord ? (
            <Card className="native-panel-card">
              <CardHeader>
                <CardTitle>Loading request</CardTitle>
                <CardDescription>Pulling together service, vehicle, and requested timing.</CardDescription>
              </CardHeader>
            </Card>
          ) : detailError ? (
            <EmptyState
              icon={AlertCircle}
              title="Request details unavailable"
              description={detailError}
              action={
                <Button variant="outline" onClick={() => setRefreshKey((current) => current + 1)}>
                  Retry
                </Button>
              }
            />
          ) : selectedRecord ? (
            <Card className="native-panel-card">
              <CardHeader className="border-b border-slate-200/80">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("rounded-full px-3 py-1", requestStatusBadge(selectedRecord.status))}>
                        {requestStatusLabel(selectedRecord.status)}
                      </Badge>
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        {ownerReviewStatusLabel(selectedRecord.ownerReviewStatus)}
                      </Badge>
                      {selectedUrgency ? (
                        <Badge className={cn("rounded-full px-3 py-1", selectedUrgency.className)}>{selectedUrgency.label}</Badge>
                      ) : null}
                    </div>
                    <div>
                      <CardTitle className="text-[1.35rem]">{selectedRecord.serviceSummary || "Booking request"}</CardTitle>
                      <CardDescription>
                        Submitted {formatAgeLabel(selectedRecord.submittedAt)} by{" "}
                        {[selectedRecord.customer.firstName, selectedRecord.customer.lastName].filter(Boolean).join(" ") || "Customer"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:flex-col">
                    {selectedRecord.appointmentId ? (
                      <Button asChild className="native-touch-surface">
                        <Link to={`/appointments/${selectedRecord.appointmentId}`}>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Open appointment
                        </Link>
                      </Button>
                    ) : null}
                    {canRespondWithOwnerAction ? (
                      <>
                        <Button variant="outline" asChild className="native-touch-surface">
                          <Link to={buildBookingRequestAppointmentHref(selectedRecord)}>
                            <CalendarClock className="mr-2 h-4 w-4" />
                            Create appointment
                          </Link>
                        </Button>
                        <Button className="native-touch-surface" onClick={() => setApproveDialog({ open: true, message: "" })} disabled={!canApproveRequestedSlot}>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Approve requested slot
                        </Button>
                        {canProposeAlternates ? (
                          <Button variant="outline" className="native-touch-surface" onClick={openAlternateDialog}>
                            <Send className="mr-2 h-4 w-4" />
                            Propose alternate times
                          </Button>
                        ) : null}
                        <Button variant="outline" className="native-touch-surface" onClick={openAskNewTimeDialog}>
                          <MessageSquareMore className="mr-2 h-4 w-4" />
                          Ask for another day
                        </Button>
                        <Button variant="outline" className="native-touch-surface" onClick={() => setDeclineDialog({ open: true, message: "" })}>
                          <XCircle className="mr-2 h-4 w-4" />
                          Decline request
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 py-6">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.02fr)_minmax(320px,0.98fr)]">
                  <div className="native-panel-card rounded-[1.4rem] border border-orange-200/80 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.14),transparent_36%),linear-gradient(180deg,#fff7ed_0%,#ffffff_100%)] p-4 sm:p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-700">Requested date and time</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {selectedRecord.requestedTimingSummary || "Customer asked for a follow-up"}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <DetailRow label="Preferred date" value={formatDateLabel(selectedRecord.requestedDate, selectedRecord.customerTimezone)} />
                      <DetailRow label="Flexibility" value={FLEXIBILITY_LABELS[selectedRecord.flexibility]} />
                      <DetailRow
                        label="Alternate slots"
                        value={
                          selectedRequestPolicy.allowAlternateSlots
                            ? `Up to ${selectedAlternateSlotLimit}`
                            : "Ask customer for another day"
                        }
                      />
                      <DetailRow
                        label="Offer expiry"
                        value={
                          selectedRequestPolicy.allowAlternateSlots
                            ? `${selectedRequestPolicy.alternateOfferExpiryHours ?? 48} hours`
                            : "Not used"
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                    <div className="native-panel-card rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Request health</p>
                      <div className="mt-3 space-y-3">
                        <DetailRow label="Created" value={formatDateTime(selectedRecord.submittedAt, selectedRecord.customerTimezone)} />
                        <DetailRow label="Owner response" value={formatDateTime(selectedRecord.ownerRespondedAt, selectedRecord.customerTimezone)} />
                        <DetailRow label="Customer response" value={formatDateTime(selectedRecord.customerRespondedAt, selectedRecord.customerTimezone)} />
                        <DetailRow label="Offer expires" value={formatDateTime(selectedRecord.expiresAt, selectedRecord.customerTimezone)} />
                      </div>
                    </div>
                    <NativeContactActionsCard
                      title="Customer actions"
                      description="Call, text, map the stop, share the live request, or schedule a follow-up reminder without leaving the queue."
                      contactName={selectedCustomerName}
                      phone={selectedRecord.customer.phone}
                      email={selectedRecord.customer.email}
                      address={selectedServiceAddress}
                      reminderIdentifier={`booking-request-${selectedRecord.id}`}
                      reminderTitle={selectedCustomerName ? `Follow up with ${selectedCustomerName}` : "Follow up on booking request"}
                      reminderBody={selectedRecord.requestedTimingSummary || selectedRecord.serviceSummary || undefined}
                      reminderSuggestedAt={selectedRecord.expiresAt ?? selectedRecord.requestedTimeStart}
                      reminderButtonLabel="Add follow-up reminder"
                      shareItems={selectedShareItems}
                      shareSubject={selectedRecord.serviceSummary || "Booking request"}
                      shareTitle="Share booking request"
                      shareButtonLabel="Share request"
                    />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="native-panel-card gap-4 border-slate-200/80 bg-white py-0">
                    <CardHeader className="border-b border-slate-200/80 py-5">
                      <CardTitle>Customer and vehicle</CardTitle>
                      <CardDescription>The team should never have to hunt for who or what this request is for.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 py-5">
                      <DetailRow label="Customer" value={selectedCustomerName || "Unknown customer"} />
                      <DetailRow label="Email" value={selectedRecord.customer.email} />
                      <DetailRow label="Phone" value={selectedRecord.customer.phone} />
                      <DetailRow label="Vehicle" value={selectedRecord.vehicle.summary || "Vehicle not supplied"} />
                      <DetailRow label="Service mode" value={selectedRecord.serviceMode === "mobile" ? "Mobile service" : "In-shop service"} />
                      {selectedRecord.serviceMode === "mobile" ? (
                        <DetailRow
                          label="Service address"
                          value={selectedServiceAddress || "No mobile-service address provided"}
                        />
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card className="native-panel-card gap-4 border-slate-200/80 bg-white py-0">
                    <CardHeader className="border-b border-slate-200/80 py-5">
                      <CardTitle>Request notes</CardTitle>
                      <CardDescription>Everything the customer or team already shared stays attached to the request.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 py-5">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Customer note</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{selectedRecord.notes || "No customer note was added to this request."}</p>
                      </div>
                      {selectedRecord.ownerResponseMessage ? (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest owner message</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">{selectedRecord.ownerResponseMessage}</p>
                        </div>
                      ) : null}
                      {selectedRecord.customerResponseMessage ? (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest customer reply</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">{selectedRecord.customerResponseMessage}</p>
                        </div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <DetailRow label="Source" value={selectedRecord.source || "Booking page"} />
                        <DetailRow label="Campaign" value={selectedRecord.campaign || "None"} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <Card className="native-panel-card gap-4 border-slate-200/80 bg-white py-0">
                  <CardHeader className="border-b border-slate-200/80 py-5">
                    <CardTitle>Availability hints</CardTitle>
                    <CardDescription>Quick options for the requested day so the owner can approve or counter without leaving the queue.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 py-5">
                    {availabilityLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking open times for this date.
                      </div>
                    ) : availabilityError ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{availabilityError}</div>
                    ) : availabilityHints && availabilityHints.slots.length > 0 ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                          <span>{formatDateLabel(availabilityHints.date, availabilityHints.timezone)} has {availabilityHints.slots.length} bookable options.</span>
                          <span>Duration {availabilityHints.durationMinutes} minutes</span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {availabilityHints.slots.slice(0, 9).map((slot) => (
                            <div key={slot.startTime} className="native-touch-surface rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <p className="text-sm font-medium text-slate-950">{slot.label}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {formatDateTime(slot.startTime, availabilityHints.timezone, { hour: "numeric", minute: "2-digit" })} to {formatDateTime(slot.endTime, availabilityHints.timezone, { hour: "numeric", minute: "2-digit" })}
                              </p>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600">
                        No open slots were returned for the requested day. Propose another date or ask the customer to choose a different day.
                      </div>
                    )}
                  </CardContent>
                </Card>

                {selectedRecord.alternateSlotOptions.length > 0 ? (
                  <Card className="native-panel-card gap-4 border-slate-200/80 bg-white py-0">
                    <CardHeader className="border-b border-slate-200/80 py-5">
                      <CardTitle>Current alternate options</CardTitle>
                      <CardDescription>These are the live alternate times currently attached to the request.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 py-5 sm:grid-cols-2">
                      {selectedRecord.alternateSlotOptions.map((option) => (
                        <div key={option.id} className="native-touch-surface rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-sm font-medium text-slate-950">{option.label}</p>
                          <p className="mt-1 text-xs text-slate-500">Expires {formatDateTime(option.expiresAt, selectedRecord.customerTimezone)}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={Inbox}
              title="Choose a booking request"
              description="Pick a request from the inbox to review the requested day, time, customer, and next action in one place."
            />
          )}
        </div>
      </div>

      <Dialog open={approveDialog.open} onOpenChange={(open) => setApproveDialog((current) => ({ ...current, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve the requested slot</DialogTitle>
            <DialogDescription>This creates the real appointment immediately and sends the confirmation to the customer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
              {selectedRecord?.requestedTimingSummary || "No requested time on file"}
            </div>
            <div className="space-y-2">
              <Label htmlFor="approve-message">Optional message to customer</Label>
              <Textarea
                id="approve-message"
                rows={4}
                placeholder="Anything the customer should know with the confirmation."
                value={approveDialog.message}
                onChange={(event) => setApproveDialog((current) => ({ ...current, message: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog({ open: false, message: "" })}>Cancel</Button>
            <Button onClick={handleApprove} disabled={!canApproveRequestedSlot || submittingAction === "approve"}>
              {submittingAction === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Approve and create appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={alternateDialog.open} onOpenChange={(open) => setAlternateDialog((current) => ({ ...current, open }))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Propose alternate times</DialogTitle>
            <DialogDescription>
              {`Choose up to ${selectedAlternateSlotLimit} real slot${selectedAlternateSlotLimit === 1 ? "" : "s"} so the customer can confirm one without starting over.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label>Alternate date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start rounded-xl">
                      <CalendarClock className="mr-2 h-4 w-4" />
                      {alternateDialog.date ? formatDateLabel(toDateKey(alternateDialog.date)) : "Choose a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={alternateDialog.date ?? undefined}
                      onSelect={(date) => {
                        if (!date) return;
                        setAlternateDialog((current) => ({ ...current, date, selectedSlots: [] }));
                        void loadAlternateHints(date);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Offer expires</Label>
                <Select value={alternateDialog.expiresInHours} onValueChange={(value) => setAlternateDialog((current) => ({ ...current, expiresInHours: value }))}>
                  <SelectTrigger className={selectorSelectTriggerClassName("w-full")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectorSelectContentClassName()}>
                    {PROPOSE_EXPIRY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Available slots</Label>
              {availabilityLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking availability for the selected day.
                </div>
              ) : availabilityHints && availabilityHints.slots.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {availabilityHints.slots.map((slot) => {
                    const active = alternateDialog.selectedSlots.some((selected) => selected.startTime === slot.startTime);
                    const disabled = !active && alternateDialog.selectedSlots.length >= selectedAlternateSlotLimit;
                    return (
                      <button
                        key={slot.startTime}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          setAlternateDialog((current) => {
                            const exists = current.selectedSlots.some((selected) => selected.startTime === slot.startTime);
                            return {
                              ...current,
                              selectedSlots: exists
                                ? current.selectedSlots.filter((selected) => selected.startTime !== slot.startTime)
                                : [...current.selectedSlots, slot],
                            };
                          })
                        }
                        className={cn(
                          "rounded-2xl border px-4 py-3 text-left transition-colors",
                          active ? "border-orange-300 bg-orange-50 text-orange-950" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                          disabled && "cursor-not-allowed opacity-45"
                        )}
                      >
                        <p className="text-sm font-medium">{slot.label}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(slot.startTime, availabilityHints.timezone, { hour: "numeric", minute: "2-digit" })} to {formatDateTime(slot.endTime, availabilityHints.timezone, { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600">
                  Choose a day with open capacity to send alternate options.
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="alternate-message">Optional customer message</Label>
              <Textarea
                id="alternate-message"
                rows={4}
                placeholder="Explain why these times are the best next options."
                value={alternateDialog.message}
                onChange={(event) => setAlternateDialog((current) => ({ ...current, message: event.target.value }))}
              />
              <p className="text-xs text-slate-500">
                {selectedRequestPolicy.allowAlternateSlots
                  ? `This service lets the team send up to ${selectedAlternateSlotLimit} alternate option${selectedAlternateSlotLimit === 1 ? "" : "s"}.`
                  : "This service is set to ask the customer for another day instead of sending alternates."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlternateDialog({ open: false, message: "", expiresInHours: "48", date: null, selectedSlots: [] })}>Cancel</Button>
            <Button onClick={handleProposeAlternates} disabled={submittingAction === "propose"}>
              {submittingAction === "propose" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send alternate times
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={askNewTimeDialog.open} onOpenChange={(open) => setAskNewTimeDialog((current) => ({ ...current, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask the customer to choose another day</DialogTitle>
            <DialogDescription>This sends a secure link back into a lightweight request page with their service and contact details already attached.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ask-message">Message to customer</Label>
              <Textarea
                id="ask-message"
                rows={5}
                placeholder="Tell them what date range or timing would work better."
                value={askNewTimeDialog.message}
                onChange={(event) => setAskNewTimeDialog((current) => ({ ...current, message: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Response window</Label>
              <Select value={askNewTimeDialog.expiresInHours} onValueChange={(value) => setAskNewTimeDialog((current) => ({ ...current, expiresInHours: value }))}>
                <SelectTrigger className={selectorSelectTriggerClassName("w-full")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectorSelectContentClassName()}>
                  {ASK_NEW_TIME_EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAskNewTimeDialog({ open: false, message: "", expiresInHours: "72" })}>Cancel</Button>
            <Button onClick={handleAskNewTime} disabled={submittingAction === "ask"}>
              {submittingAction === "ask" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send secure follow-up link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={declineDialog.open} onOpenChange={(open) => setDeclineDialog((current) => ({ ...current, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline request</DialogTitle>
            <DialogDescription>Use this when the request cannot move forward. The customer will get a clear update.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="decline-message">Optional message</Label>
            <Textarea
              id="decline-message"
              rows={4}
              placeholder="Add any context the customer should have."
              value={declineDialog.message}
              onChange={(event) => setDeclineDialog((current) => ({ ...current, message: event.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineDialog({ open: false, message: "" })}>Cancel</Button>
            <Button variant="destructive" onClick={handleDecline} disabled={submittingAction === "decline"}>
              {submittingAction === "decline" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Decline request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="native-panel-card rounded-[1.45rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
