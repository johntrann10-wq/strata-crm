import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { Suspense, useState, useEffect } from "react";
import "./app.css";
import { Toaster } from "@/components/ui/sonner";
import type { Route } from "./+types/root";

/** Renders Toaster only on the client to avoid SSR crashes (e.g. Sonner in serverless). */
function ClientToaster() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Toaster richColors /> : null;
}

const isProduction = process.env.NODE_ENV === "production";

export const links = () => [];

export const meta = () => [
  { charset: "utf-8" },
  { name: "viewport", content: "width=device-width, initial-scale=1" },
  { title: "Strata — Auto Shop Management" },
];

export type RootOutletContext = {
  gadgetConfig?: {
    authentication?: {
      signInPath?: string;
      redirectOnSuccessfulSignInPath?: string;
    };
  };
  csrfToken?: string;
};

const defaultGadgetConfig = {
  authentication: {
    signInPath: "/sign-in",
    redirectOnSuccessfulSignInPath: "/signed-in",
  },
};

export const loader = async ({ context }: Route.LoaderArgs) => {
  try {
    const ctx = context as {
      session?: { get: (k: string) => unknown };
      gadgetConfig?: RootOutletContext["gadgetConfig"];
    } | undefined;
    const session = ctx?.session;
    const gadgetConfig = ctx?.gadgetConfig;

    return {
      gadgetConfig: gadgetConfig ?? defaultGadgetConfig,
      csrfToken: session?.get?.("csrfToken"),
    };
  } catch {
    return { gadgetConfig: defaultGadgetConfig, csrfToken: undefined };
  }
};

export default function App({ loaderData }: Route.ComponentProps) {
  const { gadgetConfig, csrfToken } = loaderData;

  return (
    <html lang="en" className="light">
      <head>
        <Meta />
        <Links />
        {!isProduction && <script type="module" src="/@vite/client" async />}
      </head>
      <body>
        <Suspense>
          <Outlet context={{ gadgetConfig, csrfToken }} />
          <ClientToaster />
        </Suspense>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
          <h1>Something went wrong</h1>
          <p>An error occurred. Please refresh the page or try again later.</p>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
