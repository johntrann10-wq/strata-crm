import type {
  VehicleCatalogOption,
  VehicleCatalogProvider,
  VehicleTrimOption,
  VehicleVinLookupResult,
} from "./vehicleCatalogProvider.js";
import { NhtsaVehicleCatalogProvider } from "./nhtsaVehicleCatalogProvider.js";
import { buildVehicleDisplayName } from "./vehicleFormatting.js";

type TrimSeed = {
  name: string;
  bodyStyle: string;
  engine: string;
};

type ModelSeed = {
  name: string;
  bodyStyle: string;
  engine: string;
  trims: TrimSeed[];
};

type MakeSeed = {
  name: string;
  models: ModelSeed[];
};

const SOURCE = "strata_catalog";

function model(name: string, bodyStyle: string, engine: string, trims = ["Base", "Premium", "Limited"]): ModelSeed {
  return {
    name,
    bodyStyle,
    engine,
    trims: trims.map((trim) => ({ name: trim, bodyStyle, engine })),
  };
}

const MAKES: MakeSeed[] = [
  {
    name: "Toyota",
    models: [
      { name: "Camry", bodyStyle: "Sedan", engine: "2.5L I4", trims: [{ name: "LE", bodyStyle: "Sedan", engine: "2.5L I4" }, { name: "SE", bodyStyle: "Sedan", engine: "2.5L I4" }, { name: "XSE", bodyStyle: "Sedan", engine: "3.5L V6" }] },
      { name: "Corolla", bodyStyle: "Sedan", engine: "2.0L I4", trims: [{ name: "LE", bodyStyle: "Sedan", engine: "2.0L I4" }, { name: "SE", bodyStyle: "Sedan", engine: "2.0L I4" }, { name: "XSE", bodyStyle: "Sedan", engine: "2.0L I4" }] },
      { name: "Prius", bodyStyle: "Hatchback", engine: "2.0L Hybrid", trims: [{ name: "LE", bodyStyle: "Hatchback", engine: "2.0L Hybrid" }, { name: "XLE", bodyStyle: "Hatchback", engine: "2.0L Hybrid" }, { name: "Limited", bodyStyle: "Hatchback", engine: "2.0L Hybrid" }] },
      { name: "RAV4", bodyStyle: "SUV", engine: "2.5L I4", trims: [{ name: "XLE", bodyStyle: "SUV", engine: "2.5L I4" }, { name: "Adventure", bodyStyle: "SUV", engine: "2.5L I4" }, { name: "Limited", bodyStyle: "SUV", engine: "2.5L I4" }] },
      { name: "Highlander", bodyStyle: "SUV", engine: "2.4L Turbo I4", trims: [{ name: "LE", bodyStyle: "SUV", engine: "2.4L Turbo I4" }, { name: "XLE", bodyStyle: "SUV", engine: "2.4L Turbo I4" }, { name: "Platinum", bodyStyle: "SUV", engine: "2.4L Turbo I4" }] },
      { name: "4Runner", bodyStyle: "SUV", engine: "4.0L V6", trims: [{ name: "SR5", bodyStyle: "SUV", engine: "4.0L V6" }, { name: "TRD Off-Road", bodyStyle: "SUV", engine: "4.0L V6" }, { name: "Limited", bodyStyle: "SUV", engine: "4.0L V6" }] },
      { name: "Tacoma", bodyStyle: "Truck", engine: "2.4L Turbo I4", trims: [{ name: "SR5", bodyStyle: "Truck", engine: "2.4L Turbo I4" }, { name: "TRD Sport", bodyStyle: "Truck", engine: "2.4L Turbo I4" }, { name: "TRD Pro", bodyStyle: "Truck", engine: "2.4L Turbo I4" }] },
      { name: "Tundra", bodyStyle: "Truck", engine: "3.4L Twin Turbo V6", trims: [{ name: "SR5", bodyStyle: "Truck", engine: "3.4L Twin Turbo V6" }, { name: "Limited", bodyStyle: "Truck", engine: "3.4L Twin Turbo V6" }, { name: "TRD Pro", bodyStyle: "Truck", engine: "3.4L Twin Turbo V6" }] },
      { name: "Sienna", bodyStyle: "Minivan", engine: "2.5L Hybrid", trims: [{ name: "LE", bodyStyle: "Minivan", engine: "2.5L Hybrid" }, { name: "XLE", bodyStyle: "Minivan", engine: "2.5L Hybrid" }, { name: "Platinum", bodyStyle: "Minivan", engine: "2.5L Hybrid" }] },
      { name: "GR Supra", bodyStyle: "Coupe", engine: "3.0L Turbo I6", trims: [{ name: "3.0", bodyStyle: "Coupe", engine: "3.0L Turbo I6" }, { name: "Premium", bodyStyle: "Coupe", engine: "3.0L Turbo I6" }] },
      { name: "GR86", bodyStyle: "Coupe", engine: "2.4L H4", trims: [{ name: "Base", bodyStyle: "Coupe", engine: "2.4L H4" }, { name: "Premium", bodyStyle: "Coupe", engine: "2.4L H4" }] },
    ],
  },
  {
    name: "Honda",
    models: [
      { name: "Civic", bodyStyle: "Sedan", engine: "2.0L I4", trims: [{ name: "Sport", bodyStyle: "Sedan", engine: "2.0L I4" }, { name: "EX", bodyStyle: "Sedan", engine: "1.5L Turbo I4" }, { name: "Type R", bodyStyle: "Hatchback", engine: "2.0L Turbo I4" }] },
      { name: "Accord", bodyStyle: "Sedan", engine: "1.5L Turbo I4", trims: [{ name: "LX", bodyStyle: "Sedan", engine: "1.5L Turbo I4" }, { name: "Sport", bodyStyle: "Sedan", engine: "2.0L Hybrid" }, { name: "Touring", bodyStyle: "Sedan", engine: "2.0L Hybrid" }] },
      { name: "CR-V", bodyStyle: "SUV", engine: "1.5L Turbo I4", trims: [{ name: "EX", bodyStyle: "SUV", engine: "1.5L Turbo I4" }, { name: "Sport Touring", bodyStyle: "SUV", engine: "2.0L Hybrid" }] },
      { name: "HR-V", bodyStyle: "SUV", engine: "2.0L I4", trims: [{ name: "Sport", bodyStyle: "SUV", engine: "2.0L I4" }, { name: "EX-L", bodyStyle: "SUV", engine: "2.0L I4" }] },
      { name: "Pilot", bodyStyle: "SUV", engine: "3.5L V6", trims: [{ name: "EX-L", bodyStyle: "SUV", engine: "3.5L V6" }, { name: "TrailSport", bodyStyle: "SUV", engine: "3.5L V6" }] },
      { name: "Passport", bodyStyle: "SUV", engine: "3.5L V6", trims: [{ name: "EX-L", bodyStyle: "SUV", engine: "3.5L V6" }, { name: "TrailSport", bodyStyle: "SUV", engine: "3.5L V6" }] },
      { name: "Ridgeline", bodyStyle: "Truck", engine: "3.5L V6", trims: [{ name: "RTL", bodyStyle: "Truck", engine: "3.5L V6" }, { name: "TrailSport", bodyStyle: "Truck", engine: "3.5L V6" }] },
      { name: "Odyssey", bodyStyle: "Minivan", engine: "3.5L V6", trims: [{ name: "EX-L", bodyStyle: "Minivan", engine: "3.5L V6" }, { name: "Touring", bodyStyle: "Minivan", engine: "3.5L V6" }] },
    ],
  },
  {
    name: "Ford",
    models: [
      { name: "F-150", bodyStyle: "Truck", engine: "3.5L EcoBoost V6", trims: [{ name: "XLT", bodyStyle: "Truck", engine: "2.7L EcoBoost V6" }, { name: "Lariat", bodyStyle: "Truck", engine: "5.0L V8" }, { name: "Raptor", bodyStyle: "Truck", engine: "3.5L EcoBoost V6" }] },
      { name: "Ranger", bodyStyle: "Truck", engine: "2.3L EcoBoost I4", trims: [{ name: "XLT", bodyStyle: "Truck", engine: "2.3L EcoBoost I4" }, { name: "Lariat", bodyStyle: "Truck", engine: "2.3L EcoBoost I4" }, { name: "Raptor", bodyStyle: "Truck", engine: "3.0L EcoBoost V6" }] },
      { name: "Maverick", bodyStyle: "Truck", engine: "2.0L EcoBoost I4", trims: [{ name: "XLT", bodyStyle: "Truck", engine: "2.0L EcoBoost I4" }, { name: "Lariat", bodyStyle: "Truck", engine: "2.0L EcoBoost I4" }, { name: "Tremor", bodyStyle: "Truck", engine: "2.0L EcoBoost I4" }] },
      { name: "Mustang", bodyStyle: "Coupe", engine: "2.3L EcoBoost I4", trims: [{ name: "EcoBoost", bodyStyle: "Coupe", engine: "2.3L EcoBoost I4" }, { name: "GT", bodyStyle: "Coupe", engine: "5.0L V8" }, { name: "Dark Horse", bodyStyle: "Coupe", engine: "5.0L V8" }] },
      { name: "Escape", bodyStyle: "SUV", engine: "1.5L EcoBoost I3", trims: [{ name: "Active", bodyStyle: "SUV", engine: "1.5L EcoBoost I3" }, { name: "ST-Line", bodyStyle: "SUV", engine: "2.0L EcoBoost I4" }] },
      { name: "Explorer", bodyStyle: "SUV", engine: "2.3L EcoBoost I4", trims: [{ name: "XLT", bodyStyle: "SUV", engine: "2.3L EcoBoost I4" }, { name: "ST", bodyStyle: "SUV", engine: "3.0L EcoBoost V6" }] },
      { name: "Expedition", bodyStyle: "SUV", engine: "3.5L EcoBoost V6", trims: [{ name: "XLT", bodyStyle: "SUV", engine: "3.5L EcoBoost V6" }, { name: "Limited", bodyStyle: "SUV", engine: "3.5L EcoBoost V6" }] },
      { name: "Bronco", bodyStyle: "SUV", engine: "2.3L Turbo I4", trims: [{ name: "Big Bend", bodyStyle: "SUV", engine: "2.3L Turbo I4" }, { name: "Outer Banks", bodyStyle: "SUV", engine: "2.7L Turbo V6" }, { name: "Badlands", bodyStyle: "SUV", engine: "2.7L Turbo V6" }] },
    ],
  },
  {
    name: "Chevrolet",
    models: [
      { name: "Silverado 1500", bodyStyle: "Truck", engine: "5.3L V8", trims: [{ name: "LT", bodyStyle: "Truck", engine: "5.3L V8" }, { name: "RST", bodyStyle: "Truck", engine: "5.3L V8" }, { name: "ZR2", bodyStyle: "Truck", engine: "6.2L V8" }] },
      { name: "Colorado", bodyStyle: "Truck", engine: "2.7L Turbo I4", trims: [{ name: "LT", bodyStyle: "Truck", engine: "2.7L Turbo I4" }, { name: "Z71", bodyStyle: "Truck", engine: "2.7L Turbo I4" }, { name: "ZR2", bodyStyle: "Truck", engine: "2.7L Turbo I4" }] },
      { name: "Malibu", bodyStyle: "Sedan", engine: "1.5L Turbo I4", trims: [{ name: "LS", bodyStyle: "Sedan", engine: "1.5L Turbo I4" }, { name: "2LT", bodyStyle: "Sedan", engine: "1.5L Turbo I4" }] },
      { name: "Camaro", bodyStyle: "Coupe", engine: "2.0L Turbo I4", trims: [{ name: "LT1", bodyStyle: "Coupe", engine: "6.2L V8" }, { name: "SS", bodyStyle: "Coupe", engine: "6.2L V8" }, { name: "ZL1", bodyStyle: "Coupe", engine: "6.2L Supercharged V8" }] },
      { name: "Corvette", bodyStyle: "Coupe", engine: "6.2L V8", trims: [{ name: "Stingray", bodyStyle: "Coupe", engine: "6.2L V8" }, { name: "Z06", bodyStyle: "Coupe", engine: "5.5L V8" }] },
      { name: "Equinox", bodyStyle: "SUV", engine: "1.5L Turbo I4", trims: [{ name: "LT", bodyStyle: "SUV", engine: "1.5L Turbo I4" }, { name: "RS", bodyStyle: "SUV", engine: "1.5L Turbo I4" }] },
      { name: "Traverse", bodyStyle: "SUV", engine: "2.5L Turbo I4", trims: [{ name: "LT", bodyStyle: "SUV", engine: "2.5L Turbo I4" }, { name: "RS", bodyStyle: "SUV", engine: "2.5L Turbo I4" }] },
      { name: "Blazer", bodyStyle: "SUV", engine: "2.0L Turbo I4", trims: [{ name: "LT", bodyStyle: "SUV", engine: "2.0L Turbo I4" }, { name: "RS", bodyStyle: "SUV", engine: "3.6L V6" }] },
      { name: "Tahoe", bodyStyle: "SUV", engine: "5.3L V8", trims: [{ name: "LT", bodyStyle: "SUV", engine: "5.3L V8" }, { name: "RST", bodyStyle: "SUV", engine: "6.2L V8" }] },
    ],
  },
  {
    name: "BMW",
    models: [
      { name: "330i", bodyStyle: "Sedan", engine: "2.0L Turbo I4", trims: [{ name: "Base", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }, { name: "M Sport", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }] },
      { name: "430i", bodyStyle: "Coupe", engine: "2.0L Turbo I4", trims: [{ name: "Base", bodyStyle: "Coupe", engine: "2.0L Turbo I4" }, { name: "M Sport", bodyStyle: "Coupe", engine: "2.0L Turbo I4" }] },
      { name: "M3", bodyStyle: "Sedan", engine: "3.0L Twin Turbo I6", trims: [{ name: "Base", bodyStyle: "Sedan", engine: "3.0L Twin Turbo I6" }, { name: "Competition", bodyStyle: "Sedan", engine: "3.0L Twin Turbo I6" }] },
      { name: "M4", bodyStyle: "Coupe", engine: "3.0L Twin Turbo I6", trims: [{ name: "Base", bodyStyle: "Coupe", engine: "3.0L Twin Turbo I6" }, { name: "Competition", bodyStyle: "Coupe", engine: "3.0L Twin Turbo I6" }] },
      { name: "X3", bodyStyle: "SUV", engine: "2.0L Turbo I4", trims: [{ name: "xDrive30i", bodyStyle: "SUV", engine: "2.0L Turbo I4" }, { name: "M40i", bodyStyle: "SUV", engine: "3.0L Turbo I6" }] },
      { name: "X5", bodyStyle: "SUV", engine: "3.0L Turbo I6", trims: [{ name: "xDrive40i", bodyStyle: "SUV", engine: "3.0L Turbo I6" }, { name: "M60i", bodyStyle: "SUV", engine: "4.4L Twin Turbo V8" }] },
      { name: "X7", bodyStyle: "SUV", engine: "3.0L Turbo I6", trims: [{ name: "xDrive40i", bodyStyle: "SUV", engine: "3.0L Turbo I6" }, { name: "M60i", bodyStyle: "SUV", engine: "4.4L Twin Turbo V8" }] },
    ],
  },
  {
    name: "Mercedes-Benz",
    models: [
      { name: "C 300", bodyStyle: "Sedan", engine: "2.0L Turbo I4", trims: [{ name: "Base", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }, { name: "4MATIC", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }] },
      { name: "CLA 250", bodyStyle: "Sedan", engine: "2.0L Turbo I4", trims: [{ name: "Base", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }, { name: "4MATIC", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }] },
      { name: "E 350", bodyStyle: "Sedan", engine: "2.0L Turbo I4", trims: [{ name: "Base", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }, { name: "4MATIC", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }] },
      { name: "GLC 300", bodyStyle: "SUV", engine: "2.0L Turbo I4", trims: [{ name: "Base", bodyStyle: "SUV", engine: "2.0L Turbo I4" }, { name: "4MATIC", bodyStyle: "SUV", engine: "2.0L Turbo I4" }] },
      { name: "GLE 350", bodyStyle: "SUV", engine: "2.0L Turbo I4", trims: [{ name: "Base", bodyStyle: "SUV", engine: "2.0L Turbo I4" }, { name: "4MATIC", bodyStyle: "SUV", engine: "2.0L Turbo I4" }] },
      { name: "GLE 450", bodyStyle: "SUV", engine: "3.0L Turbo I6", trims: [{ name: "4MATIC", bodyStyle: "SUV", engine: "3.0L Turbo I6" }] },
      { name: "GLS 450", bodyStyle: "SUV", engine: "3.0L Turbo I6", trims: [{ name: "4MATIC", bodyStyle: "SUV", engine: "3.0L Turbo I6" }] },
    ],
  },
  {
    name: "Audi",
    models: [
      { name: "A4", bodyStyle: "Sedan", engine: "2.0L Turbo I4", trims: [{ name: "Premium", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }, { name: "Premium Plus", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }] },
      { name: "A5", bodyStyle: "Coupe", engine: "2.0L Turbo I4", trims: [{ name: "Premium", bodyStyle: "Coupe", engine: "2.0L Turbo I4" }, { name: "Premium Plus", bodyStyle: "Coupe", engine: "2.0L Turbo I4" }] },
      { name: "A6", bodyStyle: "Sedan", engine: "2.0L Turbo I4", trims: [{ name: "Premium", bodyStyle: "Sedan", engine: "2.0L Turbo I4" }, { name: "Prestige", bodyStyle: "Sedan", engine: "3.0L Turbo V6" }] },
      { name: "S4", bodyStyle: "Sedan", engine: "3.0L Turbo V6", trims: [{ name: "Premium Plus", bodyStyle: "Sedan", engine: "3.0L Turbo V6" }] },
      { name: "Q3", bodyStyle: "SUV", engine: "2.0L Turbo I4", trims: [{ name: "Premium", bodyStyle: "SUV", engine: "2.0L Turbo I4" }, { name: "Premium Plus", bodyStyle: "SUV", engine: "2.0L Turbo I4" }] },
      { name: "Q5", bodyStyle: "SUV", engine: "2.0L Turbo I4", trims: [{ name: "Premium", bodyStyle: "SUV", engine: "2.0L Turbo I4" }, { name: "Prestige", bodyStyle: "SUV", engine: "2.0L Turbo I4" }] },
      { name: "Q7", bodyStyle: "SUV", engine: "3.0L Turbo V6", trims: [{ name: "Premium", bodyStyle: "SUV", engine: "3.0L Turbo V6" }, { name: "Prestige", bodyStyle: "SUV", engine: "3.0L Turbo V6" }] },
    ],
  },
  {
    name: "Tesla",
    models: [
      { name: "Model 3", bodyStyle: "Sedan", engine: "Dual Motor Electric", trims: [{ name: "Rear-Wheel Drive", bodyStyle: "Sedan", engine: "Single Motor Electric" }, { name: "Long Range", bodyStyle: "Sedan", engine: "Dual Motor Electric" }, { name: "Performance", bodyStyle: "Sedan", engine: "Dual Motor Electric" }] },
      { name: "Model Y", bodyStyle: "SUV", engine: "Dual Motor Electric", trims: [{ name: "Long Range", bodyStyle: "SUV", engine: "Dual Motor Electric" }, { name: "Performance", bodyStyle: "SUV", engine: "Dual Motor Electric" }] },
      { name: "Model S", bodyStyle: "Sedan", engine: "Dual Motor Electric", trims: [{ name: "Dual Motor", bodyStyle: "Sedan", engine: "Dual Motor Electric" }, { name: "Plaid", bodyStyle: "Sedan", engine: "Tri Motor Electric" }] },
      { name: "Model X", bodyStyle: "SUV", engine: "Dual Motor Electric", trims: [{ name: "Dual Motor", bodyStyle: "SUV", engine: "Dual Motor Electric" }, { name: "Plaid", bodyStyle: "SUV", engine: "Tri Motor Electric" }] },
      { name: "Cybertruck", bodyStyle: "Truck", engine: "Dual Motor Electric", trims: [{ name: "All-Wheel Drive", bodyStyle: "Truck", engine: "Dual Motor Electric" }, { name: "Cyberbeast", bodyStyle: "Truck", engine: "Tri Motor Electric" }] },
    ],
  },
  {
    name: "Subaru",
    models: [
      { name: "WRX", bodyStyle: "Sedan", engine: "2.4L Turbo H4", trims: [{ name: "Premium", bodyStyle: "Sedan", engine: "2.4L Turbo H4" }, { name: "Limited", bodyStyle: "Sedan", engine: "2.4L Turbo H4" }] },
      { name: "Impreza", bodyStyle: "Hatchback", engine: "2.0L H4", trims: [{ name: "Sport", bodyStyle: "Hatchback", engine: "2.0L H4" }, { name: "RS", bodyStyle: "Hatchback", engine: "2.5L H4" }] },
      { name: "BRZ", bodyStyle: "Coupe", engine: "2.4L H4", trims: [{ name: "Premium", bodyStyle: "Coupe", engine: "2.4L H4" }, { name: "Limited", bodyStyle: "Coupe", engine: "2.4L H4" }] },
      { name: "Crosstrek", bodyStyle: "SUV", engine: "2.0L H4", trims: [{ name: "Premium", bodyStyle: "SUV", engine: "2.0L H4" }, { name: "Wilderness", bodyStyle: "SUV", engine: "2.5L H4" }] },
      { name: "Forester", bodyStyle: "SUV", engine: "2.5L H4", trims: [{ name: "Premium", bodyStyle: "SUV", engine: "2.5L H4" }, { name: "Wilderness", bodyStyle: "SUV", engine: "2.5L H4" }] },
      { name: "Outback", bodyStyle: "Wagon", engine: "2.5L H4", trims: [{ name: "Premium", bodyStyle: "Wagon", engine: "2.5L H4" }, { name: "Wilderness", bodyStyle: "Wagon", engine: "2.4L Turbo H4" }] },
      { name: "Ascent", bodyStyle: "SUV", engine: "2.4L Turbo H4", trims: [{ name: "Premium", bodyStyle: "SUV", engine: "2.4L Turbo H4" }, { name: "Touring", bodyStyle: "SUV", engine: "2.4L Turbo H4" }] },
    ],
  },
  {
    name: "Nissan",
    models: [
      { name: "Altima", bodyStyle: "Sedan", engine: "2.5L I4", trims: [{ name: "SV", bodyStyle: "Sedan", engine: "2.5L I4" }, { name: "SR", bodyStyle: "Sedan", engine: "2.5L I4" }] },
      { name: "Sentra", bodyStyle: "Sedan", engine: "2.0L I4", trims: [{ name: "SV", bodyStyle: "Sedan", engine: "2.0L I4" }, { name: "SR", bodyStyle: "Sedan", engine: "2.0L I4" }] },
      { name: "Rogue", bodyStyle: "SUV", engine: "1.5L Turbo I3", trims: [{ name: "SV", bodyStyle: "SUV", engine: "1.5L Turbo I3" }, { name: "Platinum", bodyStyle: "SUV", engine: "1.5L Turbo I3" }] },
      { name: "370Z", bodyStyle: "Coupe", engine: "3.7L V6", trims: [{ name: "Sport", bodyStyle: "Coupe", engine: "3.7L V6" }, { name: "NISMO", bodyStyle: "Coupe", engine: "3.7L V6" }] },
      { name: "Z", bodyStyle: "Coupe", engine: "3.0L Twin Turbo V6", trims: [{ name: "Sport", bodyStyle: "Coupe", engine: "3.0L Twin Turbo V6" }, { name: "NISMO", bodyStyle: "Coupe", engine: "3.0L Twin Turbo V6" }] },
      { name: "GT-R", bodyStyle: "Coupe", engine: "3.8L Twin Turbo V6", trims: [{ name: "Premium", bodyStyle: "Coupe", engine: "3.8L Twin Turbo V6" }, { name: "NISMO", bodyStyle: "Coupe", engine: "3.8L Twin Turbo V6" }] },
      { name: "Frontier", bodyStyle: "Truck", engine: "3.8L V6", trims: [{ name: "SV", bodyStyle: "Truck", engine: "3.8L V6" }, { name: "PRO-4X", bodyStyle: "Truck", engine: "3.8L V6" }] },
      { name: "Armada", bodyStyle: "SUV", engine: "5.6L V8", trims: [{ name: "SL", bodyStyle: "SUV", engine: "5.6L V8" }, { name: "Platinum", bodyStyle: "SUV", engine: "5.6L V8" }] },
    ],
  },
  {
    name: "Hyundai",
    models: [
      { name: "Elantra", bodyStyle: "Sedan", engine: "2.0L I4", trims: [{ name: "SEL", bodyStyle: "Sedan", engine: "2.0L I4" }, { name: "N Line", bodyStyle: "Sedan", engine: "1.6L Turbo I4" }] },
      { name: "Sonata", bodyStyle: "Sedan", engine: "2.5L I4", trims: [{ name: "SEL", bodyStyle: "Sedan", engine: "2.5L I4" }, { name: "N Line", bodyStyle: "Sedan", engine: "2.5L Turbo I4" }] },
      { name: "Kona", bodyStyle: "SUV", engine: "2.0L I4", trims: [{ name: "SEL", bodyStyle: "SUV", engine: "2.0L I4" }, { name: "N Line", bodyStyle: "SUV", engine: "1.6L Turbo I4" }] },
      { name: "Tucson", bodyStyle: "SUV", engine: "2.5L I4", trims: [{ name: "SEL", bodyStyle: "SUV", engine: "2.5L I4" }, { name: "Limited", bodyStyle: "SUV", engine: "2.5L Hybrid" }] },
      { name: "Santa Fe", bodyStyle: "SUV", engine: "2.5L Turbo I4", trims: [{ name: "SEL", bodyStyle: "SUV", engine: "2.5L Turbo I4" }, { name: "Calligraphy", bodyStyle: "SUV", engine: "2.5L Turbo I4" }] },
      { name: "Palisade", bodyStyle: "SUV", engine: "3.8L V6", trims: [{ name: "SEL", bodyStyle: "SUV", engine: "3.8L V6" }, { name: "Calligraphy", bodyStyle: "SUV", engine: "3.8L V6" }] },
      { name: "IONIQ 5", bodyStyle: "SUV", engine: "Dual Motor Electric", trims: [{ name: "SE", bodyStyle: "SUV", engine: "Single Motor Electric" }, { name: "Limited", bodyStyle: "SUV", engine: "Dual Motor Electric" }] },
    ],
  },
  {
    name: "Kia",
    models: [
      { name: "Forte", bodyStyle: "Sedan", engine: "2.0L I4", trims: [{ name: "LXS", bodyStyle: "Sedan", engine: "2.0L I4" }, { name: "GT", bodyStyle: "Sedan", engine: "1.6L Turbo I4" }] },
      { name: "K5", bodyStyle: "Sedan", engine: "1.6L Turbo I4", trims: [{ name: "GT-Line", bodyStyle: "Sedan", engine: "1.6L Turbo I4" }, { name: "GT", bodyStyle: "Sedan", engine: "2.5L Turbo I4" }] },
      { name: "Sportage", bodyStyle: "SUV", engine: "2.5L I4", trims: [{ name: "EX", bodyStyle: "SUV", engine: "2.5L I4" }, { name: "X-Pro", bodyStyle: "SUV", engine: "2.5L I4" }] },
      { name: "Sorento", bodyStyle: "SUV", engine: "2.5L I4", trims: [{ name: "S", bodyStyle: "SUV", engine: "2.5L I4" }, { name: "SX", bodyStyle: "SUV", engine: "2.5L Turbo I4" }] },
      { name: "Telluride", bodyStyle: "SUV", engine: "3.8L V6", trims: [{ name: "EX", bodyStyle: "SUV", engine: "3.8L V6" }, { name: "SX", bodyStyle: "SUV", engine: "3.8L V6" }] },
      { name: "Stinger", bodyStyle: "Sedan", engine: "3.3L Twin Turbo V6", trims: [{ name: "GT-Line", bodyStyle: "Sedan", engine: "2.5L Turbo I4" }, { name: "GT2", bodyStyle: "Sedan", engine: "3.3L Twin Turbo V6" }] },
      { name: "EV6", bodyStyle: "Crossover", engine: "Dual Motor Electric", trims: [{ name: "Light", bodyStyle: "Crossover", engine: "Single Motor Electric" }, { name: "GT-Line", bodyStyle: "Crossover", engine: "Dual Motor Electric" }] },
    ],
  },
  {
    name: "Mazda",
    models: [
      { name: "Mazda3", bodyStyle: "Sedan", engine: "2.5L I4", trims: [{ name: "Select", bodyStyle: "Sedan", engine: "2.5L I4" }, { name: "Turbo Premium Plus", bodyStyle: "Sedan", engine: "2.5L Turbo I4" }] },
      { name: "CX-30", bodyStyle: "SUV", engine: "2.5L I4", trims: [{ name: "Select", bodyStyle: "SUV", engine: "2.5L I4" }, { name: "Turbo Premium", bodyStyle: "SUV", engine: "2.5L Turbo I4" }] },
      { name: "CX-5", bodyStyle: "SUV", engine: "2.5L I4", trims: [{ name: "Preferred", bodyStyle: "SUV", engine: "2.5L I4" }, { name: "Turbo", bodyStyle: "SUV", engine: "2.5L Turbo I4" }] },
      { name: "CX-50", bodyStyle: "SUV", engine: "2.5L I4", trims: [{ name: "Preferred", bodyStyle: "SUV", engine: "2.5L I4" }, { name: "Turbo", bodyStyle: "SUV", engine: "2.5L Turbo I4" }] },
      { name: "CX-90", bodyStyle: "SUV", engine: "3.3L Turbo I6", trims: [{ name: "Preferred", bodyStyle: "SUV", engine: "3.3L Turbo I6" }, { name: "Premium Plus", bodyStyle: "SUV", engine: "3.3L Turbo I6" }] },
      { name: "MX-5 Miata", bodyStyle: "Convertible", engine: "2.0L I4", trims: [{ name: "Club", bodyStyle: "Convertible", engine: "2.0L I4" }, { name: "Grand Touring", bodyStyle: "Convertible", engine: "2.0L I4" }] },
    ],
  },
  {
    name: "Volkswagen",
    models: [
      { name: "Taos", bodyStyle: "SUV", engine: "1.5L Turbo I4", trims: [{ name: "S", bodyStyle: "SUV", engine: "1.5L Turbo I4" }, { name: "SEL", bodyStyle: "SUV", engine: "1.5L Turbo I4" }] },
      { name: "Jetta", bodyStyle: "Sedan", engine: "1.5L Turbo I4", trims: [{ name: "Sport", bodyStyle: "Sedan", engine: "1.5L Turbo I4" }, { name: "SEL", bodyStyle: "Sedan", engine: "1.5L Turbo I4" }] },
      { name: "Golf GTI", bodyStyle: "Hatchback", engine: "2.0L Turbo I4", trims: [{ name: "SE", bodyStyle: "Hatchback", engine: "2.0L Turbo I4" }, { name: "Autobahn", bodyStyle: "Hatchback", engine: "2.0L Turbo I4" }] },
      { name: "Golf R", bodyStyle: "Hatchback", engine: "2.0L Turbo I4", trims: [{ name: "Base", bodyStyle: "Hatchback", engine: "2.0L Turbo I4" }] },
      { name: "Tiguan", bodyStyle: "SUV", engine: "2.0L Turbo I4", trims: [{ name: "SE", bodyStyle: "SUV", engine: "2.0L Turbo I4" }, { name: "SEL R-Line", bodyStyle: "SUV", engine: "2.0L Turbo I4" }] },
      { name: "Atlas", bodyStyle: "SUV", engine: "2.0L Turbo I4", trims: [{ name: "SE", bodyStyle: "SUV", engine: "2.0L Turbo I4" }, { name: "SEL Premium", bodyStyle: "SUV", engine: "2.0L Turbo I4" }] },
    ],
  },
  {
    name: "Porsche",
    models: [
      { name: "911", bodyStyle: "Coupe", engine: "3.0L Twin Turbo H6", trims: [{ name: "Carrera", bodyStyle: "Coupe", engine: "3.0L Twin Turbo H6" }, { name: "Carrera S", bodyStyle: "Coupe", engine: "3.0L Twin Turbo H6" }, { name: "GT3", bodyStyle: "Coupe", engine: "4.0L H6" }] },
      { name: "Cayman", bodyStyle: "Coupe", engine: "2.0L Turbo H4", trims: [{ name: "Base", bodyStyle: "Coupe", engine: "2.0L Turbo H4" }, { name: "GTS 4.0", bodyStyle: "Coupe", engine: "4.0L H6" }] },
      { name: "Cayenne", bodyStyle: "SUV", engine: "3.0L Turbo V6", trims: [{ name: "Base", bodyStyle: "SUV", engine: "3.0L Turbo V6" }, { name: "GTS", bodyStyle: "SUV", engine: "4.0L Twin Turbo V8" }] },
      { name: "Macan", bodyStyle: "SUV", engine: "2.0L Turbo I4", trims: [{ name: "Base", bodyStyle: "SUV", engine: "2.0L Turbo I4" }, { name: "GTS", bodyStyle: "SUV", engine: "2.9L Twin Turbo V6" }] },
      { name: "Panamera", bodyStyle: "Sedan", engine: "2.9L Twin Turbo V6", trims: [{ name: "Base", bodyStyle: "Sedan", engine: "2.9L Twin Turbo V6" }, { name: "Turbo E-Hybrid", bodyStyle: "Sedan", engine: "4.0L Twin Turbo V8 Hybrid" }] },
      { name: "Taycan", bodyStyle: "Sedan", engine: "Dual Motor Electric", trims: [{ name: "4S", bodyStyle: "Sedan", engine: "Dual Motor Electric" }, { name: "Turbo", bodyStyle: "Sedan", engine: "Dual Motor Electric" }] },
    ],
  },
  {
    name: "Lexus",
    models: [
      model("IS", "Sedan", "2.0L Turbo I4", ["300", "350 F Sport", "500 F Sport Performance"]),
      model("ES", "Sedan", "2.5L I4", ["250", "350", "300h"]),
      model("LS", "Sedan", "3.4L Twin Turbo V6", ["500", "500 F Sport", "500h"]),
      model("UX", "SUV", "2.0L Hybrid", ["250h", "Premium", "F Sport"]),
      model("NX", "SUV", "2.5L I4", ["250", "350", "350h", "450h+"]),
      model("RX", "SUV", "2.4L Turbo I4", ["350", "350h", "500h F Sport Performance"]),
      model("GX", "SUV", "3.4L Twin Turbo V6", ["Premium", "Overtrail", "Luxury"]),
      model("TX", "SUV", "2.4L Turbo I4", ["350", "500h", "550h+"]),
      model("LX", "SUV", "3.4L Twin Turbo V6", ["600", "F Sport", "Ultra Luxury"]),
      model("RC", "Coupe", "2.0L Turbo I4", ["300", "350 F Sport", "F"]),
      model("LC", "Coupe", "5.0L V8", ["500", "500 Convertible", "500h"]),
    ],
  },
  {
    name: "Acura",
    models: [
      model("Integra", "Hatchback", "1.5L Turbo I4", ["Base", "A-Spec", "Type S"]),
      model("TLX", "Sedan", "2.0L Turbo I4", ["Technology", "A-Spec", "Type S"]),
      model("RDX", "SUV", "2.0L Turbo I4", ["Technology", "A-Spec", "Advance"]),
      model("MDX", "SUV", "3.5L V6", ["Technology", "A-Spec", "Type S"]),
      model("ZDX", "SUV", "Dual Motor Electric", ["A-Spec", "Type S"]),
      model("NSX", "Coupe", "3.5L Twin Turbo Hybrid V6", ["Base", "Type S"]),
    ],
  },
  {
    name: "Jeep",
    models: [
      model("Wrangler", "SUV", "3.6L V6", ["Sport", "Sahara", "Rubicon", "392"]),
      model("Gladiator", "Truck", "3.6L V6", ["Sport", "Mojave", "Rubicon"]),
      model("Compass", "SUV", "2.0L Turbo I4", ["Latitude", "Limited", "Trailhawk"]),
      model("Cherokee", "SUV", "2.4L I4", ["Latitude", "Limited", "Trailhawk"]),
      model("Grand Cherokee", "SUV", "3.6L V6", ["Laredo", "Limited", "Summit", "4xe"]),
      model("Wagoneer", "SUV", "3.0L Twin Turbo I6", ["Series II", "Series III", "Carbide"]),
      model("Grand Wagoneer", "SUV", "3.0L Twin Turbo I6", ["Series II", "Series III", "Obsidian"]),
      model("Renegade", "SUV", "1.3L Turbo I4", ["Latitude", "Limited", "Trailhawk"]),
    ],
  },
  {
    name: "Ram",
    models: [
      model("1500", "Truck", "3.6L V6", ["Tradesman", "Big Horn", "Laramie", "Rebel", "Limited"]),
      model("1500 TRX", "Truck", "6.2L Supercharged V8", ["Base", "Level 2"]),
      model("2500", "Truck", "6.4L V8", ["Tradesman", "Big Horn", "Laramie", "Power Wagon"]),
      model("3500", "Truck", "6.4L V8", ["Tradesman", "Big Horn", "Laramie", "Limited"]),
      model("ProMaster", "Van", "3.6L V6", ["Cargo Van", "Window Van", "Chassis Cab"]),
      model("ProMaster City", "Van", "2.4L I4", ["Tradesman", "Wagon"]),
    ],
  },
  {
    name: "GMC",
    models: [
      model("Canyon", "Truck", "2.7L Turbo I4", ["Elevation", "AT4", "Denali"]),
      model("Sierra 1500", "Truck", "5.3L V8", ["SLE", "Elevation", "AT4", "Denali"]),
      model("Sierra HD", "Truck", "6.6L V8", ["SLE", "AT4", "Denali"]),
      model("Terrain", "SUV", "1.5L Turbo I4", ["SLE", "SLT", "Denali"]),
      model("Acadia", "SUV", "2.5L Turbo I4", ["Elevation", "AT4", "Denali"]),
      model("Yukon", "SUV", "5.3L V8", ["SLE", "AT4", "Denali"]),
      model("Hummer EV Pickup", "Truck", "Tri Motor Electric", ["2X", "3X", "Edition 1"]),
      model("Hummer EV SUV", "SUV", "Tri Motor Electric", ["2X", "3X", "Edition 1"]),
    ],
  },
  {
    name: "Dodge",
    models: [
      model("Charger", "Sedan", "3.6L V6", ["SXT", "R/T", "Scat Pack", "Hellcat"]),
      model("Charger Daytona", "Coupe", "Dual Motor Electric", ["R/T", "Scat Pack"]),
      model("Challenger", "Coupe", "3.6L V6", ["SXT", "R/T", "Scat Pack", "Hellcat"]),
      model("Durango", "SUV", "3.6L V6", ["GT", "R/T", "SRT 392", "Hellcat"]),
      model("Hornet", "SUV", "2.0L Turbo I4", ["GT", "R/T"]),
      model("Journey", "SUV", "2.4L I4", ["SE", "SXT", "Crossroad"]),
    ],
  },
  {
    name: "Cadillac",
    models: [
      model("CT4", "Sedan", "2.0L Turbo I4", ["Luxury", "Sport", "V", "V Blackwing"]),
      model("CT5", "Sedan", "2.0L Turbo I4", ["Luxury", "Sport", "V", "V Blackwing"]),
      model("XT4", "SUV", "2.0L Turbo I4", ["Luxury", "Premium Luxury", "Sport"]),
      model("XT5", "SUV", "2.0L Turbo I4", ["Luxury", "Premium Luxury", "Sport"]),
      model("XT6", "SUV", "3.6L V6", ["Luxury", "Premium Luxury", "Sport"]),
      model("Escalade", "SUV", "6.2L V8", ["Luxury", "Premium Luxury", "Sport", "V"]),
      model("Lyriq", "SUV", "Dual Motor Electric", ["Tech", "Luxury", "Sport"]),
      model("Optiq", "SUV", "Dual Motor Electric", ["Luxury", "Sport"]),
    ],
  },
  {
    name: "Buick",
    models: [
      model("Encore", "SUV", "1.4L Turbo I4", ["Preferred", "Sport Touring"]),
      model("Encore GX", "SUV", "1.3L Turbo I3", ["Preferred", "Sport Touring", "Avenir"]),
      model("Envista", "SUV", "1.2L Turbo I3", ["Preferred", "Sport Touring", "Avenir"]),
      model("Envision", "SUV", "2.0L Turbo I4", ["Preferred", "Sport Touring", "Avenir"]),
      model("Enclave", "SUV", "3.6L V6", ["Essence", "Premium", "Avenir"]),
      model("Regal", "Sedan", "2.0L Turbo I4", ["Sportback", "GS", "TourX"]),
    ],
  },
  {
    name: "Lincoln",
    models: [
      model("Corsair", "SUV", "2.0L Turbo I4", ["Premiere", "Reserve", "Grand Touring"]),
      model("Nautilus", "SUV", "2.0L Turbo I4", ["Premiere", "Reserve", "Black Label"]),
      model("Aviator", "SUV", "3.0L Twin Turbo V6", ["Premiere", "Reserve", "Black Label"]),
      model("Navigator", "SUV", "3.5L Twin Turbo V6", ["Premiere", "Reserve", "Black Label"]),
      model("Continental", "Sedan", "3.7L V6", ["Premiere", "Reserve", "Black Label"]),
      model("MKZ", "Sedan", "2.0L Turbo I4", ["Standard", "Reserve", "Hybrid"]),
    ],
  },
  {
    name: "Genesis",
    models: [
      model("G70", "Sedan", "2.5L Turbo I4", ["Base", "Sport Prestige", "3.3T"]),
      model("G80", "Sedan", "2.5L Turbo I4", ["Base", "Sport Prestige", "Electrified"]),
      model("G90", "Sedan", "3.5L Twin Turbo V6", ["Base", "E-Supercharger"]),
      model("GV60", "SUV", "Dual Motor Electric", ["Advanced", "Performance"]),
      model("GV70", "SUV", "2.5L Turbo I4", ["Base", "Sport Prestige", "Electrified"]),
      model("GV80", "SUV", "2.5L Turbo I4", ["Base", "Advanced", "Prestige"]),
      model("GV80 Coupe", "SUV", "3.5L Twin Turbo V6", ["Base", "E-Supercharger"]),
    ],
  },
  {
    name: "Infiniti",
    models: [
      model("Q50", "Sedan", "3.0L Twin Turbo V6", ["Luxe", "Sensory", "Red Sport 400"]),
      model("Q60", "Coupe", "3.0L Twin Turbo V6", ["Pure", "Luxe", "Red Sport 400"]),
      model("QX50", "SUV", "2.0L Turbo I4", ["Pure", "Luxe", "Sensory"]),
      model("QX55", "SUV", "2.0L Turbo I4", ["Luxe", "Essential", "Sensory"]),
      model("QX60", "SUV", "3.5L V6", ["Pure", "Luxe", "Autograph"]),
      model("QX80", "SUV", "5.6L V8", ["Luxe", "Premium Select", "Sensory"]),
    ],
  },
  {
    name: "Volvo",
    models: [
      model("S60", "Sedan", "2.0L Turbo I4", ["Core", "Plus", "Ultimate"]),
      model("S90", "Sedan", "2.0L Turbo I4 Hybrid", ["Plus", "Ultimate"]),
      model("V60", "Wagon", "2.0L Turbo I4", ["Cross Country", "Polestar Engineered"]),
      model("XC40", "SUV", "2.0L Turbo I4", ["Core", "Plus", "Ultimate"]),
      model("XC60", "SUV", "2.0L Turbo I4", ["Core", "Plus", "Ultimate", "Recharge"]),
      model("XC90", "SUV", "2.0L Turbo I4", ["Core", "Plus", "Ultimate", "Recharge"]),
      model("EX30", "SUV", "Dual Motor Electric", ["Core", "Plus", "Ultra"]),
      model("EX90", "SUV", "Dual Motor Electric", ["Plus", "Ultra"]),
    ],
  },
  {
    name: "Land Rover",
    models: [
      model("Range Rover", "SUV", "3.0L Turbo I6", ["SE", "Autobiography", "SV"]),
      model("Range Rover Sport", "SUV", "3.0L Turbo I6", ["SE", "Dynamic SE", "Autobiography"]),
      model("Range Rover Velar", "SUV", "2.0L Turbo I4", ["S", "Dynamic SE", "Dynamic HSE"]),
      model("Range Rover Evoque", "SUV", "2.0L Turbo I4", ["S", "Dynamic SE", "Autobiography"]),
      model("Defender 90", "SUV", "2.0L Turbo I4", ["S", "X-Dynamic", "V8"]),
      model("Defender 110", "SUV", "2.0L Turbo I4", ["S", "X-Dynamic", "V8"]),
      model("Discovery", "SUV", "2.0L Turbo I4", ["S", "Dynamic SE", "Metropolitan"]),
      model("Discovery Sport", "SUV", "2.0L Turbo I4", ["S", "Dynamic SE"]),
    ],
  },
  {
    name: "MINI",
    models: [
      model("Cooper Hardtop 2 Door", "Hatchback", "1.5L Turbo I3", ["Classic", "Signature", "John Cooper Works"]),
      model("Cooper Hardtop 4 Door", "Hatchback", "1.5L Turbo I3", ["Classic", "Signature", "Iconic"]),
      model("Cooper Convertible", "Convertible", "1.5L Turbo I3", ["Classic", "Signature", "John Cooper Works"]),
      model("Clubman", "Wagon", "2.0L Turbo I4", ["Cooper S", "All4", "John Cooper Works"]),
      model("Countryman", "SUV", "2.0L Turbo I4", ["Cooper S", "All4", "John Cooper Works"]),
      model("Cooper Electric", "Hatchback", "Electric", ["SE", "Iconic"]),
    ],
  },
  {
    name: "Mitsubishi",
    models: [
      model("Mirage", "Hatchback", "1.2L I3", ["ES", "LE", "SE"]),
      model("Mirage G4", "Sedan", "1.2L I3", ["ES", "LE", "SE"]),
      model("Outlander Sport", "SUV", "2.0L I4", ["S", "SE", "GT"]),
      model("Eclipse Cross", "SUV", "1.5L Turbo I4", ["LE", "SE", "SEL"]),
      model("Outlander", "SUV", "2.5L I4", ["ES", "SE", "SEL"]),
      model("Outlander PHEV", "SUV", "2.4L Plug-In Hybrid", ["SE", "SEL", "Ralliart"]),
      model("Lancer", "Sedan", "2.0L I4", ["ES", "GT", "Evolution"]),
    ],
  },
  {
    name: "Rivian",
    models: [
      model("R1T", "Truck", "Quad Motor Electric", ["Adventure", "Performance Dual-Motor", "Quad-Motor"]),
      model("R1S", "SUV", "Quad Motor Electric", ["Adventure", "Performance Dual-Motor", "Quad-Motor"]),
      model("EDV", "Van", "Electric", ["500", "700", "900"]),
    ],
  },
  {
    name: "Lucid",
    models: [
      model("Air", "Sedan", "Dual Motor Electric", ["Pure", "Touring", "Grand Touring", "Sapphire"]),
      model("Gravity", "SUV", "Dual Motor Electric", ["Touring", "Grand Touring"]),
    ],
  },
  {
    name: "Polestar",
    models: [
      model("2", "Sedan", "Dual Motor Electric", ["Long Range Single Motor", "Long Range Dual Motor", "Performance"]),
      model("3", "SUV", "Dual Motor Electric", ["Long Range Dual Motor", "Performance"]),
      model("4", "SUV", "Dual Motor Electric", ["Long Range Single Motor", "Long Range Dual Motor"]),
    ],
  },
  {
    name: "Jaguar",
    models: [
      model("XE", "Sedan", "2.0L Turbo I4", ["S", "R-Dynamic", "300 Sport"]),
      model("XF", "Sedan", "2.0L Turbo I4", ["S", "R-Dynamic", "Portfolio"]),
      model("F-Type", "Coupe", "5.0L Supercharged V8", ["P450", "R", "75"]),
      model("E-Pace", "SUV", "2.0L Turbo I4", ["S", "R-Dynamic", "300 Sport"]),
      model("F-Pace", "SUV", "2.0L Turbo I4", ["P250", "P400", "SVR"]),
      model("I-Pace", "SUV", "Dual Motor Electric", ["S", "SE", "HSE"]),
    ],
  },
  {
    name: "Alfa Romeo",
    models: [
      model("Giulia", "Sedan", "2.0L Turbo I4", ["Sprint", "Ti", "Veloce", "Quadrifoglio"]),
      model("Stelvio", "SUV", "2.0L Turbo I4", ["Sprint", "Ti", "Veloce", "Quadrifoglio"]),
      model("Tonale", "SUV", "1.3L Plug-In Hybrid", ["Sprint", "Ti", "Veloce"]),
      model("4C", "Coupe", "1.7L Turbo I4", ["Base", "Spider"]),
    ],
  },
  {
    name: "Chrysler",
    models: [
      model("300", "Sedan", "3.6L V6", ["Touring", "S", "C"]),
      model("Pacifica", "Minivan", "3.6L V6", ["Touring L", "Limited", "Pinnacle", "Hybrid"]),
      model("Voyager", "Minivan", "3.6L V6", ["L", "LX"]),
      model("Town & Country", "Minivan", "3.6L V6", ["Touring", "Limited"]),
    ],
  },
  {
    name: "Fiat",
    models: [
      model("500", "Hatchback", "1.4L I4", ["Pop", "Sport", "Abarth"]),
      model("500e", "Hatchback", "Electric", ["Base", "Inspired By Beauty", "Inspired By Music"]),
      model("500X", "SUV", "1.3L Turbo I4", ["Pop", "Sport", "Trekking"]),
      model("124 Spider", "Convertible", "1.4L Turbo I4", ["Classica", "Lusso", "Abarth"]),
    ],
  },
  {
    name: "Maserati",
    models: [
      model("Ghibli", "Sedan", "3.0L Twin Turbo V6", ["GT", "Modena", "Trofeo"]),
      model("Quattroporte", "Sedan", "3.0L Twin Turbo V6", ["GT", "Modena", "Trofeo"]),
      model("Levante", "SUV", "3.0L Twin Turbo V6", ["GT", "Modena", "Trofeo"]),
      model("Grecale", "SUV", "2.0L Turbo I4", ["GT", "Modena", "Trofeo"]),
      model("GranTurismo", "Coupe", "3.0L Twin Turbo V6", ["Modena", "Trofeo", "Folgore"]),
      model("MC20", "Coupe", "3.0L Twin Turbo V6", ["Base", "Cielo"]),
    ],
  },
  {
    name: "Ferrari",
    models: [
      model("California", "Convertible", "3.9L Twin Turbo V8", ["T", "Handling Speciale"]),
      model("Roma", "Coupe", "3.9L Twin Turbo V8", ["Base", "Spider"]),
      model("Portofino", "Convertible", "3.9L Twin Turbo V8", ["Base", "M"]),
      model("F8", "Coupe", "3.9L Twin Turbo V8", ["Tributo", "Spider"]),
      model("296", "Coupe", "3.0L Twin Turbo Hybrid V6", ["GTB", "GTS"]),
      model("SF90", "Coupe", "4.0L Twin Turbo Hybrid V8", ["Stradale", "Spider"]),
      model("Purosangue", "SUV", "6.5L V12", ["Base"]),
    ],
  },
  {
    name: "Lamborghini",
    models: [
      model("Huracan", "Coupe", "5.2L V10", ["EVO", "Tecnica", "STO"]),
      model("Aventador", "Coupe", "6.5L V12", ["S", "SVJ", "Ultimae"]),
      model("Revuelto", "Coupe", "6.5L Hybrid V12", ["Base"]),
      model("Urus", "SUV", "4.0L Twin Turbo V8", ["S", "Performante", "SE"]),
      model("Gallardo", "Coupe", "5.2L V10", ["LP560-4", "LP570-4", "Spyder"]),
    ],
  },
  {
    name: "McLaren",
    models: [
      model("570S", "Coupe", "3.8L Twin Turbo V8", ["Base", "Spider"]),
      model("600LT", "Coupe", "3.8L Twin Turbo V8", ["Base", "Spider"]),
      model("720S", "Coupe", "4.0L Twin Turbo V8", ["Base", "Spider"]),
      model("765LT", "Coupe", "4.0L Twin Turbo V8", ["Base", "Spider"]),
      model("Artura", "Coupe", "3.0L Hybrid V6", ["Base", "Spider"]),
      model("GT", "Coupe", "4.0L Twin Turbo V8", ["Base"]),
    ],
  },
  {
    name: "Aston Martin",
    models: [
      model("Vantage", "Coupe", "4.0L Twin Turbo V8", ["Base", "F1 Edition"]),
      model("DB11", "Coupe", "4.0L Twin Turbo V8", ["V8", "AMR", "Volante"]),
      model("DB12", "Coupe", "4.0L Twin Turbo V8", ["Base", "Volante"]),
      model("DBX", "SUV", "4.0L Twin Turbo V8", ["Base", "707"]),
      model("Vanquish", "Coupe", "5.9L V12", ["Base", "S"]),
    ],
  },
  {
    name: "Bentley",
    models: [
      model("Continental GT", "Coupe", "4.0L Twin Turbo V8", ["V8", "Speed", "Mulliner"]),
      model("Flying Spur", "Sedan", "4.0L Twin Turbo V8", ["V8", "Speed", "Hybrid"]),
      model("Bentayga", "SUV", "4.0L Twin Turbo V8", ["V8", "S", "Azure", "Speed"]),
      model("Mulsanne", "Sedan", "6.75L Twin Turbo V8", ["Base", "Speed"]),
    ],
  },
  {
    name: "Rolls-Royce",
    models: [
      model("Ghost", "Sedan", "6.75L Twin Turbo V12", ["Base", "Extended", "Black Badge"]),
      model("Phantom", "Sedan", "6.75L Twin Turbo V12", ["Base", "Extended"]),
      model("Wraith", "Coupe", "6.6L Twin Turbo V12", ["Base", "Black Badge"]),
      model("Dawn", "Convertible", "6.6L Twin Turbo V12", ["Base", "Black Badge"]),
      model("Cullinan", "SUV", "6.75L Twin Turbo V12", ["Base", "Black Badge"]),
      model("Spectre", "Coupe", "Dual Motor Electric", ["Base"]),
    ],
  },
  {
    name: "Scion",
    models: [
      model("FR-S", "Coupe", "2.0L H4", ["Base", "Release Series"]),
      model("tC", "Coupe", "2.5L I4", ["Base", "Release Series"]),
      model("xB", "Wagon", "2.4L I4", ["Base", "Release Series"]),
      model("xD", "Hatchback", "1.8L I4", ["Base"]),
      model("iA", "Sedan", "1.5L I4", ["Base"]),
      model("iM", "Hatchback", "1.8L I4", ["Base"]),
    ],
  },
  {
    name: "Suzuki",
    models: [
      model("SX4", "Hatchback", "2.0L I4", ["Base", "Sportback", "Crossover"]),
      model("Kizashi", "Sedan", "2.4L I4", ["S", "SE", "Sport"]),
      model("Grand Vitara", "SUV", "2.4L I4", ["Base", "Premium", "Limited"]),
      model("Equator", "Truck", "4.0L V6", ["Base", "Sport"]),
    ],
  },
  {
    name: "Saab",
    models: [
      model("9-3", "Sedan", "2.0L Turbo I4", ["Linear", "Arc", "Aero"]),
      model("9-5", "Sedan", "2.3L Turbo I4", ["Linear", "Arc", "Aero"]),
      model("9-7X", "SUV", "4.2L I6", ["Base", "Aero"]),
    ],
  },
  {
    name: "Pontiac",
    models: [
      model("G6", "Sedan", "2.4L I4", ["Base", "GT", "GXP"]),
      model("G8", "Sedan", "3.6L V6", ["Base", "GT", "GXP"]),
      model("Vibe", "Hatchback", "1.8L I4", ["Base", "GT"]),
      model("Solstice", "Convertible", "2.4L I4", ["Base", "GXP"]),
      model("Firebird", "Coupe", "5.7L V8", ["Base", "Formula", "Trans Am"]),
    ],
  },
  {
    name: "Saturn",
    models: [
      model("Ion", "Sedan", "2.2L I4", ["Base", "2", "3"]),
      model("Aura", "Sedan", "2.4L I4", ["XE", "XR"]),
      model("Vue", "SUV", "2.4L I4", ["XE", "XR", "Red Line"]),
      model("Outlook", "SUV", "3.6L V6", ["XE", "XR"]),
      model("Sky", "Convertible", "2.4L I4", ["Base", "Red Line"]),
    ],
  },
  {
    name: "Mercury",
    models: [
      model("Milan", "Sedan", "2.5L I4", ["Base", "Premier"]),
      model("Sable", "Sedan", "3.5L V6", ["Base", "Premier"]),
      model("Mariner", "SUV", "2.5L I4", ["Base", "Premier", "Hybrid"]),
      model("Mountaineer", "SUV", "4.0L V6", ["Base", "Premier"]),
      model("Grand Marquis", "Sedan", "4.6L V8", ["GS", "LS"]),
    ],
  },
  {
    name: "Hummer",
    models: [
      model("H2", "SUV", "6.2L V8", ["Base", "Luxury", "SUT"]),
      model("H3", "SUV", "3.7L I5", ["Base", "Adventure", "Alpha"]),
      model("EV Pickup", "Truck", "Tri Motor Electric", ["2X", "3X", "Edition 1"]),
      model("EV SUV", "SUV", "Tri Motor Electric", ["2X", "3X", "Edition 1"]),
    ],
  },
  {
    name: "Isuzu",
    models: [
      model("Rodeo", "SUV", "3.2L V6", ["S", "LS"]),
      model("Trooper", "SUV", "3.5L V6", ["S", "Limited"]),
      model("Axiom", "SUV", "3.5L V6", ["Base", "XS"]),
      model("i-Series", "Truck", "3.7L I5", ["i-290", "i-370"]),
    ],
  },
  {
    name: "Smart",
    models: [
      model("Fortwo", "Hatchback", "1.0L I3", ["Pure", "Passion", "Prime"]),
      model("Fortwo Electric Drive", "Hatchback", "Electric", ["Pure", "Passion", "Prime"]),
    ],
  },
];

