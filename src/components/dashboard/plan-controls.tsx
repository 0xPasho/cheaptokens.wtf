"use client";

import { startTransition, useActionState, useState } from "react";

import { type ActionError, type ActionResult, updateOverflowAction } from "@/app/[lang]/(site)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type ErrorLabels = Record<ActionError, string>;

/** Qué pasa al llegar al límite (ADR-0049): seguir con créditos o detenerse, y el tope mensual. */
export function OverflowForm({ initial, labels, errors }: {
  /** `cap` va como se escribe en el campo: con la coma del idioma y sin separador de miles. */
  initial: { mode: "continue" | "stop"; credits: boolean; cap: string };
  labels: {
    title: string; continue: string; continueHint: string; stop: string; stopHint: string;
    credits: string; creditsHint: string; cap: string; capUsed: string; save: string; saved: string;
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
  const [mode, setMode] = useState(initial.mode);
  const stopped = mode === "stop";
  const error = state && !state.ok ? state.error : null;
  const capInvalid = error === "limitInvalid" || undefined;
  // Los errores que no son del tope (sesión, servidor) van junto al botón, no debajo del campo.
  const status = pending ? "" : state?.ok ? labels.saved : error && !capInvalid ? errors[error] : "";
  return (
    <form
      // Sin `action` en el form: React lo vacía al terminar y el tope volvería a su valor mientras se ve el error.
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(() => action(form));
      }}
    >
      <FieldGroup>
        <RadioGroup name="mode" value={mode} onValueChange={(value) => setMode(value as typeof mode)} aria-label={labels.title}>
          {(["continue", "stop"] as const).map((value) => (
            <FieldLabel key={value} htmlFor={`overflow-${value}`}>
              <Field orientation="horizontal">
                <RadioGroupItem value={value} id={`overflow-${value}`} />
                <FieldContent>
                  <FieldTitle>{value === "continue" ? labels.continue : labels.stop}</FieldTitle>
                  <FieldDescription>{value === "continue" ? labels.continueHint : labels.stopHint}</FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
        <Field orientation="horizontal" data-disabled={stopped || undefined}>
          <Switch id="overflow-credits" name="credits" defaultChecked={initial.credits} disabled={stopped} />
          <FieldContent>
            <FieldLabel htmlFor="overflow-credits">{labels.credits}</FieldLabel>
            <FieldDescription>{labels.creditsHint}</FieldDescription>
          </FieldContent>
        </Field>
        <Field data-invalid={capInvalid}>
          <FieldLabel htmlFor="overflow-cap">{labels.cap}</FieldLabel>
          <InputGroup>
            <InputGroupAddon><InputGroupText>USD</InputGroupText></InputGroupAddon>
            <InputGroupInput id="overflow-cap" name="cap" inputMode="decimal" defaultValue={initial.cap} className="tabular-nums" aria-invalid={capInvalid} />
          </InputGroup>
          {capInvalid ? <FieldError>{errors.limitInvalid}</FieldError> : <FieldDescription>{labels.capUsed}</FieldDescription>}
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{labels.save}</Button>
          <span className={cn("text-sm text-muted-foreground", error && !capInvalid && "text-destructive")} aria-live="polite">{status}</span>
        </div>
      </FieldGroup>
    </form>
  );
}
