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
    executionFocus: ["Wash/decon sequence", "Correction scope", "Final touch-up and QC"],
    deliveryFocus: ["Before/after photos", "Care advice", "Maintenance rebook"],
  },
  mobile_detailing: {
    title: "Mobile detail workflow",
    summary: "Treat logistics as part of the job: site access, power/water, and crew readiness matter as much as service quality.",
    intakeFields: ["Service address", "Arrival window", "Water/power availability"],
    executionFocus: ["Crew assignment", "Supply readiness", "Weather or access constraints"],
    deliveryFocus: ["Site cleanup", "Payment collection", "Maintenance rebook"],
  },
  ppf_ceramic: {
    title: "PPF / coating workflow",
    summary: "This workflow depends on prep quality, material accuracy, and disciplined final inspection.",
    intakeFields: ["Coverage areas", "Film/coating package", "Paint correction needs"],
    executionFocus: ["Surface prep", "Edge and seam quality", "Cure and contamination control"],
    deliveryFocus: ["Warranty notes", "Care instructions", "Final panel inspection"],
  },
  tint_shop: {
    title: "Tint workflow",
    summary: "Keep film selection, legal fit, and edge quality explicit so the install and handoff stay clean.",
    intakeFields: ["Film type", "Shade percentages", "Windows included"],
    executionFocus: ["Glass prep", "Heat-shrink accuracy", "Edge and contamination check"],
    deliveryFocus: ["Cure instructions", "Warranty details", "Visual QC with customer"],
  },
  wrap_shop: {
    title: "Wrap workflow",
    summary: "Make scope, materials, and seam expectations obvious early so production and install stay aligned.",
    intakeFields: ["Coverage scope", "Material/finish", "Design approval status"],
    executionFocus: ["Panel prep", "Alignment and seams", "Post-heat and recessed areas"],
    deliveryFocus: ["Final photo set", "Care guidance", "Touch-up follow-up"],
  },
  tire_shop: {
    title: "Tire workflow",
    summary: "Operational clarity comes from size/spec accuracy and a clean closeout on torque, pressures, and TPMS.",
    intakeFields: ["Tire size/spec", "Mount/balance/alignment scope", "TPMS needs"],
    executionFocus: ["Inventory readiness", "Balance quality", "Torque and pressure verification"],
    deliveryFocus: ["Torque confirmation", "TPMS/reset status", "Alignment or rotation recommendations"],
  },
  mechanic: {
    title: "Repair workflow",
    summary: "A strong repair order keeps diagnosis, approvals, parts status, and recommendations visible at every step.",
    intakeFields: ["Primary concern", "Diagnostic scope", "Approval limit"],
    executionFocus: ["Diagnosis progress", "Parts status", "Repair verification and test"],
    deliveryFocus: ["Completed repair summary", "Open recommendations", "Follow-up timing"],
  },
  car_wash: {
    title: "Wash workflow",
    summary: "Speed matters, but the queue still needs package clarity and a consistent final touch before handoff.",
    intakeFields: ["Wash package", "Add-ons", "Timing expectation"],
    executionFocus: ["Queue priority", "Exterior/interior finish", "Final touch-up"],
    deliveryFocus: ["Upsell opportunity", "Membership or return timing", "Spot-check before release"],
  },
  dealership_service: {
    title: "Dealer service workflow",
    summary: "Advisor handoff, parts status, and customer updates must stay tight to avoid churn and missed revenue.",
    intakeFields: ["RO summary", "Transportation needs", "Completion promise"],
    executionFocus: ["Advisor-tech handoff", "Parts/warranty status", "Inspection findings"],
    deliveryFocus: ["RO closeout", "Recommendations", "Customer communication"],
  },
  other_auto_service: GENERAL_GUIDE,
};

export function getVerticalWorkflowGuide(businessType: string | null | undefined): VerticalWorkflowGuide {
  return GUIDES[businessType ?? ""] ?? GENERAL_GUIDE;
}
