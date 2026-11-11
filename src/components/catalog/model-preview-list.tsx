import Link from "next/link";

import { DiscountBadge } from "@/components/discount-badge";
import { PriceComparison } from "@/components/price";
import type { CatalogModel } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Lista compacta de modelos para la landing: nombre, precio de output y descuento. */
export function ModelPreviewList({
  models,
  locale,
  dict,
}: {
  models: CatalogModel[];
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {models.map((model) => (
        <li key={model.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 sm:flex-nowrap">
          <div className="flex min-w-0 flex-1 flex-col">
            <Link
              href={`/${locale}/models/${model.author}/${model.slug}`}
              className="w-fit rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {model.name}
            </Link>
            <span className="truncate font-mono text-xs text-muted-foreground">{model.id}</span>
          </div>
          <span className="flex items-center gap-3">
            {/* El encabezado de la sección ya dice "por 1M": aquí solo para lector de pantalla. */}
            <span className="sr-only">{dict.catalog.columns.output}</span>
            <PriceComparison
              official={model.officialOutput}
              discounted={model.discountedOutput}
              locale={locale}
              labels={{ official: dict.catalog.official, discounted: dict.catalog.discounted }}
            />
            <DiscountBadge discountBps={model.discountBps} locale={locale} />
          </span>
        </li>
      ))}
    </ul>
  );
}
