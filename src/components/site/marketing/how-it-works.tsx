import ArrowRightIcon from "kubai-icons-react/icons/arrow-right";
import CircleCheckIcon from "kubai-icons-react/icons/circle-check";

import { ProviderLogo, providerName } from "@/components/catalog/provider-logo";
import { RichText } from "@/components/docs/rich-text";
import { REFERENCE_MODEL_ID } from "@/lib/billing/plans";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { MIN_DEPOSIT_MICRO_USD } from "@/lib/marketing";
import { API_BASE_URL } from "@/lib/site";

import { NumberedSteps } from "./numbered-steps";
import { MarketingSection } from "./section";

/** 03 · Cómo funciona: tu código → cheapllm.wtf → el modelo, los tres pasos y tres garantías. ADR-0060. */
export function HowItWorks({ models, locale, dict }: { models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const d = dict.home.how;
  const counts = new Map<string, number>();
  for (const model of models) counts.set(model.author, (counts.get(model.author) ?? 0) + 1);
  const authors = [...counts.keys()].toSorted((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  const host = new URL(API_BASE_URL).host;
  return (
    <MarketingSection id="how-it-works" eyebrow={d.eyebrow} title={d.title} description={d.description}>
      <div className="nr-mk-flow">
        <div className="nr-mk-flow-node">
          <p className="nr-mk-flow-label">{d.codeLabel}</p>
          <h3>{d.codeTitle}</h3>
          <p>{d.codeBody}</p>
          <div className="nr-mk-logo-row" aria-hidden><span><ProviderLogo author="openai" /></span></div>
        </div>
        <Arrow />
        <div className="nr-mk-flow-node nr-mk-flow-core">
          <p className="nr-mk-flow-label">{host}</p>
          <h3>{d.gatewayTitle}</h3>
          <ol>
            {d.gatewaySteps.map((step, index) => (
              <li key={step}><span aria-hidden>{formatCount(index + 1, locale)}</span>{step}</li>
            ))}
          </ol>
        </div>
        <Arrow />
        <div className="nr-mk-flow-node">
          <p className="nr-mk-flow-label">{d.modelsLabel}</p>
          <h3>{t(d.modelsTitle, { models: formatCount(models.length, locale), authors: formatCount(authors.length, locale) })}</h3>
          <p><RichText text={t(d.modelsBody, { example: REFERENCE_MODEL_ID })} /></p>
          <ul className="nr-mk-logo-row" aria-label={authors.map(providerName).join(", ")}>
            {authors.map((author) => <li key={author}><ProviderLogo author={author} /></li>)}
          </ul>
        </div>
      </div>
      <NumberedSteps
        locale={locale}
        label={d.stepsTitle}
        steps={d.steps.map((step) => ({
          title: step.title,
          body: t(step.body, { min: formatUsd(MIN_DEPOSIT_MICRO_USD, locale, "whole"), url: API_BASE_URL }),
        }))}
      />
      <ul className="nr-mk-promises">
        {d.promises.map((promise) => <li key={promise}><CircleCheckIcon size={16} aria-hidden />{promise}</li>)}
      </ul>
    </MarketingSection>
  );
}

function Arrow() {
  return (
    <div className="nr-mk-flow-arrow" aria-hidden>
      <ArrowRightIcon size={28} />
    </div>
  );
}
