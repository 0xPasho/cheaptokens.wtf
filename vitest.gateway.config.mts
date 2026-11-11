import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Pruebas de punta a punta del gateway (ola 4): handler real, PGlite y el upstream simulado. Sin red.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/gateway/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: { TZ: "UTC", APP_ENV: "development" },
  },
});
