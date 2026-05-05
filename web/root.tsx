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
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./app.css";
import faviconHref from "./favicon.svg";
import appleTouchIconHref from "./apple-touch-icon.png";
import { Toaster } from "@/components/ui/sonner";
import type { Route } from "./+types/root";
import { analyticsEnabled, getClarityProjectId, getGaMeasurementId, trackPageView } from "./lib/analytics";
import { persistAuthState } from "./lib/auth";
import { buildCanonicalUrl } from "./lib/publicShareMeta";
import { recordRuntimeError } from "./lib/runtimeErrors";
import {
  addNativeAppUrlOpenListener,
  buildNavigationTarget,
  getNativeLaunchUrl,
  isNativeShell,
  isNativeIOSApp,
  resolveAppReturnState,
  resolveNativeShellReturnUrl,
} from "./lib/mobileShell";
import {
  applyThemePreference,
  normalizeThemePreference,
  readThemePreference,
  STRATA_THEME_CHANGE_EVENT,
  STRATA_THEME_STORAGE_KEY,
  type StrataThemePreference,
} from "./lib/theme";

const isProduction = import.meta.env.PROD;
const siteUrl = "https://stratacrm.app";
const homeSocialPreviewPath = "/social-preview-home-20260417b.png";
const defaultTitle = "Strata - fast CRM for auto service shops";
const defaultDescription =
  "Strata helps automotive service businesses run scheduling, clients, vehicles, jobs, quotes, invoices, and payments in one clear operating system.";
const socialImageUrl = `${siteUrl}${homeSocialPreviewPath}`;
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

const nativeIOSOverlayScriptPaths = [
  "/assets/ios-phone-input-overlay.js",
  "/assets/ios-vehicle-select-overlay.js",
  "/assets/ios-integrations-cleanup-overlay.js",
];

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


/** Renders Toaster only on the client to avoid SSR crashes (e.g. Sonner in serverless). */
function ClientToaster() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return mounted ? <Toaster richColors /> : null;
}

