import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { useAction, useFindMany } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "../components/shared/EmptyState";
import { ListViewToolbar } from "../components/shared/ListViewToolbar";
import { PageHeader } from "../components/shared/PageHeader";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck2,
  Copy,
  ExternalLink,
  FolderKanban,
  Globe,
  Package,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { formatServiceCategory } from "../lib/serviceCatalog";
import { QuarterHourDurationGrid } from "../components/appointments/SchedulingControls";
import { getBusinessTypeWorkspaceDefaults } from "../lib/businessTypeWorkspaceDefaults";

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
  bookingEnabled: boolean | null;
  bookingFlowType: "inherit" | "request" | "self_book" | null;
  bookingDescription: string | null;
  bookingDepositAmount: number | null;
  bookingLeadTimeHours: number | null;
  bookingWindowDays: number | null;
  bookingServiceMode: "in_shop" | "mobile" | "both" | null;
  bookingAvailableDays: number[] | null;
  bookingAvailableStartTime: string | null;
  bookingAvailableEndTime: string | null;
  bookingCapacityPerSlot: number | null;
  bookingFeatured: boolean | null;
  bookingHidePrice: boolean | null;
  bookingHideDuration: boolean | null;
};

type BusinessBookingSettings = {
  bookingEnabled: boolean;
  bookingDefaultFlow: "request" | "self_book";
  bookingPageTitle: string;
  bookingPageSubtitle: string;
  bookingConfirmationMessage: string;
  bookingTrustBulletPrimary: string;
  bookingTrustBulletSecondary: string;
  bookingTrustBulletTertiary: string;
  bookingNotesPrompt: string;
  bookingRequireEmail: boolean;
  bookingRequirePhone: boolean;
  bookingRequireVehicle: boolean;
  bookingAllowCustomerNotes: boolean;
  bookingShowPrices: boolean;
  bookingShowDurations: boolean;
  bookingAvailableDays: number[];
  bookingAvailableStartTime: string;
  bookingAvailableEndTime: string;
  bookingBlackoutDatesText: string;
  bookingSlotIntervalMinutes: number;
  bookingBufferMinutes: string;
  bookingCapacityPerSlot: string;
  notificationAppointmentConfirmationEmailEnabled: boolean;
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
  bookingEnabled: boolean;
  bookingFlowType: "inherit" | "request" | "self_book";
  bookingDescription: string;
  bookingDepositAmount: string;
  bookingLeadTimeHours: string;
  bookingWindowDays: string;
  bookingServiceMode: "in_shop" | "mobile" | "both";
  bookingAvailableDays: number[];
  bookingAvailableStartTime: string;
  bookingAvailableEndTime: string;
  bookingCapacityPerSlot: string;
  bookingFeatured: boolean;
  bookingHidePrice: boolean;
  bookingHideDuration: boolean;
};

const defaultServiceFormData: ServiceFormData = {
  name: "",
  price: "",
  duration: "",
  categoryId: UNCATEGORIZED_VALUE,
  notes: "",
  taxable: true,
  isAddon: false,
  bookingEnabled: false,
  bookingFlowType: "inherit",
  bookingDescription: "",
  bookingDepositAmount: "",
  bookingLeadTimeHours: "0",
  bookingWindowDays: "30",
  bookingServiceMode: "in_shop",
  bookingAvailableDays: [],
  bookingAvailableStartTime: "",
  bookingAvailableEndTime: "",
  bookingCapacityPerSlot: "",
  bookingFeatured: false,
  bookingHidePrice: false,
  bookingHideDuration: false,
};

const defaultBookingSettings: BusinessBookingSettings = {
  bookingEnabled: false,
  bookingDefaultFlow: "request",
  bookingPageTitle: "",
  bookingPageSubtitle: "",
  bookingConfirmationMessage: "",
  bookingTrustBulletPrimary: "Goes directly to the shop",
  bookingTrustBulletSecondary: "Quick follow-up",
  bookingTrustBulletTertiary: "Secure and simple",
  bookingNotesPrompt: "Add timing, questions, or anything the shop should know.",
  bookingRequireEmail: false,
  bookingRequirePhone: false,
  bookingRequireVehicle: true,
  bookingAllowCustomerNotes: true,
  bookingShowPrices: true,
  bookingShowDurations: true,
  bookingAvailableDays: [1, 2, 3, 4, 5],
  bookingAvailableStartTime: "",
  bookingAvailableEndTime: "",
  bookingBlackoutDatesText: "",
  bookingSlotIntervalMinutes: 15,
  bookingBufferMinutes: "",
  bookingCapacityPerSlot: "",
  notificationAppointmentConfirmationEmailEnabled: true,
};

const BOOKING_DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

type ServiceTab = "active" | "inactive";

function MobileFilterSelect({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
        className
      )}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

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
    bookingEnabled: service.bookingEnabled === true,
    bookingFlowType: service.bookingFlowType ?? "inherit",
    bookingDescription: service.bookingDescription ?? "",
    bookingDepositAmount:
      service.bookingDepositAmount != null && Number(service.bookingDepositAmount) > 0
        ? String(service.bookingDepositAmount)
        : "",
    bookingLeadTimeHours: String(service.bookingLeadTimeHours ?? 0),
    bookingWindowDays: String(service.bookingWindowDays ?? 30),
    bookingServiceMode: service.bookingServiceMode ?? "in_shop",
    bookingAvailableDays: service.bookingAvailableDays ?? [],
    bookingAvailableStartTime: service.bookingAvailableStartTime ?? "",
    bookingAvailableEndTime: service.bookingAvailableEndTime ?? "",
    bookingCapacityPerSlot:
      service.bookingCapacityPerSlot != null && Number(service.bookingCapacityPerSlot) > 0
        ? String(service.bookingCapacityPerSlot)
        : "",
    bookingFeatured: service.bookingFeatured === true,
    bookingHidePrice: service.bookingHidePrice === true,
    bookingHideDuration: service.bookingHideDuration === true,
  };
}

function businessToBookingSettings(record: Partial<BusinessBookingSettings> | null | undefined): BusinessBookingSettings {
  return {
    bookingEnabled: record?.bookingEnabled ?? false,
    bookingDefaultFlow: record?.bookingDefaultFlow === "self_book" ? "self_book" : "request",
    bookingPageTitle: record?.bookingPageTitle ?? "",
    bookingPageSubtitle: record?.bookingPageSubtitle ?? "",
    bookingConfirmationMessage: record?.bookingConfirmationMessage ?? "",
    bookingTrustBulletPrimary: record?.bookingTrustBulletPrimary ?? "Goes directly to the shop",
    bookingTrustBulletSecondary: record?.bookingTrustBulletSecondary ?? "Quick follow-up",
    bookingTrustBulletTertiary: record?.bookingTrustBulletTertiary ?? "Secure and simple",
    bookingNotesPrompt: record?.bookingNotesPrompt ?? "Add timing, questions, or anything the shop should know.",
    bookingRequireEmail: record?.bookingRequireEmail ?? false,
    bookingRequirePhone: record?.bookingRequirePhone ?? false,
    bookingRequireVehicle: record?.bookingRequireVehicle ?? true,
    bookingAllowCustomerNotes: record?.bookingAllowCustomerNotes ?? true,
    bookingShowPrices: record?.bookingShowPrices ?? true,
    bookingShowDurations: record?.bookingShowDurations ?? true,
    bookingAvailableDays:
      Array.isArray((record as { bookingAvailableDays?: number[] | null })?.bookingAvailableDays) &&
      (record as { bookingAvailableDays?: number[] | null }).bookingAvailableDays!.length > 0
        ? [...new Set((record as { bookingAvailableDays?: number[] | null }).bookingAvailableDays)]
        : [1, 2, 3, 4, 5],
    bookingAvailableStartTime: (record as { bookingAvailableStartTime?: string | null })?.bookingAvailableStartTime ?? "",
    bookingAvailableEndTime: (record as { bookingAvailableEndTime?: string | null })?.bookingAvailableEndTime ?? "",
    bookingBlackoutDatesText: Array.isArray((record as { bookingBlackoutDates?: string[] | null })?.bookingBlackoutDates)
      ? ((record as { bookingBlackoutDates?: string[] | null }).bookingBlackoutDates ?? []).join("\n")
      : "",
    bookingSlotIntervalMinutes: Number((record as { bookingSlotIntervalMinutes?: number | null })?.bookingSlotIntervalMinutes ?? 15) || 15,
    bookingBufferMinutes:
      (record as { bookingBufferMinutes?: number | null })?.bookingBufferMinutes != null
        ? String((record as { bookingBufferMinutes?: number | null }).bookingBufferMinutes)
        : "",
    bookingCapacityPerSlot:
      (record as { bookingCapacityPerSlot?: number | null })?.bookingCapacityPerSlot != null
        ? String((record as { bookingCapacityPerSlot?: number | null }).bookingCapacityPerSlot)
        : "",
    notificationAppointmentConfirmationEmailEnabled:
      (record as { notificationAppointmentConfirmationEmailEnabled?: boolean | null })
        ?.notificationAppointmentConfirmationEmailEnabled ?? true,
  };
}

