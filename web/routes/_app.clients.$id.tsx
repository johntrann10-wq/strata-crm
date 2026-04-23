import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarPlus,
  Car,
  ClipboardList,
  Clock3,
  FileText,
  Loader2,
  Mail,
  MapPin,
  MessageSquareMore,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Receipt,
} from "lucide-react";
import { api } from "../api";
import { useAction, useFindMany, useFindOne } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "../components/shared/PageHeader";
import { CommunicationCard } from "../components/shared/CommunicationCard";
import { RelatedRecordsPanel } from "../components/shared/RelatedRecordsPanel";
import { usePageContext } from "../components/shared/CommandPaletteContext";
import { AppointmentHistoryCard, ClientEditForm, type FormState, VehiclesCard } from "../components/ClientDetailCards";
import { getDisplayedAppointmentAmount } from "@/lib/appointmentAmounts";

const blank: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  notes: "",
  internalNotes: "",
  marketingOptIn: true,
};

const toForm = (c: Record<string, unknown>): FormState => ({
  firstName: (c.firstName as string) ?? "",
  lastName: (c.lastName as string) ?? "",
  email: (c.email as string) ?? "",
  phone: (c.phone as string) ?? "",
  address: (c.address as string) ?? "",
  city: (c.city as string) ?? "",
  state: (c.state as string) ?? "",
  zip: (c.zip as string) ?? "",
  notes: (c.notes as string) ?? "",
  internalNotes: (c.internalNotes as string) ?? "",
  marketingOptIn: Boolean(c.marketingOptIn ?? true),
});

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCurrency(amount: number | string | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatFreshness(value: string | null | undefined, label: string): string | null {
  const parsed = safeDate(value);
  return parsed ? `${label} ${parsed.toLocaleDateString()}` : null;
}

function invoiceBalance(invoice: Record<string, unknown>): number {
  const raw =
    invoice.remainingBalance != null && invoice.remainingBalance !== ""
      ? Number(invoice.remainingBalance)
      : Number(invoice.total ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

function statusPillClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "paid") return "bg-emerald-100 text-emerald-800";
  if (normalized === "sent" || normalized === "confirmed") return "bg-sky-100 text-sky-800";
  if (normalized === "in_progress" || normalized === "partial") return "bg-amber-100 text-amber-800";
  if (normalized === "cancelled" || normalized === "void" || normalized === "no-show") return "bg-rose-100 text-rose-800";
  return "bg-muted text-muted-foreground";
}

function eventDateValue(record: Record<string, unknown>): number {
  const source =
    (record.startTime as string | undefined | null) ??
    (record.scheduledStart as string | undefined | null) ??
    (record.createdAt as string | undefined | null) ??
    null;
  const parsed = safeDate(source);
  return parsed?.getTime() ?? 0;
}

function formatTimelineWhen(value: string | null | undefined): string {
  const parsed = safeDate(value);
  if (!parsed) return "No date";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getVehicleDisplayLabel(vehicle: Record<string, unknown> | null | undefined, fallback = "No vehicle on file yet") {
  if (!vehicle) return fallback;
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || fallback;
}

function getClientDisplayState({
  client,
  vehicleList,
  unpaidInvoiceValue,
  openQuoteValue,
  nextAppointment,
}: {
  client: Record<string, any>;
  vehicleList: Array<Record<string, unknown>>;
  unpaidInvoiceValue: number;
  openQuoteValue: number;
  nextAppointment: Record<string, any> | undefined;
}) {
  const clientDisplayName = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Client";
  const clientInitials =
    [client.firstName, client.lastName]
      .filter(Boolean)
      .map((value) => String(value).trim().charAt(0).toUpperCase())
      .join("")
      .slice(0, 2) || "C";
  const primaryVehicleLabel = getVehicleDisplayLabel(vehicleList[0]);
  const clientSinceLabel = safeDate(client.createdAt)?.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const headerMeta = [client.email, client.phone].filter(Boolean).join(" - ") || "Client record";
  const openRevenueLabel =
    unpaidInvoiceValue > 0
      ? `${formatCurrency(unpaidInvoiceValue)} unpaid`
      : openQuoteValue > 0
        ? `${formatCurrency(openQuoteValue)} in quotes`
        : "No open billing";
  const nextStepLabel = nextAppointment
    ? `Next visit ${formatTimelineWhen((nextAppointment.startTime as string | null | undefined) ?? null)}`
    : vehicleList.length === 0
      ? "Add vehicle"
      : "Book or quote";

  return {
    clientDisplayName,
    clientInitials,
    primaryVehicleLabel,
    clientSinceLabel,
    headerMeta,
    openRevenueLabel,
    nextStepLabel,
  };
}

function trimContactValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildPhoneHref(value: string | null | undefined): string | null {
  const trimmed = trimContactValue(value);
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : null;
}

function buildSmsHref(value: string | null | undefined): string | null {
  const trimmed = trimContactValue(value);
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^\d+]/g, "");
  return normalized ? `sms:${normalized}` : null;
}

