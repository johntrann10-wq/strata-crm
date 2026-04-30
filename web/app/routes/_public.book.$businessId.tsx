import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useSearchParams } from "react-router";
import { API_BASE } from "@/api";
import { BookingBrandLogo } from "@/components/booking/BookingBrandLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { trackEvent } from "@/lib/analytics";
import { getAuthToken, getCurrentBusinessId } from "@/lib/auth";
import {
  resolveEffectiveBookingRequestSettings,
  type BookingRequestSettings,
  type ServiceBookingRequestPolicy,
} from "@/lib/bookingRequestSettings";
import {
  resolveBookingBrandTheme,
  type BookingBrandingTokens,
} from "@/lib/bookingBranding";
import {
  publicSocialPreviewVersion,
  resolvePublicShareMetadata,
  usePublicShareMeta,
  type PublicShareMetadataPayload,
} from "@/lib/publicShareMeta";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CarFront,
  Check,
  ChevronDown,
  Clock3,
  ListFilter,
  Loader2,
  Star,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

type BookingAddon = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  depositAmount: number;
  bufferMinutes: number;
  description: string | null;
  featured: boolean;
  showPrice: boolean;
  showDuration: boolean;
};

type BookingService = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryLabel: string | null;
  description: string | null;
  price: number;
  durationMinutes: number;
  effectiveFlow: "request" | "self_book";
  depositAmount: number;
  leadTimeHours: number;
  bookingWindowDays: number;
  bufferMinutes: number;
  serviceMode: "in_shop" | "mobile" | "both";
  featured: boolean;
  showPrice: boolean;
  showDuration: boolean;
  requestPolicy: ServiceBookingRequestPolicy;
  availableDayIndexes: number[] | null;
  openTime: string | null;
  closeTime: string | null;
  addons: BookingAddon[];
};

type BookingDailyHoursEntry = {
  dayIndex: number;
  enabled: boolean;
  openTime: string | null;
  closeTime: string | null;
};

type BookingConfig = {
  businessId: string;
  businessName: string;
  businessType: string | null;
  timezone: string;
  title: string;
  subtitle: string;
  urgencyText: string | null;
  confirmationMessage: string | null;
  branding: BookingBrandingTokens;
  trustPoints: string[];
  notesPrompt: string;
  defaultFlow: "request" | "self_book";
  requestSettings: BookingRequestSettings;
  requireEmail: boolean;
  requirePhone: boolean;
  requireVehicle: boolean;
  allowCustomerNotes: boolean;
  showPrices: boolean;
  showDurations: boolean;
  urgencyEnabled: boolean;
  availabilityDefaults: {
    dayIndexes: number[];
    openTime: string | null;
    closeTime: string | null;
    dailyHours?: BookingDailyHoursEntry[];
    blackoutDates?: string[];
  };
  locations: Array<{ id: string; name: string; address: string | null }>;
  services: BookingService[];
};

type BookingAvailability = {
  effectiveFlow: "request" | "self_book";
  serviceMode?: "in_shop" | "mobile";
  timezone: string;
  date: string;
  slots: Array<{ startTime: string; label: string }>;
  durationMinutes: number;
  subtotal: number;
  depositAmount: number;
};

type BookingSubmitResult = {
  ok: boolean;
  accepted: boolean;
  mode: "request" | "self_book";
  message: string;
  leadId?: string;
  appointmentId?: string;
  confirmationUrl?: string;
  portalUrl?: string;
  scheduledFor?: string;
  depositAmount?: number;
};

type BookingRequestFlexibility = "exact_time_only" | "same_day_flexible" | "any_nearby_slot";

type BookingFormState = {
  serviceId: string;
  addonServiceIds: string[];
  serviceMode: "in_shop" | "mobile";
  locationId: string;
  bookingDate: string;
  startTime: string;
  requestedTimeEnd: string;
  requestedTimeLabel: string;
  flexibility: BookingRequestFlexibility;
  customerTimezone: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  serviceAddress: string;
  serviceCity: string;
  serviceState: string;
  serviceZip: string;
  notes: string;
  marketingOptIn: boolean;
  website: string;
};

type RequestTimingMode = "exact" | "window";
type StepKey = "service" | "vehicle" | "schedule" | "contact" | "review";
type FlowStep = { key: StepKey; label: string; title: string; description: string };
type DraftStatus = "idle" | "saving" | "saved";
type DraftLifecycleStatus =
  | "anonymous_draft"
  | "identified_lead"
  | "qualified_booking_intent"
  | "submitted_request"
  | "confirmed_booking";

type DraftSnapshot = {
  currentStep: number;
  serviceCategoryFilter: string;
  expandedServiceId: string;
  form: BookingFormState;
  savedAt: string;
  draftId?: string | null;
  resumeToken?: string | null;
  serverStatus?: DraftLifecycleStatus | null;
  serverSavedAt?: string | null;
};

type BookingDraftResponse = {
  draftId: string;
  resumeToken: string;
  status: DraftLifecycleStatus;
  savedAt: string;
  currentStep: number;
  serviceCategoryFilter: string;
  expandedServiceId: string;
  form: BookingFormState;
};

const UNCATEGORIZED_CATEGORY = "uncategorized";

function emptyForm(): BookingFormState {
  return {
    serviceId: "",
    addonServiceIds: [],
    serviceMode: "in_shop",
    locationId: "",
    bookingDate: "",
    startTime: "",
    requestedTimeEnd: "",
    requestedTimeLabel: "",
    flexibility: "same_day_flexible",
    customerTimezone: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleColor: "",
    serviceAddress: "",
    serviceCity: "",
    serviceState: "",
    serviceZip: "",
    notes: "",
    marketingOptIn: true,
    website: "",
  };
}

const buildApiUrl = (path: string) => `${API_BASE}${path}`;
const BOOKING_DESCRIPTION_LIST_MARKER = /^([*-•]|\d+[.)])\s+/;

function buildBuilderPreviewRequestInit(
  isBuilderPreview: boolean,
  init: RequestInit = {}
): RequestInit {
  if (!isBuilderPreview || typeof window === "undefined") return init;

  const headers = new Headers(init.headers);
  const authToken = getAuthToken();
  const currentBusinessId = getCurrentBusinessId();

  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  if (currentBusinessId && !headers.has("x-business-id")) {
    headers.set("x-business-id", currentBusinessId);
  }

  return {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  };
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);

function formatDuration(minutes: number) {
  if (!minutes || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours > 0 && remaining > 0) return `${hours}h ${remaining}m`;
  if (hours > 0) return `${hours}h`;
  return `${remaining}m`;
}

function formatLeadTimeLabel(hours: number) {
  if (!hours || hours <= 0) return "";
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days}d notice`;
  }
  return `${hours}h notice`;
}

const BOOKING_DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const REQUEST_FLEXIBILITY_OPTIONS: Array<{
  value: BookingRequestFlexibility;
  label: string;
  detail: string;
}> = [
  {
    value: "exact_time_only",
    label: "Exact time only",
    detail: "Only this time works.",
  },
  {
    value: "same_day_flexible",
    label: "Same day flexible",
    detail: "Nearby times that day are okay.",
  },
  {
    value: "any_nearby_slot",
    label: "Any nearby slot",
    detail: "A different day can work too.",
  },
];

function formatTimeValueLabel(value: string | null | undefined) {
  if (!value) return null;
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatAvailabilityDays(dayIndexes: number[] | null | undefined) {
  if (!Array.isArray(dayIndexes) || dayIndexes.length === 0) return "Daily";
  if (dayIndexes.length === 7) return "Daily";
  const sorted = [...dayIndexes].sort((left, right) => left - right);
  const weekdays = [1, 2, 3, 4, 5];
  if (sorted.length === weekdays.length && weekdays.every((day, index) => sorted[index] === day)) return "Mon-Fri";
  return sorted.map((dayIndex) => BOOKING_DAY_SHORT[dayIndex] ?? "").filter(Boolean).join(", ");
}

function formatAvailabilityWindow(dayIndexes: number[] | null | undefined, openTime: string | null | undefined, closeTime: string | null | undefined) {
  const dayLabel = formatAvailabilityDays(dayIndexes);
  const openLabel = formatTimeValueLabel(openTime);
  const closeLabel = formatTimeValueLabel(closeTime);
  if (openLabel && closeLabel) return `${dayLabel} • ${openLabel} to ${closeLabel}`;
  return dayLabel;
}

type BookingDescriptionBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; heading?: string; items: string[] };

function normalizeBookingDescriptionItem(line: string) {
  return line.replace(BOOKING_DESCRIPTION_LIST_MARKER, "").trim();
}

function parseBookingDescription(description: string): BookingDescriptionBlock[] {
  const sections = description
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((section) => section.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);

  const blocks: BookingDescriptionBlock[] = [];

  for (let index = 0; index < sections.length; index += 1) {
    const lines = sections[index];
    const [firstLine, ...restLines] = lines;
    const nextLines = sections[index + 1];

    if (lines.length === 1 && firstLine.endsWith(":") && nextLines?.length) {
      blocks.push({
        type: "list",
        heading: firstLine,
        items: nextLines.map(normalizeBookingDescriptionItem),
      });
      index += 1;
      continue;
    }

    if (firstLine.endsWith(":") && restLines.length > 0) {
      blocks.push({
        type: "list",
        heading: firstLine,
        items: restLines.map(normalizeBookingDescriptionItem),
      });
      continue;
    }

    if (lines.every((line) => BOOKING_DESCRIPTION_LIST_MARKER.test(line))) {
      blocks.push({
        type: "list",
        items: lines.map(normalizeBookingDescriptionItem),
      });
      continue;
    }

    blocks.push({
      type: "paragraph",
      text: lines.join(" "),
    });
  }

  return blocks;
}

function BookingDescription({
  description,
  className,
  textClassName,
  headingClassName,
  listClassName,
}: {
  description: string;
  className?: string;
  textClassName?: string;
  headingClassName?: string;
  listClassName?: string;
}) {
  const blocks = parseBookingDescription(description);
  if (!blocks.length) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "paragraph") {
          return (
            <p key={`booking-description-paragraph-${blockIndex}`} className={cn("text-sm leading-6 text-slate-600", textClassName)}>
              {block.text}
            </p>
          );
        }

        return (
          <div key={`booking-description-list-${blockIndex}`} className="space-y-1.5">
            {block.heading ? (
              <p className={cn("text-sm font-semibold leading-6 text-slate-700", headingClassName)}>
                {block.heading}
              </p>
            ) : null}
            <ul className={cn("ml-5 list-disc space-y-1.5", listClassName)}>
              {block.items.map((item, itemIndex) => (
                <li key={`booking-description-item-${blockIndex}-${itemIndex}`} className={cn("text-sm leading-6 text-slate-600", textClassName)}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function buildSuggestedBookingDates(params: {
  minDate: string;
  maxDate: string;
  allowedDayIndexes: number[] | null | undefined;
  dailyHours?: BookingDailyHoursEntry[] | null;
  blackoutDates?: string[] | null;
  selectedDate: string;
  limit?: number;
}) {
  const start = new Date(`${params.minDate}T00:00:00`);
  const end = new Date(`${params.maxDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) return [];
  const allowedDays = Array.isArray(params.allowedDayIndexes) && params.allowedDayIndexes.length > 0
    ? new Set(params.allowedDayIndexes)
    : null;
  const blackoutDates = new Set(params.blackoutDates ?? []);
  const dailyHoursByDay = new Map(
    (params.dailyHours ?? [])
      .filter((entry) => Number.isInteger(entry.dayIndex) && entry.dayIndex >= 0 && entry.dayIndex <= 6)
      .map((entry) => [entry.dayIndex, entry])
  );
  const results: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime() && results.length < (params.limit ?? 7)) {
    const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const dayHours = dailyHoursByDay.get(cursor.getDay());
    const dailyHoursAllowsDate = dayHours ? dayHours.enabled : true;
    if ((!allowedDays || allowedDays.has(cursor.getDay())) && dailyHoursAllowsDate && !blackoutDates.has(dateKey)) {
      results.push(dateKey);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (params.selectedDate && !results.includes(params.selectedDate)) {
    const selected = new Date(`${params.selectedDate}T00:00:00`);
    const selectedDayHours = dailyHoursByDay.get(selected.getDay());
    if (
      !Number.isNaN(selected.getTime()) &&
      selected.getTime() >= start.getTime() &&
      selected.getTime() <= end.getTime() &&
      !blackoutDates.has(params.selectedDate) &&
      (selectedDayHours ? selectedDayHours.enabled : true)
    ) {
      results.unshift(params.selectedDate);
    }
  }

  return Array.from(new Set(results)).slice(0, params.limit ?? 7);
}

function resolveAvailabilityWindowForDate(params: {
  date: string;
  dailyHours?: BookingDailyHoursEntry[] | null;
  fallbackOpenTime: string | null | undefined;
  fallbackCloseTime: string | null | undefined;
}) {
  const date = parseDateValue(params.date);
  if (!date) {
    return {
      openTime: params.fallbackOpenTime ?? null,
      closeTime: params.fallbackCloseTime ?? null,
      closed: false,
    };
  }
  const dayHours = (params.dailyHours ?? []).find((entry) => entry.dayIndex === date.getDay()) ?? null;
  if (!dayHours) {
    return {
      openTime: params.fallbackOpenTime ?? null,
      closeTime: params.fallbackCloseTime ?? null,
      closed: false,
    };
  }
  return {
    openTime: dayHours.enabled ? dayHours.openTime ?? params.fallbackOpenTime ?? null : null,
    closeTime: dayHours.enabled ? dayHours.closeTime ?? params.fallbackCloseTime ?? null : null,
    closed: !dayHours.enabled,
  };
}

function formatBookingDatePill(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { month: "", dayNumber: value, weekday: "" };
  }
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
    dayNumber: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date),
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
  };
}

