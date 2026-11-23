import CircleCheckIcon from "kubai-icons-react/icons/circle-check";
import PlusIcon from "kubai-icons-react/icons/circle-plus";
import TriangleAlertIcon from "kubai-icons-react/icons/triangle-alert";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AccountAvatar } from "@/components/account-avatar";
import { ModelLogo } from "@/components/catalog/provider-logo";
import { CopyButton } from "@/components/copy-button";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PlanMeters } from "@/components/dashboard/plan-meters";
import { SectionHeader } from "@/components/page-header";
import { Price } from "@/components/price";
import { QuickstartSnippet } from "@/components/quickstart-snippet";
import { Stat } from "@/components/stat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { planRemaining } from "@/lib/billing/limits";
import { PLANS, REFERENCE_MODEL_ID } from "@/lib/billing/plans";
import { typicalRequestsIn } from "@/lib/billing/typical";
import { getLiveCatalog } from "@/lib/catalog/live";
import { getAccount, getPlanUsageByModel, getUsageSummary, hasAnyRequest, listKeys, listPacks } from "@/lib/dashboard/queries";
import { requireDashboard } from "@/lib/dashboard/session";
import { getDb } from "@/lib/db/client";
import { formatCount, formatDate, formatPercent, formatTokens, formatUsd, totalKind } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { API_BASE_URL } from "@/lib/site";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Umbral del aviso de saldo bajo sin plan (docs/02 › Dashboard). */
const LOW_BALANCE_MICRO_USD = BigInt(2_000_000);

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.dashboard.overview.title, robots: { index: false } };
}

export default async function OverviewPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  // El saludo necesita la sesión: va dentro de Overview, no en una cabecera fija como en las demás páginas.
  return (
    <Suspense fallback={<DashboardSkeleton label={dict.dashboard.loading} />}>
      <Overview locale={locale} dict={dict} />
    </Suspense>
  );
}

/** «demo@cheapllm.wtf» → «demo»: para saludar basta la parte antes de la arroba. */
function firstName(name: string | null, email: string | null): string | null {
  const value = name ?? email;
  if (!value) return null;
  return value.includes("@") ? value.slice(0, value.indexOf("@")) : value.split(" ")[0] ?? value;
}

