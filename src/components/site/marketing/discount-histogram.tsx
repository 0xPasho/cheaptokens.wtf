import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatDiscount } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { discountHistogram, medianDiscountBps } from "@/lib/marketing";

/**
 * Cuántos modelos hay en cada tramo de 5 puntos de descuento, con la mediana como una línea en su posición
 * exacta. Dice la verdad completa: también se ven los que están lejos del máximo. Las barras son decorativas;
 * el pie de figura lleva los números.
 */
export function DiscountHistogram({ models, locale, dict }: { models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const d = dict.home.prices;
  const step = 5;
  const { buckets, minBps, maxBps } = discountHistogram(models, step);
  if (!buckets.length) return null;
  const median = medianDiscountBps(models);
  const peak = Math.max(...buckets.map((bucket) => bucket.count));
  // La escala va del inicio del primer tramo al final del último: ahí cae la mediana, en porcentaje del ancho.
  const start = buckets[0].from;
  const end = buckets[buckets.length - 1].from + step;
  const medianAt = `${Math.round(((median / 100 - start) / (end - start)) * 10_000) / 100}%`;
  return (
    <figure className="nr-mk-histogram">
      <figcaption>
        <strong className="nr-mk-histogram-median">{formatDiscount(median, locale)}</strong>
        <span>{t(d.distribution, { count: formatCount(models.length, locale) })}</span>
        <span>{t(d.distributionRange, { min: formatDiscount(minBps, locale), max: formatDiscount(maxBps, locale) })}</span>
      </figcaption>
      <div className="nr-mk-histogram-chart" aria-hidden>
        <div className="nr-mk-histogram-bars">
          {buckets.map((bucket) => (
            <span
              key={bucket.from}
              style={{ height: bucket.count ? `${Math.max(6, Math.round((bucket.count / peak) * 100))}%` : undefined }}
              data-empty={bucket.count === 0 || undefined}
            />
          ))}
        </div>
        <span className="nr-mk-histogram-marker" style={{ left: medianAt }} />
        <div className="nr-mk-histogram-axis">
          <span>{formatDiscount(minBps, locale)}</span>
          <span data-median style={{ left: medianAt }}>{d.median}</span>
          <span>{formatDiscount(maxBps, locale)}</span>
        </div>
      </div>
    </figure>
  );
}