function ThemePreferenceController() {
  const location = useLocation();

  useEffect(() => {
    applyThemePreference(readThemePreference());

    const handleThemeChange = (event: Event) => {
      const nextTheme = normalizeThemePreference((event as CustomEvent<StrataThemePreference>).detail);
      applyThemePreference(nextTheme);
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STRATA_THEME_STORAGE_KEY) {
        applyThemePreference(normalizeThemePreference(event.newValue));
      }
    };

    window.addEventListener(STRATA_THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(STRATA_THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    applyThemePreference(readThemePreference());
  }, [location.pathname]);

  return null;
}

function ThemePreferenceScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              var key = ${JSON.stringify(STRATA_THEME_STORAGE_KEY)};
              var requestedTheme = window.localStorage && window.localStorage.getItem(key) === "dark" ? "dark" : "light";
              var pathname = window.location && window.location.pathname ? window.location.pathname : "";
              var appThemePrefixes = ["/app","/appointments","/billing","/calendar","/clients","/finances","/invoices","/jobs","/leads","/onboarding","/profile","/quotes","/schedule","/services","/settings","/signed-in","/subscribe","/vehicles"];
              var canUseAppTheme = appThemePrefixes.some(function(prefix) {
                return pathname === prefix || pathname.indexOf(prefix + "/") === 0;
              });
              var theme = requestedTheme === "dark" && canUseAppTheme ? "dark" : "light";
              var root = document.documentElement;
              root.classList.toggle("dark", theme === "dark");
              root.classList.toggle("light", theme !== "dark");
              root.dataset.theme = theme;
              root.style.colorScheme = theme;
              var themeColor = document.querySelector('meta[name="theme-color"]');
              if (themeColor) themeColor.setAttribute("content", theme === "dark" ? "#11151d" : "#f97316");
            } catch (error) {}
          })();
        `,
      }}
    />
  );
}

function NativeIOSCompatibilityOverlays() {
  useEffect(() => {
    if (!isNativeIOSApp()) return;

    for (const src of nativeIOSOverlayScriptPaths) {
      const alreadyLoaded = Array.from(document.scripts).some(
        (script) => script.dataset.strataNativeOverlay === src || script.getAttribute("src") === src,
      );
      if (alreadyLoaded) continue;

      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.strataNativeOverlay = src;
      document.body.appendChild(script);
    }
  }, []);

  return null;
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
    const safeHash = hash.includes("authToken=") ? "" : hash;
    trackPageView(`${location.pathname}${query}${safeHash}`);
  }, [location.pathname, location.search, location.hash]);

  return null;
}

function AuthHashConsumer() {
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const { token, nextPath, cleanedSearch, cleanedHash, isAppReturnPath } = resolveAppReturnState({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    });
    if (token || isAppReturnPath) {
      console.log("[mobile-shell-bridge] app-return-state", {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        hasToken: Boolean(token),
        nextPath,
        cleanedSearch,
        cleanedHash,
        isAppReturnPath,
      });
    }
    if (!token) return;
    persistAuthState(token, { source: isAppReturnPath ? "app-return" : "auth-hash" });
    if (isAppReturnPath && nextPath) {
      navigate(buildNavigationTarget(nextPath, cleanedSearch, cleanedHash), { replace: true });
      return;
    }
    if (cleanedSearch !== location.search || cleanedHash !== location.hash) {
      navigate(`${location.pathname}${cleanedSearch}${cleanedHash}`, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}

function MobileShellBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastHandledUrlRef = useRef<string | null>(null);
  const latestLocationRef = useRef(`${location.pathname}${location.search}${location.hash}`);

  useEffect(() => {
    latestLocationRef.current = `${location.pathname}${location.search}${location.hash}`;
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    if (isNativeShell()) {
      html.dataset.mobileShell = "true";
    } else {
      delete html.dataset.mobileShell;
    }
    return () => {
      delete html.dataset.mobileShell;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isNativeShell()) return;

    let disposed = false;
    let removeListener: (() => Promise<void>) | null = null;

    const closeNativeBrowserIfNeeded = async (rawUrl: string, resolvedTarget: string) => {
      if (!rawUrl.includes("authToken=") && !resolvedTarget.startsWith("/app-return")) return;
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.close();
      } catch {
        // Browser.close() is best-effort only.
      }
    };

    const handleNativeReturn = async (rawUrl: string | null | undefined) => {
      if (disposed || typeof rawUrl !== "string") return;
      const trimmed = rawUrl.trim();
      if (!trimmed || trimmed === lastHandledUrlRef.current) return;

      const resolvedTarget = resolveNativeShellReturnUrl(trimmed);
      if (!resolvedTarget) return;

      lastHandledUrlRef.current = trimmed;
      await closeNativeBrowserIfNeeded(trimmed, resolvedTarget);

      if (latestLocationRef.current === resolvedTarget) return;
      navigate(resolvedTarget, { replace: true });
    };

    void getNativeLaunchUrl().then((launchUrl) => void handleNativeReturn(launchUrl));
    void addNativeAppUrlOpenListener((url) => {
      void handleNativeReturn(url);
    }).then((remove) => {
      if (disposed) {
        void remove();
        return;
      }
      removeListener = remove;
    }).catch((error) => {
      recordRuntimeError({
        source: "mobile-shell-bridge",
        message: error instanceof Error ? error.message : "Failed to initialize mobile auth return bridge",
        detail: error instanceof Error ? error.stack : undefined,
      });
    });

    return () => {
      disposed = true;
      void removeListener?.();
    };
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}

function isNativeSwipeBackEligiblePath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const rootLevelPaths = new Set([
    "/",
    "/signed-in",
    "/calendar",
    "/appointments",
    "/jobs",
    "/clients",
    "/leads",
    "/quotes",
    "/invoices",
    "/services",
    "/finances",
    "/settings",
    "/profile",
    "/onboarding",
    "/sign-in",
    "/sign-up",
  ]);
  return !rootLevelPaths.has(normalized);
}

function shouldIgnoreNativeSwipeBackTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        "input",
        "textarea",
        "select",
        "button",
        "a",
        "[role='button']",
        "[role='dialog']",
        "[data-radix-dialog-content]",
        "[data-sheet-content]",
        "[data-native-swipe-back-ignore='true']",
      ].join(",")
    )
  );
}

function NativeIOSSwipeBackController() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || !isNativeIOSApp() || !isNativeSwipeBackEligiblePath(location.pathname)) return;

    const body = document.body;
    const html = document.documentElement;
    const edgeWidth = 26;
    const commitDistance = 84;
    const verticalTolerance = 42;
    const maxTranslate = 58;
    const minVelocity = 0.42;
    let gesture:
      | {
          pointerId: number;
          startX: number;
          startY: number;
          lastX: number;
          lastY: number;
          startAt: number;
          tracking: boolean;
          active: boolean;
        }
      | null = null;

    const resetPresentation = (transition = true) => {
      html.style.setProperty("--native-back-progress", "0");
      delete html.dataset.nativeBackGesture;
      body.style.transition = transition ? "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "";
      body.style.transform = "";
      window.setTimeout(() => {
        if (!html.dataset.nativeBackGesture) {
          body.style.transition = "";
        }
      }, 190);
    };

    const updatePresentation = (distance: number) => {
      const progress = Math.max(0, Math.min(1, distance / commitDistance));
      const easedTranslate = Math.min(maxTranslate, Math.pow(progress, 0.72) * maxTranslate);
      html.dataset.nativeBackGesture = "active";
      html.style.setProperty("--native-back-progress", progress.toFixed(3));
      body.style.transition = "none";
      body.style.transform = `translate3d(${easedTranslate}px, 0, 0)`;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.clientX > edgeWidth || shouldIgnoreNativeSwipeBackTarget(event.target)) return;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        startAt: performance.now(),
        tracking: true,
        active: false,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!gesture || gesture.pointerId !== event.pointerId || !gesture.tracking) return;
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;

      if (!gesture.active) {
        if (deltaX < -8 || Math.abs(deltaY) > verticalTolerance) {
          gesture = null;
          resetPresentation(false);
          return;
        }
        if (deltaX < 12 || deltaX < Math.abs(deltaY) * 1.25) return;
        gesture.active = true;
      }

      event.preventDefault();
      updatePresentation(deltaX);
    };

    const finishGesture = (event: PointerEvent) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const deltaX = gesture.lastX - gesture.startX;
      const elapsed = Math.max(1, performance.now() - gesture.startAt);
      const velocity = deltaX / elapsed;
      const shouldNavigate = gesture.active && (deltaX >= commitDistance || velocity >= minVelocity);
      gesture = null;

      if (shouldNavigate) {
        updatePresentation(commitDistance);
        window.setTimeout(() => {
          navigate(-1);
          resetPresentation(true);
        }, 90);
        return;
      }

      resetPresentation(true);
    };

    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishGesture, { passive: true });
    window.addEventListener("pointercancel", finishGesture, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishGesture);
      window.removeEventListener("pointercancel", finishGesture);
      resetPresentation(false);
    };
  }, [location.pathname, navigate]);

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
  { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
  { title: defaultTitle },
  { name: "description", content: defaultDescription },
  { name: "application-name", content: "Strata CRM" },
  { name: "theme-color", content: "#f97316" },
  { name: "google-site-verification", content: googleSiteVerification },
  { name: "mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-status-bar-style", content: "default" },
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
  const canonicalUrl = buildCanonicalUrl(siteUrl, canonicalPath || "/", location.search);
  const shouldIndex = isIndexableMarketingPath(canonicalPath || "/");
  const robotsContent = shouldIndex ? "index,follow" : "noindex,nofollow";

  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <Meta />
        <Links />
        <ThemePreferenceScript />
        <link rel="canonical" href={canonicalUrl} />
        <meta name="robots" content={robotsContent} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <AnalyticsScripts />
        {!isProduction && <script type="module" src="/@vite/client" async />}
      </head>
      <body>
        <Suspense>
          <MobileShellBridge />
          <NativeIOSSwipeBackController />
          <NativeIOSCompatibilityOverlays />
          <ThemePreferenceController />
          <AuthHashConsumer />
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

  useEffect(() => {
    recordRuntimeError({
      source: "react.boundary",
      message: title,
      detail: detail || stack,
    });
  }, [detail, stack, title]);

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
