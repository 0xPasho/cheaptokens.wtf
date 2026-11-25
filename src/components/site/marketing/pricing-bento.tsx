/* eslint-disable @next/next/no-img-element -- Logos SVG locales y pequeños, como en el resto del sitio. */
import CopyIcon from "kubai-icons-react/icons/copy";
import SendIcon from "kubai-icons-react/icons/send";
import WalletIcon from "kubai-icons-react/icons/wallet";
import Link from "next/link";

import { ProviderLogo, providerName } from "@/components/catalog/provider-logo";
import { getKeyHref } from "@/lib/auth/redirect";
import { PLANS } from "@/lib/billing/plans";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { BITCOIN_QUOTE_MINUTES, DEFAULT_OVERFLOW_CAP_MICRO_USD, MIN_BITCOIN_ORDER_MICRO_USD, MIN_DEPOSIT_MICRO_USD } from "@/lib/marketing";

import { FeatureDialog } from "./feature-dialog";

/** Alto de cada barra de la ventana, en %: una jornada de uso con picos. Las primeras `USED` ya pasaron. */
const BARS = [28, 44, 36, 62, 48, 70, 54, 82, 66, 58, 90, 74, 62, 80, 52, 68, 46, 38, 56, 42, 34, 48, 30, 40, 26, 36];
const USED = 17;
/** Cuántos autores se ven en el cuadro de modelos. */
const SHOWN_AUTHORS = 10;
/** El costo de cada momento, en el alto del dibujo (0 arriba, 100 abajo): siempre por debajo de la línea del tope. */
const COST_PATH = "M0,78 C40,74 70,86 110,80 S180,66 220,72 S300,88 340,76 S420,64 460,74 S540,84 580,70 S620,72 640,68";

/**
 * Cómo se cobra, en siete cuadros con un dibujo en código cada uno (refs. del dueño): límites, el reparto plan y
 * créditos, los modelos, el cobro cero si falla, el llamado a empezar, cómo pagar y el precio tope. Todo neutro: el
 * único color es el de las marcas (logos) y el del ahorro. El movimiento es CSS y se apaga con «reducir movimiento».
 */
