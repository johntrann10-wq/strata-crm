import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useFindOne, useFindFirst, useAction } from "@gadgetinc/react";
import { api } from "../api";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Scan, ChevronDown, ChevronUp } from "lucide-react";

const PAINT_TYPE_OPTIONS = [
  { value: "stock", label: "Stock" },
  { value: "custom", label: "Custom" },
  { value: "wrapped", label: "Wrapped" },
  { value: "ppf", label: "PPF" },
  { value: "ceramic-coated", label: "Ceramic Coated" },
  { value: "matte", label: "Matte" },
  { value: "satin", label: "Satin" },
];

export default function VehicleEditPage() {
  const { id, vehicleId } = useParams<{ id: string; vehicleId: string }>();
  const navigate = useNavigate();

  const [{ data: vehicle, fetching, error }] = useFindOne(api.vehicle, vehicleId!, {
    select: {
      id: true,
      year: true,
      make: true,
      model: true,
      trim: true,
      color: true,
      vin: true,
      licensePlate: true,
      mileage: true,
      paintType: true,
      notes: true,
      client: { id: true, firstName: true, lastName: true },
    },
  });

  const [{ data: business }] = useFindFirst(api.business, {
    select: { id: true },
  });

  const [updateResult, update] = useAction(api.vehicle.update);
  const [deleteResult, deleteVehicle] = useAction(api.vehicle.delete);

  // Form state
  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [color, setColor] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [mileage, setMileage] = useState("");
  const [paintType, setPaintType] = useState("");
  const [notes, setNotes] = useState("");
  const [showMoreDetails, setShowMoreDetails] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [vinError, setVinError] = useState("");
  const [isDecodingVin, setIsDecodingVin] = useState(false);

  // Pre-fill form when vehicle loads
  useEffect(() => {
    if (vehicle) {
      setVin(vehicle.vin ?? "");
      setYear(vehicle.year?.toString() ?? "");
      setMake(vehicle.make ?? "");
      setModel(vehicle.model ?? "");
      setTrim(vehicle.trim ?? "");
      setColor(vehicle.color ?? "");
      setLicensePlate(vehicle.licensePlate ?? "");
      setMileage(vehicle.mileage?.toString() ?? "");
      setPaintType(vehicle.paintType ?? "");
      setNotes(vehicle.notes ?? "");
    }
  }, [vehicle]);

  // Handle update result
  useEffect(() => {
    if (updateResult.data) {
      toast.success("Vehicle updated");
      navigate(`/clients/${id}`);
    }
  }, [updateResult.data]);

  useEffect(() => {
    if (updateResult.error) {
      toast.error(updateResult.error.message ?? "Failed to update vehicle");
    }
  }, [updateResult.error]);

  // Handle delete result
  useEffect(() => {
    if (deleteResult.data) {
      toast.success("Vehicle deleted");
      navigate(`/clients/${id}`);
    }
  }, [deleteResult.data]);

  useEffect(() => {
    if (deleteResult.error) {
      toast.error(deleteResult.error.message ?? "Failed to delete vehicle");
    }
  }, [deleteResult.error]);

  const handleDecodeVin = async () => {
    setVinError("");
    setIsDecodingVin(true);
    try {
      const response = await fetch(`/api/decode-vin?vin=${encodeURIComponent(vin.trim())}`);
      const data = await response.json();
      if (response.ok && data) {
        if (data.year) setYear(data.year.toString());
        if (data.make) setMake(data.make);
        if (data.model) setModel(data.model);
        if (data.trim) setTrim(data.trim);
        toast.success("Vehicle info updated from VIN");
      } else {
        setVinError(data?.error ?? "Could not decode VIN");
      }
    } catch {
      setVinError("Failed to decode VIN");
    } finally {
      setIsDecodingVin(false);
    }
  };

  const handleSave = () => {
    update({
      id: vehicleId!,
      year: year ? parseInt(year, 10) : null,
      make,
      model,
      trim: trim || null,
      color: color || null,
      vin: vin || null,
      licensePlate: licensePlate || null,
      mileage: mileage ? parseFloat(mileage) : null,
      paintType: (paintType as any) || null,
      notes: notes || null,
    });
  };

  const handleDeleteConfirm = () => {
    deleteVehicle({ id: vehicleId! });
  };

  const clientName = vehicle?.client
    ? `${vehicle.client.firstName} ${vehicle.client.lastName}`
    : "Client";

  const pageTitle =
    vehicle?.year && vehicle?.make && vehicle?.model
      ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
      : "Edit Vehicle";

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-destructive text-lg">
          {error ? error.message : "Vehicle not found"}
        </p>
        <Button variant="outline" asChild>
          <Link to={`/clients/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Client
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto py-6 px-4">
      {/* Back button */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/clients/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to {clientName}
          </Link>
        </Button>
      </div>

      {/* Page title */}
      <h1 className="text-2xl font-bold mb-6">{pageTitle}</h1>

      {/* Edit form card */}
      <Card>
        <CardHeader>
          <CardTitle>Vehicle Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* VIN field */}
          <div className="space-y-2">
            <Label htmlFor="vin">VIN</Label>
            <div className="flex gap-2">
              <Input
                id="vin"
                value={vin}
                onChange={(e) => {
                  setVin(e.target.value);
                  setVinError("");
                }}
                placeholder="17-character VIN"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDecodeVin}
                disabled={vin.trim().length !== 17 || isDecodingVin}
              >
                {isDecodingVin ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Scan className="h-4 w-4 mr-1" />
                )}
                Decode VIN
              </Button>
            </div>
            {vinError && (
              <p className="text-sm text-destructive">{vinError}</p>
            )}
          </div>

          {/* Year, Make, Model */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2022"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="make">
                Make <span className="text-destructive">*</span>
              </Label>
              <Input
                id="make"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="e.g. Toyota"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">
                Model <span className="text-destructive">*</span>
              </Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. Camry"
                required
              />
            </div>
          </div>

          {/* More Details collapsible */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
              onClick={() => setShowMoreDetails((v) => !v)}
            >
              {showMoreDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              More Details
            </button>

            {showMoreDetails && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="trim">Trim</Label>
                    <Input
                      id="trim"
                      value={trim}
                      onChange={(e) => setTrim(e.target.value)}
                      placeholder="e.g. XSE"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="color">Color</Label>
                    <Input
                      id="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      placeholder="e.g. Midnight Black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="licensePlate">License Plate</Label>
                    <Input
                      id="licensePlate"
                      value={licensePlate}
                      onChange={(e) => setLicensePlate(e.target.value)}
                      placeholder="e.g. ABC-1234"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mileage">Mileage</Label>
                    <Input
                      id="mileage"
                      type="number"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      placeholder="e.g. 35000"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paintType">Paint Type</Label>
                  <Select
                    value={paintType || "none"}
                    onValueChange={(v) => setPaintType(v === "none" ? "" : v)}
                  >
                    <SelectTrigger id="paintType">
                      <SelectValue placeholder="Select paint type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {PAINT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional notes about this vehicle..."
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Form buttons */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/clients/${id}`)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={updateResult.fetching || !make || !model}
            >
              {updateResult.fetching && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Save Changes
            </Button>
          </div>

          {/* Separator + Delete */}
          <Separator />
          <div className="flex justify-start">
            <Button
              type="button"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete Vehicle
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this vehicle. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteResult.fetching ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}