export type WorkflowCreationPreset = {
  title: string;
  summary: string;
  recommendedCategories: string[];
  defaultMobile?: boolean;
  suggestedDepositPercent?: number;
  appointmentClientNotes: string;
  appointmentInternalNotes: string;
  quoteNotes: string;
  invoiceNotes: string;
};

const PRESETS: Record<string, WorkflowCreationPreset> = {
  auto_detailing: {
    title: "Detail booking flow",
    summary: "Lead with package clarity, condition notes, and upsells around protection and correction.",
    recommendedCategories: ["detail"],
    appointmentClientNotes: "Package:\nAdd-ons:\nVehicle condition notes:\nPickup / delivery timing:",
    appointmentInternalNotes: "Paint / interior condition:\nCrew assignment:\nQC focus:\nRecommended upsells:",
    quoteNotes: "Package scope:\nAdd-ons included:\nCondition assumptions:\nExpected turnaround:",
    invoiceNotes: "Completed package:\nAdd-ons performed:\nVehicle delivered in:\nRecommended maintenance timing:",
  },
  mobile_detailing: {
    title: "Mobile detail booking flow",
    summary: "Confirm logistics early so the crew can execute without back-and-forth.",
    recommendedCategories: ["detail"],
    defaultMobile: true,
    appointmentClientNotes: "Service address:\nArrival window:\nWater / power available:\nSpecial access instructions:",
    appointmentInternalNotes: "Crew assignment:\nTravel prep:\nWeather constraints:\nOn-site QC plan:",
    quoteNotes: "Service address:\nPackage scope:\nTravel fee notes:\nExpected arrival window:",
    invoiceNotes: "Service address:\nArrival / completion window:\nTravel notes:\nRecommended next visit:",
  },
  wrap_ppf: {
    title: "Wrap & PPF sales flow",
    summary: "Quote around coverage scope, materials, prep, and deposit discipline.",
    recommendedCategories: ["ppf", "body"],
    suggestedDepositPercent: 25,
    appointmentClientNotes: "Coverage areas:\nMaterial / finish:\nWarranty expectations:\nDelivery target:",
    appointmentInternalNotes: "Prep or removal needs:\nMaterial reserved:\nInstaller assignment:\nQC checkpoints:",
    quoteNotes: "Coverage package:\nMaterial spec:\nPrep assumptions:\nDeposit requirement:",
    invoiceNotes: "Coverage installed:\nMaterial / finish:\nPrep or removal completed:\nCare and cure notes:",
  },
  window_tinting: {
    title: "Tint sales flow",
    summary: "Keep film selection, shade, and installation scope obvious from quote to install.",
    recommendedCategories: ["tint"],
    suggestedDepositPercent: 20,
    appointmentClientNotes: "Film type:\nShade percentages:\nWindows covered:\nPickup timing:",
    appointmentInternalNotes: "Installer assignment:\nGlass condition:\nFilm inventory:\nQC / cure instructions:",
    quoteNotes: "Film package:\nShade percentages:\nWindows included:\nWarranty and cure notes:",
    invoiceNotes: "Film package installed:\nShade percentages:\nWindows completed:\nCure / warranty notes:",
  },
  performance: {
    title: "Performance install flow",
    summary: "Capture parts, fitment, alignment/tune needs, and approval limits before the car hits the bay.",
    recommendedCategories: ["mechanical"],
    suggestedDepositPercent: 20,
    appointmentClientNotes: "Parts / upgrade scope:\nPerformance goal:\nApproval limit:\nCompletion timing:",
    appointmentInternalNotes: "Fitment checks:\nTech assignment:\nTune / alignment needs:\nRoad-test plan:",
    quoteNotes: "Parts and labor scope:\nFitment assumptions:\nTune/alignment needs:\nApproval requirements:",
    invoiceNotes: "Installed parts:\nLabor completed:\nTune / alignment work:\nFollow-up recommendations:",
  },
  mechanic: {
    title: "Repair order flow",
    summary: "Capture complaint, diagnosis scope, and approval limits before the job ever starts.",
    recommendedCategories: ["mechanical"],
    suggestedDepositPercent: 15,
    appointmentClientNotes: "Primary concern:\nRequested diagnosis / repair:\nApproval limit:\nTransportation needs:",
    appointmentInternalNotes: "Diagnostic plan:\nTech assignment:\nParts status:\nOpen recommendation path:",
    quoteNotes: "Concern summary:\nDiagnosis / repair scope:\nParts and labor assumptions:\nApproval requirements:",
    invoiceNotes: "Concern addressed:\nRepair completed:\nParts installed:\nOpen recommendations:",
  },
  tire_shop: {
    title: "Tire service flow",
    summary: "Move fast, but keep tire spec, rack time, and closeout steps explicit.",
    recommendedCategories: ["tire"],
    appointmentClientNotes: "Tire size / brand:\nMount / balance / alignment scope:\nTPMS approval:\nPickup timing:",
    appointmentInternalNotes: "Rack assignment:\nInventory ready:\nTorque / pressure notes:\nPost-service safety check:",
    quoteNotes: "Tire package:\nAlignment / TPMS scope:\nParts and labor assumptions:\nRecommended follow-up:",
    invoiceNotes: "Tire service completed:\nAlignment / TPMS work:\nTorque / pressure check:\nRecommended follow-up:",
  },
  muffler_shop: {
    title: "Exhaust service flow",
    summary: "Keep sound goal, parts/fabrication scope, and clearance checks explicit from intake to delivery.",
    recommendedCategories: ["mechanical"],
    suggestedDepositPercent: 15,
    appointmentClientNotes: "Requested exhaust work:\nSound goal:\nParts / fabrication notes:\nPickup timing:",
    appointmentInternalNotes: "Lift assignment:\nFabrication materials:\nClearance / hanger notes:\nLeak-test plan:",
    quoteNotes: "Exhaust scope:\nParts / fabrication assumptions:\nLabor notes:\nFollow-up recommendations:",
    invoiceNotes: "Exhaust work completed:\nParts / fabrication installed:\nLeak / fitment check:\nRecommended follow-up:",
  },
};

export function getWorkflowCreationPreset(businessType: string | null | undefined): WorkflowCreationPreset {
  return PRESETS[businessType ?? ""] ?? PRESETS.mechanic;
}
