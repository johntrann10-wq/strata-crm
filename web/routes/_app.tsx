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
import { Outlet, useOutletContext, NavLink, useNavigate, useLocation } from "react-router";
import type { RootOutletContext } from "../root";
import type { Route } from "./+types/_app";
import {
  LayoutDashboard,
  Calendar,
  Users,
  ClipboardList,
  FileText,
  Wrench,
  Settings,
  Menu,
  AlertCircle,
  Car,
  ShieldCheck,
} from "lucide-react";
import React, { useState, useEffect, memo, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CommandPaletteProvider, useCommandPalette } from "../components/shared/CommandPaletteContext";
import { CommandPalette } from "../components/shared/CommandPalette";
import { getEnabledModules } from "../lib/modules";
import { useFindOne, useFindFirst } from "../hooks/useApi";
import { api } from "../api";
import { clearAuthToken, clearCurrentBusinessId, getCurrentBusinessId, setCurrentBusinessId } from "@/lib/auth";
import { pathAllowsMissingBusiness } from "../lib/routeRequiresBusiness";

// SPA mode: no loader; auth/session are resolved client-side via /api/auth/me.

export type AuthOutletContext = RootOutletContext & {
  user: any;
  businessName: string | null;
  businessId: string | null;
  businessType: string | null;
  membershipRole: string | null;
  permissions: Set<string>;
  tenantBusinesses: Array<{
    id: string;
    name: string | null;
    type: string | null;
    role: string;
    status: string;
    isDefault: boolean;
    permissions: string[];
  }>;
  enabledModules: Set<string>;
};

const primaryNavItems: { icon: React.ElementType; label: string; href: string; end: boolean; module?: string }[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/signed-in", end: true },
  { icon: Calendar, label: "Calendar", href: "/calendar", end: false, module: "calendar" },
  { icon: Calendar, label: "Schedule", href: "/appointments", end: false, module: "appointments" },
  { icon: ClipboardList, label: "Jobs", href: "/jobs", end: false, module: "jobs" },
  { icon: Users, label: "Clients", href: "/clients", end: false, module: "clients" },
  { icon: FileText, label: "Invoices", href: "/invoices", end: false, module: "invoices" },
  { icon: FileText, label: "Quotes", href: "/quotes", end: false, module: "quotes" },
];

const managementNavItems: { icon: React.ElementType; label: string; href: string; end: boolean; module?: string }[] = [
  { icon: Car, label: "Vehicles", href: "/vehicles", end: false, module: "vehicles" },
  { icon: Wrench, label: "Services", href: "/services", end: false, module: "services" },
  { icon: ShieldCheck, label: "Team", href: "/settings", end: false },
];

