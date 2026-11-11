"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { LOCALE_COOKIE, LOCALES, type Locale, switchLocalePath } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/** Cambia el prefijo de idioma de la ruta actual y guarda la elección (docs/10-i18n.md). */
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

  return (
    <nav aria-label={label} className="flex items-center gap-1">
      {LOCALES.map((option) => (
        <Link
          key={option}
          href={switchLocalePath(pathname, option)}
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
