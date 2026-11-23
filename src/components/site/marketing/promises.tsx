import CircleXIcon from "kubai-icons-react/icons/circle-x";
import EyeOffIcon from "kubai-icons-react/icons/eye-off";
import ShieldCheckIcon from "kubai-icons-react/icons/shield-check";

import { formatUsd } from "@/lib/format";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

import { MarketingSection } from "./section";

/**
 * Lo que no cambia con el modelo ni con el precio del minuto (ADR-0071): responde el modelo pedido (07 · Upstreams ›
 * Selección y fallback), si falla no se cobra y el contenido no se guarda (ADR-0014). Son las tarjetas de «Una key
 * para cada uso», con la prueba de cada promesa en la caja de abajo.
 */
export function Promises({ modelId, locale, dict }: { modelId: string; locale: Locale; dict: Dictionary }) {
  const d = dict.howItWorks.promises;
  const free = formatUsd(0, locale);
  const cards = [
    {
      ...d.model,
      Icon: ShieldCheckIcon,
      rows: [
        { term: d.model.asked, value: <code>{modelId}</code> },
        { term: d.model.answered, value: <code>{modelId}</code> },
      ],
    },
    {
      ...d.failure,
      Icon: CircleXIcon,
      rows: [
        { term: d.failure.rejected, value: free },
        { term: d.failure.noResponse, value: free },
        { term: d.failure.cutOff, value: d.failure.cutOffValue },
      ],
    },
    {
      ...d.privacy,
      Icon: EyeOffIcon,
      rows: [
        { term: d.privacy.kept, value: d.privacy.keptValue },
        { term: d.privacy.never, value: d.privacy.neverValue },
      ],
    },
  ];
  return (
    <MarketingSection id="promises" eyebrow={d.eyebrow} title={d.title} description={d.description}>
      <div className="nr-mk-uses">
        {cards.map((card) => (
          <article key={card.title} className="nr-mk-use">
            <div className="nr-mk-use-top">
              <p className="nr-mk-flow-label">{card.label}</p>
              <span className="nr-mk-icon" aria-hidden><card.Icon /></span>
            </div>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            <dl className="nr-mk-keybox">
              {card.rows.map((row) => <div key={row.term}><dt>{row.term}</dt><dd>{row.value}</dd></div>)}
            </dl>
          </article>
        ))}
      </div>
    </MarketingSection>
  );
}
