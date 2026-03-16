// --------------------------------------------------------------------------------------
// App Layout (Logged In Pages)
// --------------------------------------------------------------------------------------
// This file defines the layout for all application routes that require the user to be authenticated (logged in).
// Typical pages using this layout include dashboards, user profile, app content, and any protected resources.
// Structure:
//   - Persistent navigation sidebar (with responsive drawer for mobile)
//   - Header with user avatar and secondary navigation
//   - Main content area for app routes (via <Outlet />)
//   - Handles redirecting logged out users to the sign-in page
// To extend: update the navigation, header, or main content area as needed for your app's logged-in experience.
import { UserIcon } from "@/components/shared/UserIcon";
import { SecondaryNavigation } from "@/components/app/nav";
import { QuickCreateMenu } from "../components/shared/QuickCreateMenu";
import { Outlet, useOutletContext, NavLink, useNavigate } from "react-router";
import type { RootOutletContext } from "../root";
import type { Route } from "./+types/_app";
import {
  LayoutDashboard,
  Calendar,
  Users,
  ClipboardList,
  FileText,
  Wrench,
  Package,
  UserCheck,
  Settings,
  Menu,
  BarChart2,
  AlertCircle,
  Car,
  Zap,
  ShieldAlert,
  TrendingDown,
  RouteIcon,
} from "lucide-react";
import React, { useState, useEffect, memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CommandPaletteProvider, useCommandPalette } from "../components/shared/CommandPaletteContext";
import { CommandPalette } from "../components/shared/CommandPalette";
import { getEnabledModules } from "../lib/modules";
import { useFindOne, useFindFirst } from "../hooks/useApi";
import { api } from "../api";
// SPA mode: no loader; auth/session are resolved client-side via /api/auth/me.
export type AuthOutletContext = RootOutletContext & {
  user: any;
  businessName: string | null;
  businessId: string | null;
  businessType: string | null;
  enabledModules: Set<string>;
};
const primaryNavItems: { icon: React.ElementType; label: string; href: string; end: boolean; module?: string }[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/signed-in", end: true },
  { icon: Calendar, label: "Calendar", href: "/calendar", end: false, module: "calendar" },
  { icon: ClipboardList, label: "Jobs", href: "/appointments", end: false, module: "appointments" },
  { icon: Users, label: "Clients", href: "/clients", end: false, module: "clients" },
  { icon: FileText, label: "Invoices", href: "/invoices", end: false, module: "invoices" },
  { icon: FileText, label: "Quotes", href: "/quotes", end: false, module: "quotes" },
  { icon: BarChart2, label: "Analytics", href: "/analytics", end: false, module: "analytics" },
];
const managementNavItems: { icon: React.ElementType; label: string; href: string; end: boolean; module?: string }[] = [
  { icon: Car, label: "Vehicles", href: "/vehicles", end: false, module: "vehicles" },
  { icon: Wrench, label: "Services", href: "/services", end: false, module: "services" },
  { icon: UserCheck, label: "Staff", href: "/staff", end: false, module: "staff" },
  { icon: Package, label: "Inventory", href: "/inventory", end: false, module: "inventory" },
  { icon: Zap, label: "Automations", href: "/automations", end: false, module: "automations" },
  { icon: TrendingDown, label: "Lapsed Clients", href: "/lapsed-clients", end: false, module: "lapsedClients" },
  { icon: RouteIcon, label: "Route Planner", href: "/route-planner", end: false, module: "routePlanner" },
];
const bottomNavItems = [
  { icon: Settings, label: "Settings", href: "/settings", end: false },
  { icon: ShieldAlert, label: "Recovery", href: "/admin/recovery", end: false },
];
interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}
class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white rounded-lg border shadow-sm p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-6">{this.state.error?.message}</p>
            <Button onClick={() => window.location.reload()}>Refresh page</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
