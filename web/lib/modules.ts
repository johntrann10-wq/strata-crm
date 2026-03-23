/**
 * Core product modules only — everything else is hidden until the core is stable.
 * (Auth, onboarding, and settings are routes, not feature modules here.)
 */
export const ALL_MODULE_KEYS = [
  "calendar",
  "clients",
  "vehicles",
  "services",
  "appointments",
  "invoices",
  "quotes",
] as const;

export type ModuleKey = (typeof ALL_MODULE_KEYS)[number];

/** Enabled for every business — ignores business type until non-core modules return. */
const CORE_MODULES: ModuleKey[] = [
  "calendar",
  "clients",
  "vehicles",
  "services",
  "appointments",
  "invoices",
  "quotes",
];

export function getEnabledModules(_businessType: string | null | undefined): Set<ModuleKey> {
  return new Set(CORE_MODULES);
}
