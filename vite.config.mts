import { defineConfig, loadEnv } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

/** Dev server proxies `/api` to the backend; target comes from VITE_API_URL (see `.env.example`). */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_API_URL?.trim() || "http://localhost:3001";
  return {
    plugins: [reactRouter(), tailwindcss()],
    server: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./web"),
      },
    },
  };
});