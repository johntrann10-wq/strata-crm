export type IntakePreset = {
  label: string;
  clientNotes: string;
  internalNotes: string;
};

function lines(...values: string[]) {
  return values.join("\n");
}

const PRESETS: Record<string, IntakePreset> = {
  auto_detailing: {
    label: "Detail intake",
    clientNotes: lines(
      "Requested package:",
      "Add-ons approved:",
      "Pickup / delivery expectations:",
      "Access or parking instructions:"
    ),
    internalNotes: lines(
      "Paint condition / defects:",
      "Interior condition:",
      "Special tools or chemicals needed:",
      "QC focus before delivery:"
    ),
  },
  mobile_detailing: {
    label: "Mobile detail intake",
    clientNotes: lines(
      "Service address and arrival window:",
      "Water / power availability:",
      "Requested package:",
      "Site access instructions:"
    ),
    internalNotes: lines(
      "Crew assignment:",
      "Van / supply prep:",
      "Weather considerations:",
      "QC focus before wrap-up:"
    ),
  },
  ppf_ceramic: {
    label: "PPF / coating intake",
    clientNotes: lines(
      "Coverage areas approved:",
      "Film / coating package:",
      "Warranty expectations:",
      "Delivery timing:"
    ),
    internalNotes: lines(
      "Paint correction needed:",
      "Film / coating inventory reserved:",
      "Edge-wrap / pattern notes:",
      "Final cure and QC notes:"
    ),
  },
  tint_shop: {
    label: "Tint intake",
    clientNotes: lines(
      "Film type and shade percentages:",
      "Windows / panels included:",
      "Warranty discussed:",
      "Pickup timing:"
    ),
    internalNotes: lines(
      "Legal limit review:",
      "Glass condition / chips:",
      "Installer assignment:",
      "Post-install cure reminders:"
    ),
  },
  wrap_shop: {
    label: "Wrap intake",
    clientNotes: lines(
      "Coverage scope:",
      "Finish / material selected:",
      "Design approval status:",
      "Delivery deadline:"
    ),
    internalNotes: lines(
      "Template / print status:",
      "Trim removal needs:",
      "Panel / seam risks:",
      "QC and photo deliverables:"
    ),
  },
  tire_shop: {
    label: "Tire intake",
    clientNotes: lines(
      "Tire size / brand requested:",
      "Mount / balance / alignment scope:",
      "TPMS service approved:",
      "Pickup timing:"
    ),
    internalNotes: lines(
      "Inventory reserved:",
      "Wheel condition notes:",
      "Torque spec / alignment notes:",
      "Post-service safety check:"
    ),
  },
  mechanic: {
    label: "Repair intake",
    clientNotes: lines(
      "Primary concern / symptoms:",
      "Requested repair / diagnosis:",
      "Approval limit:",
      "Pickup timing / transportation needs:"
    ),
    internalNotes: lines(
      "Diagnostic plan:",
      "Parts status:",
      "Tech assignment:",
      "Open recommendations / follow-up:"
    ),
  },
  car_wash: {
    label: "Wash intake",
    clientNotes: lines(
      "Wash package:",
      "Add-ons approved:",
      "Customer timing notes:"
    ),
    internalNotes: lines(
      "Queue priority:",
      "Condition notes:",
      "Final touch-up focus:"
    ),
  },
  dealership_service: {
    label: "Dealer service intake",
    clientNotes: lines(
      "RO summary:",
      "Requested completion time:",
      "Transportation / shuttle needs:"
    ),
    internalNotes: lines(
      "Advisor handoff notes:",
      "Parts / warranty status:",
      "Tech assignment:",
      "Open follow-up items:"
    ),
  },
  other_auto_service: {
    label: "Service intake",
    clientNotes: lines(
      "Requested service:",
      "Customer timing notes:",
      "Special instructions:"
    ),
    internalNotes: lines(
      "Scope notes:",
      "Assigned technician:",
      "QC / delivery notes:"
    ),
  },
};

export function getIntakePreset(businessType: string | null | undefined): IntakePreset {
  return PRESETS[businessType ?? ""] ?? PRESETS.other_auto_service;
}
