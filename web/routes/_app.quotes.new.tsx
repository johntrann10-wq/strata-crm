import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link, useOutletContext, useSearchParams } from "react-router";
import { useFindMany, useFindFirst, useAction } from "../hooks/useApi";
import { api } from "../api";
import { toast } from "sonner";
import type { AuthOutletContext } from "./_app";
import { getWorkflowCreationPreset } from "../lib/workflowCreationPresets";
import { formatVehicleLabel } from "../lib/vehicles";
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
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Trash2, Loader2, Check, ChevronsUpDown, ChevronDown, ChevronUp, Package } from "lucide-react";
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
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { PageHeader } from "../components/shared/PageHeader";

type LineItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
};

type ServiceRecord = {
  id: string;
  name: string;
  price: number | null;
  category?: string | null;
  isAddon?: boolean | null;
  active?: boolean | null;
};

type AddonLinkRecord = {
  id: string;
  parentServiceId: string;
  addonServiceId: string;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

const DEFAULT_ADMIN_FEE_LABEL = "Admin fee";

export default function NewQuotePage() {
  const { businessId, businessType } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const creationPreset = getWorkflowCreationPreset(businessType);
  const [searchParams] = useSearchParams();
  const clientIdParam = searchParams.get("clientId");
  const vehicleIdParam = searchParams.get("vehicleId");
  const recipientNameParam = searchParams.get("recipientName")?.trim() || "";
  const recipientEmailParam = searchParams.get("recipientEmail")?.trim() || "";
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/quotes";
  const hasQueueReturn = searchParams.has("from");

  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState(
    () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [taxRate, setTaxRate] = useState("0");
  const [applyTax, setApplyTax] = useState(false);
  const [applyAdminFee, setApplyAdminFee] = useState(false);
  const [adminFeeAmount, setAdminFeeAmount] = useState("0");
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
  const [showMobileClientVehicle, setShowMobileClientVehicle] = useState(false);
  const [showMobileApprovalSettings, setShowMobileApprovalSettings] = useState(false);
  const [showMobileChargeControls, setShowMobileChargeControls] = useState(false);
  const [clientComboOpen, setClientComboOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const hasSeededBusinessDefaults = useRef(false);

  // Reset vehicle when client changes
  useEffect(() => {
    setSelectedVehicleId("");
  }, [selectedClientId]);

  const [{ data: business }] = useFindFirst(api.business, {
    filter: { id: { equals: businessId ?? "" } },
    select: { id: true, defaultTaxRate: true, defaultAdminFee: true, defaultAdminFeeEnabled: true },
    pause: !businessId,
  });

  // Pre-fill quote charges from business defaults
  useEffect(() => {
    if (!business || hasSeededBusinessDefaults.current) return;
    const defaultTaxRate = Number(business.defaultTaxRate ?? 0);
    const defaultAdminFee = Number(business.defaultAdminFee ?? 0);
    setTaxRate(String(defaultTaxRate));
    setApplyTax(defaultTaxRate > 0);
    setAdminFeeAmount(String(defaultAdminFee));
    setApplyAdminFee(Boolean(business.defaultAdminFeeEnabled) && defaultAdminFee > 0);
    hasSeededBusinessDefaults.current = true;
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
  }, [selectedClientId, selectedVehicleId, vehicles]);

  // Filtered clients for combobox
  const filteredClients = clients?.filter((c) => {
    const name = (c.firstName + " " + c.lastName).toLowerCase();
    return name.includes(clientSearch.toLowerCase());
  });

  // Services for quick-add
  const [{ data: services }] = useFindMany(api.service, {
    filter: { active: { equals: true } },
    select: { id: true, name: true, price: true, category: true, isAddon: true, active: true },
    sort: { name: "Ascending" },
    first: 250,
  });
  const [{ data: packageAddonLinks }] = useFindMany(api.serviceAddonLink, {
    first: 250,
  } as any);

  const [, runCreate] = useAction(api.quote.create);

  // Derived calculations
  const subtotal = lineItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  const adminFeeRateNum = applyAdminFee ? parseFloat(adminFeeAmount) || 0 : 0;
  const effectiveAdminFee = subtotal * (adminFeeRateNum / 100);
  const taxableSubtotal = subtotal + effectiveAdminFee;
  const taxRateNum = applyTax ? parseFloat(taxRate) || 0 : 0;
  const taxAmount = taxableSubtotal * (taxRateNum / 100);
  const total = taxableSubtotal + taxAmount;

  const quoteChargeControls = (
    <>
      <div className="space-y-2">
        <Label htmlFor="taxRate">Tax Rate (%)</Label>
        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Apply tax</p>
              <p className="text-xs text-muted-foreground">Use the business default rate, or override it for this quote.</p>
            </div>
            <Switch checked={applyTax} onCheckedChange={setApplyTax} />
          </div>
          <Input
            id="taxRate"
            type="number"
            min="0"
            max="100"
            step="0.1"
            placeholder="0"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            disabled={!applyTax}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="adminFeeAmount">Admin Fee</Label>
        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Add admin fee</p>
              <p className="text-xs text-muted-foreground">Prefill a separate admin fee line item as a percentage of the quote subtotal.</p>
            </div>
            <Switch checked={applyAdminFee} onCheckedChange={setApplyAdminFee} />
          </div>
          <div className="flex">
            <Input
              id="adminFeeAmount"
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="0"
              value={adminFeeAmount}
              onChange={(e) => setAdminFeeAmount(e.target.value)}
              disabled={!applyAdminFee}
              className="rounded-r-none"
            />
            <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              %
            </span>
          </div>
        </div>
      </div>
    </>
  );

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

  const addPackageAsLineItems = useCallback(
    (baseService: ServiceRecord, addonServices: ServiceRecord[]) => {
      const nextItems: LineItem[] = [
        {
          id: crypto.randomUUID(),
          description: baseService.name,
          quantity: "1",
          unitPrice: baseService.price != null ? String(baseService.price) : "",
          taxable: true,
        },
        ...addonServices.map((service) => ({
          id: crypto.randomUUID(),
          description: service.name,
          quantity: "1",
          unitPrice: service.price != null ? String(service.price) : "",
          taxable: true,
        })),
      ];
      setLineItems((prev) => [...prev, ...nextItems]);
    },
    []
  );

  const serviceRecords = (services ?? []) as ServiceRecord[];
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
  const recommendedPackageTemplates = packageTemplates.filter((pkg) =>
    creationPreset.recommendedCategories.includes(String(pkg.baseService.category ?? "other"))
  );
  const otherPackageTemplates = packageTemplates.filter(
    (pkg) => !creationPreset.recommendedCategories.includes(String(pkg.baseService.category ?? "other"))
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
        subtotal: taxableSubtotal,
        taxAmount,
        total,
        status: "draft",
        lineItems: [
          ...validLineItems.map((item) => ({
            description: item.description.trim(),
            quantity: parseInt(item.quantity, 10) || 1,
            unitPrice: parseFloat(item.unitPrice) || 0,
          })),
          ...(effectiveAdminFee > 0
            ? [
                {
                  description: DEFAULT_ADMIN_FEE_LABEL,
                  quantity: 1,
                  unitPrice: effectiveAdminFee,
                },
              ]
            : []),
        ],
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

      toast.success("Quote created");
      const next = new URLSearchParams();
      next.set("from", returnTo);
      if (recipientNameParam) next.set("recipientName", recipientNameParam);
      if (recipientEmailParam) next.set("recipientEmail", recipientEmailParam);
      navigate(`/quotes/${quoteId}?${next.toString()}`);
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
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-28 sm:pb-6">
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to quotes queue" /> : null}
      <PageHeader
        backTo={returnTo}
        title="New Quote"
        subtitle="Build a clear estimate, confirm the client and vehicle, and make approval easy to understand."
      />

      {/* Two-column grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items Card */}
          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-base font-semibold">Quoted services</CardTitle>
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
                      <div key={item.id} className="rounded-xl border border-border/70 bg-card p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                        <div className="hidden sm:flex items-center gap-2">
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

                        <div className="space-y-3 sm:hidden">
                          <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Description</Label>
                            <Textarea
                              className="min-h-[88px] resize-none border-border/70"
                              placeholder="Describe the quoted work"
                              value={item.description}
                              onChange={(e) =>
                                updateLineItem(item.id, "description", e.target.value)
                              }
                              rows={3}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Qty</Label>
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                placeholder="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateLineItem(item.id, "quantity", e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Unit price</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateLineItem(item.id, "unitPrice", e.target.value)
                                }
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Line total</p>
                              <p className="text-sm font-medium text-foreground">{formatCurrency(lineTotal)}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => removeLineItem(item.id)}
                              type="button"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        </div>
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

              {recommendedPackageTemplates.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-muted-foreground">Recommended packages</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recommendedPackageTemplates.map((pkg) => (
                        <Button
                          key={pkg.baseService.id}
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => addPackageAsLineItems(pkg.baseService, pkg.linkedAddons)}
                        >
                          {pkg.baseService.name}
                          <span className="ml-1 text-muted-foreground">
                            · {pkg.linkedAddons.length + 1} items · {formatCurrency(pkg.totalPrice)}
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {otherPackageTemplates.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-muted-foreground">Other packages</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {otherPackageTemplates.map((pkg) => (
                        <Button
                          key={pkg.baseService.id}
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => addPackageAsLineItems(pkg.baseService, pkg.linkedAddons)}
                        >
                          {pkg.baseService.name}
                          <span className="ml-1 text-muted-foreground">
                            · {pkg.linkedAddons.length + 1} items · {formatCurrency(pkg.totalPrice)}
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}

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
            <CardHeader className="border-b border-border/70 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-semibold">Client and vehicle</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setShowMobileClientVehicle((value) => !value)}
                >
                  {showMobileClientVehicle ? "Hide" : "Show"}
                  {showMobileClientVehicle ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className={showMobileClientVehicle ? "space-y-4" : "hidden space-y-4 lg:block"}>
              {clientIdParam && selectedClientId && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded px-2 py-1 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Pre-filled from client record
                </div>
              )}
              {vehicleIdParam && selectedVehicleId && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded px-2 py-1 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Vehicle carried in from the previous workflow
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
                        {formatVehicleLabel(vehicle as any)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedClientId && vehicles && vehicles.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p>This client has no vehicles on file yet.</p>
                    <Button asChild variant="outline" size="sm" className="mt-2 h-8">
                      <Link to={`/clients/${selectedClientId}/vehicles/new?next=quote`}>Add vehicle</Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Quote Details Card */}
          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base font-semibold">Approval settings</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setShowMobileApprovalSettings((value) => !value)}
                >
                  {showMobileApprovalSettings ? "Hide" : "Show"}
                  {showMobileApprovalSettings ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className={showMobileApprovalSettings ? "space-y-4" : "hidden space-y-4 lg:block"}>
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expires At</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="border-input/90 min-w-0 appearance-none bg-background/85 pr-10 [font-variant-numeric:tabular-nums] [color-scheme:light] [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit-fields-wrapper]:min-w-0"
                />
              </div>
              <div className="hidden space-y-4 lg:block">{quoteChargeControls}</div>
            </CardContent>
          </Card>

          {/* Summary Card */}
          <Card>
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-base font-semibold">Quote summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Client-facing total</p>
                <p className="mt-1 text-2xl font-semibold">{formatCurrency(total)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasValidLineItems
                    ? `${lineItems.filter((item) => item.description.trim()).length} line item${lineItems.filter((item) => item.description.trim()).length === 1 ? "" : "s"} ready to quote`
                    : "Add services to see the final estimate"}
                </p>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {effectiveAdminFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Admin fee ({adminFeeRateNum}%)</span>
                  <span>{formatCurrency(effectiveAdminFee)}</span>
                </div>
              )}
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <div className="mx-auto max-w-4xl space-y-3">
          {showMobileChargeControls ? (
            <div className="space-y-4 rounded-2xl border border-border/70 bg-background p-3 shadow-sm">
              {quoteChargeControls}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Quote total</p>
            <p className="text-lg font-semibold">{formatCurrency(total)}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => setShowMobileChargeControls((value) => !value)}
          >
            Charges
            {showMobileChargeControls ? <ChevronDown className="ml-2 h-4 w-4" /> : <ChevronUp className="ml-2 h-4 w-4" />}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !selectedClientId || !hasValidLineItems}
            type="button"
            className="shrink-0"
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
          </div>
        </div>
      </div>
    </div>
  );
}
