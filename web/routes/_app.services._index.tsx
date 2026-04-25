import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
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
import { ResponsiveSelect } from "@/components/ui/responsive-select";
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
import { buildPublicBookingUrl, openExternalUrl } from "@/lib/publicAppUrl";
import { shareNativeContent, triggerNotificationFeedback, triggerSelectionFeedback } from "@/lib/nativeInteractions";
import {
  defaultBookingBranding,
  type BookingBrandAccentColorToken,
  type BookingBrandBackgroundToneToken,
  type BookingBrandButtonStyleToken,
  type BookingBrandPrimaryColorToken,
} from "@/lib/bookingBranding";
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck2,
  ExternalLink,
  FolderKanban,
  Package,
  Pencil,
  Plus,
  Share2,
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
  bookingBufferMinutes: number | null;
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
  bookingBrandLogoUrl: string;
  bookingBrandPrimaryColorToken: BookingBrandPrimaryColorToken;
  bookingBrandAccentColorToken: BookingBrandAccentColorToken;
  bookingBrandBackgroundToneToken: BookingBrandBackgroundToneToken;
  bookingBrandButtonStyleToken: BookingBrandButtonStyleToken;
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
  bookingBufferMinutes: string;
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
  bookingBufferMinutes: "",
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
  bookingBrandLogoUrl: "",
  bookingBrandPrimaryColorToken: defaultBookingBranding.primaryColorToken,
  bookingBrandAccentColorToken: defaultBookingBranding.accentColorToken,
  bookingBrandBackgroundToneToken: defaultBookingBranding.backgroundToneToken,
  bookingBrandButtonStyleToken: defaultBookingBranding.buttonStyleToken,
  bookingRequireEmail: false,
  bookingRequirePhone: false,
  bookingRequireVehicle: true,
  bookingAllowCustomerNotes: true,
  bookingShowPrices: true,
  bookingShowDurations: true,
  bookingAvailableDays: [1, 2, 3, 4, 5],
  bookingAvailableStartTime: "09:00",
  bookingAvailableEndTime: "19:00",
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

function formatBookingDaySummary(days: number[] | null | undefined): string {
  const normalized = Array.isArray(days) ? [...new Set(days)] : [];
  if (normalized.length === 0 || normalized.length === BOOKING_DAY_OPTIONS.length) return "Every day";
  return BOOKING_DAY_OPTIONS.filter((day) => normalized.includes(day.value))
    .map((day) => day.label)
    .join(", ");
}

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

function formatAvailabilityTimeLabel(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (Number.isNaN(hours) || hours < 0 || hours > 23) return value;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
}

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function buildServiceFormDefaults(
  bookingSettings: Pick<BusinessBookingSettings, "bookingAvailableDays" | "bookingAvailableStartTime" | "bookingAvailableEndTime">
): ServiceFormData {
  return {
    ...defaultServiceFormData,
    bookingAvailableDays: [...bookingSettings.bookingAvailableDays],
    bookingAvailableStartTime: bookingSettings.bookingAvailableStartTime,
    bookingAvailableEndTime: bookingSettings.bookingAvailableEndTime,
  };
}

