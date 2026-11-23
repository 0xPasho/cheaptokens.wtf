import { ModelLogo, ProviderLogo, providerName } from "@/components/catalog/provider-logo";
import type { CatalogModel } from "@/lib/catalog/types";
import { formatCount } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import { type Dictionary, t } from "@/lib/i18n/dictionaries";

/** Cuántos autores se ven con su logo; el resto va como «+N». */
const SHOWN_AUTHORS = 5;

/** Los autores del catálogo, del que más modelos tiene al que menos. */
function authorsByCount(models: readonly CatalogModel[]) {
  const counts = new Map<string, number>();
  for (const model of models) counts.set(model.author, (counts.get(model.author) ?? 0) + 1);
  return [...counts].toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([author]) => author);
}

/**
 * La idea de la página en un dibujo (ADR-0071): tu código → `api.cheapllm.wtf` → el modelo, de ida y vuelta.
 * Usa la composición `.nr-mk-flow` de la landing anterior (ADR-0060). Las flechas son decorativas: el orden ya lo
 * dicen los títulos.
 */
export function HowFlow({ models, model, locale, dict }: {
  models: readonly CatalogModel[];
  /** El modelo del ejemplo: el de referencia del dashboard. */
  model: CatalogModel;
  locale: Locale;
  dict: Dictionary;
}) {
  const d = dict.howItWorks.flow;
  const authors = authorsByCount(models);
  const hidden = authors.length - SHOWN_AUTHORS;
  return (
    <div className="nr-mk-flow nr-hw-flow" role="group" aria-label={d.label}>
      <article className="nr-mk-flow-node">
        <p className="nr-mk-flow-label">{d.codeLabel}</p>
        <h2>{d.codeTitle}</h2>
        {/* Es código: no se traduce. */}
        <pre className="nr-hw-code" tabIndex={0} aria-label={d.codeCaption}><code>
          {"client.chat.completions.create(\n  model="}<b>{`"${model.id}"`}</b>{",\n  messages=[…],\n)"}
        </code></pre>
      </article>
      <FlowLink />
      <article className="nr-mk-flow-node nr-mk-flow-core">
        <p className="nr-mk-flow-label"><code>api.cheapllm.wtf</code></p>
        <h2>{d.coreTitle}</h2>
        <ol>
          {d.core.map((item, index) => (
            <li key={item.title}>
              <span aria-hidden>{formatCount(index + 1, locale)}</span>
              <div>{item.title}<small>{item.note}</small></div>
            </li>
          ))}
        </ol>
      </article>
      <FlowLink />
      <article className="nr-mk-flow-node">
        <p className="nr-mk-flow-label">{d.modelLabel}</p>
        <h2>{d.modelTitle}</h2>
        <p className="nr-hw-model"><ModelLogo modelId={model.id} />{model.name}</p>
        <p>{d.modelBody}</p>
        <ul className="nr-mk-logo-row" aria-label={d.authors}>
          {authors.slice(0, SHOWN_AUTHORS).map((author) => (
            <li key={author}><ProviderLogo author={author} /><span className="sr-only">{providerName(author)}</span></li>
          ))}
          {hidden > 0 ? <li className="nr-hw-more">{t(d.moreAuthors, { count: formatCount(hidden, locale) })}</li> : null}
        </ul>
      </article>
    </div>
  );
}

/** Ida arriba y vuelta abajo. Un punto recorre cada riel si el sistema permite movimiento. */
function FlowLink() {
  return (
    <div className="nr-hw-link" aria-hidden>
      <span className="nr-hw-rail" data-dir="out"><i /></span>
      <span className="nr-hw-rail" data-dir="back"><i /></span>
    </div>
  );
}
