import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
  useLocation,
  useNavigate,
} from "react-router";
import { Suspense, useState, useEffect } from "react";
import "./app.css";
import { Toaster } from "@/components/ui/sonner";
import type { Route } from "./+types/root";
import { setAuthToken } from "./lib/auth";

/** Google OAuth redirects with ?token= — persist before /auth/me runs. */
function OAuthTokenFromQuery() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    if (!token) return;
    setAuthToken(token);
    params.delete("token");
    const qs = params.toString();
    const next = `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`;
    navigate(next, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);
  return null;
}

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
  { title: "Strata — CRM for premium detailing, tint & PPF" },
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
          <OAuthTokenFromQuery />
          <Outlet context={{ gadgetConfig, csrfToken }} />
          <ClientToaster />
        </Suspense>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function errorToDetails(error: unknown): { title: string; detail: string; stack?: string } {
  if (isRouteErrorResponse(error)) {
    return {
      title: `${error.status} ${error.statusText}`,
      detail: typeof error.data === "string" ? error.data : JSON.stringify(error.data),
    };
  }
  if (error instanceof Error) {
    return { title: error.name, detail: error.message, stack: error.stack };
  }
  return { title: "Error", detail: String(error) };
}

export function ErrorBoundary() {
  const error = useRouteError();
  const { title, detail, stack } = errorToDetails(error);
  const showStack = import.meta.env.DEV && stack;

  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "42rem" }}>
          <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
          <p style={{ color: "#444" }}>
            An error occurred. Please refresh the page or try again later.
          </p>
          <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{title}</p>
          <pre
            style={{
              background: "#f4f4f5",
              padding: "1rem",
              borderRadius: "8px",
              overflow: "auto",
              fontSize: "13px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {detail}
          </pre>
          {showStack ? (
            <pre
              style={{
                marginTop: "1rem",
                fontSize: "12px",
                color: "#71717a",
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {stack}
            </pre>
          ) : null}
        </div>
        <Scripts />
      </body>
    </html>
  );
}
