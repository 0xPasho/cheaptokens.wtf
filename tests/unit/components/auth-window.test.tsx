import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthWindow, AuthWindowView } from "@/components/auth/auth-window";
import { type AuthDriver, FINISH_TIMEOUT_MS, type StartResult, type VerifyResult } from "@/lib/auth/flow";
import type { AuthView } from "@/lib/auth/redirect";
import { en } from "@/lib/i18n/dictionaries/en";

/** La ventana única de acceso (ADR-0063): correo → código → listo, con un servicio de mentira. */

const labels = en.auth;

function fakeDriver(overrides: Partial<AuthDriver> = {}) {
  return {
    start: vi.fn(async (): Promise<StartResult> => ({ ok: true })),
    resend: vi.fn(async (): Promise<StartResult> => ({ ok: true })),
    verify: vi.fn(async (): Promise<VerifyResult> => ({ ok: true, outcome: "existing" })),
    finish: vi.fn(async () => ({ ok: true })),
    reset: vi.fn(),
    ...overrides,
  };
}

function setup(driver = fakeDriver(), props: Partial<React.ComponentProps<typeof AuthWindow>> = {}, user = userEvent.setup()) {
  const onViewChange = vi.fn();
  function Harness({ hidden = false }: { hidden?: boolean }) {
    const [view, setView] = useState<AuthView>("sign-in");
    // Next no desmonta la página al navegar: la oculta así y la vuelve a mostrar con su estado.
    return (
      <Activity mode={hidden ? "hidden" : "visible"}>
        <AuthWindow locale="en" labels={labels} driver={driver} view={view} onViewChange={(next) => { onViewChange(next); setView(next); }} {...props} />
      </Activity>
    );
  }
  const { rerender } = render(<Harness />);
  /** Navegar a otra página y volver a esta. */
  const leaveAndReturn = () => {
    rerender(<Harness hidden />);
    rerender(<Harness />);
  };
  return { driver, user, onViewChange, leaveAndReturn };
}

const title = (name: string) => screen.getByRole("heading", { level: 1, name });
const email = () => screen.getByLabelText<HTMLInputElement>(labels.email.label);
const code = () => screen.getByLabelText<HTMLInputElement>(labels.code.label);
const submit = () => screen.getByRole("button", { name: labels.continue });
const status = () => screen.getByRole("status");

/** Del correo al paso del código. */
async function reachCode(user: ReturnType<typeof userEvent.setup>, address = "ana@example.com") {
  await user.type(email(), address);
  await user.click(submit());
  await screen.findByRole("heading", { level: 1, name: labels.code.title });
}

beforeEach(() => {
  // input-otp inserta reglas CSS que jsdom no entiende y lo avisa por consola.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Y mira si un gestor de contraseñas tapa la última casilla: jsdom no tiene geometría.
  Object.defineProperty(document, "elementFromPoint", { value: () => null, configurable: true });
});

describe("AuthWindow · una sola ventana", () => {
  it("el link de abajo solo cambia el texto: lo escrito y el formulario se quedan", async () => {
    const { user, onViewChange, driver } = setup();
    expect(title(labels.signInTitle)).toBeInTheDocument();
    expect(screen.getByText(labels.signInDescription)).toBeInTheDocument();
    await user.type(email(), "ana@example.com");

    await user.click(screen.getByRole("button", { name: labels.toSignUp }));
    expect(onViewChange).toHaveBeenCalledWith("sign-up");
    expect(title(labels.signUpTitle)).toBeInTheDocument();
    expect(screen.getByText(labels.signUpDescription)).toBeInTheDocument();
    expect(email()).toHaveValue("ana@example.com");
    // El cambio de título se anuncia: el foco sigue en el link.
    expect(status()).toHaveTextContent(labels.signUpTitle);

    await user.click(screen.getByRole("button", { name: labels.toSignIn }));
    expect(title(labels.signInTitle)).toBeInTheDocument();
    expect(driver.start).not.toHaveBeenCalled();
  });

  it("el campo es de correo, con su etiqueta, su ayuda y autocompletado", () => {
    setup();
    expect(email()).toHaveAttribute("type", "email");
    expect(email()).toHaveAttribute("autocomplete", "email");
    expect(email()).toHaveAttribute("placeholder", labels.email.placeholder);
    expect(email()).toHaveAccessibleDescription("We'll email you a 6-digit code. No password needed.");
    expect(email()).not.toHaveAttribute("aria-invalid");
  });
});

