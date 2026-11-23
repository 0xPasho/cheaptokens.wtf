import { ModelLogo } from "@/components/catalog/provider-logo";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatDiscount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";

/** Qué parte del tope llena la barra de «Lo que pagas»: solo dibuja que puede quedar por debajo, no es un dato. */
const PAID_SHARE_OF_CAP = 0.88;

/**
 * El precio publicado es un tope (ADR-0062), en tres barras por 1M de tokens de salida: el oficial, el nuestro y lo que
 * se paga, que llega como mucho a la línea del tope. Barras neutras: el único color es el ahorro, dinero a favor
 * (docs/13 › Color). Los precios salen del catálogo en vivo.
 */
export function CapChart({ model, locale, dict }: { model: CatalogModel; locale: Locale; dict: Dictionary }) {
  const d = dict.howItWorks.why;
  const price = (micros: number) => formatUsd(micros, locale, "price");
  const cap = model.officialOutput > 0 ? (model.discountedOutput / model.officialOutput) * 100 : 100;
  return (
    <figure className="nr-hw-cap">
      <figcaption><ModelLogo modelId={model.id} />{t(d.chart, { model: model.name })}</figcaption>
      <div className="nr-hw-bars">
        <ul>
          <li className="nr-hw-bar" data-kind="official">
            <span>{d.official}</span><s>{price(model.officialOutput)}</s>
            <span className="nr-hw-bar-track" aria-hidden><i style={{ width: "100%" }} /></span>
          </li>
          <li className="nr-hw-bar" data-kind="cap">
            <span>{d.cap}</span><b>{price(model.discountedOutput)}</b>
            <span className="nr-hw-bar-track" aria-hidden><i style={{ width: `${cap}%` }} /></span>
          </li>
          <li className="nr-hw-bar" data-kind="paid">
            <span>{d.paid}</span><b>{t(d.paidValue, { amount: price(model.discountedOutput) })}</b>
            <span className="nr-hw-bar-track" aria-hidden><i style={{ width: `${cap * PAID_SHARE_OF_CAP}%` }} /></span>
            {/* La línea del tope sube hasta la barra del precio publicado: lo que pagas no la cruza. */}
            <span className="nr-hw-cap-line" style={{ left: `${cap}%` }} aria-hidden><span>{d.capMark}</span></span>
          </li>
        </ul>
      </div>
      <p className="nr-hw-cap-foot">
        <span>{d.chartFoot}</span>
        <span className="nr-hw-savings">
          {t(d.savings, { amount: price(model.officialOutput - model.discountedOutput), discount: formatDiscount(model.discountBps, locale) })}
        </span>
      </p>
    </figure>
  );
}