function buildEmailHref(value: string | null | undefined): string | null {
  const trimmed = trimContactValue(value);
  return trimmed ? `mailto:${trimmed}` : null;
}

function buildMapsHref(parts: Array<string | null | undefined>): string | null {
  const formattedAddress = parts.map(trimContactValue).filter(Boolean).join(", ");
  return formattedAddress ? `https://maps.apple.com/?q=${encodeURIComponent(formattedAddress)}` : null;
}

function buildClientTimeline({
  apptList,
  jobList,
  quoteList,
  invoiceList,
}: {
  apptList: Array<Record<string, any>>;
  jobList: Array<Record<string, any>>;
  quoteList: Array<Record<string, any>>;
  invoiceList: Array<Record<string, any>>;
}) {
  return [
    ...apptList.map((appointment) => ({
      id: `appointment-${appointment.id}`,
      label: appointment.title ?? "Appointment",
      detail: appointment.vehicle
        ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
        : "Appointment activity",
      when: appointment.startTime,
      status: appointment.status ?? "scheduled",
      href: `/appointments/${appointment.id}`,
      tone: "appointment" as const,
    })),
    ...jobList.map((job) => ({
      id: `job-${String(job.id)}`,
      label: job.title ?? job.jobNumber ?? "Job",
      detail: job.scheduledStart ? "Job created from scheduled work" : "Workflow job",
      when: job.scheduledStart ?? job.createdAt ?? null,
      status: job.status ?? "scheduled",
      href: `/jobs/${job.id}`,
      tone: "job" as const,
    })),
    ...quoteList.map((quote) => ({
      id: `quote-${String(quote.id)}`,
      label: "Quote",
      detail:
        [formatCurrency(quote.total), formatFreshness(quote.followUpSentAt ?? quote.sentAt ?? null, "Touched")]
          .filter(Boolean)
          .join(" - ") || "Estimate in progress",
      when: quote.followUpSentAt ?? quote.sentAt ?? quote.createdAt ?? null,
      status: quote.status ?? "draft",
      href: `/quotes/${quote.id}`,
      tone: "quote" as const,
    })),
    ...invoiceList.map((invoice) => ({
      id: `invoice-${String(invoice.id)}`,
      label: invoice.invoiceNumber ?? "Invoice",
      detail:
        [formatCurrency(invoiceBalance(invoice)), formatFreshness(invoice.lastPaidAt ?? invoice.lastSentAt ?? null, "Updated")]
          .filter(Boolean)
          .join(" - ") || "Billing record",
      when: invoice.lastPaidAt ?? invoice.lastSentAt ?? invoice.createdAt ?? null,
      status: invoice.status ?? "draft",
      href: `/invoices/${invoice.id}`,
      tone: "invoice" as const,
    })),
  ]
    .sort((a, b) => (safeDate(b.when)?.getTime() ?? 0) - (safeDate(a.when)?.getTime() ?? 0))
    .slice(0, 6);
}

