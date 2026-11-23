import CircleCheckIcon from "kubai-icons-react/icons/circle-check";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ModelLogo } from "@/components/catalog/provider-logo";
import { actionErrors } from "@/components/dashboard/action-errors";
import { BitcoinPendingNotice } from "@/components/dashboard/bitcoin-pending-notice";
import { ExpandableTable } from "@/components/dashboard/expandable-table";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PaymentsNotice } from "@/components/dashboard/payments-notice";
import { OverflowForm } from "@/components/dashboard/plan-controls";
import { exactKind, PlanMeters } from "@/components/dashboard/plan-meters";
import { PurchaseButton, PurchaseProvider } from "@/components/dashboard/purchase-dialog";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { Price, PriceComparison } from "@/components/price";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isPlanId, PLAN_IDS, type PlanId, PLANS } from "@/lib/billing/plans";
import { planQuote } from "@/lib/billing/purchases";
import { typicalRequestsIn, usageMultiplier } from "@/lib/billing/typical";
import { getLiveCatalog } from "@/lib/catalog/live";
import { getAccount } from "@/lib/dashboard/queries";
import { requireDashboard } from "@/lib/dashboard/session";
import { getDb } from "@/lib/db/client";
import { formatCount, formatDate, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { readBitcoinConfig } from "@/lib/payments/bitcoin/config";
import { loadBitcoinPending } from "@/lib/payments/bitcoin/load";
import { paymentsAvailable as cryptoPaymentsAvailable, readCryptoConfig } from "@/lib/payments/crypto/config";
import { cn } from "@/lib/utils";

/** Modelos de ejemplo en cada plan: caro, referencia y barato. */
const SAMPLE_MODELS = ["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-5.5", "z-ai/glm-5.3"];

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.dashboard.plan.title, robots: { index: false } };
}

export default async function PlanPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  return (
    <>
      <PageHeader title={dict.dashboard.plan.title} description={dict.dashboard.plan.description} />
      <Suspense fallback={<DashboardSkeleton label={dict.dashboard.loading} />}>
        <Plan locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}

