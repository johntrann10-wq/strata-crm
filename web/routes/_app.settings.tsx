import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import type { AuthOutletContext } from "./_app";
import { useAction, useFindFirst, useFindMany, useFindOne } from "../hooks/useApi";
import { API_BASE, api } from "../api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Activity,
  BellRing,
  Cable,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Server,
  Shield,
  PenLine,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Webhook,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { formatBusinessPresetLabel } from "../lib/businessPresets";
import type { BusinessPresetSummary } from "../lib/businessPresets";
import {
  clearReliabilityDiagnostics,
  getReliabilityDiagnosticsEventName,
  listReliabilityDiagnostics,
  type ReliabilityDiagnosticEntry,
} from "../lib/reliabilityDiagnostics";
import {
  clearRuntimeErrors,
  getRuntimeErrorsEventName,
  listRuntimeErrors,
  type RuntimeErrorEntry,
} from "../lib/runtimeErrors";
import { PageHeader } from "../components/shared/PageHeader";
import {
  businessSettingsFormFromSource,
  DEFAULT_BUSINESS_SETTINGS_FORM,
  normalizeDecimalInput,
  normalizeAppointmentBuffer,
  parseDecimalDraft,
  parseAppointmentBufferDraft,
  type BusinessSettingsFormData,
} from "../lib/businessSettingsForm";

const BUSINESS_TYPES = [
  { value: "auto_detailing", label: "Auto Detailing" },
  { value: "mobile_detailing", label: "Mobile Detailing" },
  { value: "wrap_ppf", label: "Wrap & PPF" },
  { value: "window_tinting", label: "Window Tinting" },
  { value: "performance", label: "Performance" },
  { value: "mechanic", label: "Mechanic" },
  { value: "tire_shop", label: "Tire Shop" },
  { value: "muffler_shop", label: "Muffler Shop" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET) - New York" },
  { value: "America/Chicago", label: "Central Time (CT) - Chicago" },
  { value: "America/Denver", label: "Mountain Time (MT) - Denver" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT) - Los Angeles" },
  { value: "America/Phoenix", label: "Arizona Time (AZ) - Phoenix" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT) - Honolulu" },
];

const BILLING_FEATURES = [
  "Appointments & calendar",
  "Client & vehicle CRM",
  "Quotes & invoices",
  "Payments on invoices",
  "Service catalog",
];

interface BillingStatus {
  status: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  stripeConnectConfigured: boolean;
  stripeConnectAccountId: string | null;
  stripeConnectDetailsSubmitted: boolean;
  stripeConnectChargesEnabled: boolean;
  stripeConnectPayoutsEnabled: boolean;
  stripeConnectOnboardedAt: string | null;
  stripeConnectReady: boolean;
}

type LocationRecord = {
  id: string;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  timezone?: string | null;
  active?: boolean | null;
};

type StaffRecord = {
  id: string;
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  membershipRole?: string | null;
  membershipStatus?: string | null;
  inviteDelivery?: "sent" | "not_configured" | "not_needed" | null;
  customPermissions?: string[] | null;
  effectivePermissions?: string[] | null;
  active?: boolean | null;
};

type TeamAccessState = {
  status: "active" | "invited" | "suspended" | "roster_only";
  label: string;
  helperText: string | null;
  badgeClassName: string;
};

type BusinessPresetActionResult = BusinessPresetSummary;
type ApplyBusinessPresetResult =
  | { ok: true; created: number; skipped: number; group: string; appliedCount?: number; expectedCount?: number; fullyApplied?: boolean }
  | { ok: false; message: string };

type SystemStatus = {
  status: "idle" | "checking" | "healthy" | "degraded";
  message: string;
  checkedAt: number | null;
};

type AutomationKind = "appointment_reminders" | "lapsed_clients" | "review_requests";

type AutomationSettingsForm = {
  appointmentRemindersEnabled: boolean;
  appointmentReminderHours: number;
  reviewRequestsEnabled: boolean;
  reviewRequestDelayHours: number;
  lapsedClientsEnabled: boolean;
  lapsedClientMonths: number;
};

type IntegrationSettingsForm = {
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  webhookEvents: string[];
};

type RunAutomationsResult = {
  ok: true;
  appointmentRemindersSent: number;
  lapsedClientsDetected: number;
  reviewRequestsSent: number;
};

const STAFF_ROLES = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "service_advisor", label: "Service Advisor" },
  { value: "technician", label: "Technician" },
];

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
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

const TEAM_PERMISSION_GROUPS = [
  { label: "Dashboard", read: "dashboard.view" },
  { label: "Customers", read: "customers.read", write: "customers.write" },
  { label: "Vehicles", read: "vehicles.read", write: "vehicles.write" },
  { label: "Services", read: "services.read", write: "services.write" },
  { label: "Calendar & Appointments", read: "appointments.read", write: "appointments.write" },
  { label: "Jobs", read: "jobs.read", write: "jobs.write" },
  { label: "Quotes", read: "quotes.read", write: "quotes.write" },
  { label: "Invoices", read: "invoices.read", write: "invoices.write" },
  { label: "Payments", read: "payments.read", write: "payments.write" },
  { label: "Team", read: "team.read", write: "team.write" },
  { label: "Settings", read: "settings.read", write: "settings.write" },
] as const;

const DEFAULT_AUTOMATION_SETTINGS: AutomationSettingsForm = {
  appointmentRemindersEnabled: true,
  appointmentReminderHours: 24,
  reviewRequestsEnabled: false,
  reviewRequestDelayHours: 24,
  lapsedClientsEnabled: false,
  lapsedClientMonths: 6,
};

const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettingsForm = {
  webhookEnabled: false,
  webhookUrl: "",
  webhookSecret: "",
  webhookEvents: [
    "appointment.created",
    "appointment.status_changed",
    "invoice.sent",
    "invoice.payment_recorded",
    "payment.recorded",
    "quote.sent",
  ],
};

const WEBHOOK_EVENT_OPTIONS = [
  { value: "appointment.created", label: "Appointment created", helper: "Fire when a booking is added to the calendar." },
  { value: "appointment.updated", label: "Appointment updated", helper: "Fire when appointment details change." },
  { value: "appointment.status_changed", label: "Appointment status changed", helper: "Fire when work moves between scheduled, confirmed, completed, or cancelled." },
  { value: "appointment.deposit_paid", label: "Appointment deposit paid", helper: "Fire when a deposit is collected." },
  { value: "invoice.created", label: "Invoice created", helper: "Fire when a new invoice is generated." },
  { value: "invoice.sent", label: "Invoice sent", helper: "Fire when an invoice is emailed to the client." },
  { value: "invoice.payment_recorded", label: "Invoice paid in Stripe", helper: "Fire when Stripe confirms a connected-account payment." },
  { value: "payment.recorded", label: "Manual payment recorded", helper: "Fire when staff records a payment inside Strata." },
  { value: "payment.reversed", label: "Payment reversed", helper: "Fire when a recorded payment is reversed." },
  { value: "quote.created", label: "Quote created", helper: "Fire when an estimate is created." },
  { value: "quote.sent", label: "Quote sent", helper: "Fire when a quote is emailed to a client." },
  { value: "quote.follow_up_recorded", label: "Quote follow-up sent", helper: "Fire when a quote follow-up email goes out." },
] as const;

function getDefaultPermissionSelection(role: string): string[] {
  return [...(ROLE_DEFAULT_PERMISSIONS[role] ?? ROLE_DEFAULT_PERMISSIONS.technician)];
}

function normalizePermissionSelection(selection: string[]): string[] {
  const next = new Set(selection);
  for (const group of TEAM_PERMISSION_GROUPS) {
    if (group.write && next.has(group.write)) {
      next.add(group.read);
    }
  }
  return Array.from(next).sort();
}

