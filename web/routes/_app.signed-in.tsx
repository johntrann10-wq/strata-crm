import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useOutletContext } from "react-router";
import { format, parseISO, isSameDay, startOfDay, endOfDay } from "date-fns";
import {
  AlertCircle,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Car,
  Clock3,
  DollarSign,
  FileText,
  ShieldAlert,
  Receipt,
  RefreshCw,
  Settings2,
  Wrench,
  Users,
} from "lucide-react";
import { useFindMany } from "../hooks/useApi";
import { api, ApiError } from "../api";
import { useAction } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ActivityFeedCard, type ActivityRecord } from "../components/shared/ActivityFeedCard";
import { StatusBadge } from "../components/shared/StatusBadge";
import { RouteErrorBoundary } from "@/components/app/RouteErrorBoundary";
import { toast } from "sonner";
import { getTransactionalEmailErrorMessage } from "../lib/transactionalEmail";
import { parseLeadRecord } from "../lib/leads";

type AppointmentRecord = {
  id: string;
  title?: string | null;
  status: string;
  startTime: string;
  endTime?: string | null;
  totalPrice?: number | string | null;
  depositAmount?: number | string | null;
  depositPaid?: boolean | null;
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

type ClientRecord = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  createdAt?: string | null;
};

type BusinessSetupRecord = {
  id: string;
  name?: string | null;
  type?: string | null;
  operatingHours?: string | null;
  appointmentBufferMinutes?: number | null;
  defaultTaxRate?: number | string | null;
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

function notifyAppointmentConfirmation(
  deliveryStatus?: string | null,
  deliveryError?: string | null,
  fallbackMessage = "Appointment confirmed"
) {
  if (deliveryStatus === "emailed") {
    toast.success(`${fallbackMessage} and email sent`);
    return;
  }
  if (deliveryStatus === "missing_email") {
    toast.warning(`${fallbackMessage}, but the client has no email address.`);
    return;
  }
  if (deliveryStatus === "smtp_disabled") {
    toast.warning(`${fallbackMessage}, but transactional email is not configured.`);
    return;
  }
  if (deliveryStatus === "email_failed") {
    toast.warning(`${fallbackMessage}, but confirmation email failed${deliveryError ? `: ${deliveryError}` : "."}`);
    return;
  }
  toast.success(fallbackMessage);
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
  const upcomingAppointmentsStart = useMemo(() => endOfDay(filterNow).toISOString(), [filterNow]);

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
  const [{ data: jobsRaw, fetching: fetchingJobs, error: jobsError }, refetchJobs] = useFindMany(api.job, {
    first: 25,
    locationId: currentLocationId ?? undefined,
    pause: !businessId,
  } as any);
  const [{ data: upcomingAppointmentsRaw, fetching: fetchingUpcomingAppointments, error: upcomingAppointmentsError }] = useFindMany(
    api.appointment,
    {
      startGte: upcomingAppointmentsStart,
      locationId: currentLocationId ?? undefined,
      sort: { startTime: "Ascending" },
      first: 6,
      pause: !businessId,
    }
  );
  const [{ data: staffRaw, fetching: fetchingStaff, error: staffError }, refetchStaff] = useFindMany(api.staff, {
    first: 100,
    pause: !businessId,
  } as any);
  const [{ data: recentClientsRaw, fetching: fetchingRecentClients, error: recentClientsError }] = useFindMany(api.client, {
    first: 6,
    sort: { createdAt: "Descending" },
    pause: !businessId,
  } as any);
  const [{ data: activityRaw, fetching: fetchingActivity, error: activityError }, refetchActivity] = useFindMany(
    api.activityLog,
    {
      first: 6,
      pause: !businessId,
    } as any
  );
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
  const [{ data: activationBusinessRaw, fetching: fetchingActivationBusiness }] = useFindMany(api.business, {
    first: 1,
    select: { id: true, name: true, type: true, operatingHours: true, appointmentBufferMinutes: true, defaultTaxRate: true },
    pause: !businessId,
  } as any);
  const [{ data: activationClientsRaw, fetching: fetchingActivationClients }] = useFindMany(api.client, {
    first: 1,
    pause: !businessId,
  });
  const [{ data: activationVehiclesRaw, fetching: fetchingActivationVehicles }] = useFindMany(api.vehicle, {
    first: 1,
    pause: !businessId,
  });
  const [{ data: activationServicesRaw, fetching: fetchingActivationServices }] = useFindMany(api.service, {
    first: 1,
    pause: !businessId,
  });
  const [{ data: activationAppointmentsRaw, fetching: fetchingActivationAppointments }] = useFindMany(api.appointment, {
    first: 1,
    pause: !businessId,
  });
  const [{ data: activationInvoicesRaw, fetching: fetchingActivationInvoices }] = useFindMany(api.invoice, {
    first: 1,
    pause: !businessId,
  });

  const appointments = useMemo(() => (appointmentsRaw ?? []) as AppointmentRecord[], [appointmentsRaw]);
  const unpaidInvoices = useMemo(() => (invoicesRaw ?? []) as InvoiceRecord[], [invoicesRaw]);
  const pendingQuotes = useMemo(() => (quotesRaw ?? []) as QuoteRecord[], [quotesRaw]);
  const jobs = useMemo(() => (jobsRaw ?? []) as JobRecord[], [jobsRaw]);
  const upcomingAppointments = useMemo(
    () => (upcomingAppointmentsRaw ?? []) as AppointmentRecord[],
    [upcomingAppointmentsRaw]
  );
  const staffRecords = useMemo(() => (staffRaw ?? []) as StaffRecord[], [staffRaw]);
  const activityRecords = (activityRaw ?? []) as ActivityRecord[];
  const recentClients = useMemo(
    () => ((recentClientsRaw ?? []) as ClientRecord[]).filter((client) => !parseLeadRecord(client.notes).isLead),
    [recentClientsRaw]
  );
  const activationClients = useMemo(
    () => ((activationClientsRaw ?? []) as ClientRecord[]).filter((client) => !parseLeadRecord(client.notes).isLead),
    [activationClientsRaw]
  );
  const locationRecords = useMemo(
    () => (locationsRaw ?? []) as Array<{ id: string; name?: string | null }>,
    [locationsRaw]
  );
  const activationBusiness = ((activationBusinessRaw ?? [])[0] ?? null) as BusinessSetupRecord | null;
  const activeLocationName = useMemo(
    () => locationRecords.find((location) => location.id === currentLocationId)?.name?.trim() || null,
    [locationRecords, currentLocationId]
  );
  const scheduleJobHref = currentLocationId
    ? `/appointments/new?locationId=${encodeURIComponent(currentLocationId)}`
    : "/appointments/new";
  const todayScheduleHref = "/calendar";
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
  const todayBookedValue = useMemo(
    () => sumCurrency(todayAppointments.map((appointment) => appointment.totalPrice)),
    [todayAppointments]
  );
  const assignedTodayAppointments = useMemo(
    () => todayAppointments.filter((appointment) => !!appointment.assignedStaff?.id),
    [todayAppointments]
  );
  const depositsAwaitingPayment = useMemo(
    () =>
      todayAppointments.filter((appointment) => {
        const deposit = Number(appointment.depositAmount ?? 0);
        return Number.isFinite(deposit) && deposit > 0 && !appointment.depositPaid;
      }),
    [todayAppointments]
  );
  const depositDueValue = useMemo(
    () => sumCurrency(depositsAwaitingPayment.map((appointment) => appointment.depositAmount)),
    [depositsAwaitingPayment]
  );
  const pendingApprovalsCount = useMemo(
    () =>
      pendingQuotes.length +
      staleQuoteFollowUps.length +
      staleInvoiceCollections.length +
      depositsAwaitingPayment.length,
    [pendingQuotes.length, staleQuoteFollowUps.length, staleInvoiceCollections.length, depositsAwaitingPayment.length]
  );
  const priorityActions = useMemo(() => {
    const actions: Array<{
      key: string;
      label: string;
      detail: string;
      href: string;
      cta: string;
      tone: "urgent" | "attention";
    }> = [];

    if (depositsAwaitingPayment.length > 0) {
      actions.push({
        key: "deposits",
        label: "Collect pending deposits",
        detail: `${depositsAwaitingPayment.length} appointment${depositsAwaitingPayment.length === 1 ? "" : "s"} still need ${formatCurrency(depositDueValue)} in deposits.`,
        href: "/appointments",
        cta: "Review deposits",
        tone: "urgent",
      });
    }
    if (staleInvoiceCollections.length > 0) {
      actions.push({
        key: "collections",
        label: "Follow up on unpaid invoices",
        detail: `${staleInvoiceCollections.length} invoice${staleInvoiceCollections.length === 1 ? "" : "s"} need collection attention.`,
        href: "/invoices?tab=stale",
        cta: "Open collections",
        tone: "urgent",
      });
    }
    if (pendingQuotes.length > 0) {
      actions.push({
        key: "quotes",
        label: "Close pending quotes",
        detail: `${pendingQuotes.length} quote${pendingQuotes.length === 1 ? "" : "s"} are still waiting on approval.`,
        href: "/quotes",
        cta: "Open quotes",
        tone: "attention",
      });
    }
    if (todayAppointments.some((appointment) => !appointment.assignedStaff?.id)) {
      const unassignedCount = todayAppointments.filter((appointment) => !appointment.assignedStaff?.id).length;
      actions.push({
        key: "assignments",
        label: "Assign today's unowned work",
        detail: `${unassignedCount} appointment${unassignedCount === 1 ? "" : "s"} still have no staff owner.`,
        href: "/appointments",
        cta: "Assign work",
        tone: "attention",
      });
    }

    return actions.slice(0, 4);
  }, [depositDueValue, depositsAwaitingPayment, pendingQuotes, staleInvoiceCollections, todayAppointments]);
  const activationChecklist = useMemo(() => {
    const bookingBasicsReady = Boolean(
      activationBusiness?.operatingHours &&
        activationBusiness.appointmentBufferMinutes != null
    );
    const bufferMinutes = Number(activationBusiness?.appointmentBufferMinutes ?? 0);
    const items = [
      {
        key: "client",
        label: "Add your first client",
        detail: "Start your CRM with the first real customer record.",
        done: activationClients.length > 0,
        href: "/clients/new",
        actionLabel: "Add client",
        icon: <Users className="h-4 w-4" />,
      },
      {
        key: "vehicle",
        label: "Add your first vehicle",
        detail: "Attach a real vehicle so scheduling and history work correctly.",
        done: (activationVehiclesRaw?.length ?? 0) > 0,
        href: "/clients",
        actionLabel: "Add vehicle",
        icon: <Car className="h-4 w-4" />,
      },
      {
        key: "services",
        label: "Review loaded services",
        detail: "Your starter menu is preloaded. Confirm the catalog before you start booking.",
        done: (activationServicesRaw?.length ?? 0) > 0,
        href: "/services",
        actionLabel: "Open services",
        icon: <Wrench className="h-4 w-4" />,
      },
      {
        key: "appointment",
        label: "Book your first appointment",
        detail: "Put a real job on the board so the calendar becomes useful immediately.",
        done: (activationAppointmentsRaw?.length ?? 0) > 0,
        href: scheduleJobHref,
        actionLabel: "New appointment",
        icon: <CalendarPlus className="h-4 w-4" />,
      },
      {
        key: "invoice",
        label: "Generate your first invoice",
        detail: "Turn completed work into a payable invoice so billing is ready from day one.",
        done: (activationInvoicesRaw?.length ?? 0) > 0,
        href: "/invoices/new",
        actionLabel: "New invoice",
        icon: <FileText className="h-4 w-4" />,
      },
      {
        key: "booking_basics",
        label: "Confirm booking basics",
        detail: bookingBasicsReady
          ? `Hours loaded and ${bufferMinutes} minute booking buffer ready.`
          : "Verify hours, booking buffer, and default billing basics.",
        done: bookingBasicsReady,
        href: "/settings",
        actionLabel: "Open settings",
        icon: <Settings2 className="h-4 w-4" />,
      },
    ];
    const completed = items.filter((item) => item.done).length;
    return {
      items,
      completed,
      total: items.length,
      percent: Math.round((completed / items.length) * 100),
    };
  }, [
    activationBusiness?.appointmentBufferMinutes,
    activationBusiness?.operatingHours,
    activationAppointmentsRaw?.length,
    activationClients.length,
    activationInvoicesRaw?.length,
    activationServicesRaw?.length,
    activationVehiclesRaw?.length,
    scheduleJobHref,
  ]);
  const loadingActivationChecklist =
    (fetchingActivationBusiness && activationBusinessRaw === undefined) ||
    (fetchingActivationClients && activationClientsRaw === undefined) ||
    (fetchingActivationVehicles && activationVehiclesRaw === undefined) ||
    (fetchingActivationServices && activationServicesRaw === undefined) ||
    (fetchingActivationAppointments && activationAppointmentsRaw === undefined) ||
    (fetchingActivationInvoices && activationInvoicesRaw === undefined);
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
  const showTeamAssignments = staffRecords.length > 1 || teamLoad.length > 0;
  const dashboardHeroSignals = useMemo(
    () => [
      {
        label: "Booked today",
        value: todayAppointments.length > 0 ? `${todayAppointments.length}` : "0",
        detail: todayAppointments.length > 0 ? formatCurrency(todayBookedValue) : "Open schedule",
        href: "/appointments",
      },
      {
        label: "Money queue",
        value: unpaidRevenue > 0 ? formatCurrency(unpaidRevenue) : "Clear",
        detail:
          unpaidInvoices.length > 0
            ? `${unpaidInvoices.length} invoice${unpaidInvoices.length === 1 ? "" : "s"} waiting`
            : "No unpaid invoices",
        href: "/invoices",
      },
      {
        label: "Pending approvals",
        value: String(pendingApprovalsCount),
        detail:
          pendingApprovalsCount > 0
            ? `${pendingQuotes.length} quote${pendingQuotes.length === 1 ? "" : "s"} + follow-up work`
            : "Nothing urgent",
        href: pendingApprovalsCount > 0 ? "/quotes" : scheduleJobHref,
      },
      {
        label: "Next up",
        value: upcomingAppointments[0] ? formatSafe(upcomingAppointments[0].startTime, "h:mm a") : "Unscheduled",
        detail: upcomingAppointments[0]?.client
          ? `${upcomingAppointments[0].client.firstName ?? ""} ${upcomingAppointments[0].client.lastName ?? ""}`.trim() || "Next appointment"
          : "No upcoming appointment",
        href: upcomingAppointments[0] ? `/appointments/${upcomingAppointments[0].id}` : scheduleJobHref,
      },
    ],
    [
      pendingApprovalsCount,
      pendingQuotes.length,
      scheduleJobHref,
      todayAppointments.length,
      todayBookedValue,
      unpaidInvoices.length,
      unpaidRevenue,
      upcomingAppointments,
    ]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFilterNow(new Date());
    try {
      await Promise.all([
        refetchAppts(),
        refetchInvoices(),
        refetchQuotes(),
        refetchJobs(),
        refetchStaff(),
        refetchActivity(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchActivity, refetchAppts, refetchInvoices, refetchJobs, refetchQuotes, refetchStaff]);

  const handleSendQuote = useCallback(
    async (event: React.SyntheticEvent, quoteId: string) => {
      event.preventDefault();
      event.stopPropagation();
      setSendingQuoteId(quoteId);
      try {
        const result = await runSendQuote({ id: quoteId });
          if (result?.error) {
            toast.error(getTransactionalEmailErrorMessage(result.error, "Quote"));
            return;
          }
        const deliveryStatus = (result?.data as { deliveryStatus?: string } | undefined)?.deliveryStatus;
        if (deliveryStatus === "emailed") {
          toast.success("Quote emailed to client");
        } else {
          toast.warning("Quote was marked as sent, but email was not delivered");
        }
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
          toast.error(getTransactionalEmailErrorMessage(result.error, "Quote follow-up"));
          return;
        }
          const deliveryStatus = (result?.data as { deliveryStatus?: string } | undefined)?.deliveryStatus;
          if (deliveryStatus === "emailed") {
            toast.success("Follow-up emailed to client");
          } else {
            toast.warning("Follow-up was recorded, but email was not delivered");
          }
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
            toast.error(getTransactionalEmailErrorMessage(result.error, "Invoice"));
            return;
          }
        const deliveryStatus = (result?.data as { deliveryStatus?: string } | undefined)?.deliveryStatus;
        if (deliveryStatus === "emailed") {
          toast.success("Invoice emailed to client");
        } else {
          toast.warning("Invoice was marked as sent, but email was not delivered");
        }
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
          const result = await runUpdateAppointment({ id: appointmentId, assignedStaffId: myStaffRecord.id });
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
        const payload = result.data as { deliveryStatus?: string | null; deliveryError?: string | null } | null;
        if (status === "confirmed") {
          notifyAppointmentConfirmation(payload?.deliveryStatus ?? null, payload?.deliveryError ?? null, successMessage);
        } else {
          toast.success(successMessage);
        }
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
  const loadingJobs = fetchingJobs && jobsRaw === undefined;
  const loadingStaff = fetchingStaff && staffRaw === undefined;
  const loadingActivity = fetchingActivity && activityRaw === undefined;
  const anyLoading =
    loadingAppts ||
    loadingInvoices ||
    loadingQuotes ||
    loadingJobs ||
    loadingStaff ||
    loadingActivity;
  const anyError =
    jobsError ?? apptsError ?? invoicesError ?? quotesError ?? staffError ?? activityError;

  if (!businessId) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="pb-6 md:pb-8">
      <div className="page-content page-section max-w-7xl space-y-4 sm:space-y-5">
        <section className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] px-4 py-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:rounded-[32px] sm:px-6 sm:py-6 sm:shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-600">Control center</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.6rem]">
                {businessName ?? "Dashboard"}
              </h1>
              <p className="mt-4 text-sm font-medium text-slate-500">
                {format(filterNow, "EEEE, MMM d")}
                {activeLocationName ? ` · ${activeLocationName}` : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-2xl border-white/70 bg-white/70 shadow-sm backdrop-blur"
              onClick={() => void handleRefresh()}
              disabled={refreshing || anyLoading}
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={cn("h-5 w-5", (refreshing || anyLoading) && "animate-spin")} />
            </Button>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
            <div className="order-2 grid gap-3 sm:grid-cols-2 xl:order-1 xl:grid-cols-4">
              {dashboardHeroSignals.map((signal) => (
                <Link
                  key={signal.label}
                  to={signal.href}
                  className="group rounded-[22px] border border-white/80 bg-white/85 p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_16px_40px_rgba(249,115,22,0.14)] sm:p-4 sm:rounded-[24px]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-xl bg-orange-50 p-2 text-orange-600 transition group-hover:bg-orange-100 sm:rounded-2xl sm:p-2.5">
                      {signal.icon}
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:mt-5 sm:text-xs sm:tracking-[0.18em]">
                    {signal.label}
                  </p>
                  <div className="mt-1.5 text-[1.5rem] font-semibold tracking-[-0.05em] text-slate-950 sm:mt-2 sm:text-[1.8rem]">
                    {signal.value}
                  </div>
                  <p className="mt-1 min-h-[2.25rem] text-sm leading-5 text-slate-500">
                    {signal.detail}
                  </p>
                </Link>
              ))}
            </div>

            <div className="order-1 rounded-[24px] bg-slate-950 p-4 text-white shadow-[0_18px_50px_rgba(15,23,42,0.28)] sm:p-5 sm:rounded-[28px] xl:order-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-300">Actions</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Create a record</h2>
                </div>
                <CheckCircle2 className="mt-1 h-5 w-5 text-orange-300" />
              </div>
              <div className="mt-4 grid gap-2 sm:mt-5 sm:gap-2.5">
                <QuickAction
                  href={scheduleJobHref}
                  label="New Appointment"
                  icon={<CalendarPlus className="h-5 w-5 shrink-0" />}
                  primary
                />
                <QuickAction href="/quotes/new" label="New Quote" icon={<Receipt className="h-5 w-5 shrink-0" />} />
                <QuickAction href="/invoices/new" label="New Invoice" icon={<FileText className="h-5 w-5 shrink-0" />} />
              </div>
            </div>
          </div>
        </section>

        {(loadingActivationChecklist || activationChecklist.completed < activationChecklist.total) ? (
          <section className="rounded-[26px] border border-border/70 bg-card px-4 py-4 shadow-sm sm:rounded-[28px] sm:px-5 sm:py-6">
            {loadingActivationChecklist ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-8 w-72" />
                  <Skeleton className="h-4 w-full max-w-2xl" />
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-28 rounded-2xl" />
                  ))}
                </div>
              </div>
            ) : (
              <ActivationChecklistCard
                completed={activationChecklist.completed}
                total={activationChecklist.total}
                percent={activationChecklist.percent}
                items={activationChecklist.items}
                todayAppointments={todayAppointments.length}
                activeJobs={activeJobs.length}
                unpaidRevenue={unpaidRevenue}
                pendingApprovalsCount={pendingApprovalsCount}
                staleFollowUps={staleQuoteFollowUps.length + staleInvoiceCollections.length}
                depositCount={depositsAwaitingPayment.length}
                nextUpcomingAppointment={upcomingAppointments[0] ?? null}
                recentClientCount={recentClients.length}
                hasDefaultTaxRate={Number(activationBusiness?.defaultTaxRate ?? 0) > 0}
                scheduleJobHref={scheduleJobHref}
              />
            )}
          </section>
        ) : null}

        <DailyOperationsCard
          activationChecklist={activationChecklist}
          todayAppointments={todayAppointments.length}
          nextUpcomingAppointment={upcomingAppointments[0] ?? null}
          activeJobs={activeJobs.length}
          unpaidRevenue={unpaidRevenue}
          pendingApprovalsCount={pendingApprovalsCount}
          staleFollowUps={staleQuoteFollowUps.length + staleInvoiceCollections.length}
          depositCount={depositsAwaitingPayment.length}
          todayScheduleHref={todayScheduleHref}
        />

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

        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            href="/appointments"
            label="Revenue Today"
            value={formatCurrency(todayBookedValue)}
            detail={
              todayAppointments.length > 0
                ? `${todayAppointments.length} appointment${todayAppointments.length === 1 ? "" : "s"} on the board`
                : "No appointments booked yet"
            }
            icon={<DollarSign className="h-5 w-5" />}
          />
          <MetricCard
            href="/invoices"
            label="Open Invoices"
            value={formatCurrency(unpaidRevenue)}
            detail={
              unpaidInvoices.length > 0
                ? `${unpaidInvoices.length} invoice${unpaidInvoices.length === 1 ? "" : "s"} awaiting payment`
                : "Nothing outstanding right now"
            }
            icon={<FileText className="h-5 w-5" />}
          />
          <MetricCard
            href="/appointments"
            label="Today's Appointments"
            value={String(todayAppointments.length)}
            detail={
              todayAppointments.length > 0
                ? `${assignedTodayAppointments.length}/${todayAppointments.length} assigned`
                : "No schedule pressure yet"
            }
            icon={<CalendarPlus className="h-5 w-5" />}
          />
          <MetricCard
            href={pendingApprovalsCount > 0 ? "/quotes" : "/appointments"}
            label="Pending Actions"
            value={String(pendingApprovalsCount)}
            detail={
              pendingApprovalsCount > 0
                ? `${pendingQuotes.length} quote${pendingQuotes.length === 1 ? "" : "s"} and ${
                    staleQuoteFollowUps.length + staleInvoiceCollections.length + depositsAwaitingPayment.length
                  } follow-up${staleQuoteFollowUps.length + staleInvoiceCollections.length + depositsAwaitingPayment.length === 1 ? "" : "s"}`
                : "Nothing urgent is waiting"
            }
            icon={<ShieldAlert className="h-5 w-5" />}
          />
        </div>

        <div className="grid min-w-0 max-w-full gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
          <DashboardSection
            title="Today's Schedule"
            seeAllHref="/appointments"
            seeAllLabel="All appointments"
            error={apptsError}
            isLoading={loadingAppts}
            isEmpty={!loadingAppts && !apptsError && todayAppointments.length === 0}
            emptyMessage="Nothing is booked for today yet."
            emptyCta={{ href: scheduleJobHref, label: "New appointment" }}
            skeletonRows={4}
          >
            <ul className="overflow-hidden rounded-2xl border divide-y divide-border bg-card">
              {todayAppointments.map((appointment) => (
                <li key={appointment.id}>
                  <Link
                    to={`/appointments/${appointment.id}`}
                    className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/70"
                  >
                    <div className="w-[74px] shrink-0">
                      <p className="font-mono text-sm font-medium text-foreground">{formatSafe(appointment.startTime, "h:mm a")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {appointment.assignedStaff?.firstName
                          ? `${appointment.assignedStaff.firstName} ${appointment.assignedStaff.lastName ?? ""}`.trim()
                          : "Unassigned"}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium">
                        {appointment.client
                          ? `${appointment.client.firstName ?? ""} ${appointment.client.lastName ?? ""}`.trim()
                          : appointment.title ?? "Internal block"}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {appointment.vehicle
                          ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
                          : "No vehicle attached"}
                      </p>
                    </div>
                    <div
                      className="hidden items-center gap-2 md:flex"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      {myStaffRecord && !appointment.assignedStaff?.id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs"
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
                          className="h-8 px-2 text-xs"
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
                          className="h-8 px-2 text-xs"
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
                          className="h-8 px-2 text-xs"
                          disabled={updatingAppointmentId !== null}
                          onClick={(event) =>
                            void handleQuickAppointmentStatus(event, appointment.id, "completed", "Appointment completed")
                          }
                        >
                          Complete
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge status={appointment.status ?? "scheduled"} type="appointment" />
                      {appointment.totalPrice ? (
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {formatCurrency(appointment.totalPrice)}
                        </span>
                      ) : null}
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </DashboardSection>

          <div className="min-w-0 max-w-full space-y-5">
            <DashboardSection
              title="Priority Actions"
              seeAllHref={priorityActions[0]?.href ?? "/appointments"}
              seeAllLabel="Open queue"
              error={null}
              isLoading={false}
              isEmpty={priorityActions.length === 0}
              emptyMessage="Nothing urgent is waiting right now."
              emptyCta={{ href: scheduleJobHref, label: "New appointment" }}
              skeletonRows={2}
            >
              <div className="space-y-3">
                {priorityActions.map((action) => (
                  <Link
                    key={action.key}
                    to={action.href}
                    className={cn(
                      "block rounded-2xl border px-4 py-4 transition-colors hover:bg-muted/30",
                      action.tone === "urgent"
                        ? "border-red-200 bg-red-50/70"
                        : "border-amber-200 bg-amber-50/70"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{action.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{action.detail}</p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                          action.tone === "urgent"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {action.tone === "urgent" ? "Urgent" : "Needs attention"}
                      </span>
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-orange-700">
                      {action.cta}
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </Link>
                ))}
              </div>
            </DashboardSection>

            <DashboardSection
              title="Active Jobs In Progress"
              seeAllHref="/jobs"
              seeAllLabel="All jobs"
              error={jobsError}
              isLoading={loadingJobs}
              isEmpty={!loadingJobs && !jobsError && activeJobs.length === 0}
              emptyMessage="No active jobs need attention right now."
              emptyCta={{ href: scheduleJobHref, label: "Open schedule" }}
              skeletonRows={3}
              mobileCollapsed
            >
              <ul className="max-w-full overflow-hidden rounded-2xl border divide-y divide-border bg-card">
                {activeJobs.slice(0, 5).map((job) => (
                  <li key={job.id}>
                    <Link
                      to={`/jobs/${job.id}`}
                      className="flex min-h-[68px] min-w-0 max-w-full items-center gap-3 overflow-hidden px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/70"
                    >
                      <div className="w-[72px] shrink-0 overflow-hidden">
                        <p className="font-mono text-sm font-medium text-foreground">{formatSafe(job.scheduledStart, "h:mm a")}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {job.assignedStaff
                            ? `${job.assignedStaff.firstName ?? ""} ${job.assignedStaff.lastName ?? ""}`.trim() || "Assigned"
                            : "Unassigned"}
                        </p>
                      </div>
                      <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                        <p className="max-w-full truncate text-base font-medium">
                          {job.title?.trim() ||
                            (job.client
                              ? `${job.client.firstName ?? ""} ${job.client.lastName ?? ""}`.trim()
                              : "Job")}
                        </p>
                        <p className="max-w-full truncate text-sm text-muted-foreground">
                          {job.vehicle
                            ? [job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ")
                            : "No vehicle on file"}
                        </p>
                      </div>
                      <div
                        className="hidden items-center gap-2 md:flex"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        {myStaffRecord && !job.assignedStaff?.id ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            disabled={updatingJobId !== null}
                            onClick={(event) =>
                              void handleQuickJobUpdate(event, job.id, { assignedStaffId: myStaffRecord.id }, "Job assigned to you")
                            }
                          >
                            Assign
                          </Button>
                        ) : null}
                        {["scheduled", "confirmed"].includes(job.status ?? "") ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-xs"
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
                            className="h-8 px-2 text-xs"
                            disabled={updatingJobId !== null}
                            onClick={(event) =>
                              void handleQuickJobUpdate(event, job.id, { status: "completed" }, "Job completed")
                            }
                          >
                            Complete
                          </Button>
                        ) : null}
                      </div>
                      <div className="flex max-w-[7.5rem] shrink-0 flex-col items-end gap-2 overflow-hidden">
                        <div className="max-w-full overflow-hidden">
                          <StatusBadge status={job.status ?? "scheduled"} type="job" />
                        </div>
                        {job.totalPrice ? (
                          <span className="max-w-full truncate text-sm font-semibold tabular-nums text-foreground">
                            {formatCurrency(job.totalPrice)}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </DashboardSection>

            <DashboardSection
              title="Quotes Awaiting Approval"
              seeAllHref="/quotes"
              seeAllLabel="All quotes"
              error={quotesError}
              isLoading={loadingQuotes}
              isEmpty={!loadingQuotes && !quotesError && pendingQuotes.length === 0}
              emptyMessage="No quotes are waiting on client approval."
              emptyCta={{ href: "/quotes/new", label: "New quote" }}
              skeletonRows={3}
              mobileCollapsed
            >
              <ul className="overflow-hidden rounded-2xl border divide-y divide-border bg-card">
                {pendingQuotes.slice(0, 5).map((quote) => (
                  <li key={quote.id}>
                    <Link
                      to={`/quotes/${quote.id}`}
                      className="flex min-h-[68px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/70"
                    >
                      <Receipt className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {quote.client
                            ? `${quote.client.firstName ?? ""} ${quote.client.lastName ?? ""}`.trim() || "Quote"
                            : `Quote ${String(quote.id).slice(0, 8)}...`}
                        </p>
                        <p className="text-sm capitalize text-muted-foreground">{String(quote.status ?? "-")}</p>
                        {(quote.sentAt || quote.followUpSentAt) ? (
                          <p className="text-xs text-muted-foreground">
                            {[formatFreshness(quote.sentAt ?? null, "Sent"), formatFreshness(quote.followUpSentAt ?? null, "Followed up")]
                              .filter(Boolean)
                              .join(" ? ")}
                          </p>
                        ) : null}
                      </div>
                      <div
                        className="hidden items-center gap-2 md:flex"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        {["draft", "sent"].includes(String(quote.status ?? "")) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
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
                            className="h-8 px-2 text-xs"
                            disabled={followingUpQuoteId !== null}
                            onClick={(event) => void handleSendFollowUp(event, quote.id)}
                          >
                            {followingUpQuoteId === quote.id ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                            Follow up
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
              title="Deposits Awaiting Payment"
              seeAllHref="/appointments"
              seeAllLabel="All appointments"
              error={apptsError}
              isLoading={loadingAppts}
              isEmpty={!loadingAppts && !apptsError && depositsAwaitingPayment.length === 0}
              emptyMessage="No deposits are waiting on today's board."
              emptyCta={{ href: scheduleJobHref, label: "Open schedule" }}
              skeletonRows={2}
              mobileCollapsed
            >
              <div className="space-y-3">
                <div className="rounded-2xl border bg-card px-4 py-4">
                  <p className="text-sm font-medium text-muted-foreground">Deposit value still due</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{formatCurrency(depositDueValue)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {depositsAwaitingPayment.length} appointment{depositsAwaitingPayment.length === 1 ? "" : "s"} waiting on deposit
                  </p>
                </div>
                <ul className="overflow-hidden rounded-2xl border divide-y divide-border bg-card">
                  {depositsAwaitingPayment.map((appointment) => (
                    <li key={appointment.id}>
                      <Link
                        to={`/appointments/${appointment.id}`}
                        className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/70"
                      >
                        <div className="w-[72px] shrink-0 font-mono text-sm text-muted-foreground">
                          {formatSafe(appointment.startTime, "h:mm a")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {appointment.client
                              ? `${appointment.client.firstName ?? ""} ${appointment.client.lastName ?? ""}`.trim()
                              : appointment.title ?? "Appointment"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Deposit due {formatCurrency(appointment.depositAmount)}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </DashboardSection>

            <DashboardSection
              title="Upcoming Work"
              seeAllHref="/appointments"
              seeAllLabel="Full calendar"
              error={upcomingAppointmentsError}
              isLoading={fetchingUpcomingAppointments && upcomingAppointmentsRaw === undefined}
              isEmpty={
                !(fetchingUpcomingAppointments && upcomingAppointmentsRaw === undefined) &&
                !upcomingAppointmentsError &&
                upcomingAppointments.length === 0
              }
              emptyMessage="No upcoming work is scheduled after today."
              emptyCta={{ href: scheduleJobHref, label: "Book next job" }}
              skeletonRows={3}
              mobileCollapsed
            >
              <ul className="overflow-hidden rounded-2xl border divide-y divide-border bg-card">
                {upcomingAppointments.slice(0, 5).map((appointment) => (
                  <li key={appointment.id}>
                    <Link
                      to={`/appointments/${appointment.id}`}
                      className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/70"
                    >
                      <div className="w-[90px] shrink-0">
                        <p className="text-sm font-medium text-foreground">{formatSafe(appointment.startTime, "EEE, MMM d")}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{formatSafe(appointment.startTime, "h:mm a")}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {appointment.client
                            ? `${appointment.client.firstName ?? ""} ${appointment.client.lastName ?? ""}`.trim()
                            : appointment.title ?? "Appointment"}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {appointment.vehicle
                            ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
                            : "No vehicle on file"}
                        </p>
                      </div>
                      <StatusBadge status={appointment.status ?? "scheduled"} type="appointment" />
                    </Link>
                  </li>
                ))}
              </ul>
            </DashboardSection>
          </div>
        </div>

        <div className={cn("grid gap-5", showTeamAssignments ? "xl:grid-cols-3" : "xl:grid-cols-2")}>
          <DashboardSection
            title="Recent Clients"
            seeAllHref="/clients"
            seeAllLabel="All clients"
            error={recentClientsError}
            isLoading={fetchingRecentClients && recentClientsRaw === undefined}
            isEmpty={
              !(fetchingRecentClients && recentClientsRaw === undefined) &&
              !recentClientsError &&
              recentClients.length === 0
            }
            emptyMessage="No clients have been added yet."
            emptyCta={{ href: "/clients/new", label: "Add client" }}
            skeletonRows={3}
            mobileCollapsed
          >
            <ul className="overflow-hidden rounded-2xl border divide-y divide-border bg-card">
              {recentClients.map((client) => (
                <li key={client.id}>
                  <Link
                    to={`/clients/${client.id}`}
                    className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/70"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {`${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "Client"}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {client.phone?.trim() || client.email?.trim() || "Recently added"}
                      </p>
                    </div>
                    <div className="hidden text-right text-xs text-muted-foreground sm:block">
                      {formatSafe(client.createdAt ?? null, "MMM d")}
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </DashboardSection>

          <ActivityFeedCard title="Recent Activity" records={activityRecords} fetching={loadingActivity} />

          <DashboardSection
            title="Follow-Ups Due"
            seeAllHref={staleInvoiceCollections.length > 0 ? "/invoices?tab=stale" : "/quotes?tab=followup"}
            seeAllLabel="Work queue"
            error={quotesError ?? invoicesError}
            isLoading={loadingQuotes || loadingInvoices}
            isEmpty={
              !loadingQuotes &&
              !loadingInvoices &&
              !quotesError &&
              !invoicesError &&
              staleQuoteFollowUps.length === 0 &&
              staleInvoiceCollections.length === 0
            }
            emptyMessage="No follow-ups are overdue right now."
            emptyCta={{ href: "/quotes", label: "Open quotes" }}
            skeletonRows={3}
            mobileCollapsed
          >
            <ul className="overflow-hidden rounded-2xl border divide-y divide-border bg-card">
              {staleQuoteFollowUps.map((quote) => (
                <li key={`quote-${quote.id}`}>
                  <Link
                    to={`/quotes/${quote.id}`}
                    className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/70"
                  >
                    <Receipt className="h-5 w-5 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {quote.client
                          ? `${quote.client.firstName ?? ""} ${quote.client.lastName ?? ""}`.trim() || "Quote follow-up"
                          : "Quote follow-up"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatFreshness(quote.followUpSentAt ?? quote.sentAt ?? null, "Last touched") ?? "Needs follow-up"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={followingUpQuoteId !== null}
                      onClick={(event) => void handleSendFollowUp(event, quote.id)}
                    >
                      Follow up
                    </Button>
                  </Link>
                </li>
              ))}
              {staleInvoiceCollections.map((invoice) => (
                <li key={`invoice-${invoice.id}`}>
                  <Link
                    to={`/invoices/${invoice.id}`}
                    className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 active:bg-muted/70"
                  >
                    <DollarSign className="h-5 w-5 shrink-0 text-red-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {invoice.invoiceNumber ?? `Invoice ${String(invoice.id).slice(0, 8)}...`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatFreshness(invoice.lastSentAt ?? null, "Sent") ?? "Needs collection follow-up"}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatCurrency(invoiceBalance(invoice))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </DashboardSection>

          {showTeamAssignments ? (
            <DashboardSection
              title="Technician Assignments"
              seeAllHref="/settings"
              seeAllLabel="Team"
              error={staffError}
              isLoading={loadingStaff || loadingJobs || loadingAppts}
              isEmpty={!loadingStaff && !loadingJobs && !loadingAppts && teamLoad.length === 0}
              emptyMessage="No technician assignments are active yet."
              emptyCta={{ href: "/settings", label: "Set up team" }}
              skeletonRows={3}
              mobileCollapsed
            >
              <ul className="overflow-hidden rounded-2xl border divide-y divide-border bg-card">
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
                            {entry.activeJobs} active job{entry.activeJobs === 1 ? "" : "s"} • {entry.todayAppointments} on today's board
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
          ) : null}
        </div>
      </div>

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
  mobileCollapsed = false,
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
  mobileCollapsed?: boolean;
  children: ReactNode;
}) {
  const [isCompactMobile, setIsCompactMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(mobileCollapsed);

  useEffect(() => {
    const sync = () => {
      const mobile = window.innerWidth < 768;
      setIsCompactMobile(mobile);
      setCollapsed(mobile ? mobileCollapsed : false);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [mobileCollapsed]);

  return (
    <section className="min-w-0 max-w-full space-y-3">
      <div className="flex min-w-0 max-w-full flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
          {isCompactMobile ? (
            <button
              type="button"
              className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm transition-colors hover:bg-muted/60"
              aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
              onClick={() => setCollapsed((current) => !current)}
            >
              <span>{collapsed ? "Show" : "Hide"}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed ? "-rotate-90" : "rotate-0")} />
            </button>
          ) : null}
        </div>
        <Link
          to={seeAllHref}
          className="inline-flex min-h-[40px] min-w-0 items-center py-1 text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          {seeAllLabel}
        </Link>
      </div>
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="w-full rounded-2xl border border-dashed border-border/80 bg-muted/10 px-4 py-3 text-left transition-colors hover:bg-muted/20"
        >
          <span className="block text-sm font-medium text-foreground">{title}</span>
          <span className="mt-1 block text-sm text-muted-foreground">Tap to open this section.</span>
        </button>
        
      ) : null}
      {!collapsed && error ? (
        <div className="flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>{sectionErrorMessage(error)}</p>
        </div>
      ) : !collapsed && isLoading ? (
        <ListSkeleton rows={skeletonRows} />
      ) : !collapsed && isEmpty ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">{emptyMessage}</p>
          <Button asChild size="lg" className="min-h-[48px] rounded-xl">
            <Link to={emptyCta.href}>{emptyCta.label}</Link>
          </Button>
        </div>
      ) : !collapsed ? (
        children
      ) : null}
    </section>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 divide-y divide-border bg-card" aria-busy="true" aria-label="Loading">
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
  href,
  label,
  value,
  detail,
  icon,
  compactValue = false,
}: {
  href?: string;
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  compactValue?: boolean;
}) {
  const content = (
    <div className="h-full rounded-[22px] border border-border/70 bg-card p-4 shadow-sm sm:rounded-[24px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-muted-foreground">{label}</p>
        <div className="text-orange-600">{icon}</div>
      </div>
      <p className={cn("text-slate-950 font-semibold tracking-tight", compactValue ? "text-lg" : "text-2xl")}>{value}</p>
      <p className="mt-1 min-h-[2.5rem] text-sm leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
  return href ? (
    <Link to={href} className="block transition-transform hover:-translate-y-0.5">
      {content}
    </Link>
  ) : (
    content
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
        "flex min-h-[52px] items-center justify-start gap-2 rounded-2xl px-4 text-left font-semibold shadow-sm transition-transform active:scale-[0.98] sm:justify-center sm:text-center",
        primary
          ? "bg-orange-500 text-sm text-white shadow-sm hover:bg-orange-600 sm:text-base"
          : "border border-border/70 bg-card text-sm hover:bg-muted/80 sm:text-base"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function ActivationChecklistCard({
  completed,
  total,
  percent,
  items,
  todayAppointments,
  activeJobs,
  unpaidRevenue,
  pendingApprovalsCount,
  staleFollowUps,
  depositCount,
  nextUpcomingAppointment,
  recentClientCount,
  hasDefaultTaxRate,
  scheduleJobHref,
}: {
  completed: number;
  total: number;
  percent: number;
  items: Array<{
    key: string;
    label: string;
    detail: string;
    done: boolean;
    href: string;
    actionLabel: string;
    icon: ReactNode;
  }>;
  todayAppointments: number;
  activeJobs: number;
  unpaidRevenue: number;
  pendingApprovalsCount: number;
  staleFollowUps: number;
  depositCount: number;
  nextUpcomingAppointment: AppointmentRecord | null;
  recentClientCount: number;
  hasDefaultTaxRate: boolean;
  scheduleJobHref: string;
}) {
  const allDone = completed === total;
  const nextItem = items.find((item) => !item.done) ?? items[0];
  const openItems = items.filter((item) => !item.done);
  const quickWinOutcome =
    nextItem?.key === "clients"
      ? "Once this is done, you can book work and keep customer history in one place."
      : nextItem?.key === "vehicles"
        ? "Once this is done, appointments, quotes, and invoices will stay tied to the right vehicle."
        : nextItem?.key === "services"
          ? "Once this is done, quotes and appointments can be created without manual setup friction."
          : nextItem?.key === "appointments"
            ? "Once this is done, today’s dashboard and schedule start feeling like a real operating system."
            : nextItem?.key === "invoices"
              ? "Once this is done, Strata starts carrying real money workflow, not just organization."
              : "Once this is done, you can take bookings without second-guessing your setup.";
  const businessPulse = [
    {
      label: "Booked today",
      value: todayAppointments > 0 ? String(todayAppointments) : "Open",
      detail: todayAppointments > 0 ? "Appointments are already on the board." : "No work is booked yet today.",
      href: "/appointments",
      actionLabel: "Open calendar",
    },
    {
      label: "Money queue",
      value: unpaidRevenue > 0 ? formatCurrency(unpaidRevenue) : "Clear",
      detail:
        pendingApprovalsCount > 0
          ? `${pendingApprovalsCount} billing or approval action${pendingApprovalsCount === 1 ? "" : "s"} need attention.`
          : "Quotes and invoices look under control right now.",
      href: pendingApprovalsCount > 0 ? "/quotes" : "/invoices",
      actionLabel: pendingApprovalsCount > 0 ? "Review queue" : "Open invoices",
    },
    {
      label: "Next slot",
      value: nextUpcomingAppointment ? formatSafe(nextUpcomingAppointment.startTime, "EEE h:mm a") : "Unbooked",
      detail: nextUpcomingAppointment
        ? "Next appointment currently on the schedule."
        : "No upcoming appointment is loaded yet.",
      href: "/appointments",
      actionLabel: "Open schedule",
    },
  ];
  const optimizationPrompts = [
    todayAppointments === 0
      ? {
          title: "Fill today's board",
          detail: "There are no appointments on the schedule yet. Push one real job onto the calendar so the day has a clear operating plan.",
          href: scheduleJobHref,
          actionLabel: "Book appointment",
        }
      : null,
    pendingApprovalsCount > 0
      ? {
          title: "Clear the money queue",
          detail: `${pendingApprovalsCount} quote, invoice, or deposit action${pendingApprovalsCount === 1 ? "" : "s"} still need follow-up.`,
          href: pendingApprovalsCount > 0 ? "/quotes" : "/invoices",
          actionLabel: "Review billing",
        }
      : null,
    staleFollowUps > 0
      ? {
          title: "Follow up stale work",
          detail: `${staleFollowUps} quote or invoice follow-up${staleFollowUps === 1 ? "" : "s"} have gone stale and should be nudged.`,
          href: "/quotes?tab=followup",
          actionLabel: "Run follow-ups",
        }
      : null,
    depositCount > 0
      ? {
          title: "Collect pending deposits",
          detail: `${depositCount} appointment${depositCount === 1 ? "" : "s"} still need deposit collection before the work starts.`,
          href: "/appointments",
          actionLabel: "Review deposits",
        }
      : null,
    activeJobs === 0
      ? {
          title: "Create live work",
          detail: "Nothing is currently marked active. Move a job forward so the dashboard reflects real workload instead of setup only.",
          href: "/jobs",
          actionLabel: "Open jobs",
        }
      : null,
    recentClientCount < 3
      ? {
          title: "Strengthen lead coverage",
          detail: "The client base is still thin. Add a few more qualified leads so the CRM, schedule, and billing records reflect real operating volume.",
          href: "/leads",
          actionLabel: "Open leads",
        }
      : null,
    !hasDefaultTaxRate
      ? {
          title: "Tighten billing defaults",
          detail: "Default tax rate still looks unset. Lock that in so quotes and invoices stay consistent without manual correction.",
          href: "/settings",
          actionLabel: "Open settings",
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    detail: string;
    href: string;
    actionLabel: string;
  }>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">System readiness</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {allDone ? "Operational controls are online" : "Finish core setup so the system can run real work"}
          </h2>
        </div>
        <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 lg:min-w-[220px]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">Progress</p>
            <p className="text-lg font-semibold">{completed}/{total}</p>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-orange-500 transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {!allDone && nextItem ? (
        <div className="rounded-[1.6rem] border border-orange-200/70 bg-[linear-gradient(135deg,rgba(255,247,237,0.98),rgba(255,255,255,0.96))] p-4 shadow-[0_18px_50px_rgba(249,115,22,0.12)] sm:rounded-[1.75rem] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Required next action</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                {nextItem.label}
              </h3>
              <p className="mt-2 text-sm font-medium text-slate-800">{quickWinOutcome}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button asChild className="min-h-[46px] rounded-xl bg-orange-500 px-5 text-white hover:bg-orange-600">
                <Link to={nextItem.href}>{nextItem.actionLabel}</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-[46px] rounded-xl">
                <Link to="/onboarding">Review setup</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-[1.6rem] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.98))] p-4 shadow-[0_18px_50px_rgba(16,185,129,0.12)] sm:rounded-[1.75rem] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Control center</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                This is the operating summary for the business.
              </h3>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button asChild className="min-h-[46px] rounded-xl bg-orange-500 px-5 text-white hover:bg-orange-600">
                <Link to="/leads">Open leads</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-[46px] rounded-xl">
                <Link to={scheduleJobHref}>New appointment</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-[46px] rounded-xl">
                <Link to="/quotes/new">Create quote</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {businessPulse.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{item.value}</p>
                  <p className="mt-1 min-h-[2.5rem] text-sm leading-5 text-slate-600">{item.detail}</p>
                  <Button asChild variant="ghost" className="mt-3 h-auto px-0 text-sm font-semibold text-slate-900 hover:bg-transparent hover:text-slate-700">
                    <Link to={item.href}>{item.actionLabel}</Link>
                  </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {optimizationPrompts.length > 0 ? (
              optimizationPrompts.slice(0, 4).map((prompt) => (
                <div key={prompt.title} className="rounded-2xl border border-border/70 bg-white/70 p-4">
                  <p className="text-sm font-semibold text-slate-950">{prompt.title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{prompt.detail}</p>
                  <Button asChild variant="outline" className="mt-3 rounded-xl">
                    <Link to={prompt.href}>{prompt.actionLabel}</Link>
                  </Button>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-border/70 bg-white/70 p-4 xl:col-span-2">
                <p className="text-sm font-semibold text-slate-950">No immediate operating exceptions are visible.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {openItems.map((item) => (
          <div
            key={item.key}
            className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Circle className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{item.label}</p>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <Button asChild className="min-h-[44px] w-full rounded-xl">
                <Link to={item.href}>{item.actionLabel}</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyOperationsCard({
  activationChecklist,
  todayAppointments,
  nextUpcomingAppointment,
  activeJobs,
  unpaidRevenue,
  pendingApprovalsCount,
  staleFollowUps,
  depositCount,
  todayScheduleHref,
}: {
  activationChecklist: {
    completed: number;
    total: number;
    items: Array<{
      key: string;
      label: string;
      detail: string;
      done: boolean;
      href: string;
      actionLabel: string;
    }>;
  };
  todayAppointments: number;
  nextUpcomingAppointment: AppointmentRecord | null;
  activeJobs: number;
  unpaidRevenue: number;
  pendingApprovalsCount: number;
  staleFollowUps: number;
  depositCount: number;
  todayScheduleHref: string;
}) {
  const isOperational = activationChecklist.completed >= 4;
  const nextSteps = activationChecklist.items.filter((item) => !item.done).slice(0, 3);

  return (
    <section className="rounded-[26px] border border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] px-4 py-4 shadow-sm sm:rounded-[28px] sm:px-5 sm:py-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {isOperational ? "Operations overview" : "Core system setup"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {isOperational ? "Use this as the shop command surface" : "Finish the records that make the system dependable"}
          </h2>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button asChild className="min-h-[46px] rounded-xl bg-slate-950 text-white hover:bg-slate-800">
            <Link to={todayScheduleHref}>Open today's schedule</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-[46px] rounded-xl">
            <Link to={pendingApprovalsCount > 0 || staleFollowUps > 0 ? "/quotes?tab=followup" : "/invoices?tab=stale"}>
              Open money queue
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {isOperational ? (
          <>
            <OperatingLane
              title="Schedule"
              value={todayAppointments > 0 ? `${todayAppointments} today` : "Nothing today yet"}
              detail={
                nextUpcomingAppointment
                  ? `Next up ${formatSafe(nextUpcomingAppointment.startTime, "EEE h:mm a")}`
                  : "Book the next job to keep the calendar moving."
              }
              href="/appointments"
              actionLabel="Open appointments"
            />
            <OperatingLane
              title="Work & handoffs"
              value={activeJobs > 0 ? `${activeJobs} active job${activeJobs === 1 ? "" : "s"}` : "No live work"}
              detail={
                depositCount > 0
                  ? `${depositCount} deposit${depositCount === 1 ? "" : "s"} still need attention.`
                  : "Keep status, notes, and handoffs current so the team stays aligned."
              }
              href="/jobs"
              actionLabel="Open jobs"
            />
            <OperatingLane
              title="Money & follow-up"
              value={unpaidRevenue > 0 ? formatCurrency(unpaidRevenue) : "Nothing outstanding"}
              detail={
                pendingApprovalsCount > 0 || staleFollowUps > 0
                  ? `${pendingApprovalsCount} pending action${pendingApprovalsCount === 1 ? "" : "s"} and ${staleFollowUps} follow-up${staleFollowUps === 1 ? "" : "s"} need attention.`
                  : "Quotes, invoices, and reminders are under control right now."
              }
              href={pendingApprovalsCount > 0 ? "/quotes" : "/invoices"}
              actionLabel="Open billing"
            />
          </>
        ) : (
          nextSteps.map((step) => (
            <OperatingLane
              key={step.key}
              title={step.label}
              value="Required setup"
              detail={step.detail}
              href={step.href}
              actionLabel={step.actionLabel}
            />
          ))
        )}
      </div>
    </section>
  );
}

function OperatingLane({
  title,
  value,
  detail,
  href,
  actionLabel,
}: {
  title: string;
  value: string;
  detail: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-white/85 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-sm leading-5 text-slate-600">{detail}</p>
      <Button asChild variant="ghost" className="mt-3 h-auto px-0 text-sm font-semibold text-slate-900 hover:bg-transparent hover:text-slate-700">
        <Link to={href}>{actionLabel}</Link>
      </Button>
    </div>
  );
}

function ShopTypePlaybookCard({
  businessName,
  defaults,
  activationChecklist,
}: {
  businessName: string | null;
  defaults: {
    label: string;
    starterCount: number;
    defaultDays: string;
    defaultOpen: string;
    defaultClose: string;
    bookingSettingsLabel: string;
    estimateTemplateSummary: string;
    invoiceTemplateSummary: string;
    sampleServices: string[];
  };
  activationChecklist: {
    completed: number;
    total: number;
  };
}) {
  void businessName;
  void defaults;
  void activationChecklist;
  return null;
}

export { RouteErrorBoundary as ErrorBoundary };