describe("AuthWindow · correo", () => {
  it("un correo inválido dice cómo arreglarlo, no llama al servicio y devuelve el foco", async () => {
    const { user, driver } = setup();
    await user.type(email(), "ana");
    await user.click(submit());

    expect(driver.start).not.toHaveBeenCalled();
    expect(email()).toHaveAttribute("aria-invalid", "true");
    expect(email()).toHaveAccessibleDescription(labels.email.invalid);
    expect(email()).toHaveFocus();
    expect(status()).toHaveTextContent(labels.email.invalid);

    // Al corregir, el error se va.
    await user.type(email(), "@example.com");
    expect(email()).not.toHaveAttribute("aria-invalid");
  });

  it("un correo válido envía el código y pasa al campo del código con el foco puesto", async () => {
    const { user, driver } = setup();
    await user.type(email(), "  ana@example.com ");
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { level: 1, name: labels.code.title })).toBeInTheDocument();
    expect(driver.start).toHaveBeenCalledExactlyOnceWith("ana@example.com");
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    await waitFor(() => expect(code()).toHaveFocus());
    expect(code()).toHaveAttribute("autocomplete", "one-time-code");
    expect(code()).toHaveAttribute("inputmode", "numeric");
    expect(code()).toHaveAttribute("maxlength", "6");
    expect(code()).toHaveAccessibleDescription(/Enter the 6-digit code sent to ana@example\.com\./);
  });

  it("envía lo que hay escrito en el campo aunque React no haya visto el cambio", async () => {
    const { user, driver } = setup();
    // Un gestor de contraseñas puede rellenar el campo sin avisar del cambio.
    email().value = "ana@example.com";
    await user.click(submit());

    expect(await screen.findByRole("heading", { level: 1, name: labels.code.title })).toBeInTheDocument();
    expect(driver.start).toHaveBeenCalledExactlyOnceWith("ana@example.com");
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
  });

  it("si el servicio de acceso no cargó en la página, pide recargarla en vez de reintentar", async () => {
    const { user } = setup(fakeDriver({ start: vi.fn(async (): Promise<StartResult> => ({ ok: false, error: "not-loaded" })) }));
    await user.type(email(), "ana@example.com");
    await user.click(submit());
    await waitFor(() => expect(email()).toHaveAccessibleDescription(labels.errors.notLoaded));
    expect(labels.errors.notLoaded).toMatch(/Reload the page/);
    expect(submit()).toBeEnabled();
  });

  it("lo que falla al enviar se explica junto al campo", async () => {
    const { user } = setup(fakeDriver({ start: vi.fn(async (): Promise<StartResult> => ({ ok: false, error: "too-many" })) }));
    await user.type(email(), "ana@example.com");
    await user.click(submit());
    await waitFor(() => expect(email()).toHaveAccessibleDescription(labels.errors.tooMany));
    expect(title(labels.signInTitle)).toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });

  it("si ya había sesión, avisa a quien la monta en vez de mostrar un error", async () => {
    const onSignedIn = vi.fn();
    const { user } = setup(fakeDriver({ start: vi.fn(async (): Promise<StartResult> => ({ ok: false, error: "signed-in" })) }), { onSignedIn });
    await user.type(email(), "ana@example.com");
    await user.click(submit());
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(email()).not.toHaveAttribute("aria-invalid");
  });

  it("mientras envía, el botón se deshabilita y conserva su texto", async () => {
    let release: (value: StartResult) => void = () => {};
    const { user } = setup(fakeDriver({ start: vi.fn(() => new Promise<StartResult>((resolve) => { release = resolve; })) }));
    await user.type(email(), "ana@example.com");
    await user.click(submit());
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAttribute("aria-busy", "true");
    await act(async () => release({ ok: true }));
    expect(await screen.findByRole("heading", { level: 1, name: labels.code.title })).toBeInTheDocument();
  });
});

