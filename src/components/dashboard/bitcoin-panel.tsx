"use client";

import ArrowUpRightIcon from "kubai-icons-react/icons/arrow-up-right";
import CircleAlertIcon from "kubai-icons-react/icons/circle-alert";
import CircleCheckIcon from "kubai-icons-react/icons/circle-check";
import WalletIcon from "kubai-icons-react/icons/wallet";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { type ActionError, bitcoinQuoteAction, bitcoinStatusAction, simulateBitcoinAction } from "@/app/[lang]/(site)/dashboard/actions";
import { CopyButton } from "@/components/copy-button";
import { PaymentDisclosure } from "@/components/dashboard/deposit-panel";
import { QrCode } from "@/components/dashboard/qr-code";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCount, formatCountdown, formatUsd } from "@/lib/format";
import { type Dictionary, plural, t } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { bip21Url, btcDecimal } from "@/lib/payments/bitcoin/amounts";
import type { BitcoinOrderView, BitcoinReceiptView, BitcoinView } from "@/lib/payments/bitcoin/view";
import { cn } from "@/lib/utils";

export type BitcoinLabels = Dictionary["dashboard"]["bitcoin"];

/** Para qué se cotiza: créditos por un monto, o lo que falta para un plan. */
export type BitcoinPurpose =
  | { kind: "topup" }
  | { kind: "plan"; planId: string; planName: string; missingMicroUsd: bigint };

const PRESETS = [10, 25, 50, 100].map((dollars) => BigInt(dollars) * BigInt(1_000_000));
/** Bitcoin no necesita la prisa de USDC: cada 10 segundos al principio, cada 30 después de 10 minutos. */
const FAST_POLL_MS = 10_000;
const SLOW_POLL_MS = 30_000;
const FAST_FOR_MS = 10 * 60 * 1000;
const MINUTE_MS = 60_000;

/** `12.5` → 12_500_000 µUSD. Solo hasta centavos. */
function parseDollars(text: string): bigint | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return BigInt(match[1]) * BigInt(1_000_000) + BigInt((match[2] ?? "").padEnd(2, "0")) * BigInt(10_000);
}

/**
 * Pagar con Bitcoin on-chain (ADR-0065): elegir cuánto, cotizar con el precio fijo 15 minutos, enviar y ver
 * cómo se confirma. Pregunta sola por el pago mientras la pestaña está a la vista. Con un plan, el servidor lo
 * compra al confirmarse; aquí solo se avisa con `onPlanDone`.
 */
