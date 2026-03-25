export type VerticalWorkflowGuide = {
  title: string;
  summary: string;
  intakeFields: string[];
  executionFocus: string[];
  deliveryFocus: string[];
};

const GENERAL_GUIDE: VerticalWorkflowGuide = {
  title: "General service workflow",
  summary: "Keep scope, technician ownership, and delivery notes clear from intake through closeout.",
  intakeFields: ["Customer scope", "Vehicle condition", "Timing expectations"],
  executionFocus: ["Required materials", "Technician assignment", "Quality control"],
  deliveryFocus: ["Completion notes", "Recommendations", "Next service timing"],
};

const GUIDES: Record<string, VerticalWorkflowGuide> = {
  auto_detailing: {
    title: "Detail workflow",
    summary: "Capture condition up front, keep add-ons explicit, and finish with strong QC before delivery.",
    intakeFields: ["Package and add-ons", "Paint and interior condition", "Pickup or delivery timing"],
    executionFocus: ["Wash/decon sequence", "Correction or coating scope", "Final touch-up and QC"],
    deliveryFocus: ["Before/after photos", "Care advice", "Maintenance rebook"],
  },
  mobile_detailing: {
    title: "Mobile detail workflow",
    summary: "Treat logistics as part of the job: site access, power/water, and crew readiness matter as much as service quality.",
    intakeFields: ["Service address", "Arrival window", "Water/power availability"],
    executionFocus: ["Crew assignment", "Supply readiness", "Weather or access constraints"],
    deliveryFocus: ["Site cleanup", "Payment collection", "Maintenance rebook"],
  },
  wrap_ppf: {
    title: "Wrap & PPF workflow",
    summary: "Prep quality, material accuracy, and disciplined final inspection matter more than speed.",
    intakeFields: ["Coverage areas", "Material / finish", "Removal or prep needs"],
    executionFocus: ["Surface prep", "Edge and seam quality", "Cure, trim, and contamination control"],
    deliveryFocus: ["Warranty notes", "Care instructions", "Final panel inspection"],
  },
  window_tinting: {
    title: "Tint workflow",
    summary: "Keep film selection, legal fit, and edge quality explicit so install and handoff stay clean.",
    intakeFields: ["Film type", "Shade percentages", "Windows included"],
    executionFocus: ["Glass prep", "Heat-shrink accuracy", "Edge and contamination check"],
    deliveryFocus: ["Cure instructions", "Warranty details", "Visual QC with customer"],
  },
  performance: {
    title: "Performance workflow",
    summary: "A strong performance order keeps parts, fitment, test plans, and alignment/tune steps obvious.",
    intakeFields: ["Upgrade scope", "Performance goal", "Approval limit"],
    executionFocus: ["Fitment checks", "Install quality", "Test / tune / alignment verification"],
    deliveryFocus: ["Installed parts summary", "Break-in or usage notes", "Next upgrade recommendations"],
  },
  mechanic: {
    title: "Repair workflow",
    summary: "A strong repair order keeps diagnosis, approvals, parts status, and recommendations visible at every step.",
    intakeFields: ["Primary concern", "Diagnostic scope", "Approval limit"],
    executionFocus: ["Diagnosis progress", "Parts status", "Repair verification and test"],
    deliveryFocus: ["Completed repair summary", "Open recommendations", "Follow-up timing"],
  },
  tire_shop: {
    title: "Tire workflow",
    summary: "Operational clarity comes from size/spec accuracy and a clean closeout on torque, pressures, and TPMS.",
    intakeFields: ["Tire size/spec", "Mount/balance/alignment scope", "TPMS needs"],
    executionFocus: ["Inventory readiness", "Balance quality", "Torque and pressure verification"],
    deliveryFocus: ["Torque confirmation", "TPMS/reset status", "Alignment or rotation recommendations"],
  },
  muffler_shop: {
    title: "Muffler workflow",
    summary: "Exhaust work needs scope clarity on sound, fabrication, leaks, and fitment from start to finish.",
    intakeFields: ["Requested exhaust scope", "Sound goal", "Fabrication / replacement notes"],
    executionFocus: ["Parts or fabrication readiness", "Leak and clearance checks", "Hanger and weld quality"],
    deliveryFocus: ["Sound verification", "Final leak check", "Performance recommendations"],
  },
};

export function getVerticalWorkflowGuide(businessType: string | null | undefined): VerticalWorkflowGuide {
  return GUIDES[businessType ?? ""] ?? GENERAL_GUIDE;
}
