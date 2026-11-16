import type { Metadata } from "next";
import { Suspense } from "react";

import { ModelLogo } from "@/components/catalog/provider-logo";
import { actionErrors } from "@/components/dashboard/action-errors";
import { BuyPackButton, TopUpForm } from "@/components/dashboard/credit-controls";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PaymentsNotice } from "@/components/dashboard/payments-notice";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { Price } from "@/components/price";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PACK_BONUS_BPS, PACK_OFFERS, PACK_VALIDITY_MS, packGrant, type PlanId, PLANS, TOPUP_MAX_MICRO_USD, TOPUP_MIN_MICRO_USD,
  TOPUP_PRESETS_MICRO_USD,
} from "@/lib/billing/plans";
import { typicalRequestsIn } from "@/lib/billing/typical";
import { getCatalog } from "@/lib/catalog/queries";
import { getAccount, listPacks, listPayments } from "@/lib/dashboard/queries";
import { requireDashboard } from "@/lib/dashboard/session";
import { getDb } from "@/lib/db/client";
import { formatCount, formatDate, formatPercent, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { getPaymentProvider } from "@/lib/payments";

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.dashboard.credits.title, robots: { index: false } };
}

export default async function CreditsPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  return (
    <>
      <PageHeader title={dict.dashboard.credits.title} description={dict.dashboard.credits.description} />
      <Suspense fallback={<DashboardSkeleton label={dict.dashboard.loading} />}>
        <Credits locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}

