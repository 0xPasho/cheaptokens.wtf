import Link from "next/link";

import { ModelLogo, ProviderLogo, providerName } from "@/components/catalog/provider-logo";
import { PriceComparison } from "@/components/price";
import { CHEAP_OUTPUT_MAX } from "@/lib/catalog/queries";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatDiscount, formatPercent, formatTokens, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, plural, t } from "@/lib/i18n/dictionaries";
import { groupHref, type PeekGroup, peekGroups, type PeekTag } from "@/lib/marketing";

import { type PeekPanel, PeekSwitcher } from "./peek-switcher";
import { MarketingSection } from "./section";

/**
 * 04 · Vistazo al catálogo: los grupos de la sidebar de Modelos, por capacidad o por autor, con cuatro
 * tarjetas cada uno y un link al catálogo con el filtro puesto. Las tarjetas se arman aquí, en el servidor;
 * el cliente solo elige cuál grupo se ve. ADR-0060.
 */
export function CatalogPeek({ models, locale, dict }: { models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const d = dict.home.peek;
  const percent = (bps: number) => formatPercent(bps / 10_000, locale);

  function panel(group: PeekGroup): PeekPanel {
    const label = group.mode === "tag" ? dict.tags[group.key as PeekTag] : providerName(group.key);
    const discounts = models.filter((model) => model.author === group.key).map((model) => model.discountBps);
    const blurb = group.mode === "tag"
      ? t(d.blurbs[group.key as PeekTag], { price: formatUsd(CHEAP_OUTPUT_MAX, locale, "whole") })
      : t(plural(locale, group.count, d.authorOne, d.authorOther), {
        count: formatCount(group.count, locale),
        author: label,
        max: percent(Math.max(...discounts)),
        min: percent(Math.min(...discounts)),
      });
    return {
      mode: group.mode,
      key: group.key,
      label,
      icon: group.mode === "author" ? <ProviderLogo author={group.key} /> : null,
      count: formatCount(group.count, locale),
      blurb,
      href: groupHref(locale, group.mode, group.key),
      viewLabel: t(d.viewGroup, { count: formatCount(group.count, locale), group: label }),
      showing: t(d.showing, { shown: formatCount(group.models.length, locale), total: formatCount(group.count, locale) }),
      cards: group.models.map((model) => <PeekCard key={model.id} model={model} locale={locale} dict={dict} />),
    };
  }

  return (
    <MarketingSection id="models" eyebrow={d.eyebrow} title={d.title} description={d.description}>
      <PeekSwitcher
        panels={[...peekGroups(models, "tag"), ...peekGroups(models, "author")].map(panel)}
        viewAll={{ href: `/${locale}/models`, label: t(d.viewAll, { count: formatCount(models.length, locale) }) }}
        labels={{ groupBy: d.groupBy, byTag: d.byTag, byAuthor: d.byAuthor, groups: d.groups }}
      />
    </MarketingSection>
  );
}

/** La tarjeta en dos capas del catálogo (ADR-0042 y ADR-0043), con el precio de salida. */
function PeekCard({ model, locale, dict }: { model: CatalogModel; locale: Locale; dict: Dictionary }) {
  const pills = [
    `${formatTokens(model.contextLength, locale)} ${dict.catalog.columns.context.toLowerCase()}`,
    ...model.allTags.filter((tag) => tag !== "long-context").slice(0, 2).map((tag) => dict.tags[tag]),
  ];
  return (
    <article className="nr-model-card">
      <div className="nr-model-card-front nr-mk-peek-front">
        <h3 className="nr-model-id">
          <ModelLogo modelId={model.id} />
          <Link className="nr-model-link" href={`/${locale}/models/${model.author}/${model.slug}`}>{model.name}</Link>
        </h3>
        <div className="nr-pills">{pills.map((pill) => <span key={pill}>{pill}</span>)}</div>
        <p className="nr-mk-peek-price">
          <PriceComparison
            official={model.officialOutput}
            discounted={model.discountedOutput}
            locale={locale}
            labels={{ official: dict.catalog.official, discounted: dict.catalog.discounted }}
          />
          <span>{dict.home.peek.perOutput}</span>
        </p>
      </div>
      <div className="nr-model-card-footer">
        <div className="nr-model-meta">
          <b className="nr-model-author"><ProviderLogo author={model.author} />{providerName(model.author)}</b>
          <span className="nr-task">{formatDiscount(model.discountBps, locale)}</span>
        </div>
      </div>
    </article>
  );
}
