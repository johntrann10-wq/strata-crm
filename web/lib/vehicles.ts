export type VehicleCatalogFormValue = {
  year: string;
  make: string;
  makeId: string;
  model: string;
  modelId: string;
  trim: string;
  bodyStyle: string;
  engine: string;
  vin: string;
  displayName: string;
  source: string;
  sourceVehicleId: string;
  manualEntry: boolean;
};

export const emptyVehicleCatalogFormValue: VehicleCatalogFormValue = {
  year: "",
  make: "",
  makeId: "",
  model: "",
  modelId: "",
  trim: "",
  bodyStyle: "",
  engine: "",
  vin: "",
  displayName: "",
  source: "manual",
  sourceVehicleId: "",
  manualEntry: false,
};

export function buildVehicleDisplayName(value: Partial<VehicleCatalogFormValue>): string {
  const parts = [value.year, value.make, value.model, value.trim]
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return [value.make, value.model, value.bodyStyle, value.engine]
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function formatVehicleLabel(vehicle?: {
  displayName?: string | null;
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  color?: string | null;
  licensePlate?: string | null;
} | null): string {
  if (!vehicle) return "Vehicle";
  const primary =
    String(vehicle.displayName ?? "").trim() ||
    [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const suffix = [vehicle.color, vehicle.licensePlate].filter(Boolean).join(" • ");
  return suffix ? `${primary} — ${suffix}` : primary || "Vehicle";
}
