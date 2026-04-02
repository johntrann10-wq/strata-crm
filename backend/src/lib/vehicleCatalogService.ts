import { HybridVehicleCatalogProvider } from "./hybridVehicleCatalogProvider.js";
import type { VehicleCatalogProvider } from "./vehicleCatalogProvider.js";

const provider: VehicleCatalogProvider = new HybridVehicleCatalogProvider();

export function getVehicleCatalogProvider(): VehicleCatalogProvider {
  return provider;
}
