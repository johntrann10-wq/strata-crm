import { permissionEnum, membershipRoleEnum } from "../db/schema.js";

export type MembershipRole = (typeof membershipRoleEnum.enumValues)[number];
export type PermissionKey = (typeof permissionEnum.enumValues)[number];

const ROLE_PERMISSIONS: Record<MembershipRole, PermissionKey[]> = {
  owner: [
    "dashboard.view",
    "customers.read",
    "customers.write",
    "vehicles.read",
    "vehicles.write",
    "services.read",
    "services.write",
    "quotes.read",
    "quotes.write",
    "appointments.read",
    "appointments.write",
    "jobs.read",
    "jobs.write",
    "invoices.read",
    "invoices.write",
    "payments.read",
    "payments.write",
    "team.read",
    "team.write",
    "settings.read",
    "settings.write",
  ],
  admin: [
    "dashboard.view",
    "customers.read",
    "customers.write",
    "vehicles.read",
    "vehicles.write",
    "services.read",
    "services.write",
    "quotes.read",
    "quotes.write",
    "appointments.read",
    "appointments.write",
    "jobs.read",
    "jobs.write",
    "invoices.read",
    "invoices.write",
    "payments.read",
    "payments.write",
    "team.read",
    "settings.read",
    "settings.write",
  ],
  manager: [
    "dashboard.view",
    "customers.read",
    "customers.write",
    "vehicles.read",
    "vehicles.write",
    "services.read",
    "services.write",
    "quotes.read",
    "quotes.write",
    "appointments.read",
    "appointments.write",
    "jobs.read",
    "jobs.write",
    "invoices.read",
    "invoices.write",
    "payments.read",
    "payments.write",
    "team.read",
    "team.write",
    "settings.read",
  ],
  service_advisor: [
    "dashboard.view",
    "customers.read",
    "customers.write",
    "vehicles.read",
    "vehicles.write",
    "services.read",
    "quotes.read",
    "quotes.write",
    "appointments.read",
    "appointments.write",
    "jobs.read",
    "jobs.write",
    "invoices.read",
    "invoices.write",
    "payments.read",
    "payments.write",
  ],
  technician: [
    "dashboard.view",
    "customers.read",
    "vehicles.read",
    "services.read",
    "appointments.read",
    "jobs.read",
    "jobs.write",
    "quotes.read",
    "invoices.read",
  ],
};

export const ALL_PERMISSION_KEYS = permissionEnum.enumValues;

const READ_DEPENDENCIES: Partial<Record<PermissionKey, PermissionKey>> = {
  "customers.write": "customers.read",
  "vehicles.write": "vehicles.read",
  "services.write": "services.read",
  "quotes.write": "quotes.read",
  "appointments.write": "appointments.read",
  "jobs.write": "jobs.read",
  "invoices.write": "invoices.read",
  "payments.write": "payments.read",
  "team.write": "team.read",
  "settings.write": "settings.read",
};

export function getDefaultPermissionsForRole(role: MembershipRole): Set<PermissionKey> {
  return new Set(ROLE_PERMISSIONS[role]);
}

export function normalizePermissionSelection(permissions: Iterable<PermissionKey>): Set<PermissionKey> {
  const selection = new Set<PermissionKey>(permissions);
  for (const permission of Array.from(selection)) {
    const dependency = READ_DEPENDENCIES[permission];
    if (dependency) selection.add(dependency);
  }
  return selection;
}

export function resolvePermissionsForRole(
  role: MembershipRole,
  overrides?: Array<{ permission: PermissionKey; enabled: boolean }> | null
): Set<PermissionKey> {
  if (!overrides || overrides.length === 0) {
    return getDefaultPermissionsForRole(role);
  }

  return normalizePermissionSelection(
    overrides.filter((override) => override.enabled).map((override) => override.permission)
  );
}

export function roleHasPermission(role: MembershipRole, permission: PermissionKey): boolean {
  return getDefaultPermissionsForRole(role).has(permission);
}
