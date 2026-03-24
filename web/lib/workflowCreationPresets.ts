export type WorkflowCreationPreset = {
  title: string;
  summary: string;
  recommendedCategories: string[];
  defaultMobile?: boolean;
  suggestedDepositPercent?: number;
  appointmentClientNotes: string;
  appointmentInternalNotes: string;
  quoteNotes: string;
};

const PRESETS: Record<string, WorkflowCreationPreset> = {
  auto_detailing: {
    title: "Detail booking flow",
    summary: "Lead with package clarity, condition notes, and delivery expectations.",
    recommendedCategories: ["detail"],
    appointmentClientNotes: "Package:\nAdd-ons:\nPickup / delivery timing:\nSpecial requests:",
    appointmentInternalNotes: "Paint / interior condition:\nCrew assignment:\nQC focus:\nDelivery handoff:",
    quoteNotes: "Package scope:\nAdd-ons included:\nPaint/interior condition assumptions:\nExpected turnaround:",
  },
  mobile_detailing: {
    title: "Mobile detail booking flow",
    summary: "Confirm logistics early so the crew can execute without back-and-forth.",
    recommendedCategories: ["detail"],
    defaultMobile: true,
    appointmentClientNotes: "Service address:\nArrival window:\nWater / power available:\nSpecial access instructions:",
    appointmentInternalNotes: "Crew assignment:\nVan / product prep:\nWeather constraints:\nOn-site QC plan:",
    quoteNotes: "Service address:\nPackage scope:\nTravel or setup notes:\nExpected arrival window:",
  },
  ppf_ceramic: {
    title: "PPF / coating sales flow",
    summary: "Quote and book around coverage scope, prep needs, and premium handoff.",
    recommendedCategories: ["detail"],
    suggestedDepositPercent: 25,
    appointmentClientNotes: "Coverage areas:\nFilm / coating package:\nWarranty expectations:\nDelivery target:",
    appointmentInternalNotes: "Paint correction needs:\nFilm/coating reserved:\nInstaller assignment:\nQC checkpoints:",
    quoteNotes: "Coverage package:\nFilm / coating spec:\nPrep and correction assumptions:\nDeposit requirement:",
  },
  tint_shop: {
    title: "Tint sales flow",
    summary: "Keep film selection and installation scope obvious from quote to install.",
    recommendedCategories: ["tint", "detail"],
    suggestedDepositPercent: 20,
    appointmentClientNotes: "Film type:\nShade percentages:\nWindows covered:\nPickup timing:",
    appointmentInternalNotes: "Installer assignment:\nGlass condition:\nFilm inventory:\nQC / cure instructions:",
    quoteNotes: "Film package:\nShade percentages:\nWindows included:\nWarranty and cure notes:",
  },
  wrap_shop: {
    title: "Wrap project flow",
    summary: "Large jobs need scope clarity, material planning, and deposit discipline up front.",
    recommendedCategories: ["body"],
    suggestedDepositPercent: 30,
    appointmentClientNotes: "Coverage scope:\nMaterial / finish:\nDesign approval:\nDelivery deadline:",
    appointmentInternalNotes: "Print / material status:\nTrim removal needs:\nInstaller assignment:\nQC photo deliverables:",
    quoteNotes: "Coverage scope:\nMaterial / finish:\nDesign and install assumptions:\nDeposit and timeline:",
  },
  tire_shop: {
    title: "Tire service flow",
    summary: "Move fast, but keep tire spec, rack time, and closeout steps explicit.",
    recommendedCategories: ["tire"],
    appointmentClientNotes: "Tire size / brand:\nMount / balance / alignment scope:\nTPMS approval:\nPickup timing:",
    appointmentInternalNotes: "Rack assignment:\nInventory ready:\nTorque / pressure notes:\nPost-service safety check:",
    quoteNotes: "Tire package:\nAlignment / TPMS scope:\nParts and labor assumptions:\nRecommended follow-up:",
  },
  mechanic: {
    title: "Repair order flow",
    summary: "Capture complaint, diagnosis scope, and approval limits before the job ever starts.",
    recommendedCategories: ["mechanical"],
    suggestedDepositPercent: 15,
    appointmentClientNotes: "Primary concern:\nRequested diagnosis / repair:\nApproval limit:\nTransportation needs:",
    appointmentInternalNotes: "Diagnostic plan:\nTech assignment:\nParts status:\nOpen recommendation path:",
    quoteNotes: "Concern summary:\nDiagnosis / repair scope:\nParts and labor assumptions:\nApproval requirements:",
  },
  car_wash: {
    title: "Wash workflow",
    summary: "Optimize for speed with clear package selection and quick handoff notes.",
    recommendedCategories: ["detail"],
    appointmentClientNotes: "Wash package:\nAdd-ons:\nTiming notes:",
    appointmentInternalNotes: "Queue priority:\nFinish standard:\nUpsell opportunities:",
    quoteNotes: "Wash package:\nAdd-ons:\nTiming assumptions:",
  },
  dealership_service: {
    title: "Dealer service flow",
    summary: "Keep advisor-to-tech handoff and customer timing tight from the start.",
    recommendedCategories: ["mechanical", "other"],
    appointmentClientNotes: "RO summary:\nTransportation needs:\nRequested completion time:",
    appointmentInternalNotes: "Advisor handoff:\nTech assignment:\nParts / warranty status:\nCloseout notes:",
    quoteNotes: "RO scope:\nParts / labor assumptions:\nCustomer timing:\nApproval requirements:",
  },
  other_auto_service: {
    title: "Service intake flow",
    summary: "Use a clear scope and clean handoff notes to keep work moving.",
    recommendedCategories: ["other"],
    appointmentClientNotes: "Requested service:\nTiming notes:\nSpecial instructions:",
    appointmentInternalNotes: "Assigned technician:\nMaterials needed:\nQC notes:",
    quoteNotes: "Service scope:\nParts / labor assumptions:\nRecommended next steps:",
  },
};

export function getWorkflowCreationPreset(businessType: string | null | undefined): WorkflowCreationPreset {
  return PRESETS[businessType ?? ""] ?? PRESETS.other_auto_service;
}
