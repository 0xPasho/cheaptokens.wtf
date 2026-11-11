import { ExternalLinkIcon } from "lucide-react";

import { DiscountBadge } from "@/components/discount-badge";
import { Price } from "@/components/price";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatDate, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";

/** Precio del modelo (ref 7): precio cheaptokens.wtf grande, oficial tachado, descuento y precio por token en tooltip. */
export function ModelPriceCard({
  model,
  locale,
  dict,
}: {
  model: CatalogModel;
  locale: Locale;
  dict: Dictionary;
}) {
  const rows = [
    { label: dict.detail.input, official: model.officialInput, discounted: model.discountedInput },
    { label: dict.detail.output, official: model.officialOutput, discounted: model.discountedOutput },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dict.detail.pricing}</CardTitle>
        <CardDescription>{dict.detail.perMillion}</CardDescription>
        <CardAction>
          <DiscountBadge discountBps={model.discountBps} locale={locale} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid flex-1 content-start gap-6 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="w-fit rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                }
              >
                <Price
                  micros={row.discounted}
                  locale={locale}
                  kind="price"
                  className="font-heading text-4xl font-light tracking-tight"
                />
              </TooltipTrigger>
              <TooltipContent>
                {t(dict.catalog.perToken, {
                  price: formatUsd(row.discounted / 1_000_000, locale, "token"),
                })}
              </TooltipContent>
            </Tooltip>
            <span className="text-sm text-muted-foreground">
              <span className="sr-only">{dict.catalog.official}: </span>
              <s className="tabular-nums">{formatUsd(row.official, locale, "price")}</s>
            </span>
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {model.officialPriceVerifiedAt
            ? t(dict.detail.verifiedOn, { date: formatDate(model.officialPriceVerifiedAt, locale) })
            : dict.detail.unverified}
        </span>
        <a
          href={model.officialPriceSourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {dict.detail.source}
          <ExternalLinkIcon className="size-3" aria-hidden />
        </a>
      </CardFooter>
    </Card>
  );
}
