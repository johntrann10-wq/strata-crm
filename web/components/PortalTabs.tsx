import { Car, Calendar, FileText, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PortalVehicle {
  id: string;
  year?: number;
  make: string;
  model: string;
  color?: string;
  licensePlate?: string;
  vin?: string;
  mileage?: number;
}

export interface PortalAppointment {
  id: string;
  title?: string;
  startTime: string;
  status: string;
  totalPrice?: number;
  notes?: string;
  vehicle?: { year?: number; make: string; model: string };
}

export interface PortalInvoice {
  id: string;
  invoiceNumber?: string;
  status: string;
  total?: number;
  createdAt: string;
  dueDate?: string;
}

const formatCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
}).format;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700",
    scheduled: "bg-gray-100 text-gray-700",
    confirmed: "bg-blue-100 text-blue-700",
    "in-progress": "bg-amber-100 text-amber-700",
    in_progress: "bg-amber-100 text-amber-700",
    complete: "bg-green-100 text-green-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  const colorClass = colorMap[status] ?? "bg-gray-100 text-gray-700";

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        colorClass
      )}
    >
      {status}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    partial: "bg-amber-100 text-amber-700",
    void: "bg-red-100 text-red-700",
  };

  const colorClass = colorMap[status] ?? "bg-gray-100 text-gray-700";

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        colorClass
      )}
    >
      {status}
    </span>
  );
}

export function AppointmentsTab({
  appointments,
}: {
  appointments: PortalAppointment[];
}) {
  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Calendar className="h-12 w-12 mb-3" />
        <p>No appointments yet</p>
      </div>
    );
  }

  return (
    <div>
      {appointments.map((appointment) => (
        <div
          key={appointment.id}
          className="bg-white border rounded-lg p-4 mb-3"
        >
          <div className="flex justify-between items-center mb-1">
            <span className="font-medium">
              {appointment.title ?? "Appointment"}
            </span>
            <StatusBadge status={appointment.status} />
          </div>
          <div className="flex gap-2 text-sm text-gray-500 mb-1 items-center">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(appointment.startTime)}</span>
          </div>
          {appointment.vehicle && (
            <div className="flex gap-2 text-sm text-gray-500 mb-1 items-center">
              <Car className="h-4 w-4" />
              <span>
                {[
                  appointment.vehicle.year,
                  appointment.vehicle.make,
                  appointment.vehicle.model,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </span>
            </div>
          )}
          {appointment.totalPrice != null && (
            <div className="flex gap-2 text-sm text-gray-500 items-center">
              <DollarSign className="h-4 w-4" />
              <span>{formatCurrency(appointment.totalPrice)}</span>
            </div>
          )}
          {appointment.notes && (
            <p className="text-xs text-gray-400 italic mt-1 truncate">
              {appointment.notes}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function VehiclesTab({ vehicles }: { vehicles: PortalVehicle[] }) {
  if (vehicles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Car className="h-12 w-12 mb-3" />
        <p>No vehicles on file</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {vehicles.map((vehicle) => (
        <div key={vehicle.id} className="bg-white border rounded-lg p-4">
          <p className="font-semibold text-lg">
            {[vehicle.year, vehicle.make, vehicle.model]
              .filter(Boolean)
              .join(" ")}
          </p>
          {vehicle.color && (
            <p className="text-sm text-gray-500 mb-2">{vehicle.color}</p>
          )}
          <dl className="space-y-1">
            {vehicle.licensePlate && (
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500">License Plate</dt>
                <dd className="font-medium">{vehicle.licensePlate}</dd>
              </div>
            )}
            {vehicle.vin && (
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500">VIN</dt>
                <dd className="font-medium font-mono text-xs truncate max-w-[60%]">
                  {vehicle.vin}
                </dd>
              </div>
            )}
            {vehicle.mileage != null && vehicle.mileage !== 0 && (
              <div className="flex justify-between text-sm">
                <dt className="text-gray-500">Mileage</dt>
                <dd className="font-medium">{vehicle.mileage} mi</dd>
              </div>
            )}
          </dl>
        </div>
      ))}
    </div>
  );
}

export function InvoicesTab({ invoices }: { invoices: PortalInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <FileText className="h-12 w-12 mb-3" />
        <p>No invoices yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {invoices.map((invoice) => (
        <div
          key={invoice.id}
          className="flex items-center justify-between px-4 py-3 border-b last:border-0"
        >
          <div>
            <p className="font-medium text-sm">
              {invoice.invoiceNumber ?? "Invoice"}
            </p>
            <p className="text-xs text-gray-400">{formatDate(invoice.createdAt)}</p>
            {invoice.dueDate &&
              !["paid", "void"].includes(invoice.status) && (
                <p className="text-xs text-amber-600">
                  Due {formatDate(invoice.dueDate)}
                </p>
              )}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              {formatCurrency(invoice.total ?? 0)}
            </span>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>
      ))}
    </div>
  );
}