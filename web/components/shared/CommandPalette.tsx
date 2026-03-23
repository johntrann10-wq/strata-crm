import React from "react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useFindMany } from "../../hooks/useApi";
import { api } from "../../api";
import { useCommandPalette, usePageContext } from "./CommandPaletteContext";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  CalendarPlus,
  UserPlus,
  FileText,
  Receipt,
  LayoutDashboard,
  Calendar,
  Users,
  ClipboardList,
  Wrench,
  Settings,
  User,
  CalendarClock,
  Loader2,
  Car,
} from "lucide-react";
import { cn } from "@/lib/utils";

function SkeletonRows() {
  return (
    <>
      <CommandItem disabled>
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
      </CommandItem>
      <CommandItem disabled>
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
      </CommandItem>
      <CommandItem disabled>
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
      </CommandItem>
    </>
  );
}

/** Command palette search result shapes (API returns loose JSON). */
type ClientHit = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
};
type VehicleHit = {
  id: string;
  clientId?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  licensePlate?: string | null;
  color?: string | null;
  client?: { firstName?: string | null; lastName?: string | null } | null;
};
type AppointmentHit = {
  id: string;
  title?: string | null;
  status?: string | null;
  startTime?: string | null;
};
type InvoiceHit = {
  id: string;
  invoiceNumber?: string | null;
  status?: string | null;
  total?: number | string | null;
};

function statusColor(status: string): string {
  switch (status) {
    case "completed":
    case "paid":
      return "text-green-600";
    case "scheduled":
      return "text-muted-foreground";
    case "in_progress":
    case "in-progress":
    case "partial":
      return "text-orange-500";
    case "cancelled":
    case "void":
    case "no-show":
      return "text-red-500";
    case "confirmed":
    case "sent":
      return "text-blue-500";
    default:
      return "text-muted-foreground";
  }
}

