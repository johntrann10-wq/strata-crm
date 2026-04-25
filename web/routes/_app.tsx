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
import { Outlet, useOutletContext, NavLink, useNavigate, useLocation, Link, useNavigation, useSearchParams } from "react-router";
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
  Bell,
  PhoneCall,
  Search as SearchIcon,
  Plus,
  CheckCheck,
  X,
} from "lucide-react";
import React, { useState, useEffect, memo, useMemo, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CommandPaletteProvider, useCommandPalette } from "../components/shared/CommandPaletteContext";
import { CommandPalette } from "../components/shared/CommandPalette";
import { getEnabledModules } from "../lib/modules";
import { canAccessAppPath, getPreferredAuthorizedAppPath } from "../lib/permissionRouting";
import { useFindMany, useFindOne, useFindFirst } from "../hooks/useApi";
import { api } from "../api";
import { useNotifications, type AppNotificationCounts, type AppNotificationRecord } from "../hooks/useNotifications";
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
import { isNativeShell } from "@/lib/mobileShell";
import { triggerImpactFeedback, triggerNotificationFeedback, triggerSelectionFeedback } from "@/lib/nativeInteractions";
import { useKeyboardShortcutHints } from "@/hooks/useKeyboardShortcutHints";

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
  billingPrompt?: BillingPromptState | null;
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

function resolveWorkspaceBusiness(
  business: Record<string, unknown> | null | undefined,
  currentMembership: AuthOutletContext["tenantBusinesses"][number] | null | undefined
) {
  if (business && typeof business.id === "string" && business.id.trim()) {
    return business;
  }
  if (!currentMembership) return null;
  return {
    id: currentMembership.id,
    name: currentMembership.name,
    type: currentMembership.type,
    onboardingComplete: currentMembership.onboardingComplete,
  };
}

type NavSectionId = "operations" | "sales" | "crm" | "setup";
type AppNavItem = {
  icon: React.ElementType;
  label: string;
  href: string;
  end: boolean;
  reloadDocument?: boolean;
  module?: string;
  permission?: string;
  notificationBucket?: "leads" | "calendar";
  description: string;
};

