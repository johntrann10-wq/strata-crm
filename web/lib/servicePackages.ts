type PackageCandidateService = {
  name?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
};

const PACKAGE_KEYWORDS = ["package", "packages", "bundle", "bundles"];

function normalizePackageText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isPackageTemplateService(service: PackageCandidateService) {
  const haystack = normalizePackageText([service.name, service.categoryLabel, service.category].filter(Boolean).join(" "));
  if (!haystack) return false;
  const tokens = new Set(haystack.split(" ").filter(Boolean));
  return PACKAGE_KEYWORDS.some((keyword) => tokens.has(keyword));
}
