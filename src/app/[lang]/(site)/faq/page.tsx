import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/container";
import { FaqList, faqValues } from "@/components/site/marketing/faq-list";
import { buttonVariants } from "@/components/ui/button";
import { getKeyHref } from "@/lib/auth/redirect";
import { getLiveCatalog } from "@/lib/catalog/live";
import { formatCount } from "@/lib/format";
import { getLocaleAndDictionary } from "@/lib/i18n/server";
import { FAQ_TOPICS } from "@/lib/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.meta.faqTitle, description: dict.meta.faqDescription };
}

/** Todas las preguntas, agrupadas por tema (ADR-0061). */
export default async function FaqPage() {
  const [locale, dict] = await getLocaleAndDictionary();
  const values = faqValues(await getLiveCatalog(), locale);
  const d = dict.faq;
  const [before, after = ""] = d.description.split("{docs}");
  return (
    <Container className="nr-mk">
      <header className="nr-mk-page-head">
        <p className="nr-mk-eyebrow">{d.eyebrow}</p>
        <h1>{d.title}</h1>
        <p>{before}<Link className="nr-documentation-link" href={`/${locale}/docs`}>{dict.nav.docs}</Link>{after}</p>
      </header>
      <div className="nr-mk-faq-page">
        <nav className="nr-mk-faq-nav" aria-label={d.topicsLabel}>
          <p aria-hidden>{d.topicsLabel}</p>
          {FAQ_TOPICS.map((topic) => (
            <a key={topic.id} href={`#${topic.id}`}>{d.topics[topic.id]}<span>{formatCount(topic.items.length, locale)}</span></a>
          ))}
        </nav>
        <div className="min-w-0">
          {FAQ_TOPICS.map((topic) => (
            <section key={topic.id} id={topic.id} aria-labelledby={`${topic.id}-title`} className="nr-mk-faq-group">
              <h2 id={`${topic.id}-title`}>{d.topics[topic.id]}</h2>
              <FaqList ids={topic.items} dict={dict} values={values} />
            </section>
          ))}
          <div className="nr-mk-faq-more">
            <p>{d.ctaBody}</p>
            <div className="nr-mk-ctas">
              <Link href={getKeyHref(locale)} className={buttonVariants({ className: "nr-mk-button" })}>{dict.nav.getKey}</Link>
              <Link href={`/${locale}/pricing`} className={buttonVariants({ variant: "secondary", className: "nr-mk-button" })}>{d.ctaPricing}</Link>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
