import { defineConfig, loadEnv } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

function publicApiOrigin(env: Record<string, string>): string {
  return env.VITE_API_URL?.trim() || env.NEXT_PUBLIC_API_URL?.trim() || "";
}

/** Dev server proxies `/api` to the backend; target from VITE_API_URL / NEXT_PUBLIC_API_URL (see `.env.example`). */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiOrigin = publicApiOrigin(env);

  if (mode === "production") {
    const allowRelative =
      env.VITE_ALLOW_RELATIVE_API === "true" || env.VITE_ALLOW_RELATIVE_API === "1";
    if (!apiOrigin && !allowRelative) {
      throw new Error(
        "[Strata] Production build requires VITE_API_URL or NEXT_PUBLIC_API_URL (API origin, no trailing slash), " +
          "or VITE_ALLOW_RELATIVE_API=true when the SPA uses same-origin /api (edge proxy). See .env.example and .env.production."
      );
    }
  }

  return {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    plugins: [reactRouter(), tailwindcss()],
    ...(mode === "development"
      ? {
          server: {
            proxy: {
              "/api": {
                target: apiOrigin || "http://localhost:3001",
                changeOrigin: true,
              },
            },
          },
        }
      : {}),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./web"),
      },
    },
  };
});
