import Link from "next/link";

import { Container } from "@/components/container";
import { Separator } from "@/components/ui/separator";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { CATALOG_IS_SAMPLE } from "@catalog/models";

import { LanguageSwitcher } from "./language-switcher";

export function SiteFooter({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <footer className="mt-auto pt-24 pb-10">
      <Container className="flex flex-col gap-6">
        <Separator />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <Link
              href={`/${locale}`}
              className="w-fit rounded-sm font-heading font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {dict.meta.siteName}
            </Link>
            <p className="text-sm text-muted-foreground">{dict.footer.tagline}</p>
            {/* El header lo esconde en teléfonos: aquí se llega a Docs en cualquier ancho. */}
            <Link
              href={`/${locale}/docs`}
              className="mt-2 w-fit rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {dict.nav.docs}
            </Link>
          </div>
          <LanguageSwitcher
            locale={locale}
            label={dict.language.label}
            names={{ en: dict.language.en, es: dict.language.es }}
          />
        </div>
        {CATALOG_IS_SAMPLE ? (
          <p className="text-xs text-muted-foreground">{dict.footer.sample}</p>
        ) : null}
      </Container>
    </footer>
  );
}
