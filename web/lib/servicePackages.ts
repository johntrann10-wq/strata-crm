type PackageCandidateService = {
  name?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
};

const PACKAGE_CATEGORIES = new Set(["package", "packages", "bundle", "bundles"]);

function normalizePackageText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isPackageTemplateService(service: PackageCandidateService) {
  const categoryLabel = normalizePackageText(service.categoryLabel);
  const category = normalizePackageText(service.category);
  return PACKAGE_CATEGORIES.has(categoryLabel) || PACKAGE_CATEGORIES.has(category);
}
