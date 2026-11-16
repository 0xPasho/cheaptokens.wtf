"use client";

import PlusIcon from "kubai-icons-react/icons/circle-plus";
import RotateIcon from "kubai-icons-react/icons/rotate-cw";
import { useActionState, useState, useTransition } from "react";

import {
  type ActionError, createKeyAction, type KeyResult, revokeKeyAction, rotateKeyAction,
} from "@/app/[lang]/(site)/dashboard/actions";
import { CopyButton } from "@/components/copy-button";
import { RichText } from "@/components/docs/rich-text";
import { QuickstartSnippet } from "@/components/quickstart-snippet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Source = "plan_then_prepaid" | "plan_only" | "prepaid_only";

export interface KeyLabels {
  create: string; createTitle: string; createDescription: string; name: string; namePlaceholder: string; limit: string; limitHint: string;
  source: string; models: string; allModels: string; pickModels: string; pickModelsHint: string; createdTitle: string; createdDescription: string;
  rotatedTitle: string; rotatedDescription: string; done: string; keyLabel: string; cancel: string;
  rotate: string; rotateTitle: string; rotateBody: string; rotateConfirm: string; revoke: string; revokeTitle: string; revokeBody: string; revokeConfirm: string;
  sources: Record<Source, string>; sourceDescriptions: Record<Source, string>; copy: string; copied: string;
}

interface SnippetProps { baseUrl: string; model: string }

/** La key completa, una sola vez, con el snippet ya armado (patrón de /design-system › API keys). */
function KeyReveal({ apiKey, labels, snippet }: { apiKey: string; labels: KeyLabels; snippet: SnippetProps }) {
  return (
    <>
      <InputGroup>
        <InputGroupInput readOnly value={apiKey} aria-label={labels.keyLabel} className="font-mono text-xs" />
        <InputGroupAddon align="inline-end">
          <CopyButton value={apiKey} size="icon-xs" copyLabel={labels.copy} copiedLabel={labels.copied} />
        </InputGroupAddon>
      </InputGroup>
      <QuickstartSnippet baseUrl={snippet.baseUrl} apiKey={apiKey} model={snippet.model} copyLabel={labels.copy} copiedLabel={labels.copied} className="min-w-0" />
    </>
  );
}

export function CreateKeyDialog({ labels, models, errors, snippet, disabled }: {
  labels: KeyLabels;
  models: { id: string; name: string }[];
  errors: Record<ActionError, string>;
  snippet: SnippetProps;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setFormKey((value) => value + 1); }}>
      <DialogTrigger render={<Button disabled={disabled} />}>
        <PlusIcon data-icon="inline-start" aria-hidden />
        {labels.create}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <CreateKeyForm key={formKey} labels={labels} models={models} errors={errors} snippet={snippet} />
      </DialogContent>
    </Dialog>
  );
}

