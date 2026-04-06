import { Link, Outlet, useOutletContext } from "react-router";
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
  const supportEmail = "support@stratacrm.com";
  const supportHours = "Mon-Fri 9am-5pm PST";
  const extendedSupportHours = "Mon-Sun 8am-8pm PST";

  return (
    <div className="flex h-full flex-col">
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
      <main className="relative z-10 grow bg-white">
        <Outlet context={context} />
      </main>
      <footer className="shrink-0 border-t bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-3">
              <Link to="/" className="inline-flex items-center gap-2 text-base font-semibold tracking-tight text-gray-950">
                Strata CRM
              </Link>
              <p className="max-w-xs text-sm leading-6 text-gray-600">
                Modern automotive service business software for scheduling, clients, vehicles, jobs, quotes, invoices, and payments.
              </p>
              <p className="max-w-xs text-sm leading-6 text-gray-600">
                Includes reminders, follow-up automations, connected payments, SMS, and calendar sync.
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
    </div>
  );
}
