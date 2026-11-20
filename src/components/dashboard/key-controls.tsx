"use client";

import PlusIcon from "kubai-icons-react/icons/circle-plus";
import RotateIcon from "kubai-icons-react/icons/rotate-cw";
import { startTransition, useActionState, useRef, useState, useTransition } from "react";

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
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

type Source = "plan_then_prepaid" | "plan_only" | "prepaid_only";

export interface KeyLabels {
  create: string; createTitle: string; createDescription: string; name: string; namePlaceholder: string; limit: string; limitHint: string;
  source: string; models: string; allModels: string; pickModels: string; pickModelsHint: string; createdTitle: string; createdDescription: string;
  rotatedTitle: string; rotatedDescription: string; done: string; keyLabel: string; cancel: string; close: string;
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
      <DialogContent className="sm:max-w-xl" closeLabel={labels.close}>
        <CreateKeyForm key={formKey} labels={labels} models={models} errors={errors} snippet={snippet} />
      </DialogContent>
    </Dialog>
  );
}

function CreateKeyForm({ labels, models, errors, snippet }: { labels: KeyLabels; models: { id: string; name: string }[]; errors: Record<ActionError, string>; snippet: SnippetProps }) {
  const [state, action, pending] = useActionState<KeyResult, FormData>(async (previous, form) => {
    try {
      return await createKeyAction(previous, form);
    } catch {
      // Sesión vencida o el servidor falló: se ve el error genérico en vez de la pantalla de error.
      return { ok: false, error: "error" };
    }
  }, null);
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
    <form
      // Sin `action` en el form: React lo vacía al terminar y un error de validación borraría lo escrito.
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(() => action(form));
      }}
      className="flex flex-col gap-4"
    >
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

type Confirm = "rotate" | "revoke";

/**
 * Rotar (key nueva, la anterior 24 h más) y revocar, ambos con confirmación. Sigue montado cuando la key
 * ya está revocada: así el diálogo termina de cerrarse y devuelve el foco aunque la fila pierda sus botones.
 */
export function KeyActions({ keyId, name, revoked, canRotate, focusId, labels, errors, snippet }: {
  keyId: string;
  name: string;
  revoked: boolean;
  canRotate: boolean;
  /** El nombre de la key en su fila: recibe el foco cuando desaparecen los botones. */
  focusId: string;
  labels: KeyLabels;
  errors: Record<ActionError, string>;
  snippet: SnippetProps;
}) {
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [rotated, setRotated] = useState<string | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [pending, startAction] = useTransition();
  const revokeRef = useRef<HTMLButtonElement>(null);
  /** A dónde va el foco al cerrar la confirmación: su botón, ninguno (se abre la key rotada) o el nombre de la fila. */
  const focusAfter = useRef<"trigger" | "none" | "row">("trigger");
  const finalFocus = () => {
    if (focusAfter.current === "none") return false;
    if (focusAfter.current === "row") return document.getElementById(focusId) ?? true;
    return true;
  };
  const openChange = (kind: Confirm) => (next: boolean) => {
    // Mientras corre la acción no se cierra: su resultado (o su error) se muestra aquí.
    if (pending) return;
    focusAfter.current = "trigger";
    setError(null);
    setConfirm(next ? kind : null);
  };
  const run = (kind: Confirm) => startAction(async () => {
    setError(null);
    let failure: ActionError | null = null;
    let key: string | null = null;
    try {
      if (kind === "rotate") {
        const result = await rotateKeyAction(keyId);
        if (result?.ok) key = result.key;
        else failure = result?.error ?? "error";
      } else {
        const result = await revokeKeyAction(keyId);
        if (!result.ok) failure = result.error;
      }
    } catch {
      // Sesión vencida o un fallo del servidor: el error se ve en el diálogo, que sigue abierto.
      failure = "error";
    }
    startAction(() => {
      if (failure) {
        setError(failure);
        return;
      }
      focusAfter.current = key ? "none" : "row";
      setConfirm(null);
      if (key) {
        setRotated(key);
        setRevealOpen(true);
      }
    });
  });
  const confirmProps = { cancel: labels.cancel, pending, error: error ? errors[error] : null, finalFocus };

  return (
    <div className="flex items-center justify-end gap-1">
      <AlertDialog open={confirm === "rotate"} onOpenChange={openChange("rotate")}>
        {canRotate && !revoked ? (
          <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
            <RotateIcon data-icon="inline-start" aria-hidden />
            {labels.rotate}
          </AlertDialogTrigger>
        ) : null}
        <ConfirmContent
          {...confirmProps}
          title={t(labels.rotateTitle, { name })}
          body={labels.rotateBody}
          confirm={labels.rotateConfirm}
          onConfirm={() => run("rotate")}
        />
      </AlertDialog>
      <AlertDialog open={confirm === "revoke"} onOpenChange={openChange("revoke")}>
        {revoked ? null : (
          <AlertDialogTrigger ref={revokeRef} render={<Button variant="ghost" size="sm" className="text-destructive" />}>
            {labels.revoke}
          </AlertDialogTrigger>
        )}
        <ConfirmContent
          {...confirmProps}
          destructive
          title={t(labels.revokeTitle, { name })}
          body={labels.revokeBody}
          confirm={labels.revokeConfirm}
          onConfirm={() => run("revoke")}
        />
      </AlertDialog>
      <Dialog
        open={revealOpen}
        onOpenChange={setRevealOpen}
        // La key se borra de la memoria cuando el diálogo terminó de cerrarse, no antes: si no, salta su alto.
        onOpenChangeComplete={(open) => { if (!open) setRotated(null); }}
      >
        {/* La key anterior sigue viva 24 horas: su botón de revocar sigue en la fila. */}
        <DialogContent className="sm:max-w-xl" closeLabel={labels.close} finalFocus={revokeRef}>
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

function ConfirmContent({ title, body, confirm, cancel, destructive, pending, error, onConfirm, finalFocus }: {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  destructive?: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  finalFocus: () => HTMLElement | boolean;
}) {
  return (
    <AlertDialogContent finalFocus={finalFocus}>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{body}</AlertDialogDescription>
      </AlertDialogHeader>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{cancel}</AlertDialogCancel>
        {/* El texto queda (transparente) bajo el spinner: el botón no cambia de ancho y conserva su nombre. */}
        <AlertDialogAction
          variant={destructive ? "destructive" : "default"}
          disabled={pending}
          focusableWhenDisabled
          aria-busy={pending || undefined}
          onClick={onConfirm}
          className="relative"
        >
          <span className={cn(pending && "opacity-0")}>{confirm}</span>
          {pending ? <Spinner aria-hidden className="absolute inset-0 m-auto" /> : null}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
