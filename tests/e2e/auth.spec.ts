import { expect, type Page, test } from "@playwright/test";

import { axeScan, openDesignSystem, type Theme, THEMES } from "./helpers";

/**
 * La ventana única de acceso (ADR-0063). El servidor de pruebas corre en modo de desarrollo (ADR-0050):
 * no hay Clerk ni correos, se entra con un nombre y cualquier código de seis dígitos; 000000 es el incorrecto.
 * La variante con correo, la de producción, se prueba en /design-system con un servicio simulado.
 */

async function open(page: Page, url: string, theme: Theme = "dark") {
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
}

const title = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

test.describe("página de acceso", () => {
  test("«Crear cuenta» solo cambia el texto: la URL y la pestaña lo siguen, y lo escrito se queda", async ({ page }) => {
    await open(page, "/es/sign-in?redirect_url=%2Fes%2Fmodels");
    const name = page.getByLabel("Nombre o correo");
    await expect(name).toBeFocused();
    await name.fill("ana");

    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(title(page, "Crea tu cuenta")).toBeVisible();
    await expect(page).toHaveURL(/\/es\/sign-up\?redirect_url=%2Fes%2Fmodels$/);
    await expect(page).toHaveTitle("Crea tu cuenta · cheapllm.wtf");
    await expect(name).toHaveValue("ana");

    await page.getByRole("main").getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(title(page, "Iniciar sesión")).toBeVisible();
    await expect(page).toHaveURL(/\/es\/sign-in\?redirect_url=%2Fes%2Fmodels$/);
    await expect(page).toHaveTitle("Iniciar sesión · cheapllm.wtf");

    // /sign-up abre la misma ventana ya en ese modo, y recargar lo conserva.
    await page.goto("/en/sign-up");
    await expect(title(page, "Create your account")).toBeVisible();
    await expect(page.getByRole("main").getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("entra con un nombre y un código, corrige uno incorrecto y vuelve a la ruta pedida", async ({ page }) => {
    await open(page, "/es/sign-in?redirect_url=%2Fes%2Fmodels");
    await page.getByLabel("Nombre o correo").fill("no vale!");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByLabel("Nombre o correo")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Nombre o correo")).toBeFocused();

    await page.getByLabel("Nombre o correo").fill("Ana@Example.com");
    await page.keyboard.press("Enter");
    await expect(title(page, "Revisa tu correo")).toBeVisible();
    const code = page.getByLabel("Código de verificación");
    await expect(code).toBeFocused();
    await expect(page.getByRole("main")).toContainText("ana@example.com");

    await page.keyboard.type("000000");
    await expect(page.locator('.nr-auth-msg[data-tone="error"]')).toContainText("El código no coincide");
    await expect(code).toHaveAttribute("aria-invalid", "true");
    // El código incorrecto queda seleccionado: lo siguiente que se escriba lo reemplaza.
    await expect.poll(() => code.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 6]);

    // «Sesión iniciada» dura lo que tarda en abrir el destino, y una página estática abre al instante:
    // lo que se comprueba es a dónde llega. La pantalla en sí se prueba en /design-system.
    await page.keyboard.type("123456");
    await expect(page).toHaveURL(/\/es\/models$/);
    // La cabecera ya muestra el menú de cuenta en vez de «Iniciar sesión».
    await expect(page.getByRole("banner").getByRole("button", { name: "Cuenta" })).toBeVisible();
  });

  test("después de entrar y cerrar sesión, la ventana vuelve a empezar: «Sesión iniciada» no se queda pegado", async ({ page }) => {
    await open(page, "/es/sign-in?redirect_url=%2Fes%2Fmodels");
    await page.getByLabel("Nombre o correo").fill("ana");
    await page.keyboard.press("Enter");
    await expect(title(page, "Revisa tu correo")).toBeVisible();
    await page.keyboard.type("123456");
    await expect(page).toHaveURL(/\/es\/models$/);

    // Next no desmonta la página de acceso al navegar: la guarda oculta y la vuelve a mostrar tal cual.
    await page.getByRole("banner").getByRole("button", { name: "Cuenta" }).click();
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/es$/);
    await page.getByRole("banner").getByRole("link", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/es\/sign-in$/);

    await expect(title(page, "Iniciar sesión")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sesión iniciada" })).toHaveCount(0);
    const name = page.getByLabel("Nombre o correo");
    await expect(name).toHaveValue("");
    await expect(name).toBeFocused();

    // Y sirve para entrar otra vez.
    await name.fill("luis");
    await page.keyboard.press("Enter");
    await expect(title(page, "Revisa tu correo")).toBeVisible();
    await expect(page.getByRole("main")).toContainText("luis");
  });

  test("si entras en otra pestaña mientras tanto, el código de esta también entra", async ({ page, context, baseURL }) => {
    await open(page, "/es/sign-in?redirect_url=%2Fes%2Fmodels");
    await page.getByLabel("Nombre o correo").fill("ana");
    await page.keyboard.press("Enter");
    await expect(title(page, "Revisa tu correo")).toBeVisible();

    // La otra pestaña ya abrió la sesión. El envío del código es un POST a esta misma URL: el proxy,
    // que saca de la ventana a quien ya tiene sesión, no puede redirigirlo.
    await context.addCookies([{ name: "ct_dev_session", value: "ana", url: baseURL! }]);
    await page.keyboard.type("123456");
    await expect(page).toHaveURL(/\/es\/models$/);
  });

  test("pulsar Enter antes de que cargue el JavaScript no recarga la página ni deja lo escrito en la URL", async ({ page }) => {
    // El JavaScript llega tarde: la página ya se ve, pero React todavía no la atiende.
    await page.route(/\/_next\/static\/.*\.js/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
    // Cada carga de documento. Un envío hecho por el navegador sería la segunda.
    const loads: string[] = [];
    page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) loads.push(request.url()); });
    await page.goto("/es/sign-in?redirect_url=%2Fes%2Fmodels", { waitUntil: "commit" });
    await page.getByLabel("Nombre o correo").pressSequentially("ana");
    await page.keyboard.press("Enter");
    // La prueba solo vale si de verdad se pulsó antes de tiempo.
    const interactive = await page.evaluate(() => Object.keys(document.querySelector(".nr-auth-input")!).some((key) => key.startsWith("__reactProps")));
    expect(interactive).toBe(false);

    // Sin `action`, el navegador enviaría el formulario: recarga con `?name=ana` y sin la ruta de regreso.
    // Con él, React guarda el envío y lo repite cuando ya puede atenderlo.
    await expect(title(page, "Revisa tu correo")).toBeVisible();
    await expect(page.getByRole("main")).toContainText("ana");
    await expect(page).toHaveURL(/\/es\/sign-in\?redirect_url=%2Fes%2Fmodels$/);
    expect(loads).toHaveLength(1);
  });

  test("con sesión abierta la ventana no se muestra: manda a donde ibas", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "ct_dev_session", value: "ana", url: baseURL! }]);
    await page.goto("/es/sign-up?redirect_url=%2Fes%2Fpricing");
    await expect(page).toHaveURL(/\/es\/pricing$/);
    // Nunca fuera del sitio.
    await page.goto("/es/sign-in?redirect_url=%2Fes%2Ffaq%3Fq%3D1");
    await expect(page).toHaveURL(/\/es\/faq\?q=1$/);
  });

  test("«Obtén tu API key» abre la ventana en modo crear cuenta", async ({ page }) => {
    await open(page, "/es");
    await page.getByRole("banner").getByRole("link", { name: "Obtén tu API key" }).click();
    await expect(page).toHaveURL(/\/es\/sign-up\?redirect_url=%2Fes%2Fdashboard%2Fkeys$/);
    await expect(title(page, "Crea tu cuenta")).toBeVisible();
  });

  test("se recorre solo con teclado y el foco se ve en cada control", async ({ page }) => {
    await open(page, "/en/sign-in?redirect_url=%2Fen%2Fmodels");
    const focusRing = () => page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return style.boxShadow !== "none" || (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2);
    });
    await expect(page.getByLabel("Name or email")).toBeFocused();
    expect(await focusRing()).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
    expect(await focusRing()).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("main").getByRole("button", { name: "Create account" })).toBeFocused();
    expect(await focusRing()).toBe(true);

    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.type("ana");
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Verification code")).toBeFocused();
    // La casilla activa lleva el anillo: el campo real es invisible.
    await expect(page.locator('[data-slot="input-otp-slot"][data-active="true"]')).toHaveCount(1);
    await page.keyboard.type("123456");
    await expect(page).toHaveURL(/\/en\/models$/);
  });

  for (const theme of THEMES) {
    test(`pasa axe en cada paso · ${theme}`, async ({ page }) => {
      await open(page, "/es/sign-in?redirect_url=%2Fes%2Fmodels", theme);
      expect((await axeScan(page, "main")).violations).toEqual([]);

      await page.getByLabel("Nombre o correo").fill("no vale!");
      await page.keyboard.press("Enter");
      await expect(page.locator('.nr-auth-msg[data-tone="error"]')).toBeVisible();
      expect((await axeScan(page, "main")).violations).toEqual([]);

      await page.getByLabel("Nombre o correo").fill("ana");
      await page.keyboard.press("Enter");
      await expect(title(page, "Revisa tu correo")).toBeVisible();
      expect((await axeScan(page, "main")).violations).toEqual([]);

      await page.keyboard.type("000000");
      await expect(page.locator('.nr-auth-msg[data-tone="error"]')).toBeVisible();
      expect((await axeScan(page, "main")).violations).toEqual([]);
    });
  }
});

