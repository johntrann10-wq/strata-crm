import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useOutletContext, useSearchParams } from "react-router";
import { useFindOne, useAction, useFindMany } from "../hooks/useApi";
import { API_BASE, api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Ban,
  CreditCard,
  CalendarClock,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Send,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getCurrentBusinessId } from "@/lib/auth";
import { getTransactionalEmailErrorMessage } from "@/lib/transactionalEmail";
import { invoiceAllowsPayment, validatePaymentAmount } from "@/lib/validation";
import { printAuthenticatedDocument } from "@/lib/printDocument";
import { ContextualNextStep } from "../components/shared/ContextualNextStep";
import { RelatedRecordsPanel, type RelatedRecord } from "../components/shared/RelatedRecordsPanel";
import { usePageContext } from "../components/shared/CommandPaletteContext";
import { InvoiceLineItemsTable } from "../components/invoices/InvoiceLineItemsTable";
import { CommunicationCard } from "../components/shared/CommunicationCard";
import { ActivityFeedCard } from "../components/shared/ActivityFeedCard";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { PageHeader } from "../components/shared/PageHeader";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  partial: "bg-yellow-100 text-yellow-700 border-yellow-200",
  void: "bg-red-100 text-red-700 border-red-200",
};

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function capitalize(str: string | null | undefined): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getClientDisplayName(client: Record<string, any> | null | undefined) {
  if (!client) return null;
  return [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || "No client";
}

function getAppointmentVehicleLabel(appointment: Record<string, any> | null | undefined) {
  const vehicle = appointment?.vehicle as Record<string, any> | undefined;
  return vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") : null;
}

async function openPrintableInvoice(invoiceId: string, businessId?: string | null) {
  await printAuthenticatedDocument({
    url: `${API_BASE}/api/invoices/${encodeURIComponent(invoiceId)}/html`,
    businessId: businessId ?? getCurrentBusinessId(),
    pendingTitle: "Preparing invoice...",
    loadErrorMessage: "Could not load printable invoice.",
  });
}

/** Normalize line items from API (array or edges.node) */
function normalizeLineItems(inv: Record<string, unknown> | null | undefined): Array<{ id: string; description?: string; quantity?: number; unitPrice?: number; total?: number }> {
  if (!inv?.lineItems) return [];
  const li = inv.lineItems as unknown;
  if (Array.isArray(li)) return li as Array<{ id: string; description?: string; quantity?: number; unitPrice?: number; total?: number }>;
  const edges = (li as { edges?: Array<{ node?: unknown }> })?.edges;
  return Array.isArray(edges) ? edges.map((e) => e?.node as { id: string; description?: string; quantity?: number; unitPrice?: number; total?: number }).filter(Boolean) : [];
}

/** Normalize payments from API (array or edges.node) */
function normalizePayments(inv: Record<string, unknown> | null | undefined): Array<{ id: string; amount?: number; method?: string; createdAt?: string; paidAt?: string; reversedAt?: string | null; notes?: string | null }> {
  if (!inv?.payments) return [];
  const p = inv.payments as unknown;
  if (Array.isArray(p)) return p as Array<{ id: string; amount?: number; method?: string; createdAt?: string; paidAt?: string; reversedAt?: string | null; notes?: string | null }>;
  const edges = (p as { edges?: Array<{ node?: unknown }> })?.edges;
  return Array.isArray(edges)
    ? edges
        .map((e) => e?.node as { id: string; amount?: number; method?: string; createdAt?: string; paidAt?: string; reversedAt?: string | null; notes?: string | null })
        .filter(Boolean)
    : [];
}

function WorkflowLinkCard({
  icon: Icon,
  label,
  value,
  href,
  actionLabel,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
  href: string | null;
  actionLabel: string;
}) {
  return (
    <div className="rounded-[1rem] border border-white/65 bg-white/78 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
          {href ? (
            <Button asChild variant="link" className="mt-1 h-auto justify-start px-0 text-sm">
              <Link to={href}>{actionLabel}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CollectionActionCard({
  title,
  detail,
  amount,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  primaryDisabled,
  secondaryDisabled,
  primaryLoading,
}: {
  title: string;
  detail: string;
  amount: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  primaryDisabled?: boolean;
  secondaryDisabled?: boolean;
  primaryLoading?: boolean;
}) {
  return (
    <Card className="border-white/65">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-2xl font-semibold">{amount}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={onPrimary} disabled={primaryDisabled}>
            {primaryLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            {primaryLabel}
          </Button>
          {secondaryLabel && onSecondary ? (
            <Button variant="outline" onClick={onSecondary} disabled={secondaryDisabled}>
              <Send className="mr-2 h-4 w-4" />
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { permissions, currentLocationId } = useOutletContext<AuthOutletContext>();
  const canWritePayments = permissions.has("payments.write") || permissions.has("invoices.write");
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/invoices";
  const hasQueueReturn = searchParams.has("from");
  const withReturn = (pathname: string) =>
    `${pathname}${pathname.includes("?") ? "&" : "?"}from=${encodeURIComponent(returnTo)}`;

  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [addLineItemOpen, setAddLineItemOpen] = useState(false);
  const [paymentToReverse, setPaymentToReverse] = useState<string | null>(null);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentNotes, setPaymentNotes] = useState("");

  // Line item form state
  const [lineItemDescription, setLineItemDescription] = useState("");
  const [lineItemQuantity, setLineItemQuantity] = useState("1");
  const [lineItemUnitPrice, setLineItemUnitPrice] = useState("");

  const [showDeleteLineItemDialog, setShowDeleteLineItemDialog] = useState(false);
  const [pendingDeleteLineItemId, setPendingDeleteLineItemId] = useState<string | null>(null);

  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(null);
  const [editLineItemValues, setEditLineItemValues] = useState<{
    description: string;
    qty: number;
    unitPrice: number;
  }>({ description: "", qty: 1, unitPrice: 0 });

  const [{ data: invoice, fetching, error }, refetch] = useFindOne(api.invoice, id ?? null, {
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      subtotal: true,
      taxRate: true,
      taxAmount: true,
      discountAmount: true,
      total: true,
      notes: true,
      createdAt: true,
      dueDate: true,
      paidAt: true,
      business: { id: true },
      client: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
      appointment: {
        id: true,
        startTime: true,
        vehicle: {
          year: true,
          make: true,
          model: true,
        },
      },
      lineItems: {
        edges: {
          node: {
            id: true,
            description: true,
            quantity: true,
            unitPrice: true,
            total: true,
          },
        },
      },
      payments: {
        edges: {
          node: {
            id: true,
            amount: true,
            method: true,
            createdAt: true,
          },
        },
      },
    },
  });
  const [{ data: activityLogs, fetching: activityFetching }, refetchActivity] = useFindMany(
    api.activityLog,
    { entityType: "invoice", entityId: id, first: 10, pause: !id } as any
  );

  const [{ fetching: sendingToClient }, sendToClient] = useAction(api.invoice.sendToClient);
  const [{ fetching: creatingStripePaymentSession }, createStripePaymentSession] = useAction(
    api.invoice.createStripePaymentSession
  );
  const [{ fetching: voidingInvoice }, voidInvoiceAction] = useAction(api.invoice.voidInvoice);
  const [{ fetching: creatingPayment }, createPayment] = useAction(api.payment.create);
  const [{ fetching: reversingPayment }, reversePayment] = useAction(api.payment.reversePayment);
  const [{ fetching: creatingLineItem }, createLineItem] = useAction(api.invoiceLineItem.create);
  const [{ fetching: updatingLineItem }, updateLineItem] = useAction((params: Record<string, unknown>) =>
    api.invoiceLineItem.update(params.id as string, {
      description: params.description,
      quantity: params.quantity,
      unitPrice: params.unitPrice,
    })
  );
  const [{ fetching: deletingLineItem }, deleteLineItem] = useAction((params: Record<string, unknown>) =>
    api.invoiceLineItem.delete(params.id as string)
  );

  const { setPageContext } = usePageContext();

  useEffect(() => {
    if (!invoice) return;
    setPageContext({
      entityType: "invoice",
      entityId: invoice.id,
      entityLabel: invoice.invoiceNumber ?? "Invoice",
      clientId: (invoice.client as any)?.id ?? null,
      clientName: invoice.client
        ? (invoice.client as any).firstName + " " + (invoice.client as any).lastName
        : null,
      vehicleId: null,
      vehicleLabel: null,
      appointmentId: (invoice.appointment as any)?.id ?? null,
      invoiceId: invoice.id,
    });
    return () => setPageContext(null);
  }, [invoice, setPageContext]);

  const paymentsList = normalizePayments(invoice as Record<string, unknown>);
  const lineItemsList = normalizeLineItems(invoice as Record<string, unknown>);
  const totalPaid = paymentsList.reduce((sum, p) => sum + (p.reversedAt ? 0 : Number(p.amount || 0)), 0);
  const remainingBalance = Number((invoice as Record<string, unknown>)?.total || 0) - totalPaid;

  const handleOpenPaymentDialog = useCallback(() => {
    setPaymentAmount(remainingBalance > 0 ? remainingBalance.toFixed(2) : "0.00");
    setPaymentMethod("cash");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentNotes("");
    setRecordPaymentOpen(true);
  }, [remainingBalance]);

  useEffect(() => {
    if (!invoice?.id) return;
    if (searchParams.get("recordPayment") !== "1") return;
    if (!invoiceAllowsPayment(invoice.status)) return;
    handleOpenPaymentDialog();
    const next = new URLSearchParams(searchParams);
    next.delete("recordPayment");
    setSearchParams(next, { replace: true });
  }, [handleOpenPaymentDialog, invoice?.id, invoice?.status, searchParams, setSearchParams]);

  useEffect(() => {
    const stripeState = searchParams.get("stripe");
    if (!invoice?.id || !stripeState) return;
    if (stripeState === "success") {
      toast.success("Stripe payment submitted. Refreshing invoice status...");
      void refetch();
    } else if (stripeState === "canceled") {
      toast.message("Stripe checkout was canceled.");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("stripe");
    setSearchParams(next, { replace: true });
  }, [invoice?.id, refetch, searchParams, setSearchParams]);

  const handleRecordPayment = async () => {
    if (!invoice?.id) return;
    const amountNum = parseFloat(paymentAmount);
    const validation = validatePaymentAmount(amountNum, remainingBalance);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    const [py, pm, pd] = paymentDate.split("-").map(Number);
    const paidAtDate = new Date(py, pm - 1, pd);
    const result = await createPayment({
      invoiceId: invoice.id,
      amount: amountNum,
      method: paymentMethod,
      paidAt: paidAtDate.toISOString(),
      notes: paymentNotes || undefined,
    });
    if (!result.error) {
      toast.success("Payment recorded successfully");
      setRecordPaymentOpen(false);
      void refetch();
    } else {
      toast.error("Failed to record payment: " + result.error.message);
    }
  };

  const handleStripeCheckout = async () => {
    if (!invoice?.id) return;
    const result = await createStripePaymentSession({ id: invoice.id });
    if (result.error) {
      toast.error("Failed to start Stripe checkout: " + result.error.message);
      return;
    }
    const url = (result.data as { url?: string } | undefined)?.url;
    if (!url) {
      toast.error("Stripe checkout did not return a payment link.");
      return;
    }
    window.location.assign(url);
  };

  const handleAddLineItem = async () => {
    if (!invoice?.id) return;
    const qty = parseInt(lineItemQuantity, 10) || 1;
    const unitPrice = parseFloat(lineItemUnitPrice) || 0;
    if (!lineItemDescription.trim()) {
      toast.error("Description is required.");
      return;
    }
    if (unitPrice < 0) {
      toast.error("Unit price cannot be negative.");
      return;
    }
    const result = await createLineItem({
      invoiceId: invoice.id,
      description: lineItemDescription.trim(),
      quantity: qty,
      unitPrice,
    });
    if (!result.error) {
      toast.success("Line item added");
      setAddLineItemOpen(false);
      setLineItemDescription("");
      setLineItemQuantity("1");
      setLineItemUnitPrice("");
      void refetch();
    } else {
      toast.error("Failed to add line item: " + result.error.message);
    }
  };

  const handleMarkAsSent = async (payload?: {
    message?: string;
    recipientEmail?: string;
    recipientName?: string;
  }) => {
    if (!invoice?.id) return;
    const result = await sendToClient({ id: invoice.id, ...payload });
    if (!result.error) {
      const deliveryStatus = (result.data as any)?.deliveryStatus;
      if (deliveryStatus === "emailed") {
        toast.success("Invoice emailed to client");
      } else {
        toast.warning("Invoice was marked as sent, but email was not delivered");
      }
      void refetch();
      void refetchActivity();
    } else {
      toast.error(getTransactionalEmailErrorMessage(result.error, "Invoice"));
    }
    return result;
  };

  const handleVoid = async () => {
    if (!invoice?.id) return;
    const result = await voidInvoiceAction({ id: invoice.id });
    if (!result.error) {
      toast.success("Invoice voided");
      void refetch();
    } else {
      toast.error("Failed to void invoice");
    }
  };

  const handleReversePayment = async () => {
    if (!paymentToReverse) return;
    const result = await reversePayment({ id: paymentToReverse });
    if (!result.error) {
      toast.success("Payment reversed");
      setPaymentToReverse(null);
      void refetch();
    } else {
      toast.error("Failed to reverse payment: " + result.error.message);
    }
  };

  const handleEditLineItem = (item: any) => {
    setEditingLineItemId(item.id);
    setEditLineItemValues({
      description: item.description,
      qty: item.quantity,
      unitPrice: item.unitPrice,
    });
  };

  const handleCancelEditLineItem = () => {
    setEditingLineItemId(null);
  };

  const handleSaveLineItem = async () => {
    if (!editingLineItemId) return;
    const qty = editLineItemValues.qty;
    const unitPrice = editLineItemValues.unitPrice;
    const result = await updateLineItem({
      id: editingLineItemId,
      description: editLineItemValues.description,
      quantity: qty,
      unitPrice,
    });
    if (!result.error) {
      toast.success("Line item updated");
      setEditingLineItemId(null);
      void refetch();
    } else {
      toast.error("Failed to update line item: " + result.error.message);
    }
  };

  const handleDeleteLineItem = (itemId: string) => {
    setPendingDeleteLineItemId(itemId);
    setShowDeleteLineItemDialog(true);
  };

  const confirmDeleteLineItem = async () => {
    if (!pendingDeleteLineItemId) return;
    const result = await deleteLineItem({ id: pendingDeleteLineItemId } as Record<string, unknown>);
    if (!result.error) {
      toast.success("Line item removed");
      void refetch();
    } else {
      toast.error("Failed to remove line item: " + result.error.message);
    }
    setShowDeleteLineItemDialog(false);
    setPendingDeleteLineItemId(null);
  };

  if (!id) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <p className="text-muted-foreground">Invalid invoice ID.</p>
        <Link to={returnTo} className="text-sm text-primary mt-2 inline-block">Back to Invoices</Link>
      </div>
    );
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <p className="text-red-500">Error loading invoice: {error.message}</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <p className="text-muted-foreground">Invoice not found.</p>
      </div>
    );
  }

  const invoiceLabel =
    invoice.invoiceNumber ?? `#${String(invoice.id).slice(0, 8).toUpperCase()}`;
  const status = invoice.status ?? "draft";
  const dueDateValue = invoice?.dueDate ? new Date(invoice.dueDate) : null;
  const isOverdue = !!dueDateValue && ["sent", "partial"].includes(status) && dueDateValue.getTime() < Date.now();
  const canEditLineItems = status !== "paid" && status !== "void";

  const clientData = invoice.client as any;
  const appointmentData = invoice.appointment as any;
  const quoteData = (invoice as any).quote;
  const clientDisplayName = getClientDisplayName(clientData);
  const appointmentVehicleLabel = getAppointmentVehicleLabel(appointmentData);

  const relatedRecords: RelatedRecord[] = [];
  if (clientData) {
    relatedRecords.push({
      type: "client",
      id: clientData.id,
      label: clientData.firstName + " " + clientData.lastName,
      href: `/clients/${clientData.id}`,
      actionHref: `/appointments/new?clientId=${clientData.id}${
        currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
      }`,
      actionLabel: "Book",
    });
  }
  if (appointmentData) {
    relatedRecords.push({
      type: "appointment",
      id: appointmentData.id,
      label: "Appointment " + formatDate(appointmentData.startTime),
      sublabel: appointmentData.vehicle
        ? `${appointmentData.vehicle.year} ${appointmentData.vehicle.make} ${appointmentData.vehicle.model}`
        : undefined,
      href: `/appointments/${appointmentData.id}`,
      actionHref: clientData?.id ? `/quotes/new?clientId=${clientData.id}` : undefined,
      actionLabel: clientData?.id ? "Quote" : undefined,
    });
  }
  if (quoteData) {
    relatedRecords.push({
      type: "quote",
      id: quoteData.id,
      label: "Quote",
      sublabel: `${capitalize(quoteData.status)} · ${formatCurrency(Number(quoteData.total ?? 0))}`,
      href: `/quotes/${quoteData.id}`,
      actionHref:
        clientData?.id && String(quoteData.status ?? "") === "accepted" && !appointmentData
          ? `/appointments/new?clientId=${clientData.id}&quoteId=${quoteData.id}${
              currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
            }`
          : undefined,
      actionLabel:
        clientData?.id && String(quoteData.status ?? "") === "accepted" && !appointmentData
          ? "Book"
          : undefined,
    });
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-5 px-3 py-4 sm:p-6">
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to invoices queue" /> : null}
      <PageHeader
        backTo={returnTo}
        title={`Invoice ${invoiceLabel}`}
        badge={
          <Badge
            variant="outline"
            className={STATUS_STYLES[status] ?? STATUS_STYLES["draft"]}
          >
            {capitalize(status)}
          </Badge>
        }
        subtitle={clientDisplayName ? `${clientDisplayName} - ${formatCurrency(invoice.total)} total` : `${formatCurrency(invoice.total)} total`}
        right={
          <div className="flex items-center justify-end gap-2">
            <div className="hidden sm:flex sm:flex-wrap sm:justify-end sm:gap-2">
              {status !== "void" && (
                <Button
                  onClick={() =>
                    void openPrintableInvoice(invoice.id, (invoice.business as { id?: string } | undefined)?.id).catch((error) => {
                      toast.error(error instanceof Error ? error.message : "Could not print invoice");
                    })
                  }
                  variant="ghost"
                  size="sm"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              )}
              {(status === "draft" || status === "sent" || status === "partial") && (
                <Button
                  onClick={() => void handleMarkAsSent()}
                  disabled={sendingToClient}
                  variant="outline"
                  size="sm"
                >
                  {sendingToClient ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Mark as sent
                </Button>
              )}
              {invoiceAllowsPayment(status) && canWritePayments && (
                <Button onClick={handleOpenPaymentDialog} size="sm">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Record Payment
                </Button>
              )}
              {invoiceAllowsPayment(status) && canWritePayments && (
                <Button
                  onClick={() => void handleStripeCheckout()}
                  variant="outline"
                  size="sm"
                  disabled={creatingStripePaymentSession || remainingBalance <= 0}
                >
                  {creatingStripePaymentSession ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  Pay with Stripe
                </Button>
              )}
              {status !== "void" && status !== "paid" ? (
                <Button disabled={voidingInvoice} variant="destructive" size="sm" onClick={() => setShowVoidDialog(true)}>
                  {voidingInvoice ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Ban className="h-4 w-4 mr-2" />
                  )}
                  Void
                </Button>
              ) : null}
            </div>

            <div className="flex w-full items-center gap-2 sm:hidden">
              {invoiceAllowsPayment(status) && canWritePayments ? (
                <Button onClick={handleOpenPaymentDialog} className="flex-1">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Record Payment
                </Button>
              ) : (status === "draft" || status === "sent" || status === "partial") ? (
                <Button
                  onClick={() => void handleMarkAsSent()}
                  disabled={sendingToClient}
                  variant="outline"
                  className="flex-1"
                >
                  {sendingToClient ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Mark as sent
                </Button>
              ) : null}

              {invoiceAllowsPayment(status) && canWritePayments ? (
                <Button
                  onClick={() => void handleStripeCheckout()}
                  variant="outline"
                  className="flex-1"
                  disabled={creatingStripePaymentSession || remainingBalance <= 0}
                >
                  {creatingStripePaymentSession ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  Stripe
                </Button>
              ) : null}

              <Button variant="outline" size="icon" aria-label="More invoice actions" onClick={() => setShowMobileActions(true)}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        }
      />

      <Dialog open={showMobileActions} onOpenChange={setShowMobileActions}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Invoice actions</DialogTitle>
            <DialogDescription>Take the next billing action without losing your place.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {status !== "void" ? (
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  setShowMobileActions(false);
                  void openPrintableInvoice(invoice.id, (invoice.business as { id?: string } | undefined)?.id).catch((error) => {
                    toast.error(error instanceof Error ? error.message : "Could not print invoice");
                  });
                }}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print invoice
              </Button>
            ) : null}
            {(status === "draft" || status === "sent" || status === "partial") && !invoiceAllowsPayment(status) ? (
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  setShowMobileActions(false);
                  void handleMarkAsSent();
                }}
                disabled={sendingToClient}
              >
                <Send className="mr-2 h-4 w-4" />
                Mark as sent
              </Button>
            ) : null}
            {status !== "void" && status !== "paid" ? (
              <Button
                variant="destructive"
                className="justify-start"
                onClick={() => {
                  setShowMobileActions(false);
                  setShowVoidDialog(true);
                }}
              >
                <Ban className="mr-2 h-4 w-4" />
                Void invoice
              </Button>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMobileActions(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The invoice will be permanently voided.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleVoid}
            >
              Void
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-white/65">
          <CardContent className="space-y-1 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Balance due</p>
            <p className={cn("text-2xl font-semibold", remainingBalance > 0 ? "text-foreground" : "text-emerald-700")}>
              {formatCurrency(remainingBalance)}
            </p>
            <p className="text-sm text-muted-foreground">
              {remainingBalance > 0 ? "Outstanding amount to collect" : "Fully collected"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-white/65">
          <CardContent className="space-y-1 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Invoice total</p>
            <p className="text-2xl font-semibold">{formatCurrency(invoice.total)}</p>
            <p className="text-sm text-muted-foreground">Subtotal, tax, and discount already included</p>
          </CardContent>
        </Card>
        <Card className="border-white/65">
          <CardContent className="space-y-1 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Due date</p>
            <p className="text-lg font-semibold">{invoice.dueDate ? formatDate(invoice.dueDate) : "No due date"}</p>
            <p className={cn("text-sm", isOverdue ? "text-red-700" : "text-muted-foreground")}>
              {isOverdue ? "Past due and needs collection follow-up" : invoice.paidAt ? `Paid ${formatDate(invoice.paidAt)}` : "Track payment timing here"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-white/65">
          <CardContent className="space-y-1 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Client</p>
            <p className="truncate text-lg font-semibold">
              {clientDisplayName ?? "No client"}
            </p>
            <p className="truncate text-sm text-muted-foreground">{clientData?.email || clientData?.phone || "No direct contact on file"}</p>
          </CardContent>
        </Card>
      </div>

      <ContextualNextStep
        entityType="invoice"
        status={status}
        data={{ dueDate: invoice.dueDate }}
        onActionClick={() => handleOpenPaymentDialog()}
      />

      <RelatedRecordsPanel records={relatedRecords} loading={fetching} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items Table */}
          <InvoiceLineItemsTable
            lineItems={lineItemsList}
            canEditLineItems={canEditLineItems}
            editingLineItemId={editingLineItemId}
            editLineItemValues={editLineItemValues}
            onEditChange={setEditLineItemValues}
            onEditStart={handleEditLineItem}
            onEditCancel={handleCancelEditLineItem}
            onEditSave={handleSaveLineItem}
            onDelete={handleDeleteLineItem}
            updatingLineItem={updatingLineItem}
            deletingLineItem={deletingLineItem}
            onAddClick={() => setAddLineItemOpen(true)}
            subtotal={invoice.subtotal}
            taxRate={invoice.taxRate}
            taxAmount={invoice.taxAmount}
            discountAmount={invoice.discountAmount}
            total={invoice.total}
            totalPaid={totalPaid}
            remainingBalance={remainingBalance}
          />

          {/* Payment History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Payment History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {paymentsList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No payments recorded yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right pr-6">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsList.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="pl-6">
                          <div className="space-y-1">
                            <div>{formatDate(payment.paidAt ?? payment.createdAt)}</div>
                            {payment.reversedAt ? (
                              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                                Reversed
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">
                          <div className="space-y-1">
                            <div>{payment.method}</div>
                            {payment.notes ? (
                              <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                                {payment.notes}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6 font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <span className={payment.reversedAt ? "text-muted-foreground line-through" : ""}>
                              {formatCurrency(payment.amount)}
                            </span>
                            {!payment.reversedAt && canWritePayments ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setPaymentToReverse(payment.id)}
                              >
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                Reverse
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {invoiceAllowsPayment(status) && canWritePayments ? (
            <CollectionActionCard
              title={isOverdue ? "Overdue balance" : "Collect payment"}
              detail={
                isOverdue
                  ? `Invoice is past due. Balance remaining ${formatCurrency(remainingBalance)}.`
                  : status === "partial"
                    ? `Partial payment recorded. ${formatCurrency(remainingBalance)} still due.`
                    : "Record payment or follow up with the customer."
              }
              amount={formatCurrency(remainingBalance)}
              primaryLabel="Record payment"
              secondaryLabel={status === "draft" ? "Send invoice first" : "Resend invoice"}
              onPrimary={handleOpenPaymentDialog}
              onSecondary={() => {
                void handleMarkAsSent();
              }}
              primaryDisabled={remainingBalance <= 0}
              secondaryDisabled={sendingToClient || creatingStripePaymentSession}
              primaryLoading={creatingPayment}
            />
          ) : null}

          {invoiceAllowsPayment(status) && canWritePayments ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void handleStripeCheckout()}
              disabled={creatingStripePaymentSession || remainingBalance <= 0}
            >
              {creatingStripePaymentSession ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              Pay with Stripe Checkout
            </Button>
          ) : null}

          {/* Invoice Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <WorkflowLinkCard
                icon={Receipt}
                label="Quote"
                value={
                  quoteData
                    ? `${capitalize(quoteData.status)} · ${formatCurrency(Number(quoteData.total ?? 0))}`
                    : "No quote linked"
                }
                href={quoteData ? withReturn(`/quotes/${quoteData.id}`) : null}
                actionLabel="Open quote"
              />
              <WorkflowLinkCard
                icon={CalendarClock}
                label="Schedule"
                value={appointmentData ? formatDate(appointmentData.startTime) : "No appointment linked"}
                href={appointmentData ? withReturn(`/appointments/${appointmentData.id}`) : null}
                actionLabel="Open appointment"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide mb-1">
                  Created
                </p>
                <p>{formatDate(invoice.createdAt)}</p>
              </div>
              {invoice.dueDate && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide mb-1">
                    Due Date
                  </p>
                  <p>{formatDate(invoice.dueDate)}</p>
                </div>
              )}
              {invoice.paidAt && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide mb-1">
                    Paid On
                  </p>
                  <p>{formatDate(invoice.paidAt)}</p>
                </div>
              )}
              {invoice.notes && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide mb-1">
                    Notes
                  </p>
                  <p className="text-muted-foreground">{invoice.notes}</p>
                </div>
              )}
              {(invoice as any).internalNotes && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide mb-1 flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Internal Notes
                  </p>
                  <p className="text-muted-foreground italic text-sm">{(invoice as any).internalNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <CommunicationCard
            title="Client communication"
            recipientName={clientDisplayName}
            recipient={clientData?.email}
            primaryLabel={status === "sent" ? "Resend invoice" : "Send invoice"}
            activities={((activityLogs ?? []) as any[]).filter((record) => record.type === "invoice.sent")}
            sending={sendingToClient}
            canSend={permissions.has("invoices.write")}
            onPrimarySend={handleMarkAsSent}
          />

          <ActivityFeedCard
            title="Invoice history"
            records={((activityLogs ?? []) as any[]).filter((record) => record.type !== "invoice.sent")}
            fetching={activityFetching}
          />

          {/* Client Info */}
          {clientData && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Client</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Link
                  to={`/clients/${clientData.id}`}
                  className="font-medium hover:underline text-primary"
                >
                  {clientDisplayName}
                </Link>
                {clientData.email && (
                  <p className="text-muted-foreground">{clientData.email}</p>
                )}
                {clientData.phone && (
                  <p className="text-muted-foreground">{clientData.phone}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Appointment Info */}
          {appointmentData && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Appointment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {appointmentVehicleLabel ? <p className="font-medium">{appointmentVehicleLabel}</p> : null}
                <p className="text-muted-foreground">
                  {formatDate(appointmentData.startTime)}
                </p>
                <Link
                  to={`/appointments/${appointmentData.id}`}
                  className="text-primary hover:underline text-xs"
                >
                  View Appointment →
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for invoice {invoiceLabel}. Balance due:{" "}
              {formatCurrency(remainingBalance)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Remaining balance: {formatCurrency(remainingBalance)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-method">Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="venmo">Venmo</SelectItem>
                  <SelectItem value="cashapp">CashApp</SelectItem>
                  <SelectItem value="zelle">Zelle</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-date">Date</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-notes">Notes (optional)</Label>
              <Textarea
                id="payment-notes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Any additional notes…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRecordPaymentOpen(false)}
              disabled={creatingPayment}
            >
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={creatingPayment}>
              {creatingPayment && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Line Item Confirmation Dialog */}
      <AlertDialog open={showDeleteLineItemDialog} onOpenChange={setShowDeleteLineItemDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Line Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This line item will be permanently removed from the invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteLineItem}
              disabled={deletingLineItem}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!paymentToReverse} onOpenChange={(open) => !open && setPaymentToReverse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the payment from the invoice balance and marks it as reversed for audit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversingPayment}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReversePayment} disabled={reversingPayment}>
              {reversingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reverse Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Line Item Dialog */}
      <Dialog open={addLineItemOpen} onOpenChange={setAddLineItemOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
            <DialogDescription>
              Add a new line item to invoice {invoiceLabel}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="line-item-description">Description</Label>
              <Input
                id="line-item-description"
                value={lineItemDescription}
                onChange={(e) => setLineItemDescription(e.target.value)}
                placeholder="e.g. Full Detail Package"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="line-item-qty">Quantity</Label>
                <Input
                  id="line-item-qty"
                  type="number"
                  min="1"
                  step="1"
                  value={lineItemQuantity}
                  onChange={(e) => setLineItemQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="line-item-price">Unit Price</Label>
                <Input
                  id="line-item-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={lineItemUnitPrice}
                  onChange={(e) => setLineItemUnitPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            {lineItemQuantity && lineItemUnitPrice && (
              <p className="text-sm text-muted-foreground">
                Total:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(
                    (parseInt(lineItemQuantity, 10) || 0) *
                      (parseFloat(lineItemUnitPrice) || 0)
                  )}
                </span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddLineItemOpen(false)}
              disabled={creatingLineItem}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddLineItem}
              disabled={creatingLineItem || !lineItemDescription || !lineItemUnitPrice}
            >
              {creatingLineItem && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
