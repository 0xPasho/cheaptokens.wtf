"use client";

import ChevronDownIcon from "kubai-icons-react/icons/chevron-down";
import PlusIcon from "kubai-icons-react/icons/circle-plus";
import RotateIcon from "kubai-icons-react/icons/rotate-cw";
import SearchIcon from "kubai-icons-react/icons/search";
import { startTransition, useActionState, useRef, useState, useTransition } from "react";

import {
  type ActionError, createKeyAction, type KeyResult, revokeKeyAction, rotateKeyAction,
} from "@/app/[lang]/(site)/dashboard/actions";
import { ModelLogo, providerName } from "@/components/catalog/provider-logo";
import { CopyButton } from "@/components/copy-button";
import { RichText } from "@/components/docs/rich-text";
import { QuickstartSnippet } from "@/components/quickstart-snippet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { plural, t } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

type Source = "plan_then_prepaid" | "plan_only" | "prepaid_only";

export interface KeyLabels {
  create: string; createTitle: string; createDescription: string; name: string; namePlaceholder: string; limit: string; limitHint: string;
  limitPlaceholder: string; limitSummary: string; moreOptions: string; searchModels: string; noModelsMatch: string; modelCount: string; modelCountOne: string;
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

export function CreateKeyDialog({ labels, models, errors, snippet, disabled, locale }: {
  labels: KeyLabels;
  locale: Locale;
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
        <CreateKeyForm key={formKey} labels={labels} models={models} errors={errors} snippet={snippet} locale={locale} />
      </DialogContent>
    </Dialog>
  );
}

/** Igual que el servidor (`parseUsd` en actions.ts): dólares con hasta dos decimales. */
function limitMicros(text: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(",", "."));
  return match ? Number(match[1]) * 1_000_000 + Number((match[2] ?? "").padEnd(2, "0")) * 10_000 : null;
}

const SOURCES = ["plan_then_prepaid", "plan_only", "prepaid_only"] as const;

