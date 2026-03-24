import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useOutletContext } from "react-router";
import { format, parseISO, isSameDay, startOfDay, endOfDay } from "date-fns";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarPlus,
  ChevronRight,
  Clock3,
  DollarSign,
  FileText,
  Receipt,
  RefreshCw,
  Users,
} from "lucide-react";
import { useFindMany } from "../hooks/useApi";
import { api, ApiError } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { StatusBadge } from "../components/shared/StatusBadge";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";

type AppointmentRecord = {
  id: string;
  title?: string | null;
  status: string;
  startTime: string;
  endTime?: string | null;
  client: { firstName?: string | null; lastName?: string | null } | null;
  vehicle: { make?: string | null; model?: string | null; year?: number | null } | null;
};

type InvoiceRecord = {
  id: string;
  invoiceNumber?: string | null;
  status: string;
  total: number | string | null | undefined;
};

type QuoteRecord = {
  id: string;
  status: string;
  total: number | string | null | undefined;
  createdAt?: string;
  client?: { firstName?: string | null; lastName?: string | null } | null;
};

const ACTIVE_JOB = new Set(["scheduled", "confirmed", "in_progress"]);

function formatCurrency(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function safeParseISO(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const parsed = parseISO(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatSafe(iso: string | undefined | null, fmt: string): string {
  const parsed = safeParseISO(iso);
  return parsed ? format(parsed, fmt) : "-";
}

function sumCurrency(values: Array<number | string | null | undefined>): number {
  return values.reduce<number>((total, value) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? total + n : total;
  }, 0);
}

function sectionErrorMessage(err: Error): string {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return "Session expired. Sign in again.";
  }
  return err.message || "Could not load this section.";
}

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

  const appointments = (appointmentsRaw ?? []) as AppointmentRecord[];
  const unpaidInvoices = (invoicesRaw ?? []) as InvoiceRecord[];
  const pendingQuotes = (quotesRaw ?? []) as QuoteRecord[];

  const todayJobs = useMemo(() => {
    return appointments.filter((appointment) => {
      const start = safeParseISO(appointment.startTime);
      return !!start && isSameDay(start, filterNow) && ACTIVE_JOB.has(appointment.status ?? "");
    });
  }, [appointments, filterNow]);

  const openQuoteValue = useMemo(() => sumCurrency(pendingQuotes.map((quote) => quote.total)), [pendingQuotes]);
  const unpaidRevenue = useMemo(() => sumCurrency(unpaidInvoices.map((invoice) => invoice.total)), [unpaidInvoices]);
  const nextJob = todayJobs[0] ?? null;

  const priorityActions = useMemo(() => {
    const actions: Array<{ title: string; detail: string; href: string; cta: string }> = [];

    if (nextJob) {
      const nextJobClient = nextJob.client
        ? `${nextJob.client.firstName ?? ""} ${nextJob.client.lastName ?? ""}`.trim()
        : nextJob.title ?? "Open job";
      actions.push({
        title: "Next job on deck",
        detail: `${formatSafe(nextJob.startTime, "h:mm a")} · ${nextJobClient}`,
        href: `/appointments/${nextJob.id}`,
        cta: "Open job",
      });
    }

    if (unpaidInvoices.length > 0) {
      actions.push({
        title: "Collect outstanding cash",
        detail: `${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length === 1 ? "" : "s"} · ${formatCurrency(unpaidRevenue)}`,
        href: `/invoices/${unpaidInvoices[0].id}`,
        cta: "Review invoices",
      });
    }

    if (pendingQuotes.length > 0) {
      const quote = pendingQuotes[0];
      const quoteClient = quote.client
        ? `${quote.client.firstName ?? ""} ${quote.client.lastName ?? ""}`.trim() || "Open quote"
        : "Open quote";
      actions.push({
        title: "Close pending work",
        detail: `${pendingQuotes.length} quote${pendingQuotes.length === 1 ? "" : "s"} awaiting action · ${quoteClient}`,
        href: `/quotes/${quote.id}`,
        cta: "Open quote",
      });
    }

    if (actions.length === 0) {
      actions.push({
        title: "Pipeline is clear",
        detail: "No urgent jobs, quotes, or unpaid invoices right now.",
        href: "/appointments/new",
        cta: "Book next job",
      });
    }

    return actions.slice(0, 3);
  }, [nextJob, pendingQuotes, unpaidInvoices, unpaidRevenue]);

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
    <div className="min-h-[calc(100dvh-4rem)] pb-24 md:pb-8">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {businessName ?? "Dashboard"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{format(filterNow, "EEEE, MMM d")}</p>
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

        {anyError ? (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Some dashboard data could not be loaded.</p>
              <p className="mt-1 text-amber-800/90 dark:text-amber-100/90">
                {anyError instanceof ApiError && (anyError.status === 401 || anyError.status === 403)
                  ? "Your session may have expired. Sign in again."
                  : "Check each section below or try refreshing."}
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Jobs today"
            value={String(todayJobs.length)}
            detail={nextJob ? `Next at ${formatSafe(nextJob.startTime, "h:mm a")}` : "No active jobs scheduled"}
            icon={<Clock3 className="h-5 w-5" />}
          />
          <MetricCard
            label="Open quotes"
            value={String(pendingQuotes.length)}
            detail={openQuoteValue > 0 ? formatCurrency(openQuoteValue) : "No quote value pending"}
            icon={<Receipt className="h-5 w-5" />}
          />
          <MetricCard
            label="Unpaid invoices"
            value={String(unpaidInvoices.length)}
            detail={unpaidRevenue > 0 ? formatCurrency(unpaidRevenue) : "Nothing outstanding"}
            icon={<DollarSign className="h-5 w-5" />}
          />
          <MetricCard
            label="Next focus"
            value={priorityActions[0]?.title ?? "Clear"}
            detail={priorityActions[0]?.detail ?? "No urgent actions"}
            icon={<ArrowUpRight className="h-5 w-5" />}
            compactValue
          />
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Quick actions</h2>
            <span className="text-sm text-muted-foreground">Most-used workflows</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickAction href="/clients/new" label="New client" icon={<Users className="h-5 w-5 shrink-0" />} />
            <QuickAction
              href="/appointments/new"
              label="Schedule job"
              icon={<CalendarPlus className="h-5 w-5 shrink-0" />}
              primary
            />
            <QuickAction href="/quotes/new" label="Create quote" icon={<Receipt className="h-5 w-5 shrink-0" />} />
            <QuickAction href="/invoices" label="Invoices" icon={<DollarSign className="h-5 w-5 shrink-0" />} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Priority focus</h2>
            <span className="text-sm text-muted-foreground">Work the highest-value next step</span>
          </div>
          <div className="grid gap-3">
            {priorityActions.map((action) => (
              <Link
                key={action.title}
                to={action.href}
                className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                  <ArrowUpRight className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{action.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{action.detail}</p>
                </div>
                <span className="text-sm font-medium text-orange-600">{action.cta}</span>
              </Link>
            ))}
          </div>
        </section>

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
          <ul className="overflow-hidden rounded-xl border divide-y divide-border bg-card">
            {todayJobs.map((appointment) => (
              <li key={appointment.id}>
                <Link
                  to={`/appointments/${appointment.id}`}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted/70"
                >
                  <div className="w-[72px] shrink-0 font-mono text-sm text-muted-foreground">
                    {formatSafe(appointment.startTime, "h:mm a")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">
                      {appointment.client
                        ? `${appointment.client.firstName ?? ""} ${appointment.client.lastName ?? ""}`.trim()
                        : appointment.title ?? "Job"}
                    </p>
                    {appointment.vehicle ? (
                      <p className="truncate text-sm text-muted-foreground">
                        {[appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge status={appointment.status ?? "scheduled"} type="appointment" />
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>

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
          <ul className="overflow-hidden rounded-xl border divide-y divide-border bg-card">
            {pendingQuotes.map((quote) => (
              <li key={quote.id}>
                <Link
                  to={`/quotes/${quote.id}`}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted/70"
                >
                  <Receipt className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {quote.client
                        ? `${quote.client.firstName ?? ""} ${quote.client.lastName ?? ""}`.trim() || "Quote"
                        : `Quote - ${String(quote.id).slice(0, 8)}...`}
                    </p>
                    <p className="text-sm capitalize text-muted-foreground">{String(quote.status ?? "-")}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(quote.total)}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>

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
          <ul className="overflow-hidden rounded-xl border divide-y divide-border bg-card">
            {unpaidInvoices.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  to={`/invoices/${invoice.id}`}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted/70"
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {invoice.invoiceNumber ?? `Invoice ${String(invoice.id).slice(0, 8)}...`}
                    </p>
                    <p className="text-sm capitalize text-muted-foreground">
                      {String(invoice.status ?? "").replace(/-/g, " ") || "-"}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(invoice.total)}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        aria-label="Quick actions"
      >
        <div className="mx-auto flex max-w-4xl gap-2 px-3 pt-2">
          <MobileQuickAction href="/clients/new" label="Client" icon={<Users className="h-5 w-5" />} />
          <MobileQuickAction href="/appointments/new" label="Job" icon={<CalendarPlus className="h-5 w-5" />} primary />
          <MobileQuickAction href="/quotes/new" label="Quote" icon={<Receipt className="h-5 w-5" />} />
          <MobileQuickAction href="/invoices" label="Bills" icon={<DollarSign className="h-5 w-5" />} />
        </div>
      </nav>
    </div>
  );
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
          className="inline-flex min-h-[44px] items-center py-2 text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          {seeAllLabel}
        </Link>
      </div>
      {error ? (
        <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>{sectionErrorMessage(error)}</p>
        </div>
      ) : isLoading ? (
        <ListSkeleton rows={skeletonRows} />
      ) : isEmpty ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">{emptyMessage}</p>
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
    <div className="overflow-hidden rounded-xl border divide-y divide-border bg-card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex min-h-[56px] items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-16" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 max-w-[200px] w-3/5" />
            <Skeleton className="h-3 max-w-[140px] w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  compactValue = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  compactValue?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="text-orange-600">{icon}</div>
      </div>
      <p className={cn("font-semibold tracking-tight", compactValue ? "text-lg" : "text-2xl")}>{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function QuickAction({
  href,
  label,
  icon,
  primary = false,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      to={href}
      className={cn(
        "flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-4 font-semibold transition-transform active:scale-[0.98]",
        primary
          ? "bg-orange-500 text-sm text-white shadow-sm hover:bg-orange-600 sm:text-base"
          : "border-2 border-border bg-card text-sm hover:bg-muted/80 sm:text-base"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function MobileQuickAction({
  href,
  label,
  icon,
  primary = false,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      to={href}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold active:scale-[0.98] min-h-[52px]",
        primary ? "bg-orange-500 text-white shadow-sm" : "border-2 border-border bg-card"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

export { RouteErrorBoundary as ErrorBoundary };
