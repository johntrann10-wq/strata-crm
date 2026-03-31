import { useEffect, useMemo } from "react";
import { useNavigate, useRouteError } from "react-router";
import { clearAuthState } from "@/lib/auth";

// Keep UI stable and avoid printing raw stacks.
export function RouteErrorBoundary() {
  const navigate = useNavigate();
  const routeError = useRouteError() as unknown;

  const { status, message, detail } = useMemo(() => {
    const anyErr = routeError as any;
    const statusFromInstance = typeof anyErr?.status === "number" ? anyErr.status : undefined;
    const msg =
      typeof anyErr?.message === "string" && anyErr.message.trim()
        ? anyErr.message
        : "Something went wrong while loading this page.";
    return {
      status: statusFromInstance,
      message: msg,
      detail:
        typeof anyErr?.detail === "string" && anyErr.detail.trim() ? anyErr.detail.trim() : undefined,
    };
  }, [routeError]);

  useEffect(() => {
    if (status === 401 || status === 403) {
      clearAuthState("auth:invalid");
      navigate("/sign-in", { replace: true });
    }
  }, [status, navigate]);

  // 404/missing-feature: show "coming soon" without confusing the user.
  if (status === 404) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto px-4 py-16 flex flex-col items-center justify-center text-center gap-6">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Coming soon</h1>
            <p className="mt-3 text-muted-foreground">That page isn’t available yet.</p>
          </div>
          <div className="text-sm text-muted-foreground">
            {message !== "Something went wrong while loading this page." ? message : null}
          </div>
          <button
            className="rounded-md border border-input bg-muted px-4 py-2 text-sm"
            onClick={() => navigate("/signed-in")}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto px-4 py-16 flex flex-col items-center justify-center text-center gap-6">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Unable to load</h1>
          <p className="mt-3 text-muted-foreground">{message}</p>
          {detail ? <p className="mt-2 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        <div className="flex gap-3">
          <button
            className="rounded-md border border-input bg-muted px-4 py-2 text-sm"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
          <button
            className="rounded-md border border-input bg-muted px-4 py-2 text-sm"
            onClick={() => navigate("/signed-in")}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

