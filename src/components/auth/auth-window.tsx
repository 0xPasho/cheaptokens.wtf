"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import CircleAlertIcon from "kubai-icons-react/icons/circle-alert";
import { type FormEvent, type ReactNode, type Ref, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { RichText } from "@/components/docs/rich-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { isDevIdentity, normalizeDevIdentity } from "@/lib/auth/dev-identity";
import {
  type AuthDriver, type AuthFailure, type AuthOutcome, type AuthStep,
  CODE_LENGTH, FINISH_TIMEOUT_MS, isCompleteCode, isEmail, onlyDigits, RESEND_SECONDS, secondsUntil, withDeadline,
} from "@/lib/auth/flow";
import type { AuthView } from "@/lib/auth/redirect";
import { formatCount, formatSeconds } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";

export type AuthLabels = Dictionary["auth"];

/** `dev`: el modo de desarrollo entra con un nombre y no envía correos (ADR-0050). */
export type AuthKind = "email" | "dev";

export type AuthMessage = { tone: "error" | "info"; text: ReactNode };

/** Las casillas del código, en dos grupos de tres. */
const SLOT_GROUPS = [[0, 1, 2], [3, 4, 5]] as const;

/** `{email}` dentro de una frase, resaltado. El resto de marcadores ya viene resuelto. */
function withEmail(template: string, email: string): ReactNode {
  const [before, after = ""] = template.split("{email}");
  return <>{before}<strong>{email}</strong>{after}</>;
}

/**
 * Un envío con lo que hay escrito en el formulario, no con el estado de React: puede haber cambios que React
 * todavía no vio (alguien que escribe y pulsa Enter antes de que la página termine de cargar, o un gestor de
 * contraseñas que rellena sin avisar).
 *
 * `action` cubre el primer caso: sin él, el navegador enviaría el formulario por su cuenta y recargaría la
 * página con el correo en la URL. Con él, React guarda ese envío y lo repite cuando ya puede atenderlo.
 */
function submitWith(name: string, send: ((value: string) => void) | undefined) {
  const run = (data: FormData) => send?.(String(data.get(name) ?? ""));
  return {
    action: run,
    onSubmit: (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      run(new FormData(event.currentTarget));
    },
  };
}

/** El icono acompaña al color: un error no se distingue solo por el rojo. */
function ErrorText({ children }: { children: ReactNode }) {
  return <><CircleAlertIcon size={16} aria-hidden /><span>{children}</span></>;
}

function BusySpinner() {
  // Decorativo: el botón conserva su texto y `aria-busy` dice que está ocupado.
  return <Spinner role={undefined} aria-label={undefined} aria-hidden />;
}

export interface AuthWindowViewProps {
  locale: Locale;
  labels: AuthLabels;
  view: AuthView;
  step: AuthStep;
  kind?: AuthKind;
  identifier: string;
  code: string;
  busy?: boolean;
  identifierError?: string | null;
  codeMessage?: AuthMessage | null;
  outcome?: AuthOutcome;
  /** La sesión no se pudo abrir después de verificar el código. */
  finishFailed?: boolean;
  /** Segundos para poder pedir otro código. `null`: no se puede pedir otro (modo de desarrollo). */
  resendSeconds?: number | null;
  /** Texto para lectores de pantalla: errores, avisos y cambios de paso. */
  status?: string;
  /** Anima la entrada del paso. Nunca en la primera carga. */
  animate?: boolean;
  autoFocus?: boolean;
  /** El título es el `h1` de la página. En /design-system, donde es una muestra, baja a `h4`. */
  titleAs?: "h1" | "h4";
  titleRef?: Ref<HTMLHeadingElement>;
  identifierRef?: Ref<HTMLInputElement>;
  codeRef?: Ref<HTMLInputElement>;
  onIdentifierChange?: (value: string) => void;
  /** Recibe lo que hay escrito en el campo al enviar. */
  onSubmitIdentifier?: (value: string) => void;
  onToggleView?: () => void;
  onCodeChange?: (value: string) => void;
  onSubmitCode?: (value: string) => void;
  onResend?: () => void;
  onBack?: () => void;
  onRetry?: () => void;
}

/**
 * La ventana única para entrar o crear cuenta (ADR-0063), sin estado: pinta el paso que le digan.
 * Un solo título, la tarjeta en dos capas del catálogo y, debajo, el link que cambia de modo.
 */
export function AuthWindowView({
  locale, labels, view, step, kind = "email", identifier, code, busy = false, identifierError = null, codeMessage = null,
  outcome = "existing", finishFailed = false, resendSeconds = 0, status = "", animate = false, autoFocus = false,
  titleAs: Title = "h1", titleRef, identifierRef, codeRef,
  onIdentifierChange, onSubmitIdentifier, onToggleView, onCodeChange, onSubmitCode, onResend, onBack, onRetry,
}: AuthWindowViewProps) {
  const id = useId();
  const ids = { description: `${id}-description`, identifier: `${id}-identifier`, identifierMessage: `${id}-identifier-message`, code: `${id}-code`, codeMessage: `${id}-code-message` };
  const digits = formatCount(CODE_LENGTH, locale);
  const signUp = view === "sign-up";
  const field = kind === "dev" ? labels.dev : labels.email;
  const identifierName = kind === "dev" ? "name" : "email";

  let title: string;
  let description: ReactNode;
  if (step === "email") {
    title = signUp ? labels.signUpTitle : labels.signInTitle;
    description = signUp ? labels.signUpDescription : labels.signInDescription;
  } else if (step === "code") {
    title = labels.code.title;
    description = withEmail(t(kind === "dev" ? labels.dev.codeDescription : labels.code.description, { digits }), identifier);
  } else {
    title = outcome === "new" ? labels.done.newTitle : labels.done.existingTitle;
    description = withEmail(outcome === "new" ? labels.done.newDescription : labels.done.existingDescription, identifier);
  }

  return (
    <div className="nr-auth" data-step={step} data-animate={animate || undefined}>
      <header key={`head-${step}`} className="nr-auth-head">
        <Title ref={titleRef} tabIndex={-1} className="nr-auth-title">{title}</Title>
        <p id={ids.description} className="nr-auth-desc">{description}</p>
      </header>

      <div key={`layer-${step}`} className="nr-auth-layer">
        {step === "email" ? (
          <>
            <form className="nr-auth-front" noValidate {...submitWith(identifierName, onSubmitIdentifier)}>
              <Label htmlFor={ids.identifier} className="nr-auth-label">{field.label}</Label>
              <Input
                ref={identifierRef}
                id={ids.identifier}
                className="nr-auth-input"
                name={identifierName}
                type={kind === "dev" ? "text" : "email"}
                inputMode={kind === "dev" ? undefined : "email"}
                autoComplete={kind === "dev" ? "username" : "email"}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                // La página solo sirve para este campo: enfocarlo ahorra un clic. Las demos no lo piden.
                autoFocus={autoFocus}
                placeholder={field.placeholder}
                value={identifier}
                readOnly={busy}
                aria-invalid={identifierError ? true : undefined}
                aria-describedby={ids.identifierMessage}
                onChange={(event) => onIdentifierChange?.(event.target.value)}
              />
              <p id={ids.identifierMessage} className="nr-auth-msg" data-tone={identifierError ? "error" : undefined}>
                {identifierError
                  ? <ErrorText>{identifierError}</ErrorText>
                  : <span>{kind === "dev" ? <RichText text={labels.dev.hint} /> : t(labels.email.hint, { digits })}</span>}
              </p>
              <Button type="submit" size="lg" className="nr-auth-submit" disabled={busy} aria-busy={busy || undefined}>
                {busy ? <BusySpinner /> : null}{labels.continue}
              </Button>
            </form>
            <p className="nr-auth-switch">
              {signUp ? labels.toSignInLead : labels.toSignUpLead}{" "}
              <button type="button" className="nr-auth-link" onClick={onToggleView}>{signUp ? labels.toSignIn : labels.toSignUp}</button>
            </p>
          </>
        ) : null}

        {step === "code" ? (
          <>
            <form className="nr-auth-front" noValidate data-busy={busy || undefined} {...submitWith("code", onSubmitCode)}>
              <Label htmlFor={ids.code} className="nr-auth-label">{labels.code.label}</Label>
              <InputOTP
                ref={codeRef}
                id={ids.code}
                name="code"
                containerClassName="nr-auth-otp"
                maxLength={CODE_LENGTH}
                pattern={REGEXP_ONLY_DIGITS}
                pasteTransformer={onlyDigits}
                value={code}
                readOnly={busy}
                aria-invalid={codeMessage?.tone === "error" ? true : undefined}
                aria-describedby={`${ids.description} ${ids.codeMessage}`}
                onChange={(value) => onCodeChange?.(value)}
              >
                {/* Decoración: el lector de pantalla lee el campo real, no las casillas. */}
                <div className="nr-auth-otp-slots" aria-hidden>
                  <InputOTPGroup>{SLOT_GROUPS[0].map((slot) => <InputOTPSlot key={slot} index={slot} />)}</InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>{SLOT_GROUPS[1].map((slot) => <InputOTPSlot key={slot} index={slot} />)}</InputOTPGroup>
                </div>
              </InputOTP>
              <p id={ids.codeMessage} className="nr-auth-msg" data-tone={codeMessage?.tone === "error" ? "error" : undefined}>
                {codeMessage ? (codeMessage.tone === "error" ? <ErrorText>{codeMessage.text}</ErrorText> : <span>{codeMessage.text}</span>) : null}
              </p>
              <Button type="submit" size="lg" className="nr-auth-submit" disabled={busy} aria-busy={busy || undefined}>
                {busy ? <BusySpinner /> : null}{labels.continue}
              </Button>
              {resendSeconds === null ? null : (
                <p className="nr-auth-resend">
                  {resendSeconds > 0
                    ? t(labels.code.resendIn, { time: formatSeconds(resendSeconds, locale) })
                    : <button type="button" className="nr-auth-link" disabled={busy} onClick={onResend}>{labels.code.resend}</button>}
                </p>
              )}
            </form>
            <p className="nr-auth-switch">
              {labels.code.wrongAddressLead}{" "}
              {/* Una verificación en camino no se puede cancelar: si resulta buena, la sesión (o la cuenta) ya existe. */}
              <button type="button" className="nr-auth-link" disabled={busy} onClick={onBack}>{labels.code.changeEmail}</button>
            </p>
          </>
        ) : null}

        {step === "done" ? (
          <div className="nr-auth-front">
            {finishFailed ? (
              <>
                <p className="nr-auth-msg" data-tone="error"><ErrorText>{labels.errors.finish}</ErrorText></p>
                <Button type="button" size="lg" className="nr-auth-submit" disabled={busy} aria-busy={busy || undefined} onClick={onRetry}>
                  {busy ? <BusySpinner /> : null}{labels.done.retry}
                </Button>
              </>
            ) : (
              <p className="nr-auth-done"><BusySpinner />{labels.done.opening}</p>
            )}
          </div>
        ) : null}
      </div>

      <p className="sr-only" role="status">{status}</p>
    </div>
  );
}

function identifierErrorText(failure: AuthFailure, labels: AuthLabels, kind: AuthKind): string {
  if (failure === "invalid") return kind === "dev" ? labels.dev.invalid : labels.email.invalid;
  return sendErrorText(failure, labels);
}

/** Lo que impide enviar el código, sea el primero o uno nuevo. */
function sendErrorText(failure: AuthFailure, labels: AuthLabels): string {
  switch (failure) {
    case "challenge": return labels.errors.challenge;
    case "not-loaded": return labels.errors.notLoaded;
    case "too-many": return labels.errors.tooMany;
    case "locked": return labels.errors.locked;
    case "not-allowed": return labels.errors.notAllowed;
    default: return labels.errors.send;
  }
}

function codeErrorText(failure: AuthFailure, labels: AuthLabels): string {
  switch (failure) {
    case "invalid":
    case "wrong-code": return labels.code.wrong;
    case "expired-code": return labels.code.expired;
    case "challenge": return labels.errors.challenge;
    case "not-loaded": return labels.errors.notLoaded;
    case "too-many": return labels.errors.tooMany;
    case "locked": return labels.errors.locked;
    case "not-allowed": return labels.errors.notAllowed;
    default: return labels.errors.verify;
  }
}

const ZERO_WIDTH_SPACE = "\u200B";

/** Una región `role="status"` estable: repetir el mismo texto lo vuelve a anunciar. */
function useAnnouncer() {
  const [message, setMessage] = useState({ text: "", again: false });
  const announce = useCallback((text: string) => {
    setMessage((previous) => ({ text, again: previous.text === text ? !previous.again : false }));
  }, []);
  // Un espacio de ancho cero cambia el contenido sin cambiar lo que se lee.
  return [message.again ? `${message.text}${ZERO_WIDTH_SPACE}` : message.text, announce] as const;
}

/** Cuenta atrás en segundos para volver a pedir el código. Solo corre mientras `active`. */
function useCountdown(seconds: number, active: boolean): [left: number, restart: () => void] {
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const left = secondsUntil(deadline, now);
  const ticking = active && left > 0;

  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const restart = useCallback(() => {
    const at = Date.now();
    setNow(at);
    setDeadline(at + seconds * 1000);
  }, [seconds]);

  return [left, restart];
}

type CodeState =
  | { type: "incomplete" }
  /** El código no pasó la verificación. */
  | { type: "failure"; failure: AuthFailure }
  /** No se pudo enviar otro código. */
  | { type: "not-sent"; failure: AuthFailure }
  | { type: "resent" }
  | null;
type FocusRequest = { target: "identifier" | "code" | "title"; select?: boolean };

export interface AuthWindowProps {
  locale: Locale;
  labels: AuthLabels;
  /** Quien envía y verifica el código: Clerk, el modo de desarrollo o una demo. */
  driver: AuthDriver;
  view: AuthView;
  onViewChange: (view: AuthView) => void;
  kind?: AuthKind;
  autoFocus?: boolean;
  titleAs?: "h1" | "h4";
  /** Ya había una sesión abierta: no hay nada que hacer aquí. */
  onSignedIn?: () => void;
}

/** La ventana con su estado: correo, código y listo. No sabe quién verifica: eso es del `driver`. */
export function AuthWindow({ locale, labels, driver, view, onViewChange, kind = "email", autoFocus = false, titleAs, onSignedIn }: AuthWindowProps) {
  const [step, setStep] = useState<AuthStep>("email");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [identifierFailure, setIdentifierFailure] = useState<AuthFailure | null>(null);
  const [codeState, setCodeState] = useState<CodeState>(null);
  const [outcome, setOutcome] = useState<AuthOutcome>("existing");
  const [finishFailed, setFinishFailed] = useState(false);
  const [moved, setMoved] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [status, announce] = useAnnouncer();

  const titleRef = useRef<HTMLHeadingElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  /** Cada vuelta al correo, también al ocultarse la ventana, invalida las respuestas que sigan en camino. */
  const attempt = useRef(0);
  /** Evita dos envíos seguidos antes de que React pinte `busy`. */
  const working = useRef(false);

  const digits = formatCount(CODE_LENGTH, locale);
  const [resendSeconds, startCountdown] = useCountdown(RESEND_SECONDS, step === "code");

  // El foco sigue al paso: al código para escribirlo, al título cuando ya no hay nada que escribir.
  useEffect(() => {
    if (!focusRequest) return;
    const element = focusRequest.target === "title" ? titleRef.current : focusRequest.target === "code" ? codeRef.current : identifierRef.current;
    element?.focus({ preventScroll: focusRequest.target === "title" });
    if (focusRequest.select && element instanceof HTMLInputElement) element.select();
  }, [focusRequest]);

  // «Listo» solo dura lo que tarda en llegar la página siguiente. Next no desmonta la ventana al navegar:
  // la oculta y la vuelve a mostrar tal cual. Sin esto, quien cierra sesión y vuelve a entrar se encontraría
  // «Sesión iniciada» para siempre. Si se oculta en «Listo», la ventana empieza de cero.
  useLayoutEffect(() => {
    if (step !== "done") return;
    return () => {
      attempt.current += 1;
      working.current = false;
      driver.reset();
      setBusy(false);
      setStep("email");
      setIdentifier("");
      setCode("");
      setIdentifierFailure(null);
      setCodeState(null);
      setOutcome("existing");
      setFinishFailed(false);
      setMoved(false);
      setFocusRequest(autoFocus ? { target: "identifier" } : null);
    };
  }, [step, driver, autoFocus]);

  function begin(): boolean {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    return true;
  }

  function settle() {
    working.current = false;
    setBusy(false);
  }

  async function submitIdentifier(raw: string) {
    if (working.current) return;
    // Lo escrito llega del formulario: si React no lo había visto, lo alcanza aquí.
    if (raw !== identifier) setIdentifier(raw);
    const value = kind === "dev" ? normalizeDevIdentity(raw) : raw.trim();
    if (!(kind === "dev" ? isDevIdentity(value) : isEmail(value))) {
      setIdentifierFailure("invalid");
      announce(identifierErrorText("invalid", labels, kind));
      setFocusRequest({ target: "identifier" });
      return;
    }
    if (!begin()) return;
    setIdentifierFailure(null);
    const run = ++attempt.current;
    const result = await driver.start(value).catch(() => ({ ok: false as const, error: "unavailable" as const }));
    if (run !== attempt.current) return;
    settle();
    if (!result.ok) {
      if (result.error === "signed-in" && onSignedIn) return onSignedIn();
      setIdentifierFailure(result.error);
      announce(identifierErrorText(result.error, labels, kind));
      setFocusRequest({ target: "identifier" });
      return;
    }
    setIdentifier(value);
    setCode("");
    setCodeState(null);
    startCountdown();
    setStep("code");
    setMoved(true);
    setFocusRequest({ target: "code" });
  }

  async function finish(run: number) {
    if (!begin()) return;
    setFinishFailed(false);
    // Si abrir la sesión no responde, «Listo» no puede quedarse girando: pasado un rato ofrece reintentar.
    const result = await withDeadline(driver.finish().catch(() => ({ ok: false })), FINISH_TIMEOUT_MS, { ok: false });
    if (run !== attempt.current) return;
    settle();
    if (result.ok) return; // La navegación ya salió: «Listo» se queda hasta que llega la página.
    setFinishFailed(true);
    announce(labels.errors.finish);
  }

  async function submitCode(value: string) {
    if (working.current) return;
    if (value !== code) setCode(value);
    if (!isCompleteCode(value)) {
      setCodeState({ type: "incomplete" });
      announce(t(labels.code.incomplete, { digits }));
      setFocusRequest({ target: "code" });
      return;
    }
    if (!begin()) return;
    setCodeState(null);
    const run = ++attempt.current;
    const result = await driver.verify(value).catch(() => ({ ok: false as const, error: "unavailable" as const }));
    if (run !== attempt.current) return;
    settle();
    if (!result.ok) {
      if (result.error === "signed-in" && onSignedIn) return onSignedIn();
      setCodeState({ type: "failure", failure: result.error });
      announce(codeErrorText(result.error, labels));
      // Todo queda seleccionado: el siguiente dígito reemplaza el código entero.
      setFocusRequest({ target: "code", select: true });
      return;
    }
    setOutcome(result.outcome);
    setStep("done");
    setMoved(true);
    setFocusRequest({ target: "title" });
    void finish(run);
  }

  async function resend() {
    if (!driver.resend || !begin()) return;
    const run = attempt.current;
    const result = await driver.resend().catch(() => ({ ok: false as const, error: "unavailable" as const }));
    if (run !== attempt.current) return;
    settle();
    if (!result.ok) {
      if (result.error === "signed-in" && onSignedIn) return onSignedIn();
      setCodeState({ type: "not-sent", failure: result.error });
      announce(sendErrorText(result.error, labels));
      setFocusRequest({ target: "code" });
      return;
    }
    setCode("");
    setCodeState({ type: "resent" });
    startCountdown();
    announce(t(labels.code.resent, { email: identifier }));
    setFocusRequest({ target: "code" });
  }

  /**
   * Al completar el código se envía solo, también cuando se pega uno nuevo encima de uno incorrecto
   * (pasa de seis dígitos a seis dígitos: por eso no se usa el `onComplete` del átomo).
   */
  function changeCode(value: string) {
    if (value === code) return;
    setCode(value);
    if (codeState) setCodeState(null);
    if (isCompleteCode(value)) void submitCode(value);
  }

  function back() {
    attempt.current += 1;
    settle();
    driver.reset();
    setCode("");
    setCodeState(null);
    setStep("email");
    setMoved(true);
    setFocusRequest({ target: "identifier", select: true });
  }

  function toggleView() {
    const next: AuthView = view === "sign-up" ? "sign-in" : "sign-up";
    onViewChange(next);
    announce(next === "sign-up" ? labels.signUpTitle : labels.signInTitle);
  }

  let codeMessage: AuthMessage | null = null;
  if (codeState?.type === "incomplete") codeMessage = { tone: "error", text: t(labels.code.incomplete, { digits }) };
  else if (codeState?.type === "resent") codeMessage = { tone: "info", text: withEmail(labels.code.resent, identifier) };
  else if (codeState?.type === "failure") codeMessage = { tone: "error", text: codeErrorText(codeState.failure, labels) };
  else if (codeState?.type === "not-sent") codeMessage = { tone: "error", text: sendErrorText(codeState.failure, labels) };

  return (
    <AuthWindowView
      locale={locale}
      labels={labels}
      view={view}
      step={step}
      kind={kind}
      identifier={identifier}
      code={code}
      busy={busy}
      identifierError={identifierFailure ? identifierErrorText(identifierFailure, labels, kind) : null}
      codeMessage={codeMessage}
      outcome={outcome}
      finishFailed={finishFailed}
      resendSeconds={driver.resend ? resendSeconds : null}
      status={status}
      animate={moved}
      autoFocus={autoFocus}
      titleAs={titleAs}
      titleRef={titleRef}
      identifierRef={identifierRef}
      codeRef={codeRef}
      onIdentifierChange={(value) => { setIdentifier(value); if (identifierFailure) setIdentifierFailure(null); }}
      onSubmitIdentifier={(value) => void submitIdentifier(value)}
      onToggleView={toggleView}
      onCodeChange={changeCode}
      onSubmitCode={(value) => void submitCode(value)}
      onResend={() => void resend()}
      onBack={back}
      onRetry={() => void finish(attempt.current)}
    />
  );
}
