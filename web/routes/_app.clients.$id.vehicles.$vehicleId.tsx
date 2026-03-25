import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Receipt,
} from "lucide-react";
import { api } from "../api";
import { useAction, useFindMany, useFindOne } from "../hooks/useApi";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
import { PageHeader } from "../components/shared/PageHeader";
import { ContextualNextStep } from "../components/shared/ContextualNextStep";
import { RelatedRecordsPanel, type RelatedRecord } from "../components/shared/RelatedRecordsPanel";
import { usePageContext } from "../components/shared/CommandPaletteContext";

function formatCurrency(amount: number | string | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFreshness(value: string | null | undefined, label: string): string | null {
  const parsed = safeDate(value);
  return parsed ? `${label} ${formatDate(parsed)}` : null;
}

function statusClass(status: string): string {
  switch (status) {
    case "completed":
    case "paid":
      return "bg-green-100 text-green-800 border-0";
    case "confirmed":
    case "sent":
      return "bg-blue-100 text-blue-800 border-0";
    case "in_progress":
    case "partial":
      return "bg-orange-100 text-orange-800 border-0";
    case "cancelled":
    case "void":
    case "no-show":
      return "bg-red-100 text-red-800 border-0";
    default:
      return "bg-gray-100 text-gray-700 border-0";
  }
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function invoiceBalance(invoice: Record<string, unknown>): number {
  const raw =
    invoice.remainingBalance != null && invoice.remainingBalance !== ""
      ? Number(invoice.remainingBalance)
      : Number(invoice.total ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

export default function VehicleDetailPage() {
  const { currentLocationId } = useOutletContext<AuthOutletContext>();
  const { id, vehicleId } = useParams<{ id: string; vehicleId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : `/clients/${id}`;
  const currentRecordPath = `${location.pathname}${location.search}`;
  const appointmentHref = `/appointments/new?clientId=${id}&vehicleId=${vehicleId}${currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""}&from=${encodeURIComponent(currentRecordPath)}`;
  const newQuoteHref = `/quotes/new?clientId=${id}&vehicleId=${vehicleId}&from=${encodeURIComponent(currentRecordPath)}`;
  const newInvoiceHref = `/invoices/new?clientId=${id}&vehicleId=${vehicleId}&from=${encodeURIComponent(currentRecordPath)}`;
  const navigate = useNavigate();
  const { setPageContext } = usePageContext();

  const [{ data: vehicle, fetching, error }] = useFindOne(api.vehicle, vehicleId!, {
    select: {
      id: true,
      year: true,
      make: true,
      model: true,
      color: true,
      vin: true,
      licensePlate: true,
      mileage: true,
      notes: true,
      client: { id: true, firstName: true, lastName: true },
    },
  });

  const [{ data: appointments, fetching: appointmentsFetching, error: appointmentsError }] = useFindMany(api.appointment, {
    vehicleId: vehicleId,
    sort: { startTime: "Descending" },
    first: 10,
    pause: !vehicleId,
  } as any);
  const [{ data: quotes, fetching: quotesFetching, error: quotesError }] = useFindMany(api.quote, {
    vehicleId: vehicleId,
    sort: { createdAt: "Descending" },
    first: 10,
    pause: !vehicleId,
  } as any);
  const [{ data: invoices, fetching: invoicesFetching, error: invoicesError }] = useFindMany(api.invoice, {
    vehicleId: vehicleId,
    sort: { createdAt: "Descending" },
    first: 10,
    pause: !vehicleId,
  } as any);
  const [{ data: jobs, fetching: jobsFetching, error: jobsError }] = useFindMany(api.job, {
    vehicleId: vehicleId,
    first: 10,
    pause: !vehicleId,
  } as any);

  const [updateResult, update] = useAction(api.vehicle.update);
  const [deleteResult, deleteVehicle] = useAction(api.vehicle.delete);

  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [mileage, setMileage] = useState("");
  const [notes, setNotes] = useState("");
  const [showMoreDetails, setShowMoreDetails] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (vehicle) {
      setVin((vehicle as any).vin ?? "");
      setYear((vehicle as any).year?.toString() ?? "");
      setMake((vehicle as any).make ?? "");
      setModel((vehicle as any).model ?? "");
      setColor((vehicle as any).color ?? "");
      setLicensePlate((vehicle as any).licensePlate ?? "");
      setMileage((vehicle as any).mileage?.toString() ?? "");
      setNotes((vehicle as any).notes ?? "");
    }
  }, [vehicle]);

  useEffect(() => {
    if (!vehicle) return;
    const vehicleLabel = [(vehicle as any).year, (vehicle as any).make, (vehicle as any).model]
      .filter(Boolean)
      .join(" ");
    setPageContext({
      entityType: "vehicle",
      entityId: vehicleId ?? null,
      entityLabel: vehicleLabel || "Vehicle",
      clientId: (vehicle as any).client?.id ?? id ?? null,
      clientName: (vehicle as any).client
        ? `${(vehicle as any).client.firstName} ${(vehicle as any).client.lastName}`.trim()
        : null,
      vehicleId: vehicleId ?? null,
      vehicleLabel,
      appointmentId: null,
      invoiceId: null,
    });
    return () => setPageContext(null);
  }, [vehicle, vehicleId, id, setPageContext]);

  useEffect(() => {
    if (updateResult.data) {
      toast.success("Vehicle updated");
      navigate(`/clients/${id}/vehicles/${vehicleId}${searchParams.has("from") ? `?from=${encodeURIComponent(returnTo)}` : ""}`);
    }
  }, [updateResult.data, navigate, id, vehicleId]);

  useEffect(() => {
    if (updateResult.error) {
      toast.error(updateResult.error.message ?? "Failed to update vehicle");
    }
  }, [updateResult.error]);

  useEffect(() => {
    if (deleteResult.data) {
      toast.success("Vehicle deleted");
      navigate(returnTo);
    }
  }, [deleteResult.data, navigate, id]);

  useEffect(() => {
    if (deleteResult.error) {
      toast.error(deleteResult.error.message ?? "Failed to delete vehicle");
    }
  }, [deleteResult.error]);

  const handleSave = () => {
    update({
      id: vehicleId!,
      year: year ? parseInt(year, 10) : null,
      make,
      model,
      color: color || null,
      vin: vin || null,
      licensePlate: licensePlate || null,
      mileage: mileage ? parseInt(mileage, 10) : null,
      notes: notes || null,
    });
  };

  const handleDeleteConfirm = () => {
    deleteVehicle({ id: vehicleId! });
  };

  const appointmentList = Array.isArray(appointments) ? appointments : [];
  const quoteList = Array.isArray(quotes) ? quotes : [];
  const invoiceList = Array.isArray(invoices) ? invoices : [];
  const jobList = Array.isArray(jobs) ? jobs : [];

  const activeJobs = jobList.filter((job) =>
    ["scheduled", "confirmed", "in_progress"].includes(String((job as any).status ?? ""))
  );
  const openQuotes = quoteList.filter((quote) =>
    ["draft", "sent"].includes(String((quote as any).status ?? ""))
  );
  const unpaidInvoices = invoiceList.filter((invoice) =>
    ["sent", "partial"].includes(String((invoice as any).status ?? ""))
  );
  const overdueInvoices = unpaidInvoices.filter((invoice) => {
    const dueDate = safeDate((invoice as any).dueDate ?? null);
    return !!dueDate && dueDate.getTime() < Date.now();
  });
  const agingQuotes = openQuotes.filter((quote) => {
    const createdAt = safeDate((quote as any).createdAt ?? null);
    return !!createdAt && Date.now() - createdAt.getTime() >= 3 * 24 * 60 * 60 * 1000;
  });

  const clientName = (vehicle as any)?.client
    ? `${(vehicle as any).client.firstName} ${(vehicle as any).client.lastName}`.trim()
    : "Client";
  const pageTitle =
    (vehicle as any)?.year && (vehicle as any)?.make && (vehicle as any)?.model
      ? `${(vehicle as any).year} ${(vehicle as any).make} ${(vehicle as any).model}`
      : "Vehicle";

  const relatedRecords: RelatedRecord[] = [
    ...activeJobs.slice(0, 4).map((job) => ({
      type: "job" as const,
      id: (job as any).id,
      label: (job as any).title ?? (job as any).jobNumber ?? "Job",
      sublabel: (job as any).scheduledStart ? formatDate((job as any).scheduledStart) : undefined,
      status: (job as any).status ?? undefined,
      href: `/jobs/${(job as any).id}`,
      actionHref:
        String((job as any).status ?? "") === "completed"
          ? `/invoices/new?clientId=${id}&vehicleId=${vehicleId}&appointmentId=${(job as any).id}`
          : undefined,
      actionLabel: String((job as any).status ?? "") === "completed" ? "Invoice" : undefined,
    })),
    ...openQuotes.slice(0, 4).map((quote) => ({
      type: "quote" as const,
      id: (quote as any).id,
      label: "Quote",
      sublabel:
        [
          formatCurrency((quote as any).total),
          formatFreshness((quote as any).sentAt ?? null, "Sent"),
          formatFreshness((quote as any).followUpSentAt ?? null, "Followed up"),
        ]
          .filter(Boolean)
          .join(" - ") || formatCurrency((quote as any).total),
      status: (quote as any).status ?? undefined,
      href: `/quotes/${(quote as any).id}`,
      actionHref:
        String((quote as any).status ?? "") === "accepted"
          ? `/appointments/new?clientId=${id}&vehicleId=${vehicleId}${currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""}&quoteId=${(quote as any).id}`
          : undefined,
      actionLabel: String((quote as any).status ?? "") === "accepted" ? "Book" : undefined,
    })),
    ...unpaidInvoices.slice(0, 4).map((invoice) => ({
      type: "invoice" as const,
      id: (invoice as any).id,
      label: (invoice as any).invoiceNumber ?? "Invoice",
      sublabel:
        [
          formatCurrency(invoiceBalance(invoice as Record<string, unknown>)),
          formatFreshness((invoice as any).lastSentAt ?? null, "Sent"),
          formatFreshness((invoice as any).lastPaidAt ?? null, "Paid"),
        ]
          .filter(Boolean)
          .join(" - ") || formatCurrency(invoiceBalance(invoice as Record<string, unknown>)),
      status: (invoice as any).status ?? undefined,
      href: `/invoices/${(invoice as any).id}`,
      actionHref: ["sent", "partial"].includes(String((invoice as any).status ?? ""))
        ? `/invoices/${(invoice as any).id}`
        : undefined,
      actionLabel: ["sent", "partial"].includes(String((invoice as any).status ?? "")) ? "Collect" : undefined,
    })),
    ...appointmentList.slice(0, 4).map((appointment) => ({
      type: "appointment" as const,
      id: (appointment as any).id,
      label: (appointment as any).title ?? "Appointment",
      sublabel: (appointment as any).startTime ? formatDate((appointment as any).startTime) : undefined,
      status: (appointment as any).status ?? undefined,
      href: `/appointments/${(appointment as any).id}`,
      actionHref:
        String((appointment as any).status ?? "") === "completed"
          ? `/invoices/new?clientId=${id}&vehicleId=${vehicleId}&appointmentId=${(appointment as any).id}`
          : `/quotes/new?clientId=${id}&vehicleId=${vehicleId}`,
      actionLabel: String((appointment as any).status ?? "") === "completed" ? "Invoice" : "Quote",
    })),
  ];
  const nextAppointment = [...appointmentList]
    .filter((appointment) => {
      const start = safeDate((appointment as any).startTime ?? null);
      return !!start && start.getTime() >= Date.now();
    })
    .sort(
      (a, b) =>
        (safeDate((a as any).startTime ?? null)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (safeDate((b as any).startTime ?? null)?.getTime() ?? Number.MAX_SAFE_INTEGER)
    )[0];
  const lastVisit = [...appointmentList]
    .filter((appointment) => {
      const start = safeDate((appointment as any).startTime ?? null);
      return !!start && start.getTime() < Date.now();
    })
    .sort(
      (a, b) =>
        (safeDate((b as any).startTime ?? null)?.getTime() ?? 0) -
        (safeDate((a as any).startTime ?? null)?.getTime() ?? 0)
    )[0];
  const latestInvoice = [...invoiceList].sort(
    (a, b) =>
      (safeDate(((b as any).lastPaidAt ?? (b as any).lastSentAt ?? (b as any).createdAt ?? null) as string | null)?.getTime() ?? 0) -
      (safeDate(((a as any).lastPaidAt ?? (a as any).lastSentAt ?? (a as any).createdAt ?? null) as string | null)?.getTime() ?? 0)
  )[0];
  const latestQuote = [...quoteList].sort(
    (a, b) =>
      (safeDate(((b as any).followUpSentAt ?? (b as any).sentAt ?? (b as any).createdAt ?? null) as string | null)?.getTime() ?? 0) -
      (safeDate(((a as any).followUpSentAt ?? (a as any).sentAt ?? (a as any).createdAt ?? null) as string | null)?.getTime() ?? 0)
  )[0];
  const vehicleTimeline = [
    ...appointmentList.map((appointment) => ({
      id: `appointment-${String((appointment as any).id)}`,
      label: (appointment as any).title ?? "Appointment",
      detail: "Scheduled vehicle visit",
      when: ((appointment as any).startTime as string | null | undefined) ?? null,
      status: (appointment as any).status ?? "scheduled",
      href: `/appointments/${(appointment as any).id}`,
      tone: "appointment" as const,
    })),
    ...jobList.map((job) => ({
      id: `job-${String((job as any).id)}`,
      label: (job as any).title ?? (job as any).jobNumber ?? "Job",
      detail: (job as any).scheduledStart ? "Execution in progress" : "Workflow job",
      when: ((job as any).scheduledStart as string | null | undefined) ?? ((job as any).createdAt as string | null | undefined) ?? null,
      status: (job as any).status ?? "scheduled",
      href: `/jobs/${(job as any).id}`,
      tone: "job" as const,
    })),
    ...quoteList.map((quote) => ({
      id: `quote-${String((quote as any).id)}`,
      label: "Quote",
      detail:
        [formatCurrency((quote as any).total), formatFreshness((quote as any).followUpSentAt ?? (quote as any).sentAt ?? null, "Touched")]
          .filter(Boolean)
          .join(" - ") || "Estimate recorded",
      when: ((quote as any).followUpSentAt as string | null | undefined) ?? ((quote as any).sentAt as string | null | undefined) ?? ((quote as any).createdAt as string | null | undefined) ?? null,
      status: (quote as any).status ?? "draft",
      href: `/quotes/${(quote as any).id}`,
      tone: "quote" as const,
    })),
    ...invoiceList.map((invoice) => ({
      id: `invoice-${String((invoice as any).id)}`,
      label: (invoice as any).invoiceNumber ?? "Invoice",
      detail:
        [formatCurrency(invoiceBalance(invoice as Record<string, unknown>)), formatFreshness((invoice as any).lastPaidAt ?? (invoice as any).lastSentAt ?? null, "Updated")]
          .filter(Boolean)
          .join(" - ") || "Billing record",
      when: ((invoice as any).lastPaidAt as string | null | undefined) ?? ((invoice as any).lastSentAt as string | null | undefined) ?? ((invoice as any).createdAt as string | null | undefined) ?? null,
      status: (invoice as any).status ?? "draft",
      href: `/invoices/${(invoice as any).id}`,
      tone: "invoice" as const,
    })),
  ]
    .sort((a, b) => (safeDate(b.when)?.getTime() ?? 0) - (safeDate(a.when)?.getTime() ?? 0))
    .slice(0, 6);

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-destructive text-lg">
          {error ? error.message : "Vehicle not found"}
        </p>
        <Button variant="outline" asChild>
          <Link to={`/clients/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-section space-y-6">
        <PageHeader
          backTo={returnTo}
          title={pageTitle}
          subtitle={clientName}
          badge={<Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]">Vehicle Record</Badge>}
          actions={
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button asChild size="sm" className="w-full sm:w-auto">
                <Link to={appointmentHref}>
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Book Job
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link to={newQuoteHref}>
                  <Receipt className="h-4 w-4 mr-2" />
                  New Quote
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link to={newInvoiceHref}>
                  <FileText className="h-4 w-4 mr-2" />
                  New Invoice
                </Link>
              </Button>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <VehicleMetricCard
            icon={ClipboardList}
            label="Active jobs"
            value={String(activeJobs.length)}
            detail={activeJobs.length > 0 ? "Running on this vehicle" : "No active jobs"}
          />
          <VehicleMetricCard
            icon={Receipt}
            label="Open quotes"
            value={formatCurrency(openQuotes.reduce((sum, quote) => sum + Number((quote as any).total ?? 0), 0))}
            detail={`${openQuotes.length} awaiting action`}
          />
          <VehicleMetricCard
            icon={FileText}
            label="Unpaid invoices"
            value={formatCurrency(
              unpaidInvoices.reduce(
                (sum, invoice) => sum + invoiceBalance(invoice as Record<string, unknown>),
                0
              )
            )}
            detail={`${unpaidInvoices.length} awaiting payment`}
          />
          <VehicleMetricCard
            icon={CalendarPlus}
            label="Appointments"
            value={String(appointmentList.length)}
            detail={appointmentList.length > 0 ? "Visits on this vehicle" : "No visits yet"}
          />
        </div>

        {(overdueInvoices.length > 0 || agingQuotes.length > 0) ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {overdueInvoices.length > 0 ? (
              <VehicleRevenueCard
                tone="danger"
                title="Overdue invoices on this vehicle"
                detail={`${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"} need collection`}
                amount={formatCurrency(
                  overdueInvoices.reduce(
                    (sum, invoice) => sum + invoiceBalance(invoice as Record<string, unknown>),
                    0
                  )
                )}
                href={`/invoices/${(overdueInvoices[0] as any).id}`}
                actionLabel="Open overdue invoice"
              />
            ) : null}
            {agingQuotes.length > 0 ? (
              <VehicleRevenueCard
                tone="warn"
                title="Quotes are cooling off"
                detail={`${agingQuotes.length} quote${agingQuotes.length === 1 ? "" : "s"} older than 3 days`}
                amount={formatCurrency(agingQuotes.reduce((sum, quote) => sum + Number((quote as any).total ?? 0), 0))}
                href={`/quotes/${(agingQuotes[0] as any).id}`}
                actionLabel="Open aging quote"
              />
            ) : null}
          </div>
        ) : null}

        {(appointmentsError || quotesError || invoicesError || jobsError) ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Could not load full vehicle workflow history.
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle>Vehicle Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SummaryField label="Owner" value={clientName} />
                  <SummaryField label="License Plate" value={licensePlate || "Not provided"} />
                  <SummaryField label="VIN" value={vin || "Not provided"} />
                  <SummaryField label="Mileage" value={mileage ? `${mileage} mi` : "Not provided"} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vin">VIN</Label>
                  <Input
                    id="vin"
                    value={vin}
                    onChange={(e) => setVin(e.target.value)}
                    placeholder="Vehicle Identification Number (optional)"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Input id="year" type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2022" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="make">Make</Label>
                    <Input id="make" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="model">Model</Label>
                    <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Camry" />
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    className="mb-4 flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowMoreDetails((v) => !v)}
                  >
                    {showMoreDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    More details
                  </button>

                  {showMoreDetails ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="color">Color</Label>
                          <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="Black" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="licensePlate">License Plate</Label>
                          <Input
                            id="licensePlate"
                            value={licensePlate}
                            onChange={(e) => setLicensePlate(e.target.value)}
                            placeholder="ABC-1234"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="mileage">Mileage</Label>
                        <Input id="mileage" type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="35000" />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea
                          id="notes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Additional notes about this vehicle..."
                          rows={4}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => navigate(returnTo)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={updateResult.fetching || !make || !model}>
                    {updateResult.fetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
                    Save Changes
                  </Button>
                </div>

                <Separator />
                <div className="flex justify-start">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    Delete Vehicle
                  </Button>
                </div>
              </CardContent>
            </Card>

            <ContextualNextStep
              entityType="client"
              status={null}
              data={{
                id: id,
                lastAppointmentDate: appointmentList[0] ? (appointmentList[0] as any).startTime : null,
              }}
            />
          </div>

          <div className="space-y-6">
            <VehicleMemoryCard
              nextAppointment={nextAppointment as Record<string, unknown> | undefined}
              lastVisit={lastVisit as Record<string, unknown> | undefined}
              latestInvoice={latestInvoice as Record<string, unknown> | undefined}
              latestQuote={latestQuote as Record<string, unknown> | undefined}
              openInvoiceValue={unpaidInvoices.reduce(
                (sum, invoice) => sum + invoiceBalance(invoice as Record<string, unknown>),
                0
              )}
              openQuoteValue={openQuotes.reduce((sum, quote) => sum + Number((quote as any).total ?? 0), 0)}
            />

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle>Vehicle Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <QuickVehicleAction
                  icon={CalendarPlus}
                  title="Book appointment"
                  detail="Schedule the next visit for this vehicle"
                  href={appointmentHref}
                />
                <QuickVehicleAction
                  icon={Receipt}
                  title="Create quote"
                  detail="Build an estimate tied to this vehicle"
                  href={newQuoteHref}
                />
                <QuickVehicleAction
                  icon={FileText}
                  title="Create invoice"
                  detail="Bill this vehicle directly"
                  href={newInvoiceHref}
                />
                <QuickVehicleAction
                  icon={Plus}
                  title="Add another vehicle"
                  detail="Capture another unit for this client"
                  href={`/clients/${id}/vehicles/new?next=client`}
                />
              </CardContent>
            </Card>

            <RelatedRecordsPanel
              records={relatedRecords}
              loading={appointmentsFetching || quotesFetching || invoicesFetching || jobsFetching}
            />

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle>Vehicle workflow history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {vehicleTimeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No workflow history yet for this vehicle.</p>
                ) : (
                  vehicleTimeline.map((record) => (
                    <Link
                      key={record.id}
                      to={record.href}
                      className="flex items-center justify-between rounded-xl border border-border/70 p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{record.label}</p>
                        <p className="text-sm text-muted-foreground">{record.detail}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatTimelineWhen(record.when)}</p>
                      </div>
                      {record.status ? (
                        <Badge className={`text-xs capitalize ${statusClass(record.status)}`}>{record.status}</Badge>
                      ) : null}
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Vehicle?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this vehicle. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteResult.fetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/90 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function VehicleMemoryCard({
  nextAppointment,
  lastVisit,
  latestInvoice,
  latestQuote,
  openInvoiceValue,
  openQuoteValue,
}: {
  nextAppointment?: Record<string, unknown>;
  lastVisit?: Record<string, unknown>;
  latestInvoice?: Record<string, unknown>;
  latestQuote?: Record<string, unknown>;
  openInvoiceValue: number;
  openQuoteValue: number;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle>Vehicle Service Snapshot</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SummaryField
          label="Next visit"
          value={
            nextAppointment
              ? `${formatTimelineWhen((nextAppointment.startTime as string | null | undefined) ?? null)}${nextAppointment.status ? ` - ${String(nextAppointment.status).replace("_", " ")}` : ""}`
              : "Nothing scheduled"
          }
        />
        <SummaryField
          label="Last visit"
          value={lastVisit ? formatTimelineWhen((lastVisit.startTime as string | null | undefined) ?? null) : "No completed visit yet"}
        />
        <SummaryField
          label="Money tied to this vehicle"
          value={openInvoiceValue > 0 ? formatCurrency(openInvoiceValue) : openQuoteValue > 0 ? `${formatCurrency(openQuoteValue)} in open quotes` : "No open balances"}
        />
        <SummaryField
          label="Latest billing touch"
          value={
            latestInvoice
              ? [
                  (latestInvoice.invoiceNumber as string | undefined) ?? "Invoice",
                  formatFreshness((latestInvoice.lastPaidAt as string | null | undefined) ?? null, "Paid"),
                  formatFreshness((latestInvoice.lastSentAt as string | null | undefined) ?? null, "Sent"),
                ]
                  .filter(Boolean)
                  .join(" - ") || "Invoice activity recorded"
              : latestQuote
                ? [
                    formatCurrency(latestQuote.total as number | string | null | undefined),
                    formatFreshness((latestQuote.followUpSentAt as string | null | undefined) ?? null, "Followed up"),
                    formatFreshness((latestQuote.sentAt as string | null | undefined) ?? null, "Sent"),
                  ]
                    .filter(Boolean)
                    .join(" - ") || "Quote activity recorded"
                : "No quote or invoice history yet"
          }
        />
      </CardContent>
    </Card>
  );
}

function VehicleMetricCard({
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
    <div className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function QuickVehicleAction({
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
      className="block rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
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

function VehicleRevenueCard({
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
    <div className={`rounded-xl border p-4 ${toneClass}`}>
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
