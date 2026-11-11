import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { ModelPreviewList } from "@/components/catalog/model-preview-list";
import { Container } from "@/components/container";
import { SectionHeader } from "@/components/page-header";
import { QuickstartSnippet } from "@/components/quickstart-snippet";
import { Stat } from "@/components/stat";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { filterModels, getCatalog } from "@/lib/catalog/queries";
import { formatCount, formatDiscount } from "@/lib/format";
import { t } from "@/lib/i18n/dictionaries";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { API_BASE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Landing (docs/02 › Landing, plan en docs/14). */
export default async function HomePage() {
  const [locale, dict] = await getLocaleAndDictionary();
  const models = getCatalog();
  const top = filterModels(models, { query: "", tags: [], sort: "discount" }).slice(0, 6);
  const maxDiscount = Math.max(...models.map((model) => model.discountBps));
  const copy = { copyLabel: dict.copy.copy, copiedLabel: dict.copy.copied };

  return (
    <>
      {/* Hero (refs 1 y 3): titular centrado bajo el resplandor, entrada escalonada de ~100 ms. */}
      <section className="pt-16 sm:pt-24">
        <Container className="flex flex-col items-center gap-6 text-center">
          <h1 className="enter max-w-3xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            {dict.hero.title}{" "}
            <span className="text-success">{dict.hero.emphasis}</span>
          </h1>
          <p className="enter max-w-2xl text-base text-pretty text-muted-foreground [--enter-delay:100ms] sm:text-lg">
            {dict.hero.subtitle}
          </p>
          <div className="enter flex flex-wrap items-center justify-center gap-3 [--enter-delay:200ms]">
            <Link href={`/${locale}#how-it-works`} className={buttonVariants({ size: "lg" })}>
              {dict.hero.primary}
            </Link>
            <Link
              href={`/${locale}/models`}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {dict.hero.secondary}
              <ArrowRightIcon data-icon="inline-end" aria-hidden />
            </Link>
          </div>
        </Container>

        {/* El compositor (ref 1). Radio concéntrico: el del bloque de código + el margen (better-ui §1). */}
        <Container size="prose" className="enter relative mt-14 [--enter-delay:300ms]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-16 -z-10 h-64 bg-[radial-gradient(ellipse_at_center,var(--ambient-glow),transparent_70%)] blur-2xl"
          />
          <figure className="flex flex-col gap-3 rounded-[calc(var(--radius-2xl)+0.75rem)] glass-surface p-3 text-left">
            <QuickstartSnippet
              baseUrl={API_BASE_URL}
              apiKey="wtf_..."
              model={top[0]?.id ?? "anthropic/claude-haiku-4.5"}
              {...copy}
            />
            <figcaption className="px-2 pb-1 text-xs text-muted-foreground">
              {dict.hero.snippetCaption}
            </figcaption>
          </figure>
        </Container>
      </section>

      {/* Cómo funciona (ref 3: pasos 01 · 02 · 03). */}
      <section id="how-it-works" className="scroll-mt-24 pt-28">
        <Container className="flex flex-col gap-8">
          <SectionHeader title={dict.steps.title} />
          <ol className="grid gap-4 md:grid-cols-3">
            {dict.steps.items.map((step, index) => (
              <li key={step.title}>
                <Card className="h-full">
                  <CardHeader>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <CardTitle>{step.title}</CardTitle>
                    <CardDescription className="text-pretty">{step.body}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Vista previa del catálogo. */}
      <section className="pt-28">
        <Container className="flex flex-col gap-8">
          <SectionHeader
            title={dict.preview.title}
            description={dict.preview.description}
            actions={
              <Link
                href={`/${locale}/models`}
                className={buttonVariants({ variant: "outline" })}
              >
                {t(dict.preview.viewAll, { count: formatCount(models.length, locale) })}
                <ArrowRightIcon data-icon="inline-end" aria-hidden />
              </Link>
            }
          />
          <Card className="py-0">
            <ModelPreviewList models={top} locale={locale} dict={dict} />
          </Card>
        </Container>
      </section>

      {/* Cifras (ref 12): grandes y ligeras. El descuento va en success: es dinero a favor. */}
      <section className="pt-28">
        <Container>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { value: formatDiscount(maxDiscount, locale), label: dict.stats.discount, tone: "success" as const },
              { value: formatCount(1, locale), label: dict.stats.endpoint },
              { value: formatCount(models.length, locale), label: dict.stats.models },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent>
                  <Stat label={stat.label} value={stat.value} tone={stat.tone} />
                </CardContent>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA final con resplandor (ref 2). */}
      <section className="pt-28">
        <Container>
          <div
            className={cn(
              "flex flex-col items-center gap-4 rounded-[2rem] glass-edge glass-glow px-6 py-16 text-center",
            )}
          >
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance">
              {dict.finalCta.title}
            </h2>
            <p className="max-w-xl text-pretty text-muted-foreground">{dict.finalCta.body}</p>
            <Link href={`/${locale}#how-it-works`} className={buttonVariants({ size: "lg" })}>
              {dict.hero.primary}
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