function dayIndexesMatch(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function buildInheritedAvailabilityPayload(
  formData: Pick<ServiceFormData, "bookingAvailableDays" | "bookingAvailableStartTime" | "bookingAvailableEndTime">,
  bookingSettings: Pick<BusinessBookingSettings, "bookingAvailableDays" | "bookingAvailableStartTime" | "bookingAvailableEndTime">
) {
  return {
    bookingAvailableDays: dayIndexesMatch(formData.bookingAvailableDays, bookingSettings.bookingAvailableDays)
      ? []
      : formData.bookingAvailableDays,
    bookingAvailableStartTime:
      formData.bookingAvailableStartTime === bookingSettings.bookingAvailableStartTime
        ? null
        : formData.bookingAvailableStartTime || null,
    bookingAvailableEndTime:
      formData.bookingAvailableEndTime === bookingSettings.bookingAvailableEndTime
        ? null
        : formData.bookingAvailableEndTime || null,
  };
}

function serviceToFormData(
  service: ServiceRecord,
  bookingSettings: Pick<BusinessBookingSettings, "bookingAvailableDays" | "bookingAvailableStartTime" | "bookingAvailableEndTime">
): ServiceFormData {
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
    bookingAvailableDays:
      Array.isArray(service.bookingAvailableDays) && service.bookingAvailableDays.length > 0
        ? service.bookingAvailableDays
        : [...bookingSettings.bookingAvailableDays],
    bookingAvailableStartTime: service.bookingAvailableStartTime ?? bookingSettings.bookingAvailableStartTime,
    bookingAvailableEndTime: service.bookingAvailableEndTime ?? bookingSettings.bookingAvailableEndTime,
    bookingBufferMinutes:
      service.bookingBufferMinutes != null && Number(service.bookingBufferMinutes) >= 0
        ? String(service.bookingBufferMinutes)
        : "",
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
    bookingBrandLogoUrl: (record as { bookingBrandLogoUrl?: string | null })?.bookingBrandLogoUrl ?? "",
    bookingBrandPrimaryColorToken:
      ((record as { bookingBrandPrimaryColorToken?: BookingBrandPrimaryColorToken | null })?.bookingBrandPrimaryColorToken as BookingBrandPrimaryColorToken | undefined) ??
      defaultBookingBranding.primaryColorToken,
    bookingBrandAccentColorToken:
      ((record as { bookingBrandAccentColorToken?: BookingBrandAccentColorToken | null })?.bookingBrandAccentColorToken as BookingBrandAccentColorToken | undefined) ??
      defaultBookingBranding.accentColorToken,
    bookingBrandBackgroundToneToken:
      ((record as { bookingBrandBackgroundToneToken?: BookingBrandBackgroundToneToken | null })?.bookingBrandBackgroundToneToken as BookingBrandBackgroundToneToken | undefined) ??
      defaultBookingBranding.backgroundToneToken,
    bookingBrandButtonStyleToken:
      ((record as { bookingBrandButtonStyleToken?: BookingBrandButtonStyleToken | null })?.bookingBrandButtonStyleToken as BookingBrandButtonStyleToken | undefined) ??
      defaultBookingBranding.buttonStyleToken,
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
    bookingAvailableStartTime:
      (record as { bookingAvailableStartTime?: string | null })?.bookingAvailableStartTime ?? "09:00",
    bookingAvailableEndTime:
      (record as { bookingAvailableEndTime?: string | null })?.bookingAvailableEndTime ?? "19:00",
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
  bookingDefaults,
}: {
  formData: ServiceFormData;
  onChange: (data: ServiceFormData) => void;
  categoryOptions: Array<{ value: string; label: string }>;
  bookingDefaults: Pick<BusinessBookingSettings, "bookingAvailableDays" | "bookingAvailableStartTime" | "bookingAvailableEndTime">;
}) {
  const bookingDefaultsLabel = `${formatBookingDaySummary(bookingDefaults.bookingAvailableDays)} • ${
    formatAvailabilityTimeLabel(bookingDefaults.bookingAvailableStartTime) || "Start time"
  } to ${formatAvailabilityTimeLabel(bookingDefaults.bookingAvailableEndTime) || "End time"}`;
  const formSelectTriggerClassName =
    "h-10 w-full rounded-xl border-input/90 bg-background/85 px-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.03)]";
  const mobileTimeInputClassName =
    "h-11 text-base [font-variant-numeric:tabular-nums] sm:h-10 sm:text-sm [color-scheme:light] [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:min-h-[1.25rem] [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit-fields-wrapper]:min-w-0";
  const bookingDefaultsDisplayLabel = bookingDefaultsLabel.replace("â€¢", "-");

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
        <ResponsiveSelect
          id="svc-category"
          value={formData.categoryId}
          onValueChange={(value) => onChange({ ...formData, categoryId: value })}
          placeholder="Select category"
          options={categoryOptions}
          triggerClassName={formSelectTriggerClassName}
        />
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
            <p className="text-sm font-semibold">Public Booking Options</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              These settings start with your business booking defaults, then can be adjusted here for this service when needed.
            </p>
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Business defaults: {bookingDefaultsDisplayLabel}
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
            <ResponsiveSelect
              id="svc-booking-flow"
              value={formData.bookingFlowType}
              onValueChange={(value) =>
                onChange({
                  ...formData,
                  bookingFlowType: value as ServiceFormData["bookingFlowType"],
                })
              }
              placeholder="Select booking flow"
              options={[
                { value: "inherit", label: "Use business default" },
                { value: "self_book", label: "Customers can book instantly" },
                { value: "request", label: "Review requests first" },
              ]}
              triggerClassName={formSelectTriggerClassName}
            />
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

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-mode">Service mode</Label>
            <ResponsiveSelect
              id="svc-booking-mode"
              value={formData.bookingServiceMode}
              onValueChange={(value) =>
                onChange({
                  ...formData,
                  bookingServiceMode: value as ServiceFormData["bookingServiceMode"],
                })
              }
              placeholder="Select service mode"
              options={[
                { value: "in_shop", label: "In-shop only" },
                { value: "mobile", label: "Mobile / on-site only" },
                { value: "both", label: "Let the customer choose" },
              ]}
              triggerClassName={formSelectTriggerClassName}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-buffer">Buffer after booking (minutes)</Label>
            <Input
              id="svc-booking-buffer"
              type="number"
              min="0"
              max="240"
              step="5"
              value={formData.bookingBufferMinutes}
              onChange={(e) => onChange({ ...formData, bookingBufferMinutes: e.target.value })}
              placeholder="Use business default"
            />
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
          <p className="text-xs leading-5 text-muted-foreground">
            Starts with the business booking schedule and can be adjusted here for this service.
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-start">Service window start</Label>
            <Input
              id="svc-booking-start"
              type="time"
              className={mobileTimeInputClassName}
              value={formData.bookingAvailableStartTime}
              onChange={(e) => onChange({ ...formData, bookingAvailableStartTime: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="svc-booking-end">Service window end</Label>
            <Input
              id="svc-booking-end"
              type="time"
              className={mobileTimeInputClassName}
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
    <Card className="border-slate-200/75 bg-white/95 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
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
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-medium tracking-[0.08em] uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-500"
      )}
    >
      {children}
    </span>
  );
}