function parseDateValue(value: string | null | undefined) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatCalendarTriggerLabel(value: string | null | undefined) {
  const date = parseDateValue(value);
  if (!date) return "Open calendar";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatLongBookingDateLabel(value: string | null | undefined) {
  const date = parseDateValue(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function buildLocalIsoDateTime(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return "";
  const [yearRaw, monthRaw, dayRaw] = dateValue.split("-");
  const [hoursRaw, minutesRaw] = timeValue.split(":");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return "";
  }
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseTimeValueToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function formatTimeRangeLabel(params: {
  startTime: string;
  endTime?: string | null;
  timeZone?: string | null;
}) {
  if (!params.startTime) return null;
  const startDate = new Date(params.startTime);
  if (Number.isNaN(startDate.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: params.timeZone || undefined,
    hour: "numeric",
    minute: "2-digit",
  });
  const startLabel = formatter.format(startDate);
  if (!params.endTime) return startLabel;
  const endDate = new Date(params.endTime);
  if (Number.isNaN(endDate.getTime())) return startLabel;
  return `${startLabel} - ${formatter.format(endDate)}`;
}

function buildRequestTimingSummary(params: {
  bookingDate: string;
  startTime: string;
  requestedTimeEnd?: string | null;
  requestedTimeLabel?: string | null;
  timeZone?: string | null;
}) {
  const dateLabel = formatLongBookingDateLabel(params.bookingDate);
  const exactTimeLabel = formatTimeRangeLabel({
    startTime: params.startTime,
    endTime: params.requestedTimeEnd,
    timeZone: params.timeZone,
  });
  const requestLabel = params.requestedTimeLabel?.trim();

  if (dateLabel && exactTimeLabel) return `${dateLabel} · ${exactTimeLabel}`;
  if (dateLabel && requestLabel) return `${dateLabel} · ${requestLabel}`;
  return dateLabel || exactTimeLabel || requestLabel || null;
}

function buildRequestExactTimeOptions(params: {
  bookingDate: string;
  openTime?: string | null;
  closeTime?: string | null;
  durationMinutes: number;
  stepMinutes?: number;
}) {
  if (!params.bookingDate) return [];
  const fallbackOpen = parseTimeValueToMinutes(params.openTime) ?? 9 * 60;
  const fallbackClose = parseTimeValueToMinutes(params.closeTime) ?? 17 * 60;
  const serviceDuration = Math.max(params.durationMinutes || 0, 30);
  const stepMinutes = params.stepMinutes ?? 60;
  const lastStart = Math.max(fallbackOpen, fallbackClose - serviceDuration);
  const slots: Array<{ label: string; startTime: string; endTime: string }> = [];

  for (let minutes = fallbackOpen; minutes <= lastStart; minutes += stepMinutes) {
    const startHours = Math.floor(minutes / 60);
    const startMinutes = minutes % 60;
    const startValue = `${String(startHours).padStart(2, "0")}:${String(startMinutes).padStart(2, "0")}`;
    const endMinutes = minutes + serviceDuration;
    const endHours = Math.floor(endMinutes / 60);
    const trailingMinutes = endMinutes % 60;
    const endValue = `${String(endHours).padStart(2, "0")}:${String(trailingMinutes).padStart(2, "0")}`;
    const startIso = buildLocalIsoDateTime(params.bookingDate, startValue);
    const endIso = buildLocalIsoDateTime(params.bookingDate, endValue);
    if (!startIso || !endIso) continue;
    slots.push({
      label: formatTimeValueLabel(startValue) ?? startValue,
      startTime: startIso,
      endTime: endIso,
    });
  }

  return slots;
}

function buildRequestWindowOptions(params: {
  openTime?: string | null;
  closeTime?: string | null;
}) {
  const openMinutes = parseTimeValueToMinutes(params.openTime) ?? 9 * 60;
  const closeMinutes = parseTimeValueToMinutes(params.closeTime) ?? 17 * 60;
  const baseWindows = [
    { label: "Morning", start: 8 * 60, end: 12 * 60 },
    { label: "Midday", start: 11 * 60, end: 15 * 60 },
    { label: "After 3 PM", start: 15 * 60, end: 19 * 60 },
  ];

  const options = baseWindows
    .map((window) => {
      const start = Math.max(openMinutes, window.start);
      const end = Math.min(closeMinutes, window.end);
      if (end <= start) return null;
      return {
        label: window.label,
        detail: `${formatTimeValueLabel(`${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`) ?? ""} - ${formatTimeValueLabel(`${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`) ?? ""}`,
      };
    })
    .filter((value): value is { label: string; detail: string } => Boolean(value));

  options.push({
    label: "No strong preference",
    detail: `${formatTimeValueLabel(params.openTime ?? "09:00") ?? "9:00 AM"} onward`,
  });

  return options;
}

function toDateInputValue(offsetDays = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function stepIcon(step: StepKey) {
  switch (step) {
    case "vehicle":
      return CarFront;
    case "schedule":
      return CalendarDays;
    case "contact":
      return UserRound;
    case "review":
      return ShieldCheck;
    default:
      return Sparkles;
  }
}

function stepDefinitions(flow: "request" | "self_book"): FlowStep[] {
  return [
    {
      key: "service",
      label: "Service",
      title: "What service do you need?",
      description: "Choose the service or package that fits the job best.",
    },
    {
      key: "vehicle",
      label: "Vehicle",
      title: "What will we be working on?",
      description: "A few basics help the shop prep the right next step.",
    },
    {
      key: "schedule",
      label: "Schedule",
      title: flow === "self_book" ? "Where and when works best?" : "What day and time do you prefer?",
      description:
        flow === "self_book"
          ? "Pick the location, choose a time, and keep the booking moving."
          : "Choose a preferred date, share the time that works best, and let the shop review the request.",
    },
    {
      key: "contact",
      label: "Contact",
      title: "How should the shop reach you?",
      description: "Add the best way to confirm the booking or follow up about the request.",
    },
    {
      key: "review",
      label: "Review",
      title: flow === "self_book" ? "Review and confirm" : "Review your request",
      description:
        flow === "self_book"
          ? "Add any final notes, then confirm everything in one clean pass."
          : "Double-check the requested timing, vehicle, and contact details before sending.",
    },
  ];
}

function TrustPoint({
  title,
  detail,
  icon: Icon,
}: {
  title: string;
  detail: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[1.15rem] border border-[color:var(--booking-accent-border)]/85 bg-white/88 px-3.5 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)] backdrop-blur-sm">
      <div className="rounded-[0.95rem] bg-[var(--booking-accent-icon-soft)] p-2 text-[color:var(--booking-accent-ink)] ring-1 ring-[color:var(--booking-accent-border)]/80">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-[-0.015em] text-slate-950">{title}</p>
        <p className="truncate text-[11px] text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-600">{label}</span>
      <span className={cn("text-right font-medium text-slate-950", emphasize ? "text-base" : "text-sm")}>
        {value}
      </span>
    </div>
  );
}

function StepHint({
  icon: Icon,
  text,
}: {
  icon: typeof ShieldCheck;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[1.15rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
      <div className="rounded-full bg-white p-2 text-slate-700 shadow-sm ring-1 ring-slate-200/70">
        <Icon className="h-4 w-4" />
      </div>
      <p className="pt-0.5">{text}</p>
    </div>
  );
}

function CompactStepRail({
  steps,
  currentStep,
  onSelect,
  canNavigate,
}: {
  steps: FlowStep[];
  currentStep: number;
  onSelect: (index: number) => void;
  canNavigate: (index: number) => boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      {steps.map((step, index) => {
        const Icon = stepIcon(step.key);
        const isActive = index === currentStep;
        const isComplete = index < currentStep;
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => {
              if (canNavigate(index)) onSelect(index);
            }}
            className={cn(
              "group flex items-center gap-2 rounded-full px-2 py-1.5 text-left transition-all motion-reduce:transition-none",
              isActive
                ? "bg-[var(--booking-primary-soft)] shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                : isComplete
                  ? "bg-emerald-50/90"
                  : "bg-white/70 hover:bg-white"
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold uppercase transition-colors",
                isActive
                  ? "border-[color:var(--booking-primary)] bg-[var(--booking-primary)] text-[color:var(--booking-primary-foreground)]"
                  : isComplete
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-200 bg-white text-slate-600"
              )}
            >
              {isComplete ? "Done" : <Icon className="h-4 w-4" />}
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {step.label}
              </p>
              <p className="truncate text-[12px] font-medium tracking-[-0.01em] text-slate-950">{step.title}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function formatSavedAgo(timestamp: string | null, now: number) {
  if (!timestamp) return null;
  const savedAt = new Date(timestamp).getTime();
  if (!Number.isFinite(savedAt)) return null;
  const seconds = Math.max(0, Math.floor((now - savedAt) / 1000));
  if (seconds < 5) return "Draft saved";
  if (seconds < 60) return `Saved ${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Saved ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Saved ${hours} hr ago`;
}

function buildDraftStorageKey(businessId: string) {
  return `strata-booking-draft:${businessId}`;
}

function hasLocalDraftProgress(params: {
  form: BookingFormState;
  currentStep: number;
  serviceCategoryFilter: string;
  expandedServiceId: string;
}) {
  const { form, currentStep, serviceCategoryFilter, expandedServiceId } = params;
  return Boolean(
    form.serviceId ||
      form.addonServiceIds.length > 0 ||
      form.serviceMode !== "in_shop" ||
      form.locationId ||
      currentStep > 0 ||
      serviceCategoryFilter !== "all" ||
      expandedServiceId ||
      form.vehicleMake ||
      form.vehicleModel ||
      form.vehicleYear ||
      form.vehicleColor ||
      form.bookingDate ||
      form.startTime ||
      form.requestedTimeEnd ||
      form.requestedTimeLabel ||
      form.firstName ||
      form.lastName ||
      form.email ||
      form.phone ||
      form.serviceAddress ||
      form.serviceCity ||
      form.serviceState ||
      form.serviceZip ||
      form.notes
  );
}

function hasMeaningfulServerDraft(form: BookingFormState) {
  if (!form.serviceId) return false;
  const hasContact = Boolean(form.email.trim() || form.phone.trim());
  const hasVehicle = Boolean(form.vehicleMake.trim() || form.vehicleModel.trim() || form.vehicleYear.trim());
  const hasTiming = Boolean(form.bookingDate || form.startTime || form.requestedTimeLabel);
  return hasContact || hasVehicle || hasTiming;
}

function buildServerDraftSignature(params: {
  form: BookingFormState;
  currentStep: number;
  serviceCategoryFilter: string;
  expandedServiceId: string;
  source: string;
  campaign: string;
}) {
  const { form, currentStep, serviceCategoryFilter, expandedServiceId, source, campaign } = params;
  return JSON.stringify({
    serviceId: form.serviceId.trim(),
    addonServiceIds: [...form.addonServiceIds].sort(),
    serviceMode: form.serviceMode,
    locationId: form.locationId.trim(),
    bookingDate: form.bookingDate,
    startTime: form.startTime,
    requestedTimeEnd: form.requestedTimeEnd,
    requestedTimeLabel: form.requestedTimeLabel.trim(),
    flexibility: form.flexibility,
    customerTimezone: form.customerTimezone.trim(),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim().toLowerCase(),
    phone: form.phone.trim(),
    vehicleYear: form.vehicleYear.trim(),
    vehicleMake: form.vehicleMake.trim(),
    vehicleModel: form.vehicleModel.trim(),
    vehicleColor: form.vehicleColor.trim(),
    serviceAddress: form.serviceAddress.trim(),
    serviceCity: form.serviceCity.trim(),
    serviceState: form.serviceState.trim(),
    serviceZip: form.serviceZip.trim(),
    notes: form.notes.trim(),
    marketingOptIn: form.marketingOptIn,
    source: source.trim(),
    campaign: campaign.trim(),
    currentStep,
    serviceCategoryFilter,
    expandedServiceId,
  });
}

function toCategoryFilterValue(categoryId: string | null | undefined) {
  return categoryId || UNCATEGORIZED_CATEGORY;
}

const publicSiteUrl = "https://stratacrm.app";

export function meta({ params }: { params: { businessId?: string } }) {
  const businessId = params.businessId?.trim();
  const previewUrl = `${publicSiteUrl}/social-preview.png?v=${publicSocialPreviewVersion}`;
  const canonicalUrl = businessId
    ? `${publicSiteUrl}/book/${encodeURIComponent(businessId)}`
    : `${publicSiteUrl}/book`;
  const title = "Book online | Strata";
  const description = "Choose a service, share your vehicle, and move through a faster booking flow without the back-and-forth.";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:url", content: canonicalUrl },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: previewUrl },
    { property: "og:image:secure_url", content: previewUrl },
    { property: "og:image:alt", content: "Booking page preview" },
    { name: "twitter:url", content: canonicalUrl },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: previewUrl },
    { name: "twitter:image:alt", content: "Booking page preview" },
  ];
}

export default function PublicBookingPage() {
  const { businessId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [shareMetadataPayload, setShareMetadataPayload] = useState<PublicShareMetadataPayload | null>(null);
  const [form, setForm] = useState<BookingFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<BookingAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingSubmitResult | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState<string>("all");
  const [expandedServiceId, setExpandedServiceId] = useState<string>("");
  const [mobileCategorySheetOpen, setMobileCategorySheetOpen] = useState(false);
  const [draftHydrating, setDraftHydrating] = useState(true);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftResumeToken, setDraftResumeToken] = useState<string | null>(null);
  const [draftServerId, setDraftServerId] = useState<string | null>(null);
  const [draftLifecycleStatus, setDraftLifecycleStatus] = useState<DraftLifecycleStatus | null>(null);
  const [savedNow, setSavedNow] = useState<number>(Date.now());
  const [requestTimeMode, setRequestTimeMode] = useState<RequestTimingMode>("exact");
  const [submittedForm, setSubmittedForm] = useState<BookingFormState | null>(null);
  const [submittedService, setSubmittedService] = useState<BookingService | null>(null);
  const didHydrateQueryRef = useRef<string | null>(null);
  const restoredDraftRef = useRef<string | null>(null);
  const syncedQueryStateRef = useRef<string | null>(null);
  const lastServerDraftSignatureRef = useRef<string | null>(null);
  const abandonSentForTokenRef = useRef<string | null>(null);

  const source = useMemo(
    () => searchParams.get("source") || searchParams.get("utm_source") || searchParams.get("ref") || "website",
    [searchParams]
  );
  const campaign = useMemo(
    () => searchParams.get("campaign") || searchParams.get("utm_campaign") || "",
    [searchParams]
  );
  const resolvedShareMetadata = useMemo(() => {
    if (typeof window === "undefined" || !shareMetadataPayload) return null;
    return resolvePublicShareMetadata(shareMetadataPayload, window.location.origin, window.location.search);
  }, [shareMetadataPayload]);
  const requestedServiceId = searchParams.get("service");
  const requestedCategoryId = searchParams.get("category");
  const requestedStep = searchParams.get("step");
  const builderPreviewToken = searchParams.get("builderPreview");
  const builderPreviewFlow = searchParams.get("builderPreviewFlow");
  const builderPreviewStep = searchParams.get("builderPreviewStep");
  const isBuilderPreview = Boolean(builderPreviewToken);
  const bookingQueryStateKey = useMemo(
    () =>
      JSON.stringify({
        service: requestedServiceId ?? "",
        category: requestedCategoryId ?? "",
        step: requestedStep ?? "",
      }),
    [requestedCategoryId, requestedServiceId, requestedStep]
  );
  const detectedCustomerTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || config?.timezone || "America/Los_Angeles";
    } catch {
      return config?.timezone || "America/Los_Angeles";
    }
  }, [config?.timezone]);

  usePublicShareMeta(resolvedShareMetadata);

  useEffect(() => {
    if (!businessId) {
      setShareMetadataPayload(null);
      return;
    }

    let cancelled = false;
    const shareMetadataQuery = new URLSearchParams();
    if (isBuilderPreview) shareMetadataQuery.set("builderPreview", "1");
    const shareMetadataPath = `/api/businesses/${encodeURIComponent(businessId)}/public-booking-share-metadata${
      shareMetadataQuery.size > 0 ? `?${shareMetadataQuery.toString()}` : ""
    }`;

    fetch(
      buildApiUrl(shareMetadataPath),
      buildBuilderPreviewRequestInit(isBuilderPreview)
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as PublicShareMetadataPayload & { message?: string };
        if (!response.ok) throw new Error(payload.message || "Could not load booking share metadata.");
        return payload;
      })
      .then((payload) => {
        if (!cancelled) setShareMetadataPayload(payload);
      })
      .catch(() => {
        if (!cancelled) setShareMetadataPayload(null);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, isBuilderPreview]);

  useEffect(() => {
    if (!draftSavedAt) return;
    const interval = window.setInterval(() => {
      setSavedNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [draftSavedAt]);

  useEffect(() => {
    setForm((current) =>
      current.customerTimezone === detectedCustomerTimezone
        ? current
        : { ...current, customerTimezone: current.customerTimezone || detectedCustomerTimezone }
    );
  }, [detectedCustomerTimezone]);

  const updateBookingQuery = (updates: {
    serviceId?: string | null;
    categoryId?: string | null;
    step?: "service" | null;
  }) => {
    if (isBuilderPreview) return;
    const next = new URLSearchParams(searchParams);
    if (updates.serviceId !== undefined) {
      if (updates.serviceId) next.set("service", updates.serviceId);
      else next.delete("service");
    }
    if (updates.categoryId !== undefined) {
      if (updates.categoryId && updates.categoryId !== "all") next.set("category", updates.categoryId);
      else next.delete("category");
    }
    if (updates.step !== undefined) {
      if (updates.step) next.set("step", updates.step);
      else next.delete("step");
    }
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true, preventScrollReset: true });
  };

  const requestedBookingState = useMemo(() => {
    if (!config) {
      return {
        requestedService: "",
        requestedCategory: "",
        requestedServiceRecord: null as BookingService | null,
        initialCategory: "all",
        initialStep: 0,
      };
    }

    const requestedService =
      requestedServiceId && config.services.some((service) => service.id === requestedServiceId)
        ? requestedServiceId
        : "";
    const requestedCategory =
      requestedCategoryId &&
      config.services.some((service) => toCategoryFilterValue(service.categoryId) === requestedCategoryId)
        ? requestedCategoryId
        : "";
    const requestedServiceRecord = requestedService
      ? config.services.find((service) => service.id === requestedService) ?? null
      : null;
    const initialCategory =
      requestedCategory || (requestedServiceRecord ? toCategoryFilterValue(requestedServiceRecord.categoryId) : "all");

    return {
      requestedService,
      requestedCategory,
      requestedServiceRecord,
      initialCategory,
      initialStep: requestedService ? (requestedStep === "service" ? 0 : 1) : 0,
    };
  }, [config, requestedCategoryId, requestedServiceId, requestedStep]);

  const applyQueryState = useCallback(
    (state = requestedBookingState) => {
      if (!config) return;

      const nextCategory = state.initialCategory || "all";
      const nextExpandedServiceId =
        requestedStep === "service" && state.requestedService ? state.requestedService : "";
      const nextServiceId = state.requestedService;
      const nextServiceRecord = state.requestedServiceRecord;

      setServiceCategoryFilter((current) => (current === nextCategory ? current : nextCategory));
      setExpandedServiceId((current) => (current === nextExpandedServiceId ? current : nextExpandedServiceId));
      setCurrentStep((current) => {
        const shouldPreserveCurrentStep =
          Boolean(nextServiceId) &&
          current > 0 &&
          form.serviceId === nextServiceId &&
          requestedStep !== "service";
        const nextStep = shouldPreserveCurrentStep ? current : state.initialStep;
        return current === nextStep ? current : nextStep;
      });
      setForm((current) => {
        const serviceChanged = current.serviceId !== nextServiceId;
        const nextServiceMode =
          nextServiceRecord?.serviceMode === "mobile"
            ? "mobile"
            : nextServiceRecord?.serviceMode === "both"
              ? current.serviceMode
              : "in_shop";
        const nextLocationId =
          nextServiceRecord?.serviceMode === "mobile"
            ? ""
            : config.locations.length === 1
              ? config.locations[0].id
              : current.locationId;

        if (!nextServiceId) {
          if (
            !current.serviceId &&
            current.addonServiceIds.length === 0 &&
            !current.bookingDate &&
            !current.startTime &&
            !current.requestedTimeEnd &&
            !current.requestedTimeLabel
          ) {
            return current;
          }

          return {
            ...current,
            serviceId: "",
            addonServiceIds: [],
            bookingDate: "",
            startTime: "",
            requestedTimeEnd: "",
            requestedTimeLabel: "",
          };
        }

        if (!serviceChanged && current.serviceMode === nextServiceMode && current.locationId === nextLocationId) {
          return current;
        }

        if (!serviceChanged) {
          return {
            ...current,
            serviceId: nextServiceId,
            serviceMode: nextServiceMode,
            locationId: nextLocationId,
          };
        }

        return {
          ...current,
          serviceId: nextServiceId,
          addonServiceIds: [],
          bookingDate: "",
          startTime: "",
          requestedTimeEnd: "",
          requestedTimeLabel: "",
          flexibility: "same_day_flexible",
          serviceMode: nextServiceMode,
          locationId: nextLocationId,
        };
      });
    },
    [config, form.serviceId, requestedBookingState, requestedStep]
  );

  useEffect(() => {
    if (!businessId) {
      setConfig(null);
      setPageError("This booking page link is invalid.");
      setLoading(false);
      setDraftHydrating(false);
      return;
    }

    let cancelled = false;
    didHydrateQueryRef.current = null;
    restoredDraftRef.current = null;
    syncedQueryStateRef.current = null;
    lastServerDraftSignatureRef.current = null;
    abandonSentForTokenRef.current = null;
    setLoading(true);
    setDraftHydrating(true);
    setPageError(null);

    const configQuery = new URLSearchParams();
    if (isBuilderPreview) configQuery.set("builderPreview", "1");
    const configPath = `/api/businesses/${encodeURIComponent(businessId)}/public-booking-config${
      configQuery.size > 0 ? `?${configQuery.toString()}` : ""
    }`;

    fetch(buildApiUrl(configPath), buildBuilderPreviewRequestInit(isBuilderPreview))
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message || "This booking page is unavailable right now.");
        }
        return response.json() as Promise<BookingConfig>;
      })
      .then((payload) => {
        if (cancelled) return;
        setConfig(payload);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setPageError(
            fetchError instanceof Error ? fetchError.message : "This booking page is unavailable right now."
          );
          setDraftHydrating(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, isBuilderPreview]);

  useEffect(() => {
    if (!config || !businessId || !isBuilderPreview) return;

    const previewService =
      (builderPreviewFlow === "request"
        ? config.services.find((service) => service.effectiveFlow === "request")
        : null) ??
      requestedBookingState.requestedServiceRecord ??
      config.services[0] ??
      null;
    const previewCategory = previewService ? toCategoryFilterValue(previewService.categoryId) : "all";
    const previewStepIndex =
      builderPreviewStep === "review" ? 4 : builderPreviewStep === "schedule" ? 2 : previewService ? 1 : 0;
    const previewDate = previewService
      ? toDateInputValue(Math.max(Math.ceil((previewService.leadTimeHours ?? 0) / 24), 0))
      : "";
    const previewOpenTime = previewService?.openTime ?? config.availabilityDefaults.openTime ?? null;
    const previewCloseTime = previewService?.closeTime ?? config.availabilityDefaults.closeTime ?? null;
    const previewExactSlot =
      previewDate && previewService
        ? buildRequestExactTimeOptions({
            bookingDate: previewDate,
            openTime: previewOpenTime,
            closeTime: previewCloseTime,
            durationMinutes: previewService.durationMinutes,
          })[0] ?? null
        : null;

    setServiceCategoryFilter(previewCategory);
    setExpandedServiceId("");
    setRequestTimeMode("exact");
    setForm({
      ...emptyForm(),
      serviceId: previewService?.id ?? "",
      serviceMode: previewService?.serviceMode === "mobile" ? "mobile" : "in_shop",
      locationId:
        previewService?.serviceMode === "mobile"
          ? ""
          : config.locations.length === 1
            ? config.locations[0].id
            : "",
      bookingDate: previewStepIndex >= 2 ? previewDate : "",
      startTime: previewStepIndex >= 2 ? previewExactSlot?.startTime ?? "" : "",
      requestedTimeEnd: previewStepIndex >= 2 ? previewExactSlot?.endTime ?? "" : "",
      customerTimezone:
        (() => {
          try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || config.timezone || "America/Los_Angeles";
          } catch {
            return config.timezone || "America/Los_Angeles";
          }
        })(),
      vehicleYear: previewStepIndex >= 4 ? "2022" : "",
      vehicleMake: previewStepIndex >= 4 ? "Tesla" : "",
      vehicleModel: previewStepIndex >= 4 ? "Model Y" : "",
      vehicleColor: previewStepIndex >= 4 ? "Black" : "",
      firstName: previewStepIndex >= 4 ? "Alex" : "",
      lastName: previewStepIndex >= 4 ? "Morgan" : "",
      email: previewStepIndex >= 4 ? "alex@example.com" : "",
      phone: previewStepIndex >= 4 ? "(555) 555-0188" : "",
      notes:
        previewStepIndex >= 4 ? "Please keep me posted if a nearby slot works better." : "",
    });
    setCurrentStep(previewStepIndex);
    setDraftHydrating(false);
  }, [
    businessId,
    builderPreviewFlow,
    builderPreviewStep,
    config,
    isBuilderPreview,
    requestedBookingState.requestedServiceRecord,
  ]);

  useEffect(() => {
    if (!config || !businessId || isBuilderPreview) return;
    const hydrationKey = businessId;
    if (didHydrateQueryRef.current === hydrationKey) return;

    didHydrateQueryRef.current = hydrationKey;
    syncedQueryStateRef.current = bookingQueryStateKey;
    applyQueryState();

    const finishDraftHydration = () => {
      window.setTimeout(() => {
        setDraftHydrating(false);
      }, 0);
    };

    if (restoredDraftRef.current === hydrationKey || typeof window === "undefined") {
      finishDraftHydration();
      return;
    }

    restoredDraftRef.current = hydrationKey;

    try {
      const raw = window.localStorage.getItem(buildDraftStorageKey(hydrationKey));
      if (raw) {
        const snapshot = JSON.parse(raw) as DraftSnapshot;
        const canRestoreSnapshot =
          snapshot?.form &&
          (!requestedBookingState.requestedService ||
            !snapshot.form.serviceId ||
            snapshot.form.serviceId === requestedBookingState.requestedService);

        if (snapshot?.form && canRestoreSnapshot) {
          const applyDraft = (draft: BookingDraftResponse, options?: { announceResume?: boolean }) => {
            const restoredService = draft.form.serviceId
              ? config.services.find((service) => service.id === draft.form.serviceId)
              : null;
            const nextCategory =
              draft.serviceCategoryFilter ||
              (restoredService ? toCategoryFilterValue(restoredService.categoryId) : "all");

            setForm({
              ...emptyForm(),
              ...draft.form,
              locationId:
                draft.form.locationId ||
                (config.locations.length === 1 && draft.form.serviceMode !== "mobile"
                  ? config.locations[0].id
                  : draft.form.locationId),
            });
            setServiceCategoryFilter(nextCategory);
            setExpandedServiceId(draft.expandedServiceId || "");
            setCurrentStep(Math.max(0, Math.min(draft.currentStep ?? 0, 4)));
            setDraftResumeToken(draft.resumeToken ?? null);
            setDraftServerId(draft.draftId ?? null);
            setDraftLifecycleStatus(draft.status ?? null);
            setDraftStatus("saved");
            setDraftSavedAt(draft.savedAt ?? null);
            setSavedNow(Date.now());
            lastServerDraftSignatureRef.current = buildServerDraftSignature({
              form: {
                ...emptyForm(),
                ...draft.form,
              },
              currentStep: Math.max(0, Math.min(draft.currentStep ?? 0, 4)),
              serviceCategoryFilter: nextCategory,
              expandedServiceId: draft.expandedServiceId || "",
              source,
              campaign,
            });

            if (options?.announceResume) {
              trackEvent("booking_draft_resumed", {
                business_id: hydrationKey,
                status: draft.status,
              });
            }
          };

          const localDraft: BookingDraftResponse = {
            draftId: snapshot.draftId ?? "",
            resumeToken: snapshot.resumeToken ?? "",
            status: snapshot.serverStatus ?? "anonymous_draft",
            savedAt: snapshot.serverSavedAt ?? snapshot.savedAt,
            currentStep: snapshot.currentStep ?? 0,
            serviceCategoryFilter: snapshot.serviceCategoryFilter || "all",
            expandedServiceId: snapshot.expandedServiceId || "",
            form: {
              ...emptyForm(),
              ...snapshot.form,
            },
          };

          if (
            hasLocalDraftProgress({
              form: localDraft.form,
              currentStep: localDraft.currentStep,
              serviceCategoryFilter: localDraft.serviceCategoryFilter,
              expandedServiceId: localDraft.expandedServiceId,
            })
          ) {
            applyDraft(localDraft);
          }

          if (snapshot.resumeToken) {
            fetch(
              buildApiUrl(
                `/api/businesses/${encodeURIComponent(hydrationKey)}/public-booking-drafts/${encodeURIComponent(
                  snapshot.resumeToken
                )}`
              )
            )
              .then(async (response) => {
                if (!response.ok) return null;
                const payload = (await response.json().catch(() => null)) as
                  | { draft?: BookingDraftResponse }
                  | null;
                return payload?.draft ?? null;
              })
              .then((serverDraft) => {
                if (!serverDraft) return;
                applyDraft(serverDraft, { announceResume: true });
              })
              .catch(() => {
                // local draft remains the fallback
              });
          }
        }
      }
    } catch {
      // ignore invalid local draft state
    } finally {
      finishDraftHydration();
    }
  }, [
    applyQueryState,
    bookingQueryStateKey,
    businessId,
    campaign,
    config,
    isBuilderPreview,
    requestedBookingState,
    source,
  ]);

  useEffect(() => {
    if (!config || !businessId || isBuilderPreview) return;
    if (didHydrateQueryRef.current !== businessId) return;
    if (draftHydrating) return;
    if (syncedQueryStateRef.current === bookingQueryStateKey) return;

    if (form.serviceId !== requestedBookingState.requestedService) {
      setRequestTimeMode("exact");
      setSubmittedForm(null);
      setSubmittedService(null);
      setResult(null);
    }

    applyQueryState();
    syncedQueryStateRef.current = bookingQueryStateKey;
  }, [
    applyQueryState,
    bookingQueryStateKey,
    businessId,
    config,
    draftHydrating,
    form.serviceId,
    isBuilderPreview,
    requestedBookingState,
  ]);

  const selectedService = useMemo(
    () => config?.services.find((service) => service.id === form.serviceId) ?? null,
    [config?.services, form.serviceId]
  );
  const selectedAddons = useMemo(
    () => selectedService?.addons.filter((addon) => form.addonServiceIds.includes(addon.id)) ?? [],
    [form.addonServiceIds, selectedService]
  );
  const effectiveFlow = selectedService?.effectiveFlow ?? config?.defaultFlow ?? "request";
  const effectiveRequestSettings = useMemo(
    () =>
      resolveEffectiveBookingRequestSettings({
        business:
          config?.requestSettings ?? {
            requireExactTime: false,
            allowTimeWindows: true,
            allowFlexibility: true,
            allowAlternateSlots: true,
            alternateSlotLimit: 3,
            alternateOfferExpiryHours: 48,
            confirmationCopy: null,
            ownerResponsePageCopy: null,
            alternateAcceptanceCopy: null,
            chooseAnotherDayCopy: null,
          },
        service: selectedService?.requestPolicy ?? null,
      }),
    [config?.requestSettings, selectedService?.requestPolicy]
  );
  const requestAllowsWindowMode =
    effectiveFlow === "request" &&
    !effectiveRequestSettings.requireExactTime &&
    effectiveRequestSettings.allowTimeWindows;
  const requestUsesExactTimeOnly = effectiveFlow === "request" && !requestAllowsWindowMode;
  const steps = useMemo(() => stepDefinitions(effectiveFlow), [effectiveFlow]);
  const activeStep = steps[currentStep] ?? steps[0];
  const confirmationForm = result ? submittedForm ?? form : form;
  const confirmationService = result ? submittedService ?? selectedService : selectedService;

  const selectedServiceMode = selectedService?.serviceMode ?? null;
  const requiresLocationChoice =
    selectedServiceMode === "in_shop" && (config?.locations.length ?? 0) > 1;
  const requiresServiceModeChoice = selectedServiceMode === "both";
  const isMobileService = selectedServiceMode === "mobile" || form.serviceMode === "mobile";

  useEffect(() => {
    if (effectiveFlow !== "request") {
      setRequestTimeMode("exact");
      return;
    }
    if (requestUsesExactTimeOnly) {
      setRequestTimeMode("exact");
      return;
    }
    if (form.startTime) {
      setRequestTimeMode("exact");
      return;
    }
    if (form.requestedTimeLabel) {
      setRequestTimeMode("window");
    }
  }, [effectiveFlow, form.requestedTimeLabel, form.startTime, requestUsesExactTimeOnly]);

  useEffect(() => {
    if (effectiveFlow !== "request") return;
    if (effectiveRequestSettings.allowFlexibility) return;
    if (form.flexibility === "same_day_flexible") return;
    setForm((current) => ({ ...current, flexibility: "same_day_flexible" }));
  }, [effectiveFlow, effectiveRequestSettings.allowFlexibility, form.flexibility]);

  useEffect(() => {
    if (currentStep >= steps.length) setCurrentStep(Math.max(steps.length - 1, 0));
  }, [currentStep, steps.length]);

  const subtotal = useMemo(
    () => (selectedService?.price ?? 0) + selectedAddons.reduce((sum, addon) => sum + addon.price, 0),
    [selectedAddons, selectedService]
  );
  const totalDuration = useMemo(
    () =>
      (selectedService?.durationMinutes ?? 0) +
      selectedAddons.reduce((sum, addon) => sum + addon.durationMinutes, 0),
    [selectedAddons, selectedService]
  );
  const totalDeposit = useMemo(
    () =>
      (selectedService?.depositAmount ?? 0) +
      selectedAddons.reduce((sum, addon) => sum + addon.depositAmount, 0),
    [selectedAddons, selectedService]
  );
  const totalBufferMinutes = useMemo(
    () =>
      Math.max(selectedService?.bufferMinutes ?? 0, ...selectedAddons.map((addon) => addon.bufferMinutes ?? 0)),
    [selectedAddons, selectedService]
  );
  const canShowSelectedPrice = Boolean(
    config?.showPrices &&
      selectedService?.showPrice !== false &&
      selectedAddons.every((addon) => addon.showPrice !== false)
  );
  const canShowSelectedDuration = Boolean(
    config?.showDurations &&
      selectedService?.showDuration !== false &&
      selectedAddons.every((addon) => addon.showDuration !== false)
  );
  const minBookingDate = useMemo(
    () => toDateInputValue(Math.max(Math.ceil((selectedService?.leadTimeHours ?? 0) / 24), 0)),
    [selectedService?.leadTimeHours]
  );
  const maxBookingDate = useMemo(
    () =>
      toDateInputValue(
        Math.max(
          (selectedService?.bookingWindowDays ?? 30) +
            Math.ceil((selectedService?.leadTimeHours ?? 0) / 24) -
            1,
          0
        )
      ),
    [selectedService?.bookingWindowDays, selectedService?.leadTimeHours]
  );
  const effectiveAvailabilityDayIndexes = useMemo(
    () => selectedService?.availableDayIndexes ?? config?.availabilityDefaults?.dayIndexes ?? null,
    [config?.availabilityDefaults?.dayIndexes, selectedService?.availableDayIndexes]
  );
  const businessDailyHours = useMemo(
    () =>
      selectedService?.openTime || selectedService?.closeTime
        ? []
        : config?.availabilityDefaults?.dailyHours ?? [],
    [config?.availabilityDefaults?.dailyHours, selectedService?.closeTime, selectedService?.openTime]
  );
  const businessBlackoutDates = useMemo(
    () => config?.availabilityDefaults?.blackoutDates ?? [],
    [config?.availabilityDefaults?.blackoutDates]
  );
  const selectedDayAvailabilityWindow = useMemo(
    () =>
      resolveAvailabilityWindowForDate({
        date: form.bookingDate,
        dailyHours: businessDailyHours,
        fallbackOpenTime: config?.availabilityDefaults?.openTime ?? null,
        fallbackCloseTime: config?.availabilityDefaults?.closeTime ?? null,
      }),
    [
      businessDailyHours,
      config?.availabilityDefaults?.closeTime,
      config?.availabilityDefaults?.openTime,
      form.bookingDate,
    ]
  );
  const effectiveOpenTime =
    selectedService?.openTime ?? selectedDayAvailabilityWindow.openTime ?? config?.availabilityDefaults?.openTime ?? null;
  const effectiveCloseTime =
    selectedService?.closeTime ?? selectedDayAvailabilityWindow.closeTime ?? config?.availabilityDefaults?.closeTime ?? null;
  const availabilityWindowLabel = useMemo(
    () => formatAvailabilityWindow(effectiveAvailabilityDayIndexes, effectiveOpenTime, effectiveCloseTime),
    [effectiveAvailabilityDayIndexes, effectiveOpenTime, effectiveCloseTime]
  );
  const suggestedBookingDates = useMemo(
    () =>
      buildSuggestedBookingDates({
        minDate: minBookingDate,
        maxDate: maxBookingDate,
        allowedDayIndexes: effectiveAvailabilityDayIndexes,
        dailyHours: businessDailyHours,
        blackoutDates: businessBlackoutDates,
        selectedDate: form.bookingDate,
        limit: 8,
      }),
    [businessBlackoutDates, businessDailyHours, effectiveAvailabilityDayIndexes, form.bookingDate, maxBookingDate, minBookingDate]
  );
  const defaultBookingDate = suggestedBookingDates[0] ?? minBookingDate;
  const selectedScheduleDate =
    effectiveFlow === "self_book" ? form.bookingDate || defaultBookingDate : form.bookingDate;
  const requestExactTimeOptions = useMemo(
    () =>
      buildRequestExactTimeOptions({
        bookingDate: form.bookingDate,
        openTime: effectiveOpenTime,
        closeTime: effectiveCloseTime,
        durationMinutes: totalDuration,
      }),
    [effectiveCloseTime, effectiveOpenTime, form.bookingDate, totalDuration]
  );
  const requestWindowOptions = useMemo(
    () =>
      buildRequestWindowOptions({
        openTime: effectiveOpenTime,
        closeTime: effectiveCloseTime,
      }),
    [effectiveCloseTime, effectiveOpenTime]
  );

  useEffect(() => {
    if (!selectedService) {
      setAvailability(null);
      setAvailabilityError(null);
      return;
    }

    if (selectedService.effectiveFlow !== "self_book") {
      setAvailability({
        effectiveFlow: "request",
        timezone: config?.timezone ?? "America/Los_Angeles",
        date: form.bookingDate || "",
        slots: [],
        durationMinutes: totalDuration,
        subtotal,
        depositAmount: totalDeposit,
      });
      setAvailabilityError(null);
      return;
    }

    const date = form.bookingDate || defaultBookingDate;
    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityError(null);

    const query = new URLSearchParams({
      serviceId: selectedService.id,
      date,
      ...(form.serviceMode ? { serviceMode: form.serviceMode } : {}),
      ...(form.serviceMode === "in_shop" && form.locationId ? { locationId: form.locationId } : {}),
      ...(form.addonServiceIds.length > 0 ? { addonServiceIds: form.addonServiceIds.join(",") } : {}),
    });
    if (isBuilderPreview) {
      query.set("builderPreview", "1");
    }

    fetch(
      buildApiUrl(
        `/api/businesses/${encodeURIComponent(businessId ?? "")}/public-booking-availability?${query.toString()}`
      ),
      buildBuilderPreviewRequestInit(isBuilderPreview)
    )
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message || "Could not load availability.");
        }
        return response.json() as Promise<BookingAvailability>;
      })
      .then((payload) => {
        if (cancelled) return;
        setAvailability(payload);
        setForm((current) => ({
          ...current,
          bookingDate: date,
          startTime: payload.slots.some((slot) => slot.startTime === current.startTime) ? current.startTime : "",
        }));
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setAvailability(null);
          setAvailabilityError(
            fetchError instanceof Error ? fetchError.message : "Could not load availability."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    businessId,
    config?.timezone,
    form.addonServiceIds,
    form.bookingDate,
    form.locationId,
    form.serviceMode,
    defaultBookingDate,
    isBuilderPreview,
    selectedService,
    subtotal,
    totalDeposit,
    totalDuration,
  ]);

  useEffect(() => {
    if (!businessId || loading || draftHydrating || result || isBuilderPreview) return;
    if (typeof window === "undefined") return;

    const storageKey = buildDraftStorageKey(businessId);
    if (
      !hasLocalDraftProgress({
        form,
        currentStep,
        serviceCategoryFilter,
        expandedServiceId,
      })
    ) {
      window.localStorage.removeItem(storageKey);
      setDraftStatus("idle");
      setDraftSavedAt(null);
      setDraftResumeToken(null);
      setDraftServerId(null);
      setDraftLifecycleStatus(null);
      lastServerDraftSignatureRef.current = null;
      return;
    }

    setDraftStatus("saving");
    const timeout = window.setTimeout(() => {
      try {
        const snapshot: DraftSnapshot = {
          currentStep,
          serviceCategoryFilter,
          expandedServiceId,
          form,
          savedAt: new Date().toISOString(),
          draftId: draftServerId,
          resumeToken: draftResumeToken,
          serverStatus: draftLifecycleStatus,
          serverSavedAt: draftSavedAt,
        };
        window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
        setDraftSavedAt(snapshot.savedAt);
        setSavedNow(Date.now());
        setDraftStatus("saved");
      } catch {
        setDraftStatus("idle");
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    businessId,
    currentStep,
    draftLifecycleStatus,
    draftHydrating,
    draftResumeToken,
    draftSavedAt,
    draftServerId,
    expandedServiceId,
    form,
    isBuilderPreview,
    loading,
    result,
    serviceCategoryFilter,
  ]);

  useEffect(() => {
    if (!businessId || !config || loading || draftHydrating || result || isBuilderPreview) return;
    if (!selectedService || !hasMeaningfulServerDraft(form)) return;

    const signature = buildServerDraftSignature({
      form,
      currentStep,
      serviceCategoryFilter,
      expandedServiceId,
      source,
      campaign,
    });
    if (signature === lastServerDraftSignatureRef.current) return;

    setDraftStatus("saving");
    const timeout = window.setTimeout(() => {
      fetch(buildApiUrl(`/api/businesses/${encodeURIComponent(businessId)}/public-booking-drafts`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeToken: draftResumeToken || undefined,
          serviceId: form.serviceId,
          addonServiceIds: form.addonServiceIds,
          serviceMode: form.serviceMode,
          locationId: form.locationId || undefined,
          bookingDate: form.bookingDate || undefined,
          startTime: form.startTime || undefined,
          requestedTimeEnd: form.requestedTimeEnd || undefined,
          requestedTimeLabel: form.requestedTimeLabel || undefined,
          flexibility: form.flexibility,
          customerTimezone: form.customerTimezone || detectedCustomerTimezone,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          vehicleYear: form.vehicleYear ? Number(form.vehicleYear) : undefined,
          vehicleMake: form.vehicleMake,
          vehicleModel: form.vehicleModel,
          vehicleColor: form.vehicleColor,
          serviceAddress: form.serviceAddress,
          serviceCity: form.serviceCity,
          serviceState: form.serviceState,
          serviceZip: form.serviceZip,
          notes: form.notes,
          marketingOptIn: form.marketingOptIn,
          source,
          campaign,
          currentStep,
          serviceCategoryFilter,
          expandedServiceId,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as
            | {
                accepted?: boolean;
                created?: boolean;
                unchanged?: boolean;
                draft?: BookingDraftResponse;
                localOnly?: boolean;
              }
            | null;
          if (!payload?.accepted || !payload.draft) {
            setDraftStatus("saved");
            return;
          }

          setDraftResumeToken(payload.draft.resumeToken);
          setDraftServerId(payload.draft.draftId);
          setDraftLifecycleStatus(payload.draft.status);
          setDraftSavedAt(payload.draft.savedAt);
          setSavedNow(Date.now());
          setDraftStatus("saved");
          lastServerDraftSignatureRef.current = signature;
          abandonSentForTokenRef.current = null;

          if (payload.created) {
            trackEvent("booking_draft_created", {
              business_id: businessId,
              status: payload.draft.status,
              flow: effectiveFlow,
            });
          } else if (!payload.unchanged) {
            trackEvent("booking_draft_updated", {
              business_id: businessId,
              status: payload.draft.status,
              flow: effectiveFlow,
            });
          }
        })
        .catch(() => {
          setDraftStatus("saved");
        });
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [
    businessId,
    campaign,
    config,
    currentStep,
    detectedCustomerTimezone,
    draftResumeToken,
    draftHydrating,
    effectiveFlow,
    expandedServiceId,
    form,
    isBuilderPreview,
    loading,
    result,
    selectedService,
    serviceCategoryFilter,
    source,
  ]);

  useEffect(() => {
    if (!businessId || !draftResumeToken || result || isBuilderPreview) return;
    if (typeof window === "undefined") return;

    const hasProgress = hasLocalDraftProgress({
      form,
      currentStep,
      serviceCategoryFilter,
      expandedServiceId,
    });
    if (!hasProgress) return;

    const handlePageHide = () => {
      if (!draftResumeToken || abandonSentForTokenRef.current === draftResumeToken) return;
      abandonSentForTokenRef.current = draftResumeToken;
      trackEvent("booking_draft_abandoned", {
        business_id: businessId,
        status: draftLifecycleStatus ?? "anonymous_draft",
        step: currentStep + 1,
      });
      const url = buildApiUrl(
        `/api/businesses/${encodeURIComponent(businessId)}/public-booking-drafts/${encodeURIComponent(
          draftResumeToken
        )}/abandon`
      );
      const payload = new Blob(["{}"], { type: "application/json" });
      const sent = typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
        ? navigator.sendBeacon(url, payload)
        : false;
      if (!sent) {
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          keepalive: true,
        }).catch(() => undefined);
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [
    businessId,
    currentStep,
    draftLifecycleStatus,
    draftResumeToken,
    expandedServiceId,
    form,
    isBuilderPreview,
    result,
    serviceCategoryFilter,
  ]);

  const categoryOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string; count: number }>();
    const services = config?.services ?? [];
    options.set("all", { value: "all", label: "All services", count: services.length });
    for (const service of services) {
      const value = toCategoryFilterValue(service.categoryId);
      const existing = options.get(value);
      if (existing) existing.count += 1;
      else options.set(value, { value, label: service.categoryLabel ?? "Popular services", count: 1 });
    }
    return [...options.values()];
  }, [config?.services]);
  const selectedCategoryOption = useMemo(
    () => categoryOptions.find((option) => option.value === serviceCategoryFilter) ?? categoryOptions[0] ?? null,
    [categoryOptions, serviceCategoryFilter]
  );
  const mobileCategoryUsesSheet = categoryOptions.length > 5;
  const mobileQuickCategoryOptions = useMemo(() => {
    if (!mobileCategoryUsesSheet) return categoryOptions;
    const quickOptions = categoryOptions.slice(0, 4);
    if (!selectedCategoryOption) return quickOptions;
    if (quickOptions.some((option) => option.value === selectedCategoryOption.value)) return quickOptions;
    return [...quickOptions.slice(0, 3), selectedCategoryOption];
  }, [categoryOptions, mobileCategoryUsesSheet, selectedCategoryOption]);

  const visibleServices = useMemo(() => {
    return (config?.services ?? []).filter((service) =>
      serviceCategoryFilter === "all" ? true : toCategoryFilterValue(service.categoryId) === serviceCategoryFilter
    );
  }, [config?.services, serviceCategoryFilter]);

  const featuredServices = useMemo(
    () => visibleServices.filter((service) => service.featured),
    [visibleServices]
  );

  const groupedServices = useMemo(() => {
    const groups = new Map<string, { title: string; services: BookingService[] }>();
    for (const service of visibleServices.filter((entry) => !entry.featured)) {
      const key = service.categoryId ?? "__uncategorized__";
      const title = service.categoryLabel ?? "Popular services";
      const group = groups.get(key);
      if (group) group.services.push(service);
      else groups.set(key, { title, services: [service] });
    }
    return [...groups.entries()].map(([id, value]) => ({ id, ...value }));
  }, [visibleServices]);

  const selectedLocation = useMemo(
    () => config?.locations.find((location) => location.id === form.locationId) ?? null,
    [config?.locations, form.locationId]
  );

  useEffect(() => {
    if (activeStep.key !== "service") setMobileCategorySheetOpen(false);
  }, [activeStep.key]);

  const bookingBrandTheme = useMemo(
    () => resolveBookingBrandTheme(config?.branding),
    [config?.branding]
  );
  const selectedTimeLabel =
    availability?.slots.find((slot) => slot.startTime === form.startTime)?.label ??
    result?.scheduledFor ??
    null;
  const requestTimingSummary = buildRequestTimingSummary({
    bookingDate: confirmationForm.bookingDate,
    startTime: confirmationForm.startTime,
    requestedTimeEnd: confirmationForm.requestedTimeEnd,
    requestedTimeLabel: confirmationForm.requestedTimeLabel,
    timeZone: confirmationForm.customerTimezone || detectedCustomerTimezone,
  });
  const requestFlexibilityLabel =
    REQUEST_FLEXIBILITY_OPTIONS.find((option) => option.value === confirmationForm.flexibility)?.label ?? null;
  const vehicleReviewSummary = [confirmationForm.vehicleYear, confirmationForm.vehicleMake, confirmationForm.vehicleModel]
    .filter(Boolean)
    .join(" ");
  const contactReviewSummary = [confirmationForm.firstName, confirmationForm.lastName].filter(Boolean).join(" ").trim();
  const relativeDraftStatusLabel = formatSavedAgo(draftSavedAt, savedNow);
  const stepProgress = steps.length > 0 ? Math.round(((currentStep + 1) / steps.length) * 100) : 0;
  const nextStepMessage =
    effectiveFlow === "self_book"
      ? "Choose a live slot, confirm the details, and get the confirmation right away."
      : effectiveRequestSettings.reviewMessage ||
        "Send the request and the shop can confirm the best next step with you.";
  const summaryPromise =
    effectiveFlow === "self_book"
      ? "Confirmation is sent right after booking, with a customer portal link."
      : "The shop reviews the request with the full service, vehicle, and requested timing context.";
  const serviceModeLabel =
    selectedService?.serviceMode === "mobile"
      ? "Mobile / on-site"
      : selectedService?.serviceMode === "both"
        ? "Mobile or in-shop"
        : "In-shop";

  const moveToStep = (index: number, options?: { serviceId?: string; categoryId?: string }) => {
    setStepError(null);
    setSubmitError(null);
    const nextIndex = Math.min(Math.max(index, 0), steps.length - 1);
    setCurrentStep(nextIndex);
    const queryServiceId = options?.serviceId ?? form.serviceId;
    const queryCategoryId = options?.categoryId ?? serviceCategoryFilter;
    if (queryServiceId) {
      updateBookingQuery({
        serviceId: queryServiceId,
        categoryId: queryCategoryId,
        step: nextIndex === 0 ? "service" : null,
      });
    }
  };

  const handleCategoryChange = (value: string) => {
    setServiceCategoryFilter(value);
    setMobileCategorySheetOpen(false);
    setExpandedServiceId((current) => {
      if (!current || value === "all") return current;
      const expandedService = config?.services.find((entry) => entry.id === current) ?? null;
      return expandedService && toCategoryFilterValue(expandedService.categoryId) === value ? current : "";
    });
    updateBookingQuery({ categoryId: value, step: activeStep?.key === "service" ? "service" : null });
  };

  const openServiceSelection = (serviceId: string) => {
    const service = config?.services.find((entry) => entry.id === serviceId) ?? null;
    const nextCategory = service ? toCategoryFilterValue(service.categoryId) : serviceCategoryFilter;
    setServiceCategoryFilter(nextCategory);
    setExpandedServiceId(serviceId);
    moveToStep(0, { serviceId, categoryId: nextCategory });
  };

  const toggleServiceExpansion = (serviceId: string) => {
    setExpandedServiceId((current) => {
      const next = current === serviceId ? "" : serviceId;
      if (next) {
        trackEvent("booking_service_details_opened", {
          business_id: businessId ?? "",
          service_id: serviceId,
        });
      }
      return next;
    });
  };

  const handleServiceSelect = (serviceId: string) => {
    const service = config?.services.find((entry) => entry.id === serviceId) ?? null;
    const nextCategory = service ? toCategoryFilterValue(service.categoryId) : serviceCategoryFilter;
    const selectingSameService = form.serviceId === serviceId;
    setServiceCategoryFilter(nextCategory);
    setExpandedServiceId("");
    if (!selectingSameService) {
      setRequestTimeMode("exact");
      setSubmittedForm(null);
      setSubmittedService(null);
      setResult(null);
      trackEvent("booking_service_selected", {
        business_id: businessId ?? "",
        service_id: serviceId,
        flow: service?.effectiveFlow ?? config?.defaultFlow ?? "request",
      });
    }
    const nextServiceMode =
      service?.serviceMode === "mobile"
        ? "mobile"
        : service?.serviceMode === "both"
          ? form.serviceMode
          : "in_shop";
    const nextLocationId =
      service?.serviceMode === "mobile"
        ? ""
        : config?.locations.length === 1
          ? config.locations[0].id
          : form.locationId;
    setForm((current) =>
      selectingSameService
        ? {
            ...current,
            serviceId,
            serviceMode: nextServiceMode,
            locationId: nextLocationId,
          }
        : {
            ...current,
            serviceId,
            addonServiceIds: [],
            startTime: "",
            requestedTimeEnd: "",
            requestedTimeLabel: "",
            flexibility: "same_day_flexible",
            bookingDate: "",
            serviceMode: nextServiceMode,
            locationId: nextLocationId,
          }
    );
    moveToStep(1, { serviceId, categoryId: nextCategory });
  };

  const toggleAddon = (addonId: string) =>
    setForm((current) => ({
      ...current,
      addonServiceIds: current.addonServiceIds.includes(addonId)
        ? current.addonServiceIds.filter((id) => id !== addonId)
        : [...current.addonServiceIds, addonId],
    }));

  const validateStep = (step: StepKey) => {
    if (!config) return "This booking page is still loading.";
    if (step === "service") return selectedService ? null : "Choose a service to continue.";
    if (step === "vehicle") {
      if (!config.requireVehicle) return null;
      return form.vehicleMake.trim() && form.vehicleModel.trim()
        ? null
        : "Add the vehicle make and model so the shop knows what this job is for.";
    }
    if (step === "schedule") {
      if (requiresServiceModeChoice && !form.serviceMode) {
        return "Choose whether this visit is in-shop or mobile.";
      }
      if (isMobileService && !form.serviceAddress.trim()) {
        return "Add the service address so the team knows where to go.";
      }
      if (form.serviceMode === "in_shop" && requiresLocationChoice && !form.locationId) {
        return "Choose the location for this visit.";
      }
      if (effectiveFlow === "self_book") {
        if (!form.bookingDate) return "Choose a preferred date to see available times.";
        return form.startTime ? null : "Choose a time to continue.";
      }
      if (!form.bookingDate) {
        return "Choose the day you want so the shop can review a real request.";
      }
      if (requestUsesExactTimeOnly) {
        if (!form.startTime) {
          return "Choose the exact time you want the shop to review.";
        }
        return null;
      }
      if (!form.startTime && !form.requestedTimeLabel.trim()) {
        return "Choose an exact time or a time window so the shop knows what to review.";
      }
      return null;
    }
    if (step === "contact") {
      if (!form.firstName.trim() || !form.lastName.trim()) {
        return "Add your first and last name so the shop knows who this request is for.";
      }
      if (config.requireEmail && !form.email.trim()) {
        return "Add an email address so the shop can confirm the booking.";
      }
      if (config.requirePhone && !form.phone.trim()) {
        return "Add the best phone number for follow-up.";
      }
      return form.email.trim() || form.phone.trim()
        ? null
        : "Add at least an email or phone number so the shop can follow up.";
    }
    return null;
  };

  const handleNext = () => {
    const validationMessage = validateStep(activeStep.key);
    if (validationMessage) {
      setStepError(validationMessage);
      return;
    }
    moveToStep(currentStep + 1);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessId || !selectedService) return;
    if (isBuilderPreview) {
      setSubmitError("This preview is read-only. Save changes and open the live booking link to test the real flow.");
      return;
    }

    const validationMessage = validateStep("contact");
    if (validationMessage) {
      setStepError(validationMessage);
      const contactStepIndex = steps.findIndex((step) => step.key === "contact");
      if (contactStepIndex >= 0) setCurrentStep(contactStepIndex);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setStepError(null);

    try {
      const submitPayload = {
        ...form,
        serviceId: selectedService.id,
        addonServiceIds: form.addonServiceIds,
        draftResumeToken: draftResumeToken || undefined,
        source,
        campaign,
        startTime:
          effectiveFlow === "self_book" || requestUsesExactTimeOnly || requestTimeMode === "exact"
            ? form.startTime || undefined
            : undefined,
        requestedTimeEnd:
          effectiveFlow === "request" && (requestUsesExactTimeOnly || requestTimeMode === "exact")
            ? form.requestedTimeEnd || undefined
            : undefined,
        requestedTimeLabel:
          effectiveFlow === "request" && !requestUsesExactTimeOnly && requestTimeMode === "window"
            ? form.requestedTimeLabel || undefined
            : undefined,
        flexibility:
          effectiveFlow === "request"
            ? effectiveRequestSettings.allowFlexibility
              ? form.flexibility
              : "same_day_flexible"
            : undefined,
        customerTimezone: form.customerTimezone || detectedCustomerTimezone,
        vehicleYear: form.vehicleYear ? Number(form.vehicleYear) : undefined,
        locationId: form.locationId || undefined,
      };
      const response = await fetch(
        buildApiUrl(`/api/businesses/${encodeURIComponent(businessId)}/public-bookings`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(submitPayload),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as BookingSubmitResult & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Could not complete the booking.");

      if (typeof window !== "undefined" && businessId) {
        window.localStorage.removeItem(buildDraftStorageKey(businessId));
      }
      trackEvent(effectiveFlow === "self_book" ? "booking_draft_confirmed" : "booking_draft_submitted", {
        business_id: businessId,
        status: effectiveFlow === "self_book" ? "confirmed_booking" : "submitted_request",
      });
      setSubmittedForm(form);
      setSubmittedService(selectedService);
      setDraftStatus("idle");
      setDraftSavedAt(null);
      setDraftResumeToken(null);
      setDraftServerId(null);
      setDraftLifecycleStatus(null);
      lastServerDraftSignatureRef.current = null;
      abandonSentForTokenRef.current = null;
      setResult(payload);
      setForm((current) => ({
        ...emptyForm(),
        serviceId: current.serviceId,
        locationId: current.locationId,
        customerTimezone: current.customerTimezone,
      }));
      setCurrentStep(0);
    } catch (submitErrorValue) {
      setSubmitError(
        submitErrorValue instanceof Error ? submitErrorValue.message : "Could not complete the booking."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selectedServiceSummary = selectedService ? (
    <div className="rounded-[18px] border border-[var(--b)] bg-[linear-gradient(180deg,rgba(255,255,255,0.995),var(--booking-primary-soft))] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full border border-[color:var(--booking-primary-soft-border)] bg-white/90 text-[color:var(--booking-primary-ink)] shadow-sm">
              {effectiveFlow === "self_book" ? "Book instantly" : "Request review"}
            </Badge>
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90">
              {serviceModeLabel}
            </Badge>
            {totalDeposit > 0 ? (
              <Badge variant="outline" className="rounded-full border-[color:var(--booking-accent-border)] bg-[var(--booking-accent-soft)] text-[color:var(--booking-accent-ink)]">
                {formatPrice(totalDeposit)} deposit
              </Badge>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <h2 className="text-[1.35rem] font-semibold tracking-[-0.04em] text-slate-950">{selectedService.name}</h2>
            {selectedService.description ? (
              <BookingDescription
                description={selectedService.description}
                className="max-w-2xl"
                textClassName="text-[13px] leading-6 text-slate-600"
                headingClassName="text-[13px] font-semibold leading-6 text-slate-700"
                listClassName="space-y-1.5"
              />
            ) : (
              <p className="max-w-2xl text-[13px] leading-6 text-slate-600">{nextStepMessage}</p>
            )}
            {selectedService.leadTimeHours > 0 || totalBufferMinutes > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedService.leadTimeHours > 0 ? (
                  <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90">
                    {formatLeadTimeLabel(selectedService.leadTimeHours)}
                  </Badge>
                ) : null}
                {totalBufferMinutes > 0 ? (
                  <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90">
                    {totalBufferMinutes}m buffer
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {canShowSelectedPrice ? (
              <div className="rounded-[14px] border border-slate-200/85 bg-white/92 px-4 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Starting at</p>
                <p className="mt-1 text-base font-semibold text-slate-950">{formatPrice(subtotal)}</p>
              </div>
            ) : null}
            {canShowSelectedDuration ? (
              <div className="rounded-[14px] border border-slate-200/85 bg-white/92 px-4 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Estimated time</p>
                <p className="mt-1 text-base font-semibold text-slate-950">{formatDuration(totalDuration)}</p>
              </div>
            ) : null}
            <div className="rounded-[14px] border border-slate-200/85 bg-white/92 px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Next step</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{summaryPromise}</p>
            </div>
          </div>
        </div>
        {currentStep > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openServiceSelection(selectedService.id)}
            className="rounded-xl border-slate-200 bg-white/90"
          >
            Change service
          </Button>
        ) : null}
      </div>
    </div>
  ) : null;

  const renderServiceCard = (service: BookingService, featured?: boolean) => {
    const isSelected = form.serviceId === service.id;
    const isExpanded = expandedServiceId === service.id;
    const showPrice = Boolean(config?.showPrices && service.showPrice);
    const showDuration = Boolean(config?.showDurations && service.showDuration);
    const hasDescription = Boolean(service.description?.trim());
    const detailsId = `booking-service-details-${service.id}`;
    const toggleId = `booking-service-toggle-${service.id}`;

    return (
      <div
        key={service.id}
        data-service-card={service.id}
        data-selected={isSelected ? "true" : "false"}
        data-expanded={isExpanded ? "true" : "false"}
        className={cn(
          "mb-3 w-full min-w-0 max-w-full overflow-hidden rounded-[1.35rem] border bg-white/96 shadow-[0_14px_28px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none last:mb-0",
          isSelected
            ? "border-[color:var(--booking-primary-soft-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.985),var(--booking-primary-soft))] shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
            : isExpanded
              ? "border-slate-300/90 shadow-[0_18px_34px_rgba(15,23,42,0.07)]"
              : "border-slate-200/85 hover:border-slate-300 hover:shadow-[0_18px_34px_rgba(15,23,42,0.06)]"
        )}
      >
        <div className="min-w-0 flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <button
              id={toggleId}
              type="button"
              aria-expanded={isExpanded}
              aria-controls={detailsId}
              onClick={() => toggleServiceExpansion(service.id)}
              className="group flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
            >
              <div className="min-w-0 space-y-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[1.02rem] font-semibold tracking-[-0.025em] text-slate-950">{service.name}</p>
                    {isSelected ? (
                      <Badge
                        variant="secondary"
                        className="rounded-full border border-[color:var(--booking-primary-soft-border)] bg-white/90 text-[color:var(--booking-primary-ink)]"
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Selected
                      </Badge>
                    ) : null}
                    {featured ? (
                      <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-900">
                        Featured
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "rounded-full border",
                        service.effectiveFlow === "self_book"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-slate-200 bg-slate-100 text-slate-700"
                      )}
                    >
                      {service.effectiveFlow === "self_book" ? "Book instantly" : "Request review"}
                    </Badge>
                    {showPrice ? (
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90 text-slate-700">
                        {formatPrice(service.price)}
                      </Badge>
                    ) : null}
                    {showDuration ? (
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90 text-slate-700">
                        {formatDuration(service.durationMinutes)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {isExpanded ? "Hide details" : "View details"}
                </span>
              </div>
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none", isExpanded && "rotate-180")} />
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleServiceSelect(service.id)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(15,23,42,0.14)] transition-all duration-200 hover:translate-y-[-1px] hover:shadow-[0_18px_30px_rgba(15,23,42,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--booking-primary-strong)] motion-reduce:transition-none sm:min-w-[112px]",
                isSelected && "sm:min-w-[126px]"
              )}
              style={{ background: "var(--c)" }}
            >
              {isSelected ? "Continue" : "Select"}
            </button>
          </div>

          <div
            className={cn(
              "grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                id={detailsId}
                role="region"
                aria-labelledby={toggleId}
                aria-hidden={!isExpanded}
                className="space-y-3 border-t border-slate-200/80 pt-4"
              >
                {hasDescription ? (
                  <BookingDescription description={service.description!} />
                ) : (
                  <p className="text-sm leading-6 text-slate-600">
                    {service.effectiveFlow === "self_book"
                      ? "Select this service to move straight into live availability and confirm the slot."
                      : "Select this service to share the timing details the shop should review with your request."}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {service.serviceMode === "both" ? (
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90 text-slate-700">
                      Mobile or in-shop
                    </Badge>
                  ) : service.serviceMode === "mobile" ? (
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90 text-slate-700">
                      Mobile service
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90 text-slate-700">
                      In-shop visit
                    </Badge>
                  )}
                  {service.leadTimeHours > 0 ? (
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90 text-slate-700">
                      {formatLeadTimeLabel(service.leadTimeHours)}
                    </Badge>
                  ) : null}
                  {service.addons.length > 0 ? (
                    <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90 text-slate-700">
                      {service.addons.length} optional add-on{service.addons.length === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
                {service.addons.length > 0 ? (
                  <p className="text-xs leading-5 text-slate-500">
                    Optional add-ons show up after selection so the first step stays quick and easy on mobile.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStepBody = () => {
    if (!config) return null;

    if (activeStep.key === "service") {
      return (
        <div className="min-w-0 space-y-5 overflow-x-hidden">
          {categoryOptions.length > 1 ? (
            <div className="min-w-0 space-y-3 overflow-hidden">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">Choose a service</p>
                <Badge variant="outline">{visibleServices.length} available</Badge>
              </div>
              <div className="sm:hidden">
                {mobileCategoryUsesSheet ? (
                  <>
                    <div className="overflow-hidden rounded-[1.3rem] border border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.95))] p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                      <div className="min-w-0 flex flex-col gap-3">
                        <div className="min-w-0">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Category</p>
                          <p className="mt-1 truncate text-sm font-semibold tracking-[-0.02em] text-slate-950">
                            {selectedCategoryOption?.label ?? "All services"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {selectedCategoryOption
                              ? `${selectedCategoryOption.count} service${selectedCategoryOption.count === 1 ? "" : "s"} in this lane`
                              : "Browse every category without pushing the layout out of frame."}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setMobileCategorySheetOpen(true)}
                          className="h-10 w-full rounded-full border-slate-200 bg-white/90 px-3 text-xs font-semibold text-slate-700 shadow-sm"
                        >
                          <ListFilter className="mr-1.5 h-3.5 w-3.5" />
                          Browse all
                        </Button>
                      </div>
                      <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
                        {mobileQuickCategoryOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            data-category-filter={option.value}
                            onClick={() => handleCategoryChange(option.value)}
                            className={cn(
                              "min-w-0 rounded-[1rem] border px-3 py-2.5 text-left text-sm font-medium transition-all motion-reduce:transition-none",
                              serviceCategoryFilter === option.value
                                ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.14)]"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            <span className="block truncate">{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <Sheet open={mobileCategorySheetOpen} onOpenChange={setMobileCategorySheetOpen}>
                      <SheetContent side="bottom" className="rounded-t-[1.75rem] border-slate-200/90 bg-white/98 p-0">
                        <SheetHeader className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.94),rgba(255,255,255,0.98))]">
                          <SheetTitle>Browse categories</SheetTitle>
                          <SheetDescription>
                            Jump between service lanes without letting the category rail spill off screen.
                          </SheetDescription>
                        </SheetHeader>
                        <div className="grid gap-2 px-5 pb-6 pt-4">
                          {categoryOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              data-category-filter={option.value}
                              onClick={() => handleCategoryChange(option.value)}
                              className={cn(
                                "flex w-full items-center justify-between gap-3 rounded-[1.15rem] border px-4 py-3 text-left transition-all motion-reduce:transition-none",
                                serviceCategoryFilter === option.value
                                  ? "border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)] shadow-[0_12px_26px_rgba(15,23,42,0.06)]"
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                              )}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-950">{option.label}</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  {option.count} service{option.count === 1 ? "" : "s"}
                                </p>
                              </div>
                              {serviceCategoryFilter === option.value ? (
                                <Check className="h-4 w-4 shrink-0 text-[color:var(--booking-primary-strong)]" />
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </SheetContent>
                    </Sheet>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {categoryOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        data-category-filter={option.value}
                        onClick={() => handleCategoryChange(option.value)}
                        className={cn(
                          "min-w-0 rounded-[1rem] border px-3 py-3 text-left transition-all motion-reduce:transition-none",
                          serviceCategoryFilter === option.value
                            ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.14)]"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        <p className="truncate text-sm font-semibold">{option.label}</p>
                        <p
                          className={cn(
                            "mt-1 text-xs leading-5",
                            serviceCategoryFilter === option.value ? "text-white/80" : "text-slate-500"
                          )}
                        >
                          {option.count} service{option.count === 1 ? "" : "s"}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="hidden flex-wrap gap-2 sm:flex">
                {categoryOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    data-category-filter={option.value}
                    onClick={() => handleCategoryChange(option.value)}
                    className={cn(
                      "max-w-full rounded-full border px-4 py-2 text-sm font-medium transition-all motion-reduce:transition-none",
                      serviceCategoryFilter === option.value
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.12)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            data-service-step-scroll=""
            className="min-w-0 space-y-5 overflow-x-hidden"
          >
            {featuredServices.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-950">Featured services</p>
                  <Badge variant="outline">{featuredServices.length} highlighted</Badge>
                </div>
                <div>{featuredServices.map((service) => renderServiceCard(service, true))}</div>
              </div>
            ) : null}

            {visibleServices.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-slate-300 px-4 py-5 text-sm leading-6 text-slate-600">
                No services match that filter yet. Try another category to keep moving.
              </div>
            ) : null}

            {groupedServices.map((group) => (
              <div key={group.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-950">{group.title}</p>
                  <Badge variant="outline">{group.services.length} options</Badge>
                </div>
                <div>{group.services.map((service) => renderServiceCard(service))}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeStep.key === "vehicle") {
      return (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="booking-vehicle-year">Vehicle year</Label>
              <Input id="booking-vehicle-year" type="number" min="1900" max="2100" value={form.vehicleYear} onChange={(event) => setForm((current) => ({ ...current, vehicleYear: event.target.value }))} placeholder="Year" className="h-12 rounded-2xl bg-slate-50" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="booking-vehicle-make">Vehicle make{config.requireVehicle ? " *" : ""}</Label>
              <Input id="booking-vehicle-make" value={form.vehicleMake} onChange={(event) => setForm((current) => ({ ...current, vehicleMake: event.target.value }))} placeholder="Make" required={config.requireVehicle} className="h-12 rounded-2xl bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-vehicle-model">Vehicle model{config.requireVehicle ? " *" : ""}</Label>
              <Input id="booking-vehicle-model" value={form.vehicleModel} onChange={(event) => setForm((current) => ({ ...current, vehicleModel: event.target.value }))} placeholder="Model" required={config.requireVehicle} className="h-12 rounded-2xl bg-slate-50" />
            </div>
          </div>
          <StepHint icon={CarFront} text={selectedService ? `Add the vehicle for ${selectedService.name}. If you only know part of it, start with the basics and the shop can fill in the rest.` : "Add the vehicle you want serviced. If you only know part of it, start with the basics and the shop can fill in the rest."} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:max-w-[260px]">
              <Label htmlFor="booking-vehicle-color">Vehicle color</Label>
              <Input id="booking-vehicle-color" value={form.vehicleColor} onChange={(event) => setForm((current) => ({ ...current, vehicleColor: event.target.value }))} placeholder="Optional" className="h-12 rounded-2xl bg-slate-50" />
            </div>
          </div>
        </div>
      );
    }

    if (activeStep.key === "schedule") {
      return (
        <div className="space-y-5">
          {selectedServiceMode === "both" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setForm((current) => ({ ...current, serviceMode: "in_shop", startTime: "", requestedTimeEnd: "" }))} className={cn("rounded-[1.3rem] border px-4 py-4 text-left transition-all motion-reduce:transition-none", form.serviceMode === "in_shop" ? "border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)]" : "border-slate-200 bg-white hover:bg-slate-50")}>
                <p className="font-semibold text-slate-950">In-shop visit</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Bring the vehicle to the shop and keep the timing accurate.</p>
              </button>
              <button type="button" onClick={() => setForm((current) => ({ ...current, serviceMode: "mobile", locationId: "", startTime: "", requestedTimeEnd: "" }))} className={cn("rounded-[1.3rem] border px-4 py-4 text-left transition-all motion-reduce:transition-none", form.serviceMode === "mobile" ? "border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)]" : "border-slate-200 bg-white hover:bg-slate-50")}>
                <p className="font-semibold text-slate-950">Mobile / on-site</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Have the team come to you and add the service address below.</p>
              </button>
            </div>
          ) : null}

          {form.serviceMode === "in_shop" && requiresLocationChoice ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-950">Choose a location</p>
              <div className="grid gap-3">
                {config.locations.map((location) => {
                  const active = location.id === form.locationId;
                  return (
                    <button key={location.id} type="button" onClick={() => setForm((current) => ({ ...current, locationId: location.id, startTime: "", requestedTimeEnd: "" }))} className={cn("rounded-[1.3rem] border px-4 py-4 text-left transition-all motion-reduce:transition-none", active ? "border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)]" : "border-slate-200 bg-white hover:bg-slate-50")}>
                      <p className="font-semibold text-slate-950">{location.name}</p>
                      {location.address ? <p className="mt-1 text-sm leading-6 text-slate-600">{location.address}</p> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {isMobileService ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="booking-service-address">Service address</Label>
                <Input id="booking-service-address" value={form.serviceAddress} onChange={(event) => setForm((current) => ({ ...current, serviceAddress: event.target.value }))} placeholder="123 Main St" className="h-12 rounded-2xl bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-service-city">City</Label>
                <Input id="booking-service-city" value={form.serviceCity} onChange={(event) => setForm((current) => ({ ...current, serviceCity: event.target.value }))} placeholder="Irvine" className="h-12 rounded-2xl bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-service-state">State</Label>
                <Input id="booking-service-state" value={form.serviceState} onChange={(event) => setForm((current) => ({ ...current, serviceState: event.target.value }))} placeholder="CA" className="h-12 rounded-2xl bg-slate-50" />
              </div>
              <div className="space-y-2 sm:max-w-[220px]">
                <Label htmlFor="booking-service-zip">ZIP</Label>
                <Input id="booking-service-zip" value={form.serviceZip} onChange={(event) => setForm((current) => ({ ...current, serviceZip: event.target.value }))} placeholder="92618" className="h-12 rounded-2xl bg-slate-50" />
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-950">
                  {effectiveFlow === "self_book" ? "Choose a day and time" : "Choose a preferred day and time"}
                </p>
                <p className="text-xs text-slate-500">
                  {availabilityWindowLabel}
                </p>
              </div>
              {effectiveFlow === "self_book" && availability?.slots.length ? <Badge variant="outline">{availability.slots.length} times</Badge> : null}
            </div>
            <div className="space-y-3">
              <Label htmlFor="booking-date">
                {effectiveFlow === "self_book" ? "Preferred date" : "Preferred date *"}
              </Label>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
                {suggestedBookingDates.map((dateValue) => {
                  const isActive = selectedScheduleDate === dateValue;
                  const formattedDate = formatBookingDatePill(dateValue);
                  return (
                    <button
                      key={dateValue}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          bookingDate: dateValue,
                          startTime: "",
                          requestedTimeEnd: "",
                        }))
                      }
                      className={cn(
                        "rounded-[18px] border px-2.5 py-3 text-left transition-all motion-reduce:transition-none",
                        isActive
                          ? "border-[color:var(--booking-primary)] bg-[var(--booking-primary-soft)] shadow-[0_10px_22px_rgba(15,23,42,0.06)]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {formattedDate.month}
                      </p>
                      <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-slate-950">
                        {formattedDate.dayNumber}
                      </p>
                      <p className="text-[11px] text-slate-500">{formattedDate.weekday}</p>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:max-w-sm">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Need another day?</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 justify-between rounded-2xl border-slate-200 bg-white px-4 text-left font-medium text-slate-950 shadow-none"
                    >
                      <span className="flex items-center gap-2 overflow-hidden">
                        <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="truncate">
                          {formatCalendarTriggerLabel(
                            selectedScheduleDate || (effectiveFlow === "self_book" ? defaultBookingDate : "")
                          )}
                        </span>
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Calendar
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[min(92vw,22rem)] rounded-[20px] border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.14)]"
                    align="center"
                    sideOffset={8}
                  >
                    <Calendar
                      mode="single"
                      selected={parseDateValue(selectedScheduleDate || (effectiveFlow === "self_book" ? defaultBookingDate : ""))}
                      onSelect={(date) => {
                        if (!date) return;
                        const nextValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                        setForm((current) => ({
                          ...current,
                          bookingDate: nextValue,
                          startTime: "",
                          requestedTimeEnd: "",
                        }));
                      }}
                      defaultMonth={parseDateValue(form.bookingDate || defaultBookingDate)}
                      disabled={(date) => {
                        const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                        if (dateValue < minBookingDate || dateValue > maxBookingDate) return true;
                        if (effectiveAvailabilityDayIndexes?.length && !effectiveAvailabilityDayIndexes.includes(date.getDay())) return true;
                        return false;
                      }}
                      className="mx-auto"
                      classNames={{
                        root: "w-full",
                        months: "w-full",
                        month: "w-full gap-3",
                        table: "w-full",
                        head_row: "grid grid-cols-7",
                        row: "grid grid-cols-7 mt-2",
                        cell: "h-10 w-full",
                        day: "h-10 w-full",
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  id="booking-date"
                  type="date"
                  min={minBookingDate}
                  max={maxBookingDate}
                  value={selectedScheduleDate || (effectiveFlow === "self_book" ? defaultBookingDate : "")}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      bookingDate: event.target.value,
                      startTime: "",
                      requestedTimeEnd: "",
                    }))
                  }
                  className="sr-only"
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
            </div>
            {selectedService?.leadTimeHours ? (
              <p className="text-xs text-slate-500">
                {formatLeadTimeLabel(selectedService.leadTimeHours)} applies before the earliest available slot.
              </p>
            ) : null}

            {effectiveFlow === "self_book" ? (
              <>
                {availabilityLoading ? <div className="flex items-center gap-3 rounded-[1.2rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading live availability...</div> : null}
                {!availabilityLoading && availabilityError ? <div className="rounded-[1.2rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">{availabilityError}</div> : null}
                {!availabilityLoading && !availabilityError && availability?.slots.length ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                      Available times
                    </p>
                    <div className="time-grid">
                      {availability.slots.map((slot) => (
                        <div
                        key={slot.startTime}
                        className={cn("tc", form.startTime === slot.startTime && "sel")}
                        style={form.startTime === slot.startTime
                          ? { background: "var(--c)", borderColor: "var(--c)", color: "#fff" }
                          : undefined}
                        onClick={() => setForm((current) => ({ ...current, startTime: slot.startTime }))}
                      >
                        {slot.label}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {!availabilityLoading && !availabilityError && !availability?.slots.length ? <div className="rounded-[1.2rem] border border-dashed border-slate-300 px-4 py-5 text-sm leading-6 text-slate-600">No live times are open for that day. Pick another date above and we&apos;ll refresh the schedule.</div> : null}
              </>
            ) : (
              <div className="space-y-4">
                {effectiveRequestSettings.reviewMessage ? (
                  <div className="rounded-[1.2rem] border border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)] px-4 py-4 text-sm leading-6 text-[color:var(--booking-primary-ink)]">
                    {effectiveRequestSettings.reviewMessage}
                  </div>
                ) : null}

                {requestAllowsWindowMode ? (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setRequestTimeMode("exact");
                        setForm((current) => ({ ...current, requestedTimeLabel: "" }));
                      }}
                      className={cn(
                        "rounded-[1.25rem] border px-4 py-4 text-left transition-all motion-reduce:transition-none",
                        requestTimeMode === "exact"
                          ? "border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)]"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      )}
                    >
                      <p className="font-semibold text-slate-950">Exact time</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">Request a real appointment time.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestTimeMode("window");
                        setForm((current) => ({ ...current, startTime: "", requestedTimeEnd: "" }));
                      }}
                      className={cn(
                        "rounded-[1.25rem] border px-4 py-4 text-left transition-all motion-reduce:transition-none",
                        requestTimeMode === "window"
                          ? "border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)]"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      )}
                    >
                      <p className="font-semibold text-slate-950">Time window</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">Share a range if the day matters more than the exact slot.</p>
                    </button>
                  </div>
                ) : (
                  <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/85 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-950">Exact time required</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      This service collects one preferred appointment time so the shop can review the exact slot you want.
                    </p>
                  </div>
                )}

                {!form.bookingDate ? (
                  <div className="rounded-[1.2rem] border border-dashed border-slate-300 px-4 py-5 text-sm leading-6 text-slate-600">
                    {requestAllowsWindowMode
                      ? "Pick the day first, then choose an exact time or a time window."
                      : "Pick the day first, then choose the exact time you want the shop to review."}
                  </div>
                ) : requestUsesExactTimeOnly || requestTimeMode === "exact" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Preferred time *</p>
                      <Badge variant="outline">{requestExactTimeOptions.length} options</Badge>
                    </div>
                    {requestExactTimeOptions.length ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {requestExactTimeOptions.map((option) => (
                          <button
                            key={option.startTime}
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                startTime: option.startTime,
                                requestedTimeEnd: option.endTime,
                                requestedTimeLabel: "",
                              }))
                            }
                            className={cn(
                              "rounded-[1rem] border px-3 py-3 text-center text-sm font-semibold transition-all motion-reduce:transition-none",
                              form.startTime === option.startTime
                                ? "border-[color:var(--booking-primary)] bg-[var(--booking-primary)] text-[color:var(--booking-primary-foreground)] shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
                                : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[1.2rem] border border-dashed border-slate-300 px-4 py-5 text-sm leading-6 text-slate-600">
                        {requestAllowsWindowMode
                          ? "The shop has not set request hours for this service yet. Pick a time window instead and we&apos;ll still send the request cleanly."
                          : "The shop has not set request hours for this service yet. Check back soon or choose another service while the team updates timing rules."}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Preferred window *</p>
                    <div className="grid gap-3">
                      {requestWindowOptions.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              startTime: "",
                              requestedTimeEnd: "",
                              requestedTimeLabel: option.label,
                            }))
                          }
                          className={cn(
                            "rounded-[1.1rem] border px-4 py-4 text-left transition-all motion-reduce:transition-none",
                            form.requestedTimeLabel === option.label
                              ? "border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)]"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          <p className="font-semibold text-slate-950">{option.label}</p>
                          <p className="mt-1 text-sm text-slate-600">{option.detail}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {effectiveRequestSettings.allowFlexibility ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-950">How flexible are you?</p>
                      <p className="text-xs leading-5 text-slate-500">
                        This helps the shop approve faster if the requested time is already taken.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      {REQUEST_FLEXIBILITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, flexibility: option.value }))}
                          className={cn(
                            "rounded-[1.1rem] border px-4 py-4 text-left transition-all motion-reduce:transition-none",
                            form.flexibility === option.value
                              ? "border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)]"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          <p className="font-semibold text-slate-950">{option.label}</p>
                          <p className="mt-1 text-sm text-slate-600">{option.detail}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <StepHint
                  icon={Clock3}
                  text={
                    requestUsesExactTimeOnly || requestTimeMode === "exact"
                      ? "The shop will review this requested time and either approve it or send alternate options if something closer works better."
                      : "The shop will use this time window as the starting point and can send alternate times without making you start over."
                  }
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeStep.key === "contact") {
      return (
        <div className="space-y-5">
          <input type="text" name="website" value={form.website} onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))} className="hidden" tabIndex={-1} autoComplete="off" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="booking-first-name">First name</Label>
              <Input id="booking-first-name" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} required className="h-12 rounded-2xl bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-last-name">Last name</Label>
              <Input id="booking-last-name" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} required className="h-12 rounded-2xl bg-slate-50" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="booking-email">Email address{config.requireEmail ? " *" : ""}</Label>
              <Input id="booking-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" className="h-12 rounded-2xl bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-phone">Best phone number{config.requirePhone ? " *" : ""}</Label>
              <Input id="booking-phone" type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="(555) 111-2222" required={config.requirePhone} className="h-12 rounded-2xl bg-slate-50" />
            </div>
          </div>
          <StepHint icon={UserRound} text={config.requireEmail ? "Email is required for this booking page. Add a phone number too if the team should call or text." : "Add at least one way to follow up. Confirmation is sent after the request or booking is received."} />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.15rem] border border-slate-200/85 bg-slate-50/80 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Service</p>
            <p className="mt-2 text-base font-semibold tracking-[-0.02em] text-slate-950">{selectedService?.name}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {form.serviceMode === "mobile" ? "Mobile / on-site" : "In-shop"}
              {selectedLocation ? ` · ${selectedLocation.name}` : ""}
            </p>
          </div>
          <div className="rounded-[1.15rem] border border-slate-200/85 bg-slate-50/80 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Vehicle</p>
            <p className="mt-2 text-base font-semibold tracking-[-0.02em] text-slate-950">
              {vehicleReviewSummary || "Vehicle details pending"}
            </p>
            {form.vehicleColor ? <p className="mt-1 text-sm leading-6 text-slate-600">{form.vehicleColor}</p> : null}
          </div>
          <div className="rounded-[1.15rem] border border-slate-200/85 bg-slate-50/80 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {effectiveFlow === "self_book" ? "Timing" : "Requested timing"}
            </p>
            <p className="mt-2 text-base font-semibold tracking-[-0.02em] text-slate-950">
              {effectiveFlow === "self_book"
                ? selectedTimeLabel || formatLongBookingDateLabel(form.bookingDate) || "Choose a time"
                : requestTimingSummary || "Choose a preferred date and time"}
            </p>
            {effectiveFlow === "request" && effectiveRequestSettings.allowFlexibility && requestFlexibilityLabel ? (
              <p className="mt-1 text-sm leading-6 text-slate-600">{requestFlexibilityLabel}</p>
            ) : null}
          </div>
          <div className="rounded-[1.15rem] border border-slate-200/85 bg-slate-50/80 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Contact</p>
            <p className="mt-2 text-base font-semibold tracking-[-0.02em] text-slate-950">
              {contactReviewSummary || "Contact details pending"}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {[form.email, form.phone].filter(Boolean).join(" · ") || "Add an email or phone number"}
            </p>
          </div>
        </div>

        {selectedService?.addons.length ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Frequently added</h3>
              <p className="text-sm text-slate-600">
                {form.vehicleMake || form.vehicleModel ? `Frequently added with ${selectedService.name} for your ${[form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ")}.` : `Frequently added with ${selectedService.name}.`}
              </p>
            </div>
            <div className="grid gap-3">
              {selectedService.addons.map((addon) => {
                const active = form.addonServiceIds.includes(addon.id);
                return (
                  <button key={addon.id} type="button" onClick={() => toggleAddon(addon.id)} className={cn("flex items-start justify-between gap-4 rounded-[1.25rem] border p-4 text-left transition-all motion-reduce:transition-none", active ? "border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)]" : "border-slate-200 bg-white hover:bg-slate-50")}>
                    <div className="space-y-1">
                      <p className="font-medium text-slate-950">{addon.name}</p>
                      {addon.description ? <BookingDescription description={addon.description} /> : null}
                    </div>
                    <div className="text-right text-sm">
                      {config.showPrices && addon.showPrice ? <p className="font-semibold text-slate-950">{formatPrice(addon.price)}</p> : null}
                      {config.showDurations && addon.showDuration ? <p className="mt-1 text-slate-500">{formatDuration(addon.durationMinutes)}</p> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {config.allowCustomerNotes ? (
          <div className="space-y-2">
            <Label htmlFor="booking-notes">Additional details</Label>
            <Textarea id="booking-notes" rows={4} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder={config.notesPrompt || "Add timing, questions, or anything the shop should know."} className="rounded-[1.25rem] bg-slate-50" />
            <p className="text-xs leading-5 text-slate-500">{config.notesPrompt || "Add timing, questions, or anything the shop should know."}</p>
          </div>
        ) : null}
        <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/85 p-4">
          <div className="flex items-start gap-3">
            <Checkbox id="booking-marketing-opt-in" checked={form.marketingOptIn} onCheckedChange={(checked) => setForm((current) => ({ ...current, marketingOptIn: checked === true }))} className="mt-0.5" />
            <div className="space-y-1.5">
              <Label htmlFor="booking-marketing-opt-in" className="cursor-pointer text-sm font-medium text-slate-950">It&apos;s okay for this shop to follow up with me</Label>
              <p className="text-xs leading-5 text-slate-600">This allows the shop to follow up about your request and related service updates.</p>
            </div>
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-slate-200/85 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">What happens next</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {effectiveFlow === "self_book"
              ? "We'll lock the live slot, send confirmation right away, and keep the customer portal linked to this booking."
              : effectiveRequestSettings.confirmationCopy ||
                "The shop will review your requested time, approve it if it works, or send alternate times so you can keep everything moving without starting over."}
          </p>
        </div>
        <StepHint
          icon={ShieldCheck}
          text={
            effectiveFlow === "self_book"
              ? "Availability is checked one more time when you confirm so the booking stays accurate."
              : "Your service, vehicle, preferred time, and contact details are all included in the request the shop reviews."
          }
        />
      </div>
    );
  };

  const submitButtonDisabled = submitting || isBuilderPreview || (effectiveFlow === "self_book" && !form.startTime);
  const heroTrustPoints = (config?.trustPoints ?? [
    "Goes directly to the shop",
    "Quick follow-up",
    "Secure and simple",
  ]).slice(0, 3);
  const bookingPrimaryColor = String(
    bookingBrandTheme.style["--booking-primary" as keyof typeof bookingBrandTheme.style] ?? "#ea580c"
  );
  const bookingPrimarySoft = String(
    bookingBrandTheme.style["--booking-primary-soft" as keyof typeof bookingBrandTheme.style] ?? "#fff7ed"
  );
  const bookingPrimarySoftBorder = String(
    bookingBrandTheme.style["--booking-primary-soft-border" as keyof typeof bookingBrandTheme.style] ?? "#fdba74"
  );
  const bookingPrimaryInk = String(
    bookingBrandTheme.style["--booking-primary-ink" as keyof typeof bookingBrandTheme.style] ?? "#9a3412"
  );
  const heroStyle =
    bookingBrandTheme.tokens.backgroundToneToken === "mist"
      ? { background: "#F8FBFF", borderBottom: "1px solid var(--b)" }
      : bookingBrandTheme.tokens.backgroundToneToken === "sand"
        ? { background: "#FCFAF6", borderBottom: "1px solid var(--b)" }
        : bookingBrandTheme.tokens.backgroundToneToken === "slate"
          ? { background: "#F8FAFC", borderBottom: "1px solid var(--b)" }
          : { background: "#FFFDF8", borderBottom: "1px solid var(--b)" };
  const heroTextColor = "var(--t)";
  const heroMutedColor = "var(--m)";
  const displayPortalName = config?.title?.trim() || config?.businessName || "Strata";
  const displayPortalTagline = config?.subtitle?.trim() || "Professional automotive services";

  return (
    <div
      data-booking-primary={bookingBrandTheme.tokens.primaryColorToken}
      data-booking-accent={bookingBrandTheme.tokens.accentColorToken}
      data-booking-background={bookingBrandTheme.tokens.backgroundToneToken}
      data-booking-button-style={bookingBrandTheme.tokens.buttonStyleToken}
      style={{
        ...bookingBrandTheme.style,
        "--c": bookingPrimaryColor,
        "--cs": bookingPrimarySoft,
        "--cb": bookingPrimarySoftBorder,
        "--ci": bookingPrimaryInk,
        "--t": "#0A0A0F",
        "--m": "#64748B",
        "--l": "#94A3B8",
        "--b": "#E8EAF0",
        "--s": "#F8F9FC",
        "--w": "#FFFFFF",
        "--ok": "#059669",
        "--oks": "#ECFDF5",
        "--okb": "#A7F3D0",
      }}
      className="min-h-screen bg-[radial-gradient(circle_at_top,var(--booking-page-halo),transparent_26%),linear-gradient(180deg,var(--booking-page)_0%,var(--booking-page-muted)_44%,var(--booking-page)_100%)]"
    >
      <style>{`
        .bp-hero {
          padding: 28px 20px 16px;
          text-align: center;
        }
        .bp-hero-mark {
          display: inline-flex;
          margin: 0 auto 12px;
        }
        .bp-biz {
          font-size: 30px; font-weight: 700; letter-spacing: -.04em;
          line-height: 1.1;
        }
        .bp-tag {
          font-size: 13px; margin-top: 6px;
        }
        .bp-trust {
          display: flex; justify-content: center;
          gap: 16px; margin-top: 14px; flex-wrap: wrap;
        }
        .bp-ti {
          font-size: 12px; font-weight: 600;
          display: flex; align-items: center; gap: 3px;
        }
        .bp-prog  { padding: 10px 16px 0; }
        .bp-track { height: 2.5px; background: #EEF0F6; border-radius: 2px; }
        .bp-fill  { height: 100%; border-radius: 2px; transition: width .3s ease; }
        .bp-dots-row {
          display: flex; justify-content: center;
          gap: 5px; padding: 6px 0 0;
        }
        .bp-dot {
          width: 5px; height: 5px;
          border-radius: 50%; transition: background .2s;
        }
        .bp-step-label {
          text-align: center; font-size: 9.5px;
          color: var(--l); padding: 2px 0 4px; font-weight: 500;
        }
        .time-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 5px; margin-bottom: 12px;
        }
        .tc {
          border: 1.5px solid var(--b); border-radius: 8px;
          padding: 8px; text-align: center;
          font-size: 11.5px; font-weight: 700;
          cursor: pointer; transition: all .12s;
          background: var(--w); color: var(--t);
          user-select: none;
        }
        .tc:active { transform: scale(.95); }
        .bp-foot {
          position: sticky; bottom: 0;
          background: rgba(255,255,255,.95);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-top: 1px solid var(--b);
          padding: 10px 14px;
          display: flex; align-items: center;
          justify-content: space-between; gap: 8px;
          z-index: 20;
        }
        .bf-meta p {
          font-size: 12px; font-weight: 700;
          overflow: hidden; text-overflow: ellipsis;
          white-space: nowrap; max-width: 160px;
          color: var(--t); margin: 0;
        }
        .bf-meta small {
          font-size: 9.5px; color: var(--l);
          display: block; margin-top: 1px;
        }
        .bf-btns { display: flex; gap: 5px; flex-shrink: 0; }
        .bf-back {
          padding: 8px 12px; border-radius: 8px;
          font-size: 12px; font-weight: 600;
          border: 1.5px solid var(--b); background: var(--w);
          color: var(--t); cursor: pointer; min-height: 38px;
          font-family: inherit;
        }
        .bf-next {
          padding: 8px 16px; border-radius: 8px;
          font-size: 12px; font-weight: 700;
          border: none; color: #fff; cursor: pointer;
          min-height: 38px; min-width: 100px;
          font-family: inherit;
          display: flex; align-items: center; justify-content: center;
        }
        .bf-next:disabled { opacity: .45; cursor: not-allowed; }
        .bf-next:active:not(:disabled),
        .bf-back:active { transform: scale(.96); }
        .bf-next svg,
        .bf-back svg { width: 13px; height: 13px; }
        .portal { padding-bottom: 40px; }
        .portal-hero {
          padding: 22px 16px 18px; text-align: center;
          background: linear-gradient(180deg, var(--oks) 0%, var(--w) 100%);
          border-bottom: 1px solid var(--okb);
        }
        .check-ring {
          width: 56px; height: 56px; border-radius: 50%;
          background: var(--ok);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 12px;
          box-shadow: 0 12px 28px rgba(5, 150, 105, 0.16);
        }
        .check-ring-icon {
          width: 28px;
          height: 28px;
          color: #fff;
          stroke-width: 3.1;
          transform: translateX(1px);
        }
        .portal-pill {
          display: inline-flex; font-size: 10px; font-weight: 700;
          padding: 3px 10px; border-radius: 20px;
          background: var(--oks); border: 1px solid var(--okb); color: var(--ok);
          margin-bottom: 7px; text-transform: uppercase; letter-spacing: .05em;
        }
        .portal-h {
          font-size: 19px; font-weight: 700;
          letter-spacing: -.035em; color: var(--t);
        }
        .portal-m {
          font-size: 12px; color: var(--m); margin-top: 4px;
          line-height: 1.6; max-width: 260px;
          margin-left: auto; margin-right: auto;
        }
        .detail-card {
          margin: 12px 14px 0;
          border: 1.5px solid var(--b); border-radius: 10px;
          overflow: hidden; background: var(--w);
        }
        .detail-head {
          padding: 8px 12px; background: var(--s);
          border-bottom: 1px solid var(--b);
          display: flex; justify-content: space-between; align-items: center;
        }
        .detail-head-l {
          font-size: 9.5px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .07em; color: var(--l);
        }
        .detail-price { font-size: 12.5px; font-weight: 700; }
        .detail-row {
          display: flex; align-items: center; gap: 9px;
          padding: 9px 12px; border-bottom: 1px solid #F3F5F9;
        }
        .detail-row:last-child { border: none; }
        .di {
          width: 28px; height: 28px; border-radius: 7px;
          background: var(--s);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; color: var(--m);
        }
        .dl { font-size: 10px; color: var(--l); display: block; font-weight: 500; }
        .dv-t { font-size: 12.5px; font-weight: 600; color: var(--t); display: block; margin-top: 1px; }
        .next-wrap { margin: 12px 14px 0; }
        .next-label {
          font-size: 9.5px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .07em;
          color: var(--l); margin-bottom: 7px;
        }
        .next-item {
          display: flex; align-items: flex-start; gap: 9px;
          padding: 10px 12px; border-radius: 10px;
          background: var(--w); border: 1.5px solid var(--b);
          margin-bottom: 6px;
        }
        .next-num {
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 9.5px; font-weight: 700; flex-shrink: 0; margin-top: 1px;
        }
        .next-text strong {
          display: block; font-size: 12px; font-weight: 600;
          color: var(--t); line-height: 1.3;
        }
        .next-text span {
          display: block; font-size: 10.5px; color: var(--m);
          margin-top: 2px; line-height: 1.4;
        }
        .portal-actions {
          margin: 12px 14px 0;
          display: flex; flex-direction: column; gap: 6px;
        }
        .pa-p {
          width: 100%; padding: 12px; border-radius: 11px;
          font-size: 13px; font-weight: 700; color: #fff;
          border: none; cursor: pointer; min-height: 46px;
          display: flex; align-items: center; justify-content: center;
          text-decoration: none; font-family: inherit;
        }
        .pa-s {
          width: 100%; padding: 11px; border-radius: 11px;
          font-size: 13px; font-weight: 600; color: var(--t);
          border: 1.5px solid var(--b); background: var(--w);
          cursor: pointer; min-height: 44px; font-family: inherit;
          display: flex; align-items: center; justify-content: center;
        }
        .pa-g {
          background: none; border: none; color: var(--l);
          font-size: 11.5px; font-weight: 600; cursor: pointer;
          padding: 6px; width: 100%; text-align: center;
          font-family: inherit;
        }
        .pa-p:active, .pa-s:active { transform: scale(.98); }
      `}</style>
      <div className="mx-auto max-w-[760px] px-4 pb-32 pt-5 sm:px-6 lg:px-8 lg:pt-8">
        <div className="space-y-4">
          {!loading && !pageError ? (
            <div className="mx-auto max-w-[720px] space-y-4">
              <div className="overflow-hidden rounded-[24px] border border-[var(--b)] bg-[var(--w)] shadow-[0_22px_54px_rgba(15,23,42,0.07)]">
                <div className="bp-hero" style={heroStyle}>
                  <BookingBrandLogo
                    businessName={config?.businessName || displayPortalName}
                    branding={config?.branding}
                    preset="hero"
                    className="bp-hero-mark"
                  />

                  <div className="bp-biz" style={{ color: heroTextColor }}>
                    {displayPortalName}
                  </div>
                  {displayPortalTagline ? (
                    <div className="bp-tag" style={{ color: heroMutedColor }}>
                      {displayPortalTagline}
                    </div>
                  ) : null}

                  <div className="bp-trust">
                    {heroTrustPoints.map((point, i) => (
                      <span key={i} className="bp-ti" style={{ color: heroTextColor }}>
                        {i === 0 && <Star size={12} fill="currentColor" strokeWidth={1.8} className="text-amber-500" />}
                        {i === 1 && <Users size={12} className="text-slate-400" />}
                        {i === 2 && <ShieldCheck size={12} className="text-slate-400" />}
                        {point}
                      </span>
                    ))}
                  </div>
                  <div className="hidden">
                    {heroTrustPoints.map((point, index) => {
                      const item =
                        index === 0
                          ? { icon: ShieldCheck, detail: "Straight to the shop" }
                          : index === 1
                            ? { icon: Clock3, detail: effectiveFlow === "self_book" ? "Quick confirmation" : "Fast follow-up" }
                            : { icon: Sparkles, detail: "Simple and secure" };
                      return <TrustPoint key={`hidden-${point}-${index}`} title={point} detail={item.detail} icon={item.icon} />;
                    })}
                  </div>
                </div>

                {!result ? (
                  <>
                    <div className="bp-prog">
                      <div className="bp-track">
                        <div
                          className="bp-fill"
                          style={{ width: `${stepProgress}%`, background: "var(--c)" }}
                        />
                      </div>
                    </div>

                    <div className="bp-dots-row">
                      {steps.map((_, i) => (
                        <div
                          key={i}
                          className="bp-dot"
                          style={{ background: i <= currentStep ? "var(--c)" : "#E2E6F0" }}
                        />
                      ))}
                    </div>

                    <div className="bp-step-label">Step {currentStep + 1} of {steps.length} - {activeStep?.label}</div>

                    <div className="hidden">
                      <CompactStepRail
                        steps={steps}
                        currentStep={currentStep}
                        onSelect={moveToStep}
                        canNavigate={(index) => steps[index]?.key === "service" || Boolean(selectedService)}
                      />
                    </div>
                  </>
                ) : null}
              </div>

              {config?.urgencyEnabled && !result ? (
                <div className="rounded-[12px] border border-[var(--cb)] bg-[var(--cs)] px-4 py-3 text-[11px] font-semibold text-[var(--ci)] shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-center gap-2 text-center">
                    <Sparkles size={12} />
                    <p>{config.urgencyText || "Only 3 spots left this week"}</p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-6">
            <div className="space-y-6">
              {loading ? <Card className="overflow-hidden border-slate-200/80 bg-white/96 shadow-[0_22px_54px_rgba(15,23,42,0.07)]"><CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading booking page...</CardContent></Card> : null}
              {!loading && pageError && !config ? <Card className="border-rose-200/90 bg-rose-50/95 shadow-sm"><CardContent className="space-y-3 p-6 text-sm text-rose-900"><p className="font-semibold tracking-[-0.01em] text-rose-950">This booking page is unavailable right now.</p><p>{pageError}</p></CardContent></Card> : null}
              {!loading && !pageError && result ? (
                <div className="portal">
                  <div className="portal-hero">
                    {config ? (
                      <div className="mb-4 flex justify-center">
                        <BookingBrandLogo
                          businessName={config.businessName || displayPortalName}
                          branding={config.branding}
                          preset="confirmation"
                        />
                      </div>
                    ) : null}
                    <div className="check-ring">
                      <Check className="check-ring-icon" aria-hidden="true" />
                    </div>
                    <div className="portal-pill">{result.mode === "self_book" ? "Confirmed" : "Sent"}</div>
                    <div className="portal-h">
                      {result.mode === "self_book" ? "You're booked!" : "Request sent!"}
                    </div>
                    <div className="portal-m">
                      {result.message}
                    </div>
                  </div>

                  <div className="detail-card">
                    <div className="detail-head">
                      <span className="detail-head-l">Booking details</span>
                      {config?.showPrices && confirmationService ? (
                        <span className="detail-price" style={{ color: "var(--c)" }}>
                          {formatPrice(confirmationService.price)}
                        </span>
                      ) : null}
                    </div>

                    {confirmationService ? (
                      <div className="detail-row">
                        <div className="di">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                          </svg>
                        </div>
                        <div>
                          <span className="dl">Service</span>
                          <span className="dv-t">{confirmationService.name}</span>
                        </div>
                      </div>
                    ) : null}

                    {result.scheduledFor || confirmationForm.bookingDate ? (
                      <div className="detail-row">
                        <div className="di">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </div>
                        <div>
                          <span className="dl">{result.mode === "self_book" ? "Date" : "Requested date"}</span>
                          <span className="dv-t">
                            {result.scheduledFor || formatLongBookingDateLabel(confirmationForm.bookingDate) || confirmationForm.bookingDate}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {(result.mode === "self_book" ? selectedTimeLabel : requestTimingSummary) ? (
                      <div className="detail-row">
                        <div className="di">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                            <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
                          </svg>
                        </div>
                        <div>
                          <span className="dl">{result.mode === "self_book" ? "Time" : "Requested time"}</span>
                          <span className="dv-t">
                            {result.mode === "self_book"
                              ? selectedTimeLabel
                              : formatTimeRangeLabel({
                                  startTime: confirmationForm.startTime,
                                  endTime: confirmationForm.requestedTimeEnd,
                                  timeZone: confirmationForm.customerTimezone || detectedCustomerTimezone,
                                }) || confirmationForm.requestedTimeLabel}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {config?.showDurations && confirmationService ? (
                      <div className="detail-row">
                        <div className="di">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        </div>
                        <div>
                          <span className="dl">Duration</span>
                          <span className="dv-t">{formatDuration(confirmationService.durationMinutes)}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="next-wrap">
                    <div className="next-label">What happens next</div>

                    {result.mode === "self_book" ? (
                      <>
                        <div className="next-item">
                          <div className="next-num" style={{ background: "var(--cs)", color: "var(--c)" }}>1</div>
                          <div className="next-text">
                            <strong>Confirmation email sent</strong>
                            <span>Check your inbox. It has your details and a portal link.</span>
                          </div>
                        </div>
                        <div className="next-item">
                          <div className="next-num" style={{ background: "var(--cs)", color: "var(--c)" }}>2</div>
                          <div className="next-text">
                            <strong>Add to your calendar</strong>
                            <span>Save the time so you don't forget.</span>
                          </div>
                        </div>
                        <div className="next-item">
                          <div className="next-num" style={{ background: "var(--cs)", color: "var(--c)" }}>3</div>
                          <div className="next-text">
                            <strong>Day of your appointment</strong>
                            <span>Show up at the agreed time. We'll be ready.</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="next-item">
                          <div className="next-num" style={{ background: "var(--cs)", color: "var(--c)" }}>1</div>
                          <div className="next-text">
                            <strong>Request received</strong>
                            <span>The shop has your requested day, time, service, vehicle, and contact details.</span>
                          </div>
                        </div>
                        <div className="next-item">
                          <div className="next-num" style={{ background: "var(--cs)", color: "var(--c)" }}>2</div>
                          <div className="next-text">
                            <strong>Time review in progress</strong>
                            <span>The team can approve your requested time or send alternate options if something nearby works better.</span>
                          </div>
                        </div>
                        <div className="next-item">
                          <div className="next-num" style={{ background: "var(--cs)", color: "var(--c)" }}>3</div>
                          <div className="next-text">
                            <strong>No need to start over</strong>
                            <span>If they suggest another slot, you can respond from the follow-up instead of re-entering everything.</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="portal-actions">
                    {result.confirmationUrl ? (
                      <a href={result.confirmationUrl} target="_blank" rel="noreferrer" className="pa-p" style={{ background: "var(--c)" }}>
                        Open booking portal
                      </a>
                    ) : null}
                    {result.portalUrl && !result.confirmationUrl ? (
                      <a href={result.portalUrl} target="_blank" rel="noreferrer" className="pa-p" style={{ background: "var(--c)" }}>
                        Open customer portal
                      </a>
                    ) : null}
                    <button className="pa-s" type="button" onClick={() => {}}>
                      Add to calendar
                    </button>
                    <button
                      type="button"
                      className="pa-g"
                      onClick={() => {
                        setResult(null);
                        setSubmittedForm(null);
                        setSubmittedService(null);
                      }}
                    >
                      Book another service
                    </button>
                  </div>
                </div>
              ) : null}
              {!loading && !pageError && !result ? (
                <form id="public-booking-form" onSubmit={handleSubmit} className="space-y-6">
                  {currentStep > 0 ? (
                    <button
                      type="button"
                      onClick={() => moveToStep(currentStep - 1)}
                      className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>{steps[currentStep - 1]?.title ?? "Back"}</span>
                    </button>
                  ) : null}
                  <Card className="overflow-hidden border-slate-200/70 bg-white/96 shadow-[0_18px_46px_rgba(15,23,42,0.055)]">
                    <CardHeader className="space-y-4 border-b border-slate-100/90 pb-4">
                      <div className="flex flex-col gap-3">
                        <div className="space-y-1">
                          <div className="mb-2 inline-flex rounded-full border border-[color:var(--cb)] bg-[var(--cs)] px-2.5 py-1 text-[10px] font-semibold text-[var(--ci)]">
                            Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
                          </div>
                          <CardTitle className="text-[1.95rem] tracking-[-0.045em] sm:text-[2.15rem]">{activeStep?.title}</CardTitle>
                          <CardDescription className="max-w-2xl text-[14px] leading-6 text-slate-500">{activeStep?.description}</CardDescription>
                        </div>
                      </div>
                      {currentStep > 0 ? selectedServiceSummary : null}
                    </CardHeader>
                    <CardContent className="space-y-6 px-5 pb-6 pt-5 sm:px-6">
                      <div className="transition-opacity duration-200 motion-reduce:transition-none">{renderStepBody()}</div>
                      {stepError ? <div className="rounded-[1.05rem] border border-amber-200/90 bg-amber-50/95 px-4 py-3 text-sm leading-6 text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">{stepError}</div> : null}
                      {submitError ? <div className="rounded-[1.05rem] border border-rose-200/90 bg-rose-50/95 px-4 py-3 text-sm leading-6 text-rose-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">{submitError}</div> : null}
                    </CardContent>
                  </Card>
                </form>
              ) : null}
            </div>
            <div className="space-y-6">
            <div className="hidden">
              <Card className="sticky top-8 overflow-hidden border-slate-200/75 bg-[var(--booking-summary)] shadow-[0_20px_44px_rgba(15,23,42,0.07)]">
                <div className="h-1 w-full bg-[linear-gradient(90deg,var(--booking-primary-strong),var(--booking-primary))]" />
                <CardHeader>
                  <CardTitle className="text-lg tracking-[-0.02em]">Booking summary</CardTitle>
                  <CardDescription>{selectedService ? "Keep the service, timing, and next step in view while you finish." : "Choose a service to see pricing, duration, and the next step."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedService ? (
                    <>
                      <div className="space-y-2 rounded-[1.2rem] border border-slate-200/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="rounded-full border border-[color:var(--booking-primary-soft-border)] bg-[var(--booking-primary-soft)] text-[color:var(--booking-primary-ink)]">{effectiveFlow === "self_book" ? "Book instantly" : "Request review"}</Badge>
                          <Badge variant="outline" className="rounded-full">{serviceModeLabel}</Badge>
                        </div>
                        <p className="text-base font-semibold tracking-[-0.02em] text-slate-950">{selectedService.name}</p>
                        {selectedService.description ? <BookingDescription description={selectedService.description} /> : null}
                      </div>
                      {selectedAddons.length > 0 ? <div className="space-y-2"><p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Add-ons</p><div className="flex flex-wrap gap-2">{selectedAddons.map((addon) => <Badge key={addon.id} variant="outline">{addon.name}</Badge>)}</div></div> : null}
                      <div className="grid gap-3 rounded-[1.2rem] border border-slate-200/85 bg-slate-50/80 p-4 text-sm">
                        <SummaryRow label="Flow" value={effectiveFlow === "self_book" ? "Book instantly" : "Request approval"} />
                        <SummaryRow label="Service mode" value={form.serviceMode === "mobile" ? "Mobile / on-site" : "In-shop"} />
                        {selectedLocation ? <SummaryRow label="Location" value={selectedLocation.name} /> : null}
                        {form.serviceMode === "mobile" && form.serviceAddress ? <SummaryRow label="Service address" value={[form.serviceAddress, form.serviceCity, form.serviceState, form.serviceZip].filter(Boolean).join(", ")} /> : null}
                        {canShowSelectedPrice ? <SummaryRow label="Subtotal" value={formatPrice(subtotal)} emphasize /> : null}
                        {canShowSelectedDuration ? <SummaryRow label="Estimated time" value={formatDuration(totalDuration)} /> : null}
                        {totalDeposit > 0 ? <SummaryRow label="Deposit" value={formatPrice(totalDeposit)} /> : null}
                        {selectedTimeLabel && effectiveFlow === "self_book" ? <SummaryRow label="Chosen time" value={selectedTimeLabel} /> : null}
                        {effectiveFlow === "request" && requestTimingSummary ? (
                          <SummaryRow label="Requested timing" value={requestTimingSummary} />
                        ) : null}
                        {effectiveFlow === "request" && effectiveRequestSettings.allowFlexibility && requestFlexibilityLabel ? (
                          <SummaryRow label="Flexibility" value={requestFlexibilityLabel} />
                        ) : null}
                      </div>
                      <div className={cn("rounded-[1.2rem] border px-4 py-4 text-sm leading-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]", effectiveFlow === "self_book" ? "border-emerald-200 bg-emerald-50/95 text-emerald-900" : "border-slate-200/85 bg-slate-50/80 text-slate-700")}>
                        {effectiveFlow === "self_book" ? "Confirmation is sent as soon as the booking is placed, with a customer portal link right away." : "Request-only services let the shop review the job before anything is scheduled."}
                      </div>
                    </>
                  ) : <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">Select a service to see pricing, duration, add-ons, and the next step.</div>}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>

      {!loading && !pageError && !result ? (
        <div className="bp-foot">
          <div className="bf-meta">
            <p>{selectedService ? selectedService.name : "Choose a service"}</p>
            <small>
              {effectiveFlow === "self_book"
                ? "Availability checked at confirm"
                : "Shop confirms timing with you"}
            </small>
          </div>
          <div className="bf-btns">
            {currentStep > 0 ? (
              <button
                key={`footer-back-${activeStep?.key ?? currentStep}`}
                type="button"
                className="bf-back"
                onClick={() => moveToStep(currentStep - 1)}
              >
                <ArrowLeft />
                <span>Back</span>
              </button>
            ) : null}
            {currentStep < steps.length - 1 ? (
              <button
                key={`footer-continue-${activeStep?.key ?? currentStep}`}
                type="button"
                className="bf-next"
                style={{ background: "var(--c)" }}
                onClick={handleNext}
              >
                <span>Continue</span>
                <ArrowRight />
              </button>
            ) : (
              <button
                key={`footer-submit-${activeStep?.key ?? currentStep}`}
                type="submit"
                form="public-booking-form"
                className="bf-next"
                style={{ background: "var(--c)" }}
                disabled={submitButtonDisabled}
              >
                {isBuilderPreview
                  ? "Preview only"
                  : submitting
                  ? (effectiveFlow === "self_book" ? "Booking..." : "Sending...")
                  : (effectiveFlow === "self_book" ? "Book now" : "Send request")}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