describe("AuthWindow · código", () => {
  it("al sexto dígito se envía solo y termina en «Signed in» con el foco en el título", async () => {
    const { user, driver } = setup();
    await reachCode(user);
    await user.type(code(), "123456");

    const done = await screen.findByRole("heading", { level: 1, name: labels.done.existingTitle });
    expect(driver.verify).toHaveBeenCalledExactlyOnceWith("123456");
    await waitFor(() => expect(done).toHaveFocus());
    expect(screen.getByText(labels.done.opening)).toBeInTheDocument();
    await waitFor(() => expect(driver.finish).toHaveBeenCalledOnce());
  });

  it("solo después de verificar se sabe si la cuenta era nueva", async () => {
    const { user } = setup(fakeDriver({ verify: vi.fn(async (): Promise<VerifyResult> => ({ ok: true, outcome: "new" })) }));
    await reachCode(user, "luis@example.com");
    // La pantalla del código es la misma para todos.
    expect(title(labels.code.title)).toBeInTheDocument();
    await user.type(code(), "123456");
    expect(await screen.findByRole("heading", { level: 1, name: labels.done.newTitle })).toBeInTheDocument();
    expect(screen.getByText(/Your account for/)).toHaveTextContent("Your account for luis@example.com is ready.");
  });

  it("solo acepta dígitos", async () => {
    const { user } = setup();
    await reachCode(user);
    await user.type(code(), "12a3");
    expect(code()).toHaveValue("123");
  });

  it("enviar un código incompleto pide los seis dígitos sin llamar al servicio", async () => {
    const { user, driver } = setup();
    await reachCode(user);
    await user.type(code(), "123");
    await user.click(submit());
    expect(driver.verify).not.toHaveBeenCalled();
    expect(code()).toHaveAttribute("aria-invalid", "true");
    expect(code()).toHaveAccessibleDescription(/Enter all 6 digits from the email\./);
  });

  it("un código incorrecto lo dice, deja todo seleccionado y el siguiente lo reemplaza", async () => {
    const verify = vi.fn<AuthDriver["verify"]>().mockResolvedValueOnce({ ok: false, error: "wrong-code" }).mockResolvedValue({ ok: true, outcome: "existing" });
    const { user } = setup(fakeDriver({ verify }));
    await reachCode(user);
    await user.type(code(), "000000");

    await waitFor(() => expect(code()).toHaveAccessibleDescription(new RegExp(labels.code.wrong.replace(/[.]/g, "\\."))));
    expect(code()).toHaveAttribute("aria-invalid", "true");
    expect(status()).toHaveTextContent(labels.code.wrong);
    await waitFor(() => expect([code().selectionStart, code().selectionEnd]).toEqual([0, 6]));

    await user.keyboard("654321");
    expect(await screen.findByRole("heading", { level: 1, name: labels.done.existingTitle })).toBeInTheDocument();
    expect(verify).toHaveBeenLastCalledWith("654321");
  });

  it("pegar un código nuevo encima de uno incorrecto también se envía solo", async () => {
    const verify = vi.fn<AuthDriver["verify"]>().mockResolvedValueOnce({ ok: false, error: "wrong-code" }).mockResolvedValue({ ok: true, outcome: "existing" });
    const { user } = setup(fakeDriver({ verify }));
    await reachCode(user);
    await user.type(code(), "000000");
    await waitFor(() => expect(code()).toHaveAttribute("aria-invalid", "true"));
    await waitFor(() => expect([code().selectionStart, code().selectionEnd]).toEqual([0, 6]));

    await user.paste("654-321");
    expect(await screen.findByRole("heading", { level: 1, name: labels.done.existingTitle })).toBeInTheDocument();
    expect(verify).toHaveBeenLastCalledWith("654321");
  });

  it("«Use a different email» vuelve al correo con lo escrito y descarta el intento", async () => {
    const { user, driver } = setup();
    await reachCode(user);
    await user.type(code(), "12");
    await user.click(screen.getByRole("button", { name: labels.code.changeEmail }));

    expect(driver.reset).toHaveBeenCalledOnce();
    expect(title(labels.signInTitle)).toBeInTheDocument();
    expect(email()).toHaveValue("ana@example.com");
    await waitFor(() => expect(email()).toHaveFocus());
    expect(driver.verify).not.toHaveBeenCalled();
  });

  it("con una verificación en camino no ofrece cambiar de correo: si resulta buena, la sesión ya existe", async () => {
    let release: (value: VerifyResult) => void = () => {};
    const { user, driver } = setup(fakeDriver({ verify: vi.fn(() => new Promise<VerifyResult>((resolve) => { release = resolve; })) }));
    await reachCode(user);
    await user.type(code(), "123456");

    const change = screen.getByRole("button", { name: labels.code.changeEmail });
    expect(change).toBeDisabled();
    await user.click(change);
    expect(driver.reset).not.toHaveBeenCalled();
    expect(title(labels.code.title)).toBeInTheDocument();

    // Si la verificación falla, vuelve a estar disponible.
    await act(async () => release({ ok: false, error: "wrong-code" }));
    expect(screen.getByRole("button", { name: labels.code.changeEmail })).toBeEnabled();
  });

  it("si la sesión no abre, lo dice y deja reintentar", async () => {
    const finish = vi.fn<AuthDriver["finish"]>().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    const { user } = setup(fakeDriver({ finish }));
    await reachCode(user);
    await user.type(code(), "123456");

    expect(await screen.findByText(labels.errors.finish, { selector: "span" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: labels.done.retry }));
    await waitFor(() => expect(finish).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(labels.done.opening)).toBeInTheDocument();
  });
});

