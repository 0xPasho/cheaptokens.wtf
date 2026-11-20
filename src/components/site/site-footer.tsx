import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { LanguageSwitcher } from "./language-switcher";
export function SiteFooter({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return <footer className="nr-site-footer">
    <nav className="nr-mobile-nav" aria-label={dict.nav.label}>
      <Link href={`/${locale}/models`}>{dict.nav.models}</Link>
      <Link href={`/${locale}/pricing`}>{dict.nav.pricing}</Link>
      <Link href={`/${locale}/docs`}>{dict.nav.docs}</Link>
    </nav>
    <div className="nr-footer-row">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href={`/${locale}`}>{dict.meta.siteName}</Link>
        <Link href={`/${locale}/models`}>{dict.nav.models}</Link>
        <Link href={`/${locale}/pricing`}>{dict.nav.pricing}</Link>
        <Link href={`/${locale}/faq`}>{dict.nav.faq}</Link>
        <Link href={`/${locale}/docs`}>{dict.nav.docs}</Link>
      </div>
      <LanguageSwitcher locale={locale} label={dict.language.label} names={{ en: dict.language.en, es: dict.language.es }} />
    </div>
  </footer>;
}
