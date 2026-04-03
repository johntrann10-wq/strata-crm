import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router";
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
  Trash2,
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
  normalizeAppointmentBuffer,
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
  active?: boolean | null;
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

const STAFF_ROLES = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "service_advisor", label: "Service Advisor" },
  { value: "technician", label: "Technician" },
];

function getStaffStatus(teamMember: StaffRecord) {
  return teamMember.membershipStatus ?? (teamMember.active === false ? "suspended" : "active");
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
  const [stripeConnectLoading, setStripeConnectLoading] = useState(false);
  const [stripeDashboardLoading, setStripeDashboardLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api.billing
      .getStatus()
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
  }, [setBillingStatus]);

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
                Customer invoice and deposit checkout stays disabled until the connected-account collection flow is enabled safely. This step only links the business Stripe account and verifies readiness.
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
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { user, businessId, membershipRole, permissions } = useOutletContext<AuthOutletContext>();
  const [activeTab, setActiveTab] = useState("profile");
  const [formData, setFormData] = useState<BusinessSettingsFormData>(DEFAULT_BUSINESS_SETTINGS_FORM);
  const [appointmentBufferInput, setAppointmentBufferInput] = useState(
    String(DEFAULT_BUSINESS_SETTINGS_FORM.appointmentBufferMinutes)
  );
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationRecord | null>(null);
  const [deleteLocationId, setDeleteLocationId] = useState<string | null>(null);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffRecord | null>(null);
  const [deleteStaffId, setDeleteStaffId] = useState<string | null>(null);
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
  const [{ data: presetSummary }, getBusinessPreset] = useAction(api.getBusinessPreset);
  const [{ fetching: applyingPreset }, applyBusinessPreset] = useAction(api.applyBusinessPreset);
  const preset = presetSummary as BusinessPresetActionResult | undefined;
  const presetServiceCount = preset?.count ?? 0;
  const presetPreviewNames = preset?.names?.slice(0, 4) ?? [];
  const presetHasRecommendations = presetServiceCount > 0;

  useEffect(() => {
    if (!business) return;

    const next = businessSettingsFormFromSource(business);
    setFormData(next.formData);
    setAppointmentBufferInput(next.appointmentBufferInput);
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

  const handleFieldChange = (field: keyof BusinessSettingsFormData, value: string | number) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const normalizeAppointmentBufferInput = (value: string) => {
    const next = normalizeAppointmentBuffer(value);
    setAppointmentBufferInput(next.inputValue);
    handleFieldChange("appointmentBufferMinutes", next.numericValue);
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
        })
      : await saveStaff({
          firstName: staffForm.firstName.trim(),
          lastName: staffForm.lastName.trim(),
          email: staffForm.email.trim() || undefined,
          role: staffForm.role,
          active: staffForm.active,
        });

    if (result.error) {
      toast.error(result.error.message ?? "Could not save team member.");
      return;
    }

    setTeamDialogOpen(false);
    setEditingStaff(null);
    refetchTeam();

    const savedRecord = result.data as StaffRecord | null;
    if (!editingStaff && savedRecord?.membershipStatus === "invited") {
      if (savedRecord.inviteDelivery === "sent") {
        toast.success("Team member added and invite email sent");
      } else if (savedRecord.inviteDelivery === "not_configured") {
        toast.warning("Team member added, but invite email could not be sent because transactional email is not configured");
      } else {
        toast.success("Team member added");
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
        currency: formData.currency || "USD",
        appointmentBufferMinutes: formData.appointmentBufferMinutes,
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
          <TabsList className="flex h-auto w-full gap-2 overflow-x-auto bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible">
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
                        value={formData.defaultTaxRate}
                        onChange={(e) => handleFieldChange("defaultTaxRate", parseFloat(e.target.value) || 0)}
                      />
                      <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
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
                    {(teamMembers as StaffRecord[]).map((teamMember) => (
                      <div
                        key={teamMember.id}
                        className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
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
                            {getStaffStatus(teamMember) === "invited" && teamMember.email ? (
                              <p className="mt-1 text-xs text-muted-foreground">Awaiting account claim from {teamMember.email}</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 sm:justify-end">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground capitalize">
                            {getStaffStatus(teamMember)}
                          </span>
                          <div className="flex items-center gap-2">
                            {getStaffStatus(teamMember) === "invited" && teamMember.email ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9"
                                onClick={() => handleResendStaffInvite(teamMember)}
                                disabled={!canManageTeam || resendingStaffInvite}
                              >
                                {resendingStaffInvite ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                Resend invite
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => openEditTeamMember(teamMember)}
                              disabled={!canManageTeam}
                            >
                              <PenLine className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteStaffId(teamMember.id)}
                              disabled={!canManageTeam || (teamMember.membershipRole ?? teamMember.role) === "owner"}
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
              <Select value={staffForm.role} onValueChange={(value) => setStaffForm((current) => ({ ...current, role: value }))}>
                <SelectTrigger>
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
