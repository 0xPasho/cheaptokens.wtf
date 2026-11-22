import CircleXIcon from "kubai-icons-react/icons/circle-x";
import CoinsIcon from "kubai-icons-react/icons/coins";
import GaugeIcon from "kubai-icons-react/icons/gauge";
import ShieldCheckIcon from "kubai-icons-react/icons/shield-check";

import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Un icono por hecho, en el orden del diccionario: capacidad comprada, mismo modelo, precio tope, sin cobro si falla. */
const ICONS = [CoinsIcon, ShieldCheckIcon, GaugeIcon, CircleXIcon];

/**
 * 03 · La objeción de cualquiera que ve un −70 %: ¿cómo es posible? Cuatro hechos con su icono, sin tarjetas: título a la
 * izquierda y una lista de definiciones a la derecha, separada por líneas.
 */
export function WhyCheaper({ dict }: { dict: Dictionary }) {
  const d = dict.home.why;
  return (
    <section id="why" aria-labelledby="why-title" className="nr-mk-section nr-mk-split nr-mk-band">
      <div className="nr-mk-head">
        <p className="nr-mk-eyebrow">{d.eyebrow}</p>
        <h2 id="why-title" className="nr-mk-title">{d.title}</h2>
      </div>
      <dl className="nr-mk-facts-list">
        {d.items.map((item, index) => {
          const Icon = ICONS[index];
          return (
          <div key={item.term}>
            <dt>{Icon ? <span className="nr-mk-icon" aria-hidden><Icon /></span> : null}{item.term}</dt>
            <dd>{item.body}</dd>
          </div>
          );
        })}
      </dl>
    </section>
  );
}
