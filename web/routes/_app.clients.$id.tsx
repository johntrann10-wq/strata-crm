import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useFindOne, useFindMany, useAction, useGlobalAction } from "@gadgetinc/react";
import { api } from "../api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Pencil, CalendarPlus, FileText, MoreVertical, Loader2 } from "lucide-react";
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

const blank: FormState = { firstName: "", lastName: "", email: "", phone: "", address: "", city: "", state: "", zip: "", notes: "", internalNotes: "", source: "", tags: [], preferredContact: "email", marketingOptIn: true };
const toForm = (c: any): FormState => ({ firstName: c.firstName ?? "", lastName: c.lastName ?? "", email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", city: c.city ?? "", state: c.state ?? "", zip: c.zip ?? "", notes: c.notes ?? "", internalNotes: c.internalNotes ?? "", source: c.source ?? "", tags: c.tags ?? [], preferredContact: c.preferredContact ?? "email", marketingOptIn: c.marketingOptIn ?? true });

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blank);
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const { setPageContext } = usePageContext();
  const [{ data: client, fetching, error }, refetch] = useFindOne(api.client, id!, { select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true, city: true, state: true, zip: true, notes: true, internalNotes: true, source: true, tags: true, preferredContact: true, marketingOptIn: true, createdAt: true, business: { id: true } } });
  const [{ data: vehicles }] = useFindMany(api.vehicle, { filter: { clientId: { equals: id } }, select: { id: true, make: true, model: true, year: true, color: true, licensePlate: true, paintType: true, mileage: true } });
  const [{ data: appointments }] = useFindMany(api.appointment, { filter: { clientId: { equals: id } }, sort: { startTime: "Descending" }, first: 20, select: { id: true, startTime: true, status: true, title: true, totalPrice: true, vehicle: { make: true, model: true, year: true } } });
  const [{ fetching: saving, error: saveError }, runUpdate] = useAction(api.client.update);
  const [{ fetching: deleting }, runDelete] = useAction(api.client.delete);
  const [{ fetching: sendingPortal }, runGeneratePortalToken] = useGlobalAction(api.generatePortalToken);
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

  const handleSendPortalLink = async () => {
    const result = await runGeneratePortalToken({ clientId: id! });
    if (result?.error) {
      toast.error(result.error.message);
    } else {
      toast.success("Portal link sent to client!");
    }
  };
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
  const totalSpend = appointments?.reduce((s, a) => s + (a.totalPrice ?? 0), 0) ?? 0;

  // For clients with 20+ appointments a backend pagination solution would be needed.
  const displayedAppointments = showAllAppointments
    ? (appointments ?? [])
    : (appointments ?? []).slice(0, 5);

  const lastAppointmentDate =
    appointments && appointments.length > 0 ? appointments[0].startTime : null;

  const relatedRecords = [
    ...(
      appointments ?? []
    ).map((a) => ({
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={handleSendPortalLink}
              disabled={sendingPortal || !client.email}
              title={client.email ? "Send a magic link to the client to access their self-service portal" : "Client has no email address on file"}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Send Portal Link
            </DropdownMenuItem>
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
              This will archive the client record and hide them from your active client list. Their appointment history, vehicles, and invoices are preserved. You can restore archived clients from the Recovery page.
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
          <VehiclesCard id={id} vehicles={vehicles ?? []} />
        </div>
        <div className="lg:col-span-3">
          <AppointmentHistoryCard id={id} appointments={displayedAppointments} totalSpend={totalSpend} />
          {!showAllAppointments && (appointments?.length ?? 0) > 5 && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllAppointments(true)}
              >
                Show all {appointments?.length} appointments
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