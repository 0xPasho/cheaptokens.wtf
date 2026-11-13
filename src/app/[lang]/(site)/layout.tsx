import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

/** Marco de las páginas públicas: navegación de vidrio arriba y footer con idioma. */
export default async function SiteLayout({ children }: LayoutProps<"/[lang]">) {
  const [locale, dict] = await getLocaleAndDictionary();

  return (
    <div className="nr-site flex min-h-dvh flex-1 flex-col">
      <a href="#main-content" className="nr-srOnly">{dict.nav.skip}</a>
      <SiteHeader locale={locale} dict={dict} />
      <main id="main-content" className="flex flex-1 flex-col">{children}</main>
      <SiteFooter locale={locale} dict={dict} />
    </div>
  );
}
