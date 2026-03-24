export type WorkflowPresetKey = "detail" | "ppf" | "tint" | "wrap" | "tire" | "mechanic" | "service";

export function getWorkflowPresetKey(businessType: string | null | undefined): WorkflowPresetKey {
  switch (businessType) {
    case "auto_detailing":
    case "mobile_detailing":
    case "car_wash":
      return "detail";
    case "ppf_ceramic":
      return "ppf";
    case "tint_shop":
      return "tint";
    case "wrap_shop":
    case "body_shop":
      return "wrap";
    case "tire_shop":
      return "tire";
    case "mechanic":
      return "mechanic";
    default:
      return "service";
  }
}

const PRESET_LABELS: Record<WorkflowPresetKey, string> = {
  detail: "Detail workflow",
  ppf: "PPF & coating workflow",
  tint: "Tint workflow",
  wrap: "Wrap workflow",
  tire: "Tire workflow",
  mechanic: "Repair workflow",
  service: "General service workflow",
};

const JOB_CHECKLISTS: Record<WorkflowPresetKey, string[]> = {
  detail: [
    "Walk vehicle and note pre-existing condition",
    "Stage chemicals, towels, and tools",
    "Complete wash and decontamination",
    "Finish interior and trim details",
    "Run final QC and delivery photos",
  ],
  ppf: [
    "Confirm coverage areas and film spec",
    "Inspect panels and prep surfaces",
    "Install film and wrap exposed edges",
    "Check alignment, bubbles, and seams",
    "Capture final QC and care notes",
  ],
  tint: [
    "Confirm film type and shade percentages",
    "Clean and prep all glass surfaces",
    "Cut and heat-shrink tint patterns",
    "Install film and inspect edges",
    "Review cure instructions with customer",
  ],
  wrap: [
    "Confirm design, panels, and finish",
    "Prep surfaces and remove needed trim",
    "Install wrap panels and align seams",
    "Post-heat edges and recessed areas",
    "Run final QC and delivery photos",
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
  service: [
    "Confirm scope with customer",
    "Stage required tools and materials",
    "Complete service work",
    "Run final QC",
    "Prepare delivery notes",
  ],
};

const APPOINTMENT_CHECKLISTS: Record<WorkflowPresetKey, string[]> = {
  detail: [
    "Confirm package and add-ons",
    "Verify vehicle arrival condition",
    "Assign bay or mobile crew",
    "Capture intake notes and photos",
  ],
  ppf: [
    "Confirm coverage package and warranty",
    "Verify film inventory and patterns",
    "Inspect paint condition at intake",
    "Assign installer and bay time",
  ],
  tint: [
    "Confirm shade percentages and film type",
    "Review legal tint limits if needed",
    "Inspect glass condition at intake",
    "Assign installer and bay time",
  ],
  wrap: [
    "Confirm design scope and panel coverage",
    "Verify material availability",
    "Inspect body condition at intake",
    "Assign installer and bay time",
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
  service: [
    "Confirm customer scope",
    "Verify required materials",
    "Capture intake notes",
    "Assign technician",
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
