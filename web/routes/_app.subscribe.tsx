import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "../api";
import { CreditCard, Loader2, RefreshCw } from "lucide-react";
import { getBillingAccessLabel, getTrialDaysLeft, hasFullBillingAccess, type BillingAccessState } from "../lib/billingAccess";
import type { AuthOutletContext } from "./_app";
import type { BillingActivationMilestone, BillingPromptState } from "../lib/billingPrompts";
import { canOpenExternalPaymentProvider, shouldShowWebBillingSurface } from "@/lib/mobileShell";

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
  activationMilestone: BillingActivationMilestone;
  billingPrompt?: BillingPromptState | null;
  billingEnforced: boolean;
  checkoutConfigured: boolean;
  portalConfigured: boolean;
};

function getPrimaryBillingAction(status: BillingStatus | null): {
  label: string;
  mode: "checkout" | "portal";
  configured: boolean;
  unavailableMessage: string;
} | null {
  if (!status || status.accessState === "pending_setup_failure") return null;
  if (status.accessState === "canceled") {
    return {
      label: "Reactivate subscription",
      mode: "checkout",
      configured: status.checkoutConfigured,
      unavailableMessage: "Stripe checkout is not available right now.",
    };
  }
  if (
    status.accessState === "paused_missing_payment_method" ||
    (status.accessState === "active_trial" && !status.billingHasPaymentMethod)
  ) {
    return {
      label: status.accessState === "paused_missing_payment_method" ? "Resume subscription" : "Add payment method",
      mode: "portal",
      configured: status.portalConfigured,
      unavailableMessage: "Stripe billing portal is not available right now.",
    };
  }
  return {
    label: "Manage billing",
    mode: "portal",
    configured: status.portalConfigured,
    unavailableMessage: "Stripe billing portal is not available right now.",
  };
}

export default function SubscribePage() {
  const nativeShellSession = !shouldShowWebBillingSurface();
  const { membershipRole } = useOutletContext<AuthOutletContext>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [retryingSetup, setRetryingSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);

  useEffect(() => {
    if (nativeShellSession) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const status = await api.billing.getStatus();
        if (cancelled) return;
        setBillingStatus(status);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not verify billing status.");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, nativeShellSession]);

  const daysLeft = useMemo(() => getTrialDaysLeft(billingStatus?.trialEndsAt), [billingStatus?.trialEndsAt]);
  const canManageBilling = membershipRole === "owner" || membershipRole === "admin";
  const billingPrompt = billingStatus?.billingPrompt ?? null;
  const primaryAction = getPrimaryBillingAction(billingStatus);

  const handleOpenBillingPortal = async () => {
    if (!canManageBilling || !primaryAction) return;
    if (!canOpenExternalPaymentProvider()) return;
    setError(null);
    setNotice(null);
    if (!primaryAction.configured) {
      setError(primaryAction.unavailableMessage);
      return;
    }
    setLoadingPortal(true);
    try {
      if (primaryAction.mode === "checkout") {
        const result = await api.billing.createCheckoutSession();
        if (result?.url) {
          window.location.href = result.url;
          return;
        }
        setError(primaryAction.unavailableMessage);
        return;
      }
      const promptStage =
        billingPrompt?.stage && billingPrompt.stage !== "none"
          ? billingPrompt.stage
          : billingStatus?.accessState === "paused_missing_payment_method"
            ? "paused"
            : null;
      const result = promptStage
        ? await api.billing.createPortalSessionForPrompt({ promptStage, entryPoint: "paused_recovery" })
        : await api.billing.createPortalSession({ entryPoint: "paused_recovery" });
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      setError(primaryAction.unavailableMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open billing portal.");
    } finally {
      setLoadingPortal(false);
    }
  };

  useEffect(() => {
    if (nativeShellSession) return;
    const billingPortalReturn = searchParams.get("billingPortal") === "return";
    const legacyCheckoutCanceled = searchParams.get("canceled") === "1";
    if (!billingPortalReturn && !legacyCheckoutCanceled) return;
    let cancelled = false;

    setError(null);
    setNotice(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("billingPortal");
    nextParams.delete("canceled");
    setSearchParams(nextParams, { replace: true });

    if (legacyCheckoutCanceled) {
      setNotice("Billing checkout was canceled. No subscription changes were made.");
      return () => {
        cancelled = true;
      };
    }

    setLoadingPortal(true);
    void api.billing
      .refreshBillingState()
      .then((status) => {
        if (cancelled) return;
        setBillingStatus(status);
        if (status.accessState === "active_trial" && status.billingHasPaymentMethod) {
          setNotice("Payment method saved. The trial stays active and the paid plan can start automatically afterward.");
        } else if (
          hasFullBillingAccess(status.accessState) ||
          (status.accessState == null && (status.status === "active" || status.status === "trialing"))
        ) {
          setNotice("Billing status refreshed.");
        }
        if (status.accessState === "paused_missing_payment_method") {
          setError("Billing still needs a payment method before full access can resume.");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not refresh billing status.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPortal(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nativeShellSession, searchParams, setSearchParams]);

  const handleRetrySetup = async () => {
    setError(null);
    setRetryingSetup(true);
    try {
      await api.billing.retryTrialSetup();
      const status = await api.billing.getStatus();
      setBillingStatus(status);
      if (hasFullBillingAccess(status.accessState)) {
        navigate("/signed-in", { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry billing setup.");
    } finally {
      setRetryingSetup(false);
    }
  };

  if (nativeShellSession) {
    return <Navigate to="/settings?tab=account" replace />;
  }

  if (checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stateLabel = getBillingAccessLabel(billingStatus?.accessState);

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle>Billing &amp; subscription</CardTitle>
          </div>
          <CardDescription>
            Manage the Strata subscription, payment method, and billing recovery from one direct web app path.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/35 px-4 py-3">
            <p className="text-sm font-medium">{stateLabel}</p>
            {billingStatus?.accessState === "paused_missing_payment_method" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Your trial ended without a saved payment method. Add one to resume full access immediately.
              </p>
            ) : null}
            {billingStatus?.accessState === "canceled" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Billing is no longer active for this workspace. Reactivate it to continue using Strata fully.
              </p>
            ) : null}
            {billingStatus?.accessState === "pending_setup_failure" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {billingStatus.billingSetupError?.trim() || "We couldn't finish Stripe setup in the background."}
              </p>
            ) : null}
            {billingStatus?.accessState === "active_trial" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {daysLeft == null
                  ? "Your 30-day Strata trial is active."
                  : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your 30-day trial.`}
              </p>
            ) : null}
            {hasFullBillingAccess(billingStatus?.accessState) ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Your workspace has full billing access. Use this page whenever you need to manage the subscription or payment method.
              </p>
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          {notice ? (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {notice}
            </p>
          ) : null}

          {billingStatus?.accessState === "pending_setup_failure" ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={handleRetrySetup} disabled={retryingSetup}>
                {retryingSetup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Retry billing setup
              </Button>
              <Button asChild variant="outline">
                <Link to="/settings?tab=billing">Open billing settings</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={handleOpenBillingPortal} disabled={loadingPortal || !primaryAction?.configured || !canManageBilling}>
                {loadingPortal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {primaryAction?.label ?? "Open billing"}
              </Button>
              <Button asChild variant="outline">
                <Link to="/settings?tab=billing">Billing settings</Link>
              </Button>
            </div>
          )}

          {!canManageBilling ? (
            <p className="text-sm text-muted-foreground">
              An owner or admin needs to update billing for this workspace.
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            We keep your workspace and data intact. Once billing is healthy again, full access resumes automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
