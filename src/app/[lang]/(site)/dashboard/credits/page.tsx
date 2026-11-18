import type { Metadata } from "next";
import { Suspense } from "react";

import { ModelLogo } from "@/components/catalog/provider-logo";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { DepositPanel } from "@/components/dashboard/deposit-panel";
import { PaymentsNotice } from "@/components/dashboard/payments-notice";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { Price } from "@/components/price";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type PlanId, PLANS } from "@/lib/billing/plans";
import { getLiveCatalog } from "@/lib/catalog/live";
import { getAccount, listPacks, listPayments } from "@/lib/dashboard/queries";
import { requireDashboard } from "@/lib/dashboard/session";
import { getDb } from "@/lib/db/client";
import { formatDate, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { paymentsAvailable as cryptoPaymentsAvailable, readCryptoConfig } from "@/lib/payments/crypto/config";
import { depositChains, getDepositState } from "@/lib/payments/crypto/deposits";
import { depositView } from "@/lib/payments/crypto/view";

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
  const crypto = readCryptoConfig();
  const chains = depositChains(crypto);
  const paymentsAvailable = cryptoPaymentsAvailable(crypto);
  const [account, packs, history, deposit] = await Promise.all([
    getAccount(db, workspaceId, now), listPacks(db, workspaceId), listPayments(db, workspaceId),
    paymentsAvailable ? getDepositState(db, chains, workspaceId, now) : null,
  ]);
  const d = dict.dashboard.credits;
  const catalog = await getLiveCatalog();
  const names = new Map(catalog.map((model) => [model.id, model.name]));
  const money = (micros: bigint) => formatUsd(Number(micros), locale);
  const concept = (payment: (typeof history)[number]) => {
    const { kind, item } = payment;
    if (kind === "subscription" && item && item in PLANS) return t(d.kinds.subscription, { plan: dict.dashboard.plans[item as PlanId].name });
    if (kind === "pack" && item) return t(d.kinds.pack, { model: names.get(item) ?? item });
    return payment.paymentProvider.startsWith("usdc-") ? d.deposited : d.kinds.topup;
  };

  return (
    <div className="flex flex-col gap-8">
      <PaymentsNotice available={paymentsAvailable} simulate={crypto.simulate} labels={dict.dashboard.payments} />

      <Card>
        <CardHeader>
          <CardTitle>{dict.dashboard.deposit.title}</CardTitle>
          <CardDescription>{dict.dashboard.deposit.description}</CardDescription>
          <CardAction><Badge variant="outline">USDC</Badge></CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Stat label={d.balance} value={<Price micros={Number(account.balanceMicroUsd)} locale={locale} />} hint={d.balanceHint} />
          {deposit
            ? <DepositPanel initial={depositView(crypto, chains, deposit)} locale={locale} labels={dict.dashboard.deposit} />
            : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{d.orderTitle}</CardTitle>
          <CardDescription>{d.orderNote}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-x-8 md:grid-cols-2">
            {[[d.order1, d.order1Hint], [d.order2, d.order2Hint]].map(([title, hint], index) => (
              <li key={title} className="flex gap-4 border-t py-4 first:border-t-0 first:pt-0 md:border-t-0 md:py-0">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{index + 1}</span>
                <span className="flex flex-col gap-0.5"><span className="text-sm font-medium">{title}</span><span className="text-sm text-muted-foreground">{hint}</span></span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Los paquetes por modelo ya no se venden (ADR-0058). Quien tenga uno todavía lo ve aquí hasta que se acabe. */}
      {packs.length > 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="your-packs-title">
          <SectionHeader title={<span id="your-packs-title">{d.yourPacks}</span>} description={d.yourPacksHint} />
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
                {packs.map((pack) => (
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
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="history-title">
        <SectionHeader title={<span id="history-title">{d.historyTitle}</span>} />
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{d.date}</TableHead>
                <TableHead>{d.concept}</TableHead>
                <TableHead className="text-right">{d.amount}</TableHead>
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
                  <TableCell>{concept(payment)}</TableCell>
                  <TableCell className="text-right"><Price micros={Number(payment.amountMicroUsd)} locale={locale} /></TableCell>
                  <TableCell>
                    <Badge variant={payment.kind === "topup" ? "success" : "outline"}>
                      {payment.kind === "topup" ? d.creditedStatus : payment.paymentProvider === "balance" ? d.paidWithBalance : d.paidStatus}
                    </Badge>
                  </TableCell>
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
