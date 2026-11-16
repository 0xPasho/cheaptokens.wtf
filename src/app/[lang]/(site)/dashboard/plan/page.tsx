import CircleCheckIcon from "kubai-icons-react/icons/circle-check";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ModelDetailPanel } from "@/components/catalog/model-detail-panel";
import { ModelLogo } from "@/components/catalog/provider-logo";
import { actionErrors } from "@/components/dashboard/action-errors";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PaymentsNotice } from "@/components/dashboard/payments-notice";
import { CancelPlanButton, OverflowForm, PlanChoice } from "@/components/dashboard/plan-controls";
import { PlanMeters } from "@/components/dashboard/plan-meters";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { Price, PriceComparison } from "@/components/price";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PLAN_IDS, type PlanId, PLANS } from "@/lib/billing/plans";
import { upgradeCharge } from "@/lib/billing/purchases";
import { typicalRequestsIn, usageMultiplier } from "@/lib/billing/typical";
import { getCatalog } from "@/lib/catalog/queries";
import { getAccount } from "@/lib/dashboard/queries";
import { requireDashboard } from "@/lib/dashboard/session";
import { getDb } from "@/lib/db/client";
import { formatCount, formatDate, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { getPaymentProvider } from "@/lib/payments";

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
  const account = await getAccount(getDb(), workspaceId, now);
  const d = dict.dashboard.plan;
  const errors = actionErrors(dict);
  const current = account.plan?.plan ?? null;
  const subscription = account.subscription;
  const paymentsAvailable = getPaymentProvider() !== null;
  const catalog = getCatalog().filter((model) => model.status === "active");
  const samples = SAMPLE_MODELS.flatMap((id) => catalog.filter((model) => model.id === id));
  const tablePlan = current ?? PLANS.pro;
  const rows = catalog
    .map((model) => ({ model, multiplier: usageMultiplier(model, catalog) }))
    .toSorted((a, b) => a.multiplier - b.multiplier || a.model.name.localeCompare(b.model.name));
  const planName = (id: PlanId) => dict.dashboard.plans[id].name;
  const money = (micros: bigint, kind: "balance" | "whole" = "balance") => formatUsd(Number(micros), locale, kind);
  const periodEnd = subscription ? formatDate(subscription.periodEnd, locale) : "";
  const nextPlan = subscription?.nextPlanId && subscription.nextPlanId in PLANS ? subscription.nextPlanId as PlanId : null;
  const priceLabels = { official: dict.catalog.official, discounted: dict.catalog.discounted };

  return (
    <div className="flex flex-col gap-8">
      <PaymentsNotice available={paymentsAvailable} labels={dict.dashboard.payments} />

      {current && subscription && account.plan ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
          <ModelDetailPanel
            aria-labelledby="current-plan"
            footer={(
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>{t(d.rateLimit, { count: formatCount(current.rateLimitRpm, locale) })}</span>
                <CancelPlanButton
                  canceled={subscription.cancelAtPeriodEnd}
                  labels={{
                    cancel: d.cancel, resume: d.resume, confirm: d.cancelConfirm, keep: d.keep,
                    title: t(d.cancelTitle, { plan: planName(current.id) }),
                    body: t(d.cancelBody, { date: periodEnd }),
                  }}
                />
              </div>
            )}
          >
            <div className="nr-panel-heading">
              <h2 id="current-plan">{t(d.current, { plan: planName(current.id) })}</h2>
              <small>
                {subscription.cancelAtPeriodEnd
                  ? t(d.ends, { date: periodEnd })
                  : nextPlan
                    ? t(d.downgradeScheduled, { plan: planName(nextPlan), date: periodEnd })
                    : t(d.renews, { date: periodEnd })}
              </small>
            </div>
            <div className="px-6 pb-6">
              <PlanMeters usage={account.plan} now={now} locale={locale} labels={dict.dashboard.limits} />
            </div>
          </ModelDetailPanel>
          <Card>
            <CardHeader>
              <CardTitle>{d.overflowTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <OverflowForm
                initial={{
                  mode: account.overflow.mode,
                  packs: account.overflow.packs,
                  credits: account.overflow.credits,
                  cap: String(Number(account.overflow.capMicroUsd) / 1_000_000),
                }}
                labels={{
                  continue: d.overflowContinue, continueHint: d.overflowContinueHint, stop: d.overflowStop, stopHint: d.overflowStopHint,
                  packs: d.usePacks, packsHint: d.usePacksHint, credits: d.useCredits, creditsHint: d.useCreditsHint,
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
        <div className="grid gap-4 md:grid-cols-3">
          {PLAN_IDS.map((id) => {
            const plan = PLANS[id];
            const isCurrent = current?.id === id;
            const scheduled = nextPlan === id;
            const upgrade = current !== null && plan.priceMicroUsd > current.priceMicroUsd;
            const downgrade = current !== null && plan.priceMicroUsd < current.priceMicroUsd;
            const upgradeAmount = upgrade && subscription ? upgradeCharge(current.id, id, subscription.periodEnd.getTime(), now) : BigInt(0);
            const choice = downgrade && current
              ? {
                label: t(d.downgrade, { plan: planName(id) }), title: t(d.downgradeTitle, { plan: planName(id) }), confirm: d.confirmSchedule,
                body: t(d.downgradeBody, { date: periodEnd, current: planName(current.id) }),
              }
              : upgrade
                ? {
                  label: t(d.upgrade, { plan: planName(id) }), title: t(d.upgradeTitle, { plan: planName(id) }),
                  confirm: t(d.confirmPay, { amount: money(upgradeAmount) }), body: t(d.upgradeBody, { amount: money(upgradeAmount) }),
                }
                : {
                  label: t(d.subscribe, { plan: planName(id) }), title: t(d.subscribeTitle, { plan: planName(id) }),
                  confirm: t(d.confirmPay, { amount: money(plan.priceMicroUsd, "whole") }), body: t(d.subscribeBody, { amount: money(plan.priceMicroUsd, "whole") }),
                };
            return (
              <Card key={id}>
                <CardHeader>
                  <CardTitle>{planName(id)}</CardTitle>
                  <CardDescription>{dict.dashboard.plans[id].description}</CardDescription>
                  {isCurrent ? <CardAction><Badge variant="outline">{d.yourPlan}</Badge></CardAction> : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="flex items-baseline gap-2">
                    <Price micros={Number(plan.priceMicroUsd)} locale={locale} kind="whole" className="font-heading text-4xl font-light tracking-tight" />
                    <span className="text-sm text-muted-foreground">{d.perMonth}</span>
                  </p>
                  <dl className="flex flex-col text-sm">
                    {[
                      [d.everyFiveHours, money(plan.fiveHourLimitMicroUsd)],
                      [d.everyWeek, money(plan.weekLimitMicroUsd, "whole")],
                      ...samples.map((model) => [
                        t(d.perWindow, { model: model.name }),
                        t(d.approxRequests, { count: formatCount(typicalRequestsIn(plan.fiveHourLimitMicroUsd, model), locale) }),
                      ]),
                      [d.rpm, formatCount(plan.rateLimitRpm, locale)],
                    ].map(([term, value]) => (
                      <div key={term} className="flex justify-between gap-3 border-t py-2.5 first:border-t-0">
                        <dt className="text-muted-foreground">{term}</dt>
                        <dd className="text-right font-medium tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                    {[d.allModels, d.overflowFeature].map((feature) => (
                      <li key={feature} className="flex items-start gap-2"><CircleCheckIcon size={18} aria-hidden />{feature}</li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="mt-auto">
                  {isCurrent || scheduled ? (
                    <Badge variant="secondary" className="h-9 w-full">
                      {isCurrent ? d.yourPlan : t(d.downgradeScheduled, { plan: planName(id), date: periodEnd })}
                    </Badge>
                  ) : (
                    <PlanChoice
                      planId={id}
                      variant={upgrade || !current ? "default" : "outline"}
                      disabled={!downgrade && !paymentsAvailable}
                      cancel={d.back}
                      errors={errors}
                      {...choice}
                    />
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{d.typicalNote}</p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="models-title">
        <SectionHeader title={<span id="models-title">{d.modelsTitle}</span>} description={d.modelsHint} />
        <Card className="py-0">
          <Table>
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
            <TableBody>
              {rows.map(({ model, multiplier }) => (
                <TableRow key={model.id}>
                  <TableCell><span className="flex items-center gap-2 font-medium"><ModelLogo modelId={model.id} />{model.name}</span></TableCell>
                  <TableCell><PriceComparison official={model.officialInput} discounted={model.discountedInput} locale={locale} labels={priceLabels} /></TableCell>
                  <TableCell><PriceComparison official={model.officialOutput} discounted={model.discountedOutput} locale={locale} labels={priceLabels} /></TableCell>
                  <TableCell className="text-right tabular-nums">{`${formatCount(Math.round(multiplier * 100) / 100, locale)}×`}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(typicalRequestsIn(tablePlan.fiveHourLimitMicroUsd, model), locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(typicalRequestsIn(tablePlan.weekLimitMicroUsd, model), locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
