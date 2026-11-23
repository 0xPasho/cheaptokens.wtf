import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/container";
import { FaqList, faqValues } from "@/components/site/marketing/faq-list";
import { FinalCta } from "@/components/site/marketing/final-cta";
import { PricingBento } from "@/components/site/marketing/pricing-bento";
import { PricingPlans } from "@/components/site/marketing/pricing-plans";
import { ArrowLabel, MarketingSection } from "@/components/site/marketing/section";
import { UsageTable } from "@/components/site/marketing/usage-table";
import { REFERENCE_MODEL_ID } from "@/lib/billing/plans";
import { getLiveCatalog } from "@/lib/catalog/live";
import { formatCount } from "@/lib/format";
import { t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { PRICING_FAQ } from "@/lib/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.meta.pricingTitle, description: dict.meta.pricingDescription };
}

/**
 * Precios (ADR-0061): los planes como tarjetas, cómo se cobra en cuadros con su dibujo, lo que gasta cada modelo y las
 * dudas de cobro. En un solo eje, centrado.
 */
export default async function PricingPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  const models = await getLiveCatalog();
  const d = dict.pricing;
  const model = models.find((candidate) => candidate.id === REFERENCE_MODEL_ID) ?? models[0];
  return (
    <Container className="nr-mk nr-mk-pricing">
      <header className="nr-pr-head">
        <h1>{d.pageTitle}</h1>
        <p>{d.pageDescription}</p>
      </header>
      <section className="nr-pr-plans-section" aria-label={d.title}>
        <PricingPlans models={models} locale={locale} dict={dict} />
      </section>
      {/* El reparto, los límites, el tope y cómo pagar, en cuadros con su dibujo. El paso a paso del pago vive en su
          diálogo («Cómo pagar»). */}
      <MarketingSection id="how" title={d.bento.title} description={d.bento.description}>
        {model ? <PricingBento models={models} model={model} locale={locale} dict={dict} /> : null}
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
