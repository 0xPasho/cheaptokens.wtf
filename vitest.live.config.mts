import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Pruebas en vivo contra InferHub. Solo corren con INFERHUB_LIVE=1 y gastan dinero real (ADR-0028).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/live/**/*.test.ts"],
    testTimeout: 120_000,
    env: { TZ: "UTC", APP_ENV: "development" },
  },
});
