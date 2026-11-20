"use client";

import CircleCheckIcon from "kubai-icons-react/icons/circle-check";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";

import { type ActionError, type BitcoinResult, bitcoinStatusAction, buyPlanAction, depositStatusAction } from "@/app/[lang]/(site)/dashboard/actions";
import { type BitcoinLabels, BitcoinPanel } from "@/components/dashboard/bitcoin-panel";
import { type DepositLabels, DepositPanel, emptyDepositView } from "@/components/dashboard/deposit-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { BitcoinView } from "@/lib/payments/bitcoin/view";
import { usdcDecimal } from "@/lib/payments/crypto/usdc";
import type { DepositView } from "@/lib/payments/crypto/view";
import { cn } from "@/lib/utils";

export type PurchaseLabels = Dictionary["dashboard"]["purchase"];

interface PurchaseRequest {
  planId: string;
  /** El nombre del plan, para el aviso de Bitcoin («Pro se activa al confirmarse»). */
  planName: string;
  /** µUSD como texto: el precio cuando se renderizó la página. El servidor lo vuelve a calcular al cobrar. */
  priceMicroUsd: string;
  title: string;
  description?: string;
  /** El texto de «listo» según lo comprado. */
  done: string;
}

const PurchaseContext = createContext<((request: PurchaseRequest) => void) | null>(null);
const ZERO = BigInt(0);

/**
 * El diálogo de compra de un plan (ADR-0058): se paga con el saldo y, si no alcanza, muestra el depósito y
 * completa la compra cuando llega. Con Bitcoin (ADR-0063) la compra la completa el servidor al confirmarse,
 * aunque se cierre el diálogo. Vive aquí arriba y no en cada botón: al comprar un plan, su botón desaparece
 * de la página y se llevaría el diálogo con la confirmación.
 */
