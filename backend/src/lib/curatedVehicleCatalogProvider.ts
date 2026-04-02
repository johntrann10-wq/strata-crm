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
];

function makeId(make: string) {
  return make.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function modelId(make: string, model: string) {
  return `${makeId(make)}:${model.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function trimId(make: string, model: string, trim: string) {
  return `${modelId(make, model)}:${trim.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

const years = Array.from({ length: new Date().getFullYear() - 1980 }, (_, index) => new Date().getFullYear() + 1 - index);

export class CuratedVehicleCatalogProvider implements VehicleCatalogProvider {
  readonly name = SOURCE;
  private readonly vinProvider = new NhtsaVehicleCatalogProvider();

  async listYears(): Promise<number[]> {
    return years;
  }

  async listMakes(_year: number): Promise<VehicleCatalogOption[]> {
    return MAKES.map((make) => ({
      id: makeId(make.name),
      label: make.name,
      value: make.name,
      source: SOURCE,
      sourceVehicleId: makeId(make.name),
    }));
  }

  async listModels(_year: number, makeIdValue: string, makeName?: string | null): Promise<VehicleCatalogOption[]> {
    const make = MAKES.find((entry) => makeId(entry.name) === makeIdValue || entry.name.toLowerCase() === String(makeName ?? "").toLowerCase());
    if (!make) return [];
    return make.models.map((model) => ({
      id: modelId(make.name, model.name),
      label: model.name,
      value: model.name,
      source: SOURCE,
      sourceVehicleId: modelId(make.name, model.name),
    }));
  }

  async listTrims(_year: number, makeIdValue: string, modelName: string, makeName?: string | null): Promise<VehicleTrimOption[]> {
    const make = MAKES.find((entry) => makeId(entry.name) === makeIdValue || entry.name.toLowerCase() === String(makeName ?? "").toLowerCase());
    const model = make?.models.find((entry) => entry.name.toLowerCase() === modelName.toLowerCase());
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
