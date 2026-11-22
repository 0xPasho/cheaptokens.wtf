"use client";

import LanguagesIcon from "kubai-icons-react/icons/languages";
import { usePathname, useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import { hasLocale, LOCALE_COOKIE, LOCALES, type Locale, switchLocalePath } from "@/lib/i18n/config";

/**
 * Cambia el prefijo de idioma de la ruta actual y guarda la elección (docs/10-i18n.md). Conserva la query:
 * los filtros del catálogo y el `redirect_url` de la ventana de acceso siguen en el otro idioma.
 * Los buscadores encuentran la otra versión por los `alternates` del layout, no por este control.
 */
export function LanguageSwitcher({
  locale,
  label,
  names,
}: {
  locale: Locale;
  label: string;
  names: Record<Locale, string>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // La query del catálogo cambia con `replaceState`: este hook la sigue; en el servidor es vacía.
  const { search } = useCatalogFilters();
  const items = LOCALES.map((value) => ({ value, label: names[value] }));

  return (
    <Select
      items={items}
      value={locale}
      onValueChange={(value) => {
        if (!value || !hasLocale(value) || value === locale) return;
        document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
        router.push(`${switchLocalePath(pathname, value)}${search}`);
      }}
    >
      <SelectTrigger size="sm" aria-label={label} className="nr-footer-select">
        <LanguagesIcon aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false} side="top">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} lang={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
