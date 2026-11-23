import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/container";
import { BillingFlow } from "@/components/site/marketing/billing-flow";
import { CapChart } from "@/components/site/marketing/cap-chart";
import { FaqList, faqValues } from "@/components/site/marketing/faq-list";
import { FinalCta } from "@/components/site/marketing/final-cta";
import { HowFlow } from "@/components/site/marketing/how-flow";
import { Promises } from "@/components/site/marketing/promises";
import { RequestLife } from "@/components/site/marketing/request-life";
import { ArrowLabel, MarketingSection } from "@/components/site/marketing/section";
import { SwitchDiff } from "@/components/site/marketing/switch-diff";
import { HOW_ICONS, WhyCheaper } from "@/components/site/marketing/why-cheaper";
import { REFERENCE_MODEL_ID, TYPICAL_REQUEST } from "@/lib/billing/plans";
import { getLiveCatalog } from "@/lib/catalog/live";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "@/lib/gateway/request-cost";
import { chargeForTokens } from "@/lib/gateway/metering";
import { formatCount, formatDiscount, formatUsd } from "@/lib/format";
import { t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { HOW_FAQ } from "@/lib/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.meta.howTitle, description: dict.meta.howDescription };
}

/** Con qué error se detiene cada paso (04 · API › Errores), o `null` si el paso ya no detiene el request. */
const STOPS = ["401 invalid_api_key", "402 insufficient_credits", "503 no_upstream_available", "502 upstream_error", null, null];
/** Intentos por request, contando los cambios de cuenta (07 · Upstreams › Selección y fallback). */
const MAX_ATTEMPTS = 3;
/** El hint de una key de ejemplo, con el formato de 05 · API keys. */
const EXAMPLE_KEY_HINT = "wtf_Ab3x…9kQz";

/**
 * Cómo funciona (ADR-0071): qué pasa con cada request, de tu código al modelo y de vuelta. Tiene el ritmo de la
 * landing (bandas una sí y otra no) y reusa sus secciones; lo nuevo es el dibujo, la vida de un request y la gráfica
 * del tope. El ejemplo es una request típica con el modelo de referencia del dashboard, con precios del catálogo en vivo.
 */
export default async function HowItWorksPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  const models = await getLiveCatalog();
  const d = dict.howItWorks;
  const model = models.find((candidate) => candidate.id === REFERENCE_MODEL_ID) ?? models[0];
  const price = (micros: bigint | number) => formatUsd(Number(micros), locale, "price");
  const ours = { input: BigInt(model.discountedInput), output: BigInt(model.discountedOutput) };
  const listed = chargeForTokens(TYPICAL_REQUEST, ours);
  const official = chargeForTokens(TYPICAL_REQUEST, { input: BigInt(model.officialInput), output: BigInt(model.officialOutput) });
  // Lo que se reserva si el cliente no manda `max_tokens` (ADR-0066): el prompt y la salida máxima por defecto.
  const reserved = chargeForTokens({ promptTokens: TYPICAL_REQUEST.promptTokens, completionTokens: DEFAULT_MAX_OUTPUT_TOKENS }, ours);
  const savedBps = official > BigInt(0) ? Number(((official - listed) * BigInt(10_000)) / official) : 0;
  const r = d.life.receipt;

  return (
    <Container className="nr-mk nr-mk-how">
      <header className="nr-hw-head">
        <p className="nr-mk-eyebrow">{d.eyebrow}</p>
        {/* Una frase por renglón: no se corta en medio de «Mismo modelo». */}
        <h1><span>{d.titleLead}</span> <span>{d.titleTail}</span></h1>
        <p className="nr-hw-head-sub">{d.description}</p>
        <HowFlow models={models} model={model} locale={locale} dict={dict} />
        <ul className="nr-hw-facts">
          <li>{t(d.facts.catalog, { models: formatCount(models.length, locale), authors: formatCount(new Set(models.map((item) => item.author)).size, locale) })}</li>
          <li>{d.facts.refresh}</li>
          <li>{d.facts.prompts}</li>
        </ul>
      </header>

      <MarketingSection id="life" eyebrow={d.life.eyebrow} title={d.life.title} description={d.life.description}>
        <RequestLife
          steps={d.life.steps}
          stops={STOPS}
          stopLabel={d.life.stopLabel}
          stopAmount={formatUsd(0, locale)}
          receipt={{
            label: r.label,
            modelId: model.id,
            rows: [
              { label: r.key, value: EXAMPLE_KEY_HINT, note: t(r.keySource, { source: dict.dashboard.sources.plan_then_prepaid }) },
              { label: r.reserved, value: t(r.reservedValue, { amount: price(reserved) }), note: r.reservedNote },
              { label: r.route, value: r.routeValue, note: <code>{model.id}</code> },
              { label: r.attempts, value: t(r.attemptsValue, { max: formatCount(MAX_ATTEMPTS, locale) }) },
              {
                label: r.tokens,
                value: t(r.tokensValue, { input: formatCount(TYPICAL_REQUEST.promptTokens, locale), output: formatCount(TYPICAL_REQUEST.completionTokens, locale) }),
              },
            ],
            total: {
              label: r.charged,
              value: price(listed),
              note: <s>{t(r.official, { amount: price(official) })}</s>,
              savings: t(r.savings, { amount: price(official - listed), discount: formatDiscount(savedBps, locale) }),
            },
            foot: r.foot,
          }}
        />
      </MarketingSection>

      <WhyCheaper dict={dict} items={d.why.items} icons={HOW_ICONS} aside={<CapChart model={model} locale={locale} dict={dict} />} />

      <Promises modelId={model.id} locale={locale} dict={dict} />

      <MarketingSection
        id="split"
        className="nr-mk-band"
        eyebrow={d.split.eyebrow}
        title={dict.pricing.flow.title}
        description={dict.pricing.flow.description}
        action={<Link className="nr-mk-text-link" href={`/${locale}/pricing`}><ArrowLabel>{d.split.link}</ArrowLabel></Link>}
      >
        <BillingFlow locale={locale} dict={dict} withHead={false} />
      </MarketingSection>

      <SwitchDiff locale={locale} dict={dict} />

      <MarketingSection
        id="faq"
        className="nr-mk-faq-layout nr-mk-band"
        eyebrow={dict.home.faq.eyebrow}
        title={d.faqTitle}
        description={dict.home.faq.description}
        action={<Link className="nr-mk-text-link" href={`/${locale}/faq`}><ArrowLabel>{dict.home.faq.allLink}</ArrowLabel></Link>}
      >
        <FaqList ids={HOW_FAQ} dict={dict} values={faqValues(models, locale)} openFirst />
      </MarketingSection>

      <FinalCta locale={locale} dict={dict} />
    </Container>
  );
}
