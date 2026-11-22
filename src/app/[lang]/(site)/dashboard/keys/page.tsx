import KeyRoundIcon from "kubai-icons-react/icons/key-round";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ModelLogo } from "@/components/catalog/provider-logo";
import { actionErrors } from "@/components/dashboard/action-errors";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { CreateKeyDialog, KeyActions, type KeyLabels } from "@/components/dashboard/key-controls";
import { PageHeader } from "@/components/page-header";
import { Price } from "@/components/price";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REFERENCE_MODEL_ID } from "@/lib/billing/plans";
import { getLiveCatalog } from "@/lib/catalog/live";
import { listKeys } from "@/lib/dashboard/queries";
import { requireDashboard } from "@/lib/dashboard/session";
import { getDb } from "@/lib/db/client";
import { formatCount, formatDate, formatDateTime, formatDuration, totalKind } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, plural, t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { API_BASE_URL } from "@/lib/site";

const MAX_ACTIVE_KEYS = 25;

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.dashboard.keys.title, robots: { index: false } };
}

export default async function KeysPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  return (
    <>
      <PageHeader title={dict.dashboard.keys.title} description={dict.dashboard.keys.description} />
      <Suspense fallback={<DashboardSkeleton label={dict.dashboard.loading} />}>
        <Keys locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}

function keyLabels(dict: Dictionary): KeyLabels {
  const d = dict.dashboard.keys;
  return {
    create: d.create, createTitle: d.createTitle, createDescription: d.createDescription, name: d.name, namePlaceholder: d.namePlaceholder,
    limit: d.limit, limitHint: d.limitHint, limitPlaceholder: d.limitPlaceholder, limitSummary: d.limitSummary, moreOptions: d.moreOptions,
    searchModels: d.searchModels, noModelsMatch: d.noModelsMatch, modelCount: d.modelCount, modelCountOne: d.modelCountOne, source: d.source, models: d.models, allModels: d.allModels, pickModels: d.pickModels,
    pickModelsHint: d.pickModelsHint, createdTitle: d.createdTitle, createdDescription: d.createdDescription, rotatedTitle: d.rotatedTitle,
    rotatedDescription: d.rotatedDescription, done: d.done, keyLabel: d.keyLabel, cancel: d.cancel, rotate: d.rotate, rotateTitle: d.rotateTitle,
    rotateBody: d.rotateBody, rotateConfirm: d.rotateConfirm, revoke: d.revoke, revokeTitle: d.revokeTitle, revokeBody: d.revokeBody,
    revokeConfirm: d.revokeConfirm, sources: dict.dashboard.sources, sourceDescriptions: dict.dashboard.sourceDescriptions,
    copy: dict.copy.copy, copied: dict.copy.copied, close: dict.dashboard.close,
  };
}

