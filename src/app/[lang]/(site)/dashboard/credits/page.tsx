import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ModelLogo } from "@/components/catalog/provider-logo";
import { actionErrors } from "@/components/dashboard/action-errors";
import { BitcoinPanel } from "@/components/dashboard/bitcoin-panel";
import { BitcoinPendingNotice } from "@/components/dashboard/bitcoin-pending-notice";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { DepositPanel, emptyDepositView } from "@/components/dashboard/deposit-panel";
import { type PaymentMark, PaymentHistory, type PaymentRow } from "@/components/dashboard/payment-history";
import { PaymentsNotice } from "@/components/dashboard/payments-notice";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { Price } from "@/components/price";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isPlanId, type PlanId, PLANS } from "@/lib/billing/plans";
import { getLiveCatalog } from "@/lib/catalog/live";
import { getAccount, listPacks, listPayments } from "@/lib/dashboard/queries";
import { requireDashboard } from "@/lib/dashboard/session";
import { getDb } from "@/lib/db/client";
import { formatDate, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { loadBitcoinPending, loadBitcoinView } from "@/lib/payments/bitcoin/load";
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
  const usdcAvailable = cryptoPaymentsAvailable(crypto);
  const [account, packs, history, deposit, bitcoin, bitcoinPending] = await Promise.all([
    getAccount(db, workspaceId, now), listPacks(db, workspaceId), listPayments(db, workspaceId),
    usdcAvailable ? getDepositState(db, chains, workspaceId, now) : null,
    loadBitcoinView(db, workspaceId, now),
    loadBitcoinPending(db, workspaceId),
  ]);
  const paymentsAvailable = usdcAvailable || bitcoin !== null;
  const d = dict.dashboard.credits;
  const catalog = await getLiveCatalog();
  const names = new Map(catalog.map((model) => [model.id, model.name]));
  const money = (micros: bigint) => formatUsd(Number(micros), locale);
  // Una línea con lo que hoy pasa al cobrar, con los datos de la cuenta, en vez de explicar el orden en una card.
  const charge = account.plan === null
    ? d.chargeNoPlan
    : account.overflow.mode === "continue" && account.overflow.credits
      ? t(d.chargeOverflow, { cap: money(account.overflow.capMicroUsd) })
      : d.chargeStop;
  const concept = (payment: (typeof history)[number]) => {
    const { kind, item } = payment;
    if (kind === "subscription" && item && item in PLANS) return t(d.kinds.subscription, { plan: dict.dashboard.plans[item as PlanId].name });
    if (kind === "pack" && item) return t(d.kinds.pack, { model: names.get(item) ?? item });
    if (payment.paymentProvider.startsWith("bitcoin")) return d.bitcoinPaid;
    return payment.paymentProvider.startsWith("usdc-") ? d.deposited : d.kinds.topup;
  };
  const networks: Record<string, string> = { ...dict.dashboard.deposit.networks, bitcoin: "Bitcoin" };
  const mark = (payment: (typeof history)[number]): PaymentMark => {
    if (payment.kind === "subscription") return { kind: "plan" };
    if (payment.kind === "pack" && payment.item) return { kind: "model", modelId: payment.item };
    if (payment.paymentProvider.startsWith("bitcoin")) return { kind: "bitcoin" };
    if (payment.paymentProvider.startsWith("usdc-")) return { kind: "usdc" };
    return { kind: "balance" };
  };
  const rows: PaymentRow[] = history.map((payment) => {
    // `usdc-base` → Base, `bitcoin` → Bitcoin: la red va junto a la fecha. Los de desarrollo (`usdc-dev`) no tienen.
    const network = networks[payment.paymentProvider.replace(/^usdc-/, "")];
    const credit = payment.kind === "topup";
    return {
      id: payment.id,
      title: concept(payment),
      detail: network ? `${formatDate(payment.createdAt, locale)} · ${network}` : formatDate(payment.createdAt, locale),
      status: credit ? d.creditedStatus : payment.paymentProvider === "balance" ? d.paidWithBalance : d.paidStatus,
      credit,
      amount: `${credit ? "+" : ""}${money(payment.amountMicroUsd)}`,
      receiptUrl: payment.receiptUrl,
      mark: mark(payment),
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <PaymentsNotice available={paymentsAvailable} simulate={crypto.simulate || bitcoin?.simulate === true} labels={dict.dashboard.payments} />
      <BitcoinPendingNotice
        pending={bitcoinPending}
        planName={(id) => (isPlanId(id) ? dict.dashboard.plans[id].name : null)}
        labels={dict.dashboard.bitcoin}
      />

      <section className="flex flex-col gap-2" aria-label={d.balance}>
        <Stat label={d.balance} value={<Price micros={Number(account.balanceMicroUsd)} locale={locale} />} />
        <p className="text-sm text-pretty text-muted-foreground">
          {charge}{" "}
          <Link href={`/${locale}/dashboard/plan`} className="nr-documentation-link">{d.chargeChange}</Link>
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{dict.dashboard.deposit.title}</CardTitle>
          <CardDescription>{dict.dashboard.deposit.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {deposit || bitcoin ? (
            <DepositPanel
              initial={deposit ? depositView(crypto, chains, deposit) : emptyDepositView(account.balanceMicroUsd.toString())}
              locale={locale}
              labels={dict.dashboard.deposit}
              errorLabel={dict.dashboard.error}
              bitcoin={bitcoin ? {
                label: dict.dashboard.bitcoin.tab,
                active: bitcoin.order?.intent === "topup" && bitcoin.order.outcome === null,
                content: (
                  <BitcoinPanel
                    initial={bitcoin}
                    locale={locale}
                    labels={dict.dashboard.bitcoin}
                    purpose={{ kind: "topup" }}
                    errors={actionErrors(dict)}
                  />
                ),
              } : undefined}
            />
          ) : null}
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
                      <Progress
                        value={(Number(pack.balanceMicroUsd) / Number(pack.grantedMicroUsd)) * 100}
                        aria-label={t(d.packLeftLabel, { model: names.get(pack.modelId) ?? pack.modelId })}
                        locale={locale}
                      >
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

      {/* Sin pagos no se arma una lista vacía: basta una línea bajo el título. */}
      <section className={history.length === 0 ? "flex flex-col gap-1" : "flex flex-col gap-4"} aria-labelledby="history-title">
        <SectionHeader title={<span id="history-title">{d.historyTitle}</span>} />
        {history.length === 0
          ? <p className="text-sm text-muted-foreground">{d.noHistory}</p>
          : <PaymentHistory rows={rows} receiptLabel={d.receipt} label={d.historyTitle} />}
      </section>
    </div>
  );
}
