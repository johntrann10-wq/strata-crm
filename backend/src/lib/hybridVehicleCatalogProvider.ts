import { CuratedVehicleCatalogProvider } from "./curatedVehicleCatalogProvider.js";
import { NhtsaVehicleCatalogProvider } from "./nhtsaVehicleCatalogProvider.js";
import type {
  VehicleCatalogOption,
  VehicleCatalogProvider,
  VehicleTrimOption,
  VehicleVinLookupResult,
} from "./vehicleCatalogProvider.js";

function dedupeOptions<T extends VehicleCatalogOption>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class HybridVehicleCatalogProvider implements VehicleCatalogProvider {
  readonly name = "hybrid_vehicle_catalog";

  private readonly curated = new CuratedVehicleCatalogProvider();
  private readonly nhtsa = new NhtsaVehicleCatalogProvider();

  async listYears(): Promise<number[]> {
    return this.curated.listYears();
  }

  async listMakes(year: number): Promise<VehicleCatalogOption[]> {
    return this.curated.listMakes(year);
  }

  async listModels(year: number, makeId: string, makeName?: string | null): Promise<VehicleCatalogOption[]> {
    const curatedRecords = await this.curated.listModels(year, makeId, makeName);
    try {
      const records = dedupeOptions(await this.nhtsa.listModels(year, makeId, makeName));
      if (records.length > 0) {
        return dedupeOptions([...curatedRecords, ...records]).sort((a, b) => a.label.localeCompare(b.label));
      }
    } catch {
      // Fall back to the curated catalog when NHTSA is unavailable.
    }
    return curatedRecords;
  }

  async listTrims(year: number, makeId: string, modelName: string, makeName?: string | null): Promise<VehicleTrimOption[]> {
    try {
      const records = await this.nhtsa.listTrims(year, makeId, modelName);
      if (records.length > 0) return records;
    } catch {
      // Fall back to the curated catalog when NHTSA is unavailable.
    }
    return this.curated.listTrims(year, makeId, modelName, makeName);
  }

  async decodeVin(vin: string): Promise<VehicleVinLookupResult | null> {
    try {
      const record = await this.nhtsa.decodeVin(vin);
      if (record) return record;
    } catch {
      // Fall back to the curated VIN path when NHTSA is unavailable.
    }
    return this.curated.decodeVin(vin);
  }
}
