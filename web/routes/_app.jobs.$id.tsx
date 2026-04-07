import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  ChevronDown,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Receipt,
  Save,
  Trash2,
  UserRound,
  Car,
} from "lucide-react";
import { api } from "../api";
import { useAction, useFindFirst, useFindMany, useFindOne } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { usePageContext } from "../components/shared/CommandPaletteContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { getIntakePreset } from "../lib/intakePresets";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type JobRecord = {
  id: string;
  appointmentId: string;
  jobNumber: string;
  status: string;
  title?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  totalPrice?: number | string | null;
  notes?: string | null;
  internalNotes?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
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
  assignedStaff?: { id: string; firstName?: string | null; lastName?: string | null } | null;
  location?: { id: string; name?: string | null; address?: string | null } | null;
  services?: Array<{
    id: string;
    serviceId?: string | null;
    name?: string | null;
    category?: string | null;
    quantity?: number | null;
    unitPrice?: number | string | null;
    durationMinutes?: number | null;
  }>;
  invoice?: { id: string; invoiceNumber?: string | null; status: string; total?: number | string | null } | null;
  quote?: { id: string; status: string; total?: number | string | null } | null;
};

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no-show", label: "No Show" },
] as const;

function formatCurrency(amount: number | string | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return "Not scheduled";
  const startDate = new Date(start);
  const startText = startDate.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!end) return startText;
  const endDate = new Date(end);
  return `${startText} - ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function formatName(person?: { firstName?: string | null; lastName?: string | null } | null): string {
  const value = `${person?.firstName ?? ""} ${person?.lastName ?? ""}`.trim();
  return value || "-";
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

function getProgressStages(record: JobRecord) {
  return [
    { key: "booked", label: "Booked", complete: Boolean(record.appointmentId), active: ["scheduled", "confirmed"].includes(record.status) },
    { key: "assigned", label: "Assigned", complete: Boolean(record.assignedStaff?.id), active: ["scheduled", "confirmed"].includes(record.status) && !record.assignedStaff?.id },
    { key: "in_service", label: "In Service", complete: ["in_progress", "completed"].includes(record.status), active: record.status === "in_progress" },
    { key: "billed", label: "Billed", complete: Boolean(record.invoice?.id), active: record.status === "completed" && !record.invoice?.id },
    { key: "pickup", label: "Ready", complete: record.status === "completed" && Boolean(record.invoice?.id), active: record.status === "completed" && Boolean(record.invoice?.id) },
  ];
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { businessId, businessType, permissions } = useOutletContext<AuthOutletContext>();
  const canEdit = permissions.has("jobs.write");
  const canWriteQuotes = permissions.has("quotes.write");
  const canWriteInvoices = permissions.has("invoices.write");
  const { setPageContext } = usePageContext();
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/jobs";
  const hasQueueReturn = searchParams.has("from");
  const withReturn = (pathname: string) =>
    `${pathname}${pathname.includes("?") ? "&" : "?"}from=${encodeURIComponent(returnTo)}`;

  const [{ data: job, fetching, error }, refetchJob] = useFindOne(api.job, id ?? "", {
    pause: !businessId || !id,
  });
  const [{ data: staff }] = useFindMany(api.staff, { first: 100, pause: !businessId } as any);
  const [{ data: locations }] = useFindMany(api.location, { first: 100, pause: !businessId } as any);
  const [{ data: serviceCatalog, fetching: servicesFetching }] = useFindMany(api.service, {
    first: 200,
    sort: { createdAt: "Descending" },
    pause: !businessId,
  } as any);
  const [{ data: activityLogs }] = useFindMany(api.activityLog, {
    entityType: "job",
    entityId: id,
    first: 8,
    pause: !businessId || !id,
  } as any);
  const [{ data: invoiceFreshness }] = useFindFirst(api.invoice, {
    live: true,
    filter: { appointmentId: { equals: id } },
    select: { id: true, lastSentAt: true, lastPaidAt: true },
    pause: !businessId || !id,
  } as any);
  const [{ data: quoteFreshness }] = useFindFirst(api.quote, {
    live: true,
    filter: { appointmentId: { equals: id } },
    select: { id: true, sentAt: true, followUpSentAt: true },
    pause: !businessId || !id,
  } as any);
  const [{ fetching: saving }, runUpdateJob] = useAction(api.job.update);
  const [{ fetching: addingService }, runAddAppointmentService] = useAction(api.appointmentService.create);
  const [{ fetching: removingService }, runRemoveAppointmentService] = useAction(
    (params: Record<string, unknown>) => api.appointmentService.delete(params)
  );
  const [{ fetching: completingService }, runCompleteService] = useAction(api.appointmentService.complete);
  const [{ fetching: reopeningService }, runReopenService] = useAction(api.appointmentService.reopen);

  const record = (job ?? null) as JobRecord | null;
  const [form, setForm] = useState({
    title: "",
    status: "scheduled",
    assignedStaffId: "__unassigned__",
    locationId: "__unassigned__",
    notes: "",
    internalNotes: "",
  });
  const [selectedServiceId, setSelectedServiceId] = useState("__none__");
  const [showMobilePickupReadiness, setShowMobilePickupReadiness] = useState(false);
  const [showMobileFollowUp, setShowMobileFollowUp] = useState(false);

  useEffect(() => {
    if (!record) return;
    setForm({
      title: record.title ?? "",
      status: record.status ?? "scheduled",
      assignedStaffId: record.assignedStaff?.id ?? "__unassigned__",
      locationId: record.location?.id ?? "__unassigned__",
      notes: record.notes ?? "",
      internalNotes: record.internalNotes ?? "",
    });
  }, [record]);

  useEffect(() => {
    if (!record) return;
    const clientName = record.client ? formatName(record.client) : null;
    const vehicleLabel = record.vehicle
      ? [record.vehicle.year, record.vehicle.make, record.vehicle.model].filter(Boolean).join(" ")
      : null;
    setPageContext({
      entityType: "job",
      entityId: record.id,
      entityLabel: record.title?.trim() || record.jobNumber,
      clientId: record.client?.id ?? null,
      clientName,
      vehicleId: record.vehicle?.id ?? null,
      vehicleLabel,
      appointmentId: record.appointmentId ?? record.id,
      invoiceId: record.invoice?.id ?? null,
    });
    return () => setPageContext(null);
  }, [record, setPageContext]);

  const serviceSummary = useMemo(
    () =>
      (record?.services ?? []).reduce(
        (acc, service) => {
          acc.count += Number(service.quantity ?? 1);
          acc.minutes += Number(service.durationMinutes ?? 0);
          return acc;
        },
        { count: 0, minutes: 0 }
      ),
    [record?.services]
  );
  const existingServiceIds = useMemo(
    () => new Set((record?.services ?? []).map((service) => service.serviceId).filter(Boolean)),
    [record?.services]
  );
  const availableServices = useMemo(
    () =>
      ((serviceCatalog ?? []) as Array<{ id: string; name?: string | null; category?: string | null; price?: number | string | null }>)
        .filter((service) => service.id && !existingServiceIds.has(service.id)),
    [serviceCatalog, existingServiceIds]
  );
  const intakePreset = useMemo(() => getIntakePreset(businessType), [businessType]);
  const quoteNeedsFollowUp =
    !!record?.quote &&
    ["sent", "accepted"].includes(String(record.quote.status ?? "")) &&
    (!safeDate((quoteFreshness as any)?.followUpSentAt ?? null)
      ? isOlderThanDays((quoteFreshness as any)?.sentAt ?? null, 2)
      : isOlderThanDays((quoteFreshness as any)?.followUpSentAt ?? null, 5));
  const invoiceNeedsFollowUp =
    !!record?.invoice &&
    ["sent", "partial"].includes(String(record.invoice.status ?? "")) &&
    !safeDate((invoiceFreshness as any)?.lastPaidAt ?? null) &&
    isOlderThanDays((invoiceFreshness as any)?.lastSentAt ?? null, 3);
  const completedServiceIds = useMemo(() => {
    const latest = new Map<string, boolean>();
    for (const item of ((activityLogs ?? []) as Array<{ type?: string | null; metadata?: string | null }>)) {
      let appointmentServiceId: string | null = null;
      try {
        const parsed = item.metadata ? (JSON.parse(item.metadata) as { appointmentServiceId?: string }) : null;
        appointmentServiceId = parsed?.appointmentServiceId ?? null;
      } catch {
        appointmentServiceId = null;
      }
      if (!appointmentServiceId || latest.has(appointmentServiceId)) continue;
      if (item.type === "job.service_completed") latest.set(appointmentServiceId, true);
      if (item.type === "job.service_reopened") latest.set(appointmentServiceId, false);
    }
    return latest;
  }, [activityLogs]);

  const progressStages = record ? getProgressStages(record) : [];
  const completedServiceCount = (record?.services ?? []).filter((service) => completedServiceIds.get(service.id) === true).length;
  const pickupReady = record?.status === "completed" && completedServiceCount === (record?.services ?? []).length && Boolean(record?.invoice?.id);

  const handleSave = async () => {
    if (!record) return;
    const result = await runUpdateJob({
      id: record.id,
      title: form.title.trim() || null,
      status: form.status,
      assignedStaffId: form.assignedStaffId === "__unassigned__" ? null : form.assignedStaffId,
      locationId: form.locationId === "__unassigned__" ? null : form.locationId,
      notes: form.notes,
      internalNotes: form.internalNotes,
    });
    if (result.error) {
      toast.error(`Failed to save job: ${result.error.message}`);
      return;
    }
    toast.success("Job updated");
    void refetchJob();
  };

  const handleAddService = async () => {
    if (!record?.appointmentId || selectedServiceId === "__none__") return;
    const result = await runAddAppointmentService({
      appointmentId: record.appointmentId,
      serviceId: selectedServiceId,
    });
    if (result.error) {
      toast.error(`Failed to add service: ${result.error.message}`);
      return;
    }
    toast.success("Service added to job");
    setSelectedServiceId("__none__");
    void refetchJob();
  };

  const handleRemoveService = async (appointmentServiceId: string) => {
    const result = await runRemoveAppointmentService({ id: appointmentServiceId });
    if (result.error) {
      toast.error(`Failed to remove service: ${result.error.message}`);
      return;
    }
    toast.success("Service removed from job");
    void refetchJob();
  };

  const handleCompleteService = async (appointmentServiceId: string) => {
    const result = await runCompleteService({ id: appointmentServiceId });
    if ((result as any)?.error) {
      toast.error(`Failed to complete service: ${(result as any).error.message}`);
      return;
    }
    toast.success("Service marked complete");
    void refetchJob();
  };

  const handleReopenService = async (appointmentServiceId: string) => {
    const result = await runReopenService({ id: appointmentServiceId });
    if ((result as any)?.error) {
      toast.error(`Failed to reopen service: ${(result as any).error.message}`);
      return;
    }
    toast.success("Service reopened");
    void refetchJob();
  };

  const applyIntakeTemplate = (target: "notes" | "internalNotes") => {
    setForm((current) => ({
      ...current,
      [target]: target === "notes" ? intakePreset.clientNotes : intakePreset.internalNotes,
    }));
    toast.success(`${intakePreset.label} applied`);
  };

  if (!id) {
    return <div className="flex min-h-[50vh] items-center justify-center"><p className="text-sm text-muted-foreground">Invalid job id.</p></div>;
  }

  if (fetching && !record) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Job not available</h1>
          <p className="text-sm text-muted-foreground">{error?.message ?? "The requested job could not be loaded."}</p>
        </div>
        <Button asChild variant="outline"><Link to={returnTo}>Back to jobs</Link></Button>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-section max-w-6xl space-y-6">
        {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to jobs queue" /> : null}
        <PageHeader
          backTo={returnTo}
          title={record.title?.trim() || record.jobNumber}
          badge={<StatusBadge status={record.status} type="job" />}
          subtitle={`Work order ${record.jobNumber}`}
          right={
            canEdit ? (
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save job
              </Button>
            ) : null
          }
        />

        <Card className="border-border/70 shadow-sm sm:hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2">
            {canEdit ? (
              <Button onClick={() => void handleSave()} disabled={saving} className="w-full">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save job
              </Button>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" className="w-full">
                <Link to={record.appointmentId ? withReturn(`/appointments/${record.appointmentId}`) : "/appointments"}>
                  Open appointment
                </Link>
              </Button>
              {record.invoice ? (
                <Button asChild variant="outline" className="w-full">
                  <Link to={withReturn(`/invoices/${record.invoice.id}`)}>Open invoice</Link>
                </Button>
              ) : canWriteInvoices && record.client?.id ? (
                <Button asChild variant="outline" className="w-full">
                  <Link to={withReturn(`/invoices/new?appointmentId=${record.appointmentId}&clientId=${record.client.id}`)}>
                    Create invoice
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 grid-cols-2 xl:grid-cols-5">
          <TopMetric label="Schedule" value={formatDateRange(record.scheduledStart, record.scheduledEnd)} />
          <TopMetric label="Technician" value={formatName(record.assignedStaff)} />
          <TopMetric label="Revenue" value={formatCurrency(record.totalPrice)} />
          <TopMetric label="Services" value={`${completedServiceCount}/${(record.services ?? []).length} complete`} />
          <TopMetric label="Pickup readiness" value={pickupReady ? "Ready" : record.status === "completed" ? "Needs wrap-up" : "In progress"} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
          <div className="space-y-6">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4"><CardTitle>Operations Control</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FieldBlock icon={ClipboardList} label="Status">
                  <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))} disabled={!canEdit}>
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </FieldBlock>
                <FieldBlock icon={CalendarClock} label="Appointment handoff" value={formatDateRange(record.scheduledStart, record.scheduledEnd)} />
                <FieldBlock icon={UserRound} label="Assigned technician">
                  <Select value={form.assignedStaffId} onValueChange={(value) => setForm((current) => ({ ...current, assignedStaffId: value }))} disabled={!canEdit}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__">Unassigned</SelectItem>
                      {((staff ?? []) as any[]).map((member) => <SelectItem key={member.id} value={member.id}>{member.firstName} {member.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FieldBlock>
                <FieldBlock icon={MapPin} label="Location">
                  <Select value={form.locationId} onValueChange={(value) => setForm((current) => ({ ...current, locationId: value }))} disabled={!canEdit}>
                    <SelectTrigger><SelectValue placeholder="No location" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__">No location</SelectItem>
                      {((locations ?? []) as any[]).map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FieldBlock>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4"><CardTitle>Service Execution</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {canEdit ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-border/70 p-3 sm:flex-row sm:items-center">
                    <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                      <SelectTrigger className="sm:flex-1">
                        <SelectValue placeholder={servicesFetching ? "Loading services..." : "Add a service from your catalog"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select a service</SelectItem>
                        {availableServices.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.name ?? "Service"}{service.category ? ` - ${service.category}` : ""}{service.price != null ? ` - ${formatCurrency(service.price)}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={() => void handleAddService()} disabled={addingService || selectedServiceId === "__none__"}>
                      {addingService ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Add service
                    </Button>
                  </div>
                ) : null}

                {(record.services ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No services attached yet.</p>
                ) : (
                  <div className="space-y-3">
                    {(record.services ?? []).map((service) => {
                      const isCompleted = completedServiceIds.get(service.id) === true;
                      return (
                        <div key={service.id} className="rounded-xl border border-border/70 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className={isCompleted ? "font-semibold line-through text-muted-foreground" : "font-semibold"}>{service.name ?? "Service"}</p>
                                {isCompleted ? <StatusBadge status="completed" type="job" /> : <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{service.category ?? "General"}</span>}
                              </div>
                              <p className="text-sm text-muted-foreground">Qty {service.quantity ?? 1}{service.durationMinutes ? ` - ${service.durationMinutes} min` : ""}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-border/70 px-3 py-1 text-sm font-semibold text-foreground">{formatCurrency(service.unitPrice)}</span>
                              {canEdit ? (
                                <Button variant="outline" size="sm" className="h-9" onClick={() => void (isCompleted ? handleReopenService(service.id) : handleCompleteService(service.id))} disabled={completingService || reopeningService}>
                                  {completingService || reopeningService ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                                  {isCompleted ? "Reopen" : "Complete"}
                                </Button>
                              ) : null}
                              {canEdit ? (
                                <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground hover:text-destructive" onClick={() => void handleRemoveService(service.id)} disabled={removingService}>
                                  {removingService ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4"><CardTitle>Job Notes</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="job-notes">Customer-visible notes</Label>
                    {canEdit ? <Button type="button" variant="ghost" size="sm" onClick={() => applyIntakeTemplate("notes")}>Apply {intakePreset.label}</Button> : null}
                  </div>
                  <Textarea id="job-notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canEdit} rows={6} placeholder="Arrival notes, access instructions, customer requests..." />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="job-internal-notes">Internal notes</Label>
                    {canEdit ? <Button type="button" variant="ghost" size="sm" onClick={() => applyIntakeTemplate("internalNotes")}>Apply {intakePreset.label}</Button> : null}
                  </div>
                  <Textarea id="job-internal-notes" value={form.internalNotes} onChange={(event) => setForm((current) => ({ ...current, internalNotes: event.target.value }))} disabled={!canEdit} rows={6} placeholder="Crew notes, blockers, quality control, handoff info..." />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4"><CardTitle>Next Actions</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <WorkflowStep label="Quote" status={record.quote ? `Linked - ${record.quote.status}` : "No quote attached"} actionHref={record.quote ? withReturn(`/quotes/${record.quote.id}`) : canWriteQuotes && record.client?.id ? withReturn(`/quotes/new?clientId=${record.client.id}&appointmentId=${record.appointmentId}`) : null} actionLabel={record.quote ? "Open quote" : "Create quote"} icon={Receipt} />
                <WorkflowStep label="Invoice" status={record.invoice ? `${record.invoice.status} - ${formatCurrency(record.invoice.total)}` : "No invoice created"} actionHref={record.invoice ? withReturn(`/invoices/${record.invoice.id}`) : canWriteInvoices && record.client?.id ? withReturn(`/invoices/new?appointmentId=${record.appointmentId}&clientId=${record.client.id}`) : null} actionLabel={record.invoice ? "Open invoice" : "Create invoice"} icon={FileText} />
                <WorkflowStep label="Appointment" status={formatDateRange(record.scheduledStart, record.scheduledEnd)} actionHref={record.appointmentId ? withReturn(`/appointments/${record.appointmentId}`) : null} actionLabel="Open appointment" icon={CalendarClock} />
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Pickup Readiness</CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="sm:hidden"
                    onClick={() => setShowMobilePickupReadiness((value) => !value)}
                  >
                    {showMobilePickupReadiness ? "Hide" : "Show"}
                    <ChevronDown className={showMobilePickupReadiness ? "ml-1 h-4 w-4 rotate-180" : "ml-1 h-4 w-4"} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className={showMobilePickupReadiness ? "space-y-3" : "hidden space-y-3 sm:block"}>
                <ReadinessRow label="All services complete" ready={(record.services ?? []).length > 0 && completedServiceCount === (record.services ?? []).length} />
                <ReadinessRow label="Invoice prepared" ready={Boolean(record.invoice?.id)} />
                <ReadinessRow label="Job marked complete" ready={record.status === "completed"} />
                <div className="rounded-xl border border-border/70 bg-background/90 px-3 py-3">
                  <p className="text-sm font-medium">{pickupReady ? "Ready for pickup" : "Needs more work before handoff"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pickupReady ? "Technician work is complete and billing is linked." : "Complete service lines, finish the work order, and link billing before delivery."}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4"><CardTitle>Customer and Vehicle</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow icon={UserRound} label="Client" value={formatName(record.client)} />
                <InfoRow icon={AlertCircle} label="Email" value={record.client?.email ?? "-"} />
                <InfoRow icon={AlertCircle} label="Phone" value={record.client?.phone ?? "-"} />
                <InfoRow icon={Car} label="Vehicle" value={record.vehicle ? [record.vehicle.year, record.vehicle.make, record.vehicle.model].filter(Boolean).join(" ") : "-"} />
                <InfoRow icon={Car} label="Plate" value={record.vehicle?.licensePlate ?? "-"} />
                {record.client ? <Button asChild variant="outline" className="w-full"><Link to={withReturn(`/clients/${record.client.id}`)}>Open customer record</Link></Button> : null}
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Follow-up Freshness</CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="sm:hidden"
                    onClick={() => setShowMobileFollowUp((value) => !value)}
                  >
                    {showMobileFollowUp ? "Hide" : "Show"}
                    <ChevronDown className={showMobileFollowUp ? "ml-1 h-4 w-4 rotate-180" : "ml-1 h-4 w-4"} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className={showMobileFollowUp ? "space-y-3 text-sm" : "hidden space-y-3 text-sm sm:block"}>
                <MiniStat label="Quote follow-up" value={record.quote ? [formatFreshness((quoteFreshness as any)?.sentAt ?? null, "Sent"), formatFreshness((quoteFreshness as any)?.followUpSentAt ?? null, "Followed up")].filter(Boolean).join(" - ") || "No quote outreach yet" : "No quote linked"} />
                <MiniStat label="Invoice collection" value={record.invoice ? [formatFreshness((invoiceFreshness as any)?.lastSentAt ?? null, "Sent"), formatFreshness((invoiceFreshness as any)?.lastPaidAt ?? null, "Paid")].filter(Boolean).join(" - ") || "No invoice activity yet" : "No invoice linked"} />
              </CardContent>
            </Card>

            {(quoteNeedsFollowUp || invoiceNeedsFollowUp) ? (
              <Card className="border-border/70 shadow-sm">
                <CardHeader className="pb-4"><CardTitle>Action Needed</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {quoteNeedsFollowUp ? <WorkflowWarningCard title="Quote follow-up is stale" detail="This job is tied to a quote that likely needs another touch." href={record.quote ? withReturn(`/quotes/${record.quote.id}`) : null} actionLabel="Open quote" /> : null}
                  {invoiceNeedsFollowUp ? <WorkflowWarningCard title="Invoice collection is stale" detail="The linked invoice has not been paid and has not been sent recently." href={record.invoice ? withReturn(`/invoices/${record.invoice.id}`) : null} actionLabel="Open invoice" /> : null}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldBlock({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: typeof CalendarClock;
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-background/90 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </div>
      {children ?? <p className="text-sm text-muted-foreground">{value}</p>}
    </div>
  );
}

function TopMetric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function WorkflowStep({
  label,
  status,
  actionHref,
  actionLabel,
  icon: Icon,
}: {
  label: string;
  status: string;
  actionHref: string | null;
  actionLabel: string;
  icon: typeof FileText;
}) {
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{status}</p>
          {actionHref ? (
            <Button asChild variant="link" className="mt-1 h-auto px-0 text-sm">
              <Link to={actionHref}>{actionLabel}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function ReadinessRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/90 px-3 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <span className={ready ? "rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800" : "rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"}>
        {ready ? "Ready" : "Pending"}
      </span>
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
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
      </div>
      {href ? (
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link to={href}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
