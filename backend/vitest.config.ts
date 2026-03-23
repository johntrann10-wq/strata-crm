import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    /** Embedded Postgres + schema init can exceed 10s on Linux/macOS CI. */
    hookTimeout: 120_000,
  },
});
