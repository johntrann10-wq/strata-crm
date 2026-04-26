import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link, useOutletContext, useSearchParams } from "react-router";
import { useFindMany, useFindFirst, useAction } from "../hooks/useApi";
import { api } from "../api";
import { toast } from "sonner";
import { format } from "date-fns";
import type { AuthOutletContext } from "./_app";
import { getWorkflowCreationPreset } from "../lib/workflowCreationPresets";
import { formatServiceCategory } from "../lib/serviceCatalog";
import { formatVehicleLabel } from "../lib/vehicles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Loader2, Check, ChevronsUpDown, ChevronDown, ChevronUp, Package, ChevronLeft, X, Search, Clock, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  durationMinutes?: number | null;
  category?: string | null;
  categoryId?: string | null;
  categoryLabel?: string | null;
  notes?: string | null;
  isAddon?: boolean | null;
  active?: boolean | null;
};

type AddonLinkRecord = {
  id: string;
  parentServiceId: string;
  addonServiceId: string;
};

type ClientPickerRecord = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

const DEFAULT_ADMIN_FEE_LABEL = "Admin fee";

function toMoneyNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function formatDuration(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function SelectionIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background"
      )}
    >
      {checked ? <Check className="size-3 text-secondary" /> : null}
    </span>
  );
}

