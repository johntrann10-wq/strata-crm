import React from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Car, CalendarDays, Plus } from "lucide-react";

function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function statusClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 border-0";
    case "confirmed":
      return "bg-blue-100 text-blue-800 border-0";
    case "in-progress":
      return "bg-purple-100 text-purple-800 border-0";
    case "in_progress":
      return "bg-purple-100 text-purple-800 border-0";
    case "cancelled":
      return "bg-red-100 text-red-800 border-0";
    case "no-show":
      return "bg-gray-100 text-gray-600 border-0";
    case "pending":
      return "bg-amber-100 text-amber-800 border-0";
    case "scheduled":
      return "bg-amber-100 text-amber-800 border-0";
    default:
      return "bg-gray-100 text-gray-700 border-0";
  }
}

interface VehiclesCardProps {
  id: string | undefined;
  vehicles:
    | Array<{
        id: string;
        year: number | null;
        make: string | null;
        model: string | null;
        color: string | null;
        licensePlate: string | null;
        mileage: number | null;
      }>
    | null
    | undefined;
}

export function VehiclesCard({ id, vehicles }: VehiclesCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Vehicles</CardTitle>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to={`/clients/${id}/vehicles/new`}>
              <Plus className="h-4 w-4 mr-1" />
              Add Vehicle
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {vehicles && vehicles.length > 0 ? (
          <div>
            {vehicles.map((vehicle) => (
              <Link
                key={vehicle.id}
                to={`/clients/${id}/vehicles/${vehicle.id}`}
                className="block rounded-md border p-3 my-1 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">
                      {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Unknown Vehicle"}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {vehicle.color && (
                        <span className="text-xs text-muted-foreground">{vehicle.color}</span>
                      )}
                      {vehicle.licensePlate && (
                        <span className="text-xs text-muted-foreground">{vehicle.licensePlate}</span>
                      )}
                      {vehicle.mileage != null && (
                        <span className="text-xs text-muted-foreground">{vehicle.mileage} mi</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <Car className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No vehicles on record</p>
            <Button asChild size="sm" variant="outline">
              <Link to={`/clients/${id}/vehicles/new`}>
                <Plus className="h-4 w-4 mr-1" />
                Add Vehicle
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  marketingOptIn: boolean;
  notes: string;
  internalNotes: string;
}

interface ClientEditFormProps {
  formState: FormState;
  setFormState: React.Dispatch<React.SetStateAction<FormState>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error?: string;
}

export function ClientEditForm({
  formState,
  setFormState,
  onSave,
  onCancel,
  saving,
  error,
}: ClientEditFormProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* First Name + Last Name */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">First Name</Label>
          <Input
            value={formState.firstName}
            onChange={(e) => setFormState((p) => ({ ...p, firstName: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Last Name</Label>
          <Input
            value={formState.lastName}
            onChange={(e) => setFormState((p) => ({ ...p, lastName: e.target.value }))}
          />
        </div>
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Email</Label>
        <Input
          type="email"
          value={formState.email}
          onChange={(e) => setFormState((p) => ({ ...p, email: e.target.value }))}
        />
      </div>

      {/* Phone */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Phone</Label>
        <Input
          value={formState.phone}
          onChange={(e) => setFormState((p) => ({ ...p, phone: e.target.value }))}
        />
      </div>

      {/* Address */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Address</Label>
        <Input
          value={formState.address}
          onChange={(e) => setFormState((p) => ({ ...p, address: e.target.value }))}
        />
      </div>

      {/* City + State */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">City</Label>
          <Input
            value={formState.city}
            onChange={(e) => setFormState((p) => ({ ...p, city: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">State</Label>
          <Input
            value={formState.state}
            onChange={(e) => setFormState((p) => ({ ...p, state: e.target.value }))}
          />
        </div>
      </div>

      {/* Zip */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Zip</Label>
        <Input
          value={formState.zip}
          onChange={(e) => setFormState((p) => ({ ...p, zip: e.target.value }))}
        />
      </div>

      {/* Marketing Opt-In */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="marketingOptIn"
          checked={formState.marketingOptIn}
          onCheckedChange={(val) =>
            setFormState((p) => ({ ...p, marketingOptIn: Boolean(val) }))
          }
        />
        <label htmlFor="marketingOptIn" className="text-xs cursor-pointer">
          Marketing Opt-In
        </label>
      </div>

      <Separator />

      {/* Notes */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Notes</Label>
        <Textarea
          rows={3}
          value={formState.notes}
          onChange={(e) => setFormState((p) => ({ ...p, notes: e.target.value }))}
        />
      </div>

      {/* Internal Notes */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Internal Notes</Label>
        <Textarea
          rows={3}
          value={formState.internalNotes}
          onChange={(e) => setFormState((p) => ({ ...p, internalNotes: e.target.value }))}
        />
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Actions */}
      <div className="flex flex-row gap-2">
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface AppointmentHistoryCardProps {
  id: string | undefined;
  appointments:
    | Array<{
        id: string;
        title: string | null;
        startTime: Date | null;
        status: string | null;
        totalPrice: number | null;
        vehicle: { make: string | null; model: string | null; year: number | null } | null;
      }>
    | null
    | undefined;
  totalSpend: number;
}

export function AppointmentHistoryCard({ id, appointments, totalSpend }: AppointmentHistoryCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Appointment History</CardTitle>
            </div>
            <div className="text-xs text-muted-foreground ml-7">
              Total spend:{" "}
              <span className="font-medium text-green-600">{formatCurrency(totalSpend)}</span>
            </div>
          </div>
          <Button asChild size="sm">
            <Link to={`/appointments/new?clientId=${id}`}>
              <Plus className="h-4 w-4 mr-1" />
              New Appointment
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {appointments && appointments.length > 0 ? (
          <div>
            {appointments.map((appt) => {
              const apptPrice = appt.totalPrice;
              return (
                <Link
                  key={appt.id}
                  to={`/appointments/${appt.id}`}
                  className="block rounded-md border p-3 my-1 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <p className="text-sm font-medium truncate">{appt.title ?? "Appointment"}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {appt.status && (
                          <Badge className={`text-xs capitalize ${statusClass(appt.status)}`}>
                            {appt.status}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(appt.startTime)}
                        </span>
                        {appt.vehicle && (
                          <span className="text-xs text-muted-foreground">
                            {[appt.vehicle.year, appt.vehicle.make, appt.vehicle.model]
                              .filter(Boolean)
                              .join(" ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {apptPrice != null && (
                        <span className="text-xs font-medium text-green-600">
                          {formatCurrency(apptPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <CalendarDays className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No appointments yet</p>
            <Button asChild size="sm">
              <Link to={`/appointments/new?clientId=${id}`}>
                <Plus className="h-4 w-4 mr-1" />
                Book Appointment
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}