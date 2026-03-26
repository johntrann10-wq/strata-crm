import { addMinutes } from "date-fns";
import { useState, useEffect } from "react";
import { useOutletContext, Link } from "react-router";
import { useFindMany, useAction } from "../../hooks/useApi";
import { api } from "../../api";
import type { AuthOutletContext } from "../../routes/_app";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ClientPick = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
};
type ServicePick = { id: string; name?: string; price?: number | string | null; durationMinutes?: number | null };
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

const getTomorrow = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getLocalDateString(d);
};

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
    select: { id: true, name: true, price: true, durationMinutes: true },
    sort: { name: "Ascending" },
    first: 100,
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

  const today = getToday();
  const tomorrow = getTomorrow();

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
        <SheetHeader className="px-4 pt-6 pb-3 border-b shrink-0">
          <SheetTitle>Quick Book</SheetTitle>
          <SheetDescription>Book an appointment in seconds.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-5">
          {(clientsError || servicesError || vehiclesError) && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {[clientsError, servicesError, vehiclesError].filter(Boolean).map((e) => (e as Error).message).join(" ")}
            </div>
          )}
          {/* 1. Client section */}
          <div className="space-y-1.5">
            <Label>Client *</Label>
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
            <Label>Date & Time *</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBookingDate(today)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                  bookingDate === today
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-background border-border text-foreground hover:bg-muted"
                )}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setBookingDate(tomorrow)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                  bookingDate === tomorrow
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-background border-border text-foreground hover:bg-muted"
                )}
              >
                Tomorrow
              </button>
              <input
                type="date"
                min={today}
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer",
                  bookingDate !== today && bookingDate !== tomorrow
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-background border-border text-foreground hover:bg-muted"
                )}
              />
            </div>
            <input
              type="time"
              value={bookingTime}
              onChange={(e) => setBookingTime(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* 3. Services section */}
          <div className="space-y-2">
            <Label>Services (optional)</Label>
            {serviceList.length === 0 ? (
              <p className="text-xs text-muted-foreground">No services configured.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {serviceList.map((svc) => {
                  const isSelected = selectedServiceIds.includes(svc.id);
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => toggleService(svc.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        isSelected
                          ? "bg-orange-500 text-white border-orange-500"
                          : "bg-muted border-border text-muted-foreground hover:border-orange-400"
                      )}
                    >
                      {svc.name}
                      {svc.price != null && (
                        <span className="ml-1 opacity-80">
                          (${toMoneyNumber(svc.price).toFixed(2)})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Vehicle section — only when client selected */}
          {selectedClientId && (
            <div className="space-y-2">
              <Label>Vehicle *</Label>
              <p className="text-xs text-muted-foreground">A vehicle is required to book an appointment.</p>
              {vehiclesFetching ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading vehicles…</span>
                </div>
              ) : vehicleList.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    This client needs a vehicle on file before you can book the appointment.
                  </p>
                  <Button asChild variant="outline" size="sm" className="h-8">
                    <Link to={`/clients/${selectedClientId}/vehicles/new?next=appointment&from=${encodeURIComponent(appointmentDraftHref)}`}>Add vehicle</Link>
                  </Button>
                </div>
              ) : (
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
              Full form →
            </Button>
          </Link>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !businessId}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Book Now
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
