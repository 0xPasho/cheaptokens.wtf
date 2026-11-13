import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelDetail } from "@/components/catalog/model-detail";
import { getCatalog, getModel } from "@/lib/catalog/queries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

export const ensureStatic = "navigation";

export function generateStaticParams() {
  return getCatalog().map((model) => ({ author: model.author, model: model.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/models/[author]/[model]">): Promise<Metadata> {
  const { author, model: slug } = await params;
  const model = getModel(author, slug);
  const [locale] = await getLocaleAndDictionary();
  if (!model) return {};
  return { title: model.name, description: model.description[locale] ?? model.description.en };
}

export default async function ModelPage({ params }: PageProps<"/[lang]/models/[author]/[model]">) {
  const { author, model: slug } = await params;
  const model = getModel(author, slug);
  if (!model) notFound();
  const [locale, dict] = await getLocaleAndDictionary();
  return <ModelDetail model={model} models={getCatalog()} locale={locale} dict={dict} />;
}
