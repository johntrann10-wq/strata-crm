import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useOutletContext } from "react-router";
import { useFindOne, useAction, useFindMany } from "../hooks/useApi";
import { api } from "../api";
import { toast } from "sonner";
import type { AuthOutletContext } from "./_app";
import { ContextualNextStep } from "../components/shared/ContextualNextStep";
import { RelatedRecordsPanel, type RelatedRecord } from "../components/shared/RelatedRecordsPanel";
import { usePageContext } from "../components/shared/CommandPaletteContext";
import { CommunicationCard } from "../components/shared/CommunicationCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Send,
  Check,
  X,
  Loader2,
  FileText,
  User,
  Car,
  Calendar,
  DollarSign,
  Mail,
  Phone,
  CalendarPlus,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";

const StatusBadge = ({ status }: { status: string }) => {
  const variants: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 border-gray-200",
    sent: "bg-blue-100 text-blue-700 border-blue-200",
    accepted: "bg-green-100 text-green-700 border-green-200",
    declined: "bg-red-100 text-red-700 border-red-200",
    expired: "bg-amber-100 text-amber-700 border-amber-200",
  };
  return (
    <Badge
      className={cn(
        "capitalize border",
        variants[status] ?? "bg-gray-100 text-gray-700 border-gray-200"
      )}
    >
      {status}
    </Badge>
  );
};

const formatCurrency = (amount: number | null | undefined): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount ?? 0);
};