describe("AuthWindow · «Listo» no se queda pegado", () => {
  it("si abrir la sesión no responde, deja de esperar y ofrece reintentar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const finish = vi.fn<AuthDriver["finish"]>().mockReturnValueOnce(new Promise(() => {})).mockResolvedValue({ ok: true });
    setup(fakeDriver({ finish }), {}, user);
    await reachCode(user);
    await user.type(code(), "123456");
    expect(await screen.findByText(labels.done.opening)).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(FINISH_TIMEOUT_MS - 1000); });
    expect(screen.getByText(labels.done.opening)).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(await screen.findByText(labels.errors.finish, { selector: "span" })).toBeInTheDocument();
    expect(status()).toHaveTextContent(labels.errors.finish);

    await user.click(screen.getByRole("button", { name: labels.done.retry }));
    await waitFor(() => expect(finish).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(labels.done.opening)).toBeInTheDocument();
  });

  it("al volver a la página después de entrar, la ventana empieza de cero con el foco en el correo", async () => {
    const { user, driver, leaveAndReturn } = setup(fakeDriver(), { autoFocus: true });
    await reachCode(user);
    await user.type(code(), "123456");
    await screen.findByRole("heading", { level: 1, name: labels.done.existingTitle });
    await waitFor(() => expect(driver.finish).toHaveBeenCalledOnce());
    expect(driver.reset).not.toHaveBeenCalled();

    // La navegación sale, Next oculta la página y, más tarde, la vuelve a mostrar (cerrar sesión y volver a entrar).
    leaveAndReturn();
    expect(title(labels.signInTitle)).toBeInTheDocument();
    expect(screen.queryByText(labels.done.opening)).not.toBeInTheDocument();
    expect(email()).toHaveValue("");
    expect(email()).not.toHaveAttribute("aria-invalid");
    expect(submit()).toBeEnabled();
    expect(driver.reset).toHaveBeenCalledOnce();
    await waitFor(() => expect(email()).toHaveFocus());

    // Y sirve para entrar otra vez.
    await reachCode(user, "luis@example.com");
    expect(driver.start).toHaveBeenLastCalledWith("luis@example.com");
  });

  it("si se oculta mientras la sesión abre, la respuesta que llega después no la devuelve a «Listo»", async () => {
    let release: (value: { ok: boolean }) => void = () => {};
    const { user, leaveAndReturn } = setup(fakeDriver({ finish: vi.fn(() => new Promise<{ ok: boolean }>((resolve) => { release = resolve; })) }));
    await reachCode(user);
    await user.type(code(), "123456");
    await screen.findByText(labels.done.opening);

    leaveAndReturn();
    expect(title(labels.signInTitle)).toBeInTheDocument();
    await act(async () => release({ ok: false }));
    expect(title(labels.signInTitle)).toBeInTheDocument();
    expect(screen.queryByText(labels.errors.finish)).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });

  it("a medio camino no se pierde nada: el código escrito sigue ahí al volver", async () => {
    const { user, driver, leaveAndReturn } = setup();
    await reachCode(user);
    await user.type(code(), "12");

    leaveAndReturn();
    expect(title(labels.code.title)).toBeInTheDocument();
    expect(code()).toHaveValue("12");
    expect(driver.reset).not.toHaveBeenCalled();
  });
});

