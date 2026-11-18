import { ModelCatalog } from "@/components/catalog/model-catalog";
import { getLiveCatalog } from "@/lib/catalog/live";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

export default async function HomePage() {
  const [locale, dict] = await getLocaleAndDictionary();
  return <div className="nr-main"><ModelCatalog models={await getLiveCatalog()} locale={locale} dict={dict} /></div>;
}
