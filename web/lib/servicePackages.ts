type PackageCandidateService = {
  name?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
};

export const PACKAGE_CATEGORY_LABEL = "Packages";

const PACKAGE_CATEGORIES = new Set(["package", "packages", "bundle", "bundles"]);

function normalizePackageText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isPackageTemplateService(service: PackageCandidateService) {
  return isPackageCategoryText(service.categoryLabel) || isPackageCategoryText(service.category);
}

export function isPackageCategoryText(value: string | null | undefined) {
  return PACKAGE_CATEGORIES.has(normalizePackageText(value));
}
