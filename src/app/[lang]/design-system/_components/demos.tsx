"use client";

import { useState } from "react";

import { type AuthLabels, AuthWindow } from "@/components/auth/auth-window";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { AuthDriver } from "@/lib/auth/flow";
import type { AuthView } from "@/lib/auth/redirect";
import { formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";

/**
 * Confirmación de una acción destructiva. En la app, "Revocar" envía el form
 * de revocación; aquí solo cierra el diálogo.
 */
export function RevokeKeyDemo() {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        Revocar
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Revocar la key “producción”?</AlertDialogTitle>
          <AlertDialogDescription>
            Los requests que usen esta key van a fallar de inmediato. No se puede
            deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => setOpen(false)}
          >
            Revocar key
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Umbral del aviso de saldo bajo (docs/02 › Dashboard). El valor visible se
 * actualiza al mover el slider y siempre pasa por `formatUsd`.
 */
export function LowBalanceThresholdDemo({ locale }: { locale: string }) {
  const [dollars, setDollars] = useState(2);

  return (
    <div className="flex max-w-md flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <Label id="ds-threshold-label">Avisarme cuando el saldo baje de</Label>
        <span className="text-sm font-medium tabular-nums">
          {formatUsd(dollars * 1_000_000, locale, "whole")}
        </span>
      </div>
      <Slider
        aria-labelledby="ds-threshold-label"
        min={1}
        max={20}
        step={1}
        value={[dollars]}
        onValueChange={(value) => {
          const next = Array.isArray(value) ? value[0] : value;
          if (typeof next === "number") setDollars(next);
        }}
      />
    </div>
  );
}

/** En la demo, este correo ya tiene cuenta: cualquier otro crea una. */
const DEMO_EXISTING_EMAIL = "ana@ejemplo.com";
/** Y este código es el incorrecto: cualquier otro entra. */
const DEMO_WRONG_CODE = "000000";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Un servicio de mentira con las mismas respuestas que el real, y una pausa para ver el estado ocupado. */
function createDemoDriver(): AuthDriver {
  let email = "";
  return {
    async start(identifier) {
      email = identifier;
      await wait(400);
      return { ok: true };
    },
    async resend() {
      await wait(300);
      return { ok: true };
    },
    async verify(code) {
      await wait(500);
      if (code === DEMO_WRONG_CODE) return { ok: false, error: "wrong-code" };
      return { ok: true, outcome: email.toLowerCase() === DEMO_EXISTING_EMAIL ? "existing" : "new" };
    },
    async finish() {
      return { ok: true };
    },
    reset() {
      email = "";
    },
  };
}

/**
 * La ventana única de acceso (ADR-0063) con un servicio simulado: no envía correos ni abre sesión.
 * En la app la mueve Clerk o el modo de desarrollo; aquí, al terminar, se queda en «Listo».
 */
export function AuthWindowDemo({ locale, labels }: { locale: Locale; labels: AuthLabels }) {
  const [view, setView] = useState<AuthView>("sign-in");
  const [run, setRun] = useState(0);
  const [driver] = useState(createDemoDriver);

  return (
    <div className="flex flex-col items-start gap-4">
      <AuthWindow key={run} locale={locale} labels={labels} driver={driver} view={view} onViewChange={setView} titleAs="h4" />
      <Button variant="outline" size="sm" onClick={() => { setView("sign-in"); setRun((value) => value + 1); }}>
        Reiniciar la demo
      </Button>
    </div>
  );
}

/** El átomo InputOTP con estado: seis dígitos en dos grupos. Acepta pegar `123-456`. */
export function OneTimeCodeDemo({ label }: { label: string }) {
  const [code, setCode] = useState("482");
  return (
    <InputOTP maxLength={6} value={code} onChange={setCode} pasteTransformer={(pasted) => pasted.replace(/\D/g, "")} aria-label={label}>
      <div aria-hidden className="contents">
        <InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} /></InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup><InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} /></InputOTPGroup>
      </div>
    </InputOTP>
  );
}
