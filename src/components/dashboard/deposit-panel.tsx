"use client";

import ArrowUpRightIcon from "kubai-icons-react/icons/arrow-up-right";
import ChevronDownIcon from "kubai-icons-react/icons/chevron-down";
import CircleCheckIcon from "kubai-icons-react/icons/circle-check";
import WalletIcon from "kubai-icons-react/icons/wallet";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { depositStatusAction, simulateDepositAction } from "@/app/[lang]/(site)/dashboard/actions";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCount, formatUsd } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { walletUrlWithAmount } from "@/lib/payments/crypto/usdc";
import type { DepositNetworkView, DepositView } from "@/lib/payments/crypto/view";
import { cn } from "@/lib/utils";

export type DepositLabels = Dictionary["dashboard"]["deposit"];

/** Recién abierto pregunta cada 5 segundos; después de 10 minutos, cada 20. El servidor lee la cadena como mucho cada 4. */
const FAST_POLL_MS = 5_000;
const SLOW_POLL_MS = 20_000;
const FAST_FOR_MS = 10 * 60 * 1000;
/** Lo que deposita «Simular depósito» en desarrollo cuando no hay un monto pendiente. */
const SIMULATED_MICRO_USD = BigInt(25_000_000);
const ZERO = BigInt(0);

/**
 * El depósito en USDC (ADR-0058): la dirección propia del workspace en cada red, con su QR, y lo que va
 * llegando. Pregunta sola por el depósito mientras la pestaña está a la vista; lo que se acredita aparece
 * aquí y refresca la página.
 */
