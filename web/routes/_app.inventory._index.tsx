import { useState, useMemo } from "react";
import { useOutletContext } from "react-router";
import { useFindMany, useAction } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { ModuleGuard } from "@/components/shared/ModuleGuard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Package, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";

type InventoryFormData = {
  name: string;
  sku: string;
  quantity: string;
  unit: string;
  costPerUnit: string;
  reorderThreshold: string;
  supplier: string;
  category: string;
  description: string;
};

const INVENTORY_SORT = { name: "Ascending" } as const;

const DEFAULT_FORM: InventoryFormData = {
  name: "",
  sku: "",
  quantity: "0",
  unit: "",
  costPerUnit: "",
  reorderThreshold: "",
  supplier: "",
  category: "",
  description: "",
};

const CATEGORY_OPTIONS = [
  { value: "coating", label: "Coating" },
  { value: "film", label: "Film" },
  { value: "chemical", label: "Chemical" },
  { value: "tool", label: "Tool" },
  { value: "hardware", label: "Hardware" },
  { value: "other", label: "Other" },
];

type InventoryItem = {
  id: string;
  name: string | null;
  sku: string | null;
  quantity: number | null;
  unit: string | null;
  costPerUnit: number | null;
  reorderThreshold: number | null;
  supplier: string | null;
  category: string | null;
};

