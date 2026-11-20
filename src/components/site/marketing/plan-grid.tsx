import Link from "next/link";

import { Price } from "@/components/price";
import { buttonVariants } from "@/components/ui/button";
import { PLAN_IDS, PLANS, REFERENCE_MODEL_ID } from "@/lib/billing/plans";
import { typicalRequestsIn } from "@/lib/billing/typical";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { CREDITS_EXAMPLE_MICRO_USD, DEFAULT_RATE_LIMIT_RPM, ESTIMATOR_MODELS, MIN_DEPOSIT_MICRO_USD, pickModels } from "@/lib/marketing";

import { Estimate, EstimatorProvider, EstimatorSelect } from "./estimator";

/**
 * Plus, Pro y Max junto a Créditos, con las requests típicas que caben con el modelo que se elija.
 * Las cuentas son las del dashboard (`typicalRequestsIn`); aquí solo se formatean para cada modelo. ADR-0062.
 */
export function PlanGrid({ models, locale, dict, nameAs: Name = "h3" }: {
  models: CatalogModel[];
  locale: Locale;
  dict: Dictionary;
  /** El nivel del nombre de cada plan: `h3` bajo el `h2` de la sección, `h2` cuando van justo debajo del `h1`. */
  nameAs?: "h2" | "h3";
}) {
  const d = dict.pricing;
  const options = pickModels(models, ESTIMATOR_MODELS);
  if (!options.length) return null;
  const initial = options.some((model) => model.id === REFERENCE_MODEL_ID) ? REFERENCE_MODEL_ID : options[0].id;
  /** Un texto por modelo: lo que `Estimate` muestra según el selector. */
  const perModel = (text: (model: CatalogModel) => string) => Object.fromEntries(options.map((model) => [model.id, text(model)]));
  const fits = (micros: bigint, model: CatalogModel) => formatCount(typicalRequestsIn(micros, model), locale);
  const withModel = perModel((model) => t(d.windowHint, { model: model.name }));

  return (
    <EstimatorProvider initial={initial}>
      <div className="nr-mk-plans-label" aria-hidden><span>{d.plansLabel}</span><span>{d.noPlanLabel}</span></div>
      <div className="nr-mk-plans">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const name = dict.dashboard.plans[id].name;
          return (
            <article key={id} className="nr-mk-plan" aria-labelledby={`plan-${id}`}>
              <div className="nr-mk-plan-top">
                <Name id={`plan-${id}`}>{name}</Name>
                <span className="nr-task">{t(d.rpm, { count: formatCount(plan.rateLimitRpm, locale) })}</span>
              </div>
              <p className="nr-mk-plan-price"><b>{formatUsd(Number(plan.priceMicroUsd), locale, "whole")}</b><span>{d.perPeriod}</span></p>
              <p className="nr-mk-plan-big">
                <b><Estimate values={perModel((model) => t(d.windowRequests, { count: fits(plan.fiveHourLimitMicroUsd, model) }))} /></b>
                <span><Estimate values={withModel} /></span>
              </p>
              <dl className="nr-mk-plan-facts">
                <div><dt>{d.fiveHourLimit}</dt><dd><Price micros={Number(plan.fiveHourLimitMicroUsd)} locale={locale} /></dd></div>
                <div><dt>{d.weekLimit}</dt><dd><Price micros={Number(plan.weekLimitMicroUsd)} locale={locale} /></dd></div>
                <div><dt>{d.weekRequests}</dt><dd><Estimate values={perModel((model) => t(d.approx, { count: fits(plan.weekLimitMicroUsd, model) }))} /></dd></div>
              </dl>
              <Link href={`/${locale}/dashboard/plan`} className={buttonVariants({ variant: "secondary", size: "lg", className: "nr-mk-button nr-mk-plan-cta" })}>
                {t(d.choose, { plan: name })}
              </Link>
            </article>
          );
        })}
        <article className="nr-mk-plan nr-mk-plan-credits" aria-labelledby="plan-credits">
          <div className="nr-mk-plan-top">
            <Name id="plan-credits">{d.credits.name}</Name>
            <span className="nr-task">{t(d.rpm, { count: formatCount(DEFAULT_RATE_LIMIT_RPM, locale) })}</span>
          </div>
          <p className="nr-mk-plan-price"><span>{d.credits.from}</span><b>{formatUsd(MIN_DEPOSIT_MICRO_USD, locale, "whole")}</b></p>
          <p className="nr-mk-plan-big">
            <b><Estimate values={perModel((model) => t(d.credits.example, {
              amount: formatUsd(CREDITS_EXAMPLE_MICRO_USD, locale, "whole"),
              count: fits(BigInt(CREDITS_EXAMPLE_MICRO_USD), model),
            }))} /></b>
            <span><Estimate values={perModel((model) => t(d.credits.hint, { model: model.name }))} /></span>
          </p>
          <dl className="nr-mk-plan-facts">
            <div><dt>{d.fiveHourLimit}</dt><dd>{d.credits.none}</dd></div>
            <div><dt>{d.weekLimit}</dt><dd>{d.credits.none}</dd></div>
            <div><dt>{d.credits.models}</dt><dd>{t(d.credits.allModels, { count: formatCount(models.length, locale) })}</dd></div>
          </dl>
          <Link href={`/${locale}/dashboard/credits`} className={buttonVariants({ variant: "secondary", size: "lg", className: "nr-mk-button nr-mk-plan-cta" })}>
            {d.credits.cta}
          </Link>
        </article>
      </div>
      <div className="nr-mk-estimator">
        <div className="nr-mk-estimator-label">
          <span aria-hidden>{d.estimatorLabel}</span>
          <EstimatorSelect label={d.estimatorLabel} options={options.map((model) => ({ value: model.id, label: model.name }))} />
        </div>
        <p>{d.estimatorNote}</p>
      </div>
    </EstimatorProvider>
  );
}
