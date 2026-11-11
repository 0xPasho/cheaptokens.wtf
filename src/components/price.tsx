import { formatUsd, type MoneyKind } from "@/lib/format";
import { cn } from "@/lib/utils";

type PriceProps = {
  /** Monto en µUSD (ADR-0007). */
  micros: number;
  locale: string;
  kind?: MoneyKind;
  className?: string;
};

/** Un monto en USD con números tabulares. Todo dinero en la UI pasa por aquí. */
export function Price({ micros, locale, kind = "balance", className }: PriceProps) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatUsd(micros, locale, kind)}
    </span>
  );
}

type PriceComparisonProps = {
  /** Precio oficial por 1M de tokens, en µUSD. */
  official: number;
  /** Precio cheaptokens.wtf por 1M de tokens, en µUSD. */
  discounted: number;
  locale: string;
  labels?: { official?: string; discounted?: string };
  className?: string;
};

/**
 * Precio oficial tachado y precio cheaptokens.wtf al lado: ~~$3.00~~ **$0.30**.
 * Las etiquetas solo existen para lectores de pantalla, porque el tachado no se anuncia.
 */
export function PriceComparison({
  official,
  discounted,
  locale,
  labels,
  className,
}: PriceComparisonProps) {
  const text = { official: "Official price", discounted: "cheaptokens.wtf price", ...labels };

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 whitespace-nowrap tabular-nums",
        className,
      )}
    >
      <s className="text-muted-foreground">
        <span className="sr-only">{text.official}: </span>
        {formatUsd(official, locale, "price")}
      </s>
      <span className="font-medium text-foreground">
        <span className="sr-only">{text.discounted}: </span>
        {formatUsd(discounted, locale, "price")}
      </span>
    </span>
  );
}
