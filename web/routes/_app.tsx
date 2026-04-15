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
import { Outlet, useOutletContext, NavLink, useNavigate, useLocation, Link, useSearchParams } from "react-router";
import type { RootOutletContext } from "../root";
import type { Route } from "./+types/_app";
import {
  LayoutDashboard,
  Calendar,
  CalendarCheck2,
  Users,
  ClipboardList,
  FileText,
  Receipt,
  Wrench,
  Settings,
  Menu,
  AlertCircle,
  PhoneCall,
  Search as SearchIcon,
  Plus,
  X,
} from "lucide-react";
import React, { useState, useEffect, memo, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CommandPaletteProvider, useCommandPalette } from "../components/shared/CommandPaletteContext";
import { CommandPalette } from "../components/shared/CommandPalette";
import { getEnabledModules } from "../lib/modules";
import { canAccessAppPath, getPreferredAuthorizedAppPath } from "../lib/permissionRouting";
import { useFindMany, useFindOne, useFindFirst } from "../hooks/useApi";
import { api } from "../api";
import { StrataLogoLockup } from "@/components/brand/StrataLogo";
import {
  clearAuthState,
  clearCurrentBusinessId,
  clearCurrentLocationId,
  getCurrentBusinessId,
  getCurrentLocationId,
  readBroadcastAuthEvent,
  setCurrentBusinessId,
  setCurrentLocationId,
} from "@/lib/auth";
import { pathAllowsMissingBusiness } from "../lib/routeRequiresBusiness";
import { recordRuntimeError } from "../lib/runtimeErrors";
import {
  getTrialDaysLeft,
  hasFullBillingAccess,
  type BillingAccessState,
} from "../lib/billingAccess";
import {
  canDismissBillingPrompt,
  getBillingPromptBody,
  getBillingPromptHeadline,
  type BillingActivationMilestone,
  type BillingPromptState,
} from "../lib/billingPrompts";
import { BillingPromptDialog } from "@/components/billing/BillingPromptDialog";

type BillingStatus = {
  status: string | null;
  accessState: BillingAccessState | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  billingHasPaymentMethod: boolean;
  billingPaymentMethodAddedAt: string | null;
  billingSetupError: string | null;
  billingSetupFailedAt: string | null;
  billingLastStripeEventId: string | null;
  billingLastStripeEventType: string | null;
  billingLastStripeEventAt: string | null;
  billingLastStripeSyncStatus: "synced" | "failed" | null;
  billingLastStripeSyncError: string | null;
  activationMilestone: BillingActivationMilestone;
  billingPrompt: BillingPromptState;
  billingEnforced: boolean;
  checkoutConfigured: boolean;
  portalConfigured: boolean;
};

// SPA mode: no loader; auth/session are resolved client-side via /api/auth/me.

export type AuthOutletContext = RootOutletContext & {
  user: any;
  refreshUser: () => Promise<void>;
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
    onboardingComplete: boolean | null;
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
  reloadDocument?: boolean;
  module?: string;
  permission?: string;
  description: string;
};