const navSections: Array<{ id: NavSectionId; label: string; items: AppNavItem[] }> = [
  {
    id: "operations",
    label: "Operations",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/signed-in", end: true, permission: "dashboard.view", description: "Run today's operation from one command surface." },
      { icon: Calendar, label: "Calendar", href: "/calendar", end: false, module: "calendar", permission: "appointments.read", notificationBucket: "calendar", description: "Plan the schedule and see the shop at a glance." },
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
      { icon: PhoneCall, label: "Leads", href: "/leads", end: false, module: "clients", permission: "customers.read", notificationBucket: "leads", description: "Capture call-in opportunities fast and move them straight into work." },
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
    if (import.meta.env.DEV) {
      console.error(error, info);
    }
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

function getNotificationHref(notification: AppNotificationRecord): string | null {
  const metadataPath = typeof notification.metadata?.path === "string" ? notification.metadata.path.trim() : "";
  if (metadataPath.startsWith("/")) return metadataPath;

  if (notification.entityType === "appointment" && notification.entityId) {
    return `/appointments/${encodeURIComponent(notification.entityId)}`;
  }
  if (notification.entityType === "booking_request" && notification.entityId) {
    return `/appointments/requests?request=${encodeURIComponent(notification.entityId)}`;
  }
  if (notification.entityType === "client" && notification.entityId) {
    return `/clients/${encodeURIComponent(notification.entityId)}?from=${encodeURIComponent("/leads")}`;
  }
  if (notification.entityType === "invoice" && notification.entityId) {
    return `/invoices/${encodeURIComponent(notification.entityId)}`;
  }
  if (notification.entityType === "payment") {
    const invoiceId =
      typeof notification.metadata?.invoiceId === "string" ? notification.metadata.invoiceId.trim() : "";
    if (invoiceId) return `/invoices/${encodeURIComponent(invoiceId)}`;
  }
  return null;
}

function NotificationCenter({
  notifications,
  counts,
  loading,
  onRefresh,
  onOpenNotification,
  onMarkAsRead,
  onMarkAllAsRead,
  compact = false,
}: {
  notifications: AppNotificationRecord[];
  counts: AppNotificationCounts;
  loading: boolean;
  onRefresh: () => Promise<void> | void;
  onOpenNotification: (notification: AppNotificationRecord) => void;
  onMarkAsRead: (notification: AppNotificationRecord) => Promise<void> | void;
  onMarkAllAsRead: () => Promise<void> | void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen !== open) {
        void triggerSelectionFeedback();
      }
      setOpen(nextOpen);
    },
    [open]
  );

  useEffect(() => {
    if (!open) return;
    void onRefresh();
  }, [open, onRefresh]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "relative rounded-full border-border/80 bg-background/85 shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
            compact ? "h-9 w-9" : "h-10 w-10"
          )}
          aria-label={counts.total > 0 ? `Open notifications (${counts.total} unread)` : "Open notifications"}
        >
          <Bell className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} />
          {counts.total > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white shadow-sm"
            >
              {counts.total > 9 ? "9+" : counts.total}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={compact ? "center" : "end"}
        sideOffset={compact ? 8 : 6}
        collisionPadding={8}
        className="w-[min(24rem,calc(100vw-1rem))] rounded-2xl border border-border/80 p-0 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
      >
        <div className="border-b border-border/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">
                {counts.total > 0 ? `${counts.total} unread.` : "Everything is caught up."}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={counts.total === 0}
              onClick={async () => {
                try {
                  await onMarkAllAsRead();
                  void triggerNotificationFeedback("success");
                } catch {
                  void triggerNotificationFeedback("error");
                }
              }}
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              Mark all read
            </Button>
          </div>
        </div>
        <div className="max-h-[24rem] overflow-y-auto px-3 py-3">
          {loading && notifications.length === 0 ? (
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Loading notifications...
            </div>
          ) : notifications.length > 0 ? (
            <div className="space-y-2">
              {notifications.map((notification) => {
                const href = getNotificationHref(notification);
                const relativeTime = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "rounded-xl border bg-background/95 px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors",
                      notification.isRead
                        ? "border-border/70"
                        : "border-orange-200/70 bg-orange-50/35 ring-1 ring-inset ring-orange-100/70"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          void triggerSelectionFeedback();
                          setOpen(false);
                          void onOpenNotification(notification);
                        }}
                        disabled={!href}
                        className={cn("min-w-0 flex-1 text-left", !href && "cursor-default")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {!notification.isRead ? <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" /> : null}
                            <p className="truncate text-sm font-semibold text-foreground">{notification.title}</p>
                          </div>
                          <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {relativeTime}
                          </p>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{notification.message}</p>
                      </button>
                      {!notification.isRead ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 rounded-full px-2.5 text-[11px] font-semibold"
                          onClick={async (event) => {
                            event.stopPropagation();
                            try {
                              await onMarkAsRead(notification);
                              void triggerNotificationFeedback("success");
                            } catch {
                              void triggerNotificationFeedback("error");
                            }
                          }}
                        >
                          Mark read
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No notifications yet</p>
              <p className="mt-1 text-sm text-muted-foreground">New booking requests, leads, and appointment changes will land here.</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
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
  const billingPrompt = billingStatus?.billingPrompt ?? null;

  useEffect(() => {
    setDismissedLocally(false);
  }, [billingPrompt?.stage, billingPrompt?.visible]);

  useEffect(() => {
    if (!billingPrompt?.visible || dismissedLocally || billingPrompt.stage === "none") return;
    void api.billing
      .trackPromptEvent({
        event: "shown",
        stage: billingPrompt.stage,
      })
      .catch(() => {
        // Prompt analytics should never break the shell.
      });
  }, [billingPrompt?.stage, billingPrompt?.visible, dismissedLocally]);

  if (!billingStatus) return null;
  if (isNativeShell()) return null;

  const canManageBilling = membershipRole === "owner" || membershipRole === "admin";

  const handleDismiss = async () => {
    if (!billingPrompt || !canDismissBillingPrompt(billingPrompt.stage)) return;
    setDismissedLocally(true);
    try {
      await api.billing.trackPromptEvent({
        event: "dismissed",
        stage: billingPrompt.stage,
      });
    } catch {
      // Keep the prompt dismissed locally even if logging fails.
    }
  };

  const handleContinue = async () => {
    if (!canManageBilling || !billingPrompt) return;
    const promptStage = billingPrompt.stage;
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

  if (billingStatus.accessState === "active_trial" && billingPrompt?.visible && !dismissedLocally) {
    const daysLeft = getTrialDaysLeft(billingStatus.trialEndsAt);
    const body = getBillingPromptBody({
      stage: billingPrompt.stage,
      milestone: billingStatus.activationMilestone,
      daysLeftInTrial: billingPrompt.daysLeftInTrial ?? daysLeft,
    });
    return (
      <>
        <div className="border-b border-amber-200/70 bg-amber-50/85 px-4 py-3 text-sm text-amber-950">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{getBillingPromptHeadline(billingPrompt.stage)}</p>
              <p className="text-amber-900/80">
                {body ||
                  (daysLeft == null
                    ? "Add payment method whenever you're ready."
                    : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your Strata free trial.`)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canDismissBillingPrompt(billingPrompt.stage) ? (
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
          stage={billingPrompt.stage}
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
  onCloseMenu,
  isMobile = false,
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
  notificationCounts,
}: {
  onItemClick?: () => void;
  onCloseMenu?: () => void;
  isMobile?: boolean;
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
  notificationCounts?: Pick<AppNotificationCounts, "leads" | "calendar">;
}) {
  const location = useLocation();
  const homeHref = useMemo(() => getPreferredAuthorizedAppPath(permissions, enabledModules), [permissions, enabledModules]);
  const handleItemClick = useCallback(() => {
    void triggerImpactFeedback("light");
    onItemClick?.();
  }, [onItemClick]);
  const handleCloseMenu = useCallback(() => {
    void triggerSelectionFeedback();
    onCloseMenu?.();
  }, [onCloseMenu]);
  const handleOpenSearch = useCallback(() => {
    void triggerSelectionFeedback();
    onOpenCommandPalette();
    onItemClick?.();
  }, [onItemClick, onOpenCommandPalette]);
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
    <div className="flex min-h-full flex-col bg-[hsl(220,20%,10%)]">
      <div
        className={cn(
          "border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))] px-5 py-4",
          isMobile && "pt-[max(0.75rem,env(safe-area-inset-top))]"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <Link to={homeHref} className="flex min-w-0 items-center gap-2.5" onClick={handleItemClick}>
            <StrataLogoLockup
              markClassName="h-9 w-9"
              wordmarkClassName="text-[15px] font-semibold tracking-tight text-white"
              sublabel="Shop OS"
              sublabelClassName="text-white/38"
            />
          </Link>
          {isMobile && onCloseMenu ? (
            <button
              type="button"
              onClick={handleCloseMenu}
              aria-label="Close navigation menu"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-start border border-white/8 bg-white/6 text-white hover:bg-white/10"
            onClick={handleOpenSearch}
          >
            <SearchIcon className="h-4 w-4" />
            Search or jump
          </Button>
          <Button asChild className="w-full justify-start">
            <Link to="/appointments/new" onClick={handleItemClick}>
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
                {section.items.map(({ icon: Icon, label, href, end, reloadDocument, notificationBucket }) => {
                  const unreadCount = notificationBucket ? notificationCounts?.[notificationBucket] ?? 0 : 0;
                  return (
                  <NavLink
                    key={href}
                    to={href}
                    end={end}
                    reloadDocument={reloadDocument}
                    onClick={handleItemClick}
                    aria-label={unreadCount > 0 ? `${label} (${unreadCount} unread)` : label}
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
                    {unreadCount > 0 ? (
                      <span
                        aria-hidden="true"
                        className="inline-flex min-w-[1.15rem] items-center justify-center rounded-full border border-white/10 bg-white/10 px-1 text-[10px] font-semibold text-white/80"
                      >
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    ) : isNavItemActive(location.pathname, { href, end }) ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                    ) : null}
                  </NavLink>
                  );
                })}
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
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const resolvedBusiness = resolveWorkspaceBusiness(
    business as Record<string, unknown> | null | undefined,
    currentMembership
  );
  const businessName = (resolvedBusiness?.name as string) ?? null;
  const businessId = (resolvedBusiness?.id as string) ?? null;
  const businessType = (resolvedBusiness?.type as string) ?? null;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [forceCompactMobileShell, setForceCompactMobileShell] = useState(false);
  const showKeyboardShortcutHints = useKeyboardShortcutHints();
  const { setOpen } = useCommandPalette();
  const {
    notifications,
    counts: notificationCounts,
    loading: notificationsLoading,
    refresh: refreshNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotifications(!!businessId);
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
    suppressAuthInvalidation: true,
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
  const routeTransitioning = navigation.state !== "idle";
  const handleMobileOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen !== mobileOpen) {
        void triggerSelectionFeedback();
      }
      setMobileOpen(nextOpen);
    },
    [mobileOpen]
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
    if (typeof window === "undefined") return;
    const root = document.documentElement;

    const updateShellMode = () => {
      const shouldForceCompactShell =
        isNativeShell() &&
        window.matchMedia("(pointer: coarse) and (orientation: landscape) and (max-height: 500px)").matches;
      setForceCompactMobileShell(shouldForceCompactShell);
      if (shouldForceCompactShell) {
        root.setAttribute("data-compact-landscape", "true");
      } else {
        root.removeAttribute("data-compact-landscape");
      }
    };

    updateShellMode();
    window.addEventListener("resize", updateShellMode);
    window.addEventListener("orientationchange", updateShellMode);

    return () => {
      window.removeEventListener("resize", updateShellMode);
      window.removeEventListener("orientationchange", updateShellMode);
      root.removeAttribute("data-compact-landscape");
    };
  }, []);

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

  const handleOpenNotification = useCallback(
    async (notification: AppNotificationRecord) => {
      const href = getNotificationHref(notification);
      if (!notification.isRead) {
        await markAsRead(notification.id);
      }
      void triggerSelectionFeedback();
      if (href) navigate(href);
    },
    [markAsRead, navigate]
  );

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col",
        !forceCompactMobileShell && "md:h-screen md:flex-row md:overflow-hidden"
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[90] h-1 origin-left bg-[linear-gradient(90deg,rgba(249,115,22,0.95),rgba(251,146,60,0.9),rgba(59,130,246,0.72))] shadow-[0_0_18px_rgba(249,115,22,0.35)] transition-all duration-300",
          routeTransitioning ? "scale-x-100 opacity-100" : "scale-x-[0.08] opacity-0"
        )}
      />
      <CommandPalette enabledModules={enabledModules} hasBusiness={!!businessId} />

      {/* Desktop sidebar - fixed, visible on md+ screens */}
      <aside
        className={cn(
          "z-20 hidden",
          !forceCompactMobileShell && "md:flex md:flex-col md:fixed md:inset-y-0 md:w-64"
        )}
      >
        <SidebarNav
          enabledModules={enabledModules}
          permissions={permissions}
          onOpenCommandPalette={() => setOpen(true)}
          notificationCounts={notificationCounts}
        />
      </aside>

      {/* Mobile sidebar - Sheet that slides in from the left */}
      <Sheet open={mobileOpen} onOpenChange={handleMobileOpenChange}>
        <SheetContent
          side="left"
          swipeToClose
          onSwipeClose={() => setMobileOpen(false)}
          className="gap-0 overflow-hidden border-white/10 bg-[hsl(220,20%,10%)] [&>button]:hidden"
        >
          <SidebarNav
            onItemClick={() => setMobileOpen(false)}
            onCloseMenu={() => setMobileOpen(false)}
            isMobile
            enabledModules={enabledModules}
            permissions={permissions}
            onOpenCommandPalette={() => setOpen(true)}
            businessId={businessId}
            currentLocationId={currentLocationId}
            locationRecords={locationRecords}
            membershipRole={membershipRole}
            notificationCounts={notificationCounts}
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
      <div className={cn("flex min-w-0 flex-1 flex-col", !forceCompactMobileShell && "md:pl-64")}>
        <header
          className={cn(
            "app-mobile-shell-header z-10 w-full border-b border-border/70 bg-background/92 backdrop-blur supports-[backdrop-filter]:bg-background/86",
            forceCompactMobileShell ? "sticky top-0" : "md:sticky md:top-0"
          )}
        >
          <div
            className={cn(
              "app-mobile-shell-header-inner items-center justify-between gap-2 px-2.5 py-2",
              forceCompactMobileShell ? "flex" : "flex md:hidden"
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="app-mobile-shell-menu-button h-8 w-8 shrink-0 rounded-full"
              onClick={() => handleMobileOpenChange(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-4.5 w-4.5" />
            </Button>
            <div className="app-mobile-shell-meta min-w-0 flex-1 pr-1">
              <p className="app-mobile-shell-title truncate text-[13px] font-semibold text-foreground">{activeNavEntry.item.label}</p>
              {(businessName || activeLocationName) ? (
                <p className="app-mobile-shell-subtitle truncate text-[10px] text-muted-foreground">
                  {businessName ? businessName : "No business selected"}
                  {activeLocationName ? ` - ${activeLocationName}` : ""}
                </p>
              ) : null}
            </div>
            <div className="app-mobile-shell-actions flex shrink-0 items-center gap-1">
              <NotificationCenter
                notifications={notifications}
                counts={notificationCounts}
                loading={notificationsLoading}
                onRefresh={() => refreshNotifications()}
                onOpenNotification={handleOpenNotification}
                onMarkAsRead={(notification) => markAsRead(notification.id)}
                onMarkAllAsRead={markAllAsRead}
                compact
              />
              <div className="app-mobile-shell-avatar scale-[0.92] origin-right">
                <SecondaryNavigation icon={<UserIcon user={user as any} />} />
              </div>
            </div>
          </div>

          <div
            className={cn(
              "flex-col gap-2.5 px-3 py-2.5 md:gap-3 md:px-6 md:py-3",
              forceCompactMobileShell ? "hidden" : "hidden md:flex"
            )}
          >
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
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start sm:w-auto"
                    onClick={() => {
                      void triggerSelectionFeedback();
                      setOpen(true);
                    }}
                  >
                    <SearchIcon className="h-4 w-4" />
                    Search
                    {showKeyboardShortcutHints ? <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">Ctrl K</span> : null}
                  </Button>
                  <QuickCreateMenu />
                  <NotificationCenter
                    notifications={notifications}
                    counts={notificationCounts}
                    loading={notificationsLoading}
                    onRefresh={() => refreshNotifications()}
                    onOpenNotification={handleOpenNotification}
                    onMarkAsRead={(notification) => markAsRead(notification.id)}
                    onMarkAllAsRead={markAllAsRead}
                  />
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
                  onClick={() => {
                    void triggerImpactFeedback("light");
                  }}
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

        <main
          className={cn(
            "app-native-scroll flex-1 overflow-x-hidden",
            forceCompactMobileShell ? "overflow-y-auto" : "md:overflow-y-auto"
          )}
        >
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
    clearAuthState();
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
        if (import.meta.env.DEV) {
          console.error("Failed to load auth context", workspaceError);
        }
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
    {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        googleProfileId: true,
        appleSubject: true,
        appleEmailIsPrivateRelay: true,
        hasPassword: true,
        accountDeletionRequestedAt: true,
        accountDeletionRequestNote: true,
      },
      pause: !effectiveUserId,
    }
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
    const resolvedBusiness = resolveWorkspaceBusiness(
      business as Record<string, unknown> | null | undefined,
      currentMembership
    );
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
