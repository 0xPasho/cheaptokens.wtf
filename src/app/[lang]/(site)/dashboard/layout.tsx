import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

/** Marco del dashboard: la sidebar del catálogo con las secciones de la cuenta (docs/02 › Dashboard). */
export default async function DashboardLayout({ children }: LayoutProps<"/[lang]/dashboard">) {
  const [locale, dict] = await getLocaleAndDictionary();
  return (
    <div className="nr-main">
      <div className="nr-catalog nr-layout">
        <DashboardNav locale={locale} labels={dict.dashboard.nav} />
        <section className="flex min-w-0 flex-col gap-8">{children}</section>
      </div>
    </div>
  );
}