const ADDITIONAL_MAKES: MakeSeed[] = [
  {
    name: "Oldsmobile",
    models: [
      model("Alero", "Sedan", "2.4L I4", ["GX", "GL", "GLS"]),
      model("Aurora", "Sedan", "4.0L V8", ["Base", "V8"]),
      model("Bravada", "SUV", "4.2L I6", ["Base", "AWD"]),
      model("Cutlass", "Sedan", "3.1L V6", ["Base", "Supreme"]),
      model("Intrigue", "Sedan", "3.5L V6", ["GX", "GL", "GLS"]),
    ],
  },
  {
    name: "Plymouth",
    models: [
      model("Breeze", "Sedan", "2.4L I4", ["Base", "Expresso"]),
      model("Neon", "Sedan", "2.0L I4", ["Base", "Highline"]),
      model("Prowler", "Convertible", "3.5L V6", ["Base"]),
      model("Voyager", "Minivan", "3.3L V6", ["Base", "SE", "LX"]),
    ],
  },
  {
    name: "Maybach",
    models: [
      model("57", "Sedan", "5.5L Twin Turbo V12", ["Base", "S"]),
      model("62", "Sedan", "5.5L Twin Turbo V12", ["Base", "S"]),
      model("S 580", "Sedan", "4.0L Twin Turbo V8", ["4MATIC"]),
      model("S 680", "Sedan", "6.0L Twin Turbo V12", ["4MATIC"]),
      model("GLS 600", "SUV", "4.0L Twin Turbo V8", ["4MATIC"]),
    ],
  },
  {
    name: "VinFast",
    models: [
      model("VF 6", "SUV", "Electric", ["Eco", "Plus"]),
      model("VF 7", "SUV", "Electric", ["Eco", "Plus"]),
      model("VF 8", "SUV", "Dual Motor Electric", ["Eco", "Plus"]),
      model("VF 9", "SUV", "Dual Motor Electric", ["Eco", "Plus"]),
    ],
  },
  {
    name: "Fisker",
    models: [
      model("Ocean", "SUV", "Dual Motor Electric", ["Sport", "Ultra", "Extreme"]),
      model("Karma", "Sedan", "Plug-In Hybrid", ["EcoSport", "EcoChic"]),
    ],
  },
  {
    name: "INEOS",
    models: [
      model("Grenadier", "SUV", "3.0L Turbo I6", ["Base", "Trialmaster", "Fieldmaster"]),
      model("Quartermaster", "Truck", "3.0L Turbo I6", ["Base", "Trialmaster", "Fieldmaster"]),
    ],
  },
];

