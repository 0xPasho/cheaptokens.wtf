import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Pruebas unitarias y de componentes. Las de navegador real (Playwright) viven en tests/e2e.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    // Fuerza el mismo resultado de Intl y fechas en cualquier máquina.
    env: { TZ: "UTC" },
  },
});