function getStaffAccessState(teamMember: StaffRecord): TeamAccessState {
  const status =
    (teamMember.membershipStatus as TeamAccessState["status"] | null | undefined) ??
    (!teamMember.userId ? "roster_only" : teamMember.active === false ? "suspended" : "active");

  switch (status) {
    case "invited":
      return {
        status,
        label: "Invite pending",
        helperText: teamMember.email ? `Awaiting account claim from ${teamMember.email}` : "Awaiting account claim",
        badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
      };
    case "suspended":
      return {
        status,
        label: "Suspended",
        helperText: "Sign-in access is suspended for this team member.",
        badgeClassName: "border-rose-200 bg-rose-50 text-rose-800",
      };
    case "roster_only":
      return {
        status,
        label: "Roster only",
        helperText: "No login access yet. Add an email when this person should sign in.",
        badgeClassName: "border-slate-200 bg-slate-100 text-slate-700",
      };
    default:
      return {
        status: "active",
        label: "Active access",
        helperText: teamMember.email ? "Can sign in and access assigned shop tools." : "Active on the shop roster.",
        badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
  }
}

async function copyTextWithFallback(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to a temporary textarea below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

function getStaffPermissionSummary(teamMember: StaffRecord): string {
  const customCount = teamMember.customPermissions?.length ?? 0;
  if (customCount > 0) {
    return `Custom page access on ${customCount} permissions.`;
  }

  const role = teamMember.membershipRole ?? teamMember.role ?? "technician";
  const defaults = getDefaultPermissionSelection(role).length;
  return `Using ${role.replace(/_/g, " ")} defaults across ${defaults} permissions.`;
}

function BillingTab({
  billingStatus,
  setBillingStatus,
  billingPortalLoading,
  setBillingPortalLoading,
  membershipRole,
}: {
  billingStatus: BillingStatus | null;
  setBillingStatus: (value: BillingStatus | null) => void;
  billingPortalLoading: boolean;
  setBillingPortalLoading: (value: boolean) => void;
  membershipRole: AuthOutletContext["membershipRole"];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stripeConnectLoading, setStripeConnectLoading] = useState(false);
  const [stripeDashboardLoading, setStripeDashboardLoading] = useState(false);
  const [stripeRefreshLoading, setStripeRefreshLoading] = useState(false);
  const [stripeDisconnectLoading, setStripeDisconnectLoading] = useState(false);
  const [disconnectStripeOpen, setDisconnectStripeOpen] = useState(false);

  const refreshBillingStatus = useCallback(async () => {
    const result = await api.billing.getStatus();
    setBillingStatus(result);
    return result;
  }, [setBillingStatus]);

  useEffect(() => {
    let cancelled = false;

    refreshBillingStatus()
      .then((result) => {
        if (!cancelled) setBillingStatus(result);
      })
      .catch(() => {
        if (!cancelled) {
          setBillingStatus({
            status: null,
            trialEndsAt: null,
            currentPeriodEnd: null,
            stripeConnectConfigured: false,
            stripeConnectAccountId: null,
            stripeConnectDetailsSubmitted: false,
            stripeConnectChargesEnabled: false,
            stripeConnectPayoutsEnabled: false,
            stripeConnectOnboardedAt: null,
            stripeConnectReady: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshBillingStatus, setBillingStatus]);

  useEffect(() => {
    const stripeConnectState = searchParams.get("stripeConnect");
    if (!stripeConnectState) return;

    refreshBillingStatus()
      .then((result) => {
        if (stripeConnectState === "return") {
          if (result.stripeConnectReady) {
            toast.success("Stripe is connected and ready for invoice payments.");
          } else {
            toast.message("Stripe account linked. Finish the remaining Stripe requirements to enable charges and payouts.");
          }
        } else if (stripeConnectState === "refresh") {
          toast.message("Stripe setup is still incomplete. Finish the remaining Stripe requirements, then refresh again.");
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not refresh Stripe status.");
      });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("stripeConnect");
    setSearchParams(nextParams, { replace: true });
  }, [refreshBillingStatus, searchParams, setSearchParams]);

  const handleManageSubscription = async () => {
    setBillingPortalLoading(true);
    try {
      const result = await api.billing.createPortalSession();
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      toast.error("Could not open billing portal.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBillingPortalLoading(false);
    }
  };

  const handleStripeConnect = async () => {
    setStripeConnectLoading(true);
    try {
      const result = await api.billing.createConnectOnboardingLink();
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      toast.error("Could not open Stripe onboarding.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setStripeConnectLoading(false);
    }
  };

  const handleOpenStripeDashboard = async () => {
    setStripeDashboardLoading(true);
    try {
      const result = await api.billing.createConnectDashboardLink();
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      toast.error("Could not open Stripe dashboard.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setStripeDashboardLoading(false);
    }
  };

  const handleRefreshStripeStatus = async () => {
    setStripeRefreshLoading(true);
    try {
      const result = await refreshBillingStatus();
      if (result.stripeConnectReady) {
        toast.success("Stripe is fully ready for connected-account invoice payments.");
      } else if (result.stripeConnectAccountId) {
        toast.message("Stripe account linked. Finish the remaining Stripe requirements to enable charges and payouts.");
      } else {
        toast.message("No Stripe account is connected yet for this business.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh Stripe status.");
    } finally {
      setStripeRefreshLoading(false);
    }
  };

  const handleDisconnectStripe = async () => {
    setStripeDisconnectLoading(true);
    try {
      await api.billing.disconnectConnectAccount();
      await refreshBillingStatus();
      setDisconnectStripeOpen(false);
      toast.success("Stripe was disconnected from this business. You can reconnect the correct account now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect Stripe.");
    } finally {
      setStripeDisconnectLoading(false);
    }
  };

  const isActive = billingStatus?.status === "active" || billingStatus?.status === "trialing";
  const trialEnd = billingStatus?.trialEndsAt ? new Date(billingStatus.trialEndsAt) : null;
  const periodEnd = billingStatus?.currentPeriodEnd ? new Date(billingStatus.currentPeriodEnd) : null;
  const stripeConnectOnboardedAt = billingStatus?.stripeConnectOnboardedAt
    ? new Date(billingStatus.stripeConnectOnboardedAt)
    : null;
  const canManageStripeConnect = membershipRole === "owner" || membershipRole === "admin";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="mb-1 flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Plan &amp; Billing</CardTitle>
          </div>
          <CardDescription>
            Strata is $29/month. First month free. Manage your subscription and payment method below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {billingStatus ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isActive ? "default" : "secondary"}>
                {billingStatus.status === "trialing"
                  ? "Free trial"
                  : billingStatus.status === "active"
                    ? "Active"
                    : billingStatus.status ?? "No subscription"}
              </Badge>
              {trialEnd && billingStatus.status === "trialing" ? (
                <span className="text-sm text-muted-foreground">Trial ends {trialEnd.toLocaleDateString()}</span>
              ) : null}
              {periodEnd && billingStatus.status === "active" ? (
                <span className="text-sm text-muted-foreground">Renews {periodEnd.toLocaleDateString()}</span>
              ) : null}
            </div>
          ) : null}

          <div>
            <p className="mb-3 text-sm font-medium">Everything included:</p>
            <ul className="space-y-2">
              {BILLING_FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          {isActive ? (
            <Button onClick={handleManageSubscription} disabled={billingPortalLoading}>
              {billingPortalLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Manage subscription
            </Button>
          ) : billingStatus !== null ? (
            <div className="space-y-2">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Subscribe to keep using Strata. Your data is saved.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/subscribe">Subscribe now - $29/mo, first month free</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="mb-1 flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Stripe Business Payments</CardTitle>
          </div>
          <CardDescription>
            Connect your business Stripe account through Strata so hosted invoice and deposit collection can route into your own Stripe account safely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {billingStatus ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  billingStatus.stripeConnectReady
                    ? "default"
                    : billingStatus.stripeConnectAccountId
                      ? "secondary"
                      : "outline"
                }
              >
                {billingStatus.stripeConnectReady
                  ? "Connected"
                  : billingStatus.stripeConnectAccountId
                    ? "Setup incomplete"
                    : "Not connected"}
              </Badge>
              {stripeConnectOnboardedAt ? (
                <span className="text-sm text-muted-foreground">
                  Ready since {stripeConnectOnboardedAt.toLocaleDateString()}
                </span>
              ) : null}
            </div>
          ) : null}

          {!billingStatus?.stripeConnectConfigured ? (
            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              Stripe Connect is not configured on the backend yet. Add the Stripe Connect platform configuration before businesses can link their payout accounts.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Details submitted</p>
                  <p className="mt-2 text-sm font-medium">
                    {billingStatus?.stripeConnectDetailsSubmitted ? "Ready" : "Needs setup"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Charges enabled</p>
                  <p className="mt-2 text-sm font-medium">
                    {billingStatus?.stripeConnectChargesEnabled ? "Enabled" : "Pending"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payouts enabled</p>
                  <p className="mt-2 text-sm font-medium">
                    {billingStatus?.stripeConnectPayoutsEnabled ? "Enabled" : "Pending"}
                  </p>
                </div>
              </div>

              {billingStatus?.stripeConnectAccountId ? (
                <p className="text-xs text-muted-foreground">
                  Connected Stripe account: <span className="font-mono">{billingStatus.stripeConnectAccountId}</span>
                </p>
              ) : null}

              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                {billingStatus?.stripeConnectReady
                  ? "Stripe is ready. Customer invoice payments can now route into this business's connected Stripe account."
                  : billingStatus?.stripeConnectAccountId
                    ? "Finish the remaining Stripe onboarding requirements so this business can accept customer payments and receive payouts."
                    : "Connect a Stripe account for this business so customer invoice payments can route into the business owner's own Stripe account."}
              </div>

              {!canManageStripeConnect ? (
                <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                  Only owners and admins can connect or manage the business Stripe account.
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={handleStripeConnect} disabled={stripeConnectLoading}>
                    {stripeConnectLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {billingStatus?.stripeConnectAccountId ? "Continue Stripe setup" : "Connect Stripe"}
                  </Button>
                  <Button variant="outline" onClick={handleRefreshStripeStatus} disabled={stripeRefreshLoading}>
                    {stripeRefreshLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh Stripe status
                  </Button>
                  {billingStatus?.stripeConnectAccountId ? (
                    <Button
                      variant="outline"
                      onClick={handleOpenStripeDashboard}
                      disabled={stripeDashboardLoading}
                    >
                      {stripeDashboardLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                      Open Stripe dashboard
                    </Button>
                  ) : null}
                  {billingStatus?.stripeConnectAccountId ? (
                    <Button
                      variant="outline"
                      onClick={() => setDisconnectStripeOpen(true)}
                      disabled={stripeDisconnectLoading}
                    >
                      {stripeDisconnectLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Disconnect Stripe
                    </Button>
                  ) : null}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={disconnectStripeOpen} onOpenChange={setDisconnectStripeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Stripe?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the current connected Stripe account from this business in Strata so you can reconnect the correct one. It does not delete the Stripe account itself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stripeDisconnectLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnectStripe} disabled={stripeDisconnectLoading}>
              {stripeDisconnectLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Disconnect Stripe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function SettingsPage() {
  const { user, businessId, membershipRole, permissions } = useOutletContext<AuthOutletContext>();
  const [activeTab, setActiveTab] = useState("profile");
  const [formData, setFormData] = useState<BusinessSettingsFormData>(DEFAULT_BUSINESS_SETTINGS_FORM);
  const [defaultTaxRateInput, setDefaultTaxRateInput] = useState(String(DEFAULT_BUSINESS_SETTINGS_FORM.defaultTaxRate));
  const [defaultAdminFeeInput, setDefaultAdminFeeInput] = useState(String(DEFAULT_BUSINESS_SETTINGS_FORM.defaultAdminFee));
  const [appointmentBufferInput, setAppointmentBufferInput] = useState(
    String(DEFAULT_BUSINESS_SETTINGS_FORM.appointmentBufferMinutes)
  );
  const [calendarBlockCapacityInput, setCalendarBlockCapacityInput] = useState(
    String(DEFAULT_BUSINESS_SETTINGS_FORM.calendarBlockCapacityPerSlot)
  );
  const [automationSettings, setAutomationSettings] = useState<AutomationSettingsForm>(
    DEFAULT_AUTOMATION_SETTINGS
  );
  const [appointmentReminderHoursInput, setAppointmentReminderHoursInput] = useState(
    String(DEFAULT_AUTOMATION_SETTINGS.appointmentReminderHours)
  );
  const [reviewRequestDelayHoursInput, setReviewRequestDelayHoursInput] = useState(
    String(DEFAULT_AUTOMATION_SETTINGS.reviewRequestDelayHours)
  );
  const [lapsedClientMonthsInput, setLapsedClientMonthsInput] = useState(
    String(DEFAULT_AUTOMATION_SETTINGS.lapsedClientMonths)
  );
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettingsForm>(
    DEFAULT_INTEGRATION_SETTINGS
  );
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationRecord | null>(null);
  const [deleteLocationId, setDeleteLocationId] = useState<string | null>(null);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffRecord | null>(null);
  const [deleteStaffId, setDeleteStaffId] = useState<string | null>(null);
  const [manualInviteLink, setManualInviteLink] = useState<{ email: string; url: string } | null>(null);
  const [locForm, setLocForm] = useState({
    name: "",
    address: "",
    phone: "",
    timezone: "",
    active: true,
  });
  const [staffForm, setStaffForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "technician",
    active: true,
    customPermissions: getDefaultPermissionSelection("technician"),
  });
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeErrorEntry[]>([]);
  const [reliabilityDiagnostics, setReliabilityDiagnostics] = useState<ReliabilityDiagnosticEntry[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    status: "idle",
    message: "Not checked yet.",
    checkedAt: null,
  });
  const canManageTeam =
    permissions.has("team.write") ||
    membershipRole === "owner" ||
    membershipRole === "admin" ||
    membershipRole === "manager";
  const canEditSettings = permissions.has("settings.write");
  const canViewDiagnostics = membershipRole === "owner" || membershipRole === "admin" || permissions.has("settings.write");

  const [{ data: business, fetching: businessFetching }] = useFindOne(api.business, businessId ?? "", {
    pause: !businessId,
  });

  const [{ fetching: saving }, update] = useAction(api.business.update);
  const [{ data: locations, fetching: locationsFetching }, refetchLocations] = useFindMany(api.location, {
    filter: business?.id ? { businessId: { equals: business.id } } : undefined,
    select: { id: true, name: true, address: true, phone: true, timezone: true, active: true },
    sort: { name: "Ascending" },
    first: 50,
    pause: !business?.id,
  } as any);
  const [{ fetching: savingLocation }, saveLocation] = useAction(api.location.create);
  const [{ fetching: updatingLocation }, updateLocation] = useAction(api.location.update);
  const [{ fetching: deletingLocation }, deleteLocation] = useAction(api.location.delete);
  const [{ data: teamMembers, fetching: teamFetching }, refetchTeam] = useFindMany(api.staff, {
    first: 100,
    pause: !businessId,
  });
  const [{ fetching: savingStaff }, saveStaff] = useAction(api.staff.create);
  const [{ fetching: updatingStaff }, updateStaff] = useAction(api.staff.update);
  const [{ fetching: deletingStaff }, deleteStaff] = useAction(api.staff.delete);
  const [{ fetching: resendingStaffInvite }, resendStaffInvite] = useAction(api.staff.resendInvite);
  const [{ fetching: copyingStaffInvite }, getStaffInviteLink] = useAction(api.staff.inviteLink);
  const [{ data: presetSummary }, getBusinessPreset] = useAction(api.getBusinessPreset);
  const [{ fetching: applyingPreset }, applyBusinessPreset] = useAction(api.applyBusinessPreset);
  const [{ fetching: runningAutomationsNow }, runAutomationsNow] = useAction(api.runAutomationsNow);
  const preset = presetSummary as BusinessPresetActionResult | undefined;
  const presetServiceCount = preset?.count ?? 0;
  const presetPreviewNames = preset?.names?.slice(0, 4) ?? [];
  const presetHasRecommendations = presetServiceCount > 0;

  useEffect(() => {
    if (!business) return;

    const next = businessSettingsFormFromSource(business);
    setFormData(next.formData);
    setDefaultTaxRateInput(next.defaultTaxRateInput);
    setDefaultAdminFeeInput(next.defaultAdminFeeInput);
    setAppointmentBufferInput(next.appointmentBufferInput);
    setCalendarBlockCapacityInput(next.calendarBlockCapacityInput);
    const nextAutomationSettings: AutomationSettingsForm = {
      appointmentRemindersEnabled: business.automationAppointmentRemindersEnabled ?? DEFAULT_AUTOMATION_SETTINGS.appointmentRemindersEnabled,
      appointmentReminderHours: business.automationAppointmentReminderHours ?? DEFAULT_AUTOMATION_SETTINGS.appointmentReminderHours,
      reviewRequestsEnabled: business.automationReviewRequestsEnabled ?? DEFAULT_AUTOMATION_SETTINGS.reviewRequestsEnabled,
      reviewRequestDelayHours: business.automationReviewRequestDelayHours ?? DEFAULT_AUTOMATION_SETTINGS.reviewRequestDelayHours,
      lapsedClientsEnabled: business.automationLapsedClientsEnabled ?? DEFAULT_AUTOMATION_SETTINGS.lapsedClientsEnabled,
      lapsedClientMonths: business.automationLapsedClientMonths ?? DEFAULT_AUTOMATION_SETTINGS.lapsedClientMonths,
    };
    setAutomationSettings(nextAutomationSettings);
    setAppointmentReminderHoursInput(String(nextAutomationSettings.appointmentReminderHours));
    setReviewRequestDelayHoursInput(String(nextAutomationSettings.reviewRequestDelayHours));
    setLapsedClientMonthsInput(String(nextAutomationSettings.lapsedClientMonths));
    setIntegrationSettings({
      webhookEnabled: business.integrationWebhookEnabled ?? DEFAULT_INTEGRATION_SETTINGS.webhookEnabled,
      webhookUrl: business.integrationWebhookUrl ?? "",
      webhookSecret: business.integrationWebhookSecret ?? "",
      webhookEvents:
        Array.isArray(business.integrationWebhookEvents) && business.integrationWebhookEvents.length > 0
          ? business.integrationWebhookEvents
          : DEFAULT_INTEGRATION_SETTINGS.webhookEvents,
    });
  }, [business]);

  useEffect(() => {
    if (!businessId) return;
    void getBusinessPreset();
  }, [businessId, getBusinessPreset]);

  useEffect(() => {
    if (!canViewDiagnostics) return;
    const syncErrors = () => setRuntimeErrors(listRuntimeErrors());
    const syncReliability = () => setReliabilityDiagnostics(listReliabilityDiagnostics());
    const runtimeEventName = getRuntimeErrorsEventName();
    const reliabilityEventName = getReliabilityDiagnosticsEventName();
    syncErrors();
    syncReliability();
    window.addEventListener("focus", syncErrors);
    window.addEventListener("focus", syncReliability);
    window.addEventListener(runtimeEventName, syncErrors as EventListener);
    window.addEventListener(reliabilityEventName, syncReliability as EventListener);
    return () => {
      window.removeEventListener("focus", syncErrors);
      window.removeEventListener("focus", syncReliability);
      window.removeEventListener(runtimeEventName, syncErrors as EventListener);
      window.removeEventListener(reliabilityEventName, syncReliability as EventListener);
    };
  }, [canViewDiagnostics]);

  useEffect(() => {
    if (!canViewDiagnostics) return;
    let cancelled = false;
    const run = async () => {
      setSystemStatus((current) => ({ ...current, status: "checking", message: "Checking API reachability..." }));
      try {
        const response = await fetch(`${API_BASE}/api/health`);
        if (!response.ok) {
          throw new Error(`Health check returned ${response.status}`);
        }
        const payload = (await response.json()) as { ok?: boolean };
        if (cancelled) return;
        setSystemStatus({
          status: payload?.ok ? "healthy" : "degraded",
          message: payload?.ok ? "API is reachable and responding." : "Health endpoint responded unexpectedly.",
          checkedAt: Date.now(),
        });
      } catch (error) {
        if (cancelled) return;
        setSystemStatus({
          status: "degraded",
          message: error instanceof Error ? error.message : "Could not reach the API health endpoint.",
          checkedAt: Date.now(),
        });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [canViewDiagnostics]);

  const handleFieldChange = (field: keyof BusinessSettingsFormData, value: string | number | boolean) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const normalizeAppointmentBufferInput = (value: string) => {
    const next = normalizeAppointmentBuffer(value);
    setAppointmentBufferInput(next.inputValue);
    handleFieldChange("appointmentBufferMinutes", next.numericValue);
  };

  const normalizeCalendarBlockCapacityInput = (value: string) => {
    const parsed = Number.parseInt(value.trim(), 10);
    const numericValue = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 12) : 1;
    setCalendarBlockCapacityInput(String(numericValue));
    handleFieldChange("calendarBlockCapacityPerSlot", numericValue);
  };

  const normalizeDefaultTaxRateInput = (value: string) => {
    const next = normalizeDecimalInput(value);
    setDefaultTaxRateInput(next.inputValue);
    handleFieldChange("defaultTaxRate", next.numericValue);
  };

  const normalizeDefaultAdminFeeInput = (value: string) => {
    const next = normalizeDecimalInput(value);
    setDefaultAdminFeeInput(next.inputValue);
    handleFieldChange("defaultAdminFee", next.numericValue);
  };

  const handleAutomationToggle = (field: keyof AutomationSettingsForm, value: boolean) => {
    setAutomationSettings((current) => ({ ...current, [field]: value }));
  };

  const handleAutomationNumberInput = (
    field: "appointmentReminderHours" | "reviewRequestDelayHours" | "lapsedClientMonths",
    value: string
  ) => {
    const trimmed = value.trim();
    const parsed = Number.parseInt(trimmed, 10);
    const nextValue = Number.isFinite(parsed) ? parsed : 0;
    setAutomationSettings((current) => ({ ...current, [field]: nextValue }));
  };

  const normalizeAutomationNumberInput = (
    field: "appointmentReminderHours" | "reviewRequestDelayHours" | "lapsedClientMonths"
  ) => {
    setAutomationSettings((current) => {
      const rawValue = current[field];
      const minimum = field === "lapsedClientMonths" ? 1 : 1;
      const maximum = field === "lapsedClientMonths" ? 36 : 336;
      const nextValue = Number.isFinite(rawValue) ? Math.min(Math.max(rawValue, minimum), maximum) : minimum;
      if (field === "appointmentReminderHours") {
        setAppointmentReminderHoursInput(String(nextValue));
      } else if (field === "reviewRequestDelayHours") {
        setReviewRequestDelayHoursInput(String(nextValue));
      } else {
        setLapsedClientMonthsInput(String(nextValue));
      }
      return { ...current, [field]: nextValue };
    });
  };

  const toggleWebhookEvent = (eventName: string, enabled: boolean) => {
    setIntegrationSettings((current) => {
      const nextEvents = new Set(current.webhookEvents);
      if (enabled) {
        nextEvents.add(eventName);
      } else {
        nextEvents.delete(eventName);
      }
      return { ...current, webhookEvents: Array.from(nextEvents).sort() };
    });
  };

  const generateWebhookSecret = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      setIntegrationSettings((current) => ({
        ...current,
        webhookSecret: `strata_${crypto.randomUUID().replace(/-/g, "")}`,
      }));
      return;
    }
    setIntegrationSettings((current) => ({
      ...current,
      webhookSecret: `strata_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    }));
  };

  const handleSaveAutomationSettings = async () => {
    if (!business?.id) return;
    await update({
      id: business.id,
      automationAppointmentRemindersEnabled: automationSettings.appointmentRemindersEnabled,
      automationAppointmentReminderHours: automationSettings.appointmentReminderHours,
      automationReviewRequestsEnabled: automationSettings.reviewRequestsEnabled,
      automationReviewRequestDelayHours: automationSettings.reviewRequestDelayHours,
      automationLapsedClientsEnabled: automationSettings.lapsedClientsEnabled,
      automationLapsedClientMonths: automationSettings.lapsedClientMonths,
    });
    toast.success("Automation settings saved");
  };

  const handleSaveIntegrationSettings = async () => {
    if (!business?.id) return;
    await update({
      id: business.id,
      integrationWebhookEnabled: integrationSettings.webhookEnabled,
      integrationWebhookUrl: integrationSettings.webhookUrl.trim() || null,
      integrationWebhookSecret: integrationSettings.webhookSecret.trim() || null,
      integrationWebhookEvents: integrationSettings.webhookEvents,
    });
    toast.success("Integration settings saved");
  };

  const handleRunAutomationsNow = async (kinds?: AutomationKind[]) => {
    const result = (await runAutomationsNow({ kinds })) as RunAutomationsResult;
    toast.success(
      `Automations finished: ${result.appointmentRemindersSent} reminders, ${result.reviewRequestsSent} reviews, ${result.lapsedClientsDetected} lapsed outreach.`
    );
  };

  const openCreateLocation = () => {
    setEditingLocation(null);
    setLocForm({ name: "", address: "", phone: "", timezone: "", active: true });
    setLocationDialogOpen(true);
  };

  const openEditLocation = (location: LocationRecord) => {
    setEditingLocation(location);
    setLocForm({
      name: location.name ?? "",
      address: location.address ?? "",
      phone: location.phone ?? "",
      timezone: location.timezone ?? "",
      active: location.active ?? true,
    });
    setLocationDialogOpen(true);
  };

  const openCreateTeamMember = () => {
    setEditingStaff(null);
    setStaffForm({
      firstName: "",
      lastName: "",
      email: "",
      role: "technician",
      active: true,
      customPermissions: getDefaultPermissionSelection("technician"),
    });
    setTeamDialogOpen(true);
  };

  const openEditTeamMember = (teamMember: StaffRecord) => {
    setEditingStaff(teamMember);
    setStaffForm({
      firstName: teamMember.firstName ?? "",
      lastName: teamMember.lastName ?? "",
      email: teamMember.email ?? "",
      role: teamMember.membershipRole ?? teamMember.role ?? "technician",
      active: teamMember.active ?? true,
      customPermissions: normalizePermissionSelection(
        teamMember.effectivePermissions ?? getDefaultPermissionSelection(teamMember.membershipRole ?? teamMember.role ?? "technician")
      ),
    });
    setTeamDialogOpen(true);
  };

  const handleSaveLocation = async () => {
    if (!locForm.name.trim() || !business?.id) return;

    if (editingLocation) {
      await updateLocation({
        id: editingLocation.id,
        name: locForm.name.trim(),
        address: locForm.address || null,
        phone: locForm.phone || null,
        timezone: locForm.timezone || null,
        active: locForm.active,
      });
    } else {
      await saveLocation({
        name: locForm.name.trim(),
        address: locForm.address || null,
        phone: locForm.phone || null,
        timezone: locForm.timezone || null,
        active: locForm.active,
        business: { _link: business.id },
      });
    }

    setLocationDialogOpen(false);
    refetchLocations();
    toast.success(editingLocation ? "Location updated" : "Location created");
  };

  const handleDeleteLocation = async () => {
    if (!deleteLocationId) return;
    await deleteLocation({ id: deleteLocationId });
    setDeleteLocationId(null);
    refetchLocations();
    toast.success("Location deleted");
  };

  const handleSaveStaff = async () => {
    if (!staffForm.firstName.trim() || !staffForm.lastName.trim()) return;
    const result = editingStaff
        ? await updateStaff({
            id: editingStaff.id,
            firstName: staffForm.firstName.trim(),
            lastName: staffForm.lastName.trim(),
            email: staffForm.email.trim() || null,
            role: staffForm.role,
            active: staffForm.active,
            status: staffForm.active ? "active" : "suspended",
            customPermissions: normalizePermissionSelection(staffForm.customPermissions),
          })
        : await saveStaff({
            firstName: staffForm.firstName.trim(),
            lastName: staffForm.lastName.trim(),
            email: staffForm.email.trim() || undefined,
            role: staffForm.role,
            active: staffForm.active,
            customPermissions: normalizePermissionSelection(staffForm.customPermissions),
          });

    if (result.error) {
      toast.error(result.error.message ?? "Could not save team member.");
      return;
    }

    setTeamDialogOpen(false);
    setEditingStaff(null);
    refetchTeam();

    const savedRecord = result.data as StaffRecord | null;
    if (savedRecord?.inviteDelivery === "sent") {
      if (savedRecord.membershipStatus === "invited") {
        toast.success(editingStaff ? "Team member updated and invite email sent" : "Team member added and invite email sent");
      } else {
        toast.success(editingStaff ? "Team member updated and access email sent" : "Team member added and access email sent");
      }
      return;
    }

    if (savedRecord?.inviteDelivery === "not_configured") {
      if (savedRecord.membershipStatus === "invited") {
        toast.warning(
          editingStaff
            ? "Team member updated, but invite email could not be sent because transactional email is not configured"
            : "Team member added, but invite email could not be sent because transactional email is not configured"
        );
      } else {
        toast.warning(
          editingStaff
            ? "Team member updated, but access email could not be sent because transactional email is not configured"
            : "Team member added, but access email could not be sent because transactional email is not configured"
        );
      }
      return;
    }

    toast.success(editingStaff ? "Team member updated" : "Team member added");
  };

  const handleDeleteStaff = async () => {
    if (!deleteStaffId) return;
    const result = await deleteStaff({ id: deleteStaffId });
    if (result.error) {
      toast.error(result.error.message ?? "Could not remove team member.");
      return;
    }
    setDeleteStaffId(null);
    refetchTeam();
    toast.success("Team member removed");
  };

  const handleResendStaffInvite = async (teamMember: StaffRecord) => {
    const result = await resendStaffInvite({ id: teamMember.id });
    if (result.error) {
      toast.error(result.error.message ?? "Could not resend team invite.");
      return;
    }
    const inviteDelivery = (result.data as { inviteDelivery?: string } | null)?.inviteDelivery;
    if (inviteDelivery === "sent") {
      toast.success("Invite email resent");
    } else if (inviteDelivery === "not_configured") {
      toast.warning("Invite could not be emailed because transactional email is not configured");
    } else {
      toast.success("Invite processed");
    }
  };

  const handleCopyStaffInviteLink = async (teamMember: StaffRecord) => {
    const result = await getStaffInviteLink({ id: teamMember.id });
    if (result.error) {
      toast.error(result.error.message ?? "Could not create invite link.");
      return;
    }

    const inviteUrl = (result.data as { inviteUrl?: string } | null)?.inviteUrl;
    if (!inviteUrl) {
      toast.error("Invite link was not returned.");
      return;
    }

    try {
      const copied = await copyTextWithFallback(inviteUrl);
      if (!copied) {
        setManualInviteLink({
          email: teamMember.email ?? (result.data as { inviteEmail?: string } | null)?.inviteEmail ?? "Team member",
          url: inviteUrl,
        });
        toast.message("Invite link ready to copy manually.");
        return;
      }
      toast.success("Invite link copied");
    } catch {
      setManualInviteLink({
        email: teamMember.email ?? (result.data as { inviteEmail?: string } | null)?.inviteEmail ?? "Team member",
        url: inviteUrl,
      });
      toast.message("Invite link ready to copy manually.");
    }
  };

  const handleStaffRoleChange = (role: string) => {
    setStaffForm((current) => ({
      ...current,
      role,
      customPermissions: getDefaultPermissionSelection(role),
    }));
  };

  const toggleStaffPermission = (permission: string, enabled: boolean) => {
    setStaffForm((current) => {
      const next = new Set(current.customPermissions);
      if (enabled) {
        next.add(permission);
      } else {
        next.delete(permission);
        for (const group of TEAM_PERMISSION_GROUPS) {
          if (group.write === permission || group.read === permission) {
            next.delete(group.write);
          }
        }
      }

      for (const group of TEAM_PERMISSION_GROUPS) {
        if (group.write && next.has(group.write)) {
          next.add(group.read);
        }
        if (group.write === permission && !enabled) {
          next.delete(group.write);
        }
      }

      return {
        ...current,
        customPermissions: Array.from(next).sort(),
      };
    });
  };

  const handleSave = async () => {
    if (!business?.id) {
      toast.error("No business found to save.");
      return;
    }

    try {
      await update({
        id: business.id,
        name: formData.name,
        type: formData.type as any,
        phone: formData.phone || null,
        email: formData.email || null,
        address: formData.address || null,
        city: formData.city || null,
        state: formData.state || null,
        zip: formData.zip || null,
        defaultTaxRate: formData.defaultTaxRate,
        defaultAdminFee: formData.defaultAdminFee,
        defaultAdminFeeEnabled: formData.defaultAdminFeeEnabled,
        currency: formData.currency || "USD",
        appointmentBufferMinutes: formData.appointmentBufferMinutes,
        calendarBlockCapacityPerSlot: formData.calendarBlockCapacityPerSlot,
        timezone: formData.timezone || null,
      });
      await getBusinessPreset();
      toast.success("Settings saved successfully.");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save settings. Please try again.");
    }
  };

  const handleApplyPreset = async () => {
    try {
      const result = await applyBusinessPreset();
      await getBusinessPreset();
      const payload = result.data as ApplyBusinessPresetResult | null | undefined;
      if (!payload) {
        toast.error("Could not apply starter services.");
        return;
      }
      if (payload.ok === false) {
        toast.warning(payload.message);
        return;
      }
      if (payload.fullyApplied === false) {
        toast.warning(
          `Starter services partially applied (${payload.appliedCount ?? 0}/${payload.expectedCount ?? 0}). Refresh Services and retry once the current deploy finishes.`
        );
        return;
      }
      if ((payload.created ?? 0) > 0) {
        toast.success(`Added ${payload.created} starter services`);
      } else {
        toast.success("Starter services are already applied");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply starter services.");
    }
  };

  const handleClearDiagnostics = () => {
    clearRuntimeErrors();
    clearReliabilityDiagnostics();
    setRuntimeErrors([]);
    setReliabilityDiagnostics([]);
    toast.success("Diagnostics cleared");
  };

  const handleRefreshSystemStatus = async () => {
    setSystemStatus((current) => ({ ...current, status: "checking", message: "Checking API reachability..." }));
    try {
      const response = await fetch(`${API_BASE}/api/health`);
      if (!response.ok) {
        throw new Error(`Health check returned ${response.status}`);
      }
      const payload = (await response.json()) as { ok?: boolean };
      setSystemStatus({
        status: payload?.ok ? "healthy" : "degraded",
        message: payload?.ok ? "API is reachable and responding." : "Health endpoint responded unexpectedly.",
        checkedAt: Date.now(),
      });
    } catch (error) {
      setSystemStatus({
        status: "degraded",
        message: error instanceof Error ? error.message : "Could not reach the API health endpoint.",
        checkedAt: Date.now(),
      });
    }
  };

  if (businessFetching) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <>
      <div className="page-content page-section max-w-5xl pb-28 sm:pb-8">
        <PageHeader
          title="Settings"
          subtitle="Set up your shop, team, starter services, billing, and diagnostics without digging through separate tools."
          badge={
            business?.name ? (
              <Badge variant="outline" className="hidden sm:inline-flex">
                {business.name}
              </Badge>
            ) : undefined
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex h-auto w-full gap-2 overflow-x-auto bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-6 sm:overflow-visible">
            <TabsTrigger
              value="profile"
              className="min-w-[152px] justify-start rounded-lg border border-border bg-background px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5 sm:min-w-0"
            >
              Business Profile
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="min-w-[152px] justify-start rounded-lg border border-border bg-background px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5 sm:min-w-0"
            >
              Billing
            </TabsTrigger>
            <TabsTrigger
              value="locations"
              className="min-w-[152px] justify-start rounded-lg border border-border bg-background px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5 sm:min-w-0"
            >
              Locations
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="min-w-[152px] justify-start rounded-lg border border-border bg-background px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5 sm:min-w-0"
            >
              Team
            </TabsTrigger>
            <TabsTrigger
              value="integrations"
              className="min-w-[152px] justify-start rounded-lg border border-border bg-background px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5 sm:min-w-0"
            >
              Integrations
            </TabsTrigger>
            <TabsTrigger
              value="automations"
              className="min-w-[152px] justify-start rounded-lg border border-border bg-background px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5 sm:min-w-0"
            >
              Automations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Business Information</CardTitle>
                <CardDescription>
                  Your shop&apos;s core details shown on invoices and client-facing communications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">Starter service preset</p>
                        <Badge variant={presetHasRecommendations ? "secondary" : "outline"}>
                          {presetServiceCount} recommended
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatBusinessPresetLabel(preset?.group ?? formData.type)} catalog. Use this to load or refresh the recommended starter services for this shop type.
                      </p>
                      {presetPreviewNames.length ? (
                        <p className="text-xs text-muted-foreground">
                          Includes {presetPreviewNames.join(", ")}
                          {presetServiceCount > presetPreviewNames.length ? `, and ${presetServiceCount - presetPreviewNames.length} more.` : "."}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyPreset}
                      disabled={!canEditSettings || applyingPreset || !business?.id}
                      className="w-full sm:w-auto"
                    >
                      {applyingPreset ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Apply starter services
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">
                      Business Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleFieldChange("name", e.target.value)}
                      placeholder="e.g. Elite Auto Detailing"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="type">Business Type</Label>
                    <Select value={formData.type} onValueChange={(value) => handleFieldChange("type", value)}>
                      <SelectTrigger id="type">
                        <SelectValue placeholder="Select a type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {BUSINESS_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleFieldChange("phone", e.target.value)}
                      placeholder="(555) 000-0000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleFieldChange("email", e.target.value)}
                      placeholder="hello@yourbusiness.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
                  <div className="space-y-1.5 md:col-span-3">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleFieldChange("address", e.target.value)}
                      placeholder="123 Main St"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleFieldChange("city", e.target.value)}
                      placeholder="Los Angeles"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-1">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => handleFieldChange("state", e.target.value)}
                      placeholder="CA"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="zip">ZIP Code</Label>
                    <Input
                      id="zip"
                      value={formData.zip}
                      onChange={(e) => handleFieldChange("zip", e.target.value)}
                      placeholder="90001"
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="defaultTaxRate">Default Tax Rate</Label>
                    <div className="flex">
                      <Input
                        id="defaultTaxRate"
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        className="rounded-r-none"
                        value={defaultTaxRateInput}
                        onChange={(e) => {
                          setDefaultTaxRateInput(e.target.value);
                          const parsed = parseDecimalDraft(e.target.value);
                          if (parsed != null) {
                            handleFieldChange("defaultTaxRate", parsed);
                          }
                        }}
                        onBlur={(e) => normalizeDefaultTaxRateInput(e.target.value)}
                      />
                      <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="defaultAdminFee">Default Admin Fee</Label>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="defaultAdminFeeEnabled" className="text-xs text-muted-foreground">
                          Auto-add by default
                        </Label>
                        <Switch
                          id="defaultAdminFeeEnabled"
                          checked={formData.defaultAdminFeeEnabled}
                          onCheckedChange={(value) => handleFieldChange("defaultAdminFeeEnabled", value)}
                        />
                      </div>
                    </div>
                    <div className="flex">
                      <Input
                        id="defaultAdminFee"
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        className="rounded-r-none"
                        value={defaultAdminFeeInput}
                        onChange={(e) => {
                          setDefaultAdminFeeInput(e.target.value);
                          const parsed = parseDecimalDraft(e.target.value);
                          if (parsed != null) {
                            handleFieldChange("defaultAdminFee", parsed);
                          }
                        }}
                        onBlur={(e) => normalizeDefaultAdminFeeInput(e.target.value)}
                      />
                      <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Prefills quotes and invoices with an adjustable admin fee percentage that can still be turned off per document.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="appointmentBufferMinutes">Appointment Buffer</Label>
                    <div className="flex">
                      <Input
                        id="appointmentBufferMinutes"
                        type="number"
                        min={0}
                        step={5}
                        className="rounded-r-none"
                        value={appointmentBufferInput}
                        onChange={(e) => {
                          setAppointmentBufferInput(e.target.value);
                          const parsed = parseAppointmentBufferDraft(e.target.value);
                          if (parsed != null) {
                            handleFieldChange("appointmentBufferMinutes", parsed);
                          }
                        }}
                        onBlur={(e) => normalizeAppointmentBufferInput(e.target.value)}
                      />
                      <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                        min
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="calendarBlockCapacityPerSlot">Appointments Per Time Slot</Label>
                    <div className="flex">
                      <Input
                        id="calendarBlockCapacityPerSlot"
                        type="number"
                        min={1}
                        max={12}
                        step={1}
                        className="rounded-r-none"
                        value={calendarBlockCapacityInput}
                        onChange={(e) => {
                          setCalendarBlockCapacityInput(e.target.value);
                          const parsed = Number.parseInt(e.target.value, 10);
                          if (Number.isFinite(parsed) && parsed > 0) {
                            handleFieldChange("calendarBlockCapacityPerSlot", Math.min(parsed, 12));
                          }
                        }}
                        onBlur={(e) => normalizeCalendarBlockCapacityInput(e.target.value)}
                      />
                      <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                        max
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Controls how many appointments can share the same time slot before Strata blocks another booking.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select value={formData.timezone} onValueChange={(value) => handleFieldChange("timezone", value)}>
                      <SelectTrigger id="timezone">
                        <SelectValue placeholder="Select timezone..." />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((timezone) => (
                          <SelectItem key={timezone.value} value={timezone.value}>
                            {timezone.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      value={formData.currency}
                      onChange={(e) => handleFieldChange("currency", e.target.value.toUpperCase())}
                      placeholder="USD"
                      maxLength={3}
                    />
                  </div>
                </div>

                <div className="hidden justify-end pt-2 sm:flex">
                  <Button onClick={handleSave} disabled={saving || !canEditSettings} className="w-full sm:w-auto sm:min-w-[130px]">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            {canViewDiagnostics ? (
              <Card>
                <CardHeader>
                  <CardTitle>System Status</CardTitle>
                  <CardDescription>
                    Quick reachability check for the current API and deployment context.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={systemStatus.status === "healthy" ? "default" : systemStatus.status === "degraded" ? "destructive" : "secondary"}>
                          {systemStatus.status === "healthy"
                            ? "Healthy"
                            : systemStatus.status === "degraded"
                              ? "Degraded"
                              : systemStatus.status === "checking"
                                ? "Checking"
                                : "Idle"}
                        </Badge>
                        {systemStatus.checkedAt ? (
                          <span className="text-xs text-muted-foreground">
                            Checked {new Date(systemStatus.checkedAt).toLocaleTimeString()}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm font-medium">{systemStatus.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        API base: {API_BASE || "same-origin /api"} {businessId ? "- Business context loaded" : "- No business context"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => void handleRefreshSystemStatus()}
                      disabled={systemStatus.status === "checking"}
                    >
                      {systemStatus.status === "checking" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Recheck
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background p-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Server className="h-4 w-4 text-primary" />
                        API health
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Confirms whether this browser can currently reach the backend health endpoint.
                      </p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Settings className="h-4 w-4 text-primary" />
                        Client diagnostics
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Use the diagnostics cards below to inspect browser crashes, failed requests, auth expiry, and parse errors without opening devtools.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {canViewDiagnostics ? (
              <Card>
                <CardHeader>
                  <CardTitle>Reliability Diagnostics</CardTitle>
                  <CardDescription>
                    Recent request failures, auth invalidations, and malformed-response events captured in this browser session.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {reliabilityDiagnostics.length > 0
                          ? `${reliabilityDiagnostics.length} reliability issue${reliabilityDiagnostics.length === 1 ? "" : "s"} captured`
                          : "No reliability issues captured"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        This log is designed to catch the failures users feel most: broken API calls, session drops, invalid JSON, and false-success risk.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={handleClearDiagnostics}
                      disabled={runtimeErrors.length === 0 && reliabilityDiagnostics.length === 0}
                    >
                      Clear diagnostics
                    </Button>
                  </div>
                  {reliabilityDiagnostics.length === 0 ? null : (
                    <div className="space-y-3">
                      {reliabilityDiagnostics.map((entry) => (
                        <div key={entry.id} className="rounded-lg border bg-background p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={entry.severity === "error" ? "destructive" : "secondary"}>
                                  {entry.source}
                                </Badge>
                                {entry.status ? (
                                  <Badge variant="outline">HTTP {entry.status}</Badge>
                                ) : null}
                                {entry.method ? (
                                  <Badge variant="outline">{entry.method}</Badge>
                                ) : null}
                                <span className="text-xs text-muted-foreground">
                                  {new Date(entry.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <p className="break-words text-sm font-medium">{entry.message}</p>
                              {entry.path ? (
                                <p className="break-all text-xs text-muted-foreground">{entry.path}</p>
                              ) : null}
                            </div>
                          </div>
                          {entry.detail ? (
                            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                              <code>{entry.detail}</code>
                            </pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
            {canViewDiagnostics ? (
              <Card>
                <CardHeader>
                  <CardTitle>Runtime Diagnostics</CardTitle>
                  <CardDescription>
                    Recent browser-side crashes and unhandled promise failures captured during this session.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {runtimeErrors.length > 0
                          ? `${runtimeErrors.length} runtime issue${runtimeErrors.length === 1 ? "" : "s"} captured`
                          : "No runtime issues captured"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Refresh this page after reproducing a bug to review the latest client-side failures without opening devtools.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={handleClearDiagnostics}
                      disabled={runtimeErrors.length === 0 && reliabilityDiagnostics.length === 0}
                    >
                      Clear diagnostics
                    </Button>
                  </div>
                  {runtimeErrors.length === 0 ? null : (
                    <div className="space-y-3">
                      {runtimeErrors.map((entry) => (
                        <div key={entry.id} className="rounded-lg border bg-background p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">{entry.source}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(entry.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <p className="break-words text-sm font-medium">{entry.message}</p>
                              <p className="break-all text-xs text-muted-foreground">{entry.path}</p>
                            </div>
                          </div>
                          {entry.detail ? (
                            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                              <code>{entry.detail}</code>
                            </pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
            <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden">
              <div className="mx-auto max-w-4xl">
                <Button onClick={handleSave} disabled={saving || !canEditSettings} className="w-full">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="locations" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle>Locations</CardTitle>
                    <CardDescription className="mt-1">
                      Manage your shop locations. Assign staff and appointments to specific locations.
                    </CardDescription>
                  </div>
                  <Button onClick={openCreateLocation} size="sm" className="w-full sm:w-auto" disabled={!canEditSettings}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Location
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {locationsFetching ? (
                  <div className="py-4 text-sm text-muted-foreground">Loading locations...</div>
                ) : !locations || locations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                    <MapPin className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm font-medium">No locations yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add your first shop location to get started.
                    </p>
                    <Button variant="outline" size="sm" className="mt-4 w-full sm:w-auto" onClick={openCreateLocation} disabled={!canEditSettings}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Location
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {locations.map((location: LocationRecord) => (
                      <div
                        key={location.id}
                        className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`rounded-md p-1.5 ${location.active !== false ? "bg-green-100" : "bg-gray-100"}`}>
                            <MapPin className={`h-4 w-4 ${location.active !== false ? "text-green-600" : "text-gray-400"}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{location.name}</p>
                            <p className="break-words text-xs text-muted-foreground">
                              {[location.address, location.phone].filter(Boolean).join(" - ") || "No address set"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 sm:justify-end">
                          {location.active === false ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Inactive
                            </span>
                          ) : (
                            <span />
                          )}
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEditLocation(location)} disabled={!canEditSettings}>
                              <PenLine className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteLocationId(location.id)}
                              disabled={!canEditSettings}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle>Team &amp; Roles</CardTitle>
                    <CardDescription className="mt-1">
                      Manage the people who run the shop, assign responsibilities, and control access by role.
                    </CardDescription>
                  </div>
                  <Button onClick={openCreateTeamMember} size="sm" className="w-full sm:w-auto" disabled={!canManageTeam}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Team Member
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!canManageTeam ? (
                  <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                    Your current role can view team members but cannot change team access.
                  </div>
                ) : null}
                {teamFetching ? (
                  <div className="py-4 text-sm text-muted-foreground">Loading team members...</div>
                ) : !teamMembers || teamMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                    <Shield className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm font-medium">No team members yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add technicians, advisors, and managers so the shop can scale beyond one owner.
                    </p>
                    <Button variant="outline" size="sm" className="mt-4 w-full sm:w-auto" onClick={openCreateTeamMember} disabled={!canManageTeam}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Team Member
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(teamMembers as StaffRecord[]).map((teamMember) => {
                      const accessState = getStaffAccessState(teamMember);
                      return (
                        <div
                          key={teamMember.id}
                          className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="rounded-md bg-primary/10 p-1.5">
                              <Shield className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {`${teamMember.firstName ?? ""} ${teamMember.lastName ?? ""}`.trim() || "Unnamed team member"}
                              </p>
                              <p className="break-words text-xs text-muted-foreground">
                                {teamMember.email || "No login email"} - {(teamMember.membershipRole ?? teamMember.role ?? "technician").replace(/_/g, " ")}
                              </p>
                              {accessState.helperText ? (
                                <p className="mt-1 text-xs text-muted-foreground">{accessState.helperText}</p>
                              ) : null}
                              <p className="mt-1 text-xs text-muted-foreground">{getStaffPermissionSummary(teamMember)}</p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 sm:min-w-[260px] sm:items-end">
                            <div className="flex items-center justify-start sm:justify-end">
                              <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${accessState.badgeClassName}`}>
                                {accessState.label}
                              </Badge>
                            </div>
                              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                {accessState.status === "invited" && teamMember.email ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-9 w-full sm:w-auto"
                                      onClick={() => handleCopyStaffInviteLink(teamMember)}
                                      disabled={!canManageTeam || copyingStaffInvite}
                                    >
                                      {copyingStaffInvite ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                      Copy invite link
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-9 w-full sm:w-auto"
                                      onClick={() => handleResendStaffInvite(teamMember)}
                                      disabled={!canManageTeam || resendingStaffInvite}
                                    >
                                      {resendingStaffInvite ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                      Resend invite
                                    </Button>
                                  </>
                                ) : null}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  onClick={() => openEditTeamMember(teamMember)}
                                  disabled={!canManageTeam}
                                >
                                  <PenLine className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteStaffId(teamMember.id)}
                                  disabled={!canManageTeam || (teamMember.membershipRole ?? teamMember.role) === "owner"}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="integrations" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="mb-1 flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Cable className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle>Connected Tools</CardTitle>
                </div>
                <CardDescription>
                  Keep real connections and outbound hooks in one place so payments, analytics, and downstream systems stay easier to trust.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium">Stripe payments</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Connected-account payments, deposits, and billing status are managed from the billing tab.
                        </p>
                      </div>
                      <Badge variant={billingStatus?.stripeConnectReady ? "default" : "secondary"}>
                        {billingStatus?.stripeConnectReady ? "Connected" : billingStatus?.stripeConnectAccountId ? "Needs setup" : "Not connected"}
                      </Badge>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <Button variant="outline" className="w-full sm:w-auto" onClick={() => setActiveTab("billing")}>
                        Open billing controls
                      </Button>
                      {billingStatus?.stripeConnectAccountId ? (
                        <p className="self-center text-xs text-muted-foreground">
                          Account <span className="font-mono">{billingStatus.stripeConnectAccountId}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium">Site analytics</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Landing-page analytics are env-driven and live at the platform level, not per business workspace.
                        </p>
                      </div>
                      <Badge variant="outline">Platform</Badge>
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                      Google Analytics and Microsoft Clarity are configured in deployment env vars so marketing traffic stays separate from shop data.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Webhook className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Outbound webhooks</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Push core Strata events into Zapier, Make, internal tools, or a custom API with signed JSON payloads.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="webhook-enabled"
                        checked={integrationSettings.webhookEnabled}
                        onCheckedChange={(value) => setIntegrationSettings((current) => ({ ...current, webhookEnabled: value }))}
                        disabled={!canEditSettings}
                      />
                      <Label htmlFor="webhook-enabled" className="cursor-pointer text-sm">
                        Enable
                      </Label>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Webhook endpoint URL</Label>
                      <Input
                        type="url"
                        placeholder="https://example.com/strata/webhooks"
                        value={integrationSettings.webhookUrl}
                        onChange={(e) => setIntegrationSettings((current) => ({ ...current, webhookUrl: e.target.value }))}
                        disabled={!canEditSettings}
                      />
                      <p className="text-xs text-muted-foreground">
                        Strata sends JSON with headers <span className="font-mono">x-strata-event</span>, <span className="font-mono">x-strata-delivered-at</span>, and optional <span className="font-mono">x-strata-signature</span>.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Signing secret</Label>
                      <div className="flex gap-2">
                        <Input
                          value={integrationSettings.webhookSecret}
                          onChange={(e) => setIntegrationSettings((current) => ({ ...current, webhookSecret: e.target.value }))}
                          placeholder="Optional HMAC secret"
                          disabled={!canEditSettings}
                        />
                        <Button type="button" variant="outline" onClick={generateWebhookSecret} disabled={!canEditSettings}>
                          Generate
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Use this to verify webhook authenticity on your receiving service.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className="space-y-1">
                      <Label>Subscribed events</Label>
                      <p className="text-xs text-muted-foreground">
                        Pick only the events your downstream workflow needs so integrations stay readable and fast.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {WEBHOOK_EVENT_OPTIONS.map((eventOption) => {
                        const checked = integrationSettings.webhookEvents.includes(eventOption.value);
                        return (
                          <div key={eventOption.value} className="rounded-lg border bg-muted/20 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-medium">{eventOption.label}</p>
                                <p className="text-xs text-muted-foreground">{eventOption.helper}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  <span className="font-mono">{eventOption.value}</span>
                                </p>
                              </div>
                              <Switch
                                checked={checked}
                                onCheckedChange={(value) => toggleWebhookEvent(eventOption.value, value)}
                                disabled={!canEditSettings}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Webhooks are driven by real Strata activity events, so quote sends, invoice sends, payments, and appointment changes stay in sync automatically.
                    </p>
                    <Button
                      onClick={handleSaveIntegrationSettings}
                      disabled={!canEditSettings || saving}
                      className="w-full sm:w-auto"
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save integrations
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="automations" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="mb-1 flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle>Automations</CardTitle>
                </div>
                <CardDescription>
                  Let Strata handle the repeatable follow-through after booking, completion, and slow periods without hiding what will be sent.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <BellRing className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Appointment reminders</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Send confirmation reminders before scheduled or confirmed work so no-shows and confusion stay lower.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="automation-appointment-reminders"
                        checked={automationSettings.appointmentRemindersEnabled}
                        onCheckedChange={(value) => handleAutomationToggle("appointmentRemindersEnabled", value)}
                        disabled={!canEditSettings}
                      />
                      <Label htmlFor="automation-appointment-reminders" className="cursor-pointer text-sm">
                        Enable
                      </Label>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-end">
                    <div className="space-y-1.5">
                      <Label>Hours before appointment</Label>
                      <Input
                        inputMode="numeric"
                        value={appointmentReminderHoursInput}
                        onChange={(e) => {
                          setAppointmentReminderHoursInput(e.target.value);
                          handleAutomationNumberInput("appointmentReminderHours", e.target.value);
                        }}
                        onBlur={() => normalizeAutomationNumberInput("appointmentReminderHours")}
                        disabled={!canEditSettings}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => handleRunAutomationsNow(["appointment_reminders"])}
                      disabled={runningAutomationsNow}
                      className="w-full sm:w-auto"
                    >
                      {runningAutomationsNow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Run reminders now
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Review requests</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Follow up after completed work with an email asking for a review once the visit is fully wrapped.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="automation-review-requests"
                        checked={automationSettings.reviewRequestsEnabled}
                        onCheckedChange={(value) => handleAutomationToggle("reviewRequestsEnabled", value)}
                        disabled={!canEditSettings}
                      />
                      <Label htmlFor="automation-review-requests" className="cursor-pointer text-sm">
                        Enable
                      </Label>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-end">
                    <div className="space-y-1.5">
                      <Label>Hours after completion</Label>
                      <Input
                        inputMode="numeric"
                        value={reviewRequestDelayHoursInput}
                        onChange={(e) => {
                          setReviewRequestDelayHoursInput(e.target.value);
                          handleAutomationNumberInput("reviewRequestDelayHours", e.target.value);
                        }}
                        onBlur={() => normalizeAutomationNumberInput("reviewRequestDelayHours")}
                        disabled={!canEditSettings}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => handleRunAutomationsNow(["review_requests"])}
                      disabled={runningAutomationsNow}
                      className="w-full sm:w-auto"
                    >
                      {runningAutomationsNow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Run review requests now
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Lapsed client outreach</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Re-engage opted-in clients who have not been back in a while so slow periods have some built-in follow-up.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="automation-lapsed-clients"
                        checked={automationSettings.lapsedClientsEnabled}
                        onCheckedChange={(value) => handleAutomationToggle("lapsedClientsEnabled", value)}
                        disabled={!canEditSettings}
                      />
                      <Label htmlFor="automation-lapsed-clients" className="cursor-pointer text-sm">
                        Enable
                      </Label>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-end">
                    <div className="space-y-1.5">
                      <Label>Months since last visit</Label>
                      <Input
                        inputMode="numeric"
                        value={lapsedClientMonthsInput}
                        onChange={(e) => {
                          setLapsedClientMonthsInput(e.target.value);
                          handleAutomationNumberInput("lapsedClientMonths", e.target.value);
                        }}
                        onBlur={() => normalizeAutomationNumberInput("lapsedClientMonths")}
                        disabled={!canEditSettings}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => handleRunAutomationsNow(["lapsed_clients"])}
                      disabled={runningAutomationsNow}
                      className="w-full sm:w-auto"
                    >
                      {runningAutomationsNow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Run lapsed outreach now
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Automation sends are logged through the same notification and activity system as the rest of Strata, so follow-up is still traceable.
                  </p>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button
                      variant="outline"
                      onClick={() => handleRunAutomationsNow()}
                      disabled={runningAutomationsNow}
                      className="w-full sm:w-auto"
                    >
                      {runningAutomationsNow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Run enabled automations now
                    </Button>
                    <Button
                      onClick={handleSaveAutomationSettings}
                      disabled={!canEditSettings || saving}
                      className="w-full sm:w-auto"
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save automations
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="billing" className="space-y-6">
            <BillingTab
              billingStatus={billingStatus}
              setBillingStatus={setBillingStatus}
              billingPortalLoading={billingPortalLoading}
              setBillingPortalLoading={setBillingPortalLoading}
              membershipRole={membershipRole}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editingLocation ? "Edit Location" : "Add Location"}</DialogTitle>
            <DialogDescription>Enter the details for this shop location.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={locForm.name}
                onChange={(e) => setLocForm((current) => ({ ...current, name: e.target.value }))}
                placeholder="e.g. Downtown Shop"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={locForm.address}
                onChange={(e) => setLocForm((current) => ({ ...current, address: e.target.value }))}
                placeholder="123 Main St, City, ST"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={locForm.phone}
                onChange={(e) => setLocForm((current) => ({ ...current, phone: e.target.value }))}
                placeholder="(555) 000-0000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Select
                value={locForm.timezone}
                onValueChange={(value) => setLocForm((current) => ({ ...current, timezone: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((timezone) => (
                    <SelectItem key={timezone.value} value={timezone.value}>
                      {timezone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="loc-active"
                checked={locForm.active}
                onCheckedChange={(value) => setLocForm((current) => ({ ...current, active: value }))}
              />
              <Label htmlFor="loc-active" className="cursor-pointer">
                Active
              </Label>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setLocationDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleSaveLocation}
              disabled={savingLocation || updatingLocation || !locForm.name.trim()}
              className="w-full sm:w-auto"
            >
              {savingLocation || updatingLocation ? "Saving..." : "Save Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
            <DialogDescription>
              Create a role-based team roster for your advisors, managers, and technicians.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  First Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={staffForm.firstName}
                  onChange={(e) => setStaffForm((current) => ({ ...current, firstName: e.target.value }))}
                  placeholder="Alex"
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Last Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={staffForm.lastName}
                  onChange={(e) => setStaffForm((current) => ({ ...current, lastName: e.target.value }))}
                  placeholder="Morgan"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={staffForm.email}
                onChange={(e) => setStaffForm((current) => ({ ...current, email: e.target.value }))}
                placeholder="alex@shop.com"
              />
              <p className="text-xs text-muted-foreground">
                Add an email if this person should sign in. Strata will create the login record and send an invite so they can claim access cleanly.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={staffForm.role} onValueChange={handleStaffRoleChange}>
                <SelectTrigger className="h-11 w-full text-sm">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Page Access</Label>
                <p className="text-xs text-muted-foreground">
                  Start with the selected role defaults, then fine-tune what this person can open or manage.
                </p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="space-y-3">
                  {TEAM_PERMISSION_GROUPS.map((group) => {
                    const canRead = staffForm.customPermissions.includes(group.read);
                    const canWrite = group.write ? staffForm.customPermissions.includes(group.write) : false;
                    return (
                      <div
                        key={group.label}
                        className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{group.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.write ? "Choose whether they can view this area or make changes in it." : "Choose whether they can see this area."}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`perm-${group.read}`}
                              checked={canRead}
                              onCheckedChange={(value) => toggleStaffPermission(group.read, value)}
                            />
                            <Label htmlFor={`perm-${group.read}`} className="cursor-pointer text-xs">
                              Access
                            </Label>
                          </div>
                          {group.write ? (
                            <div className="flex items-center gap-2">
                              <Switch
                                id={`perm-${group.write}`}
                                checked={canWrite}
                                onCheckedChange={(value) => toggleStaffPermission(group.write, value)}
                              />
                              <Label htmlFor={`perm-${group.write}`} className="cursor-pointer text-xs">
                                Manage
                              </Label>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {!staffForm.email.trim() ? (
                <p className="text-xs text-muted-foreground">
                  These toggles will take effect once this team member has a login email and signs in.
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="team-active"
                checked={staffForm.active}
                onCheckedChange={(value) => setStaffForm((current) => ({ ...current, active: value }))}
              />
              <Label htmlFor="team-active" className="cursor-pointer">
                Active
              </Label>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setTeamDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleSaveStaff}
              disabled={savingStaff || updatingStaff || !staffForm.firstName.trim() || !staffForm.lastName.trim()}
              className="w-full sm:w-auto"
            >
              {savingStaff || updatingStaff ? "Saving..." : editingStaff ? "Save Changes" : "Add Team Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!manualInviteLink} onOpenChange={(open) => !open && setManualInviteLink(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Copy Invite Link</DialogTitle>
            <DialogDescription>
              Direct copy is unavailable in this browser context. The invite link for {manualInviteLink?.email ?? "this team member"} is ready below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input readOnly value={manualInviteLink?.url ?? ""} onFocus={(event) => event.currentTarget.select()} />
            <p className="text-xs text-muted-foreground">
              Tap the field to select the full link, then copy it manually.
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setManualInviteLink(null)} className="w-full sm:w-auto">
              Close
            </Button>
            <Button
              onClick={async () => {
                if (!manualInviteLink?.url) return;
                const copied = await copyTextWithFallback(manualInviteLink.url);
                if (copied) {
                  toast.success("Invite link copied");
                  setManualInviteLink(null);
                } else {
                  toast.error("Could not copy invite link.");
                }
              }}
              className="w-full sm:w-auto"
            >
              Try copy again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteLocationId} onOpenChange={(open) => !open && setDeleteLocationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this location. Appointments and staff assigned to it will not be deleted but will no longer have a location assigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLocation}
              disabled={deletingLocation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingLocation ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteStaffId} onOpenChange={(open) => !open && setDeleteStaffId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will suspend their access and remove them from the active team roster.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStaff}
              disabled={deletingStaff}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingStaff ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