function CreateKeyForm({ labels, models, errors, snippet, locale }: {
  labels: KeyLabels;
  models: { id: string; name: string }[];
  errors: Record<ActionError, string>;
  snippet: SnippetProps;
  locale: Locale;
}) {
  const [state, action, pending] = useActionState<KeyResult, FormData>(async (previous, form) => {
    try {
      return await createKeyAction(previous, form);
    } catch {
      // Sesión vencida o el servidor falló: se ve el error genérico en vez de la pantalla de error.
      return { ok: false, error: "error" };
    }
  }, null);
  const [scope, setScope] = useState<"all" | "pick">("all");
  const [source, setSource] = useState<Source>("plan_then_prepaid");
  const [limit, setLimit] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  // Un error de algo que está en «Más opciones» las abre, hasta que la persona las vuelva a cerrar.
  const [dismissed, setDismissed] = useState<KeyResult>(null);
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
  const optionsError = error === "limitInvalid" || error === "pickOne";
  const open = moreOpen || (optionsError && dismissed !== state);
  const micros = limitMicros(limit);
  const count = (value: number) => t(plural(locale, value, labels.modelCountOne, labels.modelCount), { count: String(value) });
  // Lo que hoy queda elegido, a la vista sin abrir las opciones.
  const summary = [
    labels.sources[source],
    scope === "all" ? labels.allModels : count(picked.size),
    micros ? t(labels.limitSummary, { amount: formatUsd(micros, locale) }) : labels.limitPlaceholder,
  ].join(" · ");
  const needle = query.trim().toLocaleLowerCase(locale);
  const groups = new Map<string, typeof models>();
  for (const model of models) {
    const author = model.id.split("/")[0];
    groups.set(author, [...(groups.get(author) ?? []), model]);
  }
  const matches = (model: (typeof models)[number]) => !needle || model.name.toLocaleLowerCase(locale).includes(needle) || model.id.includes(needle);
  const toggle = (id: string, checked: boolean) => setPicked((current) => {
    const next = new Set(current);
    if (checked) next.add(id);
    else next.delete(id);
    return next;
  });

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
      <Field data-invalid={error === "nameRequired" || undefined}>
        <FieldLabel htmlFor="key-name">{labels.name}</FieldLabel>
        <Input id="key-name" name="name" required maxLength={60} autoComplete="off" placeholder={labels.namePlaceholder} aria-invalid={error === "nameRequired" || undefined} />
        {error === "nameRequired" ? <FieldError>{errors.nameRequired}</FieldError> : null}
      </Field>

      <Collapsible
        open={open}
        onOpenChange={(next) => { setMoreOpen(next); if (!next) setDismissed(state); }}
        className="group/options rounded-2xl border"
      >
        <CollapsibleTrigger className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-left text-sm outline-none hover:bg-glass-control-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)">
          <span className="font-medium">{labels.moreOptions}</span>
          {/* En pantallas angostas el resumen baja a su propia línea en vez de cortarse. */}
          <span className="order-last basis-full truncate text-muted-foreground sm:order-none sm:min-w-0 sm:flex-1 sm:basis-0">{summary}</span>
          <ChevronDownIcon size={16} aria-hidden className="ml-auto shrink-0 text-muted-foreground transition-transform group-data-open/options:rotate-180" />
        </CollapsibleTrigger>
        {/* Montado aunque esté cerrado: sus campos viajan con el formulario igual. */}
        <CollapsibleContent keepMounted className="px-4 pt-1 pb-4 data-closed:hidden">
          <FieldGroup className="gap-5">
            <Field data-invalid={error === "limitInvalid" || undefined}>
              <FieldLabel htmlFor="key-limit">{labels.limit}</FieldLabel>
              <InputGroup className="sm:max-w-56">
                <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
                <InputGroupInput
                  id="key-limit"
                  name="limit"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={labels.limitPlaceholder}
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  className="tabular-nums"
                  aria-invalid={error === "limitInvalid" || undefined}
                />
              </InputGroup>
              {error === "limitInvalid" ? <FieldError>{errors.limitInvalid}</FieldError> : <FieldDescription>{labels.limitHint}</FieldDescription>}
            </Field>

            <Field>
              <FieldTitle id="key-source-title">{labels.source}</FieldTitle>
              <RadioGroup
                name="source"
                value={source}
                onValueChange={(value) => setSource(value as Source)}
                aria-labelledby="key-source-title"
                className="flex flex-wrap gap-x-6 gap-y-2"
              >
                {SOURCES.map((value) => (
                  <div key={value} className="flex items-center gap-3">
                    <RadioGroupItem value={value} id={`source-${value}`} />
                    <Label htmlFor={`source-${value}`}>{labels.sources[value]}</Label>
                  </div>
                ))}
              </RadioGroup>
              <FieldDescription aria-live="polite">{labels.sourceDescriptions[source]}</FieldDescription>
            </Field>

            <Field data-invalid={error === "pickOne" || undefined}>
              <FieldTitle id="key-models-title">{labels.models}</FieldTitle>
              <RadioGroup
                name="models"
                value={scope}
                onValueChange={(value) => setScope(value as typeof scope)}
                aria-labelledby="key-models-title"
                className="flex flex-wrap gap-x-6 gap-y-2"
              >
                {(["all", "pick"] as const).map((value) => (
                  <div key={value} className="flex items-center gap-3">
                    <RadioGroupItem value={value} id={`models-${value}`} />
                    <Label htmlFor={`models-${value}`}>{value === "all" ? labels.allModels : labels.pickModels}</Label>
                  </div>
                ))}
              </RadioGroup>
              {scope === "pick" ? (
                <div className="flex flex-col overflow-hidden rounded-xl border">
                  <div className="flex items-center gap-2 border-b px-3">
                    <SearchIcon size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      aria-label={labels.searchModels}
                      placeholder={labels.searchModels}
                      className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums" aria-live="polite">{count(picked.size)}</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1">
                    {[...groups].toSorted(([a], [b]) => providerName(a).localeCompare(providerName(b))).map(([author, group]) => {
                      const visible = group.some(matches);
                      // Los que no coinciden con la búsqueda se ocultan sin desmontarse: lo marcado sigue en el formulario.
                      return (
                        <div key={author} role="group" aria-label={providerName(author)} hidden={!visible}>
                          <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground" aria-hidden>{providerName(author)}</p>
                          {group.map((model) => (
                            <label
                              key={model.id}
                              htmlFor={`model-${model.id}`}
                              hidden={!matches(model)}
                              className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-glass-control-hover"
                            >
                              <Checkbox
                                id={`model-${model.id}`}
                                name="model"
                                value={model.id}
                                checked={picked.has(model.id)}
                                onCheckedChange={(checked) => toggle(model.id, checked)}
                              />
                              <ModelLogo modelId={model.id} />
                              <span className="truncate">{model.name}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                    {models.some(matches) ? null : <p className="px-2 py-3 text-sm text-muted-foreground">{labels.noModelsMatch}</p>}
                  </div>
                </div>
              ) : null}
              {error === "pickOne" ? <FieldError>{errors.pickOne}</FieldError> : scope === "pick" ? <FieldDescription><RichText text={labels.pickModelsHint} /></FieldDescription> : null}
            </Field>
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>

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
