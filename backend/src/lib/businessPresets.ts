import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { businesses, serviceAddonLinks, services } from "../db/schema.js";
import { logger } from "./logger.js";

type ServiceCategory = "detail" | "tint" | "ppf" | "mechanical" | "tire" | "body" | "other";
type PriceType = "fixed" | "starting_at" | "hourly";

type PresetService = {
  key: string;
  name: string;
  category: ServiceCategory;
  shortDescription: string;
  estimatedMinutes: number | null;
  startingPrice: number;
  priceType: PriceType;
  taxable: boolean;
  requiredDeposit: number;
  internalNotes?: string;
  recommendedUpsells?: string[];
  addonKeys?: string[];
  isAddon?: boolean;
};

const COMMON_ADDON_KEYS = [
  "rush_service",
  "oversized_vehicle_fee",
  "heavy_contamination_fee",
  "travel_fee",
  "after_hours_appointment",
  "shop_supplies_fee",
  "removal_prep_fee",
  "warranty_upgrade",
  "additional_labor",
  "premium_materials_upgrade",
] as const;

const COMMON_ADDONS: PresetService[] = [
  addOn("rush_service", "Rush Service", "other", "Priority scheduling and accelerated turnaround.", 0, 75),
  addOn("oversized_vehicle_fee", "Oversized Vehicle Fee", "other", "Pricing adjustment for trucks, SUVs, vans, and oversized units.", 0, 50),
  addOn("heavy_contamination_fee", "Heavy Contamination Fee", "other", "Added labor for excessive contamination, fallout, pet hair, or severe cleanup.", 0, 85),
  addOn("travel_fee", "Travel Fee", "other", "Travel surcharge for mobile or off-site service.", 0, 45, false),
  addOn("after_hours_appointment", "After-Hours Appointment", "other", "Scheduling outside standard operating hours.", 0, 95),
  addOn("shop_supplies_fee", "Shop Supplies Fee", "other", "Consumables and shop supply surcharge.", 0, 25),
  addOn("removal_prep_fee", "Removal / Prep Fee", "other", "Extra prep, teardown, masking, or removal work before service begins.", 0, 125),
  addOn("warranty_upgrade", "Warranty Upgrade", "other", "Extended product or workmanship warranty upgrade.", 0, 150),
  addOn("additional_labor", "Additional Labor", "other", "Extra labor billed beyond base scope.", 60, 125, true, "hourly"),
  addOn("premium_materials_upgrade", "Premium Materials Upgrade", "other", "Higher-end film, coating, wrap, or premium consumables upgrade.", 0, 175),
];

