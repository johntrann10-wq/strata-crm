import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useOutletContext, useSearchParams, Link } from "react-router";
import { useFindFirst, useFindMany, useFindOne, useAction } from "../hooks/useApi";
import { format, addMinutes } from "date-fns";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronDown,
  Check,
  ChevronsUpDown,
  Clock,
  MapPin,
  DollarSign,
  AlertCircle,
  Loader2,
  Sparkles,
  Package,
} from "lucide-react";
import { api } from "../api";
import { formatServiceCategory } from "../lib/serviceCatalog";
import type { AuthOutletContext } from "./_app";
import { getWorkflowCreationPreset } from "../lib/workflowCreationPresets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function NewAppointmentPage() {
  const { user, businessId, businessType, currentLocationId } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const creationPreset = useMemo(() => getWorkflowCreationPreset(businessType), [businessType]);

  const [searchParams] = useSearchParams();
  const quoteIdParam = searchParams.get("quoteId");
  const clientIdParam = searchParams.get("clientId");

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
  const [showQuickAddVehicle, setShowQuickAddVehicle] = useState(false);
  const [quickYear, setQuickYear] = useState('');
  const [quickMake, setQuickMake] = useState('');
  const [quickModel, setQuickModel] = useState('');
  const [quickVehicleError, setQuickVehicleError] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(currentLocationId);
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(false);
  const [showQuotePrefilledBadge, setShowQuotePrefilledBadge] = useState(false);
  const hasPrefilledFromQuote = useRef(false);
  const [clientSearchQuery, setClientSearchQuery] = useState<string>("");
  const [debouncedClientQuery, setDebouncedClientQuery] = useState<string>("");

  // Pre-fill client, date and time from URL query params
  useEffect(() => {
    if (clientIdParam && selectedClientId === null) {
      setSelectedClientId(clientIdParam);
    }
    const timeParam = searchParams.get("time");
    if (timeParam) setStartTime(timeParam);
    const dateParam = searchParams.get("date");
    if (dateParam && !selectedDate) {
      const d = new Date(dateParam + "T12:00:00");
      if (!isNaN(d.getTime())) setSelectedDate(d);
    }
  }, [searchParams]);

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
        ? { business: { id: { equals: businessId } } }
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
        business: { id: { equals: businessId ?? "" } },
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
        business: { id: { equals: businessId ?? "" } },
        active: { equals: true },
      },
      select: { id: true, firstName: true, lastName: true, role: true },
      first: 50,
      sort: { firstName: "Ascending" },
      pause: !businessId,
    }
  );

  const [{ data: vehiclesData, fetching: vehiclesFetching }] = useFindMany(
    api.vehicle,
    {
      filter: selectedClientId
        ? { client: { id: { equals: selectedClientId } } }
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
          acc.totalPrice += service.price ?? 0;
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

  // Auto-open quick-add vehicle form when client has no vehicles on file
  useEffect(() => {
    if (selectedClientId && vehiclesData && vehiclesData.length === 0) {
      setShowQuickAddVehicle(true);
    }
  }, [vehiclesData, selectedClientId]);

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

  // Handlers
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId === selectedClientId ? null : clientId);
    setSelectedVehicleId(null);
    setShowQuickAddVehicle(false);
    setClientSearchOpen(false);
    setClientSearchQuery("");
  };

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
    if (!quickMake.trim() || !quickModel.trim()) {
      setQuickVehicleError('Make and model are required.');
      return;
    }
    if (!selectedClientId || !businessId) return;
    setQuickVehicleError('');
    setSavingVehicle(true);
    try {
      const result = await createVehicle({
        make: quickMake.trim(),
        model: quickModel.trim(),
        year: quickYear ? parseInt(quickYear) : undefined,
        client: { _link: selectedClientId },
        business: { _link: businessId },
      } as any);
      if ((result as any)?.data?.id) {
        setSelectedVehicleId((result as any).data.id);
        setShowQuickAddVehicle(false);
        setQuickYear('');
        setQuickMake('');
        setQuickModel('');
      }
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

    if (selectedServiceIds.length === 0) {
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
      const autoTitle = selectedServiceIds
        .map((id) => servicesData?.find((s) => s.id === id)?.name)
        .filter(Boolean)
        .join(" + ");
      const result = await createAppointment({
        clientId: selectedClientId,
        vehicleId: selectedVehicleId!,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime ? endDateTime.toISOString() : undefined,
        title: autoTitle || undefined,
        assignedStaffId: selectedStaffId ?? undefined,
        locationId: selectedLocationId ?? undefined,
        ...(quoteIdParam ? { quoteId: quoteIdParam } : {}),
        ...(selectedServiceIds.length > 0 ? { serviceIds: selectedServiceIds } : {}),
      } as Record<string, unknown>);

      if (result.error) {
        setFormError(result.error.message);
        setIsSubmitting(false);
        return;
      }

      if (result.data) {
        toast.success("Appointment created successfully!");
        navigate(`/appointments/${result.data.id}`);
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
  const recommendedPackageTemplates = packageTemplates.filter((pkg) =>
    creationPreset.recommendedCategories.includes(String(pkg.baseService.category ?? "other"))
  );
  const otherPackageTemplates = packageTemplates.filter(
    (pkg) => !creationPreset.recommendedCategories.includes(String(pkg.baseService.category ?? "other"))
  );
  const staff = staffData ?? [];
  const isLoading = isSubmitting || actionFetching;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate("/appointments")}
            className="shrink-0"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Appointment</h1>
            <p className="text-sm text-muted-foreground">
              Schedule a new appointment for a client
            </p>
            {currentLocationId && locationsData?.some((location) => location.id === currentLocationId) ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Defaulting to {locationsData.find((location) => location.id === currentLocationId)?.name ?? "current location"}
              </p>
            ) : null}
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
                {selectedClientId && vehiclesData && vehicles.length === 0 && !showQuickAddVehicle && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                    <AlertDescription>
                      This client has no vehicles on file. You can add one below or proceed without a vehicle.
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
                  <div className='space-y-3'>
                    <p className='text-sm text-muted-foreground italic'>No vehicles on file for this client.</p>
                    {!showQuickAddVehicle ? (
                      <Button type='button' variant='outline' size='sm' onClick={() => setShowQuickAddVehicle(true)}>
                        + Add Vehicle Now
                      </Button>
                    ) : (
                      <div className='rounded-lg border bg-muted/30 p-3 space-y-3'>
                        <p className='text-sm font-medium'>Quick-add a vehicle</p>
                        <div className='grid grid-cols-3 gap-2'>
                          <Input placeholder='Year' value={quickYear} onChange={(e) => setQuickYear(e.target.value)} maxLength={4} />
                          <Input placeholder='Make *' value={quickMake} onChange={(e) => setQuickMake(e.target.value)} />
                          <Input placeholder='Model *' value={quickModel} onChange={(e) => setQuickModel(e.target.value)} />
                        </div>
                        {quickVehicleError && <p className='text-xs text-destructive'>{quickVehicleError}</p>}
                        <div className='flex gap-2'>
                          <Button type='button' size='sm' onClick={handleQuickAddVehicle} disabled={savingVehicle}>
                            {savingVehicle ? 'Saving...' : 'Save Vehicle'}
                          </Button>
                          <Button type='button' size='sm' variant='ghost' onClick={() => setShowQuickAddVehicle(false)}>Cancel</Button>
                        </div>
                      </div>
                    )}
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
                          {[v.year, v.make, v.model]
                            .filter(Boolean)
                            .join(" ")}
                          {v.color ? ` — ${v.color}` : ""}
                          {v.licensePlate ? ` (${v.licensePlate})` : ""}
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
                  <p className="text-sm text-muted-foreground">{creationPreset.summary}</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button type="button" variant="outline" size="sm" onClick={() => setNotes(creationPreset.appointmentClientNotes)}>
                      Apply client intake
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setInternalNotes(creationPreset.appointmentInternalNotes)}>
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
                  {recommendedPackageTemplates.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-muted-foreground">Recommended packages</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recommendedPackageTemplates.map((pkg) => (
                          <Button
                            key={pkg.baseService.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              applyPackageTemplate(
                                pkg.baseService.id,
                                pkg.linkedAddons.map((addon) => addon!.id)
                              )
                            }
                          >
                            {pkg.baseService.name}
                            <span className="ml-1 text-muted-foreground">
                              · {pkg.linkedAddons.length + 1} services · ${pkg.totalPackagePrice.toFixed(2)}
                              {pkg.totalPackageDuration > 0 ? ` · ${formatDuration(pkg.totalPackageDuration)}` : ""}
                            </span>
                          </Button>
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
                      <div className="flex flex-wrap gap-2">
                        {otherPackageTemplates.map((pkg) => (
                          <Button
                            key={pkg.baseService.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              applyPackageTemplate(
                                pkg.baseService.id,
                                pkg.linkedAddons.map((addon) => addon!.id)
                              )
                            }
                          >
                            {pkg.baseService.name}
                            <span className="ml-1 text-muted-foreground">
                              · {pkg.linkedAddons.length + 1} services · ${pkg.totalPackagePrice.toFixed(2)}
                              {pkg.totalPackageDuration > 0 ? ` · ${formatDuration(pkg.totalPackageDuration)}` : ""}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {services.map((service) => {
                      const isSelected = selectedServiceIds.includes(service.id);
                      return (
                        <div
                          key={service.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors select-none",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/40"
                          )}
                          onClick={() => toggleService(service.id)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleService(service.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{service.name}</p>
                            {service.notes && (
                              <p className="text-xs text-muted-foreground truncate">
                                {service.notes}
                              </p>
                            )}
                            {service.category && (
                              <p className="text-xs text-muted-foreground">
                                {formatServiceCategory(service.category)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-sm">
                            {service.durationMinutes != null && service.durationMinutes > 0 && (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatDuration(service.durationMinutes)}
                              </span>
                            )}
                            <span className="font-semibold">
                              ${(service.price ?? 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {services.length > 0 && selectedServiceIds.length === 0 && selectedClientId && (
                <p className="text-xs text-muted-foreground mt-2">Select at least one service to calculate the appointment duration and end time.</p>
              )}

              {/* Quote prefilled badge */}
              {quoteIdParam && showQuotePrefilledBadge && (
                <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  Services pre-filled from quote
                </div>
              )}

              {selectedServiceIds.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-muted/50 space-y-1.5">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Services selected</span>
                    <span>{selectedServiceIds.length}</span>
                  </div>
                  {totalDuration > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Total duration</span>
                      <span>{formatDuration(totalDuration)}</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Estimated total</span>
                    <span>${totalPrice.toFixed(2)}</span>
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

              {startDateTime && endDateTime && (
                <p className="text-xs text-muted-foreground pt-1">
                  Overlapping appointments are blocked when you save. If this time conflicts, you will see an error from the server.
                </p>
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
                <Checkbox
                  id="isMobile"
                  checked={isMobile}
                  onCheckedChange={(checked) => {
                    setIsMobile(checked === true);
                    if (!checked) setMobileAddress("");
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 shrink-0"
                />
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

              {/* Toggle for extra fields */}
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAdditionalDetails((v) => !v)}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform",
                    showAdditionalDetails && "rotate-180"
                  )}
                />
                {showAdditionalDetails ? "Fewer details" : "More details"}
              </button>

              {/* Collapsible: Deposit Amount, Notes, Internal Notes */}
              {showAdditionalDetails && (
                <div className="space-y-4">
                  {/* Deposit Amount */}
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

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Notes about this appointment (visible to client)..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-[80px] resize-none"
                    />
                  </div>

                  {/* Internal Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="internalNotes">Internal Notes</Label>
                    <Textarea
                      id="internalNotes"
                      placeholder="Internal notes (not visible to client)..."
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      className="min-h-[80px] resize-none"
                    />
                  </div>
                </div>
              )}
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
                          <span>${(s.price ?? 0).toFixed(2)}</span>
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
              onClick={() => navigate("/appointments")}
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
        </form>
      </div>
    </div>
  );
}
