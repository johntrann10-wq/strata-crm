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
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { api, ApiError } from "../api";
import { useAction, useFindMany } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EmptyState } from "../components/shared/EmptyState";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";
import { isNativeIOSApp } from "@/lib/mobileShell";
import { triggerImpactFeedback } from "@/lib/nativeInteractions";
import { cn } from "@/lib/utils";
import {
  selectorSelectContentClassName,
  selectorSelectTriggerClassName,
} from "../components/shared/selectorStyles";

type JobFilter =
  | "all"
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no-show"
  | "paid"
  | "unpaid";

const JOB_FILTER_OPTIONS: Array<{ value: JobFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no-show", label: "No show" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
];

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
  paidInFull?: boolean | null;
  balanceDue?: number | string | null;
  collectedAmount?: number | string | null;
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

function isOperationalJob(job: JobListRecord): boolean {
  return job.status !== "cancelled" && job.status !== "no-show";
}

function isPaidJob(job: JobListRecord): boolean {
  return job.paidInFull === true || (Number(job.balanceDue ?? 0) <= 0.009 && Number(job.collectedAmount ?? 0) > 0.009);
}

function matchesJobFilter(job: JobListRecord, filter: JobFilter): boolean {
  switch (filter) {
    case "scheduled":
    case "confirmed":
    case "in_progress":
    case "completed":
    case "cancelled":
    case "no-show":
      return job.status === filter;
    case "paid":
      return isPaidJob(job);
    case "unpaid":
      return isOperationalJob(job) && !isPaidJob(job);
    default:
      return isOperationalJob(job);
  }
}

function getWorkflowStage(status: string, hasInvoice = false): string {
  if (["scheduled", "confirmed"].includes(status)) return "Ready to start";
  if (status === "in_progress") return "In service";
  if (status === "completed" && hasInvoice) return "Billed";
  if (status === "completed") return "Ready to invoice";
  if (["cancelled", "no-show"].includes(status)) return "Closed";
  return "Queued";
}

function NativeJobsHeader() {
  return (
    <Button asChild variant="outline" className="h-12 w-full rounded-[20px] border-white/80 bg-white/92 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <Link
        to="/appointments"
        onClick={() => {
          void triggerImpactFeedback("light");
        }}
      >
        <CalendarClock className="mr-2 h-4 w-4" />
        Schedule
      </Link>
    </Button>
  );
}