export function PricingBento({ models, model, locale, dict }: {
  models: CatalogModel[];
  /** El modelo del ejemplo del precio tope: el de referencia del dashboard. */
  model: CatalogModel;
  locale: Locale;
  dict: Dictionary;
}) {
  const b = dict.pricing.bento;
  const pay = dict.pricing.paySteps;
  const usd = (micros: number, kind: "whole" | "price" | "balance" = "whole") => formatUsd(micros, locale, kind);
  const counts = new Map<string, number>();
  for (const item of models) counts.set(item.author, (counts.get(item.author) ?? 0) + 1);
  const authors = [...counts].toSorted((a, z) => z[1] - a[1] || a[0].localeCompare(z[0])).slice(0, SHOWN_AUTHORS).map(([author]) => author);
  const capShare = model.officialOutput > 0 ? model.discountedOutput / model.officialOutput : 0.3;

  return (
    <div className="nr-bento">
      {/* Límites: la ventana de 5 horas como barras de uso; las que ya pasaron, en tinta. */}
      <article className="nr-bento-card">
        <div className="nr-bento-visual nr-bv-limits" aria-hidden>
          <span className="nr-bv-pill">{b.limits.window}</span>
          <div className="nr-bv-bars">
            {BARS.map((height, index) => (
              <i key={index} data-used={index < USED || undefined} style={{ "--h": `${height}%`, "--d": `${index * 70}ms` } as React.CSSProperties} />
            ))}
            <span className="nr-bv-reset"><span>{b.limits.reset}</span></span>
          </div>
        </div>
        <div className="nr-bento-text"><h3>{b.limits.title}</h3><p>{b.limits.body}</p></div>
      </article>

      {/* El reparto: se llena el plan y, al tocar su límite, siguen los créditos hasta el tope. */}
      <article className="nr-bento-card nr-bento-wide">
        <div className="nr-bento-visual nr-bv-flow" aria-hidden>
          <div className="nr-bv-flow-marks"><span>{b.flow.limit}</span><span>{b.flow.capMark}</span></div>
          <div className="nr-bv-flow-track">
            <span className="nr-bv-flow-plan"><i /></span>
            <span className="nr-bv-flow-credits"><i /></span>
          </div>
          <div className="nr-bv-flow-legend">
            <span><b>{b.flow.plan}</b>{usd(Number(PLANS.pro.fiveHourLimitMicroUsd), "balance")}</span>
            <span><b>{b.flow.credits}</b>{t(b.flow.cap, { amount: usd(DEFAULT_OVERFLOW_CAP_MICRO_USD) })}</span>
          </div>
        </div>
        <div className="nr-bento-text"><h3>{b.flow.title}</h3><p>{b.flow.body}</p></div>
      </article>

      {/* Los modelos: los logos de los laboratorios que más modelos tienen, flotando. */}
      <article className="nr-bento-card">
        <div className="nr-bento-visual nr-bv-models">
          <ul aria-label={b.models.title.replace("{count}", formatCount(models.length, locale))}>
            {authors.map((author, index) => (
              <li key={author} style={{ "--d": `${(index % 5) * -0.7}s` } as React.CSSProperties}>
                <ProviderLogo author={author} /><span className="sr-only">{providerName(author)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="nr-bento-text"><h3>{t(b.models.title, { count: formatCount(models.length, locale) })}</h3><p>{b.models.body}</p></div>
      </article>

      {/* Si falla: el aviso de un 503 llega por las pistas y cuesta cero. */}
      <article className="nr-bento-card">
        <div className="nr-bento-visual nr-bv-fail" aria-hidden>
          <span className="nr-bv-trace" style={{ "--y": "30%", "--d": "0s" } as React.CSSProperties} />
          <span className="nr-bv-trace" style={{ "--y": "50%", "--d": "-0.9s" } as React.CSSProperties} />
          <span className="nr-bv-trace" style={{ "--y": "70%", "--d": "-1.8s" } as React.CSSProperties} />
          <div className="nr-bv-toast">
            <span className="nr-bv-toast-icon">503</span>
            <span className="nr-bv-toast-text"><b>{b.fail.event}</b><code>upstream_error</code></span>
            <span className="nr-bv-toast-amount">{usd(0, "balance")}</span>
          </div>
        </div>
        <div className="nr-bento-text"><h3>{b.fail.title}</h3><p>{b.fail.body}</p></div>
      </article>

      {/* El llamado: la tarjeta en tinta, como el botón principal. */}
      <Link href={getKeyHref(locale)} className="nr-bento-card nr-bento-cta">
        {/* La flecha en trazo, del color del texto: el icono de bola no se leía sobre el fondo claro. */}
        <span className="nr-bento-cta-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
        </span>
        <div className="nr-bento-text">
          <h3>{t(b.cta.title, { amount: usd(MIN_DEPOSIT_MICRO_USD) })}</h3>
          <p>{b.cta.body}</p>
        </div>
      </Link>

      {/* Cómo pagar: USDC y Bitcoin al centro, Solana y Base en órbita. El detalle, en su diálogo. */}
      <article className="nr-bento-card">
        <div className="nr-bento-visual nr-bv-pay" aria-hidden>
          <span className="nr-bv-orbit"><img src="/brand/logos/solana.svg" alt="" width={16} height={16} /><img src="/brand/logos/base.svg" alt="" width={16} height={16} /></span>
          <span className="nr-bv-coin"><img src="/brand/logos/usdc-color.svg" alt="" width={40} height={40} /></span>
          <span className="nr-bv-coin"><img src="/brand/logos/bitcoin-color.svg" alt="" width={40} height={40} /></span>
        </div>
        <div className="nr-bento-text">
          <h3>{b.pay.title}</h3>
          <p>{b.pay.body}</p>
          <FeatureDialog
            trigger={{ label: <>{b.pay.action}<span aria-hidden>→</span></>, className: "nr-bento-action" }}
            title={b.payModal.title}
            description={pay.description}
            rows={[
              { icon: <CopyIcon />, title: pay.steps[0].title, body: pay.steps[0].body },
              { icon: <SendIcon />, title: pay.steps[1].title, body: t(pay.steps[1].body, { min: usd(MIN_DEPOSIT_MICRO_USD) }) },
              { icon: <WalletIcon />, title: pay.steps[2].title, body: pay.steps[2].body },
              {
                icon: <img src="/brand/logos/bitcoin-color.svg" alt="" width={20} height={20} />,
                title: pay.bitcoin.title,
                body: t(pay.bitcoin.body, { btcMin: usd(MIN_BITCOIN_ORDER_MICRO_USD), minutes: formatCount(BITCOIN_QUOTE_MINUTES, locale) }),
              },
            ]}
            primary={{ label: b.payModal.primary, href: `/${locale}/dashboard/credits` }}
            later={b.payModal.later}
            closeLabel={dict.dashboard.close}
          />
        </div>
      </article>

      {/* El tope: el costo de cada momento se dibuja por debajo de la línea del precio publicado. */}
      <article className="nr-bento-card nr-bento-wide">
        <div className="nr-bento-visual nr-bv-cap" aria-hidden>
          <span className="nr-bv-line" data-kind="official" style={{ top: "16%" }}><s>{t(b.cap.official, { amount: usd(model.officialOutput, "price") })}</s></span>
          <span className="nr-bv-line" data-kind="cap" style={{ top: `${Math.round((1 - capShare) * 30 + 36)}%` }}><b>{t(b.cap.cap, { amount: usd(model.discountedOutput, "price") })}</b></span>
          <svg viewBox="0 0 640 100" preserveAspectRatio="none">
            {/* Sin `non-scaling-stroke`: con él, `pathLength` deja de medir el trazo y el dibujo salía a pedazos. El dibujo
                se estira casi igual en los dos ejes (640×100 en ~1200×196), así que el grosor apenas cambia. */}
            <path d={COST_PATH} pathLength={1} />
          </svg>
          <span className="nr-bv-dot" style={{ left: "calc(100% + 6px)", top: "68%" }} />
        </div>
        <div className="nr-bento-text"><h3>{b.cap.title}</h3><p>{b.cap.body}</p></div>
      </article>
    </div>
  );
}
