"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { startTransition, useActionState, useState } from "react";

import { type ActionError, type ActionResult, updateOverflowAction } from "@/app/[lang]/(site)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export type ErrorLabels = Record<ActionError, string>;

type Mode = "continue" | "stop";

/** Un texto con `código` entre comillas invertidas, con el código en monoespaciada. */
function WithCode({ text }: { text: string }) {
  return text.split("`").map((part, index) => (index % 2 === 1
    ? <code key={index} className="font-mono text-xs text-foreground">{part}</code>
    : part));
}

/**
 * Qué pasa al llegar al límite (ADR-0049): seguir con créditos o detenerse, y el tope mensual.
 * Las dos opciones son un selector de píldora, como las pestañas; debajo, solo lo que aplica a la elegida.
 */
export function OverflowForm({ initial, labels, errors }: {
  /** `cap` va como se escribe en el campo: con la coma del idioma y sin separador de miles. */
  initial: { mode: Mode; cap: string };
  labels: {
    title: string; continue: string; continueHint: string; stop: string; stopHint: string;
    cap: string; capUsed: string; save: string; saved: string;
  };
  errors: ErrorLabels;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (previous, form) => {
    try {
      return await updateOverflowAction(previous, form);
    } catch {
      return { ok: false, error: "error" };
    }
  }, null);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [cap, setCap] = useState(initial.cap);
  const stopped = mode === "stop";
  const error = state && !state.ok ? state.error : null;
  const capInvalid = error === "limitInvalid" || undefined;
  // Los errores que no son del tope (sesión, servidor) van junto al botón, no debajo del campo.
  const status = pending ? "" : state?.ok ? labels.saved : error && !capInvalid ? errors[error] : "";
  return (
    <form
      className="flex flex-1 flex-col gap-4"
      // Sin `action` en el form: React lo vacía al terminar y el tope volvería a su valor mientras se ve el error.
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(() => action(form));
      }}
    >
      <div className="flex flex-col gap-2">
        <RadioGroupPrimitive
          name="mode"
          value={mode}
          onValueChange={(value) => setMode(value as Mode)}
          aria-label={labels.title}
          className="grid h-10 grid-cols-2 rounded-full bg-glass-control p-1"
        >
          {(["continue", "stop"] as const).map((value) => (
            <RadioPrimitive.Root
              key={value}
              value={value}
              className={cn(
                "flex h-8 min-w-0 items-center justify-center rounded-full px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none",
                // El foco lo pinta la regla global de .nr-site con --focus-ring, como en cualquier botón.
                "transition-[color,background-color] hover:text-foreground",
                // La elegida, en la píldora de la acción principal: se lee de lejos, como en la referencia del dueño.
                "data-checked:bg-primary data-checked:text-primary-foreground",
              )}
            >
              {value === "continue" ? labels.continue : labels.stop}
            </RadioPrimitive.Root>
          ))}
        </RadioGroupPrimitive>
        <p className="min-h-10 text-sm text-pretty text-muted-foreground" aria-live="polite">
          <WithCode text={stopped ? labels.stopHint : labels.continueHint} />
        </p>
      </div>

      {/* «Seguir con créditos» los usa: el interruptor aparte decía lo mismo que la opción. */}
      {stopped ? null : <input type="hidden" name="credits" value="on" />}
      {/* El tope solo importa al seguir con créditos, pero el servidor lo valida siempre: si no se ve, viaja oculto. */}
      {stopped ? <input type="hidden" name="cap" value={cap} /> : (
        <div className="flex flex-col gap-2">
          <label htmlFor="overflow-cap" className="text-sm font-medium">{labels.cap}</label>
          <InputGroup>
            <InputGroupAddon><InputGroupText>USD</InputGroupText></InputGroupAddon>
            <InputGroupInput
              id="overflow-cap"
              name="cap"
              inputMode="decimal"
              value={cap}
              onChange={(event) => setCap(event.target.value)}
              className="tabular-nums"
              aria-invalid={capInvalid}
              aria-describedby="overflow-cap-hint"
            />
          </InputGroup>
          <p id="overflow-cap-hint" className={cn("text-sm text-muted-foreground tabular-nums", capInvalid && "text-destructive")}>
            {capInvalid ? errors.limitInvalid : labels.capUsed}
          </p>
        </div>
      )}

      <div className="mt-auto flex items-center gap-3">
        <Button type="submit" disabled={pending}>{labels.save}</Button>
        <span className={cn("text-sm text-muted-foreground", error && !capInvalid && "text-destructive")} aria-live="polite">{status}</span>
      </div>
    </form>
  );
}
