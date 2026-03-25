import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams, useOutletContext } from "react-router";
import { useFindFirst, useFindMany, useFindOne, useAction } from "../hooks/useApi";
import { api } from "../api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ArrowLeft, Check, ChevronDown, ChevronUp, ChevronsUpDown, FileText, Package, Plus, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthOutletContext } from "./_app";
import { getWorkflowCreationPreset } from "../lib/workflowCreationPresets";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { PageHeader } from "../components/shared/PageHeader";

interface LineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
}

type ServiceRecord = {
  id: string;
  name: string;
  price: number | null;
  category?: string | null;
  isAddon?: boolean | null;
};

type AddonLinkRecord = {
  id: string;
  parentServiceId: string;
  addonServiceId: string;
};

export default function NewInvoicePage() {
  const navigate = useNavigate();
  const { user, businessId, businessType } = useOutletContext<AuthOutletContext>();
  const userId = (user as any)?.id as string | undefined;
  const creationPreset = getWorkflowCreationPreset(businessType);

  const [searchParams] = useSearchParams();
  const appointmentIdParam = searchParams.get("appointmentId");
  const clientIdParam = searchParams.get("clientId");
  const quoteIdParam = searchParams.get("quoteId");
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/invoices";
  const hasQueueReturn = searchParams.has("from");

  const [{ data: businessRecord }] = useFindFirst(api.business, {
    filter: businessId ? { id: { equals: businessId } } : { id: { equals: "" } },
    select: { id: true, defaultTaxRate: true },
    pause: !businessId,
  });

  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [debouncedClientQuery, setDebouncedClientQuery] = useState("");

  const [{ data: clients, fetching: fetchingClients }] = useFindMany(api.client, {
    ...(debouncedClientQuery.length >= 2 ? { search: debouncedClientQuery } : {}),
    first: 20,
    pause: !businessRecord?.id,
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const [{ data: clientFromParam }] = useFindFirst(api.client, {
    filter: { id: { equals: clientIdParam ?? "" } },
    select: { id: true, firstName: true, lastName: true, email: true },
    pause: !clientIdParam,
  });

  const [{ data: selectedClientRecord }] = useFindFirst(api.client, {
    filter: { id: { equals: selectedClientId || "" } },
    select: { id: true, firstName: true, lastName: true, email: true },
    pause: !selectedClientId,
  });

  const [{ data: quoteData }] = useFindOne(api.quote, quoteIdParam ?? undefined, {
    select: {
      id: true,
      clientId: true,
      taxRate: true,
      notes: true,
      lineItems: {
        edges: {
          node: {
            description: true,
            quantity: true,
            unitPrice: true,
            total: true,
          },
        },
      },
    },
    pause: !quoteIdParam,
  });

  const [{ data: apptServices }] = useFindMany(api.appointmentService, {
    filter: appointmentIdParam
      ? { appointmentId: { equals: appointmentIdParam } }
      : { id: { equals: "" } },
    select: {
      id: true,
      service: { name: true, price: true },
      price: true,
      duration: true,
    },
    first: 50,
    pause: !appointmentIdParam,
  });
  const [{ data: servicesData }] = useFindMany(api.service, {
    filter: { active: { equals: true } },
    select: { id: true, name: true, price: true, category: true, isAddon: true },
    sort: { name: "Ascending" },
    first: 250,
    pause: !businessRecord?.id,
  });
  const [{ data: packageAddonLinks }] = useFindMany(api.serviceAddonLink, {
    first: 250,
    pause: !businessRecord?.id,
  } as any);

  const [, createInvoice] = useAction(api.invoice.create);

  // Form state
  const [clientComboOpen, setClientComboOpen] = useState(false);
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [notes, setNotes] = useState(() => creationPreset.invoiceNotes);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), description: "", qty: 1, unitPrice: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMode, setSubmitMode] = useState<'draft' | 'sent'>('draft');
  const [showMobileInvoiceDetails, setShowMobileInvoiceDetails] = useState(false);
  const [showMobileNotes, setShowMobileNotes] = useState(false);

  // Pre-fill from linked quote
  useEffect(() => {
    if (!quoteData) return;

    const isBlankPlaceholder =
      lineItems.length === 1 &&
      lineItems[0].description === "" &&
      lineItems[0].qty === 1 &&
      lineItems[0].unitPrice === 0;

    if (isBlankPlaceholder) {
      const quoteLineItems =
        (quoteData as any).lineItems?.edges?.map((edge: any) => ({
          id: crypto.randomUUID(),
          description: edge.node.description ?? "",
          qty: Number(edge.node.quantity) || 1,
          unitPrice: Number(edge.node.unitPrice) || 0,
        })) ?? [];

      if (quoteLineItems.length > 0) {
        setLineItems(quoteLineItems);
      }
    }

    if (taxRate === 0 && (quoteData as any).taxRate != null && (quoteData as any).taxRate !== "") {
      setTaxRate(Number((quoteData as any).taxRate));
    }

    if (notes === "" && (quoteData as any).notes) {
      setNotes((quoteData as any).notes);
    }
  }, [quoteData]);

  // Pre-fill client from linked quote
  useEffect(() => {
    if (!quoteData || !quoteIdParam) return;
    const cid = (quoteData as { clientId?: string }).clientId;
    if (cid && !selectedClientId) setSelectedClientId(cid);
  }, [quoteData, quoteIdParam, selectedClientId]);

  // Pre-fill client from URL param
  useEffect(() => {
    if (clientFromParam && !selectedClientId) {
      setSelectedClientId(clientFromParam.id);
    }
  }, [clientFromParam]);

  // Debounce client search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedClientQuery(clientSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearchQuery]);

  // Pre-fill line items from appointment services
  useEffect(() => {
    if (apptServices && apptServices.length > 0) {
      const isBlankPlaceholder =
        lineItems.length === 1 &&
        lineItems[0].description === "" &&
        lineItems[0].qty === 1 &&
        lineItems[0].unitPrice === 0;
      if (isBlankPlaceholder) {
        setLineItems(
          apptServices.map((apptService) => ({
            id: crypto.randomUUID(),
            description: apptService.service?.name ?? "Service",
            qty: 1,
            unitPrice: apptService.service?.price ?? apptService.price ?? 0,
          }))
        );
      }
    }
  }, [apptServices]);

  // Set default tax rate from business when loaded
  useEffect(() => {
    if (businessRecord?.defaultTaxRate != null) {
      setTaxRate(businessRecord.defaultTaxRate);
    }
  }, [businessRecord?.defaultTaxRate]);

  // Calculations
  const subtotal = lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const total = subtotal + taxAmount - (discountAmount || 0);

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: "", qty: 1, unitPrice: 0 },
    ]);
  };

  const removeLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof Omit<LineItem, "id">, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const addPackageAsLineItems = (baseService: ServiceRecord, addonServices: ServiceRecord[]) => {
    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: baseService.name,
        qty: 1,
        unitPrice: Number(baseService.price ?? 0),
      },
      ...addonServices.map((service) => ({
        id: crypto.randomUUID(),
        description: service.name,
        qty: 1,
        unitPrice: Number(service.price ?? 0),
      })),
    ]);
  };

  const serviceRecords = (servicesData ?? []) as ServiceRecord[];
  const addonLinks = (packageAddonLinks ?? []) as AddonLinkRecord[];
  const packageTemplates = serviceRecords
    .filter((service) => !service.isAddon)
    .map((service) => {
      const linkedAddons = addonLinks
        .filter((link) => link.parentServiceId === service.id)
        .map((link) => serviceRecords.find((candidate) => candidate.id === link.addonServiceId))
        .filter(Boolean) as ServiceRecord[];
      return {
        baseService: service,
        linkedAddons,
        totalPrice:
          Number(service.price ?? 0) +
          linkedAddons.reduce((sum, addon) => sum + Number(addon.price ?? 0), 0),
      };
    })
    .filter((entry) => entry.linkedAddons.length > 0);


  const doSubmit = async (mode: 'draft' | 'sent') => {
    if (!selectedClientId) {
      toast.error("Please select a client");
      return;
    }

    if (!userId) {
      toast.error("User session not found");
      return;
    }

    if (!businessRecord?.id) {
      toast.error("Business record not found");
      return;
    }

    if (lineItems.length === 0) {
      toast.error("Please add at least one line item");
      return;
    }

    const hasEmptyDescription = lineItems.some((item) => !item.description.trim());
    if (hasEmptyDescription) {
      toast.error("Please fill in all line item descriptions");
      return;
    }

    setSubmitting(true);

    try {
      const invoiceResult = await createInvoice({
        clientId: selectedClientId,
        appointmentId: appointmentIdParam ?? undefined,
        quoteId: quoteIdParam ?? undefined,
        status: "draft",
        lineItems: lineItems.map((item) => ({
          description: item.description,
          quantity: item.qty,
          unitPrice: item.unitPrice,
        })),
        discountAmount: discountAmount || 0,
        taxRate,
        notes: notes.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate + "T12:00:00").toISOString() : undefined,
      });

      if (invoiceResult.error) {
        toast.error(invoiceResult.error.message ?? "Failed to create invoice");
        setSubmitting(false);
        return;
      }

      const newInvoiceId = (invoiceResult.data as { id?: string } | null)?.id;
      if (!newInvoiceId) {
        toast.error("Failed to create invoice");
        setSubmitting(false);
        return;
      }

      if (mode === "sent") {
        try {
          const sendResult = await api.invoice.sendToClient({ id: newInvoiceId });
          const deliveryStatus = (sendResult as { deliveryStatus?: string } | null)?.deliveryStatus;
          if (deliveryStatus === "emailed") {
            toast.success("Invoice created and emailed");
          } else {
            toast.warning("Invoice created, but delivery state was unclear.");
          }
        } catch (sendError) {
          toast.error(
            sendError instanceof Error
              ? `Invoice created, but email failed: ${sendError.message}`
              : "Invoice created, but email failed."
          );
        }
      } else {
        toast.success("Invoice created successfully");
      }
      navigate(`/invoices/${newInvoiceId}?from=${encodeURIComponent(returnTo)}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await doSubmit(submitMode);
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 pb-28 sm:pb-6">
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to invoices queue" /> : null}
      <PageHeader
        backTo={returnTo}
        title="New Invoice"
        subtitle="Turn completed work into a clear bill with obvious totals, due date, and delivery intent."
      />

      {clientIdParam && selectedClientId && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm mb-4">
          <Check className="h-4 w-4 shrink-0" />
          <span>Client was carried in from the previous workflow.</span>
          <Link
            to={`/clients/${selectedClientId}`}
            className="ml-auto shrink-0 underline font-medium"
          >
            View Client
          </Link>
        </div>
      )}

      {appointmentIdParam && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm mb-6">
          <FileText className="h-4 w-4 shrink-0" />
          <span>Creating invoice linked to appointment. Services have been pre-filled.</span>
          <Link
            to={`/appointments/${appointmentIdParam}`}
            className="ml-auto shrink-0 underline font-medium"
          >
            View Appointment
          </Link>
        </div>
      )}

      {quoteIdParam && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm mb-6">
          <FileText className="h-4 w-4 shrink-0" />
          <span>Creating invoice from quote. Line items have been pre-filled.</span>
          <Link
            to={`/quotes/${quoteIdParam}`}
            className="ml-auto shrink-0 underline font-medium"
          >
            View Quote
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Invoice Details */}
        <Card>
          <CardHeader className="border-b border-border/70 pb-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base font-semibold">Invoice details</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setShowMobileInvoiceDetails((value) => !value)}
              >
                {showMobileInvoiceDetails ? "Hide" : "Show"}
                {showMobileInvoiceDetails ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className={showMobileInvoiceDetails ? "space-y-4" : "hidden space-y-4 lg:block"}>
            {/* Client Combobox */}
            <div className="space-y-2">
              <Label>
                Client <span className="text-red-500">*</span>
              </Label>
              <Popover open={clientComboOpen} onOpenChange={setClientComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientComboOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedClientRecord
                      ? `${selectedClientRecord.firstName} ${selectedClientRecord.lastName}`
                      : selectedClientId
                      ? "Loading…"
                      : "Select a client…"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type to search clients…"
                      value={clientSearchQuery}
                      onValueChange={setClientSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {clientSearchQuery.length < 2
                          ? "Start typing to search clients..."
                          : fetchingClients
                          ? "Loading…"
                          : "No clients found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {clients?.map((client) => (
                          <CommandItem
                            key={client.id}
                            value={client.id}
                            onSelect={() => {
                              setSelectedClientId(client.id);
                              setClientComboOpen(false);
                              setClientSearchQuery("");
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedClientId === client.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div>
                              <div className="font-medium">
                                {client.firstName} {client.lastName}
                              </div>
                              {client.email && (
                                <div className="text-xs text-muted-foreground">{client.email}</div>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedClientRecord?.email ? (
                <p className="text-xs text-muted-foreground">
                  Invoice communication will go to {selectedClientRecord.email}.
                </p>
              ) : null}
            </div>

            {/* Invoice Number */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Invoice Number</Label>
                <span className="text-xs text-muted-foreground">(auto-generated)</span>
              </div>
              <div className="border rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Auto-assigned on save
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="text-base font-semibold">Billable items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Column Headers */}
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1" />
              </div>
              <Separator className="hidden sm:block" />

              {lineItems.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 sm:col-span-6">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) =>
                        updateLineItem(item.id, "qty", Math.max(0, parseFloat(e.target.value) || 0))
                      }
                      className="text-center"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={item.unitPrice === 0 ? "" : item.unitPrice}
                      onChange={(e) =>
                        updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)
                      }
                      className="text-right"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-1 text-right text-sm font-medium hidden sm:block">
                    ${(item.qty * item.unitPrice).toFixed(2)}
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500"
                      onClick={() => removeLineItem(item.id)}
                      disabled={lineItems.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLineItem}
                className="mt-1"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>

              {packageTemplates.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-muted-foreground">Quick Add Package</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {packageTemplates.map((pkg) => (
                        <Button
                          key={pkg.baseService.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addPackageAsLineItems(pkg.baseService, pkg.linkedAddons)}
                        >
                          {pkg.baseService.name}
                          <span className="ml-1 text-muted-foreground">
                            · {pkg.linkedAddons.length + 1} items · ${pkg.totalPrice.toFixed(2)}
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Totals */}
            <Separator className="my-4" />
            <div className="flex flex-col items-end space-y-2">
              <div className="w-full max-w-xs space-y-2 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="mb-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Invoice total</p>
                  <p className="mt-1 text-2xl font-semibold">${total.toFixed(2)}</p>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>

                {/* Tax Rate */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Tax</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={taxRate}
                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                        className="w-16 h-7 text-sm px-2"
                      />
                      <span className="text-sm">%</span>
                    </div>
                  </div>
                  <span className="text-sm font-medium">${taxAmount.toFixed(2)}</span>
                </div>

                {/* Discount */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Discount</span>
                    <div className="flex items-center gap-1">
                      <span className="text-sm">$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={discountAmount === 0 ? "" : discountAmount}
                        onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                        className="w-20 h-7 text-sm px-2"
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-red-500">
                    -${(discountAmount || 0).toFixed(2)}
                  </span>
                </div>

                <Separator />

                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-semibold">Notes</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setShowMobileNotes((value) => !value)}
                >
                  {showMobileNotes ? "Hide" : "Show"}
                  {showMobileNotes ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
          <CardContent className={showMobileNotes ? "" : "hidden lg:block"}>
            <Textarea
              id="notes"
              placeholder="Add any notes for this invoice..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-6">
          <Button type="button" variant="outline" asChild>
            <Link to={returnTo}>Cancel</Link>
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            onClick={() => setSubmitMode('draft')}
          >
            {submitting ? "Saving…" : "Create Invoice"}
          </Button>
          <Button
            type="button"
            variant="default"
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={submitting}
            onClick={() => doSubmit('sent')}
          >
            <Send className="h-4 w-4 mr-2" />
            Create & Send
          </Button>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Invoice total</p>
              <p className="text-lg font-semibold">${total.toFixed(2)}</p>
            </div>
            <Button
              type="submit"
              disabled={submitting}
              onClick={() => setSubmitMode('draft')}
              className="shrink-0"
            >
              {submitting ? "Saving..." : "Create"}
            </Button>
            <Button
              type="button"
              variant="default"
              className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
              disabled={submitting}
              onClick={() => doSubmit('sent')}
            >
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
