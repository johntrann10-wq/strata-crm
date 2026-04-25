import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import type { AuthOutletContext } from "./_app";
import { useAction, useFindFirst, useFindMany, useFindOne } from "../hooks/useApi";
import { API_BASE, api } from "../api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
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
import { buildQuarterHourOptions } from "../components/appointments/SchedulingControls";
import { cn } from "@/lib/utils";
import {
  getBillingAccessLabel,
  getTrialDaysLeft,
  hasFullBillingAccess,
  type BillingAccessState,
} from "../lib/billingAccess";
import {
  getBillingPromptBody,
  getBillingPromptHeadline,
  type BillingActivationMilestone,
  type BillingPromptState,
} from "../lib/billingPrompts";
import { BillingPromptDialog } from "@/components/billing/BillingPromptDialog";
import { isNativeShell } from "../lib/mobileShell";
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

const BOOKING_DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

const BILLING_FEATURES = [
  "Appointments & calendar",
  "Client & vehicle CRM",
  "Quotes & invoices",
  "Payments on invoices",
  "Service catalog",
];

interface BillingStatus {
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

type SystemStatus = {
  status: "idle" | "checking" | "healthy" | "degraded";
  message: string;
  checkedAt: number | null;
};

type AutomationSettingsForm = {
  leadCaptureEnabled: boolean;
  leadAutoResponseEnabled: boolean;
  leadAutoResponseEmailEnabled: boolean;
  leadAutoResponseSmsEnabled: boolean;
  appointmentConfirmationEmailEnabled: boolean;
  missedCallTextBackEnabled: boolean;
  uncontactedLeadsEnabled: boolean;
  uncontactedLeadHours: number;
  appointmentRemindersEnabled: boolean;
  appointmentReminderEmailEnabled: boolean;
  appointmentReminderHours: number;
  sendWindowStartHour: number;
  sendWindowEndHour: number;
  abandonedQuotesEnabled: boolean;
  abandonedQuoteEmailEnabled: boolean;
  abandonedQuoteHours: number;
  reviewRequestsEnabled: boolean;
  reviewRequestEmailEnabled: boolean;
  reviewRequestDelayHours: number;
  reviewRequestUrl: string;
  lapsedClientsEnabled: boolean;
  lapsedClientEmailEnabled: boolean;
  lapsedClientMonths: number;
  bookingRequestUrl: string;
};

type IntegrationSettingsForm = {
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  webhookEvents: string[];
};

type TwilioSmsSettingsForm = {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  enabledTemplateSlugs: Array<
    | "lead_auto_response"
    | "missed_call_text_back"
    | "appointment_confirmation"
    | "appointment_reminder"
    | "payment_receipt"
    | "review_request"
    | "lapsed_client_reengagement"
  >;
};

type AutomationActivitySummary = {
  sentLast30Days: number;
  lastSentAt: string | null;
  skippedLast30Days: number;
  lastSkippedAt: string | null;
  failedLast30Days: number;
  lastFailedAt: string | null;
};

type AutomationFeedRecord = {
  id: string;
  kind: "sent" | "failed" | "skipped";
  automationType: "uncontacted_lead" | "appointment_reminder" | "abandoned_quote" | "review_request" | "lapsed_client";
  channel: "email" | "sms";
  recipient: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  message: string;
};

type AutomationFeedFilter = "all" | "issues" | "sent";
type AutomationFeedAutomationFilter = "all" | AutomationFeedRecord["automationType"];
type AutomationFeedChannelFilter = "all" | AutomationFeedRecord["channel"];

type WorkerHealthSummary = {
  automations: {
    sentLast24Hours: number;
    skippedLast24Hours: number;
    lastActivityAt: string | null;
    lastSkippedAt: string | null;
    failedLast24Hours: number;
    lastFailureAt: string | null;
  };
  integrations: {
    lastAttemptAt: string | null;
    pendingJobs: number;
    processingJobs: number;
    failedJobs: number;
    deadLetterJobs: number;
  };
};

type IntegrationRegistryStatus = {
  provider: "quickbooks_online" | "twilio_sms" | "google_calendar" | "outbound_webhooks";
  label: string;
  ownerType: "business" | "user";
  description: string;
  permissions: { read: "settings.read"; write: "settings.write" };
  featureFlagEnabled: boolean;
};

type IntegrationConnectionStatus = {
  id: string;
  provider: IntegrationRegistryStatus["provider"];
  ownerType: "business" | "user";
  ownerKey: string;
  userId: string | null;
  status: "pending" | "connected" | "action_required" | "error" | "disconnected";
  displayName: string | null;
  externalAccountId: string | null;
  externalAccountName: string | null;
  scopes: string[];
  featureEnabled: boolean;
  lastSyncedAt: string | null;
  lastSuccessfulAt: string | null;
  lastError: string | null;
  actionRequired: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  configSummary: {
    hasEncryptedAccessToken: boolean;
    hasEncryptedRefreshToken: boolean;
    hasConfig: boolean;
    selectedCalendarId: string | null;
    selectedCalendarSummary: string | null;
    webhookUrl: string | null;
    twilioMessagingServiceSid: string | null;
    twilioAccountSid: string | null;
    twilioEnabledTemplateSlugs: string[];
  };
};

type GoogleCalendarOption = {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string | null;
  timeZone?: string | null;
};

type IntegrationFailureRecord = {
  id: string;
  provider: string;
  jobType: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  deadLetteredAt: string | null;
  nextRunAt: string | null;
  updatedAt: string;
  displayName: string | null;
};

type OutboundWebhookActivityRecord = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
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
  leadCaptureEnabled: false,
  leadAutoResponseEnabled: true,
  leadAutoResponseEmailEnabled: true,
  leadAutoResponseSmsEnabled: false,
  appointmentConfirmationEmailEnabled: true,
  missedCallTextBackEnabled: false,
  uncontactedLeadsEnabled: false,
  uncontactedLeadHours: 2,
  appointmentRemindersEnabled: true,
  appointmentReminderEmailEnabled: true,
  appointmentReminderHours: 24,
  sendWindowStartHour: 8,
  sendWindowEndHour: 18,
  abandonedQuotesEnabled: false,
  abandonedQuoteEmailEnabled: true,
  abandonedQuoteHours: 48,
  reviewRequestsEnabled: false,
  reviewRequestEmailEnabled: true,
  reviewRequestDelayHours: 24,
  reviewRequestUrl: "",
  lapsedClientsEnabled: false,
  lapsedClientEmailEnabled: true,
  lapsedClientMonths: 6,
  bookingRequestUrl: "",
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

const DEFAULT_TWILIO_SMS_SETTINGS: TwilioSmsSettingsForm = {
  accountSid: "",
  authToken: "",
  messagingServiceSid: "",
  enabledTemplateSlugs: [
    "lead_auto_response",
    "missed_call_text_back",
    "appointment_confirmation",
    "appointment_reminder",
    "review_request",
    "lapsed_client_reengagement",
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

const TWILIO_TEMPLATE_OPTIONS: Array<{
  value: TwilioSmsSettingsForm["enabledTemplateSlugs"][number];
  label: string;
  helper: string;
}> = [
  { value: "lead_auto_response", label: "Lead auto-responses", helper: "Send an immediate acknowledgment text after a new web lead comes in." },
  { value: "missed_call_text_back", label: "Missed-call text back", helper: "Text inbound callers automatically after a missed call when the voice callback is configured." },
  { value: "appointment_confirmation", label: "Appointment confirmations", helper: "Send confirmation texts after appointments are booked or resent." },
  { value: "appointment_reminder", label: "Appointment reminders", helper: "Send reminder texts ahead of scheduled work." },
  { value: "payment_receipt", label: "Payment receipts", helper: "Send SMS receipts when invoice payments are recorded." },
  { value: "review_request", label: "Review requests", helper: "Send review-request texts after completed work when the automation runs." },
  { value: "lapsed_client_reengagement", label: "Lapsed outreach", helper: "Send re-engagement texts when the lapsed-client automation runs." },
];

const AUTOMATION_WINDOW_HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label:
    hour === 0
      ? "12:00 AM"
      : hour < 12
        ? `${hour}:00 AM`
        : hour === 12
          ? "12:00 PM"
          : `${hour - 12}:00 PM`,
}));

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

function formatAutomationLastSent(value: string | null) {
  if (!value) return "No recent sends";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No recent sends";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getAutomationHealthTone(summary: AutomationActivitySummary | null | undefined) {
  if (!summary) return "text-muted-foreground";
  if ((summary.failedLast30Days ?? 0) > 0) return "text-amber-700";
  if ((summary.skippedLast30Days ?? 0) > 0) return "text-sky-700";
  return "text-muted-foreground";
}

function formatAutomationFeedTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatAutomationRefreshTimestamp(value: number | null) {
  if (!value) return "Not refreshed yet";
  return new Intl.DateTimeFormat("en-US", {
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAutomationFeedLabel(type: AutomationFeedRecord["automationType"]) {
  switch (type) {
    case "uncontacted_lead":
      return "Uncontacted lead";
    case "appointment_reminder":
      return "Appointment reminder";
    case "abandoned_quote":
      return "Abandoned quote";
    case "review_request":
      return "Review request";
    default:
      return "Lapsed outreach";
  }
}

function formatWorkerTimestamp(value: string | null, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatProviderLabel(provider: string) {
  return provider.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getConnectionBadgeVariant(
  status: IntegrationConnectionStatus["status"]
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "connected") return "default";
  if (status === "error") return "destructive";
  if (status === "action_required") return "secondary";
  return "outline";
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
  const [billingRetryLoading, setBillingRetryLoading] = useState(false);
  const [disconnectStripeOpen, setDisconnectStripeOpen] = useState(false);
  const [billingPromptOpen, setBillingPromptOpen] = useState(false);

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
            accessState: null,
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
              stage: "none",
              visible: false,
              daysLeftInTrial: null,
              dismissedUntil: null,
              cooldownDays: 5,
            },
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

  useEffect(() => {
    const billingPortalState = searchParams.get("billingPortal");
    if (billingPortalState !== "return") return;

    setBillingPortalLoading(true);
    api.billing
      .refreshBillingState()
      .then((result) => {
        setBillingStatus(result);
        if (result.accessState === "active_paid") {
          toast.success("Billing is active and your subscription is ready.");
        } else if (result.accessState === "active_trial" && result.billingHasPaymentMethod) {
          toast.success("Payment method saved. Your trial stays active and billing reminders have been cleared.");
        } else if (result.accessState === "paused_missing_payment_method") {
          toast.message("Billing still needs a payment method before full access can resume.");
        } else {
          toast.message("Billing status refreshed.");
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not refresh billing status.");
      })
      .finally(() => {
        setBillingPortalLoading(false);
      });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("billingPortal");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, setBillingStatus, setBillingPortalLoading]);

  const handleManageSubscription = async () => {
    setBillingPortalLoading(true);
    try {
      const result =
        billingStatus?.accessState === "canceled"
          ? await api.billing.createCheckoutSession()
          : await api.billing.createPortalSession({ entryPoint: "settings" });
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

  const handleRetryBillingSetup = async () => {
    setBillingRetryLoading(true);
    try {
      await api.billing.retryTrialSetup();
      const result = await refreshBillingStatus();
      if (hasFullBillingAccess(result.accessState)) {
        toast.success("Billing setup retried successfully.");
      } else {
        toast.message("Billing still needs attention, but the latest status is now loaded.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retry billing setup.");
    } finally {
      setBillingRetryLoading(false);
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

  const isActive = hasFullBillingAccess(billingStatus?.accessState);
  const billingAccessLabel = getBillingAccessLabel(billingStatus?.accessState);
  const trialDaysLeft = getTrialDaysLeft(billingStatus?.trialEndsAt);
  const trialEnd = billingStatus?.trialEndsAt ? new Date(billingStatus.trialEndsAt) : null;
  const periodEnd = billingStatus?.currentPeriodEnd ? new Date(billingStatus.currentPeriodEnd) : null;
  const stripeConnectOnboardedAt = billingStatus?.stripeConnectOnboardedAt
    ? new Date(billingStatus.stripeConnectOnboardedAt)
    : null;
  const canManageStripeConnect = membershipRole === "owner" || membershipRole === "admin";
  const canManageBilling = membershipRole === "owner" || membershipRole === "admin";
  const billingPrompt = billingStatus?.billingPrompt ?? null;
  const nativeShellSession = isNativeShell();
  const promptBody =
    billingPrompt?.stage && billingPrompt.stage !== "none"
      ? getBillingPromptBody({
          stage: billingPrompt.stage,
          milestone: billingStatus.activationMilestone,
          daysLeftInTrial: billingPrompt.daysLeftInTrial,
        })
      : "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="mb-1 flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>{nativeShellSession ? "Workspace billing" : "Plan &amp; Billing"}</CardTitle>
          </div>
          <CardDescription>
            {nativeShellSession
              ? "Review workspace billing status here. Customer payment tools stay available separately."
              : "Strata is $29/month. First month free. Manage your subscription and payment method below."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {billingStatus ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isActive ? "default" : "secondary"}>
                {billingAccessLabel}
              </Badge>
              {trialEnd && billingStatus.accessState === "active_trial" ? (
                <span className="text-sm text-muted-foreground">
                  {trialDaysLeft == null
                    ? `Trial ends ${trialEnd.toLocaleDateString()}`
                    : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`}
                </span>
              ) : null}
              {periodEnd && billingStatus.accessState === "active_paid" ? (
                <span className="text-sm text-muted-foreground">Renews {periodEnd.toLocaleDateString()}</span>
              ) : null}
            </div>
          ) : null}

          {billingStatus && !nativeShellSession && billingPrompt?.stage && billingPrompt.stage !== "none" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-950">
                {getBillingPromptHeadline(billingPrompt.stage)}
              </p>
              <p className="mt-1 text-sm text-amber-900">{promptBody}</p>
            </div>
          ) : null}

          {billingStatus?.billingLastStripeEventType || billingStatus?.billingLastStripeSyncError ? (
            <div className="rounded-lg border bg-muted/20 px-4 py-3">
              <p className="text-sm font-medium">Stripe sync</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {billingStatus.billingLastStripeSyncStatus === "failed"
                  ? billingStatus.billingLastStripeSyncError || "Stripe reported a billing sync issue."
                  : billingStatus.billingLastStripeEventType
                    ? `Last event: ${billingStatus.billingLastStripeEventType}`
                    : "Stripe billing sync is healthy."}
              </p>
              {billingStatus.billingLastStripeEventAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Updated {new Date(billingStatus.billingLastStripeEventAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}

          {!nativeShellSession ? (
            <>
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
            </>
          ) : null}

          {billingStatus?.accessState === "pending_setup_failure" ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {billingStatus.billingSetupError?.trim() || "Strata could not finish Stripe setup automatically yet."}
              </p>
              {nativeShellSession ? (
                <p className="text-sm text-muted-foreground">
                  Contact support if workspace billing still needs attention after this review build.
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={handleRetryBillingSetup} disabled={billingRetryLoading || !canManageBilling}>
                    {billingRetryLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Retry billing setup
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/subscribe">Open billing recovery</Link>
                  </Button>
                </div>
              )}
            </div>
          ) : isActive ? (
            <div className="space-y-3">
              {billingStatus?.accessState === "active_trial" ? (
                <p className="text-sm text-muted-foreground">
                  {nativeShellSession
                    ? "Workspace access is active in the mobile app."
                    : billingStatus.billingHasPaymentMethod
                      ? "A payment method is already saved. Your trial stays active until the paid plan begins automatically."
                      : "Your workspace is fully usable now. Add a payment method whenever you're ready so the trial can roll into a paid plan smoothly."}
                </p>
              ) : null}
              {nativeShellSession ? (
                <p className="text-sm text-muted-foreground">
                  Billing management is intentionally kept out of the in-app review path.
                </p>
              ) : (
                <Button
                  onClick={
                    billingPrompt?.stage &&
                    billingPrompt.stage !== "none" &&
                    billingStatus.accessState === "active_trial"
                      ? () => setBillingPromptOpen(true)
                      : handleManageSubscription
                  }
                  disabled={billingPortalLoading || !canManageBilling}
                >
                  {billingPortalLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  {billingStatus?.accessState === "active_trial"
                    ? billingStatus.billingHasPaymentMethod
                      ? "Manage billing"
                      : "Add payment method"
                    : billingStatus?.accessState === "canceled"
                      ? "Reactivate subscription"
                    : "Manage billing"}
                </Button>
              )}
            </div>
          ) : billingStatus !== null ? (
            <div className="space-y-2">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {nativeShellSession
                  ? "Workspace billing needs attention."
                  : billingStatus.accessState === "paused_missing_payment_method"
                    ? "The trial ended without a saved payment method. Add one to resume full access."
                    : "Billing is inactive for this workspace. Your data is saved and ready to resume."}
              </p>
              {nativeShellSession ? (
                <p className="text-sm text-muted-foreground">
                  Contact support if the workspace still needs billing help outside the review flow.
                </p>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link to="/subscribe">Open billing recovery</Link>
                </Button>
              )}
            </div>
          ) : null}

          {!canManageBilling ? (
            <p className="text-xs text-muted-foreground">
              Ask an owner or admin to update billing for this workspace.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {nativeShellSession ? null : (
        <BillingPromptDialog
          open={billingPromptOpen}
          onOpenChange={setBillingPromptOpen}
          stage={billingPrompt?.stage ?? "none"}
          body={promptBody}
          canManageBilling={canManageBilling}
          loading={billingPortalLoading}
          onContinue={() => {
            const promptStage = billingPrompt?.stage;
            if (!promptStage || promptStage === "none") return;
            void (async () => {
              setBillingPortalLoading(true);
              try {
                const result = await api.billing.createPortalSessionForPrompt({
                  promptStage,
                  entryPoint: "settings",
                });
                if (result?.url) window.location.href = result.url;
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not open billing portal.");
              } finally {
                setBillingPortalLoading(false);
              }
            })();
          }}
        />
      )}

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
  const [searchParams, setSearchParams] = useSearchParams();
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
  const appointmentTimeOptions = useMemo(() => buildQuarterHourOptions(), []);
  const formSelectTriggerClassName =
    "h-10 w-full rounded-xl border-input/90 bg-background/85 px-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.03)]";
  const mobileTimeInputClassName =
    "h-11 text-base [font-variant-numeric:tabular-nums] sm:h-10 sm:text-sm [color-scheme:light] [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:min-h-[1.25rem] [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit-fields-wrapper]:min-w-0";
  const [automationSettings, setAutomationSettings] = useState<AutomationSettingsForm>(
    DEFAULT_AUTOMATION_SETTINGS
  );
  const [appointmentReminderHoursInput, setAppointmentReminderHoursInput] = useState(
    String(DEFAULT_AUTOMATION_SETTINGS.appointmentReminderHours)
  );
  const [uncontactedLeadHoursInput, setUncontactedLeadHoursInput] = useState(
    String(DEFAULT_AUTOMATION_SETTINGS.uncontactedLeadHours)
  );
  const [reviewRequestDelayHoursInput, setReviewRequestDelayHoursInput] = useState(
    String(DEFAULT_AUTOMATION_SETTINGS.reviewRequestDelayHours)
  );
  const [abandonedQuoteHoursInput, setAbandonedQuoteHoursInput] = useState(
    String(DEFAULT_AUTOMATION_SETTINGS.abandonedQuoteHours)
  );
  const [lapsedClientMonthsInput, setLapsedClientMonthsInput] = useState(
    String(DEFAULT_AUTOMATION_SETTINGS.lapsedClientMonths)
  );
  const [automationSummary, setAutomationSummary] = useState<{
    uncontactedLeads: AutomationActivitySummary;
    appointmentReminders: AutomationActivitySummary;
    abandonedQuotes: AutomationActivitySummary;
    reviewRequests: AutomationActivitySummary;
    lapsedClients: AutomationActivitySummary;
  } | null>(null);
  const [automationFeed, setAutomationFeed] = useState<AutomationFeedRecord[]>([]);
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettingsForm>(
    DEFAULT_INTEGRATION_SETTINGS
  );
  const [twilioSettings, setTwilioSettings] = useState<TwilioSmsSettingsForm>(DEFAULT_TWILIO_SMS_SETTINGS);
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
  const hasFullBillingWorkspaceAccess = billingStatus !== null && hasFullBillingAccess(billingStatus.accessState);
  const integrationsBlockedByBilling = billingStatus !== null && !hasFullBillingAccess(billingStatus.accessState);
  const canLoadIntegrationData = Boolean(businessId) && activeTab === "integrations" && hasFullBillingWorkspaceAccess;
  const canLoadAutomationInsights = Boolean(businessId) && activeTab === "automations";
  const canManageTeam =
    permissions.has("team.write") ||
    membershipRole === "owner" ||
    membershipRole === "admin" ||
    membershipRole === "manager";
  const canEditSettings = permissions.has("settings.write");
  const canManageBusinessIntegrations =
    canEditSettings && (membershipRole === "owner" || membershipRole === "admin");
  const canViewDiagnostics = membershipRole === "owner" || membershipRole === "admin" || permissions.has("settings.write");
  const [quickBooksConnecting, setQuickBooksConnecting] = useState(false);
  const [quickBooksDisconnecting, setQuickBooksDisconnecting] = useState(false);
  const [quickBooksResyncing, setQuickBooksResyncing] = useState(false);
  const [googleCalendarConnecting, setGoogleCalendarConnecting] = useState(false);
  const [googleCalendarDisconnecting, setGoogleCalendarDisconnecting] = useState(false);
  const [googleCalendarSaving, setGoogleCalendarSaving] = useState(false);
  const [googleCalendarResyncing, setGoogleCalendarResyncing] = useState(false);
  const [googleCalendarCalendars, setGoogleCalendarCalendars] = useState<GoogleCalendarOption[]>([]);
  const [googleCalendarCalendarsLoading, setGoogleCalendarCalendarsLoading] = useState(false);
  const [automationFeedFilter, setAutomationFeedFilter] = useState<AutomationFeedFilter>("all");
  const [automationFeedAutomationFilter, setAutomationFeedAutomationFilter] =
    useState<AutomationFeedAutomationFilter>("all");
  const [automationFeedChannelFilter, setAutomationFeedChannelFilter] =
    useState<AutomationFeedChannelFilter>("all");
  const [automationInsightsRefreshing, setAutomationInsightsRefreshing] = useState(false);
  const [automationInsightsRefreshedAt, setAutomationInsightsRefreshedAt] = useState<number | null>(null);
  const [twilioSaving, setTwilioSaving] = useState(false);
  const [twilioDisconnecting, setTwilioDisconnecting] = useState(false);
  const [outboundWebhookTesting, setOutboundWebhookTesting] = useState(false);
  const [outboundWebhookReplayId, setOutboundWebhookReplayId] = useState<string | null>(null);

  const [{ data: business, fetching: businessFetching }] = useFindOne(api.business, businessId ?? "", {
    pause: !businessId,
  });
  const publicLeadCaptureUrl =
    business?.id && typeof window !== "undefined" ? `${window.location.origin}/lead/${business.id}` : "";

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
  const [{ fetching: automationSummaryFetching }, getAutomationSummary] = useAction(api.getAutomationSummary);
  const [{ fetching: automationFeedFetching }, getAutomationFeed] = useAction(api.getAutomationFeed);
  const [{ data: workerHealthData, fetching: workerHealthFetching }, getWorkerHealth] = useAction(api.getWorkerHealth);
  const [{ data: integrationStatusData, fetching: integrationStatusFetching }, refetchIntegrationStatus] = useFindFirst(
    {
      findFirst: () => api.integration.listStatus(),
    },
    { pause: !canLoadIntegrationData }
  );
  const [{ data: integrationFailureData, fetching: integrationFailuresFetching }, refetchIntegrationFailures] = useFindMany(
    {
      findMany: () => api.integration.listFailures().then((result) => result.records ?? []),
    },
    { pause: !canLoadIntegrationData }
  );
  const [{ data: outboundWebhookActivityData, fetching: outboundWebhookActivityFetching }, refetchOutboundWebhookActivity] =
    useFindMany(
      {
        findMany: () =>
          api.integration.listRecentOutboundWebhookEvents().then((result) => result.records ?? []),
      },
      { pause: !canLoadIntegrationData }
    );
  const [{ fetching: retryingIntegrationJob }, retryIntegrationJob] = useAction(api.integration.retryJob);
  const integrationStatus = integrationStatusData as
    | {
        infrastructure: {
          vaultConfigured: boolean;
          cronSecretConfigured: boolean;
          providerConfiguration: Record<IntegrationRegistryStatus["provider"], boolean>;
        };
        registry: IntegrationRegistryStatus[];
        connections: IntegrationConnectionStatus[];
      }
    | undefined;
  const integrationFailures = (integrationFailureData as IntegrationFailureRecord[] | undefined) ?? [];
  const quickBooksConnection =
    integrationStatus?.connections.find((item) => item.provider === "quickbooks_online") ?? null;
  const quickBooksRegistry =
    integrationStatus?.registry.find((item) => item.provider === "quickbooks_online") ?? null;
  const googleCalendarConnection =
    integrationStatus?.connections.find(
      (item) => item.provider === "google_calendar" && item.userId === user.id
    ) ?? null;
  const googleCalendarRegistry =
    integrationStatus?.registry.find((item) => item.provider === "google_calendar") ?? null;
  const twilioConnection =
    integrationStatus?.connections.find((item) => item.provider === "twilio_sms") ?? null;
  const twilioRegistry =
    integrationStatus?.registry.find((item) => item.provider === "twilio_sms") ?? null;
  const outboundWebhookConnection =
    integrationStatus?.connections.find((item) => item.provider === "outbound_webhooks") ?? null;
  const outboundWebhookRegistry =
    integrationStatus?.registry.find((item) => item.provider === "outbound_webhooks") ?? null;
  const outboundWebhookActivity = (outboundWebhookActivityData as OutboundWebhookActivityRecord[] | undefined) ?? [];
  const providerConfiguration = integrationStatus?.infrastructure.providerConfiguration;
  const vaultConfigured = integrationStatus?.infrastructure.vaultConfigured ?? false;
  const quickBooksBackendConfigured = providerConfiguration?.quickbooks_online ?? false;
  const googleCalendarBackendConfigured = providerConfiguration?.google_calendar ?? false;
  const twilioBackendConfigured = providerConfiguration?.twilio_sms ?? false;
  const outboundWebhooksBackendConfigured = providerConfiguration?.outbound_webhooks ?? false;
  const workerHealth = workerHealthData as WorkerHealthSummary | undefined;
  const filteredAutomationFeed = automationFeed.filter((entry) => {
    if (automationFeedFilter === "issues" && entry.kind === "sent") return false;
    if (automationFeedFilter === "sent" && entry.kind !== "sent") return false;
    if (automationFeedAutomationFilter !== "all" && entry.automationType !== automationFeedAutomationFilter) {
      return false;
    }
    if (automationFeedChannelFilter !== "all" && entry.channel !== automationFeedChannelFilter) {
      return false;
    }
    return true;
  });
  const automationFeedIssueCount = automationFeed.filter((entry) => entry.kind !== "sent").length;
  const automationFeedSmsCount = automationFeed.filter((entry) => entry.channel === "sms").length;

  const refreshAutomationInsights = useCallback(
    async (options?: { quiet?: boolean }) => {
      if (!businessId) return;
      const quiet = options?.quiet ?? false;
      if (!quiet) setAutomationInsightsRefreshing(true);
      try {
        const [summaryResult, feedResult, workerHealthResult] = await Promise.all([
          getAutomationSummary(),
          getAutomationFeed({ limit: 12 }),
          getWorkerHealth(),
        ]);

        if (!summaryResult.error) {
          setAutomationSummary(summaryResult.data as typeof automationSummary);
        }
        if (!feedResult.error) {
          setAutomationFeed((feedResult.data?.records as AutomationFeedRecord[] | undefined) ?? []);
        }
        if (!workerHealthResult.error) {
          // useAction already updates workerHealthData; no local setter needed
        }
        setAutomationInsightsRefreshedAt(Date.now());
      } finally {
        if (!quiet) setAutomationInsightsRefreshing(false);
      }
    },
    [businessId, getAutomationFeed, getAutomationSummary, getWorkerHealth]
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const quickBooksState = searchParams.get("quickbooks");
    if (!quickBooksState || integrationsBlockedByBilling) return;

    void refetchIntegrationStatus();

    const message = searchParams.get("quickbooksMessage");
    if (quickBooksState === "connected") {
      toast.success(message || "QuickBooks is connected.");
    } else if (quickBooksState === "disconnected") {
      toast.success(message || "QuickBooks was disconnected.");
    } else {
      toast.error(message || "QuickBooks setup needs attention.");
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("quickbooks");
    nextParams.delete("quickbooksMessage");
    setSearchParams(nextParams, { replace: true });
  }, [integrationsBlockedByBilling, refetchIntegrationStatus, searchParams, setSearchParams]);

  useEffect(() => {
    const googleCalendarState = searchParams.get("googleCalendar");
    if (!googleCalendarState || integrationsBlockedByBilling) return;

    void refetchIntegrationStatus();

    const message = searchParams.get("googleCalendarMessage");
    if (googleCalendarState === "connected") {
      toast.success(message || "Google Calendar is connected.");
    } else if (googleCalendarState === "disconnected") {
      toast.success(message || "Google Calendar was disconnected.");
    } else {
      toast.error(message || "Google Calendar setup needs attention.");
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("googleCalendar");
    nextParams.delete("googleCalendarMessage");
    setSearchParams(nextParams, { replace: true });
  }, [integrationsBlockedByBilling, refetchIntegrationStatus, searchParams, setSearchParams]);

  useEffect(() => {
    if (!business) return;

    const next = businessSettingsFormFromSource(business);
    setFormData(next.formData);
    setDefaultTaxRateInput(next.defaultTaxRateInput);
    setDefaultAdminFeeInput(next.defaultAdminFeeInput);
    setAppointmentBufferInput(next.appointmentBufferInput);
    setCalendarBlockCapacityInput(next.calendarBlockCapacityInput);
    const nextAutomationSettings: AutomationSettingsForm = {
      leadCaptureEnabled: business.leadCaptureEnabled ?? DEFAULT_AUTOMATION_SETTINGS.leadCaptureEnabled,
      leadAutoResponseEnabled: business.leadAutoResponseEnabled ?? DEFAULT_AUTOMATION_SETTINGS.leadAutoResponseEnabled,
      leadAutoResponseEmailEnabled:
        business.leadAutoResponseEmailEnabled ?? DEFAULT_AUTOMATION_SETTINGS.leadAutoResponseEmailEnabled,
      leadAutoResponseSmsEnabled:
        business.leadAutoResponseSmsEnabled ?? DEFAULT_AUTOMATION_SETTINGS.leadAutoResponseSmsEnabled,
      appointmentConfirmationEmailEnabled:
        business.notificationAppointmentConfirmationEmailEnabled ??
        DEFAULT_AUTOMATION_SETTINGS.appointmentConfirmationEmailEnabled,
      missedCallTextBackEnabled:
        business.missedCallTextBackEnabled ?? DEFAULT_AUTOMATION_SETTINGS.missedCallTextBackEnabled,
      uncontactedLeadsEnabled:
        business.automationUncontactedLeadsEnabled ?? DEFAULT_AUTOMATION_SETTINGS.uncontactedLeadsEnabled,
      uncontactedLeadHours:
        business.automationUncontactedLeadHours ?? DEFAULT_AUTOMATION_SETTINGS.uncontactedLeadHours,
      appointmentRemindersEnabled: business.automationAppointmentRemindersEnabled ?? DEFAULT_AUTOMATION_SETTINGS.appointmentRemindersEnabled,
      appointmentReminderEmailEnabled:
        business.notificationAppointmentReminderEmailEnabled ??
        DEFAULT_AUTOMATION_SETTINGS.appointmentReminderEmailEnabled,
      appointmentReminderHours: business.automationAppointmentReminderHours ?? DEFAULT_AUTOMATION_SETTINGS.appointmentReminderHours,
      sendWindowStartHour: business.automationSendWindowStartHour ?? DEFAULT_AUTOMATION_SETTINGS.sendWindowStartHour,
      sendWindowEndHour: business.automationSendWindowEndHour ?? DEFAULT_AUTOMATION_SETTINGS.sendWindowEndHour,
      abandonedQuotesEnabled:
        business.automationAbandonedQuotesEnabled ?? DEFAULT_AUTOMATION_SETTINGS.abandonedQuotesEnabled,
      abandonedQuoteEmailEnabled:
        business.notificationAbandonedQuoteEmailEnabled ??
        DEFAULT_AUTOMATION_SETTINGS.abandonedQuoteEmailEnabled,
      abandonedQuoteHours:
        business.automationAbandonedQuoteHours ?? DEFAULT_AUTOMATION_SETTINGS.abandonedQuoteHours,
      reviewRequestsEnabled: business.automationReviewRequestsEnabled ?? DEFAULT_AUTOMATION_SETTINGS.reviewRequestsEnabled,
      reviewRequestEmailEnabled:
        business.notificationReviewRequestEmailEnabled ??
        DEFAULT_AUTOMATION_SETTINGS.reviewRequestEmailEnabled,
      reviewRequestDelayHours: business.automationReviewRequestDelayHours ?? DEFAULT_AUTOMATION_SETTINGS.reviewRequestDelayHours,
      reviewRequestUrl: business.reviewRequestUrl ?? DEFAULT_AUTOMATION_SETTINGS.reviewRequestUrl,
      lapsedClientsEnabled: business.automationLapsedClientsEnabled ?? DEFAULT_AUTOMATION_SETTINGS.lapsedClientsEnabled,
      lapsedClientEmailEnabled:
        business.notificationLapsedClientEmailEnabled ??
        DEFAULT_AUTOMATION_SETTINGS.lapsedClientEmailEnabled,
      lapsedClientMonths: business.automationLapsedClientMonths ?? DEFAULT_AUTOMATION_SETTINGS.lapsedClientMonths,
      bookingRequestUrl: business.bookingRequestUrl ?? DEFAULT_AUTOMATION_SETTINGS.bookingRequestUrl,
    };
    setAutomationSettings(nextAutomationSettings);
    setUncontactedLeadHoursInput(String(nextAutomationSettings.uncontactedLeadHours));
    setAppointmentReminderHoursInput(String(nextAutomationSettings.appointmentReminderHours));
    setAbandonedQuoteHoursInput(String(nextAutomationSettings.abandonedQuoteHours));
    setReviewRequestDelayHoursInput(String(nextAutomationSettings.reviewRequestDelayHours));
    setLapsedClientMonthsInput(String(nextAutomationSettings.lapsedClientMonths));
    setIntegrationSettings({
      webhookEnabled: business.integrationWebhookEnabled ?? DEFAULT_INTEGRATION_SETTINGS.webhookEnabled,
      webhookUrl: business.integrationWebhookUrl ?? "",
      webhookSecret: "",
      webhookEvents:
        Array.isArray(business.integrationWebhookEvents) && business.integrationWebhookEvents.length > 0
          ? business.integrationWebhookEvents
          : DEFAULT_INTEGRATION_SETTINGS.webhookEvents,
    });
  }, [business]);

  useEffect(() => {
    if (!twilioConnection) {
      setTwilioSettings(DEFAULT_TWILIO_SMS_SETTINGS);
      return;
    }
    setTwilioSettings({
      accountSid: twilioConnection.configSummary.twilioAccountSid ?? "",
      authToken: "",
      messagingServiceSid: twilioConnection.configSummary.twilioMessagingServiceSid ?? "",
      enabledTemplateSlugs:
        twilioConnection.configSummary.twilioEnabledTemplateSlugs.length > 0
          ? (twilioConnection.configSummary.twilioEnabledTemplateSlugs as TwilioSmsSettingsForm["enabledTemplateSlugs"])
          : DEFAULT_TWILIO_SMS_SETTINGS.enabledTemplateSlugs,
    });
  }, [twilioConnection]);

  useEffect(() => {
    if (!canLoadIntegrationData) return;
    void refetchOutboundWebhookActivity();
  }, [canLoadIntegrationData, refetchOutboundWebhookActivity]);

  useEffect(() => {
    if (
      !canLoadIntegrationData ||
      !googleCalendarRegistry?.featureFlagEnabled ||
      googleCalendarConnection?.status !== "connected"
    ) {
      setGoogleCalendarCalendars([]);
      return;
    }

    let cancelled = false;
    setGoogleCalendarCalendarsLoading(true);
    api.integration
      .listGoogleCalendars()
      .then((result) => {
        if (cancelled) return;
        setGoogleCalendarCalendars(result.calendars ?? []);
      })
      .catch(() => {
        if (!cancelled) setGoogleCalendarCalendars([]);
      })
      .finally(() => {
        if (!cancelled) setGoogleCalendarCalendarsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    canLoadIntegrationData,
    googleCalendarConnection?.id,
    googleCalendarConnection?.status,
    googleCalendarRegistry?.featureFlagEnabled,
  ]);

  useEffect(() => {
    if (!canLoadAutomationInsights) return;
    let cancelled = false;
    getAutomationSummary()
      .then((result) => {
        if (cancelled || result.error) return;
        setAutomationSummary(result.data as typeof automationSummary);
        setAutomationInsightsRefreshedAt(Date.now());
      })
      .catch(() => {
        if (!cancelled) setAutomationSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canLoadAutomationInsights, getAutomationSummary]);

  useEffect(() => {
    if (!canLoadAutomationInsights) return;
    let cancelled = false;
    getAutomationFeed({ limit: 12 })
      .then((result) => {
        if (cancelled || result.error) return;
        setAutomationFeed((result.data?.records as AutomationFeedRecord[] | undefined) ?? []);
        setAutomationInsightsRefreshedAt(Date.now());
      })
      .catch(() => {
        if (!cancelled) setAutomationFeed([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canLoadAutomationInsights, getAutomationFeed]);

  useEffect(() => {
    if (!canLoadAutomationInsights) return;
    void getWorkerHealth();
  }, [canLoadAutomationInsights, getWorkerHealth]);

  useEffect(() => {
    if (!canLoadAutomationInsights) return;
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        await refreshAutomationInsights({ quiet: true });
      } catch {
        if (!cancelled) {
          // Leave the existing automation data in place if a background refresh fails.
        }
      }
    };
    const interval = window.setInterval(() => {
      void tick();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [canLoadAutomationInsights, refreshAutomationInsights]);

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

  const handleFieldChange = (
    field: keyof BusinessSettingsFormData,
    value: string | number | boolean | number[]
  ) => {
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
    field:
      | "uncontactedLeadHours"
      | "appointmentReminderHours"
      | "abandonedQuoteHours"
      | "reviewRequestDelayHours"
      | "lapsedClientMonths",
    value: string
  ) => {
    const trimmed = value.trim();
    const parsed = Number.parseInt(trimmed, 10);
    const nextValue = Number.isFinite(parsed) ? parsed : 0;
    setAutomationSettings((current) => ({ ...current, [field]: nextValue }));
  };

  const normalizeAutomationNumberInput = (
    field:
      | "uncontactedLeadHours"
      | "appointmentReminderHours"
      | "abandonedQuoteHours"
      | "reviewRequestDelayHours"
      | "lapsedClientMonths"
  ) => {
    setAutomationSettings((current) => {
      const rawValue = current[field];
      const minimum = 1;
      const maximum = field === "lapsedClientMonths" ? 36 : field === "uncontactedLeadHours" ? 168 : 336;
      const nextValue = Number.isFinite(rawValue) ? Math.min(Math.max(rawValue, minimum), maximum) : minimum;
      if (field === "uncontactedLeadHours") {
        setUncontactedLeadHoursInput(String(nextValue));
      } else if (field === "appointmentReminderHours") {
        setAppointmentReminderHoursInput(String(nextValue));
      } else if (field === "abandonedQuoteHours") {
        setAbandonedQuoteHoursInput(String(nextValue));
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
    if (automationSettings.sendWindowStartHour === automationSettings.sendWindowEndHour) {
      toast.error("Automation send window start and end hours cannot be the same.");
      return;
    }
    if (automationSettings.reviewRequestsEnabled && !automationSettings.reviewRequestUrl.trim()) {
      toast.error("Add a review link before enabling review request automations.");
      return;
    }
    if (automationSettings.lapsedClientsEnabled && !automationSettings.bookingRequestUrl.trim()) {
      toast.error("Add a booking link before enabling lapsed client automations.");
      return;
    }
    try {
      const updatedBusiness = await update({
        id: business.id,
        leadCaptureEnabled: automationSettings.leadCaptureEnabled,
        leadAutoResponseEnabled: automationSettings.leadAutoResponseEnabled,
        leadAutoResponseEmailEnabled: automationSettings.leadAutoResponseEmailEnabled,
        leadAutoResponseSmsEnabled: automationSettings.leadAutoResponseSmsEnabled,
        notificationAppointmentConfirmationEmailEnabled: automationSettings.appointmentConfirmationEmailEnabled,
        missedCallTextBackEnabled: automationSettings.missedCallTextBackEnabled,
        automationUncontactedLeadsEnabled: automationSettings.uncontactedLeadsEnabled,
        automationUncontactedLeadHours: automationSettings.uncontactedLeadHours,
        automationAppointmentRemindersEnabled: automationSettings.appointmentRemindersEnabled,
        notificationAppointmentReminderEmailEnabled: automationSettings.appointmentReminderEmailEnabled,
        automationAppointmentReminderHours: automationSettings.appointmentReminderHours,
        automationSendWindowStartHour: automationSettings.sendWindowStartHour,
        automationSendWindowEndHour: automationSettings.sendWindowEndHour,
        automationAbandonedQuotesEnabled: automationSettings.abandonedQuotesEnabled,
        notificationAbandonedQuoteEmailEnabled: automationSettings.abandonedQuoteEmailEnabled,
        automationAbandonedQuoteHours: automationSettings.abandonedQuoteHours,
        automationReviewRequestsEnabled: automationSettings.reviewRequestsEnabled,
        notificationReviewRequestEmailEnabled: automationSettings.reviewRequestEmailEnabled,
        automationReviewRequestDelayHours: automationSettings.reviewRequestDelayHours,
        reviewRequestUrl: automationSettings.reviewRequestUrl.trim() || null,
        automationLapsedClientsEnabled: automationSettings.lapsedClientsEnabled,
        notificationLapsedClientEmailEnabled: automationSettings.lapsedClientEmailEnabled,
        automationLapsedClientMonths: automationSettings.lapsedClientMonths,
        bookingRequestUrl: automationSettings.bookingRequestUrl.trim() || null,
      });
      const persistedLeadCaptureEnabled =
        typeof (updatedBusiness as { leadCaptureEnabled?: unknown } | null)?.leadCaptureEnabled === "boolean"
          ? Boolean((updatedBusiness as { leadCaptureEnabled?: boolean }).leadCaptureEnabled)
          : null;
      if (
        persistedLeadCaptureEnabled !== null &&
        persistedLeadCaptureEnabled !== automationSettings.leadCaptureEnabled
      ) {
        throw new Error(
          "Lead capture did not persist. The backend deploy or database migration is likely still behind this settings screen."
        );
      }
      await refreshAutomationInsights();
      toast.success("Automation settings saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Automation settings could not be saved."
      );
    }
  };

  const handleSaveIntegrationSettings = async () => {
    if (!business?.id) return;
    if (integrationSettings.webhookEnabled && !integrationSettings.webhookUrl.trim()) {
      toast.error("Add a webhook endpoint URL before enabling signed webhooks.");
      return;
    }
    const trimmedSecret = integrationSettings.webhookSecret.trim();
    const payload: Record<string, unknown> = {
      id: business.id,
      integrationWebhookEnabled: integrationSettings.webhookEnabled,
      integrationWebhookUrl: integrationSettings.webhookUrl.trim() || null,
      integrationWebhookEvents: integrationSettings.webhookEvents,
    };
    if (trimmedSecret) {
      payload.integrationWebhookSecret = trimmedSecret;
    }
    await update(payload);
    await refetchIntegrationStatus();
    toast.success("Integration settings saved");
  };

  const handleCopyPublicLeadCaptureLink = async () => {
    if (!publicLeadCaptureUrl) return;
    const copied = await copyTextWithFallback(publicLeadCaptureUrl);
    if (copied) {
      toast.success("Lead form link copied");
      return;
    }
    toast.error("Could not copy lead form link.");
  };

  const handleSendOutboundWebhookTest = async () => {
    setOutboundWebhookTesting(true);
    try {
      await api.integration.sendOutboundWebhookTest();
      await Promise.all([refetchIntegrationFailures(), refetchIntegrationStatus(), refetchOutboundWebhookActivity()]);
      toast.success("Queued a signed webhook test event.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue a signed webhook test.");
    } finally {
      setOutboundWebhookTesting(false);
    }
  };

  const handleReplayOutboundWebhook = async (activityLogId: string) => {
    setOutboundWebhookReplayId(activityLogId);
    try {
      await api.integration.replayOutboundWebhook({ activityLogId });
      await Promise.all([refetchIntegrationFailures(), refetchIntegrationStatus(), refetchOutboundWebhookActivity()]);
      toast.success("Queued a replay for that webhook event.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not replay that webhook event.");
    } finally {
      setOutboundWebhookReplayId((current) => (current === activityLogId ? null : current));
    }
  };

  const handleRetryIntegrationJob = async (id: string) => {
    const result = await retryIntegrationJob({ id });
    if (result.error) {
      toast.error(result.error.message ?? "Could not retry integration job.");
      return;
    }
    await Promise.all([refetchIntegrationFailures(), refetchIntegrationStatus()]);
    toast.success("Integration job moved back into the retry queue.");
  };

  const handleStartQuickBooks = async () => {
    setQuickBooksConnecting(true);
    try {
      const result = await api.integration.startQuickBooks();
      if (!result.url) {
        throw new Error("QuickBooks did not return an authorization URL.");
      }
      window.location.href = result.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start QuickBooks setup.");
    } finally {
      setQuickBooksConnecting(false);
    }
  };

  const handleStartGoogleCalendar = async () => {
    setGoogleCalendarConnecting(true);
    try {
      const result = await api.integration.startGoogleCalendar();
      if (!result.url) {
        throw new Error("Google Calendar did not return an authorization URL.");
      }
      window.location.href = result.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start Google Calendar setup.");
    } finally {
      setGoogleCalendarConnecting(false);
    }
  };

  const handleSelectGoogleCalendar = async (calendarId: string) => {
    if (!calendarId) return;
    setGoogleCalendarSaving(true);
    try {
      await api.integration.selectGoogleCalendar({ calendarId });
      await Promise.all([refetchIntegrationStatus(), refetchIntegrationFailures()]);
      const refreshed = await api.integration.listGoogleCalendars();
      setGoogleCalendarCalendars(refreshed.calendars ?? []);
      toast.success("Google Calendar selection saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the selected Google Calendar.");
    } finally {
      setGoogleCalendarSaving(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    setGoogleCalendarDisconnecting(true);
    try {
      await api.integration.disconnectGoogleCalendar();
      await Promise.all([refetchIntegrationStatus(), refetchIntegrationFailures()]);
      setGoogleCalendarCalendars([]);
      toast.success("Google Calendar disconnected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect Google Calendar.");
    } finally {
      setGoogleCalendarDisconnecting(false);
    }
  };

  const handleResyncGoogleCalendar = async () => {
    setGoogleCalendarResyncing(true);
    try {
      const result = await api.integration.resyncGoogleCalendar();
      await Promise.all([refetchIntegrationStatus(), refetchIntegrationFailures()]);
      toast.success(`Queued ${result.queuedJobs} Google Calendar sync jobs across ${result.appointments} appointments.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue a Google Calendar resync.");
    } finally {
      setGoogleCalendarResyncing(false);
    }
  };

  const handleDisconnectQuickBooks = async () => {
    setQuickBooksDisconnecting(true);
    try {
      await api.integration.disconnectQuickBooks();
      await Promise.all([refetchIntegrationStatus(), refetchIntegrationFailures()]);
      toast.success("QuickBooks disconnected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect QuickBooks.");
    } finally {
      setQuickBooksDisconnecting(false);
    }
  };

  const handleResyncQuickBooks = async () => {
    setQuickBooksResyncing(true);
    try {
      const result = await api.integration.resyncQuickBooks();
      await Promise.all([refetchIntegrationStatus(), refetchIntegrationFailures()]);
      toast.success(
        `Queued ${result.queuedJobs} QuickBooks sync jobs across ${result.clients} customers, ${result.invoices} invoices, and ${result.payments} payments.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue a QuickBooks resync.");
    } finally {
      setQuickBooksResyncing(false);
    }
  };

  const handleToggleTwilioTemplate = (
    templateSlug: TwilioSmsSettingsForm["enabledTemplateSlugs"][number],
    enabled: boolean
  ) => {
    setTwilioSettings((current) => {
      const next = new Set(current.enabledTemplateSlugs);
      if (enabled) {
        next.add(templateSlug);
      } else {
        next.delete(templateSlug);
      }
      return {
        ...current,
        enabledTemplateSlugs: Array.from(next) as TwilioSmsSettingsForm["enabledTemplateSlugs"],
      };
    });
  };

  const handleSaveTwilio = async () => {
    setTwilioSaving(true);
    try {
      await api.integration.connectTwilio({
        accountSid: twilioSettings.accountSid.trim(),
        authToken: twilioSettings.authToken.trim() || undefined,
        messagingServiceSid: twilioSettings.messagingServiceSid.trim(),
        enabledTemplateSlugs: twilioSettings.enabledTemplateSlugs,
      });
      await Promise.all([refetchIntegrationStatus(), refetchIntegrationFailures()]);
      setTwilioSettings((current) => ({ ...current, authToken: "" }));
      toast.success(twilioConnection ? "Twilio settings saved." : "Twilio SMS connected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save Twilio SMS settings.");
    } finally {
      setTwilioSaving(false);
    }
  };

  const handleDisconnectTwilio = async () => {
    setTwilioDisconnecting(true);
    try {
      await api.integration.disconnectTwilio();
      await Promise.all([refetchIntegrationStatus(), refetchIntegrationFailures()]);
      setTwilioSettings(DEFAULT_TWILIO_SMS_SETTINGS);
      toast.success("Twilio SMS disconnected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect Twilio SMS.");
    } finally {
      setTwilioDisconnecting(false);
    }
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
        defaultAppointmentStartTime: formData.defaultAppointmentStartTime,
        currency: formData.currency || "USD",
        appointmentBufferMinutes: formData.appointmentBufferMinutes,
        calendarBlockCapacityPerSlot: formData.calendarBlockCapacityPerSlot,
        timezone: formData.timezone || null,
        bookingAvailableDays: formData.bookingAvailableDays,
        bookingAvailableStartTime: formData.bookingAvailableStartTime || null,
        bookingAvailableEndTime: formData.bookingAvailableEndTime || null,
      });
      toast.success("Settings saved successfully.");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save settings. Please try again.");
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
          subtitle="Set up your shop, team, billing, and diagnostics without digging through separate tools."
          badge={
            business?.name ? (
              <Badge variant="outline" className="hidden sm:inline-flex">
                {business.name}
              </Badge>
            ) : undefined
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex h-auto w-full gap-2 overflow-x-auto bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-7 sm:overflow-visible">
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
            <TabsTrigger
              value="account"
              className="min-w-[152px] justify-start rounded-lg border border-border bg-background px-4 py-3 text-left data-[state=active]:border-primary data-[state=active]:bg-primary/5 sm:min-w-0"
            >
              Account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-6">
            <Card className="border-destructive/20 bg-destructive/[0.03]">
              <CardHeader>
                <CardTitle>Account &amp; deletion</CardTitle>
                <CardDescription>
                  Manage your personal login methods, privacy details, and permanent account deletion from one clear place.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
                  Deleting your account permanently removes sign-in access, linked Apple or Google identities, notifications,
                  and workspace memberships. If legally required billing or tax history must remain, Strata keeps only the
                  minimum retained records in anonymized form.
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild>
                    <Link to="/profile">Open account settings</Link>
                  </Button>
                  <Button asChild variant="destructive">
                    <Link to="/profile#delete-account">Delete account</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Business Information</CardTitle>
                <CardDescription>
                  Your shop&apos;s core details shown on invoices and client-facing communications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                    <ResponsiveSelect
                      id="type"
                      value={formData.type}
                      onValueChange={(value) => handleFieldChange("type", value)}
                      placeholder="Select a type..."
                      options={BUSINESS_TYPES}
                      triggerClassName={formSelectTriggerClassName}
                    />
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  <div className="space-y-1.5">
                    <Label htmlFor="defaultAppointmentStartTime">Default Appointment Time</Label>
                    <ResponsiveSelect
                      id="defaultAppointmentStartTime"
                      value={formData.defaultAppointmentStartTime}
                      onValueChange={(value) => handleFieldChange("defaultAppointmentStartTime", value)}
                      placeholder="Select a default time..."
                      options={appointmentTimeOptions}
                      triggerClassName={formSelectTriggerClassName}
                    />
                    <p className="text-xs text-muted-foreground">
                      New appointments start here unless a calendar click or direct link pre-fills a different time.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">Public Booking Operating Days &amp; Hours</h3>
                    <p className="text-xs leading-5 text-muted-foreground">
                      These business defaults power the public booking page first. Each service can start from these hours and then be adjusted if it needs its own availability.
                    </p>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="space-y-1.5">
                      <Label>Operating days</Label>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                        {BOOKING_DAY_OPTIONS.map((day) => {
                          const checked = formData.bookingAvailableDays.includes(day.value);
                          return (
                            <label
                              key={day.value}
                              className={cn(
                                "flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                                checked
                                  ? "border-primary/35 bg-primary/10 text-primary"
                                  : "border-slate-200 bg-white text-slate-600"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() =>
                                  handleFieldChange(
                                    "bookingAvailableDays",
                                    checked
                                      ? formData.bookingAvailableDays.filter((value) => value !== day.value)
                                      : [...formData.bookingAvailableDays, day.value].sort()
                                  )
                                }
                              />
                              {day.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="bookingAvailableStartTime">Public booking start time</Label>
                        <Input
                          id="bookingAvailableStartTime"
                          type="time"
                          className={mobileTimeInputClassName}
                          value={formData.bookingAvailableStartTime}
                          onChange={(e) => handleFieldChange("bookingAvailableStartTime", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bookingAvailableEndTime">Public booking end time</Label>
                        <Input
                          id="bookingAvailableEndTime"
                          type="time"
                          className={mobileTimeInputClassName}
                          value={formData.bookingAvailableEndTime}
                          onChange={(e) => handleFieldChange("bookingAvailableEndTime", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="timezone">Timezone</Label>
                    <ResponsiveSelect
                      id="timezone"
                      value={formData.timezone}
                      onValueChange={(value) => handleFieldChange("timezone", value)}
                      placeholder="Select timezone..."
                      options={TIMEZONES}
                      triggerClassName={formSelectTriggerClassName}
                    />
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
            {integrationsBlockedByBilling ? (
              <Card>
                <CardHeader>
                  <div className="mb-1 flex items-center gap-3">
                    <div className="rounded-md bg-amber-500/10 p-2">
                      <CreditCard className="h-5 w-5 text-amber-700" />
                    </div>
                  <CardTitle>Billing access required</CardTitle>
                  </div>
                  <CardDescription>
                    {isNativeShell()
                      ? "Integrations stay read-protected until workspace billing is healthy again."
                      : "Integrations stay read-protected until billing is active again. Open Billing to restore full workspace access."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild>
                    <Link to="/settings?tab=billing">Open billing</Link>
                  </Button>
                  {isNativeShell() ? null : (
                    <Button asChild variant="outline">
                      <Link to="/subscribe">
                        {billingStatus?.accessState === "canceled" ? "Reactivate subscription" : "Open recovery"}
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : null}
            {integrationsBlockedByBilling ? null : (
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
                <div className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Integration infrastructure</p>
                      <p className="text-sm text-muted-foreground">
                        Phase 0 foundation status for provider feature flags, encrypted connection state, and background failure visibility.
                      </p>
                    </div>
                    <Badge variant="outline">
                      {integrationStatusFetching ? "Refreshing..." : `${integrationStatus?.connections.length ?? 0} connections`}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vault</p>
                      <p className="mt-2 text-sm font-medium">
                        {integrationStatus?.infrastructure.vaultConfigured ? "Configured" : "Missing"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        `INTEGRATION_VAULT_SECRET` is required for encrypted provider credentials.
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cron secret</p>
                      <p className="mt-2 text-sm font-medium">
                        {integrationStatus?.infrastructure.cronSecretConfigured ? "Configured" : "Missing"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Production queue runners are safer when `CRON_SECRET` is enforced.
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3 md:col-span-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provider readiness</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(integrationStatus?.registry ?? []).map((entry) => {
                          const backendConfigured =
                            integrationStatus?.infrastructure.providerConfiguration?.[entry.provider] ?? false;
                          return (
                            <Badge
                              key={`${entry.provider}-backend-ready`}
                              variant="outline"
                              className={backendConfigured ? "border-emerald-500/30 text-emerald-700" : "border-amber-500/30 text-amber-700"}
                            >
                              {entry.label}: {backendConfigured ? "ready" : "needs config"}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Automation activity</p>
                      <p className="mt-2 text-sm font-medium">
                        {workerHealthFetching && !workerHealth
                          ? "Refreshing..."
                          : `${workerHealth?.automations.sentLast24Hours ?? 0} sent • ${workerHealth?.automations.skippedLast24Hours ?? 0} skipped / 24h`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last activity: {formatWorkerTimestamp(workerHealth?.automations.lastActivityAt ?? null, "No recent automation sends")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last skip: {formatWorkerTimestamp(workerHealth?.automations.lastSkippedAt ?? null, "No recent automation skips")}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Automation failures</p>
                      <p className="mt-2 text-sm font-medium">
                        {workerHealthFetching && !workerHealth ? "Refreshing..." : `${workerHealth?.automations.failedLast24Hours ?? 0} failed / 24h`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last failure: {formatWorkerTimestamp(workerHealth?.automations.lastFailureAt ?? null, "No recent automation failures")}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Integration queue</p>
                      <p className="mt-2 text-sm font-medium">
                        {workerHealthFetching && !workerHealth
                          ? "Refreshing..."
                          : `${workerHealth?.integrations.pendingJobs ?? 0} pending • ${workerHealth?.integrations.processingJobs ?? 0} processing`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last attempt: {formatWorkerTimestamp(workerHealth?.integrations.lastAttemptAt ?? null, "No recent integration attempts")}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Queue failures</p>
                      <p className="mt-2 text-sm font-medium">
                        {workerHealthFetching && !workerHealth
                          ? "Refreshing..."
                          : `${workerHealth?.integrations.failedJobs ?? 0} failed • ${workerHealth?.integrations.deadLetterJobs ?? 0} dead letter`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Use the failure panel below to retry or inspect stuck provider work.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {(integrationStatus?.registry ?? []).map((entry) => {
                      const connection = integrationStatus?.connections.find((item) => item.provider === entry.provider);
                      const backendConfigured =
                        integrationStatus?.infrastructure.providerConfiguration?.[entry.provider] ?? false;
                      return (
                        <div key={entry.provider} className="rounded-lg border bg-muted/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{entry.label}</p>
                              <p className="text-xs text-muted-foreground">{entry.description}</p>
                              {!backendConfigured ? (
                                <p className="text-[11px] text-amber-700">Server configuration is incomplete for this provider.</p>
                              ) : null}
                            </div>
                            <Badge variant={connection ? getConnectionBadgeVariant(connection.status) : "outline"}>
                              {!entry.featureFlagEnabled
                                ? "Flag off"
                                : connection
                                  ? connection.status.replace(/_/g, " ")
                                  : "Not connected"}
                            </Badge>
                          </div>
                          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                            <p>Owner scope: {entry.ownerType === "user" ? "Per user" : "Per business"}</p>
                            <p>
                              Tokens encrypted:{" "}
                              {connection?.configSummary.hasEncryptedAccessToken || connection?.configSummary.hasEncryptedRefreshToken
                                ? "Yes"
                                : "No"}
                            </p>
                            <p>
                              Last success:{" "}
                              {connection?.lastSuccessfulAt
                                ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
                                    new Date(connection.lastSuccessfulAt)
                                  )
                                : "None yet"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium">QuickBooks Online</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          One-way sync from Strata into QuickBooks Online for customers, invoices, and recorded payments.
                        </p>
                      </div>
                      <Badge
                        variant={
                          !quickBooksRegistry?.featureFlagEnabled
                            ? "outline"
                            : quickBooksConnection
                              ? getConnectionBadgeVariant(quickBooksConnection.status)
                              : "secondary"
                        }
                      >
                        {!quickBooksRegistry?.featureFlagEnabled
                          ? "Flag off"
                          : quickBooksConnection
                            ? quickBooksConnection.status.replace(/_/g, " ")
                            : "Not connected"}
                      </Badge>
                    </div>
                    <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                      <p>Control scope: Owners and admins only.</p>
                      <p>
                        Company realm:{" "}
                        {quickBooksConnection?.externalAccountId ? (
                          <span className="font-mono">{quickBooksConnection.externalAccountId}</span>
                        ) : (
                          "Not linked yet"
                        )}
                      </p>
                      <p>
                        Last successful sync:{" "}
                        {quickBooksConnection?.lastSuccessfulAt
                          ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
                              new Date(quickBooksConnection.lastSuccessfulAt)
                            )
                          : "None yet"}
                      </p>
                      {quickBooksConnection?.lastError ? (
                        <p className="text-amber-700">{quickBooksConnection.lastError}</p>
                      ) : null}
                      {!quickBooksBackendConfigured ? (
                        <p className="text-amber-700">
                          QuickBooks setup is unavailable until encrypted integration storage and server credentials are configured.
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button
                        onClick={handleStartQuickBooks}
                        disabled={
                          !canManageBusinessIntegrations ||
                          !quickBooksRegistry?.featureFlagEnabled ||
                          !quickBooksBackendConfigured ||
                          quickBooksConnecting
                        }
                        className="w-full sm:w-auto"
                      >
                        {quickBooksConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {quickBooksConnection?.status === "connected" ? "Reconnect QuickBooks" : "Connect QuickBooks"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleResyncQuickBooks}
                        disabled={!canManageBusinessIntegrations || quickBooksConnection?.status !== "connected" || quickBooksResyncing}
                        className="w-full sm:w-auto"
                      >
                        {quickBooksResyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Queue full resync
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleDisconnectQuickBooks}
                        disabled={!canManageBusinessIntegrations || !quickBooksConnection || quickBooksDisconnecting}
                        className="w-full sm:w-auto"
                      >
                        {quickBooksDisconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Disconnect
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <ExternalLink className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium">Google Calendar</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          One-way appointment sync into your selected Google Calendar. Strata stays the source of truth.
                        </p>
                      </div>
                      <Badge
                        variant={
                          !googleCalendarRegistry?.featureFlagEnabled
                            ? "outline"
                            : googleCalendarConnection
                              ? getConnectionBadgeVariant(googleCalendarConnection.status)
                              : "secondary"
                        }
                      >
                        {!googleCalendarRegistry?.featureFlagEnabled
                          ? "Flag off"
                          : googleCalendarConnection
                            ? googleCalendarConnection.status.replace(/_/g, " ")
                            : "Not connected"}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div className="space-y-1.5">
                        <Label>Connected calendar</Label>
                        <Select
                          value={googleCalendarConnection?.configSummary.selectedCalendarId ?? ""}
                          onValueChange={handleSelectGoogleCalendar}
                          disabled={
                            !canEditSettings ||
                            !googleCalendarConnection ||
                            googleCalendarCalendarsLoading ||
                            googleCalendarSaving ||
                            googleCalendarCalendars.length === 0
                          }
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                googleCalendarCalendarsLoading
                                  ? "Loading calendars..."
                                  : googleCalendarConnection
                                    ? "Select a Google Calendar"
                                    : "Connect Google Calendar first"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {googleCalendarCalendars.map((calendar) => (
                              <SelectItem key={calendar.id} value={calendar.id}>
                                {calendar.summary}
                                {calendar.primary ? " (Primary)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Only writable calendars from your Google account are listed here.
                        </p>
                      </div>
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <p>Control scope: Your user account only.</p>
                        <p>
                          Selected calendar:{" "}
                          {googleCalendarConnection?.configSummary.selectedCalendarSummary ?? "Not selected"}
                        </p>
                        <p>
                          Last successful sync:{" "}
                          {googleCalendarConnection?.lastSuccessfulAt
                            ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
                                new Date(googleCalendarConnection.lastSuccessfulAt)
                              )
                            : "None yet"}
                        </p>
                        {googleCalendarConnection?.lastError ? (
                          <p className="text-amber-700">{googleCalendarConnection.lastError}</p>
                        ) : null}
                        {!googleCalendarBackendConfigured ? (
                          <p className="text-amber-700">
                            Google Calendar setup is unavailable until encrypted integration storage and Google OAuth config are live.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button
                        onClick={handleStartGoogleCalendar}
                        disabled={
                          !canEditSettings ||
                          !googleCalendarRegistry?.featureFlagEnabled ||
                          !googleCalendarBackendConfigured ||
                          googleCalendarConnecting
                        }
                        className="w-full sm:w-auto"
                      >
                        {googleCalendarConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {googleCalendarConnection?.status === "connected" ? "Reconnect Google Calendar" : "Connect Google Calendar"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleResyncGoogleCalendar}
                        disabled={!canEditSettings || googleCalendarConnection?.status !== "connected" || googleCalendarResyncing}
                        className="w-full sm:w-auto"
                      >
                        {googleCalendarResyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Queue full resync
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleDisconnectGoogleCalendar}
                        disabled={!canEditSettings || !googleCalendarConnection || googleCalendarDisconnecting}
                        className="w-full sm:w-auto"
                      >
                        {googleCalendarDisconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Disconnect
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <BellRing className="h-4 w-4 text-primary" />
                          <p className="text-sm font-medium">Twilio SMS</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Transactional SMS for confirmations, reminders, receipts, and automation follow-up with callback-backed delivery tracking.
                        </p>
                      </div>
                      <Badge
                        variant={
                          !twilioRegistry?.featureFlagEnabled
                            ? "outline"
                            : twilioConnection
                              ? getConnectionBadgeVariant(twilioConnection.status)
                              : "secondary"
                        }
                      >
                        {!twilioRegistry?.featureFlagEnabled
                          ? "Flag off"
                          : twilioConnection
                            ? twilioConnection.status.replace(/_/g, " ")
                            : "Not connected"}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Twilio Account SID</Label>
                          <Input
                            value={twilioSettings.accountSid}
                            onChange={(e) => setTwilioSettings((current) => ({ ...current, accountSid: e.target.value }))}
                            placeholder="AC..."
                            disabled={!canManageBusinessIntegrations}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Messaging Service SID</Label>
                          <Input
                            value={twilioSettings.messagingServiceSid}
                            onChange={(e) =>
                              setTwilioSettings((current) => ({ ...current, messagingServiceSid: e.target.value }))
                            }
                            placeholder="MG..."
                            disabled={!canManageBusinessIntegrations}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>{twilioConnection ? "Rotate Auth Token" : "Twilio Auth Token"}</Label>
                        <Input
                          type="password"
                          value={twilioSettings.authToken}
                          onChange={(e) => setTwilioSettings((current) => ({ ...current, authToken: e.target.value }))}
                          placeholder={twilioConnection ? "Leave blank to keep the stored token" : "Your Twilio auth token"}
                          disabled={!canManageBusinessIntegrations}
                        />
                        <p className="text-xs text-muted-foreground">
                          Stored encrypted in Strata. Status callbacks are validated against this token before delivery updates are accepted.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Enabled SMS templates</Label>
                        <div className="grid gap-3">
                          {TWILIO_TEMPLATE_OPTIONS.map((option) => {
                            const checked = twilioSettings.enabledTemplateSlugs.includes(option.value);
                            return (
                              <div key={option.value} className="rounded-lg border bg-background p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium">{option.label}</p>
                                    <p className="text-xs text-muted-foreground">{option.helper}</p>
                                  </div>
                                  <Switch
                                    checked={checked}
                                    onCheckedChange={(value) => handleToggleTwilioTemplate(option.value, value)}
                                    disabled={!canManageBusinessIntegrations}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <p>Control scope: Owners and admins only.</p>
                        <p>
                          Stored service:{" "}
                          {twilioConnection?.configSummary.twilioMessagingServiceSid ? (
                            <span className="font-mono">{twilioConnection.configSummary.twilioMessagingServiceSid}</span>
                          ) : (
                            "Not linked yet"
                          )}
                        </p>
                        <p>
                          Last successful send:{" "}
                          {twilioConnection?.lastSuccessfulAt
                            ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
                                new Date(twilioConnection.lastSuccessfulAt)
                              )
                            : "None yet"}
                        </p>
                        <p>Delivery callbacks land in notification logs and update SMS status without trusting false success states.</p>
                        {twilioConnection?.lastError ? <p className="text-amber-700">{twilioConnection.lastError}</p> : null}
                        {!twilioBackendConfigured ? (
                          <p className="text-amber-700">
                            Twilio SMS setup is unavailable until encrypted integration storage and callback/server config are live.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button
                        onClick={handleSaveTwilio}
                        disabled={
                          !canManageBusinessIntegrations ||
                          !twilioRegistry?.featureFlagEnabled ||
                          !twilioBackendConfigured ||
                          twilioSaving
                        }
                        className="w-full sm:w-auto"
                      >
                        {twilioSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {twilioConnection?.status === "connected" ? "Save Twilio SMS" : "Connect Twilio SMS"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleDisconnectTwilio}
                        disabled={!canManageBusinessIntegrations || !twilioConnection || twilioDisconnecting}
                        className="w-full sm:w-auto"
                      >
                        {twilioDisconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Disconnect
                      </Button>
                    </div>
                  </div>

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

                {!vaultConfigured ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Integration connections stay read-only until <span className="font-mono">INTEGRATION_VAULT_SECRET</span> is configured in production.
                  </div>
                ) : null}

                <div className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Failure visibility</p>
                      <p className="text-sm text-muted-foreground">
                        Dead-letter and retry visibility for background integration work, including queued QuickBooks sync retries.
                      </p>
                    </div>
                    <Badge variant={integrationFailures.length > 0 ? "secondary" : "outline"}>
                      {integrationFailuresFetching ? "Loading..." : `${integrationFailures.length} queued issues`}
                    </Badge>
                  </div>
                  {integrationFailures.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                      No failed or dead-lettered integration jobs are recorded for this business yet.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {integrationFailures.map((failure) => (
                        <div
                          key={failure.id}
                          className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 lg:flex-row lg:items-start lg:justify-between"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">{formatProviderLabel(failure.provider)}</p>
                              <Badge variant={failure.status === "dead_letter" ? "destructive" : "secondary"}>
                                {failure.status.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {failure.jobType} • attempts {failure.attemptCount}/{failure.maxAttempts}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {failure.lastError ?? "No error detail captured."}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                            <p className="text-xs text-muted-foreground">
                              Next retry:{" "}
                              {failure.nextRunAt
                                ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
                                    new Date(failure.nextRunAt)
                                  )
                                : "Not scheduled"}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetryIntegrationJob(failure.id)}
                              disabled={!canEditSettings || retryingIntegrationJob}
                            >
                              Retry
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Connection</p>
                      <p className="mt-2 text-sm font-medium">
                        {outboundWebhookConnection?.status === "connected"
                          ? "Connected"
                          : outboundWebhookConnection?.status === "error"
                            ? "Needs attention"
                            : "Not connected"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {outboundWebhookRegistry?.featureFlagEnabled
                          ? "Queue-backed delivery with retries and replay."
                          : "Feature flag disabled in this environment."}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Endpoint</p>
                      <p className="mt-2 text-sm font-medium break-all">
                        {outboundWebhookConnection?.configSummary.webhookUrl || integrationSettings.webhookUrl || "Not set"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last success:{" "}
                        {outboundWebhookConnection?.lastSuccessfulAt
                          ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
                              new Date(outboundWebhookConnection.lastSuccessfulAt)
                            )
                          : "None yet"}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery health</p>
                      <p className="mt-2 text-sm font-medium">
                        {integrationFailures.filter((failure) => failure.provider === "outbound_webhooks").length} failed jobs
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {outboundWebhookConnection?.lastError || "No recent webhook delivery errors."}
                      </p>
                    </div>
                  </div>
                  {!outboundWebhooksBackendConfigured ? (
                    <p className="mt-3 text-xs text-amber-700">
                      Signed webhook testing and replay need encrypted integration storage before jobs can be queued safely.
                    </p>
                  ) : null}

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

                  <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <div className="rounded-lg border bg-muted/10 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <Label>Recent replayable events</Label>
                          <p className="text-xs text-muted-foreground">
                            Replay a recent Strata activity event through the signed webhook queue without recreating the customer action.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void refetchOutboundWebhookActivity()}
                          disabled={outboundWebhookActivityFetching}
                        >
                          {outboundWebhookActivityFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                          Refresh
                        </Button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {outboundWebhookActivity.length === 0 ? (
                          <div className="rounded-lg border border-dashed bg-background p-3 text-sm text-muted-foreground">
                            No recent activity events to replay yet.
                          </div>
                        ) : (
                          outboundWebhookActivity.map((event) => (
                            <div
                              key={event.id}
                              className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="space-y-1">
                                <p className="text-sm font-medium">{event.action}</p>
                                <p className="text-xs text-muted-foreground">
                                  {event.entityType ? `${event.entityType}${event.entityId ? ` • ${event.entityId}` : ""}` : "Business event"} •{" "}
                                  {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
                                    new Date(event.createdAt)
                                  )}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleReplayOutboundWebhook(event.id)}
                                disabled={
                                  !canManageBusinessIntegrations ||
                                  !outboundWebhooksBackendConfigured ||
                                  outboundWebhookReplayId === event.id
                                }
                              >
                                {outboundWebhookReplayId === event.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Replay
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-muted/10 p-4">
                      <p className="text-sm font-medium">Live test</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Queue a signed test event to verify your endpoint, signature validation, and downstream automation path.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 w-full"
                        onClick={handleSendOutboundWebhookTest}
                        disabled={
                          !canManageBusinessIntegrations ||
                          !outboundWebhookRegistry?.featureFlagEnabled ||
                          !outboundWebhooksBackendConfigured ||
                          outboundWebhookTesting
                        }
                      >
                        {outboundWebhookTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Send test event
                      </Button>
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        Test and replay deliveries use the same retry, failure, and dead-letter path as live events.
                      </p>
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
            )}
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border bg-background p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Lead follow-up</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {automationSummaryFetching && !automationSummary ? "..." : automationSummary?.uncontactedLeads.sentLast30Days ?? 0}
                    </p>
                    <p className={`mt-1 text-xs ${getAutomationHealthTone(automationSummary?.uncontactedLeads)}`}>
                      Sent in the last 30 days. Last send: {formatAutomationLastSent(automationSummary?.uncontactedLeads.lastSentAt ?? null)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Skipped in the last 30 days: {automationSummary?.uncontactedLeads.skippedLast30Days ?? 0}
                      {" • "}
                      Last skip: {formatAutomationLastSent(automationSummary?.uncontactedLeads.lastSkippedAt ?? null)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Failed in the last 30 days: {automationSummary?.uncontactedLeads.failedLast30Days ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-background p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Reminders</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {automationSummaryFetching && !automationSummary ? "..." : automationSummary?.appointmentReminders.sentLast30Days ?? 0}
                    </p>
                    <p className={`mt-1 text-xs ${getAutomationHealthTone(automationSummary?.appointmentReminders)}`}>
                      Sent in the last 30 days. Last send: {formatAutomationLastSent(automationSummary?.appointmentReminders.lastSentAt ?? null)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Skipped in the last 30 days: {automationSummary?.appointmentReminders.skippedLast30Days ?? 0}
                      {" • "}
                      Last skip: {formatAutomationLastSent(automationSummary?.appointmentReminders.lastSkippedAt ?? null)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Failed in the last 30 days: {automationSummary?.appointmentReminders.failedLast30Days ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-background p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Quote follow-up</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {automationSummaryFetching && !automationSummary ? "..." : automationSummary?.abandonedQuotes.sentLast30Days ?? 0}
                    </p>
                    <p className={`mt-1 text-xs ${getAutomationHealthTone(automationSummary?.abandonedQuotes)}`}>
                      Sent in the last 30 days. Last send: {formatAutomationLastSent(automationSummary?.abandonedQuotes.lastSentAt ?? null)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Skipped in the last 30 days: {automationSummary?.abandonedQuotes.skippedLast30Days ?? 0}
                      {" • "}
                      Last skip: {formatAutomationLastSent(automationSummary?.abandonedQuotes.lastSkippedAt ?? null)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Failed in the last 30 days: {automationSummary?.abandonedQuotes.failedLast30Days ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-background p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Reviews</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {automationSummaryFetching && !automationSummary ? "..." : automationSummary?.reviewRequests.sentLast30Days ?? 0}
                    </p>
                    <p className={`mt-1 text-xs ${getAutomationHealthTone(automationSummary?.reviewRequests)}`}>
                      Sent in the last 30 days. Last send: {formatAutomationLastSent(automationSummary?.reviewRequests.lastSentAt ?? null)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Skipped in the last 30 days: {automationSummary?.reviewRequests.skippedLast30Days ?? 0}
                      {" • "}
                      Last skip: {formatAutomationLastSent(automationSummary?.reviewRequests.lastSkippedAt ?? null)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Failed in the last 30 days: {automationSummary?.reviewRequests.failedLast30Days ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-background p-4 md:col-span-2 xl:col-span-1">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Lapsed outreach</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {automationSummaryFetching && !automationSummary ? "..." : automationSummary?.lapsedClients.sentLast30Days ?? 0}
                    </p>
                    <p className={`mt-1 text-xs ${getAutomationHealthTone(automationSummary?.lapsedClients)}`}>
                      Sent in the last 30 days. Last send: {formatAutomationLastSent(automationSummary?.lapsedClients.lastSentAt ?? null)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Skipped in the last 30 days: {automationSummary?.lapsedClients.skippedLast30Days ?? 0}
                      {" • "}
                      Last skip: {formatAutomationLastSent(automationSummary?.lapsedClients.lastSkippedAt ?? null)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Failed in the last 30 days: {automationSummary?.lapsedClients.failedLast30Days ?? 0}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Recent automation activity</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Recent sends and delivery failures across email and SMS so you can spot real automation behavior without digging through raw logs.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last refreshed: {formatAutomationRefreshTimestamp(automationInsightsRefreshedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void refreshAutomationInsights()}
                        disabled={automationInsightsRefreshing}
                      >
                        {automationInsightsRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Refresh activity
                      </Button>
                      <Badge variant="outline" className="self-start">
                        Last 12 events
                      </Badge>
                      <Badge variant="secondary" className="self-start">
                        Showing {filteredAutomationFeed.length}
                      </Badge>
                      <Badge variant="secondary" className="self-start">
                        {automationFeedIssueCount} issues
                      </Badge>
                      <Badge variant="secondary" className="self-start">
                        {automationFeedSmsCount} SMS
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={automationFeedFilter === "all" ? "default" : "outline"}
                        onClick={() => setAutomationFeedFilter("all")}
                      >
                        All activity
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={automationFeedFilter === "issues" ? "default" : "outline"}
                        onClick={() => setAutomationFeedFilter("issues")}
                      >
                        Issues only
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={automationFeedFilter === "sent" ? "default" : "outline"}
                        onClick={() => setAutomationFeedFilter("sent")}
                      >
                        Sent only
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-2 sm:max-w-xs">
                        <Label htmlFor="automation-feed-filter">Automation</Label>
                        <Select
                          value={automationFeedAutomationFilter}
                          onValueChange={(value) =>
                            setAutomationFeedAutomationFilter(value as AutomationFeedAutomationFilter)
                          }
                        >
                          <SelectTrigger id="automation-feed-filter">
                            <SelectValue placeholder="All automations" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All automations</SelectItem>
                            <SelectItem value="uncontacted_lead">Uncontacted lead follow-up</SelectItem>
                            <SelectItem value="appointment_reminder">Appointment reminders</SelectItem>
                            <SelectItem value="abandoned_quote">Abandoned quote follow-up</SelectItem>
                            <SelectItem value="review_request">Review requests</SelectItem>
                            <SelectItem value="lapsed_client">Lapsed outreach</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2 sm:max-w-xs">
                        <Label htmlFor="automation-feed-channel-filter">Channel</Label>
                        <Select
                          value={automationFeedChannelFilter}
                          onValueChange={(value) =>
                            setAutomationFeedChannelFilter(value as AutomationFeedChannelFilter)
                          }
                        >
                          <SelectTrigger id="automation-feed-channel-filter">
                            <SelectValue placeholder="All channels" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All channels</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="sms">SMS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {automationFeedFetching && automationFeed.length === 0 ? (
                      <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                        Loading recent automation activity...
                      </div>
                    ) : automationFeed.length === 0 ? (
                      <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                        No recent automation sends or delivery failures yet.
                      </div>
                    ) : filteredAutomationFeed.length === 0 ? (
                      <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                        No automation activity matches the current filters.
                      </div>
                    ) : (
                      filteredAutomationFeed.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant={
                                  entry.kind === "failed"
                                    ? "destructive"
                                    : entry.kind === "skipped"
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {entry.kind === "failed" ? "Failed" : entry.kind === "skipped" ? "Skipped" : "Sent"}
                              </Badge>
                              <Badge variant="secondary">{formatAutomationFeedLabel(entry.automationType)}</Badge>
                              <Badge variant="outline">{entry.channel.toUpperCase()}</Badge>
                            </div>
                            <p className="text-sm font-medium">{entry.message}</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.recipient ? `Recipient: ${entry.recipient}` : "Recipient unavailable"}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground sm:pl-4 sm:text-right">
                            {formatAutomationFeedTimestamp(entry.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Lead capture and first response</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Capture new website leads, acknowledge them right away, and keep a follow-up alert on the team if nobody makes contact.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="automation-lead-capture"
                        checked={automationSettings.leadCaptureEnabled}
                        onCheckedChange={(value) => handleAutomationToggle("leadCaptureEnabled", value)}
                        disabled={!canEditSettings}
                      />
                      <Label htmlFor="automation-lead-capture" className="cursor-pointer text-sm">
                        Enable
                      </Label>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <div className="rounded-xl border bg-background p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Public form link</p>
                      <p className="mt-2 break-all text-sm text-foreground/90">
                        {publicLeadCaptureUrl || "Save business settings first to generate the public lead form link."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleCopyPublicLeadCaptureLink()}
                          disabled={!publicLeadCaptureUrl}
                        >
                          Copy lead form link
                        </Button>
                        {publicLeadCaptureUrl ? (
                          <Button asChild type="button" size="sm" variant="ghost">
                            <Link to={publicLeadCaptureUrl} target="_blank" rel="noreferrer">
                              Open form
                              <ExternalLink className="ml-2 h-4 w-4" />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-3 2xl:grid-cols-2">
                      <div className="rounded-xl border bg-background p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">Instant auto-response</p>
                            <p className="mt-1 text-xs text-muted-foreground">Send an acknowledgment as soon as a new web lead is captured.</p>
                          </div>
                          <Switch
                            id="automation-lead-auto-response"
                            checked={automationSettings.leadAutoResponseEnabled}
                            onCheckedChange={(value) => handleAutomationToggle("leadAutoResponseEnabled", value)}
                            disabled={!canEditSettings}
                            className="shrink-0 self-start"
                          />
                        </div>
                        <div className="mt-4 space-y-3">
                          <div className="flex flex-col gap-3 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">Email acknowledgment</p>
                              <p className="text-xs text-muted-foreground">Uses the business contact and template system already in Strata.</p>
                            </div>
                            <Switch
                              id="automation-lead-auto-response-email"
                              checked={automationSettings.leadAutoResponseEmailEnabled}
                              onCheckedChange={(value) => handleAutomationToggle("leadAutoResponseEmailEnabled", value)}
                              disabled={!canEditSettings || !automationSettings.leadAutoResponseEnabled}
                              className="shrink-0 self-start sm:self-center"
                            />
                          </div>
                          <div className="flex flex-col gap-3 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">SMS acknowledgment</p>
                              <p className="text-xs text-muted-foreground">Queues through Twilio only when that integration is connected.</p>
                            </div>
                            <Switch
                              id="automation-lead-auto-response-sms"
                              checked={automationSettings.leadAutoResponseSmsEnabled}
                              onCheckedChange={(value) => handleAutomationToggle("leadAutoResponseSmsEnabled", value)}
                              disabled={!canEditSettings || !automationSettings.leadAutoResponseEnabled}
                              className="shrink-0 self-start sm:self-center"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border bg-background p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">Uncontacted lead reminder</p>
                            <p className="mt-1 text-xs text-muted-foreground">Alert the shop if a fresh lead is still untouched after your response window.</p>
                          </div>
                          <Switch
                            id="automation-uncontacted-leads"
                            checked={automationSettings.uncontactedLeadsEnabled}
                            onCheckedChange={(value) => handleAutomationToggle("uncontactedLeadsEnabled", value)}
                            disabled={!canEditSettings}
                            className="shrink-0 self-start"
                          />
                        </div>
                        <div className="mt-4 space-y-1.5">
                          <Label>Hours before reminder</Label>
                          <Input
                            inputMode="numeric"
                            value={uncontactedLeadHoursInput}
                            onChange={(e) => {
                              setUncontactedLeadHoursInput(e.target.value);
                              handleAutomationNumberInput("uncontactedLeadHours", e.target.value);
                            }}
                            onBlur={() => normalizeAutomationNumberInput("uncontactedLeadHours")}
                            disabled={!canEditSettings || !automationSettings.uncontactedLeadsEnabled}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Missed-call text back</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          After an inbound missed call, queue a reply text and drop the caller into the lead follow-up path.
                        </p>
                      </div>
                      <Switch
                        id="automation-missed-call-text-back"
                        checked={automationSettings.missedCallTextBackEnabled}
                        onCheckedChange={(value) => handleAutomationToggle("missedCallTextBackEnabled", value)}
                        disabled={!canEditSettings}
                      />
                    </div>
                    <div className="mt-3 rounded-lg border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
                      Point your Twilio number&apos;s voice status callback to{" "}
                      <span className="font-mono text-foreground">
                        {twilioConnection && typeof window !== "undefined"
                          ? `${window.location.origin.replace(/\/+$/, "")}/api/integrations/twilio/voice/${twilioConnection.id}`
                          : "/api/integrations/twilio/voice/<connectionId>"}
                      </span>
                      {" "}and enable the{" "}
                      <span className="font-medium text-foreground">Missed-call text back</span>
                      {" "}template in the Integrations tab.
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    Public leads save into your existing Leads flow as status <strong>New</strong>, send the first response if enabled, and then use the same automation diagnostics shown above.
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <BellRing className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Appointment confirmations</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Control the automatic confirmation email that goes out during booking and status-confirm flows without disabling manual resend actions.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="automation-appointment-confirmation-email"
                        checked={automationSettings.appointmentConfirmationEmailEnabled}
                        onCheckedChange={(value) => handleAutomationToggle("appointmentConfirmationEmailEnabled", value)}
                        disabled={!canEditSettings}
                      />
                      <Label htmlFor="automation-appointment-confirmation-email" className="cursor-pointer text-sm">
                        Email on
                      </Label>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    This only affects the automatic email. If Twilio is enabled, SMS confirmations can still queue through the Integrations template controls below.
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Automation send window</p>
                    <p className="text-sm text-muted-foreground">
                      Keep reminder, review, and re-engagement sends inside a sane local-time window for your shop.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Start hour</Label>
                      <Select
                        value={String(automationSettings.sendWindowStartHour)}
                        onValueChange={(value) =>
                          setAutomationSettings((current) => ({
                            ...current,
                            sendWindowStartHour: Number(value),
                          }))
                        }
                        disabled={!canEditSettings}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select start hour" />
                        </SelectTrigger>
                        <SelectContent>
                          {AUTOMATION_WINDOW_HOURS.map((option) => (
                            <SelectItem key={`automation-start-${option.value}`} value={String(option.value)}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>End hour</Label>
                      <Select
                        value={String(automationSettings.sendWindowEndHour)}
                        onValueChange={(value) =>
                          setAutomationSettings((current) => ({
                            ...current,
                            sendWindowEndHour: Number(value),
                          }))
                        }
                        disabled={!canEditSettings}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select end hour" />
                        </SelectTrigger>
                        <SelectContent>
                          {AUTOMATION_WINDOW_HOURS.map((option) => (
                            <SelectItem key={`automation-end-${option.value}`} value={String(option.value)}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    The window uses your business timezone. If the end hour is earlier than the start hour, Strata treats it as an overnight window.
                  </div>
                </div>

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
                    <p className="text-xs text-muted-foreground sm:pb-2">
                      Reminders send automatically before scheduled or confirmed visits based on this timing.
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Switch
                      id="automation-appointment-reminder-email"
                      checked={automationSettings.appointmentReminderEmailEnabled}
                      onCheckedChange={(value) => handleAutomationToggle("appointmentReminderEmailEnabled", value)}
                      disabled={!canEditSettings || !automationSettings.appointmentRemindersEnabled}
                    />
                    <Label htmlFor="automation-appointment-reminder-email" className="cursor-pointer text-sm">
                      Send reminder emails
                    </Label>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Abandoned quote follow-up</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Reconnect with clients who received a quote but have not responded yet so more sent estimates turn into booked work.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="automation-abandoned-quotes"
                        checked={automationSettings.abandonedQuotesEnabled}
                        onCheckedChange={(value) => handleAutomationToggle("abandonedQuotesEnabled", value)}
                        disabled={!canEditSettings}
                      />
                      <Label htmlFor="automation-abandoned-quotes" className="cursor-pointer text-sm">
                        Enable
                      </Label>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-end">
                    <div className="space-y-1.5">
                      <Label>Hours after quote send</Label>
                      <Input
                        inputMode="numeric"
                        value={abandonedQuoteHoursInput}
                        onChange={(e) => {
                          setAbandonedQuoteHoursInput(e.target.value);
                          handleAutomationNumberInput("abandonedQuoteHours", e.target.value);
                        }}
                        onBlur={() => normalizeAutomationNumberInput("abandonedQuoteHours")}
                        disabled={!canEditSettings}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground sm:pb-2">
                      Only sent quotes with no existing follow-up are targeted, and Strata reuses the same secure public quote link as the manual follow-up flow.
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Switch
                      id="automation-abandoned-quote-email"
                      checked={automationSettings.abandonedQuoteEmailEnabled}
                      onCheckedChange={(value) => handleAutomationToggle("abandonedQuoteEmailEnabled", value)}
                      disabled={!canEditSettings || !automationSettings.abandonedQuotesEnabled}
                    />
                    <Label htmlFor="automation-abandoned-quote-email" className="cursor-pointer text-sm">
                      Send follow-up emails
                    </Label>
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
                  <div className="mt-4 grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-end">
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
                    <div className="space-y-1.5">
                      <Label>Review link</Label>
                      <Input
                        type="url"
                        placeholder="https://g.page/r/your-business/review"
                        value={automationSettings.reviewRequestUrl}
                        onChange={(e) =>
                          setAutomationSettings((current) => ({ ...current, reviewRequestUrl: e.target.value }))
                        }
                        disabled={!canEditSettings}
                      />
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Review requests only send after completed appointments when this review link is saved. If the link is blank, Strata will skip them instead of faking success.
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Switch
                      id="automation-review-request-email"
                      checked={automationSettings.reviewRequestEmailEnabled}
                      onCheckedChange={(value) => handleAutomationToggle("reviewRequestEmailEnabled", value)}
                      disabled={!canEditSettings || !automationSettings.reviewRequestsEnabled}
                    />
                    <Label htmlFor="automation-review-request-email" className="cursor-pointer text-sm">
                      Send review request emails
                    </Label>
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
                    <div className="space-y-1.5">
                      <Label>Booking link</Label>
                      <Input
                        type="url"
                        placeholder="https://yourshop.com/book"
                        value={automationSettings.bookingRequestUrl}
                        onChange={(e) =>
                          setAutomationSettings((current) => ({ ...current, bookingRequestUrl: e.target.value }))
                        }
                        disabled={!canEditSettings}
                      />
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    Outreach only targets opted-in clients, respects recent automation activity, and now sends them straight to your booking link.
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Switch
                      id="automation-lapsed-client-email"
                      checked={automationSettings.lapsedClientEmailEnabled}
                      onCheckedChange={(value) => handleAutomationToggle("lapsedClientEmailEnabled", value)}
                      disabled={!canEditSettings || !automationSettings.lapsedClientsEnabled}
                    />
                    <Label htmlFor="automation-lapsed-client-email" className="cursor-pointer text-sm">
                      Send outreach emails
                    </Label>
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Automation sends are logged through the same notification and activity system as the rest of Strata, and these email toggles only affect the automatic sends above, not manual quote, invoice, or reminder actions.
                  </p>
                  <Button
                    onClick={handleSaveAutomationSettings}
                    disabled={!canEditSettings || saving}
                    className="w-full sm:w-auto"
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save automations
                  </Button>
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
