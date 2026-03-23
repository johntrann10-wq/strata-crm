import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "../api";
import { CreditCard, Loader2 } from "lucide-react";

export default function SubscribePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCheckError(null);
      try {
        const status = await api.billing.getStatus();
        if (cancelled) return;
        const st = status && typeof status === "object" && "status" in status ? (status as { status?: string | null }).status : null;
        if (st === "active" || st === "trialing") {
          navigate("/signed-in", { replace: true });
          return;
        }
      } catch (e) {
        if (!cancelled) {
          setCheckError(e instanceof Error ? e.message : "Could not verify subscription status.");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleStartTrial = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await api.billing.createCheckoutSession();
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      setError("Checkout is not available. Please try again later.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle>Start your free trial</CardTitle>
          </div>
          <CardDescription>
            Strata is $29/month. Your first month is free — no charge until the trial ends.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• Full access to calendar, clients, invoices, and more</li>
            <li>• Cancel anytime</li>
            <li>• Secure payment via Stripe</li>
          </ul>
          {checkError && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{checkError}</p>
          )}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={handleStartTrial}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting…
              </>
            ) : (
              "Continue to payment"
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => navigate("/signed-in")}
          >
            I&apos;ll subscribe later
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
