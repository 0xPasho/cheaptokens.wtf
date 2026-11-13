import type { Metadata } from "next";
import { ModelCatalog } from "@/components/catalog/model-catalog";
import { getCatalog } from "@/lib/catalog/queries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.meta.modelsTitle, description: dict.meta.modelsDescription };
}
export default async function ModelsPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  return <div className="nr-main"><ModelCatalog models={getCatalog()} locale={locale} dict={dict} /></div>;
}
