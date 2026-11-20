import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Pruebas en navegador real contra el build de producción: el servidor de pruebas construye y arranca.
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
    // El build y el servidor corren como desarrollo local (`APP_ENV`): sin claves de Clerk, /sign-in abre
    // la ventana de acceso con el modo de desarrollo y las pruebas recorren el flujo completo (ADR-0050,
    // ADR-0063). El modo se decide al construir, por eso el build va aquí y no en el script de pnpm.
    command: `pnpm build && pnpm start --port ${PORT}`,
    env: { APP_ENV: "development" },
    url: `http://localhost:${PORT}/es/design-system`,
    reuseExistingServer: !process.env.CI,
    timeout: 360_000,
    stdout: "pipe",
  },
});
