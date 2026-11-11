import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ModelPreviewList } from "@/components/catalog/model-preview-list";
import { ModelPriceCard } from "@/components/catalog/model-price-card";
import { Container } from "@/components/container";
import { ModelId } from "@/components/model-id";
import { ModelTagBadge } from "@/components/model-tag";
import { SectionHeader } from "@/components/page-header";
import { Price } from "@/components/price";
import { QuickstartSnippet } from "@/components/quickstart-snippet";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCatalog, getModel, requestCost, similarModels } from "@/lib/catalog/queries";
import { formatCount, formatDate, formatTokens } from "@/lib/format";
import { t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { API_BASE_URL } from "@/lib/site";

/** Un request típico para el ejemplo de costo (docs/06 › Costo de un request). */
const EXAMPLE = { input: 2_000, output: 500 };

/**
 * La página completa tiene que ser estática. Para un ID fuera del catálogo, la primera visita espera
 * el render completo en vez de mandar un shell de respaldo: así notFound() responde un 404 real y
 * no un 200 con la página de error (guía "ISR with Cache Components" de Next 16).
 */
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

/** Detalle de un modelo (plan en docs/14 › Paso 3). */
export default async function ModelPage({ params }: PageProps<"/[lang]/models/[author]/[model]">) {
  const { author, model: slug } = await params;
  const model = getModel(author, slug);
  if (!model) notFound();

  const [locale, dict] = await getLocaleAndDictionary();
  const discountedCost = requestCost(model.discountedInput, model.discountedOutput, EXAMPLE.input, EXAMPLE.output);
  const officialCost = requestCost(model.officialInput, model.officialOutput, EXAMPLE.input, EXAMPLE.output);
  const similar = similarModels(model, getCatalog());

  return (
    <Container className="flex flex-col gap-12 pt-10 sm:pt-14">
      <div className="flex flex-col gap-6">
        <Link
          href={`/${locale}/models`}
          className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2.5 w-fit" })}
        >
          <ArrowLeftIcon data-icon="inline-start" aria-hidden />
          {dict.detail.back}
        </Link>
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {model.name}
            </h1>
            {model.status === "deprecated" && model.retiresOn ? (
              <Badge variant="warning">
                {t(dict.catalog.retires, { date: formatDate(model.retiresOn, locale) })}
              </Badge>
            ) : null}
          </div>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            {model.description[locale] ?? model.description.en}
          </p>
          <ModelId id={model.id} copyLabel={dict.copy.copy} copiedLabel={dict.copy.copied} />
          <ul aria-label={dict.detail.capabilities} className="flex flex-wrap gap-1">
            {model.allTags.map((tag) => (
              <li key={tag}>
                <ModelTagBadge tag={tag} label={dict.tags[tag]} />
              </li>
            ))}
          </ul>
        </header>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <ModelPriceCard model={model} locale={locale} dict={dict} />
        <Card>
          <CardHeader>
            <CardTitle>{dict.detail.costTitle}</CardTitle>
            <p className="text-sm text-pretty text-muted-foreground">
              {t(dict.detail.costBody, {
                input: formatCount(EXAMPLE.input, locale),
                output: formatCount(EXAMPLE.output, locale),
              })}
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Stat
              size="sm"
              label={dict.detail.discountedCost}
              value={<Price micros={discountedCost} locale={locale} kind="cost" />}
            />
            <Stat
              size="sm"
              label={dict.detail.officialCost}
              value={<Price micros={officialCost} locale={locale} kind="cost" />}
            />
            <Stat
              size="sm"
              className="col-span-2"
              label={dict.detail.savings}
              value={<Price micros={officialCost - discountedCost} locale={locale} kind="cost" />}
              tone="success"
            />
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-4">
        <SectionHeader title={dict.detail.useTitle} description={dict.detail.useBody} />
        <QuickstartSnippet
          baseUrl={API_BASE_URL}
          apiKey="wtf_..."
          model={model.id}
          copyLabel={dict.copy.copy}
          copiedLabel={dict.copy.copied}
        />
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader title={dict.detail.specs} />
        <Card className="py-0">
          <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="flex flex-col gap-1 px-5 py-4">
              <dt className="text-xs font-medium text-muted-foreground">{dict.detail.context}</dt>
              <dd className="tabular-nums">
                {t(dict.detail.contextValue, { tokens: formatTokens(model.contextLength, locale) })}
              </dd>
            </div>
            <div className="flex flex-col gap-1 px-5 py-4">
              <dt className="text-xs font-medium text-muted-foreground">{dict.detail.status}</dt>
              <dd>
                {model.status === "deprecated" && model.retiresOn
                  ? t(dict.detail.statusDeprecated, { date: formatDate(model.retiresOn, locale) })
                  : dict.detail.statusActive}
              </dd>
            </div>
          </dl>
        </Card>
      </section>

      {similar.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader title={dict.detail.similar} />
          <Card className="py-0">
            <ModelPreviewList models={similar} locale={locale} dict={dict} />
          </Card>
        </section>
      ) : null}
    </Container>
  );
}
