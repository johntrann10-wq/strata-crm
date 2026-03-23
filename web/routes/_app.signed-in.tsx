import { useState, useMemo, useCallback, type ReactNode } from "react";
import { useOutletContext, Link, Navigate } from "react-router";
import { useFindMany } from "../hooks/useApi";
import { format, parseISO, isSameDay, startOfDay, endOfDay } from "date-fns";
import {
  FileText,
  DollarSign,
  CalendarPlus,
  Receipt,
  RefreshCw,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, ApiError } from "../api";
import type { AuthOutletContext } from "./_app";
import { StatusBadge } from "../components/shared/StatusBadge";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";

function formatCurrency(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function safeParseISO(iso: string | undefined | null): Date | null {
  if (iso == null || iso === "") return null;
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatSafe(iso: string | undefined | null, fmt: string): string {
  const d = safeParseISO(iso);
  return d ? format(d, fmt) : "—";
}

const ACTIVE_JOB = new Set(["scheduled", "confirmed", "in_progress"]);

export default function SignedIn() {
  const { businessName, businessId } = useOutletContext<AuthOutletContext & { businessId?: string }>();

  const [filterNow, setFilterNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  const { apptStartGte, apptStartLte } = useMemo(() => {
    const from = startOfDay(filterNow);
    const to = endOfDay(filterNow);
    return { apptStartGte: from.toISOString(), apptStartLte: to.toISOString() };
  }, [filterNow]);

  const [{ data: appointmentsRaw, fetching: fetchingAppts, error: apptsError }, refetchAppts] = useFindMany(
    api.appointment,
    {
      startGte: apptStartGte,
      startLte: apptStartLte,
      sort: { startTime: "Ascending" },
      first: 100,
      pause: !businessId,
    }
  );

  const [{ data: invoicesRaw, fetching: fetchingInvoices, error: invoicesError }, refetchInvoices] = useFindMany(
    api.invoice,
    {
      sort: { createdAt: "Descending" },
      first: 25,
      unpaid: true,
      pause: !businessId,
    }
  );

  const [{ data: quotesRaw, fetching: fetchingQuotes, error: quotesError }, refetchQuotes] = useFindMany(api.quote, {
    sort: { createdAt: "Descending" },
    first: 25,
    pending: true,
    pause: !businessId,
  });

  const appointments = (appointmentsRaw ?? []) as Array<{
    id: string;
    title?: string | null;
    status: string;
    startTime: string;
    endTime?: string | null;
    client: { firstName: string; lastName: string } | null;
    vehicle: { make: string | null; model: string | null; year?: number | null } | null;
  }>;

  const todayJobs = useMemo(() => {
    const day = filterNow;
    return appointments.filter((a) => {
      const st = safeParseISO(a.startTime);
      if (!st) return false;
      return isSameDay(st, day) && ACTIVE_JOB.has(a.status ?? "");
    });
  }, [appointments, filterNow]);

  const unpaidInvoices = (invoicesRaw ?? []) as Array<{
    id: string;
    invoiceNumber?: string | null;
    status: string;
    total: number | string | null | undefined;
  }>;

  const pendingQuotes = (quotesRaw ?? []) as Array<{
    id: string;
    status: string;
    total: number | string | null | undefined;
    createdAt?: string;
    client?: { firstName?: string | null; lastName?: string | null } | null;
  }>;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFilterNow(new Date());
    try {
      await Promise.all([refetchAppts(), refetchInvoices(), refetchQuotes()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchAppts, refetchInvoices, refetchQuotes]);

  const loadingAppts = fetchingAppts && appointmentsRaw === undefined;
  const loadingInvoices = fetchingInvoices && invoicesRaw === undefined;
  const loadingQuotes = fetchingQuotes && quotesRaw === undefined;
  const anyLoading = loadingAppts || loadingInvoices || loadingQuotes;
  const anyError = apptsError ?? invoicesError ?? quotesError;

  if (!businessId) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="pb-24 md:pb-8 min-h-[calc(100dvh-4rem)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{businessName ?? "Dashboard"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{format(filterNow, "EEEE, MMM d")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            onClick={() => void handleRefresh()}
            disabled={refreshing || anyLoading}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-5 w-5", (refreshing || anyLoading) && "animate-spin")} />
          </Button>
        </div>

        {anyError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100 flex gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Some dashboard data could not be loaded.</p>
              <p className="text-amber-800/90 dark:text-amber-100/90 mt-1">
                {anyError instanceof ApiError && (anyError.status === 401 || anyError.status === 403)
                  ? "Your session may have expired. Sign in again."
                  : "Check each section below or try refreshing."}
              </p>
            </div>
          </div>
        )}

        {/* Primary actions — desktop / tablet */}
        <div className="hidden sm:grid grid-cols-3 gap-3">
          <Link
            to="/appointments/new"
            className={cn(
              "flex items-center justify-center gap-2 min-h-[52px] rounded-2xl px-4",
              "bg-orange-500 text-white font-semibold text-base shadow-sm",
              "hover:bg-orange-600 active:scale-[0.98] transition-transform"
            )}
          >
            <CalendarPlus className="h-5 w-5 shrink-0" />
            Schedule job
          </Link>
          <Link
            to="/quotes/new"
            className={cn(
              "flex items-center justify-center gap-2 min-h-[52px] rounded-2xl px-4",
              "border-2 border-border bg-card font-semibold text-base",
              "hover:bg-muted/80 active:scale-[0.98] transition-transform"
            )}
          >
            <Receipt className="h-5 w-5 shrink-0" />
            Create quote
          </Link>
          <Link
            to="/invoices"
            className={cn(
              "flex items-center justify-center gap-2 min-h-[52px] rounded-2xl px-4",
              "border-2 border-border bg-card font-semibold text-base",
              "hover:bg-muted/80 active:scale-[0.98] transition-transform"
            )}
          >
            <DollarSign className="h-5 w-5 shrink-0" />
            Invoices
          </Link>
        </div>

        {/* Today's appointments (API: today only; filtered to active statuses) */}
        <DashboardSection
          title="Today's appointments"
          seeAllHref="/appointments"
          seeAllLabel="All appointments"
          error={apptsError}
          isLoading={loadingAppts}
          isEmpty={!loadingAppts && !apptsError && todayJobs.length === 0}
          emptyMessage="Nothing on the schedule today."
          emptyCta={{ href: "/appointments/new", label: "Schedule a job" }}
          skeletonRows={3}
        >
          <ul className="divide-y divide-border rounded-xl border bg-card overflow-hidden">
            {todayJobs.map((apt) => (
              <li key={apt.id}>
                <Link
                  to={`/appointments/${apt.id}`}
                  className="flex items-center gap-3 min-h-[56px] px-4 py-3 hover:bg-muted/50 active:bg-muted/70 transition-colors"
                >
                  <div className="text-sm font-mono text-muted-foreground w-[72px] shrink-0">
                    {formatSafe(apt.startTime, "h:mm a")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-base truncate">
                      {apt.client ? `${apt.client.firstName ?? ""} ${apt.client.lastName ?? ""}`.trim() : apt.title ?? "Job"}
                    </p>
                    {apt.vehicle && (
                      <p className="text-sm text-muted-foreground truncate">
                        {[apt.vehicle.year, apt.vehicle.make, apt.vehicle.model].filter(Boolean).join(" ")}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={apt.status ?? "scheduled"} type="appointment" />
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>

        {/* Pending quotes (API: draft + sent) */}
        <DashboardSection
          title="Pending quotes"
          seeAllHref="/quotes"
          seeAllLabel="Quotes"
          error={quotesError}
          isLoading={loadingQuotes}
          isEmpty={!loadingQuotes && !quotesError && pendingQuotes.length === 0}
          emptyMessage="No open quotes."
          emptyCta={{ href: "/quotes/new", label: "New quote" }}
          skeletonRows={2}
        >
          <ul className="divide-y divide-border rounded-xl border bg-card overflow-hidden">
            {pendingQuotes.map((q) => (
              <li key={q.id}>
                <Link
                  to={`/quotes/${q.id}`}
                  className="flex items-center gap-3 min-h-[56px] px-4 py-3 hover:bg-muted/50 active:bg-muted/70 transition-colors"
                >
                  <Receipt className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {q.client
                        ? `${q.client.firstName ?? ""} ${q.client.lastName ?? ""}`.trim() || "Quote"
                        : `Quote · ${String(q.id).slice(0, 8)}…`}
                    </p>
                    <p className="text-sm text-muted-foreground capitalize">{String(q.status ?? "—")}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(q.total)}</span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>

        {/* Unpaid invoices (API: sent + partial) */}
        <DashboardSection
          title="Unpaid invoices"
          seeAllHref="/invoices"
          seeAllLabel="Invoices"
          error={invoicesError}
          isLoading={loadingInvoices}
          isEmpty={!loadingInvoices && !invoicesError && unpaidInvoices.length === 0}
          emptyMessage="No unpaid invoices."
          emptyCta={{ href: "/invoices/new", label: "New invoice" }}
          skeletonRows={2}
        >
          <ul className="divide-y divide-border rounded-xl border bg-card overflow-hidden">
            {unpaidInvoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  to={`/invoices/${inv.id}`}
                  className="flex items-center gap-3 min-h-[56px] px-4 py-3 hover:bg-muted/50 active:bg-muted/70 transition-colors"
                >
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{inv.invoiceNumber ?? `Invoice ${String(inv.id).slice(0, 8)}…`}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {String(inv.status ?? "").replace(/-/g, " ") || "—"}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(inv.total)}</span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>
      </div>

      {/* Mobile sticky actions */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        aria-label="Quick actions"
      >
        <div className="flex gap-2 px-3 pt-2 max-w-3xl mx-auto">
          <Link
            to="/appointments/new"
            className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl bg-orange-500 text-white text-sm font-semibold shadow-sm active:scale-[0.98]"
          >
            <CalendarPlus className="h-5 w-5" />
            Job
          </Link>
          <Link
            to="/quotes/new"
            className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl border-2 border-border bg-card text-sm font-semibold active:scale-[0.98]"
          >
            <Receipt className="h-5 w-5" />
            Quote
          </Link>
          <Link
            to="/invoices"
            className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl border-2 border-border bg-card text-sm font-semibold active:scale-[0.98]"
          >
            <DollarSign className="h-5 w-5" />
            Bills
          </Link>
        </div>
      </nav>
    </div>
  );
}

function sectionErrorMessage(err: Error): string {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return "Session expired. Sign in again.";
  }
  return err.message || "Could not load this section.";
}

function DashboardSection({
  title,
  seeAllHref,
  seeAllLabel,
  error,
  isLoading,
  isEmpty,
  emptyMessage,
  emptyCta,
  skeletonRows,
  children,
}: {
  title: string;
  seeAllHref: string;
  seeAllLabel: string;
  error: Error | null;
  isLoading: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  emptyCta: { href: string; label: string };
  skeletonRows: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link
          to={seeAllHref}
          className="text-sm font-medium text-orange-600 hover:text-orange-700 py-2 min-h-[44px] inline-flex items-center"
        >
          {seeAllLabel}
        </Link>
      </div>
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive flex gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <p>{sectionErrorMessage(error)}</p>
        </div>
      ) : isLoading ? (
        <ListSkeleton rows={skeletonRows} />
      ) : isEmpty ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">{emptyMessage}</p>
          <Button asChild size="lg" className="min-h-[48px] rounded-xl">
            <Link to={emptyCta.href}>{emptyCta.label}</Link>
          </Button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-xl border bg-card divide-y divide-border overflow-hidden" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
          <Skeleton className="h-4 w-16" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5 max-w-[200px]" />
            <Skeleton className="h-3 w-2/5 max-w-[140px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