const PRESETS: Record<string, { label: string; services: PresetService[] }> = {
  auto_detailing: {
    label: "Auto detailing",
    services: [
      service("standard_exterior_detail", "Standard Exterior Detail", "detail", "Exterior wash, decon, dry, and finish.", 150, 149, { recommendedUpsells: ["clay_bar_decontamination", "spray_sealant_protection"] }),
      service("standard_interior_detail", "Standard Interior Detail", "detail", "Interior vacuum, wipe-down, and detail clean.", 150, 159, { recommendedUpsells: ["seat_shampoo_extraction", "odor_removal"] }),
      service("full_interior_exterior_detail", "Full Interior + Exterior Detail", "detail", "Complete inside and out reconditioning service.", 240, 279, { recommendedUpsells: ["clay_bar_decontamination", "engine_bay_detail"] }),
      service("maintenance_wash", "Maintenance Wash", "detail", "Routine exterior wash and touch-up service.", 60, 69, { recommendedUpsells: ["spray_sealant_protection", "wheel_coating"] }),
      service("clay_bar_decontamination", "Clay Bar Decontamination", "detail", "Paint decontamination to remove bonded surface contamination.", 60, 89),
      service("iron_fallout_treatment", "Iron Fallout Treatment", "detail", "Chemical treatment to remove embedded brake dust and fallout.", 45, 65),
      service("engine_bay_detail", "Engine Bay Detail", "detail", "Safe cleaning and dressing of the engine bay.", 45, 59),
      service("headlight_restoration", "Headlight Restoration", "detail", "Restores oxidized or faded headlights.", 75, 129),
      service("paint_enhancement_polish", "Paint Enhancement Polish", "detail", "Gloss-improving single-step machine polish.", 180, 249, { recommendedUpsells: ["glass_coating", "wheel_coating"] }),
      service("single_stage_paint_correction", "Single-Stage Paint Correction", "detail", "Entry-level correction to reduce swirls and defects.", 300, 499, { requiredDeposit: 100, recommendedUpsells: ["ceramic_coating_installation"] }),
      service("multi_stage_paint_correction", "Multi-Stage Paint Correction", "detail", "Multi-step correction for maximum gloss and defect removal.", 540, 999, { requiredDeposit: 200, recommendedUpsells: ["ceramic_coating_installation"] }),
      service("ceramic_coating_installation", "Ceramic Coating Installation", "detail", "Professional ceramic protection package.", 360, 899, { requiredDeposit: 200, recommendedUpsells: ["glass_coating", "wheel_coating"] }),
      service("glass_coating", "Glass Coating", "detail", "Hydrophobic coating applied to glass surfaces.", 45, 99),
      service("wheel_coating", "Wheel Coating", "detail", "Protective coating for faces and barrels where accessible.", 60, 149),
      service("trim_restoration", "Trim Restoration", "detail", "Revives faded exterior trim pieces.", 60, 119),
      service("odor_removal", "Odor Removal", "detail", "Targets embedded odors in the cabin.", 90, 149),
    ],
  },
  mobile_detailing: {
    label: "Mobile detailing",
    services: [
      service("mobile_maintenance_wash", "Mobile Maintenance Wash", "detail", "On-site exterior maintenance wash.", 60, 79, { recommendedUpsells: ["spray_sealant_protection"] }),
      service("mobile_interior_detail", "Mobile Interior Detail", "detail", "On-site interior deep clean.", 120, 149, { recommendedUpsells: ["pet_hair_removal", "stain_removal"] }),
      service("mobile_full_detail", "Mobile Full Detail", "detail", "Full mobile interior and exterior detail.", 210, 249, { recommendedUpsells: ["engine_bay_cleaning", "water_spot_removal"] }),
      service("mobile_clay_seal_service", "Mobile Clay & Seal Service", "detail", "On-site clay decon and sealant protection.", 150, 189),
      service("spray_sealant_protection", "Spray Sealant Protection", "detail", "Fast-turn paint protection upgrade.", 30, 49),
      service("seat_shampoo_extraction", "Seat Shampoo / Extraction", "detail", "Fabric or upholstery extraction service.", 75, 99),
      service("pet_hair_removal", "Pet Hair Removal", "detail", "Extra labor for stubborn pet hair extraction.", 60, 85),
      service("stain_removal", "Stain Removal", "detail", "Targeted stain treatment for carpet or upholstery.", 45, 69),
      service("engine_bay_cleaning", "Engine Bay Cleaning", "detail", "On-site engine bay cleaning and dressing.", 45, 59),
      service("mobile_headlight_restoration", "Mobile Headlight Restoration", "detail", "On-site restoration of oxidized headlights.", 75, 139),
      service("water_spot_removal", "Water Spot Removal", "detail", "Spot treatment for etched or stubborn water spots.", 60, 89),
      service("rv_van_exterior_wash", "RV / Van Exterior Wash", "detail", "Large-vehicle exterior wash service.", 120, 199),
      service("fleet_vehicle_wash", "Fleet Vehicle Wash", "detail", "Repeatable wash service for multiple fleet units.", 45, 45, { priceType: "starting_at", internalNotes: "Price each unit by count and size." }),
      service("pre_sale_detail", "Pre-Sale Detail", "detail", "Prep package to improve resale presentation.", 180, 229),
      service("monthly_maintenance_plan", "Monthly Maintenance Plan", "detail", "Recurring maintenance detail membership service.", 60, 99, { priceType: "starting_at", taxable: false, internalNotes: "Use as the base monthly recurring service." }),
    ],
  },
  wrap_ppf: {
    label: "Wrap & PPF",
    services: [
      service("partial_hood_ppf", "Partial Hood PPF", "ppf", "Entry-level PPF coverage for the hood.", 180, 399, { requiredDeposit: 100 }),
      service("full_hood_ppf", "Full Hood PPF", "ppf", "Full hood paint protection film coverage.", 240, 699, { requiredDeposit: 150 }),
      service("full_front_end_ppf", "Full Front-End PPF", "ppf", "Hood, fenders, bumper, and mirror protection package.", 720, 1799, { requiredDeposit: 400, recommendedUpsells: ["rocker_panel_protection", "ceramic_coating_for_wrap_ppf"] }),
      service("track_pack_ppf", "Track Pack PPF", "ppf", "High-impact front protection for performance driving.", 480, 1299, { requiredDeposit: 300 }),
      service("rocker_panel_protection", "Rocker Panel Protection", "ppf", "Additional PPF protection for rocker panels.", 120, 299),
      service("door_edge_ppf", "Door Edge PPF", "ppf", "Protective film on door edges.", 45, 79),
      service("door_cup_ppf", "Door Cup PPF", "ppf", "Protective film in handle cup areas.", 45, 89),
      service("rear_bumper_loading_strip_ppf", "Rear Bumper Loading Strip PPF", "ppf", "Protection for the upper rear bumper loading area.", 45, 99),
      service("full_vehicle_ppf", "Full Vehicle PPF", "ppf", "Complete vehicle paint protection film wrap.", 2400, 5499, { requiredDeposit: 1000, recommendedUpsells: ["ceramic_coating_for_wrap_ppf"] }),
      service("gloss_color_change_wrap", "Gloss Color Change Wrap", "body", "Full gloss vinyl color-change wrap.", 2880, 3499, { requiredDeposit: 1000, recommendedUpsells: ["ceramic_coating_for_wrap_ppf"] }),
      service("satin_matte_wrap", "Satin / Matte Wrap", "body", "Full satin or matte wrap package.", 2880, 3799, { requiredDeposit: 1000 }),
      service("roof_wrap", "Roof Wrap", "body", "Gloss, satin, or matte roof wrap.", 240, 349),
      service("chrome_delete", "Chrome Delete", "body", "Trim blackout service for exterior chrome elements.", 240, 499),
      service("interior_trim_wrap", "Interior Trim Wrap", "body", "Vinyl wrap for interior trim components.", 180, 299),
      service("removal_existing_wrap", "Removal of Existing Wrap", "body", "Wrap removal before new install or restoration.", 480, 899, { priceType: "starting_at", requiredDeposit: 200 }),
      service("ceramic_coating_for_wrap_ppf", "Ceramic Coating for Wrap / PPF", "ppf", "Coating upgrade to protect film or vinyl.", 90, 249),
    ],
  },
  window_tinting: {
    label: "Window tinting",
    services: [
      service("front_two_windows_tint", "Front Two Windows Tint", "tint", "Tint installation for the front two side windows.", 90, 139),
      service("full_side_rear_window_tint", "Full Side & Rear Window Tint", "tint", "Tint all side and rear windows.", 180, 299),
      service("full_vehicle_window_tint", "Full Vehicle Window Tint", "tint", "Complete vehicle tint package.", 240, 399),
      service("windshield_tint", "Windshield Tint", "tint", "Full windshield tint installation.", 120, 199),
      service("sun_strip_tint", "Sun Strip Tint", "tint", "Top windshield sun strip tint.", 45, 59),
      service("rear_windshield_tint", "Rear Windshield Tint", "tint", "Rear windshield tint service.", 90, 129),
      service("panoramic_roof_tint", "Panoramic Roof Tint", "tint", "Tint for panoramic or moonroof glass.", 120, 199),
      service("tint_removal", "Tint Removal", "tint", "Remove existing tint film and adhesive.", 120, 149, { priceType: "starting_at" }),
      service("tint_replacement", "Tint Replacement", "tint", "Remove and replace old or damaged tint.", 180, 229, { priceType: "starting_at" }),
      service("dyed_film_tint", "Dyed Film Tint", "tint", "Entry-level dyed film package.", 180, 249),
      service("carbon_film_tint", "Carbon Film Tint", "tint", "Mid-tier carbon film tint package.", 180, 349),
      service("ceramic_film_tint", "Ceramic Film Tint", "tint", "Premium ceramic film with superior heat rejection.", 180, 449, { recommendedUpsells: ["windshield_tint"] }),
      service("heat_rejection_package", "Heat Rejection Package", "tint", "Premium ceramic package focused on interior heat reduction.", 240, 549),
      service("privacy_tint_package", "Privacy Tint Package", "tint", "Tint package designed around privacy and appearance.", 180, 329),
      service("tesla_roof_tint", "Tesla Roof Tint", "tint", "Roof tint service for Tesla and similar glass roofs.", 150, 229),
      service("commercial_vehicle_tint", "Commercial Vehicle Tint", "tint", "Tint package for commercial fleet or work vehicles.", 240, 399, { priceType: "starting_at" }),
    ],
  },
  performance: {
    label: "Performance",
    services: [
      service("intake_installation", "Intake Installation", "mechanical", "Install aftermarket intake system.", 90, 149),
      service("exhaust_installation", "Exhaust Installation", "mechanical", "Install upgraded exhaust components.", 150, 249),
      service("cat_back_exhaust_upgrade", "Cat-Back Exhaust Upgrade", "mechanical", "Install complete cat-back exhaust system.", 180, 349),
      service("downpipe_installation", "Downpipe Installation", "mechanical", "Install aftermarket downpipe assembly.", 210, 399, { requiredDeposit: 100 }),
      service("suspension_lowering_springs", "Suspension Lowering Springs", "mechanical", "Install lowering springs and set ride height.", 240, 399),
      service("coilover_installation", "Coilover Installation", "mechanical", "Install adjustable coilovers and baseline setup.", 300, 599, { recommendedUpsells: ["alignment_performance_setup"] }),
      service("wheel_tire_installation", "Wheel & Tire Installation", "mechanical", "Install wheel and tire package.", 90, 129),
      service("spacer_installation", "Spacer Installation", "mechanical", "Install wheel spacers and verify fitment.", 60, 99),
      service("brake_pad_rotor_upgrade", "Brake Pad / Rotor Upgrade", "mechanical", "Performance brake upgrade service.", 180, 349),
      service("big_brake_kit_installation", "Big Brake Kit Installation", "mechanical", "Install complete big brake kit.", 300, 699, { recommendedUpsells: ["brake_fluid_flush"] }),
      service("ecu_tune_flash", "ECU Tune / Flash", "mechanical", "Load or update ECU calibration.", 90, 299),
      service("dyno_session", "Dyno Session", "mechanical", "Dyno pull and performance measurement session.", 120, 249, { priceType: "hourly", internalNotes: "Bill extra dyno time hourly if needed." }),
      service("alignment_performance_setup", "Alignment for Performance Setup", "mechanical", "Performance-focused alignment service.", 120, 199),
      service("corner_balancing", "Corner Balancing", "mechanical", "Corner-balance service for tuned suspension setups.", 180, 299),
      service("track_inspection", "Track Inspection", "mechanical", "Inspection before a track or performance event.", 90, 149),
      service("pre_track_prep_service", "Pre-Track Prep Service", "mechanical", "Track-day prep and fluid/hardware check service.", 150, 249),
    ],
  },
  mechanic: {
    label: "Mechanic",
    services: [
      service("oil_change_service", "Oil Change Service", "mechanical", "Conventional oil and filter service.", 45, 59),
      service("synthetic_oil_change", "Synthetic Oil Change", "mechanical", "Synthetic oil and filter service.", 45, 89),
      service("brake_pad_replacement", "Brake Pad Replacement", "mechanical", "Replace brake pads on one axle.", 120, 249),
      service("brake_pad_rotor_replacement", "Brake Pad & Rotor Replacement", "mechanical", "Replace brake pads and rotors on one axle.", 180, 399),
      service("battery_replacement", "Battery Replacement", "mechanical", "Replace vehicle battery and verify charging system.", 45, 149),
      service("spark_plug_replacement", "Spark Plug Replacement", "mechanical", "Replace spark plugs.", 120, 199),
      service("ignition_coil_replacement", "Ignition Coil Replacement", "mechanical", "Replace ignition coils and verify operation.", 120, 249),
      service("air_filter_replacement", "Air Filter Replacement", "mechanical", "Replace engine air filter.", 20, 39),
      service("cabin_air_filter_replacement", "Cabin Air Filter Replacement", "mechanical", "Replace cabin air filter.", 20, 49),
      service("coolant_flush", "Coolant Flush", "mechanical", "Flush and refill cooling system.", 90, 149),
      service("brake_fluid_flush", "Brake Fluid Flush", "mechanical", "Flush and replace brake fluid.", 60, 119),
      service("transmission_service", "Transmission Service", "mechanical", "Drain, fill, or service transmission fluid.", 120, 249),
      service("suspension_inspection", "Suspension Inspection", "mechanical", "Inspect suspension, steering, and related wear items.", 60, 79),
      service("check_engine_light_diagnostic", "Check Engine Light Diagnostic", "mechanical", "Scan, test, and diagnose CEL-related issues.", 90, 129, { priceType: "starting_at" }),
      service("pre_purchase_inspection", "Pre-Purchase Inspection", "mechanical", "Comprehensive used vehicle inspection.", 120, 179),
      service("general_vehicle_inspection", "General Vehicle Inspection", "mechanical", "General multi-point vehicle inspection.", 60, 69),
    ],
  },
  tire_shop: {
    label: "Tire shop",
    services: [
      service("tire_mount_balance", "Tire Mount & Balance", "tire", "Mount and balance tire package.", 60, 119),
      service("tire_rotation", "Tire Rotation", "tire", "Rotate tires and set pressures.", 30, 39),
      service("flat_tire_repair", "Flat Tire Repair", "tire", "Repair punctured tire when repairable.", 30, 35),
      service("road_force_balance", "Road Force Balance", "tire", "Road-force balancing for vibration concerns.", 60, 99),
      service("tpms_sensor_service", "TPMS Sensor Service", "tire", "Service existing TPMS sensors during tire work.", 30, 49),
      service("tpms_sensor_replacement", "TPMS Sensor Replacement", "tire", "Replace failed or damaged TPMS sensor.", 45, 89),
      service("wheel_swap", "Wheel Swap", "tire", "Swap mounted wheel/tire sets.", 30, 49),
      service("new_tire_installation", "New Tire Installation", "tire", "Install a new set of tires.", 90, 179),
      service("seasonal_tire_changeover", "Seasonal Tire Changeover", "tire", "Seasonal tire and wheel set changeover.", 60, 99),
      service("alignment", "Alignment", "tire", "Four-wheel alignment service.", 75, 129),
      service("wheel_balancing", "Wheel Balancing", "tire", "Balance individual wheel and tire assemblies.", 45, 69),
      service("lug_torque_check", "Lug Torque Check", "tire", "Post-install lug torque recheck.", 15, 19, { taxable: false }),
      service("tire_disposal_service", "Tire Disposal Service", "tire", "Disposal fee for removed tires.", 0, 20),
      service("tire_storage_program", "Tire Storage Program", "tire", "Seasonal tire storage program.", 0, 120, { taxable: false }),
      service("puncture_inspection", "Puncture Inspection", "tire", "Inspect punctured tire for repairability.", 20, 25),
    ],
  },
  muffler_shop: {
    label: "Muffler shop",
    services: [
      service("muffler_replacement", "Muffler Replacement", "mechanical", "Replace worn, damaged, or rusted muffler.", 90, 199),
      service("resonator_delete", "Resonator Delete", "mechanical", "Remove or replace resonator for sound change.", 90, 149),
      service("muffler_delete", "Muffler Delete", "mechanical", "Delete muffler section for custom exhaust note.", 90, 149),
      service("custom_exhaust_fabrication", "Custom Exhaust Fabrication", "mechanical", "Custom exhaust fabrication service.", 240, 499, { priceType: "starting_at", requiredDeposit: 150 }),
      service("axle_back_exhaust_installation", "Axle-Back Exhaust Installation", "mechanical", "Install axle-back exhaust system.", 120, 199),
      service("cat_back_exhaust_installation", "Cat-Back Exhaust Installation", "mechanical", "Install cat-back exhaust system.", 180, 299),
      service("exhaust_tip_installation", "Exhaust Tip Installation", "mechanical", "Install aftermarket exhaust tips.", 45, 79),
      service("exhaust_leak_repair", "Exhaust Leak Repair", "mechanical", "Locate and repair exhaust leaks.", 90, 149, { priceType: "starting_at" }),
      service("exhaust_hanger_repair", "Exhaust Hanger Repair", "mechanical", "Repair or replace exhaust hangers.", 45, 89),
      service("catalytic_converter_replacement", "Catalytic Converter Replacement", "mechanical", "Replace catalytic converter assembly.", 180, 499, { priceType: "starting_at", requiredDeposit: 150 }),
      service("downpipe_installation_muffler", "Downpipe Installation", "mechanical", "Install upgraded or replacement downpipe.", 180, 349),
      service("weld_repair", "Weld Repair", "mechanical", "Targeted welding repair on exhaust components.", 60, 99),
      service("exhaust_modification_consultation", "Exhaust Modification Consultation", "mechanical", "Consultation for exhaust modifications and sound goals.", 30, 49, { taxable: false }),
      service("sound_adjustment_service", "Sound Adjustment Service", "mechanical", "Adjust system layout or components to tune exhaust note.", 120, 199),
      service("performance_exhaust_upgrade", "Performance Exhaust Upgrade", "mechanical", "Performance-oriented exhaust upgrade package.", 180, 399),
    ],
  },
};

