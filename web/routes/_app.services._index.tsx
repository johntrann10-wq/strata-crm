import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { useAction, useFindMany } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "../components/shared/EmptyState";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";
import { PageHeader } from "../components/shared/PageHeader";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  FolderKanban,
  Package,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { formatServiceCategory } from "../lib/serviceCatalog";

const UNCATEGORIZED_VALUE = "__uncategorized__";

type ServiceRecord = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number | null;
  category: string | null;
  categoryId: string | null;
  categoryLabel: string | null;
  sortOrder: number | null;
  active: boolean | null;
  isAddon: boolean | null;
  taxable: boolean | null;
  notes: string | null;
};

type CategoryRecord = {
  id: string;
  name: string;
  key: string | null;
  sortOrder: number;
  active: boolean;
  serviceCount: number;
};

type AddonLinkRecord = {
  id: string;
  parentServiceId: string;
  addonServiceId: string;
};

type ServiceFormData = {
  name: string;
  price: string;
  duration: string;
  categoryId: string;
  notes: string;
  taxable: boolean;
  isAddon: boolean;
};

const defaultServiceFormData: ServiceFormData = {
  name: "",
  price: "",
  duration: "",
  categoryId: UNCATEGORIZED_VALUE,
  notes: "",
  taxable: true,
  isAddon: false,
};

function formatPrice(price: number | string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(price ?? 0));
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
    categoryId: service.categoryId ?? UNCATEGORIZED_VALUE,
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

function CategoryForm({
  name,
  onChange,
}: {
  name: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 py-2">
      <Label htmlFor="category-name">Category name</Label>
      <Input
        id="category-name"
        value={name}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Ceramic Coatings"
      />
    </div>
  );
}

