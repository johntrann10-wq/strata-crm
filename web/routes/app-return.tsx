import { Card } from "@/components/ui/card";
import { resolveSafeClientRedirectPath } from "@/lib/mobileShell";
import { Wrench } from "lucide-react";
import { Link, useLocation } from "react-router";

export default function AppReturnRoute() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nextPath = resolveSafeClientRedirectPath(params.get("next"), "/signed-in");
  const hasAuthToken = params.has("authToken") || location.hash.includes("authToken=");

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto flex max-w-md flex-col items-center justify-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Wrench className="h-8 w-8 text-orange-500" />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Strata</span>
        </div>
        <Card className="w-full rounded-2xl border border-border p-8 shadow-sm">
          <div className="space-y-4 text-center">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              {hasAuthToken ? "Finishing sign-in..." : "Return link ready"}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {hasAuthToken
                ? "Strata is restoring your session and routing you back into the app."
                : "If this page opened outside the app shell, continue safely from here."}
            </p>
            <div className="flex flex-col gap-3 pt-2">
              <Link
                to={nextPath}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-orange-500 px-4 text-[13px] font-medium text-white transition-colors hover:bg-orange-500/90"
              >
                Continue to Strata
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
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
