"use client";

import { useActionState, useState } from "react";

import { type ActionError, type ActionResult, updateOverflowAction } from "@/app/[lang]/(site)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

export type ErrorLabels = Record<ActionError, string>;

/** Qué pasa al llegar al límite (ADR-0049): seguir con créditos o detenerse, y el tope mensual. */
export function OverflowForm({ initial, labels, errors }: {
  initial: { mode: "continue" | "stop"; credits: boolean; cap: string };
  labels: {
    continue: string; continueHint: string; stop: string; stopHint: string;
    credits: string; creditsHint: string; cap: string; capUsed: string; save: string; saved: string;
  };
  errors: ErrorLabels;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateOverflowAction, null);
  const [mode, setMode] = useState(initial.mode);
  const stopped = mode === "stop";
  return (
    <form action={action}>
      <FieldGroup>
        <RadioGroup name="mode" value={mode} onValueChange={(value) => setMode(value as typeof mode)} aria-label={labels.continue}>
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
        <Field data-invalid={state && !state.ok ? true : undefined}>
          <FieldLabel htmlFor="overflow-cap">{labels.cap}</FieldLabel>
          <InputGroup>
            <InputGroupAddon><InputGroupText>USD</InputGroupText></InputGroupAddon>
            <InputGroupInput id="overflow-cap" name="cap" inputMode="decimal" defaultValue={initial.cap} className="tabular-nums" aria-invalid={state && !state.ok ? true : undefined} />
          </InputGroup>
          {state && !state.ok ? <FieldError>{errors[state.error]}</FieldError> : <FieldDescription>{labels.capUsed}</FieldDescription>}
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{labels.save}</Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">{state?.ok && !pending ? labels.saved : ""}</span>
        </div>
      </FieldGroup>
    </form>
  );
}
