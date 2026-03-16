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

import { Outlet, redirect, useOutletContext } from "react-router";
import type { RootOutletContext } from "../root";
import type { Route } from "./+types/_auth";

export const loader = async ({ context }: Route.LoaderArgs) => {
  try {
    const ctx = context as { session?: { get: (k: string) => unknown }; gadgetConfig?: { authentication?: { redirectOnSuccessfulSignInPath?: string } } } | undefined;
    const session = ctx?.session;
    const gadgetConfig = ctx?.gadgetConfig;

    const signedIn = !!session?.get("user");

    if (signedIn) {
      const redirectPath = gadgetConfig?.authentication?.redirectOnSuccessfulSignInPath ?? "/signed-in";
      return redirect(redirectPath);
    }
  } catch {
    // If context is missing (e.g. Vercel serverless), treat as not signed in
  }
  return {};
};

export default function () {
  const context = useOutletContext<RootOutletContext>();

  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-[hsl(220,20%,97%)] px-4 py-12">
      <Outlet context={context} />
    </div>
  );
}