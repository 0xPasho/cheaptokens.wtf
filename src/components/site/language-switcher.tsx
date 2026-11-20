"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import { LOCALE_COOKIE, LOCALES, type Locale, switchLocalePath } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Cambia el prefijo de idioma de la ruta actual y guarda la elección (docs/10-i18n.md). Conserva la query:
 * los filtros del catálogo y el `redirect_url` de la ventana de acceso siguen en el otro idioma.
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
  // La query del catálogo cambia con `replaceState`: este hook la sigue; en el servidor es vacía.
  const { search } = useCatalogFilters();

  return (
    <nav aria-label={label} className="flex items-center gap-1">
      {LOCALES.map((option) => (
        <Link
          key={option}
          href={`${switchLocalePath(pathname, option)}${search}`}
          hrefLang={option}
          lang={option}
          aria-current={option === locale ? "true" : undefined}
          onClick={() => {
            document.cookie = `${LOCALE_COOKIE}=${option}; path=/; max-age=31536000; SameSite=Lax`;
          }}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "text-muted-foreground aria-[current=true]:text-foreground",
          )}
        >
          {names[option]}
        </Link>
      ))}
    </nav>
  );
}
