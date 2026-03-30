import { addMinutes } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { useOutletContext, Link } from "react-router";
import { useFindMany, useAction } from "../../hooks/useApi";
import { api } from "../../api";
import type { AuthOutletContext } from "../../routes/_app";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, Clock, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatServiceCategory } from "../../lib/serviceCatalog";

type ClientPick = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
};
type ServicePick = { id: string; name?: string; price?: number | string | null; durationMinutes?: number | null; category?: string | null; categoryLabel?: string | null };
type VehiclePick = { id: string; year?: number | null; make?: string | null; model?: string | null };

const toMoneyNumber = (value: unknown): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

interface QuickBookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  initialTime?: string;
  onBooked?: (appointmentId: string) => void;
  businessId?: string;
}

const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getToday = (): string => getLocalDateString(new Date());

const getNextHour = (): string => {
  const now = new Date();
  const nextHour = Math.min(now.getHours() + 1, 23);
  return `${String(nextHour).padStart(2, "0")}:00`;
};

export function QuickBookSheet({
  open,
  onOpenChange,
  initialDate,
  initialTime,
  onBooked,
  businessId,
}: QuickBookSheetProps) {
  const { currentLocationId } = useOutletContext<AuthOutletContext>();
  const appointmentDraftHref = `${
    currentLocationId
      ? `/appointments/new?locationId=${encodeURIComponent(currentLocationId)}`
      : "/appointments/new"
  }${initialDate ? `${currentLocationId ? "&" : "?"}date=${encodeURIComponent(initialDate)}` : ""}${
    initialTime ? `${currentLocationId || initialDate ? "&" : "?"}time=${encodeURIComponent(initialTime)}` : ""
  }`;

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [bookingDate, setBookingDate] = useState<string>(() => initialDate ?? getToday());
  const [bookingTime, setBookingTime] = useState<string>(() => initialTime ?? getNextHour());
  const [clientSearch, setClientSearch] = useState<string>("");
  const [serviceSearch, setServiceSearch] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const fullFormHref = selectedClientId
    ? `/clients/${selectedClientId}/vehicles/new?next=appointment&from=${encodeURIComponent(appointmentDraftHref)}`
    : appointmentDraftHref;

  // Sync initialDate / initialTime prop changes
  useEffect(() => {
    if (initialDate) setBookingDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    if (initialTime) setBookingTime(initialTime);
  }, [initialTime]);

  // Reset all state when sheet closes
  useEffect(() => {
    if (!open) {
      setSelectedClientId(null);
      setSelectedVehicleId(null);
      setSelectedServiceIds([]);
      setError(null);
      setClientSearch("");
      setServiceSearch("");
      setBookingDate(initialDate ?? getToday());
      setBookingTime(initialTime ?? getNextHour());
    }
  }, [open]);

  // Fetch clients
  const [{ data: clients, fetching: clientsFetching, error: clientsError }] = useFindMany(api.client, {
    select: { id: true, firstName: true, lastName: true, phone: true },
    sort: { firstName: "Ascending" },
    first: 250,
    pause: !businessId || !open,
  });

  // Fetch services
  const [{ data: services, error: servicesError }] = useFindMany(api.service, {
    filter: {
      businessId: { equals: businessId ?? "" },
      active: { equals: true },
    },
    select: { id: true, name: true, price: true, durationMinutes: true, category: true, categoryLabel: true },
    sort: { category: "Ascending" },
    first: 250,
    pause: !businessId || !open,
  });

  // Fetch vehicles for selected client
  const [{ data: vehicles, fetching: vehiclesFetching, error: vehiclesError }] = useFindMany(api.vehicle, {
    filter: { clientId: { equals: selectedClientId ?? "" } },
    select: { id: true, year: true, make: true, model: true },
    first: 50,
    pause: !selectedClientId,
  });

  // Action
  const [{ fetching: submitting }, createAppointment] = useAction((params) =>
    api.appointment.create(params ?? {})
  );

  // Reset vehicle when client changes
  useEffect(() => {
    setSelectedVehicleId(null);
  }, [selectedClientId]);

  // Auto-select vehicle when exactly one exists
  useEffect(() => {
    const vl = (Array.isArray(vehicles) ? vehicles : []) as VehiclePick[];
    if (vl.length === 1 && !vehiclesFetching && selectedVehicleId === null) {
      setSelectedVehicleId(vl[0].id);
    }
  }, [vehicles, vehiclesFetching, selectedVehicleId]);

  const minBookingDate = useMemo(() => getToday(), []);
  const clientList = (Array.isArray(clients) ? clients : []) as ClientPick[];
  const serviceList = (Array.isArray(services) ? services : []) as ServicePick[];
  const vehicleList = (Array.isArray(vehicles) ? vehicles : []) as VehiclePick[];

  const filteredClients = clientList.filter((c) => {
    if (!clientSearch.trim()) return true;
    const q = clientSearch.toLowerCase();
    return (
      c.firstName?.toLowerCase().includes(q) ||
      c.lastName?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    );
  });
  const normalizedServiceSearch = serviceSearch.trim().toLowerCase();
  const groupedServices = serviceList.reduce<Record<string, ServicePick[]>>((acc, service) => {
    const haystack = [service.name, service.categoryLabel ?? formatServiceCategory(service.category)].filter(Boolean).join(" ").toLowerCase();
    if (normalizedServiceSearch && !haystack.includes(normalizedServiceSearch)) return acc;
    const key = service.category ?? "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(service);
    return acc;
  }, {});
  const sortedServiceGroups = Object.entries(groupedServices).sort(([left], [right]) =>
    formatServiceCategory(left).localeCompare(formatServiceCategory(right))
  );
  const selectedClient = clientList.find((client) => client.id === selectedClientId) ?? null;
  const selectedVehicle = vehicleList.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  const selectedServices = serviceList.filter((service) => selectedServiceIds.includes(service.id));
  const selectedServiceDuration = selectedServices.reduce((sum, service) => sum + (service.durationMinutes ?? 0), 0);
  const selectedServiceTotal = selectedServices.reduce((sum, service) => sum + toMoneyNumber(service.price), 0);
  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  const handleSubmit = async () => {
    if (!selectedClientId) {
      setError("Please select a client.");
      return;
    }
    if (!bookingDate) {
      setError("Please select a date.");
      return;
    }
    if (!bookingTime) {
      setError("Please select a time.");
      return;
    }
    if (!businessId) {
      setError("Business not loaded. Please try again.");
      return;
    }

    // Validate vehicle when a client is selected
    if (selectedClientId && vehiclesFetching) {
      setError("Vehicle list is still loading. Please wait a moment and try again.");
      return;
    }
    if (selectedClientId && !vehiclesFetching && vehicleList.length === 0) {
      setError("This client has no vehicles on file. Please add a vehicle from their client profile first, then book the appointment.");
      return;
    }
    if (selectedClientId && !vehiclesFetching && vehicleList.length > 0 && selectedVehicleId === null) {
      setError("Please select a vehicle for this client.");
      return;
    }

    setError(null);

    const startDateTime = new Date(`${bookingDate}T${bookingTime}:00`);

    const totalDurationMinutes = selectedServiceIds.reduce((sum, id) => {
      const svc = serviceList.find((s) => s.id === id);
      return sum + (svc?.durationMinutes ?? 0);
    }, 0);

    const endDateTime = addMinutes(startDateTime, totalDurationMinutes > 0 ? totalDurationMinutes : 60);

    try {
      const result = await createAppointment({
        clientId: selectedClientId,
        vehicleId: selectedVehicleId!,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        locationId: currentLocationId ?? undefined,
      });

      if (result.error) {
        setError(result.error.message || "Failed to book appointment.");
        return;
      }

      const payload = result.data && typeof result.data === "object" ? (result.data as { id?: string }) : null;
      const newId = payload?.id;
      if (!newId) {
        setError("Appointment created but ID was not returned.");
        return;
      }

      const confirmationStatus = (payload as { deliveryStatus?: string | null; deliveryError?: string | null } | null)?.deliveryStatus;
      const confirmationError = (payload as { deliveryError?: string | null } | null)?.deliveryError;
      if (confirmationStatus === "emailed") {
        toast.success("Appointment booked and confirmation emailed");
      } else if (confirmationStatus === "missing_email") {
        toast.warning("Appointment booked. Add a client email to send confirmations.");
      } else if (confirmationStatus === "smtp_disabled") {
        toast.warning("Appointment booked. Transactional email is not configured.");
      } else if (confirmationStatus === "email_failed") {
        toast.warning(`Appointment booked, but confirmation email failed${confirmationError ? `: ${confirmationError}` : "."}`);
      } else {
        toast.success("Appointment booked!");
      }
      onBooked?.(newId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to book appointment.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col p-0 w-full max-w-md">
        <SheetHeader className="border-b shrink-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,255,255,0))] px-4 pt-6 pb-4">
          <SheetTitle>Quick Book</SheetTitle>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-border/70 bg-background/82 px-3 py-2 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Client</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : "Choose client"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/82 px-3 py-2 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Schedule</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{bookingDate || "Pick date"} · {bookingTime || "--:--"}</p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-5">
          {(clientsError || servicesError || vehiclesError) && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {[clientsError, servicesError, vehiclesError].filter(Boolean).map((e) => (e as Error).message).join(" ")}
            </div>
          )}
          {/* 1. Client section */}
          <div className="space-y-1.5">
            <Label>1. Client *</Label>
            <Input
              placeholder="Search clients..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
              {clientsFetching && (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!clientsFetching && filteredClients.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2">No clients found.</p>
              )}
              {!clientsFetching &&
                filteredClients.map((client) => {
                  const isSelected = selectedClientId === client.id;
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setSelectedClientId(isSelected ? null : client.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted transition-colors",
                        isSelected && "bg-orange-50 text-orange-700"
                      )}
                    >
                      <span className="font-medium">
                        {client.firstName} {client.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        {client.phone ?? ""}
                        {isSelected && <Check className="h-3 w-3 text-orange-500" />}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* 2. Date & Time section */}
          <div className="space-y-2">
            <Label>2. Schedule *</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="date"
                min={minBookingDate}
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="time"
                value={bookingTime}
                onChange={(e) => setBookingTime(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* 3. Services section */}
          <div className="space-y-2">
            <Label>3. Services</Label>
            {serviceList.length === 0 ? (
              <p className="text-xs text-muted-foreground">No services configured.</p>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    placeholder="Search services..."
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                {selectedServiceIds.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {selectedServices.map((service) => (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => toggleService(service.id)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700"
                        >
                          <span>{service.name}</span>
                          <Check className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedServiceIds.length} service{selectedServiceIds.length === 1 ? "" : "s"} selected · {selectedServiceDuration > 0 ? `${selectedServiceDuration}m` : "Custom duration"} · ${selectedServiceTotal.toFixed(2)}
                    </p>
                  </div>
                ) : null}
                {sortedServiceGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No services match this search.</p>
                ) : (
                  <Accordion type="multiple" defaultValue={sortedServiceGroups.slice(0, 2).map(([category]) => category)} className="rounded-md border">
                    {sortedServiceGroups.map(([category, entries]) => {
                      const selectedCount = entries.filter((service) => selectedServiceIds.includes(service.id)).length;
                      return (
                        <AccordionItem key={category} value={category} className="px-3">
                          <AccordionTrigger className="py-3 hover:no-underline">
                            <div className="min-w-0 text-left">
                              <p className="text-sm font-medium">{group[0]?.categoryLabel ?? formatServiceCategory(category)}</p>
                              <p className="text-xs text-muted-foreground">
                                {entries.length} option{entries.length === 1 ? "" : "s"}
                                {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
                              </p>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="space-y-2 pb-3">
                            {entries.map((svc) => {
                              const isSelected = selectedServiceIds.includes(svc.id);
                              return (
                                <button
                                  key={svc.id}
                                  type="button"
                                  onClick={() => toggleService(svc.id)}
                                  className={cn(
                                    "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                                    isSelected
                                      ? "border-orange-500 bg-orange-50 text-orange-700"
                                      : "border-border hover:bg-muted"
                                  )}
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium">{svc.name}</p>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                      {svc.durationMinutes ? (
                                        <span className="inline-flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {svc.durationMinutes}m
                                        </span>
                                      ) : null}
                                      {svc.price != null ? (
                                        <span>${toMoneyNumber(svc.price).toFixed(2)}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-orange-500" /> : null}
                                </button>
                              );
                            })}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </div>
            )}
          </div>

          {/* 4. Vehicle section — only when client selected */}
          {selectedClientId && (
            <div className="space-y-2">
              <Label>4. Vehicle *</Label>
              {vehiclesFetching ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading vehicles...</span>
                </div>
              ) : vehicleList.length === 0 ? (
                <div className="space-y-2">
                  <Button asChild variant="outline" size="sm" className="h-8">
                    <Link to={`/clients/${selectedClientId}/vehicles/new?next=appointment&from=${encodeURIComponent(appointmentDraftHref)}`}>Add vehicle</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <select
                    value={selectedVehicleId ?? ""}
                    onChange={(e) => setSelectedVehicleId(e.target.value || null)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">None</option>
                    {vehicleList.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.year ? `${v.year} ` : ""}
                        {v.make} {v.model}
                      </option>
                    ))}
                  </select>
                  {selectedVehicle ? (
                    <div className="rounded-xl border border-border/70 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                      Ready to book: {[selectedVehicle.year, selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(" ")}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* 5. Error */}
          {error && (
            <p className="text-xs text-red-600 font-medium">{error}</p>
          )}
        </div>

        <SheetFooter className="border-t pt-4 px-4 pb-4 shrink-0 flex flex-row items-center justify-between gap-2">
          <Link to={fullFormHref}>
            <Button variant="ghost" size="sm">
              Open full scheduler
            </Button>
          </Link>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !businessId}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Book appointment
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