function buildClientRelatedRecords({
  id,
  currentLocationId,
  jobList,
  invoiceList,
  quoteList,
  apptList,
}: {
  id: string | undefined;
  currentLocationId: string | null | undefined;
  jobList: Array<Record<string, any>>;
  invoiceList: Array<Record<string, any>>;
  quoteList: Array<Record<string, any>>;
  apptList: Array<Record<string, any>>;
}) {
  return [
    ...jobList.slice(0, 4).map((job) => ({
      type: "job" as const,
      id: job.id,
      label: job.title ?? job.jobNumber ?? "Job",
      sublabel: job.scheduledStart ? new Date(job.scheduledStart).toLocaleDateString() : undefined,
      status: job.status ?? undefined,
      href: `/jobs/${job.id}`,
      actionHref: String(job.status ?? "") === "completed" ? `/invoices/new?clientId=${id}&appointmentId=${job.id}` : undefined,
      actionLabel: String(job.status ?? "") === "completed" ? "Invoice" : undefined,
    })),
    ...invoiceList.slice(0, 4).map((invoice) => ({
      type: "invoice" as const,
      id: invoice.id,
      label: invoice.invoiceNumber ?? "Invoice",
      sublabel:
        [
          formatCurrency(invoiceBalance(invoice)),
          formatFreshness(invoice.lastSentAt ?? null, "Sent"),
          formatFreshness(invoice.lastPaidAt ?? null, "Paid"),
        ]
          .filter(Boolean)
          .join(" - ") || formatCurrency(invoiceBalance(invoice)),
      status: invoice.status ?? undefined,
      href: `/invoices/${invoice.id}`,
      actionHref: ["sent", "partial"].includes(String(invoice.status ?? "")) ? `/invoices/${invoice.id}` : undefined,
      actionLabel: ["sent", "partial"].includes(String(invoice.status ?? "")) ? "Collect" : undefined,
    })),
    ...quoteList.slice(0, 4).map((quote) => ({
      type: "quote" as const,
      id: quote.id,
      label: "Quote",
      sublabel:
        [
          quote.total != null ? `$${Number(quote.total).toFixed(2)}` : null,
          formatFreshness(quote.sentAt ?? null, "Sent"),
          formatFreshness(quote.followUpSentAt ?? null, "Followed up"),
        ]
          .filter(Boolean)
          .join(" - ") || undefined,
      status: quote.status ?? undefined,
      href: `/quotes/${quote.id}`,
      actionHref:
        String(quote.status ?? "") === "accepted"
          ? `/appointments/new?clientId=${id}${currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""}&quoteId=${quote.id}`
          : undefined,
      actionLabel: String(quote.status ?? "") === "accepted" ? "Book" : undefined,
    })),
    ...apptList.map((appointment) => ({
      type: "appointment" as const,
      id: appointment.id,
      label: appointment.title ?? "Appointment",
      sublabel: appointment.startTime ? new Date(appointment.startTime).toLocaleDateString() : undefined,
      href: `/appointments/${appointment.id}`,
      actionHref:
        String(appointment.status ?? "") === "completed"
          ? `/invoices/new?clientId=${id}&appointmentId=${appointment.id}`
          : `/quotes/new?clientId=${id}`,
      actionLabel: String(appointment.status ?? "") === "completed" ? "Invoice" : "Quote",
    })),
  ];
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const authContext = useOutletContext<AuthOutletContext>();
  const { currentLocationId, permissions } = authContext;
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/clients";
  const currentRecordPath = `${location.pathname}${location.search}`;
  const appointmentHref = `/appointments/new?clientId=${id}${currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""}&from=${encodeURIComponent(currentRecordPath)}`;
  const addVehicleHref = `/clients/${id}/vehicles/new?next=client&from=${encodeURIComponent(currentRecordPath)}`;
  const newInvoiceHref = `/invoices/new?clientId=${id}&from=${encodeURIComponent(currentRecordPath)}`;
  const newQuoteHref = `/quotes/new?clientId=${id}&from=${encodeURIComponent(currentRecordPath)}`;
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blank);
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const { setPageContext } = usePageContext();
  const isNestedVehicleRoute = id ? location.pathname.startsWith(`/clients/${id}/vehicles/`) : false;

  const [{ data: client, fetching, error }, refetch] = useFindOne(api.client, id!, {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      notes: true,
      internalNotes: true,
      marketingOptIn: true,
      createdAt: true,
    },
  });

  const [{ data: vehicles, fetching: vehiclesFetching, error: vehiclesError }] = useFindMany(api.vehicle, {
    filter: { clientId: { equals: id } },
    select: { id: true, make: true, model: true, year: true, color: true, licensePlate: true, mileage: true },
    pause: !id,
  });
  const [{ data: appointments, fetching: appointmentsFetching, error: appointmentsError }] = useFindMany(api.appointment, {
    clientId: id,
    sort: { startTime: "Descending" },
    first: 20,
    select: {
      id: true,
      startTime: true,
      status: true,
      title: true,
      subtotal: true,
      taxRate: true,
      taxAmount: true,
      applyTax: true,
      adminFeeRate: true,
      adminFeeAmount: true,
      applyAdminFee: true,
      totalPrice: true,
      vehicle: { make: true, model: true, year: true },
    },
    pause: !id,
  });
  const [{ data: quotes, fetching: quotesFetching, error: quotesError }] = useFindMany(api.quote, {
    clientId: id,
    sort: { createdAt: "Descending" },
    first: 10,
    pause: !id,
  } as any);
  const [{ data: invoices, fetching: invoicesFetching, error: invoicesError }] = useFindMany(api.invoice, {
    clientId: id,
    sort: { createdAt: "Descending" },
    first: 10,
    pause: !id,
  } as any);
  const [{ data: jobs, fetching: jobsFetching, error: jobsError }] = useFindMany(api.job, {
    clientId: id,
    first: 10,
    pause: !id,
  } as any);
  const [{ data: activityLogs }, refetchActivity] = useFindMany(
    api.activityLog,
    { entityType: "client", entityId: id, first: 10, pause: !id } as any
  );
  const [{ fetching: saving, error: saveError }, runUpdate] = useAction(api.client.update);
  const [{ fetching: deleting }, runDelete] = useAction(api.client.delete);
  const [{ fetching: sendingPortal }, runSendPortal] = useAction(api.client.sendPortal);

  useEffect(() => {
    if (client) setForm(toForm(client));
  }, [client]);

  useEffect(() => {
    setPageContext({
      entityType: "client",
      entityId: id ?? null,
      entityLabel: client ? `${client.firstName} ${client.lastName}` : null,
      clientId: id ?? null,
      clientName: client ? `${client.firstName} ${client.lastName}` : null,
      vehicleId: null,
      vehicleLabel: null,
      appointmentId: null,
      invoiceId: null,
    });
    return () => {
      setPageContext({
        entityType: null,
        entityId: null,
        entityLabel: null,
        clientId: null,
        clientName: null,
        vehicleId: null,
        vehicleLabel: null,
        appointmentId: null,
        invoiceId: null,
      });
    };
  }, [client, id, setPageContext]);

  if (isNestedVehicleRoute) {
    return <Outlet context={authContext} />;
  }

  const handleSave = async () => {
    const result = await runUpdate({ id: id!, ...(form as any) });
    if (result?.error) {
      toast.error("Failed to save changes: " + result.error.message);
      return;
    }
    toast.success("Changes saved");
    refetch();
    setEditMode(false);
  };

  const handleCancel = () => {
    if (client) setForm(toForm(client));
    setEditMode(false);
  };

  const handleConfirmDelete = async () => {
    const result = await runDelete({ id: id! });
    if (result?.error) {
      toast.error(result.error.message);
    } else {
      toast.success("Client archived");
      navigate("/clients");
    }
    setDeleteOpen(false);
  };

  const handleSendPortal = async (payload?: {
    message?: string;
    recipientEmail?: string;
    recipientName?: string;
  }) => {
    if (!id) return;
    const result = await runSendPortal({ id, ...payload });
    if (!result?.error) {
      const deliveryStatus = (result.data as any)?.deliveryStatus;
      if (deliveryStatus === "emailed") {
        toast.success("Customer hub emailed");
      } else {
        toast.warning("Customer hub was recorded, but email was not delivered");
      }
      void refetchActivity();
    } else {
      toast.error(result.error.message ?? "Could not send customer hub");
    }
    return result;
  };

  if (fetching) {
    return (
      <div className="p-6 max-w-6xl mx-auto flex items-center justify-center min-h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Link to="/clients"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Error loading client: {error.message}
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Link to="/clients"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <p className="text-muted-foreground">Client not found.</p>
      </div>
    );
  }

  const apptList = Array.isArray(appointments) ? appointments : [];
  const vehicleList = Array.isArray(vehicles) ? vehicles : [];
  const quoteList = Array.isArray(quotes) ? quotes : [];
  const invoiceList = Array.isArray(invoices) ? invoices : [];
  const jobList = Array.isArray(jobs) ? jobs : [];

  const totalSpend = apptList.reduce((sum, appointment) => sum + getDisplayedAppointmentAmount(appointment as Record<string, unknown>), 0);
  const openQuoteValue = quoteList
    .filter((quote) => ["draft", "sent"].includes(String((quote as any).status ?? "")))
    .reduce((sum, quote) => sum + Number((quote as any).total ?? 0), 0);
  const unpaidInvoiceValue = invoiceList
    .filter((invoice) => ["sent", "partial"].includes(String((invoice as any).status ?? "")))
    .reduce((sum, invoice) => sum + invoiceBalance(invoice as Record<string, unknown>), 0);
  const activeJobsCount = jobList.filter((job) =>
    ["scheduled", "confirmed", "in_progress"].includes(String((job as any).status ?? ""))
  ).length;
  const overdueInvoices = invoiceList.filter((invoice) => {
    const dueDate = safeDate((invoice as any).dueDate ?? null);
    return ["sent", "partial"].includes(String((invoice as any).status ?? "")) && !!dueDate && dueDate.getTime() < Date.now();
  });
  const agingQuotes = quoteList.filter((quote) => {
    const createdAt = safeDate((quote as any).createdAt ?? null);
    return ["draft", "sent"].includes(String((quote as any).status ?? "")) && !!createdAt && Date.now() - createdAt.getTime() >= 3 * 24 * 60 * 60 * 1000;
  });
  const displayedAppointments = showAllAppointments ? apptList : apptList.slice(0, 5);
  const lastAppointmentDate = apptList.length > 0 ? apptList[0].startTime : null;
  const nextAppointment = [...apptList]
    .filter((appointment) => {
      const start = safeDate(appointment.startTime);
      return !!start && start.getTime() >= Date.now();
    })
    .sort((a, b) => {
      const aTime = safeDate(a.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = safeDate(b.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })[0];
  const lastCompletedAppointment = [...apptList]
    .filter((appointment) => {
      const start = safeDate(appointment.startTime);
      return !!start && start.getTime() < Date.now();
    })
    .sort((a, b) => {
      const aTime = safeDate(a.startTime)?.getTime() ?? 0;
      const bTime = safeDate(b.startTime)?.getTime() ?? 0;
      return bTime - aTime;
    })[0];
  const latestInvoice = [...invoiceList].sort((a, b) => eventDateValue(b as Record<string, unknown>) - eventDateValue(a as Record<string, unknown>))[0];
  const latestQuote = [...quoteList].sort((a, b) => eventDateValue(b as Record<string, unknown>) - eventDateValue(a as Record<string, unknown>))[0];
  const {
    clientDisplayName,
    clientInitials,
    primaryVehicleLabel,
    clientSinceLabel,
    headerMeta,
    openRevenueLabel,
    nextStepLabel,
  } = getClientDisplayState({
    client,
    vehicleList: vehicleList as Array<Record<string, unknown>>,
    unpaidInvoiceValue,
    openQuoteValue,
    nextAppointment: nextAppointment as Record<string, any> | undefined,
  });
  const clientTimeline = buildClientTimeline({
    apptList: apptList as Array<Record<string, any>>,
    jobList: jobList as Array<Record<string, any>>,
    quoteList: quoteList as Array<Record<string, any>>,
    invoiceList: invoiceList as Array<Record<string, any>>,
  });

  const relatedRecords = buildClientRelatedRecords({
    id,
    currentLocationId,
    jobList: jobList as Array<Record<string, any>>,
    invoiceList: invoiceList as Array<Record<string, any>>,
    quoteList: quoteList as Array<Record<string, any>>,
    apptList: apptList as Array<Record<string, any>>,
  });
  const clientEmail = trimContactValue(client.email);
  const clientPhone = trimContactValue(client.phone);
  const clientAddress = [client.address, client.city, client.state, client.zip].map(trimContactValue).filter(Boolean).join(", ");
  const clientEmailHref = buildEmailHref(clientEmail);
  const clientPhoneHref = buildPhoneHref(clientPhone);
  const clientSmsHref = buildSmsHref(clientPhone);
  const clientMapsHref = buildMapsHref([client.address, client.city, client.state, client.zip]);

  return (
    <div className="page-content">
      <div className="page-section space-y-6">
        <PageHeader
          backTo={returnTo}
          title={`${client.firstName} ${client.lastName}`}
          subtitle={headerMeta}
          badge={<Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]">Client</Badge>}
          actions={
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link to={addVehicleHref}>
                  <Car className="mr-1.5 h-4 w-4" />
                  Add Vehicle
                </Link>
              </Button>
              <Button asChild variant="default" size="sm" className="w-full sm:w-auto">
                <Link to={appointmentHref}>
                  <CalendarPlus className="mr-1.5 h-4 w-4" />
                  New Appointment
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link to={newInvoiceHref}>
                  <FileText className="mr-1.5 h-4 w-4" />
                  New Invoice
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link to={newQuoteHref}>
                  <Receipt className="mr-1.5 h-4 w-4" />
                  New Quote
                </Link>
              </Button>
              {permissions.has("customers.write") ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More actions" className="col-span-2 justify-self-start sm:justify-self-auto">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setDeleteOpen(true)}
                      disabled={deleting}
                      className="text-destructive focus:text-destructive"
                    >
                      Archive Client
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          }
        />

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive Client?</AlertDialogTitle>
              <AlertDialogDescription>
                This will archive the client record and hide them from your active client list. Their appointment history, vehicles, and invoices are preserved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
              >
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <section className="max-w-full overflow-hidden rounded-[30px] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-5 shadow-[0_22px_55px_rgba(15,23,42,0.08)]">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_360px]">
            <div className="min-w-0 space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-slate-950 text-lg font-semibold tracking-[0.14em] text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
                    {clientInitials}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">{clientDisplayName}</h2>
                      <p className="mt-1 break-words text-sm text-slate-600">
                        {clientSinceLabel ? `Client since ${clientSinceLabel}` : "Client record"}
                        {clientEmail ? (
                          <>
                            {" · "}
                            {clientEmailHref ? (
                              <a
                                href={clientEmailHref}
                                className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950"
                              >
                                {clientEmail}
                              </a>
                            ) : (
                              clientEmail
                            )}
                          </>
                        ) : null}
                        {clientPhone ? (
                          <>
                            {" · "}
                            {clientPhoneHref ? (
                              <a
                                href={clientPhoneHref}
                                className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950"
                              >
                                {clientPhone}
                              </a>
                            ) : (
                              clientPhone
                            )}
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-2 sm:min-w-[220px]">
                  <div className="min-w-0 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Primary vehicle</p>
                    <p className="mt-1 break-words text-sm font-medium text-slate-900">{primaryVehicleLabel}</p>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Next action</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{nextStepLabel}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Revenue</p>
                  <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em] text-slate-950">{formatCurrency(totalSpend)}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {apptList.length > 0 ? `${apptList.length} appointments` : "No appointments"}
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Open money</p>
                  <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em] text-slate-950">{openRevenueLabel}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {latestInvoice ? "Recent invoice" : latestQuote ? "Recent quote" : "No billing"}
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Vehicles</p>
                  <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em] text-slate-950">
                    {vehicleList.length > 0 ? String(vehicleList.length) : "0"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {vehicleList.length > 0 ? "On file" : "Add a vehicle"}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 max-w-full overflow-hidden rounded-[26px] bg-slate-950 p-5 text-white shadow-[0_18px_50px_rgba(15,23,42,0.24)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-300">Actions</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Contact and workflow</h3>
              <p className="mt-1 text-sm text-white/70">Reach the client fast, then move straight into the next job step.</p>
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Reach client</p>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <ContactActionTile icon={Phone} title="Call client" detail={clientPhone ?? "No phone on file"} href={clientPhoneHref} />
                  <ContactActionTile icon={MessageSquareMore} title="Text client" detail={clientPhone ?? "No phone on file"} href={clientSmsHref} />
                  <ContactActionTile icon={Mail} title="Email client" detail={clientEmail ?? "No email on file"} href={clientEmailHref} />
                  <ContactActionTile icon={MapPin} title="Open in Maps" detail={clientAddress || "No service address on file"} href={clientMapsHref} />
                </div>
              </div>
              <div className="mt-5 h-px bg-white/10" />
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Workflow</p>
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
                <QuickWorkflowAction icon={CalendarPlus} title="New appointment" detail="" href={appointmentHref} />
                <QuickWorkflowAction icon={Receipt} title="Create quote" detail="" href={newQuoteHref} />
                <QuickWorkflowAction icon={FileText} title="Create invoice" detail="" href={newInvoiceHref} />
                <QuickWorkflowAction icon={Plus} title="Add vehicle" detail="" href={addVehicleHref} />
              </div>
            </div>
          </div>
        </section>

        <div className="grid max-w-full gap-3 grid-cols-2 xl:grid-cols-4">
          <WorkflowMetricCard icon={ClipboardList} label="Active jobs" value={String(activeJobsCount)} detail={activeJobsCount > 0 ? "In progress" : "Clear"} />
          <WorkflowMetricCard icon={Receipt} label="Open quotes" value={`$${openQuoteValue.toFixed(2)}`} detail={`${quoteList.filter((quote) => ["draft", "sent"].includes(String((quote as any).status ?? ""))).length} open`} />
          <WorkflowMetricCard icon={FileText} label="Invoices to collect" value={formatCurrency(unpaidInvoiceValue)} detail={`${invoiceList.filter((invoice) => ["sent", "partial"].includes(String((invoice as any).status ?? ""))).length} awaiting collection`} />
          <WorkflowMetricCard icon={Car} label="Vehicles" value={String(vehicleList.length)} detail={vehicleList.length > 0 ? "On file" : "None"} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <div className="min-w-0 space-y-6">
            <Card className="max-w-full overflow-hidden border-white/65">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Client record</CardTitle>
                  </div>
                  {!editMode ? (
                    <Button variant="ghost" size="icon" onClick={() => setEditMode(true)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {editMode ? (
                  <ClientEditForm formState={form} setFormState={setForm} onSave={handleSave} onCancel={handleCancel} saving={saving} error={saveError?.message} />
                ) : (
                  <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SummaryField label="Email" value={clientEmail} href={clientEmailHref} />
                      <SummaryField label="Phone" value={clientPhone} href={clientPhoneHref} />
                      <SummaryField label="Address" value={clientAddress} href={clientMapsHref} />
                      <SummaryField label="Marketing" value={client.marketingOptIn ? "Subscribed" : "Not subscribed"} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <NotesPanel title="Client Notes" body={client.notes} empty="No client-facing notes yet." />
                      <NotesPanel title="Internal Notes" body={client.internalNotes} empty="No internal notes yet." />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {(overdueInvoices.length > 0 || agingQuotes.length > 0) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {overdueInvoices.length > 0 ? (
                  <RevenueFollowupCard
                    tone="danger"
                    title="Overdue invoices need follow-up"
                    detail={`${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"} for ${client.firstName}`}
                    amount={formatCurrency(overdueInvoices.reduce((sum, invoice) => sum + invoiceBalance(invoice as Record<string, unknown>), 0))}
                    href={`/invoices/${(overdueInvoices[0] as any).id}`}
                    actionLabel="Open overdue invoice"
                  />
                ) : null}
                {agingQuotes.length > 0 ? (
                  <RevenueFollowupCard
                    tone="warn"
                    title="Quotes are cooling off"
                    detail={`${agingQuotes.length} quote${agingQuotes.length === 1 ? "" : "s"} older than 3 days`}
                    amount={`$${agingQuotes.reduce((sum, quote) => sum + Number((quote as any).total ?? 0), 0).toFixed(2)}`}
                    href={`/quotes/${(agingQuotes[0] as any).id}`}
                    actionLabel="Open aging quote"
                  />
                ) : null}
              </div>
            ) : null}

            {(quotesError || invoicesError || jobsError) ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Could not load full workflow history.
                {quotesError ? ` Quotes: ${quotesError.message}` : ""}
                {invoicesError ? ` Invoices: ${invoicesError.message}` : ""}
                {jobsError ? ` Jobs: ${jobsError.message}` : ""}
              </div>
            ) : null}

            {(quotesFetching || invoicesFetching || jobsFetching) && quoteList.length === 0 && invoiceList.length === 0 && jobList.length === 0 && !quotesError && !invoicesError && !jobsError ? (
              <div className="flex justify-center py-4 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading workflow history...
              </div>
            ) : null}

            {appointmentsError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Could not load appointments. {appointmentsError.message}
              </div>
            ) : null}
            {appointmentsFetching && apptList.length === 0 && !appointmentsError ? (
              <div className="flex justify-center py-6 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading appointments...
              </div>
            ) : null}

            <AppointmentHistoryCard id={id} appointments={displayedAppointments} totalSpend={totalSpend} />
            {!showAllAppointments && apptList.length > 5 ? (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={() => setShowAllAppointments(true)}>
                  Show all {apptList.length} appointments
                </Button>
              </div>
            ) : null}

            <RelatedRecordsPanel records={relatedRecords} loading={false} />
          </div>

          <div className="min-w-0 space-y-6">
            <RelationshipSnapshotCard
              nextAppointment={nextAppointment}
              lastAppointment={lastCompletedAppointment}
              latestInvoice={latestInvoice as Record<string, unknown> | undefined}
              latestQuote={latestQuote as Record<string, unknown> | undefined}
              openInvoiceValue={unpaidInvoiceValue}
              openQuoteValue={openQuoteValue}
            />

            {vehiclesError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Could not load vehicles. {vehiclesError.message}
              </div>
            ) : null}
            {vehiclesFetching && !vehicleList.length && !vehiclesError ? (
              <div className="flex justify-center py-6 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading vehicles...
              </div>
            ) : null}
            <VehiclesCard id={id} vehicles={vehicleList} />

            <TimelineCard title="Client timeline" items={clientTimeline} empty="No client history recorded yet." />

            <CommunicationCard
              title="Customer hub"
              recipientName={clientDisplayName}
              recipient={client.email}
              primaryLabel="Send customer hub"
              activities={((activityLogs ?? []) as any[]).filter((record) => record.type?.startsWith("client.portal_"))}
              sending={sendingPortal}
              canSend={permissions.has("customers.write")}
              onPrimarySend={handleSendPortal}
            />

            <Card className="max-w-full overflow-hidden border-white/65">
              <CardHeader className="pb-4">
                <CardTitle>Active workflow</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {jobList.slice(0, 3).map((job) => (
                  <Link
                    key={(job as any).id}
                    to={`/jobs/${(job as any).id}`}
                    className="flex items-center justify-between rounded-[1rem] border border-white/65 bg-white/70 px-3 py-3 transition-colors hover:bg-white/88"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{(job as any).title ?? (job as any).jobNumber ?? "Job"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(job as any).scheduledStart ? new Date((job as any).scheduledStart).toLocaleDateString() : "No scheduled date"}
                      </p>
                    </div>
                    {(job as any).status ? (
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium capitalize ${statusPillClass(String((job as any).status))}`}>
                        {String((job as any).status).replace("_", " ")}
                      </span>
                    ) : null}
                  </Link>
                ))}
                {jobList.length === 0 ? <p className="text-sm text-muted-foreground">No jobs on record yet.</p> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function RelationshipSnapshotCard({
  nextAppointment,
  lastAppointment,
  latestInvoice,
  latestQuote,
  openInvoiceValue,
  openQuoteValue,
}: {
  nextAppointment?: Record<string, unknown>;
  lastAppointment?: Record<string, unknown>;
  latestInvoice?: Record<string, unknown>;
  latestQuote?: Record<string, unknown>;
  openInvoiceValue: number;
  openQuoteValue: number;
}) {
  return (
    <Card className="max-w-full overflow-hidden border-white/65">
      <CardHeader className="pb-4">
        <CardTitle>Account snapshot</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SummaryField
          label="Next appointment"
          value={nextAppointment ? `${formatTimelineWhen((nextAppointment.startTime as string | null | undefined) ?? null)}${nextAppointment.status ? ` - ${String(nextAppointment.status).replace("_", " ")}` : ""}` : "Nothing scheduled"}
        />
        <SummaryField
          label="Last visit"
          value={lastAppointment ? formatTimelineWhen((lastAppointment.startTime as string | null | undefined) ?? null) : "No completed visit yet"}
        />
        <SummaryField
          label="Money still open"
          value={openInvoiceValue > 0 ? formatCurrency(openInvoiceValue) : openQuoteValue > 0 ? `${formatCurrency(openQuoteValue)} in open quotes` : "No open balances"}
        />
        <SummaryField
          label="Latest billing touch"
          value={
            latestInvoice
              ? [latestInvoice.invoiceNumber as string | undefined, formatFreshness(latestInvoice.lastPaidAt as string | null | undefined, "Paid"), formatFreshness(latestInvoice.lastSentAt as string | null | undefined, "Sent")]
                  .filter(Boolean)
                  .join(" - ") || "Invoice activity recorded"
              : latestQuote
                ? [formatCurrency(latestQuote.total as number | string | null | undefined), formatFreshness(latestQuote.followUpSentAt as string | null | undefined, "Followed up"), formatFreshness(latestQuote.sentAt as string | null | undefined, "Sent")]
                    .filter(Boolean)
                    .join(" - ") || "Quote activity recorded"
                : "No quote or invoice history yet"
          }
        />
      </CardContent>
    </Card>
  );
}

function TimelineCard({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ id: string; label: string; detail: string; when: string | null | undefined; status?: string; href: string; tone: "appointment" | "job" | "quote" | "invoice" }>;
  empty: string;
}) {
  const toneClass: Record<string, string> = {
    appointment: "bg-blue-50 text-blue-700",
    job: "bg-amber-50 text-amber-700",
    quote: "bg-violet-50 text-violet-700",
    invoice: "bg-emerald-50 text-emerald-700",
  };

  return (
    <Card className="max-w-full overflow-hidden border-white/65">
      <CardHeader className="pb-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="flex max-w-full items-start gap-3 overflow-hidden rounded-[1rem] border border-white/65 bg-white/76 px-3 py-3 transition-colors hover:bg-white/90"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <Clock3 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{item.label}</p>
                    <p className="mt-1 break-words text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${toneClass[item.tone]}`}>
                    {item.tone}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatTimelineWhen(item.when)}
                  {item.status ? ` - ${String(item.status).replace("_", " ")}` : ""}
                </p>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SummaryField({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | null;
  href?: string | null;
}) {
  const displayValue = value || "Not provided";

  return (
    <div className="max-w-full overflow-hidden rounded-[1rem] border border-white/65 bg-white/76 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      {href && value ? (
        <a
          href={href}
          className="mt-1 block break-words text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition hover:text-primary"
        >
          {displayValue}
        </a>
      ) : (
        <p className="mt-1 break-words text-sm font-medium text-foreground">{displayValue}</p>
      )}
    </div>
  );
}

function ContactActionTile({
  icon: Icon,
  title,
  detail,
  href,
}: {
  icon: typeof FileText;
  title: string;
  detail: string;
  href?: string | null;
}) {
  const sharedClassName =
    "rounded-[1rem] border px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-colors";

  const content = (
    <div className="flex items-start gap-3">
      <div className={`rounded-lg p-2 ${href ? "bg-white/12 text-white" : "bg-white/8 text-white/50"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 space-y-1">
        <p className={`text-sm font-medium ${href ? "text-white" : "text-white/70"}`}>{title}</p>
        <p className={`break-words text-xs ${href ? "text-white/65" : "text-white/40"}`}>{detail}</p>
      </div>
    </div>
  );

  if (!href) {
    return (
      <div className={`${sharedClassName} cursor-not-allowed border-white/10 bg-white/5`} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <a href={href} className={`${sharedClassName} border-white/15 bg-white/8 hover:border-white/25 hover:bg-white/12`}>
      {content}
    </a>
  );
}

function NotesPanel({
  title,
  body,
  empty,
}: {
  title: string;
  body?: string | null;
  empty: string;
}) {
  return (
    <div className="rounded-[1rem] border border-white/65 bg-white/76 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-foreground/90">{body || empty}</p>
    </div>
  );
}

function WorkflowMetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/65 bg-white/82 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{detail}</p>
    </div>
  );
}

function QuickWorkflowAction({
  icon: Icon,
  title,
  detail,
  href,
}: {
  icon: typeof FileText;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <Link to={href} className="block rounded-[1rem] border border-white/65 bg-white/82 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-colors hover:border-primary/30 hover:bg-white">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
        </div>
      </div>
    </Link>
  );
}

function RevenueFollowupCard({
  title,
  detail,
  amount,
  href,
  actionLabel,
  tone,
}: {
  title: string;
  detail: string;
  amount: string;
  href: string;
  actionLabel: string;
  tone: "danger" | "warn";
}) {
  const toneClass = tone === "danger" ? "border-red-200 bg-red-50/80" : "border-amber-200 bg-amber-50/80";

  return (
    <div className={`rounded-[1rem] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <p className="text-sm font-semibold">{amount}</p>
      </div>
      <Button asChild size="sm" variant="outline" className="mt-3">
        <Link to={href}>{actionLabel}</Link>
      </Button>
    </div>
  );
}