export function CommandPalette(_props?: { enabledModules?: Set<string>; hasBusiness?: boolean }) {
  const hasBusiness = _props?.hasBusiness ?? true;
  const { open, setOpen } = useCommandPalette();
  const { pageContext } = usePageContext();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (query === "") {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const isSearching = debouncedQuery.length >= 2;
  const canQuery = hasBusiness && isSearching;

  const [{ data: clients, fetching: fetchingClients, error: clientsError }] = useFindMany(api.client, {
    search: debouncedQuery,
    first: 5,
    select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    pause: !canQuery,
  });

  const [{ data: appointments, fetching: fetchingAppointments, error: appointmentsError }] = useFindMany(api.appointment, {
    search: debouncedQuery,
    first: 5,
    select: { id: true, title: true, status: true, startTime: true },
    pause: !canQuery,
  });

  const [{ data: vehicles, fetching: fetchingVehicles, error: vehiclesError }] = useFindMany(api.vehicle, {
    search: debouncedQuery,
    first: 5,
    select: {
      id: true,
      year: true,
      make: true,
      model: true,
      color: true,
      licensePlate: true,
      vin: true,
      clientId: true,
      client: { id: true, firstName: true, lastName: true },
    },
    pause: !canQuery,
  });

  const [{ data: invoices, fetching: fetchingInvoices, error: invoicesError }] = useFindMany(api.invoice, {
    search: debouncedQuery,
    first: 5,
    select: { id: true, invoiceNumber: true, total: true, status: true },
    pause: !canQuery,
  });

  const isFetching = fetchingClients || fetchingAppointments || fetchingInvoices || fetchingVehicles;
  const searchError = clientsError || appointmentsError || vehiclesError || invoicesError;
  const clientRows = (Array.isArray(clients) ? clients : []) as ClientHit[];
  const appointmentRows = (Array.isArray(appointments) ? appointments : []) as AppointmentHit[];
  const vehicleRows = (Array.isArray(vehicles) ? vehicles : []) as VehicleHit[];
  const invoiceRows = (Array.isArray(invoices) ? invoices : []) as InvoiceHit[];

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const contextActions: Array<{ label: string; icon: React.ReactNode; onSelect: () => void }> = [];
  if (pageContext) {
    const { entityType, entityId, clientId, clientName, appointmentId, vehicleId } = pageContext;
    if (entityType === "client" && clientId) {
      contextActions.push({
        label: `Book Appointment for ${clientName}`,
        icon: <CalendarPlus className="mr-2 h-4 w-4 text-orange-500" />,
        onSelect: () => go(`/appointments/new?clientId=${clientId}`),
      });
      contextActions.push({
        label: `New Invoice for ${clientName}`,
        icon: <FileText className="mr-2 h-4 w-4 text-green-500" />,
        onSelect: () => go(`/invoices/new?clientId=${clientId}`),
      });
      contextActions.push({
        label: `New Quote for ${clientName}`,
        icon: <Receipt className="mr-2 h-4 w-4 text-purple-500" />,
        onSelect: () => go(`/quotes/new?clientId=${clientId}`),
      });
    } else if (entityType === "appointment" && clientId) {
      contextActions.push({
        label: "New Invoice for this Appointment",
        icon: <FileText className="mr-2 h-4 w-4 text-green-500" />,
        onSelect: () => go(`/invoices/new?appointmentId=${entityId}&clientId=${clientId}`),
      });
      contextActions.push({
        label: `View Client — ${clientName}`,
        icon: <User className="mr-2 h-4 w-4 text-blue-500" />,
        onSelect: () => go(`/clients/${clientId}`),
      });
      if (vehicleId) {
        contextActions.push({
          label: "View Vehicle",
          icon: <Car className="mr-2 h-4 w-4 text-purple-500" />,
          onSelect: () => go(`/clients/${clientId}`),
        });
      }
    } else if (entityType === "invoice" && clientId) {
      contextActions.push({
        label: `View Client — ${clientName}`,
        icon: <User className="mr-2 h-4 w-4 text-blue-500" />,
        onSelect: () => go(`/clients/${clientId}`),
      });
      if (appointmentId) {
        contextActions.push({
          label: "View Appointment",
          icon: <CalendarClock className="mr-2 h-4 w-4 text-orange-500" />,
          onSelect: () => go(`/appointments/${appointmentId}`),
        });
      }
      contextActions.push({
        label: `New Quote for ${clientName}`,
        icon: <Receipt className="mr-2 h-4 w-4 text-purple-500" />,
        onSelect: () => go(`/quotes/new?clientId=${clientId}`),
      });
    } else if (entityType === "quote" && clientId) {
      contextActions.push({
        label: "Book Appointment from this Quote",
        icon: <CalendarPlus className="mr-2 h-4 w-4 text-orange-500" />,
        onSelect: () => go(`/appointments/new?clientId=${clientId}&quoteId=${entityId}`),
      });
      contextActions.push({
        label: "Convert to Invoice",
        icon: <FileText className="mr-2 h-4 w-4 text-green-500" />,
        onSelect: () => go(`/invoices/new?clientId=${clientId}&quoteId=${entityId}`),
      });
      contextActions.push({
        label: `View Client — ${clientName}`,
        icon: <User className="mr-2 h-4 w-4 text-blue-500" />,
        onSelect: () => go(`/clients/${clientId}`),
      });
    }
  }

  const showClients = fetchingClients || clientRows.length > 0;
  const showVehicles = fetchingVehicles || vehicleRows.length > 0;
  const showAppointments = fetchingAppointments || appointmentRows.length > 0;
  const showInvoices = fetchingInvoices || invoiceRows.length > 0;
  const noResults =
    !isFetching &&
    !searchError &&
    clientRows.length === 0 &&
    vehicleRows.length === 0 &&
    appointmentRows.length === 0 &&
    invoiceRows.length === 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Quick Actions"
      description="Search clients, appointments, invoices or jump anywhere"
      className="sm:max-w-xl"
    >
      <CommandInput
        placeholder="Search clients, invoices, actions..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[420px]">
        {!isSearching && (
          <>
            {contextActions.length > 0 && (
              <>
                <CommandGroup heading="For this record">
                  {contextActions.map((action, i) => (
                    <CommandItem key={i} onSelect={action.onSelect}>
                      {action.icon}
                      {action.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandEmpty>Type to search records or select an action.</CommandEmpty>
            <CommandGroup heading="Create">
              <CommandItem onSelect={() => go("/appointments/new")}>
                <CalendarPlus className="mr-2 h-4 w-4 text-orange-500" />
                New Appointment
                <CommandShortcut>⌘ A</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => go("/clients/new")}>
                <UserPlus className="mr-2 h-4 w-4 text-blue-500" />
                New Client
                <CommandShortcut>⌘ C</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => go("/invoices/new")}>
                <FileText className="mr-2 h-4 w-4 text-green-500" />
                New Invoice
                <CommandShortcut>⌘ I</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => go("/quotes/new")}>
                <Receipt className="mr-2 h-4 w-4 text-purple-500" />
                New Quote
                <CommandShortcut>⌘ Q</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Navigate">
              <CommandItem onSelect={() => go("/signed-in")}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </CommandItem>
              <CommandItem onSelect={() => go("/calendar")}>
                <Calendar className="mr-2 h-4 w-4" />
                Calendar
              </CommandItem>
              <CommandItem onSelect={() => go("/appointments")}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Appointments
              </CommandItem>
              <CommandItem onSelect={() => go("/clients")}>
                <Users className="mr-2 h-4 w-4" />
                Clients
              </CommandItem>
              <CommandItem onSelect={() => go("/vehicles")}>
                <Car className="mr-2 h-4 w-4" />
                Vehicles
              </CommandItem>
              <CommandItem onSelect={() => go("/invoices")}>
                <FileText className="mr-2 h-4 w-4" />
                Invoices
              </CommandItem>
              <CommandItem onSelect={() => go("/quotes")}>
                <Receipt className="mr-2 h-4 w-4" />
                Quotes
              </CommandItem>
              <CommandItem onSelect={() => go("/services")}>
                <Wrench className="mr-2 h-4 w-4" />
                Services
              </CommandItem>
              <CommandItem onSelect={() => go("/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {isSearching && (
          <>
            {searchError && (
              <div className="px-3 py-2 text-xs text-destructive border-b border-destructive/20">
                Search failed: {searchError.message}
              </div>
            )}
            {noResults && (
              <CommandEmpty>No results for &ldquo;{debouncedQuery}&rdquo;.</CommandEmpty>
            )}

            {showClients && (
              <CommandGroup heading="Clients">
                {fetchingClients ? (
                  <SkeletonRows />
                ) : (
                  clientRows.map((client) => (
                    <CommandItem
                      key={client.id}
                      onSelect={() => go(`/clients/${client.id}`)}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                        <User className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <div className="flex flex-1 flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {client.firstName} {client.lastName}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {client.phone ?? client.email ?? "No contact info"}
                        </span>
                      </div>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            )}

            {showClients && showVehicles && <CommandSeparator />}

            {showVehicles && (
              <CommandGroup heading="Vehicles">
                {fetchingVehicles ? (
                  <SkeletonRows />
                ) : (
                  vehicleRows.map((vehicle) => (
                    <CommandItem
                      key={vehicle.id}
                      onSelect={() => {
                        if (vehicle.clientId) go(`/clients/${vehicle.clientId}`);
                      }}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500/10">
                        <Car className="h-3.5 w-3.5 text-purple-500" />
                      </div>
                      <div className="flex flex-1 flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {[
                            vehicle.licensePlate,
                            vehicle.color,
                            vehicle.client ? `${vehicle.client.firstName} ${vehicle.client.lastName}` : null,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            )}

            {showVehicles && showAppointments && <CommandSeparator />}

            {showAppointments && (
              <CommandGroup heading="Appointments">
                {fetchingAppointments ? (
                  <SkeletonRows />
                ) : (
                  appointmentRows.map((appointment) => (
                    <CommandItem
                      key={appointment.id}
                      onSelect={() => go(`/appointments/${appointment.id}`)}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
                        <CalendarClock className="h-3.5 w-3.5 text-orange-500" />
                      </div>
                      <div className="flex flex-1 flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {appointment.title ?? `Appointment #${appointment.id}`}
                        </span>
                        <span className="text-xs truncate">
                          <span className={statusColor(appointment.status ?? "")}>
                            {appointment.status}
                          </span>
                          {appointment.startTime && (
                            <span className="text-muted-foreground">
                              {" "}
                              &middot;{" "}
                              {new Date(appointment.startTime).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          )}
                        </span>
                      </div>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            )}

            {(showClients || showVehicles || showAppointments) && showInvoices && <CommandSeparator />}

            {showInvoices && (
              <CommandGroup heading="Invoices">
                {fetchingInvoices ? (
                  <SkeletonRows />
                ) : (
                  invoiceRows.map((invoice) => (
                    <CommandItem
                      key={invoice.id}
                      onSelect={() => go(`/invoices/${invoice.id}`)}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                        <FileText className="h-3.5 w-3.5 text-green-500" />
                      </div>
                      <div className="flex flex-1 flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {invoice.invoiceNumber ?? `Invoice #${invoice.id}`}
                        </span>
                        <span className="text-xs truncate">
                          <span className={statusColor(invoice.status ?? "")}>
                            {invoice.status}
                          </span>
                          {invoice.total != null && invoice.total !== "" && (
                            <span className="text-muted-foreground">
                              {" "}
                              &middot; ${Number(invoice.total).toFixed(2)}
                            </span>
                          )}
                        </span>
                      </div>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>

      <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">↵</kbd>{" "}
            select
          </span>
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Esc</kbd>{" "}
            close
          </span>
        </div>
        {isFetching && isSearching && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
    </CommandDialog>
  );
}