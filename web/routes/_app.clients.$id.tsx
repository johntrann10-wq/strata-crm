import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useFindOne, useFindMany, useAction } from "../hooks/useApi";
import { api } from "../api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, CalendarPlus, FileText, MoreVertical, Loader2, ClipboardList, Receipt, Car, Plus } from "lucide-react";
import { ContextualNextStep } from "../components/shared/ContextualNextStep";
import { RelatedRecordsPanel } from "../components/shared/RelatedRecordsPanel";
import { usePageContext } from "../components/shared/CommandPaletteContext";
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
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { VehiclesCard, AppointmentHistoryCard, ClientEditForm, type FormState } from "../components/ClientDetailCards";

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

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blank);
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const { setPageContext } = usePageContext();
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
    select: { id: true, startTime: true, status: true, title: true, totalPrice: true, vehicle: { make: true, model: true, year: true } },
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
  const [{ fetching: saving, error: saveError }, runUpdate] = useAction(api.client.update);
  const [{ fetching: deleting }, runDelete] = useAction(api.client.delete);
  useEffect(() => { if (client) setForm(toForm(client)); }, [client]);

  useEffect(() => {
    setPageContext({
      entityType: "client",
      entityId: id ?? null,
      entityLabel: client ? client.firstName + " " + client.lastName : null,
      clientId: id ?? null,
      clientName: client ? client.firstName + " " + client.lastName : null,
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
  }, [client, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    const result = await runUpdate({ id: id!, ...(form as any) });
    if (result?.error) {
      toast.error('Failed to save changes: ' + result.error.message);
      return;
    }
    toast.success('Changes saved');
    refetch();
    setEditMode(false);
  };
  const handleCancel = () => { if (client) setForm(toForm(client)); setEditMode(false); };
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
  const apptList = Array.isArray(appointments) ? appointments : [];
  const vehicleList = Array.isArray(vehicles) ? vehicles : [];
  const quoteList = Array.isArray(quotes) ? quotes : [];
  const invoiceList = Array.isArray(invoices) ? invoices : [];
  const jobList = Array.isArray(jobs) ? jobs : [];

  const totalSpend = apptList.reduce((s, a) => s + (a.totalPrice ?? 0), 0);
  const openQuoteValue = quoteList
    .filter((quote) => ["draft", "sent"].includes(String((quote as any).status ?? "")))
    .reduce((sum, quote) => sum + Number((quote as any).total ?? 0), 0);
  const unpaidInvoiceValue = invoiceList
    .filter((invoice) => ["sent", "partial"].includes(String((invoice as any).status ?? "")))
    .reduce((sum, invoice) => sum + Number((invoice as any).total ?? 0), 0);
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

  // For clients with 20+ appointments a backend pagination solution would be needed.
  const displayedAppointments = showAllAppointments ? apptList : apptList.slice(0, 5);

  const lastAppointmentDate =
    apptList.length > 0 ? apptList[0].startTime : null;

  const relatedRecords = [
    ...jobList.slice(0, 4).map((job) => ({
      type: "job" as const,
      id: (job as any).id,
      label: (job as any).title ?? (job as any).jobNumber ?? "Job",
      sublabel: (job as any).scheduledStart ? new Date((job as any).scheduledStart).toLocaleDateString() : undefined,
      status: (job as any).status ?? undefined,
      href: `/jobs/${(job as any).id}`,
    })),
    ...invoiceList.slice(0, 4).map((invoice) => ({
      type: "invoice" as const,
      id: (invoice as any).id,
      label: (invoice as any).invoiceNumber ?? "Invoice",
      sublabel: (invoice as any).total != null ? `$${Number((invoice as any).total).toFixed(2)}` : undefined,
      status: (invoice as any).status ?? undefined,
      href: `/invoices/${(invoice as any).id}`,
    })),
    ...quoteList.slice(0, 4).map((quote) => ({
      type: "quote" as const,
      id: (quote as any).id,
      label: "Quote",
      sublabel: (quote as any).total != null ? `$${Number((quote as any).total).toFixed(2)}` : undefined,
      status: (quote as any).status ?? undefined,
      href: `/quotes/${(quote as any).id}`,
    })),
    ...apptList.map((a) => ({
      type: "appointment" as const,
      id: a.id,
      label: a.title ?? "Appointment",
      sublabel: a.startTime ? new Date(a.startTime).toLocaleDateString() : undefined,
      href: `/appointments/${a.id}`,
    })),
  ];

  if (fetching) return <div className="p-6 max-w-6xl mx-auto flex items-center justify-center min-h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (error) return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <Link to="/clients"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Error loading client: {error.message}
      </div>
    </div>
  );
  if (!client) return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <Link to="/clients"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
      <p className="text-muted-foreground">Client not found.</p>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/clients"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">{client.firstName} {client.lastName}</h1>
        <span className="text-sm text-muted-foreground ml-auto">Client since {new Date(client.createdAt).toLocaleDateString()}</span>
        <Button asChild variant="outline" size="sm">
          <Link to={`/clients/${id}/vehicles/new?next=appointment`}>
            <Car className="h-4 w-4 mr-1.5" />
            Add Vehicle
          </Link>
        </Button>
        <Button asChild variant="default" size="sm">
          <Link to={`/appointments/new?clientId=${id}`}>
            <CalendarPlus className="h-4 w-4 mr-1.5" />
            Book Appointment
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/invoices/new?clientId=${id}`}>
            <FileText className="h-4 w-4 mr-1.5" />
            New Invoice
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/quotes/new?clientId=${id}`}>
            <Receipt className="h-4 w-4 mr-1.5" />
            New Quote
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More actions">
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
      </div>

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
      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative bg-card border rounded-lg p-4">
            {editMode ? (
              <ClientEditForm formState={form} setFormState={setForm} onSave={handleSave} onCancel={handleCancel} saving={saving} error={saveError?.message} />
            ) : (
              <>
                <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => setEditMode(true)}><Pencil className="h-4 w-4" /></Button>
                <div className="space-y-1 text-sm pr-8">
                  {client.email && <p>{client.email}</p>}
                  {client.phone && <p>{client.phone}</p>}
                  {(client.address || client.city) && <p>{[client.address, client.city, client.state, client.zip].filter(Boolean).join(", ")}</p>}
                  {client.source && <p className="text-muted-foreground capitalize">Source: {client.source}</p>}
                  {client.tags && client.tags.length > 0 && <p className="text-muted-foreground">Tags: {client.tags.join(", ")}</p>}
                </div>
              </>
            )}
          </div>
          {vehiclesError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Could not load vehicles. {vehiclesError.message}
            </div>
          )}
          {vehiclesFetching && !vehicleList.length && !vehiclesError ? (
            <div className="flex justify-center py-6 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading vehicles…
            </div>
          ) : null}
          <VehiclesCard id={id} vehicles={vehicleList} />
        </div>
        <div className="lg:col-span-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-4">
            <QuickWorkflowAction
              icon={CalendarPlus}
              title="Book appointment"
              detail="Schedule the next service visit"
              href={`/appointments/new?clientId=${id}`}
            />
            <QuickWorkflowAction
              icon={Receipt}
              title="Create quote"
              detail="Build and send a fresh estimate"
              href={`/quotes/new?clientId=${id}`}
            />
            <QuickWorkflowAction
              icon={FileText}
              title="Create invoice"
              detail="Bill work without leaving the record"
              href={`/invoices/new?clientId=${id}`}
            />
            <QuickWorkflowAction
              icon={Plus}
              title="Add vehicle"
              detail="Capture another vehicle for this client"
              href={`/clients/${id}/vehicles/new?next=client`}
            />
          </div>

          {(overdueInvoices.length > 0 || agingQuotes.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2 mb-4">
              {overdueInvoices.length > 0 ? (
                <RevenueFollowupCard
                  tone="danger"
                  title="Overdue invoices need follow-up"
                  detail={`${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"} for ${client.firstName}`}
                  amount={`$${overdueInvoices.reduce((sum, invoice) => sum + Number((invoice as any).total ?? 0), 0).toFixed(2)}`}
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
          )}

          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <WorkflowMetricCard
              icon={ClipboardList}
              label="Active jobs"
              value={String(activeJobsCount)}
              detail={activeJobsCount > 0 ? "Work in progress" : "No active jobs"}
            />
            <WorkflowMetricCard
              icon={Receipt}
              label="Open quotes"
              value={`$${openQuoteValue.toFixed(2)}`}
              detail={`${quoteList.filter((quote) => ["draft", "sent"].includes(String((quote as any).status ?? ""))).length} awaiting action`}
            />
            <WorkflowMetricCard
              icon={FileText}
              label="Unpaid invoices"
              value={`$${unpaidInvoiceValue.toFixed(2)}`}
              detail={`${invoiceList.filter((invoice) => ["sent", "partial"].includes(String((invoice as any).status ?? ""))).length} awaiting payment`}
            />
          </div>

          {(quotesError || invoicesError || jobsError) && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive mb-3">
              Could not load full workflow history.
              {quotesError ? ` Quotes: ${quotesError.message}` : ""}
              {invoicesError ? ` Invoices: ${invoicesError.message}` : ""}
              {jobsError ? ` Jobs: ${jobsError.message}` : ""}
            </div>
          )}
          {(quotesFetching || invoicesFetching || jobsFetching) &&
          quoteList.length === 0 &&
          invoiceList.length === 0 &&
          jobList.length === 0 &&
          !quotesError &&
          !invoicesError &&
          !jobsError ? (
            <div className="flex justify-center py-4 text-muted-foreground text-sm mb-3">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading workflow history…
            </div>
          ) : null}
          {appointmentsError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive mb-3">
              Could not load appointments. {appointmentsError.message}
            </div>
          )}
          {appointmentsFetching && apptList.length === 0 && !appointmentsError ? (
            <div className="flex justify-center py-6 text-muted-foreground text-sm mb-3">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading appointments…
            </div>
          ) : null}
          <AppointmentHistoryCard id={id} appointments={displayedAppointments} totalSpend={totalSpend} />
          {!showAllAppointments && apptList.length > 5 && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllAppointments(true)}
              >
                Show all {apptList.length} appointments
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="lg:col-span-1">
          <ContextualNextStep
            entityType="client"
            status={null}
            data={{
              id: id,
              lastAppointmentDate,
            }}
          />
        </div>
        <div className="lg:col-span-1">
          <RelatedRecordsPanel records={relatedRecords} loading={false} />
        </div>
      </div>
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
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
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
    <Link
      to={href}
      className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
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
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50/80"
      : "border-amber-200 bg-amber-50/80";
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
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
