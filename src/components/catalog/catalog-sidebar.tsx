"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import GridIcon from "kubai-icons-react/icons/grid";
import UsersIcon from "kubai-icons-react/icons/users";
import { MODEL_TAG_ICONS } from "@/components/model-tag";

import { Button } from "@/components/ui/button";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import { MODEL_TAGS, type ModelTag } from "@/lib/catalog/tags";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

import { ProviderLogo, providerName } from "./provider-logo";

export function CatalogSidebar({ models, locale, dict, detail = false, open = false, sidebarId }: {
  models: CatalogModel[];
  locale: Locale;
  dict: Pick<Dictionary, "catalog" | "tags">;
  detail?: boolean;
  open?: boolean;
  sidebarId?: string;
}) {
  const filters = useCatalogFilters();
  const { catalog } = dict;

  function choice(label: string, values: Record<string, string>, active: boolean, icon: ReactNode, count?: number) {
    const content = <>{icon}<span className="nr-sidebar-label">{label}</span>{count !== undefined ? <span className="nr-sidebar-count" aria-hidden>{formatCount(count, locale)}</span> : null}</>;
    const key = `${label}-${Object.keys(values).join()}`;
    if (detail) {
      const params = new URLSearchParams(filters.search);
      for (const [key, value] of Object.entries(values)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      const query = params.toString();
      return <Link key={key} href={`/${locale}/models${query ? `?${query}` : ""}`} aria-current={active ? "true" : undefined}>{content}</Link>;
    }
    return <Button key={key} variant="ghost" className="nr-plain" aria-pressed={active} onClick={() => filters.update(values)}>{content}</Button>;
  }

  return (
    <aside id={sidebarId} className="nr-sidebar" aria-label={catalog.filterLabel} data-open={open}>
      <div className="nr-sidebar-group">
        <h2>{catalog.explore}</h2>
        <div className="nr-big-list">
          {choice(catalog.allModels, { q: "", tags: "", author: "" }, !filters.author && !filters.tags.length, <GridIcon size={24} trigger="parent" aria-hidden />, models.length)}
        </div>
      </div>
      <div className="nr-sidebar-group">
        <h2>{catalog.filterLabel}</h2>
        <div className="nr-big-list" role="group" aria-label={catalog.filterLabel}>
          {MODEL_TAGS.map((tag: ModelTag) => {
            const Icon = MODEL_TAG_ICONS[tag];
            return choice(dict.tags[tag], {
              tags: (filters.tags.includes(tag) ? filters.tags.filter((value) => value !== tag) : [...filters.tags, tag]).join(","),
            }, filters.tags.includes(tag), <Icon size={24} trigger="parent" aria-hidden />);
          })}
        </div>
      </div>
      <div className="nr-sidebar-group">
        <h2>{catalog.authors}</h2>
        <div className="nr-big-list">
          {choice(catalog.allAuthors, { author: "" }, !filters.author, <UsersIcon size={24} trigger="parent" aria-hidden />)}
          {[...new Set(models.map((model) => model.author))].sort().map((author) => choice(providerName(author), {
            author: filters.author === author ? "" : author,
          }, filters.author === author, <ProviderLogo author={author} />))}
        </div>
      </div>
    </aside>
  );
}
