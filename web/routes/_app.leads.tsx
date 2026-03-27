import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router";
import type { FormEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  CalendarPlus,
  Car,
  ChevronDown,
  ChevronUp,
  ClipboardList,
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
    lead.status,
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

export default function LeadsPage() {
  const navigate = useNavigate();
  const { businessId, currentLocationId } = useOutletContext<AuthOutletContext>();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/signed-in";
  const hasQueueReturn = searchParams.has("from");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [submitMode, setSubmitMode] = useState<SubmitMode>("lead");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all" | "active">("active");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const submitModeRef = useRef<SubmitMode>("lead");

  const [{ data: business, fetching: businessFetching }] = useFindFirst(api.business, {
    select: { id: true, name: true },
    pause: !businessId,
  });
  const [{ fetching, error }, createClient] = useAction(api.client.create);
  const [{ fetching: updatingLead, error: updateLeadError }, updateClient] = useAction(api.client.update);
  const [{ data: recentClientsRaw, fetching: recentClientsFetching }, refetchLeads] = useFindMany(api.client, {
    first: 100,
    sort: { createdAt: "Descending" },
    pause: !businessId,
  });

  const [formData, setFormData] = useState<LeadFormData>({
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
  });

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

  const visibleLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return leadRecords.filter((entry) => {
      if (statusFilter === "active" && !ACTIVE_STATUSES.includes(entry.lead.status)) return false;
      if (statusFilter !== "active" && statusFilter !== "all" && entry.lead.status !== statusFilter) return false;
      if (sourceFilter !== "all" && entry.lead.source !== sourceFilter) return false;
      if (query && !entry.searchableText.includes(query)) return false;
      return true;
    });
  }, [leadRecords, searchQuery, sourceFilter, statusFilter]);

  const activeLeadCount = useMemo(
    () => leadRecords.filter((entry) => !["converted", "lost"].includes(entry.lead.status)).length,
    [leadRecords]
  );
  const newLeadCount = useMemo(() => leadRecords.filter((entry) => entry.lead.status === "new").length, [leadRecords]);
  const quotedLeadCount = useMemo(() => leadRecords.filter((entry) => entry.lead.status === "quoted").length, [leadRecords]);
  const bookedLeadCount = useMemo(() => leadRecords.filter((entry) => entry.lead.status === "booked").length, [leadRecords]);
  const contactReadyLeadCount = useMemo(
    () => leadRecords.filter((entry) => Boolean(entry.client.phone || entry.client.email)).length,
    [leadRecords]
  );
  const knownVehicleLeadCount = useMemo(
    () => leadRecords.filter((entry) => Boolean(entry.lead.vehicle?.trim())).length,
    [leadRecords]
  );
  const missingNextStepCount = useMemo(
    () =>
      leadRecords.filter(
        (entry) => ACTIVE_STATUSES.includes(entry.lead.status) && !entry.lead.nextStep?.trim()
      ).length,
    [leadRecords]
  );

  const setSubmitIntent = (mode: SubmitMode) => {
    submitModeRef.current = mode;
    setSubmitMode(mode);
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
    });

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

    const createdClientId = (result.data as any)?.id;
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
      navigate(`/quotes/new?clientId=${createdClientId}&from=${encodeURIComponent("/leads")}`);
      return;
    }
    if (mode === "appointment") {
      navigate(`/appointments/new?clientId=${createdClientId}${currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""}&from=${encodeURIComponent("/leads")}`);
      return;
    }

    navigate(`/clients/${createdClientId}?from=${encodeURIComponent("/leads")}`);
  };

  const updateLeadStatus = async (client: any, status: LeadStatus) => {
    const lead = parseLeadRecord(client.notes);
    if (!lead.isLead) return;
    const result = await updateClient({
      id: client.id,
      notes: buildLeadNotes({
        ...lead,
        status,
      }),
    });
    if (result.error) {
      toast.error(result.error.message ?? "Could not update lead.");
      return;
    }
    toast.success(status === "converted" ? "Lead marked converted" : "Lead updated");
    await refetchLeads();
  };

  const handleConvert = async (entry: LeadEntry) => {
    if (entry.lead.status !== "converted") {
      await updateLeadStatus(entry.client, "converted");
    }
    navigate(`/clients/${entry.client.id}?from=${encodeURIComponent("/leads")}`);
  };

  const generalError =
    error && !(error as any).validationErrors
      ? (error as any).message ?? "An error occurred. Please try again."
      : null;

  const inlineUpdateError =
    updateLeadError && !(updateLeadError as any).validationErrors
      ? (updateLeadError as any).message ?? "Could not update lead."
      : null;

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
        subtitle="Capture interest from any source, keep the next move visible, and convert leads into client work without losing the intake context."
        backTo={returnTo}
        badge={
          <Badge variant="secondary" className="text-sm font-medium">
            {business.name ?? "Shop"} pipeline
          </Badge>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Active leads</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{activeLeadCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Needs follow-up or conversion</p>
            </div>
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">New</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{newLeadCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Fresh inbound opportunities</p>
            </div>
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Quoted</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{quotedLeadCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Waiting on approval</p>
            </div>
            <div className="surface-panel px-4 py-4 sm:px-5">
              <p className="text-sm font-medium text-muted-foreground">Booked</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{bookedLeadCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Moved into scheduled work</p>
            </div>
          </section>

          <section className="rounded-[1.4rem] border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-5 rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium">Fast lead intake</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every lead becomes a real client record immediately. Capture the ask, source, known vehicle, and next step now, then move straight into booking, quoting, or vehicle intake when the lead is ready.
              </p>
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
                  <Select value={formData.leadSource} onValueChange={(value) => setFormData((prev) => ({ ...prev, leadSource: value as LeadSource }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LEAD_SOURCE_OPTIONS.map((source) => <SelectItem key={source} value={source}>{formatLeadSource(source)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Lead Status</Label>
                  <Select value={formData.leadStatus} onValueChange={(value) => setFormData((prev) => ({ ...prev, leadStatus: value as LeadStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LEAD_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{formatLeadStatus(status)}</SelectItem>)}</SelectContent>
                  </Select>
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
        </div>

        <div className="space-y-6">
          <section className="surface-panel p-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Lead queue</p>
                    <p className="mt-1 text-sm text-foreground">Keep source, ask, status, vehicle, and next move visible so nothing gets lost between first contact and scheduled work.</p>
                  </div>
                  <Badge variant="outline">{visibleLeads.length} visible</Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
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
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Needs next step</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{missingNextStepCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Active leads that still need a clear follow-up plan.</p>
                  </div>
                </div>

                {inlineUpdateError ? <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{inlineUpdateError}</div> : null}

                <div className="grid gap-3">
                  <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search lead name, ask, contact, source, or vehicle" className="pl-9" />
                </div>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                  return (
                    <div key={client.id} className="rounded-xl border border-border/70 bg-background/80 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">{client.firstName} {client.lastName}</p>
                            <Badge variant={badgeVariantForStatus(lead.status)}>{formatLeadStatus(lead.status)}</Badge>
                            <Badge variant="outline">{formatLeadSource(lead.source)}</Badge>
                          </div>
                          <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                            {client.phone ? <p>{client.phone}</p> : null}
                            {client.email ? <p>{client.email}</p> : null}
                            {client.address || client.city || client.state || client.zip ? <p>{[client.address, client.city, client.state, client.zip].filter(Boolean).join(", ")}</p> : null}
                          </div>
                        </div>
                        <div className="w-full sm:w-[180px]">
                          <Select value={lead.status} onValueChange={(value) => void updateLeadStatus(client, value as LeadStatus)}>
                            <SelectTrigger className="w-full" disabled={updatingLead}><SelectValue /></SelectTrigger>
                            <SelectContent>{LEAD_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{formatLeadStatus(status)}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
                        <p><span className="font-medium text-foreground">What they want:</span> {lead.serviceInterest || "Not captured"}</p>
                        {lead.vehicle ? (
                          <p className="flex items-start gap-2">
                            <Car className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span><span className="font-medium text-foreground">Vehicle:</span> {lead.vehicle}</span>
                          </p>
                        ) : null}
                        <p><span className="font-medium text-foreground">Next step:</span> {lead.nextStep || "Not set"}</p>
                        {lead.summary ? <p><span className="font-medium text-foreground">Context:</span> {lead.summary}</p> : null}
                        {client.internalNotes ? <p><span className="font-medium text-foreground">Team notes:</span> {client.internalNotes}</p> : null}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" asChild><Link to={`/clients/${client.id}?from=${encodeURIComponent("/leads")}`}>Open client</Link></Button>
                        <Button size="sm" variant="outline" asChild><Link to={`/appointments/new?clientId=${client.id}&from=${encodeURIComponent("/leads")}`}>Book</Link></Button>
                        <Button size="sm" variant="outline" asChild><Link to={`/quotes/new?clientId=${client.id}&from=${encodeURIComponent("/leads")}`}>Quote</Link></Button>
                        <Button size="sm" variant="outline" asChild><Link to={`/clients/${client.id}/vehicles/new?from=${encodeURIComponent("/leads")}`}>Add vehicle</Link></Button>
                        {lead.status !== "converted" ? <Button size="sm" onClick={() => void handleConvert(entry)} disabled={updatingLead}>Mark converted</Button> : null}
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        Captured {formatDistanceToNow(new Date(client.createdAt), { addSuffix: true })}
                      </p>
                    </div>
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