function InventoryFormDialog({
  open,
  onOpenChange,
  title,
  formData,
  onFormChange,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  formData: InventoryFormData;
  onFormChange: (field: keyof InventoryFormData, value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => onFormChange("name", e.target.value)}
              placeholder="Item name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={formData.sku}
                onChange={(e) => onFormChange("sku", e.target.value)}
                placeholder="SKU"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(val) => onFormChange("category", val)}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                value={formData.quantity}
                onChange={(e) => onFormChange("quantity", e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={formData.unit}
                onChange={(e) => onFormChange("unit", e.target.value)}
                placeholder="e.g. each, oz, roll"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="costPerUnit">Cost Per Unit ($)</Label>
              <Input
                id="costPerUnit"
                type="number"
                min="0"
                step="0.01"
                value={formData.costPerUnit}
                onChange={(e) => onFormChange("costPerUnit", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reorderThreshold">Reorder Threshold</Label>
              <Input
                id="reorderThreshold"
                type="number"
                min="0"
                value={formData.reorderThreshold}
                onChange={(e) => onFormChange("reorderThreshold", e.target.value)}
                placeholder="e.g. 5"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supplier">Supplier</Label>
            <Input
              id="supplier"
              value={formData.supplier}
              onChange={(e) => onFormChange("supplier", e.target.value)}
              placeholder="Supplier name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => onFormChange("description", e.target.value)}
              placeholder="Optional description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || !formData.name.trim()}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryPage() {
  const { user, businessId, enabledModules } = useOutletContext<AuthOutletContext>();
  const inventoryEnabled = enabledModules?.has("inventory") ?? false;

  const inventoryFilter = useMemo(
    () =>
      businessId
        ? { business: { id: { equals: businessId } } }
        : undefined,
    [businessId]
  );

  const [{ data: items, fetching, error }, refetchItems] = useFindMany(api.inventoryItem, {
    pause: !businessId || !inventoryEnabled,
    filter: inventoryFilter,
    sort: INVENTORY_SORT,
    first: 100,
    select: {
      id: true,
      name: true,
      sku: true,
      quantity: true,
      unit: true,
      costPerUnit: true,
      reorderThreshold: true,
      supplier: true,
      category: true,
    },
  });

  const isLoading = fetching && !items;
  const isRefetching = fetching && !!items;

  const [{ fetching: creating }, create] = useAction(api.inventoryItem.create);
  const [{ fetching: updating }, update] = useAction(api.inventoryItem.update);

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState<InventoryFormData>(DEFAULT_FORM);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (!search.trim()) return items as InventoryItem[];
    const q = search.toLowerCase().trim();
    return (items as InventoryItem[]).filter(
      (item) =>
        item.name?.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q)
    );
  }, [items, search]);

  const lowStockItems = useMemo(
    () =>
      (items ?? []).filter(
        (item) =>
          item.reorderThreshold != null &&
          item.quantity != null &&
          item.quantity < item.reorderThreshold
      ) as InventoryItem[],
    [items]
  );

  const handleFormChange = (field: keyof InventoryFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const openCreate = () => {
    setFormData(DEFAULT_FORM);
    setCreateOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setFormData({
      name: item.name ?? "",
      sku: item.sku ?? "",
      quantity: item.quantity?.toString() ?? "0",
      unit: item.unit ?? "",
      costPerUnit: item.costPerUnit?.toString() ?? "",
      reorderThreshold: item.reorderThreshold?.toString() ?? "",
      supplier: item.supplier ?? "",
      category: item.category ?? "",
      description: "",
    });
    setEditItem(item);
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !businessId) return;
    const result = await create({
      name: formData.name.trim(),
      ...(formData.sku && { sku: formData.sku }),
      quantity: parseInt(formData.quantity) || 0,
      ...(formData.unit && { unit: formData.unit }),
      ...(formData.costPerUnit !== "" && {
        costPerUnit: parseFloat(formData.costPerUnit),
      }),
      ...(formData.reorderThreshold !== "" && {
        reorderThreshold: parseInt(formData.reorderThreshold),
      }),
      ...(formData.supplier && { supplier: formData.supplier }),
      ...(formData.category && { category: formData.category as any }),
      ...(formData.description && { description: formData.description }),
      business: { _link: businessId! },
    });
    if (result?.data) {
      toast.success("Item added to inventory");
      setCreateOpen(false);
      refetchItems({ requestPolicy: 'network-only' });
    } else if (result?.error) {
      toast.error("Failed to add item: " + result.error.message);
    }
  };

  const handleUpdate = async () => {
    if (!editItem || !formData.name.trim()) return;
    const result = await update({
      id: editItem.id,
      name: formData.name.trim(),
      sku: formData.sku || null,
      quantity: parseInt(formData.quantity) || 0,
      unit: formData.unit || null,
      costPerUnit: formData.costPerUnit !== "" ? parseFloat(formData.costPerUnit) : null,
      reorderThreshold:
        formData.reorderThreshold !== "" ? parseInt(formData.reorderThreshold) : null,
      supplier: formData.supplier || null,
      category: (formData.category as any) || null,
    });
    if (result?.data) {
      toast.success("Item updated");
      setEditItem(null);
      refetchItems({ requestPolicy: 'network-only' });
    } else if (result?.error) {
      toast.error("Failed to update item: " + result.error.message);
    }
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val == null) return "—";
    return `$${val.toFixed(2)}`;
  };

  if (!inventoryEnabled) {
    return (
      <ModuleGuard
        module="inventory"
        enabledModules={enabledModules ?? new Set()}
        title="Inventory isn’t available for your business type yet"
      />
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Inventory"
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
        }
      />

      {/* Low Stock Banner */}
      {lowStockItems.length > 0 && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Low Stock Alert</AlertTitle>
          <AlertDescription>
            {lowStockItems.length} item{lowStockItems.length !== 1 ? "s are" : " is"} below the
            reorder threshold:{" "}
            <span className="font-medium">
              {lowStockItems.map((i) => i.name).join(", ")}
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border bg-card p-4 animate-pulse">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/5" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-destructive">
          Error loading inventory: {error.message}
        </div>
      ) : filteredItems.length === 0 ? (
        search.trim() ? (
          <EmptyState
            icon={Search}
            title="No items found"
            description="Try a different name or SKU."
          />
        ) : (
          <EmptyState
            icon={Package}
            title="No inventory items yet"
            description='Click "Add Item" to add your first product or supply.'
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            }
          />
        )
      ) : (
        <div className={`rounded-md border overflow-hidden transition-opacity${isRefetching ? " opacity-60" : ""}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Quantity</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unit</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cost/Unit</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Supplier</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, idx) => {
                const isLowStock =
                  item.reorderThreshold != null &&
                  item.quantity != null &&
                  item.quantity < item.reorderThreshold;
                return (
                  <tr
                    key={item.id}
                    onClick={() => openEdit(item)}
                    className={`border-b last:border-b-0 cursor-pointer transition-colors hover:bg-muted/50 ${
                      idx % 2 !== 0 ? "bg-muted/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium">{item.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.sku ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          isLowStock
                            ? "text-destructive font-semibold"
                            : ""
                        }
                      >
                        {item.quantity ?? 0}
                        {isLowStock && (
                          <span className="ml-1 text-xs text-destructive">
                            ↓ low
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.unit ?? "—"}</td>
                    <td className="px-4 py-3">{formatCurrency(item.costPerUnit)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.supplier ?? "—"}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {item.category ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog */}
      <InventoryFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add Inventory Item"
        formData={formData}
        onFormChange={handleFormChange}
        onSubmit={handleCreate}
        submitting={creating}
      />

      {/* Edit Dialog */}
      <InventoryFormDialog
        open={editItem !== null}
        onOpenChange={(open) => {
          if (!open) setEditItem(null);
        }}
        title="Edit Inventory Item"
        formData={formData}
        onFormChange={handleFormChange}
        onSubmit={handleUpdate}
        submitting={updating}
      />
    </div>
  );
}