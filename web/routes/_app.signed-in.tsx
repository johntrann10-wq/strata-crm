import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useOutletContext } from "react-router";
import { format, parseISO, isSameDay, startOfDay, endOfDay } from "date-fns";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarPlus,
  ChevronRight,
  ClipboardList,
  Clock3,
  DollarSign,
  Flame,
  FileText,
  ShieldAlert,
  Receipt,
  RefreshCw,
  Users,
  Wrench,
} from "lucide-react";
import { useFindMany } from "../hooks/useApi";
import { api, ApiError } from "../api";
import { useAction } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { StatusBadge } from "../components/shared/StatusBadge";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { toast } from "sonner";

type AppointmentRecord = {
  id: string;
  title?: string | null;
  status: string;
  startTime: string;
  endTime?: string | null;
  client: { firstName?: string | null; lastName?: string | null } | null;
  vehicle: { make?: string | null; model?: string | null; year?: number | null } | null;
  assignedStaff?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
};

type StaffRecord = {
  id: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type InvoiceRecord = {
  id: string;
  invoiceNumber?: string | null;
  status: string;
  total: number | string | null | undefined;
  remainingBalance?: number | string | null;
  lastSentAt?: string | null;
  lastPaidAt?: string | null;
};

type QuoteRecord = {
  id: string;
  status: string;
  total: number | string | null | undefined;
  createdAt?: string;
  sentAt?: string | null;
  followUpSentAt?: string | null;
  client?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
};

type JobRecord = {
  id: string;
  appointmentId?: string | null;
  jobNumber?: string | null;
  title?: string | null;
  status: string;
  scheduledStart?: string | null;
  totalPrice?: number | string | null;
  client?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
  vehicle?: { make?: string | null; model?: string | null; year?: number | null } | null;
  assignedStaff?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null;
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

function formatFreshness(iso: string | undefined | null, label: string): string | null {
  const parsed = safeParseISO(iso);
  return parsed ? `${label} ${format(parsed, "MMM d")}` : null;
}

function isOlderThanDays(iso: string | undefined | null, days: number): boolean {
  const parsed = safeParseISO(iso);
  if (!parsed) return false;
  return Date.now() - parsed.getTime() >= days * 24 * 60 * 60 * 1000;
}

function sumCurrency(values: Array<number | string | null | undefined>): number {
  return values.reduce<number>((total, value) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? total + n : total;
  }, 0);
}

function invoiceBalance(invoice: InvoiceRecord): number {
  const raw =
    invoice.remainingBalance != null && invoice.remainingBalance !== ""
      ? Number(invoice.remainingBalance)
      : Number(invoice.total ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function sectionErrorMessage(err: Error): string {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return "Session expired. Sign in again.";
  }
  return err.message || "Could not load this section.";
}

export default function SignedIn() {
  const { businessName, businessId, user, currentLocationId } = useOutletContext<AuthOutletContext & { businessId?: string }>();
  const [filterNow, setFilterNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [sendingQuoteId, setSendingQuoteId] = useState<string | null>(null);
  const [followingUpQuoteId, setFollowingUpQuoteId] = useState<string | null>(null);
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<string | null>(null);

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
      locationId: currentLocationId ?? undefined,
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
  const [{ data: acceptedQuotesRaw, fetching: fetchingAcceptedQuotes, error: acceptedQuotesError }, refetchAcceptedQuotes] = useFindMany(
    api.quote,
    {
      sort: { createdAt: "Descending" },
      first: 10,
      status: "accepted",
      pause: !businessId,
    } as any
  );

  const [{ data: jobsRaw, fetching: fetchingJobs, error: jobsError }, refetchJobs] = useFindMany(api.job, {
    first: 25,
    locationId: currentLocationId ?? undefined,
    pause: !businessId,
  } as any);
  const [
    { data: readyToInvoiceJobsRaw, fetching: fetchingReadyToInvoiceJobs, error: readyToInvoiceJobsError },
    refetchReadyToInvoiceJobs,
  ] = useFindMany(api.job, {
    first: 10,
    status: "completed",
    unbilled: true,
    locationId: currentLocationId ?? undefined,
    pause: !businessId,
  } as any);
  const [{ data: staffRaw, fetching: fetchingStaff, error: staffError }, refetchStaff] = useFindMany(api.staff, {
    first: 100,
    pause: !businessId,
  } as any);
  const [, runSendQuote] = useAction(api.quote.send);
  const [, runSendFollowUp] = useAction(api.quote.sendFollowUp);
  const [, runSendInvoice] = useAction(api.invoice.sendToClient);
  const [, runUpdateJob] = useAction(api.job.update);
  const [, runUpdateAppointment] = useAction(api.appointment.update);
  const [, runUpdateAppointmentStatus] = useAction(api.appointment.updateStatus);
  const [{ data: locationsRaw }] = useFindMany(api.location, {
    first: 100,
    pause: !businessId,
  } as any);

  const appointments = (appointmentsRaw ?? []) as AppointmentRecord[];
  const unpaidInvoices = (invoicesRaw ?? []) as InvoiceRecord[];
  const pendingQuotes = (quotesRaw ?? []) as QuoteRecord[];
  const acceptedQuotes = (acceptedQuotesRaw ?? []) as QuoteRecord[];
  const jobs = (jobsRaw ?? []) as JobRecord[];
  const readyToInvoiceJobs = (readyToInvoiceJobsRaw ?? []) as JobRecord[];
  const staffRecords = (staffRaw ?? []) as StaffRecord[];
  const locationRecords = (locationsRaw ?? []) as Array<{ id: string; name?: string | null }>;
  const activeLocationName = useMemo(
    () => locationRecords.find((location) => location.id === currentLocationId)?.name?.trim() || null,
    [locationRecords, currentLocationId]
  );
  const scheduleJobHref = currentLocationId
    ? `/appointments/new?locationId=${encodeURIComponent(currentLocationId)}`
    : "/appointments/new";
  const myStaffRecord = useMemo(
    () => staffRecords.find((staff) => staff.userId === user?.id) ?? null,
    [staffRecords, user?.id]
  );

  const todayAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      const start = safeParseISO(appointment.startTime);
      return !!start && isSameDay(start, filterNow) && ACTIVE_JOB.has(appointment.status ?? "");
    });
  }, [appointments, filterNow]);

  const activeJobs = useMemo(
    () =>
      [...jobs]
        .filter((job) => ACTIVE_JOB.has(job.status ?? ""))
        .sort((a, b) => {
          const aTime = safeParseISO(a.scheduledStart)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const bTime = safeParseISO(b.scheduledStart)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        }),
    [jobs]
  );
  const myActiveJobs = useMemo(
    () =>
      activeJobs.filter(
        (job) => !!myStaffRecord && !!job.assignedStaff?.id && job.assignedStaff.id === myStaffRecord.id
      ),
    [activeJobs, myStaffRecord]
  );

  const openQuoteValue = useMemo(() => sumCurrency(pendingQuotes.map((quote) => quote.total)), [pendingQuotes]);
  const acceptedQuoteValue = useMemo(() => sumCurrency(acceptedQuotes.map((quote) => quote.total)), [acceptedQuotes]);
  const unpaidRevenue = useMemo(() => sumCurrency(unpaidInvoices.map((invoice) => invoiceBalance(invoice))), [unpaidInvoices]);
  const staleQuoteFollowUps = useMemo(
    () =>
      pendingQuotes.filter((quote) =>
        ["sent", "accepted"].includes(String(quote.status ?? "")) &&
        (!safeParseISO(quote.followUpSentAt ?? null)
          ? isOlderThanDays(quote.sentAt ?? null, 2)
          : isOlderThanDays(quote.followUpSentAt ?? null, 5))
      ),
    [pendingQuotes]
  );
  const staleInvoiceCollections = useMemo(
    () =>
      unpaidInvoices.filter((invoice) =>
        ["sent", "partial"].includes(String(invoice.status ?? "")) &&
        !safeParseISO(invoice.lastPaidAt ?? null) &&
        isOlderThanDays(invoice.lastSentAt ?? null, 3)
      ),
    [unpaidInvoices]
  );
  const activeJobValue = useMemo(() => sumCurrency(activeJobs.map((job) => job.totalPrice)), [activeJobs]);
  const myActiveJobValue = useMemo(() => sumCurrency(myActiveJobs.map((job) => job.totalPrice)), [myActiveJobs]);
  const readyToInvoiceValue = useMemo(
    () => sumCurrency(readyToInvoiceJobs.map((job) => job.totalPrice)),
    [readyToInvoiceJobs]
  );
  const averageOutstandingInvoice = useMemo(
    () => (unpaidInvoices.length > 0 ? unpaidRevenue / unpaidInvoices.length : 0),
    [unpaidInvoices.length, unpaidRevenue]
  );
  const todayBookedValue = useMemo(
    () => sumCurrency(todayAppointments.map((appointment) => (appointment as AppointmentRecord & { totalPrice?: number | string | null }).totalPrice)),
    [todayAppointments]
  );
  const assignedTodayAppointments = useMemo(
    () => todayAppointments.filter((appointment) => !!appointment.assignedStaff?.id),
    [todayAppointments]
  );
  const todayCoverageRate = useMemo(() => {
    if (todayAppointments.length === 0) return 100;
    return Math.round((assignedTodayAppointments.length / todayAppointments.length) * 100);
  }, [assignedTodayAppointments.length, todayAppointments.length]);
  const overdueInvoices = useMemo(
    () =>
      unpaidInvoices.filter((invoice) => {
        const raw = invoice as InvoiceRecord & { dueDate?: string | null };
        const due = safeParseISO(raw.dueDate ?? null);
        return !!due && due.getTime() < filterNow.getTime();
      }),
    [unpaidInvoices, filterNow]
  );
  const overdueRevenue = useMemo(() => sumCurrency(overdueInvoices.map((invoice) => invoiceBalance(invoice))), [overdueInvoices]);
  const unassignedActiveJobs = useMemo(
    () => activeJobs.filter((job) => !job.assignedStaff?.id),
    [activeJobs]
  );
  const unassignedTodayAppointments = useMemo(
    () =>
      todayAppointments.filter(
        (appointment) => !(appointment as AppointmentRecord & { assignedStaff?: { id?: string | null } | null }).assignedStaff?.id
      ),
    [todayAppointments]
  );
  const agingPendingQuotes = useMemo(
    () =>
      pendingQuotes.filter((quote) => {
        const createdAt = safeParseISO(quote.createdAt);
        if (!createdAt) return false;
        return filterNow.getTime() - createdAt.getTime() >= 3 * 24 * 60 * 60 * 1000;
      }),
    [pendingQuotes, filterNow]
  );
  const quoteConversionRate = useMemo(() => {
    const denominator = pendingQuotes.length + acceptedQuotes.length;
    if (denominator === 0) return 0;
    return Math.round((acceptedQuotes.length / denominator) * 100);
  }, [acceptedQuotes.length, pendingQuotes.length]);
  const nextJob = activeJobs[0] ?? null;
  const myNextJob = myActiveJobs[0] ?? null;
  const teamLoad = useMemo(() => {
    const counts = new Map<
      string,
      {
        staff: StaffRecord;
        activeJobs: number;
        todayAppointments: number;
        revenue: number;
      }
    >();
    for (const staff of staffRecords) {
      counts.set(staff.id, {
        staff,
        activeJobs: 0,
        todayAppointments: 0,
        revenue: 0,
      });
    }
    for (const job of activeJobs) {
      const staffId = job.assignedStaff?.id;
      if (!staffId || !counts.has(staffId)) continue;
      const current = counts.get(staffId)!;
      current.activeJobs += 1;
      current.revenue += Number(job.totalPrice ?? 0);
    }
    for (const appointment of todayAppointments) {
      const staffId = appointment.assignedStaff?.id;
      if (!staffId || !counts.has(staffId)) continue;
      const current = counts.get(staffId)!;
      current.todayAppointments += 1;
    }
    return Array.from(counts.values())
      .filter((entry) => entry.activeJobs > 0 || entry.todayAppointments > 0 || entry.staff.userId === user?.id)
      .sort((a, b) => {
        const aLoad = a.activeJobs * 10 + a.todayAppointments;
        const bLoad = b.activeJobs * 10 + b.todayAppointments;
        return bLoad - aLoad;
      })
      .slice(0, 6);
  }, [staffRecords, activeJobs, todayAppointments, user?.id]);
  const watchlist = useMemo(() => {
    const items: Array<{ title: string; detail: string; href: string; icon: ReactNode; tone: "danger" | "warn" | "info" }> = [];
    if (overdueInvoices.length > 0) {
      items.push({
        title: "Overdue cash needs attention",
        detail: `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"} outstanding`,
        href: "/invoices",
        icon: <DollarSign className="h-4 w-4" />,
        tone: "danger",
      });
    }
    if (unassignedActiveJobs.length > 0) {
      items.push({
        title: "Active jobs are unassigned",
        detail: `${unassignedActiveJobs.length} work order${unassignedActiveJobs.length === 1 ? "" : "s"} have no technician`,
        href: "/jobs?view=mine",
        icon: <Wrench className="h-4 w-4" />,
        tone: "warn",
      });
    }
    if (unassignedTodayAppointments.length > 0) {
      items.push({
        title: "Today's schedule needs staffing",
        detail: `${unassignedTodayAppointments.length} appointment${unassignedTodayAppointments.length === 1 ? "" : "s"} are still unassigned`,
        href: "/appointments?view=mine",
        icon: <Users className="h-4 w-4" />,
        tone: "warn",
      });
    }
    if (agingPendingQuotes.length > 0) {
      items.push({
        title: "Quotes are cooling off",
        detail: `${agingPendingQuotes.length} pending quote${agingPendingQuotes.length === 1 ? "" : "s"} are older than 3 days`,
        href: "/quotes",
        icon: <Flame className="h-4 w-4" />,
        tone: "info",
      });
    }
    if (staleQuoteFollowUps.length > 0) {
      items.push({
        title: "Sales follow-up is stale",
        detail: `${staleQuoteFollowUps.length} quote${staleQuoteFollowUps.length === 1 ? "" : "s"} need another touch`,
        href: "/quotes?tab=followup",
        icon: <Receipt className="h-4 w-4" />,
        tone: "warn",
      });
    }
    if (staleInvoiceCollections.length > 0) {
      items.push({
        title: "Collections follow-up is stale",
        detail: `${staleInvoiceCollections.length} invoice${staleInvoiceCollections.length === 1 ? "" : "s"} have gone cold`,
        href: "/invoices?tab=stale",
        icon: <DollarSign className="h-4 w-4" />,
        tone: "danger",
      });
    }
    if (items.length === 0) {
      items.push({
        title: "Operations look healthy",
        detail: "No overdue cash, aging quotes, or unassigned work detected right now.",
        href: "/jobs",
        icon: <ShieldAlert className="h-4 w-4" />,
        tone: "info",
      });
    }
    return items.slice(0, 4);
  }, [
    overdueInvoices,
    unassignedActiveJobs,
    unassignedTodayAppointments,
    agingPendingQuotes,
    staleQuoteFollowUps,
    staleInvoiceCollections,
  ]);

  const priorityActions = useMemo(() => {
    const actions: Array<{ title: string; detail: string; href: string; cta: string }> = [];

    if (myNextJob) {
      const myJobClient = myNextJob.client
        ? `${myNextJob.client.firstName ?? ""} ${myNextJob.client.lastName ?? ""}`.trim()
        : myNextJob.title ?? "Open job";
      actions.push({
        title: "Your next assigned job",
        detail: `${formatSafe(myNextJob.scheduledStart, "h:mm a")} - ${myJobClient}`,
        href: `/jobs/${myNextJob.id}`,
        cta: "Open my job",
      });
    } else if (nextJob) {
      const nextJobClient = nextJob.client
        ? `${nextJob.client.firstName ?? ""} ${nextJob.client.lastName ?? ""}`.trim()
        : nextJob.title ?? "Open job";
      actions.push({
        title: "Next job on deck",
        detail: `${formatSafe(nextJob.scheduledStart, "h:mm a")} · ${nextJobClient}`,
        href: `/jobs/${nextJob.id}`,
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
  }, [myNextJob, nextJob, pendingQuotes, unpaidInvoices, unpaidRevenue]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFilterNow(new Date());
    try {
      await Promise.all([
        refetchAppts(),
        refetchInvoices(),
        refetchQuotes(),
        refetchAcceptedQuotes(),
        refetchJobs(),
        refetchReadyToInvoiceJobs(),
        refetchStaff(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchAppts, refetchInvoices, refetchQuotes, refetchAcceptedQuotes, refetchJobs, refetchReadyToInvoiceJobs, refetchStaff]);

  const handleSendQuote = useCallback(
    async (event: React.SyntheticEvent, quoteId: string) => {
      event.preventDefault();
      event.stopPropagation();
      setSendingQuoteId(quoteId);
      try {
        const result = await runSendQuote({ id: quoteId });
        if (result?.error) {
          toast.error(result.error.message ?? "Could not send quote");
          return;
        }
        toast.success("Quote send recorded");
        await refetchQuotes();
      } finally {
        setSendingQuoteId(null);
      }
    },
    [runSendQuote, refetchQuotes]
  );

  const handleSendFollowUp = useCallback(
    async (event: React.SyntheticEvent, quoteId: string) => {
      event.preventDefault();
      event.stopPropagation();
      setFollowingUpQuoteId(quoteId);
      try {
        const result = await runSendFollowUp({ id: quoteId });
        if (result?.error) {
          toast.error(result.error.message ?? "Could not follow up quote");
          return;
        }
        toast.success("Quote follow-up recorded");
        await refetchQuotes();
      } finally {
        setFollowingUpQuoteId(null);
      }
    },
    [runSendFollowUp, refetchQuotes]
  );

  const handleSendInvoice = useCallback(
    async (event: React.SyntheticEvent, invoiceId: string) => {
      event.preventDefault();
      event.stopPropagation();
      setSendingInvoiceId(invoiceId);
      try {
        const result = await runSendInvoice({ id: invoiceId });
        if (result?.error) {
          toast.error(result.error.message ?? "Could not send invoice");
          return;
        }
        toast.success("Invoice send recorded");
        await refetchInvoices();
      } finally {
        setSendingInvoiceId(null);
      }
    },
    [runSendInvoice, refetchInvoices]
  );

  const handleQuickJobUpdate = useCallback(
    async (event: React.SyntheticEvent, jobId: string, values: Record<string, unknown>, successMessage: string) => {
      event.preventDefault();
      event.stopPropagation();
      setUpdatingJobId(jobId);
      try {
        const result = await runUpdateJob({ id: jobId, ...values });
        if (result?.error) {
          toast.error(result.error.message ?? "Could not update job");
          return;
        }
        toast.success(successMessage);
        await refetchJobs();
      } finally {
        setUpdatingJobId(null);
      }
    },
    [runUpdateJob, refetchJobs]
  );

  const handleAssignAppointmentToMe = useCallback(
    async (event: React.SyntheticEvent, appointmentId: string) => {
      if (!myStaffRecord?.id) return;
      event.preventDefault();
      event.stopPropagation();
      setUpdatingAppointmentId(appointmentId);
      try {
        const result = await runUpdateAppointment({ id: appointmentId, assignedStaff: { _link: myStaffRecord.id } });
        if (result?.error) {
          toast.error(result.error.message ?? "Could not assign appointment");
          return;
        }
        toast.success("Appointment assigned to you");
        await refetchAppts();
      } finally {
        setUpdatingAppointmentId(null);
      }
    },
    [myStaffRecord?.id, runUpdateAppointment, refetchAppts]
  );

  const handleQuickAppointmentStatus = useCallback(
    async (event: React.SyntheticEvent, appointmentId: string, status: string, successMessage: string) => {
      event.preventDefault();
      event.stopPropagation();
      setUpdatingAppointmentId(appointmentId);
      try {
        const result = await runUpdateAppointmentStatus({ id: appointmentId, status });
        if (result?.error) {
          toast.error(result.error.message ?? "Could not update appointment");
          return;
        }
        toast.success(successMessage);
        await refetchAppts();
      } finally {
        setUpdatingAppointmentId(null);
      }
    },
    [runUpdateAppointmentStatus, refetchAppts]
  );

  const loadingAppts = fetchingAppts && appointmentsRaw === undefined;
  const loadingInvoices = fetchingInvoices && invoicesRaw === undefined;
  const loadingQuotes = fetchingQuotes && quotesRaw === undefined;
  const loadingAcceptedQuotes = fetchingAcceptedQuotes && acceptedQuotesRaw === undefined;
  const loadingJobs = fetchingJobs && jobsRaw === undefined;
  const loadingReadyToInvoiceJobs = fetchingReadyToInvoiceJobs && readyToInvoiceJobsRaw === undefined;
  const loadingStaff = fetchingStaff && staffRaw === undefined;
  const anyLoading =
    loadingAppts ||
    loadingInvoices ||
    loadingQuotes ||
    loadingAcceptedQuotes ||
    loadingJobs ||
    loadingReadyToInvoiceJobs ||
    loadingStaff;
  const anyError =
    jobsError ?? readyToInvoiceJobsError ?? apptsError ?? invoicesError ?? quotesError ?? acceptedQuotesError ?? staffError;

  if (!businessId) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] pb-24 md:pb-8">
      <div className="page-content page-section max-w-6xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {businessName ?? "Dashboard"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{format(filterNow, "EEEE, MMM d")}</p>
            {activeLocationName ? (
              <p className="mt-1 text-sm text-muted-foreground">Location focus: {activeLocationName}</p>
            ) : null}
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
            label="Open jobs"
            value={String(activeJobs.length)}
            detail={activeJobValue > 0 ? formatCurrency(activeJobValue) : "No active work orders"}
            icon={<Clock3 className="h-5 w-5" />}
          />
          <MetricCard
            label="My queue"
            value={myStaffRecord ? String(myActiveJobs.length) : "-"}
            detail={
              myStaffRecord
                ? myActiveJobValue > 0
                  ? formatCurrency(myActiveJobValue)
                  : "No assigned work"
                : "Not linked to staff"
            }
            icon={<ClipboardList className="h-5 w-5" />}
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
            <h2 className="text-lg font-semibold">Pipeline snapshot</h2>
            <span className="text-sm text-muted-foreground">Sales, cash, and billing momentum at a glance</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PipelineCard
              href="/quotes?tab=ready-to-book"
              label="Ready to book"
              value={String(acceptedQuotes.length)}
              detail={acceptedQuoteValue > 0 ? formatCurrency(acceptedQuoteValue) : "No accepted quote value yet"}
              tone="sales"
            />
            <PipelineCard
              href="/jobs"
              label="Ready to invoice"
              value={String(readyToInvoiceJobs.length)}
              detail={readyToInvoiceValue > 0 ? formatCurrency(readyToInvoiceValue) : "No completed unbilled work"}
              tone="billing"
            />
            <PipelineCard
              href="/invoices?tab=stale"
              label="Average unpaid balance"
              value={formatCurrency(averageOutstandingInvoice)}
              detail={
                unpaidInvoices.length > 0
                  ? `${unpaidInvoices.length} invoice${unpaidInvoices.length === 1 ? "" : "s"} in queue`
                  : "No unpaid invoices"
              }
              tone="risk"
            />
            <PipelineCard
              href="/quotes"
              label="Quote conversion"
              value={`${quoteConversionRate}%`}
              detail={
                acceptedQuotes.length + pendingQuotes.length > 0
                  ? `${acceptedQuotes.length} accepted vs ${pendingQuotes.length} still open`
                  : "No active quote pipeline"
              }
              tone="ops"
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Today's operating pulse</h2>
            <span className="text-sm text-muted-foreground">
              {activeLocationName ? "Focused on current location" : "Across the current business"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Link
              to="/appointments"
              className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">Booked today</p>
                <CalendarPlus className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-2xl font-semibold tracking-tight">{todayAppointments.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {todayBookedValue > 0 ? formatCurrency(todayBookedValue) : "No booked value yet"}
              </p>
            </Link>

            <Link
              to="/appointments"
              className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">Staffing coverage</p>
                <Users className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-2xl font-semibold tracking-tight">{todayCoverageRate}%</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {assignedTodayAppointments.length}/{todayAppointments.length} assigned
                {unassignedTodayAppointments.length > 0
                  ? ` - ${unassignedTodayAppointments.length} still open`
                  : " - fully staffed"}
              </p>
            </Link>

            <Link
              to="/invoices"
              className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">Cash risk</p>
                <DollarSign className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-2xl font-semibold tracking-tight">{overdueInvoices.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {overdueInvoices.length > 0 ? formatCurrency(overdueRevenue) : "No overdue cash right now"}
              </p>
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Quick actions</h2>
            <span className="text-sm text-muted-foreground">Most-used workflows</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickAction href="/clients/new" label="New client" icon={<Users className="h-5 w-5 shrink-0" />} />
            <QuickAction
              href={scheduleJobHref}
              label="Schedule job"
              icon={<CalendarPlus className="h-5 w-5 shrink-0" />}
              primary
            />
            <QuickAction href="/jobs" label="Open jobs" icon={<ClipboardList className="h-5 w-5 shrink-0" />} />
            <QuickAction href="/quotes/new" label="Create quote" icon={<Receipt className="h-5 w-5 shrink-0" />} />
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

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Owner watchlist</h2>
            <span className="text-sm text-muted-foreground">Risk, cash, and staffing signals</span>
          </div>
          <div className="grid gap-3">
            {watchlist.map((item) => (
              <Link
                key={item.title}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-4 transition-colors hover:bg-muted/40",
                  item.tone === "danger" && "border-red-200 bg-red-50/70",
                  item.tone === "warn" && "border-amber-200 bg-amber-50/70"
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    item.tone === "danger" && "bg-red-500/10 text-red-700",
                    item.tone === "warn" && "bg-amber-500/10 text-amber-700",
                    item.tone === "info" && "bg-sky-500/10 text-sky-700"
                  )}
                >
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{item.detail}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>

        <DashboardSection
          title="Team load"
          seeAllHref="/settings"
          seeAllLabel="Team"
          error={staffError}
          isLoading={loadingStaff || loadingJobs || loadingAppts}
          isEmpty={!loadingStaff && !loadingJobs && !loadingAppts && teamLoad.length === 0}
          emptyMessage="No technician load is showing yet."
          emptyCta={{ href: "/settings", label: "Set up team" }}
          skeletonRows={3}
        >
          <ul className="overflow-hidden rounded-xl border divide-y divide-border bg-card">
            {teamLoad.map((entry) => {
              const staffName = `${entry.staff.firstName ?? ""} ${entry.staff.lastName ?? ""}`.trim() || "Team member";
              const loadTone =
                entry.activeJobs >= 3 || entry.todayAppointments >= 5
                  ? "text-red-700 bg-red-50 border-red-200"
                  : entry.activeJobs >= 2 || entry.todayAppointments >= 3
                    ? "text-amber-700 bg-amber-50 border-amber-200"
                    : "text-emerald-700 bg-emerald-50 border-emerald-200";
              return (
                <li key={entry.staff.id}>
                  <div className="flex min-h-[64px] items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium">{staffName}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {entry.activeJobs} active job{entry.activeJobs === 1 ? "" : "s"} | {entry.todayAppointments} on today's schedule
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">{formatCurrency(entry.revenue)}</div>
                      <div className={cn("mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", loadTone)}>
                        {entry.activeJobs >= 3 || entry.todayAppointments >= 5
                          ? "Heavy load"
                          : entry.activeJobs >= 2 || entry.todayAppointments >= 3
                            ? "Balanced"
                            : "Light load"}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </DashboardSection>

        <DashboardSection
          title={myStaffRecord ? "My queue" : "Assigned work"}
          seeAllHref="/jobs"
          seeAllLabel="All jobs"
          error={staffError}
          isLoading={loadingJobs || loadingStaff}
          isEmpty={!loadingJobs && !loadingStaff && !!myStaffRecord && myActiveJobs.length === 0}
          emptyMessage={
            myStaffRecord
              ? "No jobs are assigned to you right now."
              : "Link this user to a staff profile to unlock assigned work."
          }
          emptyCta={{ href: "/settings", label: myStaffRecord ? "Open team" : "Set up team" }}
          skeletonRows={2}
        >
          {myStaffRecord ? (
            <ul className="overflow-hidden rounded-xl border divide-y divide-border bg-card">
              {myActiveJobs.map((job) => (
                <li key={job.id}>
                  <Link
                    to={`/jobs/${job.id}`}
                    className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted/70"
                  >
                    <div className="w-[72px] shrink-0 font-mono text-sm text-muted-foreground">
                      {formatSafe(job.scheduledStart, "h:mm a")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium">
                        {job.title?.trim() ||
                          (job.client
                            ? `${job.client.firstName ?? ""} ${job.client.lastName ?? ""}`.trim()
                            : "Assigned job")}
                      </p>
                      {job.vehicle ? (
                        <p className="truncate text-sm text-muted-foreground">
                          {[job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge status={job.status ?? "scheduled"} type="job" />
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
              <p className="mb-4 text-sm text-muted-foreground">This user is not linked to a staff profile yet.</p>
              <Button asChild size="lg" className="min-h-[48px] rounded-xl">
                <Link to="/settings">Open team settings</Link>
              </Button>
            </div>
          )}
        </DashboardSection>

        <DashboardSection
          title="Active jobs"
          seeAllHref="/jobs"
          seeAllLabel="All jobs"
          error={jobsError}
          isLoading={loadingJobs}
          isEmpty={!loadingJobs && !jobsError && activeJobs.length === 0}
          emptyMessage="No active work orders right now."
          emptyCta={{ href: scheduleJobHref, label: "Schedule a job" }}
          skeletonRows={3}
        >
          <ul className="overflow-hidden rounded-xl border divide-y divide-border bg-card">
            {activeJobs.map((job) => (
              <li key={job.id}>
                <Link
                  to={`/jobs/${job.id}`}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted/70"
                >
                  <div className="w-[72px] shrink-0 font-mono text-sm text-muted-foreground">
                    {formatSafe(job.scheduledStart, "h:mm a")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">
                      {job.title?.trim() ||
                        (job.client
                          ? `${job.client.firstName ?? ""} ${job.client.lastName ?? ""}`.trim()
                          : "Job")}
                    </p>
                    {job.vehicle ? (
                      <p className="truncate text-sm text-muted-foreground">
                        {[job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")}
                      </p>
                    ) : job.assignedStaff ? (
                      <p className="truncate text-sm text-muted-foreground">
                        Assigned to{" "}
                        {`${job.assignedStaff.firstName ?? ""} ${job.assignedStaff.lastName ?? ""}`.trim() || "team"}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="flex items-center gap-2"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    {myStaffRecord && !job.assignedStaff?.id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={updatingJobId !== null}
                        onClick={(event) =>
                          void handleQuickJobUpdate(event, job.id, { assignedStaffId: myStaffRecord.id }, "Job assigned to you")
                        }
                      >
                        Assign to me
                      </Button>
                    ) : null}
                    {["scheduled", "confirmed"].includes(job.status ?? "") ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={updatingJobId !== null}
                        onClick={(event) =>
                          void handleQuickJobUpdate(event, job.id, { status: "in_progress" }, "Job marked in progress")
                        }
                      >
                        Start
                      </Button>
                    ) : null}
                    {job.status === "in_progress" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={updatingJobId !== null}
                        onClick={(event) =>
                          void handleQuickJobUpdate(event, job.id, { status: "completed" }, "Job completed")
                        }
                      >
                        Complete
                      </Button>
                    ) : null}
                  </div>
                  <StatusBadge status={job.status ?? "scheduled"} type="job" />
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>

        <DashboardSection
          title="Today's schedule"
          seeAllHref="/appointments"
          seeAllLabel="All appointments"
          error={apptsError}
          isLoading={loadingAppts}
          isEmpty={!loadingAppts && !apptsError && todayAppointments.length === 0}
          emptyMessage="Nothing on the schedule today."
          emptyCta={{ href: scheduleJobHref, label: "Schedule a job" }}
          skeletonRows={3}
        >
          <ul className="overflow-hidden rounded-xl border divide-y divide-border bg-card">
            {todayAppointments.map((appointment) => (
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
                  <div
                    className="flex items-center gap-2"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    {myStaffRecord && !appointment.assignedStaff?.id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={updatingAppointmentId !== null}
                        onClick={(event) => void handleAssignAppointmentToMe(event, appointment.id)}
                      >
                        Assign to me
                      </Button>
                    ) : null}
                    {appointment.status === "scheduled" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={updatingAppointmentId !== null}
                        onClick={(event) =>
                          void handleQuickAppointmentStatus(event, appointment.id, "confirmed", "Appointment confirmed")
                        }
                      >
                        Confirm
                      </Button>
                    ) : null}
                    {appointment.status === "confirmed" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={updatingAppointmentId !== null}
                        onClick={(event) =>
                          void handleQuickAppointmentStatus(event, appointment.id, "in_progress", "Appointment started")
                        }
                      >
                        Start
                      </Button>
                    ) : null}
                    {appointment.status === "in_progress" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={updatingAppointmentId !== null}
                        onClick={(event) =>
                          void handleQuickAppointmentStatus(event, appointment.id, "completed", "Appointment completed")
                        }
                      >
                        Complete
                      </Button>
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
          title="Ready to book"
          seeAllHref="/quotes"
          seeAllLabel="Quotes"
          error={acceptedQuotesError}
          isLoading={loadingAcceptedQuotes}
          isEmpty={!loadingAcceptedQuotes && !acceptedQuotesError && acceptedQuotes.length === 0}
          emptyMessage="No accepted quotes are waiting to be booked."
          emptyCta={{ href: "/quotes", label: "Review quotes" }}
          skeletonRows={2}
        >
          <ul className="overflow-hidden rounded-xl border divide-y divide-border bg-card">
            {acceptedQuotes.map((quote) => (
              <li key={quote.id}>
                <Link
                  to={`/quotes/${quote.id}`}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted/70"
                >
                  <Receipt className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {quote.client
                        ? `${quote.client.firstName ?? ""} ${quote.client.lastName ?? ""}`.trim() || "Accepted quote"
                        : `Quote - ${String(quote.id).slice(0, 8)}...`}
                    </p>
                    <p className="text-sm capitalize text-muted-foreground">accepted</p>
                  </div>
                  <div
                    className="flex items-center gap-2"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    {quote.client?.id ? (
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                        <Link
                          to={`/appointments/new?clientId=${quote.client.id}&quoteId=${quote.id}${
                            currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
                          }`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          Book
                        </Link>
                      </Button>
                    ) : null}
                    {quote.client?.id ? (
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                        <Link
                          to={`/invoices/new?clientId=${quote.client.id}&quoteId=${quote.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          Invoice
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(quote.total)}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </DashboardSection>

        <DashboardSection
          title="Ready to invoice"
          seeAllHref="/jobs"
          seeAllLabel="Jobs"
          error={readyToInvoiceJobsError}
          isLoading={loadingReadyToInvoiceJobs}
          isEmpty={!loadingReadyToInvoiceJobs && !readyToInvoiceJobsError && readyToInvoiceJobs.length === 0}
          emptyMessage="No completed work is waiting for invoicing."
          emptyCta={{ href: "/jobs", label: "Review jobs" }}
          skeletonRows={2}
        >
          <ul className="overflow-hidden rounded-xl border divide-y divide-border bg-card">
            {readyToInvoiceJobs.map((job) => (
              <li key={job.id}>
                <Link
                  to={`/jobs/${job.id}`}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted/70"
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {job.client
                        ? `${job.client.firstName ?? ""} ${job.client.lastName ?? ""}`.trim() || "Completed job"
                        : job.title ?? "Completed job"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {job.vehicle
                        ? [job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")
                        : "No vehicle on file"}
                    </p>
                  </div>
                  <div
                    className="flex items-center gap-2"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    {job.client?.id ? (
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                        <Link
                          to={`/invoices/new?clientId=${job.client.id}&appointmentId=${job.appointmentId ?? job.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          Invoice
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(job.totalPrice)}</span>
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
                    {(quote.sentAt || quote.followUpSentAt) ? (
                      <p className="text-xs text-muted-foreground">
                        {[
                          formatFreshness(quote.sentAt ?? null, "Sent"),
                          formatFreshness(quote.followUpSentAt ?? null, "Followed up"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="flex items-center gap-2"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    {["draft", "sent"].includes(String(quote.status ?? "")) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={sendingQuoteId !== null}
                        onClick={(event) => void handleSendQuote(event, quote.id)}
                      >
                        {sendingQuoteId === quote.id ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        {String(quote.status ?? "") === "draft" ? "Send" : "Resend"}
                      </Button>
                    ) : null}
                    {String(quote.status ?? "") === "sent" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={followingUpQuoteId !== null}
                        onClick={(event) => void handleSendFollowUp(event, quote.id)}
                      >
                        {followingUpQuoteId === quote.id ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        Follow up
                      </Button>
                    ) : null}
                    {String(quote.status ?? "") === "accepted" && quote.client?.id ? (
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                        <Link
                          to={`/appointments/new?clientId=${quote.client.id}&quoteId=${quote.id}${
                            currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
                          }`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          Book
                        </Link>
                      </Button>
                    ) : null}
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
                    {(invoice.lastSentAt || invoice.lastPaidAt) ? (
                      <p className="text-xs text-muted-foreground">
                        {[formatFreshness(invoice.lastSentAt ?? null, "Sent"), formatFreshness(invoice.lastPaidAt ?? null, "Paid")]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="flex items-center gap-2"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    {["draft", "sent", "partial"].includes(String(invoice.status ?? "")) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={sendingInvoiceId !== null}
                        onClick={(event) => void handleSendInvoice(event, invoice.id)}
                      >
                        {sendingInvoiceId === invoice.id ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        {String(invoice.status ?? "") === "draft" ? "Send" : "Resend"}
                      </Button>
                    ) : null}
                    {["sent", "partial"].includes(String(invoice.status ?? "")) ? (
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                        <Link
                          to={`/invoices/${invoice.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          Collect
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrency(invoiceBalance(invoice))}</span>
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
          <MobileQuickAction href={scheduleJobHref} label="Job" icon={<CalendarPlus className="h-5 w-5" />} primary />
          <MobileQuickAction href="/jobs" label="Queue" icon={<ClipboardList className="h-5 w-5" />} />
          <MobileQuickAction href="/quotes/new" label="Quote" icon={<Receipt className="h-5 w-5" />} />
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

function PipelineCard({
  href,
  label,
  value,
  detail,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  detail: string;
  tone: "sales" | "billing" | "risk" | "ops";
}) {
  const toneClasses =
    tone === "sales"
      ? "bg-sky-500/10 text-sky-700"
      : tone === "billing"
        ? "bg-emerald-500/10 text-emerald-700"
        : tone === "risk"
          ? "bg-amber-500/10 text-amber-700"
          : "bg-violet-500/10 text-violet-700";

  return (
    <Link
      to={href}
      className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/40"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", toneClasses)}>
          <ArrowUpRight className="h-5 w-5" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </Link>
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