export function PurchaseProvider({ balanceMicroUsd, locale, labels, depositLabels, bitcoinLabels, errors, children }: {
  /** µUSD como texto: el saldo cuando se renderizó la página. */
  balanceMicroUsd: string;
  locale: Locale;
  labels: PurchaseLabels;
  depositLabels: DepositLabels;
  bitcoinLabels: BitcoinLabels;
  errors: Record<ActionError, string>;
  children: React.ReactNode;
}) {
  const [request, setRequest] = useState<PurchaseRequest | null>(null);
  const [open, setOpen] = useState(false);
  const start = useCallback((next: PurchaseRequest) => {
    setRequest(next);
    setOpen(true);
  }, []);
  return (
    <PurchaseContext value={start}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl" closeLabel={labels.close}>
          {request ? (
            <div className="-m-1 flex max-h-[calc(100dvh-6rem)] flex-col gap-5 overflow-y-auto p-1">
              <DialogHeader>
                <DialogTitle>{request.title}</DialogTitle>
                {request.description ? <DialogDescription>{request.description}</DialogDescription> : null}
              </DialogHeader>
              {open ? (
                <PurchaseBody
                  request={request}
                  balanceMicroUsd={balanceMicroUsd}
                  locale={locale}
                  labels={labels}
                  depositLabels={depositLabels}
                  bitcoinLabels={bitcoinLabels}
                  errors={errors}
                />
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PurchaseContext>
  );
}

/** Botón que abre la compra de un plan. Va dentro de un `PurchaseProvider`. */
export function PurchaseButton({ label, variant = "default", disabled, className, ...request }: PurchaseRequest & {
  label: string;
  variant?: "default" | "outline";
  disabled?: boolean;
  className?: string;
}) {
  const start = useContext(PurchaseContext);
  if (!start) throw new Error("PurchaseButton must be inside a PurchaseProvider");
  return (
    <Button variant={variant} className={cn("w-full", className)} disabled={disabled} onClick={() => start(request)}>
      {label}
    </Button>
  );
}

function PurchaseBody({ request, balanceMicroUsd, locale, labels, depositLabels, bitcoinLabels, errors }: {
  request: PurchaseRequest;
  balanceMicroUsd: string;
  locale: Locale;
  labels: PurchaseLabels;
  depositLabels: DepositLabels;
  bitcoinLabels: BitcoinLabels;
  errors: Record<ActionError, string>;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(() => BigInt(request.priceMicroUsd));
  const [balance, setBalance] = useState(() => BigInt(balanceMicroUsd));
  const [deposit, setDeposit] = useState<DepositView | null>(null);
  const [bitcoin, setBitcoin] = useState<BitcoinView | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [paid, setPaid] = useState<bigint | null>(null);
  const [pending, startTransition] = useTransition();
  /** Se mostró el depósito porque el saldo no alcanzaba: cuando alcance, la compra se completa sola. */
  const [waitedForDeposit, setWaitedForDeposit] = useState(false);
  const buying = useRef(false);
  const missing = price > balance ? price - balance : ZERO;
  const money = (micros: bigint) => formatUsd(Number(micros), locale);

  const buy = useCallback(() => {
    if (buying.current) return;
    buying.current = true;
    startTransition(async () => {
      try {
        const outcome = await buyPlanAction(request.planId);
        if (outcome.ok) {
          setPaid(BigInt(outcome.amountMicroUsd));
          router.refresh();
        } else if (outcome.error === "insufficientBalance" && outcome.missingMicroUsd && outcome.balanceMicroUsd) {
          // El precio o el saldo cambiaron desde que se abrió la página: se muestra lo que dice el servidor.
          setBalance(BigInt(outcome.balanceMicroUsd));
          setPrice(BigInt(outcome.balanceMicroUsd) + BigInt(outcome.missingMicroUsd));
        } else {
          setError(outcome.error);
        }
      } finally {
        buying.current = false;
      }
    });
  }, [request.planId, router]);

  // Sin saldo suficiente hace falta la dirección de depósito.
  const needsDeposit = missing > ZERO && deposit === null && paid === null && error === null;
  useEffect(() => {
    if (!needsDeposit) return;
    let cancelled = false;
    // USDC y Bitcoin a la vez: basta con que uno de los dos esté disponible.
    const bitcoinStatus = bitcoinStatusAction().catch((): BitcoinResult => ({ ok: false, error: "error" }));
    void Promise.all([depositStatusAction(), bitcoinStatus]).then(([status, btc]) => {
      if (cancelled) return;
      if (!status.ok && !btc.ok) {
        setError(status.error);
        return;
      }
      const current = BigInt(status.ok ? status.deposit.balanceMicroUsd : btc.ok ? btc.bitcoin.balanceMicroUsd : "0");
      setDeposit(status.ok ? status.deposit : emptyDepositView(current.toString()));
      setBitcoin(btc.ok ? btc.bitcoin : null);
      setBalance(current);
      // Solo se completa sola si de verdad hubo que esperar un depósito. Si el saldo ya alcanzaba (la
      // página tenía uno viejo), la persona confirma con el botón como siempre.
      if (current < price) setWaitedForDeposit(true);
    });
    return () => {
      cancelled = true;
    };
  }, [needsDeposit, price]);

  // El depósito ya alcanza: se completa la compra que la persona vino a hacer.
  const completes = waitedForDeposit && missing === ZERO && paid === null && error === null;
  useEffect(() => {
    if (completes) buy();
  }, [completes, buy]);

  const onDeposit = useCallback((next: DepositView) => setBalance(BigInt(next.balanceMicroUsd)), []);
  // El servidor ya compró el plan al confirmarse el pago en Bitcoin: no se vuelve a comprar aquí.
  const onBitcoinPlan = useCallback(() => {
    setPaid(price);
    router.refresh();
  }, [price, router]);
  const rows = [
    [labels.price, money(price)],
    [labels.balance, money(balance)],
    missing > ZERO ? [labels.missing, money(missing)] : [labels.remaining, money(balance - price)],
  ];

  if (paid !== null) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <span className="flex size-16 items-center justify-center rounded-full bg-success/10 dark:bg-success/20">
          <CircleCheckIcon size={36} aria-hidden />
        </span>
        <p className="font-heading text-2xl tracking-tight">{labels.doneTitle}</p>
        <p className="max-w-md text-muted-foreground">{request.done}</p>
        <DialogClose render={<Button className="mt-2" />}>{labels.done}</DialogClose>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 text-sm">
      <dl className="flex flex-col rounded-2xl border px-4">
        {rows.map(([term, value], index) => (
          <div key={term} className="flex items-baseline justify-between gap-3 border-t py-3 first:border-t-0">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className={cn("font-medium tabular-nums", index === 2 && missing > ZERO && "text-warning")}>{value}</dd>
          </div>
        ))}
      </dl>
      {error ? <p role="alert" className="text-destructive">{errors[error]}</p> : null}
      {missing === ZERO ? (
        <Button onClick={buy} disabled={pending || error !== null}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? (waitedForDeposit ? labels.completing : labels.paying) : labels.pay.replace("{amount}", money(price))}
        </Button>
      ) : deposit ? (
        <DepositPanel
          initial={deposit}
          locale={locale}
          labels={depositLabels}
          needMicroUsd={missing}
          onUpdate={onDeposit}
          usdcIntro={(
            <p>
              {labels.depositFirst.replace("{amount}", usdcDecimal(missing))}{" "}
              <span className="text-muted-foreground">{labels.depositLater}</span>
            </p>
          )}
          bitcoin={bitcoin ? {
            label: bitcoinLabels.tab,
            active: bitcoin.order?.intent === "plan" && bitcoin.order.planId === request.planId && bitcoin.order.outcome === null,
            content: (
              <BitcoinPanel
                initial={bitcoin}
                locale={locale}
                labels={bitcoinLabels}
                purpose={{ kind: "plan", planId: request.planId, planName: request.planName, missingMicroUsd: missing }}
                errors={errors}
                onPlanDone={onBitcoinPlan}
              />
            ),
          } : undefined}
        />
      ) : error ? null : (
        <p className="flex items-center gap-2 py-8 text-muted-foreground" aria-live="polite"><Spinner />{labels.loading}</p>
      )}
    </div>
  );
}
