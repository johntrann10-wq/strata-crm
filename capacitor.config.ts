/**
 * Strata's web app remains the source of truth.
 *
 * This file only prepares the repo for a Capacitor-style iOS shell. Production
 * builds should normally bundle `build/client` and leave `STRATA_CAPACITOR_SERVER_URL`
 * unset. Only set a remote server URL when intentionally running the shell
 * against a preview or local dev server.
 */
const DEFAULT_APP_ID = "app.stratacrm.mobile";
const DEFAULT_APP_NAME = "Strata CRM";

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function normalizeUrl(value: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function hostFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

const appId = readEnv("STRATA_CAPACITOR_APP_ID") || DEFAULT_APP_ID;
const appName = readEnv("STRATA_CAPACITOR_APP_NAME") || DEFAULT_APP_NAME;
const devServerUrl = normalizeUrl(readEnv("STRATA_CAPACITOR_SERVER_URL"));
const frontendUrl = normalizeUrl(readEnv("FRONTEND_URL"));
const apiUrl = normalizeUrl(readEnv("VITE_API_URL") || readEnv("NEXT_PUBLIC_API_URL"));

const allowNavigation = Array.from(
  new Set([hostFromUrl(devServerUrl), hostFromUrl(frontendUrl), hostFromUrl(apiUrl)].filter((value): value is string => Boolean(value)))
);

const server = devServerUrl
  ? {
      url: devServerUrl,
      cleartext: devServerUrl.startsWith("http://"),
      allowNavigation,
    }
  : allowNavigation.length > 0
    ? {
        allowNavigation,
      }
    : undefined;

const config = {
  appId,
  appName,
  webDir: "build/client",
  bundledWebRuntime: false,
  ...(server ? { server } : {}),
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#ffffff",
      overlaysWebView: false,
    },
  },
} as const;

export default config;