const SidebarNav = memo(function SidebarNav({
  onItemClick,
  enabledModules,
}: {
  onItemClick?: () => void;
  enabledModules: Set<string>;
}) {
  const visiblePrimaryItems = primaryNavItems.filter(
    (item) => !item.module || enabledModules.has(item.module)
  );
  const visibleManagementItems = managementNavItems.filter(
    (item) => !item.module || enabledModules.has(item.module)
  );
  return (
    <div className="flex flex-col h-full bg-[hsl(220,20%,10%)]">
      {/* Logo area */}
      <div className="flex items-center gap-2.5 px-5 py-[18px] border-b border-white/8">
        <Wrench className="h-5 w-5 text-orange-400 shrink-0" />
        <span className="text-[15px] font-semibold text-white tracking-tight">Strata</span>
      </div>
      {/* Main navigation */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        <div className="space-y-0.5">
          {visiblePrimaryItems.map(({ icon: Icon, label, href, end }) => (
            <NavLink
              key={href}
              to={href}
              end={end}
              onClick={onItemClick}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-[7px] rounded-[6px] text-[13px] font-medium transition-all duration-150 w-full",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/45 hover:bg-white/6 hover:text-white/80"
                )
              }
            >
              <Icon className="h-[15px] w-[15px] shrink-0" />
              {label}
            </NavLink>
          ))}
        </div>
        {visibleManagementItems.length > 0 && (
          <div className="text-white/25 text-[10px] font-semibold px-3 mt-4 mb-1 tracking-[0.08em] uppercase border-t border-white/8 pt-3">
            TOOLS
          </div>
        )}
        <div className="space-y-0.5">
          {visibleManagementItems.map(({ icon: Icon, label, href, end }) => (
            <NavLink
              key={href}
              to={href}
              end={end}
              onClick={onItemClick}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-[7px] rounded-[6px] text-[13px] font-medium transition-all duration-150 w-full",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/45 hover:bg-white/6 hover:text-white/80"
                )
              }
            >
              <Icon className="h-[15px] w-[15px] shrink-0" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      {/* Bottom navigation */}
      <div className="px-3 pb-4 pt-2 border-t border-white/8 space-y-0.5">
        {bottomNavItems.map(({ icon: Icon, label, href, end }) => (
          <NavLink
            key={href}
            to={href}
            end={end}
            onClick={onItemClick}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-[7px] rounded-[6px] text-[13px] font-medium transition-all duration-150 w-full",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/45 hover:bg-white/6 hover:text-white/80"
              )
            }
          >
            <Icon className="h-[15px] w-[15px] shrink-0" />
            {label}
          </NavLink>
        ))}
      </div>
    </div>
  );
});
function AppLayoutInner({
  user,
  business,
  rootOutletContext,
}: {
  user: Record<string, unknown>;
  business: Record<string, unknown> | null;
  rootOutletContext: RootOutletContext;
}) {
  const businessName = (business?.name as string) ?? null;
  const businessId = (business?.id as string) ?? null;
  const businessType = (business?.type as string) ?? null;
  const [mobileOpen, setMobileOpen] = useState(false);
  const { setOpen } = useCommandPalette();
  const enabledModules = useMemo(
    () => getEnabledModules(businessType) as Set<string>,
    [businessType]
  );
  const outletCtx = useMemo(
    () => ({ ...rootOutletContext, user, businessName, businessId, businessType, enabledModules } as AuthOutletContext),
    [rootOutletContext, user, businessName, businessId, businessType, enabledModules]
  );
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setOpen]);
  return (
    <div className="h-screen flex overflow-hidden">
      <CommandPalette enabledModules={enabledModules} />
      {/* Desktop sidebar – fixed, visible on md+ screens */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 z-20">
        <SidebarNav enabledModules={enabledModules} />
      </aside>
      {/* Mobile sidebar – Sheet that slides in from the left */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 w-64 bg-zinc-900 border-zinc-700 [&>button]:text-zinc-400 [&>button]:hover:text-white"
        >
          <SidebarNav onItemClick={() => setMobileOpen(false)} enabledModules={enabledModules} />
        </SheetContent>
      </Sheet>
      {/* Main content area */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b bg-background z-10 w-full">
          {/* Mobile hamburger button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <QuickCreateMenu />
            <div className="flex items-center">
              {businessName && (
                <span className="hidden md:block text-sm font-semibold text-foreground mr-4">
                  {businessName}
                </span>
              )}
              <SecondaryNavigation
                icon={
                  <>
                    <UserIcon user={user} />
                    <span className="text-sm font-medium">{(user as any).firstName ?? (user as any).email}</span>
                  </>
                }
              />
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-auto">
          <AppErrorBoundary>
            <div className="w-full">
              <Outlet context={outletCtx} />
            </div>
          </AppErrorBoundary>
        </main>
      </div>
    </div>
  );
}
export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const rootOutletContext = useOutletContext<RootOutletContext>();
  const navigate = useNavigate();
  // Make loaderData fully optional-safe
  const safeLoaderData = (loaderData ?? {}) as Partial<Route.LoaderData>;
  const signInPath = safeLoaderData.signInPath ?? "/sign-in";
  // When server has no session (e.g. dev with proxied API), resolve user via /api/auth/me
  const [clientUserId, setClientUserId] = useState<string | null>(null);
  const initialUserId = safeLoaderData.userId ?? null;
  const [authCheckDone, setAuthCheckDone] = useState(!!initialUserId);
  const effectiveUserId = initialUserId ?? clientUserId;
  useEffect(() => {
    if (initialUserId) {
      setAuthCheckDone(true);
      return;
    }
    let cancelled = false;
    api.user
      .me()
      .then((me) => {
        if (!cancelled) {
          setClientUserId((me as any).id);
          setAuthCheckDone(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthCheckDone(true);
          navigate(signInPath, { replace: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialUserId, navigate, signInPath]);
  const [{ data: user, fetching: userFetching }, refetchUser] = useFindOne(
    api.user,
    effectiveUserId ?? "",
    { select: { id: true, firstName: true, lastName: true, email: true }, pause: !effectiveUserId }
  );
  const [{ data: business }] = useFindFirst(api.business, {
    filter: { owner: { id: { equals: effectiveUserId } } },
    select: { id: true, name: true, type: true },
    pause: !effectiveUserId,
  });
  useEffect(() => {
    if (userFetching) return;
    if (authCheckDone && !user && effectiveUserId) {
      navigate(signInPath, { replace: true });
    }
  }, [user, userFetching, effectiveUserId, authCheckDone, navigate, signInPath]);
  if (!authCheckDone || !effectiveUserId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (userFetching || !user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }
  return (
    <CommandPaletteProvider>
      <AppLayoutInner
        user={user as Record<string, unknown>}
        business={(business as Record<string, unknown>) ?? null}
        rootOutletContext={rootOutletContext}
      />
    </CommandPaletteProvider>
  );
}