function filterServices(
  services: ServiceRecord[],
  {
    search,
    categoryFilter,
    serviceTab,
  }: {
    search: string;
    categoryFilter: string;
    serviceTab: ServiceTab;
  },
) {
  const normalizedSearch = search.trim().toLowerCase();
  return services.filter((service) => {
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
}

function parseBookingBlackoutDatesText(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry));
}

function bookingModeLabel(
  service: Pick<ServiceRecord, "bookingFlowType">,
  defaultFlow: BusinessBookingSettings["bookingDefaultFlow"],
) {
  const effective = service.bookingFlowType === "self_book" || service.bookingFlowType === "request"
    ? service.bookingFlowType
    : defaultFlow;
  return effective === "self_book" ? "Book now" : "Request service";
}

function serviceModeLabel(mode: ServiceRecord["bookingServiceMode"] | ServiceFormData["bookingServiceMode"]) {
  if (mode === "mobile") return "Mobile / on-site";
  if (mode === "both") return "Mobile or in-shop";
  return "In-shop";
}

function buildPublicBookingHref(bookingUrl: string, service: Pick<ServiceRecord, "id" | "categoryId">, options?: { step?: "service" }) {
  const params = new URLSearchParams({
    service: service.id,
    source: "services-page",
  });
  if (service.categoryId) params.set("category", service.categoryId);
  if (options?.step) params.set("step", options.step);
  return `${bookingUrl}?${params.toString()}`;
}

function groupServicesByCategory(
  visibleServices: ServiceRecord[],
  categoryById: Map<string, CategoryRecord>,
) {
  const grouped = new Map<
    string,
    {
      title: string;
      order: number;
      services: ServiceRecord[];
    }
  >();

  for (const service of visibleServices) {
    const groupId = service.categoryId ?? UNCATEGORIZED_VALUE;
    const category = service.categoryId ? categoryById.get(service.categoryId) : null;
    const title = category?.name ?? service.categoryLabel ?? "Uncategorized";
    const order = category?.sortOrder ?? 9999;
    const existing = grouped.get(groupId);
    if (existing) {
      existing.services.push(service);
    } else {
      grouped.set(groupId, { title, order, services: [service] });
    }
  }

  return [...grouped.entries()]
    .sort((a, b) => {
      if (a[1].order !== b[1].order) return a[1].order - b[1].order;
      return a[1].title.localeCompare(b[1].title);
    })
    .map(([id, value]) => ({ id, ...value }));
}

function getServiceMetrics(services: ServiceRecord[], deleteCategory: CategoryRecord | null) {
  const activeServicesCount = services.filter((service) => service.active !== false).length;
  const activeAddonCount = services.filter((service) => service.active !== false && service.isAddon).length;
  const canMoveCategoryDelete = deleteCategory ? services.some((service) => service.categoryId === deleteCategory.id) : false;

  return {
    activeServicesCount,
    activeAddonCount,
    canMoveCategoryDelete,
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <QuarterHourDurationGrid
            value={formData.duration}
            onChange={(value) => onChange({ ...formData, duration: value })}
            allowEmpty
            emptyLabel="No set duration"
            maxMinutes={12 * 60}
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
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
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

      <div className="rounded-2xl border bg-muted/25 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Public booking</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Control whether this service shows on the booking page and whether customers can book it instantly or request approval.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="svc-booking-enabled" className="text-xs text-muted-foreground">
              Show online
            </Label>
            <Switch
              id="svc-booking-enabled"
              checked={formData.bookingEnabled}
              onCheckedChange={(checked) => onChange({ ...formData, bookingEnabled: checked })}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-flow">Booking flow</Label>
            <Select
              value={formData.bookingFlowType}
              onValueChange={(value) =>
                onChange({
                  ...formData,
                  bookingFlowType: value as ServiceFormData["bookingFlowType"],
                })
              }
            >
              <SelectTrigger id="svc-booking-flow">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Use business default</SelectItem>
                <SelectItem value="self_book">Customers can book instantly</SelectItem>
                <SelectItem value="request">Review requests first</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-deposit">Deposit ($)</Label>
            <Input
              id="svc-booking-deposit"
              type="number"
              min="0"
              step="0.01"
              value={formData.bookingDepositAmount}
              onChange={(e) => onChange({ ...formData, bookingDepositAmount: e.target.value })}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-lead-time">Lead time (hours)</Label>
            <Input
              id="svc-booking-lead-time"
              type="number"
              min="0"
              max="336"
              step="1"
              value={formData.bookingLeadTimeHours}
              onChange={(e) => onChange({ ...formData, bookingLeadTimeHours: e.target.value })}
              placeholder="0"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-window">Booking window (days)</Label>
            <Input
              id="svc-booking-window"
              type="number"
              min="1"
              max="180"
              step="1"
              value={formData.bookingWindowDays}
              onChange={(e) => onChange({ ...formData, bookingWindowDays: e.target.value })}
              placeholder="30"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-mode">Service mode</Label>
            <Select
              value={formData.bookingServiceMode}
              onValueChange={(value) =>
                onChange({
                  ...formData,
                  bookingServiceMode: value as ServiceFormData["bookingServiceMode"],
                })
              }
            >
              <SelectTrigger id="svc-booking-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_shop">In-shop only</SelectItem>
                <SelectItem value="mobile">Mobile / on-site only</SelectItem>
                <SelectItem value="both">Let the customer choose</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-capacity">Capacity per slot</Label>
            <Input
              id="svc-booking-capacity"
              type="number"
              min="1"
              max="12"
              step="1"
              value={formData.bookingCapacityPerSlot}
              onChange={(e) => onChange({ ...formData, bookingCapacityPerSlot: e.target.value })}
              placeholder="Use business default"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <Label>Booking days</Label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {BOOKING_DAY_OPTIONS.map((day) => {
              const checked = formData.bookingAvailableDays.includes(day.value);
              return (
                <label
                  key={day.value}
                  className={cn(
                    "flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                    checked ? "border-orange-300 bg-orange-50 text-orange-900" : "border-slate-200 bg-white text-slate-600"
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() =>
                      onChange({
                        ...formData,
                        bookingAvailableDays: checked
                          ? formData.bookingAvailableDays.filter((value) => value !== day.value)
                          : [...formData.bookingAvailableDays, day.value].sort(),
                      })
                    }
                  />
                  {day.label}
                </label>
              );
            })}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">Leave blank to use the business booking schedule.</p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-start">Service window start</Label>
            <Input
              id="svc-booking-start"
              type="time"
              value={formData.bookingAvailableStartTime}
              onChange={(e) => onChange({ ...formData, bookingAvailableStartTime: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-end">Service window end</Label>
            <Input
              id="svc-booking-end"
              type="time"
              value={formData.bookingAvailableEndTime}
              onChange={(e) => onChange({ ...formData, bookingAvailableEndTime: e.target.value })}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <Label htmlFor="svc-booking-description">Booking description</Label>
          <Textarea
            id="svc-booking-description"
            value={formData.bookingDescription}
            onChange={(e) => onChange({ ...formData, bookingDescription: e.target.value })}
            placeholder="Short public-facing copy for the booking page."
            rows={3}
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="flex items-start gap-3 rounded-xl border bg-white/80 p-3">
            <Checkbox
              id="svc-booking-featured"
              checked={formData.bookingFeatured}
              onCheckedChange={(checked) => onChange({ ...formData, bookingFeatured: checked === true })}
              className="mt-1"
            />
            <div className="space-y-1">
              <Label htmlFor="svc-booking-featured" className="cursor-pointer text-sm font-medium">
                Feature first
              </Label>
              <p className="text-xs leading-5 text-muted-foreground">Push this service to the top of the public booking page.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border bg-white/80 p-3">
            <Checkbox
              id="svc-booking-hide-price"
              checked={formData.bookingHidePrice}
              onCheckedChange={(checked) => onChange({ ...formData, bookingHidePrice: checked === true })}
              className="mt-1"
            />
            <div className="space-y-1">
              <Label htmlFor="svc-booking-hide-price" className="cursor-pointer text-sm font-medium">
                Hide price
              </Label>
              <p className="text-xs leading-5 text-muted-foreground">Keep this service visible while holding pricing back.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border bg-white/80 p-3">
            <Checkbox
              id="svc-booking-hide-duration"
              checked={formData.bookingHideDuration}
              onCheckedChange={(checked) => onChange({ ...formData, bookingHideDuration: checked === true })}
              className="mt-1"
            />
            <div className="space-y-1">
              <Label htmlFor="svc-booking-hide-duration" className="cursor-pointer text-sm font-medium">
                Hide duration
              </Label>
              <p className="text-xs leading-5 text-muted-foreground">Useful when the job needs review before timing is promised.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border bg-white/80 p-3 text-xs leading-5 text-muted-foreground">
          Linked add-ons below become the booking flow&apos;s “Frequently added” recommendations. Use them for clean upsells, not clutter.
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="border-slate-200/80 bg-white/95 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
      <CardContent className="space-y-2 p-4">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <p className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{value}</p>
        <p className="text-sm leading-6 text-slate-600">{detail}</p>
      </CardContent>
    </Card>
  );
}

function BookingRulePill({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-medium tracking-[0.08em] uppercase",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-500"
      )}
    >
      {children}
    </span>
  );
}

function BuilderSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.6rem] border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] sm:p-6">
      <div className="space-y-1">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{title}</h3>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

