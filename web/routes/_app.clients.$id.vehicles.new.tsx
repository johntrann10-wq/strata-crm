import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { useFindFirst, useAction } from "../hooks/useApi";
import { api } from "../api";
import type { AuthOutletContext } from "./_app";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Scan, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function NewVehiclePage() {
  const { id: clientId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [{ data: business, fetching: businessFetching }] = useFindFirst(api.business);
  const [{ data: createdVehicle, fetching: creating, error: createError }, createVehicle] =
    useAction(api.vehicle.create);

  const [year, setYear] = useState<string>(() => String(new Date().getFullYear()));
  const [make, setMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [trim, setTrim] = useState("");
  const [color, setColor] = useState("");
  const [vin, setVin] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [mileage, setMileage] = useState<string>("");
  const [paintType, setPaintType] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const vinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      vinInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const [vinDecoding, setVinDecoding] = useState(false);
  const [vinDecoded, setVinDecoded] = useState(false);
  const [vinError, setVinError] = useState("");

  useEffect(() => {
    if (createdVehicle) {
      navigate(`/clients/${clientId}`);
    }
  }, [createdVehicle, clientId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !business?.id) return;

    await createVehicle({
      year: year ? parseInt(year, 10) : undefined,
      make,
      model: vehicleModel,
      trim: trim || undefined,
      color: color || undefined,
      vin: vin || undefined,
      licensePlate: licensePlate || undefined,
      mileage: mileage ? parseInt(mileage, 10) : undefined,
      paintType: (paintType as any) || undefined,
      notes: notes || undefined,
      client: { _link: clientId },
      business: { _link: business.id },
    });
  };

  const decodeVin = async () => {
    if (vin.trim().length !== 17) {
      setVinError("VIN must be exactly 17 characters");
      return;
    }
    setVinDecoding(true);
    setVinError("");
    setVinDecoded(false);
    try {
      const response = await fetch(`/api/decode-vin?vin=${encodeURIComponent(vin.trim())}`);
      const result = await response.json();
      if (!response.ok || result.error) {
        setVinError(result.error || "VIN lookup failed");
        return;
      }
      if (result.year && !isNaN(Number(result.year))) setYear(String(result.year));
      if (result.make) setMake(result.make);
      if (result.model) setVehicleModel(result.model);
      if (result.trim) setTrim(result.trim);
      setVinDecoded(true);
      toast.success("Vehicle info auto-filled from VIN");
    } finally {
      setVinDecoding(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-2xl">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate(`/clients/${clientId}`)}>
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
            {createError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {createError.message}
              </div>
            )}

            {/* VIN – primary field, shown first to encourage decode */}
            <div className="space-y-2">
              <Label htmlFor="vin">VIN</Label>
              <div className="flex gap-2">
                <Input
                  id="vin"
                  ref={vinInputRef}
                  type="text"
                  placeholder="Vehicle Identification Number"
                  value={vin}
                  onChange={(e) => {
                    setVin(e.target.value);
                    setVinDecoded(false);
                    setVinError("");
                  }}
                  maxLength={32}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={vinDecoding || vin.trim().length !== 17}
                  onClick={decodeVin}
                >
                  {vinDecoding ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Decoding...
                    </>
                  ) : (
                    <>
                      <Scan className="h-4 w-4 mr-1" />
                      Decode VIN
                    </>
                  )}
                </Button>
              </div>
              {vinError && (
                <p className="text-xs text-destructive">{vinError}</p>
              )}
              {vinDecoded && (
                <p className="text-xs text-green-600">✓ Auto-filled from VIN</p>
              )}
              <p className="text-xs text-muted-foreground">
                Enter the full 17-character VIN and click Decode to auto-fill vehicle info.
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
                    <Label htmlFor="trim">Trim</Label>
                    <Input
                      id="trim"
                      type="text"
                      placeholder="e.g. LE"
                      value={trim}
                      onChange={(e) => setTrim(e.target.value)}
                    />
                  </div>

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
                  <Label htmlFor="paintType">Paint Type</Label>
                  <Select value={paintType} onValueChange={setPaintType}>
                    <SelectTrigger id="paintType">
                      <SelectValue placeholder="Select paint type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stock">Stock</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                      <SelectItem value="wrapped">Wrapped</SelectItem>
                      <SelectItem value="ppf">PPF</SelectItem>
                      <SelectItem value="ceramic-coated">Ceramic Coated</SelectItem>
                      <SelectItem value="matte">Matte</SelectItem>
                      <SelectItem value="satin">Satin</SelectItem>
                    </SelectContent>
                  </Select>
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

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/clients/${clientId}`)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating || businessFetching || !business?.id}
              >
                {creating ? "Adding Vehicle..." : "Add Vehicle"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}