describe("AuthWindow · reenviar", () => {
  it("espera 30 segundos, reenvía, lo confirma y vuelve a contar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { driver } = setup(fakeDriver(), {}, user);
    await reachCode(user);
    await user.type(code(), "12");

    expect(screen.getByText("Resend code in 30s")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: labels.code.resend })).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(12_000); });
    expect(screen.getByText("Resend code in 18s")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(18_000); });

    await user.click(screen.getByRole("button", { name: labels.code.resend }));
    await waitFor(() => expect(driver.resend).toHaveBeenCalledOnce());
    expect(await screen.findByText("Resend code in 30s")).toBeInTheDocument();
    expect(code()).toHaveValue("");
    expect(code()).toHaveAccessibleDescription(/New code sent to ana@example\.com\./);
    expect(status()).toHaveTextContent("New code sent to ana@example.com.");
  });

  it("si no se puede reenviar, dice por qué", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup(fakeDriver({ resend: vi.fn(async (): Promise<StartResult> => ({ ok: false, error: "too-many" })) }), {}, user);
    await reachCode(user);
    await act(async () => { vi.advanceTimersByTime(30_000); });
    await user.click(screen.getByRole("button", { name: labels.code.resend }));
    await waitFor(() => expect(code()).toHaveAccessibleDescription(new RegExp(labels.errors.tooMany.replace(/[.]/g, "\\."))));
  });
});

describe("AuthWindow · modo de desarrollo", () => {
  it("entra con un nombre, lo guarda en minúsculas y no ofrece reenviar", async () => {
    const driver = fakeDriver();
    delete (driver as Partial<AuthDriver>).resend;
    const { user } = setup(driver, { kind: "dev" });
    const name = screen.getByLabelText(labels.dev.label);
    expect(name).toHaveAttribute("type", "text");

    await user.type(name, "no vale!");
    await user.click(submit());
    expect(name).toHaveAccessibleDescription(labels.dev.invalid);
    expect(driver.start).not.toHaveBeenCalled();

    await user.clear(name);
    await user.type(name, "Ana");
    await user.click(submit());
    await screen.findByRole("heading", { level: 1, name: labels.code.title });
    expect(driver.start).toHaveBeenCalledExactlyOnceWith("ana");
    // No se envía ningún correo: lo dice y no hay nada que reenviar.
    expect(screen.getByText(/Development mode sends no email/)).toBeInTheDocument();
    expect(screen.queryByText(/Resend code/)).not.toBeInTheDocument();
  });
});

describe("AuthWindowView · una muestra en /design-system", () => {
  it("baja el título a h4 para no competir con el h1 de la página", () => {
    render(<AuthWindowView locale="en" labels={labels} view="sign-up" step="email" identifier="" code="" titleAs="h4" />);
    expect(screen.getByRole("heading", { level: 4, name: labels.signUpTitle })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("pinta el estado de código incorrecto con el botón de reenviar", () => {
    render(
      <AuthWindowView locale="en" labels={labels} view="sign-in" step="code" identifier="ana@example.com" code="381920"
        codeMessage={{ tone: "error", text: labels.code.wrong }} resendSeconds={0} />,
    );
    expect(screen.getByLabelText(labels.code.label)).toHaveValue("381920");
    expect(screen.getByLabelText(labels.code.label)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: labels.code.resend })).toBeInTheDocument();
  });
});
