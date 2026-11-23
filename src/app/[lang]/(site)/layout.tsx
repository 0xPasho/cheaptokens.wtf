import { AccountControl } from "@/components/site/account-control";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { StatusCopyProvider } from "@/components/site/status-copy";
import { getAuthMode } from "@/lib/auth/mode";
import { getLiveCatalog } from "@/lib/catalog/live";
import { toSearchModel } from "@/lib/catalog/search";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

/** Marco de las páginas públicas: navegación de vidrio arriba y footer con idioma. */
export default async function SiteLayout({ children }: LayoutProps<"/[lang]">) {
  const [locale, dict] = await getLocaleAndDictionary();
  const searchModels = (await getLiveCatalog()).map((model) => toSearchModel(model));
  const accountLabels = {
    signIn: dict.auth.signIn, account: dict.auth.account, dashboard: dict.dashboard.nav.overview,
    keys: dict.dashboard.nav.keys, settings: dict.dashboard.nav.settings, signOut: dict.auth.signOut,
  };

  return (
    <div className="nr-site flex min-h-dvh flex-1 flex-col">
      <a href="#main-content" className="nr-srOnly">{dict.nav.skip}</a>
      <SiteHeader
        locale={locale}
        dict={dict}
        account={<AccountControl mode={getAuthMode()} locale={locale} labels={accountLabels} />}
        menuAccount={<AccountControl mode={getAuthMode()} locale={locale} labels={accountLabels} variant="menu" />}
        models={searchModels}
      />
      <main id="main-content" className="flex flex-1 flex-col">
        <StatusCopyProvider value={{ locale, error: dict.status.error }}>{children}</StatusCopyProvider>
      </main>
      <SiteFooter locale={locale} dict={dict} />
    </div>
  );
}