export function BitcoinPanel({ initial, locale, labels, purpose, errors, onPlanDone }: {
  initial: BitcoinView;
  locale: Locale;
  labels: BitcoinLabels;
  purpose: BitcoinPurpose;
  errors: Record<ActionError, string>;
  /** El pago confirmado ya compró el plan. */
  onPlanDone?: (amountMicroUsd: bigint) => void;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [error, setError] = useState<ActionError | null>(null);
  const [busy, startBusy] = useTransition();
  // La primera pintura usa la hora del servidor: así el HTML del servidor y el del navegador coinciden.
  const [now, setNow] = useState(initial.serverNow);
  const offset = useRef(0);
  const pace = useRef({ fastUntil: 0, lastCheck: 0, busy: false });
  /** La cotización que la persona dejó atrás para pedir otra: la siguiente revisión no la vuelve a mostrar. */
  const [dismissed, setDismissed] = useState<string | null>(null);
  const credited = useRef(new Set(initial.receipts.filter((receipt) => receipt.status === "credited").map((receipt) => receipt.id)));
  const planDone = useRef(false);

  const apply = useCallback((next: BitcoinView) => {
    offset.current = next.serverNow - Date.now();
    setView(next);
    const fresh = next.receipts.filter((receipt) => receipt.status === "credited" && !credited.current.has(receipt.id));
    if (fresh.length > 0) {
      for (const receipt of fresh) credited.current.add(receipt.id);
      // El saldo y el historial de la página salen del servidor.
      router.refresh();
    }
  }, [router]);

  const check = useCallback(async () => {
    if (pace.current.busy) return;
    pace.current.busy = true;
    pace.current.lastCheck = Date.now();
    try {
      const result = await bitcoinStatusAction();
      if (result.ok) apply(result.bitcoin);
    } finally {
      pace.current.busy = false;
    }
  }, [apply]);

  useEffect(() => {
    offset.current = initial.serverNow - Date.now();
    pace.current.fastUntil = Date.now() + FAST_FOR_MS;
    void check();
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const current = Date.now();
      if (current > pace.current.fastUntil && current - pace.current.lastCheck < SLOW_POLL_MS) return;
      void check();
    }, FAST_POLL_MS);
    return () => clearInterval(timer);
  }, [check, initial.serverNow]);

  const order = view.order && (purpose.kind === "topup"
    ? view.order.intent === "topup"
    : view.order.intent === "plan" && view.order.planId === purpose.planId)
    && view.order.outcome !== "replaced" && view.order.id !== dismissed
    ? view.order
    : null;
  const live = order !== null && !order.pending && BigInt(order.receivedMicroUsd) === BigInt(0) && now <= order.expiresAt;

  // La cuenta regresiva corre solo mientras hay una cotización vigente.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    if (purpose.kind === "plan" && order?.outcome === "plan" && !planDone.current) {
      planDone.current = true;
      onPlanDone?.(BigInt(order.amountMicroUsd));
    }
  }, [order, purpose.kind, onPlanDone]);

  const quote = (request: Parameters<typeof bitcoinQuoteAction>[0]) => startBusy(async () => {
    setError(null);
    const result = await bitcoinQuoteAction(request);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    pace.current.fastUntil = Date.now() + FAST_FOR_MS;
    setNow(result.bitcoin.serverNow);
    apply(result.bitcoin);
  });
  const simulate = (stage: "seen" | "confirmed") => startBusy(async () => {
    const result = await simulateBitcoinAction(stage);
    if (result.ok) apply(result.bitcoin);
  });

  const money = (micros: bigint | string, kind: "balance" | "whole" = "balance") => formatUsd(Number(micros), locale, kind);
  const receipts = order ? view.receipts.filter((receipt) => receipt.orderId === order.id) : [];
  const others = view.receipts.filter((receipt) => receipt.status === "seen" && receipt.orderId !== order?.id);
  const minutes = formatCount(view.windowMs / MINUTE_MS, locale);
  const planQuote = purpose.kind === "plan" ? () => quote({ intent: "plan", planId: purpose.planId }) : null;

  let body: React.ReactNode;
  if (!order) {
    body = purpose.kind === "plan"
      ? (
        <PlanQuoteForm
          intro={t(labels.planIntro, { amount: money(purpose.missingMicroUsd), minutes })}
          label={t(labels.quote, { amount: money(purpose.missingMicroUsd) })}
          busy={busy}
          labels={labels}
          onQuote={planQuote!}
        />
      )
      : <TopUpForm view={view} locale={locale} labels={labels} busy={busy} onQuote={(amount) => quote({ intent: "topup", amount: amount.toString() })} />;
  } else if (order.pending) {
    body = <SeenStatus order={order} receipts={receipts} view={view} purpose={purpose} locale={locale} labels={labels} />;
  } else if (BigInt(order.receivedMicroUsd) > BigInt(0)) {
    body = (
      <CreditedStatus
        order={order}
        receipts={receipts}
        purpose={purpose}
        locale={locale}
        labels={labels}
        busy={busy}
        onQuoteRest={planQuote}
        onNewQuote={() => setDismissed(order.id)}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <BitcoinQuote
          address={order.address}
          amountSats={BigInt(order.amountSats)}
          rateMicroUsd={BigInt(order.rateMicroUsd)}
          remainingMs={order.expiresAt - now}
          testnet={view.testnet}
          locale={locale}
          labels={labels}
        />
        {live ? (
          <BitcoinStatusLine tone="waiting" title={labels.waiting} hint={labels.waitingHint} />
        ) : (
          <BitcoinStatusLine
            tone="warning"
            title={labels.expired}
            hint={labels.expiredHint}
            action={(
              <Button variant="outline" size="sm" disabled={busy} onClick={() => (planQuote ? planQuote() : setDismissed(order.id))}>
                {busy ? <Spinner data-icon="inline-start" /> : null}{labels.newQuote}
              </Button>
            )}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 text-sm">
      {error ? <p role="alert" className="text-destructive">{errors[error]}</p> : null}
      <div aria-live="polite" className="flex flex-col gap-5">{body}</div>
      {others.map((receipt) => (
        <BitcoinStatusLine
          key={receipt.id}
          tone="seen"
          title={t(labels.seen, { amount: btcDecimal(BigInt(receipt.sats)) })}
          hint={confirmingText(view.confirmations, locale, labels)}
          link={receipt.url ? { href: receipt.url, label: labels.viewTransaction } : undefined}
        />
      ))}

      <PaymentDisclosure title={labels.exchangeTitle}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
          <dt className="text-muted-foreground">{labels.exchangeNetwork}</dt>
          <dd className="font-medium">{labels.exchangeNetworkValue}</dd>
          <dt className="text-muted-foreground">{labels.exchangeAmount}</dt>
          <dd className="font-medium">{labels.exchangeAmountValue}</dd>
        </dl>
        <p className="mt-3 text-muted-foreground">{labels.exchangeHint}</p>
      </PaymentDisclosure>
      <p className="text-xs text-muted-foreground">{labels.addressHint}</p>

      {view.simulate ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || order?.pending === true} onClick={() => simulate("seen")}>{labels.simulateSeen}</Button>
          <Button variant="outline" disabled={busy || !view.receipts.some((receipt) => receipt.status === "seen")} onClick={() => simulate("confirmed")}>
            {labels.simulateConfirmed}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function confirmingText(confirmations: number, locale: Locale, labels: BitcoinLabels) {
  return t(plural(locale, confirmations, labels.confirming, labels.confirmingOther), { count: formatCount(confirmations, locale) });
}

function TopUpForm({ view, locale, labels, busy, onQuote }: {
  view: BitcoinView;
  locale: Locale;
  labels: BitcoinLabels;
  busy: boolean;
  onQuote: (amountMicroUsd: bigint) => void;
}) {
  const [preset, setPreset] = useState(PRESETS[1].toString());
  const [custom, setCustom] = useState("");
  const min = BigInt(view.minMicroUsd);
  const max = BigInt(view.maxMicroUsd);
  const typed = custom.trim() ? parseDollars(custom) : null;
  const amount = custom.trim() ? typed : BigInt(preset);
  const valid = amount !== null && amount >= min && amount <= max;
  const whole = (micros: bigint) => formatUsd(Number(micros), locale, "whole");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">{t(labels.intro, { minutes: formatCount(view.windowMs / MINUTE_MS, locale) })}</p>
      <FieldGroup>
        <ToggleGroup
            spacing={1}
            value={custom.trim() ? [] : [preset]}
            onValueChange={(value) => {
              if (!value[0]) return;
              setPreset(value[0]);
              setCustom("");
            }}
            aria-label={labels.amount}
            className="w-full glass-control p-1"
          >
            {PRESETS.map((value) => (
              <ToggleGroupItem key={value.toString()} value={value.toString()} className="flex-1 tabular-nums">{whole(value)}</ToggleGroupItem>
            ))}
        </ToggleGroup>
        <Field data-invalid={custom.trim() && !valid ? true : undefined}>
          <FieldLabel htmlFor="bitcoin-amount">{labels.otherAmount}</FieldLabel>
          <InputGroup>
            <InputGroupAddon><InputGroupText>USD</InputGroupText></InputGroupAddon>
            <InputGroupInput
              id="bitcoin-amount"
              inputMode="decimal"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className="tabular-nums"
              aria-invalid={custom.trim() && !valid ? true : undefined}
            />
          </InputGroup>
          <FieldDescription>{t(labels.amountHint, { min: whole(min), max: whole(max) })}</FieldDescription>
        </Field>
      </FieldGroup>
      <Button disabled={busy || !valid} onClick={() => { if (valid) onQuote(amount); }}>
        {busy ? <Spinner data-icon="inline-start" /> : null}
        {busy ? labels.quoting : t(labels.quote, { amount: valid ? formatUsd(Number(amount), locale) : whole(min) })}
      </Button>
    </div>
  );
}

function PlanQuoteForm({ intro, label, busy, labels, onQuote }: {
  intro: string;
  label: string;
  busy: boolean;
  labels: BitcoinLabels;
  onQuote: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p>{intro}</p>
      <Button disabled={busy} onClick={onQuote}>
        {busy ? <Spinner data-icon="inline-start" /> : null}
        {busy ? labels.quoting : label}
      </Button>
    </div>
  );
}

/**
 * Una cotización: el QR con el monto puesto, el monto exacto, la dirección y cuánto le queda al precio.
 * Sin estado propio: `/design-system` la muestra con datos fijos.
 */
export function BitcoinQuote({ address, amountSats, rateMicroUsd, remainingMs, testnet, locale, labels }: {
  address: string;
  amountSats: bigint;
  rateMicroUsd: bigint;
  remainingMs: number;
  testnet: boolean;
  locale: Locale;
  labels: BitcoinLabels;
}) {
  const amount = btcDecimal(amountSats);
  const walletUrl = bip21Url(address, amountSats);
  const expired = remainingMs <= 0;
  return (
    <div className="grid gap-6 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-3">
        <QrCode value={walletUrl} label={t(labels.qrLabel, { amount })} className={cn("size-44", expired && "opacity-40")} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{labels.send}</span>
            <CopyButton value={amount} copyLabel={labels.copy} copiedLabel={labels.copied} showLabel />
          </div>
          <p className="rounded-xl glass-control px-3 py-2.5 font-mono text-base font-medium tabular-nums">{amount} BTC</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{labels.address}</span>
            <CopyButton value={address} copyLabel={labels.copy} copiedLabel={labels.copied} showLabel />
          </div>
          <p className="rounded-xl glass-control px-3 py-2.5 font-mono text-sm break-all">{address}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">BTC</Badge>
          {testnet ? <Badge variant="warning">{labels.testnet}</Badge> : null}
          <span className="text-muted-foreground tabular-nums">
            {t(labels.rate, { rate: formatUsd(Number(rateMicroUsd), locale, "whole") })}
            {" · "}
            {expired ? labels.expired : t(labels.fixedFor, { time: formatCountdown(remainingMs, locale) })}
          </span>
        </div>
        {expired ? null : (
          <a href={walletUrl} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
            <WalletIcon data-icon="inline-start" />{labels.openWallet}
          </a>
        )}
      </div>
    </div>
  );
}

/** Una línea de estado del pago: esperando, visto en la red, acreditado o un aviso. */
export function BitcoinStatusLine({ tone, title, hint, link, action }: {
  tone: "waiting" | "seen" | "credited" | "warning";
  title: string;
  hint?: string;
  link?: { href: string; label: string };
  action?: React.ReactNode;
}) {
  const icon = tone === "credited"
    ? <CircleCheckIcon size={20} aria-hidden className="shrink-0" />
    : tone === "warning"
      ? <CircleAlertIcon size={20} aria-hidden className="shrink-0 text-warning" />
      : <Spinner className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />;
  return (
    <div className={cn(
      "flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between",
      tone === "credited" ? "bg-success/10 dark:bg-success/20" : "glass-control",
    )}
    >
      <div className="flex items-start gap-3">
        {icon}
        <div className="flex flex-col gap-0.5">
          <p className="font-medium">{title}</p>
          {hint ? <p className="text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      {link ? (
        <a href={link.href} target="_blank" rel="noreferrer" className="nr-documentation-link inline-flex shrink-0 items-center gap-1">
          {link.label}<ArrowUpRightIcon size={14} aria-hidden />
        </a>
      ) : action}
    </div>
  );
}

function SeenStatus({ order, receipts, view, purpose, locale, labels }: {
  order: BitcoinOrderView;
  receipts: BitcoinReceiptView[];
  view: BitcoinView;
  purpose: BitcoinPurpose;
  locale: Locale;
  labels: BitcoinLabels;
}) {
  const seen = receipts.filter((receipt) => receipt.status === "seen");
  const sats = seen.reduce((sum, receipt) => sum + BigInt(receipt.sats), BigInt(0));
  const usd = formatUsd(Number(seen.reduce((sum, receipt) => sum + BigInt(receipt.amountMicroUsd), BigInt(0))), locale);
  const late = seen.some((receipt) => receipt.rateSource === "market");
  const hint = [
    t(late ? labels.seenMarketHint : labels.seenQuoteHint, { usd }),
    confirmingText(view.confirmations, locale, labels),
    purpose.kind === "plan" && order.intent === "plan" ? t(labels.planOnConfirm, { plan: purpose.planName }) : null,
  ].filter(Boolean).join(" ");
  const url = seen.find((receipt) => receipt.url)?.url;
  return (
    <BitcoinStatusLine
      tone="seen"
      title={t(labels.seen, { amount: btcDecimal(sats) })}
      hint={hint}
      link={url ? { href: url, label: labels.viewTransaction } : undefined}
    />
  );
}

function CreditedStatus({ order, receipts, purpose, locale, labels, busy, onQuoteRest, onNewQuote }: {
  order: BitcoinOrderView;
  receipts: BitcoinReceiptView[];
  purpose: BitcoinPurpose;
  locale: Locale;
  labels: BitcoinLabels;
  busy: boolean;
  onQuoteRest: (() => void) | null;
  onNewQuote: () => void;
}) {
  const received = BigInt(order.receivedMicroUsd);
  const money = (micros: bigint) => formatUsd(Number(micros), locale);
  const url = receipts.find((receipt) => receipt.url)?.url;
  const link = url ? { href: url, label: labels.viewTransaction } : undefined;
  if (purpose.kind === "plan" && order.outcome === null) {
    // Llegó menos de lo que pedía el plan: está en el saldo y falta el resto.
    const needed = BigInt(order.amountMicroUsd);
    const missing = needed > received ? needed - received : BigInt(0);
    return (
      <BitcoinStatusLine
        tone="warning"
        title={t(labels.credited, { amount: money(received) })}
        hint={t(labels.short, { received: money(received), needed: money(needed), missing: money(missing) })}
        action={onQuoteRest ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={onQuoteRest}>
            {busy ? <Spinner data-icon="inline-start" /> : null}{labels.quoteRest}
          </Button>
        ) : null}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <BitcoinStatusLine
        tone="credited"
        title={t(labels.credited, { amount: money(received) })}
        hint={purpose.kind === "plan" && order.outcome === "balance" ? labels.keptAsBalance : undefined}
        link={link}
      />
      {purpose.kind === "topup" ? <Button variant="outline" className="self-start" onClick={onNewQuote}>{labels.newQuote}</Button> : null}
    </div>
  );
}
