import { ModelCatalog } from "@/components/catalog/model-catalog";
import { getCatalog } from "@/lib/catalog/queries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

export default async function HomePage() {
  const [locale, dict] = await getLocaleAndDictionary();
  return <div className="nr-main"><ModelCatalog models={getCatalog()} locale={locale} dict={dict} /></div>;
}
