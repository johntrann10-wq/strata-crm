export type StrataThemePreference = "light" | "dark";

export const STRATA_THEME_STORAGE_KEY = "strata.theme";
export const STRATA_THEME_CHANGE_EVENT = "strata:theme-change";

const APP_THEME_PATH_PREFIXES = [
  "/app",
  "/appointments",
  "/billing",
  "/calendar",
  "/clients",
  "/finances",
  "/invoices",
  "/jobs",
  "/leads",
  "/onboarding",
  "/profile",
  "/quotes",
  "/schedule",
  "/services",
  "/settings",
  "/signed-in",
  "/subscribe",
  "/vehicles",
] as const;

export function normalizeThemePreference(value: unknown): StrataThemePreference {
  return value === "dark" ? "dark" : "light";
}

export function canApplyAppTheme(pathname: string | undefined = typeof window !== "undefined" ? window.location.pathname : undefined): boolean {
  if (!pathname) return false;
  return APP_THEME_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function resolveEffectiveThemePreference(theme: unknown, pathname?: string): StrataThemePreference {
  const normalizedTheme = normalizeThemePreference(theme);
  return normalizedTheme === "dark" && canApplyAppTheme(pathname) ? "dark" : "light";
}

export function readThemePreference(): StrataThemePreference {
  if (typeof window === "undefined") return "light";
  try {
    return normalizeThemePreference(window.localStorage.getItem(STRATA_THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function applyThemePreference(theme: StrataThemePreference): void {
  if (typeof document === "undefined") return;
  const normalizedTheme = resolveEffectiveThemePreference(theme);
  const html = document.documentElement;
  html.classList.toggle("dark", normalizedTheme === "dark");
  html.classList.toggle("light", normalizedTheme !== "dark");
  html.style.colorScheme = normalizedTheme;
  html.dataset.theme = normalizedTheme;

  const themeColor = normalizedTheme === "dark" ? "#11151d" : "#f97316";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
}

export function writeThemePreference(theme: StrataThemePreference): StrataThemePreference {
  const normalizedTheme = normalizeThemePreference(theme);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STRATA_THEME_STORAGE_KEY, normalizedTheme);
    } catch {
      // Theme preference is nice-to-have; keep the live UI working even if storage is blocked.
    }
    window.dispatchEvent(new CustomEvent(STRATA_THEME_CHANGE_EVENT, { detail: normalizedTheme }));
  }
  applyThemePreference(normalizedTheme);
  return normalizedTheme;
}