export function DepositPanel({ initial, locale, labels, needMicroUsd, onUpdate, className }: {
  initial: DepositView;
  locale: string;
  labels: DepositLabels;
  /** Lo que falta para una compra: va puesto en el link de wallet y es lo que deposita la simulación. */
  needMicroUsd?: bigint;
  /** Cada lectura nueva del depósito: el diálogo de compra espera aquí a que alcance el saldo. */
  onUpdate?: (deposit: DepositView) => void;
  className?: string;
}) {
  const [deposit, setDeposit] = useState(initial);
  const [network, setNetwork] = useState<DepositNetworkView["id"]>(initial.networks[0]?.id ?? "solana");
  const [fresh, setFresh] = useState<DepositView["credits"]>([]);
  const [checking, startChecking] = useTransition();
  const router = useRouter();
  const known = useRef(new Set(initial.credits.map((credit) => credit.id)));
  const pace = useRef({ fastUntil: 0, lastCheck: 0, busy: false });
  const notify = useRef(onUpdate);
  useEffect(() => {
    notify.current = onUpdate;
  }, [onUpdate]);

  const apply = useCallback((next: DepositView) => {
    setDeposit(next);
    const added = next.credits.filter((credit) => !known.current.has(credit.id));
    if (added.length > 0) {
      for (const credit of added) known.current.add(credit.id);
      setFresh((current) => [...added, ...current]);
      // El saldo y el historial de la página salen del servidor.
      router.refresh();
    }
    notify.current?.(next);
  }, [router]);

  const check = useCallback(async () => {
    if (pace.current.busy) return;
    pace.current.busy = true;
    pace.current.lastCheck = Date.now();
    try {
      const result = await depositStatusAction();
      if (result.ok) apply(result.deposit);
    } finally {
      pace.current.busy = false;
    }
  }, [apply]);

  useEffect(() => {
    pace.current.fastUntil = Date.now() + FAST_FOR_MS;
    void check();
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now > pace.current.fastUntil && now - pace.current.lastCheck < SLOW_POLL_MS) return;
      void check();
    }, FAST_POLL_MS);
    return () => clearInterval(timer);
  }, [check]);

  const minimum = BigInt(deposit.minMicroUsd);
  const minLabel = `${formatCount(Number(minimum) / 1_000_000, locale)} USDC`;
  const current = deposit.networks.find((candidate) => candidate.id === network) ?? deposit.networks[0];
  const simulated = needMicroUsd !== undefined && needMicroUsd > minimum ? needMicroUsd : needMicroUsd === undefined ? SIMULATED_MICRO_USD : minimum;
  if (!current) return null;

  return (
    <div className={cn("flex flex-col gap-5 text-sm", className)}>
      <Tabs value={network} onValueChange={(value) => setNetwork(value as DepositNetworkView["id"])}>
        <TabsList aria-label={labels.network}>
          {deposit.networks.map((candidate) => (
            <TabsTrigger key={candidate.id} value={candidate.id} className="px-4">{labels.networks[candidate.id]}</TabsTrigger>
          ))}
        </TabsList>
        {deposit.networks.map((candidate) => (
          <TabsContent key={candidate.id} value={candidate.id} className="pt-3">
            <NetworkPanel network={candidate} minLabel={minLabel} needMicroUsd={needMicroUsd} labels={labels} />
          </TabsContent>
        ))}
      </Tabs>

      <DepositStatus
        deposit={deposit}
        fresh={fresh}
        minimum={minimum}
        minLabel={minLabel}
        checking={checking}
        onCheck={() => startChecking(async () => {
          pace.current.fastUntil = Date.now() + FAST_FOR_MS;
          await check();
        })}
        locale={locale}
        labels={labels}
      />

      <div className="rounded-2xl border">
        <Disclosure title={labels.exchangeTitle}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">{labels.exchangeNetwork}</dt>
            <dd className="font-medium">{labels.networks[current.id]}</dd>
            <dt className="text-muted-foreground">{labels.exchangeToken}</dt>
            <dd className="font-medium">USDC</dd>
            {current.id === "solana" ? (
              <>
                <dt className="text-muted-foreground">{labels.exchangeMemo}</dt>
                <dd className="font-medium">{labels.exchangeMemoValue}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{labels.exchangeAmount}</dt>
            <dd className="font-medium">{labels.exchangeAmountValue.replace("{min}", minLabel)}</dd>
          </dl>
          <p className="mt-3 text-muted-foreground">{labels.exchangeHint[current.id]}</p>
        </Disclosure>
      </div>

      <p className="text-xs text-muted-foreground">{labels.otherAssets}</p>

      {deposit.simulate ? (
        <Button variant="outline" disabled={checking} onClick={() => startChecking(async () => {
          const result = await simulateDepositAction(simulated.toString());
          if (result.ok) apply(result.deposit);
        })}>{labels.simulate.replace("{amount}", formatUsd(Number(simulated), locale))}</Button>
      ) : null}
    </div>
  );
}

function NetworkPanel({ network, minLabel, needMicroUsd, labels }: {
  network: DepositNetworkView;
  minLabel: string;
  needMicroUsd?: bigint;
  labels: DepositLabels;
}) {
  const [mode, setMode] = useState<"address" | "wallet">("address");
  const networkName = labels.networks[network.id];
  const walletUrl = needMicroUsd !== undefined && needMicroUsd > ZERO
    ? walletUrlWithAmount(network.id, network.walletUrl, needMicroUsd)
    : network.walletUrl;
  return (
    <div className="grid gap-6 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-3">
        <QrCode
          value={mode === "wallet" ? walletUrl : network.address}
          label={(mode === "wallet" ? labels.qrWalletLabel : labels.qrAddressLabel).replace("{network}", networkName)}
          className="size-44"
        />
        <ToggleGroup
          spacing={1}
          value={[mode]}
          onValueChange={(value) => { if (value[0]) setMode(value[0] as typeof mode); }}
          aria-label={labels.qrMode}
          className="w-full glass-control p-1"
        >
          <ToggleGroupItem value="address" className="flex-1">{labels.qrAddress}</ToggleGroupItem>
          <ToggleGroupItem value="wallet" className="flex-1">{network.id === "solana" ? "Solana Pay" : labels.qrWallet}</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-center text-xs text-muted-foreground">
          {mode === "wallet" ? labels.qrWalletHint[network.id] : labels.qrAddressHint}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{labels.address}</span>
            <CopyButton value={network.address} copyLabel={labels.copy} copiedLabel={labels.copied} showLabel />
          </div>
          <p className="rounded-xl glass-control px-3 py-2.5 font-mono text-sm break-all">{network.address}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline">USDC</Badge>
            <Badge variant="outline">{networkName}</Badge>
            {network.testnet ? <Badge variant="warning">{labels.testnet}</Badge> : null}
          </div>
        </div>
        <p className="text-muted-foreground">
          {labels.addressHint} {labels.only.replace("{network}", networkName).replace("{min}", minLabel)}
        </p>
        <a href={walletUrl} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
          <WalletIcon data-icon="inline-start" />{labels.openWallet}
        </a>
      </div>
    </div>
  );
}

/** Lo que pasa con el depósito: lo acreditado desde que se abrió, lo que viene en camino o la espera. */
function DepositStatus({ deposit, fresh, minimum, minLabel, checking, onCheck, locale, labels }: {
  deposit: DepositView;
  fresh: DepositView["credits"];
  minimum: bigint;
  minLabel: string;
  checking: boolean;
  onCheck: () => void;
  locale: string;
  labels: DepositLabels;
}) {
  const incoming = deposit.networks.filter((network) => BigInt(network.incomingMicroUsd) > ZERO);
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {fresh.map((credit) => (
        <div key={credit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-success/10 p-4 dark:bg-success/20">
          <p className="flex items-center gap-3 font-medium">
            <CircleCheckIcon size={20} aria-hidden />
            {labels.credited.replace("{amount}", formatUsd(Number(credit.amountMicroUsd), locale))}
          </p>
          {credit.url ? (
            <a href={credit.url} target="_blank" rel="noreferrer" className="nr-documentation-link inline-flex items-center gap-1">
              {labels.viewTransaction}<ArrowUpRightIcon size={14} aria-hidden />
            </a>
          ) : null}
        </div>
      ))}
      {incoming.map((network) => {
        const amount = BigInt(network.incomingMicroUsd);
        const waitsForMinimum = !network.sweeping && amount < minimum;
        return (
          <div key={network.id} className="flex items-start gap-3 rounded-2xl glass-control p-4">
            <Spinner className="mt-0.5 text-muted-foreground" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">
                {labels.incoming.replace("{amount}", formatUsd(Number(amount), locale)).replace("{network}", labels.networks[network.id])}
              </p>
              <p className="text-muted-foreground">
                {waitsForMinimum ? labels.belowMinimumHint.replace("{min}", minLabel) : labels.incomingHint}
              </p>
            </div>
          </div>
        );
      })}
      {incoming.length === 0 && fresh.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl glass-control p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Spinner className="mt-0.5 text-muted-foreground" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">{labels.waiting}</p>
              <p className="text-muted-foreground">{labels.waitingHint}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" disabled={checking} onClick={onCheck}>
            {checking ? labels.checking : labels.checkNow}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Collapsible className="group/disclosure">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left font-medium outline-none hover:bg-glass-control-hover focus-visible:ring-[3px] focus-visible:ring-ring/50">
        {title}
        <ChevronDownIcon size={16} aria-hidden className="shrink-0 text-muted-foreground transition-transform group-data-open/disclosure:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** QR en SVG, nítido a cualquier tamaño. Tinta y papel fijos (`--qr`): muchos lectores no leen el QR invertido. */
function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    let d = "";
    // `get(fila, columna)`: la fila es la `y`. Al revés sale un QR en espejo, que no todos los lectores leen.
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    }
    return { size: modules.size, path: d };
  }, [value]);
  return (
    <svg viewBox={`-3 -3 ${size + 6} ${size + 6}`} role="img" aria-label={label} className={cn("rounded-2xl bg-qr text-qr-foreground", className)}>
      <path d={path} fill="currentColor" shapeRendering="crispEdges" />
    </svg>
  );
}
