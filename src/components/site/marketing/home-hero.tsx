import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { buttonVariants } from "@/components/ui/button";
import { getKeyHref } from "@/lib/auth/redirect";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatDiscount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { HERO_MODELS, pickModels } from "@/lib/marketing";
import { API_BASE_URL } from "@/lib/site";

import { HeroOrbit } from "./hero-orbit";
import { type HeroModel, HeroPrice } from "./hero-price";
import { ArrowLabel } from "./section";

/**
 * 01 · Una sola idea por pantalla: el título, el precio en grande (oficial tachado y el nuestro) del modelo que
 * elijas, y cómo empezar. El código vive más abajo, en «Migrar».
 */
export function HomeHero({ models, locale, dict }: { models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const d = dict.home.hero;
  const authors = new Set(models.map((model) => model.author)).size;
  const examples: HeroModel[] = pickModels(models, HERO_MODELS).map((model) => ({
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
      <p className="nr-mk-hero-sub">
        {t(d.subtitle, { models: formatCount(models.length, locale), authors: formatCount(authors, locale) })}
      </p>
      <HeroPrice models={examples} labels={{ model: d.model, perMillion: d.perMillion, official: d.official, ours: d.ours }} />
      <div className="nr-mk-ctas">
        <Link href={getKeyHref(locale)} className={buttonVariants({ size: "lg", className: "nr-mk-button" })}>{d.primary}</Link>
        <Link href={`/${locale}/models`} className={buttonVariants({ variant: "secondary", size: "lg", className: "nr-mk-button" })}>
          <ArrowLabel>{t(d.secondary, { count: formatCount(models.length, locale) })}</ArrowLabel>
        </Link>
      </div>
      <div className="nr-mk-base-url">
        <span>{d.baseUrl}</span>
        <code>{API_BASE_URL}</code>
        <CopyButton value={API_BASE_URL} copyLabel={dict.copy.copy} copiedLabel={dict.copy.copied} />
      </div>
    </section>
  );
}
