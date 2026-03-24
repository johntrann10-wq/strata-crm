import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Receipt,
  FileText,
  Loader2,
  MapPin,
  Save,
  UserRound,
  Car,
} from "lucide-react";
import { api } from "../api";
import { useAction, useFindMany, useFindOne } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { usePageContext } from "../components/shared/CommandPaletteContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { ActivityFeedCard } from "../components/shared/ActivityFeedCard";
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

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { businessId, permissions } = useOutletContext<AuthOutletContext>();
  const canEdit = permissions.has("jobs.write");
  const canWriteQuotes = permissions.has("quotes.write");
  const canWriteInvoices = permissions.has("invoices.write");
  const { setPageContext } = usePageContext();

  const [{ data: job, fetching, error }, refetchJob] = useFindOne(api.job, id ?? "", {
    pause: !businessId || !id,
  });
  const [{ data: staff }] = useFindMany(api.staff, { first: 100, pause: !businessId } as any);
  const [{ data: locations }] = useFindMany(api.location, { first: 100, pause: !businessId } as any);
  const [{ data: activityLogs, fetching: activityFetching }] = useFindMany(api.activityLog, {
    entityType: "job",
    entityId: id,
    first: 8,
    pause: !businessId || !id,
  } as any);
  const [{ fetching: saving }, runUpdateJob] = useAction(api.job.update);

  const record = (job ?? null) as JobRecord | null;

  const [form, setForm] = useState({
    title: "",
    status: "scheduled",
    assignedStaffId: "__unassigned__",
    locationId: "__unassigned__",
    notes: "",
    internalNotes: "",
  });

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

  if (!id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Invalid job id.</p>
      </div>
    );
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
        <Button asChild variant="outline">
          <Link to="/jobs">Back to jobs</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <PageHeader
        backTo="/jobs"
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

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Operational status</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FieldBlock icon={ClipboardList} label="Status" value={null}>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
              <FieldBlock
                icon={CalendarClock}
                label="Schedule"
                value={formatDateRange(record.scheduledStart, record.scheduledEnd)}
              />
              <FieldBlock icon={UserRound} label="Assigned technician" value={null}>
                <Select
                  value={form.assignedStaffId}
                  onValueChange={(value) => setForm((current) => ({ ...current, assignedStaffId: value }))}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">Unassigned</SelectItem>
                    {((staff ?? []) as any[]).map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.firstName} {member.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
              <FieldBlock icon={MapPin} label="Location" value={null}>
                <Select
                  value={form.locationId}
                  onValueChange={(value) => setForm((current) => ({ ...current, locationId: value }))}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">No location</SelectItem>
                    {((locations ?? []) as any[]).map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="job-title">Display title</Label>
                <Input
                  id="job-title"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  disabled={!canEdit}
                  placeholder="Use a clear label for the crew and front desk"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="job-notes">Customer-visible notes</Label>
                  <Textarea
                    id="job-notes"
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    disabled={!canEdit}
                    rows={5}
                    placeholder="Arrival notes, access instructions, customer requests..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job-internal-notes">Internal notes</Label>
                  <Textarea
                    id="job-internal-notes"
                    value={form.internalNotes}
                    onChange={(event) => setForm((current) => ({ ...current, internalNotes: event.target.value }))}
                    disabled={!canEdit}
                    rows={5}
                    placeholder="Crew notes, blockers, quality control, handoff info..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Services on this job</CardTitle>
            </CardHeader>
            <CardContent>
              {(record.services ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No services attached yet.</p>
              ) : (
                <div className="space-y-3">
                  {(record.services ?? []).map((service) => (
                    <div key={service.id} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{service.name ?? "Service"}</p>
                        <p className="text-sm text-muted-foreground">
                          {service.category ?? "General"} · Qty {service.quantity ?? 1}
                          {service.durationMinutes ? ` · ${service.durationMinutes} min` : ""}
                        </p>
                      </div>
                      <div className="text-sm font-medium text-foreground">
                        {formatCurrency(service.unitPrice)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Next action</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <WorkflowStep
                label="Quote"
                status={record.quote ? `Linked · ${record.quote.status}` : "No quote attached"}
                actionHref={
                  record.quote
                    ? `/quotes/${record.quote.id}`
                    : canWriteQuotes && record.client?.id
                      ? `/quotes/new?clientId=${record.client.id}&appointmentId=${record.appointmentId}`
                      : null
                }
                actionLabel={record.quote ? "Open quote" : "Create quote"}
                icon={Receipt}
              />
              <WorkflowStep
                label="Invoice"
                status={record.invoice ? `${record.invoice.status} · ${formatCurrency(record.invoice.total)}` : "No invoice created"}
                actionHref={
                  record.invoice
                    ? `/invoices/${record.invoice.id}`
                    : canWriteInvoices && record.client?.id
                      ? `/invoices/new?appointmentId=${record.appointmentId}&clientId=${record.client.id}`
                      : null
                }
                actionLabel={record.invoice ? "Open invoice" : "Create invoice"}
                icon={FileText}
              />
              <WorkflowStep
                label="Schedule"
                status={formatDateRange(record.scheduledStart, record.scheduledEnd)}
                actionHref={record.appointmentId ? `/appointments/${record.appointmentId}` : null}
                actionLabel="Open appointment"
                icon={CalendarClock}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>At a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <MiniStat label="Estimated revenue" value={formatCurrency(record.totalPrice)} />
              <MiniStat label="Services" value={String(serviceSummary.count)} />
              <MiniStat label="Estimated labor" value={serviceSummary.minutes > 0 ? `${serviceSummary.minutes} min` : "-"} />
              <MiniStat label="Completed at" value={record.completedAt ? new Date(record.completedAt).toLocaleString() : "-"} />
              <MiniStat label="Quote linked" value={record.quote ? "Yes" : "No"} />
              <MiniStat label="Invoice linked" value={record.invoice ? "Yes" : "No"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow icon={UserRound} label="Client" value={formatName(record.client)} />
              <InfoRow icon={AlertCircle} label="Email" value={record.client?.email ?? "-"} />
              <InfoRow icon={AlertCircle} label="Phone" value={record.client?.phone ?? "-"} />
              {record.client ? (
                <Button asChild variant="outline" className="w-full">
                  <Link to={`/clients/${record.client.id}`}>Open customer record</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vehicle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow
                icon={Car}
                label="Vehicle"
                value={
                  record.vehicle
                    ? [record.vehicle.year, record.vehicle.make, record.vehicle.model].filter(Boolean).join(" ")
                    : "-"
                }
              />
              <InfoRow icon={Car} label="Color" value={record.vehicle?.color ?? "-"} />
              <InfoRow icon={Car} label="Plate" value={record.vehicle?.licensePlate ?? "-"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Related records</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RelatedAction
                href={record.quote ? `/quotes/${record.quote.id}` : null}
                icon={FileText}
                label="Quote"
                value={record.quote ? `${record.quote.status} · ${formatCurrency(record.quote.total)}` : "No quote linked"}
              />
              <RelatedAction
                href={record.invoice ? `/invoices/${record.invoice.id}` : record.appointmentId ? `/invoices/new?appointmentId=${record.appointmentId}` : null}
                icon={FileText}
                label="Invoice"
                value={
                  record.invoice
                    ? `${record.invoice.invoiceNumber ?? "Invoice"} · ${record.invoice.status}`
                    : "Create invoice"
                }
              />
              <RelatedAction
                href={record.appointmentId ? `/appointments/${record.appointmentId}` : null}
                icon={CheckCircle2}
                label="Schedule record"
                value="Open original appointment"
              />
            </CardContent>
          </Card>

          <ActivityFeedCard records={(activityLogs as any[]) ?? []} fetching={activityFetching} />
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
  value: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </div>
      {children ?? <p className="text-sm text-muted-foreground">{value}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
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
    <div className="rounded-lg border p-3">
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

function RelatedAction({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string | null;
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  const content = (
    <div className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );

  if (!href) {
    return content;
  }

  return <Link to={href}>{content}</Link>;
}

export { RouteErrorBoundary as ErrorBoundary };
