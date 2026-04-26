import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router";
import type { FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { formatDistanceStrict } from "date-fns";
import {
  ArrowLeft,
  CalendarPlus,
  Car,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Inbox,
  Loader2,
  Receipt,
  Search,
  UserRoundPlus,
} from "lucide-react";
import { useAction, useFindFirst, useFindMany } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "../components/shared/PageHeader";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { EmptyState } from "../components/shared/EmptyState";
import { triggerImpactFeedback } from "@/lib/nativeInteractions";
import { getDateSearchAliases, smartSearchMatches } from "@/lib/smartSearch";
import {
  buildLeadNotes,
  formatLeadSource,
  formatLeadStatus,
  LEAD_SOURCE_OPTIONS,
  LEAD_STATUS_OPTIONS,
  parseLeadRecord,
  type LeadSource,
  type LeadStatus,
} from "../lib/leads";
import { toast } from "sonner";

type SubmitMode = "lead" | "vehicle" | "quote" | "appointment";

type LeadFormData = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  marketingOptIn: boolean;
  serviceInterest: string;
  nextStep: string;
  summary: string;
  teamNotes: string;
  vehicle: string;
  leadStatus: LeadStatus;
  leadSource: LeadSource;
};

type LeadEntry = {
  client: any;
  lead: ReturnType<typeof parseLeadRecord>;
  searchableText: string;
};

type LeadStatusFilter = LeadStatus | "all" | "active";
type LeadSourceFilter = LeadSource | "all";

function createEmptyLeadForm(): LeadFormData {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    marketingOptIn: true,
    serviceInterest: "",
    nextStep: "",
    summary: "",
    teamNotes: "",
    vehicle: "",
    leadStatus: "new",
    leadSource: "website",
  };
}

const ACTIONS: Array<{
  mode: SubmitMode;
  label: string;
  icon: typeof CalendarPlus;
  variant: "default" | "outline";
}> = [
  { mode: "appointment", label: "Save and Book Appointment", icon: CalendarPlus, variant: "default" },
  { mode: "quote", label: "Save and Create Quote", icon: Receipt, variant: "outline" },
  { mode: "vehicle", label: "Save and Add Vehicle", icon: ClipboardList, variant: "outline" },
  { mode: "lead", label: "Save Lead", icon: UserRoundPlus, variant: "outline" },
];

const ACTIVE_STATUSES: LeadStatus[] = ["new", "contacted", "quoted", "booked"];

function buildQuoteRecipientQuery(values: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const params = new URLSearchParams();
  const recipientName = [values.firstName?.trim(), values.lastName?.trim()].filter(Boolean).join(" ").trim();
  const recipientEmail = values.email?.trim() || "";
  if (recipientName) params.set("recipientName", recipientName);
  if (recipientEmail) params.set("recipientEmail", recipientEmail);
  const query = params.toString();
  return query ? `&${query}` : "";
}

