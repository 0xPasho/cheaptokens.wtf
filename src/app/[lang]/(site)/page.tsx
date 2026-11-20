import Link from "next/link";

import { Container } from "@/components/container";
import { BillingFlow, PayNote } from "@/components/site/marketing/billing-flow";
import { CatalogPeek } from "@/components/site/marketing/catalog-peek";
import { FaqList, faqValues } from "@/components/site/marketing/faq-list";
import { FinalCta } from "@/components/site/marketing/final-cta";
import { HomeHero } from "@/components/site/marketing/home-hero";
import { HowItWorks } from "@/components/site/marketing/how-it-works";
import { KeyUses } from "@/components/site/marketing/key-uses";
import { PlanGrid } from "@/components/site/marketing/plan-grid";
import { PriceStrip } from "@/components/site/marketing/price-strip";
import { ArrowLabel, MarketingSection } from "@/components/site/marketing/section";
import { getLiveCatalog } from "@/lib/catalog/live";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { HOME_FAQ } from "@/lib/marketing";

/**
 * La landing explica qué es cheapllm.wtf, cómo funciona y cuánto cuesta. El catálogo completo
 * vive en /models y cada grupo de aquí lleva a él con el filtro puesto (ADR-0060).
 */
export default async function HomePage() {
  const [locale, dict] = await getLocaleAndDictionary();
  const models = await getLiveCatalog();
  const pricing = dict.pricing;
  return (
    <Container className="nr-mk">
      <HomeHero models={models} locale={locale} dict={dict} />
      <PriceStrip models={models} locale={locale} dict={dict} />
      <HowItWorks models={models} locale={locale} dict={dict} />
      <CatalogPeek models={models} locale={locale} dict={dict} />
      <MarketingSection
        id="pricing"
        eyebrow={pricing.eyebrow}
        title={pricing.title}
        description={pricing.description}
        action={<Link className="nr-mk-text-link" href={`/${locale}/pricing`}><ArrowLabel>{pricing.detailLink}</ArrowLabel></Link>}
      >
        <PlanGrid models={models} locale={locale} dict={dict} />
        <BillingFlow locale={locale} dict={dict} />
        <PayNote locale={locale} dict={dict} />
      </MarketingSection>
      <KeyUses locale={locale} dict={dict} />
      <MarketingSection
        id="faq"
        className="nr-mk-faq-layout"
        eyebrow={dict.home.faq.eyebrow}
        title={dict.home.faq.title}
        description={dict.home.faq.description}
        action={<Link className="nr-mk-text-link" href={`/${locale}/faq`}><ArrowLabel>{dict.home.faq.allLink}</ArrowLabel></Link>}
      >
        <FaqList ids={HOME_FAQ} dict={dict} values={faqValues(models, locale)} openFirst />
      </MarketingSection>
      <FinalCta locale={locale} dict={dict} />
    </Container>
  );
}
