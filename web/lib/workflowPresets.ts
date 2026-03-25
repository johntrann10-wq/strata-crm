export type WorkflowPresetKey =
  | "detail"
  | "mobile_detail"
  | "wrap_ppf"
  | "tint"
  | "performance"
  | "tire"
  | "mechanic"
  | "muffler";

export function getWorkflowPresetKey(businessType: string | null | undefined): WorkflowPresetKey {
  switch (businessType) {
    case "auto_detailing":
      return "detail";
    case "mobile_detailing":
      return "mobile_detail";
    case "wrap_ppf":
      return "wrap_ppf";
    case "window_tinting":
      return "tint";
    case "performance":
      return "performance";
    case "tire_shop":
      return "tire";
    case "mechanic":
      return "mechanic";
    case "muffler_shop":
      return "muffler";
    default:
      return "mechanic";
  }
}

const PRESET_LABELS: Record<WorkflowPresetKey, string> = {
  detail: "Detail workflow",
  mobile_detail: "Mobile detail workflow",
  wrap_ppf: "Wrap & PPF workflow",
  tint: "Tint workflow",
  performance: "Performance workflow",
  tire: "Tire workflow",
  mechanic: "Repair workflow",
  muffler: "Muffler workflow",
};

const JOB_CHECKLISTS: Record<WorkflowPresetKey, string[]> = {
  detail: [
    "Walk vehicle and note pre-existing condition",
    "Stage chemicals, towels, and tools",
    "Complete wash and decontamination",
    "Finish interior and trim details",
    "Run final QC and delivery photos",
  ],
  mobile_detail: [
    "Confirm address, access, and arrival window",
    "Stage mobile rig, chemicals, and power/water plan",
    "Complete the approved service scope",
    "Check site cleanup and final quality",
    "Collect payment and schedule next visit",
  ],
  wrap_ppf: [
    "Confirm coverage areas, material, and finish",
    "Inspect panels and prep surfaces",
    "Install film or wrap and finish exposed edges",
    "Check alignment, bubbles, seams, and trim fit",
    "Capture final QC, photos, and care notes",
  ],
  tint: [
    "Confirm film type, shade percentages, and coverage",
    "Clean and prep all glass surfaces",
    "Cut, heat-shrink, and install film",
    "Inspect edges, contamination, and finish",
    "Review cure instructions and warranty notes",
  ],
  performance: [
    "Confirm parts, upgrade scope, and approval",
    "Inspect fitment and baseline condition",
    "Install components and verify torque/specs",
    "Run test, tune, or alignment validation",
    "Document setup notes and recommendations",
  ],
  tire: [
    "Verify tire size and wheel condition",
    "Mount and balance tires",
    "Torque wheels to spec",
    "Reset TPMS and pressures",
    "Road-test or final safety check",
  ],
  mechanic: [
    "Confirm complaint and repair approval",
    "Perform diagnosis and inspection",
    "Complete repair and parts verification",
    "Run final test and fluid check",
    "Document recommendations and closeout",
  ],
  muffler: [
    "Confirm exhaust scope and sound goal",
    "Inspect current system and mounting points",
    "Complete fabrication or replacement work",
    "Check leaks, clearances, and hanger fitment",
    "Run final sound and road-test validation",
  ],
};

const APPOINTMENT_CHECKLISTS: Record<WorkflowPresetKey, string[]> = {
  detail: [
    "Confirm package and add-ons",
    "Verify vehicle arrival condition",
    "Assign bay or mobile crew",
    "Capture intake notes and photos",
  ],
  mobile_detail: [
    "Confirm service address and site access",
    "Review water, power, and parking logistics",
    "Capture condition notes and mobile setup needs",
    "Assign crew and arrival window",
  ],
  wrap_ppf: [
    "Confirm coverage package, material, and warranty",
    "Verify film/vinyl inventory and patterns",
    "Inspect paint/body condition at intake",
    "Assign installer and bay time",
  ],
  tint: [
    "Confirm shade percentages and film type",
    "Review legal tint limits if needed",
    "Inspect glass condition at intake",
    "Assign installer and bay time",
  ],
  performance: [
    "Confirm parts list and install goals",
    "Verify inventory and vehicle fitment",
    "Capture baseline condition and concerns",
    "Assign technician and bay time",
  ],
  tire: [
    "Confirm tire size and service scope",
    "Verify tire inventory and parts",
    "Inspect wheel condition at intake",
    "Assign technician and rack time",
  ],
  mechanic: [
    "Confirm concern, symptoms, and approval",
    "Verify parts availability",
    "Capture intake notes and inspection flags",
    "Assign technician and bay time",
  ],
  muffler: [
    "Confirm repair, fabrication, or upgrade scope",
    "Verify exhaust parts/material availability",
    "Inspect current exhaust condition and notes",
    "Assign technician and lift time",
  ],
};

export function getChecklistPresetSummary(businessType: string | null | undefined) {
  const key = getWorkflowPresetKey(businessType);
  return {
    key,
    label: PRESET_LABELS[key],
    appointmentCount: APPOINTMENT_CHECKLISTS[key].length,
    jobCount: JOB_CHECKLISTS[key].length,
  };
}

export function getChecklistPresetItems(
  businessType: string | null | undefined,
  entityType: "appointment" | "job"
) {
  const key = getWorkflowPresetKey(businessType);
  const items = entityType === "job" ? JOB_CHECKLISTS[key] : APPOINTMENT_CHECKLISTS[key];
  return {
    key,
    label: PRESET_LABELS[key],
    items,
  };
}
