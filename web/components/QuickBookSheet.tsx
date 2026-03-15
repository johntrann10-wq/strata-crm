import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { useFindMany, useAction } from "@gadgetinc/react";
import { useOutletContext } from "react-router";
import { api } from "../api";
import type { AuthOutletContext } from "../routes/_app";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";

interface QuickBookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked: (id: string) => void;
}

export function QuickBookSheet({ open, onOpenChange, onBooked }: QuickBookSheetProps) {
  const { user } = useOutletContext<AuthOutletContext>();
  const businessId = user?.id;

  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!open) {
      setClientSearch("");
      setSelectedClientId(null);
      setSelectedClientName("");
      setSelectedVehicleId(null);
      setSelectedServiceId(null);
      setStartDate("");
      setStartTime("09:00");
      setTitle("");
    }
  }, [open]);

  const clientFilter = clientSearch
    ? {
        AND: [
          { businessId: { equals: businessId } },
          {
            OR: [
              { firstName: { startsWith: clientSearch } },
              { lastName: { startsWith: clientSearch } },
              { email: { startsWith: clientSearch } },
            ],
          },
        ],
      }
    : { businessId: { equals: businessId } };

  const [{ data: clients }] = useFindMany(api.client, {
    filter: clientFilter,
    first: 10,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
    pause: !businessId || !open,
  });

  const [{ data: vehicles }] = useFindMany(api.vehicle, {
    filter: { clientId: { equals: selectedClientId! } },
    first: 20,
    select: {
      id: true,
      year: true,
      make: true,
      model: true,
      color: true,
    },
    pause: !selectedClientId,
  });

  const [{ data: services }] = useFindMany(api.service, {
    filter: {
      AND: [
        { businessId: { equals: businessId } },
        { active: { equals: true } },
      ],
    },
    first: 50,
    sort: { name: "Ascending" },
    select: {
      id: true,
      name: true,
      price: true,
      duration: true,
    },
    pause: !businessId || !open,
  });

  const [{ fetching: creating }, createAppointment] = useAction(api.appointment.create);

  const handleSelectClient = useCallback(
    (id: string, firstName: string, lastName: string) => {
      setSelectedClientId(id);
      const name = `${firstName} ${lastName}`.trim();
      setSelectedClientName(name);
      setClientSearch(name);
      setSelectedVehicleId(null);
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedClientId || !selectedVehicleId || !startDate || !businessId) return;

    const startDateTime = new Date(`${startDate}T${startTime}`);
    const selectedService = services?.find((s) => s.id === selectedServiceId);
    const durationMs = selectedService?.duration
      ? selectedService.duration * 60 * 1000
      : 3600000;
    const endDateTime = new Date(startDateTime.getTime() + durationMs);

    const result = await createAppointment({
      business: { _link: businessId },
      client: { _link: selectedClientId },
      vehicle: { _link: selectedVehicleId },
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      title: title || selectedClientName,
      status: "scheduled",
    });

    if (result?.data?.id) {
      onBooked(result.data.id);
      onOpenChange(false);
    } else if (result?.error) {
      toast.error(result.error.message ?? "Failed to book appointment");
    }
  }, [
    selectedClientId,
    selectedVehicleId,
    startDate,
    startTime,
    businessId,
    services,
    selectedServiceId,
    title,
    selectedClientName,
    createAppointment,
    onBooked,
    onOpenChange,
  ]);

  const isFormValid = !!selectedClientId && !!selectedVehicleId && !!startDate;
  const showClientDropdown =
    !!clientSearch && !selectedClientId && !!clients && clients.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Quick Book Appointment</SheetTitle>
          <SheetDescription>
            Search for a client, select their vehicle, and choose a date and time to book a
            new appointment quickly.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 py-4">
          {/* Row 1: Client search + Vehicle select */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="client-search">Client</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="client-search"
                  placeholder="Search clients..."
                  className="pl-8"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    if (e.target.value !== selectedClientName) {
                      setSelectedClientId(null);
                      setSelectedVehicleId(null);
                      setSelectedClientName("");
                    }
                  }}
                />
              </div>
              {showClientDropdown && (
                <div className="border rounded-md max-h-40 overflow-y-auto bg-background shadow-md z-10">
                  {clients!.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() =>
                        handleSelectClient(
                          client.id,
                          client.firstName ?? "",
                          client.lastName ?? ""
                        )
                      }
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
                        selectedClientId === client.id
                          ? "bg-accent text-accent-foreground"
                          : ""
                      }`}
                    >
                      <div>
                        {`${client.firstName ?? ""} ${client.lastName ?? ""}`.trim()}
                      </div>
                      {client.phone && (
                        <div className="text-xs text-muted-foreground">{client.phone}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Vehicle column */}
            <div className="flex flex-col gap-2">
              <Label>Vehicle</Label>
              <Select
                value={selectedVehicleId ?? ""}
                onValueChange={(val) => setSelectedVehicleId(val)}
                disabled={!selectedClientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle..." />
                </SelectTrigger>
                <SelectContent>
                  {vehicles?.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {[vehicle.year, vehicle.make, vehicle.model, vehicle.color]
                        .filter(Boolean)
                        .join(" ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Service + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Service (optional)</Label>
              <Select
                value={selectedServiceId ?? ""}
                onValueChange={(val) => setSelectedServiceId(val)}
                disabled={!selectedClientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select service..." />
                </SelectTrigger>
                <SelectContent>
                  {services?.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                      {service.price != null ? ` — $${service.price}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="start-date">Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={!selectedClientId}
              />
            </div>
          </div>

          {/* Row 3: Time + Title */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="start-time">Time</Label>
              <Input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="appt-title">Title (optional)</Label>
              <Input
                id="appt-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Full detail"
              />
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={creating || !isFormValid}
          >
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Booking...
              </>
            ) : (
              "Book Appointment"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}