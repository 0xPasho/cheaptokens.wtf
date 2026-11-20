import Link from "next/link";

import { ModelLogo } from "@/components/catalog/provider-logo";
import { PriceComparison } from "@/components/price";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CHEAP_OUTPUT_MAX } from "@/lib/catalog/queries";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatDiscount, formatTokens, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { groupHref, PRICE_TABLE_TAGS, priceTableRows, pickModels, USAGE_TABLE_MODELS } from "@/lib/marketing";

import { DiscountHistogram } from "./discount-histogram";
import { ArrowLabel, MarketingSection } from "./section";

type Group = { key: string; label: string; blurb: string; rows: CatalogModel[]; count: number; href: string; link: string };

/**
 * 02 · Los precios como tabla, no como tarjetas: se comparan de un vistazo. Populares y cuatro grupos por
 * capacidad, ocho filas cada uno; el resto está en /models con el filtro puesto. Debajo, cómo se reparte
 * el descuento en todo el catálogo.
 */
export function PriceTable({ models, locale, dict }: { models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const d = dict.home.prices;
  const priceLabels = { official: dict.home.hero.official, discounted: dict.home.hero.ours };
  const groups: Group[] = [
    {
      key: "popular", label: d.popular, blurb: d.blurbs.popular, count: models.length, href: `/${locale}/models`,
      rows: pickModels(models, USAGE_TABLE_MODELS).slice(0, 8),
      link: t(d.viewAll, { count: formatCount(models.length, locale) }),
    },
    ...PRICE_TABLE_TAGS.map((tag) => {
      const members = models.filter((model) => model.allTags.includes(tag));
      return {
        key: tag,
        label: dict.tags[tag],
        blurb: tag === "cheap" ? t(d.blurbs.cheap, { price: formatUsd(CHEAP_OUTPUT_MAX, locale, "whole") }) : d.blurbs[tag],
        rows: priceTableRows(members),
        count: members.length,
        href: groupHref(locale, "tag", tag),
        link: t(d.viewGroup, { count: formatCount(members.length, locale), group: dict.tags[tag] }),
      };
    }),
  ].filter((group) => group.rows.length > 0);

  return (
    <MarketingSection id="prices" eyebrow={d.eyebrow} title={d.title} description={d.description}>
      <Tabs defaultValue="popular" className="nr-mk-prices">
        <TabsList className="nr-mk-price-tabs" aria-label={d.groups}>
          {groups.map((group) => (
            <TabsTrigger key={group.key} value={group.key}>
              {group.label}
              <span className="nr-mk-chip-count">{formatCount(group.count, locale)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {groups.map((group) => (
          <TabsContent key={group.key} value={group.key} className="nr-mk-price-panel">
            <table className="nr-mk-price-table">
              <caption className="sr-only">{group.label}</caption>
              <thead>
                <tr>
                  <th scope="col">{d.columns.model}</th>
                  <th scope="col" className="nr-mk-num nr-mk-col-context">{d.columns.context}</th>
                  <th scope="col" className="nr-mk-num">{d.columns.input}</th>
                  <th scope="col" className="nr-mk-num">{d.columns.output}</th>
                  <th scope="col" className="nr-mk-num">{d.columns.discount}</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((model) => (
                  <tr key={model.id}>
                    <th scope="row">
                      <Link href={`/${locale}/models/${model.author}/${model.slug}`} className="nr-mk-table-model">
                        <ModelLogo modelId={model.id} />
                        <span><b>{model.name}</b><code>{model.id}</code></span>
                      </Link>
                    </th>
                    <td className="nr-mk-num nr-mk-col-context">{formatTokens(model.contextLength, locale)}</td>
                    <td className="nr-mk-num" data-label={d.columns.input}>
                      <PriceComparison official={model.officialInput} discounted={model.discountedInput} locale={locale} labels={priceLabels} />
                    </td>
                    <td className="nr-mk-num" data-label={d.columns.output}>
                      <PriceComparison official={model.officialOutput} discounted={model.discountedOutput} locale={locale} labels={priceLabels} />
                    </td>
                    <td className="nr-mk-num nr-mk-col-discount"><span className="nr-task">{formatDiscount(model.discountBps, locale)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="nr-mk-price-foot">
              <p>{group.blurb}</p>
              <Link className="nr-mk-text-link" href={group.href}><ArrowLabel>{group.link}</ArrowLabel></Link>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <DiscountHistogram models={models} locale={locale} dict={dict} />
    </MarketingSection>
  );
}