async function Credits({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { workspaceId, now } = await requireDashboard(locale, "/credits");
  const db = getDb();
  const [account, packs, history] = await Promise.all([getAccount(db, workspaceId, now), listPacks(db, workspaceId), listPayments(db, workspaceId)]);
  const d = dict.dashboard.credits;
  const errors = actionErrors(dict);
  const paymentsAvailable = getPaymentProvider() !== null;
  const catalog = getCatalog();
  const names = new Map(catalog.map((model) => [model.id, model.name]));
  const money = (micros: bigint, kind: "balance" | "whole" = "balance") => formatUsd(Number(micros), locale, kind);
  const concept = (kind: "topup" | "subscription" | "pack", item: string | null) => {
    if (kind === "subscription" && item && item in PLANS) return t(d.kinds.subscription, { plan: dict.dashboard.plans[item as PlanId].name });
    if (kind === "pack" && item) return t(d.kinds.pack, { model: names.get(item) ?? item });
    return d.kinds.topup;
  };

  return (
    <div className="flex flex-col gap-8">
      <PaymentsNotice available={paymentsAvailable} labels={dict.dashboard.payments} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{d.topUpTitle}</CardTitle>
            <CardDescription>{d.topUpDescription}</CardDescription>
            <CardAction><Badge variant="outline">USD</Badge></CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Stat label={d.balance} value={<Price micros={Number(account.balanceMicroUsd)} locale={locale} />} />
            <TopUpForm
              locale={locale}
              presets={TOPUP_PRESETS_MICRO_USD.map(String)}
              min={Number(TOPUP_MIN_MICRO_USD)}
              max={Number(TOPUP_MAX_MICRO_USD)}
              disabled={!paymentsAvailable}
              labels={{
                amount: d.amount, other: d.otherAmount, submit: d.topUp, done: d.toppedUpBody,
                range: t(d.amountRange, { min: money(TOPUP_MIN_MICRO_USD, "whole"), max: money(TOPUP_MAX_MICRO_USD, "whole") }),
              }}
              errors={{ ...errors, amountInvalid: t(d.amountInvalid, { min: money(TOPUP_MIN_MICRO_USD, "whole"), max: money(TOPUP_MAX_MICRO_USD, "whole") }) }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{d.orderTitle}</CardTitle>
            <CardDescription>{d.orderNote}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col">
              {[[d.order1, d.order1Hint], [d.order2, d.order2Hint], [d.order3, d.order3Hint]].map(([title, hint], index) => (
                <li key={title} className="flex gap-4 border-t py-4 first:border-t-0 first:pt-0">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{index + 1}</span>
                  <span className="flex flex-col gap-0.5"><span className="text-sm font-medium">{title}</span><span className="text-sm text-muted-foreground">{hint}</span></span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="packs-title">
        <SectionHeader
          title={<span id="packs-title">{d.packsTitle}</span>}
          description={t(d.packsHint, { bonus: formatPercent(PACK_BONUS_BPS / 10_000, locale), days: formatCount(PACK_VALIDITY_MS / 86_400_000, locale) })}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PACK_OFFERS.map((offer) => {
            const model = catalog.find((candidate) => candidate.id === offer.modelId);
            if (!model) return null;
            const granted = packGrant(offer.priceMicroUsd);
            return (
              <Card key={offer.modelId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ModelLogo modelId={model.id} />{model.name}</CardTitle>
                  <CardDescription>{t(d.packYouGet, { amount: money(granted, "whole"), count: formatCount(typicalRequestsIn(granted, model), locale) })}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Price micros={Number(offer.priceMicroUsd)} locale={locale} kind="whole" className="font-heading text-3xl font-light tracking-tight" />
                </CardContent>
                <CardFooter className="mt-auto">
                  <BuyPackButton
                    modelId={model.id}
                    disabled={!paymentsAvailable}
                    errors={errors}
                    labels={{
                      buy: d.buy, cancel: dict.dashboard.plan.back,
                      title: t(d.buyTitle, { model: model.name }),
                      confirm: t(dict.dashboard.plan.confirmPay, { amount: money(offer.priceMicroUsd, "whole") }),
                      body: t(d.buyBody, {
                        paid: money(offer.priceMicroUsd, "whole"), granted: money(granted, "whole"), model: model.name,
                        date: formatDate(new Date(now + PACK_VALIDITY_MS), locale),
                      }),
                    }}
                  />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="your-packs-title">
        <SectionHeader title={<span id="your-packs-title">{d.yourPacks}</span>} />
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.dashboard.plan.model}</TableHead>
                <TableHead>{d.remaining}</TableHead>
                <TableHead className="text-right">{d.paid}</TableHead>
                <TableHead>{d.bought}</TableHead>
                <TableHead>{d.expires}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packs.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">{d.noPacks}</TableCell></TableRow>
              ) : packs.map((pack) => (
                <TableRow key={pack.id}>
                  <TableCell><span className="flex items-center gap-2 font-medium"><ModelLogo modelId={pack.modelId} />{names.get(pack.modelId) ?? pack.modelId}</span></TableCell>
                  <TableCell className="min-w-48">
                    <Progress value={(Number(pack.balanceMicroUsd) / Number(pack.grantedMicroUsd)) * 100}>
                      <span className="text-sm tabular-nums">{money(pack.balanceMicroUsd)}</span>
                      <span className="ml-auto text-sm text-muted-foreground tabular-nums">{money(pack.grantedMicroUsd)}</span>
                    </Progress>
                  </TableCell>
                  <TableCell className="text-right"><Price micros={Number(pack.paidMicroUsd)} locale={locale} /></TableCell>
                  <TableCell>{formatDate(pack.createdAt, locale)}</TableCell>
                  <TableCell>{pack.expiresAt.getTime() > now ? formatDate(pack.expiresAt, locale) : <Badge variant="secondary">{d.expired}</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="history-title">
        <SectionHeader title={<span id="history-title">{d.historyTitle}</span>} />
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{d.date}</TableHead>
                <TableHead>{d.concept}</TableHead>
                <TableHead className="text-right">{dict.dashboard.credits.amount}</TableHead>
                <TableHead>{d.status}</TableHead>
                <TableHead>{d.receipt}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">{d.noHistory}</TableCell></TableRow>
              ) : history.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDate(payment.createdAt, locale)}</TableCell>
                  <TableCell>{concept(payment.kind, payment.item)}</TableCell>
                  <TableCell className="text-right"><Price micros={Number(payment.amountMicroUsd)} locale={locale} /></TableCell>
                  <TableCell><Badge variant={payment.kind === "topup" ? "success" : "outline"}>{payment.kind === "topup" ? d.creditedStatus : d.paidStatus}</Badge></TableCell>
                  <TableCell>
                    {payment.receiptUrl
                      ? <a href={payment.receiptUrl} className="nr-documentation-link" target="_blank" rel="noreferrer">{d.viewReceipt}</a>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
