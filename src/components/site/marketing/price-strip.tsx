import Link from "next/link";

import { ModelLogo, providerName } from "@/components/catalog/provider-logo";
import { DiscountBadge } from "@/components/discount-badge";
import { PriceComparison } from "@/components/price";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatDiscount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { medianDiscountBps, PRICE_STRIP_MODELS, pickModels } from "@/lib/marketing";

import { ArrowLabel, MarketingSection } from "./section";

/** 02 · Precio a la vista: modelos que la gente conoce, con el precio oficial tachado. ADR-0060 y ADR-0062. */
export function PriceStrip({ models, locale, dict }: { models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const d = dict.home.strip;
  const labels = { official: dict.catalog.official, discounted: dict.catalog.discounted };
  return (
    <MarketingSection id="price" eyebrow={d.eyebrow} title={d.title} description={d.description}>
      <div className="nr-mk-price-grid">
        {pickModels(models, PRICE_STRIP_MODELS).map((model) => (
          <article key={model.id} className="nr-mk-price-tile">
            <h3 className="nr-mk-price-name">
              <ModelLogo modelId={model.id} />
              <Link className="nr-model-link" href={`/${locale}/models/${model.author}/${model.slug}`}>{model.name}</Link>
              <small>{providerName(model.author)}</small>
            </h3>
            <p className="nr-mk-price-row">
              <PriceComparison className="nr-mk-price-compare" official={model.officialOutput} discounted={model.discountedOutput} locale={locale} labels={labels} />
              <DiscountBadge discountBps={model.discountBps} locale={locale} />
            </p>
            <p className="nr-mk-price-unit">{t(d.input, { price: formatUsd(model.discountedInput, locale, "price") })}</p>
          </article>
        ))}
      </div>
      <div className="nr-mk-strip-foot">
        <p>{t(d.footnote, { discount: formatDiscount(medianDiscountBps(models), locale) })}</p>
        <Link className="nr-mk-text-link" href={`/${locale}/models?sort=discount`}><ArrowLabel>{d.sortLink}</ArrowLabel></Link>
      </div>
    </MarketingSection>
  );
}
