import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { AlertCircle, ChevronRight, ClipboardList, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { api, ApiError } from "../api";
import { useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EmptyState } from "../components/shared/EmptyState";

type JobStatusTab = "all" | "scheduled" | "in_progress" | "completed" | "cancelled";
type JobView = JobStatusTab | "mine";

type StaffRecord = {
  id: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type JobListRecord = {
  id: string;
  jobNumber: string;
  status: string;
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
  if (tab === "cancelled") return ["cancelled", "no-show"].includes(job.status);
  return job.status === tab;
}

export default function JobsIndexPage() {
  const { businessId, user } = useOutletContext<AuthOutletContext>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState<JobView>("all");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const [{ data: jobs, fetching, error }] = useFindMany(api.job, {
    first: 100,
    search: debouncedSearch || undefined,
    pause: !businessId,
  } as any);
  const [{ data: staff }] = useFindMany(api.staff, {
    first: 100,
    pause: !businessId,
  } as any);

  const records = ((jobs ?? []) as JobListRecord[]).filter(Boolean);
  const staffRecords = ((staff ?? []) as StaffRecord[]).filter(Boolean);
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
    const completed = records.filter((job) => job.status === "completed").length;
    const openRevenue = records
      .filter((job) => ["scheduled", "confirmed", "in_progress"].includes(job.status))
      .reduce((sum, job) => sum + Number(job.totalPrice ?? 0), 0);
    return { scheduled, inProgress, completed, openRevenue };
  }, [records]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Jobs"
        subtitle="Run active work orders, assign technicians, and move work from schedule to completion."
        right={
          <div className="relative w-full sm:w-80">
            {fetching && records.length > 0 ? (
              <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search jobs, techs, locations, clients, vehicles..."
              className="pl-9"
            />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Scheduled" value={String(stats.scheduled)} />
        <MetricCard label="In progress" value={String(stats.inProgress)} />
        <MetricCard label="Completed" value={String(stats.completed)} />
        <MetricCard label="Open revenue" value={formatCurrency(stats.openRevenue)} />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as JobView)}>
        <TabsList className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-6">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="mine" disabled={!myStaffRecord}>
            My Queue
          </TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
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
        <div className={fetching ? "space-y-2 opacity-70" : "space-y-2"}>
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

            return (
              <Link key={job.id} to={`/jobs/${job.id}`}>
                <Card className="transition-colors hover:bg-muted/30">
                  <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={job.status} type="job" />
                        <span className="text-sm font-medium text-muted-foreground">{job.jobNumber}</span>
                      </div>
                      <div className="space-y-1">
                        <p className="truncate text-base font-medium">{job.title?.trim() || clientName}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {clientName} · {vehicleLabel}
                        </p>
                      </div>
                    </div>
                    <div className="grid flex-none gap-1 text-sm text-muted-foreground sm:grid-cols-2 sm:gap-x-6 lg:text-right">
                      <span>{formatDate(job.scheduledStart)}</span>
                      <span>{job.location?.name ?? "No location set"}</span>
                      <span>{staffName}</span>
                      <span className="font-medium text-foreground">{formatCurrency(job.totalPrice)}</span>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
