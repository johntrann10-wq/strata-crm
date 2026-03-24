import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useFindOne, useFindMany, useAction } from "../hooks/useApi";
import { api } from "../api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { ContextualNextStep } from "../components/shared/ContextualNextStep";
import { RelatedRecordsPanel, type RelatedRecord } from "../components/shared/RelatedRecordsPanel";
import { usePageContext } from "../components/shared/CommandPaletteContext";
import {
  ArrowLeft,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Loader2,
  Pencil,
  Receipt,
} from "lucide-react";

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

export default function VehicleDetailPage() {
  const { id, vehicleId } = useParams<{ id: string; vehicleId: string }>();
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
      entityType: "client",
      entityId: (vehicle as any).client?.id ?? id ?? null,
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
      navigate(`/clients/${id}/vehicles/${vehicleId}`);
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
      navigate(`/clients/${id}`);
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
    })),
    ...openQuotes.slice(0, 4).map((quote) => ({
      type: "quote" as const,
      id: (quote as any).id,
      label: "Quote",
      sublabel: formatCurrency((quote as any).total),
      status: (quote as any).status ?? undefined,
      href: `/quotes/${(quote as any).id}`,
    })),
    ...unpaidInvoices.slice(0, 4).map((invoice) => ({
      type: "invoice" as const,
      id: (invoice as any).id,
      label: (invoice as any).invoiceNumber ?? "Invoice",
      sublabel: formatCurrency((invoice as any).total),
      status: (invoice as any).status ?? undefined,
      href: `/invoices/${(invoice as any).id}`,
    })),
    ...appointmentList.slice(0, 4).map((appointment) => ({
      type: "appointment" as const,
      id: (appointment as any).id,
      label: (appointment as any).title ?? "Appointment",
      sublabel: (appointment as any).startTime ? formatDate((appointment as any).startTime) : undefined,
      status: (appointment as any).status ?? undefined,
      href: `/appointments/${(appointment as any).id}`,
    })),
  ];

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
            Back to Client
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/clients/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to {clientName}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{pageTitle}</h1>
        <span className="ml-auto text-sm text-muted-foreground">{clientName}</span>
        <Button asChild size="sm">
          <Link to={`/appointments/new?clientId=${id}&vehicleId=${vehicleId}`}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            Book Job
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/quotes/new?clientId=${id}&vehicleId=${vehicleId}`}>
            <Receipt className="h-4 w-4 mr-2" />
            New Quote
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/invoices/new?clientId=${id}`}>
            <FileText className="h-4 w-4 mr-2" />
            New Invoice
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
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
          value={formatCurrency(unpaidInvoices.reduce((sum, invoice) => sum + Number((invoice as any).total ?? 0), 0))}
          detail={`${unpaidInvoices.length} awaiting payment`}
        />
      </div>

      {(appointmentsError || quotesError || invoicesError || jobsError) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Could not load full vehicle workflow history.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <ContextualNextStep
            entityType="client"
            status={null}
            data={{
              id: id,
              lastAppointmentDate: appointmentList[0] ? (appointmentList[0] as any).startTime : null,
            }}
          />

          <RelatedRecordsPanel
            records={relatedRecords}
            loading={appointmentsFetching || quotesFetching || invoicesFetching || jobsFetching}
          />

          <Card>
            <CardHeader>
              <CardTitle>Vehicle workflow history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {relatedRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workflow history yet for this vehicle.</p>
              ) : (
                relatedRecords.map((record) => (
                  <Link
                    key={`${record.type}-${record.id}`}
                    to={record.href}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{record.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {record.sublabel ?? record.type}
                      </p>
                    </div>
                    {record.status ? (
                      <Badge className={statusClass(record.status)}>{record.status}</Badge>
                    ) : null}
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Vehicle Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="vin">VIN</Label>
                <Input
                  id="vin"
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  placeholder="Vehicle Identification Number (optional)"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
                  onClick={() => setShowMoreDetails((v) => !v)}
                >
                  {showMoreDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  More Details
                </button>

                {showMoreDetails && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => navigate(`/clients/${id}`)}>
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
