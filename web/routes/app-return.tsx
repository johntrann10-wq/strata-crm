import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { StrataLogoLockup } from "@/components/brand/StrataLogo";
import { Card } from "@/components/ui/card";
import { buildNativeSchemeReturnUrl, isNativeShell, resolveSafeClientRedirectPath } from "@/lib/mobileShell";

export default function AppReturnRoute() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nextPath = resolveSafeClientRedirectPath(params.get("next"), "/signed-in");
  const hasAuthToken = params.has("authToken") || location.hash.includes("authToken=");
  const googleAuthReturn = params.get("source") === "google-auth";
  const nativeFallbackHref = !isNativeShell() && hasAuthToken ? buildNativeSchemeReturnUrl(`${location.pathname}${location.search}${location.hash}`) : null;

  useEffect(() => {
    if (!nativeFallbackHref || typeof window === "undefined") return;

    const timer = window.setTimeout(() => {
      window.location.replace(nativeFallbackHref);
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [nativeFallbackHref]);

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto flex max-w-md flex-col items-center justify-center">
        <StrataLogoLockup
          className="mb-6 flex-col gap-3"
          markClassName="h-10 w-10"
          wordmarkClassName="text-[15px] font-semibold tracking-tight text-foreground"
        />
        <Card className="w-full rounded-2xl border border-border p-8 shadow-sm">
          <div className="space-y-4 text-center">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              {hasAuthToken ? (nativeFallbackHref ? "Opening Strata..." : "Finishing sign-in...") : "Return link ready"}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {hasAuthToken
                ? nativeFallbackHref
                  ? "Google sign-in finished. Strata should reopen automatically and finish restoring your session."
                  : "Strata is restoring your session and routing you back into the app."
                : "If this page opened outside the app shell, continue safely from here."}
            </p>
            <div className="flex flex-col gap-3 pt-2">
              {nativeFallbackHref ? (
                <a
                  href={nativeFallbackHref}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-orange-500 px-4 text-[13px] font-medium text-white transition-colors hover:bg-orange-500/90"
                >
                  Open in Strata
                </a>
              ) : null}
              <Link
                to={nextPath}
                className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-[13px] font-medium transition-colors ${
                  nativeFallbackHref
                    ? "border border-border bg-background text-foreground hover:bg-muted"
                    : "bg-orange-500 text-white hover:bg-orange-500/90"
                }`}
              >
                {nativeFallbackHref ? "Continue in browser" : "Continue to Strata"}
              </Link>
              <div className="flex items-center justify-center gap-3 text-[12px] text-muted-foreground">
                <Link to="/privacy" className="hover:text-foreground">
                  Privacy
                </Link>
                <span>•</span>
                <Link to="/terms" className="hover:text-foreground">
                  Terms
                </Link>
                <span>•</span>
                <a href="mailto:support@stratacrm.app" className="hover:text-foreground">
                  Support
                </a>
              </div>
              {googleAuthReturn ? (
                <p className="text-[11px] text-muted-foreground">
                  If Strata does not reopen automatically, tap <span className="font-medium text-foreground">Open in Strata</span>.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