const EXTRA_MODELS_BY_MAKE: Record<string, ModelSeed[]> = {
  Toyota: [
    model("Avalon", "Sedan", "3.5L V6", ["XLE", "Touring", "Limited"]),
    model("C-HR", "SUV", "2.0L I4", ["LE", "XLE", "Limited"]),
    model("Crown", "Sedan", "2.5L Hybrid", ["XLE", "Limited", "Platinum"]),
    model("Venza", "SUV", "2.5L Hybrid", ["LE", "XLE", "Limited"]),
    model("Sequoia", "SUV", "3.4L Hybrid V6", ["SR5", "Limited", "Platinum", "Capstone"]),
    model("Land Cruiser", "SUV", "2.4L Hybrid I4", ["1958", "Land Cruiser", "First Edition"]),
    model("bZ4X", "SUV", "Electric", ["XLE", "Limited"]),
    model("Yaris", "Hatchback", "1.5L I4", ["L", "LE", "SE"]),
  ],
  Honda: [
    model("Fit", "Hatchback", "1.5L I4", ["LX", "Sport", "EX"]),
    model("Insight", "Sedan", "1.5L Hybrid", ["LX", "EX", "Touring"]),
    model("Clarity", "Sedan", "Plug-In Hybrid", ["Base", "Touring"]),
    model("Element", "SUV", "2.4L I4", ["LX", "EX", "SC"]),
    model("Crosstour", "Hatchback", "3.5L V6", ["EX", "EX-L"]),
    model("S2000", "Convertible", "2.2L I4", ["Base", "CR"]),
    model("Prologue", "SUV", "Dual Motor Electric", ["EX", "Touring", "Elite"]),
  ],
  Ford: [
    model("Super Duty F-250", "Truck", "6.8L V8", ["XL", "XLT", "Lariat", "Platinum"]),
    model("Super Duty F-350", "Truck", "6.8L V8", ["XL", "XLT", "Lariat", "Platinum"]),
    model("Edge", "SUV", "2.0L EcoBoost I4", ["SE", "SEL", "Titanium", "ST"]),
    model("Fusion", "Sedan", "2.5L I4", ["S", "SE", "Titanium", "Hybrid"]),
    model("Focus", "Hatchback", "2.0L I4", ["S", "SE", "ST", "RS"]),
    model("Fiesta", "Hatchback", "1.6L I4", ["S", "SE", "ST"]),
    model("Taurus", "Sedan", "3.5L V6", ["SE", "SEL", "Limited", "SHO"]),
    model("Transit", "Van", "3.5L V6", ["Cargo Van", "Passenger Van", "Crew Van"]),
    model("Transit Connect", "Van", "2.0L I4", ["XL", "XLT", "Titanium"]),
    model("E-Series", "Van", "7.3L V8", ["Cutaway", "Stripped Chassis"]),
    model("Mach-E", "SUV", "Dual Motor Electric", ["Select", "Premium", "GT"]),
  ],
  Chevrolet: [
    model("Silverado 2500HD", "Truck", "6.6L V8", ["Work Truck", "LT", "LTZ", "High Country"]),
    model("Silverado 3500HD", "Truck", "6.6L V8", ["Work Truck", "LT", "LTZ", "High Country"]),
    model("Suburban", "SUV", "5.3L V8", ["LS", "LT", "RST", "Premier", "High Country"]),
    model("Trailblazer", "SUV", "1.3L Turbo I3", ["LS", "LT", "RS", "Activ"]),
    model("Trax", "SUV", "1.2L Turbo I3", ["LS", "LT", "RS", "Activ"]),
    model("Impala", "Sedan", "3.6L V6", ["LS", "LT", "Premier"]),
    model("Cruze", "Sedan", "1.4L Turbo I4", ["L", "LS", "LT", "Premier"]),
    model("Sonic", "Hatchback", "1.4L Turbo I4", ["LS", "LT", "Premier"]),
    model("Bolt EV", "Hatchback", "Electric", ["LT", "Premier", "2LT"]),
    model("Bolt EUV", "SUV", "Electric", ["LT", "Premier"]),
    model("Express", "Van", "4.3L V6", ["Cargo Van", "Passenger Van", "Cutaway"]),
    model("Avalanche", "Truck", "5.3L V8", ["LS", "LT", "LTZ"]),
  ],
  BMW: [
    model("230i", "Coupe", "2.0L Turbo I4", ["Base", "M Sport"]),
    model("530i", "Sedan", "2.0L Turbo I4", ["Base", "M Sport"]),
    model("540i", "Sedan", "3.0L Turbo I6", ["Base", "M Sport"]),
    model("740i", "Sedan", "3.0L Turbo I6", ["Base", "M Sport"]),
    model("M2", "Coupe", "3.0L Twin Turbo I6", ["Base"]),
    model("M5", "Sedan", "4.4L Twin Turbo V8", ["Base", "Competition"]),
    model("X1", "SUV", "2.0L Turbo I4", ["sDrive28i", "xDrive28i", "M35i"]),
    model("X2", "SUV", "2.0L Turbo I4", ["xDrive28i", "M35i"]),
    model("X4", "SUV", "2.0L Turbo I4", ["xDrive30i", "M40i"]),
    model("X6", "SUV", "3.0L Turbo I6", ["xDrive40i", "M60i"]),
    model("Z4", "Convertible", "2.0L Turbo I4", ["sDrive30i", "M40i"]),
    model("i4", "Sedan", "Electric", ["eDrive35", "eDrive40", "M50"]),
    model("iX", "SUV", "Dual Motor Electric", ["xDrive50", "M60"]),
  ],
  "Mercedes-Benz": [
    model("A 220", "Sedan", "2.0L Turbo I4", ["Base", "4MATIC"]),
    model("S 500", "Sedan", "3.0L Turbo I6", ["Base", "4MATIC"]),
    model("S 580", "Sedan", "4.0L Twin Turbo V8", ["Base", "4MATIC"]),
    model("GLA 250", "SUV", "2.0L Turbo I4", ["Base", "4MATIC"]),
    model("GLB 250", "SUV", "2.0L Turbo I4", ["Base", "4MATIC"]),
    model("G 550", "SUV", "4.0L Twin Turbo V8", ["Base"]),
    model("AMG GT", "Coupe", "4.0L Twin Turbo V8", ["43", "53", "63"]),
    model("SL", "Convertible", "4.0L Twin Turbo V8", ["43", "55", "63"]),
    model("Sprinter", "Van", "2.0L Turbo Diesel I4", ["Cargo Van", "Crew Van", "Passenger Van"]),
    model("Metris", "Van", "2.0L Turbo I4", ["Cargo Van", "Passenger Van"]),
    model("EQB", "SUV", "Dual Motor Electric", ["250+", "300", "350"]),
    model("EQE", "Sedan", "Dual Motor Electric", ["350", "500", "AMG"]),
    model("EQS", "Sedan", "Dual Motor Electric", ["450+", "580", "AMG"]),
  ],
  Audi: [
    model("A3", "Sedan", "2.0L Turbo I4", ["Premium", "Premium Plus"]),
    model("A7", "Sedan", "3.0L Turbo V6", ["Premium", "Premium Plus", "Prestige"]),
    model("A8", "Sedan", "3.0L Turbo V6", ["Base", "L"]),
    model("S3", "Sedan", "2.0L Turbo I4", ["Premium", "Premium Plus"]),
    model("S5", "Coupe", "3.0L Turbo V6", ["Premium", "Premium Plus", "Prestige"]),
    model("SQ5", "SUV", "3.0L Turbo V6", ["Premium", "Premium Plus", "Prestige"]),
    model("Q4 e-tron", "SUV", "Electric", ["Premium", "Premium Plus", "Prestige"]),
    model("Q8", "SUV", "3.0L Turbo V6", ["Premium", "Premium Plus", "Prestige"]),
    model("e-tron", "SUV", "Dual Motor Electric", ["Premium", "Premium Plus", "Prestige"]),
    model("TT", "Coupe", "2.0L Turbo I4", ["Base", "S"]),
    model("R8", "Coupe", "5.2L V10", ["V10", "Performance"]),
  ],
  Nissan: [
    model("Versa", "Sedan", "1.6L I4", ["S", "SV", "SR"]),
    model("Maxima", "Sedan", "3.5L V6", ["SV", "SR", "Platinum"]),
    model("Leaf", "Hatchback", "Electric", ["S", "SV Plus"]),
    model("Kicks", "SUV", "1.6L I4", ["S", "SV", "SR"]),
    model("Murano", "SUV", "3.5L V6", ["SV", "SL", "Platinum"]),
    model("Pathfinder", "SUV", "3.5L V6", ["SV", "SL", "Platinum", "Rock Creek"]),
    model("Ariya", "SUV", "Dual Motor Electric", ["Engage", "Evolve+", "Platinum+"]),
    model("Titan", "Truck", "5.6L V8", ["S", "SV", "PRO-4X", "Platinum Reserve"]),
    model("Quest", "Minivan", "3.5L V6", ["S", "SV", "SL", "Platinum"]),
    model("Juke", "SUV", "1.6L Turbo I4", ["S", "SV", "SL", "NISMO"]),
  ],
  Hyundai: [
    model("Accent", "Sedan", "1.6L I4", ["SE", "SEL", "Limited"]),
    model("Venue", "SUV", "1.6L I4", ["SE", "SEL", "Limited"]),
    model("Veloster", "Hatchback", "2.0L I4", ["Base", "Turbo", "N"]),
    model("Ioniq", "Hatchback", "Hybrid", ["Blue", "SEL", "Limited"]),
    model("IONIQ 6", "Sedan", "Dual Motor Electric", ["SE", "SEL", "Limited"]),
    model("Santa Cruz", "Truck", "2.5L I4", ["SE", "SEL", "Limited"]),
    model("Nexo", "SUV", "Hydrogen Fuel Cell", ["Blue", "Limited"]),
  ],
  Kia: [
    model("Rio", "Sedan", "1.6L I4", ["LX", "S"]),
    model("Soul", "Hatchback", "2.0L I4", ["LX", "S", "GT-Line"]),
    model("Seltos", "SUV", "2.0L I4", ["LX", "S", "EX", "SX"]),
    model("Niro", "SUV", "Hybrid", ["LX", "EX", "SX"]),
    model("Carnival", "Minivan", "3.5L V6", ["LX", "EX", "SX", "SX Prestige"]),
    model("Cadenza", "Sedan", "3.3L V6", ["Premium", "Technology", "Limited"]),
    model("Optima", "Sedan", "2.4L I4", ["LX", "EX", "SX", "Hybrid"]),
    model("EV9", "SUV", "Dual Motor Electric", ["Light", "Wind", "Land", "GT-Line"]),
  ],
  Volkswagen: [
    model("Passat", "Sedan", "2.0L Turbo I4", ["S", "SE", "R-Line"]),
    model("Beetle", "Hatchback", "2.0L Turbo I4", ["S", "SE", "Dune"]),
    model("Arteon", "Sedan", "2.0L Turbo I4", ["SE", "SEL R-Line", "Premium"]),
    model("Atlas Cross Sport", "SUV", "2.0L Turbo I4", ["SE", "SEL", "SEL Premium"]),
    model("ID.4", "SUV", "Electric", ["Standard", "Pro", "Pro S"]),
    model("Touareg", "SUV", "3.6L V6", ["Sport", "Lux", "Executive"]),
    model("CC", "Sedan", "2.0L Turbo I4", ["Sport", "R-Line", "Executive"]),
  ],
  GMC: [
    model("Savana", "Van", "4.3L V6", ["Cargo Van", "Passenger Van", "Cutaway"]),
    model("Sierra 2500HD", "Truck", "6.6L V8", ["Pro", "SLE", "SLT", "AT4", "Denali"]),
    model("Sierra 3500HD", "Truck", "6.6L V8", ["Pro", "SLE", "SLT", "AT4", "Denali"]),
    model("Yukon XL", "SUV", "5.3L V8", ["SLE", "SLT", "AT4", "Denali"]),
  ],
  Subaru: [
    model("Legacy", "Sedan", "2.5L H4", ["Premium", "Sport", "Limited", "Touring XT"]),
    model("Solterra", "SUV", "Dual Motor Electric", ["Premium", "Limited", "Touring"]),
    model("Tribeca", "SUV", "3.6L H6", ["Base", "Limited", "Touring"]),
  ],
  Mazda: [
    model("Mazda6", "Sedan", "2.5L I4", ["Sport", "Touring", "Grand Touring"]),
    model("CX-3", "SUV", "2.0L I4", ["Sport", "Touring", "Grand Touring"]),
    model("CX-7", "SUV", "2.5L I4", ["i SV", "i Sport", "s Touring"]),
    model("CX-9", "SUV", "2.5L Turbo I4", ["Sport", "Touring", "Grand Touring", "Signature"]),
    model("RX-8", "Coupe", "1.3L Rotary", ["Sport", "Grand Touring", "R3"]),
  ],
  Lexus: [
    model("CT", "Hatchback", "1.8L Hybrid", ["200h", "Premium", "F Sport"]),
    model("HS", "Sedan", "2.4L Hybrid", ["250h", "Premium"]),
      model("LFA", "Coupe", "4.8L V10", ["Base", "Nurburgring"]),
    model("RZ", "SUV", "Dual Motor Electric", ["300e", "450e"]),
  ],
  Acura: [
    model("ILX", "Sedan", "2.4L I4", ["Base", "Premium", "A-Spec"]),
    model("TSX", "Sedan", "2.4L I4", ["Base", "Special Edition"]),
    model("RLX", "Sedan", "3.5L V6", ["Base", "Sport Hybrid"]),
  ],
  Jeep: [
    model("Commander", "SUV", "3.7L V6", ["Sport", "Limited", "Overland"]),
    model("Liberty", "SUV", "3.7L V6", ["Sport", "Limited"]),
    model("Patriot", "SUV", "2.4L I4", ["Sport", "Latitude", "Limited"]),
  ],
};