test.describe("ventana de acceso en /design-system (correo, servicio simulado)", () => {
  const demo = (page: Page) => page.locator('[data-section="Ventana de acceso"]').locator(".nr-auth").first();

  test("un correo nuevo crea la cuenta al verificar y solo entonces lo dice", async ({ page }) => {
    await openDesignSystem(page, "dark");
    const window = demo(page);
    await window.getByLabel("Correo").fill("luis@ejemplo.com");
    await window.getByRole("button", { name: "Continuar" }).click();
    // La pantalla del código no revela si el correo ya tenía cuenta.
    await expect(window.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
    await expect(window.getByLabel("Código de verificación")).toBeFocused();

    // Pegar `123-456` vale: se queda con los dígitos y se envía solo.
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "123-456");
      document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(window.getByRole("heading", { name: "Cuenta creada" })).toBeVisible();
    await expect(window.getByRole("heading", { name: "Cuenta creada" })).toBeFocused();
    await expect(window).toContainText("Tu cuenta para luis@ejemplo.com está lista.");
  });

  test("un correo con cuenta entra, y reenviar se habilita a los 30 segundos", async ({ page }) => {
    await page.clock.install();
    await openDesignSystem(page, "light");
    const window = demo(page);
    await window.getByLabel("Correo").fill("ana@ejemplo.com");
    await window.getByLabel("Correo").press("Enter");
    await expect(window.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
    await expect(window.locator(".nr-auth-resend")).toContainText(/Reenviar código en \d+\s?s/);
    await expect(window.getByRole("button", { name: "Reenviar código" })).toHaveCount(0);

    await page.clock.fastForward(31_000);
    await window.getByRole("button", { name: "Reenviar código" }).click();
    await expect(window.locator(".nr-auth-msg")).toContainText("Enviamos un código nuevo a ana@ejemplo.com.");
    await expect(window.getByRole("status")).toContainText("Enviamos un código nuevo a ana@ejemplo.com.");
    await expect(window.locator(".nr-auth-resend")).toContainText(/Reenviar código en \d+\s?s/);

    await window.getByLabel("Código de verificación").pressSequentially("482913");
    await expect(window.getByRole("heading", { name: "Sesión iniciada" })).toBeVisible();
  });

  test("«Usar otro correo» vuelve al inicio con el correo listo para corregir", async ({ page }) => {
    await openDesignSystem(page, "dark");
    const window = demo(page);
    await window.getByLabel("Correo").fill("ana@ejmplo.com");
    await window.getByRole("button", { name: "Continuar" }).click();
    await window.getByRole("button", { name: "Usar otro correo" }).click();
    await expect(window.getByLabel("Correo")).toBeFocused();
    await expect(window.getByLabel("Correo")).toHaveValue("ana@ejmplo.com");
    // El correo queda seleccionado: escribir encima lo reemplaza.
    await page.keyboard.type("ana@ejemplo.com");
    await expect(window.getByLabel("Correo")).toHaveValue("ana@ejemplo.com");
  });
});
