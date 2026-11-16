"use client";

import { useState, useTransition } from "react";

import { type ActionError, buyPackAction, topUpAction } from "@/app/[lang]/(site)/dashboard/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatUsd } from "@/lib/format";

/** Recarga: montos rápidos o uno libre, y un solo botón principal (patrón de /design-system › Recarga). */
export function TopUpForm({ locale, presets, min, max, disabled, labels, errors }: {
  locale: string;
  /** µUSD, como texto porque viajan del servidor al cliente. */
  presets: string[];
  min: number;
  max: number;
  disabled: boolean;
  labels: { amount: string; other: string; range: string; submit: string; done: string };
  errors: Record<ActionError, string>;
}) {
  const [amount, setAmount] = useState(presets[1] ?? presets[0]);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const customMicros = (() => {
    const match = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(custom.trim());
    return match ? Number(match[1]) * 1_000_000 + Number((match[2] ?? "").padEnd(2, "0")) * 10_000 : null;
  })();
  const selected = custom ? customMicros : Number(amount);
  const valid = selected !== null && selected >= min && selected <= max;

  const submit = () => {
    if (!valid || selected === null) { setError("amountInvalid"); return; }
    startTransition(async () => {
      const result = await topUpAction(String(selected));
      setError(result.ok ? null : result.error);
      setDone(result.ok ? formatUsd(selected, locale) : null);
      if (result.ok) setCustom("");
    });
  };

  return (
    <FieldGroup>
      <ToggleGroup
        spacing={1}
        value={custom ? [] : [amount]}
        onValueChange={(value) => { if (value[0]) { setAmount(value[0]); setCustom(""); setError(null); } }}
        aria-label={labels.amount}
        className="w-full glass-control p-1"
      >
        {presets.map((preset) => (
          <ToggleGroupItem key={preset} value={preset} className="flex-1 tabular-nums">{formatUsd(Number(preset), locale, "whole")}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Field data-invalid={error === "amountInvalid" || undefined}>
        <FieldLabel htmlFor="custom-amount">{labels.other}</FieldLabel>
        <InputGroup>
          <InputGroupAddon><InputGroupText>USD</InputGroupText></InputGroupAddon>
          <InputGroupInput
            id="custom-amount"
            inputMode="decimal"
            value={custom}
            onChange={(event) => { setCustom(event.target.value); setError(null); }}
            className="tabular-nums"
            aria-invalid={error === "amountInvalid" || undefined}
          />
        </InputGroup>
        {error ? <FieldError>{errors[error]}</FieldError> : <FieldDescription>{labels.range}</FieldDescription>}
      </Field>
      <Button className="w-full" onClick={submit} disabled={disabled || pending}>
        {labels.submit.replace("{amount}", valid && selected !== null ? formatUsd(selected, locale) : "")}
      </Button>
      <p className="text-sm text-success" aria-live="polite">{done ? labels.done.replace("{amount}", done) : ""}</p>
    </FieldGroup>
  );
}

/** Comprar un paquete por modelo, con confirmación. */
export function BuyPackButton({ modelId, disabled, labels, errors }: {
  modelId: string;
  disabled: boolean;
  labels: { buy: string; title: string; body: string; confirm: string; cancel: string };
  errors: Record<ActionError, string>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); setError(null); }}>
      <DialogTrigger render={<Button variant="outline" className="w-full" disabled={disabled} />}>{labels.buy}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.body}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{errors[error]}</p> : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{labels.cancel}</DialogClose>
          <Button disabled={pending} onClick={() => startTransition(async () => {
            const result = await buyPackAction(modelId);
            if (result.ok) setOpen(false);
            else setError(result.error);
          })}>{labels.confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