function addOn(
  key: string,
  name: string,
  category: ServiceCategory,
  shortDescription: string,
  estimatedMinutes: number | null,
  startingPrice: number,
  taxable = true,
  priceType: PriceType = "fixed"
): PresetService {
  return {
    key,
    name,
    category,
    shortDescription,
    estimatedMinutes,
    startingPrice,
    priceType,
    taxable,
    requiredDeposit: 0,
    isAddon: true,
  };
}

function service(
  key: string,
  name: string,
  category: ServiceCategory,
  shortDescription: string,
  estimatedMinutes: number | null,
  startingPrice: number,
  overrides: Partial<PresetService> = {}
): PresetService {
  return {
    key,
    name,
    category,
    shortDescription,
    estimatedMinutes,
    startingPrice,
    priceType: "starting_at",
    taxable: true,
    requiredDeposit: 0,
    addonKeys: [...COMMON_ADDON_KEYS],
    recommendedUpsells: [],
    ...overrides,
  };
}

function serializePresetNotes(servicePreset: PresetService) {
  const sections = [
    servicePreset.shortDescription ? `Description: ${servicePreset.shortDescription}` : null,
    `Price Type: ${servicePreset.priceType}`,
    `Required Deposit: ${servicePreset.requiredDeposit > 0 ? `$${servicePreset.requiredDeposit}` : "None"}`,
    servicePreset.internalNotes ? `Internal Notes: ${servicePreset.internalNotes}` : null,
    servicePreset.recommendedUpsells?.length ? `Recommended Upsells: ${servicePreset.recommendedUpsells.join(", ")}` : null,
  ];
  return sections.filter(Boolean).join("\n");
}