async function Keys({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { workspaceId, now } = await requireDashboard(locale, "/keys");
  const keys = await listKeys(getDb(), workspaceId);
  const d = dict.dashboard.keys;
  const labels = keyLabels(dict);
  const errors = actionErrors(dict);
  const snippet = { baseUrl: API_BASE_URL, model: REFERENCE_MODEL_ID };
  const models = (await getLiveCatalog()).filter((model) => model.status === "active").map((model) => ({ id: model.id, name: model.name }))
    .toSorted((a, b) => a.name.localeCompare(b.name, locale));
  const names = new Map(models.map((model) => [model.id, model.name]));
  const active = keys.filter((key) => key.revokedAt === null && (key.expiresAt === null || key.expiresAt.getTime() > now)).length;
  const create = <CreateKeyDialog labels={labels} models={models} errors={errors} snippet={snippet} disabled={active >= MAX_ACTIVE_KEYS} locale={locale} />;

  // El botón de crear queda siempre en el mismo lugar: si cambiara de sitio al pasar del estado vacío a la
  // tabla, el diálogo se desmontaría justo cuando muestra la key recién creada.
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{create}</div>
      {keys.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><KeyRoundIcon /></EmptyMedia>
            <EmptyTitle>{d.emptyTitle}</EmptyTitle>
            <EmptyDescription>{d.emptyBody}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{d.name}</TableHead>
              <TableHead>{d.key}</TableHead>
              <TableHead>{d.source}</TableHead>
              <TableHead>{d.models}</TableHead>
              <TableHead>{d.used}</TableHead>
              <TableHead>{d.created}</TableHead>
              <TableHead>{d.lastUsed}</TableHead>
              <TableHead className="text-right">{d.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => {
              const expired = key.expiresAt !== null && key.expiresAt.getTime() <= now;
              const live = key.revokedAt === null && !expired;
              return (
                <TableRow key={key.id} className={live ? undefined : "text-muted-foreground"}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      {/* Recibe el foco al revocar la key, cuando la fila se queda sin botones. */}
                      <span id={`key-${key.id}`} tabIndex={-1} className="rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)">{key.name}</span>
                      {key.revokedAt ? <Badge variant="secondary">{d.revoked}</Badge> : null}
                      {!key.revokedAt && expired ? <Badge variant="secondary">{d.replaced}</Badge> : null}
                      {live && key.expiresAt ? <Badge variant="warning">{t(d.rotated, { duration: formatDuration(key.expiresAt.getTime() - now, locale) })}</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell><code className="font-mono text-xs">{key.hint}</code></TableCell>
                  <TableCell><Badge variant="outline">{dict.dashboard.sources[key.billingSource]}</Badge></TableCell>
                  <TableCell>
                    {key.allowedModels === null
                      ? d.everyModel
                      : (
                        // Los logos de los primeros modelos permitidos, y la lista completa al pasar el puntero.
                        <span className="flex items-center gap-2" title={key.allowedModels.map((id) => names.get(id) ?? id).join(", ")}>
                          <span className="flex -space-x-1" aria-hidden>
                            {key.allowedModels.slice(0, 4).map((id) => (
                              <span key={id} className="flex size-6 items-center justify-center rounded-full bg-muted ring-2 ring-card"><ModelLogo modelId={id} /></span>
                            ))}
                          </span>
                          {t(plural(locale, key.allowedModels.length, d.modelCountOne, d.modelCount), { count: formatCount(key.allowedModels.length, locale) })}
                        </span>
                      )}
                  </TableCell>
                  <TableCell className="min-w-40">
                    {key.spendLimitMicroUsd === null ? (
                      <span className="flex flex-col"><Price micros={Number(key.spentMicroUsd)} locale={locale} kind={totalKind(Number(key.spentMicroUsd))} /><span className="text-xs text-muted-foreground">{d.noLimit}</span></span>
                    ) : (
                      <Progress
                        value={Math.min(100, (Number(key.spentMicroUsd) / Math.max(1, Number(key.spendLimitMicroUsd))) * 100)}
                        aria-label={t(d.spendLabel, { name: key.name })}
                        locale={locale}
                      >
                        <Price micros={Number(key.spentMicroUsd)} locale={locale} kind={totalKind(Number(key.spentMicroUsd))} className="text-sm" />
                        <span className="ml-auto text-sm text-muted-foreground"><Price micros={Number(key.spendLimitMicroUsd)} locale={locale} /></span>
                      </Progress>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(key.createdAt, locale)}</TableCell>
                  <TableCell>{key.lastUsedAt ? formatDateTime(key.lastUsedAt, locale) : d.never}</TableCell>
                  <TableCell>
                    {/* También en las revocadas: el diálogo que acaba de revocar tiene que terminar de cerrarse. */}
                    <KeyActions
                      keyId={key.id}
                      name={key.name}
                      revoked={key.revokedAt !== null}
                      canRotate={key.expiresAt === null}
                      focusId={`key-${key.id}`}
                      labels={labels}
                      errors={errors}
                      snippet={snippet}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      )}
    </div>
  );
}
