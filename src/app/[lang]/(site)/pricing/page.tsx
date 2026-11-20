import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/container";
import { BillingFlow } from "@/components/site/marketing/billing-flow";
import { FaqList, faqValues } from "@/components/site/marketing/faq-list";
import { FinalCta } from "@/components/site/marketing/final-cta";
import { NumberedSteps } from "@/components/site/marketing/numbered-steps";
import { PlanGrid } from "@/components/site/marketing/plan-grid";
import { ArrowLabel, MarketingSection } from "@/components/site/marketing/section";
import { UsageTable } from "@/components/site/marketing/usage-table";
import { getLiveCatalog } from "@/lib/catalog/live";
import { formatCount, formatUsd } from "@/lib/format";
import { t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { MIN_DEPOSIT_MICRO_USD, PRICING_FAQ } from "@/lib/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.meta.pricingTitle, description: dict.meta.pricingDescription };
}

/** Precios: planes y créditos, el reparto, lo que gasta cada modelo y cómo pagar (ADR-0061). */
export default async function PricingPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  const models = await getLiveCatalog();
  const d = dict.pricing;
  return (
    <Container className="nr-mk">
      <header className="nr-mk-page-head">
        <p className="nr-mk-eyebrow">{d.eyebrow}</p>
        <h1>{d.pageTitle}</h1>
        <p>{d.pageDescription}</p>
      </header>
      <section className="nr-mk-section nr-mk-section-tight" aria-label={d.title}>
        <PlanGrid models={models} locale={locale} dict={dict} nameAs="h2" />
      </section>
      <MarketingSection id="split" title={d.flow.title} description={d.flow.description}>
        <BillingFlow locale={locale} dict={dict} withHead={false} />
      </MarketingSection>
      <MarketingSection id="usage" title={d.usage.title} description={d.usage.description}>
        <div className="nr-mk-usage-card"><UsageTable models={models} locale={locale} dict={dict} /></div>
        <div className="nr-mk-strip-foot">
          <p>{d.usage.footnote}</p>
          <Link className="nr-mk-text-link" href={`/${locale}/models`}>
            <ArrowLabel>{t(dict.home.prices.viewAll, { count: formatCount(models.length, locale) })}</ArrowLabel>
          </Link>
        </div>
      </MarketingSection>
      <MarketingSection id="pay" title={d.paySteps.title} description={d.paySteps.description}>
        <NumberedSteps
          locale={locale}
          steps={d.paySteps.steps.map((step) => ({ title: step.title, body: t(step.body, { min: formatUsd(MIN_DEPOSIT_MICRO_USD, locale, "whole") }) }))}
        />
      </MarketingSection>
      <MarketingSection
        id="billing-questions"
        className="nr-mk-faq-layout"
        title={d.faqTitle}
        description={d.faqDescription}
        action={<Link className="nr-mk-text-link" href={`/${locale}/faq`}><ArrowLabel>{dict.home.faq.allLink}</ArrowLabel></Link>}
      >
        <FaqList ids={PRICING_FAQ} dict={dict} values={faqValues(models, locale)} openFirst />
      </MarketingSection>
      <FinalCta locale={locale} dict={dict} />
    </Container>
  );
}