function buildLeadAppointmentHref(input: {
  clientId: string;
  locationId?: string | null;
  requestedServices?: string | null;
  leadSource?: string | null;
  sourceSummary?: string | null;
  teamNotes?: string | null;
  customerNotes?: string | null;
  vehicle?: string | null;
  sourceAddress?: string | null;
  customerName?: string | null;
  phone?: string | null;
  email?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("clientId", input.clientId);
  params.set("from", "/leads");
  params.set("sourceType", "lead");
  params.set("sourceLeadClientId", input.clientId);
  if (input.locationId?.trim()) params.set("locationId", input.locationId.trim());
  if (input.requestedServices?.trim()) params.set("requestedServices", input.requestedServices.trim());
  if (input.leadSource?.trim()) params.set("leadSource", input.leadSource.trim());
  if (input.sourceSummary?.trim()) params.set("sourceSummary", input.sourceSummary.trim());
  if (input.vehicle?.trim()) params.set("vehicleSummary", input.vehicle.trim());
  if (input.customerName?.trim()) params.set("sourceCustomerName", input.customerName.trim());
  if (input.phone?.trim()) params.set("sourcePhone", input.phone.trim());
  if (input.email?.trim()) params.set("sourceEmail", input.email.trim());
  if (input.customerNotes?.trim()) {
    params.set("notes", input.customerNotes.trim());
  } else if (input.sourceSummary?.trim()) {
    params.set("notes", input.sourceSummary.trim());
  }
  const internalNotes = ["Created from Lead", input.teamNotes?.trim() || null].filter(Boolean).join("\n\n");
  if (internalNotes) params.set("internalNotes", internalNotes);
  if (input.sourceAddress?.trim()) params.set("sourceAddress", input.sourceAddress.trim());
  return `/appointments/new?${params.toString()}`;
}

function buildLeadSearchText(client: any, lead: ReturnType<typeof parseLeadRecord>) {
  return [
    client.firstName,
    client.lastName,
    client.phone,
    client.email,
    client.address,
    client.city,
    client.state,
    client.zip,
    client.internalNotes,
    lead.serviceInterest,
    lead.nextStep,
    lead.summary,
    lead.vehicle,
    lead.source,
    formatLeadSource(lead.source),
    lead.status,
    formatLeadStatus(lead.status),
    ...getDateSearchAliases(client.createdAt),
    ...getDateSearchAliases(client.updatedAt),
    ...getDateSearchAliases(lead.firstContactedAt),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function badgeVariantForStatus(status: LeadStatus): "default" | "secondary" | "outline" {
  if (status === "converted") return "default";
  if (status === "booked" || status === "quoted") return "secondary";
  return "outline";
}

function filterLeadEntries(
  leadRecords: LeadEntry[],
  {
    searchQuery,
    statusFilter,
    sourceFilter,
  }: {
    searchQuery: string;
    statusFilter: LeadStatusFilter;
    sourceFilter: LeadSourceFilter;
  },
) {
  const query = searchQuery.trim().toLowerCase();
  return leadRecords.filter((entry) => {
    if (statusFilter === "active" && !ACTIVE_STATUSES.includes(entry.lead.status)) return false;
    if (statusFilter !== "active" && statusFilter !== "all" && entry.lead.status !== statusFilter) return false;
    if (sourceFilter !== "all" && entry.lead.source !== sourceFilter) return false;
    if (query && !smartSearchMatches([entry.searchableText], query)) return false;
    return true;
  });
}

function getLeadMetrics(leadRecords: LeadEntry[]) {
  const responseTimesInHours = leadRecords
    .map((entry) => {
      if (!entry.lead.firstContactedAt) return null;
      const firstContactedAt = new Date(entry.lead.firstContactedAt);
      const createdAt = new Date(entry.client.createdAt);
      if (Number.isNaN(firstContactedAt.getTime()) || Number.isNaN(createdAt.getTime())) return null;
      return Math.max(0, (firstContactedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
    })
    .filter((value): value is number => value !== null);

  const averageResponseHours = responseTimesInHours.length
    ? responseTimesInHours.reduce((sum, hours) => sum + hours, 0) / responseTimesInHours.length
    : null;

  return {
    activeLeadCount: leadRecords.filter((entry) => !["converted", "lost"].includes(entry.lead.status)).length,
    newLeadCount: leadRecords.filter((entry) => entry.lead.status === "new").length,
    quotedLeadCount: leadRecords.filter((entry) => entry.lead.status === "quoted").length,
    bookedLeadCount: leadRecords.filter((entry) => entry.lead.status === "booked").length,
    contactReadyLeadCount: leadRecords.filter((entry) => Boolean(entry.client.phone || entry.client.email)).length,
    knownVehicleLeadCount: leadRecords.filter((entry) => Boolean(entry.lead.vehicle?.trim())).length,
    missingNextStepCount: leadRecords.filter(
      (entry) => ACTIVE_STATUSES.includes(entry.lead.status) && !entry.lead.nextStep?.trim(),
    ).length,
    firstResponseTrackedCount: responseTimesInHours.length,
    averageResponseHours,
  };
}

function formatLeadResponseTime(createdAt: string | Date, firstContactedAt: string | null) {
  if (!firstContactedAt) return "Awaiting first response";
  const created = new Date(createdAt);
  const responded = new Date(firstContactedAt);
  if (Number.isNaN(created.getTime()) || Number.isNaN(responded.getTime())) return "Response time unavailable";
  return formatDistanceStrict(responded, created);
}

function getLeadResponseWindowHours(hours: number | null | undefined) {
  return Math.max(1, Math.min(Number(hours ?? 24), 336));
}

function getLeadSlaState(
  clientCreatedAt: string | Date,
  lead: ReturnType<typeof parseLeadRecord>,
  responseWindowHours: number,
) {
  if (lead.firstContactedAt || lead.status !== "new") {
    return { overdue: false, dueSoon: false, remainingMs: null as number | null };
  }

  const createdAt = new Date(clientCreatedAt);
  if (Number.isNaN(createdAt.getTime())) {
    return { overdue: false, dueSoon: false, remainingMs: null as number | null };
  }

  const deadline = createdAt.getTime() + responseWindowHours * 60 * 60 * 1000;
  const remainingMs = deadline - Date.now();
  const dueSoonThresholdMs = Math.min(2 * 60 * 60 * 1000, responseWindowHours * 0.25 * 60 * 60 * 1000);

  return {
    overdue: remainingMs <= 0,
    dueSoon: remainingMs > 0 && remainingMs <= dueSoonThresholdMs,
    remainingMs,
  };
}

function formatLeadSlaMessage(
  clientCreatedAt: string | Date,
  lead: ReturnType<typeof parseLeadRecord>,
  responseWindowHours: number,
) {
  const sla = getLeadSlaState(clientCreatedAt, lead, responseWindowHours);
  if (lead.firstContactedAt || lead.status !== "new") return null;
  if (sla.remainingMs === null) return null;

  const createdAt = new Date(clientCreatedAt);
  const deadline = new Date(createdAt.getTime() + responseWindowHours * 60 * 60 * 1000);

  if (sla.overdue) {
    return `Overdue by ${formatDistanceStrict(new Date(), deadline)}`;
  }

  return `Follow up due in ${formatDistanceStrict(deadline, new Date())}`;
}

function getLeadSourcePerformance(leadRecords: LeadEntry[]) {
  return LEAD_SOURCE_OPTIONS.map((source) => {
    const sourceLeads = leadRecords.filter((entry) => entry.lead.source === source);
    if (sourceLeads.length === 0) return null;

    const responseTimes = sourceLeads
      .map((entry) => {
        if (!entry.lead.firstContactedAt) return null;
        const responded = new Date(entry.lead.firstContactedAt);
        const created = new Date(entry.client.createdAt);
        if (Number.isNaN(responded.getTime()) || Number.isNaN(created.getTime())) return null;
        return Math.max(0, (responded.getTime() - created.getTime()) / (1000 * 60 * 60));
      })
      .filter((value): value is number => value !== null);

    const convertedCount = sourceLeads.filter((entry) => entry.lead.status === "converted").length;
    const bookedCount = sourceLeads.filter((entry) => entry.lead.status === "booked").length;

    return {
      source,
      totalCount: sourceLeads.length,
      convertedCount,
      bookedCount,
      closeRate: sourceLeads.length ? Math.round((convertedCount / sourceLeads.length) * 100) : 0,
      bookingRate: sourceLeads.length ? Math.round((bookedCount / sourceLeads.length) * 100) : 0,
      averageResponseHours: responseTimes.length
        ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length
        : null,
    };
  })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.totalCount - a.totalCount);
}

function MobileLeadSelect({
  value,
  onChange,
  children,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={[
        "h-11 w-full appearance-none rounded-xl border border-input/90 bg-background px-3 pr-10 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-border focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      {children}
    </select>
  );
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const { businessId, currentLocationId } = useOutletContext<AuthOutletContext>();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/signed-in";
  const hasQueueReturn = searchParams.has("from");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOverviewDetails, setShowOverviewDetails] = useState(false);
  const [showLeadComposer, setShowLeadComposer] = useState(false);
  const [expandedLeadDetails, setExpandedLeadDetails] = useState<Record<string, boolean>>({});
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [submitMode, setSubmitMode] = useState<SubmitMode>("lead");
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>("active");
  const [sourceFilter, setSourceFilter] = useState<LeadSourceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const submitModeRef = useRef<SubmitMode>("lead");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const leadRouteIntent = searchParams.toString();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileLayout(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(leadRouteIntent);
    const query = params.get("q");
    if (query !== null) setSearchQuery(query);
    if (params.get("compose") === "1" || params.get("new") === "1") {
      setShowLeadComposer(true);
    }
    if (params.get("focus") !== "search") return;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [leadRouteIntent]);

  const [{ data: business, fetching: businessFetching }] = useFindFirst(api.business, {
    select: { id: true, name: true, automationUncontactedLeadHours: true },
    pause: !businessId,
  });
  const [{ fetching, error }, createClient] = useAction(api.client.create);
  const [{ fetching: updatingLead, error: updateLeadError }, updateClient] = useAction(api.client.update);
  const [{ data: recentClientsRaw, fetching: recentClientsFetching }, refetchLeads] = useFindMany(api.client, {
    first: 100,
    sort: { createdAt: "Descending" },
    pause: !businessId,
  });

  const [formData, setFormData] = useState<LeadFormData>(createEmptyLeadForm);

  const leadRecords = useMemo<LeadEntry[]>(() => {
    const recentClients = (recentClientsRaw as any[]) ?? [];
    return recentClients
      .map((client) => {
        const lead = parseLeadRecord(client.notes);
        return {
          client,
          lead,
          searchableText: buildLeadSearchText(client, lead),
        };
      })
      .filter((entry) => entry.lead.isLead)
      .sort((a, b) => {
        const aActive = ACTIVE_STATUSES.includes(a.lead.status);
        const bActive = ACTIVE_STATUSES.includes(b.lead.status);
        if (aActive !== bActive) return aActive ? -1 : 1;
        return new Date(b.client.createdAt).getTime() - new Date(a.client.createdAt).getTime();
      });
  }, [recentClientsRaw]);

  const responseWindowHours = useMemo(
    () => getLeadResponseWindowHours((business as any)?.automationUncontactedLeadHours),
    [business]
  );

  const visibleLeads = useMemo(() => {
    return filterLeadEntries(leadRecords, { searchQuery, statusFilter, sourceFilter }).sort((a, b) => {
      const aSla = getLeadSlaState(a.client.createdAt, a.lead, responseWindowHours);
      const bSla = getLeadSlaState(b.client.createdAt, b.lead, responseWindowHours);

      if (aSla.overdue !== bSla.overdue) return aSla.overdue ? -1 : 1;
      if (aSla.dueSoon !== bSla.dueSoon) return aSla.dueSoon ? -1 : 1;

      return new Date(b.client.createdAt).getTime() - new Date(a.client.createdAt).getTime();
    });
  }, [leadRecords, responseWindowHours, searchQuery, sourceFilter, statusFilter]);

  const {
    activeLeadCount,
    newLeadCount,
    quotedLeadCount,
    bookedLeadCount,
    contactReadyLeadCount,
    knownVehicleLeadCount,
    missingNextStepCount,
    firstResponseTrackedCount,
    averageResponseHours,
  } = useMemo(() => getLeadMetrics(leadRecords), [leadRecords]);
  const overdueLeadCount = useMemo(
    () => leadRecords.filter((entry) => getLeadSlaState(entry.client.createdAt, entry.lead, responseWindowHours).overdue).length,
    [leadRecords, responseWindowHours]
  );
  const dueSoonLeadCount = useMemo(
    () => leadRecords.filter((entry) => getLeadSlaState(entry.client.createdAt, entry.lead, responseWindowHours).dueSoon).length,
    [leadRecords, responseWindowHours]
  );
  const sourcePerformance = useMemo(() => getLeadSourcePerformance(leadRecords), [leadRecords]);

  const setSubmitIntent = (mode: SubmitMode) => {
    submitModeRef.current = mode;
    setSubmitMode(mode);
  };

  const openLeadComposer = () => {
    void triggerImpactFeedback("light");
    setShowLeadComposer(true);
  };

  const toggleLeadDetails = (clientId: string) => {
    setExpandedLeadDetails((current) => {
      if (current[clientId]) return {};
      if (isMobileLayout) return { [clientId]: true };
      return {
        ...current,
        [clientId]: !current[clientId],
      };
    });
  };

  const getFieldError = (fieldName: string): string | undefined => {
    if (localErrors[fieldName]) return localErrors[fieldName];
    if (error) {
      const anyError = error as any;
      if (anyError.validationErrors) {
        const validationError = anyError.validationErrors.find((item: any) => item.apiIdentifier === fieldName);
        if (validationError) return validationError.message;
      }
    }
    return undefined;
  };

  const buildLeadClientNotes = () =>
    buildLeadNotes({
      status: formData.leadStatus,
      source: formData.leadSource,
      serviceInterest: formData.serviceInterest,
      nextStep: formData.nextStep,
      summary: formData.summary,
      vehicle: formData.vehicle,
      firstContactedAt: ["contacted", "quoted", "booked", "converted"].includes(formData.leadStatus)
        ? new Date().toISOString()
        : null,
    });

  const resolveCreatedClientId = async (
    resultData: unknown,
    fallback: { firstName: string; lastName: string; email?: string; phone?: string }
  ): Promise<string | null> => {
    const createdId = (resultData as { id?: string } | null)?.id;
    if (createdId) return createdId;

    const records = await api.client.findMany({
      search: [fallback.firstName, fallback.lastName, fallback.email, fallback.phone].filter(Boolean).join(" "),
      first: 10,
    });
    const match = (records ?? []).find((client: any) => {
      const firstNameMatches = client.firstName?.trim().toLowerCase() === fallback.firstName.trim().toLowerCase();
      const lastNameMatches = client.lastName?.trim().toLowerCase() === fallback.lastName.trim().toLowerCase();
      const emailMatches = fallback.email ? client.email?.trim().toLowerCase() === fallback.email.trim().toLowerCase() : true;
      const phoneMatches = fallback.phone ? client.phone?.trim() === fallback.phone.trim() : true;
      return firstNameMatches && lastNameMatches && emailMatches && phoneMatches;
    });
    return match?.id ?? null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const nextMode = submitter?.dataset.submitMode as SubmitMode | undefined;
    const mode = nextMode ?? submitModeRef.current ?? submitMode;

    const errors: Record<string, string> = {};
    if (!formData.firstName.trim()) errors.firstName = "First name is required";
    if (!formData.lastName.trim()) errors.lastName = "Last name is required";
    if (!formData.serviceInterest.trim()) errors.serviceInterest = "Service interest is required";

    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      return;
    }

    if (!(business as any)?.id) {
      setLocalErrors({ general: "Business profile not loaded. Please refresh and try again." });
      return;
    }

    setLocalErrors({});

    const result = await createClient({
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      ...(formData.phone.trim() ? { phone: formData.phone.trim() } : {}),
      ...(formData.email.trim() ? { email: formData.email.trim() } : {}),
      ...(formData.address.trim() ? { address: formData.address.trim() } : {}),
      ...(formData.city.trim() ? { city: formData.city.trim() } : {}),
      ...(formData.state.trim() ? { state: formData.state.trim() } : {}),
      ...(formData.zip.trim() ? { zip: formData.zip.trim() } : {}),
      notes: buildLeadClientNotes(),
      ...(formData.teamNotes.trim() ? { internalNotes: formData.teamNotes.trim() } : {}),
      marketingOptIn: formData.marketingOptIn,
    });

    if (result.error) return;

    const createdClientId = await resolveCreatedClientId(result.data, {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email.trim() || undefined,
      phone: formData.phone.trim() || undefined,
    });
    if (!createdClientId) {
      setLocalErrors({ general: "Lead saved but no record ID was returned. Please refresh and check your client list." });
      return;
    }

    toast.success("Lead captured");
    await refetchLeads();

    if (mode === "vehicle") {
      navigate(`/clients/${createdClientId}/vehicles/new?next=appointment&from=${encodeURIComponent("/leads")}`);
      return;
    }
    if (mode === "quote") {
      navigate(
        `/quotes/new?clientId=${createdClientId}&from=${encodeURIComponent("/leads")}${buildQuoteRecipientQuery({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
        })}`
      );
      return;
    }
    if (mode === "appointment") {
      navigate(
        buildLeadAppointmentHref({
          clientId: createdClientId,
          locationId: currentLocationId,
          requestedServices: formData.serviceInterest,
          leadSource: formData.leadSource,
          sourceSummary: formData.summary,
          teamNotes: formData.teamNotes,
          vehicle: formData.vehicle,
          sourceAddress: [formData.address, formData.city, formData.state, formData.zip].filter(Boolean).join(", "),
          customerName: [formData.firstName, formData.lastName].filter(Boolean).join(" "),
          phone: formData.phone,
          email: formData.email,
        })
      );
      return;
    }

    setFormData(createEmptyLeadForm());
    setLocalErrors({});
    setSubmitIntent("lead");
    setShowAdvanced(false);
    setShowLeadComposer(false);
  };

  const updateLeadStatus = async (client: any, status: LeadStatus) => {
    const lead = parseLeadRecord(client.notes);
    if (!lead.isLead) return false;
    const shouldStampFirstContact =
      !lead.firstContactedAt && ["contacted", "quoted", "booked", "converted"].includes(status);
    const result = await updateClient({
      id: client.id,
      notes: buildLeadNotes({
        ...lead,
        status,
        firstContactedAt: shouldStampFirstContact ? new Date().toISOString() : lead.firstContactedAt,
      }),
    });
    if (result.error) {
      toast.error(result.error.message ?? "Could not update lead.");
      return false;
    }
    toast.success(status === "converted" ? "Lead marked converted" : "Lead updated");
    await refetchLeads();
    return true;
  };

  const handleConvert = async (entry: LeadEntry) => {
    let converted = true;
    if (entry.lead.status !== "converted") {
      converted = await updateLeadStatus(entry.client, "converted");
    }
    if (!converted) return;
    navigate(`/clients/${entry.client.id}?from=${encodeURIComponent("/leads")}`);
  };

  const handleMarkContacted = async (entry: LeadEntry) => {
    await updateLeadStatus(entry.client, "contacted");
  };

  const generalError =
    error && !(error as any).validationErrors
      ? (error as any).message ?? "An error occurred. Please try again."
      : null;

  const inlineUpdateError =
    updateLeadError && !(updateLeadError as any).validationErrors
      ? (updateLeadError as any).message ?? "Could not update lead."
      : null;

  const leadComposerSection = showLeadComposer ? (
    <section className="rounded-[1.4rem] border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 rounded-xl border border-border/70 bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Lead record intake</p>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setShowLeadComposer(false)}>
            Hide form
          </Button>
        </div>
      </div>

      {localErrors.general ? <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{localErrors.general}</div> : null}
      {generalError ? <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{generalError}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="leadFirstName">First Name <span className="text-destructive">*</span></Label>
            <Input id="leadFirstName" value={formData.firstName} onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))} placeholder="Jane" aria-invalid={!!getFieldError("firstName")} />
            {getFieldError("firstName") ? <p className="text-sm text-destructive">{getFieldError("firstName")}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="leadLastName">Last Name <span className="text-destructive">*</span></Label>
            <Input id="leadLastName" value={formData.lastName} onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))} placeholder="Smith" aria-invalid={!!getFieldError("lastName")} />
            {getFieldError("lastName") ? <p className="text-sm text-destructive">{getFieldError("lastName")}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="leadPhone">Phone</Label>
            <Input id="leadPhone" type="tel" value={formData.phone} onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))} placeholder="(555) 000-0000" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="leadEmail">Email</Label>
            <Input id="leadEmail" type="email" value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} placeholder="jane@example.com" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Lead Source</Label>
            {isMobileLayout ? (
              <MobileLeadSelect
                value={formData.leadSource}
                onChange={(value) => setFormData((prev) => ({ ...prev, leadSource: value as LeadSource }))}
              >
                {LEAD_SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {formatLeadSource(source)}
                  </option>
                ))}
              </MobileLeadSelect>
            ) : (
              <Select value={formData.leadSource} onValueChange={(value) => setFormData((prev) => ({ ...prev, leadSource: value as LeadSource }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAD_SOURCE_OPTIONS.map((source) => <SelectItem key={source} value={source}>{formatLeadSource(source)}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Lead Status</Label>
            {isMobileLayout ? (
              <MobileLeadSelect
                value={formData.leadStatus}
                onChange={(value) => setFormData((prev) => ({ ...prev, leadStatus: value as LeadStatus }))}
              >
                {LEAD_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {formatLeadStatus(status)}
                  </option>
                ))}
              </MobileLeadSelect>
            ) : (
              <Select value={formData.leadStatus} onValueChange={(value) => setFormData((prev) => ({ ...prev, leadStatus: value as LeadStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAD_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{formatLeadStatus(status)}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="leadVehicle">Vehicle if known</Label>
            <Input id="leadVehicle" value={formData.vehicle} onChange={(e) => setFormData((prev) => ({ ...prev, vehicle: e.target.value }))} placeholder="2021 Tesla Model 3, F-150, unknown daily driver..." />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="serviceInterest">What do they want? <span className="text-destructive">*</span></Label>
          <Input id="serviceInterest" value={formData.serviceInterest} onChange={(e) => setFormData((prev) => ({ ...prev, serviceInterest: e.target.value }))} placeholder="Full front PPF, ceramic tint, oil service, exhaust work..." />
          {getFieldError("serviceInterest") ? <p className="text-sm text-destructive">{getFieldError("serviceInterest")}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-2">
            <Label htmlFor="leadSummary">Context</Label>
            <Textarea id="leadSummary" value={formData.summary} onChange={(e) => setFormData((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Price shopping, wants Friday install, referred by a past customer, concerned about turnaround, etc." rows={4} className="resize-none" />
          </div>
          <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="space-y-2">
              <Label htmlFor="nextStep">Next Step</Label>
              <Input id="nextStep" value={formData.nextStep} onChange={(e) => setFormData((prev) => ({ ...prev, nextStep: e.target.value }))} placeholder="Call at 4pm, send quote, waiting on VIN..." />
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="leadMarketingOptIn" checked={formData.marketingOptIn} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, marketingOptIn: checked === true }))} className="mt-0.5" />
              <div>
                <Label htmlFor="leadMarketingOptIn" className="cursor-pointer">Marketing opt-in</Label>
                <p className="mt-1 text-xs text-muted-foreground">Only leave this on when the lead explicitly agreed to follow-up marketing.</p>
              </div>
            </div>
          </div>
        </div>

        <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground" onClick={() => setShowAdvanced((prev) => !prev)}>
          {showAdvanced ? <><ChevronUp className="h-4 w-4" />Hide extra details</> : <><ChevronDown className="h-4 w-4" />Add address and team notes</>}
        </button>

        {showAdvanced ? (
          <div className="space-y-6 rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="space-y-2">
              <Label htmlFor="leadAddress">Address</Label>
              <Input id="leadAddress" value={formData.address} onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="leadCity">City</Label>
                <Input id="leadCity" value={formData.city} onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))} placeholder="Los Angeles" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leadState">State</Label>
                <Input id="leadState" value={formData.state} onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))} placeholder="CA" maxLength={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leadZip">Zip</Label>
                <Input id="leadZip" value={formData.zip} onChange={(e) => setFormData((prev) => ({ ...prev, zip: e.target.value }))} placeholder="90001" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="teamNotes">Internal Team Notes</Label>
              <Textarea id="teamNotes" value={formData.teamNotes} onChange={(e) => setFormData((prev) => ({ ...prev, teamNotes: e.target.value }))} placeholder="Best callback time, urgency, sales owner, pricing sensitivity, promised timeline, or anything private to the team." rows={3} className="resize-none" />
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          {ACTIONS.map(({ mode, label, icon: Icon, variant }) => (
            <Button key={mode} type="submit" variant={variant} disabled={fetching} data-submit-mode={mode} onClick={() => setSubmitIntent(mode)} className="justify-start">
              {fetching && submitMode === mode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
              {label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" asChild>
            <Link to={returnTo}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cancel
            </Link>
          </Button>
        </div>
      </form>
    </section>
  ) : null;

  if (businessFetching) {
    return (
      <div className="max-w-6xl mx-auto p-6 pb-12 flex items-center justify-center min-h-40">
        <p className="text-muted-foreground">Loading leads...</p>
      </div>
    );
  }

  if (!business?.id) {
    return (
      <div className="max-w-3xl mx-auto p-6 pb-12">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load your business profile. Please try refreshing the page.
        </div>
      </div>
    );
  }

  return (
    <div className="page-content page-section max-w-6xl">
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to previous screen" /> : null}
      <PageHeader
        title="Leads"
        backTo={returnTo}
        badge={
          <Badge variant="secondary" className="text-sm font-medium">
            {business.name ?? "Shop"} pipeline
          </Badge>
        }
        right={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link
                to="/appointments/requests"
                onClick={() => {
                  void triggerImpactFeedback("light");
                }}
              >
                <Inbox className="mr-1.5 h-4 w-4" />
                Booking Requests
              </Link>
            </Button>
            <Button type="button" onClick={openLeadComposer} className="w-full sm:w-auto">
              <UserRoundPlus className="mr-1.5 h-4 w-4" />
              Add Lead
            </Button>
          </div>
        }
      />
      {leadComposerSection}
      <div className="mb-5 space-y-3 md:hidden">
        <div className="mobile-support-card flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{visibleLeads.length} visible leads</p>
            <p className="text-xs text-muted-foreground">
              {activeLeadCount} active · {overdueLeadCount} overdue
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setShowOverviewDetails((open) => !open)}
          >
            {showOverviewDetails ? "Hide details" : "More details"}
          </Button>
        </div>
        <Button asChild variant="outline" className="h-11 w-full rounded-xl">
          <Link
            to="/appointments/requests"
            onClick={() => {
              void triggerImpactFeedback("light");
            }}
          >
            <Inbox className="mr-2 h-4 w-4" />
            Booking Requests
          </Link>
        </Button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
        <div className="order-2 space-y-6 xl:order-1">
          <div className={isMobileLayout && !showOverviewDetails ? "hidden" : "space-y-6"}>
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Active leads</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{activeLeadCount}</p>
            </div>
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">New</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{newLeadCount}</p>
            </div>
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Quoted</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{quotedLeadCount}</p>
            </div>
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Booked</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{bookedLeadCount}</p>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Average first response</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">
                {averageResponseHours === null ? "Not enough data" : `${averageResponseHours < 1 ? "<1" : Math.round(averageResponseHours)}h`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Based on {firstResponseTrackedCount} lead{firstResponseTrackedCount === 1 ? "" : "s"} with a recorded first contact.
              </p>
            </div>
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Still awaiting first response</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">
                {leadRecords.filter((entry) => entry.lead.status === "new" && !entry.lead.firstContactedAt).length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                New leads that have not been marked contacted, quoted, booked, or converted yet.
              </p>
            </div>
          </section>

          <section className="surface-panel p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Source performance</p>
                <p className="mt-1 text-sm text-foreground">
                  See which channels are bringing workable leads, which ones book, and where response speed slips.
                </p>
              </div>
              <Badge variant="outline">{sourcePerformance.length} active source{sourcePerformance.length === 1 ? "" : "s"}</Badge>
            </div>

            {sourcePerformance.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {sourcePerformance.map((item) => (
                  <div key={item.source} className="rounded-xl border border-border/70 bg-background/70 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{formatLeadSource(item.source)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.totalCount} lead{item.totalCount === 1 ? "" : "s"} captured
                        </p>
                      </div>
                      <Badge variant="secondary">{item.closeRate}% close rate</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Booked</p>
                        <p className="mt-2 text-lg font-semibold text-foreground">{item.bookingRate}%</p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Converted</p>
                        <p className="mt-2 text-lg font-semibold text-foreground">{item.convertedCount}</p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Response</p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {item.averageResponseHours === null ? "--" : `${item.averageResponseHours < 1 ? "<1" : Math.round(item.averageResponseHours)}h`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                Capture leads from at least one source to unlock source performance reporting.
              </div>
            )}
          </section>
          </div>

        </div>

        <div className="order-1 space-y-6 xl:order-2">
          <section className="surface-panel p-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Pipeline queue</p>
                    <p className="mt-1 text-sm text-foreground">
                      {isMobileLayout
                        ? "See who needs a call, quote, or booking next."
                        : "Keep source, requested work, status, vehicle, and next action visible so nothing is lost between first contact and scheduled work."}
                    </p>
                  </div>
                  <Badge variant="outline">{visibleLeads.length} visible</Badge>
                </div>

                <div className={isMobileLayout && !showOverviewDetails ? "hidden" : "grid gap-3 sm:grid-cols-3"}>
                  <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Contact ready</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{contactReadyLeadCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Leads with a phone number or email ready for follow-up.</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Vehicle captured</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{knownVehicleLeadCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Intake records that already include a known vehicle.</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Missing next action</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{missingNextStepCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Active leads that still need a clear follow-up plan.</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-amber-700">Due soon</p>
                    <p className="mt-2 text-lg font-semibold text-amber-950">{dueSoonLeadCount}</p>
                    <p className="mt-1 text-xs text-amber-800">New leads approaching the {responseWindowHours}-hour response target.</p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-rose-700">Overdue</p>
                    <p className="mt-2 text-lg font-semibold text-rose-950">{overdueLeadCount}</p>
                    <p className="mt-1 text-xs text-rose-800">New leads past the configured first-response window.</p>
                  </div>
                </div>

                {inlineUpdateError ? <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{inlineUpdateError}</div> : null}

                <div className="grid gap-3 rounded-[1.15rem] border border-border/70 bg-background/80 p-3.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search name, status, source, vehicle, date, or ask"
                      className="pl-9"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {isMobileLayout ? (
                      <>
                        <MobileLeadSelect value={statusFilter} onChange={(value) => setStatusFilter(value as LeadStatus | "all" | "active")}>
                          <option value="active">Active only</option>
                          <option value="all">All statuses</option>
                          {LEAD_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {formatLeadStatus(status)}
                            </option>
                          ))}
                        </MobileLeadSelect>
                        <MobileLeadSelect value={sourceFilter} onChange={(value) => setSourceFilter(value as LeadSource | "all")}>
                          <option value="all">All sources</option>
                          {LEAD_SOURCE_OPTIONS.map((source) => (
                            <option key={source} value={source}>
                              {formatLeadSource(source)}
                            </option>
                          ))}
                        </MobileLeadSelect>
                      </>
                    ) : (
                      <>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as LeadStatus | "all" | "active")}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active only</SelectItem>
                            <SelectItem value="all">All statuses</SelectItem>
                            {LEAD_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{formatLeadStatus(status)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as LeadSource | "all")}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All sources</SelectItem>
                            {LEAD_SOURCE_OPTIONS.map((source) => <SelectItem key={source} value={source}>{formatLeadSource(source)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  </div>
                  {searchQuery || statusFilter !== "active" || sourceFilter !== "all" ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
                      <p className="text-muted-foreground">
                        {[
                          searchQuery ? `Search: ${searchQuery}` : null,
                          statusFilter !== "active" ? `Status: ${statusFilter === "all" ? "all" : formatLeadStatus(statusFilter)}` : null,
                          sourceFilter !== "all" ? `Source: ${formatLeadSource(sourceFilter)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => {
                          setSearchQuery("");
                          setStatusFilter("active");
                          setSourceFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

            <div className="mt-4 space-y-3">
              {recentClientsFetching ? (
                <p className="text-sm text-muted-foreground">Loading leads...</p>
              ) : visibleLeads.length > 0 ? (
                visibleLeads.map((entry) => {
                  const { client, lead } = entry;
                  const sla = getLeadSlaState(client.createdAt, lead, responseWindowHours);
                  const slaMessage = formatLeadSlaMessage(client.createdAt, lead, responseWindowHours);
                  const clientDisplayName = [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || "Lead";
                  const clientInitials =
                    [client.firstName, client.lastName]
                      .filter(Boolean)
                      .map((value) => String(value).trim().charAt(0).toUpperCase())
                      .join("")
                      .slice(0, 2) || "L";
                  const clientLocationLabel = [client.address, client.city, client.state, client.zip].filter(Boolean).join(", ");
                  const clientHref = `/clients/${client.id}?from=${encodeURIComponent("/leads")}`;
                  const appointmentHref = buildLeadAppointmentHref({
                    clientId: client.id,
                    locationId: currentLocationId,
                    requestedServices: lead.serviceInterest,
                    leadSource: lead.source,
                    sourceSummary: lead.summary,
                    teamNotes: client.internalNotes,
                    vehicle: lead.vehicle,
                    sourceAddress: clientLocationLabel,
                    customerName: clientDisplayName,
                    phone: client.phone,
                    email: client.email,
                  });
                  const quoteHref = `/quotes/new?clientId=${client.id}&from=${encodeURIComponent("/leads")}${buildQuoteRecipientQuery({
                    firstName: client.firstName,
                    lastName: client.lastName,
                    email: client.email,
                  })}`;
                  const addVehicleHref = `/clients/${client.id}/vehicles/new?from=${encodeURIComponent("/leads")}`;
                  const slaStatusLabel = sla.overdue ? "Past the response window" : sla.dueSoon ? "Approaching the response window" : "On track";
                  const showCardDetails = !isMobileLayout || Boolean(expandedLeadDetails[client.id]);
                  const previewMeta = [lead.nextStep ? `Next: ${lead.nextStep}` : null, lead.vehicle || null].filter(Boolean);
                  return (
                    <Card key={client.id} className="overflow-hidden rounded-[1.15rem] border-border/70 bg-card py-0 shadow-sm">
                      <CardContent className="space-y-4 p-4 sm:p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 items-start gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-slate-950 text-sm font-semibold tracking-[0.12em] text-white">
                              {clientInitials}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-base font-semibold tracking-[-0.02em] text-slate-950">{clientDisplayName}</p>
                                <Badge variant={badgeVariantForStatus(lead.status)}>{formatLeadStatus(lead.status)}</Badge>
                                <Badge variant="outline">{formatLeadSource(lead.source)}</Badge>
                                {sla.overdue ? <Badge className="bg-rose-600 text-white hover:bg-rose-600">Overdue</Badge> : null}
                                {!sla.overdue && sla.dueSoon ? <Badge className="bg-amber-500 text-white hover:bg-amber-500">Due soon</Badge> : null}
                              </div>
                              <p className="mt-1 text-sm text-slate-600">
                                {lead.serviceInterest?.trim() || "Lead captured and ready for the next step."}
                              </p>
                              {previewMeta.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {previewMeta.map((item) => (
                                    <span key={item} className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                {client.phone ? <span>{client.phone}</span> : null}
                                {client.email ? <span>{client.email}</span> : null}
                                {!isMobileLayout && clientLocationLabel ? <span>{clientLocationLabel}</span> : null}
                              </div>
                            </div>
                          </div>
                          <div className="flex w-full items-start gap-2 lg:w-[232px] lg:justify-end">
                            <div className="min-w-0 flex-1 lg:max-w-[180px]">
                              {isMobileLayout ? (
                                <MobileLeadSelect
                                  value={lead.status}
                                  onChange={(value) => void updateLeadStatus(client, value as LeadStatus)}
                                  disabled={updatingLead}
                                >
                                  {LEAD_STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>
                                      {formatLeadStatus(status)}
                                    </option>
                                  ))}
                                </MobileLeadSelect>
                              ) : (
                                <Select value={lead.status} onValueChange={(value) => void updateLeadStatus(client, value as LeadStatus)}>
                                  <SelectTrigger className="w-full" disabled={updatingLead}><SelectValue /></SelectTrigger>
                                  <SelectContent>{LEAD_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{formatLeadStatus(status)}</SelectItem>)}</SelectContent>
                                </Select>
                              )}
                            </div>
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`Lead actions for ${clientDisplayName}`}
                                  className="shrink-0 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-50"
                                >
                                  <span>Details</span>
                                  <ChevronDown className="ml-1 h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" sideOffset={8} className="w-52">
                                <DropdownMenuItem asChild>
                                  <Link to={clientHref}>Open client</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to={appointmentHref}>Create appointment</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to={quoteHref}>Create quote</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link to={addVehicleHref}>Add vehicle</Link>
                                </DropdownMenuItem>
                                {lead.status === "new" ? (
                                  <DropdownMenuItem onSelect={() => void handleMarkContacted(entry)}>
                                    Mark contacted
                                  </DropdownMenuItem>
                                ) : null}
                                {lead.status !== "converted" ? (
                                  <DropdownMenuItem onSelect={() => void handleConvert(entry)}>
                                    Convert to client
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {showCardDetails ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-[1.1rem] border border-slate-200/85 bg-slate-50/80 p-3.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vehicle</p>
                            <p className="mt-2 text-sm font-medium text-slate-950">{lead.vehicle || "Vehicle not captured yet"}</p>
                          </div>
                          <div className="rounded-[1.1rem] border border-slate-200/85 bg-slate-50/80 p-3.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Next step</p>
                            <p className="mt-2 text-sm font-medium text-slate-950">{lead.nextStep || "Not set yet"}</p>
                          </div>
                          <div className="rounded-[1.1rem] border border-slate-200/85 bg-slate-50/80 p-3.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Response time</p>
                            <p className="mt-2 text-sm font-medium text-slate-950">{formatLeadResponseTime(client.createdAt, lead.firstContactedAt)}</p>
                          </div>
                          <div className="rounded-[1.1rem] border border-slate-200/85 bg-slate-50/80 p-3.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">SLA</p>
                            <p className="mt-2 text-sm font-medium text-slate-950">{slaMessage || slaStatusLabel}</p>
                          </div>
                        </div>
                        ) : null}

                        {showCardDetails ? (
                          <div className="grid gap-3 lg:grid-cols-2">
                            <div className="rounded-[1.1rem] border border-slate-200/85 bg-white p-4">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Lead context</p>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                {lead.summary || "No additional context captured yet."}
                              </p>
                            </div>
                            <div className="rounded-[1.1rem] border border-slate-200/85 bg-white p-4">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Team notes</p>
                              <p className="mt-2 text-sm leading-6 text-slate-700">
                                {client.internalNotes || "No internal team notes yet."}
                              </p>
                              {clientLocationLabel ? (
                                <p className="mt-3 text-xs text-slate-500">
                                  {clientLocationLabel}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        {showCardDetails ? (
                        <div className="flex flex-wrap gap-2">
                          {lead.status === "new" ? (
                            <Button size="sm" onClick={() => void handleMarkContacted(entry)} disabled={updatingLead}>
                              Mark contacted
                            </Button>
                          ) : null}
                          <Button size="sm" variant="outline" asChild>
                            <Link to={clientHref}>Open client</Link>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link to={appointmentHref}>Create appointment</Link>
                          </Button>
                          {lead.status !== "converted" ? (
                            <Button size="sm" onClick={() => void handleConvert(entry)} disabled={updatingLead}>
                              Convert to client
                            </Button>
                          ) : null}
                        </div>
                        ) : null}

                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            Captured {formatDistanceToNow(new Date(client.createdAt), { addSuffix: true })}
                          </p>
                          {isMobileLayout ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => toggleLeadDetails(client.id)}
                            >
                              {showCardDetails ? "Hide details" : "More details"}
                            </Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <EmptyState icon={ClipboardList} title="No leads in this view" description="Capture a lead from any source and it will show up here with source, status, ask, known vehicle, and the next action." className="border-0 bg-transparent p-0 shadow-none" />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
