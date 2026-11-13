"use client";
import LayoutGridIcon from "kubai-icons-react/icons/grid";
import ListIcon from "kubai-icons-react/icons/list";
import SearchXIcon from "kubai-icons-react/icons/search";
import Link from "next/link";
import { CatalogSidebar } from "@/components/catalog/catalog-sidebar";
import { ModelLogo, ProviderLogo, providerName } from "@/components/catalog/provider-logo";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import { filterModels } from "@/lib/catalog/queries";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatTokens, formatDiscount } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, plural, t } from "@/lib/i18n/dictionaries";
import { CATALOG_IS_SAMPLE } from "@catalog/models";

export function ModelCatalog({ models, locale, dict }: {
  models: CatalogModel[]; locale: Locale; dict: Pick<Dictionary, "catalog" | "tags" | "copy">;
}) {
  const filters = useCatalogFilters();
  const { catalog } = dict;
  const results = filterModels(models.filter((model) => !filters.author || model.author === filters.author), {
    query: filters.query, tags: filters.tags, sort: filters.sort,
  });
  const sortItems = (["discount", "output", "name"] as const).map((value) => ({ value, label: catalog.sort[value] }));
  const count = t(plural(locale, results.length, catalog.resultsOne, catalog.resultsOther), { count: formatCount(results.length, locale) });
  return (
    <div className="nr-layout nr-catalog">
      <CatalogSidebar models={models} locale={locale} dict={dict} />
      <section className="min-w-0" aria-label={catalog.tableLabel}>
        <div className="nr-section-head">
          <h1 className="nr-list-label">{catalog.tableLabel}<span>{formatCount(results.length, locale)}</span></h1>
          <div className="nr-section-controls">
            <div className="nr-sort">
              <Select items={sortItems} value={filters.sort} onValueChange={(value) => value && filters.update({ sort: value })}>
                <SelectTrigger aria-label={catalog.sortLabel}><SelectValue /></SelectTrigger>
                <SelectContent>{sortItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <ToggleGroup className="nr-view-toggle" value={[filters.view]} onValueChange={(value) => value[0] && filters.update({ view: value[0] })} aria-label={catalog.viewLabel}>
              <ToggleGroupItem value="grid" aria-label={catalog.gridView}><LayoutGridIcon aria-hidden /></ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label={catalog.listView}><ListIcon aria-hidden /></ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <p className="nr-status" role="status">{count}{CATALOG_IS_SAMPLE ? ` · ${catalog.sample}` : ""}</p>
        {results.length ? (
          <div className={`nr-grid${filters.view === "list" ? " nr-list" : ""}`}>
            {results.map((model) => (
              <article className="nr-model-card" key={model.id}>
                <div className="nr-model-card-front">
                  <h2 className="nr-model-id"><ModelLogo modelId={model.id} />
                    <Link className="nr-model-link" href={`/${locale}/models/${model.author}/${model.slug}${filters.search}`}>{model.name}</Link>
                  </h2>
                  <p className="nr-desc">{model.description[locale] ?? model.description.en}</p>
                  <div className="nr-pills">
                    <span>{formatTokens(model.contextLength, locale)} {catalog.columns.context.toLowerCase()}</span>
                    {model.allTags.filter((tag) => tag !== "long-context").slice(0, 3).map((tag) => <span key={tag}>{dict.tags[tag]}</span>)}
                    <span>{formatDiscount(model.discountBps, locale)}</span>
                    {model.status === "deprecated" ? <span>{catalog.deprecated}</span> : null}
                  </div>
                </div>
                <div className="nr-model-card-footer">
                  <div className="nr-model-meta"><b className="nr-model-author"><ProviderLogo author={model.author} />{providerName(model.author)}</b><span className="nr-task">{catalog.textGeneration}</span></div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty className="nr-detail-panel">
            <EmptyHeader><EmptyMedia variant="icon"><SearchXIcon aria-hidden /></EmptyMedia><EmptyTitle>{catalog.emptyTitle}</EmptyTitle><EmptyDescription>{catalog.emptyBody}</EmptyDescription></EmptyHeader>
            <EmptyContent><Button variant="secondary" onClick={() => filters.update({ q: "", author: "", tags: "" })}>{catalog.clear}</Button></EmptyContent>
          </Empty>
        )}
      </section>
    </div>
  );
}
