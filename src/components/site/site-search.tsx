"use client";
import ArrowRightIcon from "kubai-icons-react/icons/arrow-right";
import BookOpenIcon from "kubai-icons-react/icons/book-open";
import CircleHelpIcon from "kubai-icons-react/icons/circle-help";
import GridIcon from "kubai-icons-react/icons/grid";
import TagIcon from "kubai-icons-react/icons/tag";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ModelLogo, providerName } from "@/components/catalog/provider-logo";
import { DiscountBadge } from "@/components/discount-badge";
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { filterModels, type SearchModel } from "@/lib/catalog/search";
import { formatCount, formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, plural, t } from "@/lib/i18n/dictionaries";

/** Sin texto, la paleta muestra los recomendados; con texto, los primeros resultados y un enlace al catálogo filtrado. */
const SUGGESTIONS = 6;
const RESULTS = 8;

/**
 * La búsqueda global (⌘K, Ctrl K o /): lleva a un modelo o a una página desde cualquier parte del sitio.
 * Filtrar la lista completa es trabajo del campo del catálogo; aquí Enter abre el resultado marcado.
 */
export function SiteSearch({ locale, dict, models, open, onOpenChange }: {
  locale: Locale; dict: Pick<Dictionary, "search" | "nav">; models: SearchModel[]; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const { search } = dict;
  const results = filterModels(models, { query, tags: [], sort: "featured" });
  const shown = results.slice(0, query.trim() ? RESULTS : SUGGESTIONS);
  const pages = [
    { href: `/${locale}/models`, label: dict.nav.models, Icon: GridIcon },
    { href: `/${locale}/pricing`, label: dict.nav.pricing, Icon: TagIcon },
    { href: `/${locale}/docs`, label: dict.nav.docs, Icon: BookOpenIcon },
    { href: `/${locale}/faq`, label: dict.nav.faq, Icon: CircleHelpIcon },
  ];

  function changeOpen(next: boolean) {
    onOpenChange(next);
    if (!next) setQuery("");
  }
  function go(href: string) {
    changeOpen(false);
    router.push(href);
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        // ⌘K abre y cierra, como en cualquier paleta.
        event.preventDefault(); onOpenChange(!open); if (open) setQuery("");
      } else if (!open && event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !target.closest("input, textarea, select, [contenteditable]")) {
        event.preventDefault(); onOpenChange(true);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [open, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={changeOpen} initialFocus={input} title={search.title} description={search.description} className="nr-search-palette sm:max-w-xl">
      {/* El filtro es el mismo del catálogo (nombre, autor o ID, sin importar signos), no el difuso de cmdk. */}
      <Command shouldFilter={false} loop label={search.title}>
        <CommandInput ref={input} value={query} onValueChange={setQuery} placeholder={search.placeholder} />
        <CommandList className="max-h-[min(26rem,60dvh)]">
          <CommandEmpty>{t(search.empty, { query: query.trim() })}</CommandEmpty>
          {shown.length ? (
            <CommandGroup heading={query.trim() ? search.models : search.popular}>
              {shown.map((model) => (
                <CommandItem key={model.id} value={model.id} onSelect={() => go(`/${locale}/models/${model.author}/${model.slug}`)} className="nr-search-item">
                  <ModelLogo modelId={model.id} />
                  <span className="nr-search-name">{model.name}</span>
                  <span className="nr-search-author">{providerName(model.author)}</span>
                  <span className="nr-search-price">{t(search.perOutput, { price: formatUsd(model.discountedOutput, locale, "price") })}</span>
                  <DiscountBadge discountBps={model.discountBps} locale={locale} />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {query.trim() && results.length ? (
            <CommandGroup>
              <CommandItem value="__catalog" onSelect={() => go(`/${locale}/models?q=${encodeURIComponent(query.trim())}`)}>
                <ArrowRightIcon aria-hidden />
                {t(plural(locale, results.length, search.seeAllOne, search.seeAllOther), { count: formatCount(results.length, locale) })}
              </CommandItem>
            </CommandGroup>
          ) : null}
          {!query.trim() ? (
            <CommandGroup heading={search.pages}>
              {pages.map(({ href, label, Icon }) => (
                <CommandItem key={href} value={href} onSelect={() => go(href)}><Icon aria-hidden />{label}</CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
