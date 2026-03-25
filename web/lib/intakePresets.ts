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
  wrap_ppf: {
    label: "Wrap & PPF intake",
    clientNotes: lines(
      "Coverage scope / panels:",
      "Material or finish selected:",
      "Warranty / durability expectations:",
      "Delivery deadline:"
    ),
    internalNotes: lines(
      "Removal / prep needs:",
      "Material reserved:",
      "Edge-wrap / seam notes:",
      "QC and photo deliverables:"
    ),
  },
  window_tinting: {
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
  performance: {
    label: "Performance intake",
    clientNotes: lines(
      "Requested upgrades / parts:",
      "Performance goal:",
      "Approval limit:",
      "Completion timing:"
    ),
    internalNotes: lines(
      "Fitment concerns:",
      "Parts status:",
      "Tech assignment:",
      "Tune / alignment follow-up:"
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
  muffler_shop: {
    label: "Exhaust intake",
    clientNotes: lines(
      "Requested exhaust work:",
      "Sound goal:",
      "Parts / fabrication expectations:",
      "Pickup timing:"
    ),
    internalNotes: lines(
      "Lift assignment:",
      "Fabrication materials:",
      "Clearance / hanger notes:",
      "Leak-test plan:"
    ),
  },
};

export function getIntakePreset(businessType: string | null | undefined): IntakePreset {
  return PRESETS[businessType ?? ""] ?? PRESETS.mechanic;
}
