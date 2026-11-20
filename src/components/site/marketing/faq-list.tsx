import { RichText } from "@/components/docs/rich-text";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PLANS } from "@/lib/billing/plans";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { BITCOIN_QUOTE_MINUTES, DEFAULT_RATE_LIMIT_RPM, type FaqId, MIN_BITCOIN_ORDER_MICRO_USD, MIN_DEPOSIT_MICRO_USD } from "@/lib/marketing";

/** Los valores de las respuestas: salen del código para que el texto no se desfase de los planes ni del catálogo. */
export function faqValues(models: CatalogModel[], locale: Locale): Record<string, string> {
  const whole = (micros: bigint | number) => formatUsd(Number(micros), locale, "whole");
  return {
    authors: formatCount(new Set(models.map((model) => model.author)).size, locale),
    min: whole(MIN_DEPOSIT_MICRO_USD),
    btcMin: whole(MIN_BITCOIN_ORDER_MICRO_USD),
    minutes: formatCount(BITCOIN_QUOTE_MINUTES, locale),
    plus: whole(PLANS.plus.priceMicroUsd),
    pro: whole(PLANS.pro.priceMicroUsd),
    max: whole(PLANS.max.priceMicroUsd),
    rpm: formatCount(DEFAULT_RATE_LIMIT_RPM, locale),
    plusRpm: formatCount(PLANS.plus.rateLimitRpm, locale),
    proRpm: formatCount(PLANS.pro.rateLimitRpm, locale),
    maxRpm: formatCount(PLANS.max.rateLimitRpm, locale),
  };
}

/** Preguntas en acordeón. La primera puede empezar abierta. */
export function FaqList({ ids, dict, values, openFirst = false }: {
  ids: readonly FaqId[];
  dict: Dictionary;
  values: Record<string, string>;
  openFirst?: boolean;
}) {
  return (
    <Accordion className="nr-mk-faq" defaultValue={openFirst && ids[0] ? [ids[0]] : []}>
      {ids.map((id) => {
        const item = dict.faq.items[id];
        return (
          <AccordionItem key={id} value={id} className="nr-mk-faq-item">
            <AccordionTrigger className="nr-mk-faq-trigger">{item.q}</AccordionTrigger>
            <AccordionContent className="nr-mk-faq-answer">
              <p><RichText text={t(item.a, values)} /></p>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