function ServiceForm({
  formData,
  onChange,
  categoryOptions,
}: {
  formData: ServiceFormData;
  onChange: (data: ServiceFormData) => void;
  categoryOptions: Array<{ value: string; label: string }>;
}) {
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
            onChange={(e) => onChange({ ...formData, duration: e.target.value })}
            placeholder="e.g. 120"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="svc-category">Category</Label>
        <Select value={formData.categoryId} onValueChange={(value) => onChange({ ...formData, categoryId: value })}>
          <SelectTrigger id="svc-category">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((category) => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
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
          placeholder="Internal notes, inclusions, or booking hints."
          rows={3}
        />
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Checkbox
            id="svc-taxable"
            checked={formData.taxable}
            onCheckedChange={(checked) => onChange({ ...formData, taxable: Boolean(checked) })}
          />
          <Label htmlFor="svc-taxable" className="cursor-pointer">
            Taxable
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="svc-addon"
            checked={formData.isAddon}
            onCheckedChange={(checked) => onChange({ ...formData, isAddon: Boolean(checked) })}
          />
          <Label htmlFor="svc-addon" className="cursor-pointer">
            Add-on service
          </Label>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
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
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
        active ? "bg-green-500" : "bg-input"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform",
          active ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

function ServiceCard({
  service,
  onEdit,
  onToggle,
  isToggling,
  onMoveUp,
  onMoveDown,
  moveDisabledUp,
  moveDisabledDown,
}: {
  service: ServiceRecord;
  onEdit: (service: ServiceRecord) => void;
  onToggle: (service: ServiceRecord) => void;
  isToggling: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  moveDisabledUp: boolean;
  moveDisabledDown: boolean;
}) {
  const durationStr = formatDuration(service.durationMinutes);

  return (
    <div
      className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30"
      onClick={() => onEdit(service)}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="truncate font-medium text-sm">{service.name}</span>
          {service.isAddon ? <Badge variant="secondary">Add-on</Badge> : null}
          <Badge variant="outline">{service.categoryLabel ?? formatServiceCategory(service.category)}</Badge>
        </div>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{formatPrice(service.price)}</span>
          {durationStr ? <span>{durationStr}</span> : null}
          {service.taxable ? <span>Taxable</span> : null}
        </div>
      </div>

      <div className="ml-4 flex items-center gap-2">
        <Button size="icon" variant="outline" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={moveDisabledUp}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="outline" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={moveDisabledDown}>
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="outline" onClick={(e) => { e.stopPropagation(); onEdit(service); }}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <ActiveToggle active={service.active !== false} onToggle={() => onToggle(service)} loading={isToggling} />
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const { businessId } = useOutletContext<AuthOutletContext>();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [serviceTab, setServiceTab] = useState<"active" | "inactive">("active");
  const [supportsCategoryManagement, setSupportsCategoryManagement] = useState(true);

  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryRecord | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<CategoryRecord | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [moveDeleteServicesTo, setMoveDeleteServicesTo] = useState<string>(UNCATEGORIZED_VALUE);

  const [createServiceOpen, setCreateServiceOpen] = useState(false);
  const [editService, setEditService] = useState<ServiceRecord | null>(null);
  const [deleteService, setDeleteService] = useState<ServiceRecord | null>(null);
  const [createFormData, setCreateFormData] = useState<ServiceFormData>(defaultServiceFormData);
  const [editFormData, setEditFormData] = useState<ServiceFormData>(defaultServiceFormData);
  const [newAddonServiceId, setNewAddonServiceId] = useState<string>("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [{ data: categoriesData, fetching: categoriesFetching }, refetchCategories] = useFindMany(api.serviceCategory, {
    first: 100,
    sort: { sortOrder: "Ascending" },
    pause: !businessId,
  });
  const [{ data: servicesData, fetching: servicesFetching }, refetchServices] = useFindMany(api.service, {
    filter: businessId ? { businessId: { equals: businessId } } : undefined,
    sort: { name: "Ascending" },
    first: 250,
    pause: !businessId,
  });
  const [{ data: addonLinksData }, refetchAddonLinks] = useFindMany(api.serviceAddonLink, {
    first: 250,
    pause: !businessId,
  } as any);

  const [{ fetching: createCategoryFetching }, runCreateCategory] = useAction(api.serviceCategory.create);
  const [{ fetching: updateCategoryFetching }, runUpdateCategory] = useAction(api.serviceCategory.update);
  const [{ fetching: deleteCategoryFetching }, runDeleteCategory] = useAction(api.serviceCategory.delete);
  const [{ fetching: reorderCategoryFetching }, runReorderCategory] = useAction(api.serviceCategory.reorder);

  const [{ fetching: createServiceFetching }, runCreateService] = useAction(api.service.create);
  const [{ fetching: updateServiceFetching }, runUpdateService] = useAction(api.service.update);
  const [{ fetching: deleteServiceFetching }, runDeleteService] = useAction(api.service.delete);
  const [{ fetching: reorderServiceFetching }, runReorderService] = useAction(api.service.reorder);

  const [{ fetching: createAddonLinkFetching }, runCreateAddonLink] = useAction(api.serviceAddonLink.create);
  const [{ fetching: deleteAddonLinkFetching }, runDeleteAddonLink] = useAction(api.serviceAddonLink.delete);

  const categories = ((categoriesData ?? []) as CategoryRecord[]).filter((category) => category.active !== false);
  const inactiveCategories = ((categoriesData ?? []) as CategoryRecord[]).filter((category) => category.active === false);
  const services = (servicesData ?? []) as ServiceRecord[];
  const addonLinks = (addonLinksData ?? []) as AddonLinkRecord[];
  const managedCategories = supportsCategoryManagement ? categories : [];
  const managedInactiveCategories = supportsCategoryManagement ? inactiveCategories : [];

  useEffect(() => {
    let cancelled = false;
    if (!businessId) {
      setSupportsCategoryManagement(true);
      return;
    }
    api.serviceCategory
      .capabilities()
      .then((result) => {
        if (!cancelled) setSupportsCategoryManagement(result?.supportsManagement !== false);
      })
      .catch(() => {
        if (!cancelled) setSupportsCategoryManagement(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const categoryById = useMemo(() => new Map(managedCategories.map((category) => [category.id, category])), [managedCategories]);
  const categoryOptions = useMemo(
    () => [{ value: UNCATEGORIZED_VALUE, label: "Uncategorized" }, ...managedCategories.map((category) => ({ value: category.id, label: category.name }))],
    [managedCategories]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const visibleServices = services.filter((service) => {
    const matchesActive = serviceTab === "active" ? service.active !== false : service.active === false;
    const categoryValue = service.categoryId ?? UNCATEGORIZED_VALUE;
    const matchesCategory = categoryFilter === "all" ? true : categoryValue === categoryFilter;
    const haystack = [service.name, service.notes, service.categoryLabel ?? formatServiceCategory(service.category)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = normalizedSearch ? haystack.includes(normalizedSearch) : true;
    return matchesActive && matchesCategory && matchesSearch;
  });

  const serviceGroups = useMemo(() => {
    const bucket = new Map<string, { id: string; title: string; order: number; services: ServiceRecord[] }>();
    for (const service of visibleServices) {
      const groupId = service.categoryId ?? UNCATEGORIZED_VALUE;
      const category = service.categoryId ? categoryById.get(service.categoryId) : null;
      const title = category?.name ?? service.categoryLabel ?? "Uncategorized";
      const order = category?.sortOrder ?? 9999;
      if (!bucket.has(groupId)) bucket.set(groupId, { id: groupId, title, order, services: [] });
      bucket.get(groupId)!.services.push(service);
    }
    return Array.from(bucket.values())
      .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title))
      .map((group) => ({
        ...group,
        services: group.services.sort(
          (left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0) || left.name.localeCompare(right.name)
        ),
      }));
  }, [categoryById, visibleServices]);

  const packageSummaries = useMemo(
    () =>
      services
        .filter((service) => !service.isAddon)
        .map((service) => {
          const linkedAddons = addonLinks
            .filter((link) => link.parentServiceId === service.id)
            .map((link) => services.find((candidate) => candidate.id === link.addonServiceId))
            .filter(Boolean) as ServiceRecord[];
          return {
            service,
            linkedAddons,
            totalPrice:
              Number(service.price ?? 0) +
              linkedAddons.reduce((sum, addon) => sum + Number(addon.price ?? 0), 0),
          };
        })
        .filter((summary) => summary.linkedAddons.length > 0)
        .sort((left, right) => left.service.name.localeCompare(right.service.name)),
    [addonLinks, services]
  );

  const activeServicesCount = services.filter((service) => service.active !== false).length;
  const activeAddonCount = services.filter((service) => service.active !== false && service.isAddon).length;
  const canMoveCategoryDelete = deleteCategory ? services.some((service) => service.categoryId === deleteCategory.id) : false;
  const isFirstLoad = (servicesFetching || categoriesFetching) && !servicesData && !categoriesData;

  const openCreateService = (categoryId?: string | null) => {
    setCreateFormData({ ...defaultServiceFormData, categoryId: categoryId ?? UNCATEGORIZED_VALUE });
    setCreateServiceOpen(true);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportsCategoryManagement) return toast.error("Service category management will work after the latest database update is applied.");
    if (!categoryName.trim()) return toast.error("Enter a category name.");
    const result = await runCreateCategory({ name: categoryName.trim() });
    if (result.error) return toast.error(result.error.message);
    toast.success("Category created.");
    setCategoryName("");
    setCreateCategoryOpen(false);
    void refetchCategories();
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportsCategoryManagement) return toast.error("Service category management will work after the latest database update is applied.");
    if (!editCategory || !categoryName.trim()) return toast.error("Enter a category name.");
    const result = await runUpdateCategory({ id: editCategory.id, name: categoryName.trim() });
    if (result.error) return toast.error(result.error.message);
    toast.success("Category updated.");
    setEditCategory(null);
    setCategoryName("");
    void refetchCategories();
    void refetchServices();
  };

  const handleArchiveCategory = async (category: CategoryRecord, active: boolean) => {
    if (!supportsCategoryManagement) return toast.error("Service category management will work after the latest database update is applied.");
    const result = await runUpdateCategory({ id: category.id, active });
    if (result.error) return toast.error(result.error.message);
    toast.success(active ? "Category restored." : "Category archived.");
    void refetchCategories();
  };

  const moveCategory = async (categoryId: string, direction: -1 | 1) => {
    if (!supportsCategoryManagement) return toast.error("Service category management will work after the latest database update is applied.");
    const index = categories.findIndex((category) => category.id === categoryId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= categories.length) return;
    const orderedIds = categories.map((category) => category.id);
    [orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]];
    const result = await runReorderCategory({ orderedIds });
    if (result.error) return toast.error(result.error.message);
    void refetchCategories();
  };

  const handleDeleteCategory = async () => {
    if (!supportsCategoryManagement) return toast.error("Service category management will work after the latest database update is applied.");
    if (!deleteCategory) return;
    const payload =
      moveDeleteServicesTo === UNCATEGORIZED_VALUE
        ? { id: deleteCategory.id, moveToUncategorized: true }
        : { id: deleteCategory.id, moveToCategoryId: moveDeleteServicesTo };
    const result = await runDeleteCategory(payload);
    if (result.error) return toast.error(result.error.message);
    toast.success("Category deleted.");
    setDeleteCategory(null);
    setMoveDeleteServicesTo(UNCATEGORIZED_VALUE);
    void refetchCategories();
    void refetchServices();
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFormData.name.trim() || !createFormData.price) return toast.error("Please fill in all required fields.");
    const result = await runCreateService({
      name: createFormData.name.trim(),
      price: parseFloat(createFormData.price),
      durationMinutes: createFormData.duration ? parseInt(createFormData.duration, 10) : null,
      categoryId: createFormData.categoryId === UNCATEGORIZED_VALUE ? null : createFormData.categoryId,
      notes: createFormData.notes.trim() || null,
      taxable: createFormData.taxable,
      isAddon: createFormData.isAddon,
      business: businessId ? { _link: businessId } : undefined,
    });
    if (result.error) return toast.error(result.error.message);
    toast.success("Service created.");
    setCreateServiceOpen(false);
    setCreateFormData(defaultServiceFormData);
    void refetchServices();
  };

  const handleUpdateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editService || !editFormData.name.trim() || !editFormData.price) return toast.error("Please fill in all required fields.");
    const result = await runUpdateService({
      id: editService.id,
      name: editFormData.name.trim(),
      price: parseFloat(editFormData.price),
      durationMinutes: editFormData.duration ? parseInt(editFormData.duration, 10) : null,
      categoryId: editFormData.categoryId === UNCATEGORIZED_VALUE ? null : editFormData.categoryId,
      notes: editFormData.notes.trim() || null,
      taxable: editFormData.taxable,
      isAddon: editFormData.isAddon,
    });
    if (result.error) return toast.error(result.error.message);
    toast.success("Service updated.");
    setEditService(null);
    setNewAddonServiceId("");
    void refetchServices();
  };

  const handleToggleActive = async (service: ServiceRecord) => {
    setTogglingId(service.id);
    try {
      const result = await runUpdateService({ id: service.id, active: !(service.active !== false) });
      if (result.error) return toast.error(result.error.message);
      toast.success(service.active !== false ? "Service deactivated." : "Service activated.");
      void refetchServices();
    } finally {
      setTogglingId(null);
    }
  };

  const moveService = async (groupId: string, serviceId: string, direction: -1 | 1) => {
    const group = serviceGroups.find((entry) => entry.id === groupId);
    if (!group) return;
    const index = group.services.findIndex((service) => service.id === serviceId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= group.services.length) return;
    const orderedIds = group.services.map((service) => service.id);
    [orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]];
    const result = await runReorderService({ orderedIds });
    if (result.error) return toast.error(result.error.message);
    void refetchServices();
  };

  const handleDeleteService = async () => {
    if (!deleteService) return;
    const result = await runDeleteService({ id: deleteService.id });
    if (result.error) return toast.error(result.error.message);
    toast.success("Service deleted.");
    setDeleteService(null);
    setEditService(null);
    void refetchServices();
  };

  const handleAddAddonLink = async () => {
    if (!editService || !newAddonServiceId) return;
    const result = await runCreateAddonLink({ parentServiceId: editService.id, addonServiceId: newAddonServiceId });
    if (result.error) return toast.error(result.error.message);
    toast.success("Add-on linked.");
    setNewAddonServiceId("");
    void refetchAddonLinks();
  };

  const handleRemoveAddonLink = async (id: string) => {
    const result = await runDeleteAddonLink({ id });
    if (result.error) return toast.error(result.error.message);
    toast.success("Add-on removed.");
    void refetchAddonLinks();
  };

  const linkedAddonRecords = useMemo(
    () => addonLinks.filter((link) => link.parentServiceId === editService?.id),
    [addonLinks, editService]
  );

  const showCategoryManagementUnavailable = () => {
    toast.error("Category management will work after the latest database update is applied.");
  };

  return (
    <div className="page-content page-section max-w-6xl">
      <PageHeader
        title="Services"
        right={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => (supportsCategoryManagement ? setCreateCategoryOpen(true) : showCategoryManagementUnavailable())}
            >
              <FolderKanban className="mr-2 h-4 w-4" />
              Add Category
            </Button>
            <Button onClick={() => openCreateService()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Service
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Categories" value={String(categories.length)} detail="Active service groups" />
        <MetricCard label="Active services" value={String(activeServicesCount)} detail="Bookable catalog services" />
        <MetricCard label="Add-ons" value={String(activeAddonCount)} detail="Optional extras on file" />
      </div>

      <ListViewToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search services, notes, or categories..."
        loading={servicesFetching}
        resultCount={visibleServices.length}
        noun="services"
        filtersLabel={[
          serviceTab === "active" ? "Active only" : "Inactive only",
          categoryFilter === "all" ? null : categoryOptions.find((option) => option.value === categoryFilter)?.label ?? null,
        ]}
        onClear={() => { setSearch(""); setCategoryFilter("all"); setServiceTab("active"); }}
        actions={
          <div className="flex gap-2">
            <Select value={serviceTab} onValueChange={(value) => setServiceTab(value as "active" | "inactive")}>
              <SelectTrigger className="min-w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="min-w-[180px]"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryOptions.map((category) => (
                  <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isFirstLoad ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, index) => <ServiceCardSkeleton key={index} />)}
        </div>
      ) : serviceGroups.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No matching services"
          description="Create a service or clear the filters to see the full catalog."
          action={<Button onClick={() => openCreateService()}><Plus className="mr-2 h-4 w-4" />Add Service</Button>}
        />
      ) : (
        <div className="space-y-6">
          {serviceGroups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{group.title}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{group.services.length} services</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openCreateService(group.id === UNCATEGORIZED_VALUE ? null : group.id)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add service
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.services.map((service, index) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    onEdit={(record) => { setEditService(record); setEditFormData(serviceToFormData(record)); setNewAddonServiceId(""); }}
                    onToggle={handleToggleActive}
                    isToggling={togglingId === service.id}
                    onMoveUp={() => void moveService(group.id, service.id, -1)}
                    onMoveDown={() => void moveService(group.id, service.id, 1)}
                    moveDisabledUp={index === 0 || reorderServiceFetching}
                    moveDisabledDown={index === group.services.length - 1 || reorderServiceFetching}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Category management</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Create, reorder, archive, and clean up the catalog structure your team actually uses.</p>
            </div>
            <Badge variant="outline">{managedCategories.length} active</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!supportsCategoryManagement ? (
            <EmptyState
              icon={FolderKanban}
              title="Category management unavailable"
              description="This workspace is still on the older service schema. Services still load and book normally, but creating or editing categories needs the latest database update."
            />
          ) : managedCategories.length === 0 ? (
            <EmptyState icon={FolderKanban} title="No categories yet" description="Create the first category, then add services under it." />
          ) : (
            managedCategories.map((category, index) => (
              <div key={category.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{category.name}</p>
                    {category.key ? <Badge variant="secondary">Starter</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{category.serviceCount} services</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openCreateService(category.id)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add service
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => void moveCategory(category.id, -1)} disabled={index === 0 || reorderCategoryFetching}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => void moveCategory(category.id, 1)} disabled={index === categories.length - 1 || reorderCategoryFetching}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditCategory(category); setCategoryName(category.name); }}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void handleArchiveCategory(category, false)}>Archive</Button>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setDeleteCategory(category); setMoveDeleteServicesTo(UNCATEGORIZED_VALUE); }}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}

          {managedInactiveCategories.length > 0 ? (
            <div className="rounded-xl border border-dashed p-4">
              <p className="text-sm font-medium">Archived categories</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {managedInactiveCategories.map((category) => (
                  <Button key={category.id} variant="outline" size="sm" onClick={() => void handleArchiveCategory(category, true)}>
                    Restore {category.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
            <DialogDescription>Create a new service category for your team.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCategory}>
            <CategoryForm name={categoryName} onChange={setCategoryName} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateCategoryOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createCategoryFetching}>{createCategoryFetching ? "Creating..." : "Create Category"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editCategory)} onOpenChange={(open) => !open && setEditCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>Rename or clean up this category without losing services.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateCategory}>
            <CategoryForm name={categoryName} onChange={setCategoryName} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditCategory(null)}>Cancel</Button>
              <Button type="submit" disabled={updateCategoryFetching}>{updateCategoryFetching ? "Saving..." : "Save Changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteCategory)} onOpenChange={(open) => !open && setDeleteCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              {canMoveCategoryDelete ? "Services in this category need a safe destination before deletion." : "This will remove the category. Services without a category are preserved."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {canMoveCategoryDelete ? (
            <div className="grid gap-2">
              <Label htmlFor="move-category">Move services to</Label>
              <Select value={moveDeleteServicesTo} onValueChange={setMoveDeleteServicesTo}>
                <SelectTrigger id="move-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNCATEGORIZED_VALUE}>Uncategorized</SelectItem>
                  {managedCategories.filter((category) => category.id !== deleteCategory?.id).map((category) => (
                    <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCategoryFetching}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteCategory()} disabled={deleteCategoryFetching} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteCategoryFetching ? "Deleting..." : "Delete Category"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createServiceOpen} onOpenChange={setCreateServiceOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>Create a service and place it in the right category right away.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateService}>
            <ServiceForm formData={createFormData} onChange={setCreateFormData} categoryOptions={categoryOptions} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateServiceOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createServiceFetching}>{createServiceFetching ? "Creating..." : "Create Service"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editService)} onOpenChange={(open) => !open && setEditService(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>Update service details, move it between categories, or manage add-ons.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateService}>
            <ServiceForm formData={editFormData} onChange={setEditFormData} categoryOptions={categoryOptions} />
            <Separator className="my-4" />
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Optional add-ons</p>
                <p className="mt-1 text-xs text-muted-foreground">Link other services so this service can act like a reusable package.</p>
              </div>
              {linkedAddonRecords.length > 0 ? (
                <div className="space-y-2">
                  {linkedAddonRecords.map((link) => {
                    const linkedService = services.find((service) => service.id === link.addonServiceId);
                    return (
                      <div key={link.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                        <span className="text-sm font-medium">{linkedService?.name ?? "Service"}</span>
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => void handleRemoveAddonLink(link.id)} disabled={deleteAddonLinkFetching}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No add-ons linked yet.</p>
              )}
              <div className="flex gap-2">
                <Select value={newAddonServiceId} onValueChange={setNewAddonServiceId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select a service to link as an add-on" /></SelectTrigger>
                  <SelectContent>
                    {services.filter((service) => editService && service.id !== editService.id && service.active !== false && !linkedAddonRecords.some((link) => link.addonServiceId === service.id)).map((service) => (
                      <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => void handleAddAddonLink()} disabled={!newAddonServiceId || createAddonLinkFetching}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </div>
            <DialogFooter className="mt-4 sm:justify-between">
              <Button type="button" variant="destructive" onClick={() => setDeleteService(editService)} disabled={updateServiceFetching}>Delete Service</Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditService(null)}>Cancel</Button>
                <Button type="submit" disabled={updateServiceFetching}>{updateServiceFetching ? "Saving..." : "Save Changes"}</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteService)} onOpenChange={(open) => !open && setDeleteService(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service?</AlertDialogTitle>
            <AlertDialogDescription>Services linked to past appointments cannot be deleted. If that happens, deactivate the service instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteServiceFetching}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteService()} disabled={deleteServiceFetching} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteServiceFetching ? "Deleting..." : "Delete Service"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" />Package templates</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Primary services with linked add-ons, ready for faster booking.</p>
            </div>
            <Badge variant="outline">{packageSummaries.length} configured</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {packageSummaries.length === 0 ? (
            <EmptyState icon={Package} title="No package templates yet" description="Link add-ons on a service to turn it into a reusable package." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {packageSummaries.map((summary) => (
                <button key={summary.service.id} type="button" onClick={() => { setEditService(summary.service); setEditFormData(serviceToFormData(summary.service)); }} className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/30">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold">{summary.service.name}</h3>
                        <Badge variant="secondary">{summary.service.categoryLabel ?? formatServiceCategory(summary.service.category)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{summary.linkedAddons.length} linked add-on{summary.linkedAddons.length === 1 ? "" : "s"}</p>
                    </div>
                    <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Includes</p>
                    <div className="flex flex-wrap gap-2">
                      {summary.linkedAddons.map((addon) => <Badge key={addon.id} variant="outline">{addon.name}</Badge>)}
                    </div>
                    <p className="pt-2 text-sm font-medium">{formatPrice(summary.totalPrice)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