const ALL_MAKES = [...MAKES, ...ADDITIONAL_MAKES];

function makeId(make: string) {
  return make.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function modelId(make: string, model: string) {
  return `${makeId(make)}:${model.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function trimId(make: string, model: string, trim: string) {
  return `${modelId(make, model)}:${trim.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function findMake(makeIdValue: string, makeName?: string | null): MakeSeed | undefined {
  return ALL_MAKES.find((entry) => makeId(entry.name) === makeIdValue || entry.name.toLowerCase() === String(makeName ?? "").toLowerCase());
}

function getModelsForMake(make: MakeSeed): ModelSeed[] {
  const seen = new Set<string>();
  return [...make.models, ...(EXTRA_MODELS_BY_MAKE[make.name] ?? [])].filter((entry) => {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const years = Array.from({ length: new Date().getFullYear() - 1980 }, (_, index) => new Date().getFullYear() + 1 - index);

export class CuratedVehicleCatalogProvider implements VehicleCatalogProvider {
  readonly name = SOURCE;
  private readonly vinProvider = new NhtsaVehicleCatalogProvider();

  async listYears(): Promise<number[]> {
    return years;
  }

  async listMakes(_year: number): Promise<VehicleCatalogOption[]> {
    return ALL_MAKES.map((make) => ({
      id: makeId(make.name),
      label: make.name,
      value: make.name,
      source: SOURCE,
      sourceVehicleId: makeId(make.name),
    }));
  }

  async listModels(_year: number, makeIdValue: string, makeName?: string | null): Promise<VehicleCatalogOption[]> {
    const make = findMake(makeIdValue, makeName);
    if (!make) return [];
    return getModelsForMake(make).map((model) => ({
      id: modelId(make.name, model.name),
      label: model.name,
      value: model.name,
      source: SOURCE,
      sourceVehicleId: modelId(make.name, model.name),
    }));
  }

  async listTrims(_year: number, makeIdValue: string, modelName: string, makeName?: string | null): Promise<VehicleTrimOption[]> {
    const make = findMake(makeIdValue, makeName);
    const model = make ? getModelsForMake(make).find((entry) => entry.name.toLowerCase() === modelName.toLowerCase()) : undefined;
    if (!make || !model) return [];
    return model.trims.map((trim) => ({
      id: trimId(make.name, model.name, trim.name),
      label: trim.name,
      value: trim.name,
      source: SOURCE,
      sourceVehicleId: trimId(make.name, model.name, trim.name),
      bodyStyle: trim.bodyStyle,
      engine: trim.engine,
    }));
  }

  async decodeVin(vin: string): Promise<VehicleVinLookupResult | null> {
    const decoded = await this.vinProvider.decodeVin(vin);
    if (!decoded) return null;
    return {
      ...decoded,
      displayName: buildVehicleDisplayName(decoded),
      source: decoded.source || "nhtsa_vpic",
    };
  }
}
