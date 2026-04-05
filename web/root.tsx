import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLocation,
  useNavigate,
  useRouteError,
} from "react-router";
import { Suspense, useEffect, useState } from "react";
import "./app.css";
import faviconHref from "./favicon.svg";
import appleTouchIconHref from "./apple-touch-icon.png";
import socialPreviewHref from "./social-preview.png";
import { Toaster } from "@/components/ui/sonner";
import type { Route } from "./+types/root";
import { setAuthToken } from "./lib/auth";
import { analyticsEnabled, getClarityProjectId, getGaMeasurementId, trackPageView } from "./lib/analytics";
import { recordRuntimeError } from "./lib/runtimeErrors";

const isProduction = import.meta.env.PROD;
const siteUrl = "https://stratacrm.app";
const socialPreviewVersion = "20260404a";
const defaultTitle = "Strata - fast CRM for auto service shops";
const defaultDescription =
  "Strata helps automotive service businesses run scheduling, clients, vehicles, jobs, quotes, invoices, and payments in one clear operating system.";
const socialImageUrl = `${siteUrl}${socialPreviewHref}?v=${socialPreviewVersion}`;
const googleSiteVerification = "8J8smTWAQcFyKEfHd6HqfOQ2K1G4afNezGJNNFN4RBM";
const gaMeasurementId = getGaMeasurementId();
const clarityProjectId = getClarityProjectId();
const organizationSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Strata CRM",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: socialImageUrl,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "Strata CRM",
      description: defaultDescription,
      publisher: {
        "@id": `${siteUrl}/#organization`,
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: "Strata CRM",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: defaultDescription,
      url: siteUrl,
      image: socialImageUrl,
      offers: {
        "@type": "Offer",
        price: "29",
        priceCurrency: "USD",
      },
      brand: {
        "@id": `${siteUrl}/#organization`,
      },
    },
  ],
};

function isIndexableMarketingPath(pathname: string) {
  if (pathname === "/") return true;
  return [
    "/auto-detailing-software",
    "/mobile-detailing-software",
    "/window-tint-shop-software",
    "/wrap-ppf-shop-software",
    "/mechanic-shop-software",
    "/performance-shop-software",
    "/tire-shop-software",
    "/muffler-exhaust-shop-software",
    "/shop-scheduling-software",
    "/detailing-crm",
    "/orbisx-alternative",
    "/strata-vs-orbisx",
    "/best-crm-for-auto-detailing-shops",
    "/best-window-tint-shop-software",
    "/best-ppf-shop-software",
    "/best-shop-scheduling-software-for-automotive-businesses",
    "/pricing",
  ].includes(pathname);
}

/** Google OAuth redirects with ?token=... persist before /auth/me runs. */
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

function BrowserErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      recordRuntimeError({
        source: "window.error",
        message: event.message || "Unhandled browser error",
        detail: event.error instanceof Error ? event.error.stack ?? event.error.message : undefined,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";

      recordRuntimeError({
        source: "window.unhandledrejection",
        message,
        detail: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}

function AnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    if (!analyticsEnabled()) return;
    const query = location.search || "";
    const hash = location.hash || "";
    trackPageView(`${location.pathname}${query}${hash}`);
  }, [location.pathname, location.search, location.hash]);

  return null;
}

function AnalyticsScripts() {
  if (!isProduction || !analyticsEnabled()) return null;

  return (
    <>
      {gaMeasurementId ? (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}', { send_page_view: false });
              `,
            }}
          />
        </>
      ) : null}
      {clarityProjectId ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "${clarityProjectId}");
            `,
          }}
        />
      ) : null}
    </>
  );
}

export const links = () => [
  { rel: "icon", href: faviconHref, type: "image/svg+xml" },
  { rel: "shortcut icon", href: faviconHref, type: "image/svg+xml" },
  { rel: "icon", href: appleTouchIconHref, type: "image/png", sizes: "180x180" },
  { rel: "apple-touch-icon", href: appleTouchIconHref },
];

export const meta = () => [
  { charset: "utf-8" },
  { name: "viewport", content: "width=device-width, initial-scale=1" },
  { title: defaultTitle },
  { name: "description", content: defaultDescription },
  { name: "application-name", content: "Strata CRM" },
  { name: "theme-color", content: "#f97316" },
  { name: "google-site-verification", content: googleSiteVerification },
  { name: "apple-mobile-web-app-title", content: "Strata CRM" },
  { property: "og:site_name", content: "Strata CRM" },
  { property: "og:type", content: "website" },
  { property: "og:url", content: siteUrl },
  { property: "og:title", content: defaultTitle },
  { property: "og:description", content: defaultDescription },
  { property: "og:image", content: socialImageUrl },
  { property: "og:image:secure_url", content: socialImageUrl },
  {
    property: "og:image:alt",
    content: "Strata CRM preview showing a premium automotive shop operations dashboard.",
  },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:url", content: siteUrl },
  { name: "twitter:title", content: defaultTitle },
  { name: "twitter:description", content: defaultDescription },
  { name: "twitter:image", content: socialImageUrl },
  { name: "twitter:image:alt", content: "Strata CRM preview showing a premium automotive shop operations dashboard." },
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
    const ctx = context as
      | {
          session?: { get: (key: string) => unknown };
          gadgetConfig?: RootOutletContext["gadgetConfig"];
        }
      | undefined;
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
  const location = useLocation();
  const canonicalPath = location.pathname === "/" ? "/" : location.pathname.replace(/\/+$/, "");
  const canonicalUrl = `${siteUrl}${canonicalPath || "/"}`;
  const shouldIndex = isIndexableMarketingPath(canonicalPath || "/");
  const robotsContent = shouldIndex ? "index,follow" : "noindex,nofollow";

  return (
    <html lang="en" className="light">
      <head>
        <Meta />
        <Links />
        <link rel="canonical" href={canonicalUrl} />
        <meta name="robots" content={robotsContent} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <AnalyticsScripts />
        {!isProduction && <script type="module" src="/@vite/client" async />}
      </head>
      <body>
        <Suspense>
          <OAuthTokenFromQuery />
          <AnalyticsRouteTracker />
          <BrowserErrorReporter />
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
          <p style={{ color: "#444" }}>An error occurred. Please refresh the page or try again later.</p>
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
