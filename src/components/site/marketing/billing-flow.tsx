import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { formatCount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { BITCOIN_QUOTE_MINUTES, DEFAULT_OVERFLOW_CAP_MICRO_USD } from "@/lib/marketing";

/** Cuánto llena cada medidor del dibujo: plan a medias, plan lleno y el excedente en su tope. */
const METERS = [72, 100, 28];

/** Cómo se reparte un request entre el plan y los créditos (08 · Créditos y pagos › Orden de cobro). */
export function BillingFlow({ locale, dict, withHead = true }: {
  locale: Locale;
  dict: Dictionary;
  /** En la landing va dentro de Precios con su propio `h3`. En /pricing la sección ya pone el título. */
  withHead?: boolean;
}) {
  const d = dict.pricing.flow;
  const StepHeading = withHead ? "h4" : "h3";
  return (
    <div className="nr-mk-flow-block">
      {withHead ? (
        <div className="nr-mk-subhead">
          <h3>{d.title}</h3>
          <p>{d.description}</p>
        </div>
      ) : null}
      <ol className="nr-mk-combo">
        {d.steps.map((step, index) => (
          <li key={step.title} className="nr-mk-combo-step">
            <span className="nr-mk-step-number" aria-hidden>{formatCount(index + 1, locale).padStart(2, "0")}</span>
            <StepHeading>{step.title}</StepHeading>
            <p>{t(step.body, { cap: formatUsd(DEFAULT_OVERFLOW_CAP_MICRO_USD, locale, "whole") })}</p>
            <div className="nr-mk-meter" aria-hidden><i style={{ width: `${METERS[index]}%` }} data-muted={index === 2 || undefined} /></div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Cómo se paga, en pocas líneas: USDC en Solana o Base, con dirección propia y saldo dólar por dólar (ADR-0058),
 * o Bitcoin, con el precio fijo por unos minutos (ADR-0065).
 */
export function PayNote({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const d = dict.pricing.pay;
  return (
    <div className="nr-mk-pay">
      <ul className="nr-mk-pay-nets"><li>USDC · Solana</li><li>USDC · Base</li><li>Bitcoin</li></ul>
      <p><b>{d.title}</b> {t(d.body, { minutes: formatCount(BITCOIN_QUOTE_MINUTES, locale) })}</p>
      <Link href={`/${locale}/dashboard/credits`} className={buttonVariants({ variant: "secondary", className: "nr-mk-button" })}>{d.cta}</Link>
    </div>
  );
}
