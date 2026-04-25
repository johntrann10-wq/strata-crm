/**
 * Routes that may render without a business/workspace (tenant).
 * All other `_app` routes require a loaded business and completed onboarding.
 */
export function pathAllowsMissingBusiness(pathname: string): boolean {
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) return true;
  if (pathname === "/billing" || pathname.startsWith("/billing/")) return true;
  if (pathname === "/subscribe" || pathname.startsWith("/subscribe/")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  return false;
}