const bottomNavItems = [{ icon: Settings, label: "Settings", href: "/settings", end: false }];

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
  tenantBusinesses,
  membershipRole,
  onBusinessChange,
  rootOutletContext,
}: {
  user: Record<string, unknown>;
  business: Record<string, unknown> | null;
  tenantBusinesses: AuthOutletContext["tenantBusinesses"];
  membershipRole: string | null;
  onBusinessChange: (businessId: string) => void;
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
  const permissions = useMemo(
    () => new Set((tenantBusinesses.find((tenantBusiness) => tenantBusiness.id === businessId)?.permissions ?? [])),
    [tenantBusinesses, businessId]
  );
  const outletCtx = useMemo(
    () =>
      ({
        ...rootOutletContext,
        user,
        businessName,
        businessId,
        businessType,
        membershipRole,
        permissions,
        tenantBusinesses,
        enabledModules,
      }) as AuthOutletContext,
    [rootOutletContext, user, businessName, businessId, businessType, membershipRole, permissions, tenantBusinesses, enabledModules]
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
      <CommandPalette enabledModules={enabledModules} hasBusiness={!!businessId} />

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
              {tenantBusinesses.length > 1 ? (
                <label className="hidden md:flex items-center mr-4">
                  <span className="sr-only">Current business</span>
                  <select
                    value={businessId ?? ""}
                    onChange={(e) => e.target.value && onBusinessChange(e.target.value)}
                    className="h-9 min-w-[220px] rounded-md border bg-background px-3 text-sm text-foreground"
                  >
                    {tenantBusinesses.map((tenantBusiness) => (
                      <option key={tenantBusiness.id} value={tenantBusiness.id}>
                        {tenantBusiness.name ?? "Untitled business"} ({tenantBusiness.role})
                      </option>
                    ))}
                  </select>
                </label>
              ) : businessName ? (
                <div className="hidden md:block mr-4 text-right">
                  <span className="block text-sm font-semibold text-foreground">{businessName}</span>
                  {membershipRole ? (
                    <span className="block text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      {membershipRole.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <SecondaryNavigation
                icon={
                  <>
                    <UserIcon user={user as any} />
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
  const location = useLocation();
  const safeLoaderData = (loaderData ?? {}) as { signInPath?: string };
  const signInPath = safeLoaderData.signInPath ?? "/sign-in";
  // Predictable auth persistence: always revalidate via /api/auth/me on boot.
  const [clientUserId, setClientUserId] = useState<string | null>(null);
  const [tenantBusinesses, setTenantBusinesses] = useState<AuthOutletContext["tenantBusinesses"]>([]);
  const [currentBusinessId, setCurrentBusinessIdState] = useState<string | null>(() => getCurrentBusinessId());
  const [authCheckDone, setAuthCheckDone] = useState(false);
  const effectiveUserId = clientUserId;

  useEffect(() => {
    let cancelled = false;
    api.user
      .me()
      .then(async (me) => {
        const context = await api.user.context();
        const availableBusinesses = context.businesses;
        const storedBusinessId = getCurrentBusinessId();
        const resolvedBusinessId =
          availableBusinesses.find((business) => business.id === storedBusinessId)?.id ??
          context.currentBusinessId ??
          availableBusinesses[0]?.id ??
          null;
        if (!cancelled) {
          setClientUserId(me.id);
          setTenantBusinesses(availableBusinesses);
          setCurrentBusinessIdState(resolvedBusinessId);
          if (resolvedBusinessId) setCurrentBusinessId(resolvedBusinessId);
          else clearCurrentBusinessId();
          setAuthCheckDone(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Invalid/expired token: clear local state and force the user back to sign-in.
          clearAuthToken();
          clearCurrentBusinessId();
          setTenantBusinesses([]);
          setCurrentBusinessIdState(null);
          setAuthCheckDone(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onInvalid = () => {
      setClientUserId(null);
      setTenantBusinesses([]);
      setCurrentBusinessIdState(null);
      clearCurrentBusinessId();
      setAuthCheckDone(true);
    };
    const onLogout = () => {
      setClientUserId(null);
      setTenantBusinesses([]);
      setCurrentBusinessIdState(null);
      clearCurrentBusinessId();
      setAuthCheckDone(true);
    };
    window.addEventListener("auth:invalid", onInvalid as EventListener);
    window.addEventListener("auth:logout", onLogout as EventListener);
    return () => {
      window.removeEventListener("auth:invalid", onInvalid as EventListener);
      window.removeEventListener("auth:logout", onLogout as EventListener);
    };
  }, []);

  const [{ data: user, fetching: userFetching, error: userError }, refetchUser] = useFindOne(
    api.user,
    effectiveUserId ?? "",
    { select: { id: true, firstName: true, lastName: true, email: true }, pause: !effectiveUserId }
  );
  const [{ data: business, fetching: businessFetching, error: businessError }, refetchBusiness] = useFindOne(
    api.business,
    currentBusinessId ?? "",
    { pause: !effectiveUserId || !currentBusinessId }
  );

  const currentMembership = useMemo(
    () => tenantBusinesses.find((tenantBusiness) => tenantBusiness.id === currentBusinessId) ?? null,
    [tenantBusinesses, currentBusinessId]
  );

  const handleBusinessChange = useCallback(
    (businessId: string) => {
      setCurrentBusinessIdState(businessId);
      setCurrentBusinessId(businessId);
      navigate("/signed-in");
    },
    [navigate]
  );

  useEffect(() => {
    if (userFetching || businessFetching) return;
    if (businessError) return;
    if (!business) {
      if (!pathAllowsMissingBusiness(location.pathname)) {
        navigate("/onboarding", { replace: true });
      }
      return;
    }
    if ((business as { onboardingComplete?: boolean }).onboardingComplete === false) {
      if (!pathAllowsMissingBusiness(location.pathname)) {
        navigate("/onboarding", { replace: true });
      }
      return;
    }
  }, [business, userFetching, businessFetching, businessError, navigate, location.pathname]);

  useEffect(() => {
    if (authCheckDone && !effectiveUserId) {
      navigate(signInPath, { replace: true });
    }
  }, [authCheckDone, effectiveUserId, navigate, signInPath]);

  if (!authCheckDone) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!effectiveUserId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Redirecting…</div>
      </div>
    );
  }
  if (userFetching) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!user) {
    if (userError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 p-6 max-w-md mx-auto text-center">
          <p className="text-muted-foreground">{userError.message}</p>
          <Button type="button" onClick={() => void refetchUser()}>
            Retry
          </Button>
        </div>
      );
    }
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  // When no business exists yet (or onboarding is incomplete), block CRM routes until redirect runs
  // or allow account/onboarding-only screens (see `pathAllowsMissingBusiness`).
  const allowWithoutBusiness = pathAllowsMissingBusiness(location.pathname);
  if (businessError && !allowWithoutBusiness) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 p-6 max-w-md mx-auto text-center">
        <p className="text-muted-foreground">{businessError.message}</p>
        <Button type="button" onClick={() => void refetchBusiness()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!business && !allowWithoutBusiness) {
    if (tenantBusinesses.length === 0) {
      navigate("/onboarding", { replace: true });
      return null;
    }
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Preparing your workspace…</div>
      </div>
    );
  }
  if (
    business &&
    (business as { onboardingComplete?: boolean }).onboardingComplete === false &&
    !allowWithoutBusiness
  ) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Finishing setup…</div>
      </div>
    );
  }

  return (
    <CommandPaletteProvider>
      <AppLayoutInner
        user={user as Record<string, unknown>}
        business={(business as Record<string, unknown>) ?? null}
        tenantBusinesses={tenantBusinesses}
        membershipRole={currentMembership?.role ?? null}
        onBusinessChange={handleBusinessChange}
        rootOutletContext={rootOutletContext}
      />
    </CommandPaletteProvider>
  );
}
