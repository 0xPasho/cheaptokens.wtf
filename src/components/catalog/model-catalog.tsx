"use client";

import { SearchIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { DiscountBadge } from "@/components/discount-badge";
import { ModelId } from "@/components/model-id";
import { MODEL_TAG_ICONS, ModelTagBadge } from "@/components/model-tag";
import { PriceComparison } from "@/components/price";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { filterModels, type SortKey } from "@/lib/catalog/queries";
import { MODEL_TAGS, type ModelTag } from "@/lib/catalog/tags";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount, formatDate, formatTokens } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, plural, t } from "@/lib/i18n/dictionaries";

const SORTS: SortKey[] = ["discount", "output", "name"];

/** Catálogo con búsqueda, filtros por tag y orden (docs/02 › Catálogo). Todo es instantáneo. */
export function ModelCatalog({
  models,
  locale,
  dict,
}: {
  models: CatalogModel[];
  locale: Locale;
  dict: Pick<Dictionary, "catalog" | "tags" | "copy">;
}) {
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<ModelTag[]>([]);
  const [sort, setSort] = useState<SortKey>("discount");
  const search = useRef<HTMLInputElement>(null);
  const { catalog } = dict;

  const results = useMemo(
    () => filterModels(models, { query, tags, sort }),
    [models, query, tags, sort],
  );

  // Atajo "/" para buscar, salvo que ya se esté escribiendo en otro campo.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || target.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault();
      search.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sortItems = SORTS.map((value) => ({ value, label: catalog.sort[value] }));
  const count = plural(locale, results.length, catalog.resultsOne, catalog.resultsOther);
  const clear = () => {
    setQuery("");
    setTags([]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-72">
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            ref={search}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={catalog.searchPlaceholder}
            aria-label={catalog.searchLabel}
            aria-keyshortcuts="/"
          />
          <InputGroupAddon align="inline-end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <p role="status" className="text-sm text-muted-foreground tabular-nums sm:ml-auto">
          {t(count, { count: formatCount(results.length, locale) })}
        </p>
        <Select
          items={sortItems}
          value={sort}
          onValueChange={(value) => value && setSort(value as SortKey)}
        >
          <SelectTrigger aria-label={catalog.sortLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ToggleGroup
        multiple
        variant="outline"
        size="sm"
        spacing={1}
        value={tags}
        onValueChange={(value) => setTags(value as ModelTag[])}
        aria-label={catalog.filterLabel}
        className="flex-wrap"
      >
        {MODEL_TAGS.map((tag) => {
          const Icon = MODEL_TAG_ICONS[tag];
          return (
            <ToggleGroupItem key={tag} value={tag}>
              <Icon data-icon="inline-start" aria-hidden />
              {dict.tags[tag]}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      {results.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{catalog.emptyTitle}</EmptyTitle>
            <EmptyDescription>{catalog.emptyBody}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={clear}>
              {catalog.clear}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Table regionLabel={catalog.tableLabel}>
          <TableHeader>
            <TableRow>
              <TableHead>{catalog.columns.model}</TableHead>
              <TableHead className="text-right">{catalog.columns.context}</TableHead>
              <TableHead className="text-right">{catalog.columns.input}</TableHead>
              <TableHead className="text-right">{catalog.columns.output}</TableHead>
              <TableHead className="text-right">{catalog.columns.discount}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((model) => (
              <TableRow key={model.id}>
                <TableCell className="align-top">
                  <div className="flex min-w-60 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/${locale}/models/${model.author}/${model.slug}`}
                        className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {model.name}
                      </Link>
                      {model.status === "deprecated" && model.retiresOn ? (
                        <Badge variant="warning">
                          {t(catalog.retires, { date: formatDate(model.retiresOn, locale) })}
                        </Badge>
                      ) : null}
                    </div>
                    <ModelId
                      id={model.id}
                      copyLabel={dict.copy.copy}
                      copiedLabel={dict.copy.copied}
                    />
                    <div className="flex flex-wrap gap-1">
                      {model.allTags.map((tag) => (
                        <ModelTagBadge key={tag} tag={tag} label={dict.tags[tag]} />
                      ))}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {formatTokens(model.contextLength, locale)}
                </TableCell>
                <TableCell className="text-right align-top">
                  <PriceComparison
                    official={model.officialInput}
                    discounted={model.discountedInput}
                    locale={locale}
                    labels={{ official: catalog.official, discounted: catalog.discounted }}
                  />
                </TableCell>
                <TableCell className="text-right align-top">
                  <PriceComparison
                    official={model.officialOutput}
                    discounted={model.discountedOutput}
                    locale={locale}
                    labels={{ official: catalog.official, discounted: catalog.discounted }}
                  />
                </TableCell>
                <TableCell className="text-right align-top">
                  <DiscountBadge discountBps={model.discountBps} locale={locale} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