function getPresetForBusinessType(type: string | null | undefined) {
  return PRESETS[type ?? ""] ?? PRESETS.auto_detailing;
}

function isPresetSchemaDriftError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; cause?: unknown };
  const cause =
    candidate.cause && typeof candidate.cause === "object"
      ? (candidate.cause as { code?: unknown; message?: unknown })
      : candidate;
  const code = String(cause.code ?? "");
  const message = String(cause.message ?? "");
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes('relation "service_addon_links" does not exist') ||
    message.includes('relation "services" does not exist') ||
    message.includes('column "category" does not exist') ||
    message.includes('column "duration_minutes" does not exist') ||
    message.includes('column "taxable" does not exist') ||
    message.includes('column "is_addon" does not exist') ||
    message.includes('column "active" does not exist')
  );
}

let cachedServiceColumns: Set<string> | null = null;

async function getServiceColumns(): Promise<Set<string>> {
  if (cachedServiceColumns) return cachedServiceColumns;
  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'services'
  `);
  const resultWithRows = result as unknown as { rows?: Array<{ column_name?: string }> };
  const rows = Array.isArray(resultWithRows.rows) ? resultWithRows.rows : [];
  cachedServiceColumns = new Set(
    rows
      .map((row) => row?.column_name)
      .filter((value): value is string => typeof value === "string")
  );
  return cachedServiceColumns;
}

async function insertLegacyPresetServiceRow(businessId: string, item: PresetService, now: Date) {
  const columns = await getServiceColumns();
  const insertColumns = ["id", "business_id", "name", "price"];
  const insertValues: unknown[] = [randomUUID(), businessId, item.name, String(item.startingPrice)];

  if (columns.has("duration_minutes")) {
    insertColumns.push("duration_minutes");
    insertValues.push(item.estimatedMinutes);
  }
  if (columns.has("category")) {
    insertColumns.push("category");
    insertValues.push(item.category);
  }
  if (columns.has("notes")) {
    insertColumns.push("notes");
    insertValues.push(serializePresetNotes(item));
  }
  if (columns.has("taxable")) {
    insertColumns.push("taxable");
    insertValues.push(item.taxable);
  }
  if (columns.has("is_addon")) {
    insertColumns.push("is_addon");
    insertValues.push(item.isAddon ?? false);
  }
  if (columns.has("active")) {
    insertColumns.push("active");
    insertValues.push(true);
  }
  if (columns.has("created_at")) {
    insertColumns.push("created_at");
    insertValues.push(now);
  }
  if (columns.has("updated_at")) {
    insertColumns.push("updated_at");
    insertValues.push(now);
  }

  await db.execute(sql`insert into "services" (${sql.join(
    insertColumns.map((column) => sql.raw(`"${column}"`)),
    sql`, `
  )}) values (${sql.join(insertValues.map((value) => sql`${value}`), sql`, `)})`);
}

async function loadExistingServiceNames(businessId: string, names: string[]) {
  try {
    const existing = await db
      .select({ name: services.name, category: services.category })
      .from(services)
      .where(and(eq(services.businessId, businessId), inArray(services.name, names)));
    return new Set(existing.map((item) => `${item.name}::${item.category}`));
  } catch (error) {
    if (!isPresetSchemaDriftError(error)) throw error;
    logger.warn("Business preset seeding falling back without full services schema", { businessId, error });
    const existing = await db
      .select({ name: services.name })
      .from(services)
      .where(and(eq(services.businessId, businessId), inArray(services.name, names)));
    return new Set(existing.map((item) => item.name));
  }
}

async function insertPresetServices(businessId: string, rows: PresetService[]) {
  if (rows.length === 0) return;
  const now = new Date();
  try {
    await db.insert(services).values(
      rows.map((item) => ({
        id: randomUUID(),
        businessId,
        name: item.name,
        category: item.category,
        price: String(item.startingPrice),
        durationMinutes: item.estimatedMinutes,
        notes: serializePresetNotes(item),
        taxable: item.taxable,
        isAddon: item.isAddon ?? false,
        active: true,
        createdAt: now,
        updatedAt: now,
      }))
    );
  } catch (error) {
    if (!isPresetSchemaDriftError(error)) throw error;
    logger.warn("Business preset seeding inserting with legacy services schema", { businessId, error });
    for (const item of rows) {
      try {
        await insertLegacyPresetServiceRow(businessId, item, now);
      } catch (rowError) {
        if (!isPresetSchemaDriftError(rowError)) throw rowError;
        logger.warn("Business preset skipped one legacy service row", {
          businessId,
          serviceName: item.name,
          error: rowError,
        });
      }
    }
  }
}

async function loadSeededServiceIds(businessId: string, names: string[]) {
  const seeded = await db
    .select({ id: services.id, name: services.name })
    .from(services)
    .where(and(eq(services.businessId, businessId), inArray(services.name, names)));
  return new Map(seeded.map((item) => [item.name, item.id]));
}

export function getPresetSummaryForBusinessType(type: string | null | undefined) {
  const presetType = type ?? "auto_detailing";
  const preset = getPresetForBusinessType(type);
  return {
    group: presetType,
    count: preset.services.length + COMMON_ADDONS.length,
    names: preset.services.slice(0, 4).map((item) => item.name),
  };
}

export async function getAppliedBusinessPresetSummary(businessId: string) {
  const [business] = await db
    .select({ id: businesses.id, type: businesses.type })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!business) throw new Error("Business not found.");

  const presetType = business.type;
  const preset = getPresetForBusinessType(business.type);
  const combined = [...COMMON_ADDONS, ...preset.services];
  const names = combined.map((item) => item.name);
  const existingKeys = await loadExistingServiceNames(businessId, names);
  const appliedCount = combined.filter((item) => {
    if (existingKeys.has(`${item.name}::${item.category}`)) return true;
    if (existingKeys.has(item.name)) return true;
    return false;
  }).length;

  return {
    group: presetType,
    expectedCount: combined.length,
    appliedCount,
    fullyApplied: appliedCount >= combined.length,
  };
}

export async function applyBusinessPreset(businessId: string) {
  const [business] = await db
    .select({ id: businesses.id, type: businesses.type })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!business) throw new Error("Business not found.");

  const preset = getPresetForBusinessType(business.type);
  const presetType = business.type;
  const combined = [...COMMON_ADDONS, ...preset.services];
  const names = combined.map((item) => item.name);
  const existingKeys = await loadExistingServiceNames(businessId, names);
  const toInsert = combined.filter((item) => {
    if (existingKeys.has(`${item.name}::${item.category}`)) return false;
    if (existingKeys.has(item.name)) return false;
    return true;
  });

  await insertPresetServices(businessId, toInsert);

  const existingKeysAfterInsert = await loadExistingServiceNames(businessId, names);
  const appliedCount = combined.filter((item) => {
    if (existingKeysAfterInsert.has(`${item.name}::${item.category}`)) return true;
    if (existingKeysAfterInsert.has(item.name)) return true;
    return false;
  }).length;
  const previouslyAppliedCount = combined.filter((item) => {
    if (existingKeys.has(`${item.name}::${item.category}`)) return true;
    if (existingKeys.has(item.name)) return true;
    return false;
  }).length;
  const createdCount = Math.max(appliedCount - previouslyAppliedCount, 0);
  const skippedCount = previouslyAppliedCount;

  const serviceIdByName = await loadSeededServiceIds(businessId, names);

  const addonNameByKey = new Map(COMMON_ADDONS.map((item) => [item.key, item.name]));
  const desiredLinks = preset.services.flatMap((item) => {
    const parentServiceId = serviceIdByName.get(item.name);
    if (!parentServiceId) return [];
    return (item.addonKeys ?? []).flatMap((addonKey, index) => {
      const addonName = addonNameByKey.get(addonKey);
      const addonServiceId = addonName ? serviceIdByName.get(addonName) : null;
      if (!addonServiceId) return [];
      return [{ parentServiceId, addonServiceId, sortOrder: index }];
    });
  });

  if (desiredLinks.length > 0) {
    try {
      const existingLinks = await db
        .select({
          parentServiceId: serviceAddonLinks.parentServiceId,
          addonServiceId: serviceAddonLinks.addonServiceId,
        })
        .from(serviceAddonLinks)
        .where(eq(serviceAddonLinks.businessId, businessId));
      const existingLinkKeys = new Set(existingLinks.map((item) => `${item.parentServiceId}::${item.addonServiceId}`));
      const linksToInsert = desiredLinks.filter(
        (item) => !existingLinkKeys.has(`${item.parentServiceId}::${item.addonServiceId}`)
      );

      if (linksToInsert.length > 0) {
        await db.insert(serviceAddonLinks).values(
          linksToInsert.map((item) => ({
            businessId,
            parentServiceId: item.parentServiceId,
            addonServiceId: item.addonServiceId,
            sortOrder: item.sortOrder,
          }))
        );
      }
    } catch (error) {
      if (!isPresetSchemaDriftError(error)) throw error;
      logger.warn("Business preset seeding skipping addon links on legacy schema", { businessId, error });
    }
  }

  return {
    created: createdCount,
    skipped: skippedCount,
    group: presetType,
    expectedCount: combined.length,
    appliedCount,
    fullyApplied: appliedCount >= combined.length,
  };
}