async function Overview({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { user, workspaceId, now } = await requireDashboard(locale, "");
  const db = getDb();
  const since = new Date(now - 7 * DAY_MS);
  const [account, summary, byModel, packs, started, keys] = await Promise.all([
    getAccount(db, workspaceId, now),
    getUsageSummary(db, workspaceId, { since }),
    getPlanUsageByModel(db, workspaceId, since),
    listPacks(db, workspaceId),
    hasAnyRequest(db, workspaceId),
    listKeys(db, workspaceId),
  ]);
  const d = dict.dashboard.overview;
  const catalog = await getLiveCatalog();
  const names = new Map(catalog.map((model) => [model.id, model.name]));
  const reference = catalog.find((model) => model.id === REFERENCE_MODEL_ID);
  const activePacks = packs.filter((pack) => pack.expiresAt.getTime() > now && pack.balanceMicroUsd > BigInt(0));
  const planTotal = byModel.reduce((sum, row) => sum + Number(row.plan), 0);
  // Una key activa: ni revocada ni vencida tras rotarla (el mismo criterio que la página de keys).
  const hasKey = keys.some((key) => key.revokedAt === null && (key.expiresAt === null || key.expiresAt.getTime() > now));
  const base = `/${locale}/dashboard`;

  const name = firstName(user.name, user.email);
  const planName = account.plan ? dict.dashboard.plans[account.plan.plan.id].name : null;

  return (
    <div className="flex flex-col gap-8">
      {/* Un inicio: saludo con la cuenta y, a la derecha, lo que se usa al empezar: la URL base y crear una key.
          Sin atajos a otras páginas: repetían el menú lateral. */}
      <header className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <AccountAvatar seed={user.id} size="xl" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">{name ? t(d.greeting, { name }) : d.greetingNoName}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {account.plan && account.subscription && planName
                ? t(d.planActive, { plan: planName, date: formatDate(account.subscription.periodEnd, locale) })
                : d.noPlanSubtitle}
            </p>
          </div>
        </div>
        {/* Anchos fijos (320 y 128 px): con el ancho del texto caían en medio píxel. En móvil, cada uno a todo el ancho.
            Con ancho fijo el botón lleva el mismo relleno a los dos lados: el contenido queda al centro, no 6 px corrido. */}
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          {/* Lo que se pega en el cliente: misma altura (36 px) que el botón de al lado. */}
          <div className="flex h-9 min-w-0 items-center gap-2 rounded-full bg-glass-control pr-1 pl-4 sm:w-80">
            <span className="shrink-0 text-xs text-muted-foreground">{d.baseUrl}</span>
            <code className="min-w-0 flex-1 truncate font-mono text-xs">{API_BASE_URL}</code>
            <CopyButton value={API_BASE_URL} size="icon-sm" copyLabel={dict.copy.copy} copiedLabel={dict.copy.copied} />
          </div>
          <Link href={`${base}/keys#crear`} className={buttonVariants({ size: "lg", className: "h-9 has-data-[icon=inline-start]:pl-5 sm:w-32" })}>
            <PlusIcon data-icon="inline-start" aria-hidden />
            {d.newKey}
          </Link>
        </div>
      </header>

      {!account.plan && account.balanceMicroUsd < LOW_BALANCE_MICRO_USD && started ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{t(d.lowBalanceTitle, { amount: formatUsd(Number(account.balanceMicroUsd), locale) })}</AlertTitle>
          <AlertDescription>{d.lowBalanceBody}</AlertDescription>
        </Alert>
      ) : null}

      {!started ? (
        <Card>
          <CardHeader>
            <CardTitle>{d.gettingStarted}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                { done: account.plan !== null || account.balanceMicroUsd > BigInt(0), label: d.step1, href: `${base}/plan` },
                { done: hasKey, label: d.step2, href: `${base}/keys` },
                { done: false, label: d.step3, href: `/${locale}/docs#quickstart` },
              ].map((step, index) => (
                <li key={step.label}>
                  <Link href={step.href} className="flex items-center gap-3 rounded-2xl bg-glass-control p-4 text-sm hover:bg-glass-control-hover">
                    {/* El check va en la misma caja de 24 px que el número: si no, el paso hecho queda 2 px más bajo. */}
                    {step.done
                      ? <span className="flex size-6 shrink-0 items-center justify-center"><CircleCheckIcon size={22} aria-hidden /></span>
                      : <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{index + 1}</span>}
                    {step.label}
                    {step.done ? <span className="sr-only"> {d.stepDone}</span> : null}
                  </Link>
                </li>
              ))}
            </ol>
            <QuickstartSnippet baseUrl={API_BASE_URL} apiKey="wtf_..." model={REFERENCE_MODEL_ID} copyLabel={dict.copy.copy} copiedLabel={dict.copy.copied} className="min-w-0" />
          </CardContent>
        </Card>
      ) : null}

      {/* El plan a la izquierda; a la derecha, el dinero: saldo y lo ahorrado. Las dos columnas miden lo mismo. */}
      {/* Dos columnas desde 1280 px, con la del dinero de ancho fijo (22rem): con 2fr/1fr caía en medio píxel y a
          1024 px el plan quedaba angosto. Debajo se apilan y el saldo y el ahorro van lado a lado. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card role="region" aria-labelledby="limits-title">
          <CardContent className="flex flex-1 flex-col gap-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="limits-title" className="font-heading text-lg font-medium tracking-tight">{account.plan ? d.limitsTitle : d.noPlanTitle}</h2>
              {account.plan ? (
                <p className="text-sm text-muted-foreground">{t(d.planPrice, { plan: dict.dashboard.plans[account.plan.plan.id].name, price: formatUsd(Number(PLANS[account.plan.plan.id].priceMicroUsd), locale, "whole") })}</p>
              ) : null}
            </div>
            {account.plan ? (
              <>
                <PlanMeters usage={account.plan} now={now} locale={locale} labels={dict.dashboard.limits} />
                {reference && planRemaining(account.plan, now) > BigInt(0) ? (
                  <p className="text-sm text-muted-foreground">
                    {t(dict.dashboard.limits.typicalLeft, {
                      count: formatCount(typicalRequestsIn(planRemaining(account.plan, now), reference), locale),
                      model: reference.name,
                    })}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>{account.overflow.mode === "continue" ? d.overflowContinue : d.overflowStop}</span>
                  <Link href={`${base}/plan`} className={buttonVariants({ variant: "outline" })}>{d.adjust}</Link>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-start gap-4">
                <p className="text-sm text-pretty text-muted-foreground">{d.noPlanBody}</p>
                <Link href={`${base}/plan`} className={buttonVariants()}>{d.choosePlan}</Link>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 xl:grid-rows-[auto_minmax(0,1fr)]">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <Stat label={d.credits} value={<Price micros={Number(account.balanceMicroUsd)} locale={locale} />} hint={d.creditsHint} />
              <Link href={`${base}/credits`} className={buttonVariants({ className: "w-full" })}>{d.topUp}</Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-1 flex-col justify-center">
              <Stat label={d.savedLast7} value={<Price micros={Number(summary.saved)} locale={locale} kind={totalKind(Number(summary.saved))} />} hint={d.savedHint} tone="success" />
            </CardContent>
          </Card>
          {/* Los paquetes por modelo ya no se venden (ADR-0058): solo se muestran los que queden. */}
          {activePacks.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{d.packsTitle}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {activePacks.map((pack) => (
                  <div key={pack.id} className="flex flex-col gap-2">
                    {/* Con el idioma de la ruta: si no, el porcentaje que lee el lector de pantalla sale distinto en el servidor. */}
                    <Progress value={(Number(pack.balanceMicroUsd) / Number(pack.grantedMicroUsd)) * 100} locale={locale}>
                      <ProgressLabel className="flex items-center gap-2"><ModelLogo modelId={pack.modelId} />{names.get(pack.modelId) ?? pack.modelId}</ProgressLabel>
                    </Progress>
                    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                      <span>{t(d.packLeft, { left: formatUsd(Number(pack.balanceMicroUsd), locale), total: formatUsd(Number(pack.grantedMicroUsd), locale) })}</span>
                      <span>{t(d.packExpires, { date: formatDate(pack.expiresAt, locale) })}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="last7-title">
        <SectionHeader
          // En la misma fila también en móvil: el botón solo, debajo del título, parecía otra sección.
          className="flex-row items-center justify-between sm:items-center"
          title={<span id="last7-title">{d.last7}</span>}
          actions={<Link href={`${base}/usage`} className={buttonVariants({ variant: "outline" })}>{d.viewUsage}</Link>}
        />
        {/* Tres cifras en una sola card: una rejilla de tarjetitas con un número cada una era relleno. */}
        <Card>
          <CardContent className="grid gap-6 sm:grid-cols-3">
            <Stat label={d.requests} value={formatCount(summary.requests, locale)} />
            <Stat label={d.value} value={<Price micros={Number(summary.value)} locale={locale} kind={totalKind(Number(summary.value))} />} hint={t(d.fromPlan, { amount: formatUsd(Number(summary.plan), locale, totalKind(Number(summary.plan))) })} />
            <Stat label={d.tokens} value={formatTokens(summary.tokens, locale)} hint={d.tokensHint} />
          </CardContent>
        </Card>
      </section>

      <Card role="region" aria-labelledby="by-model-title">
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="by-model-title" className="font-heading text-lg font-medium tracking-tight">{d.byModelTitle}</h2>
            <p className="text-sm text-muted-foreground">{d.byModelHint}</p>
          </div>
          <div className="flex flex-col gap-5">
            {byModel.length === 0 ? <p className="text-sm text-muted-foreground">{d.byModelEmpty}</p> : byModel.map((row) => {
              const share = planTotal > 0 ? Number(row.plan) / planTotal : 0;
              return (
                <Progress key={row.modelId} value={share * 100} locale={locale}>
                  <ProgressLabel className="flex min-w-0 items-center gap-2"><ModelLogo modelId={row.modelId} /><span className="truncate">{names.get(row.modelId) ?? row.modelId}</span></ProgressLabel>
                  <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                    {formatPercent(share, locale)} · {t(d.requestCount, { count: formatCount(row.requests, locale) })}
                  </span>
                </Progress>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
