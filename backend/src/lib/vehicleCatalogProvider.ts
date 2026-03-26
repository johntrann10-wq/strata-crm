export type VehicleCatalogOption = {
  id: string;
  label: string;
  value: string;
  source: string;
  sourceVehicleId: string | null;
};

export type VehicleTrimOption = VehicleCatalogOption & {
  bodyStyle: string | null;
  engine: string | null;
};

export type VehicleVinLookupResult = {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyStyle: string | null;
  engine: string | null;
  displayName: string;
  source: string;
  sourceVehicleId: string | null;
};

export interface VehicleCatalogProvider {
  readonly name: string;
  listYears(): Promise<number[]>;
  listMakes(year: number): Promise<VehicleCatalogOption[]>;
  listModels(year: number, makeId: string, makeName?: string | null): Promise<VehicleCatalogOption[]>;
  listTrims(year: number, makeId: string, modelName: string, makeName?: string | null): Promise<VehicleTrimOption[]>;
  decodeVin(vin: string): Promise<VehicleVinLookupResult | null>;
}

