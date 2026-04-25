/**
 * Hybrid-shell helpers.
 *
 * Strata's web app is still the product source of truth. These helpers only
 * make auth returns and route restoration predictable when the app is opened
 * from the native Capacitor shell.
 */
const DEFAULT_SIGNED_IN_PATH = "/signed-in";
const DEFAULT_APP_RETURN_PATH = "/app-return";
const DEFAULT_APP_URL_SCHEME = "strata";
const DEFAULT_FRONTEND_HOST = "stratacrm.app";
const APP_RETURN_NEXT_PARAM = "next";
const APP_RETURN_SOURCE_PARAM = "source";
const GOOGLE_AUTH_SOURCE = "google-auth";

type NativeAppUrlListenerHandle = {
  remove: () => Promise<void> | void;
};

function stripTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

function normalizeAppPath(input: string | null | undefined, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  return stripTrailingSlash(trimmed);
}

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as Window & { Capacitor?: unknown }).Capacitor !== "undefined";
}

export function getAppReturnPath(): string {
  return normalizeAppPath(import.meta.env.VITE_APP_RETURN_PATH?.trim(), DEFAULT_APP_RETURN_PATH);
}

export function getAppUrlScheme(): string {
  const configured = import.meta.env.VITE_APP_URL_SCHEME?.trim().toLowerCase();
  if (!configured) return DEFAULT_APP_URL_SCHEME;
  return /^[a-z][a-z0-9+\-.]*$/.test(configured) ? configured : DEFAULT_APP_URL_SCHEME;
}

export function resolveSafeClientRedirectPath(input: string | null | undefined, fallback = DEFAULT_SIGNED_IN_PATH): string {
  return normalizeAppPath(input, fallback);
}

/**
 * Google auth should continue using the normal web return path in browsers.
 * In a native shell we route through `/app-return` so the app can safely
 * consume the token and restore the intended destination.
 */
export function buildGoogleAuthRedirectPath(search: string, fallback = DEFAULT_SIGNED_IN_PATH): string {
  const params = new URLSearchParams(search);
  const nextPath = resolveSafeClientRedirectPath(params.get("redirectPath"), fallback);
  if (!isNativeShell()) return nextPath;
  const appReturnParams = new URLSearchParams({
    [APP_RETURN_NEXT_PARAM]: nextPath,
    [APP_RETURN_SOURCE_PARAM]: GOOGLE_AUTH_SOURCE,
  });
  return `${getAppReturnPath()}?${appReturnParams.toString()}`;
}

/**
 * Fallback-only custom URL scheme helper. Universal links on the production
 * frontend origin should stay the primary return strategy.
 */
export function buildNativeSchemeReturnUrl(path = getAppReturnPath()): string {
  return `${getAppUrlScheme()}:///${path.replace(/^\/+/, "")}`;
}

export async function openNativeBrowserUrl(url: string): Promise<void> {
  if (!isNativeShell()) return;
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url });
}

export async function getNativeLaunchUrl(): Promise<string | null> {
  if (!isNativeShell()) return null;
  const { App } = await import("@capacitor/app");
  const launchResult = await App.getLaunchUrl();
  return launchResult?.url ?? null;
}

export async function addNativeAppUrlOpenListener(
  onUrl: (url: string | null | undefined) => void
): Promise<() => Promise<void>> {
  if (!isNativeShell()) {
    return async () => {};
  }

  const { App } = await import("@capacitor/app");
  const handle: NativeAppUrlListenerHandle = await App.addListener("appUrlOpen", ({ url }) => {
    onUrl(url);
  });

  return async () => {
    await handle.remove();
  };
}

export function resolveNativeShellReturnUrl(rawUrl: string | null | undefined): string | null {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) {
    return resolveSafeClientRedirectPath(trimmed, getAppReturnPath());
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol === `${getAppUrlScheme()}:`) {
      const configuredOriginHost = (() => {
        try {
          return import.meta.env.VITE_API_URL?.trim() ? new URL(import.meta.env.VITE_API_URL).hostname.toLowerCase() : null;
        } catch {
          return null;
        }
      })();
      const normalizedHost = url.hostname.toLowerCase();
      const hostLooksLikeFrontend = normalizedHost === DEFAULT_FRONTEND_HOST || (configuredOriginHost ? normalizedHost === configuredOriginHost : false);
      const schemePath = hostLooksLikeFrontend
        ? url.pathname || getAppReturnPath()
        : `${url.hostname ? `/${url.hostname}` : ""}${url.pathname || ""}`;
      const normalizedPath = resolveSafeClientRedirectPath(schemePath, getAppReturnPath());
      return `${normalizedPath}${url.search}${url.hash}`;
    }

    const configuredOrigin = (() => {
      try {
        return import.meta.env.VITE_API_URL?.trim() ? new URL(import.meta.env.VITE_API_URL).origin : null;
      } catch {
        return null;
      }
    })();

    const isConfiguredFrontendOrigin = configuredOrigin ? url.origin === configuredOrigin : false;
    const isDefaultFrontendOrigin = url.protocol === "https:" && url.hostname === DEFAULT_FRONTEND_HOST;

    if (!isConfiguredFrontendOrigin && !isDefaultFrontendOrigin) {
      return null;
    }

    const normalizedPath = resolveSafeClientRedirectPath(url.pathname || "/", getAppReturnPath());
    return `${normalizedPath}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function resolveAppReturnState(params: {
  pathname: string;
  search: string;
  hash: string;
}): {
  token: string | null;
  nextPath: string | null;
  cleanedSearch: string;
  cleanedHash: string;
  isAppReturnPath: boolean;
} {
  const searchParams = new URLSearchParams(params.search.startsWith("?") ? params.search.slice(1) : params.search);
  const hashParams = new URLSearchParams(params.hash.startsWith("#") ? params.hash.slice(1) : params.hash);
  const token = searchParams.get("authToken") ?? hashParams.get("authToken");

  if (searchParams.has("authToken")) searchParams.delete("authToken");
  if (hashParams.has("authToken")) hashParams.delete("authToken");

  const isAppReturnPath = stripTrailingSlash(params.pathname || "/") === getAppReturnPath();
  const nextPath = isAppReturnPath ? resolveSafeClientRedirectPath(searchParams.get(APP_RETURN_NEXT_PARAM), DEFAULT_SIGNED_IN_PATH) : null;

  if (isAppReturnPath) {
    searchParams.delete(APP_RETURN_NEXT_PARAM);
    searchParams.delete(APP_RETURN_SOURCE_PARAM);
  }

  return {
    token,
    nextPath,
    cleanedSearch: searchParams.toString() ? `?${searchParams.toString()}` : "",
    cleanedHash: hashParams.toString() ? `#${hashParams.toString()}` : "",
    isAppReturnPath,
  };
}

export function buildNavigationTarget(path: string, carriedSearch = "", carriedHash = ""): string {
  const base = new URL(path, "https://app.strata.local");
  const mergedSearch = new URLSearchParams(base.search);
  const carryParams = new URLSearchParams(carriedSearch.startsWith("?") ? carriedSearch.slice(1) : carriedSearch);
  for (const [key, value] of carryParams.entries()) {
    mergedSearch.set(key, value);
  }
  base.search = mergedSearch.toString() ? `?${mergedSearch.toString()}` : "";
  base.hash = carriedHash.startsWith("#") ? carriedHash : carriedHash ? `#${carriedHash}` : "";
  return `${base.pathname}${base.search}${base.hash}`;
}
