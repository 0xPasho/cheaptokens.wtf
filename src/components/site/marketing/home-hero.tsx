import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getKeyHref } from "@/lib/auth/redirect";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatDiscount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { heroModels } from "@/lib/marketing";

import { HeroOrbit } from "./hero-orbit";
import { type HeroModel, HeroPrice } from "./hero-price";
import { ArrowLabel } from "./section";

/**
 * 01 · Una sola idea por pantalla (ADR-0070): el título, el precio en grande (oficial tachado y el nuestro) del
 * modelo que elijas, y cómo empezar. La base URL y el código viven más abajo, en «Migrar», y en /docs.
 */
export function HomeHero({ models, locale, dict }: { models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const d = dict.home.hero;
  const examples: HeroModel[] = heroModels(models).map((model) => ({
    id: model.id,
    name: model.name,
    author: model.author,
    official: formatUsd(model.officialOutput, locale, "price"),
    ours: formatUsd(model.discountedOutput, locale, "price"),
    savings: `${t(d.savings, { amount: formatUsd(model.officialOutput - model.discountedOutput, locale, "price") })} (${formatDiscount(model.discountBps, locale)})`,
  }));
  return (
    <section className="nr-mk-hero" aria-labelledby="hero-title">
      <HeroOrbit />
      <h1 id="hero-title" className="nr-mk-hero-title">{d.title}</h1>
      <p className="nr-mk-hero-sub">{d.subtitle}</p>
      <HeroPrice models={examples} labels={{ model: d.model, official: d.official, ours: d.ours }} />
      <div className="nr-mk-ctas">
        <Link href={getKeyHref(locale)} className={buttonVariants({ size: "lg", className: "nr-mk-button" })}>{d.primary}</Link>
        <Link href={`/${locale}/models`} className={buttonVariants({ variant: "secondary", size: "lg", className: "nr-mk-button" })}>
          <ArrowLabel>{t(d.secondary, { count: formatCount(models.length, locale) })}</ArrowLabel>
        </Link>
      </div>
    </section>
  );
}