function getServiceSearchHaystack(service: ServiceRecord) {
  return [service.name, service.notes, service.categoryLabel ?? formatServiceCategory(service.category)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildPackageTemplates(
  services: ServiceRecord[],
  addonLinks: AddonLinkRecord[],
) {
  return services
    .filter((service) => !service.isAddon)
    .map((service) => {
      const linkedAddons = addonLinks
        .filter((link) => link.parentServiceId === service.id)
        .map((link) => services.find((candidate) => candidate.id === link.addonServiceId))
        .filter(Boolean) as ServiceRecord[];
      return {
        baseService: service,
        linkedAddons,
        totalPrice:
          toMoneyNumber(service.price) +
          linkedAddons.reduce((sum, addon) => sum + toMoneyNumber(addon.price), 0),
        totalDuration:
          Number(service.durationMinutes ?? 0) +
          linkedAddons.reduce((sum, addon) => sum + Number(addon.durationMinutes ?? 0), 0),
      };
    })
    .filter((entry) => entry.linkedAddons.length > 0);
}

function buildGroupedServices(
  services: ServiceRecord[],
  recommendedCategories: string[],
  normalizedServiceSearch: string,
) {
  const groups = new Map<string, { title: string; categoryKey: string; services: ServiceRecord[] }>();

  for (const service of services) {
    const haystack = getServiceSearchHaystack(service);
    if (normalizedServiceSearch && !haystack.includes(normalizedServiceSearch)) continue;
    const categoryKey = String(service.category ?? "other");
    const title = service.categoryLabel ?? formatServiceCategory(service.category);
    const key = service.categoryId ? `category:${service.categoryId}` : `legacy:${title.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) existing.services.push(service);
    else groups.set(key, { title, categoryKey, services: [service] });
  }

  return Array.from(groups.entries())
    .sort(([, left], [, right]) => {
      const leftRecommended = recommendedCategories.includes(left.categoryKey);
      const rightRecommended = recommendedCategories.includes(right.categoryKey);
      if (leftRecommended !== rightRecommended) return leftRecommended ? -1 : 1;
      return left.title.localeCompare(right.title);
    })
    .map(([groupKey, group]) => ({
      category: groupKey,
      categoryKey: group.categoryKey,
      title: group.title,
      recommended: recommendedCategories.includes(group.categoryKey),
      services: group.services.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function findDirectServiceSearchResults(
  services: ServiceRecord[],
  normalizedServiceSearch: string,
) {
  if (!normalizedServiceSearch) return [];
  return services
    .filter((service) => getServiceSearchHaystack(service).includes(normalizedServiceSearch))
    .sort((left, right) => {
      const leftStartsWith = left.name.toLowerCase().startsWith(normalizedServiceSearch);
      const rightStartsWith = right.name.toLowerCase().startsWith(normalizedServiceSearch);
      if (leftStartsWith !== rightStartsWith) return leftStartsWith ? -1 : 1;
      return left.name.localeCompare(right.name);
    })
    .slice(0, 8);
}

function getUniqueClientPickerRecords(records: Array<ClientPickerRecord | null | undefined>) {
  return Array.from(
    new Map(
      records
        .filter(Boolean)
        .map((record) => [record!.id, record!])
    ).values()
  );
}

function getClientDisplayName(client: ClientPickerRecord | null | undefined) {
  return [client?.firstName, client?.lastName].filter(Boolean).join(" ").trim() || "Client";
}

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
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [expandedServiceCategories, setExpandedServiceCategories] = useState<string[]>([]);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });
  const [quickClientError, setQuickClientError] = useState("");
  const [createdInlineClient, setCreatedInlineClient] = useState<ClientPickerRecord | null>(null);
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
  const [{ data: clients }, refetchClients] = useFindMany(api.client, {
    filter: businessId
      ? { businessId: { equals: businessId } }
      : { id: { equals: "skip" } },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
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

  const clientRecords = getUniqueClientPickerRecords([
    createdInlineClient,
    ...((clients ?? []) as ClientPickerRecord[]),
  ]);
  const selectedClientRecord = clientRecords.find((client) => client.id === selectedClientId) ?? null;
  const filteredClients = clientRecords.filter((client) => {
    const query = clientSearch.toLowerCase();
    const searchable = [
      getClientDisplayName(client),
      client.email ?? "",
      client.phone ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });

  // Services for quick-add
  const [{ data: services }] = useFindMany(api.service, {
    filter: { active: { equals: true } },
    select: { id: true, name: true, price: true, durationMinutes: true, category: true, categoryId: true, categoryLabel: true, notes: true, isAddon: true, active: true },
    sort: { name: "Ascending" },
    first: 250,
  });
  const [{ data: packageAddonLinks }] = useFindMany(api.serviceAddonLink, {
    first: 250,
  } as any);

  const [, runCreate] = useAction(api.quote.create);
  const [{ fetching: creatingClient }, createClient] = useAction(api.client.create);

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

  const handleQuickClientFieldChange = (field: keyof typeof quickClientForm, value: string) => {
    setQuickClientForm((current) => ({ ...current, [field]: value }));
    if (quickClientError) setQuickClientError("");
  };

  const handleQuickAddClient = async () => {
    if (!businessId) {
      setQuickClientError("Business profile not loaded. Refresh and try again.");
      return;
    }

    const firstName = quickClientForm.firstName.trim();
    const lastName = quickClientForm.lastName.trim();
    const phone = quickClientForm.phone.trim();
    const email = quickClientForm.email.trim();

    if (!firstName || !lastName) {
      setQuickClientError("First and last name are required.");
      return;
    }

    setQuickClientError("");
    const result = await createClient({
      firstName,
      lastName,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
    });

    if (result.error) {
      setQuickClientError(result.error.message ?? "Failed to create client.");
      return;
    }

    const createdClientId = (result.data as { id?: string } | null)?.id;
    if (!createdClientId) {
      setQuickClientError("Client saved but no record ID was returned. Please refresh and try again.");
      return;
    }

    const createdClient: ClientPickerRecord = {
      id: createdClientId,
      firstName,
      lastName,
      phone: phone || null,
      email: email || null,
    };

    setCreatedInlineClient(createdClient);
    setSelectedClientId(createdClientId);
    setSelectedVehicleId("");
    setClientComboOpen(false);
    setClientSearch("");
    setQuickClientOpen(false);
    setQuickClientForm({ firstName: "", lastName: "", phone: "", email: "" });
    await refetchClients();
    toast.success("Client added");
  };

  const serviceRecords = (services ?? []) as ServiceRecord[];
  const addonLinks = (packageAddonLinks ?? []) as AddonLinkRecord[];
  const normalizedServiceSearch = serviceSearchQuery.trim().toLowerCase();
  const packageTemplates = buildPackageTemplates(serviceRecords, addonLinks);
  const recommendedPackageTemplates = packageTemplates.filter((pkg) =>
    creationPreset.recommendedCategories.includes(String(pkg.baseService.category ?? "other")) &&
    [
      pkg.baseService.name,
      pkg.baseService.notes,
      ...pkg.linkedAddons.map((addon) => addon.name),
      pkg.baseService.categoryLabel ?? formatServiceCategory(pkg.baseService.category),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedServiceSearch || "")
  );
  const otherPackageTemplates = packageTemplates.filter(
    (pkg) =>
      !creationPreset.recommendedCategories.includes(String(pkg.baseService.category ?? "other")) &&
      [
        pkg.baseService.name,
        pkg.baseService.notes,
        ...pkg.linkedAddons.map((addon) => addon.name),
        pkg.baseService.categoryLabel ?? formatServiceCategory(pkg.baseService.category),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedServiceSearch || "")
  );
  const groupedServices = buildGroupedServices(serviceRecords, creationPreset.recommendedCategories, normalizedServiceSearch);
  const directServiceSearchResults = findDirectServiceSearchResults(serviceRecords, normalizedServiceSearch);
  const selectedExpiryDate = expiresAt ? parseDateInputValue(expiresAt) ?? undefined : undefined;

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
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,1))]">
    <div className="mx-auto max-w-6xl px-3 py-5 pb-28 sm:px-6 sm:pb-8 lg:px-8">
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to quotes queue" /> : null}
      <div className="mb-5 overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/85 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_42px_rgba(15,23,42,0.06)] backdrop-blur-md">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.13),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0))] px-3 py-3 sm:px-5 sm:py-5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(returnTo)}
            className="h-10 shrink-0 rounded-full px-3"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* Left column */}
        <div className="min-w-0 space-y-5">
          {/* Line Items Card */}
          <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4 sm:px-5">
              <CardTitle className="text-base font-semibold">Quoted services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
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

              {services && services.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/70 bg-slate-50/70 p-3 sm:p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <p className="text-sm font-medium">Find services</p>
                        <div className="relative w-full lg:max-w-xs">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={serviceSearchQuery}
                            onChange={(event) => setServiceSearchQuery(event.target.value)}
                            placeholder="Search services, notes, or category..."
                            className="h-10 rounded-xl bg-white pl-9"
                          />
                        </div>
                      </div>
                    </div>

                    {recommendedPackageTemplates.length + otherPackageTemplates.length > 0 && (
                      <Accordion type="single" collapsible className="rounded-2xl border border-border/70 bg-card px-3 sm:px-4">
                        <AccordionItem value="packages" className="border-b-0">
                          <AccordionTrigger className="py-4 hover:no-underline">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Package className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 text-left">
                                <p className="text-sm font-semibold text-foreground">Packages</p>
                                <p className="text-xs text-muted-foreground">
                                  {recommendedPackageTemplates.length + otherPackageTemplates.length} template
                                  {recommendedPackageTemplates.length + otherPackageTemplates.length === 1 ? "" : "s"} available
                                </p>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="space-y-4 pb-4">
                            {recommendedPackageTemplates.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recommended</p>
                                <div className="grid gap-3 md:grid-cols-2">
                                  {recommendedPackageTemplates.map((pkg) => (
                                    <button
                                      key={pkg.baseService.id}
                                      type="button"
                                      onClick={() => addPackageAsLineItems(pkg.baseService, pkg.linkedAddons)}
                                      className="rounded-2xl border border-border/70 bg-background p-4 text-left shadow-sm transition-colors hover:bg-muted/30"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold">{pkg.baseService.name}</p>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            {pkg.baseService.categoryLabel ?? formatServiceCategory(pkg.baseService.category)} · {pkg.linkedAddons.length + 1} services
                                          </p>
                                        </div>
                                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <span>{pkg.totalDuration > 0 ? formatDuration(pkg.totalDuration) : "Custom duration"}</span>
                                        <span>·</span>
                                        <span>{formatCurrency(pkg.totalPrice)}</span>
                                      </div>
                                      <p className="mt-3 text-xs text-muted-foreground">
                                        Includes {pkg.linkedAddons.map((addon) => addon.name).join(", ")}.
                                      </p>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {otherPackageTemplates.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Other packages</p>
                                <div className="grid gap-3 md:grid-cols-2">
                                  {otherPackageTemplates.map((pkg) => (
                                    <button
                                      key={pkg.baseService.id}
                                      type="button"
                                      onClick={() => addPackageAsLineItems(pkg.baseService, pkg.linkedAddons)}
                                      className="rounded-2xl border border-border/70 bg-background p-4 text-left shadow-sm transition-colors hover:bg-muted/30"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold">{pkg.baseService.name}</p>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            {pkg.baseService.categoryLabel ?? formatServiceCategory(pkg.baseService.category)} · {pkg.linkedAddons.length + 1} services
                                          </p>
                                        </div>
                                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <span>{pkg.totalDuration > 0 ? formatDuration(pkg.totalDuration) : "Custom duration"}</span>
                                        <span>·</span>
                                        <span>{formatCurrency(pkg.totalPrice)}</span>
                                      </div>
                                      <p className="mt-3 text-xs text-muted-foreground">
                                        Includes {pkg.linkedAddons.map((addon) => addon.name).join(", ")}.
                                      </p>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}

                    {directServiceSearchResults.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">Search results</p>
                          <p className="text-xs text-muted-foreground">
                            {directServiceSearchResults.length} match{directServiceSearchResults.length === 1 ? "" : "es"}
                          </p>
                        </div>
                        <div className="grid gap-2">
                          {directServiceSearchResults.map((service) => (
                            <button
                              key={service.id}
                              type="button"
                              className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40"
                              onClick={() => addServiceAsLineItem(service)}
                            >
                              <SelectionIndicator checked={false} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground">{service.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {service.categoryLabel ?? formatServiceCategory(service.category)}
                                  {service.notes ? ` - ${service.notes}` : ""}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-3 text-sm">
                                {service.durationMinutes != null && service.durationMinutes > 0 ? (
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {formatDuration(service.durationMinutes)}
                                  </span>
                                ) : null}
                                <span className="font-semibold">
                                  {formatCurrency(toMoneyNumber(service.price))}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {groupedServices.length > 0 ? (
                      <Accordion
                        type="multiple"
                        value={expandedServiceCategories}
                        onValueChange={setExpandedServiceCategories}
                        className="rounded-2xl border border-border/70 bg-card px-3 sm:px-4"
                      >
                        {groupedServices.map((group) => (
                          <AccordionItem key={group.category} value={group.category}>
                            <AccordionTrigger className="py-4 hover:no-underline">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">{group.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {group.services.length} service{group.services.length === 1 ? "" : "s"}
                                  </p>
                                </div>
                                {group.recommended ? (
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                                    Recommended
                                  </span>
                                ) : null}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="space-y-2 pb-4">
                              {group.services.map((service) => (
                                <button
                                  key={service.id}
                                  type="button"
                                  className="flex min-h-[60px] w-full select-none items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/40"
                                  onClick={() => addServiceAsLineItem(service)}
                                >
                                  <SelectionIndicator checked={false} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">{service.name}</p>
                                    {service.notes ? (
                                      <p className="truncate text-xs text-muted-foreground">{service.notes}</p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-3 text-sm">
                                    {service.durationMinutes != null && service.durationMinutes > 0 ? (
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        {formatDuration(service.durationMinutes)}
                                      </span>
                                    ) : null}
                                    <span className="font-semibold">
                                      {formatCurrency(toMoneyNumber(service.price))}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                        No services match this search yet. Try another term or clear the search.
                      </div>
                    )}
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
            <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4 sm:px-5">
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
              <CardContent className="p-4 sm:p-5">
                <Textarea
                  placeholder="Additional notes for the client..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="min-h-[104px] resize-none rounded-xl"
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          {/* Client & Vehicle Card */}
          <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4">
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
            <CardContent className={showMobileClientVehicle ? "space-y-4 p-4" : "hidden space-y-4 p-4 lg:block"}>
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
                <div className="flex items-center justify-between gap-3">
                  <Label>Client</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => {
                      setQuickClientOpen((open) => !open);
                      setQuickClientError("");
                    }}
                  >
                    {quickClientOpen ? (
                      <>
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Cancel
                      </>
                    ) : (
                      <>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        New client
                      </>
                    )}
                  </Button>
                </div>
                <Popover open={clientComboOpen} onOpenChange={setClientComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientComboOpen}
                      className="h-11 w-full justify-between rounded-xl font-normal"
                    >
                      {selectedClientRecord
                        ? getClientDisplayName(selectedClientRecord)
                        : selectedClientId
                        ? "Loading..."
                        : "Select client..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] overflow-hidden rounded-2xl p-0" align="start">
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
                                setSelectedVehicleId("");
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
                              <div className="min-w-0">
                                <div className="font-medium">{getClientDisplayName(client)}</div>
                                {client.email || client.phone ? (
                                  <div className="truncate text-xs text-muted-foreground">
                                    {client.email ?? client.phone}
                                  </div>
                                ) : null}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {quickClientOpen ? (
                  <div className="rounded-2xl border border-orange-100 bg-orange-50/45 p-3 shadow-[0_10px_24px_rgba(249,115,22,0.08)]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="quote-client-first-name">First name</Label>
                        <Input
                          id="quote-client-first-name"
                          value={quickClientForm.firstName}
                          onChange={(event) => handleQuickClientFieldChange("firstName", event.target.value)}
                          placeholder="Jane"
                          autoComplete="given-name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="quote-client-last-name">Last name</Label>
                        <Input
                          id="quote-client-last-name"
                          value={quickClientForm.lastName}
                          onChange={(event) => handleQuickClientFieldChange("lastName", event.target.value)}
                          placeholder="Smith"
                          autoComplete="family-name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="quote-client-phone">Phone</Label>
                        <Input
                          id="quote-client-phone"
                          type="tel"
                          value={quickClientForm.phone}
                          onChange={(event) => handleQuickClientFieldChange("phone", event.target.value)}
                          placeholder="(555) 000-0000"
                          autoComplete="tel"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="quote-client-email">Email</Label>
                        <Input
                          id="quote-client-email"
                          type="email"
                          value={quickClientForm.email}
                          onChange={(event) => handleQuickClientFieldChange("email", event.target.value)}
                          placeholder="jane@example.com"
                          autoComplete="email"
                        />
                      </div>
                    </div>
                    {quickClientError ? <p className="mt-3 text-xs text-destructive">{quickClientError}</p> : null}
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Button type="button" size="sm" onClick={() => void handleQuickAddClient()} disabled={creatingClient}>
                        {creatingClient ? "Saving..." : "Save client"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Saves the customer here, then keeps you on this quote.
                      </p>
                    </div>
                  </div>
                ) : null}
                {selectedClientRecord?.email ? (
                  <p className="text-xs text-muted-foreground">
                    Quote communication can use {selectedClientRecord.email}.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicle">Vehicle</Label>
                <Select
                  value={selectedVehicleId}
                  onValueChange={setSelectedVehicleId}
                  disabled={!selectedClientId}
                >
                  <SelectTrigger id="vehicle" className="h-11 rounded-xl">
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
          <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4">
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
            <CardContent className={showMobileApprovalSettings ? "space-y-4 p-4" : "hidden space-y-4 p-4 lg:block"}>
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expires At</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="expiresAt"
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-11 w-full justify-start rounded-xl text-left font-normal",
                        !selectedExpiryDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedExpiryDate ? format(selectedExpiryDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto overflow-hidden rounded-2xl p-0"
                    align="start"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                  >
                    <Calendar
                      mode="single"
                      selected={selectedExpiryDate}
                      onSelect={(date) => {
                        setExpiresAt(date ? format(date, "yyyy-MM-dd") : "");
                        setDatePickerOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* Summary Card */}
          <Card className="overflow-hidden rounded-[1.35rem] border-primary/25 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <CardHeader className="border-b border-primary/15 bg-primary/[0.04] px-4 py-4">
              <CardTitle className="text-base font-semibold">Quote summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Client-facing total</p>
                <p className="mt-1 text-3xl font-semibold tracking-[-0.03em]">{formatCurrency(total)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasValidLineItems
                    ? `${lineItems.filter((item) => item.description.trim()).length} line item${lineItems.filter((item) => item.description.trim()).length === 1 ? "" : "s"} ready to quote`
                    : "Add services to see the final estimate"}
                </p>
              </div>
              <div className="space-y-2 rounded-2xl border border-border/70 bg-slate-50/70 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                {effectiveAdminFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Admin fee ({adminFeeRateNum}%)</span>
                    <span className="font-medium">{formatCurrency(effectiveAdminFee)}</span>
                  </div>
                )}
                {taxRateNum > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax ({taxRateNum}%)</span>
                    <span className="font-medium">{formatCurrency(taxAmount)}</span>
                  </div>
                )}
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>

              <div className="hidden space-y-4 lg:block">{quoteChargeControls}</div>

              <Button
                className="h-11 w-full rounded-xl"
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
              <Button type="button" variant="outline" className="h-11 w-full rounded-xl" asChild>
                <Link to={returnTo}>Cancel</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
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
              "Create"
            )}
          </Button>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
