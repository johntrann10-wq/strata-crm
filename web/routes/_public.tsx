import { Link, Outlet, useOutletContext } from "react-router";
import { Navigation } from "@/components/public/nav";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RootOutletContext } from "../root";

// SPA mode: no loader; we treat the user as logged out here and
// let the app layout handle auth once the app loads.
export default function PublicLayout() {
  const context = useOutletContext<RootOutletContext>();

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
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500">Copyright {new Date().getFullYear()} Strata. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
