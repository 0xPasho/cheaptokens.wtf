import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

/** Marco de las páginas públicas: navegación de vidrio arriba y footer con idioma. */
export default async function SiteLayout({ children }: LayoutProps<"/[lang]">) {
  const [locale, dict] = await getLocaleAndDictionary();

  return (
    <>
      <SiteHeader locale={locale} dict={dict} />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter locale={locale} dict={dict} />
    </>
  );
}