type BuilderTab = "flow" | "services" | "availability" | "payments" | "branding";

function BuilderTabButton({
  active,
  label,
  detail,
  onClick,
}: {
  active: boolean;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-w-[180px] rounded-[1.2rem] border px-4 py-3 text-left transition-all",
        active
          ? "border-slate-900 bg-slate-900 text-white shadow-[0_18px_34px_rgba(15,23,42,0.18)]"
          : "border-slate-200 bg-white/92 text-slate-700 hover:border-slate-300 hover:bg-white"
      )}
    >
      <p className={cn("text-sm font-semibold tracking-[-0.01em]", active ? "text-white" : "text-slate-950")}>{label}</p>
      <p className={cn("mt-1 text-xs leading-5", active ? "text-slate-200" : "text-slate-500")}>{detail}</p>
    </button>
  );
}

function BuilderControlCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/92 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="space-y-1">
        <p className="text-sm font-semibold tracking-[-0.01em] text-slate-950">{title}</p>
        <p className="text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ServiceMetaPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warm" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-[1rem] border px-3 py-2",
        tone === "warm"
          ? "border-orange-200 bg-orange-50/80"
          : tone === "success"
            ? "border-emerald-200 bg-emerald-50/80"
            : "border-slate-200 bg-slate-50/85"
      )}
    >
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-950">{value}</p>
    </div>
  );
}

