// --------------------------------------------------------------------------------------
// Auth Layout (Logged Out Pages)
// --------------------------------------------------------------------------------------
// This file defines the layout for all authentication-related routes that are accessible to logged out users.
// Typical pages using this layout include sign in, sign up, forgot password, and other authentication tasks.
// Structure:
//   - Centered content area for auth forms and flows (via <Outlet />)
//   - Handles redirecting signed-in users to logged in routes
// To extend: update the layout or add additional context as needed for your app's auth flows.
// --------------------------------------------------------------------------------------

import { Outlet, useOutletContext } from "react-router";
import type { RootOutletContext } from "../root";

// SPA mode: no loader; signed-in redirect is handled client-side elsewhere.
export default function AuthLayout() {
  const context = useOutletContext<RootOutletContext>();

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f3f4f6_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.10),transparent_28%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.70),rgba(248,250,252,0.92))]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl items-start justify-center px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] sm:px-6 sm:py-10 lg:items-center lg:px-10">
        <div className="w-full">
          <Outlet context={context} />
        </div>
      </div>
    </div>
  );
}
