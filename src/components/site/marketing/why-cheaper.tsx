import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * 03 · La objeción de cualquiera que ve un −70 %: ¿cómo es posible? Cuatro hechos, sin tarjetas: título a la
 * izquierda y una lista de definiciones a la derecha, separada por líneas.
 */
export function WhyCheaper({ dict }: { dict: Dictionary }) {
  const d = dict.home.why;
  return (
    <section id="why" aria-labelledby="why-title" className="nr-mk-section nr-mk-split">
      <div className="nr-mk-head">
        <p className="nr-mk-eyebrow">{d.eyebrow}</p>
        <h2 id="why-title" className="nr-mk-title">{d.title}</h2>
      </div>
      <dl className="nr-mk-facts-list">
        {d.items.map((item) => (
          <div key={item.term}>
            <dt>{item.term}</dt>
            <dd>{item.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
