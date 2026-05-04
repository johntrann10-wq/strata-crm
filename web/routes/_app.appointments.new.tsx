import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useOutletContext, useSearchParams, Link } from "react-router";
import type { DateRange } from "react-day-picker";
import { useFindFirst, useFindMany, useFindOne, useAction } from "../hooks/useApi";
import { format, addMinutes } from "date-fns";
import {
  CalendarIcon,
  ChevronDown,
  ChevronLeft,
  Check,
  ChevronsUpDown,
  Clock,
  MapPin,
  DollarSign,
  AlertCircle,
  Loader2,
  Sparkles,
  Package,
  Plus,
  Search,
  X,
} from "lucide-react";
import { api } from "../api";
import { formatServiceCategory } from "../lib/serviceCatalog";
import { formatPackageIncludedItems, isPackageTemplateService } from "../lib/servicePackages";
import type { AuthOutletContext } from "./_app";
import { getWorkflowCreationPreset } from "../lib/workflowCreationPresets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { PhoneInput } from "../components/shared/PhoneInput";
import { VehicleCatalogFields } from "../components/vehicles/VehicleCatalogFields";
import {
  buildQuarterHourOptions,
  formatDurationMinutes,
  QuarterHourDurationGrid,
  ResponsiveTimeSelect,
} from "../components/appointments/SchedulingControls";
import {
  emptyVehicleCatalogFormValue,
  formatVehicleLabel,
  type VehicleCatalogFormValue,
} from "../lib/vehicles";
import { getPhoneNumberInputError } from "../lib/phone";

const toMoneyNumber = (value: unknown): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

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

function parseDateTimeInputValue(dateValue: string, timeValue: string): Date | null {
  const parsedDate = parseDateInputValue(dateValue);
  const match = /^(\d{2}):(\d{2})$/.exec(timeValue.trim());
  if (!parsedDate || !match) return null;
  const [, hoursRaw, minutesRaw] = match;
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
    hours,
    minutes,
    0,
    0
  );
}

