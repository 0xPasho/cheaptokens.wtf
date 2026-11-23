"use client";

import { useEffect, useRef, useState } from "react";

type Step = { title: string; body: string };

/**
 * Los seis pasos de un request, con scroll (ADR-0071): la lista a la izquierda y, fija a la derecha, la tarjeta con
 * el dibujo del paso que cruza la mitad de la pantalla. Un clic en un paso lo trae al centro. En pantallas angostas
 * no hay tarjeta fija: cada paso lleva su dibujo encima. Los dibujos llegan armados del servidor (`visuals`).
 */
export function HowScroll({ label, steps, stops, stopLabel, stopAmount, visuals, foot }: {
  /** El nombre de la tarjeta fija: «Request de ejemplo». */
  label: string;
  steps: Step[];
  /** El error con el que se detiene cada paso, o `null`. Es código: no se traduce. */
  stops: (string | null)[];
  stopLabel: string;
  /** «0,00 US$», ya con el idioma de la ruta. */
  stopAmount: string;
  visuals: React.ReactNode[];
  foot: string;
}) {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);

  // El paso activo es el último cuyo borde superior ya pasó la mitad de la ventana.
  useEffect(() => {
    const items = [...(list.current?.children ?? [])] as HTMLElement[];
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.5;
      let current = 0;
      items.forEach((item, index) => { if (item.getBoundingClientRect().top < line) current = index; });
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const go = (index: number) => {
    const item = list.current?.children[index] as HTMLElement | undefined;
    if (!item) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = item.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.5 + 24;
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  };
  const number = (index: number) => String(index + 1).padStart(2, "0");

  return (
    <div className="nr-hs">
      <ol className="nr-hs-steps" ref={list}>
        {steps.map((step, index) => (
          <li key={step.title} className="nr-hs-step" data-active={index === active || undefined}>
            {/* En móvil, el dibujo va con su paso. */}
            <div className="nr-bento-visual nr-hs-inline">{visuals[index]}</div>
            <button type="button" className="nr-hs-step-head" onClick={() => go(index)} aria-current={index === active ? "step" : undefined}>
              <span className="nr-hs-number" aria-hidden>{number(index)}</span>
              <span className="nr-hs-title">{step.title}</span>
            </button>
            <p className="nr-hs-body">{step.body}</p>
            {stops[index] ? <p className="nr-hs-stop">{stopLabel}<code>{stops[index]}</code><b>{stopAmount}</b></p> : null}
          </li>
        ))}
      </ol>
      {/* Los dibujos se leen también con lector de pantalla: el del paso activo; los otros quedan ocultos. En móvil la
          tarjeta no se muestra y se lee el dibujo de cada paso. */}
      <aside className="nr-hs-stage" aria-label={label}>
        <div className="nr-hs-card">
          <div className="nr-hs-top" aria-hidden>
            <span className="nr-bv-pill nr-hs-count">{number(active)} / {number(steps.length - 1)}</span>
            <span className="nr-hs-dots">{steps.map((step, index) => <i key={step.title} data-on={index <= active || undefined} />)}</span>
          </div>
          <div className="nr-hs-visuals">
            {visuals.map((visual, index) => (
              <div key={index} className="nr-bento-visual nr-hs-visual" data-active={index === active || undefined} aria-hidden={index !== active || undefined}>{visual}</div>
            ))}
          </div>
          <p className="nr-hs-caption" aria-hidden>{steps[active]?.title}</p>
        </div>
        <p className="nr-hv-foot">{foot}</p>
      </aside>
    </div>
  );
}
