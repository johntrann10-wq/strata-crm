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
import { Outlet, useOutletContext, NavLink, useNavigate, useLocation, Link } from "react-router";
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
  Search as SearchIcon,
  Building2,
  MapPin,
  Plus,
} from "lucide-react";
import React, { useState, useEffect, memo, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CommandPaletteProvider, useCommandPalette } from "../components/shared/CommandPaletteContext";
import { CommandPalette } from "../components/shared/CommandPalette";
import { getEnabledModules } from "../lib/modules";
import { useFindMany, useFindOne, useFindFirst } from "../hooks/useApi";
import { api } from "../api";
import {
  clearAuthToken,
  clearCurrentBusinessId,
  clearCurrentLocationId,
  getCurrentBusinessId,
  getCurrentLocationId,
  setCurrentBusinessId,
  setCurrentLocationId,
} from "@/lib/auth";
import { pathAllowsMissingBusiness } from "../lib/routeRequiresBusiness";
import { recordRuntimeError } from "../lib/runtimeErrors";

// SPA mode: no loader; auth/session are resolved client-side via /api/auth/me.

export type AuthOutletContext = RootOutletContext & {
  user: any;
  businessName: string | null;
  businessId: string | null;
  businessType: string | null;
  currentLocationId: string | null;
  setCurrentLocationId: (locationId: string | null) => void;
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

type NavSectionId = "operations" | "sales" | "crm" | "setup";
type AppNavItem = {
  icon: React.ElementType;
  label: string;
  href: string;
  end: boolean;
  module?: string;
  description: string;
};

const navSections: Array<{ id: NavSectionId; label: string; items: AppNavItem[] }> = [
  {
    id: "operations",
    label: "Operations",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/signed-in", end: true, description: "Run today's operation from one command surface." },
      { icon: Calendar, label: "Calendar", href: "/calendar", end: false, module: "calendar", description: "Plan the schedule and see the shop at a glance." },
      { icon: Calendar, label: "Schedule", href: "/appointments", end: false, module: "appointments", description: "Work the appointment queue and move bookings forward." },
      { icon: ClipboardList, label: "Jobs", href: "/jobs", end: false, module: "jobs", description: "Track live work orders, staffing, and completion." },
    ],
  },
  {
    id: "sales",
    label: "Sales & Billing",
    items: [
      { icon: FileText, label: "Quotes", href: "/quotes", end: false, module: "quotes", description: "Turn estimates into approved work faster." },
      { icon: FileText, label: "Invoices", href: "/invoices", end: false, module: "invoices", description: "Stay on top of collections, sends, and cash flow." },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    items: [
      { icon: Users, label: "Clients", href: "/clients", end: false, module: "clients", description: "Find customers quickly and act from their history." },
      { icon: Car, label: "Vehicles", href: "/vehicles", end: false, module: "vehicles", description: "Keep vehicles, history, and service context connected." },
    ],
  },
  {
    id: "setup",
    label: "Catalog & Admin",
    items: [
      { icon: Wrench, label: "Services", href: "/services", end: false, module: "services", description: "Manage services, packages, and starter presets." },
      { icon: Settings, label: "Settings", href: "/settings", end: false, description: "Update team, locations, business profile, and billing." },
    ],
  },
];

function isNavItemActive(pathname: string, item: Pick<AppNavItem, "href" | "end">): boolean {
  if (item.end) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

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
    recordRuntimeError({
      source: "react.boundary",
      message: error.message || "React render error",
      detail: info.componentStack || error.stack,
    });
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
  onOpenCommandPalette,
}: {
  onItemClick?: () => void;
  enabledModules: Set<string>;
  onOpenCommandPalette: () => void;
}) {
  const location = useLocation();
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.module || enabledModules.has(item.module)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="flex flex-col h-full bg-[hsl(220,20%,10%)]">
      <div className="border-b border-white/8 px-5 py-4">
        <Link to="/signed-in" className="flex items-center gap-2.5" onClick={onItemClick}>
          <Wrench className="h-5 w-5 shrink-0 text-orange-400" />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-tight text-white">Strata</div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Shop OS</div>
          </div>
        </Link>
        <div className="mt-4 grid gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-start border border-white/8 bg-white/6 text-white hover:bg-white/10"
            onClick={() => {
              onOpenCommandPalette();
              onItemClick?.();
            }}
          >
            <SearchIcon className="h-4 w-4" />
            Search or jump
          </Button>
          <Button asChild className="w-full justify-start">
            <Link to="/appointments/new" onClick={onItemClick}>
              <Plus className="h-4 w-4" />
              New appointment
            </Link>
          </Button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {visibleSections.map((section) => (
            <div key={section.id}>
              <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
                {section.label}
              </div>
              <div className="space-y-1">
                {section.items.map(({ icon: Icon, label, href, end }) => (
                  <NavLink
                    key={href}
                    to={href}
                    end={end}
                    onClick={onItemClick}
                    className={({ isActive }) =>
                      cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                        isActive
                          ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "text-white/50 hover:bg-white/6 hover:text-white/85"
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
                    {isNavItemActive(location.pathname, { href, end }) ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
});

function AppLayoutInner({
  user,
  business,
  tenantBusinesses,
  currentLocationId,
  onLocationChange,
  membershipRole,
  onBusinessChange,
  rootOutletContext,
}: {
  user: Record<string, unknown>;
  business: Record<string, unknown> | null;
  tenantBusinesses: AuthOutletContext["tenantBusinesses"];
  currentLocationId: string | null;
  onLocationChange: (locationId: string | null) => void;
  membershipRole: string | null;
  onBusinessChange: (businessId: string) => void;
  rootOutletContext: RootOutletContext;
}) {
  const location = useLocation();
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
  const [{ data: locations }] = useFindMany(api.location, {
    first: 100,
    sort: { name: "Ascending" },
    pause: !businessId,
  } as any);
  const locationRecords = useMemo(
    () => (((locations ?? []) as Array<{ id: string; name?: string | null }>).filter(Boolean)),
    [locations]
  );
  const activeNavEntry = useMemo(() => {
    for (const section of navSections) {
      for (const item of section.items) {
        if (item.module && !enabledModules.has(item.module)) continue;
        if (isNavItemActive(location.pathname, item)) {
          return { item, section };
        }
      }
    }
    return { item: navSections[0].items[0], section: navSections[0] };
  }, [enabledModules, location.pathname]);
  const activeSectionItems = useMemo(
    () => activeNavEntry.section.items.filter((item) => !item.module || enabledModules.has(item.module)),
    [activeNavEntry.section.items, enabledModules]
  );
  const activeLocationName = useMemo(
    () => locationRecords.find((entry) => entry.id === currentLocationId)?.name?.trim() || null,
    [locationRecords, currentLocationId]
  );
  const outletCtx = useMemo(
    () =>
      ({
        ...rootOutletContext,
        user,
        businessName,
        businessId,
        businessType,
        currentLocationId,
        setCurrentLocationId: onLocationChange,
        membershipRole,
        permissions,
        tenantBusinesses,
        enabledModules,
      }) as AuthOutletContext,
    [
      rootOutletContext,
      user,
      businessName,
      businessId,
      businessType,
      currentLocationId,
      onLocationChange,
      membershipRole,
      permissions,
      tenantBusinesses,
      enabledModules,
    ]
  );

  useEffect(() => {
    if (!businessId) {
      onLocationChange(null);
      return;
    }
    if (locationRecords.length === 0) {
      if (currentLocationId) onLocationChange(null);
      return;
    }
    if (!currentLocationId) return;
    if (!locationRecords.some((location) => location.id === currentLocationId)) {
      onLocationChange(null);
    }
  }, [businessId, currentLocationId, locationRecords, onLocationChange]);

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
    <div className="flex min-h-dvh flex-col md:h-screen md:flex-row md:overflow-hidden">
      <CommandPalette enabledModules={enabledModules} hasBusiness={!!businessId} />

      {/* Desktop sidebar – fixed, visible on md+ screens */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 z-20">
        <SidebarNav enabledModules={enabledModules} onOpenCommandPalette={() => setOpen(true)} />
      </aside>

      {/* Mobile sidebar – Sheet that slides in from the left */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 w-64 bg-zinc-900 border-zinc-700 [&>button]:text-zinc-400 [&>button]:hover:text-white"
        >
          <SidebarNav
            onItemClick={() => setMobileOpen(false)}
            enabledModules={enabledModules}
            onOpenCommandPalette={() => setOpen(true)}
          />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-10 w-full border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/82">
          <div className="flex flex-col gap-3 px-4 py-3 md:gap-4 md:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-0.5 md:hidden"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {activeNavEntry.section.label}
                    </span>
                    {businessName ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        {businessName}
                      </span>
                    ) : null}
                    {activeLocationName ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {activeLocationName}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="mt-1.5 text-balance text-[22px] font-semibold tracking-tight text-foreground sm:mt-2 sm:text-[30px]">
                    {activeNavEntry.item.label}
                  </h1>
                  <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted-foreground sm:text-sm sm:leading-6">
                    {activeNavEntry.item.description}
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-3 xl:items-end">
                <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <Button type="button" variant="outline" className="justify-start sm:w-auto" onClick={() => setOpen(true)}>
                    <SearchIcon className="h-4 w-4" />
                    Search
                    <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">Ctrl K</span>
                  </Button>
                  <QuickCreateMenu />
                  <div className="justify-self-start sm:justify-self-auto">
                    <SecondaryNavigation
                      icon={
                        <>
                          <UserIcon user={user as any} />
                          <span className="hidden text-sm font-medium md:inline">
                            {(user as any).firstName ?? (user as any).email}
                          </span>
                        </>
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-row sm:flex-wrap xl:justify-end">
                  {tenantBusinesses.length > 1 ? (
                    <label className="flex min-w-0 items-center sm:flex-1 xl:flex-none">
                      <span className="sr-only">Current business</span>
                      <select
                        value={businessId ?? ""}
                        onChange={(e) => e.target.value && onBusinessChange(e.target.value)}
                        className="h-10 w-full min-w-0 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:min-w-[220px]"
                      >
                        {tenantBusinesses.map((tenantBusiness) => (
                          <option key={tenantBusiness.id} value={tenantBusiness.id}>
                            {tenantBusiness.name ?? "Untitled business"} ({tenantBusiness.role})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : membershipRole ? (
                    <div className="hidden rounded-xl border border-border/70 bg-muted/35 px-3 py-2 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground sm:block">
                      {membershipRole.replace(/_/g, " ")}
                    </div>
                  ) : null}
                  {locationRecords.length > 1 ? (
                    <label className="flex min-w-0 items-center sm:flex-1 xl:flex-none">
                      <span className="sr-only">Current location</span>
                      <select
                        value={currentLocationId ?? ""}
                        onChange={(e) => onLocationChange(e.target.value || null)}
                        className="h-10 w-full min-w-0 rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:min-w-[180px]"
                      >
                        <option value="">All locations</option>
                        {locationRecords.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name?.trim() || "Unnamed location"}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>
            </div>

                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {activeSectionItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary/20 bg-primary/8 text-primary"
                        : "border-border/70 bg-background/80 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden md:overflow-y-auto">
          <AppErrorBoundary>
            <div className="w-full min-h-full">
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
  const [currentLocationId, setCurrentLocationIdState] = useState<string | null>(() => getCurrentLocationId());
  const [authCheckDone, setAuthCheckDone] = useState(false);
  const effectiveUserId = clientUserId;

  useEffect(() => {
    let cancelled = false;
    api.user
      .me()
      .then(async (me) => {
        let context: Awaited<ReturnType<typeof api.user.context>> = {
          businesses: [],
          currentBusinessId: null,
        };
        try {
          context = await api.user.context();
        } catch (error) {
          console.error("Failed to load auth context", error);
        }
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
          clearCurrentLocationId();
          setTenantBusinesses([]);
          setCurrentBusinessIdState(null);
          setCurrentLocationIdState(null);
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
      setCurrentLocationIdState(null);
      clearCurrentLocationId();
      setAuthCheckDone(true);
    };
    const onLogout = () => {
      setClientUserId(null);
      setTenantBusinesses([]);
      setCurrentBusinessIdState(null);
      clearCurrentBusinessId();
      setCurrentLocationIdState(null);
      clearCurrentLocationId();
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
      setCurrentLocationIdState(null);
      clearCurrentLocationId();
      navigate("/signed-in");
    },
    [navigate]
  );

  const handleLocationChange = useCallback((locationId: string | null) => {
    setCurrentLocationIdState(locationId);
    if (locationId) setCurrentLocationId(locationId);
    else clearCurrentLocationId();
  }, []);

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
        currentLocationId={currentLocationId}
        onLocationChange={handleLocationChange}
        membershipRole={currentMembership?.role ?? null}
        onBusinessChange={handleBusinessChange}
        rootOutletContext={rootOutletContext}
      />
    </CommandPaletteProvider>
  );
}
