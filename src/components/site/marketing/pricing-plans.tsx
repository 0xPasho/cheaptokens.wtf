import CalendarDaysIcon from "kubai-icons-react/icons/calendar-days";
import CoinsIcon from "kubai-icons-react/icons/coins";
import GridIcon from "kubai-icons-react/icons/grid";
import InfinityIcon from "kubai-icons-react/icons/infinity";
import TimerIcon from "kubai-icons-react/icons/timer";
import Link from "next/link";

import { exactKind } from "@/components/dashboard/plan-meters";
import { buttonVariants } from "@/components/ui/button";
import { PLAN_IDS, PLANS, REFERENCE_MODEL_ID } from "@/lib/billing/plans";
import { typicalRequestsIn } from "@/lib/billing/typical";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { CREDITS_EXAMPLE_MICRO_USD, DEFAULT_RATE_LIMIT_RPM, ESTIMATOR_MODELS, MIN_DEPOSIT_MICRO_USD, pickModels } from "@/lib/marketing";
import { cn } from "@/lib/utils";

import { WtfLetters } from "../brand-wordmark";
import { Estimate, EstimatorProvider, EstimatorSelect } from "./estimator";

/** El plan que lleva el botón principal: el del medio, el que usa el dashboard como referencia. */
const FEATURED = "pro";

type Row = { key: string; Icon: typeof TimerIcon; title: React.ReactNode; hint: React.ReactNode };

/**
 * Los planes de /pricing como tarjetas de invitación (ref. del dueño): cabecera en un tono más claro con el nombre y
 * el precio, tres filas con su casilla de icono, una nota y el botón grande. Las requests típicas cambian con el
 * modelo del selector de abajo; las cuentas son las del dashboard (`typicalRequestsIn`). ADR-0062.
 */
export function PricingPlans({ models, locale, dict }: { models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const d = dict.pricing;
  const c = d.cards;
  const options = pickModels(models, ESTIMATOR_MODELS);
  if (!options.length) return null;
  const initial = options.some((model) => model.id === REFERENCE_MODEL_ID) ? REFERENCE_MODEL_ID : options[0].id;
  /** Un texto por modelo: lo que `Estimate` muestra según el selector. */
  const perModel = (text: (model: CatalogModel) => string) => Object.fromEntries(options.map((model) => [model.id, text(model)]));
  const fits = (micros: bigint, model: CatalogModel) => formatCount(typicalRequestsIn(micros, model), locale);
  const allModels = t(c.allModels, { count: formatCount(models.length, locale) });

  const cards = [
    ...PLAN_IDS.map((id) => {
      const plan = PLANS[id];
      const name = dict.dashboard.plans[id].name;
      const rows: Row[] = [
        {
          key: "window",
          Icon: TimerIcon,
          title: t(c.perFiveHours, { amount: formatUsd(Number(plan.fiveHourLimitMicroUsd), locale, exactKind(plan.fiveHourLimitMicroUsd)) }),
          hint: <Estimate values={perModel((model) => t(c.withModel, { count: fits(plan.fiveHourLimitMicroUsd, model), model: model.name }))} />,
        },
        {
          key: "week",
          Icon: CalendarDaysIcon,
          title: t(c.perWeek, { amount: formatUsd(Number(plan.weekLimitMicroUsd), locale, exactKind(plan.weekLimitMicroUsd)) }),
          hint: <Estimate values={perModel((model) => t(c.withModel, { count: fits(plan.weekLimitMicroUsd, model), model: model.name }))} />,
        },
        { key: "models", Icon: GridIcon, title: allModels, hint: t(c.rpm, { count: formatCount(plan.rateLimitRpm, locale) }) },
      ];
      return {
        id, name, rows, featured: id === FEATURED,
        description: dict.dashboard.plans[id].description,
        price: <><b>{formatUsd(Number(plan.priceMicroUsd), locale, "whole")}</b><span>{d.perPeriod}</span></>,
        note: c.planNote,
        cta: t(d.choose, { plan: name }),
        href: `/${locale}/dashboard/plan`,
      };
    }),
    {
      id: "credits", name: d.credits.name, featured: false,
      description: c.creditsDescription,
      price: <><span>{d.credits.from}</span><b>{formatUsd(MIN_DEPOSIT_MICRO_USD, locale, "whole")}</b></>,
      rows: [
        { key: "limits", Icon: InfinityIcon, title: c.noLimits, hint: c.noLimitsHint },
        {
          // Las dos líneas cambian con el modelo del selector: «10 US$ ≈ 574 requests», «con Claude Sonnet 5.5».
          key: "example",
          Icon: CoinsIcon,
          title: <Estimate values={perModel((model) => t(d.credits.example, {
            amount: formatUsd(CREDITS_EXAMPLE_MICRO_USD, locale, "whole"),
            count: fits(BigInt(CREDITS_EXAMPLE_MICRO_USD), model),
          }))} />,
          hint: <Estimate values={perModel((model) => t(d.credits.hint, { model: model.name }))} />,
        },
        { key: "models", Icon: GridIcon, title: allModels, hint: t(c.rpm, { count: formatCount(DEFAULT_RATE_LIMIT_RPM, locale) }) },
      ] satisfies Row[],
      note: c.creditsNote,
      cta: d.credits.cta,
      href: `/${locale}/dashboard/credits`,
    },
  ];

  return (
    <EstimatorProvider initial={initial}>
      {/* Como antes del rediseño: un rótulo sobre los tres planes y otro sobre Créditos, que no es un plan. */}
      <div className="nr-pr-plans-label" aria-hidden><span>{d.plansLabel}</span><span>{d.noPlanLabel}</span></div>
      <div className="nr-pr-plans">
        {cards.map((card) => (
          <article
            key={card.id}
            className="nr-pr-plan"
            data-featured={card.featured || undefined}
            data-kind={card.id === "credits" ? "credits" : "plan"}
            aria-labelledby={`plan-${card.id}`}
          >
            <header className="nr-pr-plan-head">
              {/* Max lleva el efecto del «wtf» del logo: el plan grande, con la marca de la casa. */}
              <h2 id={`plan-${card.id}`}>{card.id === "max" ? <WtfLetters text={card.name} /> : card.name}</h2>
              <p className="nr-pr-plan-price">{card.price}</p>
              <p className="nr-pr-plan-desc">{card.description}</p>
            </header>
            <ul className="nr-pr-rows">
              {card.rows.map((row) => (
                <li key={row.key}>
                  <span className="nr-pr-tile" aria-hidden><row.Icon /></span>
                  <span className="nr-pr-row-text"><b>{row.title}</b><span>{row.hint}</span></span>
                </li>
              ))}
            </ul>
            <div className="nr-pr-plan-foot">
              <p>{card.note}</p>
              <Link href={card.href} className={cn(buttonVariants({ variant: card.featured ? "default" : "secondary", size: "xl" }), "w-full")}>
                {card.cta}
              </Link>
            </div>
          </article>
        ))}
      </div>
      <div className="nr-pr-estimator">
        <span aria-hidden>{d.estimatorLabel}</span>
        <EstimatorSelect label={d.estimatorLabel} options={options.map((model) => ({ value: model.id, label: model.name }))} />
        <p>{d.estimatorNote}</p>
      </div>
    </EstimatorProvider>
  );
}
