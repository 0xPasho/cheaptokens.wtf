import CircleXIcon from "kubai-icons-react/icons/circle-x";
import CoinsIcon from "kubai-icons-react/icons/coins";
import GaugeIcon from "kubai-icons-react/icons/gauge";
import RouteIcon from "kubai-icons-react/icons/route";
import ShieldCheckIcon from "kubai-icons-react/icons/shield-check";

import type { Dictionary } from "@/lib/i18n/dictionaries";

type Fact = { term: string; body: string };

/** Un icono por hecho, en el orden del diccionario: capacidad comprada, mismo modelo, precio tope, sin cobro si falla. */
const HOME_ICONS = [CoinsIcon, ShieldCheckIcon, GaugeIcon, CircleXIcon];
/** En /how-it-works: capacidad comprada, la ruta más barata cada minuto y el precio tope (ADR-0071). */
export const HOW_ICONS = [CoinsIcon, RouteIcon, GaugeIcon];

/**
 * 03 · La objeción de cualquiera que ve un −70 %: ¿cómo es posible? Hechos con su icono, sin tarjetas: título a la
 * izquierda y una lista de definiciones a la derecha, separada por líneas. En la landing lleva el link a
 * /how-it-works; ahí, debajo del título, la gráfica del tope (`aside`).
 */
export function WhyCheaper({ dict, items = dict.home.why.items, icons = HOME_ICONS, action, aside }: {
  dict: Dictionary;
  items?: readonly Fact[];
  icons?: readonly (typeof CoinsIcon)[];
  action?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const d = dict.home.why;
  return (
    <section id="why" aria-labelledby="why-title" className="nr-mk-section nr-mk-split nr-mk-band">
      <div className="nr-mk-head">
        <p className="nr-mk-eyebrow">{d.eyebrow}</p>
        <h2 id="why-title" className="nr-mk-title">{d.title}</h2>
        {action}
        {aside}
      </div>
      <dl className="nr-mk-facts-list">
        {items.map((item, index) => {
          const Icon = icons[index];
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
