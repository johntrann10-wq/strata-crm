import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useSearchParams } from "react-router";
import { API_BASE } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, CalendarDays, CarFront, CheckCircle2, Clock3, Loader2, MapPin, ShieldCheck, Sparkles, UserRound } from "lucide-react";

type BookingAddon = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  depositAmount: number;
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
  serviceMode: "in_shop" | "mobile" | "both";
  featured: boolean;
  showPrice: boolean;
  showDuration: boolean;
  addons: BookingAddon[];
};

type BookingConfig = {
  businessId: string;
  businessName: string;
  businessType: string | null;
  timezone: string;
  title: string;
  subtitle: string;
  confirmationMessage: string | null;
  trustPoints: string[];
  notesPrompt: string;
  defaultFlow: "request" | "self_book";
  requireEmail: boolean;
  requirePhone: boolean;
  requireVehicle: boolean;
  allowCustomerNotes: boolean;
  showPrices: boolean;
  showDurations: boolean;
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

type BookingFormState = {
  serviceId: string;
  addonServiceIds: string[];
  serviceMode: "in_shop" | "mobile";
  locationId: string;
  bookingDate: string;
  startTime: string;
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

type StepKey = "service" | "vehicle" | "location" | "timing" | "contact" | "review";
type FlowStep = { key: StepKey; label: string; title: string; description: string };
const UNCATEGORIZED_CATEGORY = "uncategorized";

function emptyForm(): BookingFormState {
  return {
    serviceId: "",
    addonServiceIds: [],
    serviceMode: "in_shop",
    locationId: "",
    bookingDate: "",
    startTime: "",
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
const formatPrice = (price: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
function formatDuration(minutes: number) {
  if (!minutes || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours > 0 && remaining > 0) return `${hours}h ${remaining}m`;
  if (hours > 0) return `${hours}h`;
  return `${remaining}m`;
}
function toDateInputValue(offsetDays = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function stepIcon(step: StepKey) {
  switch (step) {
    case "vehicle": return CarFront;
    case "location": return MapPin;
    case "timing": return CalendarDays;
    case "contact": return UserRound;
    case "review": return ShieldCheck;
    default: return Sparkles;
  }
}
function stepDefinitions(modeStepType: "none" | "location" | "service_mode", flow: "request" | "self_book", activeServiceMode: "in_shop" | "mobile" | "both" | null): FlowStep[] {
  const steps: FlowStep[] = [
    { key: "service", label: "Service", title: "Choose your service", description: "Start with the service or package you want help with." },
    { key: "vehicle", label: "Vehicle", title: "Add vehicle details", description: "A few basics help the shop prep the right next step." },
  ];
  if (modeStepType === "location") {
    steps.push({ key: "location", label: "Location", title: "Choose a location", description: "Pick where this visit should happen." });
  }
  if (modeStepType === "service_mode") {
    steps.push({
      key: "location",
      label: activeServiceMode === "mobile" ? "Address" : "Location",
      title: activeServiceMode === "mobile" ? "Confirm where the service happens" : "Choose where the service happens",
      description:
        activeServiceMode === "both"
          ? "Choose in-shop or mobile service so the booking stays accurate."
          : activeServiceMode === "mobile"
            ? "Add the address for the mobile or on-site visit."
            : "Pick the shop location for this visit.",
    });
  }
  steps.push(
    { key: "timing", label: "Timing", title: flow === "self_book" ? "Choose a date and time" : "Choose your timing", description: flow === "self_book" ? "Pick from live availability for this service." : "Share the timing that works best and the shop can confirm the next step." },
    { key: "contact", label: "Contact", title: "How should the shop reach you?", description: "Add the best way to follow up about your booking or request." },
    { key: "review", label: "Review", title: flow === "self_book" ? "Review and confirm" : "Review and send", description: "Add any extras or notes, then send everything in one clean pass." }
  );
  return steps;
}

function toCategoryFilterValue(categoryId: string | null | undefined) {
  return categoryId || UNCATEGORIZED_CATEGORY;
}

export function meta() {
  return [
    { title: "Book online | Strata" },
    { name: "description", content: "Choose a service, pick a time, and share your vehicle details without the back-and-forth." },
  ];
}

export default function PublicBookingPage() {
  const { businessId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig] = useState<BookingConfig | null>(null);
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
  const didHydrateQueryRef = useRef<string | null>(null);

  const source = useMemo(() => searchParams.get("source") || searchParams.get("utm_source") || searchParams.get("ref") || "website", [searchParams]);
  const campaign = useMemo(() => searchParams.get("campaign") || searchParams.get("utm_campaign") || "", [searchParams]);
  const requestedServiceId = searchParams.get("service");
  const requestedCategoryId = searchParams.get("category");
  const requestedStep = searchParams.get("step");

  const updateBookingQuery = (updates: { serviceId?: string | null; categoryId?: string | null; step?: "service" | null }) => {
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
    setSearchParams(next, { replace: true, preventScrollReset: true });
  };

  useEffect(() => {
    if (!businessId) {
      setPageError("This booking page link is invalid.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPageError(null);
    fetch(buildApiUrl(`/api/businesses/${encodeURIComponent(businessId)}/public-booking-config`))
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message || "This booking page is unavailable right now.");
        }
        return response.json() as Promise<BookingConfig>;
      })
      .then((payload) => {
        if (cancelled) return;
        const requestedService = requestedServiceId && payload.services.some((service) => service.id === requestedServiceId) ? requestedServiceId : "";
        const requestedCategory =
          requestedCategoryId && payload.services.some((service) => toCategoryFilterValue(service.categoryId) === requestedCategoryId)
            ? requestedCategoryId
            : "";
        const requestedServiceRecord = requestedService ? payload.services.find((service) => service.id === requestedService) ?? null : null;
        const initialCategory =
          requestedCategory ||
          (requestedServiceRecord ? toCategoryFilterValue(requestedServiceRecord.categoryId) : "all");
        setConfig(payload);
        const hydrationKey = businessId ?? "";
        if (didHydrateQueryRef.current !== hydrationKey) {
          didHydrateQueryRef.current = hydrationKey;
          setServiceCategoryFilter(initialCategory || "all");
          setExpandedServiceId(requestedStep === "service" && requestedService ? requestedService : "");
          setForm((current) => ({
            ...current,
            serviceId: requestedService || current.serviceId,
            serviceMode: requestedServiceRecord?.serviceMode === "mobile" ? "mobile" : current.serviceMode,
            locationId: payload.locations.length === 1 ? payload.locations[0].id : current.locationId,
          }));
          setCurrentStep(requestedService ? (requestedStep === "service" ? 0 : 1) : 0);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) setPageError(fetchError instanceof Error ? fetchError.message : "This booking page is unavailable right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [businessId, requestedCategoryId, requestedServiceId, requestedStep]);

  const selectedService = useMemo(() => config?.services.find((service) => service.id === form.serviceId) ?? null, [config?.services, form.serviceId]);
  const selectedAddons = useMemo(() => selectedService?.addons.filter((addon) => form.addonServiceIds.includes(addon.id)) ?? [], [form.addonServiceIds, selectedService]);
  const effectiveFlow = selectedService?.effectiveFlow ?? config?.defaultFlow ?? "request";
  const selectedServiceMode = selectedService?.serviceMode ?? null;
  const activeServiceModeForStep = selectedServiceMode === "both" ? form.serviceMode : selectedServiceMode;
  const requiresLocationChoice = selectedServiceMode === "in_shop" && (config?.locations.length ?? 0) > 1;
  const requiresServiceModeStep = selectedServiceMode === "both" || selectedServiceMode === "mobile" || requiresLocationChoice;
  const locationStepType = requiresLocationChoice && selectedServiceMode !== "both" ? "location" : requiresServiceModeStep ? "service_mode" : "none";
  const steps = useMemo(() => stepDefinitions(locationStepType, effectiveFlow, activeServiceModeForStep), [activeServiceModeForStep, effectiveFlow, locationStepType]);
  const activeStep = steps[currentStep] ?? steps[0];

  useEffect(() => {
    if (currentStep >= steps.length) setCurrentStep(Math.max(steps.length - 1, 0));
  }, [currentStep, steps.length]);

  const subtotal = useMemo(() => (selectedService?.price ?? 0) + selectedAddons.reduce((sum, addon) => sum + addon.price, 0), [selectedAddons, selectedService]);
  const totalDuration = useMemo(() => (selectedService?.durationMinutes ?? 0) + selectedAddons.reduce((sum, addon) => sum + addon.durationMinutes, 0), [selectedAddons, selectedService]);
  const totalDeposit = useMemo(() => (selectedService?.depositAmount ?? 0) + selectedAddons.reduce((sum, addon) => sum + addon.depositAmount, 0), [selectedAddons, selectedService]);
  const canShowSelectedPrice = Boolean(config?.showPrices && selectedService?.showPrice !== false && selectedAddons.every((addon) => addon.showPrice !== false));
  const canShowSelectedDuration = Boolean(config?.showDurations && selectedService?.showDuration !== false && selectedAddons.every((addon) => addon.showDuration !== false));
  const minBookingDate = useMemo(() => toDateInputValue(Math.max(Math.ceil((selectedService?.leadTimeHours ?? 0) / 24), 0)), [selectedService?.leadTimeHours]);
  const maxBookingDate = useMemo(() => toDateInputValue(Math.max((selectedService?.bookingWindowDays ?? 30) + Math.ceil((selectedService?.leadTimeHours ?? 0) / 24) - 1, 0)), [selectedService?.bookingWindowDays, selectedService?.leadTimeHours]);

  useEffect(() => {
    if (!selectedService) {
      setAvailability(null);
      setAvailabilityError(null);
      return;
    }
    if (selectedService.effectiveFlow !== "self_book") {
      setAvailability({ effectiveFlow: "request", timezone: config?.timezone ?? "America/Los_Angeles", date: form.bookingDate || "", slots: [], durationMinutes: totalDuration, subtotal, depositAmount: totalDeposit });
      setAvailabilityError(null);
      return;
    }
    const date = form.bookingDate || minBookingDate;
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
    fetch(buildApiUrl(`/api/businesses/${encodeURIComponent(businessId ?? "")}/public-booking-availability?${query.toString()}`))
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
        setForm((current) => ({ ...current, bookingDate: date, startTime: payload.slots.some((slot) => slot.startTime === current.startTime) ? current.startTime : "" }));
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setAvailability(null);
          setAvailabilityError(fetchError instanceof Error ? fetchError.message : "Could not load availability.");
        }
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });
    return () => { cancelled = true; };
  }, [businessId, config?.timezone, form.addonServiceIds, form.bookingDate, form.locationId, form.serviceMode, minBookingDate, selectedService, subtotal, totalDeposit, totalDuration]);

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const options = [{ value: "all", label: "All services" }];
    for (const service of config?.services ?? []) {
      const value = toCategoryFilterValue(service.categoryId);
      if (seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label: service.categoryLabel ?? "Popular services" });
    }
    return options;
  }, [config?.services]);

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

  const selectedLocation = useMemo(() => config?.locations.find((location) => location.id === form.locationId) ?? null, [config?.locations, form.locationId]);
  const selectedTimeLabel = availability?.slots.find((slot) => slot.startTime === form.startTime)?.label ?? result?.scheduledFor ?? null;
  const stepProgress = steps.length > 0 ? Math.round(((currentStep + 1) / steps.length) * 100) : 0;
  const nextStepMessage =
    effectiveFlow === "self_book"
      ? "Choose a live slot, confirm the details, and get the confirmation right away."
      : "Send the request and the shop can confirm the best next step with you.";
  const summaryPromise =
    effectiveFlow === "self_book"
      ? "Confirmation is sent right after booking, with a customer portal link."
      : "The shop reviews the request with the full service and vehicle context.";
  const serviceModeLabel =
    selectedService?.serviceMode === "mobile"
      ? "Mobile / on-site"
      : selectedService?.serviceMode === "both"
        ? "Mobile or in-shop"
        : "In-shop";

  const moveToStep = (index: number) => {
    setStepError(null);
    setSubmitError(null);
    const nextIndex = Math.min(Math.max(index, 0), steps.length - 1);
    setCurrentStep(nextIndex);
    if (form.serviceId) {
      updateBookingQuery({
        serviceId: form.serviceId,
        categoryId: serviceCategoryFilter,
        step: nextIndex === 0 ? "service" : null,
      });
    }
  };

  const handleCategoryChange = (value: string) => {
    setServiceCategoryFilter(value);
    updateBookingQuery({ categoryId: value, step: activeStep?.key === "service" ? "service" : null });
  };

  const handleServiceSelect = (serviceId: string, options?: { stayOnServiceStep?: boolean }) => {
    const service = config?.services.find((entry) => entry.id === serviceId) ?? null;
    const nextCategory = service ? toCategoryFilterValue(service.categoryId) : serviceCategoryFilter;
    setServiceCategoryFilter(nextCategory);
    setExpandedServiceId(options?.stayOnServiceStep ? serviceId : "");
    setForm((current) => ({
      ...current,
      serviceId,
      addonServiceIds: [],
      startTime: "",
      serviceMode: service?.serviceMode === "mobile" ? "mobile" : "in_shop",
      locationId:
        service?.serviceMode === "mobile"
          ? ""
          : config?.locations.length === 1
            ? config.locations[0].id
            : current.locationId,
    }));
    setResult(null);
    updateBookingQuery({ serviceId, categoryId: nextCategory, step: options?.stayOnServiceStep ? "service" : null });
    moveToStep(options?.stayOnServiceStep ? 0 : 1);
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
      return form.vehicleMake.trim() && form.vehicleModel.trim() ? null : "Add the vehicle make and model so the shop knows what this job is for.";
    }
    if (step === "location") {
      if (locationStepType === "none") return null;
      if (selectedServiceMode === "both" && !form.serviceMode) return "Choose whether this visit is in-shop or mobile.";
      if (form.serviceMode === "mobile") {
        return form.serviceAddress.trim() ? null : "Add the service address so the team knows where to go.";
      }
      if (requiresLocationChoice) return form.locationId ? null : "Choose the location for this visit.";
      return null;
    }
    if (step === "timing") {
      if (effectiveFlow !== "self_book") return null;
      if (!form.bookingDate) return "Choose a preferred date to see available times.";
      return form.startTime ? null : "Choose a time to continue.";
    }
    if (step === "contact") {
      if (!form.firstName.trim() || !form.lastName.trim()) return "Add your first and last name so the shop knows who this request is for.";
      if (config.requireEmail && !form.email.trim()) return "Add an email address so the shop can confirm the booking.";
      if (config.requirePhone && !form.phone.trim()) return "Add the best phone number for follow-up.";
      return form.email.trim() || form.phone.trim() ? null : "Add at least an email or phone number so the shop can follow up.";
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
      const response = await fetch(buildApiUrl(`/api/businesses/${encodeURIComponent(businessId)}/public-bookings`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, serviceId: selectedService.id, addonServiceIds: form.addonServiceIds, source, campaign, startTime: effectiveFlow === "self_book" ? form.startTime || undefined : undefined, vehicleYear: form.vehicleYear ? Number(form.vehicleYear) : undefined }),
      });
      const payload = (await response.json().catch(() => ({}))) as BookingSubmitResult & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Could not complete the booking.");
      setResult(payload);
      setForm((current) => ({ ...emptyForm(), serviceId: current.serviceId, locationId: current.locationId }));
      setCurrentStep(0);
    } catch (submitErrorValue) {
      setSubmitError(submitErrorValue instanceof Error ? submitErrorValue.message : "Could not complete the booking.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedServiceSummary = selectedService ? (
    <div className="rounded-[1.5rem] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full border border-orange-200 bg-orange-50 text-orange-700">
              {effectiveFlow === "self_book" ? "Book instantly" : "Request review"}
            </Badge>
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white/90">
              {serviceModeLabel}
            </Badge>
            {totalDeposit > 0 ? (
              <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
                {formatPrice(totalDeposit)} deposit
              </Badge>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <p className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{selectedService.name}</p>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              {selectedService.description || nextStepMessage}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            {canShowSelectedPrice ? <span className="font-semibold text-slate-950">{formatPrice(subtotal)}</span> : null}
            {canShowSelectedDuration ? <span>{formatDuration(totalDuration)} estimated time</span> : null}
            <span>{summaryPromise}</span>
          </div>
        </div>
        {currentStep > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleServiceSelect(selectedService.id, { stayOnServiceStep: true })}
            className="rounded-xl border-slate-200 bg-white/90"
          >
            Change service
          </Button>
        ) : null}
      </div>
    </div>
  ) : null;

  const renderStepBody = () => {
    if (!config) return null;

    if (activeStep.key === "service") {
      return (
        <div className="space-y-6">
          {categoryOptions.length > 1 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">Browse services</p>
                <Badge variant="outline">{visibleServices.length} available</Badge>
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {categoryOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleCategoryChange(option.value)}
                    className={cn(
                      "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                      serviceCategoryFilter === option.value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {featuredServices.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950">Featured services</p>
                <Badge variant="outline">{featuredServices.length} highlighted</Badge>
              </div>
              <div className="grid gap-3">
                {featuredServices.map((service) => {
                  const active = service.id === form.serviceId;
                  const expanded = expandedServiceId === service.id;
                  return (
                    <div
                      key={service.id}
                      className={cn(
                        "rounded-[1.5rem] border bg-white p-5 text-left shadow-sm transition-all",
                        active
                          ? "border-orange-300 bg-orange-50/60 shadow-[0_16px_34px_rgba(249,115,22,0.12)]"
                          : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold tracking-[-0.02em] text-slate-950">{service.name}</p>
                              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">Featured</Badge>
                              <Badge variant="secondary" className={cn("rounded-full", service.effectiveFlow === "self_book" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700")}>
                                {service.effectiveFlow === "self_book" ? "Book instantly" : "Request review"}
                              </Badge>
                              <Badge variant="outline">{service.serviceMode === "mobile" ? "Mobile / on-site" : service.serviceMode === "both" ? "Mobile or in-shop" : "In-shop"}</Badge>
                            </div>
                            {service.description ? <p className="max-w-2xl text-sm leading-6 text-slate-600">{service.description}</p> : null}
                            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                              {config.showPrices && service.showPrice ? <span className="font-medium text-slate-950">{formatPrice(service.price)}</span> : null}
                              {config.showDurations && service.showDuration ? <span>{formatDuration(service.durationMinutes)}</span> : null}
                              {service.depositAmount > 0 ? <span>{formatPrice(service.depositAmount)} deposit</span> : null}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 sm:items-end">
                            <Button type="button" onClick={() => handleServiceSelect(service.id)} className="min-w-[136px]">
                              {service.effectiveFlow === "self_book" ? "Book now" : "Request service"}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => handleServiceSelect(service.id, { stayOnServiceStep: true })}>
                              {expanded ? "Hide details" : "Learn more"}
                            </Button>
                          </div>
                        </div>
                        {expanded ? (
                          <div className="grid gap-3 rounded-[1.35rem] border border-slate-200 bg-slate-50/90 p-4 text-sm text-slate-700 sm:grid-cols-3">
                            <div>
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Best for</p>
                              <p className="mt-1 leading-6 text-slate-600">{service.description || "A focused way to get this service into the shop without back-and-forth."}</p>
                            </div>
                            <div>
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Booking details</p>
                              <div className="mt-2 space-y-1.5 text-slate-600">
                                {config.showPrices && service.showPrice ? <p>{formatPrice(service.price)} starting price</p> : null}
                                {config.showDurations && service.showDuration ? <p>{formatDuration(service.durationMinutes)} estimated time</p> : null}
                                {service.depositAmount > 0 ? <p>{formatPrice(service.depositAmount)} deposit at booking</p> : <p>No deposit required up front</p>}
                              </div>
                            </div>
                            <div>
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">What happens next</p>
                              <p className="mt-1 leading-6 text-slate-600">
                                {service.effectiveFlow === "self_book"
                                  ? "Pick a live time, confirm the vehicle, and the shop sends your confirmation right away."
                                  : "Send the request with your vehicle details and the shop can confirm the best next step."}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {visibleServices.length === 0 ? (
            <div className="rounded-[1.35rem] border border-dashed border-slate-300 px-4 py-5 text-sm leading-6 text-slate-600">
              No services match that filter yet. Try another category to keep moving.
            </div>
          ) : null}

          {groupedServices.map((group) => (
            <div key={group.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950">{group.title}</p>
                <Badge variant="outline">{group.services.length} options</Badge>
              </div>
              <div className="grid gap-3">
                {group.services.map((service) => {
                  const active = service.id === form.serviceId;
                  return (
                    <div
                      key={service.id}
                      className={cn(
                        "rounded-[1.5rem] border bg-white p-5 text-left shadow-sm transition-all",
                        active ? "border-orange-300 bg-orange-50/60 shadow-[0_16px_34px_rgba(249,115,22,0.12)]" : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold tracking-[-0.02em] text-slate-950">{service.name}</p>
                              <Badge variant="secondary" className={cn("rounded-full", service.effectiveFlow === "self_book" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700")}>
                                {service.effectiveFlow === "self_book" ? "Book instantly" : "Request review"}
                              </Badge>
                              <Badge variant="outline">{service.serviceMode === "mobile" ? "Mobile / on-site" : service.serviceMode === "both" ? "Mobile or in-shop" : "In-shop"}</Badge>
                            </div>
                            {service.description ? <p className="max-w-2xl text-sm leading-6 text-slate-600">{service.description}</p> : null}
                            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                              {config.showPrices && service.showPrice ? <span className="font-medium text-slate-950">{formatPrice(service.price)}</span> : null}
                              {config.showDurations && service.showDuration ? <span>{formatDuration(service.durationMinutes)}</span> : null}
                              {service.depositAmount > 0 ? <span>{formatPrice(service.depositAmount)} deposit</span> : null}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 sm:items-end">
                            <Button type="button" onClick={() => handleServiceSelect(service.id)} className="min-w-[136px]">
                              {service.effectiveFlow === "self_book" ? "Book now" : "Request service"}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => handleServiceSelect(service.id, { stayOnServiceStep: true })}>
                              {expandedServiceId === service.id ? "Hide details" : "Learn more"}
                            </Button>
                            {active ? <p className="text-xs font-medium uppercase tracking-[0.16em] text-orange-700">Selected</p> : null}
                          </div>
                        </div>
                        {expandedServiceId === service.id ? (
                          <div className="grid gap-3 rounded-[1.35rem] border border-slate-200 bg-slate-50/90 p-4 text-sm text-slate-700 sm:grid-cols-3">
                            <div>
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Service</p>
                              <p className="mt-1 leading-6 text-slate-600">{service.description || "A focused booking option designed to keep the next step clear."}</p>
                            </div>
                            <div>
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Pricing & timing</p>
                              <div className="mt-2 space-y-1.5 text-slate-600">
                                {config.showPrices && service.showPrice ? <p>{formatPrice(service.price)} starting price</p> : null}
                                {config.showDurations && service.showDuration ? <p>{formatDuration(service.durationMinutes)} estimated time</p> : null}
                                {service.depositAmount > 0 ? <p>{formatPrice(service.depositAmount)} deposit at booking</p> : <p>No deposit required up front</p>}
                              </div>
                            </div>
                            <div>
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Next step</p>
                              <p className="mt-1 leading-6 text-slate-600">
                                {service.effectiveFlow === "self_book"
                                  ? "Choose a live slot and finish the booking in a few quick steps."
                                  : "Send the request now and the shop can confirm the best timing with you."}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeStep.key === "vehicle") {
      return (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="booking-vehicle-year">Vehicle year</Label>
              <Input id="booking-vehicle-year" type="number" min="1900" max="2100" value={form.vehicleYear} onChange={(event) => setForm((current) => ({ ...current, vehicleYear: event.target.value }))} placeholder="2022" className="h-12 rounded-2xl bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-vehicle-color">Vehicle color</Label>
              <Input id="booking-vehicle-color" value={form.vehicleColor} onChange={(event) => setForm((current) => ({ ...current, vehicleColor: event.target.value }))} placeholder="Black" className="h-12 rounded-2xl bg-slate-50" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="booking-vehicle-make">Vehicle make{config.requireVehicle ? " *" : ""}</Label>
              <Input id="booking-vehicle-make" value={form.vehicleMake} onChange={(event) => setForm((current) => ({ ...current, vehicleMake: event.target.value }))} placeholder="BMW" required={config.requireVehicle} className="h-12 rounded-2xl bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-vehicle-model">Vehicle model{config.requireVehicle ? " *" : ""}</Label>
              <Input id="booking-vehicle-model" value={form.vehicleModel} onChange={(event) => setForm((current) => ({ ...current, vehicleModel: event.target.value }))} placeholder="X5" required={config.requireVehicle} className="h-12 rounded-2xl bg-slate-50" />
            </div>
          </div>
          <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-600">
            {selectedService
              ? `Add the vehicle for ${selectedService.name}. If you only know part of it, start with the basics and the shop can fill in the rest.`
              : "Add the vehicle you want serviced. If you only know part of it, start with the basics and the shop can fill in the rest."}
          </div>
        </div>
      );
    }

    if (activeStep.key === "location") {
      return (
        <div className="space-y-5">
          {selectedServiceMode === "both" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, serviceMode: "in_shop", startTime: "" }))}
                className={cn(
                  "rounded-[1.4rem] border px-4 py-4 text-left transition-all",
                  form.serviceMode === "in_shop" ? "border-orange-300 bg-orange-50/60" : "border-slate-200 bg-white hover:bg-slate-50"
                )}
              >
                <p className="font-semibold text-slate-950">In-shop visit</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Bring the vehicle to the shop and continue with location details if needed.</p>
              </button>
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, serviceMode: "mobile", locationId: "", startTime: "" }))}
                className={cn(
                  "rounded-[1.4rem] border px-4 py-4 text-left transition-all",
                  form.serviceMode === "mobile" ? "border-orange-300 bg-orange-50/60" : "border-slate-200 bg-white hover:bg-slate-50"
                )}
              >
                <p className="font-semibold text-slate-950">Mobile / on-site</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Have the team come to you and add the service address below.</p>
              </button>
            </div>
          ) : null}

          {form.serviceMode === "in_shop" && requiresLocationChoice ? (
            <div className="grid gap-3">
              {config.locations.map((location) => {
                const active = location.id === form.locationId;
                return (
                  <button key={location.id} type="button" onClick={() => setForm((current) => ({ ...current, locationId: location.id, startTime: "" }))} className={cn("rounded-[1.4rem] border px-4 py-4 text-left transition-all", active ? "border-orange-300 bg-orange-50/60" : "border-slate-200 bg-white hover:bg-slate-50")}>
                    <p className="font-semibold text-slate-950">{location.name}</p>
                    {location.address ? <p className="mt-1 text-sm leading-6 text-slate-600">{location.address}</p> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {form.serviceMode === "mobile" || selectedServiceMode === "mobile" ? (
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
        </div>
      );
    }

    if (activeStep.key === "timing") {
      return effectiveFlow === "self_book" ? (
        <div className="space-y-5">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="booking-date">Preferred date</Label>
            <Input id="booking-date" type="date" min={minBookingDate} max={maxBookingDate} value={form.bookingDate || minBookingDate} onChange={(event) => setForm((current) => ({ ...current, bookingDate: event.target.value, startTime: "" }))} className="h-12 rounded-2xl bg-slate-50" />
          </div>
          {availabilityLoading ? <div className="flex items-center gap-3 rounded-[1.3rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading live availability...</div> : null}
          {!availabilityLoading && availabilityError ? <div className="rounded-[1.3rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">{availabilityError}</div> : null}
          {!availabilityLoading && !availabilityError && availability?.slots.length ? <div className="grid gap-2 sm:grid-cols-2">{availability.slots.map((slot) => <button key={slot.startTime} type="button" onClick={() => setForm((current) => ({ ...current, startTime: slot.startTime }))} className={cn("rounded-[1.25rem] border px-4 py-4 text-left text-sm transition-all", form.startTime === slot.startTime ? "border-orange-300 bg-orange-50 text-orange-950 shadow-[0_12px_28px_rgba(249,115,22,0.12)]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")}><span className="font-medium">{slot.label}</span></button>)}</div> : null}
          {!availabilityLoading && !availabilityError && !availability?.slots.length ? <div className="rounded-[1.3rem] border border-dashed border-slate-300 px-4 py-5 text-sm leading-6 text-slate-600">No live times are available on that date. Try another day or choose a request-only service.</div> : null}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="booking-request-date">Preferred date</Label>
            <Input id="booking-request-date" type="date" min={minBookingDate} max={maxBookingDate} value={form.bookingDate} onChange={(event) => setForm((current) => ({ ...current, bookingDate: event.target.value }))} className="h-12 rounded-2xl bg-slate-50" />
          </div>
          <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50/90 px-4 py-4 text-sm leading-6 text-slate-600">
            This service is reviewed by the shop before anything is scheduled. If your timing is flexible, leave the date open and add details in the final step.
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
              <Input id="booking-first-name" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} placeholder="Jamie" required className="h-12 rounded-2xl bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-last-name">Last name</Label>
              <Input id="booking-last-name" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} placeholder="Rivera" required className="h-12 rounded-2xl bg-slate-50" />
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
            <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-600">
              {config.requireEmail
                ? "Email is required for this booking page. Add a phone number too if the team should call or text."
                : "Add at least one way to follow up. Confirmation is sent after the request or booking is received."}
            </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {selectedService?.addons.length ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Frequently added</h3>
              <p className="text-sm text-slate-600">
                {form.vehicleMake || form.vehicleModel
                  ? `Frequently added with ${selectedService.name} for your ${[form.vehicleYear, form.vehicleMake, form.vehicleModel].filter(Boolean).join(" ")}.`
                  : `Frequently added with ${selectedService.name}.`}
              </p>
            </div>
            <div className="grid gap-3">
              {selectedService.addons.map((addon) => {
                const active = form.addonServiceIds.includes(addon.id);
                return (
                  <button key={addon.id} type="button" onClick={() => toggleAddon(addon.id)} className={cn("flex items-start justify-between gap-4 rounded-[1.35rem] border p-4 text-left transition-all", active ? "border-orange-300 bg-orange-50/60" : "border-slate-200 bg-white hover:bg-slate-50")}>
                      <div className="space-y-1">
                        <p className="font-medium text-slate-950">{addon.name}</p>
                        {addon.description ? <p className="text-sm leading-6 text-slate-600">{addon.description}</p> : null}
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
          {config.allowCustomerNotes ? <div className="space-y-2"><Label htmlFor="booking-notes">Additional details</Label><Textarea id="booking-notes" rows={5} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder={config.notesPrompt || "Add timing, questions, or anything the shop should know."} className="rounded-[1.35rem] bg-slate-50" /><p className="text-xs leading-5 text-slate-500">{config.notesPrompt || "Add timing, questions, or anything the shop should know."}</p></div> : null}
        <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50/85 p-4">
          <div className="flex items-start gap-3">
            <Checkbox id="booking-marketing-opt-in" checked={form.marketingOptIn} onCheckedChange={(checked) => setForm((current) => ({ ...current, marketingOptIn: checked === true }))} className="mt-0.5" />
            <div className="space-y-1.5">
              <Label htmlFor="booking-marketing-opt-in" className="cursor-pointer text-sm font-medium text-slate-950">It&apos;s okay for this shop to follow up with me</Label>
              <p className="text-xs leading-5 text-slate-600">This allows the shop to follow up about your request and related service updates.</p>
            </div>
          </div>
        </div>
        <div className="rounded-[1.35rem] border border-slate-200 bg-white px-4 py-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{effectiveFlow === "self_book" ? "Direct booking" : "Request flow"}</Badge>
              {selectedLocation ? <Badge variant="outline">{selectedLocation.name}</Badge> : null}
              {selectedTimeLabel && effectiveFlow === "self_book" ? <Badge variant="outline">{selectedTimeLabel}</Badge> : null}
            </div>
            <p className="text-sm leading-6 text-slate-600">{effectiveFlow === "self_book" ? "Your booking is checked against live availability one more time when you confirm." : "Your request goes directly to the shop with the service and vehicle details they need."}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.16),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_42%,#f8fafc_100%)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
        <div className="space-y-8">
          <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div className="space-y-4">
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[0.68rem] uppercase tracking-[0.18em] shadow-sm">
                Online Booking
              </Badge>
              <div className="space-y-2">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-[3.1rem] sm:leading-[0.98]">
                  {config?.title ?? "Tell us what you need"}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
                  {config?.subtitle ?? "Choose the service you need, share your vehicle details, and lock in the next step without the back-and-forth."}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-[0.72rem] font-medium uppercase tracking-[0.18em] text-slate-500">
                  <span>{loading ? "Preparing booking page" : `For ${config?.businessName ?? "the shop"}`}</span>
                  <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
                  <span>{effectiveFlow === "self_book" ? "Live booking" : "Guided request"}</span>
                  <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
                  <span>{selectedService ? "Service context stays in view" : "Fast guided flow"}</span>
                </div>
              </div>
            </div>
            <div className="rounded-[1.6rem] border border-white/90 bg-white/88 p-5 shadow-[0_20px_44px_rgba(15,23,42,0.06)] backdrop-blur-sm">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">What happens next</p>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-950">
                {effectiveFlow === "self_book"
                  ? "Pick a time, confirm the details, and get the confirmation right away."
                  : "Send the request once and the shop can follow up with the right next step."}
              </p>
              <div className="mt-4 grid gap-2 text-sm text-slate-600">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <span>Progress</span>
                  <span className="font-medium text-slate-950">{stepProgress}%</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <span>Booking flow</span>
                  <span className="font-medium text-slate-950">{effectiveFlow === "self_book" ? "Instant" : "Request review"}</span>
                </div>
              </div>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-3">
            {(config?.trustPoints ?? ["Goes directly to the shop", "Quick follow-up", "Secure and simple"]).map((point, index) => {
              const item =
                index === 0
                  ? { icon: ShieldCheck, title: point, body: "No marketplace middle step." }
                  : index === 1
                    ? { icon: Clock3, title: point, body: effectiveFlow === "self_book" ? "Confirmation is sent right after booking." : "The team gets the request right away." }
                    : { icon: Sparkles, title: point, body: "Service, vehicle, and next step in one clean flow." };
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3 rounded-[1.35rem] border border-white/90 bg-white/88 px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] backdrop-blur-sm"
                >
                  <div className="rounded-xl bg-orange-50 p-2.5 text-orange-600 ring-1 ring-orange-100">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold tracking-[-0.01em] text-slate-950">{item.title}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              {loading ? <Card className="overflow-hidden border-slate-200/85 bg-white/96 shadow-[0_26px_70px_rgba(15,23,42,0.08)]"><CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading booking page...</CardContent></Card> : null}
              {!loading && pageError && !config ? <Card className="border-rose-200 bg-rose-50"><CardContent className="space-y-3 p-6 text-sm text-rose-900"><p className="font-semibold text-rose-950">This booking page is unavailable right now.</p><p>{pageError}</p></CardContent></Card> : null}
              {!loading && !pageError && result ? (
                <Card className="overflow-hidden border-emerald-200 bg-[linear-gradient(180deg,#f0fdf4_0%,#ecfdf3_100%)] shadow-sm">
                  <CardContent className="space-y-5 p-6 sm:p-7">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-emerald-100 p-2.5 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></div>
                      <div className="space-y-1">
                        <p className="text-lg font-semibold text-emerald-950">{result.mode === "self_book" ? "Appointment booked" : "Request sent"}</p>
                        <p className="text-sm leading-6 text-emerald-900">{result.message}</p>
                        {result.scheduledFor ? <p className="text-sm font-medium text-emerald-950">{result.scheduledFor}</p> : null}
                      </div>
                    </div>
                    <div className="grid gap-3 rounded-[1.3rem] border border-emerald-200/80 bg-white/70 p-4 text-sm text-emerald-950">
                      {selectedService ? <div className="flex items-center justify-between gap-4"><span className="text-emerald-800">Service</span><span className="font-medium">{selectedService.name}</span></div> : null}
                      {selectedTimeLabel && result.mode === "self_book" ? <div className="flex items-center justify-between gap-4"><span className="text-emerald-800">Time</span><span className="font-medium">{selectedTimeLabel}</span></div> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {result.confirmationUrl ? <Button asChild><a href={result.confirmationUrl} target="_blank" rel="noreferrer">View confirmation</a></Button> : null}
                      {result.portalUrl ? <Button asChild variant="outline"><a href={result.portalUrl} target="_blank" rel="noreferrer">Open customer portal</a></Button> : null}
                      <Button variant="ghost" onClick={() => setResult(null)}>Book another service</Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {!loading && !pageError && !result ? (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <Card className="overflow-hidden border-slate-200/85 bg-white/97 shadow-[0_30px_80px_rgba(15,23,42,0.08),0_4px_16px_rgba(15,23,42,0.04)]">
                    <div className="h-1.5 w-full bg-[linear-gradient(90deg,rgba(249,115,22,0.95),rgba(251,146,60,0.88),rgba(15,23,42,0.9))]" />
                    <CardHeader className="space-y-5 border-b border-slate-100/90 pb-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-2xl tracking-[-0.035em] sm:text-[2rem]">{activeStep?.title}</CardTitle>
                          <CardDescription className="max-w-2xl text-sm leading-6 text-slate-600">{activeStep?.description}</CardDescription>
                        </div>
                        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                          Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#f97316_0%,#fb923c_55%,#0f172a_100%)] transition-all duration-300"
                            style={{ width: `${stepProgress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[0.72rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                          <span>{selectedService ? "Booking this service" : "Start with the service"}</span>
                          <span>{stepProgress}% complete</span>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                        {steps.map((step, index) => {
                          const Icon = stepIcon(step.key);
                          const isActive = index === currentStep;
                          const isComplete = index < currentStep;
                          return (
                            <button
                              key={step.key}
                              type="button"
                              onClick={() => { if (step.key === "service" || selectedService) moveToStep(index); }}
                              className={cn(
                                "flex items-center gap-3 rounded-[1.2rem] border px-3 py-3 text-left transition-all",
                                isActive
                                  ? "border-orange-300 bg-orange-50/80 shadow-[0_10px_24px_rgba(249,115,22,0.10)]"
                                  : isComplete
                                    ? "border-emerald-200 bg-emerald-50/80"
                                    : "border-slate-200 bg-slate-50/90 hover:border-slate-300 hover:bg-white"
                              )}
                            >
                              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase", isActive ? "bg-orange-500 text-white" : isComplete ? "bg-emerald-500 text-white" : "bg-white text-slate-600")}>{isComplete ? "Done" : <Icon className="h-4 w-4" />}</div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{step.label}</p>
                                <p className="truncate text-sm font-medium text-slate-950">{step.title}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {selectedServiceSummary}
                    </CardHeader>
                    <CardContent className="space-y-7 px-6 pb-0 pt-6 sm:px-7 sm:pt-7">
                      {renderStepBody()}
                      {stepError ? <div className="rounded-[1.15rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{stepError}</div> : null}
                      {submitError ? <div className="rounded-[1.15rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">{submitError}</div> : null}
                      <div className="sticky bottom-0 -mx-6 mt-10 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur sm:-mx-7 sm:px-7">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-1">
                            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                              {effectiveFlow === "self_book" ? "Ready to confirm" : "Ready to send"}
                            </div>
                            <div className="text-xs leading-5 text-slate-500">
                              {effectiveFlow === "self_book"
                                ? "Live availability is checked one more time right before the booking is confirmed."
                                : "The shop receives the request with the service, vehicle, and contact details it needs."}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            {currentStep > 0 ? (
                              <Button key={`back-${activeStep?.key ?? currentStep}`} type="button" variant="outline" onClick={() => moveToStep(currentStep - 1)} className="rounded-xl">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back
                              </Button>
                            ) : null}
                            {currentStep < steps.length - 1 ? (
                              <Button key={`continue-${activeStep?.key ?? currentStep}`} type="button" onClick={handleNext} className="min-w-[150px] rounded-xl shadow-[0_12px_26px_rgba(249,115,22,0.22)]">
                                Continue
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            ) : (
                              <Button key={`submit-${activeStep?.key ?? currentStep}`} type="submit" disabled={submitting || (effectiveFlow === "self_book" && !form.startTime)} className="min-w-[180px] rounded-xl shadow-[0_14px_28px_rgba(249,115,22,0.24)]">
                                {submitting ? effectiveFlow === "self_book" ? "Booking..." : "Sending request..." : effectiveFlow === "self_book" ? "Book appointment" : "Send request"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </form>
              ) : null}
            </div>
            <div className="space-y-4">
              <Card className="sticky top-6 overflow-hidden border-slate-200/80 bg-white/96 shadow-[0_22px_54px_rgba(15,23,42,0.08)]">
                <div className="h-1 w-full bg-[linear-gradient(90deg,rgba(15,23,42,0.92),rgba(249,115,22,0.92))]" />
                <CardHeader>
                  <CardTitle className="text-lg">Booking summary</CardTitle>
                  <CardDescription>{selectedService ? "Keep the service, timing, and follow-up details in view as you move through the steps." : "Choose a service to start building your booking."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedService ? (
                    <>
                      <div className="space-y-2 rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="rounded-full border border-orange-200 bg-orange-50 text-orange-700">
                            {effectiveFlow === "self_book" ? "Book instantly" : "Request review"}
                          </Badge>
                          <Badge variant="outline" className="rounded-full">{serviceModeLabel}</Badge>
                        </div>
                        <p className="text-base font-semibold tracking-[-0.02em] text-slate-950">{selectedService.name}</p>
                        {selectedService.description ? <p className="text-sm leading-6 text-slate-600">{selectedService.description}</p> : null}
                      </div>
                      {selectedAddons.length > 0 ? <div className="space-y-2"><p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Add-ons</p><div className="flex flex-wrap gap-2">{selectedAddons.map((addon) => <Badge key={addon.id} variant="outline">{addon.name}</Badge>)}</div></div> : null}
                      <div className="grid gap-3 rounded-[1.35rem] border border-slate-200 bg-slate-50/85 p-4 text-sm">
                        <div className="flex items-center justify-between"><span className="text-slate-600">Flow</span><span className="font-medium text-slate-950">{effectiveFlow === "self_book" ? "Book instantly" : "Request approval"}</span></div>
                        <div className="flex items-center justify-between"><span className="text-slate-600">Service mode</span><span className="font-medium text-slate-950">{form.serviceMode === "mobile" ? "Mobile / on-site" : "In-shop"}</span></div>
                        {selectedLocation ? <div className="flex items-center justify-between"><span className="text-slate-600">Location</span><span className="font-medium text-slate-950">{selectedLocation.name}</span></div> : null}
                        {form.serviceMode === "mobile" && form.serviceAddress ? <div className="flex items-center justify-between gap-4"><span className="text-slate-600">Service address</span><span className="font-medium text-right text-slate-950">{[form.serviceAddress, form.serviceCity, form.serviceState, form.serviceZip].filter(Boolean).join(", ")}</span></div> : null}
                          {canShowSelectedPrice ? <div className="flex items-center justify-between"><span className="text-slate-600">Subtotal</span><span className="font-medium text-slate-950">{formatPrice(subtotal)}</span></div> : null}
                          {canShowSelectedDuration ? <div className="flex items-center justify-between"><span className="text-slate-600">Estimated time</span><span className="font-medium text-slate-950">{formatDuration(totalDuration)}</span></div> : null}
                        {totalDeposit > 0 ? <div className="flex items-center justify-between"><span className="text-slate-600">Deposit</span><span className="font-medium text-slate-950">{formatPrice(totalDeposit)}</span></div> : null}
                        {selectedTimeLabel && effectiveFlow === "self_book" ? <div className="flex items-center justify-between"><span className="text-slate-600">Chosen time</span><span className="font-medium text-slate-950">{selectedTimeLabel}</span></div> : null}
                        {form.bookingDate && effectiveFlow === "request" ? <div className="flex items-center justify-between"><span className="text-slate-600">Preferred date</span><span className="font-medium text-slate-950">{form.bookingDate}</span></div> : null}
                      </div>
                      <div className={cn("rounded-[1.35rem] border px-4 py-4 text-sm leading-6", effectiveFlow === "self_book" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700")}>
                        {effectiveFlow === "self_book" ? "Confirmation is sent after the booking is placed, with a customer portal link right away." : "Request-only services let the shop review the job before anything is scheduled."}
                      </div>
                      <div className="rounded-[1.35rem] border border-slate-200 bg-white px-4 py-4 text-sm">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Why this feels easy</p>
                        <div className="mt-3 space-y-2 text-slate-600">
                          <p>Selected service stays in view the whole time.</p>
                          <p>Vehicle, timing, and follow-up happen in one clean flow.</p>
                          <p>{effectiveFlow === "self_book" ? "You’ll see confirmation right away after booking." : "You’ll know the request reached the shop as soon as it’s sent."}</p>
                        </div>
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
  );
}
