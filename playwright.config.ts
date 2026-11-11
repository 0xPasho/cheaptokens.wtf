import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Pruebas en navegador real contra el build de producción (`pnpm test:e2e` construye antes).
 * Usa el Google Chrome instalado (`channel: "chrome"`) para no descargar navegadores.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Cada worker abre un Chrome completo: con muchos en paralelo, crear el contexto pasaba de 30 s.
  workers: 4,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/e2e/.report" }]],
  outputDir: "tests/e2e/.results",
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    reducedMotion: "reduce",
    timezoneId: "UTC",
    locale: "es-MX",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], channel: "chrome" },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/es/design-system`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
