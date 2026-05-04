import { buildVehicleDisplayName } from "./vehicleFormatting.js";
import { withVehicleCatalogCache } from "./vehicleCatalogCache.js";
import type {
  VehicleCatalogOption,
  VehicleCatalogProvider,
  VehicleTrimOption,
  VehicleVinLookupResult,
} from "./vehicleCatalogProvider.js";

type VpicResponse<T> = {
  Results?: T[];
};

type MakeRow = {
  Make_ID?: number;
  Make_Name?: string;
};

type ModelRow = {
  Model_ID?: number;
  Model_Name?: string;
};

type VinRow = {
  ErrorCode?: string;
  Make?: string;
  Model?: string;
  ModelYear?: string;
  Trim?: string;
  BodyClass?: string;
  EngineModel?: string;
  DisplacementL?: string;
  EngineCylinders?: string;
  VehicleType?: string;
};

const BASE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles";
const SOURCE = "nhtsa_vpic";
const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`NHTSA request failed (${response.status}) for ${path}`);
  }
  return (await response.json()) as T;
}

function normalizeLabel(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeMakeOption(row: MakeRow): VehicleCatalogOption | null {
  const label = normalizeLabel(row.Make_Name);
  const id = row.Make_ID != null ? String(row.Make_ID) : "";
  if (!label || !id) return null;
  return {
    id,
    label,
    value: label,
    source: SOURCE,
    sourceVehicleId: id,
  };
}

function normalizeModelOption(row: ModelRow): VehicleCatalogOption | null {
  const label = normalizeLabel(row.Model_Name);
  const id = row.Model_ID != null ? String(row.Model_ID) : label.toLowerCase();
  if (!label) return null;
  return {
    id,
    label,
    value: label,
    source: SOURCE,
    sourceVehicleId: row.Model_ID != null ? String(row.Model_ID) : null,
  };
}

function normalizeVinLookup(vin: string, row: VinRow): VehicleVinLookupResult | null {
  const year = Number.parseInt(String(row.ModelYear ?? ""), 10);
  const make = normalizeLabel(row.Make) || null;
  const model = normalizeLabel(row.Model) || null;
  const trim = normalizeLabel(row.Trim) || null;
  const bodyStyle = normalizeLabel(row.BodyClass) || normalizeLabel(row.VehicleType) || null;
  const engineBits = [normalizeLabel(row.EngineModel), normalizeLabel(row.DisplacementL), normalizeLabel(row.EngineCylinders)]
    .filter(Boolean);
  const engine = engineBits.length > 0 ? engineBits.join(" ") : null;
  const displayName = buildVehicleDisplayName({
    year: Number.isFinite(year) ? year : null,
    make,
    model,
    trim,
    bodyStyle,
    engine,
  });
  return {
    vin,
    year: Number.isFinite(year) ? year : null,
    make,
    model,
    trim,
    bodyStyle,
    engine,
    displayName,
    source: SOURCE,
    sourceVehicleId: vin,
  };
}

export class NhtsaVehicleCatalogProvider implements VehicleCatalogProvider {
  readonly name = SOURCE;

  async listYears(): Promise<number[]> {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let year = currentYear + 1; year >= 1981; year -= 1) {
      years.push(year);
    }
    return years;
  }

  async listMakes(_year: number): Promise<VehicleCatalogOption[]> {
    return withVehicleCatalogCache(`nhtsa:makes`, DAY_MS, async () => {
      const body = await fetchJson<VpicResponse<MakeRow>>("/GetAllMakes?format=json");
      const items = (body.Results ?? [])
        .map(normalizeMakeOption)
        .filter((item): item is VehicleCatalogOption => Boolean(item))
        .sort((a, b) => a.label.localeCompare(b.label));
      return items;
    });
  }

  async listModels(year: number, makeId: string, makeName?: string | null): Promise<VehicleCatalogOption[]> {
    const encodedMakeId = encodeURIComponent(makeId);
    return withVehicleCatalogCache(`nhtsa:models:${year}:${encodedMakeId}`, DAY_MS, async () => {
      const rows: VehicleCatalogOption[] = [];

      try {
        const body = await fetchJson<VpicResponse<ModelRow>>(
          `/GetModelsForMakeIdYear/makeId/${encodedMakeId}/modelyear/${encodeURIComponent(String(year))}?format=json`
        );
        rows.push(
          ...(body.Results ?? [])
            .map(normalizeModelOption)
            .filter((item): item is VehicleCatalogOption => Boolean(item))
        );
      } catch {
        // Continue to make-name lookups when the make-id endpoint is unavailable or not useful for curated IDs.
      }

      if (makeName) {
        try {
          const fallbackBody = await fetchJson<VpicResponse<ModelRow>>(
            `/GetModelsForMakeYear/make/${encodeURIComponent(makeName)}/modelyear/${encodeURIComponent(String(year))}?format=json`
          );
          rows.push(
            ...(fallbackBody.Results ?? [])
              .map(normalizeModelOption)
              .filter((item): item is VehicleCatalogOption => Boolean(item))
          );
        } catch {
          // Continue to the broad all-year model lookup.
        }

        try {
          const allYearBody = await fetchJson<VpicResponse<ModelRow>>(
            `/GetModelsForMake/${encodeURIComponent(makeName)}?format=json`
          );
          rows.push(
            ...(allYearBody.Results ?? [])
              .map(normalizeModelOption)
              .filter((item): item is VehicleCatalogOption => Boolean(item))
          );
        } catch {
          // A broad lookup miss should not discard year-specific results.
        }
      }

      const seen = new Set<string>();
      return rows
        .filter((item) => {
          const key = item.value.trim().toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    });
  }

  async listTrims(_year: number, makeId: string, modelName: string): Promise<VehicleTrimOption[]> {
    const label = normalizeLabel(modelName);
    return withVehicleCatalogCache(`nhtsa:trims:${makeId}:${label.toLowerCase()}`, DAY_MS, async () => {
      if (!label) return [];
      return [];
    });
  }

  async decodeVin(vin: string): Promise<VehicleVinLookupResult | null> {
    const normalizedVin = vin.trim().toUpperCase();
    if (normalizedVin.length < 11) return null;
    return withVehicleCatalogCache(`nhtsa:vin:${normalizedVin}`, DAY_MS, async () => {
      const body = await fetchJson<VpicResponse<VinRow>>(
        `/DecodeVinValues/${encodeURIComponent(normalizedVin)}?format=json`
      );
      const row = body.Results?.[0];
      if (!row || row.ErrorCode === "1") return null;
      return normalizeVinLookup(normalizedVin, row);
    });
  }
}
