"use client";

import { useActionState, useState, useTransition } from "react";

import {
  type ActionError, type ActionResult, changePlanAction, setCancelAction, updateOverflowAction,
} from "@/app/[lang]/(site)/dashboard/actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

export type ErrorLabels = Record<ActionError, string>;

/** Qué pasa al llegar al límite (ADR-0049): seguir con prepago o detenerse, y el tope mensual. */
export function OverflowForm({ initial, labels, errors }: {
  initial: { mode: "continue" | "stop"; packs: boolean; credits: boolean; cap: string };
  labels: {
    continue: string; continueHint: string; stop: string; stopHint: string; packs: string; packsHint: string;
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
          <Switch id="overflow-packs" name="packs" defaultChecked={initial.packs} disabled={stopped} />
          <FieldContent>
            <FieldLabel htmlFor="overflow-packs">{labels.packs}</FieldLabel>
            <FieldDescription>{labels.packsHint}</FieldDescription>
          </FieldContent>
        </Field>
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

/** Elegir, subir o bajar de plan, con confirmación. */
export function PlanChoice({ planId, label, title, body, confirm, cancel, variant, disabled, errors }: {
  planId: string;
  label: string;
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  variant: "default" | "outline";
  disabled?: boolean;
  errors: ErrorLabels;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = () => startTransition(async () => {
    const result = await changePlanAction(planId);
    if (result.ok) setOpen(false);
    else setError(result.error);
  });
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); setError(null); }}>
      <DialogTrigger render={<Button variant={variant} className="w-full" disabled={disabled} />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{errors[error]}</p> : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{cancel}</DialogClose>
          <Button onClick={submit} disabled={pending}>{confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cancelar al final del periodo (con confirmación) o deshacer la cancelación. */
export function CancelPlanButton({ canceled, labels }: {
  canceled: boolean;
  labels: { cancel: string; resume: string; title: string; body: string; confirm: string; keep: string };
}) {
  const [pending, startTransition] = useTransition();
  if (canceled) {
    return <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => { await setCancelAction(false); })}>{labels.resume}</Button>;
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>{labels.cancel}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.title}</AlertDialogTitle>
          <AlertDialogDescription>{labels.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{labels.keep}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={() => startTransition(async () => { await setCancelAction(true); })}>
            {labels.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