const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export default function QuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { permissions } = useOutletContext<AuthOutletContext>();
  const canWriteQuotes = permissions.has("quotes.write");

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [showDeleteQliDialog, setShowDeleteQliDialog] = useState(false);
  const [pendingDeleteQliId, setPendingDeleteQliId] = useState<string | null>(null);
  const [editingQliId, setEditingQliId] = useState<string | null>(null);
  const [editQliValues, setEditQliValues] = useState<{ description: string; qty: number; unitPrice: number }>({ description: "", qty: 1, unitPrice: 0 });
  const [addQliOpen, setAddQliOpen] = useState(false);
  const [newQliDesc, setNewQliDesc] = useState("");
  const [newQliQty, setNewQliQty] = useState("1");
  const [newQliPrice, setNewQliPrice] = useState("");

  const { setPageContext } = usePageContext();

  const [{ data: quote, fetching, error }, refetch] = useFindOne(
    api.quote,
    id!,
    {
      select: {
        id: true,
        status: true,
        notes: true,
        subtotal: true,
        taxRate: true,
        taxAmount: true,
        total: true,
        sentAt: true,
        acceptedAt: true,
        expiresAt: true,
        createdAt: true,
        client: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
        vehicle: {
          id: true,
          year: true,
          make: true,
          model: true,
          color: true,
        },
        lineItems: {
          edges: {
            node: {
              id: true,
              description: true,
              quantity: true,
              unitPrice: true,
              total: true,
              taxable: true,
            },
          },
        },
      },
    }
  );

  useEffect(() => {
    setPageContext({
      entityType: "quote",
      entityId: id ?? null,
      entityLabel: quote
        ? "Quote for " + quote.client.firstName + " " + quote.client.lastName
        : null,
      clientId: quote?.client?.id ?? null,
      clientName: quote?.client
        ? quote.client.firstName + " " + quote.client.lastName
        : null,
      vehicleId: quote?.vehicle?.id ?? null,
      vehicleLabel: quote?.vehicle
        ? [quote.vehicle.year, quote.vehicle.make, quote.vehicle.model]
            .filter(Boolean)
            .join(" ")
        : null,
      appointmentId: (quote as any)?.appointmentId ?? null,
      invoiceId: null,
    });
    return () => setPageContext(null);
  }, [quote, id, setPageContext]);

  const [{ fetching: sending }, runSend] = useAction(api.quote.send);
  const [{ fetching: followingUp }, runSendFollowUp] = useAction(api.quote.sendFollowUp);
  const [{ fetching: updating }, runUpdate] = useAction(api.quote.update);
  const [{ fetching: deleting }, runDelete] = useAction(api.quote.delete);
  const [{ fetching: updatingQli }, updateQli] = useAction(api.quoteLineItem.update);
  const [{ fetching: deletingQli }, deleteQli] = useAction(api.quoteLineItem.delete);
  const [{ fetching: creatingQli }, createQli] = useAction(api.quoteLineItem.create);
  const [{ data: activityLogs }, refetchActivity] = useFindMany(
    api.activityLog,
    { entityType: "quote", entityId: id, first: 10, pause: !id } as any
  );

  useEffect(() => {
    if (
      quote &&
      quote.status === "sent" &&
      quote.expiresAt &&
      new Date(quote.expiresAt) < new Date()
    ) {
      void runUpdate({ id: id!, status: "expired" as any }).then(() => {
        void refetch();
      });
    }
  }, [quote?.id, quote?.status, quote?.expiresAt]);

  const handleSend = async (message?: string) => {
    const result = await runSend({ id: id!, message });
    if (result.error) {
      toast.error("Failed to send quote: " + result.error.message);
    } else {
      toast.success((result.data as any)?.deliveryStatus === "emailed" ? "Quote emailed to client" : "Quote recorded as sent");
      void refetch();
      void refetchActivity();
    }
    return result;
  };

  const handleSendFollowUp = async (message?: string) => {
    const result = await runSendFollowUp({ id: id!, message });
    if (result.error) {
      toast.error("Failed to send follow-up: " + result.error.message);
    } else {
      toast.success((result.data as any)?.deliveryStatus === "emailed" ? "Follow-up emailed to client" : "Follow-up recorded");
      void refetchActivity();
    }
    return result;
  };

  const handleMarkDeclined = async () => {
    const result = await runUpdate({ id: id!, status: "declined" as const });
    if (result.error) {
      toast.error("Failed to mark as declined: " + result.error.message);
      return;
    }
    toast.success("Quote marked as declined");
    setShowDeclineDialog(false);
    void refetch();
  };

  const handleDelete = async () => {
    const result = await runDelete({ id: id! });
    if (result.error) {
      toast.error("Failed to delete quote: " + result.error.message);
      return;
    }
    toast.success("Quote deleted");
    navigate("/quotes");
  };

  const handleMarkAccepted = async () => {
    const result = await runUpdate({ id: id!, status: "accepted" as any });
    if (result.error) {
      toast.error("Failed to mark as accepted: " + result.error.message);
    } else {
      toast.success("Quote marked as accepted!");
      void refetch();
    }
  };

  const handleSaveQli = async () => {
    const { description, qty, unitPrice } = editQliValues;
    const result = await updateQli({
      id: editingQliId!,
      description,
      quantity: qty,
      unitPrice,
      total: qty * unitPrice,
    });
    if (result.error) {
      toast.error("Failed to update line item: " + result.error.message);
    } else {
      toast.success("Line item updated");
      setEditingQliId(null);
      void refetch();
    }
  };

  const handleDeleteQli = (qliId: string) => {
    setPendingDeleteQliId(qliId);
    setShowDeleteQliDialog(true);
  };

  const confirmDeleteQli = async () => {
    if (!pendingDeleteQliId) return;
    const result = await deleteQli({ id: pendingDeleteQliId });
    if (result.error) {
      toast.error("Failed to delete line item: " + result.error.message);
    } else {
      void refetch();
    }
    setShowDeleteQliDialog(false);
    setPendingDeleteQliId(null);
  };

  const handleAddQli = async () => {
    const qty = parseInt(newQliQty) || 1;
    const price = parseFloat(newQliPrice) || 0;
    const result = await createQli({
      quote: { _link: id! },
      description: newQliDesc,
      quantity: qty,
      unitPrice: price,
      total: qty * price,
    });
    if (result.error) {
      toast.error("Failed to add line item: " + result.error.message);
    } else {
      setAddQliOpen(false);
      setNewQliDesc("");
      setNewQliQty("1");
      setNewQliPrice("");
      void refetch();
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">
          {error?.message ?? "Quote not found"}
        </p>
        <Button variant="outline" asChild>
          <Link to="/quotes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Quotes
          </Link>
        </Button>
      </div>
    );
  }

  const relatedRecords: RelatedRecord[] = [];
  if (quote.client && quote.vehicle) {
    relatedRecords.push({
      type: "client",
      id: quote.client.id,
      label: quote.client.firstName + " " + quote.client.lastName,
      href: `/clients/${quote.client.id}/vehicles/${quote.vehicle.id}`,
    });
    relatedRecords.push({
      type: "vehicle",
      id: quote.vehicle.id,
      label: [quote.vehicle.year, quote.vehicle.make, quote.vehicle.model]
        .filter(Boolean)
        .join(" "),
      href: `/clients/${quote.client.id}`,
    });
  }
  if ((quote as any).appointmentId) {
    relatedRecords.push({
      type: "appointment",
      id: (quote as any).appointmentId,
      label: "Scheduled appointment",
      href: `/appointments/${(quote as any).appointmentId}`,
    });
  }

  const clientName = `${quote.client.firstName} ${quote.client.lastName}`;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/quotes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold">Quote for {clientName}</h1>
            <StatusBadge status={quote.status} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(quote.status === "draft" || quote.status === "sent") && (
            <Button
              onClick={() => void handleSend()}
              disabled={sending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Mark as sent
            </Button>
          )}
          {quote.status === "sent" && (
            <Button
              variant="outline"
              onClick={() => setShowDeclineDialog(true)}
              disabled={updating}
            >
              <X className="mr-2 h-4 w-4" />
              Mark Declined
            </Button>
          )}
          <Button
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleting}
          >
            Delete
          </Button>
        </div>
      </div>

      <ContextualNextStep
        entityType="quote"
        status={quote.status}
        data={{ id: id, clientId: quote.client?.id, appointmentId: null, sentAt: quote.sentAt }}
      />
      <RelatedRecordsPanel records={relatedRecords} loading={fetching} />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Line Items</CardTitle>
              {quote.status === "draft" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setAddQliOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                      Description
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                      Qty
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                      Unit Price
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                      Total
                    </th>
                    <th className="w-16 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {quote.lineItems.edges.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No line items
                      </td>
                    </tr>
                  ) : (
                    quote.lineItems.edges.map(({ node }: any) =>
                      editingQliId === node.id ? (
                        <tr key={node.id} className="border-b last:border-0">
                          <td className="px-2 py-1.5">
                            <Input
                              value={editQliValues.description}
                              onChange={(e) =>
                                setEditQliValues((v) => ({ ...v, description: e.target.value }))
                              }
                              className="h-7 text-sm"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              value={editQliValues.qty}
                              onChange={(e) =>
                                setEditQliValues((v) => ({ ...v, qty: parseFloat(e.target.value) || 0 }))
                              }
                              className="h-7 text-sm w-16 text-right"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              value={editQliValues.unitPrice}
                              onChange={(e) =>
                                setEditQliValues((v) => ({ ...v, unitPrice: parseFloat(e.target.value) || 0 }))
                              }
                              className="h-7 text-sm w-24 text-right"
                            />
                          </td>
                          <td className="text-right px-4 py-1.5 text-muted-foreground">
                            {formatCurrency(editQliValues.qty * editQliValues.unitPrice)}
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => void handleSaveQli()}
                                disabled={updatingQli}
                              >
                                {updatingQli ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => setEditingQliId(null)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={node.id} className="border-b last:border-0">
                          <td className="px-4 py-2">{node.description}</td>
                          <td className="text-right px-4 py-2">{node.quantity}</td>
                          <td className="text-right px-4 py-2">
                            {formatCurrency(node.unitPrice)}
                          </td>
                          <td className="text-right px-4 py-2">
                            {formatCurrency(node.total)}
                          </td>
                          <td className="px-2 py-2">
                            {quote.status === "draft" && (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setEditingQliId(node.id);
                                    setEditQliValues({
                                      description: node.description,
                                      qty: node.quantity ?? 1,
                                      unitPrice: node.unitPrice ?? 0,
                                    });
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => void handleDeleteQli(node.id)}
                                  disabled={deletingQli}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
                <tfoot className="border-t bg-muted/20">
                  <tr>
                    <td
                      colSpan={4}
                      className="text-right px-4 py-2 text-muted-foreground"
                    >
                      Subtotal
                    </td>
                    <td className="text-right px-4 py-2">
                      {formatCurrency(quote.subtotal)}
                    </td>
                  </tr>
                  {(quote.taxRate ?? 0) > 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-right px-4 py-2 text-muted-foreground"
                      >
                        Tax ({quote.taxRate}%)
                      </td>
                      <td className="text-right px-4 py-2">
                        {formatCurrency(quote.taxAmount)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td
                      colSpan={4}
                      className="text-right px-4 py-2 font-bold"
                    >
                      Total
                    </td>
                    <td className="text-right px-4 py-2 font-bold">
                      {formatCurrency(quote.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Notes Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {quote.notes ? (
                <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No notes</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Client Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" />
                Client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link
                to={`/clients/${quote.client.id}`}
                className="text-blue-600 hover:underline font-medium text-sm block"
              >
                {clientName}
              </Link>
              {quote.client.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{quote.client.email}</span>
                </div>
              )}
              {quote.client.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{quote.client.phone}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vehicle Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Car className="h-4 w-4" />
                Vehicle
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quote.vehicle ? (
                <div className="space-y-1">
                  <Link
                    to={`/clients/${quote.client?.id}/vehicles/${quote.vehicle?.id}`}
                    className="font-medium text-sm text-blue-600 hover:underline"
                  >
                    {quote.vehicle.year} {quote.vehicle.make} {quote.vehicle.model}
                  </Link>
                  {quote.vehicle.color && (
                    <p className="text-sm text-muted-foreground">
                      {quote.vehicle.color}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No vehicle</p>
              )}
            </CardContent>
          </Card>

          {/* Quote Details Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Quote Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Created</span>
                <span className="text-right">{formatDate(quote.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Expires</span>
                <span className="text-right">
                  {quote.expiresAt ? formatDate(quote.expiresAt) : "No expiry"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Sent</span>
                <span className="text-right">
                  {quote.sentAt ? formatDate(quote.sentAt) : "Not sent yet"}
                </span>
              </div>
              {quote.acceptedAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Accepted</span>
                  <span className="text-right">{formatDate(quote.acceptedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <CommunicationCard
            title="Client communication"
            recipient={quote.client.email}
            primaryLabel={quote.status === "sent" ? "Resend quote" : "Send quote"}
            followUpLabel="Send follow-up"
            activities={((activityLogs ?? []) as any[]).filter((record) => record.type === "quote.sent" || record.type === "quote.follow_up_recorded")}
            sending={sending || followingUp}
            canSend={canWriteQuotes}
            onPrimarySend={handleSend}
            onFollowUpSend={handleSendFollowUp}
          />

          {/* Actions Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quote.status === "accepted" && (
                <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                  <div className="flex items-center gap-2 font-medium">
                    <Check className="h-4 w-4" />
                    Quote Accepted
                  </div>
                  {quote.acceptedAt && (
                    <p className="mt-1 text-green-700 text-xs">
                      {formatDate(quote.acceptedAt)}
                    </p>
                  )}
                </div>
              )}
              {quote.status === "sent" && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => void handleMarkAccepted()}
                  disabled={updating}
                >
                  {updating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Mark as Accepted
                </Button>
              )}
              {(quote.status === "sent" || quote.status === "accepted") && (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() =>
                    navigate(`/appointments/new?quoteId=${id}&clientId=${quote.client.id}`)
                  }
                  disabled={Boolean((quote as any).appointmentId)}
                >
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  {(quote as any).appointmentId ? "Already Scheduled" : "Book Appointment"}
                </Button>
              )}
              {(quote as any).appointmentId && (
                <Button variant="outline" className="w-full" asChild>
                  <Link to={`/appointments/${(quote as any).appointmentId}`}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Open Scheduled Job
                  </Link>
                </Button>
              )}
              <Button variant="outline" className="w-full" asChild>
                <Link to={`/invoices/new?clientId=${quote.client.id}&quoteId=${quote.id}`}>
                  <FileText className="mr-2 h-4 w-4" />
                  Create Invoice
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Line Item Dialog */}
      <Dialog open={addQliOpen} onOpenChange={setAddQliOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={newQliDesc}
                onChange={(e) => setNewQliDesc(e.target.value)}
                placeholder="Service or item description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Quantity</label>
                <Input
                  type="number"
                  value={newQliQty}
                  onChange={(e) => setNewQliQty(e.target.value)}
                  min="1"
                  placeholder="1"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Unit Price</label>
                <Input
                  type="number"
                  value={newQliPrice}
                  onChange={(e) => setNewQliPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
            </div>
            {newQliDesc && newQliPrice && (
              <p className="text-sm text-muted-foreground">
                Total: {formatCurrency((parseInt(newQliQty) || 1) * (parseFloat(newQliPrice) || 0))}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddQliOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleAddQli()}
              disabled={creatingQli || !newQliDesc.trim()}
            >
              {creatingQli ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The quote will be permanently
              deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Line Item Alert Dialog */}
      <AlertDialog open={showDeleteQliDialog} onOpenChange={setShowDeleteQliDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Line Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This line item will be permanently removed from the quote.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteQli()}
              disabled={deletingQli}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decline Alert Dialog */}
      <AlertDialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as declined?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the quote as declined. The client will not be
              notified automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkDeclined}>
              {updating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
