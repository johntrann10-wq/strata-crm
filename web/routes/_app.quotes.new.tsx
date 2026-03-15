import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link, useOutletContext, useSearchParams } from "react-router";
import { useFindMany, useFindFirst, useAction } from "@gadgetinc/react";
import { api } from "../api";
import { toast } from "sonner";
import type { AuthOutletContext } from "./_app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Plus, Trash2, Loader2, Check, ChevronsUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

type LineItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

export default function NewQuotePage() {
  const { user } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientIdParam = searchParams.get("clientId");
  const vehicleIdParam = searchParams.get("vehicleId");

  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState(
    () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [taxRate, setTaxRate] = useState("0");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: crypto.randomUUID(),
      description: "",
      quantity: "1",
      unitPrice: "",
      taxable: true,
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [clientComboOpen, setClientComboOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  // Reset vehicle when client changes
  useEffect(() => {
    setSelectedVehicleId("");
  }, [selectedClientId]);

  // Get business record
  const [{ data: business }] = useFindFirst(api.business, {
    filter: { ownerId: { equals: user?.id } },
    select: { id: true, defaultTaxRate: true },
  });

  const businessId = business?.id;

  // Pre-fill tax rate from business default
  useEffect(() => {
    if (business?.defaultTaxRate != null && business.defaultTaxRate > 0) {
      setTaxRate(String(business.defaultTaxRate));
    }
  }, [business]);

  // Clients for this business
  const [{ data: clients }] = useFindMany(api.client, {
    filter: businessId
      ? { businessId: { equals: businessId } }
      : { id: { equals: "skip" } },
    select: { id: true, firstName: true, lastName: true },
    sort: { firstName: "Ascending" },
    first: 250,
  });

  // Vehicles for selected client
  const [{ data: vehicles }] = useFindMany(api.vehicle, {
    filter: selectedClientId
      ? { clientId: { equals: selectedClientId } }
      : { id: { equals: "skip" } },
    select: { id: true, year: true, make: true, model: true },
    first: 250,
  });

  // Pre-fill clientId from URL param
  useEffect(() => {
    if (clientIdParam && clients && selectedClientId === "") {
      setSelectedClientId(clientIdParam);
    }
  }, [clientIdParam, clients, selectedClientId]);

  // Pre-fill vehicleId from URL param
  useEffect(() => {
    if (vehicleIdParam && vehicles && selectedVehicleId === "") {
      setSelectedVehicleId(vehicleIdParam);
    }
  }, [vehicleIdParam, vehicles, selectedVehicleId]);

  // Auto-select sole vehicle when only one exists for the selected client
  useEffect(() => {
    if (selectedClientId && vehicles && vehicles.length === 1 && selectedVehicleId === "") {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [vehicles, selectedClientId]);

  // Filtered clients for combobox
  const filteredClients = clients?.filter((c) => {
    const name = (c.firstName + " " + c.lastName).toLowerCase();
    return name.includes(clientSearch.toLowerCase());
  });

  // Services for quick-add
  const [{ data: services }] = useFindMany(api.service, {
    filter: { active: { equals: true } },
    select: { id: true, name: true, price: true, category: true },
    sort: { name: "Ascending" },
    first: 250,
  });

  const [, runCreate] = useAction(api.quote.create);
  const [, runCreateLineItem] = useAction(api.quoteLineItem.create);

  // Derived calculations
  const subtotal = lineItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  const taxRateNum = parseFloat(taxRate) || 0;
  const taxAmount = subtotal * (taxRateNum / 100);
  const total = subtotal + taxAmount;

  // Line item helpers
  const addLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: "",
        quantity: "1",
        unitPrice: "",
        taxable: true,
      },
    ]);
  }, []);

  const removeLineItem = useCallback((id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateLineItem = useCallback(
    (id: string, field: keyof LineItem, value: string | boolean) => {
      setLineItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
      );
    },
    []
  );

  const addServiceAsLineItem = useCallback(
    (service: { id: string; name: string; price: number | null }) => {
      setLineItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          description: service.name,
          quantity: "1",
          unitPrice: service.price != null ? service.price.toString() : "",
          taxable: true,
        },
      ]);
    },
    []
  );

  const handleSubmit = async () => {
    const validLineItems = lineItems.filter(
      (item) => item.description.trim() && item.unitPrice.trim()
    );
    if (!selectedClientId) {
      toast.error("Please select a client");
      return;
    }
    if (validLineItems.length === 0) {
      toast.error("Please add at least one line item with a description and price");
      return;
    }
    if (!businessId) {
      toast.error("Business not found. Please complete onboarding first.");
      return;
    }

    setSaving(true);
    try {
      const result = await runCreate({
        client: { _link: selectedClientId },
        vehicle: selectedVehicleId ? { _link: selectedVehicleId } : undefined,
        business: { _link: businessId },
        notes: notes.trim() || undefined,
        expiresAt: expiresAt || undefined,
        taxRate: taxRateNum,
        subtotal,
        taxAmount,
        total,
        status: "draft",
      });

      if (result.error) {
        toast.error(result.error.message ?? "Failed to create quote");
        return;
      }

      const quoteId = result.data?.id;
      if (!quoteId) {
        toast.error("Failed to create quote");
        return;
      }

      for (const item of validLineItems) {
        const qty = parseInt(item.quantity, 10) || 1;
        const price = parseFloat(item.unitPrice) || 0;
        await runCreateLineItem({
          quote: { _link: quoteId },
          description: item.description,
          quantity: qty,
          unitPrice: price,
          total: qty * price,
          taxable: item.taxable,
        });
      }

      toast.success("Quote created");
      navigate(`/quotes/${quoteId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create quote";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const hasValidLineItems = lineItems.some(
    (item) => item.description.trim() && item.unitPrice.trim()
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/quotes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New Quote</h1>
      </div>

      {/* Two-column grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items Card */}
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lineItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No line items yet. Add one below.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Header row */}
                  <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground font-medium px-1">
                    <span className="flex-1">Description</span>
                    <span className="w-20 text-center">Qty</span>
                    <span className="w-28 text-center">Unit Price</span>
                    <span className="w-24 text-right">Total</span>
                    <span className="w-8" />
                  </div>
                  {lineItems.map((item) => {
                    const qty = parseFloat(item.quantity) || 0;
                    const price = parseFloat(item.unitPrice) || 0;
                    const lineTotal = qty * price;
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        <Input
                          className="flex-1"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) =>
                            updateLineItem(item.id, "description", e.target.value)
                          }
                        />
                        <Input
                          className="w-20"
                          type="number"
                          min="1"
                          step="1"
                          placeholder="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(item.id, "quantity", e.target.value)
                          }
                        />
                        <Input
                          className="w-28"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateLineItem(item.id, "unitPrice", e.target.value)
                          }
                        />
                        <div className="w-24 text-right text-sm text-muted-foreground">
                          {formatCurrency(lineTotal)}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeLineItem(item.id)}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={addLineItem}
                type="button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Line Item
              </Button>

              {services && services.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Quick Add Service
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {services.map((service) => (
                        <Button
                          key={service.id}
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() => addServiceAsLineItem(service)}
                        >
                          {service.name}
                          {service.price != null && (
                            <span className="ml-1 text-muted-foreground">
                              · {formatCurrency(service.price)}
                            </span>
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Notes toggle */}
          {!showNotes ? (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
              + Add Notes
            </button>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle>Notes</CardTitle>
                  <button
                    type="button"
                    onClick={() => setShowNotes(false)}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronUp className="h-4 w-4" />
                    Hide Notes
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Additional notes for the client..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Client & Vehicle Card */}
          <Card>
            <CardHeader>
              <CardTitle>Client & Vehicle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {clientIdParam && selectedClientId && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded px-2 py-1 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Pre-filled from client record
                </div>
              )}
              <div className="space-y-2">
                <Label>Client</Label>
                <Popover open={clientComboOpen} onOpenChange={setClientComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientComboOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedClientId
                        ? (() => {
                            const c = clients?.find((cl) => cl.id === selectedClientId);
                            return c ? `${c.firstName} ${c.lastName}` : "Select client...";
                          })()
                        : "Select client..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search clients..."
                        value={clientSearch}
                        onValueChange={setClientSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No clients found.</CommandEmpty>
                        <CommandGroup>
                          {filteredClients?.map((client) => (
                            <CommandItem
                              key={client.id}
                              value={client.id}
                              onSelect={(value) => {
                                setSelectedClientId(value);
                                setClientComboOpen(false);
                                setClientSearch("");
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedClientId === client.id
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              {client.firstName} {client.lastName}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicle">Vehicle</Label>
                <Select
                  value={selectedVehicleId}
                  onValueChange={setSelectedVehicleId}
                  disabled={!selectedClientId}
                >
                  <SelectTrigger id="vehicle">
                    <SelectValue
                      placeholder={
                        selectedClientId ? "Select vehicle..." : "Select a client first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles?.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Quote Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Quote Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expires At</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="0"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {taxRateNum > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({taxRateNum}%)</span>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>

              <Button
                className="w-full mt-2"
                onClick={handleSubmit}
                disabled={saving || !selectedClientId || !hasValidLineItems}
                type="button"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Quote"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}