async function Plan({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { workspaceId, now } = await requireDashboard(locale, "/plan");
  const [account, bitcoinPending] = await Promise.all([getAccount(getDb(), workspaceId, now), loadBitcoinPending(getDb(), workspaceId)]);
  const d = dict.dashboard.plan;
  const errors = actionErrors(dict);
  const current = account.plan?.plan ?? null;
  const subscription = account.subscription;
  const crypto = readCryptoConfig();
  const bitcoin = readBitcoinConfig();
  const active = current && subscription ? { planId: current.id, periodEnd: subscription.periodEnd.getTime() } : null;
  const catalog = (await getLiveCatalog()).filter((model) => model.status === "active");
  const samples = SAMPLE_MODELS.flatMap((id) => catalog.filter((model) => model.id === id));
  const tablePlan = current ?? PLANS.pro;
  const rows = catalog
    .map((model) => ({ model, multiplier: usageMultiplier(model, catalog) }))
    .toSorted((a, b) => a.multiplier - b.multiplier || a.model.name.localeCompare(b.model.name));
  const planName = (id: PlanId) => dict.dashboard.plans[id].name;
  const money = (micros: bigint, kind: "balance" | "whole" = "balance") => formatUsd(Number(micros), locale, kind);
  const periodEnd = subscription ? formatDate(subscription.periodEnd, locale) : "";
  const priceLabels = { official: dict.catalog.official, discounted: dict.catalog.discounted };
  // El tope va en un campo: con la coma del idioma (12,5) y sin separador de miles, que el servidor no lee.
  const capInput = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 })
    .format(Number(account.overflow.capMicroUsd) / 1_000_000);

  // Cada plan una vez, para la comparación de escritorio y las cards de móvil.
  const plans = PLAN_IDS.map((id) => {
    const plan = PLANS[id];
    const isCurrent = current?.id === id;
    // Null: es más barato que el vigente y se compra cuando termine.
    const quote = planQuote(active, id, now);
    const purchase = quote?.mode === "upgrade"
      ? {
        label: t(d.upgrade, { plan: planName(id) }), title: t(d.upgradeTitle, { plan: planName(id) }),
        description: t(d.upgradeBody, { amount: money(quote.amountMicroUsd) }), done: t(d.upgradeDone, { plan: planName(id) }),
      }
      : {
        label: t(d.subscribe, { plan: planName(id) }), title: t(d.subscribeTitle, { plan: planName(id) }),
        description: t(d.subscribeBody, { amount: money(plan.priceMicroUsd, "whole") }), done: t(d.subscribeDone, { plan: planName(id) }),
      };
    // El lugar del botón: «Activo hasta…» en el tuyo y «Disponible al terminar» en uno menor, con el alto del botón.
    const action = isCurrent
      ? <p className="flex h-8 items-center text-muted-foreground">{t(d.activeUntil, { date: periodEnd })}</p>
      : !quote
        ? <Badge variant="secondary" className="h-8 w-full text-sm">{d.downgradeLater}</Badge>
        : <PurchaseButton planId={id} planName={planName(id)} priceMicroUsd={quote.amountMicroUsd.toString()} {...purchase} />;
    return { id, name: planName(id), description: dict.dashboard.plans[id].description, price: plan.priceMicroUsd, isCurrent, action, plan };
  });
  const facts = [
    { label: d.everyFiveHours, values: plans.map(({ plan }) => money(plan.fiveHourLimitMicroUsd, exactKind(plan.fiveHourLimitMicroUsd))) },
    { label: d.everyWeek, values: plans.map(({ plan }) => money(plan.weekLimitMicroUsd, exactKind(plan.weekLimitMicroUsd))) },
    ...samples.map((model) => ({
      label: t(d.perWindow, { model: model.name }),
      values: plans.map(({ plan }) => t(d.approxRequests, { count: formatCount(typicalRequestsIn(plan.fiveHourLimitMicroUsd, model), locale) })),
    })),
    { label: d.rpm, values: plans.map(({ plan }) => formatCount(plan.rateLimitRpm, locale)) },
  ];

  return (
    <PurchaseProvider
      balanceMicroUsd={account.balanceMicroUsd.toString()}
      locale={locale}
      labels={dict.dashboard.purchase}
      depositLabels={dict.dashboard.deposit}
      bitcoinLabels={dict.dashboard.bitcoin}
      errors={errors}
    >
      <div className="flex flex-col gap-8">
        <PaymentsNotice
          available={cryptoPaymentsAvailable(crypto) || bitcoin !== null}
          simulate={crypto.simulate || bitcoin?.simulate === true}
          labels={dict.dashboard.payments}
        />
        <BitcoinPendingNotice
          pending={bitcoinPending}
          planName={(id) => (isPlanId(id) ? planName(id) : null)}
          labels={dict.dashboard.bitcoin}
        />

        {current && subscription && account.plan ? (
          // Las dos cards con el mismo alto: sin el hueco que dejaba la del plan, más corta, junto al formulario. La del
          // formulario, de ancho fijo (448 px): con 3fr/2fr empezaba en medio píxel.
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]">
            <Card role="region" aria-labelledby="current-plan">
              <CardContent className="flex flex-1 flex-col gap-6">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 id="current-plan" className="font-heading text-xl font-medium tracking-tight">{t(d.current, { plan: planName(current.id) })}</h2>
                  <p className="text-muted-foreground">
                    {t(d.activeUntil, { date: periodEnd })} · {t(d.rateLimit, { count: formatCount(current.rateLimitRpm, locale) })}
                  </p>
                </div>
                <PlanMeters usage={account.plan} now={now} locale={locale} labels={dict.dashboard.limits} />
                {/* Al pie, como «Guardar» en la card de al lado: los dos botones quedan en la misma línea. */}
                <div className="mt-auto">
                  <PurchaseButton
                    planId={current.id}
                    planName={planName(current.id)}
                    priceMicroUsd={current.priceMicroUsd.toString()}
                    label={d.extend}
                    variant="outline"
                    className="w-auto"
                    title={t(d.extendTitle, { plan: planName(current.id) })}
                    description={t(d.extendBody, { amount: money(current.priceMicroUsd, "whole"), date: periodEnd })}
                    done={t(d.extendDone, { plan: planName(current.id) })}
                  />
                </div>
              </CardContent>
            </Card>
            <Card role="region" aria-labelledby="overflow-title">
              <CardContent className="flex flex-1 flex-col gap-4">
                <h2 id="overflow-title" className="font-heading text-xl font-medium tracking-tight">{d.overflowTitle}</h2>
                <OverflowForm
                  initial={{ mode: account.overflow.mode, cap: capInput }}
                  labels={{
                    title: d.overflowTitle, continue: d.overflowContinue, continueHint: d.overflowContinueHint, stop: d.overflowStop, stopHint: d.overflowStopHint,
                    cap: d.cap, save: d.save, saved: d.saved,
                    capUsed: t(d.capUsed, { used: money(account.overflow.spentThisMonthMicroUsd), cap: money(account.overflow.capMicroUsd) }),
                  }}
                  errors={errors}
                />
              </CardContent>
            </Card>
          </div>
        ) : null}

        <section className="flex flex-col gap-4" aria-labelledby="plans-title">
          <SectionHeader title={<span id="plans-title">{d.plansTitle}</span>} description={d.plansHint} />
          {/* En escritorio, una comparación: cada dato una sola vez a la izquierda y un plan por columna, con el tuyo
              en una banda de tono (sin líneas). En móvil no caben cuatro columnas: una card por plan. */}
          <Card className="hidden gap-0 p-1 md:flex">
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                <col className="w-[28%]" />
                {plans.map((plan) => <col key={plan.id} />)}
              </colgroup>
              <thead>
                <tr>
                  <td />
                  {plans.map((plan) => (
                    <th key={plan.id} scope="col" className={cn("px-4 pt-4 pb-5 text-left align-top font-normal", plan.isCurrent && "rounded-t-[20px] bg-glass-control")}>
                      <span className="flex h-6 items-center gap-2">
                        <span className="font-heading text-base font-medium">{plan.name}</span>
                        {plan.isCurrent ? <Badge variant="secondary">{d.yourPlan}</Badge> : null}
                      </span>
                      <span className="mt-2 flex items-baseline gap-1.5">
                        <Price micros={Number(plan.price)} locale={locale} kind="whole" className="font-heading text-3xl font-light tracking-tight" />
                        <span className="text-muted-foreground">{d.perMonth}</span>
                      </span>
                      <span className="mt-1 block text-pretty text-muted-foreground">{plan.description}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {facts.map((fact) => (
                  <tr key={fact.label}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal text-muted-foreground">{fact.label}</th>
                    {plans.map((plan, index) => (
                      <td key={plan.id} className={cn("px-4 py-2.5 font-medium tabular-nums", plan.isCurrent && "bg-glass-control")}>{fact.values[index]}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td />
                  {plans.map((plan) => (
                    <td key={plan.id} className={cn("px-4 pt-4 pb-4", plan.isCurrent && "rounded-b-[20px] bg-glass-control")}>{plan.action}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </Card>
          <div className="grid gap-4 md:hidden">
            {plans.map((plan, planIndex) => (
              <Card key={plan.id}>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="flex h-6 items-center gap-2">
                      <span className="font-heading text-base font-medium">{plan.name}</span>
                      {plan.isCurrent ? <Badge variant="secondary">{d.yourPlan}</Badge> : null}
                    </p>
                    <p className="text-pretty text-muted-foreground">{plan.description}</p>
                  </div>
                  <p className="flex items-baseline gap-1.5">
                    <Price micros={Number(plan.price)} locale={locale} kind="whole" className="font-heading text-3xl font-light tracking-tight" />
                    <span className="text-muted-foreground">{d.perMonth}</span>
                  </p>
                  <dl className="flex flex-col gap-2.5">
                    {facts.map((fact) => (
                      <div key={fact.label} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{fact.label}</dt>
                        <dd className="text-right font-medium whitespace-nowrap tabular-nums">{fact.values[planIndex]}</dd>
                      </div>
                    ))}
                  </dl>
                  {plan.action}
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Lo que tienen todos los planes, una vez, en vez de repetirlo con un check en cada card. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{d.everyPlan}</span>
            {[d.allModels, d.overflowFeature].map((feature) => (
              <span key={feature} className="flex items-center gap-2"><CircleCheckIcon size={16} aria-hidden />{feature}</span>
            ))}
            <span className="text-xs lg:ml-auto">{d.typicalNote}</span>
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="models-title">
          <SectionHeader title={<span id="models-title">{d.modelsTitle}</span>} description={d.modelsHint} />
          {/* Los diez que menos gastan y el resto con un botón: 97 filas de entrada eran una pared. */}
          <ExpandableTable
            label={d.modelsTitle}
            initial={10}
            moreLabel={d.showAllModels}
            lessLabel={d.showFewerModels}
            head={(
              <TableHeader>
                <TableRow>
                  <TableHead>{d.model}</TableHead>
                  <TableHead>{d.inputPrice}</TableHead>
                  <TableHead>{d.outputPrice}</TableHead>
                  <TableHead className="text-right">{d.multiplier}</TableHead>
                  <TableHead className="text-right">{d.perWindowShort}</TableHead>
                  <TableHead className="text-right">{d.perWeekShort}</TableHead>
                </TableRow>
              </TableHeader>
            )}
            rows={rows.map(({ model, multiplier }) => (
              <TableRow key={model.id}>
                <TableCell><span className="flex items-center gap-2 font-medium"><ModelLogo modelId={model.id} />{model.name}</span></TableCell>
                <TableCell><PriceComparison official={model.officialInput} discounted={model.discountedInput} locale={locale} labels={priceLabels} /></TableCell>
                <TableCell><PriceComparison official={model.officialOutput} discounted={model.discountedOutput} locale={locale} labels={priceLabels} /></TableCell>
                <TableCell className="text-right tabular-nums">{`${formatCount(Math.round(multiplier * 100) / 100, locale)}×`}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(typicalRequestsIn(tablePlan.fiveHourLimitMicroUsd, model), locale)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(typicalRequestsIn(tablePlan.weekLimitMicroUsd, model), locale)}</TableCell>
              </TableRow>
            ))}
          />
        </section>
      </div>
    </PurchaseProvider>
  );
}