function BookingBuilderCard({
  value,
  onChange,
  onSave,
  saving,
  dirty,
  bookingUrl,
  bookableServicesCount,
  selfBookServicesCount,
  previewServices,
  businessType,
  canEdit,
}: {
  value: BusinessBookingSettings;
  onChange: (value: BusinessBookingSettings) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  bookingUrl: string | null;
  bookableServicesCount: number;
  selfBookServicesCount: number;
  previewServices: ServiceRecord[];
  businessType: string | null;
  canEdit: boolean;
}) {
  const [activeTab, setActiveTab] = useState<BuilderTab>("flow");
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const typeDefaults = getBusinessTypeWorkspaceDefaults(businessType);
  const copyBookingUrl = async () => {
    if (!bookingUrl || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(bookingUrl);
    toast.success("Booking link copied.");
  };
  const toggleDay = (day: number) => {
    const next = value.bookingAvailableDays.includes(day)
      ? value.bookingAvailableDays.filter((entry) => entry !== day)
      : [...value.bookingAvailableDays, day];
    onChange({ ...value, bookingAvailableDays: next });
  };
  const previewTrustPoints = [
    value.bookingTrustBulletPrimary.trim() || "Goes directly to the shop",
    value.bookingTrustBulletSecondary.trim() || (value.bookingDefaultFlow === "self_book" ? "Quick confirmation" : "Quick follow-up"),
    value.bookingTrustBulletTertiary.trim() || "Secure and simple",
  ];
  const featuredPreviewServices = previewServices
    .filter((service) => service.bookingEnabled === true && service.active !== false && service.isAddon !== true)
    .sort((left, right) => {
      if ((left.bookingFeatured === true) !== (right.bookingFeatured === true)) {
        return left.bookingFeatured === true ? -1 : 1;
      }
      return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    })
    .slice(0, 4);
  const depositServicesCount = previewServices.filter(
    (service) => service.bookingEnabled === true && service.active !== false && Number(service.bookingDepositAmount ?? 0) > 0,
  ).length;
  const featuredServicesCount = previewServices.filter(
    (service) => service.bookingEnabled === true && service.active !== false && service.bookingFeatured === true,
  ).length;
  const builderTabs: Array<{ key: BuilderTab; label: string; detail: string }> = [
    { key: "flow", label: "Flow", detail: "Publishing, default mode, and flow posture" },
    { key: "services", label: "Services", detail: "What shows publicly and how it merchandises" },
    { key: "availability", label: "Availability", detail: "Booking windows, capacity, and timing controls" },
    { key: "payments", label: "Payments & Deposits", detail: "How instant booking and deposits behave" },
    { key: "branding", label: "Branding & Content", detail: "Title, trust copy, and confirmation tone" },
  ];
  const previewHeroService = featuredPreviewServices[0] ?? null;
  const previewServiceList = previewHeroService ? featuredPreviewServices.slice(1, 4) : featuredPreviewServices.slice(0, 3);
  const previewStepLabels =
    value.bookingDefaultFlow === "self_book"
      ? ["Service", "Vehicle", "Timing", "Contact", "Review"]
      : ["Service", "Vehicle", "Timing", "Contact", "Request"];

  const renderPreview = () => (
    <Card className="overflow-hidden border-slate-200/80 bg-white/96 shadow-[0_22px_56px_rgba(15,23,42,0.08)]">
      <div className="h-1 bg-[linear-gradient(90deg,rgba(15,23,42,0.92),rgba(249,115,22,0.92))]" />
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg tracking-[-0.02em]">Live preview</CardTitle>
            <CardDescription>See the customer flow update as you shape it.</CardDescription>
          </div>
          <Badge variant="outline" className="rounded-full bg-white">
            {value.bookingDefaultFlow === "self_book" ? "Instant booking" : "Request flow"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-5 pt-0">
        <div className="flex justify-center">
          <div className="relative w-[222px] sm:w-[240px] lg:w-[222px] xl:w-[236px]">
            <div className="absolute left-[-3px] top-[74px] h-9 w-[3px] rounded-full bg-black/90" />
            <div className="absolute left-[-3px] top-[118px] h-14 w-[3px] rounded-full bg-black/90" />
            <div className="absolute left-[-3px] top-[180px] h-14 w-[3px] rounded-full bg-black/90" />
            <div className="rounded-[2.5rem] bg-black p-[6px] shadow-[0_24px_52px_rgba(15,23,42,0.16)] ring-1 ring-black/90">
              <div className="relative overflow-hidden rounded-[2.15rem] border border-slate-200 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.10),transparent_26%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
                <div className="absolute left-1/2 top-2.5 z-20 h-5 w-16 -translate-x-1/2 rounded-full bg-black shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]" />
                <div className="flex items-center gap-1.5 border-b border-slate-100 px-3.5 pb-2.5 pt-9">
                  <span className="h-2 w-2 rounded-full bg-rose-400" />
                  <span className="h-2 w-2 rounded-full bg-amber-300" />
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </div>
                <div className="space-y-3 border-b border-slate-100 px-3.5 py-3.5">
                  <Badge variant="secondary" className="rounded-full border border-orange-200 bg-orange-50 text-[10px] text-orange-700">
                    Online Booking
                  </Badge>
                  <div className="space-y-1.5">
                    <h3 className="text-[1.02rem] font-semibold tracking-[-0.04em] text-slate-950">
                      {value.bookingPageTitle.trim() || "Tell us what you need"}
                    </h3>
                    <p className="text-[11px] leading-5 text-slate-600">
                      {value.bookingPageSubtitle.trim() || "Share a few details and the shop can follow up with the right next step."}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {previewTrustPoints.map((point, index) => {
                      const Icon = index === 0 ? Globe : index === 1 ? CalendarCheck2 : Wrench;
                      return (
                        <div key={point} className="rounded-[0.95rem] border border-slate-200 bg-white/92 px-2.5 py-2.5 shadow-sm">
                          <div className="flex items-center gap-1.5 text-orange-600">
                            <Icon className="h-3 w-3" />
                            <span className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Trust</span>
                          </div>
                          <p className="mt-1.5 text-[11px] font-medium leading-4.5 text-slate-800">{point}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="border-b border-slate-100 px-3.5 py-3">
                  <div className="grid grid-cols-2 gap-2">
                    {previewStepLabels.map((step, index) => (
                      <div
                        key={step}
                        className={cn(
                          "rounded-[0.95rem] border px-2.5 py-2 text-[0.6rem] font-semibold uppercase tracking-[0.13em]",
                          index === 0 ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500"
                        )}
                      >
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2.5 px-3.5 py-3.5">
                  {previewHeroService ? (
                    <div className="rounded-[1.2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="rounded-full border border-orange-200 bg-orange-50 text-[10px] text-orange-700">
                              {bookingModeLabel(previewHeroService, value.bookingDefaultFlow)}
                            </Badge>
                            {previewHeroService.bookingFeatured ? <Badge className="bg-orange-50 text-[10px] text-orange-700 hover:bg-orange-50">Featured</Badge> : null}
                          </div>
                          <p className="text-sm font-semibold tracking-[-0.02em] text-slate-950">{previewHeroService.name}</p>
                          <p className="text-[11px] leading-5 text-slate-600">
                            {previewHeroService.bookingDescription || "Selected service stays visible while the customer moves through the flow."}
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-full bg-white px-2 py-0.5 text-[10px]">
                          {serviceModeLabel(previewHeroService.bookingServiceMode)}
                        </Badge>
                      </div>
                      <div className="mt-2.5 grid gap-2">
                        {value.bookingShowPrices && previewHeroService.bookingHidePrice !== true ? (
                          <ServiceMetaPill label="Starting at" value={formatPrice(previewHeroService.price)} tone="warm" />
                        ) : null}
                        {value.bookingShowDurations && previewHeroService.bookingHideDuration !== true && previewHeroService.durationMinutes ? (
                          <ServiceMetaPill label="Estimated time" value={formatDuration(previewHeroService.durationMinutes)} />
                        ) : null}
                        <ServiceMetaPill
                          label="Next step"
                          value={value.bookingDefaultFlow === "self_book" ? "Choose a live slot" : "Send a request"}
                          tone={value.bookingDefaultFlow === "self_book" ? "success" : "neutral"}
                        />
                      </div>
                    </div>
                  ) : null}
                  {previewServiceList.length > 0 ? (
                    previewServiceList.map((service, index) => (
                      <div
                        key={service.id}
                        className={cn(
                          "rounded-[1.1rem] border px-3 py-3 shadow-sm",
                          index === 0 ? "border-orange-200 bg-orange-50/35" : "border-slate-200 bg-white"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-[12px] font-medium text-slate-950">{service.name}</p>
                              {service.bookingFeatured ? <Badge className="bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-700 hover:bg-orange-50">Featured</Badge> : null}
                            </div>
                            {service.bookingDescription ? <p className="text-[10px] leading-4.5 text-slate-600">{service.bookingDescription}</p> : null}
                          </div>
                          <Badge variant="outline" className="rounded-full bg-white px-2 py-0.5 text-[10px]">
                            {bookingModeLabel(service, value.bookingDefaultFlow)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
                          {value.bookingShowPrices && service.bookingHidePrice !== true ? <span>{formatPrice(service.price)}</span> : null}
                          {value.bookingShowDurations && service.bookingHideDuration !== true && service.durationMinutes ? <span>{formatDuration(service.durationMinutes)}</span> : null}
                          {Number(service.bookingDepositAmount ?? 0) > 0 ? <span>{formatPrice(service.bookingDepositAmount ?? 0)} deposit</span> : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1.15rem] border border-dashed border-slate-300 px-3 py-4 text-[11px] text-slate-600">
                      Turn on booking for at least one service below to preview what customers can book.
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 bg-slate-50/80 px-3.5 py-3.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Confirmation</p>
                  <p className="mt-1.5 text-[11px] leading-5 text-slate-700">
                    {value.bookingConfirmationMessage.trim() ||
                      (value.bookingDefaultFlow === "self_book"
                        ? "Your appointment is booked. You can review the confirmation details right away."
                        : "Your request is with the shop. They can follow up with the next step soon.")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.95))] shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="h-1.5 bg-[linear-gradient(90deg,rgba(249,115,22,0.95),rgba(251,146,60,0.92),rgba(15,23,42,0.92))]" />
      <CardHeader className="space-y-6 border-b border-slate-200/70 pb-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_360px] xl:items-start">
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm font-medium text-orange-700">
              <CalendarCheck2 className="h-4 w-4" />
              Booking builder
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl tracking-[-0.04em] text-slate-950">Turn your service catalog into a booking flow</CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6 text-slate-600">
                Shape the customer journey from service selection to confirmation without touching code. The goal is simple: a booking page that feels clean, trustworthy, and easy to finish.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <BookingRulePill active={value.bookingEnabled}>{value.bookingEnabled ? "Booking live" : "Booking off"}</BookingRulePill>
              <BookingRulePill active={bookableServicesCount > 0}>{bookableServicesCount} services online</BookingRulePill>
              <BookingRulePill active={selfBookServicesCount > 0}>{selfBookServicesCount} instant-book services</BookingRulePill>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Experience posture</p>
                <p className="mt-2 text-sm font-medium text-slate-950">{value.bookingDefaultFlow === "self_book" ? "Faster self-booking" : "Guided request flow"}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{typeDefaults.bookingSettingsLabel}</p>
              </div>
              <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Customer asks</p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {[
                    value.bookingRequireVehicle ? "Vehicle required" : "Vehicle optional",
                    value.bookingRequirePhone ? "Phone required" : value.bookingRequireEmail ? "Email required" : "Flexible contact",
                  ].join(" / ")}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Keep the intake fast while still collecting the details the shop actually needs.</p>
              </div>
              <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Booking window</p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {value.bookingAvailableStartTime || value.bookingAvailableEndTime
                    ? `${value.bookingAvailableStartTime || "Start"}-${value.bookingAvailableEndTime || "End"}`
                    : "Uses booking defaults"}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Availability controls here layer on top of service-specific lead time and booking rules.</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.7rem] border border-slate-200/80 bg-white/92 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
            <div className="space-y-1">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Public page</p>
              <p className="text-sm font-medium text-slate-950">{bookingUrl ?? "Booking link appears after the page is enabled."}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyBookingUrl()} disabled={!bookingUrl} className="rounded-xl">
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy link
              </Button>
              <Button type="button" size="sm" asChild disabled={!bookingUrl} className="rounded-xl">
                <a href={bookingUrl ?? "#"} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open page
                </a>
              </Button>
            </div>
            <div className="mt-5 rounded-[1.35rem] border border-slate-200 bg-slate-50/85 p-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Default posture</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{typeDefaults.bookingSettingsLabel}</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8 p-6">
        {!canEdit ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            This role can view booking setup, but only teammates with settings access can change business-level booking rules.
          </div>
        ) : null}

        <div className="space-y-4 rounded-[1.8rem] border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
          <div className="space-y-1">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Flow editor</p>
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Design the booking journey section by section</h3>
            <p className="text-sm leading-6 text-slate-600">Use the tabs to focus on one layer of the experience at a time instead of editing a long settings wall.</p>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {builderTabs.map((tab) => (
              <BuilderTabButton
                key={tab.key}
                active={activeTab === tab.key}
                label={tab.label}
                detail={tab.detail}
                onClick={() => setActiveTab(tab.key)}
              />
            ))}
          </div>
          <div className="lg:hidden">
            <Button type="button" variant="outline" className="w-full rounded-xl" onClick={() => setShowMobilePreview((current) => !current)}>
              {showMobilePreview ? "Hide live preview" : "Show live preview"}
            </Button>
          </div>
          {showMobilePreview ? <div className="lg:hidden">{renderPreview()}</div> : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_340px]">
          <div className="space-y-5">
            {activeTab === "flow" ? (
            <BuilderSection
              eyebrow="Flow"
              title="Set the motion of the booking experience"
              description="Control whether customers book instantly, send a request, or let each service decide without making the builder feel like an old settings page."
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-950">Set the default booking posture</p>
                  <p className="text-sm leading-6 text-slate-600">Choose the primary motion of the flow first, then override specific services below when needed.</p>
                </div>
                <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Publishing</span>
                  <Switch checked={value.bookingEnabled} onCheckedChange={(checked) => onChange({ ...value, bookingEnabled: checked })} disabled={!canEdit} />
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="booking-default-flow">Default booking mode</Label>
                  <Select
                    value={value.bookingDefaultFlow}
                    onValueChange={(next) => onChange({ ...value, bookingDefaultFlow: next as BusinessBookingSettings["bookingDefaultFlow"] })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger id="booking-default-flow">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="request">Request only by default</SelectItem>
                      <SelectItem value="self_book">Direct booking by default</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-slate-500">Services can still override this one by one.</p>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <Checkbox
                    id="booking-confirmation-email-enabled"
                    checked={value.notificationAppointmentConfirmationEmailEnabled}
                    onCheckedChange={(checked) => onChange({ ...value, notificationAppointmentConfirmationEmailEnabled: checked === true })}
                    className="mt-1"
                    disabled={!canEdit}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="booking-confirmation-email-enabled" className="cursor-pointer text-sm font-medium text-slate-950">
                      Send confirmation email after direct booking
                    </Label>
                    <p className="text-xs leading-5 text-slate-500">Uses Strata&apos;s existing appointment confirmation email when a customer books instantly.</p>
                  </div>
                </div>
              </div>
            </BuilderSection>
            ) : null}

            {activeTab === "branding" ? (
            <BuilderSection
              eyebrow="Branding"
              title="Shape the page copy and trust cues"
              description="Tune the booking page headline, reassurance copy, and confirmation state so the customer knows exactly what they are doing and what happens next."
            >
              <div className="mt-5 grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="booking-page-title">Booking page title</Label>
                  <Input id="booking-page-title" value={value.bookingPageTitle} onChange={(event) => onChange({ ...value, bookingPageTitle: event.target.value })} placeholder="Tell us what you need" disabled={!canEdit} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="booking-page-subtitle">Intro text</Label>
                  <Textarea id="booking-page-subtitle" rows={3} value={value.bookingPageSubtitle} onChange={(event) => onChange({ ...value, bookingPageSubtitle: event.target.value })} placeholder="Share a few details and the shop can follow up with the right next step." disabled={!canEdit} />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="booking-trust-primary">Trust point 1</Label>
                    <Input id="booking-trust-primary" value={value.bookingTrustBulletPrimary} onChange={(event) => onChange({ ...value, bookingTrustBulletPrimary: event.target.value })} placeholder="Goes directly to the shop" disabled={!canEdit} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="booking-trust-secondary">Trust point 2</Label>
                    <Input id="booking-trust-secondary" value={value.bookingTrustBulletSecondary} onChange={(event) => onChange({ ...value, bookingTrustBulletSecondary: event.target.value })} placeholder="Quick follow-up" disabled={!canEdit} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="booking-trust-tertiary">Trust point 3</Label>
                    <Input id="booking-trust-tertiary" value={value.bookingTrustBulletTertiary} onChange={(event) => onChange({ ...value, bookingTrustBulletTertiary: event.target.value })} placeholder="Secure and simple" disabled={!canEdit} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="booking-confirmation-message">Confirmation message</Label>
                  <Textarea id="booking-confirmation-message" rows={3} value={value.bookingConfirmationMessage} onChange={(event) => onChange({ ...value, bookingConfirmationMessage: event.target.value })} placeholder="Your appointment is booked. You can review the confirmation details right away." disabled={!canEdit} />
                </div>
              </div>
            </BuilderSection>
            ) : null}

            {activeTab === "branding" ? (
            <BuilderSection
              eyebrow="Branding"
              title="Keep intake clear and lightweight"
              description="Keep the form fast while making sure the shop still gets the information it truly needs to act on the booking."
            >
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  { id: "booking-require-email", label: "Require email address", checked: value.bookingRequireEmail, description: "Useful when confirmations and follow-up should land in email.", key: "bookingRequireEmail" as const },
                  { id: "booking-require-phone", label: "Require phone number", checked: value.bookingRequirePhone, description: "Useful when the team confirms timing by call or text.", key: "bookingRequirePhone" as const },
                  { id: "booking-require-vehicle", label: "Require vehicle details", checked: value.bookingRequireVehicle, description: "Keep make and model required before the request lands.", key: "bookingRequireVehicle" as const },
                  { id: "booking-allow-notes", label: "Allow customer notes", checked: value.bookingAllowCustomerNotes, description: "Let customers add timing, questions, or job context.", key: "bookingAllowCustomerNotes" as const },
                  { id: "booking-show-prices", label: "Show pricing by default", checked: value.bookingShowPrices, description: "Services can still hide pricing individually.", key: "bookingShowPrices" as const },
                  { id: "booking-show-durations", label: "Show durations by default", checked: value.bookingShowDurations, description: "Services can still hide timing individually.", key: "bookingShowDurations" as const },
                ].map((item) => (
                  <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <Checkbox
                      id={item.id}
                      checked={item.checked}
                      onCheckedChange={(checked) => onChange({ ...value, [item.key]: checked === true })}
                      className="mt-1"
                      disabled={!canEdit}
                    />
                    <div className="space-y-1">
                      <Label htmlFor={item.id} className="cursor-pointer text-sm font-medium text-slate-950">{item.label}</Label>
                      <p className="text-xs leading-5 text-slate-500">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-2">
                <Label htmlFor="booking-notes-prompt">Notes prompt</Label>
                <Input id="booking-notes-prompt" value={value.bookingNotesPrompt} onChange={(event) => onChange({ ...value, bookingNotesPrompt: event.target.value })} placeholder="Add timing, questions, or anything the shop should know." disabled={!canEdit || !value.bookingAllowCustomerNotes} />
                <p className="text-xs leading-5 text-slate-500">Shown above the final notes field when customer notes are enabled.</p>
              </div>
            </BuilderSection>
            ) : null}

            {activeTab === "availability" ? (
            <BuilderSection
              eyebrow="Availability"
              title="Control when booking can happen"
              description="Set the booking-only schedule without changing the rest of the app. Service-level lead time and booking windows still layer on top."
            >
              <div className="mt-5 space-y-5">
                <div className="space-y-2">
                  <Label>Available days</Label>
                  <div className="flex flex-wrap gap-2">
                    {BOOKING_DAY_OPTIONS.map((day) => {
                      const active = value.bookingAvailableDays.includes(day.value);
                      return (
                        <Button
                          key={day.value}
                          type="button"
                          variant={active ? "default" : "outline"}
                          size="sm"
                          className={cn(active ? "bg-slate-950 text-white hover:bg-slate-900" : "")}
                          onClick={() => toggleDay(day.value)}
                          disabled={!canEdit}
                        >
                          {day.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="grid gap-2">
                    <Label htmlFor="booking-start-time">Window start</Label>
                    <Input id="booking-start-time" type="time" value={value.bookingAvailableStartTime} onChange={(event) => onChange({ ...value, bookingAvailableStartTime: event.target.value })} disabled={!canEdit} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="booking-end-time">Window end</Label>
                    <Input id="booking-end-time" type="time" value={value.bookingAvailableEndTime} onChange={(event) => onChange({ ...value, bookingAvailableEndTime: event.target.value })} disabled={!canEdit} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="booking-slot-interval">Slot interval</Label>
                    <Select
                      value={String(value.bookingSlotIntervalMinutes)}
                      onValueChange={(next) => onChange({ ...value, bookingSlotIntervalMinutes: Number(next) })}
                      disabled={!canEdit}
                    >
                      <SelectTrigger id="booking-slot-interval">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[15, 30, 45, 60].map((minutes) => (
                          <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="booking-buffer">Booking buffer</Label>
                    <Input id="booking-buffer" type="number" min="0" max="240" step="5" value={value.bookingBufferMinutes} onChange={(event) => onChange({ ...value, bookingBufferMinutes: event.target.value })} placeholder="Use main schedule buffer" disabled={!canEdit} />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="booking-capacity">Max bookings per slot</Label>
                    <Input id="booking-capacity" type="number" min="1" max="12" step="1" value={value.bookingCapacityPerSlot} onChange={(event) => onChange({ ...value, bookingCapacityPerSlot: event.target.value })} placeholder="Use calendar capacity" disabled={!canEdit} />
                    <p className="text-xs leading-5 text-slate-500">Useful for fast-turn work or multi-bay shops.</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="booking-blackout-dates">Blackout dates</Label>
                    <Textarea id="booking-blackout-dates" rows={4} value={value.bookingBlackoutDatesText} onChange={(event) => onChange({ ...value, bookingBlackoutDatesText: event.target.value })} placeholder={"2026-04-15\n2026-05-27"} disabled={!canEdit} />
                    <p className="text-xs leading-5 text-slate-500">One date per line in YYYY-MM-DD format.</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                  If you offer both in-shop and mobile service, use locations to represent each service mode. The booking flow automatically shows a location step when more than one active location is available.
                </div>
              </div>
            </BuilderSection>
            ) : null}

            {activeTab === "payments" ? (
              <BuilderSection
                eyebrow="Payments"
                title="Clarify how booking and deposits work"
                description="Keep this simple at the business level. Deposits stay configurable per service so you only require them when the job truly needs it."
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <BuilderControlCard
                    title="Instant booking follow-up"
                    description="Use Strata's existing confirmation system after a customer books directly."
                  >
                    <div className="flex items-start gap-3 rounded-[1.2rem] border border-slate-200 bg-slate-50/80 p-4">
                      <Checkbox
                        id="booking-confirmation-email-enabled"
                        checked={value.notificationAppointmentConfirmationEmailEnabled}
                        onCheckedChange={(checked) => onChange({ ...value, notificationAppointmentConfirmationEmailEnabled: checked === true })}
                        className="mt-1"
                        disabled={!canEdit}
                      />
                      <div className="space-y-1">
                        <Label htmlFor="booking-confirmation-email-enabled" className="cursor-pointer text-sm font-medium text-slate-950">
                          Send confirmation email after direct booking
                        </Label>
                        <p className="text-xs leading-5 text-slate-500">Uses the current appointment confirmation email and portal link flow.</p>
                      </div>
                    </div>
                  </BuilderControlCard>
                  <BuilderControlCard
                    title="Deposit posture"
                    description="Deposits are set per service, not globally, so high-friction jobs can require one without forcing it everywhere."
                  >
                    <div className="space-y-2">
                      <p className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{depositServicesCount}</p>
                      <p className="text-sm leading-6 text-slate-600">booking services currently require a deposit in the public flow.</p>
                    </div>
                  </BuilderControlCard>
                </div>
              </BuilderSection>
            ) : null}

            {activeTab === "services" ? (
              <BuilderSection
                eyebrow="Services"
                title="Shape what customers browse first"
                description="Use business-level defaults here, then fine-tune visibility, featured placement, deposits, and service-specific rules on the service cards below."
              >
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <MetricCard label="Live services" value={String(bookableServicesCount)} detail="Visible on the public booking page" />
                    <MetricCard label="Featured" value={String(featuredServicesCount)} detail="Pinned higher in the booking browse step" />
                    <MetricCard label="Instant-book" value={String(selfBookServicesCount)} detail="Services that can confirm immediately" />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      { id: "booking-show-prices", label: "Show pricing by default", checked: value.bookingShowPrices, description: "Keep pricing visible unless a specific service should hold it back.", key: "bookingShowPrices" as const },
                      { id: "booking-show-durations", label: "Show durations by default", checked: value.bookingShowDurations, description: "Keep timing visible unless a service needs review before promising it.", key: "bookingShowDurations" as const },
                    ].map((item) => (
                      <div key={item.id} className="flex items-start gap-3 rounded-[1.2rem] border border-slate-200 bg-slate-50/80 p-4">
                        <Checkbox
                          id={item.id}
                          checked={item.checked}
                          onCheckedChange={(checked) => onChange({ ...value, [item.key]: checked === true })}
                          className="mt-1"
                          disabled={!canEdit}
                        />
                        <div className="space-y-1">
                          <Label htmlFor={item.id} className="cursor-pointer text-sm font-medium text-slate-950">{item.label}</Label>
                          <p className="text-xs leading-5 text-slate-500">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </BuilderSection>
            ) : null}

            {(activeTab === "services" || activeTab === "payments") ? (
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-950">Service-level controls stay on each service card</p>
                <p className="text-sm leading-6 text-slate-600">Featured placement, service-specific mode, deposits, booking descriptions, lead time, and price/duration visibility are handled per service below.</p>
              </div>
              <div className="hidden gap-2 lg:flex">
                <BookingRulePill active={bookableServicesCount > 0}>{bookableServicesCount} services live</BookingRulePill>
                <BookingRulePill active={selfBookServicesCount > 0}>{selfBookServicesCount} instant-book</BookingRulePill>
              </div>
            </div>
            ) : null}
          </div>

          <div className="hidden space-y-4 lg:block">
            <div className="sticky top-6">{renderPreview()}</div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-slate-600">
            Save business-level booking settings here, then fine-tune visibility, featured placement, mode, and deposits on individual services below.
          </p>
          <Button type="button" onClick={onSave} disabled={saving || !dirty || !canEdit} className="rounded-xl shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
            {saving ? "Saving booking settings..." : "Save booking settings"}
          </Button>
        </div>
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
  bookingUrl,
  defaultBookingFlow,
  canEdit,
  onEdit,
  onToggle,
  isToggling,
  onMoveUp,
  onMoveDown,
  moveDisabledUp,
  moveDisabledDown,
}: {
  service: ServiceRecord;
  bookingUrl: string | null;
  defaultBookingFlow: BusinessBookingSettings["bookingDefaultFlow"];
  canEdit: boolean;
  onEdit: (service: ServiceRecord) => void;
  onToggle: (service: ServiceRecord) => void;
  isToggling: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  moveDisabledUp: boolean;
  moveDisabledDown: boolean;
}) {
  const durationStr = formatDuration(service.durationMinutes);
  const effectiveBookingCta = bookingModeLabel(service, defaultBookingFlow);
  const primaryBookingHref = service.bookingEnabled === true && bookingUrl ? buildPublicBookingHref(bookingUrl, service) : null;
  const detailBookingHref =
    service.bookingEnabled === true && bookingUrl
      ? buildPublicBookingHref(bookingUrl, service, { step: "service" })
      : null;
  const bookingModeBadge =
    service.bookingEnabled === true
      ? service.bookingFlowType === "self_book"
        ? "Instant book"
        : service.bookingFlowType === "request"
          ? "Request only"
          : "Uses default flow"
      : null;

  return (
    <div
      className="group flex flex-col gap-5 rounded-[1.5rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.95))] p-5 shadow-[0_16px_38px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_20px_42px_rgba(15,23,42,0.08)] lg:flex-row lg:items-start lg:justify-between"
      onClick={() => { if (canEdit) onEdit(service); }}
    >
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full bg-white">
                {service.bookingEnabled === true ? "Public booking" : "Internal only"}
              </Badge>
              {service.isAddon ? <Badge variant="secondary">Add-on</Badge> : null}
              <Badge variant="outline">{service.categoryLabel ?? formatServiceCategory(service.category)}</Badge>
              {service.bookingEnabled === true ? <Badge variant="outline">{serviceModeLabel(service.bookingServiceMode)}</Badge> : null}
            </div>
            <div className="space-y-1">
              <span className="truncate text-lg font-semibold tracking-[-0.03em] text-slate-950">{service.name}</span>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                {service.bookingDescription || service.notes || "Use this service as part of the public booking catalog without losing the internal detail your team already relies on."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {service.bookingFeatured === true ? <Badge className="bg-orange-50 text-orange-700 hover:bg-orange-50">Featured</Badge> : null}
            {bookingModeBadge ? <Badge className="bg-orange-50 text-orange-700 hover:bg-orange-50">{bookingModeBadge}</Badge> : null}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ServiceMetaPill
            label="Price"
            value={service.bookingHidePrice !== true ? formatPrice(service.price) : "Hidden"}
            tone={service.bookingHidePrice !== true ? "warm" : "neutral"}
          />
          <ServiceMetaPill
            label="Duration"
            value={service.bookingHideDuration !== true && durationStr ? durationStr : "Hidden"}
          />
          <ServiceMetaPill
            label="Deposit"
            value={service.bookingEnabled === true && Number(service.bookingDepositAmount ?? 0) > 0 ? formatPrice(service.bookingDepositAmount ?? 0) : "None"}
            tone={service.bookingEnabled === true && Number(service.bookingDepositAmount ?? 0) > 0 ? "success" : "neutral"}
          />
          <ServiceMetaPill
            label="Availability"
            value={service.bookingEnabled === true && (service.bookingAvailableDays?.length ?? 0) > 0 ? `${service.bookingAvailableDays?.length} booking days` : "Uses defaults"}
          />
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
          {service.taxable ? <span>Taxable</span> : null}
          {service.bookingEnabled === true && service.bookingLeadTimeHours ? <span>{service.bookingLeadTimeHours}h lead time</span> : null}
          {service.bookingEnabled === true && service.bookingWindowDays ? <span>{service.bookingWindowDays} day window</span> : null}
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 lg:ml-4 lg:w-auto lg:min-w-[220px] lg:items-end">
        <div className="flex w-full flex-wrap items-center gap-2 lg:justify-end">
          {primaryBookingHref ? (
            <Button size="sm" className="rounded-xl shadow-sm" asChild onClick={(e) => e.stopPropagation()}>
              <a href={primaryBookingHref} target="_blank" rel="noreferrer">
                {effectiveBookingCta}
              </a>
            </Button>
          ) : null}
          {detailBookingHref ? (
            <Button size="sm" variant="outline" className="rounded-xl" asChild onClick={(e) => e.stopPropagation()}>
              <a href={detailBookingHref} target="_blank" rel="noreferrer">
                Learn more
              </a>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" className="rounded-xl" onClick={(e) => { e.stopPropagation(); onEdit(service); }} disabled={!canEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
        <div className="flex w-full items-center justify-between rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-3 py-2.5 lg:w-auto lg:min-w-[220px]">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Service order</span>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8 rounded-xl" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={moveDisabledUp || !canEdit}>
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8 rounded-xl" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={moveDisabledDown || !canEdit}>
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex w-full items-center justify-between rounded-[1.1rem] border border-slate-200 bg-white px-3 py-2.5 lg:w-auto lg:min-w-[220px]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Active</p>
            <p className="text-sm font-medium text-slate-950">{service.active !== false ? "Visible internally" : "Archived from team view"}</p>
          </div>
          <ActiveToggle active={service.active !== false} onToggle={() => onToggle(service)} loading={isToggling || !canEdit} />
        </div>
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const { businessId, businessType, permissions } = useOutletContext<AuthOutletContext>();
  const canEditServices = permissions.has("services.write");
  const canEditBookingSettings = permissions.has("settings.write");
  const [search, setSearch] = useState("");
  const [isSmallViewport, setIsSmallViewport] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [serviceTab, setServiceTab] = useState<ServiceTab>("active");
  const [supportsCategoryManagement, setSupportsCategoryManagement] = useState(true);

  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryRecord | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<CategoryRecord | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [moveDeleteServicesTo, setMoveDeleteServicesTo] = useState<string>(UNCATEGORIZED_VALUE);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsSmallViewport(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  const [createServiceOpen, setCreateServiceOpen] = useState(false);
  const [editService, setEditService] = useState<ServiceRecord | null>(null);
  const [deleteService, setDeleteService] = useState<ServiceRecord | null>(null);
  const [createFormData, setCreateFormData] = useState<ServiceFormData>(defaultServiceFormData);
  const [editFormData, setEditFormData] = useState<ServiceFormData>(defaultServiceFormData);
  const [newAddonServiceId, setNewAddonServiceId] = useState<string>("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [bookingSettings, setBookingSettings] = useState<BusinessBookingSettings>(defaultBookingSettings);
  const [bookingSettingsLoaded, setBookingSettingsLoaded] = useState<BusinessBookingSettings>(defaultBookingSettings);
  const [bookingSettingsLoading, setBookingSettingsLoading] = useState(false);

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
  const [{ fetching: updateBusinessFetching }, runUpdateBusiness] = useAction(api.business.update);

  const [{ fetching: createServiceFetching }, runCreateService] = useAction(api.service.create);
  const [{ fetching: updateServiceFetching }, runUpdateService] = useAction(api.service.update);
  const [{ fetching: deleteServiceFetching }, runDeleteService] = useAction(api.service.delete);
  const [{ fetching: reorderServiceFetching }, runReorderService] = useAction(api.service.reorder);

  const [{ fetching: createAddonLinkFetching }, runCreateAddonLink] = useAction(api.serviceAddonLink.create);
  const [{ fetching: deleteAddonLinkFetching }, runDeleteAddonLink] = useAction(api.serviceAddonLink.delete);

  const categories = useMemo(
    () => ((categoriesData ?? []) as CategoryRecord[]).filter((category) => category.active !== false),
    [categoriesData]
  );
  const inactiveCategories = useMemo(
    () => ((categoriesData ?? []) as CategoryRecord[]).filter((category) => category.active === false),
    [categoriesData]
  );
  const services = useMemo(() => (servicesData ?? []) as ServiceRecord[], [servicesData]);
  const addonLinks = useMemo(() => (addonLinksData ?? []) as AddonLinkRecord[], [addonLinksData]);
  const managedCategories = useMemo(
    () => (supportsCategoryManagement ? categories : []),
    [categories, supportsCategoryManagement]
  );
  const managedInactiveCategories = useMemo(
    () => (supportsCategoryManagement ? inactiveCategories : []),
    [inactiveCategories, supportsCategoryManagement]
  );

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

  useEffect(() => {
    let cancelled = false;
    if (!businessId) {
      setBookingSettings(defaultBookingSettings);
      setBookingSettingsLoaded(defaultBookingSettings);
      return;
    }

    setBookingSettingsLoading(true);
    api.business
      .findOne(businessId)
      .then((record) => {
        if (cancelled) return;
        const normalized = businessToBookingSettings(record as Partial<BusinessBookingSettings>);
        setBookingSettings(normalized);
        setBookingSettingsLoaded(normalized);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Could not load booking settings.");
        }
      })
      .finally(() => {
        if (!cancelled) setBookingSettingsLoading(false);
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

  const visibleServices = useMemo(
    () => filterServices(services, { search, categoryFilter, serviceTab }),
    [services, search, categoryFilter, serviceTab]
  );

  const serviceGroups = useMemo(
    () =>
      groupServicesByCategory(visibleServices, categoryById).map((group) => ({
        ...group,
        services: group.services.sort(
          (left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0) || left.name.localeCompare(right.name)
        ),
      })),
    [categoryById, visibleServices]
  );

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

  const { activeServicesCount, activeAddonCount, canMoveCategoryDelete } = useMemo(
    () => getServiceMetrics(services, deleteCategory),
    [services, deleteCategory]
  );
  const bookingEnabledServicesCount = useMemo(
    () => services.filter((service) => service.active !== false && service.isAddon !== true && service.bookingEnabled === true).length,
    [services]
  );
  const selfBookServicesCount = useMemo(
    () =>
      services.filter(
        (service) =>
          service.active !== false &&
          service.isAddon !== true &&
          service.bookingEnabled === true &&
          (service.bookingFlowType === "self_book" ||
            (service.bookingFlowType !== "request" && bookingSettings.bookingDefaultFlow === "self_book"))
      ).length,
    [bookingSettings.bookingDefaultFlow, services]
  );
  const isFirstLoad = (servicesFetching || categoriesFetching) && !servicesData && !categoriesData;
  const bookingUrl = useMemo(() => {
    if (!businessId || typeof window === "undefined") return null;
    return `${window.location.origin}/book/${businessId}`;
  }, [businessId]);
  const bookingSettingsDirty = useMemo(
    () => JSON.stringify(bookingSettings) !== JSON.stringify(bookingSettingsLoaded),
    [bookingSettings, bookingSettingsLoaded]
  );

  const openCreateService = (categoryId?: string | null) => {
    if (!canEditServices) return;
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
      bookingEnabled: createFormData.bookingEnabled,
      bookingFlowType: createFormData.bookingFlowType,
        bookingDescription: createFormData.bookingDescription.trim() || null,
        bookingDepositAmount: createFormData.bookingDepositAmount ? parseFloat(createFormData.bookingDepositAmount) : 0,
        bookingLeadTimeHours: createFormData.bookingLeadTimeHours ? parseInt(createFormData.bookingLeadTimeHours, 10) : 0,
        bookingWindowDays: createFormData.bookingWindowDays ? parseInt(createFormData.bookingWindowDays, 10) : 30,
        bookingServiceMode: createFormData.bookingServiceMode,
        bookingAvailableDays: createFormData.bookingAvailableDays,
        bookingAvailableStartTime: createFormData.bookingAvailableStartTime || null,
        bookingAvailableEndTime: createFormData.bookingAvailableEndTime || null,
        bookingCapacityPerSlot: createFormData.bookingCapacityPerSlot ? parseInt(createFormData.bookingCapacityPerSlot, 10) : null,
        bookingFeatured: createFormData.bookingFeatured,
        bookingHidePrice: createFormData.bookingHidePrice,
        bookingHideDuration: createFormData.bookingHideDuration,
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
      bookingEnabled: editFormData.bookingEnabled,
      bookingFlowType: editFormData.bookingFlowType,
        bookingDescription: editFormData.bookingDescription.trim() || null,
        bookingDepositAmount: editFormData.bookingDepositAmount ? parseFloat(editFormData.bookingDepositAmount) : 0,
        bookingLeadTimeHours: editFormData.bookingLeadTimeHours ? parseInt(editFormData.bookingLeadTimeHours, 10) : 0,
        bookingWindowDays: editFormData.bookingWindowDays ? parseInt(editFormData.bookingWindowDays, 10) : 30,
        bookingServiceMode: editFormData.bookingServiceMode,
        bookingAvailableDays: editFormData.bookingAvailableDays,
        bookingAvailableStartTime: editFormData.bookingAvailableStartTime || null,
        bookingAvailableEndTime: editFormData.bookingAvailableEndTime || null,
        bookingCapacityPerSlot: editFormData.bookingCapacityPerSlot ? parseInt(editFormData.bookingCapacityPerSlot, 10) : null,
        bookingFeatured: editFormData.bookingFeatured,
        bookingHidePrice: editFormData.bookingHidePrice,
        bookingHideDuration: editFormData.bookingHideDuration,
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

  const handleSaveBookingSettings = async () => {
    if (!businessId || !canEditBookingSettings) return;
    const result = await runUpdateBusiness({
      id: businessId,
      bookingEnabled: bookingSettings.bookingEnabled,
      bookingDefaultFlow: bookingSettings.bookingDefaultFlow,
      bookingPageTitle: bookingSettings.bookingPageTitle.trim() || null,
      bookingPageSubtitle: bookingSettings.bookingPageSubtitle.trim() || null,
      bookingConfirmationMessage: bookingSettings.bookingConfirmationMessage.trim() || null,
      bookingTrustBulletPrimary: bookingSettings.bookingTrustBulletPrimary.trim() || null,
      bookingTrustBulletSecondary: bookingSettings.bookingTrustBulletSecondary.trim() || null,
      bookingTrustBulletTertiary: bookingSettings.bookingTrustBulletTertiary.trim() || null,
      bookingNotesPrompt: bookingSettings.bookingNotesPrompt.trim() || null,
      bookingRequireEmail: bookingSettings.bookingRequireEmail,
      bookingRequirePhone: bookingSettings.bookingRequirePhone,
      bookingRequireVehicle: bookingSettings.bookingRequireVehicle,
      bookingAllowCustomerNotes: bookingSettings.bookingAllowCustomerNotes,
      bookingShowPrices: bookingSettings.bookingShowPrices,
      bookingShowDurations: bookingSettings.bookingShowDurations,
      bookingAvailableDays: bookingSettings.bookingAvailableDays,
      bookingAvailableStartTime: bookingSettings.bookingAvailableStartTime || null,
      bookingAvailableEndTime: bookingSettings.bookingAvailableEndTime || null,
      bookingBlackoutDates: parseBookingBlackoutDatesText(bookingSettings.bookingBlackoutDatesText),
      bookingSlotIntervalMinutes: bookingSettings.bookingSlotIntervalMinutes,
      bookingBufferMinutes: bookingSettings.bookingBufferMinutes ? Number(bookingSettings.bookingBufferMinutes) : null,
      bookingCapacityPerSlot: bookingSettings.bookingCapacityPerSlot ? Number(bookingSettings.bookingCapacityPerSlot) : null,
      notificationAppointmentConfirmationEmailEnabled:
        bookingSettings.notificationAppointmentConfirmationEmailEnabled,
      bookingRequestUrl: bookingUrl,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    setBookingSettingsLoaded(bookingSettings);
    toast.success("Booking settings saved.");
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
              disabled={!canEditServices}
            >
              <FolderKanban className="mr-2 h-4 w-4" />
              Add Category
            </Button>
            <Button onClick={() => openCreateService()} disabled={!canEditServices}>
              <Plus className="mr-2 h-4 w-4" />
              Add Service
            </Button>
          </div>
        }
      />

      <BookingBuilderCard
        value={bookingSettings}
        onChange={setBookingSettings}
        onSave={() => void handleSaveBookingSettings()}
        saving={updateBusinessFetching || bookingSettingsLoading}
        dirty={bookingSettingsDirty}
        bookingUrl={bookingUrl}
        bookableServicesCount={bookingEnabledServicesCount}
        selfBookServicesCount={selfBookServicesCount}
        previewServices={services}
        businessType={businessType}
        canEdit={canEditBookingSettings}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Categories" value={String(categories.length)} detail="Active service groups" />
        <MetricCard label="Active services" value={String(activeServicesCount)} detail="Live catalog services" />
        <MetricCard label="Booking-ready" value={String(bookingEnabledServicesCount)} detail="Visible on the booking page" />
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
            {isSmallViewport ? (
              <>
                <MobileFilterSelect
                  value={serviceTab}
                  onChange={(value) => setServiceTab(value as "active" | "inactive")}
                  className="min-w-[140px]"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </MobileFilterSelect>
                <MobileFilterSelect
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  className="min-w-[180px]"
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </MobileFilterSelect>
              </>
            ) : (
              <>
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
              </>
            )}
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
                      bookingUrl={bookingUrl}
                      defaultBookingFlow={bookingSettings.bookingDefaultFlow}
                      canEdit={canEditServices}
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-x-hidden overflow-y-auto p-0 sm:max-w-[560px]">
          <div className="p-6">
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editService)} onOpenChange={(open) => !open && setEditService(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-x-hidden overflow-y-auto p-0 sm:max-w-[560px]">
          <div className="p-6">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>Update service details, move it between categories, or manage add-ons.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateService}>
            <ServiceForm formData={editFormData} onChange={setEditFormData} categoryOptions={categoryOptions} />
            <Separator className="my-4" />
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Frequently added services</p>
                <p className="mt-1 text-xs text-muted-foreground">Link related services so the booking flow can recommend clean, relevant upsells.</p>
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
          </div>
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
