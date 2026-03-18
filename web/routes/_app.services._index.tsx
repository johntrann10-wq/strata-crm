import { useState, useMemo } from "react";
import { useOutletContext } from "react-router";
import { useFindMany, useAction } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
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

const CATEGORY_OPTIONS = [
  "detailing",
  "tinting",
  "wrap",
  "ppf",
  "ceramic-coating",
  "paint-correction",
  "tires",
  "alignment",
  "wheels",
  "body-repair",
  "dent-removal",
  "glass",
  "performance",
  "audio-electronics",
  "lighting",
  "oil-change",
  "maintenance",
  "other",
] as const;

type CategoryOption = (typeof CATEGORY_OPTIONS)[number];

interface ServiceRecord {
  id: string;
  name: string;
  price: number;
  duration: number | null;
  category: string | null;
  active: boolean | null;
  isAddon: boolean | null;
  taxable: boolean | null;
  description: string | null;
}

interface ServiceFormData {
  name: string;
  price: string;
  duration: string;
  category: string;
  description: string;
  taxable: boolean;
  isAddon: boolean;
}

const defaultFormData: ServiceFormData = {
  name: "",
  price: "",
  duration: "",
  category: "",
  description: "",
  taxable: true,
  isAddon: false,
};

function formatCategory(cat: string): string {
  return cat
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
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
    duration: service.duration != null ? String(service.duration) : "",
    category: service.category ?? "",
    description: service.description ?? "",
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
          <Label htmlFor="svc-duration">Duration (min)</Label>
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
            {CATEGORY_OPTIONS.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {formatCategory(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="svc-description">Description</Label>
        <Textarea
          id="svc-description"
          value={formData.description}
          onChange={(e) =>
            onChange({ ...formData, description: e.target.value })
          }
          placeholder="Describe what this service includes..."
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

// Backend routes/tables for inventory linking are not implemented yet.
const INVENTORY_LINKS_SUPPORTED = false;

export default function ServicesPage() {
  const { user, businessId } = useOutletContext<AuthOutletContext>();

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
        duration: true,
        category: true,
        active: true,
        isAddon: true,
        taxable: true,
        description: true,
      },
      pause: !businessId,
    });

  const [{ fetching: updateFetching, error: updateError }, runUpdate] =
    useAction(api.service.update);
  const [{ fetching: createFetching, error: createError }, runCreate] =
    useAction(api.service.create);
  const [{ fetching: deleteFetching, error: deleteError }, runDelete] =
    useAction(api.service.delete);

  const [inventoryLinkServiceId, setInventoryLinkServiceId] = useState<string | null>(null);
  const [newLinkItemId, setNewLinkItemId] = useState<string>("");
  const [newLinkQty, setNewLinkQty] = useState<string>("1");

  const svcInvItemsFilter = useMemo(
    () => (inventoryLinkServiceId ? { serviceId: { equals: inventoryLinkServiceId } } : undefined),
    [inventoryLinkServiceId]
  );

  const [{ data: svcInvItems, fetching: svcInvFetching }, refetchSvcInv] = useFindMany(
    api.serviceInventoryItem,
    {
      filter: svcInvItemsFilter,
      select: {
        id: true,
        quantityUsed: true,
        inventoryItemId: true,
        inventoryItem: { id: true, name: true, unit: true },
      },
      first: 50,
      pause: !INVENTORY_LINKS_SUPPORTED || !inventoryLinkServiceId,
    }
  );

  const [{ data: allInventoryItems }] = useFindMany(api.inventoryItem, {
    filter: businessIdFilter,
    select: { id: true, name: true, unit: true },
    sort: { name: "Ascending" },
    first: 250,
    pause: !businessId || !INVENTORY_LINKS_SUPPORTED,
  });

  const [{ fetching: creatingLink }, runCreateLink] = useAction(api.serviceInventoryItem.create);
  const [{ fetching: deletingLink }, runDeleteLink] = useAction(api.serviceInventoryItem.delete);

  const resetInventoryState = () => {
    setInventoryLinkServiceId(null);
    setNewLinkItemId("");
    setNewLinkQty("1");
  };

  const [activeTab, setActiveTab] = useState<"active" | "inactive">("active");
  const [editService, setEditService] = useState<ServiceRecord | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editFormData, setEditFormData] = useState<ServiceFormData>(defaultFormData);
  const [createFormData, setCreateFormData] = useState<ServiceFormData>(defaultFormData);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Open edit dialog
  const handleEditService = (service: ServiceRecord) => {
    setEditService(service);
    setEditFormData(serviceToFormData(service));
    setInventoryLinkServiceId(service.id);
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
      duration: editFormData.duration ? parseInt(editFormData.duration, 10) : null,
      category: editFormData.category as CategoryOption,
      description: editFormData.description.trim() || null,
      taxable: editFormData.taxable,
      isAddon: editFormData.isAddon,
    });
    if (result.error) {
      toast.error("Failed to update service: " + result.error.message);
    } else {
      toast.success("Service updated successfully.");
      setEditService(null);
      resetInventoryState();
      refetchServices({ requestPolicy: "network-only" });
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
      duration: createFormData.duration ? parseInt(createFormData.duration, 10) : null,
      category: createFormData.category as CategoryOption,
      description: createFormData.description.trim() || null,
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
      refetchServices({ requestPolicy: "network-only" });
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
        refetchServices({ requestPolicy: "network-only" });
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleAddLink = async () => {
    if (!newLinkItemId || !inventoryLinkServiceId || !businessId) return;
    const result = await runCreateLink({
      service: { _link: inventoryLinkServiceId },
      inventoryItem: { _link: newLinkItemId },
      quantityUsed: parseFloat(newLinkQty) || 1,
      business: { _link: businessId },
    });
    if (result.error) {
      toast.error("Failed to link inventory item: " + result.error.message);
      return;
    }
    toast.success("Inventory item linked");
    setNewLinkItemId("");
    setNewLinkQty("1");
    refetchSvcInv();
    refetchServices({ requestPolicy: "network-only" });
  };

  const handleRemoveLink = async (linkId: string) => {
    const result = await runDeleteLink({ id: linkId });
    if (result.error) {
      toast.error("Failed to remove inventory link: " + result.error.message);
      return;
    }
    refetchSvcInv();
    refetchServices({ requestPolicy: "network-only" });
  };

  const isFirstLoad = servicesFetching && !services;
  const isRefetching = servicesFetching && !!services;

  const allServices: ServiceRecord[] = (services ?? []) as ServiceRecord[];

  // Separate addons from regular services
  const regularServices = allServices.filter((s) => !s.isAddon);
  const addonServices = allServices.filter((s) => s.isAddon);

  // Filter by active tab
  const filteredRegular = regularServices.filter((s) =>
    activeTab === "active" ? s.active !== false : s.active === false
  );
  const filteredAddons = addonServices.filter((s) =>
    activeTab === "active" ? s.active !== false : s.active === false
  );

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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Services"
        right={
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Service
          </Button>
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
                        {formatCategory(cat)}
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

      {/* Edit Service Dialog */}
      <Dialog
        open={editService !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditService(null);
            resetInventoryState();
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

            {INVENTORY_LINKS_SUPPORTED ? (
              <>
                {/* Inventory Links Section */}
                <div className="flex items-center gap-2 mt-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Inventory Links</span>
                  <span className="text-xs text-muted-foreground ml-1">(auto-deducted on job completion)</span>
                </div>

                {svcInvFetching ? (
                  <p className="text-xs text-muted-foreground mt-1">Loading...</p>
                ) : svcInvItems && svcInvItems.length > 0 ? (
                  <div className="space-y-1 mt-2">
                    {svcInvItems.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between text-sm bg-muted/40 rounded px-2 py-1.5"
                      >
                        <div>
                          <span className="font-medium">{(link as any).inventoryItem?.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            × {link.quantityUsed}
                            {(link as any).inventoryItem?.unit ? ` ${(link as any).inventoryItem.unit}` : ""}
                          </span>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveLink(link.id)}
                          type="button"
                          disabled={deletingLink}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">No inventory items linked yet.</p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <Select value={newLinkItemId} onValueChange={setNewLinkItemId}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue placeholder="Select inventory item" />
                    </SelectTrigger>
                    <SelectContent>
                      {(allInventoryItems ?? [])
                        .filter(
                          (item) =>
                            !(svcInvItems ?? []).some(
                              (link: any) => link.inventoryItemId === item.id
                            )
                        )
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={newLinkQty}
                    onChange={(e) => setNewLinkQty(e.target.value)}
                    className="w-20 h-8 text-xs"
                    placeholder="Qty"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={handleAddLink}
                    disabled={!newLinkItemId || creatingLink}
                    type="button"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Inventory linking is not available yet in this environment.
              </p>
            )}

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
                    resetInventoryState();
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
              If this service has been used in past appointments it cannot be deleted — deactivate it instead.
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
                    resetInventoryState();
                    refetchServices({ requestPolicy: "network-only" });
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
  const durationStr = formatDuration(service.duration);

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
              {formatCategory(service.category)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatPrice(service.price)}
          </span>
          {durationStr && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>{durationStr}</span>
            </>
          )}
          {service.taxable && (
            <>
              <span className="text-muted-foreground/50">·</span>
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