export default function JobsIndexPage() {
  const { businessId, user, currentLocationId, setCurrentLocationId } = useOutletContext<AuthOutletContext>();
  const nativeIOS = isNativeIOSApp();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<JobFilter>("all");
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
    locationId: !nativeIOS && activeLocationId !== "all" ? activeLocationId : undefined,
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
    () => records.filter((job) => matchesJobFilter(job, activeFilter)),
    [records, activeFilter]
  );

  const stats = useMemo(() => {
    const scheduled = records.filter((job) => ["scheduled", "confirmed"].includes(job.status)).length;
    const inProgress = records.filter((job) => job.status === "in_progress").length;
    const completed = records.filter((job) => job.status === "completed" && !job.hasInvoice && !!job.client?.id).length;
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
    <div
      className={cn(
        nativeIOS
          ? "mx-auto w-full max-w-3xl space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2"
          : "page-content page-section max-w-6xl"
      )}
    >
      {nativeIOS ? (
        <NativeJobsHeader />
      ) : (
        <PageHeader
          title="Jobs"
          right={
            <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
              <Button asChild variant="outline" className="w-full lg:w-auto">
                <Link to="/appointments">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Schedule
                </Link>
              </Button>
              <Select
                value={activeLocationId}
                onValueChange={(value) => {
                  setActiveLocationId(value);
                  setCurrentLocationId(value === "all" ? null : value);
                }}
              >
                <SelectTrigger className={selectorSelectTriggerClassName("w-full lg:w-52")}>
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent className={selectorSelectContentClassName()}>
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
      )}

      {nativeIOS ? (
        <div className="rounded-[28px] border border-white/80 bg-white/92 p-3.5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search jobs, clients, vehicles, techs"
              className="h-12 rounded-[20px] border-white/80 bg-slate-50/80 pl-10 text-[16px] shadow-inner"
            />
          </div>
          {(activeFilter !== "all" || debouncedSearch) ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="truncate text-xs font-medium text-slate-500">
                {visibleRecords.length} {visibleRecords.length === 1 ? "job" : "jobs"} in view
              </p>
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-full px-3 text-xs"
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                  setActiveFilter("all");
                }}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <ListViewToolbar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search jobs, techs, locations, clients, or vehicles..."
          loading={fetching && records.length > 0}
          resultCount={visibleRecords.length}
          noun="jobs"
          filtersLabel={
            [
              activeFilter !== "all" ? `Filter: ${JOB_FILTER_OPTIONS.find((option) => option.value === activeFilter)?.label ?? activeFilter}` : null,
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
            setActiveFilter("all");
            setActiveLocationId("all");
            setCurrentLocationId(null);
          }}
        />
      )}

      <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-5", nativeIOS && "grid-cols-2 sm:grid-cols-2 xl:grid-cols-2")}>
        <MetricCard label="Scheduled" value={String(stats.scheduled)} detail="Queued and confirmed work" nativeIOS={nativeIOS} />
        <MetricCard label="In progress" value={String(stats.inProgress)} detail="Currently on the floor" nativeIOS={nativeIOS} />
        <MetricCard label="Ready to bill" value={String(stats.completed)} detail="Completed work" nativeIOS={nativeIOS} />
        {!nativeIOS ? (
          <>
            <MetricCard label="My queue" value={myStaffRecord ? String(stats.myQueue) : "-"} detail={myStaffRecord ? "Assigned to this account" : "No linked staff profile"} />
            <MetricCard label="Open revenue" value={formatCurrency(stats.openRevenue)} detail="Value tied to active jobs" />
          </>
        ) : (
          <MetricCard label="Open revenue" value={formatCurrency(stats.openRevenue)} detail="Active value" nativeIOS />
        )}
      </div>

      {nativeIOS ? (
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2">
            {JOB_FILTER_OPTIONS.map((option) => {
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setActiveFilter(option.value);
                    void triggerImpactFeedback("light");
                  }}
                  className={cn(
                    "h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition active:scale-[0.98]",
                    activeFilter === option.value
                      ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                      : "border-white/80 bg-white/92 text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2">
            {JOB_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setActiveFilter(option.value)}
                className={cn(
                  "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition hover:bg-muted/50 active:scale-[0.98]",
                  activeFilter === option.value
                    ? "border-foreground bg-foreground text-background shadow-sm"
                    : "border-border/70 bg-background/90 text-muted-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
              : activeFilter === "paid"
                ? "Paid jobs will appear here once appointment or invoice payment is fully collected."
                : activeFilter === "unpaid"
                  ? "Unpaid operational jobs will appear here when a balance is still open."
                  : "Jobs appear here from scheduled appointments, so the crew always has a clean operational queue."
          }
        />
      ) : (
        <div className={cn(fetching ? "space-y-3 opacity-70" : "space-y-3", nativeIOS && "space-y-2.5")}>
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
                <Card className={cn("border-border/70 shadow-sm transition-colors hover:bg-muted/25", nativeIOS && "rounded-[26px] border-white/80 bg-white/92 shadow-[0_12px_28px_rgba(15,23,42,0.06)] active:scale-[0.99]")}>
                  <CardContent className={cn("space-y-4 p-4", nativeIOS && "space-y-3 px-4 py-4")}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={job.status} type="job" />
                          <span className={cn("rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground", nativeIOS && "bg-slate-100 tracking-[0.12em]")}>
                            {job.jobNumber}
                          </span>
                          <span className={cn("rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium text-foreground", nativeIOS && "border-slate-200 bg-slate-50")}>
                            {getWorkflowStage(job.status, Boolean(job.hasInvoice))}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <p className={cn("truncate text-base font-semibold", nativeIOS && "text-[17px] leading-6 tracking-[-0.02em]")}>{job.title?.trim() || clientName}</p>
                          <p className={cn("truncate text-sm text-muted-foreground", nativeIOS && "text-[13px]")}>
                            {clientName} - {vehicleLabel}
                          </p>
                        </div>
                      </div>
                      <div className={cn("grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[320px] lg:text-right", nativeIOS && "grid-cols-2 lg:min-w-0")}>
                        <DetailChip icon={CalendarClock} label={formatDate(job.scheduledStart)} nativeIOS={nativeIOS} />
                        <DetailChip icon={MapPin} label={job.location?.name ?? "No location set"} nativeIOS={nativeIOS} />
                        <DetailChip icon={UserRound} label={staffName} nativeIOS={nativeIOS} />
                        <DetailChip icon={Receipt} label={formatCurrency(job.totalPrice)} strong nativeIOS={nativeIOS} />
                      </div>
                    </div>

                    <div className={cn("flex flex-wrap items-center gap-2", nativeIOS && "gap-2 pt-1")} onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}>
                      {myStaffRecord && !job.assignedStaff?.id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn("min-h-[36px] px-3 text-xs", nativeIOS && "min-h-10 rounded-full px-4")}
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
                          className={cn("min-h-[36px] px-3 text-xs", nativeIOS && "min-h-10 rounded-full px-4")}
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
                          className={cn("min-h-[36px] px-3 text-xs", nativeIOS && "min-h-10 rounded-full px-4")}
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
                        <Button asChild variant="outline" size="sm" className={cn("min-h-[36px] px-3 text-xs", nativeIOS && "min-h-10 rounded-full px-4")}>
                          <Link to={invoiceHref}>Create invoice</Link>
                        </Button>
                      ) : null}
                      <Button asChild variant="ghost" size="sm" className={cn("min-h-[36px] px-2 text-xs", nativeIOS && "min-h-10 rounded-full px-4")}>
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

function MetricCard({ label, value, detail, nativeIOS = false }: { label: string; value: string; detail: string; nativeIOS?: boolean }) {
  return (
    <Card className={cn("border-border/70 shadow-sm", nativeIOS && "rounded-[24px] border-white/80 bg-white/92 shadow-[0_12px_28px_rgba(15,23,42,0.05)]")}>
      <CardContent className={cn("p-4", nativeIOS && "px-3.5 py-4")}>
        <p className={cn("text-sm text-muted-foreground", nativeIOS && "text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400")}>{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold", nativeIOS && "text-xl leading-none tracking-[-0.04em] text-slate-950")}>{value}</p>
        <p className={cn("mt-1 text-xs text-muted-foreground", nativeIOS && "truncate text-[11px]")}>{detail}</p>
      </CardContent>
    </Card>
  );
}

function DetailChip({
  icon: Icon,
  label,
  strong,
  nativeIOS = false,
}: {
  icon: typeof CalendarClock;
  label: string;
  strong?: boolean;
  nativeIOS?: boolean;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/90 px-3 py-2", nativeIOS && "min-w-0 rounded-2xl border-slate-100 bg-slate-50/80 px-2.5 py-2")}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className={cn(strong ? "text-sm font-semibold text-foreground" : "text-sm text-muted-foreground", nativeIOS && "truncate text-xs")}>{label}</span>
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