function CreateKeyForm({ labels, models, errors, snippet }: { labels: KeyLabels; models: { id: string; name: string }[]; errors: Record<ActionError, string>; snippet: SnippetProps }) {
  const [state, action, pending] = useActionState<KeyResult, FormData>(createKeyAction, null);
  const [scope, setScope] = useState<"all" | "pick">("all");
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{labels.createdTitle}</DialogTitle>
          <DialogDescription>{labels.createdDescription}</DialogDescription>
        </DialogHeader>
        <KeyReveal apiKey={state.key} labels={labels} snippet={snippet} />
        <DialogFooter><DialogClose render={<Button />}>{labels.done}</DialogClose></DialogFooter>
      </>
    );
  }
  const error = state && !state.ok ? state.error : null;
  return (
    <form action={action} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{labels.createTitle}</DialogTitle>
        <DialogDescription>{labels.createDescription}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={error === "nameRequired" || undefined}>
          <FieldLabel htmlFor="key-name">{labels.name}</FieldLabel>
          <Input id="key-name" name="name" required maxLength={60} autoComplete="off" placeholder={labels.namePlaceholder} aria-invalid={error === "nameRequired" || undefined} />
          {error === "nameRequired" ? <FieldError>{errors.nameRequired}</FieldError> : null}
        </Field>
        <Field data-invalid={error === "limitInvalid" || undefined}>
          <FieldLabel htmlFor="key-limit">{labels.limit}</FieldLabel>
          <Input id="key-limit" name="limit" inputMode="decimal" className="tabular-nums" aria-invalid={error === "limitInvalid" || undefined} />
          {error === "limitInvalid" ? <FieldError>{errors.limitInvalid}</FieldError> : <FieldDescription>{labels.limitHint}</FieldDescription>}
        </Field>
        <RadioGroup name="source" defaultValue="plan_then_prepaid" aria-label={labels.source}>
          {(["plan_then_prepaid", "plan_only", "prepaid_only"] as const).map((source) => (
            <FieldLabel key={source} htmlFor={`source-${source}`}>
              <Field orientation="horizontal">
                <RadioGroupItem value={source} id={`source-${source}`} />
                <FieldContent>
                  <FieldTitle>{labels.sources[source]}</FieldTitle>
                  <FieldDescription>{labels.sourceDescriptions[source]}</FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
        <Field data-invalid={error === "pickOne" || undefined}>
          <FieldTitle>{labels.models}</FieldTitle>
          <RadioGroup name="models" value={scope} onValueChange={(value) => setScope(value as typeof scope)} aria-label={labels.models} className="flex flex-wrap gap-6">
            {(["all", "pick"] as const).map((value) => (
              <div key={value} className="flex items-center gap-3">
                <RadioGroupItem value={value} id={`models-${value}`} />
                <Label htmlFor={`models-${value}`}>{value === "all" ? labels.allModels : labels.pickModels}</Label>
              </div>
            ))}
          </RadioGroup>
          {scope === "pick" ? (
            <div className="grid max-h-48 gap-2 overflow-y-auto pr-2 sm:grid-cols-2">
              {models.map((model) => (
                <div key={model.id} className="flex items-center gap-3">
                  <Checkbox id={`model-${model.id}`} name="model" value={model.id} />
                  <Label htmlFor={`model-${model.id}`} className="truncate">{model.name}</Label>
                </div>
              ))}
            </div>
          ) : null}
          {error === "pickOne" ? <FieldError>{errors.pickOne}</FieldError> : scope === "pick" ? <FieldDescription><RichText text={labels.pickModelsHint} /></FieldDescription> : null}
        </Field>
      </FieldGroup>
      {error && !["nameRequired", "limitInvalid", "pickOne"].includes(error) ? <p role="alert" className="text-sm text-destructive">{errors[error]}</p> : null}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>{labels.cancel}</DialogClose>
        <Button type="submit" disabled={pending}>{labels.create}</Button>
      </DialogFooter>
    </form>
  );
}

/** Rotar (key nueva, la anterior 24 h más) y revocar, ambos con confirmación. */
export function KeyActions({ keyId, name, canRotate, labels, errors, snippet }: {
  keyId: string;
  name: string;
  canRotate: boolean;
  labels: KeyLabels;
  errors: Record<ActionError, string>;
  snippet: SnippetProps;
}) {
  const [rotated, setRotated] = useState<string | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-end gap-1">
      {error ? <span role="alert" className="mr-2 text-xs text-destructive">{errors[error]}</span> : null}
      {canRotate ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
            <RotateIcon data-icon="inline-start" aria-hidden />
            {labels.rotate}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{labels.rotateTitle.replace("{name}", name)}</AlertDialogTitle>
              <AlertDialogDescription>{labels.rotateBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
              <AlertDialogAction disabled={pending} onClick={() => startTransition(async () => {
                const result = await rotateKeyAction(keyId);
                if (result?.ok) setRotated(result.key);
                else setError(result?.error ?? "error");
              })}>{labels.rotateConfirm}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" size="sm" className="text-destructive" />}>{labels.revoke}</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.revokeTitle.replace("{name}", name)}</AlertDialogTitle>
            <AlertDialogDescription>{labels.revokeBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => startTransition(async () => { await revokeKeyAction(keyId); })}>
              {labels.revokeConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={rotated !== null} onOpenChange={(open) => { if (!open) setRotated(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{labels.rotatedTitle}</DialogTitle>
            <DialogDescription>{labels.rotatedDescription}</DialogDescription>
          </DialogHeader>
          {rotated ? <KeyReveal apiKey={rotated} labels={labels} snippet={snippet} /> : null}
          <DialogFooter><DialogClose render={<Button />}>{labels.done}</DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
