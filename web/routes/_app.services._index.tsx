import { useState, useMemo } from "react";
import { useOutletContext } from "react-router";
import { useFindMany, useAction } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Package, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";
import {
  SERVICE_CATEGORY_VALUES,
  SERVICE_CATEGORY_LABELS,
  formatServiceCategory,
  type ServiceCategory,
} from "../lib/serviceCatalog";

interface ServiceRecord {
  id: string;
  name: string;
  price: number;
  durationMinutes: number | null;
  category: string | null;
  active: boolean | null;
  isAddon: boolean | null;
  taxable: boolean | null;
  notes: string | null;
}

interface AddonLinkRecord {
  id: string;
  parentServiceId: string;
  addonServiceId: string;
  sortOrder?: number | null;
}

interface ServiceFormData {
  name: string;
  price: string;
  duration: string;
  category: string;
  notes: string;
  taxable: boolean;
  isAddon: boolean;
}

const defaultFormData: ServiceFormData = {
  name: "",
  price: "",
  duration: "",
  category: "other",
  notes: "",
  taxable: true,
  isAddon: false,
};

function formatPrice(price: number | string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(price));
}

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function serviceToFormData(service: ServiceRecord): ServiceFormData {
  return {
    name: service.name ?? "",
    price: service.price != null ? String(service.price) : "",
    duration: service.durationMinutes != null ? String(service.durationMinutes) : "",
    category: service.category ?? "other",
    notes: service.notes ?? "",
    taxable: service.taxable ?? true,
    isAddon: service.isAddon ?? false,
  };
}

function ServiceCardSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-2 flex-1">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-6 w-10 rounded-full" />
      </div>
    </div>
  );
}

function ActiveToggle({
  active,
  onToggle,
  loading,
}: {
  active: boolean;
  onToggle: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!loading) onToggle();
      }}
      disabled={loading}
      aria-label={active ? "Deactivate service" : "Activate service"}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        active ? "bg-green-500" : "bg-input"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
          active ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

interface ServiceFormProps {
  formData: ServiceFormData;
  onChange: (data: ServiceFormData) => void;
}

