import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  appDirectory: "web",
  presets: [vercelPreset()],
  // Run in SPA mode on Vercel to avoid SSR/serverless crashes.
  ssr: false,
} satisfies Config;
