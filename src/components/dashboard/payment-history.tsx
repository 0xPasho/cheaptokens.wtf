import ArrowUpRightIcon from "kubai-icons-react/icons/arrow-up-right";
import TimerIcon from "kubai-icons-react/icons/timer";
import WalletIcon from "kubai-icons-react/icons/wallet";

import { ModelLogo } from "@/components/catalog/provider-logo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** De qué se pagó: decide el círculo de la izquierda. */
export type PaymentMark =
  | { kind: "bitcoin" }
  | { kind: "usdc" }
  | { kind: "plan" }
  | { kind: "model"; modelId: string }
  | { kind: "balance" };

export interface PaymentRow {
  id: string;
  title: string;
  /** La fecha y, si aplica, la red: «14 nov 2026 · Base». */
  detail: string;
  status: string;
  /** True si el pago sumó saldo: el monto va con «+» y en `success` (docs/13 › Color). */
  credit: boolean;
  amount: string;
  receiptUrl: string | null;
  mark: PaymentMark;
}

function Mark({ mark }: { mark: PaymentMark }) {
  const logo = (file: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- SVG local y pequeño, como los logos de modelos.
    <img src={`/brand/logos/${file}.svg`} alt="" width={20} height={20} className="size-5" />
  );
  return (
    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-glass-control text-foreground">
      {mark.kind === "bitcoin" ? logo("bitcoin-color")
        : mark.kind === "usdc" ? logo("usdc-color")
          : mark.kind === "model" ? <ModelLogo modelId={mark.modelId} />
            : mark.kind === "plan" ? <TimerIcon size={20} />
              : <WalletIcon size={20} />}
    </span>
  );
}

/**
 * El historial de pagos como lista, no como planilla: cada pago con su marca, qué fue y cuándo, su estado y el
 * monto. Sin líneas entre filas; el recibo aparece solo donde existe, en vez de una columna llena de «—».
 */
export function PaymentHistory({ rows, receiptLabel, label }: { rows: PaymentRow[]; receiptLabel: string; label: string }) {
  const receipts = rows.some((row) => row.receiptUrl !== null);
  // Las columnas son las mismas en todas las filas: estados, montos y recibos quedan alineados entre sí.
  const columns = receipts
    ? "sm:grid-cols-[2.5rem_minmax(0,1fr)_10rem_7rem_5.5rem]"
    : "sm:grid-cols-[2.5rem_minmax(0,1fr)_10rem_7rem]";
  return (
    <Card className="gap-1 p-2">
      <ul aria-label={label} className="flex flex-col gap-1">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn("grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-glass-control-hover", columns)}
          >
            <Mark mark={row.mark} />
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-medium">{row.title}</p>
              <p className="text-muted-foreground tabular-nums sm:truncate">
                {row.detail}
                {/* En móvil el recibo va en esta línea: no hay ancho para su columna. */}
                {row.receiptUrl ? (
                  <span className="sm:hidden"> · <a href={row.receiptUrl} target="_blank" rel="noreferrer" className="nr-documentation-link">{receiptLabel}</a></span>
                ) : null}
              </p>
            </div>
            <div className="hidden sm:flex">
              <Badge variant={row.credit ? "success" : "secondary"}>{row.status}</Badge>
            </div>
            {/* En móvil el estado va bajo el monto, como en un extracto: en la línea de la fecha se cortaba. */}
            <div className="flex flex-col items-end">
              <p className={cn("font-medium whitespace-nowrap tabular-nums", row.credit && "text-success")}>{row.amount}</p>
              <p className="text-xs text-muted-foreground sm:hidden">{row.status}</p>
            </div>
            {receipts ? (
              // Al inicio de su columna: alineado a la derecha, el ancho del texto lo dejaba en medio píxel.
              <div className="hidden sm:flex">
                {row.receiptUrl ? (
                  <a
                    href={row.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-glass-control px-2.5 text-xs font-medium transition-colors hover:bg-glass-control-hover"
                  >
                    {receiptLabel}
                    <ArrowUpRightIcon size={14} aria-hidden />
                  </a>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
