import { isRouteErrorResponse, Link, Outlet, useLocation, useOutletContext, useRouteError } from "react-router";
import { Navigation } from "@/components/public/nav";
import { buttonVariants } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { categorySeoPages, comparisonSeoPages, featureSeoPages } from "@/lib/seoPages";
import { cn } from "@/lib/utils";
import type { RootOutletContext } from "../root";

// SPA mode: no loader; we treat the user as logged out here and
// let the app layout handle auth once the app loads.
export default function PublicLayout() {
  const context = useOutletContext<RootOutletContext>();
  const location = useLocation();
  const supportEmail = "support@stratacrm.app";
  const supportHours = "Mon-Fri 9am-5pm PST";
  const extendedSupportHours = "Mon-Sun 8am-8pm PST";
  const isStandalonePublicFlow = location.pathname.startsWith("/lead/");

  return (
    <div className="flex h-full flex-col">
      {!isStandalonePublicFlow ? (
        <nav className="shrink-0 border-b">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <Navigation />

              <div className="flex items-center space-x-2">
                <Link
                  to="/sign-in"
                  className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                  onClick={() => trackEvent("marketing_login_clicked", { placement: "public_nav" })}
                >
                  Login
                </Link>
                <Link to="/sign-up" className={cn(buttonVariants({ size: "sm" }))} onClick={() => trackEvent("landing_cta_clicked", { placement: "public_nav", target: "sign_up" })}>
                  Get started
                </Link>
              </div>
            </div>
          </div>
        </nav>
      ) : null}
      <main className="relative z-10 grow bg-white">
        <Outlet context={context} />
      </main>
      {!isStandalonePublicFlow ? (
        <footer className="shrink-0 border-t bg-gray-50">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-3">
                <Link to="/" className="inline-flex items-center gap-2 text-base font-semibold tracking-tight text-gray-950">
                  Strata CRM
                </Link>
                <p className="max-w-xs text-sm leading-6 text-gray-600">
                  Modern automotive service business software for scheduling, clients, vehicles, quotes, invoices, deposits, and payments.
                </p>
                <p className="max-w-xs text-sm leading-6 text-gray-600">
                  Customer-facing documents, a portal for approvals and payments, and optional reminders when configured.
                </p>
                <Link
                  to="/pricing"
                  className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800"
                  onClick={() => trackEvent("pricing_viewed", { placement: "public_footer" })}
                >
                  View Strata pricing
                </Link>
              </div>

              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-900">Product</h2>
                <div className="mt-3 flex flex-col gap-2 text-sm">
                  <Link to="/features" className="text-gray-600 transition-colors hover:text-gray-950">
                    Strata CRM features
                  </Link>
                  {featureSeoPages.map((page) => (
                    <Link key={page.key} to={page.path} className="text-gray-600 transition-colors hover:text-gray-950">
                      {page.navLabel}
                    </Link>
                  ))}
                  <Link to="/pricing" className="text-gray-600 transition-colors hover:text-gray-950">
                    Strata CRM pricing
                  </Link>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-900">By Shop Type</h2>
                <div className="mt-3 flex flex-col gap-2 text-sm">
                  {categorySeoPages.slice(0, 4).map((page) => (
                    <Link key={page.key} to={page.path} className="text-gray-600 transition-colors hover:text-gray-950">
                      {page.navLabel}
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-900">More Categories</h2>
                <div className="mt-3 flex flex-col gap-2 text-sm">
                  {categorySeoPages.slice(4).map((page) => (
                    <Link key={page.key} to={page.path} className="text-gray-600 transition-colors hover:text-gray-950">
                      {page.navLabel}
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-900">Contacts</h2>
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  <p className="font-medium text-gray-900">General inquiries</p>
                  <a href={`mailto:${supportEmail}`} className="block transition-colors hover:text-gray-950">
                    {supportEmail}
                  </a>
                  <p>{supportHours}</p>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-900">Support</h2>
                <div className="mt-3 space-y-4 text-sm text-gray-600">
                  <div>
                    <p className="font-medium text-gray-900">Email Support</p>
                    <a href={`mailto:${supportEmail}`} className="mt-1 block transition-colors hover:text-gray-950">
                      {supportEmail}
                    </a>
                    <p className="mt-1">{extendedSupportHours}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Onboarding Help</p>
                    <a href={`mailto:${supportEmail}`} className="mt-1 block transition-colors hover:text-gray-950">
                      {supportEmail}
                    </a>
                    <p className="mt-1">{supportHours}</p>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-900">Compare</h2>
                <div className="mt-3 flex flex-col gap-2 text-sm">
                  {comparisonSeoPages.map((page) => (
                    <Link key={page.key} to={page.path} className="text-gray-600 transition-colors hover:text-gray-950">
                      {page.navLabel}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-gray-200 pt-4">
              <div className="flex flex-col gap-2 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <p>Copyright {new Date().getFullYear()} Strata. All rights reserved.</p>
                  <span className="inline-flex w-fit items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium tracking-[0.08em] text-orange-800">
                    Developed in Irvine, CA
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Link to="/privacy" className="transition-colors hover:text-gray-700">
                    Privacy Policy
                  </Link>
                  <Link to="/terms" className="transition-colors hover:text-gray-700">
                    Terms &amp; Conditions
                  </Link>
                  <span>Support and onboarding: {supportEmail}</span>
                </div>
              </div>
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

function publicErrorDetails(error: unknown): { title: string; message: string; canRetry: boolean } {
  if (isRouteErrorResponse(error)) {
    return {
      title: `${error.status} ${error.statusText}`,
      message: "This page is unavailable right now. Please refresh and try again.",
      canRetry: true,
    };
  }

  if (error instanceof Error) {
    const detail = error.message.trim();
    const lower = detail.toLowerCase();
    const isRouteChunkFailure =
      lower.includes("route module") ||
      lower.includes("failed to fetch dynamically imported module") ||
      lower.includes("failed to load module script") ||
      lower.includes("importing a module script failed");

    if (isRouteChunkFailure) {
      return {
        title: "Page update in progress",
        message: "This page just updated. Refresh once to load the latest version.",
        canRetry: true,
      };
    }

    return {
      title: "Unable to load page",
      message: detail || "This page is unavailable right now. Please try again in a moment.",
      canRetry: true,
    };
  }

  return {
    title: "Unable to load page",
    message: "This page is unavailable right now. Please try again in a moment.",
    canRetry: true,
  };
}

export function ErrorBoundary() {
  const error = useRouteError();
  const { title, message, canRetry } = publicErrorDetails(error);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_48%,#f8fafc_100%)]">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
        <div className="w-full rounded-[1.75rem] border border-slate-200/80 bg-white/95 px-6 py-8 shadow-[0_24px_60px_rgba(15,23,42,0.08),0_2px_12px_rgba(15,23,42,0.04)] sm:px-8">
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-slate-500">Service Request</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">{message}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {canRetry ? (
              <button
                type="button"
                className={cn(buttonVariants({ size: "lg" }), "rounded-2xl")}
                onClick={() => window.location.reload()}
              >
                Refresh page
              </button>
            ) : null}
            <Link to="/" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "rounded-2xl")}>
              Back to Strata
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
