import { CuratedVehicleCatalogProvider } from "./curatedVehicleCatalogProvider.js";
import type { VehicleCatalogProvider } from "./vehicleCatalogProvider.js";

const provider: VehicleCatalogProvider = new CuratedVehicleCatalogProvider();

export function getVehicleCatalogProvider(): VehicleCatalogProvider {
  return provider;
}
