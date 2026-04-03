export const LEAD_STATUS_OPTIONS = [
  "new",
  "contacted",
  "quoted",
  "booked",
  "converted",
  "lost",
] as const;

export const LEAD_SOURCE_OPTIONS = [
  "website",
  "phone",
  "walk_in",
  "referral",
  "instagram",
  "facebook",
  "google",
  "repeat_customer",
  "other",
] as const;

export type LeadStatus = (typeof LEAD_STATUS_OPTIONS)[number];
export type LeadSource = (typeof LEAD_SOURCE_OPTIONS)[number];

export type LeadRecord = {
  status: LeadStatus;
  source: LeadSource;
  serviceInterest: string;
  nextStep: string;
  summary: string;
  vehicle: string;
  isLead: boolean;
};

const DEFAULT_LEAD: LeadRecord = {
  status: "new",
  source: "website",
  serviceInterest: "",
  nextStep: "",
  summary: "",
  vehicle: "",
  isLead: false,
};

const PREFIXES = {
  status: "Lead status:",
  source: "Lead source:",
  serviceInterest: "Service interest:",
  nextStep: "Next step:",
  summary: "Lead summary:",
  vehicle: "Lead vehicle:",
} as const;

export function formatLeadStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatLeadSource(source: string | null | undefined): string {
  return formatLeadStatus(source);
}

export function parseLeadRecord(notes: string | null | undefined): LeadRecord {
  const raw = String(notes ?? "").trim();
  if (!raw) return DEFAULT_LEAD;

  const lines = raw.split(/\r?\n/);
  const read = (prefix: string) =>
    lines.find((line) => line.startsWith(prefix))?.slice(prefix.length).trim() ?? "";

  const status = read(PREFIXES.status);
  const source = read(PREFIXES.source);

  if (!status || !source) {
    return DEFAULT_LEAD;
  }

  const normalizedStatus = (LEAD_STATUS_OPTIONS.includes(status as LeadStatus) ? status : "new") as LeadStatus;
  const normalizedSource = (LEAD_SOURCE_OPTIONS.includes(source as LeadSource) ? source : "other") as LeadSource;

  return {
    status: normalizedStatus,
    source: normalizedSource,
    serviceInterest: read(PREFIXES.serviceInterest),
    nextStep: read(PREFIXES.nextStep),
    summary: read(PREFIXES.summary),
    vehicle: read(PREFIXES.vehicle),
    isLead: normalizedStatus !== "converted",
  };
}

export function buildLeadNotes(input: {
  status: LeadStatus;
  source: LeadSource;
  serviceInterest?: string;
  nextStep?: string;
  summary?: string;
  vehicle?: string;
}) {
  return [
    `${PREFIXES.status} ${input.status}`,
    `${PREFIXES.source} ${input.source}`,
    `${PREFIXES.serviceInterest} ${input.serviceInterest?.trim() ?? ""}`,
    `${PREFIXES.nextStep} ${input.nextStep?.trim() ?? ""}`,
    `${PREFIXES.summary} ${input.summary?.trim() ?? ""}`,
    `${PREFIXES.vehicle} ${input.vehicle?.trim() ?? ""}`,
  ].join("\n");
}
