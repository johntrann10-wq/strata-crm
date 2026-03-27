export type BusinessTypeValue =
  | "auto_detailing"
  | "mobile_detailing"
  | "wrap_ppf"
  | "window_tinting"
  | "performance"
  | "mechanic"
  | "tire_shop"
  | "muffler_shop";

export type BusinessTypeWorkspaceDefaults = {
  value: BusinessTypeValue;
  label: string;
  description: string;
  exampleName: string;
  starterCount: number;
  sampleServices: string[];
  defaultStaffCount: string;
  defaultDays: string;
  defaultOpen: string;
  defaultClose: string;
  appointmentBufferMinutes: number;
  defaultTaxRate: number;
  workflowTitle: string;
  workflowSummary: string;
  bookingSettingsLabel: string;
  estimateTemplateSummary: string;
  invoiceTemplateSummary: string;
  statusLabels: string[];
};

export const BUSINESS_TYPE_WORKSPACE_DEFAULTS: BusinessTypeWorkspaceDefaults[] = [
  {
    value: "auto_detailing",
    label: "Auto Detailing",
    description: "Premium cleaning, correction, coating, and reconditioning work.",
    exampleName: "Elite Auto Detailing",
    starterCount: 26,
    sampleServices: ["Full Detail", "Paint Correction", "Ceramic Coating"],
    defaultStaffCount: "1",
    defaultDays: "Mon-Sat",
    defaultOpen: "08:00",
    defaultClose: "18:00",
    appointmentBufferMinutes: 15,
    defaultTaxRate: 0,
    workflowTitle: "Detail workflow",
    workflowSummary: "Lead with vehicle condition, package scope, and protection upsells from quote through final QC.",
    bookingSettingsLabel: "Single-bay detail schedule with 15-minute turnover buffer",
    estimateTemplateSummary: "Quotes default to package scope, condition assumptions, turnaround notes, and upsell guidance.",
    invoiceTemplateSummary: "Invoices default to service recap, protection notes, and aftercare-friendly delivery language.",
    statusLabels: ["Scheduled", "Confirmed", "In Service", "Ready for pickup"],
  },
  {
    value: "mobile_detailing",
    label: "Mobile Detailing",
    description: "On-site detailing with logistics, travel, and crew-readiness built in.",
    exampleName: "Roadside Detail Co.",
    starterCount: 25,
    sampleServices: ["Mobile Full Detail", "Maintenance Wash", "Seat Extraction"],
    defaultStaffCount: "1",
    defaultDays: "Mon-Sat",
    defaultOpen: "08:00",
    defaultClose: "17:00",
    appointmentBufferMinutes: 20,
    defaultTaxRate: 0,
    workflowTitle: "Mobile service workflow",
    workflowSummary: "Service address, water/power, access notes, and travel timing are built into day-one booking defaults.",
    bookingSettingsLabel: "Mobile-first bookings with a 20-minute travel buffer between jobs",
    estimateTemplateSummary: "Quotes default to service-address notes, arrival windows, travel-fee context, and logistics reminders.",
    invoiceTemplateSummary: "Invoices default to on-site service recap, mobile logistics notes, and easy repeat-booking language.",
    statusLabels: ["Scheduled", "Confirmed", "En route", "On site"],
  },
  {
    value: "wrap_ppf",
    label: "Wrap & PPF",
    description: "Film installs, color change wraps, protection packages, and prep-heavy work.",
    exampleName: "Precision Wrap Studio",
    starterCount: 26,
    sampleServices: ["Front-End PPF", "Color Change Wrap", "Chrome Delete"],
    defaultStaffCount: "2",
    defaultDays: "Mon-Fri",
    defaultOpen: "09:00",
    defaultClose: "18:00",
    appointmentBufferMinutes: 30,
    defaultTaxRate: 0,
    workflowTitle: "Wrap & PPF workflow",
    workflowSummary: "Coverage scope, material choice, prep work, and deposit discipline are preloaded from day one.",
    bookingSettingsLabel: "Longer install blocks with a 30-minute prep and handoff buffer",
    estimateTemplateSummary: "Quotes default to coverage packages, material specs, prep assumptions, and deposit guidance.",
    invoiceTemplateSummary: "Invoices default to installed coverage notes, material finish summary, and care/warranty follow-up language.",
    statusLabels: ["Scheduled", "Material reserved", "In install", "Ready for cure handoff"],
  },
  {
    value: "window_tinting",
    label: "Window Tint",
    description: "Film selection, shade packages, windshield options, and install-driven scheduling.",
    exampleName: "Clear Shade Tint",
    starterCount: 26,
    sampleServices: ["Full Vehicle Tint", "Ceramic Film Tint", "Windshield Tint"],
    defaultStaffCount: "2",
    defaultDays: "Mon-Sat",
    defaultOpen: "09:00",
    defaultClose: "18:00",
    appointmentBufferMinutes: 20,
    defaultTaxRate: 0,
    workflowTitle: "Tint workflow",
    workflowSummary: "Film type, shade percentages, warranty notes, and cure instructions are part of the default sales flow.",
    bookingSettingsLabel: "Fast install schedule with a 20-minute turnover and glass-prep buffer",
    estimateTemplateSummary: "Quotes default to film package, shade selection, coverage notes, and warranty/cure messaging.",
    invoiceTemplateSummary: "Invoices default to installed film summary, cure instructions, and customer handoff notes.",
    statusLabels: ["Scheduled", "Confirmed", "In install", "Curing / ready"],
  },
  {
    value: "performance",
    label: "Performance",
    description: "Parts installs, tuning, suspension, brakes, and track-focused shop work.",
    exampleName: "Apex Performance Garage",
    starterCount: 26,
    sampleServices: ["Coilover Install", "ECU Tune", "Brake Upgrade"],
    defaultStaffCount: "2",
    defaultDays: "Mon-Fri",
    defaultOpen: "09:00",
    defaultClose: "18:00",
    appointmentBufferMinutes: 30,
    defaultTaxRate: 0,
    workflowTitle: "Performance workflow",
    workflowSummary: "Parts, fitment checks, approval limits, and alignment/tune dependencies are built into the default workflow.",
    bookingSettingsLabel: "Long-form installs with a 30-minute prep and verification buffer",
    estimateTemplateSummary: "Quotes default to parts-and-labor scope, fitment assumptions, and tune/alignment guidance.",
    invoiceTemplateSummary: "Invoices default to installed-parts summary, setup notes, and follow-up recommendations.",
    statusLabels: ["Scheduled", "Parts verified", "In bay", "Tested / ready"],
  },
  {
    value: "mechanic",
    label: "Mechanic",
    description: "Repair, maintenance, diagnostics, and inspection work for general auto service shops.",
    exampleName: "Main Street Auto Repair",
    starterCount: 26,
    sampleServices: ["Synthetic Oil Change", "Brake Service", "Diagnostic"],
    defaultStaffCount: "2",
    defaultDays: "Mon-Fri",
    defaultOpen: "08:00",
    defaultClose: "17:00",
    appointmentBufferMinutes: 15,
    defaultTaxRate: 0,
    workflowTitle: "Repair order workflow",
    workflowSummary: "Concern capture, diagnosis scope, approval limits, and recommendation tracking are ready by default.",
    bookingSettingsLabel: "Repair-order scheduling with a 15-minute turnover buffer",
    estimateTemplateSummary: "Quotes default to complaint summary, diagnosis scope, approval notes, and parts/labor assumptions.",
    invoiceTemplateSummary: "Invoices default to completed repair summary, parts/labor recap, and next-service recommendations.",
    statusLabels: ["Scheduled", "Checked in", "Diagnosing", "Ready for pickup"],
  },
  {
    value: "tire_shop",
    label: "Tire Shop",
    description: "Fast-turn tire, alignment, TPMS, rotation, and seasonal service work.",
    exampleName: "Fast Lane Tire",
    starterCount: 25,
    sampleServices: ["Mount & Balance", "Flat Repair", "Alignment"],
    defaultStaffCount: "2",
    defaultDays: "Mon-Sat",
    defaultOpen: "08:00",
    defaultClose: "17:00",
    appointmentBufferMinutes: 10,
    defaultTaxRate: 0,
    workflowTitle: "Tire service workflow",
    workflowSummary: "Spec accuracy, rack time, TPMS checks, and closeout safety notes are loaded into the core workflow.",
    bookingSettingsLabel: "Fast rack scheduling with a 10-minute turnover buffer",
    estimateTemplateSummary: "Quotes default to tire specs, alignment/TPMS scope, and recommendation language.",
    invoiceTemplateSummary: "Invoices default to tire service recap, torque/pressure closeout, and follow-up reminders.",
    statusLabels: ["Scheduled", "Checked in", "On rack", "Torque checked"],
  },
  {
    value: "muffler_shop",
    label: "Muffler / Exhaust",
    description: "Exhaust repair, fabrication, leak work, upgrades, and sound tuning.",
    exampleName: "Street Tone Exhaust",
    starterCount: 25,
    sampleServices: ["Muffler Replacement", "Custom Exhaust", "Leak Repair"],
    defaultStaffCount: "2",
    defaultDays: "Mon-Fri",
    defaultOpen: "09:00",
    defaultClose: "17:00",
    appointmentBufferMinutes: 20,
    defaultTaxRate: 0,
    workflowTitle: "Exhaust workflow",
    workflowSummary: "Sound goals, fabrication scope, leak checks, and fitment notes are already part of the intake-to-delivery flow.",
    bookingSettingsLabel: "Lift-based exhaust scheduling with a 20-minute fabrication and closeout buffer",
    estimateTemplateSummary: "Quotes default to exhaust scope, fabrication assumptions, and sound-goal context.",
    invoiceTemplateSummary: "Invoices default to completed exhaust work, leak/final-fit confirmation, and follow-up recommendations.",
    statusLabels: ["Scheduled", "Confirmed", "In fabrication", "Leak checked / ready"],
  },
];

export function getBusinessTypeWorkspaceDefaults(type: string | null | undefined) {
  return (
    BUSINESS_TYPE_WORKSPACE_DEFAULTS.find((item) => item.value === type) ??
    BUSINESS_TYPE_WORKSPACE_DEFAULTS.find((item) => item.value === "mechanic")!
  );
}
