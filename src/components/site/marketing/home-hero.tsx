import Link from "next/link";

import { ProviderLogo } from "@/components/catalog/provider-logo";
import { QuickstartSnippet } from "@/components/quickstart-snippet";
import { buttonVariants } from "@/components/ui/button";
import { getKeyHref } from "@/lib/auth/redirect";
import { REFERENCE_MODEL_ID } from "@/lib/billing/plans";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { maxDiscountBps } from "@/lib/marketing";
import { API_BASE_URL } from "@/lib/site";

import { ArrowLabel } from "./section";

/** 01 · Qué es, en una frase: el titular, los dos caminos (key o modelos) y el snippet con las dos líneas que cambian. */
export function HomeHero({ models, locale, dict }: { models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const d = dict.home.hero;
  const authors = new Set(models.map((model) => model.author)).size;
  return (
    <section className="nr-mk-hero" aria-labelledby="hero-title">
      <p className="nr-mk-chip">
        <span className="nr-mk-chip-mark"><ProviderLogo author="openai" /></span>
        {d.badge}
      </p>
      <h1 id="hero-title" className="nr-mk-hero-title">
        {d.title}
        <span>{t(d.emphasis, { discount: formatPercent(maxDiscountBps(models) / 10_000, locale) })}</span>
      </h1>
      <p className="nr-mk-hero-sub">{d.subtitle}</p>
      <div className="nr-mk-ctas">
        <Link href={getKeyHref(locale)} className={buttonVariants({ size: "lg", className: "nr-mk-button" })}>{d.primary}</Link>
        <Link href={`/${locale}/models`} className={buttonVariants({ variant: "secondary", size: "lg", className: "nr-mk-button" })}>
          <ArrowLabel>{t(d.secondary, { count: formatCount(models.length, locale) })}</ArrowLabel>
        </Link>
      </div>
      <ul className="nr-mk-facts">
        <li>{t(d.authors, { count: formatCount(authors, locale) })}</li>
        <li>{d.live}</li>
        <li>{d.privacy}</li>
      </ul>
      <div className="nr-mk-composer">
        <QuickstartSnippet
          baseUrl={API_BASE_URL}
          apiKey="wtf_..."
          model={REFERENCE_MODEL_ID}
          copyLabel={dict.copy.copy}
          copiedLabel={dict.copy.copied}
          highlightConnection
        />
        <p className="nr-mk-composer-foot"><span aria-hidden className="nr-mk-dot" />{d.snippetCaption}</p>
      </div>
    </section>
  );
}