function ServiceForm({ formData, onChange }: ServiceFormProps) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="svc-name">Name *</Label>
        <Input
          id="svc-name"
          value={formData.name}
          onChange={(e) => onChange({ ...formData, name: e.target.value })}
          placeholder="e.g. Full Detail Package"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="svc-price">Price ($) *</Label>
          <Input
            id="svc-price"
            type="number"
            min="0"
            step="0.01"
            value={formData.price}
            onChange={(e) => onChange({ ...formData, price: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="svc-duration">Est. duration (min)</Label>
          <Input
            id="svc-duration"
            type="number"
            min="0"
            step="1"
            value={formData.duration}
            onChange={(e) =>
              onChange({ ...formData, duration: e.target.value })
            }
            placeholder="e.g. 120"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="svc-category">Category *</Label>
        <Select
          value={formData.category}
          onValueChange={(val) => onChange({ ...formData, category: val })}
        >
          <SelectTrigger id="svc-category">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {SERVICE_CATEGORY_VALUES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {SERVICE_CATEGORY_LABELS[cat]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="svc-notes">Notes</Label>
        <Textarea
          id="svc-notes"
          value={formData.notes}
          onChange={(e) => onChange({ ...formData, notes: e.target.value })}
          placeholder="Optional - internal notes, inclusions, or booking hints."
          rows={3}
        />
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Checkbox
            id="svc-taxable"
            checked={formData.taxable}
            onCheckedChange={(checked) =>
              onChange({ ...formData, taxable: Boolean(checked) })
            }
          />
          <Label htmlFor="svc-taxable" className="cursor-pointer">
            Taxable
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="svc-addon"
            checked={formData.isAddon}
            onCheckedChange={(checked) =>
              onChange({ ...formData, isAddon: Boolean(checked) })
            }
          />
          <Label htmlFor="svc-addon" className="cursor-pointer">
            Add-on service
          </Label>
        </div>
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const { businessId } = useOutletContext<AuthOutletContext>();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const businessIdFilter = useMemo(
    () => (businessId ? { businessId: { equals: businessId } } : undefined),
    [businessId]
  );

  const [{ data: services, fetching: servicesFetching }, refetchServices] =
    useFindMany(api.service, {
      filter: businessIdFilter,
      sort: { category: "Ascending" },
      first: 100,
      select: {
        id: true,
        name: true,
        price: true,
        durationMinutes: true,
        category: true,
        active: true,
        isAddon: true,
        taxable: true,
        notes: true,
      },
      pause: !businessId,
    });

  const [{ fetching: updateFetching, error: updateError }, runUpdate] =
    useAction(api.service.update);
  const [{ fetching: createFetching, error: createError }, runCreate] =
    useAction(api.service.create);
  const [{ fetching: deleteFetching, error: deleteError }, runDelete] =
    useAction(api.service.delete);

  const [newAddonServiceId, setNewAddonServiceId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"active" | "inactive">("active");
  const [editService, setEditService] = useState<ServiceRecord | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editFormData, setEditFormData] = useState<ServiceFormData>(defaultFormData);
  const [createFormData, setCreateFormData] = useState<ServiceFormData>(defaultFormData);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const addonLinkFilter = useMemo(
    () =>
      editService
        ? { parentService: { id: { equals: editService.id } } }
        : undefined,
    [editService]
  );

  const [{ data: addonLinks, fetching: addonLinksFetching }, refetchAddonLinks] = useFindMany(
    api.serviceAddonLink,
    {
      filter: addonLinkFilter,
      select: { id: true, addonServiceId: true, parentServiceId: true, sortOrder: true },
      first: 50,
      pause: !editService,
    }
  );

  const [{ fetching: creatingAddonLink }, runCreateAddonLink] = useAction(api.serviceAddonLink.create);
  const [{ fetching: deletingAddonLink }, runDeleteAddonLink] = useAction(api.serviceAddonLink.delete);

  const resetEditDialogState = () => {
    setNewAddonServiceId("");
  };

  const [{ data: packageAddonLinks }] = useFindMany(api.serviceAddonLink, {
    first: 250,
    pause: !businessId,
  } as any);

  // Open edit dialog
  const handleEditService = (service: ServiceRecord) => {
    setEditService(service);
    setEditFormData(serviceToFormData(service));
    setNewAddonServiceId("");
  };

  // Handle edit form submit
  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editService) return;
    if (!editFormData.name.trim() || !editFormData.price || !editFormData.category) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const result = await runUpdate({
      id: editService.id,
      name: editFormData.name.trim(),
      price: parseFloat(editFormData.price),
      durationMinutes: editFormData.duration ? parseInt(editFormData.duration, 10) : null,
      category: editFormData.category as ServiceCategory,
      notes: editFormData.notes.trim() || null,
      taxable: editFormData.taxable,
      isAddon: editFormData.isAddon,
    });
    if (result.error) {
      toast.error("Failed to update service: " + result.error.message);
    } else {
      toast.success("Service updated successfully.");
      setEditService(null);
      resetEditDialogState();
      void refetchServices();
    }
  };

  // Handle create form submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFormData.name.trim() || !createFormData.price || !createFormData.category) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const result = await runCreate({
      name: createFormData.name.trim(),
      price: parseFloat(createFormData.price),
      durationMinutes: createFormData.duration ? parseInt(createFormData.duration, 10) : null,
      category: createFormData.category as ServiceCategory,
      notes: createFormData.notes.trim() || null,
      taxable: createFormData.taxable,
      isAddon: createFormData.isAddon,
      business: businessId ? { _link: businessId } : undefined,
    });
    if (result.error) {
      toast.error("Failed to create service: " + result.error.message);
    } else {
      toast.success("Service created successfully.");
      setCreateDialogOpen(false);
      setCreateFormData(defaultFormData);
      void refetchServices();
    }
  };

  // Handle toggle active
  const handleToggleActive = async (service: ServiceRecord) => {
    setTogglingId(service.id);
    try {
      const newActive = !service.active;
      const result = await runUpdate({ id: service.id, active: newActive });
      if (result.error) {
        toast.error("Failed to update service: " + result.error.message);
      } else {
        toast.success(newActive ? "Service activated" : "Service deactivated");
        void refetchServices();
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleAddAddonLink = async () => {
    if (!newAddonServiceId || !editService) return;
    const result = await runCreateAddonLink({
      parentServiceId: editService.id,
      addonServiceId: newAddonServiceId,
    });
    if (result.error) {
      toast.error("Failed to add add-on: " + result.error.message);
      return;
    }
    toast.success("Add-on linked");
    setNewAddonServiceId("");
    void refetchAddonLinks();
  };

  const handleRemoveAddonLink = async (linkId: string) => {
    const result = await runDeleteAddonLink({ id: linkId });
    if (result.error) {
      toast.error("Failed to remove add-on: " + result.error.message);
      return;
    }
    toast.success("Add-on removed");
    void refetchAddonLinks();
  };

  const isFirstLoad = servicesFetching && !services;
  const isRefetching = servicesFetching && !!services;

  const allServices: ServiceRecord[] = (services ?? []) as ServiceRecord[];
  const allAddonLinks: AddonLinkRecord[] = (packageAddonLinks ?? []) as AddonLinkRecord[];
  const normalizedSearch = search.trim().toLowerCase();

  // Separate addons from regular services
  const regularServices = allServices.filter((s) => !s.isAddon);
  const addonServices = allServices.filter((s) => s.isAddon);

  // Filter by active tab
  const filteredRegular = regularServices.filter((service) => {
    const matchesActive = activeTab === "active" ? service.active !== false : service.active === false;
    const matchesCategory = categoryFilter === "all" ? true : (service.category ?? "other") === categoryFilter;
    const haystack = [service.name, service.notes, formatServiceCategory(service.category)].filter(Boolean).join(" ").toLowerCase();
    const matchesSearch = normalizedSearch ? haystack.includes(normalizedSearch) : true;
    return matchesActive && matchesCategory && matchesSearch;
  });
  const filteredAddons = addonServices.filter((service) => {
    const matchesActive = activeTab === "active" ? service.active !== false : service.active === false;
    const matchesCategory = categoryFilter === "all" ? true : (service.category ?? "other") === categoryFilter;
    const haystack = [service.name, service.notes, formatServiceCategory(service.category)].filter(Boolean).join(" ").toLowerCase();
    const matchesSearch = normalizedSearch ? haystack.includes(normalizedSearch) : true;
    return matchesActive && matchesCategory && matchesSearch;
  });

  // Group regular services by category
  const groupedByCategory = filteredRegular.reduce<
    Record<string, ServiceRecord[]>
  >((acc, service) => {
    const cat = service.category ?? "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(service);
    return acc;
  }, {});

  const sortedCategories = Object.keys(groupedByCategory).sort();

  const packageSummaries = filteredRegular
    .map((service) => {
      const linkedAddonRecords = allAddonLinks.filter((link) => link.parentServiceId === service.id);
      const linkedAddons = linkedAddonRecords
        .map((link) => allServices.find((candidate) => candidate.id === link.addonServiceId))
        .filter(Boolean) as ServiceRecord[];
      const basePrice = Number(service.price ?? 0);
      const addonPrice = linkedAddons.reduce((sum, addon) => sum + Number(addon.price ?? 0), 0);
      const baseDuration = Number(service.durationMinutes ?? 0);
      const addonDuration = linkedAddons.reduce((sum, addon) => sum + Number(addon.durationMinutes ?? 0), 0);
      return {
        service,
        linkedAddons,
        packagePrice: basePrice + addonPrice,
        packageDuration: baseDuration + addonDuration,
      };
    })
    .sort((a, b) => a.service.name.localeCompare(b.service.name));

  const packagesWithStructure = packageSummaries.filter((summary) => summary.linkedAddons.length > 0);
  const packageCandidatesWithoutAddons = packageSummaries.filter((summary) => summary.linkedAddons.length === 0);
  const activeServicesCount = regularServices.filter((service) => service.active !== false).length;
  const activeAddonCount = addonServices.filter((service) => service.active !== false).length;

  return (
    <div className="page-content page-section max-w-6xl">
      <PageHeader
        title="Services"
        right={
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Service
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground">Core services</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{activeServicesCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">Active catalog services customers can book</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground">Package templates</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{packagesWithStructure.length}</p>
            <p className="mt-1 text-sm text-muted-foreground">Services with linked add-ons ready to reuse</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground">Add-on services</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{activeAddonCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">Optional extras available across the catalog</p>
          </CardContent>
        </Card>
      </div>

      <ListViewToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search services, notes, or categories..."
        loading={isRefetching}
        resultCount={filteredRegular.length + filteredAddons.length}
        noun="services"
        filtersLabel={[
          activeTab === "active" ? "Active only" : "Inactive only",
          categoryFilter !== "all" ? `Category: ${formatServiceCategory(categoryFilter)}` : null,
        ]
          .filter(Boolean)
          .join(" | ")}
        onClear={() => {
          setSearch("");
          setCategoryFilter("all");
          setActiveTab("active");
        }}
        actions={
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="min-w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {SERVICE_CATEGORY_VALUES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {SERVICE_CATEGORY_LABELS[cat]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "active" | "inactive")}
      >
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="inactive">Inactive</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isFirstLoad ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ServiceCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className={cn("flex flex-col gap-8", isRefetching && "opacity-60 transition-opacity")}>
              {/* Regular services grouped by category */}
              {sortedCategories.length === 0 && filteredAddons.length === 0 ? (
                <EmptyState
                  icon={Wrench}
                  title="No services yet"
                  description="Add your first service to start building appointments and invoices."
                  action={
                    <Button onClick={() => setCreateDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Service
                    </Button>
                  }
                />
              ) : (
                <>
                  {sortedCategories.map((cat) => (
                    <div key={cat} className="flex flex-col gap-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
                        {formatServiceCategory(cat)}
                      </h2>
                      <div className="flex flex-col gap-2">
                        {groupedByCategory[cat].map((service) => (
                          <ServiceCard
                            key={service.id}
                            service={service}
                            onEdit={handleEditService}
                            onToggle={handleToggleActive}
                            isToggling={togglingId === service.id}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Add-on services section */}
                  {filteredAddons.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
                        Add-On Services
                      </h2>
                      <div className="flex flex-col gap-2">
                        {filteredAddons.map((service) => (
                          <ServiceCard
                            key={service.id}
                            service={service}
                            onEdit={handleEditService}
                            onToggle={handleToggleActive}
                            isToggling={togglingId === service.id}
                            showAddonBadge
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Package Templates
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Reusable job bundles built from one primary service plus linked add-ons. This works across detailing,
                tint, PPF, repair, and any other vertical on the same shared catalog.
              </p>
            </div>
            <Badge variant="outline">{packagesWithStructure.length} configured</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isFirstLoad ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <ServiceCardSkeleton key={i} />
              ))}
            </div>
          ) : packagesWithStructure.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No package templates yet"
              description="Open any main service and attach add-ons to turn it into a reusable package template."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {packagesWithStructure.map((summary) => (
                <button
                  key={summary.service.id}
                  type="button"
                  onClick={() => handleEditService(summary.service)}
                  className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/30"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold">{summary.service.name}</h3>
                        <Badge variant="secondary">{formatServiceCategory(summary.service.category)}</Badge>
                        {summary.service.active === false ? <Badge variant="outline">Inactive</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Base service plus {summary.linkedAddons.length} linked add-on{summary.linkedAddons.length === 1 ? "" : "s"}.
                      </p>
                    </div>
                    <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Package Price</p>
                      <p className="font-medium">{formatPrice(summary.packagePrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Est. Duration</p>
                      <p className="font-medium">{formatDuration(summary.packageDuration) || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Includes</p>
                      <p className="font-medium">{summary.linkedAddons.length + 1} services</p>
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Linked add-ons</p>
                    <div className="flex flex-wrap gap-2">
                      {summary.linkedAddons.map((addon) => (
                        <Badge key={addon.id} variant="outline" className="bg-muted/30">
                          {addon.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {packageCandidatesWithoutAddons.length > 0 ? (
            <div className="rounded-lg border border-dashed p-4">
              <p className="text-sm font-medium">Good package candidates</p>
              <p className="mt-1 text-sm text-muted-foreground">
                These services do not have add-ons yet. Open one to attach extras and turn it into a stronger package.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {packageCandidatesWithoutAddons.slice(0, 10).map((summary) => (
                  <Button
                    key={summary.service.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditService(summary.service)}
                  >
                    {summary.service.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Edit Service Dialog */}
      <Dialog
        open={editService !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditService(null);
            resetEditDialogState();
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>
              Update the details for this service.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateSubmit}>
            <ServiceForm
              formData={editFormData}
              onChange={setEditFormData}
            />

            <Separator className="my-3" />

            <div className="space-y-2">
              <p className="text-sm font-medium">Optional add-ons</p>
              <p className="text-xs text-muted-foreground">
                Link other catalog services offered as add-ons with this service (e.g. coating + add-on polish). Same
                structure for every business type.
              </p>
              {addonLinksFetching ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : addonLinks && addonLinks.length > 0 ? (
                <div className="space-y-1 mt-2">
                  <div className="flex flex-col gap-1">
                    {addonLinks.map((link) => {
                      const name =
                        allServices.find((s) => s.id === (link as { addonServiceId: string }).addonServiceId)
                          ?.name ?? "Service";
                      return (
                        <div
                          key={link.id}
                          className="flex items-center justify-between text-sm bg-muted/40 rounded px-2 py-1.5"
                        >
                          <span className="font-medium">{name}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveAddonLink(link.id)}
                            type="button"
                            disabled={deletingAddonLink}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">No add-ons linked yet.</p>
              )}

              <div className="flex items-center gap-2 mt-2">
                <Select value={newAddonServiceId} onValueChange={setNewAddonServiceId}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="Select a service to offer as add-on" />
                  </SelectTrigger>
                  <SelectContent>
                    {allServices
                      .filter(
                        (s) =>
                          editService &&
                          s.id !== editService.id &&
                          s.active !== false &&
                          !(addonLinks ?? []).some(
                            (l) => (l as { addonServiceId: string }).addonServiceId === s.id
                          )
                      )
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.isAddon ? " Ã‚Â· add-on" : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs shrink-0"
                  onClick={() => void handleAddAddonLink()}
                  disabled={!newAddonServiceId || creatingAddonLink}
                  type="button"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            <DialogFooter className="mt-4 sm:justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={updateFetching || deleteFetching}
              >
                Delete Service
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditService(null);
                    resetEditDialogState();
                  }}
                  disabled={updateFetching}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateFetching}>
                  {updateFetching ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Service Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service?</AlertDialogTitle>
            <AlertDialogDescription>
              If this service has been used in past appointments it cannot be deleted - deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFetching}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (editService) {
                  const result = await runDelete({ id: editService.id });
                  if (result.error) {
                    toast.error(result.error.message);
                  } else {
                    toast.success("Service deleted");
                    setEditService(null);
                    setShowDeleteConfirm(false);
                    resetEditDialogState();
                    void refetchServices();
                  }
                }
              }}
              disabled={deleteFetching}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFetching ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Service Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>
              Create a new service for your business.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit}>
            <ServiceForm
              formData={createFormData}
              onChange={setCreateFormData}
            />
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  setCreateFormData(defaultFormData);
                }}
                disabled={createFetching}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createFetching}>
                {createFetching ? "Creating..." : "Create Service"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ServiceCardProps {
  service: ServiceRecord;
  onEdit: (service: ServiceRecord) => void;
  onToggle: (service: ServiceRecord) => void;
  isToggling: boolean;
  showAddonBadge?: boolean;
}

function ServiceCard({
  service,
  onEdit,
  onToggle,
  isToggling,
  showAddonBadge = false,
}: ServiceCardProps) {
  const durationStr = formatDuration(service.durationMinutes);

  return (
    <div
      className="flex items-center justify-between rounded-lg border bg-card p-4 cursor-pointer hover:bg-accent/50 transition-colors group"
      onClick={() => onEdit(service)}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{service.name}</span>
          {showAddonBadge && (
            <Badge variant="secondary" className="text-xs">
              Add-on
            </Badge>
          )}
          {service.category && (
            <Badge variant="outline" className="text-xs">
              {formatServiceCategory(service.category)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatPrice(service.price)}
          </span>
          {durationStr && (
            <>
              <span className="text-muted-foreground/50">|</span>
              <span>{durationStr}</span>
            </>
          )}
          {service.taxable && (
            <>
              <span className="text-muted-foreground/50">|</span>
              <span className="text-xs">Taxable</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 ml-4 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(service);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent"
          aria-label="Edit service"
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <Package className="h-3.5 w-3.5 text-muted-foreground/50" />
        <ActiveToggle
          active={service.active !== false}
          onToggle={() => onToggle(service)}
          loading={isToggling}
        />
      </div>
    </div>
  );
}