const navSections: Array<{ id: NavSectionId; label: string; items: AppNavItem[] }> = [
  {
    id: "operations",
    label: "Operations",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/signed-in", end: true, permission: "dashboard.view", description: "Run today's operation from one command surface." },
      { icon: Calendar, label: "Calendar", href: "/calendar", end: false, module: "calendar", permission: "appointments.read", description: "Plan the schedule and see the shop at a glance." },
      { icon: Calendar, label: "Schedule", href: "/appointments", end: false, module: "appointments", permission: "appointments.read", description: "Work the appointment queue and move bookings forward." },
      { icon: ClipboardList, label: "Jobs", href: "/jobs", end: false, module: "jobs", permission: "jobs.read", description: "Track live work orders, staffing, and completion." },
    ],
  },
  {
    id: "sales",
    label: "Sales & Billing",
    items: [
      { icon: FileText, label: "Quotes", href: "/quotes", end: false, module: "quotes", permission: "quotes.read", description: "Turn estimates into approved work faster." },
      { icon: FileText, label: "Invoices", href: "/invoices", end: false, module: "invoices", permission: "invoices.read", description: "Stay on top of collections, sends, and cash flow." },
      { icon: Receipt, label: "Finances", href: "/finances", end: false, permission: "payments.read", description: "Track revenue, expenses, and the health of the money flow." },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    items: [
      { icon: Users, label: "Clients", href: "/clients", end: false, module: "clients", permission: "customers.read", description: "Find customers quickly and act from their history." },
      { icon: PhoneCall, label: "Leads", href: "/leads", end: false, module: "clients", permission: "customers.read", description: "Capture call-in opportunities fast and move them straight into work." },
    ],
  },
  {
    id: "setup",
    label: "Catalog & Admin",
    items: [
      { icon: Wrench, label: "Services", href: "/services", end: false, module: "services", permission: "services.read", description: "Manage services, packages, and pricing structure." },
      { icon: CalendarCheck2, label: "Booking page", href: "/app/booking", end: false, permission: "settings.read", description: "Shape the live booking flow, branding, and conversion settings." },
      { icon: Settings, label: "Settings", href: "/settings", end: false, permission: "settings.read", description: "Update team, locations, business profile, and billing." },
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

function BillingStatusBanner({
  billingStatus,
  membershipRole,
}: {
  billingStatus: BillingStatus | null;
  membershipRole: string | null;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [dismissedLocally, setDismissedLocally] = useState(false);

  useEffect(() => {
    setDismissedLocally(false);
  }, [billingStatus?.billingPrompt.stage, billingStatus?.billingPrompt.visible]);

  useEffect(() => {
    if (!billingStatus?.billingPrompt.visible || dismissedLocally || billingStatus.billingPrompt.stage === "none") return;
    void api.billing
      .trackPromptEvent({
        event: "shown",
        stage: billingStatus.billingPrompt.stage,
      })
      .catch(() => {
        // Prompt analytics should never break the shell.
      });
  }, [billingStatus?.billingPrompt.stage, billingStatus?.billingPrompt.visible, dismissedLocally]);

  if (!billingStatus) return null;

  const canManageBilling = membershipRole === "owner" || membershipRole === "admin";

  const handleDismiss = async () => {
    if (!canDismissBillingPrompt(billingStatus.billingPrompt.stage)) return;
    setDismissedLocally(true);
    try {
      await api.billing.trackPromptEvent({
        event: "dismissed",
        stage: billingStatus.billingPrompt.stage,
      });
    } catch {
      // Keep the prompt dismissed locally even if logging fails.
    }
  };

  const handleContinue = async () => {
    if (!canManageBilling) return;
    const promptStage = billingStatus.billingPrompt.stage;
    if (promptStage === "none") return;
    setOpeningPortal(true);
    try {
      const result = await api.billing.createPortalSessionForPrompt({
        promptStage,
        entryPoint: "trial_banner",
      });
      if (result?.url) window.location.href = result.url;
    } finally {
      setOpeningPortal(false);
    }
  };

  if (billingStatus.accessState === "active_trial" && billingStatus.billingPrompt.visible && !dismissedLocally) {
    const daysLeft = getTrialDaysLeft(billingStatus.trialEndsAt);
    const body = getBillingPromptBody({
      stage: billingStatus.billingPrompt.stage,
      milestone: billingStatus.activationMilestone,
      daysLeftInTrial: billingStatus.billingPrompt.daysLeftInTrial ?? daysLeft,
    });
    return (
      <>
        <div className="border-b border-amber-200/70 bg-amber-50/85 px-4 py-3 text-sm text-amber-950">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{getBillingPromptHeadline(billingStatus.billingPrompt.stage)}</p>
              <p className="text-amber-900/80">
                {body ||
                  (daysLeft == null
                    ? "Add payment method whenever you're ready."
                    : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your Strata free trial.`)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canDismissBillingPrompt(billingStatus.billingPrompt.stage) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-amber-950 hover:bg-white/70"
                  onClick={() => void handleDismiss()}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Dismiss billing reminder</span>
                </Button>
              ) : null}
              {canManageBilling ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 bg-white/80 text-amber-950 hover:bg-white"
                  onClick={() => setDialogOpen(true)}
                >
                  Add payment method
                </Button>
              ) : (
                <span className="text-xs text-amber-900/75">Owners and admins manage billing.</span>
              )}
            </div>
          </div>
        </div>
        <BillingPromptDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          stage={billingStatus.billingPrompt.stage}
          body={body}
          canManageBilling={canManageBilling}
          loading={openingPortal}
          onContinue={() => void handleContinue()}
        />
      </>
    );
  }

  if (billingStatus.accessState === "paused_missing_payment_method") {
    return (
      <div className="border-b border-rose-200/70 bg-rose-50/85 px-4 py-3 text-sm text-rose-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Trial paused - add payment method to resume</p>
            <p className="text-rose-900/80">Open billing recovery to restore full workspace access.</p>
          </div>
          <Button asChild size="sm" variant="outline" className="border-rose-300 bg-white/80 text-rose-950 hover:bg-white">
            <Link to="/subscribe">Open recovery</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (billingStatus.accessState === "pending_setup_failure") {
    return (
      <div className="border-b border-amber-200/70 bg-amber-50/85 px-4 py-3 text-sm text-amber-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Your workspace is live, but we still need to finish billing setup.</p>
            <p className="text-amber-900/80">
              {billingStatus.billingSetupError?.trim()
                ? billingStatus.billingSetupError
                : "Open Billing settings to retry the Stripe trial setup."}
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="border-amber-300 bg-white/80 text-amber-950 hover:bg-white">
            <Link to="/settings?tab=billing">Open billing</Link>
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

const SidebarNav = memo(function SidebarNav({
  onItemClick,
  enabledModules,
  permissions,
  onOpenCommandPalette,
  businessId,
  currentLocationId,
  locationRecords,
  membershipRole,
  onBusinessChange,
  onLocationChange,
  tenantBusinesses,
}: {
  onItemClick?: () => void;
  enabledModules: Set<string>;
  permissions: Set<string>;
  onOpenCommandPalette: () => void;
  businessId?: string | null;
  currentLocationId?: string | null;
  locationRecords?: Array<{ id: string; name?: string | null }>;
  membershipRole?: string | null;
  onBusinessChange?: (businessId: string) => void;
  onLocationChange?: (locationId: string | null) => void;
  tenantBusinesses?: AuthOutletContext["tenantBusinesses"];
}) {
  const location = useLocation();
  const homeHref = useMemo(() => getPreferredAuthorizedAppPath(permissions, enabledModules), [permissions, enabledModules]);
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (!item.module || enabledModules.has(item.module)) &&
          (!item.permission || permissions.has(item.permission))
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="flex flex-col h-full bg-[hsl(220,20%,10%)]">
      <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))] px-5 py-4">
        <Link to={homeHref} className="flex items-center gap-2.5" onClick={onItemClick}>
          <StrataLogoLockup
            markClassName="h-9 w-9"
            wordmarkClassName="text-[15px] font-semibold tracking-tight text-white"
            sublabel="Shop OS"
            sublabelClassName="text-white/38"
          />
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
        <div className="space-y-4">
          {visibleSections.map((section) => (
            <div key={section.id}>
              <div className="mb-1.5 flex items-center gap-2 px-3">
                <span className="h-px flex-1 bg-white/8" />
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/28">
                  {section.label}
                </div>
                <span className="h-px w-6 bg-white/8" />
              </div>
              <div className="space-y-1">
                {section.items.map(({ icon: Icon, label, href, end, reloadDocument }) => (
                  <NavLink
                    key={href}
                    to={href}
                    end={end}
                    reloadDocument={reloadDocument}
                    onClick={onItemClick}
                    className={({ isActive }) =>
                      cn(
                        "group flex w-full items-center gap-3 rounded-[1rem] px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                        isActive
                          ? "bg-white/10 text-white shadow-[0_10px_28px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "text-white/50 hover:bg-white/6 hover:text-white/85"
                      )
                    }
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-black/10 transition-colors group-hover:border-white/14 group-hover:bg-white/6">
                      <Icon className="h-4 w-4 shrink-0" />
                    </div>
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
      {((tenantBusinesses?.length ?? 0) > 1 || (locationRecords?.length ?? 0) > 1 || membershipRole) && (
        <div className="border-t border-white/8 px-4 py-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/28">
            Workspace
          </div>
          <div className="space-y-3">
            {(tenantBusinesses?.length ?? 0) > 1 && onBusinessChange ? (
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium text-white/55">Business</span>
                <select
                  value={businessId ?? ""}
                  onChange={(e) => e.target.value && onBusinessChange(e.target.value)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/6 px-3 text-sm text-white outline-none"
                >
                  {tenantBusinesses?.map((tenantBusiness) => (
                    <option key={tenantBusiness.id} value={tenantBusiness.id} className="text-black">
                      {tenantBusiness.name ?? "Untitled business"} ({tenantBusiness.role})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {(locationRecords?.length ?? 0) > 1 && onLocationChange ? (
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium text-white/55">Location</span>
                <select
                  value={currentLocationId ?? ""}
                  onChange={(e) => onLocationChange(e.target.value || null)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/6 px-3 text-sm text-white outline-none"
                >
                  <option value="" className="text-black">All locations</option>
                  {locationRecords?.map((entry) => (
                    <option key={entry.id} value={entry.id} className="text-black">
                      {entry.name?.trim() || "Unnamed location"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {membershipRole ? (
              <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-white/50">
                {membershipRole.replace(/_/g, " ")}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
});

function AppLayoutInner({
  user,
  refreshUser,
  business,
  billingStatus,
  currentMembership,
  tenantBusinesses,
  currentLocationId,
  onLocationChange,
  membershipRole,
  onBusinessChange,
  rootOutletContext,
}: {
  user: Record<string, unknown>;
  refreshUser: () => Promise<void>;
  business: Record<string, unknown> | null;
  billingStatus: BillingStatus | null;
  currentMembership: AuthOutletContext["tenantBusinesses"][number] | null;
  tenantBusinesses: AuthOutletContext["tenantBusinesses"];
  currentLocationId: string | null;
  onLocationChange: (locationId: string | null) => void;
  membershipRole: string | null;
  onBusinessChange: (businessId: string) => void;
  rootOutletContext: RootOutletContext;
}) {
  const location = useLocation();
  const resolvedBusiness =
    business ??
    currentMembership ??
    null;
  const businessName = (resolvedBusiness?.name as string) ?? null;
  const businessId = (resolvedBusiness?.id as string) ?? null;
  const businessType = (resolvedBusiness?.type as string) ?? null;
  const [mobileOpen, setMobileOpen] = useState(false);
  const { setOpen } = useCommandPalette();
  const enabledModules = useMemo(
    () => getEnabledModules(businessType) as Set<string>,
    [businessType]
  );
  const permissions = useMemo(
    () =>
      new Set(
        currentMembership?.permissions ??
          ((resolvedBusiness as { permissions?: string[] } | null)?.permissions ?? [])
      ),
    [currentMembership, resolvedBusiness]
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
        if (item.permission && !permissions.has(item.permission)) continue;
        if (isNavItemActive(location.pathname, item)) {
          return { item, section };
        }
      }
    }
    const firstVisibleSection = navSections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            (!item.module || enabledModules.has(item.module)) &&
            (!item.permission || permissions.has(item.permission))
        ),
      }))
      .find((section) => section.items.length > 0);

    if (firstVisibleSection) {
      return { item: firstVisibleSection.items[0], section: firstVisibleSection };
    }

    return {
      item: { icon: Settings, label: "Profile", href: "/profile", end: false, description: "Manage your account." },
      section: { id: "setup" as const, label: "Account", items: [] },
    };
  }, [enabledModules, permissions, location.pathname]);
  const activeSectionItems = useMemo(
    () =>
      activeNavEntry.section.items.filter(
        (item) =>
          (!item.module || enabledModules.has(item.module)) &&
          (!item.permission || permissions.has(item.permission))
      ),
    [activeNavEntry.section.items, enabledModules, permissions]
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
        refreshUser,
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
      refreshUser,
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

      {/* Desktop sidebar - fixed, visible on md+ screens */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 z-20">
        <SidebarNav enabledModules={enabledModules} permissions={permissions} onOpenCommandPalette={() => setOpen(true)} />
      </aside>

      {/* Mobile sidebar - Sheet that slides in from the left */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 bg-zinc-900 border-zinc-700 [&>button]:text-zinc-400 [&>button]:hover:text-white"
        >
          <SidebarNav
            onItemClick={() => setMobileOpen(false)}
            enabledModules={enabledModules}
            permissions={permissions}
            onOpenCommandPalette={() => setOpen(true)}
            businessId={businessId}
            currentLocationId={currentLocationId}
            locationRecords={locationRecords}
            membershipRole={membershipRole}
            onBusinessChange={(nextBusinessId) => {
              onBusinessChange(nextBusinessId);
              setMobileOpen(false);
            }}
            onLocationChange={onLocationChange}
            tenantBusinesses={tenantBusinesses}
          />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <header className="z-10 w-full border-b border-border/70 bg-background/92 backdrop-blur supports-[backdrop-filter]:bg-background/86 md:sticky md:top-0">
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-4.5 w-4.5" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground">{activeNavEntry.item.label}</p>
              {(businessName || activeLocationName) ? (
                <p className="truncate text-[10px] text-muted-foreground">
                  {businessName ? businessName : "No business selected"}
                  {activeLocationName ? ` - ${activeLocationName}` : ""}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 scale-[0.96] origin-right">
              <SecondaryNavigation icon={<UserIcon user={user as any} />} />
            </div>
          </div>

          <div className="hidden flex-col gap-2.5 px-3 py-2.5 md:flex md:gap-3 md:px-6 md:py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="min-w-0">
                  <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:px-2.5 sm:text-[11px]">
                      {activeNavEntry.section.label}
                    </span>
                  </div>
                  <h1 className="mt-0.5 text-balance text-[19px] font-semibold tracking-tight text-foreground sm:mt-2 sm:text-[28px]">
                    {activeNavEntry.item.label}
                  </h1>
                  {(businessName || activeLocationName) ? (
                    <p className="mt-1 text-[11px] text-muted-foreground sm:text-sm">
                      {businessName ? businessName : "No business selected"}
                      {activeLocationName ? ` - ${activeLocationName}` : ""}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-2.5 xl:items-end">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
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

                <div className="hidden grid-cols-1 gap-2 sm:flex sm:flex-row sm:flex-wrap xl:justify-end">
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

            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {activeSectionItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.end}
                  reloadDocument={item.reloadDocument}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors",
                      isActive
                        ? "border-primary/20 bg-primary/8 text-primary shadow-[0_8px_20px_rgba(249,115,22,0.08)]"
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

        <BillingStatusBanner billingStatus={billingStatus} membershipRole={membershipRole} />

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
  const [searchParams, setSearchParams] = useSearchParams();
  const safeLoaderData = (loaderData ?? {}) as { signInPath?: string };
  const signInPath = safeLoaderData.signInPath ?? "/sign-in";
  // Predictable auth persistence: always revalidate via /api/auth/me on boot.
  const [clientUserId, setClientUserId] = useState<string | null>(null);
  const [tenantBusinesses, setTenantBusinesses] = useState<AuthOutletContext["tenantBusinesses"]>([]);
  const [currentBusinessId, setCurrentBusinessIdState] = useState<string | null>(() => getCurrentBusinessId());
  const [currentLocationId, setCurrentLocationIdState] = useState<string | null>(() => getCurrentLocationId());
  const [authCheckDone, setAuthCheckDone] = useState(false);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<Error | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [billingCheckDone, setBillingCheckDone] = useState(false);
  const effectiveUserId = clientUserId;

  const refreshBillingStatus = useCallback(
    async (options?: { forceStripeRefresh?: boolean }) => {
      const result = options?.forceStripeRefresh ? await api.billing.refreshBillingState() : await api.billing.getStatus();
      setBillingStatus(result);
      setBillingCheckDone(true);
      return result;
    },
    []
  );

  const resetClientAuthState = useCallback(() => {
    setClientUserId(null);
    setTenantBusinesses([]);
    setCurrentBusinessIdState(null);
    setCurrentLocationIdState(null);
    setWorkspaceLoadError(null);
    setAuthCheckDone(true);
  }, []);

  const hydrateClientAuthState = useCallback(async () => {
    setWorkspaceLoadError(null);
    let cancelled = false;
    try {
      const me = await api.user.me();
      let context: Awaited<ReturnType<typeof api.user.context>>;
      try {
        context = await api.user.context();
      } catch (error) {
        const workspaceError =
          error instanceof Error ? error : new Error("Failed to load workspace context");
        console.error("Failed to load auth context", workspaceError);
        if (!cancelled) {
          setClientUserId(me.id);
          setTenantBusinesses([]);
          setCurrentBusinessIdState(null);
          setWorkspaceLoadError(workspaceError);
          setAuthCheckDone(true);
        }
        return () => {
          cancelled = true;
        };
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
    } catch {
      if (!cancelled) {
        // Invalid/expired token: clear local state and force the user back to sign-in.
        clearAuthState("auth:invalid");
        resetClientAuthState();
      }
    }
    return () => {
      cancelled = true;
    };
  }, [resetClientAuthState]);

  useEffect(() => {
    void hydrateClientAuthState();
  }, [hydrateClientAuthState]);

  useEffect(() => {
    const onLogin = () => {
      void hydrateClientAuthState();
    };
    const onInvalid = () => {
      resetClientAuthState();
    };
    const onLogout = () => {
      resetClientAuthState();
    };
    const onSubscriptionRequired = () => {
      setBillingCheckDone(true);
      setBillingStatus((current) =>
        current ?? {
          status: "required",
          accessState: "canceled",
          trialStartedAt: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
          billingHasPaymentMethod: false,
          billingPaymentMethodAddedAt: null,
          billingSetupError: null,
          billingSetupFailedAt: null,
          billingLastStripeEventId: null,
          billingLastStripeEventType: null,
          billingLastStripeEventAt: null,
          billingLastStripeSyncStatus: null,
          billingLastStripeSyncError: null,
          activationMilestone: {
            reached: false,
            type: null,
            occurredAt: null,
            detail: null,
          },
          billingPrompt: {
            stage: "paused",
            visible: true,
            daysLeftInTrial: null,
            dismissedUntil: null,
            cooldownDays: 5,
          },
          billingEnforced: true,
          checkoutConfigured: false,
          portalConfigured: false,
        }
      );
    };
    const onStorage = (event: StorageEvent) => {
      const authEvent = readBroadcastAuthEvent(event);
      if (!authEvent) return;
      if (authEvent.name === "auth:login") {
        void hydrateClientAuthState();
        return;
      }
      if (authEvent.name === "auth:invalid" || authEvent.name === "auth:logout") {
        resetClientAuthState();
      }
    };
    window.addEventListener("auth:login", onLogin as EventListener);
    window.addEventListener("auth:invalid", onInvalid as EventListener);
    window.addEventListener("auth:logout", onLogout as EventListener);
    window.addEventListener("subscription:required", onSubscriptionRequired as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("auth:login", onLogin as EventListener);
      window.removeEventListener("auth:invalid", onInvalid as EventListener);
      window.removeEventListener("auth:logout", onLogout as EventListener);
      window.removeEventListener("subscription:required", onSubscriptionRequired as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [hydrateClientAuthState, resetClientAuthState]);

  const [{ data: user, fetching: userFetching, error: userError }, refetchUser] = useFindOne(
    api.user,
    effectiveUserId ?? "",
    { select: { id: true, firstName: true, lastName: true, email: true }, pause: !effectiveUserId }
  );
  const currentMembership = useMemo(
    () => tenantBusinesses.find((tenantBusiness) => tenantBusiness.id === currentBusinessId) ?? null,
    [tenantBusinesses, currentBusinessId]
  );
  const currentPermissions = useMemo(
    () => new Set(currentMembership?.permissions ?? []),
    [currentMembership]
  );
  const currentEnabledModules = useMemo(
    () => getEnabledModules(currentMembership?.type ?? null) as Set<string>,
    [currentMembership?.type]
  );
  const canReadSettings = currentPermissions.has("settings.read");
  const [{ data: business, fetching: businessFetching, error: businessError }, refetchBusiness] = useFindOne(
    api.business,
    currentBusinessId ?? "",
    { pause: !effectiveUserId || !currentBusinessId || !canReadSettings }
  );
  const allowWithoutBusiness = pathAllowsMissingBusiness(location.pathname);
  const allowWithoutSubscription =
    location.pathname === "/subscribe" ||
    location.pathname.startsWith("/subscribe/") ||
    location.pathname === "/settings" ||
    location.pathname.startsWith("/settings/") ||
    location.pathname === "/profile" ||
    location.pathname.startsWith("/profile/") ||
    location.pathname === "/onboarding" ||
    location.pathname.startsWith("/onboarding/");

  useEffect(() => {
    let cancelled = false;
    if (!effectiveUserId || !currentBusinessId || allowWithoutSubscription) {
      setBillingStatus(null);
      setBillingCheckDone(true);
      return;
    }

    setBillingCheckDone(false);
    refreshBillingStatus()
      .then(() => {
        if (cancelled) return;
      })
      .catch(() => {
        if (cancelled) return;
        setBillingStatus(null);
        setBillingCheckDone(true);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveUserId, currentBusinessId, allowWithoutSubscription, refreshBillingStatus]);

  useEffect(() => {
    if (searchParams.get("billingPortal") !== "return") return;
    if (!effectiveUserId || !currentBusinessId) return;
    if (allowWithoutSubscription) return;

    let cancelled = false;
    setBillingCheckDone(false);
    void refreshBillingStatus({ forceStripeRefresh: true })
      .finally(() => {
        if (cancelled) return;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("billingPortal");
        setSearchParams(nextParams, { replace: true, preventScrollReset: true });
      });

    return () => {
      cancelled = true;
    };
  }, [allowWithoutSubscription, currentBusinessId, effectiveUserId, refreshBillingStatus, searchParams, setSearchParams]);

  useEffect(() => {
    if (!effectiveUserId) return;
    if (tenantBusinesses.length === 0) {
      if (currentBusinessId !== null) {
        setCurrentBusinessIdState(null);
        clearCurrentBusinessId();
      }
      if (currentLocationId !== null) {
        setCurrentLocationIdState(null);
        clearCurrentLocationId();
      }
      return;
    }
    if (currentBusinessId && tenantBusinesses.some((tenantBusiness) => tenantBusiness.id === currentBusinessId)) {
      return;
    }
    const fallbackBusinessId = tenantBusinesses[0]?.id ?? null;
    setCurrentBusinessIdState(fallbackBusinessId);
    if (fallbackBusinessId) setCurrentBusinessId(fallbackBusinessId);
    else clearCurrentBusinessId();
    if (currentLocationId !== null) {
      setCurrentLocationIdState(null);
      clearCurrentLocationId();
    }
  }, [effectiveUserId, tenantBusinesses, currentBusinessId, currentLocationId]);

  const handleBusinessChange = useCallback(
    (businessId: string) => {
      const targetBusiness = tenantBusinesses.find((tenantBusiness) => tenantBusiness.id === businessId) ?? null;
      const targetModules = getEnabledModules(targetBusiness?.type ?? null) as Set<string>;
      const targetPermissions = new Set(targetBusiness?.permissions ?? []);
      const destination =
        !targetBusiness
          ? "/onboarding"
          : targetBusiness.onboardingComplete === false
            ? "/onboarding"
            : getPreferredAuthorizedAppPath(targetPermissions, targetModules);
      setCurrentBusinessIdState(businessId);
      setCurrentBusinessId(businessId);
      setCurrentLocationIdState(null);
      clearCurrentLocationId();
      setBillingStatus(null);
      setBillingCheckDone(false);
      navigate(destination);
    },
    [navigate, tenantBusinesses]
  );

  const handleLocationChange = useCallback((locationId: string | null) => {
    setCurrentLocationIdState(locationId);
    if (locationId) setCurrentLocationId(locationId);
    else clearCurrentLocationId();
  }, []);

  const redirectTarget = useMemo(() => {
    if (!authCheckDone) return null;
    if (!effectiveUserId) return signInPath;
    if (workspaceLoadError) return null;
    if (userFetching || businessFetching || businessError) return null;
    const resolvedBusiness =
      business ??
      (currentMembership
        ? {
            id: currentMembership.id,
            name: currentMembership.name,
            type: currentMembership.type,
            onboardingComplete: currentMembership.onboardingComplete,
          }
        : null);
    if (!resolvedBusiness) return "/onboarding";
    if ((resolvedBusiness as { onboardingComplete?: boolean }).onboardingComplete === false) return "/onboarding";
    const hasAccess =
      billingStatus == null ||
      !billingStatus.billingEnforced ||
      hasFullBillingAccess(billingStatus.accessState) ||
      ((billingStatus.status === "active" || billingStatus.status === "trialing") && billingStatus.accessState == null);
    if (billingCheckDone && !allowWithoutSubscription && billingStatus?.billingEnforced && !hasAccess) {
      return "/subscribe";
    }
    if (!canAccessAppPath(location.pathname, currentPermissions, currentEnabledModules)) {
      return getPreferredAuthorizedAppPath(currentPermissions, currentEnabledModules);
    }
    if (allowWithoutBusiness) return null;
    return null;
  }, [
    authCheckDone,
    effectiveUserId,
    signInPath,
    location.pathname,
    currentPermissions,
    currentEnabledModules,
    userFetching,
    businessFetching,
    businessError,
    allowWithoutBusiness,
    allowWithoutSubscription,
    business,
    currentMembership,
    billingStatus,
    billingCheckDone,
    workspaceLoadError,
  ]);

  useEffect(() => {
    if (!redirectTarget || location.pathname === redirectTarget) return;
    navigate(redirectTarget, { replace: true });
  }, [redirectTarget, location.pathname, navigate]);

  if (!authCheckDone) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!effectiveUserId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Redirecting...</div>
      </div>
    );
  }
  if (userFetching) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
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
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (workspaceLoadError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 p-6 max-w-md mx-auto text-center">
        <p className="text-muted-foreground">
          We couldn&apos;t load your workspace yet. Your account is still signed in, but the business context failed to load.
        </p>
        <p className="text-sm text-muted-foreground/80">{workspaceLoadError.message}</p>
        <Button type="button" onClick={() => void hydrateClientAuthState()}>
          Retry workspace
        </Button>
      </div>
    );
  }

  // When no business exists yet (or onboarding is incomplete), block CRM routes until redirect runs
  // or allow account/onboarding-only screens (see `pathAllowsMissingBusiness`).
  if (businessError && !allowWithoutBusiness && canReadSettings) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 p-6 max-w-md mx-auto text-center">
        <p className="text-muted-foreground">{businessError.message}</p>
        <Button type="button" onClick={() => void refetchBusiness()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!business && !allowWithoutBusiness && canReadSettings) {
    if (tenantBusinesses.length === 0) {
      return (
        <div className="h-screen flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Preparing your workspace...</div>
        </div>
      );
    }
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Preparing your workspace...</div>
      </div>
    );
  }
  if (
    canReadSettings &&
    business &&
    (business as { onboardingComplete?: boolean }).onboardingComplete === false &&
    !allowWithoutBusiness
  ) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Finishing setup...</div>
      </div>
    );
  }

  return (
    <CommandPaletteProvider>
      <AppLayoutInner
        user={user as Record<string, unknown>}
        refreshUser={async () => {
          await refetchUser();
        }}
        business={(business as Record<string, unknown>) ?? null}
        currentMembership={currentMembership}
        billingStatus={billingStatus}
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

