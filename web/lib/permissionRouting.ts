type PermissionCollection = Iterable<string>;
type ModuleCollection = Iterable<string>;

const ROUTE_PREFERENCES: Array<{ href: string; permission?: string; module?: string }> = [
  { href: "/signed-in", permission: "dashboard.view" },
  { href: "/calendar", permission: "appointments.read", module: "calendar" },
  { href: "/appointments", permission: "appointments.read", module: "appointments" },
  { href: "/jobs", permission: "jobs.read", module: "jobs" },
  { href: "/quotes", permission: "quotes.read", module: "quotes" },
  { href: "/invoices", permission: "invoices.read", module: "invoices" },
  { href: "/clients", permission: "customers.read", module: "clients" },
  { href: "/leads", permission: "customers.read", module: "clients" },
  { href: "/services", permission: "services.read", module: "services" },
  { href: "/settings", permission: "settings.read" },
];

export function getPreferredAuthorizedAppPath(
  permissions: PermissionCollection,
  enabledModules?: ModuleCollection
): string {
  const permissionSet = permissions instanceof Set ? permissions : new Set(permissions);
  const moduleSet = enabledModules ? (enabledModules instanceof Set ? enabledModules : new Set(enabledModules)) : null;

  for (const route of ROUTE_PREFERENCES) {
    if (route.permission && !permissionSet.has(route.permission)) continue;
    if (route.module && moduleSet && !moduleSet.has(route.module)) continue;
    return route.href;
  }

  return "/profile";
}
