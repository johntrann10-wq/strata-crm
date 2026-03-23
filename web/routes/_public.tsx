// --------------------------------------------------------------------------------------
// Public Layout (No Auth)
// --------------------------------------------------------------------------------------
// This file defines the layout for all public-facing routes that are accessible to logged out users.
// Typical pages using this layout include brochure pages, pricing, about, and other marketing or informational content.
// Structure:
//   - Navigation bar (imported from @/components/public/nav); extend this with navigation items as needed
//   - Main content area for routes (via <Outlet />)
//   - Footer that should be expanded with any content you think is relevant to your app
// To extend: update the Navigation component or replace footer content as needed.
// --------------------------------------------------------------------------------------

import { Link, Outlet, useOutletContext } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/public/nav";
import type { RootOutletContext } from "../root";

// SPA mode: no loader; we treat the user as logged out here and
// let the app layout handle auth once the app loads.
export default function PublicLayout() {
  const context = useOutletContext<RootOutletContext>();

  return (
    <div className="flex flex-col h-full">
      <nav className="border-b shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Navigation />

            <div className="flex items-center space-x-2">
              <Link
                to="/sign-in"
                className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
              >
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
      <footer className="bg-gray-50 border-t shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} Strata. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}