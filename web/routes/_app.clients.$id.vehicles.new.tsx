import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useOutletContext } from "react-router";
import { useAction } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { QueueReturnBanner } from "../components/shared/QueueReturnBanner";
import { toast } from "sonner";

export default function NewVehiclePage() {
  const { id: clientId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentLocationId } = useOutletContext<AuthOutletContext>();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("from")?.startsWith("/") ? searchParams.get("from")! : `/clients/${clientId}`;
  const hasQueueReturn = searchParams.has("from");
  const [submitMode, setSubmitMode] = useState<"client" | "quote" | "appointment">(() => {
    const next = searchParams.get("next");
    return next === "quote" || next === "appointment" ? next : "client";
  });
  const intendedNext =
    submitMode === "quote"
      ? "Save this vehicle and continue straight into quote creation."
      : submitMode === "appointment"
        ? "Save this vehicle and continue straight into appointment booking."
        : "Save this vehicle and return to the client record.";

  const [{ fetching: creating, error: createError }, createVehicle] =
    useAction(api.vehicle.create);

  const [year, setYear] = useState<string>(() => String(new Date().getFullYear()));
  const [make, setMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [color, setColor] = useState("");
  const [vin, setVin] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [mileage, setMileage] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const vinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      vinInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;

    const result = await createVehicle({
      clientId,
      year: year ? parseInt(year, 10) : undefined,
      make,
      model: vehicleModel,
      color: color || undefined,
      vin: vin || undefined,
      licensePlate: licensePlate || undefined,
      mileage: mileage ? parseInt(mileage, 10) : undefined,
      notes: notes || undefined,
    });

    if (result.error) {
      return;
    }

    const createdVehicleId = (result.data as any)?.id;
    if (!createdVehicleId) {
      return;
    }

    toast.success("Vehicle saved");
    if (submitMode === "quote") {
      navigate(`/quotes/new?clientId=${clientId}&vehicleId=${createdVehicleId}&from=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (submitMode === "appointment") {
      navigate(
        `/appointments/new?clientId=${clientId}&vehicleId=${createdVehicleId}${
          currentLocationId ? `&locationId=${encodeURIComponent(currentLocationId)}` : ""
        }&from=${encodeURIComponent(returnTo)}`
      );
      return;
    }
    navigate(`${returnTo}`);
  };

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      {hasQueueReturn ? <QueueReturnBanner href={returnTo} label="Back to clients queue" /> : null}
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate(returnTo)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Client
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add New Vehicle</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium">Vehicle handoff</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Save the vehicle and continue straight into a quote or appointment when you&apos;re working an active lead.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{intendedNext}</p>
            </div>

            {createError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {createError.message}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="vin">VIN</Label>
              <Input
                id="vin"
                ref={vinInputRef}
                type="text"
                placeholder="Vehicle Identification Number (optional)"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                maxLength={32}
              />
              <p className="text-xs text-muted-foreground">
                Enter the VIN if you have it (up to 17 characters).
              </p>
            </div>

            {/* Year, Make, Model – always visible primary fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  placeholder="e.g. 2023"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  min={1900}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="make">
                  Make <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="make"
                  type="text"
                  placeholder="e.g. Toyota"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicleModel">
                  Model <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="vehicleModel"
                  type="text"
                  placeholder="e.g. Camry"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* More Details toggle */}
            <button
              type="button"
              onClick={() => setShowMoreDetails((v) => !v)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showMoreDetails ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  - Less Details
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  + More Details
                </>
              )}
            </button>

            {/* Collapsible additional fields */}
            {showMoreDetails && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="color">Color</Label>
                    <Input
                      id="color"
                      type="text"
                      placeholder="e.g. White"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      maxLength={50}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="licensePlate">License Plate</Label>
                    <Input
                      id="licensePlate"
                      type="text"
                      placeholder="e.g. ABC-1234"
                      value={licensePlate}
                      onChange={(e) => setLicensePlate(e.target.value)}
                      maxLength={32}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mileage">Mileage</Label>
                    <Input
                      id="mileage"
                      type="number"
                      placeholder="e.g. 50000"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      min={0}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional notes about the vehicle..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button type="submit" variant="outline" disabled={creating || !clientId} onClick={() => setSubmitMode("quote")}>
                  {creating && submitMode === "quote" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save and Create Quote
                </Button>
                <Button type="submit" variant="outline" disabled={creating || !clientId} onClick={() => setSubmitMode("appointment")}>
                  {creating && submitMode === "appointment" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save and Book Appointment
                </Button>
              </div>
              <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(returnTo)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                onClick={() => setSubmitMode("client")}
                disabled={creating || !clientId}
              >
                {creating && submitMode === "client" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add Vehicle
              </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