function ServiceMetaPill({
  label,
  value,
  tone = "cool",
}: {
  label: string;
  value: string;
  tone?: "cool" | "warm" | "success" | "neutral";
}) {
  const toneClasses =
    tone === "warm"
      ? "border-amber-200 bg-amber-50/80 text-amber-900"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
        : tone === "neutral"
          ? "border-slate-200 bg-slate-50 text-slate-800"
          : "border-slate-200 bg-white/90 text-slate-900";

  return (
    <div className={cn("rounded-2xl border px-3.5 py-3 shadow-sm", toneClasses)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold tracking-[-0.01em]">{value}</p>
    </div>
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
    <section className="rounded-[1.45rem] border border-slate-200/80 bg-white/95 p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="space-y-1">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{title}</h3>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
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
          {service.bookingEnabled === true && service.bookingBufferMinutes ? <span>{service.bookingBufferMinutes}m buffer</span> : null}
          {service.bookingEnabled === true && service.bookingWindowDays ? <span>{service.bookingWindowDays} day window</span> : null}
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 lg:ml-4 lg:w-auto lg:min-w-[220px] lg:items-end">
        <div className="flex w-full flex-wrap items-center gap-2 lg:justify-end">
          {primaryBookingHref ? (
            <Button size="sm" className="rounded-xl shadow-sm" asChild onClick={(e) => e.stopPropagation()}>
              <Link to={primaryBookingHref}>
                {effectiveBookingCta}
              </Link>
            </Button>
          ) : null}
          {detailBookingHref ? (
            <Button size="sm" variant="outline" className="rounded-xl" asChild onClick={(e) => e.stopPropagation()}>
              <Link to={detailBookingHref}>
                Learn more
              </Link>
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
      return;
    }

    setBookingSettingsLoading(true);
    api.business
      .findOne(businessId)
      .then((record) => {
        if (cancelled) return;
        const normalized = businessToBookingSettings(record as Partial<BusinessBookingSettings>);
        setBookingSettings(normalized);
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
    const url = buildPublicBookingUrl(businessId);
    return url || null;
  }, [businessId]);

  const shareBookingUrl = async () => {
    if (!bookingUrl || !bookingSettings.bookingEnabled) return;
    const result = await shareNativeContent({
      title: "Strata booking page",
      text: "Share the live Strata booking page.",
      url: bookingUrl,
    });

    if (result === "shared") {
      toast.success("Booking link shared.");
      void triggerNotificationFeedback("success");
      return;
    }
    if (result === "copied") {
      toast.success("Booking link copied.");
      void triggerNotificationFeedback("success");
      return;
    }
    if (result === "cancelled") return;

    toast.error("Could not share the booking link.");
    void triggerNotificationFeedback("error");
  };

  const openCreateService = (categoryId?: string | null) => {
    if (!canEditServices) return;
    setCreateFormData({
      ...buildServiceFormDefaults(bookingSettings),
      categoryId: categoryId ?? UNCATEGORIZED_VALUE,
    });
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
    const inheritedAvailability = buildInheritedAvailabilityPayload(createFormData, bookingSettings);
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
        bookingAvailableDays: inheritedAvailability.bookingAvailableDays,
        bookingAvailableStartTime: inheritedAvailability.bookingAvailableStartTime,
        bookingAvailableEndTime: inheritedAvailability.bookingAvailableEndTime,
        bookingBufferMinutes: createFormData.bookingBufferMinutes ? parseInt(createFormData.bookingBufferMinutes, 10) : null,
        bookingCapacityPerSlot: createFormData.bookingCapacityPerSlot ? parseInt(createFormData.bookingCapacityPerSlot, 10) : null,
        bookingFeatured: createFormData.bookingFeatured,
        bookingHidePrice: createFormData.bookingHidePrice,
        bookingHideDuration: createFormData.bookingHideDuration,
        business: businessId ? { _link: businessId } : undefined,
    });
    if (result.error) return toast.error(result.error.message);
    toast.success("Service created.");
    setCreateServiceOpen(false);
    setCreateFormData(buildServiceFormDefaults(bookingSettings));
    void refetchServices();
  };

  const handleUpdateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editService || !editFormData.name.trim() || !editFormData.price) return toast.error("Please fill in all required fields.");
    const inheritedAvailability = buildInheritedAvailabilityPayload(editFormData, bookingSettings);
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
        bookingAvailableDays: inheritedAvailability.bookingAvailableDays,
        bookingAvailableStartTime: inheritedAvailability.bookingAvailableStartTime,
        bookingAvailableEndTime: inheritedAvailability.bookingAvailableEndTime,
        bookingBufferMinutes: editFormData.bookingBufferMinutes ? parseInt(editFormData.bookingBufferMinutes, 10) : null,
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

      <Card className="overflow-hidden border-slate-200/80 bg-white/92 shadow-[0_20px_48px_rgba(15,23,42,0.07)]">
        <div className="h-1.5 w-full bg-[linear-gradient(90deg,rgba(15,23,42,0.92),rgba(249,115,22,0.88),rgba(251,146,60,0.78))]" />
        <CardHeader className="border-b border-slate-200/80 bg-slate-50/85">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full border border-slate-200 bg-white text-slate-700">
                  Booking page
                </Badge>
                <Badge variant="outline" className="rounded-full bg-white">
                  {bookingSettings.bookingEnabled ? "Live" : "Disabled"}
                </Badge>
                <Badge variant="outline" className="rounded-full bg-white">
                  {bookingSettings.bookingDefaultFlow === "self_book" ? "Direct booking default" : "Request-first default"}
                </Badge>
              </div>
              <div className="space-y-1">
                <CardTitle className="text-xl tracking-[-0.03em]">Booking page settings now live in a dedicated builder</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6 text-slate-600">
                  {bookingSettings.bookingEnabled
                    ? "Keep Services focused on the catalog. Open the booking builder for branding, copy, fields, urgency, and the live page preview."
                    : "Booking page is disabled right now. Open the booking builder when you are ready to turn it on and shape the public experience."}
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/app/booking">
                  <CalendarCheck2 className="mr-2 h-4 w-4" />
                  Open booking builder
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={!bookingUrl || !bookingSettings.bookingEnabled}
                onClick={() => void shareBookingUrl()}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share link
              </Button>
              <Button
                type="button"
                disabled={!bookingUrl || !bookingSettings.bookingEnabled}
                className="rounded-xl"
                onClick={() => {
                  if (bookingUrl && bookingSettings.bookingEnabled) {
                    void triggerSelectionFeedback();
                    openExternalUrl(bookingUrl);
                  }
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View live
              </Button>
            </div>
          </div>
        </CardHeader>
        {bookingSettings.bookingEnabled ? (
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4 sm:p-6">
            <MetricCard label="Booking-ready" value={String(bookingEnabledServicesCount)} detail="Visible on the public booking page" />
            <MetricCard label="Direct book" value={String(selfBookServicesCount)} detail="Can confirm instantly" />
            <MetricCard
              label="Booking headline"
              value={bookingSettings.bookingPageTitle || "Tell us what you need"}
              detail={bookingSettings.bookingPageSubtitle || "Share a few details and the shop can follow up with the right next step."}
            />
            <MetricCard
              label="Availability defaults"
              value={
                bookingSettings.bookingAvailableStartTime || bookingSettings.bookingAvailableEndTime
                  ? `${formatAvailabilityTimeLabel(bookingSettings.bookingAvailableStartTime) || "Start time"} to ${
                      formatAvailabilityTimeLabel(bookingSettings.bookingAvailableEndTime) || "end time"
                    }`
                  : "Uses builder defaults"
              }
              detail={
                bookingSettingsLoading
                  ? "Loading booking settings..."
                  : "These business hours feed public booking by default, and each service can adjust them below."
              }
            />
          </CardContent>
        ) : null}
      </Card>

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
                      onEdit={(record) => { setEditService(record); setEditFormData(serviceToFormData(record, bookingSettings)); setNewAddonServiceId(""); }}
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
          <div className="p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>Create a service and place it in the right category right away.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateService}>
            <ServiceForm
              formData={createFormData}
              onChange={setCreateFormData}
              categoryOptions={categoryOptions}
              bookingDefaults={bookingSettings}
            />
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setCreateServiceOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createServiceFetching}>{createServiceFetching ? "Creating..." : "Create Service"}</Button>
            </DialogFooter>
          </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editService)} onOpenChange={(open) => !open && setEditService(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-x-hidden overflow-y-auto p-0 sm:max-w-[560px]">
          <div className="p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>Update service details, move it between categories, or manage add-ons.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateService}>
            <ServiceForm
              formData={editFormData}
              onChange={setEditFormData}
              categoryOptions={categoryOptions}
              bookingDefaults={bookingSettings}
            />
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <ResponsiveSelect
                  value={newAddonServiceId}
                  onValueChange={setNewAddonServiceId}
                  placeholder="Select a service to link as an add-on"
                  options={services
                    .filter(
                      (service) =>
                        editService &&
                        service.id !== editService.id &&
                        service.active !== false &&
                        !linkedAddonRecords.some((link) => link.addonServiceId === service.id)
                    )
                    .map((service) => ({
                      value: service.id,
                      label: service.name,
                    }))}
                  triggerClassName="h-10 flex-1 rounded-xl border-input/90 bg-background/85 px-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                />
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
                <button key={summary.service.id} type="button" onClick={() => { setEditService(summary.service); setEditFormData(serviceToFormData(summary.service, bookingSettings)); }} className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/30">
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
