import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { Suspense } from "react";
import "./app.css";
import { Toaster } from "@/components/ui/sonner";
import type { Route } from "./+types/root";

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

export const loader = async ({ context }: Route.LoaderArgs) => {
  const { session, gadgetConfig } = context as {
    session?: { get: (k: string) => unknown };
    gadgetConfig?: RootOutletContext["gadgetConfig"];
  };

  return {
    gadgetConfig:
      gadgetConfig ?? {
        authentication: {
          signInPath: "/sign-in",
          redirectOnSuccessfulSignInPath: "/signed-in",
        },
      },
    csrfToken: session?.get?.("csrfToken"),
  };
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
          <Toaster richColors />
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
