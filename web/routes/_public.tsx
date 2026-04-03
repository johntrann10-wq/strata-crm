import { Link, Outlet, useOutletContext } from "react-router";
import { Navigation } from "@/components/public/nav";
import { buttonVariants } from "@/components/ui/button";
import { categorySeoPages, comparisonSeoPages, featureSeoPages } from "@/lib/seoPages";
import { cn } from "@/lib/utils";
import type { RootOutletContext } from "../root";

// SPA mode: no loader; we treat the user as logged out here and
// let the app layout handle auth once the app loads.
export default function PublicLayout() {
  const context = useOutletContext<RootOutletContext>();
  const supportEmail = "support@stratacrm.com";

  return (
    <div className="flex h-full flex-col">
      <nav className="shrink-0 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Navigation />

            <div className="flex items-center space-x-2">
              <Link to="/sign-in" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                Login
              </Link>
              <Link to="/sign-up" className={cn(buttonVariants({ size: "sm" }))}>
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
              <a
                href={`mailto:${supportEmail}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 transition-colors hover:text-gray-950"
              >
                Email support: {supportEmail}
              </a>
              <div className="flex flex-wrap gap-2 pt-1">
                {["Secure sign-in", "Customer-ready invoices", "Built for real shop workflows"].map((signal) => (
                  <span
                    key={signal}
                    className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-medium tracking-[0.08em] text-orange-800"
                  >
                    {signal}
                  </span>
                ))}
              </div>
              <Link to="/pricing" className="text-sm font-medium text-orange-700 transition-colors hover:text-orange-800">
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
              <p>Copyright {new Date().getFullYear()} Strata. All rights reserved.</p>
              <p>Support, onboarding help, and launch questions: {supportEmail}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
