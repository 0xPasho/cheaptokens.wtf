import ChartBarIcon from "kubai-icons-react/icons/chart-bar";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ModelLogo } from "@/components/catalog/provider-logo";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { UsageFilters } from "@/components/dashboard/usage-filters";
import { PageHeader } from "@/components/page-header";
import { Price } from "@/components/price";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLiveCatalog } from "@/lib/catalog/live";
import { getUsageSummary, listKeys, listRequests, type UsageFilters as Filters, type UsageSource } from "@/lib/dashboard/queries";
import { requireDashboard } from "@/lib/dashboard/session";
import { getDb } from "@/lib/db/client";
import { formatCount, formatDateTime, formatMilliseconds, formatTokens, formatUsd, totalKind } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const RANGES = ["today", "24h", "7d", "30d"] as const;
const SOURCES: UsageSource[] = ["plan", "pack", "credits", "errors"];
type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.dashboard.usage.title, robots: { index: false } };
}

export default async function UsagePage({ searchParams }: PageProps<"/[lang]/dashboard/usage">) {
  const [locale, dict] = await getLocaleAndDictionary();
  return (
    <>
      <PageHeader title={dict.dashboard.usage.title} description={dict.dashboard.usage.description} />
      <Suspense fallback={<DashboardSkeleton label={dict.dashboard.loading} />}>
        <Usage locale={locale} dict={dict} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function since(range: (typeof RANGES)[number], now: number): Date {
  if (range === "today") {
    const date = new Date(now);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  return new Date(now - { "24h": 1, "7d": 7, "30d": 30 }[range] * 24 * 60 * 60 * 1000);
}

async function Usage({ locale, dict, searchParams }: { locale: Locale; dict: Dictionary; searchParams: Promise<SearchParams> }) {
  const { workspaceId, now } = await requireDashboard(locale, "/usage");
  const params = await searchParams;
  const one = (name: string) => (typeof params[name] === "string" ? params[name] : null);
  const db = getDb();
  const keys = await listKeys(db, workspaceId);
  const range = RANGES.find((value) => value === one("range")) ?? "7d";
  const filters: Filters = {
    since: since(range, now),
    keyId: keys.some((key) => key.id === one("key")) ? one("key") : null,
    modelId: one("model"),
    source: SOURCES.find((value) => value === one("source")) ?? null,
  };
  const requested = Math.max(0, Number.parseInt(one("page") ?? "1", 10) - 1 || 0);
  const [summary, first] = await Promise.all([
    getUsageSummary(db, workspaceId, filters),
    listRequests(db, workspaceId, filters, requested, PAGE_SIZE),
  ]);
  const { total } = first;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Una página que ya no existe (link viejo, menos requests con otro filtro) muestra la última.
  const page = Math.min(requested, pages - 1);
  const { rows } = page === requested ? first : await listRequests(db, workspaceId, filters, page, PAGE_SIZE);
  const d = dict.dashboard.usage;
  const catalog = await getLiveCatalog();
  const names = new Map(catalog.map((model) => [model.id, model.name]));
  const pageHref = (target: number) => {
    const next = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])));
    next.set("page", String(target + 1));
    return `?${next.toString()}`;
  };
  const sourceTotal = Number(summary.plan + summary.pack + summary.credits);
  const split = dict.dashboard.split;
  // Los paquetes por modelo ya no se venden (ADR-0058): solo aparecen si pagaron algo en este rango.
  const hadPacks = summary.pack > BigInt(0) || filters.source === "pack";
  const usd = (micros: bigint) => formatUsd(Number(micros), locale, totalKind(Number(micros)));
  // El valor de uso partido por fuente: una barra bajo la cifra, en vez de otra card con dos números.
  const sources = ([["plan", summary.plan, "bg-foreground"], ...(hadPacks ? [["pack", summary.pack, "bg-muted-foreground"] as const] : []), ["credits", summary.credits, "bg-muted-foreground/40"]] as const);
  const filtered = filters.keyId !== null || filters.modelId !== null || filters.source !== null;

  return (
    <div className="flex flex-col gap-6">
      <UsageFilters
        labels={{ range: d.range, key: d.key, model: d.model, source: d.sourceFilter }}
        ranges={RANGES.map((value) => ({ value, label: d.ranges[value] }))}
        keys={[{ value: "all", label: d.allKeys }, ...keys.map((key) => ({ value: key.id, label: key.name }))]}
        models={[{ value: "all", label: d.allModels }, ...catalog.map((model) => ({ value: model.id, label: model.name })).toSorted((a, b) => a.label.localeCompare(b.label, locale))]}
        sources={[
          { value: "all", label: d.allSources }, { value: "plan", label: split.plan },
          ...(hadPacks ? [{ value: "pack", label: split.pack }] : []),
          { value: "credits", label: split.credits }, { value: "errors", label: d.errors },
        ]}
      />

      <Card className="py-0">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {[
            <Stat key="requests" label={dict.dashboard.overview.requests} value={formatCount(summary.requests, locale)} />,
            <Stat key="tokens" label={dict.dashboard.overview.tokens} value={formatTokens(summary.tokens, locale)} />,
            <div key="value" className="flex flex-col gap-2">
              <Stat label={dict.dashboard.overview.value} value={<Price micros={Number(summary.value)} locale={locale} kind={totalKind(Number(summary.value))} />} />
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {sourceTotal > 0 ? sources.map(([key, amount, tone]) => <span key={key} className={tone} style={{ width: `${(Number(amount) / sourceTotal) * 100}%` }} />) : null}
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={d.bySource}>
                {sources.map(([key, amount, tone]) => (
                  <li key={key} className="flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-full", tone)} aria-hidden />
                    {split[key]} <span className="text-foreground tabular-nums">{usd(amount)}</span>
                  </li>
                ))}
                {summary.absorbed > BigInt(0) ? <li>{t(d.absorbed, { amount: usd(summary.absorbed) })}</li> : null}
              </ul>
            </div>,
            <Stat key="saved" label={dict.dashboard.overview.saved} value={<Price micros={Number(summary.saved)} locale={locale} kind={totalKind(Number(summary.saved))} />} hint={dict.dashboard.overview.savedHint} tone="success" />,
          ].map((cell, index) => (
            <div key={index} className="border-border p-5 max-sm:not-first:border-t sm:max-lg:even:border-l sm:max-lg:nth-[n+3]:border-t lg:not-first:border-l">{cell}</div>
          ))}
        </div>
      </Card>

      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ChartBarIcon /></EmptyMedia>
            <EmptyTitle>{d.empty}</EmptyTitle>
            <EmptyDescription>{filtered ? d.emptyFiltered : d.emptyHint}</EmptyDescription>
          </EmptyHeader>
          {filtered ? null : (
            <EmptyContent className="flex-row flex-wrap justify-center">
              {keys.length === 0
                ? <Link href={`/${locale}/dashboard/keys`} className={buttonVariants()}>{d.emptyCreateKey}</Link>
                : <Link href={`/${locale}/docs`} className={buttonVariants({ variant: "outline" })}>{d.emptyDocs}</Link>}
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{d.date}</TableHead>
                <TableHead>{d.model}</TableHead>
                <TableHead className="text-right">{d.tokens}</TableHead>
                <TableHead className="text-right">{d.value}</TableHead>
                <TableHead>{d.source}</TableHead>
                <TableHead className="text-right">{d.latency}</TableHead>
                <TableHead>{d.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const parts = ([["plan", row.planMicroUsd], ["pack", row.packMicroUsd], ["credits", row.creditsMicroUsd], ["absorbed", row.absorbedMicroUsd]] as const)
                  .filter(([, amount]) => amount > BigInt(0));
                const saved = row.officialCostMicroUsd - row.costMicroUsd;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground tabular-nums">{formatDateTime(row.createdAt, locale)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <ModelLogo modelId={row.modelId} />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium">{names.get(row.modelId) ?? row.modelId}</span>
                          <span className="text-xs text-muted-foreground"><span className="sr-only">{d.key}: </span>{row.keyName}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="sr-only">{d.input}: </span>{formatCount(row.promptTokens, locale)}
                      <span className="text-muted-foreground" aria-hidden> → </span>
                      <span className="sr-only">, {d.output}: </span>{formatCount(row.completionTokens, locale)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex flex-col items-end">
                        <Price micros={Number(row.costMicroUsd)} locale={locale} kind="cost" />
                        {saved > BigInt(0) ? <span className="text-xs text-success tabular-nums">{t(d.savedAmount, { amount: formatUsd(Number(saved), locale, "cost") })}</span> : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {parts.length === 0 ? <Badge variant="outline">{split.none}</Badge> : parts.map(([key]) => <Badge key={key} variant="outline">{split[key]}</Badge>)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{formatMilliseconds(row.latencyMs, locale)}</TableCell>
                    <TableCell>
                      {/* Solo resalta lo que falló: un 200 no necesita badge. */}
                      {row.status === "success"
                        ? <span className="text-muted-foreground tabular-nums">{row.httpStatus}</span>
                        : <Badge variant="destructive">{row.httpStatus} · {row.errorCode ?? row.status}</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="tabular-nums">{t(d.showing, { from: formatCount(page * PAGE_SIZE + 1, locale), to: formatCount(Math.min(total, (page + 1) * PAGE_SIZE), locale), total: formatCount(total, locale) })}</span>
          <Pagination className="mx-0 w-auto" aria-label={d.pagination}>
            <PaginationContent>
              {page > 0 ? <PaginationItem><PaginationPrevious href={pageHref(page - 1)} text={d.previous} /></PaginationItem> : null}
              <PaginationItem><span className="px-2 tabular-nums">{t(d.page, { page: formatCount(page + 1, locale), pages: formatCount(pages, locale) })}</span></PaginationItem>
              {page < pages - 1 ? <PaginationItem><PaginationNext href={pageHref(page + 1)} text={d.next} /></PaginationItem> : null}
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
    </div>
  );
}
