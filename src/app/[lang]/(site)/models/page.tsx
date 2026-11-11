import type { Metadata } from "next";

import { ModelCatalog } from "@/components/catalog/model-catalog";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { getCatalog } from "@/lib/catalog/queries";
import { formatCount } from "@/lib/format";
import { t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.meta.modelsTitle, description: dict.meta.modelsDescription };
}

/** Catálogo público (docs/02 › Catálogo). Funciona sin login. */
export default async function ModelsPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  const models = getCatalog();

  return (
    <Container className="flex flex-col gap-8 pt-12 sm:pt-16">
      <PageHeader
        title={dict.catalog.title}
        description={t(dict.catalog.description, { count: formatCount(models.length, locale) })}
      />
      <ModelCatalog
        models={models}
        locale={locale}
        dict={{ catalog: dict.catalog, tags: dict.tags, copy: dict.copy }}
      />
    </Container>
  );
}
