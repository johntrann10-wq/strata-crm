type VehicleLike = {
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  bodyStyle?: string | null;
  engine?: string | null;
};

function compact(values: Array<string | number | null | undefined>): string[] {
  return values
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter((value) => value.length > 0);
}

export function buildVehicleDisplayName(vehicle: VehicleLike): string {
  const primary = compact([vehicle.year, vehicle.make, vehicle.model, vehicle.trim]).join(" ");
  if (primary) return primary;
  return compact([vehicle.make, vehicle.model, vehicle.bodyStyle, vehicle.engine]).join(" ") || "Vehicle";
}