function parseCsvIds(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeMatchingText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseVehicleSummaryPrefill(value: string | null) {
  if (!value?.trim()) return null;
  const summary = value.trim();
  const yearMatch = summary.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch?.[0] ?? "";
  const withoutYear = summary.replace(/\b(19|20)\d{2}\b/, "").replace(/\s+/g, " ").trim();
  const parts = withoutYear.split(/[,\s]+/).filter(Boolean);
  return {
    year,
    make: parts[0] ?? "",
    model: parts.slice(1).join(" "),
    displayName: summary,
  };
}

function matchServicesFromRequestedText(
  services: ServiceCatalogRecord[],
  requestedText: string | null
): string[] {
  const normalizedRequest = normalizeMatchingText(requestedText);
  if (!normalizedRequest) return [];

  const exactOrIncluded = services
    .filter((service) => {
      const normalizedName = normalizeMatchingText(service.name);
      if (!normalizedName) return false;
      return normalizedRequest.includes(normalizedName) || normalizedName.includes(normalizedRequest);
    })
    .map((service) => service.id);

  if (exactOrIncluded.length > 0) {
    return Array.from(new Set(exactOrIncluded)).slice(0, 6);
  }

  const requestTokens = new Set(normalizedRequest.split(" ").filter((token) => token.length >= 3));
  return services
    .map((service) => {
      const haystack = normalizeMatchingText([service.name, service.notes, service.categoryLabel].filter(Boolean).join(" "));
      const serviceTokens = haystack.split(" ").filter((token) => token.length >= 3);
      const score = serviceTokens.reduce((sum, token) => sum + (requestTokens.has(token) ? 1 : 0), 0);
      return { id: service.id, score };
    })
    .filter((entry) => entry.score >= 2)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((entry) => entry.id);
}

function joinNoteSections(...sections: Array<string | null | undefined>): string {
  return sections
    .map((section) => String(section ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

type ServiceCatalogRecord = {
  id: string;
  name: string;
  price?: number | string | null;
  durationMinutes?: number | null;
  category?: string | null;
  categoryId?: string | null;
  categoryLabel?: string | null;
  notes?: string | null;
  isAddon?: boolean | null;
};

type PackageAddonLinkRecord = {
  parentServiceId: string;
  addonServiceId: string;
};

type InlineClientRecord = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
};

function getServiceSearchHaystack(service: ServiceCatalogRecord) {
  return [service.name, service.notes, service.categoryLabel ?? formatServiceCategory(service.category)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildPackageTemplates(
  services: ServiceCatalogRecord[],
  addonLinks: PackageAddonLinkRecord[],
) {
  return services
    .filter((service) => !service.isAddon && isPackageTemplateService(service))
    .map((service) => {
      const linkedAddons = addonLinks
        .filter((link) => link.parentServiceId === service.id)
        .map((link) => services.find((candidate) => candidate.id === link.addonServiceId))
        .filter(Boolean) as ServiceCatalogRecord[];

      return {
        baseService: service,
        linkedAddons,
        totalPackagePrice:
          Number(service.price ?? 0) + linkedAddons.reduce((sum, addon) => sum + Number(addon.price ?? 0), 0),
        totalPackageDuration:
          Number(service.durationMinutes ?? 0) +
          linkedAddons.reduce((sum, addon) => sum + Number(addon.durationMinutes ?? 0), 0),
      };
    });
}

function buildGroupedServices(
  services: ServiceCatalogRecord[],
  recommendedCategories: string[],
  normalizedServiceSearch: string,
) {
  const groups = new Map<string, { title: string; categoryKey: string; services: ServiceCatalogRecord[] }>();

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
  services: ServiceCatalogRecord[],
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

function getSelectedServiceCategoryKeys(
  services: ServiceCatalogRecord[],
  selectedServiceIds: string[],
) {
  return Array.from(
    new Set(
      services
        .filter((service) => selectedServiceIds.includes(service.id))
        .map((service) =>
          service.categoryId
            ? `category:${service.categoryId}`
            : `legacy:${String(service.categoryLabel ?? formatServiceCategory(service.category)).toLowerCase()}`
        )
    )
  );
}

function buildSelectedAddonSuggestions(
  services: ServiceCatalogRecord[],
  addonLinks: PackageAddonLinkRecord[],
  selectedServiceIds: string[],
) {
  return services
    .filter((service) => selectedServiceIds.includes(service.id))
    .map((baseService) => {
      const linkedAddons = addonLinks
        .filter((link) => link.parentServiceId === baseService.id)
        .map((link) => services.find((candidate) => candidate.id === link.addonServiceId))
        .filter((addon): addon is ServiceCatalogRecord => Boolean(addon) && !selectedServiceIds.includes(addon.id));

      return linkedAddons.length > 0 ? { baseService, linkedAddons } : null;
    })
    .filter(Boolean) as Array<{ baseService: ServiceCatalogRecord; linkedAddons: ServiceCatalogRecord[] }>;
}

function normalizePriceDraft(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/[^\d.]/g, "");
  const parts = normalized.split(".");
  if (parts.length <= 1) return normalized;
  return `${parts[0]}.${parts.slice(1).join("")}`;
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

const MULTI_DAY_PHASE_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "active_work", label: "Active work" },
  { value: "waiting", label: "Waiting" },
  { value: "curing", label: "Curing" },
  { value: "hold", label: "On hold" },
  { value: "pickup_ready", label: "Pickup ready" },
] as const;

function getMultiDayPhaseLabel(value: string) {
  return MULTI_DAY_PHASE_OPTIONS.find((option) => option.value === value)?.label ?? "Scheduled";
}

export default function NewAppointmentPage() {
  const { user, businessId, businessType, currentLocationId } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const creationPreset = useMemo(() => getWorkflowCreationPreset(businessType), [businessType]);

  const [searchParams] = useSearchParams();
  const quoteIdParam = searchParams.get("quoteId");
  const clientIdParam = searchParams.get("clientId");
  const vehicleIdParam = searchParams.get("vehicleId");
  const locationIdParam = searchParams.get("locationId");
  const sourceTypeParam =
    searchParams.get("sourceType") === "lead" || searchParams.get("sourceType") === "booking_request"
      ? (searchParams.get("sourceType") as "lead" | "booking_request")
      : null;
  const sourceLeadClientIdParam = searchParams.get("sourceLeadClientId");
  const sourceBookingRequestIdParam = searchParams.get("sourceBookingRequestId");
  const requestedServicesParam = searchParams.get("requestedServices");
  const leadSourceParam = searchParams.get("leadSource");
  const sourceSummaryParam = searchParams.get("sourceSummary");
  const sourceAddressParam = searchParams.get("sourceAddress");
  const sourceCustomerNameParam = searchParams.get("sourceCustomerName");
  const sourcePhoneParam = searchParams.get("sourcePhone");
  const sourceEmailParam = searchParams.get("sourceEmail");
  const sourceNotesParam = searchParams.get("notes");
  const sourceInternalNotesParam = searchParams.get("internalNotes");
  const sourceServiceIdsParam = parseCsvIds(searchParams.get("serviceIds"));
  const sourceVehicleSummaryParam = searchParams.get("vehicleSummary");
  const sourceVehicleYearParam = searchParams.get("vehicleYear");
  const sourceVehicleMakeParam = searchParams.get("vehicleMake");
  const sourceVehicleModelParam = searchParams.get("vehicleModel");
  const sourceVehicleColorParam = searchParams.get("vehicleColor");
  const sourceLicensePlateParam = searchParams.get("licensePlate");
  const sourceMobileFlag = searchParams.get("mobile") === "1";
  const sourceMobileAddressParam = searchParams.get("mobileAddress");
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/calendar?view=month";
  const hasQueueReturn = searchParams.has("from");

  // Form state
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [servicePriceOverrides, setServicePriceOverrides] = useState<Record<string, string>>({});
  const [serviceDurationOverrides, setServiceDurationOverrides] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => undefined);
  const [startTime, setStartTime] = useState<string>(() => "09:00");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallViewport, setIsSmallViewport] = useState(false);
  const [isMultiDayJob, setIsMultiDayJob] = useState(false);
  const [jobPhase, setJobPhase] = useState("scheduled");
  const [jobStartDate, setJobStartDate] = useState("");
  const [jobStartTime, setJobStartTime] = useState("");
  const [expectedCompletionDate, setExpectedCompletionDate] = useState("");
  const [expectedCompletionTime, setExpectedCompletionTime] = useState("");
  const [pickupReadyDate, setPickupReadyDate] = useState("");
  const [pickupReadyTime, setPickupReadyTime] = useState("");
  const [mobileAddress, setMobileAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [markInternalAsPaid, setMarkInternalAsPaid] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [applyTax, setApplyTax] = useState(false);
  const [adminFeeRate, setAdminFeeRate] = useState("0");
  const [applyAdminFee, setApplyAdminFee] = useState(false);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [quickVehicleForm, setQuickVehicleForm] = useState<VehicleCatalogFormValue>({
    ...emptyVehicleCatalogFormValue,
    year: String(new Date().getFullYear()),
  });
  const [quickVehicleError, setQuickVehicleError] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });
  const [quickClientError, setQuickClientError] = useState("");
  const [createdInlineClient, setCreatedInlineClient] = useState<InlineClientRecord | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(() => locationIdParam ?? currentLocationId);
  const [showQuotePrefilledBadge, setShowQuotePrefilledBadge] = useState(false);
  const hasPrefilledFromQuote = useRef(false);
  const hasSeededSourceContext = useRef(false);
  const hasSeededSourceServices = useRef(false);
  const hasSeededBusinessFinanceDefaults = useRef(false);
  const hasSeededBusinessDefaultStartTime = useRef(false);
  const expectedCompletionDateTouchedRef = useRef(false);
  const expectedCompletionTimeTouchedRef = useRef(false);
  const [ignoreClientPrefill, setIgnoreClientPrefill] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState<string>("");
  const [debouncedClientQuery, setDebouncedClientQuery] = useState<string>("");
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [expandedServiceCategories, setExpandedServiceCategories] = useState<string[]>([]);
  const dateParam = searchParams.get("date");
  const timeParam = searchParams.get("time");
  const sourceContext = useMemo(
    () =>
      sourceTypeParam
        ? {
            type: sourceTypeParam,
            label: sourceTypeParam === "booking_request" ? "Booking Request" : "Lead",
            sourceLeadClientId: sourceLeadClientIdParam?.trim() || null,
            sourceBookingRequestId: sourceBookingRequestIdParam?.trim() || null,
            requestedServices: requestedServicesParam?.trim() || null,
            leadSource: leadSourceParam?.trim() || null,
            summary: sourceSummaryParam?.trim() || null,
            address: sourceMobileAddressParam?.trim() || sourceAddressParam?.trim() || null,
            customerName: sourceCustomerNameParam?.trim() || null,
            customerPhone: sourcePhoneParam?.trim() || null,
            customerEmail: sourceEmailParam?.trim() || null,
            internalNotes: sourceInternalNotesParam?.trim() || null,
            customerNotes: sourceNotesParam?.trim() || null,
            serviceIds: sourceServiceIdsParam,
            vehicleSummary: sourceVehicleSummaryParam?.trim() || null,
          }
        : null,
    [
      leadSourceParam,
      requestedServicesParam,
      sourceAddressParam,
      sourceBookingRequestIdParam,
      sourceCustomerNameParam,
      sourceEmailParam,
      sourceInternalNotesParam,
      sourceLeadClientIdParam,
      sourceMobileAddressParam,
      sourceNotesParam,
      sourcePhoneParam,
      sourceServiceIdsParam,
      sourceSummaryParam,
      sourceTypeParam,
      sourceVehicleSummaryParam,
    ]
  );

  // Pre-fill client, date and time from URL query params
  useEffect(() => {
    if (!ignoreClientPrefill && clientIdParam && selectedClientId === null) {
      setSelectedClientId(clientIdParam);
    }
    if (!ignoreClientPrefill && clientIdParam && vehicleIdParam && selectedVehicleId === null) {
      setSelectedVehicleId(vehicleIdParam);
    }
    if (timeParam) setStartTime(timeParam);
    if (dateParam && !selectedDate) {
      const parsedDate = parseDateInputValue(dateParam);
      if (parsedDate) setSelectedDate(parsedDate);
    }
  }, [clientIdParam, dateParam, ignoreClientPrefill, selectedClientId, selectedDate, selectedVehicleId, timeParam, vehicleIdParam]);

  // Default selectedDate to today on the client when no date param is provided
  useEffect(() => {
    if (!dateParam && selectedDate === undefined) {
      setSelectedDate(new Date());
    }
  }, [dateParam, selectedDate]);

  useEffect(() => {
    if (hasSeededSourceContext.current || !sourceContext) return;

    if (sourceContext.sourceLeadClientId && !clientIdParam && selectedClientId === null) {
      setSelectedClientId(sourceContext.sourceLeadClientId);
    }
    if (sourceContext.customerNotes) {
      setNotes(sourceContext.customerNotes);
    }

    const sourceCarryoverLines = [
      !sourceContext.sourceLeadClientId && sourceContext.customerName
        ? `Customer: ${sourceContext.customerName}`
        : null,
      !sourceContext.sourceLeadClientId && sourceContext.customerPhone
        ? `Customer phone: ${sourceContext.customerPhone}`
        : null,
      !sourceContext.sourceLeadClientId && sourceContext.customerEmail
        ? `Customer email: ${sourceContext.customerEmail}`
        : null,
      sourceContext.requestedServices ? `Requested services: ${sourceContext.requestedServices}` : null,
      sourceContext.leadSource ? `Lead source: ${sourceContext.leadSource}` : null,
      sourceContext.sourceBookingRequestId
        ? `Booking request reference: ${sourceContext.sourceBookingRequestId}`
        : null,
      !sourceMobileFlag && sourceContext.address ? `Requested service address: ${sourceContext.address}` : null,
      sourceVehicleColorParam?.trim() ? `Vehicle color: ${sourceVehicleColorParam.trim()}` : null,
      sourceLicensePlateParam?.trim() ? `License plate: ${sourceLicensePlateParam.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const seededInternalNotes = joinNoteSections(sourceContext.internalNotes, sourceCarryoverLines);
    if (seededInternalNotes) {
      setInternalNotes(seededInternalNotes);
    }

    if (sourceMobileFlag) {
      setIsMobile(true);
    }
    if (sourceContext.address) {
      setMobileAddress(sourceContext.address);
    }

    const parsedVehicleSummary = parseVehicleSummaryPrefill(sourceVehicleSummaryParam);
    const seededVehicleYear =
      sourceVehicleYearParam?.trim() ||
      parsedVehicleSummary?.year ||
      quickVehicleForm.year;
    const seededVehicleMake =
      sourceVehicleMakeParam?.trim() ||
      parsedVehicleSummary?.make ||
      quickVehicleForm.make;
    const seededVehicleModel =
      sourceVehicleModelParam?.trim() ||
      parsedVehicleSummary?.model ||
      quickVehicleForm.model;
    const seededVehicleDisplayName =
      sourceVehicleSummaryParam?.trim() ||
      parsedVehicleSummary?.displayName ||
      [seededVehicleYear, seededVehicleMake, seededVehicleModel].filter(Boolean).join(" ");
    if (seededVehicleYear || seededVehicleMake || seededVehicleModel || seededVehicleDisplayName) {
      setQuickVehicleForm((current) => ({
        ...current,
        year: seededVehicleYear,
        make: seededVehicleMake,
        model: seededVehicleModel,
        displayName: seededVehicleDisplayName || current.displayName,
        manualEntry: true,
        source: "manual",
      }));
    }

    hasSeededSourceContext.current = true;
  }, [
    clientIdParam,
    quickVehicleForm.displayName,
    quickVehicleForm.make,
    quickVehicleForm.model,
    quickVehicleForm.year,
    selectedClientId,
    sourceContext,
    sourceInternalNotesParam,
    sourceLicensePlateParam,
    sourceMobileAddressParam,
    sourceMobileFlag,
    sourceNotesParam,
    sourceVehicleColorParam,
    sourceVehicleMakeParam,
    sourceVehicleModelParam,
    sourceVehicleSummaryParam,
    sourceVehicleYearParam,
  ]);

  useEffect(() => {
    if (creationPreset.defaultMobile) {
      setIsMobile(true);
    }
  }, [creationPreset.defaultMobile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsSmallViewport(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (locationIdParam) {
      setSelectedLocationId(locationIdParam);
      return;
    }
    setSelectedLocationId(currentLocationId);
  }, [currentLocationId, locationIdParam]);

  // Debounce client search query
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedClientQuery(clientSearchQuery);
    }, 300);
    return () => clearTimeout(timeout);
  }, [clientSearchQuery]);

  // Data fetching
  const [{ data: businessData }] = useFindFirst(api.business, {
    filter: { id: { equals: businessId ?? "" } },
    select: { defaultTaxRate: true, defaultAdminFee: true, defaultAdminFeeEnabled: true, defaultAppointmentStartTime: true },
    pause: !businessId,
  });

  const [{ data: prefilledClientData }] = useFindFirst(api.client, {
    filter: clientIdParam ? { id: { equals: clientIdParam } } : { id: { equals: "" } },
    select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    pause: !clientIdParam,
  } as any);

  const [{ data: locationsData }] = useFindMany(api.location, {
    filter: businessId ? { businessId: { equals: businessId }, active: { equals: true } } : undefined,
    select: { id: true, name: true, address: true },
    sort: { name: "Ascending" },
    first: 50,
    pause: !businessId,
  } as any);

  const [{ data: clientsData, fetching: clientsFetching }, refetchClients] = useFindMany(
    api.client,
    {
      filter: businessId
        ? { businessId: { equals: businessId } }
        : { id: { equals: "" } },
      search: debouncedClientQuery.length >= 2 ? debouncedClientQuery : undefined,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
      },
      first: 20,
      sort: { firstName: "Ascending" },
      pause: !businessId,
    } as any
  );

  const [{ data: servicesData, fetching: servicesFetching }] = useFindMany(
    api.service,
    {
      filter: {
        businessId: { equals: businessId ?? "" },
        active: { equals: true },
      },
      select: {
        id: true,
        name: true,
        price: true,
        durationMinutes: true,
        category: true,
        categoryId: true,
        categoryLabel: true,
        notes: true,
      },
      first: 250,
      sort: { name: "Ascending" },
      pause: !businessId,
    }
  );
  const [{ data: packageAddonLinks }] = useFindMany(api.serviceAddonLink, {
    first: 250,
    pause: !businessId,
  } as any);

  const [{ data: staffData, fetching: staffFetching }] = useFindMany(
    api.staff,
    {
      filter: {
        businessId: { equals: businessId ?? "" },
        active: { equals: true },
      },
      select: { id: true, firstName: true, lastName: true, role: true },
      first: 50,
      sort: { firstName: "Ascending" },
      pause: !businessId,
    }
  );

  const [{ data: vehiclesData, fetching: vehiclesFetching }, refetchVehicles] = useFindMany(
    api.vehicle,
    {
      filter: selectedClientId
        ? { clientId: { equals: selectedClientId } }
        : { id: { equals: "" } },
      select: {
        id: true,
        year: true,
        make: true,
        model: true,
        color: true,
        licensePlate: true,
      },
      first: 50,
    }
  );

  const [{ data: quoteData }] = useFindOne(api.quote, quoteIdParam ?? undefined, {
    select: {
      id: true,
      vehicleId: true,
      lineItems: {
        edges: {
          node: {
            description: true,
            unitPrice: true,
          },
        },
      },
    },
  });

  const [{ fetching: actionFetching }, createAppointment] = useAction(
    api.appointment.create
  );

  const [, createVehicle] = useAction(api.vehicle.create);
  const [{ fetching: creatingClient }, createClient] = useAction(api.client.create);

  // Derived calculations
  const { totalPrice, totalDuration } = useMemo(() => {
    return selectedServiceIds.reduce(
      (acc, id) => {
        const service = servicesData?.find((s) => s.id === id);
        if (service) {
          const override = servicePriceOverrides[id];
          const durationOverride = serviceDurationOverrides[id];
          acc.totalPrice += override != null && override !== "" ? toMoneyNumber(override) : toMoneyNumber(service.price);
          acc.totalDuration +=
            durationOverride != null && durationOverride !== ""
              ? Number(durationOverride)
              : service.durationMinutes ?? 0;
        }
        return acc;
      },
      { totalPrice: 0, totalDuration: 0 }
    );
  }, [selectedServiceIds, serviceDurationOverrides, servicePriceOverrides, servicesData]);
  const adminFeeRateNum = applyAdminFee ? parseFloat(adminFeeRate) || 0 : 0;
  const effectiveAdminFee = totalPrice * (adminFeeRateNum / 100);
  const taxableSubtotal = totalPrice + effectiveAdminFee;
  const taxRateNum = applyTax ? parseFloat(taxRate) || 0 : 0;
  const taxAmount = taxableSubtotal * (taxRateNum / 100);
  const appointmentTotal = taxableSubtotal + taxAmount;

  const startDateTime = useMemo(() => {
    if (!selectedDate || !startTime) return null;
    const [hours, minutes] = startTime.split(":").map(Number);
    const dt = new Date(selectedDate);
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  }, [selectedDate, startTime]);

  const effectiveDuration = totalDuration;

  const endDateTime = useMemo(() => {
    if (!startDateTime || effectiveDuration === 0) return null;
    return addMinutes(startDateTime, effectiveDuration);
  }, [startDateTime, effectiveDuration]);

  const dropOffDateTime = useMemo(() => {
    if (!jobStartDate || !jobStartTime) return null;
    return parseDateTimeInputValue(jobStartDate, jobStartTime);
  }, [jobStartDate, jobStartTime]);

  const pickupDateTime = useMemo(() => {
    if (!expectedCompletionDate || !expectedCompletionTime) return null;
    return parseDateTimeInputValue(expectedCompletionDate, expectedCompletionTime);
  }, [expectedCompletionDate, expectedCompletionTime]);

  const pickupReadyDateTime = useMemo(() => {
    if (!pickupReadyDate || !pickupReadyTime) return null;
    return parseDateTimeInputValue(pickupReadyDate, pickupReadyTime);
  }, [pickupReadyDate, pickupReadyTime]);

  const multiDayDateRange = useMemo<DateRange | undefined>(() => {
    const from = jobStartDate ? parseDateInputValue(jobStartDate) ?? undefined : undefined;
    const to = expectedCompletionDate ? parseDateInputValue(expectedCompletionDate) ?? undefined : undefined;
    if (!from && !to) return undefined;
    return {
      from,
      to,
    };
  }, [expectedCompletionDate, jobStartDate]);

  const suggestedExpectedCompletionDateTime = useMemo(() => {
    if (endDateTime) return endDateTime;
    return startDateTime ?? dropOffDateTime;
  }, [dropOffDateTime, endDateTime, startDateTime]);

  const handleMultiDayRangeChange = useCallback((range: DateRange | undefined) => {
    if (!range?.from) {
      setJobStartDate("");
      setExpectedCompletionDate("");
      return;
    }

    const from = format(range.from, "yyyy-MM-dd");
    const to = format(range.to ?? range.from, "yyyy-MM-dd");
    setJobStartDate(from);
    expectedCompletionDateTouchedRef.current = true;
    setExpectedCompletionDate(to);

    if (!selectedDate) {
      setSelectedDate(range.from);
      return;
    }

    const selectedDay = format(selectedDate, "yyyy-MM-dd");
    if (selectedDay < from || selectedDay > to) {
      setSelectedDate(range.from);
    }
  }, [selectedDate]);

  const handleExpectedCompletionDateChange = useCallback((value: string) => {
    expectedCompletionDateTouchedRef.current = true;
    setExpectedCompletionDate(value);
  }, []);

  const handleExpectedCompletionTimeChange = useCallback((value: string) => {
    expectedCompletionTimeTouchedRef.current = true;
    setExpectedCompletionTime(value);
  }, []);

  const seedExpectedCompletionFromEstimate = useCallback(() => {
    if (!suggestedExpectedCompletionDateTime) return;
    setExpectedCompletionDate(format(suggestedExpectedCompletionDateTime, "yyyy-MM-dd"));
    setExpectedCompletionTime(format(suggestedExpectedCompletionDateTime, "HH:mm"));
  }, [suggestedExpectedCompletionDateTime]);

  const handleEnableMultiDayJob = useCallback(() => {
    expectedCompletionDateTouchedRef.current = false;
    expectedCompletionTimeTouchedRef.current = false;
    setIsMultiDayJob(true);
    seedExpectedCompletionFromEstimate();
  }, [seedExpectedCompletionFromEstimate]);

  useEffect(() => {
    if (!selectedDate) return;
    const yyyyMmDd = format(selectedDate, "yyyy-MM-dd");
    setJobStartDate((current) => current || yyyyMmDd);
    setJobStartTime((current) => current || startTime);
  }, [isMultiDayJob, selectedDate, startTime]);

  useEffect(() => {
    if (!isMultiDayJob) {
      expectedCompletionDateTouchedRef.current = false;
      expectedCompletionTimeTouchedRef.current = false;
      return;
    }
    if (!suggestedExpectedCompletionDateTime) return;
    if (!expectedCompletionDateTouchedRef.current) {
      setExpectedCompletionDate(format(suggestedExpectedCompletionDateTime, "yyyy-MM-dd"));
    }
    if (!expectedCompletionTimeTouchedRef.current) {
      setExpectedCompletionTime(format(suggestedExpectedCompletionDateTime, "HH:mm"));
    }
  }, [isMultiDayJob, suggestedExpectedCompletionDateTime]);

  useEffect(() => {
    if (!isMultiDayJob || !selectedDate || !jobStartDate || !jobStartTime || !startTime) return;
    const activeWorkDate = format(selectedDate, "yyyy-MM-dd");
    if (jobStartDate !== activeWorkDate) return;
    if (jobStartTime <= startTime) return;
    setJobStartTime(startTime);
  }, [isMultiDayJob, jobStartDate, jobStartTime, selectedDate, startTime]);

  // Set selected client from prefilled data when arriving via URL param
  useEffect(() => {
    if (!ignoreClientPrefill && prefilledClientData && selectedClientId === null) {
      setSelectedClientId(prefilledClientData.id);
    }
  }, [ignoreClientPrefill, prefilledClientData, selectedClientId]);

  useEffect(() => {
    if (selectedClientId !== null) return;
    if (selectedVehicleId !== null) {
      setSelectedVehicleId(null);
    }
  }, [selectedClientId, selectedVehicleId]);

  useEffect(() => {
    if (!businessData || hasSeededBusinessFinanceDefaults.current) return;
    const defaultTaxRate = Number((businessData as { defaultTaxRate?: number | string | null }).defaultTaxRate ?? 0);
    const defaultAdminFee = Number((businessData as { defaultAdminFee?: number | string | null }).defaultAdminFee ?? 0);
    const defaultAdminFeeEnabled = Boolean(
      (businessData as { defaultAdminFeeEnabled?: boolean | null }).defaultAdminFeeEnabled
    );
    setTaxRate(String(defaultTaxRate));
    setApplyTax(defaultTaxRate > 0);
    setAdminFeeRate(String(defaultAdminFee));
    setApplyAdminFee(defaultAdminFeeEnabled && defaultAdminFee > 0);
    hasSeededBusinessFinanceDefaults.current = true;
  }, [businessData]);

  useEffect(() => {
    if (timeParam || hasSeededBusinessDefaultStartTime.current || !businessData) return;
    const defaultStartTime = String(
      (businessData as { defaultAppointmentStartTime?: string | null }).defaultAppointmentStartTime ?? "09:00"
    );
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(defaultStartTime)) {
      setStartTime(defaultStartTime);
    }
    hasSeededBusinessDefaultStartTime.current = true;
  }, [businessData, timeParam]);

  // Auto-select sole vehicle when client has exactly one vehicle
  useEffect(() => {
    if (!selectedClientId) return;
    if (vehiclesData && vehiclesData.length === 1 && selectedVehicleId === null) {
      setSelectedVehicleId(vehiclesData[0].id);
    }
  }, [selectedClientId, selectedVehicleId, vehiclesData]);

  // Pre-select vehicle from linked quote
  useEffect(() => {
    if (!quoteIdParam || !quoteData) return;
    const vid = (quoteData as { vehicleId?: string | null }).vehicleId;
    if (vid && selectedVehicleId === null) {
      setSelectedVehicleId(vid);
    }
  }, [quoteIdParam, quoteData, selectedVehicleId]);

  // Auto-select sole staff member
  useEffect(() => {
    if (staffData && staffData.length === 1 && selectedStaffId === null) {
      setSelectedStaffId(staffData[0].id);
    }
  }, [staffData, selectedStaffId]);

  // Pre-fill services from a linked quote
  useEffect(() => {
    if (hasPrefilledFromQuote.current) return;
    if (!quoteData || !servicesData || servicesData.length === 0) return;
    const edges = (quoteData as any)?.lineItems?.edges ?? [];
    if (edges.length === 0) return;
    const matchedIds: string[] = [];
    for (const edge of edges) {
      const description: string = edge?.node?.description ?? "";
      const matched = servicesData.find(
        (s) => s.name.trim().toLowerCase() === description.trim().toLowerCase()
      );
      if (matched) {
        matchedIds.push(matched.id);
      }
    }
    if (matchedIds.length > 0) {
      setSelectedServiceIds((prev) => [...new Set([...prev, ...matchedIds])]);
      setShowQuotePrefilledBadge(true);
    }
    hasPrefilledFromQuote.current = true;
  }, [quoteData, servicesData]);

  // Auto-dismiss quote prefilled badge after 5 seconds
  useEffect(() => {
    if (!showQuotePrefilledBadge) return;
    const timeout = setTimeout(() => setShowQuotePrefilledBadge(false), 5000);
    return () => clearTimeout(timeout);
  }, [showQuotePrefilledBadge]);

  const formatDuration = (minutes: number) => {
    return formatDurationMinutes(minutes)
      .replace(" hrs", "h")
      .replace(" hr", "h")
      .replace(" min", "m");
  };

  const timeOptions = useMemo(() => buildQuarterHourOptions(), []);
  const timeSelectTriggerClassName =
    "h-10 w-full rounded-xl border-input/90 bg-background/85 px-3 text-sm font-medium [font-variant-numeric:tabular-nums] shadow-[0_1px_2px_rgba(15,23,42,0.03)]";
  const mobileControlClassName =
    "border-input/90 h-10 w-full appearance-none rounded-xl border bg-background/85 px-3.5 py-2 pr-10 text-sm font-normal shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[color,box-shadow,border-color,background-color] hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40";
  const mobileTimeSelectClassName =
    mobileControlClassName;
  const dateInputClassName =
    cn(
      mobileControlClassName,
      "[font-variant-numeric:tabular-nums] [color-scheme:light] [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit-fields-wrapper]:min-w-0"
    );
  const readOnlyTimeClassName =
    "flex h-10 w-full items-center rounded-xl border border-input/90 bg-muted/40 pl-10 pr-3 text-sm font-medium text-muted-foreground [font-variant-numeric:tabular-nums]";
  const mobileFormSelectClassName =
    cn(mobileControlClassName, "text-foreground");

  const notifyAppointmentConfirmation = (deliveryStatus?: string | null, deliveryError?: string | null) => {
    if (deliveryStatus === "emailed") {
      toast.success("Appointment created and confirmation emailed");
      return;
    }
    if (deliveryStatus === "missing_email") {
      toast.warning("Appointment created. Add a client email to send confirmations.");
      return;
    }
    if (deliveryStatus === "smtp_disabled") {
      toast.warning("Appointment created. Transactional email is not configured.");
      return;
    }
    if (deliveryStatus === "email_failed") {
      toast.warning(`Appointment created, but confirmation email failed${deliveryError ? `: ${deliveryError}` : "."}`);
      return;
    }
    toast.success("Appointment created successfully!");
  };

  // Handlers
  const handleClientSelect = (clientId: string) => {
    const isClearingCurrentClient = clientId === selectedClientId;
    setIgnoreClientPrefill(isClearingCurrentClient);
    setSelectedClientId(isClearingCurrentClient ? null : clientId);
    setSelectedVehicleId(null);
    setClientSearchOpen(false);
    setClientSearchQuery("");
  };

  const handleQuickClientFieldChange = (field: keyof typeof quickClientForm, value: string) => {
    setQuickClientForm((current) => ({ ...current, [field]: value }));
    if (quickClientError) setQuickClientError("");
  };

  const handleQuickAddClient = async () => {
    if (!businessId) {
      setQuickClientError("Business not found. Refresh and try again.");
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
    const phoneError = getPhoneNumberInputError(phone);
    if (phoneError) {
      setQuickClientError(phoneError);
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

    const createdClient = {
      id: createdClientId,
      firstName,
      lastName,
      phone: phone || null,
      email: email || null,
    };
    setCreatedInlineClient(createdClient);
    setSelectedClientId(createdClientId);
    setSelectedVehicleId(null);
    setIgnoreClientPrefill(true);
    setClientSearchOpen(false);
    setClientSearchQuery("");
    setQuickClientOpen(false);
    setQuickClientForm({ firstName: "", lastName: "", phone: "", email: "" });
    await refetchClients();
    toast.success("Client added");
  };

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) {
        setServicePriceOverrides((current) => {
          if (!(serviceId in current)) return current;
          const next = { ...current };
          delete next[serviceId];
          return next;
        });
        setServiceDurationOverrides((current) => {
          if (!(serviceId in current)) return current;
          const next = { ...current };
          delete next[serviceId];
          return next;
        });
        return prev.filter((id) => id !== serviceId);
      }
      return [...prev, serviceId];
    });
  };

  const handleServicePriceOverrideChange = (serviceId: string, value: string) => {
    const normalized = normalizePriceDraft(value);
    setServicePriceOverrides((current) => {
      if (!normalized) {
        if (!(serviceId in current)) return current;
        const next = { ...current };
        delete next[serviceId];
        return next;
      }
      return { ...current, [serviceId]: normalized };
    });
  };

  const handleServiceDurationOverrideChange = (serviceId: string, value: string) => {
    const normalized = value.trim().replace(/[^\d]/g, "");
    setServiceDurationOverrides((current) => {
      if (!normalized) {
        if (!(serviceId in current)) return current;
        const next = { ...current };
        delete next[serviceId];
        return next;
      }
      return { ...current, [serviceId]: normalized };
    });
  };

  const applyPackageTemplate = useCallback(
    (baseServiceId: string, addonServiceIds: string[]) => {
      setSelectedServiceIds((prev) => [...new Set([...prev, baseServiceId, ...addonServiceIds])]);
    },
    []
  );

  const handleQuickAddVehicle = async () => {
    if (!quickVehicleForm.make.trim() || !quickVehicleForm.model.trim()) {
      setQuickVehicleError('Make and model are required.');
      return;
    }
    if (!selectedClientId || !businessId) return;
    setQuickVehicleError('');
    setSavingVehicle(true);
    try {
      const result = await createVehicle({
        clientId: selectedClientId,
        make: quickVehicleForm.make.trim(),
        model: quickVehicleForm.model.trim(),
        year: quickVehicleForm.year ? parseInt(quickVehicleForm.year, 10) : undefined,
        trim: quickVehicleForm.trim || undefined,
        bodyStyle: quickVehicleForm.bodyStyle || undefined,
        engine: quickVehicleForm.engine || undefined,
        vin: quickVehicleForm.vin || undefined,
        displayName: quickVehicleForm.displayName || undefined,
        source: quickVehicleForm.source || "manual",
        sourceVehicleId: quickVehicleForm.sourceVehicleId || undefined,
      } as any);
      if (result.error) {
        setQuickVehicleError(result.error.message ?? "Failed to add vehicle.");
        return;
      }
      const createdVehicleId = (result.data as { id?: string } | null)?.id;
      if (!createdVehicleId) {
        setQuickVehicleError("Vehicle saved but no record ID was returned. Please refresh and try again.");
        return;
      }
      await refetchVehicles();
      setSelectedVehicleId(createdVehicleId);
      setQuickVehicleForm({
        ...emptyVehicleCatalogFormValue,
        year: String(new Date().getFullYear()),
      });
      toast.success("Vehicle added");
    } catch (e: any) {
      setQuickVehicleError(e?.message ?? 'Failed to add vehicle.');
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setVehicleError(null);

    if (servicesData && servicesData.length > 0 && selectedServiceIds.length === 0) {
      setFormError("Please select at least one service so an end time can be calculated.");
      return;
    }

    if (!selectedDate) {
      setFormError("Please select a date.");
      return;
    }
    if (!startTime) {
      setFormError("Please set a start time.");
      return;
    }
    if (!startDateTime) {
      setFormError("Invalid date/time combination.");
      return;
    }
    if (isMultiDayJob && jobStartDate && jobStartTime && !dropOffDateTime) {
      setFormError("Enter a valid multi-day start date and time.");
      return;
    }
    if (isMultiDayJob && (!expectedCompletionDate || !expectedCompletionTime)) {
      setFormError("Please enter an expected completion date and time for the multi-day job.");
      return;
    }
    if (isMultiDayJob && expectedCompletionDate && expectedCompletionTime && !pickupDateTime) {
      setFormError("Enter a valid expected completion date and time.");
      return;
    }
    if (pickupReadyDate && pickupReadyTime && !pickupReadyDateTime) {
      setFormError("Enter a valid pickup-ready date and time.");
      return;
    }
    if (isMobile && !mobileAddress.trim()) {
      setFormError("Please enter the service address for this mobile appointment.");
      return;
    }

    if (!businessId) {
      setFormError("Business not found.");
      return;
    }

    setIsSubmitting(true);
    try {
      const jobStartDateTime =
        isMultiDayJob && jobStartDate && jobStartTime
          ? dropOffDateTime
          : startDateTime;
      const expectedCompletionDateTime =
        isMultiDayJob && expectedCompletionDate && expectedCompletionTime
          ? pickupDateTime
          : undefined;
      const clientNotes = notes.trim();
      const mobileAddressNote = isMobile && mobileAddress.trim() ? `Mobile service address: ${mobileAddress.trim()}` : "";
      const persistedNotes = [mobileAddressNote, clientNotes].filter(Boolean).join("\n\n") || undefined;
      const autoTitle = selectedServiceIds.length
        ? selectedServiceIds
            .map((id) => servicesData?.find((s) => s.id === id)?.name)
            .filter(Boolean)
            .join(" + ")
        : selectedClientId
          ? "Appointment"
          : "Internal block";
      const serviceSelections =
        selectedServiceIds.length > 0
          ? selectedServiceIds.map((serviceId) => ({
              serviceId,
              unitPrice:
                servicePriceOverrides[serviceId] != null && servicePriceOverrides[serviceId] !== ""
                  ? Number(servicePriceOverrides[serviceId])
                  : undefined,
            }))
          : undefined;
      const effectiveInternalPaid = !selectedClientId && markInternalAsPaid && totalPrice > 0;
      const parsedDepositAmount = depositAmount.trim() !== "" ? Number(depositAmount) : NaN;
      const effectiveDepositAmount = effectiveInternalPaid
        ? totalPrice
        : Number.isFinite(parsedDepositAmount) && parsedDepositAmount > 0
          ? parsedDepositAmount
          : undefined;
      const sourceMetadata = sourceContext
        ? {
            sourceLabel: sourceContext.label,
            sourceSummary: sourceContext.summary ?? undefined,
            requestedServices: sourceContext.requestedServices ?? undefined,
            leadSource: sourceContext.leadSource ?? undefined,
            requestedAddress: sourceContext.address ?? undefined,
            customerName: sourceContext.customerName ?? undefined,
            customerPhone: sourceContext.customerPhone ?? undefined,
            customerEmail: sourceContext.customerEmail ?? undefined,
            originalCustomerNotes: sourceContext.customerNotes ?? undefined,
            originalInternalNotes: sourceContext.internalNotes ?? undefined,
            vehicleSummary: sourceContext.vehicleSummary ?? undefined,
            vehicleYear: sourceVehicleYearParam?.trim() || undefined,
            vehicleMake: sourceVehicleMakeParam?.trim() || undefined,
            vehicleModel: sourceVehicleModelParam?.trim() || undefined,
            vehicleColor: sourceVehicleColorParam?.trim() || undefined,
            licensePlate: sourceLicensePlateParam?.trim() || undefined,
            mobileServiceRequested: sourceMobileFlag || undefined,
            mobileServiceAddress: sourceMobileAddressParam?.trim() || undefined,
            matchedServiceIds: selectedServiceIds.length > 0 ? selectedServiceIds : undefined,
            prefilledServiceIds: sourceContext.serviceIds.length > 0 ? sourceContext.serviceIds : undefined,
          }
        : undefined;
      const result = await createAppointment({
        clientId: selectedClientId ?? undefined,
        vehicleId: selectedVehicleId ?? undefined,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime ? endDateTime.toISOString() : undefined,
        jobStartTime: jobStartDateTime ? jobStartDateTime.toISOString() : undefined,
        expectedCompletionTime: expectedCompletionDateTime ? expectedCompletionDateTime.toISOString() : undefined,
        pickupReadyTime: pickupReadyDateTime ? pickupReadyDateTime.toISOString() : undefined,
        vehicleOnSite: isMultiDayJob || undefined,
        jobPhase: isMultiDayJob ? jobPhase : undefined,
        title: autoTitle || undefined,
        assignedStaffId: selectedStaffId ?? undefined,
        locationId: selectedLocationId ?? undefined,
        depositAmount: effectiveDepositAmount,
        taxRate: parseFloat(taxRate) || 0,
        applyTax,
        adminFeeRate: parseFloat(adminFeeRate) || 0,
        applyAdminFee,
        notes: persistedNotes,
        internalNotes: internalNotes.trim() || undefined,
        ...(sourceContext?.type ? { sourceType: sourceContext.type } : {}),
        ...(sourceContext?.sourceLeadClientId
          ? { sourceLeadClientId: sourceContext.sourceLeadClientId }
          : {}),
        ...(sourceContext?.sourceBookingRequestId
          ? { sourceBookingRequestId: sourceContext.sourceBookingRequestId }
          : {}),
        ...(sourceMetadata ? { sourceMetadata } : {}),
        ...(quoteIdParam ? { quoteId: quoteIdParam } : {}),
        ...(serviceSelections?.length ? { serviceSelections } : {}),
        ...(selectedServiceIds.length > 0 ? { serviceIds: selectedServiceIds } : {}),
      } as Record<string, unknown>);

      if (result.error) {
        setFormError(result.error.message);
        setIsSubmitting(false);
        return;
      }

      if (result.data) {
        const payload = result.data as { id: string; deliveryStatus?: string | null; deliveryError?: string | null };
        if (!payload.id) {
          setFormError("Appointment was created, but no record ID was returned. Please refresh the schedule and confirm the booking.");
          return;
        }
        notifyAppointmentConfirmation(payload.deliveryStatus ?? null, payload.deliveryError ?? null);
        navigate(`/appointments/${payload.id}?from=${encodeURIComponent(returnTo)}`);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An error occurred while creating the appointment.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const vehicles = useMemo(() => vehiclesData ?? [], [vehiclesData]);
  const clients = useMemo(() => clientsData ?? [], [clientsData]);
  const services = useMemo(() => servicesData ?? [], [servicesData]);
  const selectedClient =
    clients.find((c) => c.id === selectedClientId) ??
    (prefilledClientData?.id === selectedClientId ? prefilledClientData : undefined) ??
    (createdInlineClient?.id === selectedClientId ? createdInlineClient : undefined);
  const requiresServiceSelection = services.length > 0;
  const addonLinks = useMemo(
    () => (packageAddonLinks ?? []) as Array<{ parentServiceId: string; addonServiceId: string }>,
    [packageAddonLinks]
  );
  const packageTemplates = useMemo(
    () => buildPackageTemplates(services as ServiceCatalogRecord[], addonLinks),
    [addonLinks, services]
  );
  const normalizedServiceSearch = serviceSearchQuery.trim().toLowerCase();
  const recommendedPackageTemplates = packageTemplates.filter((pkg) =>
    creationPreset.recommendedCategories.includes(String(pkg.baseService.category ?? "other")) &&
    [
      pkg.baseService.name,
      pkg.baseService.notes,
      ...pkg.linkedAddons.map((addon) => addon?.name),
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
        ...pkg.linkedAddons.map((addon) => addon?.name),
        pkg.baseService.categoryLabel ?? formatServiceCategory(pkg.baseService.category),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedServiceSearch || "")
  );
  const groupedServices = useMemo(
    () => buildGroupedServices(services as ServiceCatalogRecord[], creationPreset.recommendedCategories, normalizedServiceSearch),
    [creationPreset.recommendedCategories, normalizedServiceSearch, services]
  );
  const directServiceSearchResults = useMemo(
    () => findDirectServiceSearchResults(services as ServiceCatalogRecord[], normalizedServiceSearch),
    [normalizedServiceSearch, services]
  );
  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service.id)),
    [selectedServiceIds, services]
  );
  const selectedAddonSuggestions = useMemo(
    () => buildSelectedAddonSuggestions(services as ServiceCatalogRecord[], addonLinks, selectedServiceIds),
    [addonLinks, selectedServiceIds, services]
  );
  const sourcePreviewLines = useMemo<string[]>(
    () =>
      sourceContext
        ? [
            sourceContext.summary,
            sourceContext.requestedServices ? `Requested: ${sourceContext.requestedServices}` : null,
            sourceContext.address ? `Address: ${sourceContext.address}` : null,
            !selectedClientId && (sourceContext.customerName || sourceContext.customerPhone || sourceContext.customerEmail)
              ? `Contact: ${[
                  sourceContext.customerName,
                  sourceContext.customerPhone,
                  sourceContext.customerEmail,
                ]
                  .filter(Boolean)
                  .join(" · ")}`
              : null,
            sourceContext.leadSource ? `Lead source: ${sourceContext.leadSource}` : null,
          ].filter((line): line is string => Boolean(line))
        : [],
    [selectedClientId, sourceContext]
  );

  useEffect(() => {
    if (hasSeededSourceServices.current || !sourceContext || quoteIdParam || services.length === 0) return;

    if (selectedServiceIds.length > 0) {
      hasSeededSourceServices.current = true;
      return;
    }

    const explicitMatches = sourceContext.serviceIds.filter((serviceId) =>
      services.some((service) => service.id === serviceId)
    );
    const matchedServiceIds =
      explicitMatches.length > 0
        ? explicitMatches
        : matchServicesFromRequestedText(services as ServiceCatalogRecord[], sourceContext.requestedServices);

    if (matchedServiceIds.length > 0) {
      setSelectedServiceIds(Array.from(new Set(matchedServiceIds)));
    }

    hasSeededSourceServices.current = true;
  }, [quoteIdParam, selectedServiceIds.length, services, sourceContext]);

  useEffect(() => {
    if (normalizedServiceSearch) {
      setExpandedServiceCategories(groupedServices.map((group) => group.category));
      return;
    }

    if (selectedServiceIds.length === 0) return;

    const selectedCategories = getSelectedServiceCategoryKeys(services as ServiceCatalogRecord[], selectedServiceIds);

    setExpandedServiceCategories((current) =>
      Array.from(new Set([...current, ...selectedCategories]))
    );
  }, [groupedServices, normalizedServiceSearch, selectedServiceIds, services]);

  const staff = staffData ?? [];
  const isLoading = isSubmitting || actionFetching;
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,1))]">
      <div className="mx-auto max-w-6xl p-3 pb-28 sm:p-6 sm:pb-6 lg:p-8">
        {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to appointments queue" /> : null}
        <div className="mb-5 overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/85 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_42px_rgba(15,23,42,0.06)] backdrop-blur-md">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.13),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0))] px-3 py-3 sm:px-5 sm:py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(returnTo)}
                className="h-10 shrink-0 rounded-full px-3"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              {selectedLocationId && locationsData?.some((location) => location.id === selectedLocationId) ? (
                <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm">
                  {locationsData.find((location) => location.id === selectedLocationId)?.name ?? "Current location"}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          {/* Error alert */}
          {formError && (
            <Alert variant="destructive" className="lg:col-span-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="min-w-0 space-y-5">

          {/* Section: Client & Vehicle */}
          <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4 sm:px-5">
              <CardTitle className="text-base font-semibold">
                Client &amp; Vehicle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              {/* Client searchable select */}
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
                <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientSearchOpen}
                      className="h-11 w-full justify-between rounded-xl font-normal"
                    >
                      {selectedClient
                        ? `${selectedClient.firstName} ${selectedClient.lastName}${selectedClient.phone ? ` — ${selectedClient.phone}` : ""}`
                        : clientsFetching
                        ? "Loading clients..."
                        : "Search clients..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] overflow-hidden rounded-2xl p-0"
                    align="start"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                  >
                    <Command>
                      <CommandInput
                        placeholder="Type to search clients…"
                        value={clientSearchQuery}
                        onValueChange={setClientSearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {clientsFetching
                            ? "Loading…"
                            : clients.length === 0 && !debouncedClientQuery
                            ? "No clients yet. Add one below."
                            : "No clients found."}
                        </CommandEmpty>
                        <CommandGroup>
                          {clients.map((client) => (
                            <CommandItem
                              key={client.id}
                              value={`${client.firstName} ${client.lastName} ${client.phone ?? ""} ${client.email ?? ""}`}
                              onSelect={() => handleClientSelect(client.id)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 shrink-0",
                                  selectedClientId === client.id
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              <div className="min-w-0">
                                <p className="font-medium text-sm">
                                  {client.firstName} {client.lastName}
                                </p>
                                {(client.phone || client.email) && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {client.phone ?? client.email}
                                  </p>
                                )}
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
                        <Label htmlFor="quick-client-first-name">First name</Label>
                        <Input
                          id="quick-client-first-name"
                          value={quickClientForm.firstName}
                          onChange={(event) => handleQuickClientFieldChange("firstName", event.target.value)}
                          placeholder="Jane"
                          autoComplete="given-name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="quick-client-last-name">Last name</Label>
                        <Input
                          id="quick-client-last-name"
                          value={quickClientForm.lastName}
                          onChange={(event) => handleQuickClientFieldChange("lastName", event.target.value)}
                          placeholder="Smith"
                          autoComplete="family-name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="quick-client-phone">Phone</Label>
                        <PhoneInput
                          id="quick-client-phone"
                          value={quickClientForm.phone}
                          onChange={(value) => handleQuickClientFieldChange("phone", value)}
                          placeholder="(555) 000-0000"
                          autoComplete="tel"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="quick-client-email">Email</Label>
                        <Input
                          id="quick-client-email"
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
                        {creatingClient ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Save client
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Saves the customer here, then keeps you on this appointment.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Vehicle select */}
              <div className="space-y-2">
                <Label>Vehicle</Label>
                {selectedClientId && vehiclesData && vehicles.length === 0 && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                    <AlertDescription>
                      This client has no vehicles on file. Add one below now, or keep booking without a vehicle.
                    </AlertDescription>
                  </Alert>
                )}
                {!selectedClientId ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                    Leave client and vehicle blank to create an internal time block or reminder. Pick a client first if this should be attached to a real customer job.
                  </div>
                ) : vehiclesFetching ? (
                  <p className="text-sm text-muted-foreground">
                    Loading vehicles...
                  </p>
                ) : vehicles.length === 0 ? (
                  <div className="space-y-3 rounded-2xl border bg-muted/30 p-3">
                    <p className="text-sm text-muted-foreground italic">
                      No vehicles on file for this client. Add one now if you want to link the appointment to a vehicle.
                    </p>
                    <VehicleCatalogFields value={quickVehicleForm} setValue={setQuickVehicleForm} compact />
                    {quickVehicleError ? <p className="text-xs text-destructive">{quickVehicleError}</p> : null}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={handleQuickAddVehicle} disabled={savingVehicle}>
                        {savingVehicle ? "Saving..." : "Save Vehicle"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select
                    value={selectedVehicleId ?? ""}
                    onValueChange={(val) => {
                      setSelectedVehicleId(val || null);
                      if (val) setVehicleError(null);
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="Select a vehicle..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {formatVehicleLabel(v as any)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {vehicleError && <p className="text-xs text-destructive mt-1">{vehicleError}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Section: Services */}
          <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4 sm:px-5">
              <CardTitle className="text-base font-semibold">Services</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {servicesFetching ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading services...
                </div>
              ) : services.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-4">
                  No active services found. Add services from the Services page.
                </p>
              ) : (
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
                    {selectedServices.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedServices.map((service) => (
                          <button
                            key={service.id}
                            type="button"
                            onClick={() => toggleService(service.id)}
                            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-primary/10"
                          >
                            <span>{service.name}</span>
                              <span className="text-xs text-muted-foreground">
                              {(
                                serviceDurationOverrides[service.id] != null && serviceDurationOverrides[service.id] !== ""
                                  ? Number(serviceDurationOverrides[service.id])
                                  : service.durationMinutes
                              )
                                ? `${formatDuration(
                                    serviceDurationOverrides[service.id] != null && serviceDurationOverrides[service.id] !== ""
                                      ? Number(serviceDurationOverrides[service.id])
                                      : Number(service.durationMinutes ?? 0)
                                  )} · `
                                : ""}
                              ${(
                                servicePriceOverrides[service.id] != null && servicePriceOverrides[service.id] !== ""
                                  ? toMoneyNumber(servicePriceOverrides[service.id])
                                  : toMoneyNumber(service.price)
                              ).toFixed(2)}
                            </span>
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-muted-foreground">No services selected.</p>
                    )}
                  </div>

                  {selectedAddonSuggestions.length > 0 ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/75 p-4 shadow-sm">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-amber-950">Optional add-ons</p>
                          <p className="text-xs text-amber-800">
                            Add configured upgrades without digging through the full service list.
                          </p>
                        </div>
                        <Badge variant="outline" className="w-fit border-amber-300 bg-white text-amber-900">
                          Revenue lift
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-3">
                        {selectedAddonSuggestions.map((suggestion) => (
                          <div key={suggestion.baseService.id} className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-800">
                              For {suggestion.baseService.name}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {suggestion.linkedAddons.map((addon) => (
                                <button
                                  key={addon.id}
                                  type="button"
                                  onClick={() => toggleService(addon.id)}
                                  className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50"
                                >
                                  <span className="min-w-0 break-words font-medium text-slate-950">{addon.name}</span>
                                  <span className="inline-flex shrink-0 items-center gap-1 text-slate-600">
                                    <Plus className="h-3.5 w-3.5" />
                                    ${toMoneyNumber(addon.price).toFixed(2)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

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
                                    onClick={() =>
                                      applyPackageTemplate(
                                        pkg.baseService.id,
                                        pkg.linkedAddons.map((addon) => addon!.id)
                                      )
                                    }
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
                                      <span>{pkg.totalPackageDuration > 0 ? formatDuration(pkg.totalPackageDuration) : "Custom duration"}</span>
                                      <span>·</span>
                                      <span>${pkg.totalPackagePrice.toFixed(2)}</span>
                                    </div>
                                    <p className="mt-3 text-xs text-muted-foreground">
                                      {formatPackageIncludedItems(pkg.linkedAddons.map((addon) => addon?.name))}
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
                                    onClick={() =>
                                      applyPackageTemplate(
                                        pkg.baseService.id,
                                        pkg.linkedAddons.map((addon) => addon!.id)
                                      )
                                    }
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
                                      <span>{pkg.totalPackageDuration > 0 ? formatDuration(pkg.totalPackageDuration) : "Custom duration"}</span>
                                      <span>·</span>
                                      <span>${pkg.totalPackagePrice.toFixed(2)}</span>
                                    </div>
                                    <p className="mt-3 text-xs text-muted-foreground">
                                      {formatPackageIncludedItems(pkg.linkedAddons.map((addon) => addon?.name))}
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
                        {directServiceSearchResults.map((service) => {
                          const isSelected = selectedServiceIds.includes(service.id);
                          return (
                            <button
                              key={service.id}
                              type="button"
                              className={cn(
                                "flex min-h-[64px] w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "border-border bg-card hover:bg-muted/40"
                              )}
                              onClick={() => toggleService(service.id)}
                            >
                              <SelectionIndicator checked={isSelected} />
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
                                  ${toMoneyNumber(service.price).toFixed(2)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
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
                      {groupedServices.map((group) => {
                        const selectedCount = group.services.filter((service) => selectedServiceIds.includes(service.id)).length;
                        return (
                          <AccordionItem key={group.category} value={group.category}>
                            <AccordionTrigger className="py-4 hover:no-underline">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">{group.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {group.services.length} service{group.services.length === 1 ? "" : "s"}
                                    {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
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
                              {group.services.map((service) => {
                                const isSelected = selectedServiceIds.includes(service.id);
                                return (
                                  <div
                                    key={service.id}
                                    className={cn(
                                      "flex min-h-[60px] select-none items-center gap-3 rounded-xl border p-3 transition-colors",
                                      isSelected
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:bg-muted/40"
                                    )}
                                    onClick={() => toggleService(service.id)}
                                  >
                                    <SelectionIndicator checked={isSelected} />
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
                                        ${toMoneyNumber(service.price).toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                      No services match this search yet. Try another term or clear the search.
                    </div>
                  )}
                </div>
              )}

              {sourceContext && (
                <div className="mt-3 rounded-[1.15rem] border border-slate-200/80 bg-slate-50/90 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-slate-900"
                    >
                      Created from {sourceContext.label}
                    </Badge>
                    {sourceContext.sourceBookingRequestId ? (
                      <span className="text-xs text-muted-foreground">
                        Request ID: {sourceContext.sourceBookingRequestId}
                      </span>
                    ) : null}
                  </div>
                  {sourcePreviewLines.length > 0 ? (
                    <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                      {sourcePreviewLines.map((line) =>
                        String(line).startsWith("Address:") ? (
                          <div key={line} className="flex items-start gap-2">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                            <span>{String(line).replace(/^Address:\s*/, "")}</span>
                          </div>
                        ) : (
                          <p key={line}>{line}</p>
                        )
                      )}
                    </div>
                  ) : null}
                  {sourceContext.requestedServices && selectedServiceIds.length === 0 && services.length > 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No exact catalog match is selected yet. The original request stays in the notes so nothing is lost.
                    </p>
                  ) : null}
                </div>
              )}

              {/* Quote prefilled badge */}
              {quoteIdParam && showQuotePrefilledBadge && (
                <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  Services pre-filled from quote
                </div>
              )}

              {selectedServiceIds.length > 0 && (
                <div className="mt-4 rounded-[1.25rem] border border-primary/20 bg-primary/[0.04] p-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Services selected</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{selectedServiceIds.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Planned duration</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{totalDuration > 0 ? formatDuration(totalDuration) : "Not set"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Estimated total</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">${totalPrice.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3 border-t border-primary/15 pt-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Adjust booked service details</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Override service pricing or planned timing for this appointment without changing your catalog defaults.
                        </p>
                      </div>
                      <div className="grid gap-3">
                        {selectedServices.map((service) => (
                          <div
                            key={`service-price-${service.id}`}
                            className="grid gap-3 rounded-2xl border border-border/70 bg-background/80 p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{service.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Catalog {service.durationMinutes ? `${formatDuration(service.durationMinutes)} · ` : ""}price: ${toMoneyNumber(service.price).toFixed(2)}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`service-duration-${service.id}`}>Custom time</Label>
                              <div id={`service-duration-${service.id}`}>
                                <QuarterHourDurationGrid
                                  value={serviceDurationOverrides[service.id] ?? String(service.durationMinutes ?? "")}
                                  onChange={(value) => handleServiceDurationOverrideChange(service.id, value)}
                                  allowEmpty
                                  emptyLabel="Use catalog time"
                                  maxMinutes={12 * 60}
                                />
                              </div>
                            </div>
                            <div className="space-y-1 sm:max-w-[180px]">
                              <Label htmlFor={`service-price-${service.id}`}>Custom price</Label>
                              <Input
                                id={`service-price-${service.id}`}
                                inputMode="decimal"
                                value={servicePriceOverrides[service.id] ?? ""}
                                onChange={(event) => handleServicePriceOverrideChange(service.id, event.target.value)}
                                placeholder={toMoneyNumber(service.price).toFixed(2)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section: Schedule */}
          <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4 sm:px-5">
              <CardTitle className="text-base font-semibold">Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date picker */}
                <div className="space-y-2">
                  <Label>
                    {isMultiDayJob ? "Active Work Date" : "Date"} <span className="text-destructive">*</span>
                  </Label>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "h-11 w-full justify-start rounded-xl text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate
                          ? format(selectedDate, "PPP")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto overflow-hidden rounded-2xl p-0"
                      align="start"
                      onOpenAutoFocus={(event) => event.preventDefault()}
                    >
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          setSelectedDate(date);
                          setDatePickerOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Start time */}
                <div className="space-y-2">
                  <Label htmlFor="startTime">
                    {isMultiDayJob ? "Work Start" : "Start Time"} <span className="text-destructive">*</span>
                  </Label>
                  <ResponsiveTimeSelect
                    id="startTime"
                    value={startTime}
                    onChange={setStartTime}
                    options={timeOptions}
                    placeholder="Select a start time"
                    desktopClassName={timeSelectTriggerClassName}
                    mobileClassName={mobileTimeSelectClassName}
                    useNative={isSmallViewport}
                  />
                </div>

                {/* Estimated end time */}
                <div className="space-y-2">
                  <Label>{isMultiDayJob ? "Active Work Ends" : "Estimated End Time"}</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={
                        endDateTime
                          ? format(endDateTime, "h:mm a")
                          : startDateTime && totalDuration === 0
                          ? format(startDateTime, "h:mm a") + " (no duration set)"
                          : "—"
                      }
                      readOnly
                      className={readOnlyTimeClassName}
                    />
                  </div>
                </div>

                <div className="space-y-3 sm:col-span-2">
                  <div className="space-y-1">
                    <Label>Job format</Label>
                    <p className="text-xs text-muted-foreground">
                      Choose whether this is a single visit or a vehicle that stays in the shop across multiple days.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      className={cn(
                        "flex min-h-[86px] items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
                        !isMultiDayJob ? "border-primary bg-primary/5" : "border-border bg-background"
                      )}
                      onClick={() => setIsMultiDayJob(false)}
                    >
                      <SelectionIndicator checked={!isMultiDayJob} />
                      <div>
                        <p className="font-medium text-foreground">Single-day job</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          One active work window with no extended in-shop stay.
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "flex min-h-[86px] items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
                        isMultiDayJob ? "border-primary bg-primary/5" : "border-border bg-background"
                      )}
                      onClick={handleEnableMultiDayJob}
                    >
                      <SelectionIndicator checked={isMultiDayJob} />
                      <div>
                        <p className="font-medium text-foreground">Multi-day / on-site job</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Track drop-off, in-shop stage, and pickup without stretching one appointment across the whole calendar.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {isMultiDayJob ? (
                  <div className="space-y-4 rounded-[1.25rem] border border-border/70 bg-muted/10 p-3.5 sm:col-span-2 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Multi-day job timeline</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Drop-off and pickup are the main anchors. The active work window stays tied to the date and time above.
                        </p>
                      </div>
                      <Badge variant="secondary" className="w-fit shrink-0">
                        In shop
                      </Badge>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/90 p-2.5 sm:p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Shop stay</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Tap the drop-off day first, then the pickup day. The calendar will highlight the full in-shop span.
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground sm:text-right">
                          <p>{dropOffDateTime ? `Drop-off ${format(dropOffDateTime, "MMM d")}` : "Pick drop-off"}</p>
                          <p>{pickupDateTime ? `Pickup ${format(pickupDateTime, "MMM d")}` : "Pick pickup"}</p>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
                        <Calendar
                          mode="range"
                          selected={multiDayDateRange}
                          onSelect={handleMultiDayRangeChange}
                          defaultMonth={multiDayDateRange?.from ?? selectedDate ?? new Date()}
                          numberOfMonths={isSmallViewport ? 1 : 2}
                          className="w-full p-1 sm:p-2 [--cell-size:2.5rem] sm:[--cell-size:2.75rem]"
                          classNames={{
                            root: "w-full",
                            months: "flex flex-col gap-3 md:flex-row",
                            month: "w-full gap-3",
                            table: "w-full table-fixed border-collapse",
                            month_caption: "flex h-(--cell-size) w-full items-center justify-center px-9 sm:px-(--cell-size)",
                            nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
                            weekday: "flex-1 rounded-md text-[0.68rem] font-medium text-muted-foreground sm:text-[0.8rem]",
                          }}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                          <Label htmlFor="job-start-date">Drop-off date</Label>
                          <Input
                            id="job-start-date"
                            type="date"
                            value={jobStartDate}
                            onChange={(event) => setJobStartDate(event.target.value)}
                            className={dateInputClassName}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="job-start-time">Drop-off time</Label>
                          <ResponsiveTimeSelect
                            id="job-start-time"
                            value={jobStartTime}
                            onChange={setJobStartTime}
                            options={timeOptions}
                            placeholder="Select a time"
                            desktopClassName={timeSelectTriggerClassName}
                            mobileClassName={mobileTimeSelectClassName}
                            useNative={isSmallViewport}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="expected-completion-date">Pickup date</Label>
                          <Input
                            id="expected-completion-date"
                            type="date"
                            value={expectedCompletionDate}
                            onChange={(event) => handleExpectedCompletionDateChange(event.target.value)}
                            className={dateInputClassName}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="expected-completion-time">Pickup time</Label>
                          <ResponsiveTimeSelect
                            id="expected-completion-time"
                            value={expectedCompletionTime}
                            onChange={handleExpectedCompletionTimeChange}
                            options={timeOptions}
                            placeholder="Select a time"
                            desktopClassName={timeSelectTriggerClassName}
                            mobileClassName={mobileTimeSelectClassName}
                            useNative={isSmallViewport}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-3 rounded-xl border border-border/60 bg-background/90 p-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current in-shop stage</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Show whether the vehicle is actively being worked on, waiting, curing, or ready to leave.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Stage</Label>
                          {isSmallViewport ? (
                            <div className="relative">
                              <select
                                value={jobPhase}
                                onChange={(event) => setJobPhase(event.target.value)}
                                className={mobileFormSelectClassName}
                              >
                                {MULTI_DAY_PHASE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            </div>
                          ) : (
                            <Select value={jobPhase} onValueChange={setJobPhase}>
                              <SelectTrigger className={timeSelectTriggerClassName}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MULTI_DAY_PHASE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="pickup-ready-date">Pickup ready date</Label>
                            <Input
                              id="pickup-ready-date"
                              type="date"
                              value={pickupReadyDate}
                              onChange={(e) => setPickupReadyDate(e.target.value)}
                              className={dateInputClassName}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Pickup ready time</Label>
                            <ResponsiveTimeSelect
                              value={pickupReadyTime}
                              onChange={setPickupReadyTime}
                              options={timeOptions}
                              placeholder="Select time"
                              desktopClassName={timeSelectTriggerClassName}
                              mobileClassName={mobileTimeSelectClassName}
                              useNative={isSmallViewport}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-xl border border-dashed border-border/70 bg-background/80 p-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Calendar preview</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            These anchors drive how the job reads across the calendar.
                          </p>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                            <CalendarIcon className="mt-0.5 h-4 w-4 text-amber-600" />
                            <div>
                              <p className="font-medium text-foreground">Drop-off</p>
                              <p className="text-xs text-muted-foreground">
                                {dropOffDateTime ? format(dropOffDateTime, "EEE, MMM d 'at' h:mm a") : "Set the arrival date and time."}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                            <Clock className="mt-0.5 h-4 w-4 text-violet-600" />
                            <div>
                              <p className="font-medium text-foreground">Active work</p>
                              <p className="text-xs text-muted-foreground">
                                {startDateTime
                                  ? `${format(startDateTime, "EEE, MMM d 'at' h:mm a")}${endDateTime ? ` to ${format(endDateTime, "h:mm a")}` : ""}`
                                  : "Pick the main labor date and time above."}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                            <Package className="mt-0.5 h-4 w-4 text-sky-600" />
                            <div>
                              <p className="font-medium text-foreground">{getMultiDayPhaseLabel(jobPhase)}</p>
                              <p className="text-xs text-muted-foreground">
                                {pickupDateTime ? `Vehicle leaves ${format(pickupDateTime, "EEE, MMM d 'at' h:mm a")}` : "Set the planned pickup time."}
                                {pickupReadyDateTime ? ` Pickup ready ${format(pickupReadyDateTime, "EEE, MMM d 'at' h:mm a")}.` : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Staff */}
                <div className="space-y-2">
                  <Label>Assigned Staff</Label>
                  {isSmallViewport ? (
                    <div className="relative">
                      <select
                        value={selectedStaffId ?? "none"}
                        onChange={(event) =>
                          setSelectedStaffId(event.target.value === "none" ? null : event.target.value)
                        }
                        className={mobileFormSelectClassName}
                        disabled={staffFetching}
                      >
                        <option value="none">No staff assigned</option>
                        {staffFetching ? <option value="loading">Loading...</option> : null}
                        {!staffFetching
                          ? staff.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.firstName} {s.lastName}
                                {s.role ? ` - ${s.role}` : ""}
                              </option>
                            ))
                          : null}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  ) : (
                  <Select
                    value={selectedStaffId ?? "none"}
                    onValueChange={(val) =>
                      setSelectedStaffId(val === "none" ? null : val)
                    }
                  >
                    <SelectTrigger className={timeSelectTriggerClassName}>
                      <SelectValue placeholder="No staff assigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No staff assigned</SelectItem>
                      {staffFetching ? (
                        <SelectItem value="loading" disabled>
                          Loading...
                        </SelectItem>
                      ) : (
                        staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.firstName} {s.lastName}
                            {s.role ? ` — ${s.role}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  )}
                </div>
              </div>

              {/* Location selector */}
              {locationsData && locationsData.length > 0 && (
                <div className="space-y-2">
                  <Label>Location (optional)</Label>
                  <Select
                    value={selectedLocationId ?? "none"}
                    onValueChange={(val) =>
                      setSelectedLocationId(val === "none" ? null : val)
                    }
                  >
                        <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="Any / No Location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any / No Location</SelectItem>
                      {locationsData.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                          {loc.address ? ` — ${loc.address}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Service duration mismatch warning */}
              {(() => {
                if (!selectedServiceIds.length || !startDateTime || !endDateTime) return null;
                const requiredMinutes = effectiveDuration;
                const bookedMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 60000);
                if (requiredMinutes > 0 && bookedMinutes > 0 && bookedMinutes < requiredMinutes * 0.8) {
                  return (
                    <div className="flex items-start gap-2 text-sm text-amber-600 pt-1">
                      <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        Heads up: selected services need ~{formatDuration(requiredMinutes)} but the slot is only {formatDuration(bookedMinutes)}. Consider extending the end time.
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </CardContent>
          </Card>

          {/* Section: Details */}
          <Card className="overflow-hidden rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-border/60 bg-slate-50/60 px-4 py-4 sm:px-5">
              <CardTitle className="text-base font-semibold">
                Additional Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              {/* Is Mobile */}
              <div
                className={cn(
                  "flex min-h-[72px] cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors",
                  isMobile ? "border-primary bg-primary/5" : "border-border"
                )}
                onClick={() => {
                  setIsMobile((v) => !v);
                  if (isMobile) setMobileAddress("");
                }}
              >
                <SelectionIndicator checked={isMobile} />
                <div>
                  <Label
                    htmlFor="isMobile"
                    className="font-medium cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Mobile Service
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This appointment will be performed at the client's location
                  </p>
                </div>
              </div>

              {/* Mobile Address */}
              {isMobile && (
                <div className="space-y-2">
                  <Label htmlFor="mobileAddress">
                    Service Address <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Textarea
                      id="mobileAddress"
                      placeholder="Enter the service address..."
                      value={mobileAddress}
                      onChange={(e) => setMobileAddress(e.target.value)}
                      className="min-h-[92px] resize-none rounded-xl pl-9"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="depositAmount">Deposit Amount</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="depositAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="h-11 rounded-xl pl-9"
                    />
                  </div>
                </div>

                {!selectedClientId && totalPrice > 0 ? (
                  <div className="space-y-2">
                    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Mark internal block as paid</p>
                          <p className="text-xs text-muted-foreground">
                            This records the full appointment amount as already settled without creating an invoice.
                          </p>
                        </div>
                        <Switch checked={markInternalAsPaid} onCheckedChange={setMarkInternalAsPaid} />
                      </div>
                      {markInternalAsPaid ? (
                        <p className="text-xs text-muted-foreground">
                          Paid amount will be recorded as ${totalPrice.toFixed(2)}.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="appointmentTaxRate">Tax Rate</Label>
                  <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Apply tax</p>
                        <p className="text-xs text-muted-foreground">Use your default rate or override it for this appointment.</p>
                      </div>
                      <Switch checked={applyTax} onCheckedChange={setApplyTax} />
                    </div>
                    <Input
                      id="appointmentTaxRate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="0"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      disabled={!applyTax}
                      className="h-11 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="appointmentAdminFeeRate">Admin Fee</Label>
                  <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Add admin fee</p>
                        <p className="text-xs text-muted-foreground">Apply an adjustable admin fee as a percentage of selected services.</p>
                      </div>
                      <Switch checked={applyAdminFee} onCheckedChange={setApplyAdminFee} />
                    </div>
                    <div className="flex">
                      <Input
                        id="appointmentAdminFeeRate"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0"
                        value={adminFeeRate}
                        onChange={(e) => setAdminFeeRate(e.target.value)}
                        disabled={!applyAdminFee}
                        className="h-11 rounded-r-none"
                      />
                      <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Notes about this appointment (visible to client)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[92px] resize-none rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="internalNotes">Internal Notes</Label>
                  <Textarea
                    id="internalNotes"
                    placeholder="Internal notes (not visible to client)..."
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    className="min-h-[92px] resize-none rounded-xl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <Card className="overflow-hidden rounded-[1.35rem] border-primary/25 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
              <CardHeader className="border-b border-primary/15 bg-primary/[0.04] px-4 py-4">
                <CardTitle className="text-base font-semibold">
                  Booking summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 text-sm">
                {selectedClient && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Client</span>
                    <span className="font-medium">
                      {selectedClient.firstName} {selectedClient.lastName}
                    </span>
                  </div>
                )}
                {startDateTime && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start</span>
                    <span className="font-medium">
                      {format(startDateTime, "PPP 'at' h:mm a")}
                    </span>
                  </div>
                )}
                {endDateTime && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">End</span>
                    <span className="font-medium">
                      {format(endDateTime, "h:mm a")}
                    </span>
                  </div>
                )}
                {selectedServiceIds.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    {selectedServiceIds.map((id) => {
                      const s = services.find((sv) => sv.id === id);
                      if (!s) return null;
                      const linePrice =
                        servicePriceOverrides[id] != null && servicePriceOverrides[id] !== ""
                          ? toMoneyNumber(servicePriceOverrides[id])
                          : toMoneyNumber(s.price);
                      const lineDuration =
                        serviceDurationOverrides[id] != null && serviceDurationOverrides[id] !== ""
                          ? Number(serviceDurationOverrides[id])
                          : Number(s.durationMinutes ?? 0);
                      return (
                        <div key={id} className="flex justify-between">
                          <span className="text-muted-foreground">
                            {s.name}
                            {lineDuration > 0 ? ` · ${formatDuration(lineDuration)}` : ""}
                          </span>
                          <span>${linePrice.toFixed(2)}</span>
                        </div>
                      );
                    })}
                    <Separator className="my-2" />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Services subtotal</span>
                      <span>${totalPrice.toFixed(2)}</span>
                    </div>
                    {applyAdminFee && effectiveAdminFee > 0 ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Admin fee ({adminFeeRateNum}%)</span>
                        <span>${effectiveAdminFee.toFixed(2)}</span>
                      </div>
                    ) : null}
                    {applyTax && taxAmount > 0 ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tax ({taxRateNum}%)</span>
                        <span>${taxAmount.toFixed(2)}</span>
                      </div>
                    ) : null}
                    {depositAmount && Number(depositAmount) > 0 ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deposit to collect</span>
                        <span>${Number(depositAmount).toFixed(2)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span>${appointmentTotal.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {!selectedServiceIds.length && !startDateTime ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                    Pick services and a date to build the booking total.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-[1.35rem] border-border/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <CardContent className="space-y-3 p-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Duration</p>
                    <p className="mt-1 text-lg font-semibold">{totalDuration > 0 ? formatDuration(totalDuration) : "TBD"}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total</p>
                    <p className="mt-1 text-lg font-semibold">${appointmentTotal.toFixed(2)}</p>
                  </div>
                </div>
                <Button type="submit" disabled={isLoading} className="h-11 w-full rounded-xl">
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Appointment"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(returnTo)}
                  disabled={isLoading}
                  className="h-11 w-full rounded-xl"
                >
                  Back
                </Button>
              </CardContent>
            </Card>
          </aside>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Estimated total</p>
                <p className="text-lg font-semibold">${appointmentTotal.toFixed(2)}</p>
              </div>
              <Button type="submit" disabled={isLoading} className="shrink-0">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
