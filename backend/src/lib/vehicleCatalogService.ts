import { NhtsaVehicleCatalogProvider } from "./nhtsaVehicleCatalogProvider.js";
import type { VehicleCatalogProvider } from "./vehicleCatalogProvider.js";

const provider: VehicleCatalogProvider = new NhtsaVehicleCatalogProvider();

export function getVehicleCatalogProvider(): VehicleCatalogProvider {
  return provider;
}

