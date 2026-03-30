import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useOutletContext, useSearchParams, Link } from "react-router";
import { useFindFirst, useFindMany, useFindOne, useAction } from "../hooks/useApi";
import { format, addMinutes } from "date-fns";
import {
  CalendarIcon,
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
  Search,
  X,
} from "lucide-react";
import { api } from "../api";
import { formatServiceCategory } from "../lib/serviceCatalog";
import type { AuthOutletContext } from "./_app";
import { getWorkflowCreationPreset } from "../lib/workflowCreationPresets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { VehicleCatalogFields } from "../components/vehicles/VehicleCatalogFields";
import {
  emptyVehicleCatalogFormValue,
  formatVehicleLabel,
  type VehicleCatalogFormValue,
} from "../lib/vehicles";

const toMoneyNumber = (value: unknown): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

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

export default function NewAppointmentPage() {
  const { user, businessId, businessType, currentLocationId } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const creationPreset = useMemo(() => getWorkflowCreationPreset(businessType), [businessType]);

  const [searchParams] = useSearchParams();
  const quoteIdParam = searchParams.get("quoteId");
  const clientIdParam = searchParams.get("clientId");
  const vehicleIdParam = searchParams.get("vehicleId");
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : "/appointments";
  const hasQueueReturn = searchParams.has("from");

  // Form state
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => undefined);
  const [startTime, setStartTime] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toTimeString().slice(0, 5);
  });
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileAddress, setMobileAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
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
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(currentLocationId);
  const [showQuotePrefilledBadge, setShowQuotePrefilledBadge] = useState(false);
  const hasPrefilledFromQuote = useRef(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const internalNotesRef = useRef<HTMLTextAreaElement | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState<string>("");
  const [debouncedClientQuery, setDebouncedClientQuery] = useState<string>("");
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");

  // Pre-fill client, date and time from URL query params
  useEffect(() => {
    if (clientIdParam && selectedClientId === null) {
      setSelectedClientId(clientIdParam);
    }
    if (vehicleIdParam && selectedVehicleId === null) {
      setSelectedVehicleId(vehicleIdParam);
    }
    const timeParam = searchParams.get("time");
    if (timeParam) setStartTime(timeParam);
    const dateParam = searchParams.get("date");
    if (dateParam && !selectedDate) {
      const d = new Date(dateParam + "T12:00:00");
      if (!isNaN(d.getTime())) setSelectedDate(d);
    }
  }, [searchParams, clientIdParam, vehicleIdParam, selectedClientId, selectedVehicleId]);

  // Default selectedDate to today on the client when no date param is provided
  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (!dateParam && selectedDate === undefined) {
      setSelectedDate(new Date());
    }
  }, []);

  useEffect(() => {
    if (creationPreset.defaultMobile) {
      setIsMobile(true);
    }
  }, [creationPreset.defaultMobile]);

  useEffect(() => {
    setSelectedLocationId(currentLocationId);
  }, [currentLocationId]);

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
    select: { defaultTaxRate: true },
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

  const [{ data: clientsData, fetching: clientsFetching }] = useFindMany(
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

  // Derived calculations
  const { totalPrice, totalDuration } = useMemo(() => {
    return selectedServiceIds.reduce(
      (acc, id) => {
        const service = servicesData?.find((s) => s.id === id);
        if (service) {
          acc.totalPrice += toMoneyNumber(service.price);
          acc.totalDuration += service.durationMinutes ?? 0;
        }
        return acc;
      },
      { totalPrice: 0, totalDuration: 0 }
    );
  }, [selectedServiceIds, servicesData]);

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

  // Set selected client from prefilled data when arriving via URL param
  useEffect(() => {
    if (prefilledClientData && selectedClientId === null) {
      setSelectedClientId(prefilledClientData.id);
    }
  }, [prefilledClientData]);

  // Auto-select sole vehicle when client has exactly one vehicle
  useEffect(() => {
    if (vehiclesData && vehiclesData.length === 1 && selectedVehicleId === null) {
      setSelectedVehicleId(vehiclesData[0].id);
    }
  }, [vehiclesData, selectedClientId]);

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
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

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
    setSelectedClientId(clientId === selectedClientId ? null : clientId);
    setSelectedVehicleId(null);
    setClientSearchOpen(false);
    setClientSearchQuery("");
  };

  const applyTemplateToNotes = useCallback(
    (
      template: string,
      setter: React.Dispatch<React.SetStateAction<string>>,
      inputRef: React.RefObject<HTMLTextAreaElement | null>,
      successMessage: string
    ) => {
      let applied = false;
      setter((current) => {
        if (current.includes(template)) {
          return current;
        }
        applied = true;
        return current.trim() ? `${current.trim()}\n\n${template}` : template;
      });
      window.requestAnimationFrame(() => {
        inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        inputRef.current?.focus();
      });
      toast.success(applied ? successMessage : "Notes were already applied");
    },
    []
  );

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
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

    if (!selectedClientId) {
      setFormError("Please select a client.");
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
    if (isMobile && !mobileAddress.trim()) {
      setFormError("Please enter the service address for this mobile appointment.");
      return;
    }

    if (selectedClientId && !selectedVehicleId) {
      setVehicleError("Please select a vehicle for this appointment. If the client has no vehicles, use the 'Add Vehicle Now' button above.");
      return;
    }

    if (!businessId) {
      setFormError("Business not found.");
      return;
    }

    setIsSubmitting(true);
    try {
      const clientNotes = notes.trim();
      const mobileAddressNote = isMobile && mobileAddress.trim() ? `Mobile service address: ${mobileAddress.trim()}` : "";
      const persistedNotes = [mobileAddressNote, clientNotes].filter(Boolean).join("\n\n") || undefined;
      const autoTitle = selectedServiceIds.length
        ? selectedServiceIds
            .map((id) => servicesData?.find((s) => s.id === id)?.name)
            .filter(Boolean)
            .join(" + ")
        : "Appointment";
      const result = await createAppointment({
        clientId: selectedClientId,
        vehicleId: selectedVehicleId!,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime ? endDateTime.toISOString() : undefined,
        title: autoTitle || undefined,
        assignedStaffId: selectedStaffId ?? undefined,
        locationId: selectedLocationId ?? undefined,
        depositAmount: depositAmount ? Number(depositAmount) : undefined,
        notes: persistedNotes,
        internalNotes: internalNotes.trim() || undefined,
        ...(quoteIdParam ? { quoteId: quoteIdParam } : {}),
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

  const selectedClient =
    clientsData?.find((c) => c.id === selectedClientId) ??
    (prefilledClientData?.id === selectedClientId ? prefilledClientData : undefined);
  const vehicles = vehiclesData ?? [];
  const clients = clientsData ?? [];
  const services = servicesData ?? [];
  const requiresServiceSelection = services.length > 0;
  const addonLinks = (packageAddonLinks ?? []) as Array<{ parentServiceId: string; addonServiceId: string }>;
  const packageTemplates = services
    .filter((service) => !service.isAddon)
    .map((service) => {
      const linkedAddons = addonLinks
        .filter((link) => link.parentServiceId === service.id)
        .map((link) => services.find((candidate) => candidate.id === link.addonServiceId))
        .filter(Boolean);
      return {
        baseService: service,
        linkedAddons,
        totalPackagePrice:
          Number(service.price ?? 0) +
          linkedAddons.reduce((sum, addon) => sum + Number(addon?.price ?? 0), 0),
        totalPackageDuration:
          Number(service.durationMinutes ?? 0) +
          linkedAddons.reduce((sum, addon) => sum + Number(addon?.durationMinutes ?? 0), 0),
      };
    })
    .filter((entry) => entry.linkedAddons.length > 0);
  const normalizedServiceSearch = serviceSearchQuery.trim().toLowerCase();
  const recommendedPackageTemplates = packageTemplates.filter((pkg) =>
    creationPreset.recommendedCategories.includes(String(pkg.baseService.category ?? "other")) &&
    [
      pkg.baseService.name,
      pkg.baseService.notes,
      ...pkg.linkedAddons.map((addon) => addon?.name),
      formatServiceCategory(pkg.baseService.category),
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
        formatServiceCategory(pkg.baseService.category),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedServiceSearch || "")
  );
  const groupedServices = useMemo(() => {
    const groups = new Map<string, typeof services>();
    for (const service of services) {
      const haystack = [service.name, service.notes, formatServiceCategory(service.category)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (normalizedServiceSearch && !haystack.includes(normalizedServiceSearch)) continue;
      const key = String(service.category ?? "other");
      const existing = groups.get(key);
      if (existing) existing.push(service);
      else groups.set(key, [service]);
    }
    return Array.from(groups.entries())
      .sort(([left], [right]) => {
        const leftRecommended = creationPreset.recommendedCategories.includes(left);
        const rightRecommended = creationPreset.recommendedCategories.includes(right);
        if (leftRecommended !== rightRecommended) return leftRecommended ? -1 : 1;
        return formatServiceCategory(left).localeCompare(formatServiceCategory(right));
      })
      .map(([category, entries]) => ({
        category,
        title: formatServiceCategory(category),
        recommended: creationPreset.recommendedCategories.includes(category),
        services: entries.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [creationPreset.recommendedCategories, normalizedServiceSearch, services]);
  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service.id)),
    [selectedServiceIds, services]
  );
  const staff = staffData ?? [];
  const isLoading = isSubmitting || actionFetching;
  const selectedVehicleLabel = selectedVehicleId
    ? formatVehicleLabel(vehicles.find((vehicle) => vehicle.id === selectedVehicleId) as any)
    : null;
  const bookingSnapshot = [
    selectedDate ? format(selectedDate, "EEE, MMM d") : "Pick a date",
    startTime || "Set a start time",
  ].join(" · ");
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 pb-28 sm:p-6 sm:pb-6 lg:p-8">
        {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to appointments queue" /> : null}
        {/* Header */}
        <div className="mb-6 overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/80 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_30px_70px_rgba(15,23,42,0.08)] backdrop-blur-md">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,255,255,0))] px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => navigate(returnTo)}
                className="shrink-0"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-[2rem]">New Appointment</h1>
                {currentLocationId && locationsData?.some((location) => location.id === currentLocationId) ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Defaulting to {locationsData.find((location) => location.id === currentLocationId)?.name ?? "current location"}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/70 bg-white/72 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Client</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : "Select"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/72 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Vehicle</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedVehicleLabel || "Select"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/72 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Services</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedServiceIds.length > 0 ? `${selectedServiceIds.length} selected` : "Select"}
                </p>
                {totalDuration > 0 ? <p className="mt-1 text-xs text-muted-foreground">{formatDuration(totalDuration)}</p> : null}
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/72 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Run of show</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{bookingSnapshot}</p>
                {endDateTime ? <p className="mt-1 text-xs text-muted-foreground">Ends {format(endDateTime, "h:mm a")}</p> : null}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error alert */}
          {formError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          {/* Section: Client & Vehicle */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Client &amp; Vehicle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Client searchable select */}
              <div className="space-y-2">
                <Label>
                  Client <span className="text-destructive">*</span>
                </Label>
                <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientSearchOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedClient
                        ? `${selectedClient.firstName} ${selectedClient.lastName}${selectedClient.phone ? ` — ${selectedClient.phone}` : ""}`
                        : clientsFetching
                        ? "Loading clients..."
                        : "Search clients..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
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
                            ? "No clients yet. Create one first."
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
              </div>

              {/* Vehicle select */}
              <div className="space-y-2">
                <Label>Vehicle <span className="text-destructive">*</span></Label>
                {selectedClientId && vehiclesData && vehicles.length === 0 && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                    <AlertDescription>
                      This client has no vehicles on file. Add one below before booking the appointment.
                    </AlertDescription>
                  </Alert>
                )}
                {!selectedClientId ? (
                  <p className="text-sm text-muted-foreground italic">
                    Select a client first to load their vehicles.
                  </p>
                ) : vehiclesFetching ? (
                  <p className="text-sm text-muted-foreground">
                    Loading vehicles...
                  </p>
                ) : vehicles.length === 0 ? (
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                    <p className="text-sm text-muted-foreground italic">
                      No vehicles on file for this client. Add one now to keep booking moving.
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
                    <SelectTrigger>
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
                {vehicleError && (
                  <p className="text-xs text-destructive mt-1">{vehicleError}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section: Services */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Services</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{creationPreset.title}</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        applyTemplateToNotes(
                          creationPreset.appointmentClientNotes,
                          setNotes,
                          notesRef,
                          "Client intake notes applied"
                        )
                      }
                    >
                      Apply client intake
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        applyTemplateToNotes(
                          creationPreset.appointmentInternalNotes,
                          setInternalNotes,
                          internalNotesRef,
                          "Internal handoff notes applied"
                        )
                      }
                    >
                      Apply internal handoff
                    </Button>
                    {creationPreset.defaultMobile ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => setIsMobile(true)}>
                        Mark as mobile
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

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
                  <div className="rounded-xl border border-border/70 bg-background p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-medium">Build the job fast</p>
                        <p className="text-sm text-muted-foreground">
                          Start with a package if the work is standard, or expand a category for one-off services.
                        </p>
                      </div>
                      <div className="relative w-full lg:max-w-xs">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={serviceSearchQuery}
                          onChange={(event) => setServiceSearchQuery(event.target.value)}
                          placeholder="Search services, notes, or category..."
                          className="pl-9"
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
                            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-primary/10"
                          >
                            <span>{service.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {service.durationMinutes ? `${formatDuration(service.durationMinutes)} · ` : ""}
                              ${toMoneyNumber(service.price).toFixed(2)}
                            </span>
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-muted-foreground">
                        No services selected yet. Pick a package or expand a category below.
                      </p>
                    )}
                  </div>

                  {recommendedPackageTemplates.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-muted-foreground">Recommended packages</p>
                      </div>
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
                            className="rounded-xl border border-border/70 bg-card p-4 text-left transition-colors hover:bg-muted/30"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{pkg.baseService.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatServiceCategory(pkg.baseService.category)} · {pkg.linkedAddons.length + 1} services
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
                              Includes {pkg.linkedAddons.map((addon) => addon?.name).join(", ")}.
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {otherPackageTemplates.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-muted-foreground">Other package templates</p>
                      </div>
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
                            className="rounded-xl border border-border/70 bg-card p-4 text-left transition-colors hover:bg-muted/30"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{pkg.baseService.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatServiceCategory(pkg.baseService.category)} · {pkg.linkedAddons.length + 1} services
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
                              Includes {pkg.linkedAddons.map((addon) => addon?.name).join(", ")}.
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {groupedServices.length > 0 ? (
                    <Accordion type="multiple" className="rounded-xl border border-border/70 bg-card px-4">
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
                                      "flex select-none items-center gap-3 rounded-lg border p-3 transition-colors",
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

              {/* Quote prefilled badge */}
              {quoteIdParam && showQuotePrefilledBadge && (
                <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  Services pre-filled from quote
                </div>
              )}

              {selectedServiceIds.length > 0 && (
                <div className="mt-4 rounded-[1.1rem] border border-primary/20 bg-primary/[0.04] p-4">
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
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section: Schedule */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date picker */}
                <div className="space-y-2">
                  <Label>
                    Date <span className="text-destructive">*</span>
                  </Label>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate
                          ? format(selectedDate, "PPP")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
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
                    Start Time <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="startTime"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Estimated end time */}
                <div className="space-y-2">
                  <Label>Estimated End Time</Label>
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
                      className="pl-9 bg-muted/50 text-muted-foreground cursor-default"
                    />
                  </div>
                </div>

                {/* Staff */}
                <div className="space-y-2">
                  <Label>Assigned Staff</Label>
                  <Select
                    value={selectedStaffId ?? "none"}
                    onValueChange={(val) =>
                      setSelectedStaffId(val === "none" ? null : val)
                    }
                  >
                    <SelectTrigger>
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
                </div>
              </div>

              {/* Location selector */}
              {locationsData && locationsData.length > 0 && (
                <div className="space-y-2">
                  <Label>Location (optional)</Label>
                  <Select
                    value={selectedLocationId ?? ""}
                    onValueChange={(val) =>
                      setSelectedLocationId(val === "" ? null : val)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any / No Location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any / No Location</SelectItem>
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
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Additional Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Is Mobile */}
              <div
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
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
                      className="pl-9 min-h-[80px] resize-none"
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
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    ref={notesRef}
                    placeholder="Notes about this appointment (visible to client)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[80px] resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="internalNotes">Internal Notes</Label>
                  <Textarea
                    id="internalNotes"
                    ref={internalNotesRef}
                    placeholder="Internal notes (not visible to client)..."
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    className="min-h-[80px] resize-none"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary card */}
          {(selectedServiceIds.length > 0 || startDateTime) && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  Appointment Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
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
                      return (
                        <div key={id} className="flex justify-between">
                          <span className="text-muted-foreground">{s.name}</span>
                          <span>${toMoneyNumber(s.price).toFixed(2)}</span>
                        </div>
                      );
                    })}
                    <Separator className="my-2" />
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span>${totalPrice.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-4 pb-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(returnTo)}
              disabled={isLoading}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <Button type="submit" disabled={isLoading} className="min-w-[140px]">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Appointment"
              )}
            </Button>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Estimated total</p>
                <p className="text-lg font-semibold">${totalPrice.toFixed(2)}</p>
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
