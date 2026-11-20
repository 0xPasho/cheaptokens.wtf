import Link from "next/link";

import { Container } from "@/components/container";
import { BillingFlow, PayNote } from "@/components/site/marketing/billing-flow";
import { FaqList, faqValues } from "@/components/site/marketing/faq-list";
import { FinalCta } from "@/components/site/marketing/final-cta";
import { HomeHero } from "@/components/site/marketing/home-hero";
import { KeyUses } from "@/components/site/marketing/key-uses";
import { PlanGrid } from "@/components/site/marketing/plan-grid";
import { PriceTable } from "@/components/site/marketing/price-table";
import { ArrowLabel, MarketingSection } from "@/components/site/marketing/section";
import { SwitchDiff } from "@/components/site/marketing/switch-diff";
import { WhyCheaper } from "@/components/site/marketing/why-cheaper";
import { getLiveCatalog } from "@/lib/catalog/live";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { HOME_FAQ } from "@/lib/marketing";

/**
 * La landing explica qué es cheapllm.wtf, cuánto cuesta y por qué, y cómo cambiarse. El catálogo completo
 * vive en /models y cada grupo de la tabla lleva a él con el filtro puesto (ADR-0060). El orden va de la
 * pregunta que llega primero (¿cuánto?) a la última (¿cómo empiezo?).
 */
export default async function HomePage() {
  const [locale, dict] = await getLocaleAndDictionary();
  const models = await getLiveCatalog();
  const pricing = dict.pricing;
  return (
    <Container className="nr-mk">
      <HomeHero models={models} locale={locale} dict={dict} />
      <PriceTable models={models} locale={locale} dict={dict} />
      <WhyCheaper dict={dict} />
      <SwitchDiff locale={locale} dict={dict} />
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
