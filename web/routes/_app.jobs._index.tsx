import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  MapPin,
  Play,
  Receipt,
  Search,
  UserPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { api, ApiError } from "../api";
import { useAction, useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EmptyState } from "../components/shared/EmptyState";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";

type JobStatusTab = "all" | "scheduled" | "in_progress" | "completed" | "cancelled";
type JobView = JobStatusTab | "mine";

type StaffRecord = {
  id: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type LocationRecord = {
  id: string;
  name?: string | null;
};

type JobListRecord = {
  id: string;
  appointmentId?: string | null;
  jobNumber: string;
  status: string;
  hasInvoice?: boolean;
  title?: string | null;
  scheduledStart?: string | null;
  totalPrice?: number | string | null;
  client?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
  vehicle?: { id?: string | null; year?: number | null; make?: string | null; model?: string | null } | null;
  assignedStaff?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
  location?: { name?: string | null } | null;
};

function formatCurrency(amount: number | string | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "Unscheduled";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function matchesTab(job: JobListRecord, tab: JobStatusTab): boolean {
  if (tab === "all") return true;
  if (tab === "scheduled") return ["scheduled", "confirmed"].includes(job.status);
  if (tab === "completed") return job.status === "completed" && !job.hasInvoice;
  if (tab === "cancelled") return ["cancelled", "no-show"].includes(job.status);
  return job.status === tab;
}

function getWorkflowStage(status: string, hasInvoice = false): string {
  if (["scheduled", "confirmed"].includes(status)) return "Ready to start";
  if (status === "in_progress") return "In service";
  if (status === "completed" && hasInvoice) return "Billed";
  if (status === "completed") return "Ready to invoice";
  if (["cancelled", "no-show"].includes(status)) return "Closed";
  return "Queued";
}

export default function JobsIndexPage() {
  const { businessId, user, currentLocationId, setCurrentLocationId } = useOutletContext<AuthOutletContext>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState<JobView>("all");
  const [activeLocationId, setActiveLocationId] = useState<string>(currentLocationId ?? "all");

  useEffect(() => {
    setActiveLocationId(currentLocationId ?? "all");
  }, [currentLocationId]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const [{ data: jobs, fetching, error }] = useFindMany(api.job, {
    first: 100,
    locationId: activeLocationId !== "all" ? activeLocationId : undefined,
    search: debouncedSearch || undefined,
    pause: !businessId,
  } as any);
  const [{ data: staff }] = useFindMany(api.staff, {
    first: 100,
    pause: !businessId,
  } as any);
  const [{ data: locations }] = useFindMany(api.location, {
    first: 100,
    pause: !businessId,
  } as any);
  const [{ fetching: updatingJob }, runUpdateJob] = useAction(api.job.update);

  const records = ((jobs ?? []) as JobListRecord[]).filter(Boolean);
  const staffRecords = ((staff ?? []) as StaffRecord[]).filter(Boolean);
  const locationRecords = ((locations ?? []) as LocationRecord[]).filter(Boolean);
  const myStaffRecord = useMemo(
    () => staffRecords.find((record) => record.userId === user?.id) ?? null,
    [staffRecords, user?.id]
  );
  const visibleRecords = useMemo(
    () =>
      records.filter((job) => {
        if (activeTab === "mine") {
          return !!myStaffRecord && job.assignedStaff?.id === myStaffRecord.id;
        }
        return matchesTab(job, activeTab);
      }),
    [records, activeTab, myStaffRecord]
  );

  const stats = useMemo(() => {
    const scheduled = records.filter((job) => ["scheduled", "confirmed"].includes(job.status)).length;
    const inProgress = records.filter((job) => job.status === "in_progress").length;
    const completed = records.filter((job) => job.status === "completed" && !job.hasInvoice).length;
    const myQueue = myStaffRecord
      ? records.filter((job) => job.assignedStaff?.id === myStaffRecord.id && ["scheduled", "confirmed", "in_progress"].includes(job.status)).length
      : 0;
    const openRevenue = records
      .filter((job) => ["scheduled", "confirmed", "in_progress"].includes(job.status))
      .reduce((sum, job) => sum + Number(job.totalPrice ?? 0), 0);
    return { scheduled, inProgress, completed, myQueue, openRevenue };
  }, [records, myStaffRecord]);

  const handleQuickJobUpdate = async (event: React.SyntheticEvent, jobId: string, values: Record<string, unknown>, successMessage: string) => {
    event.preventDefault();
    event.stopPropagation();
    const result = await runUpdateJob({ id: jobId, ...values });
    if (result?.error) {
      toast.error(result.error.message ?? "Could not update job");
      return;
    }
    toast.success(successMessage);
  };

  return (
    <div className="page-content page-section max-w-6xl">
      <PageHeader
        title="Jobs"
        subtitle="Run work orders with cleaner handoffs, technician clarity, and faster progression from arrival to invoice."
        right={
          <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
            <Select
              value={activeLocationId}
              onValueChange={(value) => {
                setActiveLocationId(value);
                setCurrentLocationId(value === "all" ? null : value);
              }}
            >
              <SelectTrigger className="w-full lg:w-52">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locationRecords.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name?.trim() || "Unnamed location"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <ListViewToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search jobs, techs, locations, clients, or vehicles..."
        loading={fetching && records.length > 0}
        resultCount={visibleRecords.length}
        noun="jobs"
        filtersLabel={
          [
            activeTab !== "all" ? `View: ${activeTab === "mine" ? "my queue" : activeTab}` : null,
            activeLocationId !== "all"
              ? `Location: ${locationRecords.find((record) => record.id === activeLocationId)?.name ?? "Selected"}`
              : null,
            debouncedSearch ? `Search: ${debouncedSearch}` : null,
          ]
            .filter(Boolean)
            .join(" | ") || null
        }
        onClear={() => {
          setSearch("");
          setDebouncedSearch("");
          setActiveTab("all");
          setActiveLocationId("all");
          setCurrentLocationId(null);
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Scheduled" value={String(stats.scheduled)} detail="Queued and confirmed work" />
        <MetricCard label="In progress" value={String(stats.inProgress)} detail="Currently on the floor" />
        <MetricCard label="Completed" value={String(stats.completed)} detail="Ready to bill or deliver" />
        <MetricCard label="My queue" value={myStaffRecord ? String(stats.myQueue) : "-"} detail={myStaffRecord ? "Assigned to this account" : "No linked staff profile"} />
        <MetricCard label="Open revenue" value={formatCurrency(stats.openRevenue)} detail="Value tied to active jobs" />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as JobView)}>
        <TabsList className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-6">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="mine" disabled={!myStaffRecord}>My Queue</TabsTrigger>
          <TabsTrigger value="scheduled">Ready</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Ready to Bill</TabsTrigger>
          <TabsTrigger value="cancelled">Closed</TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {error instanceof ApiError && (error.status === 401 || error.status === 403)
              ? "You do not have access to jobs."
              : error.message}
          </span>
        </div>
      ) : fetching && jobs === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="h-3 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : visibleRecords.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={debouncedSearch ? "No matching jobs" : "No jobs in this view"}
          description={
            debouncedSearch
              ? "Try a different customer, vehicle, tech, or location search."
              : activeTab === "mine" && !myStaffRecord
                ? "Link this user to a staff profile to unlock an assigned queue."
                : activeTab === "mine"
                  ? "No jobs are assigned to this staff account right now."
                  : "Jobs appear here from scheduled appointments, so the crew always has a clean operational queue."
          }
        />
      ) : (
        <div className={fetching ? "space-y-3 opacity-70" : "space-y-3"}>
          {visibleRecords.map((job) => {
            const clientName = job.client
              ? `${job.client.firstName ?? ""} ${job.client.lastName ?? ""}`.trim()
              : "Walk-in customer";
            const vehicleLabel = job.vehicle
              ? [job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")
              : "No vehicle";
            const staffName = job.assignedStaff
              ? `${job.assignedStaff.firstName ?? ""} ${job.assignedStaff.lastName ?? ""}`.trim()
              : "Unassigned";
            const invoiceHref =
              job.status === "completed" && !job.hasInvoice && job.client?.id
                ? `/invoices/new?clientId=${job.client.id}&appointmentId=${job.appointmentId ?? job.id}`
                : null;

            return (
              <Link key={job.id} to={`/jobs/${job.id}`}>
                <Card className="border-border/70 shadow-sm transition-colors hover:bg-muted/25">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={job.status} type="job" />
                          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            {job.jobNumber}
                          </span>
                          <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium text-foreground">
                            {getWorkflowStage(job.status, Boolean(job.hasInvoice))}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <p className="truncate text-base font-semibold">{job.title?.trim() || clientName}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {clientName} - {vehicleLabel}
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[320px] lg:text-right">
                        <DetailChip icon={CalendarClock} label={formatDate(job.scheduledStart)} />
                        <DetailChip icon={MapPin} label={job.location?.name ?? "No location set"} />
                        <DetailChip icon={UserRound} label={staffName} />
                        <DetailChip icon={Receipt} label={formatCurrency(job.totalPrice)} strong />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2" onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}>
                      {myStaffRecord && !job.assignedStaff?.id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[36px] px-3 text-xs"
                          disabled={updatingJob}
                          onClick={(event) =>
                            void handleQuickJobUpdate(event, job.id, { assignedStaffId: myStaffRecord.id }, "Job assigned to you")
                          }
                        >
                          <UserPlus className="mr-1 h-3 w-3" />
                          Assign to me
                        </Button>
                      ) : null}
                      {["scheduled", "confirmed"].includes(job.status) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[36px] px-3 text-xs"
                          disabled={updatingJob}
                          onClick={(event) =>
                            void handleQuickJobUpdate(event, job.id, { status: "in_progress" }, "Job marked in progress")
                          }
                        >
                          <Play className="mr-1 h-3 w-3" />
                          Start work
                        </Button>
                      ) : null}
                      {job.status === "in_progress" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[36px] px-3 text-xs"
                          disabled={updatingJob}
                          onClick={(event) =>
                            void handleQuickJobUpdate(event, job.id, { status: "completed" }, "Job completed")
                          }
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Mark complete
                        </Button>
                      ) : null}
                      {invoiceHref ? (
                        <Button asChild variant="outline" size="sm" className="min-h-[36px] px-3 text-xs">
                          <Link to={invoiceHref}>Create invoice</Link>
                        </Button>
                      ) : null}
                      <Button asChild variant="ghost" size="sm" className="min-h-[36px] px-2 text-xs">
                        <Link to={`/jobs/${job.id}`}>Open</Link>
                      </Button>
                      <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function DetailChip({
  icon: Icon,
  label,
  strong,
}: {
  icon: typeof CalendarClock;
  label: string;
  strong?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/90 px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className={strong ? "text-sm font-semibold text-foreground" : "text-sm text-muted-foreground"}>{label}</span>
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
