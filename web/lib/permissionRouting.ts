type PermissionCollection = Iterable<string>;
type ModuleCollection = Iterable<string>;

const ROUTE_PREFERENCES: Array<{ href: string; permission?: string; module?: string }> = [
  { href: "/signed-in", permission: "dashboard.view" },
  { href: "/calendar", permission: "appointments.read", module: "calendar" },
  { href: "/appointments", permission: "appointments.read", module: "appointments" },
  { href: "/jobs", permission: "jobs.read", module: "jobs" },
  { href: "/quotes", permission: "quotes.read", module: "quotes" },
  { href: "/invoices", permission: "invoices.read", module: "invoices" },
  { href: "/finances", permission: "payments.read" },
  { href: "/billing" },
  { href: "/clients", permission: "customers.read", module: "clients" },
  { href: "/leads", permission: "customers.read", module: "clients" },
  { href: "/services", permission: "services.read", module: "services" },
  { href: "/settings", permission: "settings.read" },
];

const PATH_ACCESS_RULES: Array<{ prefix: string; permission?: string; module?: string }> = [
  { prefix: "/signed-in", permission: "dashboard.view" },
  { prefix: "/calendar", permission: "appointments.read", module: "calendar" },
  { prefix: "/appointments", permission: "appointments.read", module: "appointments" },
  { prefix: "/jobs", permission: "jobs.read", module: "jobs" },
  { prefix: "/quotes", permission: "quotes.read", module: "quotes" },
  { prefix: "/invoices", permission: "invoices.read", module: "invoices" },
  { prefix: "/finances", permission: "payments.read" },
  { prefix: "/billing" },
  { prefix: "/clients", permission: "customers.read", module: "clients" },
  { prefix: "/leads", permission: "customers.read", module: "clients" },
  { prefix: "/services", permission: "services.read", module: "services" },
  { prefix: "/settings", permission: "settings.read" },
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

export function canAccessAppPath(
  pathname: string,
  permissions: PermissionCollection,
  enabledModules?: ModuleCollection
): boolean {
  const permissionSet = permissions instanceof Set ? permissions : new Set(permissions);
  const moduleSet = enabledModules ? (enabledModules instanceof Set ? enabledModules : new Set(enabledModules)) : null;

  const matchedRule = PATH_ACCESS_RULES.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`));
  if (!matchedRule) return true;
  if (matchedRule.permission && !permissionSet.has(matchedRule.permission)) return false;
  if (matchedRule.module && moduleSet && !moduleSet.has(matchedRule.module)) return false;
  return true;
}
