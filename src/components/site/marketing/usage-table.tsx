import Link from "next/link";

import { ModelLogo } from "@/components/catalog/provider-logo";
import { Price } from "@/components/price";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PLANS, REFERENCE_MODEL_ID } from "@/lib/billing/plans";
import { typicalCost, typicalRequestsIn, usageMultiplier } from "@/lib/billing/typical";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";
import { pickModels, USAGE_TABLE_MODELS } from "@/lib/marketing";

/** La ventana de este plan da la columna de requests: el del medio. */
const TABLE_PLAN = PLANS.pro;

/** Lo que gasta cada modelo del límite: la misma cuenta que «Consumo por modelo» del dashboard. ADR-0061. */
export function UsageTable({ models, locale, dict }: { models: CatalogModel[]; locale: Locale; dict: Dictionary }) {
  const d = dict.pricing.usage;
  const reference = models.find((model) => model.id === REFERENCE_MODEL_ID);
  const rows = pickModels(models, USAGE_TABLE_MODELS).toSorted((a, b) => Number(typicalCost(b) - typicalCost(a)));
  // Igual que «Consumo por modelo» del dashboard.
  const times = (value: number) => `${formatCount(Math.round(value * 100) / 100, locale)}×`;
  return (
    <Table regionLabel={d.tableLabel} className="nr-mk-usage">
      <TableHeader>
        <TableRow>
          <TableHead>{d.model}</TableHead>
          <TableHead className="text-right">{d.input}</TableHead>
          <TableHead className="text-right">{d.output}</TableHead>
          <TableHead className="text-right">{d.typical}</TableHead>
          {reference ? <TableHead className="text-right">{t(d.multiplier, { model: reference.name })}</TableHead> : null}
          <TableHead className="text-right">{t(d.window, { plan: dict.dashboard.plans[TABLE_PLAN.id].name })}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((model) => (
          <TableRow key={model.id}>
            <TableCell>
              <Link className="nr-mk-usage-model" href={`/${locale}/models/${model.author}/${model.slug}`}><ModelLogo modelId={model.id} />{model.name}</Link>
            </TableCell>
            <TableCell className="text-right"><Price micros={model.discountedInput} locale={locale} kind="price" /> <s className="text-muted-foreground"><span className="sr-only">{dict.catalog.official}: </span>{formatUsd(model.officialInput, locale, "price")}</s></TableCell>
            <TableCell className="text-right"><Price micros={model.discountedOutput} locale={locale} kind="price" /> <s className="text-muted-foreground"><span className="sr-only">{dict.catalog.official}: </span>{formatUsd(model.officialOutput, locale, "price")}</s></TableCell>
            <TableCell className="text-right"><Price micros={Number(typicalCost(model))} locale={locale} kind="cost" /></TableCell>
            {reference ? <TableCell className="text-right tabular-nums">{times(usageMultiplier(model, models))}</TableCell> : null}
            <TableCell className="text-right tabular-nums">{t(dict.pricing.approx, { count: formatCount(typicalRequestsIn(TABLE_PLAN.fiveHourLimitMicroUsd, model), locale) })}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
