import Link from "next/link";

import { ThemeSelect } from "@/components/theme-toggle";
import { getKeyHref } from "@/lib/auth/redirect";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

import { BrandWordmark } from "./brand-wordmark";
import { LanguageSwitcher } from "./language-switcher";

/**
 * Pie de página: el logo animado con la frase del producto, dos columnas de enlaces y, abajo, las preferencias
 * (idioma y tema). El tema vive aquí y no en la cabecera, que queda para navegar y entrar.
 */
export function SiteFooter({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const columns = [
    {
      title: dict.footer.product,
      links: [
        { href: `/${locale}/models`, label: dict.nav.models },
        { href: `/${locale}/pricing`, label: dict.nav.pricing },
        { href: `/${locale}/how-it-works`, label: dict.nav.howItWorks },
      ],
    },
    {
      title: dict.footer.resources,
      links: [
        { href: `/${locale}/docs`, label: dict.nav.docs },
        { href: `/${locale}/faq`, label: dict.nav.faq },
        { href: getKeyHref(locale), label: dict.nav.getKey },
      ],
    },
  ];

  return (
    <footer className="nr-site-footer">
      <div className="nr-footer-main">
        <div className="nr-footer-brand">
          <Link href={`/${locale}`} className="nr-footer-wordmark" aria-label={dict.nav.home}>
            <BrandWordmark base={dict.meta.brandBase} tld={dict.meta.brandTld} />
          </Link>
          <p>{dict.footer.tagline}</p>
        </div>
        <nav className="nr-footer-columns" aria-label={dict.footer.label}>
          {columns.map((column) => (
            <div key={column.title}>
              <h2>{column.title}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}><Link href={link.href}>{link.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="nr-footer-bar">
        <p>© {dict.meta.siteName}</p>
        <div className="nr-footer-prefs" role="group" aria-label={dict.footer.preferences}>
          <LanguageSwitcher locale={locale} label={dict.language.label} names={{ en: dict.language.en, es: dict.language.es }} />
          <ThemeSelect labels={dict.theme} className="nr-footer-select" />
        </div>
      </div>
    </footer>
  );
}
