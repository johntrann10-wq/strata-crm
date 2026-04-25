/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Alternative to VITE_API_URL (same meaning; supported for tooling that sets NEXT_PUBLIC_*). */
  readonly NEXT_PUBLIC_API_URL?: string;
  /** When "true", production bundle uses relative `/api` (requires same-origin edge proxy). */
  readonly VITE_ALLOW_RELATIVE_API?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_CLARITY_PROJECT_ID?: string;
  readonly VITE_APP_RETURN_PATH?: string;
  readonly VITE_APP_URL_SCHEME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
